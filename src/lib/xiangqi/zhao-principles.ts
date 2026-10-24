import { ZHAO_LESSONS } from "./zhao48-lessons";
// Nguyên lý trung cuộc bổ sung cho góc nhìn "Triệu Hâm Hâm" (lối đánh tranh tiên, công sát).
// Các nguyên lý là kỳ lý phổ biến của lối cờ tranh tiên, KHÔNG phải trích dẫn lời ông:
//  - Ninh thất nhất tử, bất thất nhất tiên / tham ăn mắc mồi / tranh nước đối công
//  - Đuổi quân được tiên / đổi quân giành tiên / dẫn dụ / chặn đường / giá Pháo
//  - Cải thiện quân kém nhất / thanh đông kích tây / phòng ngừa / biết dừng công chuyển tàn cuộc
// Mỗi hàm nhận (before, move, after, options) như các đòn trong middlegame.ts, thuần hàm, tất định, không gọi engine.
// Nguyên lý nào cần biến engine (PV) hay điểm số mà không có thì trả về null thay vì đoán.

import {
  type Board, type Move, type Piece, type PieceType, type Side,
  attackersOf, colOf, findKing, hasAnyLegalMove, inCheck, initialPosition, isDefended, legalMoves, legalMovesFrom, opponent, play,
  pseudoMoves, rowOf, sideOf, typeOf, crossedRiver, PIECE_VALUES,
} from "./engine";
import { exchangeGain, hangingPieces } from "./explain";
import { extractFeatures, type PieceTag } from "./features";
import {
  analyzeForcingPlies, attackedSet, detectCounterThreat, detectFlankOverload, detectPalaceBreaker, detectSacrificeForInitiative,
  pvMaterialSwing, soundMove,
  type ZhaoMiddlegameFact, type ZhaoTactics, type ZhaoTacticsOptions,
} from "./middlegame";
import { moveNotation, PIECE_NAME } from "./notation";
import { decisiveBlow, engineLine, narrate, pieceRole, tally } from "./engine-line";
import { classifyMoveOutcome } from "./move-outcome";
import { MATE_SCORE, MATE_THRESHOLD } from "./uci";
import { advance, attackPressure } from "./strategy";

type Detector = (before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions) => ZhaoMiddlegameFact | null;

const nameOf = (p: Piece) => PIECE_NAME[typeOf(p)] ?? "quân";
/** Thế xuất phát, dùng để biết quân còn ở ô ban đầu (tạo một lần, không parse lại mỗi nước). */
const START_BOARD = initialPosition().board;
const valueOf = (p: Piece) => (typeOf(p) === "k" ? 0 : PIECE_VALUES[typeOf(p)]);
const isMajor = (p: Piece | null | undefined) => !!p && "rnc".includes(typeOf(p));
function pieces(board: Board, s: Side, types: string): number[] {
  const out: number[] = [];
  board.forEach((p, i) => {
    if (p && sideOf(p) === s && types.includes(typeOf(p))) out.push(i);
  });
  return out;
}

const LINE_MARK = "theo biến: ";

function fact(
  before: Board, move: Move, tactic: ZhaoTactics, summary: string, details: string, tone?: "critique",
): ZhaoMiddlegameFact {
  const f: ZhaoMiddlegameFact = {
    kind: "zhaoMiddlegame",
    side: sideOf(before[move.from]!),
    tactic,
    move: moveNotation(before, move),
    summary,
    details,
  };
  if (tone) f.tone = tone;
  // Lời bình có kể biến ("…; theo biến: …") thì giữ riêng đoạn kể để không lặp khi hai kỳ lý cùng kể một biến
  const at = summary.indexOf(LINE_MARK);
  if (at >= 0) f.line = summary.slice(at + LINE_MARK.length).replace(/\.$/, "");

  const card = Object.values(ZHAO_LESSONS).find((c) => c.tacticId === tactic);
  if (card) {
    f.lesson = card.lesson;
    f.lessonTitle = card.title;
    if (card.quotes.length > 0) {
      f.quote = card.quotes[0];
      const [m, s] = card.quotes[0].at.split(":").map((x) => parseInt(x, 10));
      const sec = (m || 0) * 60 + (s || 0);
      f.videoUrl = `https://youtu.be/${card.video}?t=${sec}`;
    }
  }

  return f;
}

/** PV tính từ thế SAU nước đi. Có nơi truyền PV bắt đầu bằng chính nước vừa đi — bỏ nước đó đi. */
function pvAfterMove(options: ZhaoTacticsOptions | undefined, move: Move): Move[] {
  const pv = options?.pv ?? [];
  return pv[0]?.from === move.from && pv[0]?.to === move.to ? pv.slice(1) : pv;
}

/** Chênh lệch vật chất (không tính Tướng) theo góc nhìn `side`. */
function materialBalance(board: Board, side: Side): number {
  let bal = 0;
  for (const p of board) if (p) bal += sideOf(p) === side ? valueOf(p) : -valueOf(p);
  return bal;
}

/**
 * Nước `m` (đã đi, cho ra `next`) có tạo đòn ép không: chiếu, hoặc dọa ăn có lời (>= 200) một quân
 * mà trước đó chưa bị dọa. Trả về ô quân bị dọa (-1 nếu là chiếu, null nếu không ép).
 */
function forcingTarget(board: Board, m: Move, next: Board, side: Side): number | null {
  const opp = opponent(side);
  if (inCheck(next, opp)) return -1;
  const hits = attackedSet(next, side);
  for (let i = 0; i < next.length; i++) {
    const p = next[i];
    if (!p || sideOf(p) !== opp || typeOf(p) === "k" || !hits.has(i)) continue;
    const gain = exchangeGain(next, i, side) ?? 0;
    const already = board[i] === p && (exchangeGain(board, i, side) ?? 0) > 0;
    if (gain >= 200 && !already) return i;
  }
  return null;
}

/**
 * Phe `side` (giả sử đến lượt) có nước chiếu bí ngay không (chỉ chiếu bí, không tính bí nước — đúng nghĩa "dọa sát").
 * Lọc nước chiếu trước rồi mới xét bên kia hết nước,
 * rẻ hơn nhiều so với bộ tìm sát tổng quát (mate.ts) vốn xét đủ kết cục cho mọi nước.
 */
function hasMateInOne(board: Board, side: Side): boolean {
  const victim = opponent(side);
  for (const m of legalMoves({ board, turn: side })) {
    const next = play(board, m);
    if (!inCheck(next, victim)) continue;
    if (!hasAnyLegalMove({ board: next, turn: victim })) return true;
  }
  return false;
}

/** Quân ở ô `from` có khống chế ô `target` không (đặt tạm quân đối phương vào đó để xét cả Pháo). */
function guards(board: Board, from: number, target: number): boolean {
  const p = board[from];
  if (!p) return false;
  const probe = board.slice();
  probe[target] = sideOf(p) === "r" ? "p" : "P";
  return pseudoMoves(probe, from).includes(target);
}

/** Ô `x` nằm giữa hai ô `a`, `b` trên cùng một hàng hoặc cột. */
function between(a: number, b: number, x: number): boolean {
  if (rowOf(a) === rowOf(b) && rowOf(x) === rowOf(a)) {
    return colOf(x) > Math.min(colOf(a), colOf(b)) && colOf(x) < Math.max(colOf(a), colOf(b));
  }
  if (colOf(a) === colOf(b) && colOf(x) === colOf(a)) {
    return rowOf(x) > Math.min(rowOf(a), rowOf(b)) && rowOf(x) < Math.max(rowOf(a), rowOf(b));
  }
  return false;
}

/** Tên cánh theo cách gọi lộ của bên đi (giống detectFlankOverload). */
function wingName(col: number, s: Side): string {
  if (col <= 2) return s === "r" ? "cánh phải (lộ 7-8-9)" : "cánh trái (lộ 1-2-3)";
  if (col >= 6) return s === "r" ? "cánh trái (lộ 1-2-3)" : "cánh phải (lộ 7-8-9)";
  return "trung lộ";
}
const wingOf = (col: number) => (col <= 2 ? "L" : col >= 6 ? "R" : "C");

/** Kiểm tra hai quân có giữ căn qua lại cho nhau không (như Pháo gánh hoặc Liên hoàn Mã). */
function mutuallyDefend(board: Board, sq1: number, sq2: number, side: Side): boolean {
  const probe1 = board.slice();
  probe1[sq1] = side === "r" ? "p" : "P";
  if (!attackersOf(probe1, sq1, side).includes(sq2)) return false;

  const probe2 = board.slice();
  probe2[sq2] = side === "r" ? "p" : "P";
  return attackersOf(probe2, sq2, side).includes(sq1);
}


// ============================================================================
// 1. NINH THẤT NHẤT TỬ, BẤT THẤT NHẤT TIÊN
// ============================================================================

/**
 * Hai chiều của cùng một nguyên lý:
 * - Phê bình: ăn được quân có lời nhưng mất tiên, trong khi nước tốt nhất (engine) là nước ép không ăn quân.
 * - Khen: có miếng ăn có lời mà không ăn, đi nước ép giữ tiên — và engine xác nhận đó là nước tốt nhất.
 */
export function detectInitiativeOverMaterial(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const captured = before[move.to];
  const best = options?.evalBefore?.best ?? null;

  if (captured) {
    if (options?.loss === undefined || options.loss < 100 || !best) return null;
    if (before[best.to]) return null; // nước tốt nhất cũng là ăn quân: không phải chuyện chọn tiên hay quân
    if ((exchangeGain(before, move.to, mover) ?? 0) <= 0) return null; // không phải miếng ăn có lời
    const bestNext = play(before, best);
    if (forcingTarget(before, best, bestNext, mover) === null) return null;
    const bestPv = options.evalBefore?.pv;
    const line = bestPv && bestPv[0]?.from === best.from && bestPv[0]?.to === best.to ? bestPv : [best];
    const forcing = analyzeForcingPlies(before, mover, line);
    const bestNot = moveNotation(before, best);
    return fact(
      before, move, "ninhThatNhatTu",
      `Tham quân mất tiên: ăn ${nameOf(captured)} nhưng đánh mất nhịp tấn công. "Ninh thất nhất tử, bất thất nhất tiên" — ${bestNot} giữ tiên${forcing.forcingPlies >= 2 ? `, ép liên tục ${forcing.forcingPlies} nước` : ""} mới là nước đúng.`,
      `Nên đi ${bestNot}`,
      "critique",
    );
  }

  if (!soundMove(options, 30)) return null;
  // Khen bỏ miếng ăn chỉ khi engine xác nhận đây chính là nước tốt nhất; thiếu dữ liệu thì không khen.
  if (!best || best.from !== move.from || best.to !== move.to) return null;
  const target = forcingTarget(before, move, after, mover);
  if (target === null) return null;
  // Miếng ăn có lời đang có sẵn mà không ăn
  let bait: number | null = null;
  let baitGain = 0;
  for (const m of legalMoves({ board: before, turn: mover })) {
    if (!before[m.to]) continue;
    const gain = exchangeGain(before, m.to, mover) ?? 0;
    if (gain >= 300 && gain > baitGain) { // "nhất tử" là một quân thật sự (lãi từ quân nhẹ trở lên), không phải một Tốt
      bait = m.to;
      baitGain = gain;
    }
  }
  if (bait === null) return null;
  const how = target === -1 ? "chiếu thẳng vào Tướng" : `dọa ăn ${nameOf(after[target]!)}`;
  return fact(
    before, move, "ninhThatNhatTu",
    `Ninh thất nhất tử, bất thất nhất tiên: không ham ăn ${nameOf(before[bait]!)}, ${how} để giữ quyền chủ động.`,
    `Bỏ ăn ${nameOf(before[bait]!)} giữ tiên`,
  );
}

// ============================================================================
// 2. THAM ĂN MẮC MỒI
// ============================================================================

/** Ăn một quân trông có lời, nhưng đối phương đáp bằng nước ép (chiếu / ăn quân) và nước đi bị engine chấm lỗi nặng. */
export function detectPoisonedCapture(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  const captured = before[move.to];
  if (!piece || !captured) return null;
  if (options?.loss === undefined || options.loss < 150) return null;
  const mover = sideOf(piece);
  if ((exchangeGain(before, move.to, mover) ?? 0) <= 0) return null; // nhìn tĩnh phải giống một miếng ăn có lời
  const pv = pvAfterMove(options, move);
  const reply = pv[0];
  if (!reply || !after[reply.from] || sideOf(after[reply.from]!) === mover) return null;
  const replyNext = play(after, reply);
  const replyChecks = inCheck(replyNext, mover);
  const replyCaptures = !!after[reply.to];
  if (!replyChecks && !replyCaptures) return null;
  const net = valueOf(captured) + pvMaterialSwing(after, pv, mover);
  const replyNot = moveNotation(after, reply);
  const outcome = net < 0 ? "cuối biến còn lỗ quân" : "mất hẳn thế cờ";
  return fact(
    before, move, "khongThamAn",
    `Tham ăn mắc mồi: ăn ${nameOf(captured)} tưởng được quân, nhưng đối phương đáp ${replyNot} ${replyChecks ? "chiếu" : "ăn lại"} ngay, ${outcome}. Quân đối phương "cho không" thường là mồi.`,
    `Mồi ${nameOf(captured)}, phản đòn ${replyNot}`,
    "critique",
  );
}

// ============================================================================
// 3. TRANH NƯỚC ĐỐI CÔNG
// ============================================================================

/** Đối phương đang dọa sát (nếu được đi tiếp sẽ chiếu bí), bên đi không chống mà chiếu trước để giành nước. */
export function detectMatingRace(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover) || !inCheck(after, opp)) return null;
  if (!soundMove(options)) return null;
  if (attackPressure(before, mover) < 1) return null; // không có quân nào áp cung thì không thể có đòn dọa sát
  if (!hasMateInOne(before, opp)) return null;
  const pv = pvAfterMove(options, move);
  const checks = analyzeForcingPlies(after, mover, pv).checks + 1;
  return fact(
    before, move, "tranhNuoc",
    `Tranh nước đối công: đối phương đã dọa sát, nhưng ${checks >= 2 ? `chiếu liên tục ${checks} nước` : "chiếu trước"} giành nước — trong thế đối công, nhanh hơn một nước là thắng.`,
    "Chiếu trước giành nước",
  );
}

// ============================================================================
// 4. ĐUỔI QUÂN ĐƯỢC TIÊN
// ============================================================================

/** Nước không ăn, không chiếu, đưa quân lên chỗ an toàn mà vẫn dọa một quân lớn, buộc đối phương mất nước lo chạy quân. */
export function detectTempoChase(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to]) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover) || inCheck(after, opp) || !soundMove(options)) return null;
  // "Được tiên" là vừa ra / tiến quân vừa đuổi: quân đuổi phải tiến lên hoặc vừa rời ô xuất phát.
  const forward = advance(move.to, mover) > advance(move.from, mover);
  const developing = START_BOARD[move.from] === piece;
  if (!forward && !developing) return null;
  // Phải có PV xác nhận đối phương dùng nước đáp để lo quân bị đuổi (không có PV thì không kết luận).
  const reply = pvAfterMove(options, move)[0];
  if (!reply) return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;
  // Quân lớn đối phương vừa bị dọa (trước đó không bị nhắm), bị ăn có lời hoặc là Xe bị Mã/Pháo đuổi.
  const hitBefore = attackedSet(before, mover);
  const hitAfter = attackedSet(after, mover);
  const chased: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (!isMajor(p) || sideOf(p!) !== opp || !hitAfter.has(i) || (hitBefore.has(i) && before[i] === p)) continue;
    if ((exchangeGain(after, i, mover) ?? 0) > 0) chased.push(i);
  }
  if (chased.length === 0) return null;
  const target = chased[0];
  const replyNext = play(after, reply);
  const handled = reply.from === target || (exchangeGain(replyNext, target, mover) ?? 0) <= 0;
  if (!handled || after[reply.to]) return null; // đối phương ăn quân / phản đòn thay vì lo chạy: không phải được tiên
  return fact(
    before, move, "duoiQuanDuocTien",
    `Đuổi quân được tiên: ${nameOf(piece)} ${forward ? "tiến lên" : "chuyển vị trí"} đồng thời dọa ăn ${nameOf(after[target]!)}, đối phương phải mất nước lo chạy quân — ta được thêm một nhịp.`,
    `${nameOf(piece)} đuổi ${nameOf(after[target]!)}`,
  );
}

// ============================================================================
// 5. DẪN DỤ
// ============================================================================

