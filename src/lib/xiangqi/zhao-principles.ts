import { ZHAO_LESSONS } from "./zhao48-lessons";
// Nguyên lý trung cuộc bổ sung cho góc nhìn "Triệu Hâm Hâm" (lối đánh tranh tiên, công sát).
// Các nguyên lý là kỳ lý phổ biến của lối cờ tranh tiên, KHÔNG phải trích dẫn lời ông:
//  - Ninh thất nhất tử, bất thất nhất tiên / tham ăn mắc mồi / tranh nước đối công
//  - Đuổi quân được tiên / đổi quân giành tiên / dẫn dụ / chặn đường / giá Pháo
//  - Cải thiện quân kém nhất / thanh đông kích tây / phòng ngừa / biết dừng công chuyển tàn cuộc
// Mỗi hàm nhận (before, move, after, options) như các đòn trong middlegame.ts, thuần hàm, tất định, không gọi engine.
// Nguyên lý nào cần biến engine (PV) hay điểm số mà không có thì trả về null thay vì đoán.

import {
  type Board, type Move, type Piece, type Side,
  attackersOf, colOf, findKing, hasAnyLegalMove, inCheck, initialPosition, isDefended, legalMoves, opponent, play,
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
import { advance, attackPressure } from "./strategy";

type Detector = (before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions) => ZhaoMiddlegameFact | null;

const nameOf = (p: Piece) => PIECE_NAME[typeOf(p)] ?? "quân";
/** Thế xuất phát, dùng để biết quân còn ở ô ban đầu (tạo một lần, không parse lại mỗi nước). */
const START_BOARD = initialPosition().board;
const valueOf = (p: Piece) => (typeOf(p) === "k" ? 0 : PIECE_VALUES[typeOf(p)]);
const isMajor = (p: Piece | null | undefined) => !!p && "rnc".includes(typeOf(p));

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
      return fact(
        before, move, "giaPhao",
        `Giá Pháo: ${nameOf(piece)} vừa đi làm ngòi cho Pháo ${isKing ? "chiếu Tướng" : `dọa ăn ${nameOf(victim)}`} — quân nhỏ mở đường cho hỏa lực lớn.`,
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
  if (activeTag) parts.push(`trừ khử quân hoạt động mạnh nhất của đối phương (${ACTIVE_TAGS[activeTag]})`);
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

  const checkNote = isChecking ? "chiếu tướng ép đối phương thất thế" : "khống chế cung tướng mở đòn sát";
  return fact(
    before,
    move,
    "ngoaTaoMa",
    `Mã Ngọa Tào: Mã chiếm lĩnh yếu huyệt hàng 2 lộ ${tc === 2 ? "7" : "3"}, ${checkNote} — thuật dùng Mã mạnh nhất trong trung cuộc theo Triệu Hâm Hâm.`,
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

/**
 * Pháo cắm sâu xuống tuyến đáy đối phương (hàng 0 đối với Đỏ, hàng 9 đối với Đen)
 * để kiềm tỏa Sĩ Tượng và rình rập đòn sát sau lưng phòng tuyến.
 */
export function detectDeepCannonBottom(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "c") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  const tr = rowOf(move.to);
  const isBottomRow = mover === "r" ? tr === 0 : tr === 9;
  if (!isBottomRow) return null;

  // Phải từ hàng trên cắm xuống đáy, không tính Pháo đã ở đáy di chuyển ngang
  const fr = rowOf(move.from);
  const wasBottomRow = mover === "r" ? fr === 0 : fr === 9;
  if (wasBottomRow) return null;

  const kingSq = findKing(after, opp);
  if (kingSq === -1) return null;

  return fact(
    before,
    move,
    "phaoTramDay",
    "Pháo trầm đáy: Pháo cắm sâu xuống tuyến đáy kiềm tỏa Sĩ Tượng và rình rập đòn sát sau lưng đối phương — thế công then chốt theo Triệu Hâm Hâm.",
    "Pháo trầm đáy"
  );
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

  return fact(
    before,
    move,
    "khuyetSiSongXe",
    "Khuyết Sĩ kỵ Song Xe: Tận dụng đối phương khuyết Sĩ, Song Xe liên thủ dâng cao áp sát cung Tướng tạo sức ép công thành nghẹt thở.",
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

  return fact(
    before,
    move,
    "doatTrungBinh",
    "Chiến thuật đoạt trung binh: Tiêu diệt Tốt giữa của đối phương — triệt hạ trái tim của hệ thống phòng ngự trung lộ, cô lập đôi Tượng và tích lũy ưu thế vật chất.",
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

  return fact(
    before,
    move,
    "khongTamPhao",
    "Không tâm pháo (Pháo trống): Chiếm lĩnh lộ giữa không có quân che chắn ngắm thẳng cung Tướng — thế công trực diện nguy hiểm bậc nhất trong cờ tướng.",
    "Không tâm pháo",
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
  detectNgoaTaoKnight,
  detectDeepCannonBottom,
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
  detectVoSuTienTotBien,
  detectFlankSwitch,
  detectProphylaxis,
  detectWorstPieceImprovement,
  detectFlankOverload,
  detectEndgameConversion,
];

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
  return critiques.length > 0 ? critiques : out;
}
