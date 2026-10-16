// Nguyên lý trung cuộc bổ sung cho góc nhìn "Triệu Hâm Hâm" (lối đánh tranh tiên, công sát).
// Các nguyên lý là kỳ lý phổ biến của lối cờ tranh tiên, KHÔNG phải trích dẫn lời ông:
//  - Ninh thất nhất tử, bất thất nhất tiên / tham ăn mắc mồi / tranh nước đối công
//  - Đuổi quân được tiên / đổi quân giành tiên / dẫn dụ / chặn đường / giá Pháo
//  - Cải thiện quân kém nhất / thanh đông kích tây / phòng ngừa / biết dừng công chuyển tàn cuộc
// Mỗi hàm nhận (before, move, after, options) như các đòn trong middlegame.ts, thuần hàm, tất định, không gọi engine.
// Nguyên lý nào cần biến engine (PV) hay điểm số mà không có thì trả về null thay vì đoán.

import {
  type Board, type Move, type Piece, type Side,
  attackersOf, colOf, inCheck, initialPosition, isDefended, legalMoves, opponent, play,
  pseudoMoves, rowOf, sideOf, typeOf, crossedRiver, PIECE_VALUES,
} from "./engine";
import { exchangeGain, hangingPieces } from "./explain";
import { extractFeatures, type PieceTag } from "./features";
import { forcesWin } from "./mate";
import {
  analyzeForcingPlies, attackedSet, detectCounterThreat, detectFlankOverload, detectPalaceBreaker, detectSacrificeForInitiative,
  pvMaterialSwing, soundMove,
  type ZhaoMiddlegameFact, type ZhaoTactics, type ZhaoTacticsOptions,
} from "./middlegame";
import { moveNotation, PIECE_NAME } from "./notation";
import { advance, attackPressure } from "./strategy";

type Detector = (before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions) => ZhaoMiddlegameFact | null;

const nameOf = (p: Piece) => PIECE_NAME[typeOf(p)] ?? "quân";
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
  if (best && (best.from !== move.from || best.to !== move.to)) return null;
  const target = forcingTarget(before, move, after, mover);
  if (target === null) return null;
  // Miếng ăn có lời đang có sẵn mà không ăn
  let bait: number | null = null;
  let baitGain = 0;
  for (const m of legalMoves({ board: before, turn: mover })) {
    if (!before[m.to]) continue;
    const gain = exchangeGain(before, m.to, mover) ?? 0;
    if (gain >= 100 && gain > baitGain) {
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
  if (!forcesWin({ board: before, turn: opp }, 1)) return null;
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
  // Có PV thì xác nhận đối phương thật sự phải dùng nước đáp để lo quân bị đuổi.
  const reply = pvAfterMove(options, move)[0];
  if (reply) {
    const replyNext = play(after, reply);
    const handled = reply.from === target || (exchangeGain(replyNext, target, mover) ?? 0) <= 0;
    if (!handled || after[reply.to]) return null; // đối phương ăn quân / phản đòn thay vì lo chạy: không phải được tiên
  }
  const forward = advance(move.to, mover) > advance(move.from, mover);
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
  if (initialPosition().board[move.from] === piece) return null; // ra quân, không phải cải thiện
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
// TỔNG HỢP
// ============================================================================

/** Thứ tự ưu tiên khi một nước khớp nhiều nguyên lý. */
const PRIORITY: Detector[] = [
  detectPoisonedCapture,
  detectInitiativeOverMaterial,
  detectMatingRace,
  detectDecoy,
  detectSacrificeForInitiative,
  detectPalaceBreaker,
  detectCannonMount,
  detectInterference,
  detectCounterThreat,
  detectTempoExchange,
  detectTempoChase,
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
    if (f && !out.some((x) => x.tactic === f.tactic)) out.push(f);
  }
  const critiques = out.filter((f) => f.tone === "critique");
  return critiques.length > 0 ? critiques : out;
}