/** Thí quân để quân giữ của đối phương ăn rồi rời vị trí, mở đường cho đòn chiếu / ăn quân tiếp theo (theo PV). */
export function detectDecoy(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const sacrificed = valueOf(piece) - (before[move.to] ? valueOf(before[move.to]!) : 0);
  if (sacrificed < 100) return null;
  const pv = pvAfterMove(options, move);
  const [reply, follow] = pv;
  if (!reply || !follow || reply.to !== move.to) return null; // đối phương phải cắn mồi
  const lured = after[reply.from];
  if (!lured || sideOf(lured) !== opp) return null;
  const b2 = play(after, reply);
  const striker = b2[follow.from];
  if (!striker || sideOf(striker) !== mover) return null;
  const b3 = play(b2, follow);
  const followChecks = inCheck(b3, opp);
  const followGain = b2[follow.to] ? valueOf(b2[follow.to]!) - ((exchangeGain(b3, follow.to, opp) ?? 0) > 0 ? valueOf(striker) : 0) : 0;
  if (!followChecks && followGain <= 0) return null;
  // Đòn tiếp theo chỉ thành nhờ quân bị dụ rời chỗ: trước đó nó chặn đường hoặc giữ ô đích.
  const wasBlocked = !pseudoMoves(after, follow.from).includes(follow.to);
  const wasGuarded = guards(after, reply.from, follow.to);
  if (!wasBlocked && !wasGuarded) return null;
  const followNot = moveNotation(b2, follow);
  return fact(
    before, move, "danDu",
    `Dẫn dụ: thí ${nameOf(piece)} dụ ${nameOf(lured)} rời vị trí ${wasBlocked ? "đang chặn đường" : "đang canh giữ"}, mở đường cho ${followNot} ${followChecks ? "chiếu" : "ăn quân"}.`,
    `Dụ ${nameOf(lured)}, tiếp ${followNot}`,
  );
}

// ============================================================================
// 6. CHẶN ĐƯỜNG (cắt liên lạc)
// ============================================================================

/** Chen quân vào giữa, cắt căn của một quân đối phương khiến nó thành quân treo bị dọa ăn. */
export function detectInterference(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to] || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  // Bàn cờ chỉ có quân rời ô cũ (chưa đặt xuống ô mới): để tách việc "chen vào" khỏi việc "rời ngòi".
  const vacated = before.slice();
  vacated[move.from] = null;
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (!p || sideOf(p) !== opp || typeOf(p) === "k" || before[i] !== p) continue;
    // Căn bị cắt chỉ có thể nằm trên hàng/cột qua ô vừa đặt quân (Xe, Pháo) hoặc sát nó (chân Mã, mắt Tượng).
    const near = Math.abs(rowOf(i) - rowOf(move.to)) <= 1 && Math.abs(colOf(i) - colOf(move.to)) <= 1;
    if (!near && rowOf(i) !== rowOf(move.to) && colOf(i) !== colOf(move.to)) continue;
    if (attackersOf(after, i, mover).length === 0) continue;
    if (!isDefended(before, i, opp) || !isDefended(vacated, i, opp)) continue;
    if (isDefended(after, i, opp)) continue;
    if ((exchangeGain(after, i, mover) ?? 0) <= 0) continue;
    return fact(
      before, move, "chanDuong",
      `Chặn đường: ${nameOf(piece)} chen vào cắt liên lạc, ${nameOf(p)} đối phương mất căn và bị dọa ăn.`,
      `Cắt căn ${nameOf(p)}`,
    );
  }
  return null;
}

// ============================================================================
// 7. GIÁ PHÁO (tạo ngòi)
// ============================================================================

/** Quân vừa đi làm ngòi cho Pháo mình: Pháo chiếu Tướng hoặc dọa ăn có lời một quân lớn mà trước đó không làm được. */
export function detectCannonMount(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  for (let c = 0; c < after.length; c++) {
    const cannon = after[c];
    if (c === move.to || !cannon || sideOf(cannon) !== mover || typeOf(cannon) !== "c") continue;
    const beforeTargets = new Set(pseudoMoves(before, c));
    for (const t of pseudoMoves(after, c)) {
      const victim = after[t];
      if (!victim || sideOf(victim) !== opp || !between(c, t, move.to)) continue;
      if (beforeTargets.has(t) && before[t] === victim) continue;
      const isKing = typeOf(victim) === "k";
      if (!isKing && !(isMajor(victim) && (exchangeGain(after, t, mover) ?? 0) > 0)) continue;
      // Tầng 2–4: chính con Pháo được giá phải ra tay trong biến dẫn tới sát / thắng quân
      const r = checkAttackLine(before, move, options, [c], 1);
      if (!r.ok) return null;
      return fact(
        before, move, "giaPhao",
        `Giá Pháo: ${nameOf(piece)} (${moveNotation(before, move)}) làm ngòi cho Pháo ${isKing ? "chiếu Tướng" : `dọa ăn ${nameOf(victim)}`}; theo biến: ${r.summary}.`,
        isKing ? "Tạo ngòi Pháo chiếu" : `Tạo ngòi Pháo bắt ${nameOf(victim)}`,
      );
    }
  }
  return null;
}

// ============================================================================
// 8. ĐỔI QUÂN GIÀNH TIÊN / TRỪ QUÂN HOẠT
// ============================================================================

const ACTIVE_TAGS: Partial<Record<PieceTag, string>> = {
  maHaKhau: "Mã hà khẩu", maNgoaTao: "Mã ngọa tào", maQuaiGiac: "Mã quải giác",
  xeChiemSuon: "Xe chiếm sườn", xeCamDay: "Xe cắm đáy", xeTuanHa: "Xe tuần hà", xeLoThong: "Xe lộ thông",
  phaoDau: "Pháo đầu", phaoCamDay: "Pháo cắm đáy",
};

/** Đổi ngang quân lớn (đối phương ăn lại trong PV) mà diệt được quân hoạt nhất của đối phương, hoặc sau đó vẫn được đi nước ép. */
export function detectTempoExchange(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  const captured = before[move.to];
  if (!isMajor(piece) || !isMajor(captured) || sideOf(piece!) === sideOf(captured!)) return null;
  if (Math.abs(valueOf(piece!) - valueOf(captured!)) > 100 || !soundMove(options)) return null;
  const mover = sideOf(piece!);
  const opp = opponent(mover);
  const pv = pvAfterMove(options, move);
  const recapture = pv[0];
  if (!recapture || recapture.to !== move.to) return null; // không bị ăn lại thì là ăn quân, không phải đổi
  const status = extractFeatures(before)[opp].pieces.find((s) => s.ref.square === move.to);
  const activeTag = status?.tags.find((t) => ACTIVE_TAGS[t]);
  const b2 = play(after, recapture);
  const follow = pv[1];
  const tempo = follow && b2[follow.from] && sideOf(b2[follow.from]!) === mover
    ? forcingTarget(b2, follow, play(b2, follow), mover) !== null
    : false;
  if (!activeTag && !tempo) return null;
  const parts = [`Đổi quân có mục đích: đổi ${nameOf(piece!)} lấy ${nameOf(captured!)}`];
  if (activeTag) parts.push(`trừ một quân đang hoạt động mạnh của đối phương (${ACTIVE_TAGS[activeTag]})`);
  if (tempo) parts.push(`sau khi đối phương ăn lại vẫn được đi ${moveNotation(b2, follow!)} có tiên`);
  return fact(
    before, move, "doiQuanGianhTien",
    `${parts.join(", ")}.`,
    activeTag ? `Đổi trừ ${ACTIVE_TAGS[activeTag]}` : "Đổi quân giành tiên",
  );
}

// ============================================================================
// 9. CẢI THIỆN QUÂN KÉM NHẤT
// ============================================================================

const BAD_TAGS: Partial<Record<PieceTag, string>> = {
  maChet: "bị vây chết", maBiCanChan: "bị cản chân", maBien: "đứng biên", xeBiKim: "bị kìm", phaoKhongNgoi: "mất ngòi",
};

/** Quân lớn đang yếu nhất (bị bó, chết, cơ động thấp nhất) được đưa ra vị trí hoạt động hẳn — không phải nước ra quân từ ô xuất phát. */
export function detectWorstPieceImprovement(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!isMajor(piece) || before[move.to] || !soundMove(options)) return null;
  const mover = sideOf(piece!);
  if (inCheck(after, opponent(mover))) return null;
  if (START_BOARD[move.from] === piece) return null; // ra quân, không phải cải thiện
  if ((exchangeGain(after, move.to, opponent(mover)) ?? 0) > 0) return null;
  const mine = extractFeatures(before)[mover].pieces.filter((s) => isMajor(s.ref.piece));
  const st = mine.find((s) => s.ref.square === move.from);
  if (!st || mine.length < 2) return null;
  const badTag = st.tags.find((t) => BAD_TAGS[t]);
  const minMobility = Math.min(...mine.map((s) => s.mobility));
  if (!badTag && !(st.mobility === minMobility && st.mobility <= 4)) return null;
  const stAfter = extractFeatures(after)[mover].pieces.find((s) => s.ref.square === move.to);
  if (!stAfter || stAfter.mobility - st.mobility < 3) return null;
  if (badTag && stAfter.tags.includes(badTag)) return null;
  const state = badTag ? BAD_TAGS[badTag]! : "kém hoạt động nhất";
  return fact(
    before, move, "caiThienQuanKem",
    `Cải thiện quân kém nhất: ${nameOf(piece!)} đang ${state} được đưa ra vị trí hoạt động (từ ${st.mobility} lên ${stAfter.mobility} ô đi). Quân yếu nhất quyết định sức mạnh đội hình — kéo nó vào trận rồi mới công.`,
    `Giải phóng ${nameOf(piece!)}`,
  );
}

// ============================================================================
// 10. THANH ĐÔNG KÍCH TÂY
// ============================================================================

/**
 * Hai nước trước của bên đi cùng ép một cánh (có quân qua sông), đối phương dồn quân về cánh đó,
 * nay bên đi chuyển đòn sang cánh đối diện và tạo đe dọa mới. Cần `recentMoves`.
 */
export function detectFlankSwitch(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  const recent = options?.recentMoves;
  if (!piece || !recent || recent.length < 4 || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const n = recent.length;
  const myPrev = [recent[n - 2], recent[n - 4]];
  const oppPrev = [recent[n - 1], recent[n - 3]];
  const w1 = wingOf(colOf(myPrev[0].to));
  if (w1 === "C" || wingOf(colOf(myPrev[1].to)) !== w1) return null;
  if (!myPrev.some((m) => crossedRiver(rowOf(m.to), mover))) return null;
  if (!oppPrev.some((m) => wingOf(colOf(m.to)) === w1)) return null; // đối phương đã bị kéo về cánh đó
  const w2 = wingOf(colOf(move.to));
  if (w2 === "C" || w2 === w1) return null;
  const target = forcingTarget(before, move, after, mover);
  const morePressure = attackPressure(after, opp) > attackPressure(before, opp);
  if (target === null && !morePressure) return null;
  return fact(
    before, move, "thanhDongKichTay",
    `Thanh đông kích tây: hai nước trước ép ${wingName(colOf(myPrev[0].to), mover)} khiến đối phương dồn quân về đó, nay bất ngờ chuyển đòn sang ${wingName(colOf(move.to), mover)}${target === -1 ? " chiếu Tướng" : target !== null ? ` dọa ăn ${nameOf(after[target]!)}` : ""}.`,
    "Chuyển hướng tấn công",
  );
}

// ============================================================================
// 11. PHÒNG NGỪA
// ============================================================================

/** Các nước của Mã/Xe phe `s` vào điểm then chốt sát cung đối phương mà không bị ăn có lời. */
function dangerousEntries(board: Board, s: Side): { from: number; to: number; kind: string }[] {
  const out: { from: number; to: number; kind: string }[] = [];
  const o = opponent(s);
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p || sideOf(p) !== s) continue;
    const t = typeOf(p);
    if (t !== "n" && t !== "r") continue;
    // Lọc chính xác trước khi sinh nước: Mã mỗi bước tiến tối đa 2 hàng nên phải đang ở hàng >= 5 mới tới được hàng 7-8;
    // Xe chỉ tới được sườn cung sâu nếu đang đứng trên cột sườn hoặc trên một hàng đủ sâu.
    if (t === "n" && advance(i, s) < 5) continue;
    if (t === "r" && colOf(i) !== 3 && colOf(i) !== 5 && advance(i, s) < 7) continue;
    for (const to of pseudoMoves(board, i)) {
      const target = board[to];
      if (target && (sideOf(target) === s || typeOf(target) === "k")) continue;
      const a = advance(to, s);
      const c = colOf(to);
      let kind = "";
      if (t === "n" && a === 7 && (c === 2 || c === 6)) kind = "ngọa tào";
      else if (t === "n" && a === 8 && (c === 3 || c === 5)) kind = "quải giác";
      else if (t === "r" && a >= 7 && (c === 3 || c === 5)) kind = "sườn cung";
      if (!kind) continue;
      if ((exchangeGain(play(board, { from: i, to }), to, o) ?? 0) > 0) continue;
      out.push({ from: i, to, kind });
    }
  }
  return out;
}

/**
 * Nước yên (không ăn, không chiếu, không có quân đang treo) chặn trước đường Mã/Xe đối phương
 * vào ngọa tào, quải giác hay sườn cung — dập ý đồ trước khi nó thành đòn dọa.
 */
export function detectProphylaxis(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to] || !soundMove(options, 30)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover) || inCheck(after, opp)) return null;
  const beforeEntries = dangerousEntries(before, opp);
  if (beforeEntries.length === 0) return null;
  if (hangingPieces(before, mover).length > 0) return null; // đang có quân treo: đó là phòng thủ thường
  const afterEntries = dangerousEntries(after, opp);
  const stillOpen = (e: { from: number; to: number }) => afterEntries.some((x) => x.from === e.from && x.to === e.to);
  const prevented = beforeEntries.find((e) => after[e.from] === before[e.from] && !stillOpen(e));
  if (!prevented) return null;
  const pName = nameOf(before[prevented.from]!);
  return fact(
    before, move, "phongNgua",
    `Phòng ngừa: chặn trước đường ${pName} đối phương vào ${prevented.kind}, dập tắt ý đồ từ khi chưa thành đòn dọa.`,
    `Chặn ${pName} vào ${prevented.kind}`,
  );
}

// ============================================================================
// 12. BIẾT DỪNG CÔNG, CHUYỂN HÓA TÀN CUỘC
// ============================================================================

/** Đang hơn vật chất, không còn đòn ép, chủ động đổi ngang quân lớn để về tàn cuộc hơn quân. */
export function detectEndgameConversion(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  const captured = before[move.to];
  if (!isMajor(piece) || !isMajor(captured) || sideOf(piece!) === sideOf(captured!)) return null;
  if (Math.abs(valueOf(piece!) - valueOf(captured!)) > 100 || !soundMove(options)) return null;
  const mover = sideOf(piece!);
  const balance = materialBalance(before, mover);
  if (balance < 100) return null;
  if (options?.evalBefore && options.evalBefore.score < 100) return null;
  const pv = pvAfterMove(options, move);
  const recapture = pv[0];
  if (!recapture || recapture.to !== move.to) return null;
  const b2 = play(after, recapture);
  if (analyzeForcingPlies(b2, mover, pv.slice(1)).forcingPlies > 0) return null; // còn đòn ép thì đây vẫn là tấn công
  const majorsLeft = b2.filter((p) => isMajor(p)).length;
  if (majorsLeft > 6) return null;
  const edge = balance >= 350 ? "hơn quân" : `hơn ${Math.round(balance / 100)} Tốt`;
  return fact(
    before, move, "chuyenHoaTanCuoc",
    `Biết dừng đúng lúc: đang ${edge} mà thế công không còn đòn ép, đổi ${nameOf(piece!)} lấy ${nameOf(captured!)} đưa về tàn cuộc — thắng bằng kỹ thuật thay vì cố công.`,
    "Đổi quân về tàn cuộc",
  );
}

// ============================================================================
// 13. MUỘN CUNG SÁT (Khuyết Tượng sợ Pháo - Triệu Hâm Hâm Bài 2)
// ============================================================================

/**
 * Pháo chiếu khi Tướng đối phương bị chính quân phòng thủ (Sĩ/Tượng/Mã) chèn kẹt
 * không thể di chuyển, tạo thành thế bí tuyệt sát hoặc thắng thế áp đảo.
 */
export function detectSmotheredCannonMate(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "c") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  // Nước đi phải tạo nước chiếu
  if (!inCheck(after, opp)) return null;

  const kingSq = findKing(after, opp);
  if (kingSq === -1) return null;

  const kr = rowOf(kingSq);
  const kc = colOf(kingSq);

  // Ô kề hợp lệ trong cung quanh Tướng
  const kingMoves = [
    { r: kr - 1, c: kc },
    { r: kr + 1, c: kc },
    { r: kr, c: kc - 1 },
    { r: kr, c: kc + 1 },
  ].filter((p) => p.c >= 3 && p.c <= 5 && (opp === "b" ? p.r >= 0 && p.r <= 2 : p.r >= 7 && p.r <= 9));

  // Kiểm tra số ô quanh Tướng bị chính quân của opp bịt kín
  const blockedByOwnPiece = kingMoves.filter((p) => {
    const occupant = after[p.r * 9 + p.c];
    return occupant && sideOf(occupant) === opp;
  }).length;

  const isCheckmated = !hasAnyLegalMove({ board: after, turn: opp });
  const allBlockedByOwn = kingMoves.length > 0 && blockedByOwnPiece === kingMoves.length;

  // Điều kiện Muộn Cung Sát:
  // 1. Thật sự chiếu bí (isCheckmated), VÀ các ô thoát của Tướng bị cản trở bởi chính quân phòng thủ
  //    (ít nhất 2 quân mình bịt xung quanh đối với Tướng ở trung lộ, hoặc 1 quân nếu ở góc cung).
  // 2. HOẶC Tướng hoàn toàn không còn ô thoát nào do 100% ô kề trong cung bị chính quân mình bịt kín (allBlockedByOwn).
  const minBlockedForMate = kingMoves.length >= 3 ? 2 : 1;
  const qualifies = isCheckmated && (blockedByOwnPiece >= minBlockedForMate || allBlockedByOwn);

  if (!qualifies) return null;

  return fact(
    before,
    move,
    "muonCungSat",
    "Muộn cung sát: Pháo cắm chiếu tận dụng Tướng bị Sĩ/Tượng chèn kẹt tuyệt sát — đòn sát pháp một quân thành cục kinh điển của Pháo khi đối phương khuyết Tượng.",
    "Muộn cung sát"
  );
}

// ============================================================================
// 14. MÃ NGỌA TÀO (Thuật dùng Mã mạnh nhất - Triệu Hâm Hâm Bài 3)
// ============================================================================

/**
 * Mã nhảy vào giao điểm lộ 3/lộ 7 ở tuyến hoành 2 của đối phương,
 * trực tiếp khống chế Tướng trong cung cấm và uy hiếp đòn phối hợp Xe Mã hoặc Tiền Mã Hậu Pháo.
 */
export function detectNgoaTaoKnight(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const tr = rowOf(move.to);
  const tc = colOf(move.to);

  // Vị trí Ngọa Tào:
  // Nếu Đỏ (mover === "r") tấn công Đen: hàng 1, cột 2 (lộ 7 đen) hoặc cột 6 (lộ 3 đen)
  // Nếu Đen (mover === "b") tấn công Đỏ: hàng 8, cột 2 hoặc cột 6
  const isNgoaTaoSq = mover === "r"
    ? tr === 1 && (tc === 2 || tc === 6)
    : tr === 8 && (tc === 2 || tc === 6);

  if (!isNgoaTaoSq) return null;

  const kingSq = findKing(after, opp);
  if (kingSq === -1) return null;

  const isChecking = inCheck(after, opp);
  const attacksPalace = pseudoMoves(after, move.to).some((sq) => {
    const r = rowOf(sq);
    const c = colOf(sq);
    return c >= 3 && c <= 5 && (opp === "b" ? r >= 0 && r <= 2 : r >= 7 && r <= 9);
  });

  if (!isChecking && !attacksPalace) return null;

  // Tầng 2–4: chính con Mã ngọa tào phải ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, [move.from], 1);
  if (!r.ok) return null;
  // Số lộ gọi theo phía bên đi (Đỏ đếm từ phải sang, Đen đếm từ trái sang)
  const file = mover === "r" ? 9 - tc : tc + 1;
  return fact(
    before,
    move,
    "ngoaTaoMa",
    `Mã Ngọa Tào: Mã vào hàng 2 lộ ${file} sát cung Tướng (${moveNotation(before, move)})${isChecking ? " chiếu Tướng" : ""}; theo biến: ${r.summary}.`,
    "Mã Ngọa Tào"
  );
}

// ============================================================================
// 15. OA TÂM MÃ (Mã Xấu Nhất - Triệu Hâm Hâm Bài 4)
// ============================================================================

/**
 * Mã nhập hoa tim (ô giữa cung điện):
 * Đỏ tại hàng 8 cột 4 (sq 76), Đen tại hàng 1 cột 4 (sq 13).
 * Nước đi này chèn kẹt Tướng, cắt đứt liên lạc Song Sĩ — thế cờ đại kỵ trong trung cuộc.
 */
export function detectOaTamKnight(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n") return null;
  const mover = sideOf(piece);
  const tr = rowOf(move.to);
  const tc = colOf(move.to);

  // Vị trí Oa Tâm (hoa tim cung nhà):
  const isOaTam = (mover === "r" && tr === 8 && tc === 4) || (mover === "b" && tr === 1 && tc === 4);
  if (!isOaTam) return null;

  return fact(
    before,
    move,
    "oaTamMa",
    "Oa Tâm Mã: Mã thoái về hoa tim trung cung chèn kẹt Tướng và cắt đứt liên lạc Song Sĩ — vị trí xấu nhất của Mã theo Triệu Hâm Hâm.",
    "Oa Tâm Mã",
    "critique"
  );
}

// ============================================================================
// 16. PHÁO TRẦM ĐÁY (Nghệ Thuật Phá Trận & Kiềm Chế - Triệu Hâm Hâm Bài 13 & 14)
// ============================================================================

/** Kết quả kiểm từng tầng của một kỳ lý: qua hết thì kèm cơ chế và lời bình; trượt thì ghi tầng trượt và lý do. */
export type PrincipleCheck =
  | { ok: true; mechanism: string; summary: string; /** Ô ban đầu của các quân làm nên hình đã ra tay trong biến. */ acted?: number[] }
  | { ok: false; layer: 1 | 2 | 3 | 4; reason: string };

/** Các ô trong cung của phe `side`. */
function palaceSquares(side: Side): number[] {
  const rows = side === "b" ? [0, 1, 2] : [7, 8, 9];
  return rows.flatMap((r) => [3, 4, 5].map((c) => r * 9 + c));
}

/**
 * Tầng 2–4 dùng chung cho các kỳ lý tấn công (hình của kỳ lý do bộ nhận diện kiểm ở tầng 1):
 * 2. Mục đích: nước đi không tự ăn quân lớn — ăn quân thì mục đích là ăn quân.
 * 3. Cơ chế: biến engine dẫn tới sát, hoặc thắng ít nhất 2,5 điểm Tốt sau nước đi, và đúng các quân làm nên hình của
 *    kỳ lý (`keys`: ô của chúng trong thế trước nước đi) ra tay — chiếu hoặc ăn quân — trước hoặc ngay ở đòn quyết định.
 *    Đòn đến từ chỗ khác thì hình của kỳ lý không phải lý do của kết quả.
 * 4. Kết quả: không hớ, engine chấm bên đi từ +200 (hoặc sát).
 * Qua hết thì `summary` là lời kể lại biến để ghép vào lời bình.
 */
export function checkAttackLine(
  before: Board, move: Move, options: ZhaoTacticsOptions | undefined, keys: number[], need = keys.length,
): PrincipleCheck {
  const victim = before[move.to];
  if (victim && isMajor(victim)) return { ok: false, layer: 2, reason: `Nước này ăn ${nameOf(victim)} — mục đích là ăn quân` };
  const line = engineLine(before, move, options);
  if (!line) return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  const blow = decisiveBlow(line);
  if (!blow || (!blow.mate && line.outcome.materialSettled < 250)) {
    return { ok: false, layer: 3, reason: "Biến không sát, cũng không thắng quân" };
  }
  const { end, text: result } = blow;
  const mechanism = blow.mate ? "công sát" : "thắng quân";
  const acted = keys.filter((k) => {
    const r = pieceRole(line, k, end);
    return r.checks > 0 || r.captures.length > 0;
  });
  if (acted.length < need) return { ok: false, layer: 3, reason: `Chỉ ${acted.length}/${keys.length} quân làm nên hình ra tay trong biến — đòn đến từ chỗ khác` };
  if (!soundMove(options)) return { ok: false, layer: 4, reason: `Nước đi hớ ${options?.loss ?? "?"} điểm so với nước tốt nhất` };
  if (!line.moverMates && line.scoreForMover < 200) return { ok: false, layer: 4, reason: `Engine chỉ chấm bên đi +${line.scoreForMover}` };
  return { ok: true, mechanism, summary: `${narrate(line, end)} — ${result}`, acted };
}

/**
 * Kỳ lý vây bắt quân: biến engine phải bắt được đúng quân đối phương đứng ở ô `target` (theo danh tính, trong 10 nửa nước).
 * Trả về lời kể biến tới nước bắt (kể cả nước ăn lại ngay sau), null khi biến không bắt được chính con đó.
 */
function captureStory(before: Board, move: Move, options: ZhaoTacticsOptions | undefined, target: number): string | null {
  const line = engineLine(before, move, options);
  if (!line) return null;
  const won = line.outcome.captures.find((c) => c.by === line.plies[0].side && c.origin === target && c.ply <= 10);
  if (!won) return null;
  const t = tally(line, won.ply);
  return `${narrate(line, t.upTo)} — ${t.text}`;
}

/** Loại quân (trong thế trước nước đi) của các quân đã ra tay theo `checkAttackLine`. */
function actedTypes(before: Board, acted: number[] | undefined): Set<PieceType> {
  return new Set((acted ?? []).map((sq) => typeOf(before[sq]!)));
}

/**
 * Pháo trầm đáy (Triệu Hâm Hâm bài 13–14), kiểm bốn tầng:
 * 1. Hình: Pháo từ hàng khác cắm xuống hàng đáy đối phương, và chiếu Tướng hoặc nhắm Sĩ/Tượng ở hàng đáy.
 * 2. Mục đích: không phải chỉ ăn quân (biến không thắng thêm gì ngoài quân vừa ăn), không phải chạy Pháo
 *    đang bị dọa (trừ khi dẫn tới sát hoặc thắng Xe).
 * 3. Cơ chế, theo đúng con Pháo đó trong biến engine — bài giảng: tác dụng là "công sát, rút bắt quân,
 *    mưu Sĩ Tượng"; "xuống đáy không có tác dụng là biếu không":
 *    - công sát: chiếu bí mà Pháo có góp sức (có nước chiếu của Pháo, hoặc Pháo khống chế ô trong cung);
 *    - rút bắt quân: thắng quân lớn do chính Pháo ăn, hoặc ngay sau nước chiếu của Pháo;
 *    - mưu Sĩ Tượng: như trên nhưng ăn Sĩ/Tượng và giữ được.
 * 4. Kết quả: không hớ, và engine chấm bên đi từ +150 trở lên.
 * Trả về null khi nước đi không phải Pháo cắm xuống đáy (không phải ứng viên).
 */
export function checkDeepCannonBottom(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "c") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const bottom = mover === "r" ? 0 : 9;
  // Phải từ hàng trên cắm xuống đáy, không tính Pháo đã ở đáy di chuyển ngang
  if (rowOf(move.to) !== bottom || rowOf(move.from) === bottom) return null;
  const oppKing = findKing(after, opp);
  if (oppKing === -1) return null;

  // Tầng 1: hình
  const checks = attackersOf(after, oppKing, mover).includes(move.to);
  // Nhắm Sĩ/Tượng qua một ngòi không phải Tướng — lấy chính Tướng làm ngòi thì chẳng kiềm chế được gì
  const aimed = after.findIndex((p, sq) =>
    !!p && sideOf(p) === opp && "ab".includes(typeOf(p)) && rowOf(sq) === bottom &&
    attackersOf(after, sq, mover).includes(move.to) &&
    !after.some((q, x) => !!q && typeOf(q) === "k" && between(move.to, sq, x)));
  const aims = aimed !== -1;
  if (!checks && !aims) return { ok: false, layer: 1, reason: "Pháo xuống đáy nhưng không chiếu Tướng, không nhắm Sĩ/Tượng" };

  const pv = pvAfterMove(options, move);
  if (!options?.evalAfter) return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  const scoreForMover = -options.evalAfter.score;
  const moverMates = scoreForMover >= MATE_THRESHOLD;
  // Chính nước này chiếu bí thì biến trống là đúng; còn lại cần biến đủ dài mới kết luận được
  if (!moverMates && pv.length < 3) return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };

  // Theo đúng con Pháo vừa đi qua biến: nó chiếu ở nửa nước nào, ăn được gì, quân nào ăn ngay sau nước chiếu của nó
  const line = [move, ...pv].slice(0, 16);
  const events: { ply: number; side: Side; type: PieceType; victim: PieceType | null; check: boolean; inCheck: boolean; n: string }[] = [];
  const cannonChecks: number[] = [];
  const credited: { ply: number; type: PieceType; by: PieceType }[] = [];
  let board = before;
  let c = move.from;
  let lostAt = -1;
  for (const [ply, m] of line.entries()) {
    const p = board[m.from];
    if (!p) break;
    const victim = board[m.to];
    const next = play(board, m);
    const side = sideOf(p);
    events.push({
      ply, side, type: typeOf(p), victim: victim ? typeOf(victim) : null,
      check: inCheck(next, opponent(side)), inCheck: inCheck(board, side), n: moveNotation(board, m),
    });
    if (sideOf(p) === mover) {
      if (m.from === c) c = m.to;
      if (victim && ply > 0 && (m.to === c || cannonChecks.includes(ply - 2))) {
        credited.push({ ply, type: typeOf(victim), by: typeOf(p) });
      }
      const k = findKing(next, opp);
      if (c !== -1 && k !== -1 && attackersOf(next, k, mover).includes(c)) cannonChecks.push(ply);
    } else if (m.to === c) {
      lostAt = ply;
      c = -1;
    }
    board = next;
  }

  const o = classifyMoveOutcome(before, move, pv, { scoreForMover, moverMates });
  const captured = before[move.to];
  const capVal = captured ? PIECE_VALUES[typeOf(captured)] : 0;
  const net = o.materialSettled - capVal;
  const palaceHit = c !== -1 && palaceSquares(opp).some((sq) => sq !== c && guards(board, c, sq));
  const inMate = moverMates && c !== -1 && (cannonChecks.length > 0 || palaceHit);
  const bigWin = credited.find((x) => "rnc".includes(x.type));
  const guardWin = credited.find((x) => "ab".includes(x.type));

  // Tầng 2: Pháo đang bị dọa thì mục đích chính là chạy quân, trừ khi đòn rất lớn
  const threatened = (exchangeGain(before, move.from, opp) ?? 0) > 0;
  if (threatened && !inMate && bigWin?.type !== "r") {
    return { ok: false, layer: 2, reason: "Pháo đang bị dọa ăn có lời — nước này chủ yếu là chạy Pháo" };
  }

  // Tầng 3: cơ chế. Lời bình kể lại đúng chuỗi nước trong biến (ai ăn gì, ai chiếu), không dùng câu khuôn.
  const first = `Pháo xuống đáy${captured ? ` ăn ${PIECE_NAME[typeOf(captured)]}` : ""}${checks ? " chiếu Tướng" : ` nhắm ${PIECE_NAME[typeOf(after[aimed]!)]}`}`;
  const narrate = (upTo: number) => {
    const parts: string[] = [];
    let skipped = false;
    for (const e of events.slice(0, upTo + 1)) {
      if (e.ply === 0) {
        parts.push(`${first} (${e.n})`);
        continue;
      }
      if (!e.victim && !e.check && !e.inCheck && e.ply !== upTo) {
        skipped = true;
        continue;
      }
      if (skipped) parts.push("…");
      skipped = false;
      const who = e.side === mover ? "" : `${e.side === "r" ? "Đỏ" : "Đen"} `;
      const act = e.victim
        ? `${PIECE_NAME[e.type]} ăn ${PIECE_NAME[e.victim]}`
        : e.inCheck ? (e.type === "k" ? "Tướng tránh chiếu" : `${PIECE_NAME[e.type]} đỡ chiếu`) : PIECE_NAME[e.type];
      parts.push(`${who}${act}${e.check ? " chiếu" : e.victim || e.inCheck ? "" : " đi"} (${e.n})`);
    }
    return parts.join(", ");
  };
  /** Kết quả vật chất tới nửa nước `key`, kể cả ăn lại ngay trong hai nửa nước sau đó. */
  const tally = (key: number) => {
    let upTo = key;
    for (let i = key + 1; i <= key + 2 && i < events.length; i++) if (events[i].victim) upTo = i;
    const names = (side: Side) => {
      const ts = events.slice(1, upTo + 1).filter((e) => e.victim && e.side === side).map((e) => e.victim!);
      return [...new Set(ts)].map((t) => {
        const k = ts.filter((x) => x === t).length;
        return k > 1 ? `${k} ${PIECE_NAME[t]}` : PIECE_NAME[t];
      });
    };
    const gains = names(mover);
    const losses = names(opp);
    return { upTo, text: losses.length ? `đổi ${losses.join(", ")} lấy ${gains.join(", ")}` : `thắng ${gains.join(", ")}` };
  };
  let mechanism: string | null = null;
  let summary = "";
  if (inMate) {
    const moves = Math.max(1, Math.round((MATE_SCORE - scoreForMover) / 2));
    mechanism = "công sát";
    summary = events.length === 1
      ? `Pháo trầm đáy: ${narrate(0)} — chiếu bí ngay.`
      : `Pháo trầm đáy: ${narrate(Math.min(5, events.length - 1))} — theo biến, chiếu bí sau ${moves} nước nữa.`;
  } else if ((bigWin && net >= 250) || (guardWin && net >= 150)) {
    const key = bigWin && net >= 250 ? bigWin : guardWin!;
    mechanism = key === bigWin ? "rút bắt quân" : "mưu Sĩ Tượng";
    const t = tally(key.ply);
    summary = `Pháo trầm đáy: ${narrate(t.upTo)} — ${t.text}.`;
  }
  if (!mechanism) {
    // Pháo mất ngay trong vài nửa nước đầu mới là "biếu không"; mất ở cuối biến dài là chuyện khác
    if (lostAt >= 0 && lostAt <= 5) return { ok: false, layer: 3, reason: `Pháo bị ăn ở nửa nước ${lostAt} mà không lấy lại tương xứng — "biếu không"` };
    if (captured) return { ok: false, layer: 2, reason: `Nước này là Pháo ăn ${PIECE_NAME[typeOf(captured)]}, biến không thắng thêm gì — mục đích là ăn quân` };
    return { ok: false, layer: 3, reason: "Biến không cho thấy Pháo phát huy tác dụng: không sát, không thắng quân nhờ Pháo" };
  }

  // Tầng 4: kết quả
  if (!soundMove(options)) return { ok: false, layer: 4, reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất` };
  if (scoreForMover < 150) return { ok: false, layer: 4, reason: `Engine chỉ chấm bên đi ${scoreForMover >= 0 ? "+" : ""}${scoreForMover}` };
  return { ok: true, mechanism, summary };
}

/** Pháo trầm đáy: chỉ gắn khi qua cả bốn tầng của checkDeepCannonBottom. */
export function detectDeepCannonBottom(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkDeepCannonBottom(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "phaoTramDay", r.summary, "Pháo trầm đáy");
}

// ============================================================================
// 17. KHUYẾT SĨ KỴ SONG XE (Triệu Hâm Hâm Bài 1)
// ============================================================================

/**
 * Tận dụng đối phương khuyết Sĩ (còn <= 1 Sĩ), bên công sở hữu Song Xe dũng mãnh,
 * Xe tiến sâu qua sông tấn công cung Tướng hoặc chiếm sườn/đáy mở đòn tuyệt sát.
 */
export function detectKhuyetSiSongXe(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  // Đối phương phải khuyết Sĩ (còn <= 1 Sĩ)
  let oppAdvisors = 0;
  for (const p of after) {
    if (p && sideOf(p) === opp && typeOf(p) === "a") oppAdvisors++;
  }
  if (oppAdvisors > 1) return null;

  // Bên công phải còn đủ Song Xe (2 Xe)
  let moverRooks = 0;
  for (const p of after) {
    if (p && sideOf(p) === mover && typeOf(p) === "r") moverRooks++;
  }
  if (moverRooks < 2) return null;

  // Xe đi phải tiến công qua sông vào trận địa đối phương
  const toRow = rowOf(move.to);
  if (!crossedRiver(toRow, mover)) return null;

  // Phải có áp lực công thành (attackPressure >= 2 hoặc chiếu Tướng)
  const isChecking = inCheck(after, opp);
  const pressure = attackPressure(after, opp);
  if (!isChecking && pressure < 1) return null;

  // Tầng 2–4: cả hai Xe cùng ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, pieces(before, mover, "r"), 2);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "khuyetSiSongXe",
    `Khuyết Sĩ kỵ Song Xe: đối phương ${oppAdvisors === 0 ? "đã mất cả hai Sĩ" : "chỉ còn một Sĩ"}, hai Xe cùng đánh vào cung (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Khuyết Sĩ kỵ Song Xe"
  );
}


// ============================================================================
// 18. VÔ SỰ TIẾN TỐT BIÊN (Triệu Hâm Hâm Bài 7)
// ============================================================================

/**
 * Vô sự tiến tốt biên (Triệu Hâm Hâm Bài 7):
 * Trong thế trận giằng co đôi bên kìm giữ lẫn nhau, tiến tốt biên (lộ 1 hoặc 9)
 * từng bước mở rộng không gian, tạo thế tiềm tàng và kiên nhẫn chờ đối phương tự suy yếu.
 */
export function detectVoSuTienTotBien(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  // Phải là Tốt biên: cột 0 (lộ 1/9) hoặc cột 8 (lộ 9/1)
  const fc = colOf(move.from);
  const tc = colOf(move.to);
  if ((fc !== 0 || tc !== 0) && (fc !== 8 || tc !== 8)) return null;

  // Phải là nước tiến tốt
  const fr = rowOf(move.from);
  const tr = rowOf(move.to);
  const isForward = mover === "r" ? tr < fr : tr > fr;
  if (!isForward) return null;

  // Không ăn quân, không chiếu tướng, không bị chiếu
  if (before[move.to] || inCheck(before, mover) || inCheck(after, opp)) return null;
  if (hasMateInOne(before, opp)) return null;

  // Thế trận giằng co: cả 2 bên còn ít nhất 2 quân lớn (Xe/Mã/Pháo)
  let moverMajors = 0;
  let oppMajors = 0;
  for (const p of after) {
    if (p && isMajor(p)) {
      if (sideOf(p) === mover) moverMajors++;
      else oppMajors++;
    }
  }
  if (moverMajors < 2 || oppMajors < 2) return null;

  return fact(
    before,
    move,
    "voSuTienTotBien",
    "Vô sự tiến tốt biên: Trong thế trận giằng co, tiến tốt biên từng bước mở rộng không gian và kiên nhẫn chờ đối phương tự làm suy yếu trận hình.",
    "Vô sự tiến tốt biên",
  );
}

// ============================================================================
// 19. MÁY ỦI TRUNG LỘ (Triệu Hâm Hâm Bài 9)
// ============================================================================

/**
 * Máy ủi trung lộ (Triệu Hâm Hâm Bài 9):
 * Có Pháo đầu yểm trợ, thúc Tốt giữa (lộ 5) xông thẳng vào trung tâm đối phương
 * như máy ủi nghiền nát tuyến phòng ngự.
 */
export function detectMayUiTrungLo(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  // Bên đi phải có Pháo đầu (Pháo ở cột 4)
  let hasCentralCannon = false;
  for (let i = 0; i < before.length; i++) {
    const p = before[i];
    if (p && sideOf(p) === mover && typeOf(p) === "c" && colOf(i) === 4) {
      hasCentralCannon = true;
      break;
    }
  }
  if (!hasCentralCannon) return null;

  // Nước đi là thúc Tốt giữa tiến lên
  if (typeOf(piece) !== "p") return null;
  const fc = colOf(move.from);
  if (fc !== 4) return null;

  const fr = rowOf(move.from);
  const tr = rowOf(move.to);
  const isForward = mover === "r" ? tr < fr : tr > fr;
  if (!isForward) return null;

  // Tốt dâng cao tạo áp lực: đã qua sông hoặc tiến đến hàng 5 (Đỏ) / hàng 4 (Đen)
  const isPressuring = mover === "r" ? tr <= 5 : tr >= 4;
  if (!isPressuring) return null;

  return fact(
    before,
    move,
    "mayUiTrungLo",
    "Máy ủi trung lộ: Có Pháo đầu yểm trợ, thúc Tốt giữa xông thẳng vào trung tâm đối phương như máy ủi nghiền nát tuyến phòng ngự.",
    "Máy ủi trung lộ",
  );
}

// ============================================================================
// 20. NHẤT MÃ HOÁN LƯỠNG TƯỢNG (Triệu Hâm Hâm Bài 10)
// ============================================================================

/**
 * Nhất Mã hoán Lưỡng Tượng (Triệu Hâm Hâm Bài 10):
 * Cổ ngữ có câu "Nhất Mã hoán Lưỡng Tượng, kỵ sĩ tất anh hùng".
 * Chủ động dùng Mã ăn Tượng đối phương để xé toạc tấm khiên phòng ngự trung tâm.
 */
export function detectNhatMaHoanLuongTuong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n") return null;
  const target = before[move.to];
  if (!target || typeOf(target) !== "b") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (sideOf(target) !== opp) return null;
  if (!soundMove(options)) return null;

  // Mã phải nhảy sang đất đối phương ăn Tượng
  if (!crossedRiver(rowOf(move.to), mover)) return null;

  // Sau khi ăn, đối phương chỉ còn tối đa 1 Tượng
  let oppElephants = 0;
  for (const p of after) {
    if (p && sideOf(p) === opp && typeOf(p) === "b") oppElephants++;
  }
  if (oppElephants > 1) return null;

  return fact(
    before,
    move,
    "nhatMaHoanLuongTuong",
    "Nhất Mã hoán Lưỡng Tượng: Dùng Mã đổi lấy Tượng đối phương để xé toạc tấm khiên phòng ngự trung tâm, mở đường cho Pháo đầu và Song Xe thâm nhập.",
    "Nhất Mã hoán Lưỡng Tượng",
  );
}

// ============================================================================
// 21. CHIẾN THUẬT ĐOẠT TRUNG BINH (Triệu Hâm Hâm Bài 11)
// ============================================================================

/**
 * Chiến thuật đoạt trung binh (Triệu Hâm Hâm Bài 11):
 * Dùng quân tiêu diệt Tốt giữa (Tốt 5) của đối phương — triệt hạ trái tim của hệ thống phòng ngự.
 */
export function detectDoatTrungBinh(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const target = before[move.to];
  if (!target || typeOf(target) !== "p") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (sideOf(target) !== opp) return null;
  if (!soundMove(options)) return null;

  // Mục tiêu phải là Tốt giữa (cột 4) của đối phương
  if (colOf(move.to) !== 4) return null;

  const pt = typeOf(piece);
  if (!["n", "c", "r", "p"].includes(pt)) return null;

  // Vị trí tốt bị ăn nằm ở phần sân đối phương hoặc tuyến hà
  const tr = rowOf(move.to);
  const isInOppTerritory = mover === "r" ? tr <= 4 : tr >= 5;
  if (!isInOppTerritory) return null;

  // Ăn sạch hay không do biến engine quyết định (zhao-outcome: phải là ăn sạch); lời bình nói đúng việc đã làm
  return fact(
    before,
    move,
    "doatTrungBinh",
    `Đoạt trung binh: ${nameOf(piece)} ăn Tốt giữa (${moveNotation(before, move)}) — trung lộ đối phương mất Tốt chặn, Tượng giữa thiếu che.`,
    "Chiến thuật đoạt trung binh",
  );
}

// ============================================================================
// 22. KHÔNG TÂM PHÁO (Triệu Hâm Hâm Bài 12)
// ============================================================================

/**
 * Không tâm pháo / Pháo trống (Triệu Hâm Hâm Bài 12):
 * Pháo chiếm lĩnh trung lộ ngắm thẳng cung Tướng mà không có quân che chắn ở giữa.
 */
export function detectKhongTamPhao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = after[move.to] ?? before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  // Tìm Pháo của bên đi trên cột 4 sau nước đi
  let cannonSq = -1;
  for (let r = 0; r <= 9; r++) {
    const sq = r * 9 + 4;
    const p = after[sq];
    if (p && sideOf(p) === mover && typeOf(p) === "c") {
      cannonSq = sq;
      break;
    }
  }
  if (cannonSq === -1) return null;

  // Tướng đối phương phải ở cột 4
  const kingSq = findKing(after, opp);
  if (kingSq === -1 || colOf(kingSq) !== 4) return null;

  // Kiểm tra giữa Pháo và Tướng không có quân nào trên cột 4
  const cRow = rowOf(cannonSq);
  const kRow = rowOf(kingSq);
  const minR = Math.min(cRow, kRow);
  const maxR = Math.max(cRow, kRow);
  for (let r = minR + 1; r < maxR; r++) {
    if (after[r * 9 + 4] !== null) return null;
  }

  // Đảm bảo thế cờ pháo trống mới hình thành sau nước đi này
  const beforeKing = findKing(before, opp);
  if (beforeKing !== -1 && colOf(beforeKing) === 4) {
    let beforeCannon = -1;
    for (let r = 0; r <= 9; r++) {
      const sq = r * 9 + 4;
      const p = before[sq];
      if (p && sideOf(p) === mover && typeOf(p) === "c") {
        beforeCannon = sq;
        break;
      }
    }
    if (beforeCannon !== -1) {
      const bcRow = rowOf(beforeCannon);
      const bkRow = rowOf(beforeKing);
      let clear = true;
      for (let r = Math.min(bcRow, bkRow) + 1; r < Math.max(bcRow, bkRow); r++) {
        if (before[r * 9 + 4] !== null) {
          clear = false;
          break;
        }
      }
      if (clear) return null; // đã có pháo trống từ trước
    }
  }

  // Tầng 2–4: chính con Pháo trống phải ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, [cannonSq === move.to ? move.from : cannonSq], 1);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "khongTamPhao",
    `Không tâm pháo: Pháo trung lộ ngắm thẳng Tướng, ở giữa không còn quân che (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Không tâm pháo",
  );
}


// ============================================================================
// 23. THIÊN ĐỊA PHÁO (Triệu Hâm Hâm Bài 14)
// ============================================================================

/**
 * Thiên Địa Pháo (Triệu Hâm Hâm Bài 14):
 * Một Pháo ngự trung tâm (cột 4), một Pháo cắm sâu tuyến đáy (hàng 0 đối với Đỏ, hàng 9 đối với Đen)
 * tạo thành gọng kìm song song làm tê liệt toàn bộ hệ thống Sĩ Tượng của đối phương.
 */
export function detectThienDiaPhao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const mover = sideOf(after[move.to] ?? before[move.from]!);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const botRow = mover === "r" ? 0 : 9;

  let hasCentralCannon = false;
  let hasBottomCannon = false;
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover && typeOf(p) === "c") {
      if (colOf(i) === 4) hasCentralCannon = true;
      if (rowOf(i) === botRow) hasBottomCannon = true;
    }
  }
  if (!hasCentralCannon || !hasBottomCannon) return null;

  let hadCentralBefore = false;
  let hadBottomBefore = false;
  for (let i = 0; i < before.length; i++) {
    const p = before[i];
    if (p && sideOf(p) === mover && typeOf(p) === "c") {
      if (colOf(i) === 4) hadCentralBefore = true;
      if (rowOf(i) === botRow) hadBottomBefore = true;
    }
  }
  if (hadCentralBefore && hadBottomBefore) return null;

  // Tầng 2–4: một trong hai Pháo của thế Thiên Địa phải ra tay trong biến dẫn tới sát / thắng quân
  const cannons = pieces(after, mover, "c").map((sq) => (sq === move.to ? move.from : sq));
  const r = checkAttackLine(before, move, options, cannons, 1);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "thienDiaPhao",
    `Thiên Địa Pháo: một Pháo giữ trung lộ, một Pháo nằm hàng đáy đối phương (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Thiên Địa Pháo",
  );
}

// ============================================================================
// 24. PHÁO ĐÁY KHÓA XE (Triệu Hâm Hâm Bài 15)
// ============================================================================

/**
 * Pháo chìm đáy phong tỏa Xe (Triệu Hâm Hâm Bài 15):
 * Pháo cắm xuống hàng đáy kiềm tỏa góc cánh, chặn đứng đường xuất động của Xe đối phương.
 */
export function detectPhaoDayKhoaXe(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "c") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const botRow = mover === "r" ? 0 : 9;
  if (rowOf(move.to) !== botRow) return null;
  if (rowOf(move.from) === botRow) return null;

  const tc = colOf(move.to);
  if (![0, 1, 7, 8].includes(tc)) return null;

  let rookSq = -1;
  const cornerCols = tc <= 1 ? [0, 1] : [7, 8];
  const oppBackRows = mover === "r" ? [0, 1] : [8, 9];
  for (const r of oppBackRows) {
    for (const c of cornerCols) {
      const p = after[r * 9 + c];
      if (p && sideOf(p) === opp && typeOf(p) === "r") rookSq = r * 9 + c;
    }
  }
  if (rookSq < 0) return null;

  // Tầng 2–4: "khóa Xe" nghĩa là suốt biến engine Xe đối phương không ra được khỏi góc, và đòn có kết quả
  const line = engineLine(before, move, options);
  if (!line || line.plies.some((e) => e.side === opp && e.origin === rookSq)) return null;
  const r = checkAttackLine(before, move, options, [], 0);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "phaoDayKhoaXe",
    `Pháo đáy khóa Xe: Pháo xuống góc đáy (${moveNotation(before, move)}), Xe đối phương bị giam trong góc suốt biến; theo biến: ${r.summary}.`,
    "Pháo đáy khóa Xe",
  );
}

// ============================================================================
// 25. OANH TẠC LỘ SƯỜN (Triệu Hâm Hâm Bài 16)
// ============================================================================

/**
 * Oanh tạc lộ sườn (Triệu Hâm Hâm Bài 16):
 * Tập trung hỏa lực chủ lực (Song Xe, hoặc Xe Pháo) ở lộ sườn (cột 3 hoặc 5) dội đòn tổng lực.
 */
export function detectOanhTacLoSuon(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "r" && pt !== "c") return null;

  const tc = colOf(move.to);
  if (tc !== 3 && tc !== 5) return null;

  const tr = rowOf(move.to);
  if (!crossedRiver(tr, mover)) return null;

  const onFile: number[] = [];
  for (let r = 0; r <= 9; r++) {
    const p = after[r * 9 + tc];
    if (p && sideOf(p) === mover && (typeOf(p) === "r" || typeOf(p) === "c")) onFile.push(r * 9 + tc);
  }
  if (onFile.length < 2) return null;

  const pressure = attackPressure(after, opp);
  if (!inCheck(after, opp) && pressure < 1) return null;

  // Tầng 2–4: "tập trung hỏa lực" nghĩa là ít nhất hai quân trên lộ sườn cùng ra tay trong biến
  const r = checkAttackLine(before, move, options, onFile.map((sq) => (sq === move.to ? move.from : sq)), 2);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "oanhTacLoSuon",
    `Oanh tạc lộ sườn: Xe Pháo dồn trên lộ ${mover === "r" ? 9 - tc : tc + 1} (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Oanh tạc lộ sườn",
  );
}

// ============================================================================
// 26. MẠNH CÔNG TUYẾN ÁP ĐÁY (Triệu Hâm Hâm Bài 17)
// ============================================================================

/**
 * Mạnh công tuyến áp đáy (Triệu Hâm Hâm Bài 17):
 * Xe hoặc Pháo thâm nhập vào hàng 2 cung Tướng (hàng 1 đối với Đỏ, hàng 8 đối với Đen) —
 * tuyến sinh mệnh của đối phương, khống chế đôi Sĩ và bóp nghẹt lão Tướng.
 */
export function detectManhCongTuyenApDay(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "r" && pt !== "c") return null;

  const apDayRow = mover === "r" ? 1 : 8;
  const tr = rowOf(move.to);
  if (tr !== apDayRow) return null;

  const fr = rowOf(move.from);
  if (fr === apDayRow) return null;

  const tc = colOf(move.to);
  if (tc < 1 || tc > 7) return null;

  // Áp đáy là để cắt Tướng khỏi Sĩ/Tượng: phải chiếu hoặc tạo đe dọa mới lên Sĩ/Tượng,
  // và quân vừa lên không bị ăn không (đứng ở hàng 2 mà không làm gì thì chưa phải "mãnh công").
  const threatsGuard = pieces(after, opp, "ab").some(
    (sq) => attackersOf(after, sq, mover).includes(move.to) && !attackersOf(before, sq, mover).includes(move.from),
  );
  if (!inCheck(after, opp) && !threatsGuard) return null;
  if (attackersOf(after, move.to, opp).length > 0 && attackersOf(after, move.to, mover).length === 0) return null;

  // Tầng 2–4: quân vào tuyến áp đáy phải tự ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, [move.from], 1);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "manhCongTuyenApDay",
    `Mạnh công tuyến áp đáy: ${nameOf(piece)} vào hàng 2 cung Tướng (${moveNotation(before, move)}), cắt Tướng khỏi Sĩ Tượng; theo biến: ${r.summary}.`,
    "Mạnh công tuyến áp đáy",
  );
}

// ============================================================================
// 27. KIỀM CHẾ TUYẾN ĐỈNH CUNG (Triệu Hâm Hâm Bài 18)
// ============================================================================

/**
 * Kiềm chế tuyến đỉnh cung (Triệu Hâm Hâm Bài 18):
 * Pháo hoặc Xe chiếm lĩnh hàng ngang đỉnh cửu cung (hàng 2 đối với Đỏ, hàng 7 đối với Đen)
 * phong tỏa diện rộng và đóng băng toàn bộ Song Mã Song Pháo đối thủ.
 */
export function detectKiemCheDinhCung(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "c" && pt !== "r") return null;

  const browRow = mover === "r" ? 2 : 7;
  const tr = rowOf(move.to);
  if (tr !== browRow) return null;

  const fr = rowOf(move.from);
  if (fr === browRow) return null;

  let oppMinors = 0;
  for (const p of after) {
    if (p && sideOf(p) === opp && (typeOf(p) === "n" || typeOf(p) === "c")) {
      oppMinors++;
    }
  }
  if (oppMinors < 2) return null;

  return fact(
    before,
    move,
    "kiemCheDinhCung",
    "Kiềm chế tuyến đỉnh cung: Khống chế hàng ngang đỉnh cung đối phương, phong tỏa diện rộng và đóng băng toàn bộ Song Mã Song Pháo đối thủ.",
    "Kiềm chế tuyến đỉnh cung",
  );
}


// ============================================================================
// 28. CHIẾM TUYẾN TỐT (Triệu Hâm Hâm Bài 19)
// ============================================================================

/**
 * Chiếm tuyến tốt (Triệu Hâm Hâm Bài 19):
 * Xe tiến qua sông chiếm giữ tuyến Tốt đối phương (hàng 3 đối với Đỏ, hàng 6 đối với Đen)
 * nhằm càn quét binh, áp chế Mã và yểm trợ bộ binh/Mã ta tiến công.
 */
export function detectChiemTuyenTot(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "r") return null;

  const pawnRow = mover === "r" ? 3 : 6;
  const tr = rowOf(move.to);
  if (tr !== pawnRow) return null;

  const fr = rowOf(move.from);
  if (fr === pawnRow) return null;

  // Chiếm tuyến Tốt để quét Tốt: phải nhắm được >= 2 Tốt đối phương trên tuyến (tính cả Tốt vừa ăn).
  const opp = opponent(mover);
  const pawnsHit = pieces(after, opp, "p").filter((sq) => rowOf(sq) === tr && attackersOf(after, sq, mover).includes(move.to)).length
    + (before[move.to] && typeOf(before[move.to]!) === "p" ? 1 : 0);
  if (pawnsHit < 2) return null;

  return fact(
    before,
    move,
    "chiemTuyenTot",
    "Chiếm tuyến tốt: Xe quá hà chiếm lĩnh tuyến tốt đối phương nhằm càn quét binh, đè Mã và mở đường cho quân ta đột kích.",
    "Chiếm tuyến tốt",
  );
}

// ============================================================================
// 29. KHỐNG CHẾ TUYẾN KỴ HÀ (Triệu Hâm Hâm Bài 20)
// ============================================================================

/**
 * Khống chế tuyến kỵ hà (Triệu Hâm Hâm Bài 20):
 * Xe tiến sang bờ sông đối phương (kỵ hà: hàng 4 đối với Đỏ, hàng 5 đối với Đen)
 * nhằm phong tỏa tuyến sông, ngăn cản quân địch tràn qua và yểm trợ quân ta tiến công.
 */
export function detectKhongCheKyHa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "r") return null;

  const kyHaRow = mover === "r" ? 4 : 5;
  const tr = rowOf(move.to);
  if (tr !== kyHaRow) return null;

  const fr = rowOf(move.from);
  if (fr === kyHaRow) return null;

  // Phải là nước tiến sang sông (không phải lùi từ sâu trong trận địa về)
  if (mover === "r" && fr < 4) return null;
  if (mover === "b" && fr > 5) return null;

  return fact(
    before,
    move,
    "khongCheKyHa",
    "Khống chế tuyến kỵ hà: Xe tiến sang bờ sông đối phương (kỵ hà xa) phong tỏa tuyến sông, ngăn cản quân địch tràn qua và yểm trợ bộ binh xuất trận.",
    "Khống chế kỵ hà",
  );
}

// ============================================================================
// 30. TRANH ĐOẠT LỘ 3 VÀ LỘ 7 (Triệu Hâm Hâm Bài 21)
// ============================================================================

/**
 * Tranh đoạt tuyến lộ 3 và lộ 7 (Triệu Hâm Hâm Bài 21):
 * Đột kích hoặc thâm nhập vào lộ 3 hoặc lộ 7 (cột 2 hoặc 6) —
 * đánh thẳng vào yếu huyệt Mã và Tượng đối phương.
 */
export function detectTranhDoatLo3Lo7(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const tc = colOf(move.to);
  if (tc !== 2 && tc !== 6) return null;

  const pt = typeOf(piece);
  if (pt !== "p" && pt !== "r" && pt !== "c") return null;
  if (pt === "p" && !crossedRiver(rowOf(move.to), mover)) return null;

  // Bài 21: tranh lộ 3/7 là đánh trực diện vào Mã/Tượng cánh đó — nước đi phải tạo đe dọa MỚI
  // lên Mã hoặc Tượng đối phương ở cánh ấy (đứng trên lộ 3/7 thôi thì chưa phải).
  const wing = (c: number) => (tc === 2 ? c <= 3 : c >= 5);
  const target = pieces(after, opp, "nb").find((sq) => {
    if (!wing(colOf(sq))) return false;
    const att = attackersOf(after, sq, mover);
    if (!att.includes(move.to) || attackersOf(before, sq, mover).includes(move.from)) return false;
    // Phải là sức ép thật: quân bị nhắm không có căn, hoặc bị từ 2 quân ta trở lên dồn vào ("Pháo đè Mã kết hợp Xe").
    return attackersOf(after, sq, opp).length === 0 || att.length >= 2;
  });
  if (target === undefined) return null;

  // Tầng 2–4: chính quân vừa vào lộ 3/7 phải ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, [move.from], 1);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "tranhDoatLo3Lo7",
    `Tranh đoạt lộ ${mover === "r" ? 9 - tc : tc + 1}: ${nameOf(piece)} (${moveNotation(before, move)}) đánh vào cánh, nhắm ${nameOf(after[target]!)} đối phương; theo biến: ${r.summary}.`,
    "Tranh đoạt lộ 3 và lộ 7",
  );
}

// ============================================================================
// 31. PHONG TỎA & PHẢN PHONG TỎA LỘ XE (Triệu Hâm Hâm Bài 22)
// ============================================================================

/**
 * Phong tỏa & phản phong tỏa lộ Xe (Triệu Hâm Hâm Bài 22):
 * Cuộc chiến sinh tử ở lộ 2 và lộ 8 (cột 1 hoặc 7) —
 * bên dùng Pháo/Mã phong tỏa, bên xuất Xe phản phong tỏa giành quyền kiểm soát đường Xe huyết mạch.
 */
export function detectPhongToaLoXe(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  // Xuất Xe từ góc (X1-2, X9-8) là nước khai cuộc thường lệ, không phải phong tỏa — chỉ xét Pháo.
  if (typeOf(piece) !== "c") return null;
  const tc = colOf(move.to);
  if (tc !== 1 && tc !== 7) return null;

  // Phong tỏa thật: Xe đối phương ở góc cánh đó mất hẳn đường ra (cơ động giảm >= 3 ô so với trước nước đi).
  const oppCornerCols = tc === 1 ? [0, 1] : [7, 8];
  const oppHomeRows = opp === "b" ? [0, 1, 2] : [7, 8, 9];
  const blocked = pieces(after, opp, "r").some(
    (sq) =>
      oppCornerCols.includes(colOf(sq)) &&
      oppHomeRows.includes(rowOf(sq)) &&
      before[sq] === after[sq] &&
      pseudoMoves(before, sq).length - pseudoMoves(after, sq).length >= 3,
  );
  if (!blocked) return null;

  return fact(
    before,
    move,
    "phongToaLoXe",
    "Phong tỏa lộ Xe: Tranh chấp quyết liệt ở lộ 2 và 8 — dùng Pháo kiềm tỏa hoặc xuất Xe chiếm lộ huyết mạch nhằm đoạt quyền chủ động toàn cục.",
    "Phong tỏa lộ Xe",
  );
}

// ============================================================================
// 32. TẬP KÍCH ĐƯỜNG BIÊN - TỐT BIÊN ĐẠI NÁO (Triệu Hâm Hâm Bài 23)
// ============================================================================

/**
 * Tập kích đường biên - Tốt biên đại náo (Triệu Hâm Hâm Bài 23):
 * Đột kích bất ngờ từ cánh biên bằng cách thúc Tốt biên qua sông thọc sâu vào lãnh thổ đối phương.
 */
export function detectTotBienDaiNao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "p") return null;

  const fc = colOf(move.from);
  const tc = colOf(move.to);
  const tr = rowOf(move.to);

  // Phải liên quan đến cánh biên (lộ 1 hoặc 9: col 0 hoặc col 8)
  const isEdgePawn = fc === 0 || fc === 8 || tc === 0 || tc === 8;
  if (!isEdgePawn) return null;

  // Phải đã qua sông
  if (!crossedRiver(tr, mover)) return null;

  // Thọc sâu vào đất địch:
  // Đỏ tiến sâu (hàng <= 3) hoặc rẽ ngang thọc sườn (vào cột 1 hoặc 7)
  // Đen tiến sâu (hàng >= 6) hoặc rẽ ngang thọc sườn (vào cột 1 hoặc 7)
  const isDeep = mover === "r" ? tr <= 3 : tr >= 6;
  const isFlankTurn = (fc === 0 && tc === 1) || (fc === 8 && tc === 7);
  if (!isDeep && !isFlankTurn) return null;

  return fact(
    before,
    move,
    "totBienDaiNao",
    "Tốt biên đại náo: Thúc Tốt biên thọc sâu qua sông tập kích bất ngờ vào cánh biên đối phương, xé rách tuyến phòng thủ và mở đường cho đại quân đột kích.",
    "Tốt biên đại náo",
  );
}


// ============================================================================
// 33. SỰ KẾT HỢP BÁ ĐẠO CỦA SONG XE (Triệu Hâm Hâm Bài 25)
// ============================================================================

/**
 * Sự kết hợp bá đạo của Song Xe (Triệu Hâm Hâm Bài 25):
 * Hai Xe phối hợp thâm nhập sâu vào trận địa đối phương hoặc hiệp đồng tác chiến
 * trên cùng tuyến hỏa lực, tạo sức ép hủy diệt đối phương.
 */
export function detectSongXePhoiHop(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "r") return null;

  const rooks: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover && typeOf(p) === "r") {
      rooks.push(i);
    }
  }
  if (rooks.length < 2) return null;

  const [r1, r2] = rooks;
  const row1 = rowOf(r1);
  const row2 = rowOf(r2);
  const col1 = colOf(r1);
  const col2 = colOf(r2);

  // Cả hai Xe cùng qua sông trên phần sân đối phương
  const bothCrossed = crossedRiver(row1, mover) && crossedRiver(row2, mover);

  // Hoặc hai Xe xếp thành thế Song Xe trùng tuyến (cùng cột hoặc cùng hàng áp đáy/đỉnh cung)
  const isDoubled = (col1 === col2 && (crossedRiver(row1, mover) || crossedRiver(row2, mover))) ||
                    (row1 === row2 && crossedRiver(row1, mover));

  if (!bothCrossed && !isDoubled) return null;

  // Kiểm tra thế cờ trước đó chưa có sự phối hợp này
  const beforeRooks: number[] = [];
  for (let i = 0; i < before.length; i++) {
    const p = before[i];
    if (p && sideOf(p) === mover && typeOf(p) === "r") {
      beforeRooks.push(i);
    }
  }
  if (beforeRooks.length === 2) {
    const [br1, br2] = beforeRooks;
    const bBothCrossed = crossedRiver(rowOf(br1), mover) && crossedRiver(rowOf(br2), mover);
    const bIsDoubled = (colOf(br1) === colOf(br2) && (crossedRiver(rowOf(br1), mover) || crossedRiver(rowOf(br2), mover))) ||
                       (rowOf(br1) === rowOf(br2) && crossedRiver(rowOf(br1), mover));
    if (bBothCrossed && bIsDoubled) return null;
    if (bothCrossed && bBothCrossed && !isDoubled) return null;
  }

  // Tầng 2–4: phối hợp nghĩa là cả hai Xe cùng ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, [r1, r2].map((sq) => (sq === move.to ? move.from : sq)), 2);
  if (!r.ok) return null;
  return fact(
    before,
    move,
    "songXePhoiHop",
    `Song Xe phối hợp: hai Xe cùng ${isDoubled ? "trên một tuyến" : "qua sông"} (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Song Xe phối hợp",
  );
}

// ============================================================================
// 34. PHÁO GÁNH & ĐẠN TỬ PHÁO (Triệu Hâm Hâm Bài 26)
// ============================================================================

/**
 * Pháo gánh & Đạn tử pháo (Triệu Hâm Hâm Bài 26):
 * Hai Pháo cùng đứng trên một hàng ngang liên kết bảo vệ lẫn nhau (thường qua Tượng trung tâm),
 * công thủ toàn diện và yểm trợ cho kỵ binh xung sát.
 */
export function detectPhaoGanh(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  const cannons: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover && typeOf(p) === "c") {
      cannons.push(i);
    }
  }
  if (cannons.length < 2) return null;

  let foundPhaoGanh = false;
  for (let i = 0; i < cannons.length; i++) {
    for (let j = i + 1; j < cannons.length; j++) {
      const c1 = cannons[i];
      const c2 = cannons[j];
      // Thế gánh phải do chính Pháo vừa đi tạo thành (Mã/Xe đi qua làm đổi ngòi không tính).
      if ((c1 === move.to || c2 === move.to) && rowOf(c1) === rowOf(c2) && !crossedRiver(rowOf(c1), mover)) {
        if (mutuallyDefend(after, c1, c2, mover)) {
          if (before[c1] && before[c2] && mutuallyDefend(before, c1, c2, mover)) {
            continue;
          }
          foundPhaoGanh = true;
          break;
        }
      }
    }
    if (foundPhaoGanh) break;
  }
  if (!foundPhaoGanh) return null;

  return fact(
    before,
    move,
    "phaoGanh",
    "Pháo gánh (Đạn tử pháo): Thiết lập thế Pháo gánh công thủ toàn diện — hai Pháo liên kết che chắn bảo vệ lẫn nhau, phong tỏa các hướng nhảy Mã và yểm trợ kỵ binh xung sát.",
    "Pháo gánh",
  );
}

// ============================================================================
// 35. LIÊN HOÀN MÃ (Triệu Hâm Hâm Bài 27)
// ============================================================================

/**
 * Liên hoàn Mã (Triệu Hâm Hâm Bài 27):
 * Hai Mã kết thành thế liên hoàn công thủ toàn diện, giữ căn lẫn nhau,
 * kiểm soát phạm vi cực lớn và hóa giải mọi âm mưu quấy rối của đối phương.
 */
export function detectLienHoanMa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "n") return null;

  const knights: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover && typeOf(p) === "n") {
      knights.push(i);
    }
  }
  if (knights.length < 2) return null;

  let foundLienHoanMa = false;
  for (let i = 0; i < knights.length; i++) {
    for (let j = i + 1; j < knights.length; j++) {
      const n1 = knights[i];
      const n2 = knights[j];
      if (mutuallyDefend(after, n1, n2, mover)) {
        if (before[n1] && before[n2] && mutuallyDefend(before, n1, n2, mover)) {
          continue;
        }
        foundLienHoanMa = true;
        break;
      }
    }
    if (foundLienHoanMa) break;
  }
  if (!foundLienHoanMa) return null;

  return fact(
    before,
    move,
    "lienHoanMa",
    "Liên hoàn Mã: Hai Mã kết thành thế liên hoàn công thủ toàn diện, giữ căn lẫn nhau, kiểm soát phạm vi cực lớn và hóa giải mọi âm mưu quấy rối của đối phương.",
    "Liên hoàn Mã",
  );
}

// ============================================================================
// 36. XE MÃ PHÁO - TỔ HỢP MẠNH NHẤT (Triệu Hâm Hâm Bài 28)
// ============================================================================

/**
 * Xe Mã Pháo - Tổ hợp mạnh nhất (Triệu Hâm Hâm Bài 28):
 * Bộ ba Xe Mã Pháo quy tụ một cánh (tam tử quy biên), dồn dập tung hỏa lực
 * tổng lực công phá trận hình đối phương.
 */
export function detectXeMaPhaoTamTu(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "r" && pt !== "n" && pt !== "c") return null;

  const rooks: number[] = [];
  const knights: number[] = [];
  const cannons: number[] = [];

  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover) {
      if (typeOf(p) === "r") rooks.push(i);
      else if (typeOf(p) === "n") knights.push(i);
      else if (typeOf(p) === "c") cannons.push(i);
    }
  }

  if (rooks.length === 0 || knights.length === 0 || cannons.length === 0) return null;

  const tc = colOf(move.to);
  const wing = tc <= 3 ? "L" : tc >= 5 ? "R" : null;
  if (!wing) return null;

  const inWing = (sq: number) => (wing === "L" ? colOf(sq) <= 3 : colOf(sq) >= 5);

  const rooksInWing = rooks.filter(inWing);
  const knightsInWing = knights.filter(inWing);
  const cannonsInWing = cannons.filter(inWing);

  if (rooksInWing.length === 0 || knightsInWing.length === 0 || cannonsInWing.length === 0) return null;

  // "Tam tử quy biên": cả Xe, Mã, Pháo đều đã qua sông ở cánh đó, không chỉ đứng cùng phía bàn cờ.
  const across = (arr: number[]) => arr.some((sq) => crossedRiver(rowOf(sq), mover));
  if (!across(rooksInWing) || !across(knightsInWing) || !across(cannonsInWing)) return null;

  const fc = colOf(move.from);
  const wasInWing = wing === "L" ? fc <= 3 : fc >= 5;
  if (wasInWing && !crossedRiver(rowOf(move.to), mover)) return null;

  // Tầng 2–4: ít nhất hai loại quân khác nhau trong bộ ba cùng ra tay trong biến dẫn tới sát / thắng quân
  const keys = [...rooksInWing, ...knightsInWing, ...cannonsInWing].map((sq) => (sq === move.to ? move.from : sq));
  const r = checkAttackLine(before, move, options, keys, 2);
  if (!r.ok || actedTypes(before, r.acted).size < 2) return null;
  return fact(
    before,
    move,
    "xeMaPhaoTamTu",
    `Xe Mã Pháo tam tử: Xe Mã Pháo cùng qua sông dồn về ${wingName(wing === "L" ? 0 : 8, mover)} (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Xe Mã Pháo tam tử",
  );
}

// ============================================================================
// 37. XE SONG MÃ THIÊN LA ĐỊA VÕNG (Triệu Hâm Hâm Bài 29)
// ============================================================================

/**
 * Xe Song Mã thiên la địa võng (Triệu Hâm Hâm Bài 29):
 * Bộ ba Xe Song Mã giăng thiên la địa võng, kiên nhẫn kiểm soát trận địa
 * rồi chớp thời cơ tung đòn sấm sét đoạt mạng đối thủ.
 */
export function detectXeSongMa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "r" && pt !== "n") return null;

  const rooks: number[] = [];
  const knights: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover) {
      if (typeOf(p) === "r") rooks.push(i);
      else if (typeOf(p) === "n") knights.push(i);
    }
  }
  if (rooks.length < 1 || knights.length < 2) return null;

  const tr = rowOf(move.to);
  if (!crossedRiver(tr, mover)) return null;

  const crossedKnights = knights.filter((sq) => crossedRiver(rowOf(sq), mover)).length;
  const crossedRooks = rooks.filter((sq) => crossedRiver(rowOf(sq), mover)).length;

  if (crossedKnights < 1 || crossedRooks < 1) return null;

  // Tầng 2–4: cả Xe lẫn Mã cùng ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, [...rooks, ...knights].map((sq) => (sq === move.to ? move.from : sq)), 2);
  const types = r.ok ? actedTypes(before, r.acted) : null;
  if (!r.ok || !types!.has("r") || !types!.has("n")) return null;
  return fact(
    before,
    move,
    "xeSongMa",
    `Xe Song Mã: Xe và hai Mã cùng tham chiến bên sân đối phương (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Xe Song Mã",
  );
}

// ============================================================================
// 38. XE SONG PHÁO HỎA LỰC MẠNH NHẤT (Triệu Hâm Hâm Bài 30)
// ============================================================================

/**
 * Xe Song Pháo hỏa lực mạnh nhất (Triệu Hâm Hâm Bài 30):
 * Phát huy hỏa lực tầm xa và sự linh hoạt tối đa của tổ hợp Xe Song Pháo,
 * quấy rối và dội bão lửa san bằng hàng ngũ đối phương.
 */
export function detectXeSongPhao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "r" && pt !== "c") return null;

  const rooks: number[] = [];
  const cannons: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover) {
      if (typeOf(p) === "r") rooks.push(i);
      else if (typeOf(p) === "c") cannons.push(i);
    }
  }
  if (rooks.length < 1 || cannons.length < 2) return null;

  const tr = rowOf(move.to);
  const tc = colOf(move.to);
  const wing = tc <= 3 ? "L" : tc >= 5 ? "R" : null;
  if (!wing) return null;

  const inWing = (sq: number) => (wing === "L" ? colOf(sq) <= 3 : colOf(sq) >= 5);
  const rooksInWing = rooks.filter(inWing);
  const cannonsInWing = cannons.filter(inWing);

  if (rooksInWing.length < 1 || cannonsInWing.length < 2) return null;

  // Ít nhất 1 quân trong tổ hợp Xe Song Pháo ở cánh này phải đã qua sông uy hiếp đối phương
  const activeCount = [...rooksInWing, ...cannonsInWing].filter((sq) => crossedRiver(rowOf(sq), mover)).length;
  if (activeCount < 1) return null;

  // Tầng 2–4: cả Xe lẫn Pháo cùng ra tay trong biến dẫn tới sát / thắng quân
  const r = checkAttackLine(before, move, options, [...rooksInWing, ...cannonsInWing].map((sq) => (sq === move.to ? move.from : sq)), 2);
  const types = r.ok ? actedTypes(before, r.acted) : null;
  if (!r.ok || !types!.has("r") || !types!.has("c")) return null;
  return fact(
    before,
    move,
    "xeSongPhao",
    `Xe Song Pháo: Xe và hai Pháo cùng ở ${wingName(wing === "L" ? 0 : 8, mover)} (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Xe Song Pháo",
  );
}


// ============================================================================
// 39. CHIẾN THUẬT VÂY MÃ - LÃNH CUNG MÃ / XE MÃ LÃNH CHIÊU (Triệu Hâm Hâm Bài 31)
// ============================================================================

/**
 * Xe Mã lãnh chiêu (Triệu Hâm Hâm Bài 31):
 * Xe Mã phối hợp chém Sĩ phá vỡ thế phòng ngự khi quân đối phương chưa kịp tiếp ứng,
 * lấy nhanh đánh chậm dứt điểm trận đấu.
 */
export function detectXeMaLanhChieu(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "r" && pt !== "n") return null;

  const captured = before[move.to];
  if (!captured || typeOf(captured) !== "a") return null;

  // Phe đi phải có cả Xe và Mã tham gia
  let hasRook = false;
  let hasKnight = false;
  for (const p of after) {
    if (p && sideOf(p) === mover) {
      if (typeOf(p) === "r") hasRook = true;
      if (typeOf(p) === "n") hasKnight = true;
    }
  }
  if (!hasRook || !hasKnight) return null;

  // Nước chém Sĩ phải tạo chiếu hoặc thế sát ép tướng đối phương
  if (!inCheck(after, opp) && attackPressure(after, opp) < 1) return null;

  // Tầng 2–4: chém Sĩ xong cả Xe lẫn Mã cùng ra tay trong biến dẫn tới sát / thắng quân
  const keys = pieces(before, mover, "rn");
  const r = checkAttackLine(before, move, options, keys, 2);
  const types = r.ok ? actedTypes(before, r.acted) : null;
  if (!r.ok || !types!.has("r") || !types!.has("n")) return null;
  return fact(
    before,
    move,
    "xeMaLanhChieu",
    `Xe Mã lãnh chiêu: ${nameOf(piece)} chém Sĩ (${moveNotation(before, move)}), Xe Mã cùng vào đánh trước khi đối phương kịp tiếp ứng; theo biến: ${r.summary}.`,
    "Xe Mã lãnh chiêu",
  );
}

// ============================================================================
// 40. KHÉO PHÁ SĨ TƯỢNG (Triệu Hâm Hâm Bài 32)
// ============================================================================

/**
 * Khéo phá Sĩ Tượng (Triệu Hâm Hâm Bài 32):
 * Vận dụng thủ đoạn tinh tế đoạt Sĩ Tượng đối phương mà không phải trả giá đắt,
 * xé rách lớp thị vệ bảo vệ hoàng đế.
 */
export function detectKheoPhaSiTuong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  const captured = before[move.to];
  if (!captured) return null;
  const ct = typeOf(captured);
  if (ct !== "a" && ct !== "b") return null;

  // Không phải là phế quân lớn (giá trị quân đi không lớn hơn quân ăn được, hoặc ăn không bị mất quân)
  const gain = exchangeGain(before, move.to, mover) ?? 0;
  if (gain < 0) return null;

  // Biến engine (zhao-outcome) xác nhận ăn mà không phải trả giá; có biến thì kể lại phần ăn qua ăn lại
  const line = engineLine(before, move, options);
  const blow = line ? decisiveBlow(line, 0) : null;
  const took = `${nameOf(piece)} ăn ${nameOf(captured)} (${moveNotation(before, move)}) mà không phải trả giá`;
  // Biến chỉ có đúng nước ăn này thì câu mở đầu đã đủ; có chuyện tiếp theo (ăn lại, đòn sau) mới kể
  const f = fact(
    before,
    move,
    "kheoPhaSiTuong",
    line && blow && blow.end > 0 ? `Khéo phá Sĩ Tượng: ${took}; theo biến: ${narrate(line, blow.end)} — ${blow.text}.` : `Khéo phá Sĩ Tượng: ${took}.`,
    "Khéo phá Sĩ Tượng",
  );
  if (line && blow && !f.line) f.line = `${narrate(line, blow.end)} — ${blow.text}`;
  return f;
}

// ============================================================================
// 41. PHẾ QUÂN PHÁ SĨ TƯỢNG (Triệu Hâm Hâm Bài 33)
// ============================================================================

/**
 * Phế quân phá Sĩ Tượng (Triệu Hâm Hâm Bài 33):
 * Quyết đoán phế quân chủ lực (Pháo hoặc Mã nổ Sĩ Tượng) xé toang hệ thống phòng ngự
 * để đại quân ập vào kết liễu.
 */
export function detectPheQuanPhaSiTuong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "c" && pt !== "n" && pt !== "r") return null;

  const captured = before[move.to];
  if (!captured) return null;
  const ct = typeOf(captured);
  if (ct !== "a" && ct !== "b") return null;

  // Phải là nước phế quân: giá trị quân ta lớn hơn quân phòng thủ ăn được
  if (valueOf(piece) <= valueOf(captured)) return null;

  // Tạo đòn chiếu hoặc sức ép tấn công mạnh
  if (!inCheck(after, opp) && attackPressure(after, opp) < 1) return null;

  // Phế thật hay không do biến engine quyết định (zhao-outcome: mất quân rồi được bù); quân nào bị bỏ thì để biến kể lại
  const line = engineLine(before, move, options);
  const blow = line ? decisiveBlow(line, 1) : null;
  const head = `Phế quân phá Sĩ Tượng: ${nameOf(piece)} ăn ${nameOf(captured)} (${moveNotation(before, move)}), chấp nhận mất quân để phá cung`;
  const end = line ? (blow ? blow.end : tally(line, Math.min(1, line.plies.length - 1)).upTo) : 0;
  const result = line ? (blow ? blow.text : tally(line, end).text) : "";
  return fact(
    before,
    move,
    "pheQuanPhaSiTuong",
    line ? `${head}; theo biến: ${narrate(line, end)} — ${result}.` : `${head}.`,
    "Phế quân phá Sĩ Tượng",
  );
}

// ============================================================================
// 42. VÂY XE / CÔ QUÂN THÂM NHẬP (Triệu Hâm Hâm Bài 34)
// ============================================================================

/**
 * Vây Xe / Cô quân thâm nhập (Triệu Hâm Hâm Bài 34):
 * Điều động quân giăng bẫy phong tỏa đường về của quân Xe cô lập,
 * biến quân mạnh nhất thành miếng mồi ngon.
 */
export function detectVayXe(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;
  // Nước chiếu thì quân đối phương "hết đường chạy" chỉ vì phải đỡ chiếu; nước ăn quân lớn thì mục đích là ăn quân — không phải vây
  if (isMajor(before[move.to]) || inCheck(after, opp)) return null;

  // Tìm Xe đối phương đang nằm trên phần sân ta hoặc bị ta tấn công
  let targetRook = -1;
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === opp && typeOf(p) === "r") {
      // Xe đối phương đã qua sông trên sân ta
      if (crossedRiver(rowOf(i), opp)) {
        if (attackersOf(after, i, mover).includes(move.to)) {
          targetRook = i;
          break;
        }
      }
    }
  }
  if (targetRook === -1) return null;

  // "Vây" nghĩa là Xe hết đường thoát: mọi nước của nó đều vào ô bị ta khống chế (dọa đơn thuần thì Xe chạy là xong).
  const escapes = legalMovesFrom({ board: after, turn: opp }, targetRook).filter(
    (m) => attackersOf(play(after, m), m.to, mover).length === 0,
  );
  if (escapes.length > 0) return null;

  // Biến engine phải bắt được chính con Xe bị vây
  const story = captureStory(before, move, options, targetRook);
  if (!story) return null;
  return fact(
    before,
    move,
    "vayXe",
    `Vây Xe: ${nameOf(piece)} (${moveNotation(before, move)}) chặn hết đường lui của Xe đối phương đã vào sâu; theo biến: ${story}.`,
    "Vây Xe đối phương",
  );
}

// ============================================================================
// 43. VÂY PHÁO / BẪY CÔ QUÂN (Triệu Hâm Hâm Bài 35)
// ============================================================================

/**
 * Vây Pháo / Bẫy cô quân (Triệu Hâm Hâm Bài 35):
 * Giăng lưới phục kích bắt gọn quân Pháo thâm nhập sâu khi đối phương mất ngòi
 * và mất đường thoái lui.
 */
export function detectVayPhao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;
  // Nước chiếu thì quân đối phương "hết đường chạy" chỉ vì phải đỡ chiếu; nước ăn quân lớn thì mục đích là ăn quân — không phải vây
  if (isMajor(before[move.to]) || inCheck(after, opp)) return null;

  // Nước đi tấn công Pháo đối phương đã qua sông trên sân nhà ta
  let targetCannon = -1;
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === opp && typeOf(p) === "c") {
      if (crossedRiver(rowOf(i), opp)) {
        if (attackersOf(after, i, mover).includes(move.to)) {
          targetCannon = i;
          break;
        }
      }
    }
  }
  if (targetCannon === -1) return null;

  // "Vây" nghĩa là Pháo hết đường thoát: mọi nước của nó đều vào ô bị ta khống chế.
  const escapes = legalMovesFrom({ board: after, turn: opp }, targetCannon).filter(
    (m) => attackersOf(play(after, m), m.to, mover).length === 0,
  );
  if (escapes.length > 0) return null;
  // Pháo có căn mà quân dọa đắt hơn Pháo thì ăn vào là lỗ — không phải bắt được Pháo.
  const attacker = after[move.to];
  if (attacker && attackersOf(after, targetCannon, opp).length > 0 && PIECE_VALUES[typeOf(attacker)] > PIECE_VALUES.c) return null;

  // Biến engine phải bắt được chính con Pháo bị vây
  const story = captureStory(before, move, options, targetCannon);
  if (!story) return null;
  return fact(
    before,
    move,
    "vayPhao",
    `Vây Pháo: ${nameOf(piece)} (${moveNotation(before, move)}) chặn hết đường lui của Pháo đối phương đã vào sâu; theo biến: ${story}.`,
    "Vây Pháo cô lập",
  );
}

// ============================================================================
// 44. MÃ PHÙNG BIÊN TẤT VONG (Triệu Hâm Hâm Bài 36)
// ============================================================================

/**
 * Mã phùng biên tất vong (Triệu Hâm Hâm Bài 36):
 * Dồn ép và bao vây Mã biên đối phương — tận dụng điểm yếu giảm sút tầm kiểm soát
 * để bức tử kỵ binh biên.
 */
export function detectMaPhungBienTatVong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;
  // Nước chiếu thì quân đối phương "hết đường chạy" chỉ vì phải đỡ chiếu; nước ăn quân lớn thì mục đích là ăn quân — không phải vây
  if (isMajor(before[move.to]) || inCheck(after, opp)) return null;

  // Nước đi tấn công Mã đối phương đang đứng ở cột biên (cột 0 hoặc 8)
  let targetKnight = -1;
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === opp && typeOf(p) === "n") {
      const c = colOf(i);
      if (c === 0 || c === 8) {
        if (attackersOf(after, i, mover).includes(move.to)) {
          targetKnight = i;
          break;
        }
      }
    }
  }
  if (targetKnight === -1) return null;

  // Biến engine phải bắt được chính con Mã biên này
  const story = captureStory(before, move, options, targetKnight);
  if (!story) return null;
  return fact(
    before,
    move,
    "maPhungBienTatVong",
    `Mã phùng biên tất vong: ${nameOf(piece)} (${moveNotation(before, move)}) dồn Mã biên của đối phương, Mã ở biên ít đường chạy; theo biến: ${story}.`,
    "Mã phùng biên tất vong",
  );
}


// ============================================================================
// 45. VÂY MÃ GIÁC - ĐÁNH ÉP HAI CÁNH (Triệu Hâm Hâm Bài 37)
// ============================================================================

/**
 * Vây Mã Giác - Đánh ép hai cánh (Triệu Hâm Hâm Bài 37):
 * Dồn ép và bao vây Quải Giác Mã đối phương, khai thác điểm yếu cánh trống trải
 * để đoạt ưu thế quyết định.
 */
export function detectVayMaGiac(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;
  // Nước chiếu thì quân đối phương "hết đường chạy" chỉ vì phải đỡ chiếu; nước ăn quân lớn thì mục đích là ăn quân — không phải vây
  if (isMajor(before[move.to]) || inCheck(after, opp)) return null;

  // Tìm Mã đối phương đang đứng ở góc cung (quải giác mã)
  // Đen: (0, 3), (0, 5), (2, 3), (2, 5)
  // Đỏ: (9, 3), (9, 5), (7, 3), (7, 5)
  const oppCornerSquares = opp === "b" ? [3, 5, 21, 23] : [84, 86, 66, 68];

  let targetKnight = -1;
  for (const sq of oppCornerSquares) {
    const p = after[sq];
    if (p && sideOf(p) === opp && typeOf(p) === "n") {
      // Mã giác này bị tấn công hoặc bị kiềm tỏa
      if (attackersOf(after, sq, mover).includes(move.to) || attackersOf(after, sq, mover).length > 0) {
        targetKnight = sq;
        break;
      }
    }
  }
  if (targetKnight === -1) return null;

  // Biến engine phải bắt được chính con Mã giác này
  const story = captureStory(before, move, options, targetKnight);
  if (!story) return null;
  return fact(
    before,
    move,
    "vayMaGiac",
    `Vây Mã giác: ${nameOf(piece)} (${moveNotation(before, move)}) dồn Mã đối phương đứng góc cung; theo biến: ${story}.`,
    "Vây Mã Giác",
  );
}

// ============================================================================
// 46. VŨ KHÍ TẦM NGẮN THẮNG TẦM XA - XE SONG MÃ (Triệu Hâm Hâm Bài 38)
// ============================================================================

/**
 * Vũ khí tầm ngắn thắng tầm xa (Triệu Hâm Hâm Bài 38):
 * Xe Song Mã phát huy uy lực cận chiến, kiên nhẫn kiểm soát các điểm then chốt
 * và bóp nghẹt Pháo tầm xa đối phương.
 */
export function detectTamNganThangTamXa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "n" && pt !== "r") return null;

  let moverKnights = 0;
  let moverCannons = 0;
  let moverRooks = 0;
  let oppKnights = 0;
  let oppCannons = 0;
  let oppRooks = 0;

  for (const p of after) {
    if (!p) continue;
    if (sideOf(p) === mover) {
      if (typeOf(p) === "n") moverKnights++;
      else if (typeOf(p) === "c") moverCannons++;
      else if (typeOf(p) === "r") moverRooks++;
    } else {
      if (typeOf(p) === "n") oppKnights++;
      else if (typeOf(p) === "c") oppCannons++;
      else if (typeOf(p) === "r") oppRooks++;
    }
  }

  // Cấu hình kinh điển: Phe ta Xe Song Mã (không còn Pháo), đối phương Xe Song Pháo (không còn Mã)
  if (moverKnights < 2 || moverRooks < 1 || moverCannons > 0) return null;
  if (oppCannons < 2 || oppRooks < 1 || oppKnights > 0) return null;

  // Nước đi tạo đòn tấn công áp chế hoặc bắt quân
  if (!inCheck(after, opp) && attackPressure(after, opp) < 1 && !before[move.to]) return null;

  return fact(
    before,
    move,
    "tamNganThangTamXa",
    "Vũ khí tầm ngắn thắng tầm xa: Xe Song Mã phát huy uy lực cận chiến, kiên nhẫn kiểm soát các điểm then chốt và bóp nghẹt Pháo tầm xa đối phương.",
    "Vũ khí tầm ngắn thắng tầm xa",
  );
}

// ============================================================================
// 47. VŨ KHÍ TẦM XA THẮNG TẦM NGẮN - XE SONG PHÁO (Triệu Hâm Hâm Bài 39)
// ============================================================================

/**
 * Vũ khí tầm xa thắng tầm ngắn (Triệu Hâm Hâm Bài 39):
 * Xe Song Pháo phát huy ưu thế hỏa lực tầm xa và độ cơ động cao,
 * liên tục dội bom từ xa áp đảo Song Mã đối phương.
 */
export function detectTamXaThangTamNgan(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const pt = typeOf(piece);
  if (pt !== "c" && pt !== "r") return null;

  let moverKnights = 0;
  let moverCannons = 0;
  let moverRooks = 0;
  let oppKnights = 0;
  let oppCannons = 0;
  let oppRooks = 0;

  for (const p of after) {
    if (!p) continue;
    if (sideOf(p) === mover) {
      if (typeOf(p) === "c") moverCannons++;
      else if (typeOf(p) === "n") moverKnights++;
      else if (typeOf(p) === "r") moverRooks++;
    } else {
      if (typeOf(p) === "n") oppKnights++;
      else if (typeOf(p) === "c") oppCannons++;
      else if (typeOf(p) === "r") oppRooks++;
    }
  }

  // Cấu hình kinh điển: Phe ta Xe Song Pháo (không còn Mã), đối phương Xe Song Mã (không còn Pháo)
  if (moverCannons < 2 || moverRooks < 1 || moverKnights > 0) return null;
  if (oppKnights < 2 || oppRooks < 1 || oppCannons > 0) return null;

  // Nước đi tạo đòn tấn công áp chế hoặc bắt quân
  if (!inCheck(after, opp) && attackPressure(after, opp) < 1 && !before[move.to]) return null;

  return fact(
    before,
    move,
    "tamXaThangTamNgan",
    "Vũ khí tầm xa thắng tầm ngắn: Xe Song Pháo phát huy ưu thế hỏa lực tầm xa và độ cơ động cao, liên tục dội bom từ xa áp đảo Song Mã đối phương.",
    "Vũ khí tầm xa thắng tầm ngắn",
  );
}

// ============================================================================
// 48. MỘT XE ĐỔI HAI (Triệu Hâm Hâm Bài 40)
// ============================================================================

/**
 * Một Xe đổi hai (Triệu Hâm Hâm Bài 40):
 * Thực hiện cuộc trao đổi chiến lược một Xe đổi hai quân nhẹ,
 * phát huy ưu thế đông quân và độ linh hoạt toàn diện.
 */
export function detectMotXeDoiHai(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  const captured = before[move.to];
  if (!captured) return null;

  // Trường hợp A: Quân nhẹ ta ăn Xe đối phương (hoặc Xe ta ăn quân nhẹ và bị phản hồi)
  const isMinorTakesRook = (typeOf(piece) === "n" || typeOf(piece) === "c") && typeOf(captured) === "r";
  const isRookTakesMinor = typeOf(piece) === "r" && (typeOf(captured) === "n" || typeOf(captured) === "c");

  if (!isMinorTakesRook && !isRookTakesMinor) return null;

  // Kiểm tra chênh lệch số lượng Xe giữa hai bên
  let moverRooks = 0;
  let oppRooks = 0;
  for (const p of after) {
    if (!p) continue;
    if (typeOf(p) === "r") {
      if (sideOf(p) === mover) moverRooks++;
      else oppRooks++;
    }
  }

  if (Math.abs(moverRooks - oppRooks) !== 1) return null;

  return fact(
    before,
    move,
    "motXeDoiHai",
    "Một Xe đổi hai: Thực hiện cuộc trao đổi chiến lược một Xe đổi hai quân nhẹ, phát huy ưu thế đông quân và độ linh hoạt toàn diện.",
    "Một Xe đổi hai",
  );
}

// ============================================================================
// 49. MỘT XE ĐỔI BA (Triệu Hâm Hâm Bài 41)
// ============================================================================

/**
 * Một Xe đổi ba (Triệu Hâm Hâm Bài 41):
 * Hy sinh một Xe đổi lấy ba quân đối phương,
 * tích lũy ưu thế vật chất áp đảo để nghiền nát đối thủ.
 */
export function detectMotXeDoiBa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  const captured = before[move.to];
  if (!captured) return null;

  // Một bên không còn Xe nhưng hơn hẳn về số lượng quân nhẹ (ít nhất 3 quân nhẹ hơn)
  let moverMinors = 0;
  let oppMinors = 0;
  let moverRooks = 0;
  let oppRooks = 0;

  for (const p of after) {
    if (!p) continue;
    const t = typeOf(p);
    if (t === "r") {
      if (sideOf(p) === mover) moverRooks++;
      else oppRooks++;
    } else if (t === "n" || t === "c") {
      if (sideOf(p) === mover) moverMinors++;
      else oppMinors++;
    }
  }

  // Tình huống 1 Xe đổi 3 quân nhẹ
  const isOneRookForThree = (moverRooks === 0 && oppRooks >= 1 && moverMinors - oppMinors >= 2) ||
                           (oppRooks === 0 && moverRooks >= 1 && oppMinors - moverMinors >= 2);

  if (!isOneRookForThree) return null;

  return fact(
    before,
    move,
    "motXeDoiBa",
    "Một Xe đổi ba: Hy sinh một Xe đổi lấy ba quân đối phương, tích lũy ưu thế vật chất áp đảo để nghiền nát đối thủ.",
    "Một Xe đổi ba",
  );
}

// ============================================================================
// 50. MÃ VẬN NHƯ LONG - KIM THƯƠNG BÀN MÃ (Triệu Hâm Hâm Bài 42)
// ============================================================================

/**
 * Mã vận như long (Triệu Hâm Hâm Bài 42):
 * Hồi mã kim thương nén chặt không gian, kiểm soát bát phương
 * và đột kích mở đường cho toàn quân thắng thế.
 */
export function detectMaVanNhuLong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "n") return null;

  const fr = rowOf(move.from);
  const tr = rowOf(move.to);

  // Hồi mã: Mã thoái lui về vị trí then chốt
  const isRetreat = mover === "r" ? tr > fr : tr < fr;
  if (!isRetreat) return null;

  // Tầm kiểm soát rộng sau khi thoái lui
  const mobility = pseudoMoves(after, move.to).length;
  if (mobility < 5) return null;

  return fact(
    before,
    move,
    "maVanNhuLong",
    "Mã vận như long: Hồi mã kim thương nén chặt không gian, kiểm soát bát phương và đột kích mở đường cho toàn quân thắng thế.",
    "Mã vận như long",
  );
}


// ============================================================================
// 51. NHẤT XE THẬP TỰ - TUNG HOÀNH NGANG DỌC (Triệu Hâm Hâm Bài 43)
// ============================================================================

/**
 * Nhất Xe thập tự (Triệu Hâm Hâm Bài 43):
 * Xe là người anh cả trong cờ tướng, kiểm soát cả lộ dọc lẫn tuyến ngang huyết mạch
 * (tuyến tuần hà, kỵ hà hoặc áp đáy) tạo thế thập tự tung hoành ngang dọc khống chế đối phương.
 */
export function detectNhatXeThapTu(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "r") return null;

  const toRow = rowOf(move.to);
  const toCol = colOf(move.to);

  // Tuyến ngang chiến lược: Tuần hà (row 5 với Đỏ, row 4 với Đen), Kỵ hà (row 4 với Đỏ, row 5 với Đen), Tuyến áp đáy (row 1 với Đỏ, row 8 với Đen)
  const isKeyRank = (mover === "r" && (toRow === 5 || toRow === 4 || toRow === 1)) ||
                    (mover === "b" && (toRow === 4 || toRow === 5 || toRow === 8));
  if (!isKeyRank) return null;

  // Lộ dọc huyết mạch: lộ 2, 4, 6, 8 hoặc trung lộ 5 (col 1, 3, 4, 5, 7)
  const isKeyCol = toCol === 1 || toCol === 3 || toCol === 4 || toCol === 5 || toCol === 7;
  if (!isKeyCol) return null;

  // Không gian kiểm soát thập tự: cả ngang lẫn dọc có độ cơ động >= 2 ô mỗi chiều
  let horizMoves = 0;
  let vertMoves = 0;
  for (const m of pseudoMoves(after, move.to)) {
    if (rowOf(m) === toRow) horizMoves++;
    if (colOf(m) === toCol) vertMoves++;
  }
  if (horizMoves < 2 || vertMoves < 2) return null;

  return fact(
    before,
    move,
    "nhatXeThapTu",
    "Nhất Xe thập tự: Xe thăng giáng chiếm lĩnh vị trí huyết mạch, kiểm soát cả lộ dọc lẫn tuyến ngang chiến lược tạo thế tung hoành ngang dọc khống chế toàn cục.",
    "Nhất Xe thập tự",
  );
}

// ============================================================================
// 52. 5 NGUYÊN TẮC NGHỆ THUẬT VẬN PHÁO (Triệu Hâm Hâm Bài 44)
// ============================================================================

/**
 * 5 nguyên tắc vàng nghệ thuật vận Pháo (Triệu Hâm Hâm Bài 44):
 * Pháo cần ngòi để bắn phá, kiểm soát tuyến đường viễn trình,
 * cung cấp hỏa lực bảo đảm từ trận địa nhà và phối hợp linh hoạt.
 */
export function detectNgheThuatVanPhao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "c") return null;

  const toRow = rowOf(move.to);
  const toCol = colOf(move.to);

  const fr = rowOf(move.from);
  const fc = colOf(move.from);

  // Vị trí chiến lược đích đến:
  // 1. Sĩ giác Pháo: hàng 7 cols 1 hoặc 7 (Đỏ), hàng 2 cols 1 hoặc 7 (Đen)
  const isSiGiac = (toCol === 1 || toCol === 7) && ((mover === "r" && toRow === 7) || (mover === "b" && toRow === 2)) && (fc !== toCol || fr !== toRow);
  // 2. Tuần hà Pháo: hàng 5 (Đỏ), hàng 4 (Đen)
  const isTuanHa = ((mover === "r" && toRow === 5) || (mover === "b" && toRow === 4)) && fr !== toRow;
  // 3. Pháo biên viễn trình: col 0 hoặc col 8
  const isPhaoBien = (toCol === 0 || toCol === 8) && fc !== toCol;

  if (!isSiGiac && !isTuanHa && !isPhaoBien) return null;

  // Pháo tại vị trí mới có ít nhất 1 mục tiêu đe dọa hoặc tạo thế công qua ngòi
  let threatens = false;
  for (const m of pseudoMoves(after, move.to)) {
    if (after[m] && sideOf(after[m]!) === opp) {
      threatens = true;
      break;
    }
  }
  if (!threatens && !isSiGiac) return null;

  return fact(
    before,
    move,
    "ngheThuatVanPhao",
    "Nghệ thuật vận Pháo: Chiếm lĩnh vị trí chiến lược (sĩ giác, tuần hà hoặc biên lộ), cung cấp bảo đảm hỏa lực viễn trình và kiềm chế từ xa vững chắc.",
    "Nghệ thuật vận Pháo",
  );
}

// ============================================================================
// 53. TIỂU BINH LẬP ĐẠI CÔNG - 5 NGUYÊN TẮC DÙNG TỐT (Triệu Hâm Hâm Bài 45)
// ============================================================================

/**
 * Tiểu binh lập đại công (Triệu Hâm Hâm Bài 45):
 * Cao thủ giỏi dùng Tốt: Binh qua sông uy lực như nửa Xe.
 * Binh thọc sâu uy hiếp Mã, chốt chặn cửu cung hoặc đổi lấy quân phòng thủ Sĩ Tượng đối phương.
 */
export function detectTieuBinhLapDaiCong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "p") return null;

  const toRow = rowOf(move.to);
  if (!crossedRiver(toRow, mover)) return null;

  const dest = before[move.to];
  const capturedType = dest ? typeOf(dest) : null;
  const isValueCapture = !!(capturedType && "rncab".includes(capturedType));

  let threatensMajor = false;
  for (const m of pseudoMoves(after, move.to)) {
    const oppPiece = after[m];
    if (oppPiece && sideOf(oppPiece) === opp && "rncab".includes(typeOf(oppPiece))) {
      threatensMajor = true;
      break;
    }
  }

  const deepPawn = (mover === "r" && toRow <= 2) || (mover === "b" && toRow >= 7);

  if (!isValueCapture && !threatensMajor && !deepPawn) return null;

  return fact(
    before,
    move,
    "tieuBinhLapDaiCong",
    "Tiểu binh lập đại công: Binh qua sông uy dũng như nửa Xe, thọc sâu uy hiếp trọng yếu hoặc đổi lấy quân lực đối phương.",
    "Tiểu binh lập đại công",
  );
}

// ============================================================================
// 54. PHẾ TỐT PHẢN CÔNG - TRANH ĐOẠT QUYỀN CHỦ ĐỘNG (Triệu Hâm Hâm Bài 46)
// ============================================================================

/**
 * Phế Tốt phản công (Triệu Hâm Hâm Bài 46):
 * Chủ động phế bỏ tiểu tốt để tranh đoạt nước tiên, mở thông lộ xuất quân cho Xe Mã Pháo
 * và tập trung hỏa lực chuyển bại thành thắng phản kích sấm sét.
 */
export function detectPheTotPhanCong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  if (typeOf(piece) !== "p") return null;

  const oppAttackers = attackersOf(after, move.to, opp);
  if (oppAttackers.length === 0) return null;
  // Tốt đối phương ăn lại được thì chỉ là đổi Tốt (khai cuộc thường lệ), chưa phải phế Tốt mở đường.
  if (oppAttackers.some((sq) => typeOf(after[sq]!) === "p")) return null;

  const moverDefenders = attackersOf(after, move.to, mover);
  if (moverDefenders.length >= oppAttackers.length && before[move.to]) return null;

  const col = colOf(move.from);
  let opensMajor = false;
  for (const pSq of pieces(after, mover, "rnc")) {
    if (colOf(pSq) === col) {
      opensMajor = true;
      break;
    }
  }

  if (!opensMajor && !inCheck(after, opp)) return null;

  return fact(
    before,
    move,
    "pheTotPhanCong",
    "Phế Tốt phản công: Quyết đoán phế bỏ tiểu tốt để khai thông lộ quân, tranh tiên đoạt thế phát động phản kích sấm sét.",
    "Phế Tốt phản công",
  );
}

// ============================================================================
// 55. CHIẾN THUẬT MƯU BINH - BINH BẤT HUYẾT NHẪN (Triệu Hâm Hâm Bài 47)
// ============================================================================

/**
 * Chiến thuật mưu Binh (Triệu Hâm Hâm Bài 47):
 * Hàn Tín điểm binh - càng nhiều càng tốt: Ăn Tốt đối phương một cách sạch sẽ,
 * không tốn phí binh lực (binh bất huyết nhẫn), tích lũy ưu thế vật chất chuẩn bị chuyển hóa tàn cuộc tất thắng.
 */
export function detectChienThuatMuuBinh(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const target = before[move.to];
  if (!target || typeOf(target) !== "p" || sideOf(target) !== opp) return null;

  if (colOf(move.to) === 4) return null;

  // "Binh bất huyết nhẫn": ăn sạch — quân ăn không bị bắt lại, và là Tốt vỏ bọc chưa qua sông của đối phương.
  if (attackersOf(after, move.to, opp).length > 0) return null;
  if (crossedRiver(rowOf(move.to), opp)) return null;

  const moverPawns = pieces(after, mover, "p").length;
  const oppPawns = pieces(after, opp, "p").length;
  if (moverPawns < oppPawns) return null;

  return fact(
    before,
    move,
    "chienThuatMuuBinh",
    `Mưu Binh: ${nameOf(piece)} ăn Tốt (${moveNotation(before, move)}) mà không bị bắt lại — binh bất huyết nhẫn, thêm một Tốt là tích lũy ưu thế vật chất cho tàn cuộc.`,
    "Chiến thuật mưu Binh",
  );
}

// ============================================================================
// 56. CỤC BỘ DĨ ĐA KÍCH THIỂU - LẤY NHIỀU ĐÁNH ÍT (Triệu Hâm Hâm Bài 48)
// ============================================================================

/**
 * Cục bộ dĩ đa kích thiểu (Triệu Hâm Hâm Bài 48):
 * Tổng kết 48 kỳ lý trung cuộc: Mưu tử là bố trí quân lực đúng đắn ở vị trí chính xác.
 * Thế công cốt lõi là tập trung ưu thế binh lực áp đảo tại cục bộ then chốt (dĩ đa kích thiểu) để kết liễu trận đấu.
 */
export function detectCucBoDiDaKichThieu(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const toCol = colOf(move.to);

  type Zone = "left" | "right" | "palace";
  const zones: Zone[] = [];
  if (toCol <= 3) zones.push("left");
  if (toCol >= 5) zones.push("right");
  if (toCol >= 3 && toCol <= 5) zones.push("palace");

  let maxAdvantage = 0;
  for (const zone of zones) {
    let moverCount = 0;
    let oppCount = 0;
    for (const pSq of pieces(after, mover, "rnc")) {
      const c = colOf(pSq);
      if (zone === "left" && c <= 3) moverCount++;
      else if (zone === "right" && c >= 5) moverCount++;
      else if (zone === "palace" && c >= 3 && c <= 5) moverCount++;
    }
    for (const pSq of pieces(after, opp, "rnc")) {
      const c = colOf(pSq);
      if (zone === "left" && c <= 3) oppCount++;
      else if (zone === "right" && c >= 5) oppCount++;
      else if (zone === "palace" && c >= 3 && c <= 5) oppCount++;
    }
    if (moverCount >= 3 && oppCount <= 1) {
      maxAdvantage = Math.max(maxAdvantage, moverCount - oppCount);
    }
  }

  if (maxAdvantage < 2) return null;

  if (!inCheck(after, opp) && attackPressure(after, opp) < 1 && !before[move.to]) return null;

  return fact(
    before,
    move,
    "cucBoDiDaKichThieu",
    "Cục bộ lấy nhiều đánh ít: Tập trung ưu thế binh lực áp đảo tại khu vực then chốt, lấy nhiều đánh ít theo đúng nguyên tắc cốt lõi của 48 kỳ lý trung cuộc.",
    "Cục bộ lấy nhiều đánh ít",
  );
}

// ============================================================================
// TỔNG HỢP
// ============================================================================

/** Thứ tự ưu tiên khi một nước khớp nhiều nguyên lý. */
const PRIORITY: Detector[] = [
  detectSmotheredCannonMate,
  detectOaTamKnight,
  detectPoisonedCapture,
  detectInitiativeOverMaterial,
  detectMatingRace,
  detectKhongTamPhao,
  detectThienDiaPhao,
  detectNgoaTaoKnight,
  detectDeepCannonBottom,
  detectPhaoDayKhoaXe,
  detectManhCongTuyenApDay,
  detectOanhTacLoSuon,
  detectKhuyetSiSongXe,
  detectNhatMaHoanLuongTuong,
  detectDoatTrungBinh,
  detectMayUiTrungLo,
  detectDecoy,
  detectSacrificeForInitiative,
  detectPalaceBreaker,
  detectCannonMount,
  detectInterference,
  detectCounterThreat,
  detectTempoExchange,
  detectTempoChase,
  detectSongXePhoiHop,
  detectXeMaPhaoTamTu,
  detectXeSongPhao,
  detectXeSongMa,
  detectLienHoanMa,
  detectPheQuanPhaSiTuong,
  detectXeMaLanhChieu,
  detectVayXe,
  detectVayPhao,
  detectMaPhungBienTatVong,
  detectKheoPhaSiTuong,
  detectMotXeDoiBa,
  detectMotXeDoiHai,
  detectVayMaGiac,
  detectMaVanNhuLong,
  detectTamNganThangTamXa,
  detectTamXaThangTamNgan,
  detectCucBoDiDaKichThieu,
  detectNhatXeThapTu,
  detectNgheThuatVanPhao,
  detectTieuBinhLapDaiCong,
  detectPheTotPhanCong,
  detectChienThuatMuuBinh,
  detectPhaoGanh,
  detectTotBienDaiNao,
  detectChiemTuyenTot,
  detectTranhDoatLo3Lo7,
  detectKhongCheKyHa,
  detectPhongToaLoXe,
  detectKiemCheDinhCung,
  detectVoSuTienTotBien,
  detectFlankSwitch,
  detectProphylaxis,
  detectWorstPieceImprovement,
  detectFlankOverload,
  detectEndgameConversion,
];

const PER_MOVE_EXCLUDED = new Set(
  Object.values(ZHAO_LESSONS).filter((c) => c.kind === "summary" && c.tacticId).map((c) => c.tacticId as string),
);

/**
 * Mọi nguyên lý góc nhìn Triệu Hâm Hâm khớp với nước đi, theo thứ tự ưu tiên.
 * Có lời phê bình (nước vi phạm nguyên lý) thì chỉ trả về phê bình — không vừa chê vừa khen một nước.
 */
export function detectAllZhaoTactics(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact[] {
  const out: ZhaoMiddlegameFact[] = [];
  for (const detect of PRIORITY) {
    const f = detect(before, move, after, options);
    // Bài tổng kết không gắn vào từng nước — gắn vào đâu cũng "đúng" nên thành nhiễu.
    if (f && PER_MOVE_EXCLUDED.has(f.tactic)) continue;
    if (f && !out.some((x) => x.tactic === f.tactic)) {
      if (!f.lesson) {
        const card = Object.values(ZHAO_LESSONS).find((c) => c.tacticId === f.tactic);
        if (card) {
          f.lesson = card.lesson;
          f.lessonTitle = card.title;
          if (card.quotes.length > 0) {
            f.quote = card.quotes[0];
            const [m, s] = card.quotes[0].at.split(":").map((x) => parseInt(x, 10));
            const sec = (m || 0) * 60 + (s || 0);
            f.videoUrl = `https://youtu.be/${card.video}?t=${sec}`;
          }
        }
      }
      out.push(f);
    }
  }
  const critiques = out.filter((f) => f.tone === "critique");
  if (critiques.length > 0) return critiques;
  // Hai kỳ lý cùng kể một biến engine thì chỉ giữ kỳ lý đứng trước — lời bình không lặp lại cùng một đoạn kể
  const told = new Set<string>();
  return out.filter((f) => {
    if (!f.line) return true;
    if (told.has(f.line)) return false;
    told.add(f.line);
    return true;
  });
}
