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
  pseudoMoves, rowOf, sideOf, sq, typeOf, crossedRiver, PIECE_VALUES,
} from "./engine";
import { exchangeGain, hangingPieces } from "./explain";
import { extractFeatures, type PieceTag } from "./features";
import {
  analyzeForcingPlies, attackedSet, detectCounterThreat, detectFlankOverload, detectPalaceBreaker, detectSacrificeForInitiative,
  pvMaterialSwing, soundMove,
  type ZhaoMiddlegameFact, type ZhaoTactics, type ZhaoTacticsOptions,
} from "./middlegame";
import { moveNotation, PIECE_NAME, SIDE_NAME } from "./notation";
import { decisiveBlow, engineLine, mateEnd, mateText, narrate, pieceRole, tally, type EngineLine } from "./engine-line";
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
  before: Board, move: Move, tactic: ZhaoTactics, summary: string, details: string, tone?: "critique" | "note",
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

/** Kết quả kiểm từng tầng của một kỳ lý: qua hết thì kèm cơ chế và lời bình; trượt thì ghi tầng trượt và lý do. */
export type PrincipleCheck =
  | { ok: true; mechanism: string; summary: string; /** Ô ban đầu của các quân làm nên hình đã ra tay trong biến. */ acted?: number[] }
  | { ok: false; layer: 1 | 2 | 3 | 4; reason: string };

/**
 * Kỳ lý vây bắt quân: biến engine phải bắt được đúng quân đối phương đứng ở ô `target` (theo danh tính, trong 10 nửa nước).
 * Trả về lời kể biến tới nước bắt (kể cả nước ăn lại ngay sau), null khi biến không bắt được chính con đó.
 */
export function captureStoryFromLine(line: EngineLine, target: number): string | null {
  const won = line.outcome.captures.find((c) => c.by === line.plies[0].side && c.origin === target && c.ply <= 10);
  if (!won) return null;
  const t = tally(line, won.ply);
  return `${narrate(line, t.upTo)} — ${t.text}`;
}

export function captureStory(before: Board, move: Move, options: ZhaoTacticsOptions | undefined, target: number): string | null {
  const line = engineLine(before, move, options);
  if (!line) return null;
  return captureStoryFromLine(line, target);
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
// 3. TRANH NƯỚC ĐỐI CÔNG (Binh Quý Thần Tốc - Triệu Hâm Hâm Bài 8)
// ============================================================================

/**
 * Binh quý thần tốc / Tranh nước đối công (Triệu Hâm Hâm Bài 8), kiểm 4 tầng:
 * 1. Hình: Đối phương đang dọa sát (hasMateInOne), bên đi không chống mà chiếu trước để giành nước.
 * 2. Mục đích: Nước đi không phải ăn quân lớn đơn thuần mà không tạo ra sát cục.
 * 3. Cơ chế: Biến engine phải cho thấy bên đi sát trước (moverMates), hoặc bẻ gãy đòn dọa sát của đối phương.
 * 4. Kết quả: Nước đi không hớ so với nước tốt nhất (soundMove), engine chấm bên đi thắng (+200 trở lên hoặc sát).
 */
export function checkMatingRace(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Đang bị chiếu thì bắt buộc phải đỡ chiếu, không thể gọi là chủ động tranh nước đối công
  if (inCheck(before, mover)) return null;

  // Tình huống phải có áp lực cung hoặc có đe dọa sát để là ứng viên tranh nước
  const threatenedMate = hasMateInOne(before, opp);
  const checks = inCheck(after, opp);

  if (!threatenedMate && attackPressure(before, mover) === 0 && !checks) {
    return null;
  }

  // Tầng 1: Hình
  // 1. Đối phương phải có đòn dọa sát
  if (!threatenedMate) {
    return {
      ok: false,
      layer: 1,
      reason: "Đối phương không có đòn dọa sát — không phải thế cờ tranh nước sinh tử",
    };
  }

  // 2. Nước đi phải là nước chiếu Tướng giành nước
  if (!checks) {
    return {
      ok: false,
      layer: 1,
      reason: "Bị dọa sát nhưng nước đi không chiếu Tướng giành nước",
    };
  }

  // Tầng 2: Mục đích
  const victim = before[move.to];
  const scoreForMover = options?.evalAfter ? -options.evalAfter.score : 0;
  const moverMates = scoreForMover >= MATE_THRESHOLD;

  if (victim && isMajor(victim) && !moverMates) {
    return {
      ok: false,
      layer: 2,
      reason: `Nước này ăn ${PIECE_NAME[typeOf(victim)]} — mục đích là ăn quân chứ không phải đòn tranh tiên đoạt sát`,
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  const mates = line.moverMates || line.outcome.kind === "mate";
  const settlesMaterial = line.outcome.materialSettled >= 300;

  if (!mates && !settlesMaterial) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine không cho thấy bên đi sát trước hoặc bẻ gãy đòn dọa sát của đối phương",
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (!mates && line.scoreForMover < 200) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chỉ chấm bên đi +${line.scoreForMover}`,
    };
  }

  let lineNarrative = "";
  if (mates) {
    lineNarrative = `${narrate(line, mateEnd(line))} — ${mateText(line)}`;
  } else {
    const blow = decisiveBlow(line);
    lineNarrative = blow
      ? `${narrate(line, blow.end)} — ${blow.text}`
      : `${narrate(line, Math.min(line.plies.length - 1, 4))} — hơn quân (+${Math.round(line.outcome.materialSettled / 100)}đ)`;
  }

  const summary = `Binh quý thần tốc: Đối phương đang dọa sát, nhưng ${nameOf(piece)} chiếu trước giành nước (${moveNotation(before, move)}); theo biến: ${lineNarrative}. "Trong thế đối công, nhanh hơn một nước là thắng".`;

  return { ok: true, mechanism: "chiếu trước giành nước", summary, acted: [move.from] };
}

/** Binh quý thần tốc (Tranh nước đối công): chỉ gắn khi qua cả bốn tầng của checkMatingRace. */
export function detectMatingRace(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkMatingRace(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "tranhNuoc", r.summary, "Chiếu trước giành nước");
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
// 6. CHẶN ĐƯỜNG (cắt liên lạc - Triệu Hâm Hâm Bài 6)
// ============================================================================

/**
 * Chặn đường (Rút Đao Chém Nước - Triệu Hâm Hâm Bài 6), kiểm 4 tầng:
 * 1. Hình: Quân chen vào tuyến giao liên (hàng/cột hoặc che chắn) cắt căn của quân đối phương,
 *    khiến quân đó mất căn và bị dọa ăn có lời (exchangeGain > 0).
 * 2. Mục đích: Nước chen không phải ăn quân; không phải chạy quân đang bị dọa bắt.
 * 3. Cơ chế: Biến engine phải bắt được đúng quân bị cắt căn (captureStory) trong 10 nửa nước,
 *    hoặc dẫn tới chiếu bí.
 * 4. Kết quả: Nước đi không hớ so với nước tốt nhất (soundMove), engine chấm bên đi có lợi thế vật chất hoặc chiếu bí.
 */
export function checkInterference(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const victim = before[move.to];
  if (victim) {
    return {
      ok: false,
      layer: 2,
      reason: `Nước này ăn ${PIECE_NAME[typeOf(victim)]} — mục đích là ăn quân chứ không phải chen vào cắt liên lạc`,
    };
  }

  const toR = rowOf(move.to);
  const toC = colOf(move.to);

  // Bàn cờ chỉ có quân rời ô cũ (chưa đặt xuống ô mới): để tách việc "chen vào" khỏi việc "rời ngòi".
  const vacated = before.slice();
  vacated[move.from] = null;

  // Kiểm tra ứng viên chặn đường:
  // 1. Chen vào giữa 2 quân đối phương trên cùng hàng hoặc cột
  // 2. Chen kề sát quân đối phương (chặn chân Mã / mắt Tượng)
  // 3. Làm mất căn của quân đối phương
  let candidateInterference = false;
  const oppPieces = pieces(before, opp, "krncabp");
  for (let a = 0; a < oppPieces.length; a++) {
    for (let b = a + 1; b < oppPieces.length; b++) {
      if (between(oppPieces[a], oppPieces[b], move.to)) {
        candidateInterference = true;
        break;
      }
    }
    if (candidateInterference) break;
  }

  if (!candidateInterference) {
    for (const sqOpp of oppPieces) {
      if (Math.abs(rowOf(sqOpp) - toR) <= 1 && Math.abs(colOf(sqOpp) - toC) <= 1) {
        if ("nb".includes(typeOf(before[sqOpp]!))) {
          candidateInterference = true;
          break;
        }
      }
    }
  }

  // Tìm các quân đối phương bị cắt căn do nước đi này
  const cutTargets: { sq: number; piece: Piece; gain: number }[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (!p || sideOf(p) !== opp || typeOf(p) === "k" || before[i] !== p) continue;
    const near = Math.abs(rowOf(i) - toR) <= 1 && Math.abs(colOf(i) - toC) <= 1;
    if (!near && rowOf(i) !== toR && colOf(i) !== toC) continue;

    const wasDefended = isDefended(before, i, opp) && isDefended(vacated, i, opp);
    const nowDefended = isDefended(after, i, opp);
    if (wasDefended && !nowDefended) {
      candidateInterference = true;
      const isAttacked = attackersOf(after, i, mover).length > 0;
      const gain = exchangeGain(after, i, mover) ?? 0;
      if (isAttacked && gain > 0) {
        cutTargets.push({ sq: i, piece: p, gain });
      }
    }
  }

  if (!candidateInterference) return null;

  // Tầng 2: Mục đích — không phải chạy quân đang bị dọa

  const threatened = (exchangeGain(before, move.from, opp) ?? 0) > 0;
  if (threatened) {
    return {
      ok: false,
      layer: 2,
      reason: `${PIECE_NAME[typeOf(piece)]} đang bị dọa ăn có lời — nước này chủ yếu là chạy quân`,
    };
  }

  // Tầng 1: Hình — phải có quân đối phương bị cắt căn và bị dọa ăn có lời
  if (cutTargets.length === 0) {
    return {
      ok: false,
      layer: 1,
      reason: "Chen vào tuyến nhưng quân đối phương không mất căn hoặc không bị dọa ăn có lời",
    };
  }

  cutTargets.sort((a, b) => valueOf(b.piece) - valueOf(a.piece));
  const target = cutTargets[0];

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  const moverMates = line.moverMates;
  const story = captureStoryFromLine(line, target.sq);

  if (!story && !moverMates) {
    return {
      ok: false,
      layer: 3,
      reason: `Biến không bắt được ${PIECE_NAME[typeOf(target.piece)]} bị cắt căn, cũng không dẫn tới chiếu bí`,
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  const materialGain = line.outcome.kind === "winsMaterial" || line.outcome.materialSettled >= 150;
  if (!moverMates && !materialGain && line.scoreForMover < 150) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine không cho thấy ưu thế vật chất (chỉ +${line.scoreForMover})`,
    };
  }

  const lineNarrative = story ?? `${narrate(line, mateEnd(line))} — ${mateText(line)}`;
  const summary = `Chặn đường: ${nameOf(piece)} chen vào cắt liên lạc (${moveNotation(before, move)}), ${nameOf(target.piece)} đối phương mất căn; theo biến: ${lineNarrative}.`;

  return { ok: true, mechanism: "cắt liên lạc đoạt quân", summary, acted: [move.from] };
}

/** Chặn đường: chỉ gắn khi qua cả bốn tầng của checkInterference. */
export function detectInterference(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkInterference(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "chanDuong", r.summary, "Chặn đường cắt căn");
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

/**
 * Kiểm 4 tầng cho Bài 5 (Hơn quân cần giản hóa / Chuyển hóa tàn cuộc):
 * 1. Hình: Đổi quân lớn (Xe, Pháo, Mã) ngang giá trị. Trước nước đi bên đi đang hơn vật chất (balance >= 100).
 * 2. Mục đích: Điểm trước nước đi ưu thế rõ rệt (evalBefore.score >= 100), chủ động đổi quân để giản hóa.
 * 3. Cơ chế: Biến engine chứng minh đối phương ăn lại đổi quân; sau khi đổi số quân chủ lực còn lại <= 6 (về tàn cuộc), không còn đòn ép cuồng bạo.
 * 4. Kết quả: Nước đi soundMove, điểm engine sau khi đổi vẫn giữ vững ưu thế (scoreForMover >= 50).
 */
export function checkEndgameConversion(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  const captured = before[move.to];
  if (!isMajor(piece) || !isMajor(captured) || sideOf(piece!) === sideOf(captured!)) return null;
  if (Math.abs(valueOf(piece!) - valueOf(captured!)) > 100) return null;

  const mover = sideOf(piece!);
  const balance = materialBalance(before, mover);

  // Tầng 1: Hình — trước nước đi phải đang hơn vật chất
  if (balance < 100) {
    return {
      ok: false,
      layer: 1,
      reason: `Bên đi không hơn vật chất trước nước đi (${balance} điểm) — không phải thế cờ hơn quân cần giản hóa`,
    };
  }

  // Tầng 2: Mục đích — điểm engine trước nước đi phải có ưu thế
  if (options?.evalBefore && options.evalBefore.score < 100) {
    return {
      ok: false,
      layer: 2,
      reason: `Điểm engine trước nước đi chưa đủ ưu thế (${options.evalBefore.score}) — không phải thời điểm giản hóa`,
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  const pv = pvAfterMove(options, move);
  const recapture = pv[0];
  if (!recapture || recapture.to !== move.to) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine không cho thấy đối phương ăn lại đổi quân",
    };
  }

  const b2 = play(after, recapture);
  if (analyzeForcingPlies(b2, mover, pv.slice(1)).forcingPlies > 0) {
    return {
      ok: false,
      layer: 3,
      reason: "Thế cờ vẫn còn đòn ép liên tục — đây vẫn là giai đoạn tấn công chứ chưa phải chuyển tàn",
    };
  }

  const majorsLeft = b2.filter((p) => isMajor(p)).length;
  if (majorsLeft > 6) {
    return {
      ok: false,
      layer: 3,
      reason: `Sau khi đổi quân vẫn còn ${majorsLeft} quân chủ lực — chưa chuyển hóa về tàn cuộc`,
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (line.scoreForMover < 50) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chấm điểm sau khi đổi không giữ được ưu thế (${line.scoreForMover})`,
    };
  }

  const endPly = Math.min(line.plies.length - 1, 2);
  const edge = balance >= 350 ? "hơn quân" : `hơn ${Math.round(balance / 100)} Tốt`;
  const summary = `Hơn quân cần giản hóa: đang ${edge}, chủ động đổi ${nameOf(piece!)} lấy ${nameOf(captured!)} (${moveNotation(before, move)}) để giản hóa cục diện; theo biến: ${narrate(line, endPly)} — ${tally(line, endPly).text}. Triệu Hâm Hâm: khi đang hơn quân, đổi quân giản hóa sẽ triệt tiêu ưu thế vị trí của đối phương và đưa ván cờ về thế tàn cuộc tất thắng.`;

  return { ok: true, mechanism: "chủ động đổi quân lớn giản hóa về tàn cuộc", summary, acted: [move.from] };
}

/** Chuyển hóa tàn cuộc: chỉ gắn khi qua cả bốn tầng của checkEndgameConversion. */
export function detectEndgameConversion(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkEndgameConversion(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "chuyenHoaTanCuoc", r.summary, "Chuyển hóa tàn cuộc");
}

// ============================================================================
// 13. MUỘN CUNG SÁT (Khuyết Tượng sợ Pháo - Triệu Hâm Hâm Bài 2)
// ============================================================================

/**
 * Muộn cung sát (Khuyết Tượng sợ Pháo - Triệu Hâm Hâm Bài 2), kiểm 4 tầng:
 * 1. Hình: Pháo di chuyển chiếu Tướng hoặc hướng vào cung đối phương (hàng đáy, trung lộ, lộ sườn).
 * 2. Mục đích: Pháo không phải tự ăn quân lớn (trừ khi dẫn tới chiếu bí), không phải chạy Pháo bị dọa.
 * 3. Cơ chế: Biến engine phải dẫn tới sát; nước chiếu bí do Pháo; ở thế cuối Tướng đối phương bị chính quân nhà chặn ô thoát.
 * 4. Kết quả: Nước đi không hớ so với nước tốt nhất.
 */
export function checkSmotheredCannonMate(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "c") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const oppKingBefore = findKing(before, opp);
  if (oppKingBefore === -1) return null;

  // Tầng 1: Hình — Pháo chiếu Tướng hoặc hướng vào cung đối phương
  const checks = inCheck(after, opp);
  const toR = rowOf(move.to);
  const toC = colOf(move.to);
  const enemyBottom = mover === "r" ? 0 : 9;
  const enemyPalaceRows = mover === "r" ? [0, 1, 2] : [7, 8, 9];
  const entersPalaceZone = enemyPalaceRows.includes(toR) || toR === enemyBottom || toC === 4 || toC === 3 || toC === 5;
  if (!checks && !entersPalaceZone) {
    return { ok: false, layer: 1, reason: "Pháo không chiếu Tướng và không hướng vào cung đối phương" };
  }

  // Tầng 3 (kiểm sớm dữ liệu engine để phục vụ tầng 2)
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  const immediateMate = checks && !hasAnyLegalMove({ board: after, turn: opp });
  const moverMates = line?.moverMates || immediateMate;

  // Tầng 2: Mục đích
  const victim = before[move.to];
  if (victim && isMajor(victim) && !moverMates) {
    return { ok: false, layer: 2, reason: `Nước này ăn ${PIECE_NAME[typeOf(victim)]} — mục đích là ăn quân` };
  }
  const threatened = (exchangeGain(before, move.from, opp) ?? 0) > 0;
  if (threatened && !moverMates) {
    return { ok: false, layer: 2, reason: "Pháo đang bị dọa ăn có lời — nước này chủ yếu là chạy Pháo" };
  }

  // Tầng 3: Cơ chế
  if (!moverMates) {
    return { ok: false, layer: 3, reason: "Biến không dẫn tới chiếu bí" };
  }

  // Xác định thế cờ chiếu bí và nước chiếu bí
  let mateBoard = after;
  let matePlyIsCannon = false;

  if (immediateMate) {
    mateBoard = after;
    const kingSq = findKing(after, opp);
    const checkers = kingSq >= 0 ? attackersOf(after, kingSq, mover) : [];
    matePlyIsCannon = checkers.includes(move.to);
  } else if (line) {
    const end = mateEnd(line);
    let board = before;
    let cannonPos = move.from;
    for (const [ply, p] of line.plies.entries()) {
      if (p.move.from === cannonPos) {
        cannonPos = p.move.to;
      }
      board = play(board, p.move);
      if (ply <= end && p.side === mover && p.check) {
        mateBoard = board;
        const kingSq = findKing(board, opp);
        const checkers = kingSq >= 0 ? attackersOf(board, kingSq, mover) : [];
        matePlyIsCannon = checkers.includes(cannonPos);
      }
    }
  }

  if (!matePlyIsCannon) {
    return { ok: false, layer: 3, reason: "Biến chiếu bí bằng quân khác, không phải đòn Muộn cung của Pháo" };
  }

  // Kiểm tra thế cờ có thật sự là thế chiếu bí không
  if (hasAnyLegalMove({ board: mateBoard, turn: opp })) {
    return { ok: false, layer: 3, reason: "Biến engine kết thúc khi đối phương vẫn còn nước chống đỡ, chưa phải thế bí thật" };
  }

  // Kiểm tra thế cuối: Tướng đối phương bị chính quân nhà chèn kẹt
  const oppKing = findKing(mateBoard, opp);
  if (oppKing === -1) return { ok: false, layer: 3, reason: "Không tìm thấy Tướng đối phương" };
  const kr = rowOf(oppKing);
  const kc = colOf(oppKing);
  const palaceMoves = [
    { r: kr - 1, c: kc },
    { r: kr + 1, c: kc },
    { r: kr, c: kc - 1 },
    { r: kr, c: kc + 1 },
  ].filter((p) => p.c >= 3 && p.c <= 5 && (opp === "b" ? p.r >= 0 && p.r <= 2 : p.r >= 7 && p.r <= 9));

  const blockedByOwn = palaceMoves.filter((p) => {
    const occupant = mateBoard[p.r * 9 + p.c];
    return occupant && sideOf(occupant) === opp;
  });

  const minBlocked = palaceMoves.length >= 3 ? 2 : 1;
  const isSmothered = blockedByOwn.length >= minBlocked || (palaceMoves.length > 0 && blockedByOwn.length === palaceMoves.length);
  if (!isSmothered || blockedByOwn.length === 0) {
    return { ok: false, layer: 3, reason: "Tướng đối phương không bị chính quân nhà chèn kẹt trong cung — không phải muộn cung sát" };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return { ok: false, layer: 4, reason: `Nước đi hớ ${options?.loss ?? "?"} điểm so với nước tốt nhất` };
  }

  const blockerTypes = blockedByOwn.map((p) => typeOf(mateBoard[p.r * 9 + p.c]!));
  blockerTypes.sort((a, b) => "abnrcp".indexOf(a) - "abnrcp".indexOf(b));
  const uniqueBlockers = [...new Set(blockerTypes)].map((t) => {
    const count = blockerTypes.filter((x) => x === t).length;
    return count > 1 ? `Song ${PIECE_NAME[t]}` : PIECE_NAME[t];
  });
  const blockerText = uniqueBlockers.join(", ");

  let summary = "";
  if (immediateMate || !line || line.mateIn === 0) {
    summary = `Muộn cung sát: Pháo chiếu tận dụng Tướng bị ${blockerText} chèn kẹt (${moveNotation(before, move)}) — chiếu bí ngay.`;
  } else {
    summary = `Muộn cung sát: Pháo tận dụng Tướng bị ${blockerText} chèn kẹt (${moveNotation(before, move)}); theo biến: ${narrate(line, mateEnd(line))} — ${mateText(line)}.`;
  }

  return { ok: true, mechanism: "muộn cung sát", summary, acted: [move.from] };
}

/** Muộn cung sát: chỉ gắn khi qua cả bốn tầng của checkSmotheredCannonMate. */
export function detectSmotheredCannonMate(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkSmotheredCannonMate(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "muonCungSat", r.summary, "Muộn cung sát");
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
 * Oa Tâm Mã (Mã Xấu Nhất - Triệu Hâm Hâm Bài 4), kiểm 4 tầng (lời phê bình):
 * 1. Hình: Mã nhảy vào hoa tim trung cung nhà mình (Đỏ ô 76 / hàng 8 cột 4; Đen ô 13 / hàng 1 cột 4).
 * 2. Mục đích: Phê bình khi Mã tự chèn kẹt cung; không phải nước ăn quân lớn đối phương xâm nhập hoa tim.
 * 3. Cơ chế: Biến engine cho thấy bên đi bị phạt (bị chiếu bí hoặc mất quân lớn), và Mã hoa tim là lý do
 *    (chặn ô thoát của Tướng, làm ngòi cho Pháo đối phương chiếu, hoặc chính Mã bị bắt chết).
 * 4. Kết quả: Nước đi là sai lầm rõ rệt (hớ từ 100 điểm trở lên so với nước tốt nhất, hoặc bị chiếu bí).
 */
export function checkOaTamKnight(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const tr = rowOf(move.to);
  const tc = colOf(move.to);

  // Vị trí hoa tim trung cung (Đỏ: hàng 8 cột 4, Đen: hàng 1 cột 4)
  const oaTamSq = mover === "r" ? sq(8, 4) : sq(1, 4);
  const palaceRows = mover === "r" ? [7, 8, 9] : [0, 1, 2];
  const entersPalace = palaceRows.includes(tr) && tc >= 3 && tc <= 5;

  // Tầng 1: Hình — Mã phải nhảy vào đúng ô hoa tim trung cung
  if (entersPalace && move.to !== oaTamSq) {
    return { ok: false, layer: 1, reason: "Mã vào cung nhưng không phải ô hoa tim trung cung" };
  }
  if (move.to !== oaTamSq) return null;

  // Tầng 2: Mục đích — không phải ăn quân lớn đối phương xâm nhập hoa tim
  const victim = before[move.to];
  if (victim && isMajor(victim)) {
    return { ok: false, layer: 2, reason: `Nước này ăn ${PIECE_NAME[typeOf(victim)]} — mục đích là ăn quân bảo vệ cung` };
  }

  // Tầng 3 (kiểm sớm dữ liệu engine)
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options, true);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  // Tầng 4: Kết quả (lời chê chỉ gắn khi nước đi là sai lầm rõ rệt)
  const loss = options.loss ?? 0;
  const opponentMates = line.scoreForMover <= -MATE_THRESHOLD;
  const losesMaterial = line.outcome.kind === "losesMaterial" || line.outcome.materialSettled <= -200;

  if (loss < 100 && !opponentMates && line.scoreForMover > -200) {
    return { ok: false, layer: 4, reason: `Nước đi không phải sai lầm (chỉ hớ ${loss} điểm so với nước tốt nhất)` };
  }

  // Tầng 3: Cơ chế
  // Bên đi phải bị phạt trong biến: hoặc bị chiếu bí, hoặc bị mất quân
  if (!opponentMates && !losesMaterial) {
    return { ok: false, layer: 3, reason: "Biến engine không cho thấy bên đi bị phạt: không bị sát, không mất quân" };
  }

  // Mã hoa tim là lý do:
  // 1. Tướng bên đi bị chiếu hoặc bị sát trong cung, và ô hoa tim cản đường thoát của Tướng
  const myKing = findKing(after, mover);
  const kingAdjacent = myKing !== -1 && (
    (rowOf(myKing) === rowOf(oaTamSq) && Math.abs(colOf(myKing) - colOf(oaTamSq)) === 1) ||
    (colOf(myKing) === colOf(oaTamSq) && Math.abs(rowOf(myKing) - rowOf(oaTamSq)) === 1)
  );

  const checksOnMover = line.plies.filter((p) => p.side === opp && p.check);
  const suffersCheck = checksOnMover.length > 0 || opponentMates;

  // 2. Đối phương dùng Pháo chiếu lấy đúng Mã hoa tim làm ngòi
  let cannonUsesKnightAsScreen = false;
  let boardSim = before;
  for (const p of line.plies) {
    boardSim = play(boardSim, p.move);
    if (p.side === opp && p.check && p.checkerTypes.includes("c")) {
      const kingSq = findKing(boardSim, mover);
      if (kingSq >= 0) {
        const cannonAttackers = attackersOf(boardSim, kingSq, opp).filter(
          (sq) => typeOf(boardSim[sq]!) === "c",
        );
        if (cannonAttackers.some((csq) => between(csq, kingSq, oaTamSq))) {
          cannonUsesKnightAsScreen = true;
          break;
        }
      }
    }
  }

  // 3. Chính con Mã hoa tim bị bắt trong biến
  const knightCaptured = line.outcome.captures.some((c) => c.origin === move.from && c.by === opp);

  const knightCausedHarm = (suffersCheck && kingAdjacent) || cannonUsesKnightAsScreen || knightCaptured;
  if (!knightCausedHarm) {
    return { ok: false, layer: 3, reason: "Biến thua không xuất phát từ việc Mã ở hoa tim: Tướng không bị cản, Mã không bị bắt" };
  }

  // Xác định điểm cuối đòn phạt để kể lại biến
  let endPly = Math.min(line.plies.length - 1, 6);
  let punishmentText = "";
  if (opponentMates) {
    punishmentText = "bị đối phương công sát chiếu bí";
  } else {
    const lostPieces = line.outcome.captures.filter((c) => c.by === opp && c.ply <= endPly);
    const lostNames = [...new Set(lostPieces.map((c) => PIECE_NAME[c.type]))].join(", ");
    punishmentText = lostNames.length > 0 ? `mất ${lostNames}` : "thế cờ rơi vào bế tắc nguy hiểm";
  }

  const reasonExplanation = knightCaptured
    ? "Mã nhập tâm trở thành mục tiêu bị vây bắt"
    : suffersCheck && kingAdjacent
    ? "Mã bịt kín đường thoát của Tướng"
    : "cung Tướng bị khóa chặt mất liên lạc";

  const summary = `Oa Tâm Mã: Mã thoái về hoa tim trung cung (${moveNotation(before, move)}) chèn kẹt Tướng và cản Song Sĩ (${reasonExplanation}); theo biến: ${narrate(line, endPly)} — ${punishmentText}. "Mã nhập oa tâm, bất tử dã thương".`;

  return { ok: true, mechanism: "Oa Tâm Mã tự chèn kẹt", summary, acted: [move.from] };
}

/** Oa Tâm Mã: chỉ gắn khi qua cả bốn tầng của checkOaTamKnight (lời phê bình). */
export function detectOaTamKnight(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkOaTamKnight(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "oaTamMa", r.summary, "Oa Tâm Mã", "critique");
}

// ============================================================================
// 16. PHÁO TRẦM ĐÁY (Nghệ Thuật Phá Trận & Kiềm Chế - Triệu Hâm Hâm Bài 13 & 14)
// ============================================================================

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
 * Máy ủi trung lộ (Triệu Hâm Hâm Bài 9), kiểm 4 tầng:
 * 1. Hình: có Pháo đầu (cột 4), thúc Tốt giữa tiến tới hàng tạo áp lực (hàng 5 với Đỏ / hàng 4 với Đen trở lên),
 *    và có Xe hoặc Mã đứng ở cột 3–5 — "Pháo đầu, Tốt giữa cùng Mã và Xe tạo thành mũi dùi trực diện".
 * 2–4. `checkAttackLine` với nhóm trung lộ (Tốt vừa đi, Pháo đầu, Xe/Mã cột 3–5): ít nhất 2 quân trong nhóm ra tay
 *    trước hoặc ở đòn quyết định — một quân đơn độc thì không phải máy ủi.
 */
export function checkMayUiTrungLo(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p" || colOf(move.from) !== 4) return null;
  const mover = sideOf(piece);
  const fr = rowOf(move.from);
  const tr = rowOf(move.to);
  if (!(mover === "r" ? tr < fr && tr <= 5 : tr > fr && tr >= 4)) return null;

  const cannons = pieces(before, mover, "c").filter((s) => colOf(s) === 4);
  if (cannons.length === 0) return { ok: false, layer: 1, reason: "Không có Pháo đầu yểm trợ" };
  const heavies = pieces(before, mover, "rn").filter((s) => colOf(s) >= 3 && colOf(s) <= 5);
  if (heavies.length === 0) return { ok: false, layer: 1, reason: "Không có Xe/Mã ở trung lộ phối hợp" };

  return checkAttackLine(before, move, options, [move.from, ...cannons, ...heavies], 2);
}

export function detectMayUiTrungLo(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkMayUiTrungLo(before, move, after, options);
  if (!r?.ok) return null;
  const names = [...actedTypes(before, r.acted)].map((t) => PIECE_NAME[t]).join(", ");
  return fact(
    before,
    move,
    "mayUiTrungLo",
    `Máy ủi trung lộ: có Pháo đầu, thúc Tốt giữa (${moveNotation(before, move)}), ${names} trung lộ cùng ra tay; theo biến: ${r.summary}.`,
    "Máy ủi trung lộ",
  );
}

// ============================================================================
// 20. NHẤT MÃ HOÁN LƯỠNG TƯỢNG (Triệu Hâm Hâm Bài 10)
// ============================================================================

/**
 * Nhất Mã hoán Lưỡng Tượng (Triệu Hâm Hâm Bài 10), kiểm 4 tầng:
 * 1. Hình: Mã nhảy qua sông ăn Tượng đối phương, và trước nước đi đối phương có đủ 2 Tượng.
 * 2. Mục đích: Chủ động phế Mã hoán Tượng, không phải chạy Mã đang bị dọa bắt.
 * 3. Cơ chế: Biến engine phải cho thấy chính con Mã này bị bắt (origin === move.from),
 *    và bên đi ăn đủ cả 2 Tượng trong biến (countCaptured >= 2).
 * 4. Kết quả: Nước đi không hớ so với nước tốt nhất (soundMove), engine không chấm bên đi thua thế.
 */
export function checkNhatMaHoanLuongTuong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n") return null;
  const target = before[move.to];
  if (!target || typeOf(target) !== "b") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (sideOf(target) !== opp) return null;

  // Mã phải nhảy sang đất đối phương ăn Tượng
  if (!crossedRiver(rowOf(move.to), mover)) return null;

  // Tầng 1: Hình — trước nước đi đối phương phải có đủ 2 Tượng
  const oppElephantsBefore = pieces(before, opp, "b").length;
  if (oppElephantsBefore < 2) {
    return {
      ok: false,
      layer: 1,
      reason: `Đối phương chỉ có ${oppElephantsBefore} Tượng trước nước đi — không phải thế cờ hoán Song Tượng`,
    };
  }

  // Tầng 2: Mục đích — không phải chạy Mã đang bị dọa bắt
  const threatened = (exchangeGain(before, move.from, opp) ?? 0) > 0;
  if (threatened) {
    return {
      ok: false,
      layer: 2,
      reason: "Mã đang bị dọa bắt — nước này là nhảy vớt vát ăn Tượng chứ không phải chủ động phế Mã hoán Tượng",
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  // 1. Đúng con Mã vừa đi phải bị mất trong biến
  const knightLost = line.outcome.captures.find(
    (c) => c.by === opp && c.type === "n" && c.origin === move.from,
  );
  if (!knightLost) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine không cho thấy chính con Mã này bị đổi (Mã không bị bắt)",
    };
  }

  // 2. Bên đi phải ăn đủ cả 2 Tượng trong biến
  const elephantsWon = line.outcome.captures.filter(
    (c) => c.by === mover && c.type === "b",
  );
  if (elephantsWon.length < 2) {
    return {
      ok: false,
      layer: 3,
      reason: `Biến engine chỉ ăn được ${elephantsWon.length}/2 Tượng — không đủ đòn hoán Song Tượng`,
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (line.scoreForMover < -150) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chấm bên đi bị lép (${line.scoreForMover}) — phế Mã không thành công`,
    };
  }

  const endPly = Math.max(knightLost.ply, ...elephantsWon.map((e) => e.ply));
  const summary = `Nhất Mã hoán Lưỡng Tượng: Mã ăn Tượng (${moveNotation(before, move)}) phế quân xé toạc đôi Tượng đối phương; theo biến: ${narrate(line, endPly)} — ${tally(line, endPly).text}. "Nhất Mã hoán Song Tượng, kỵ sĩ tất anh hùng".`;

  return { ok: true, mechanism: "phế Mã đoạt Song Tượng", summary, acted: [move.from] };
}

/** Nhất Mã hoán Lưỡng Tượng: chỉ gắn khi qua cả bốn tầng của checkNhatMaHoanLuongTuong. */
export function detectNhatMaHoanLuongTuong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkNhatMaHoanLuongTuong(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "nhatMaHoanLuongTuong", r.summary, "Nhất Mã hoán Lưỡng Tượng");
}

// ============================================================================
// 21. CHIẾN THUẬT ĐOẠT TRUNG BINH (Triệu Hâm Hâm Bài 11)
// ============================================================================

/**
 * Chiến thuật đoạt trung binh (Triệu Hâm Hâm Bài 11), kiểm 4 tầng:
 * 1. Hình: Dùng quân (Mã, Pháo, Xe, Tốt) ăn Tốt giữa (cột 4) của đối phương ở phần sân đối phương hoặc tuyến hà.
 * 2. Mục đích: Chủ động đoạt trung binh giành ưu thế trung lộ, không phải chạy quân đang bị dọa bắt.
 * 3. Cơ chế: Biến engine phải là ăn sạch (cleanCapture / winsMaterial), giữ được Tốt và không bị lỗ vật chất.
 * 4. Kết quả: Nước đi không hớ so với nước tốt nhất (soundMove), engine chấm bên đi ưu thế (score >= 50).
 */
export function checkDoatTrungBinh(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece) return null;
  const target = before[move.to];
  if (!target || typeOf(target) !== "p") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (sideOf(target) !== opp) return null;

  // Mục tiêu phải là Tốt giữa (cột 4) của đối phương
  if (colOf(move.to) !== 4) return null;

  const pt = typeOf(piece);
  if (!["n", "c", "r", "p"].includes(pt)) return null;

  // Vị trí tốt bị ăn nằm ở phần sân đối phương hoặc tuyến hà
  const tr = rowOf(move.to);
  const isInOppTerritory = mover === "r" ? tr <= 4 : tr >= 5;
  if (!isInOppTerritory) return null;

  // Tầng 2: Mục đích — không phải chạy quân đang bị dọa bắt
  const threatened = (exchangeGain(before, move.from, opp) ?? 0) > 0;
  if (threatened) {
    return {
      ok: false,
      layer: 2,
      reason: "Quân đang bị dọa bắt — nước này chủ yếu là chạy quân chứ không phải chủ động đoạt trung binh",
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  // Phải giữ được ưu thế vật chất (ăn sạch hoặc thắng quân), không bị đối phương ăn lại lỗ điểm
  const keepsPawn = line.outcome.kind === "cleanCapture" || line.outcome.kind === "winsMaterial" || line.outcome.materialSettled >= 100;
  if (!keepsPawn || line.outcome.materialSettled <= 0) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine đối phương ăn lại được quân — đoạt trung binh không giữ được vật chất",
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (line.scoreForMover < 50) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chỉ chấm bên đi +${line.scoreForMover} — chưa đủ ưu thế từ đoạt trung binh`,
    };
  }

  const endPly = Math.min(line.plies.length - 1, 4);
  const summary = `Đoạt trung binh: ${nameOf(piece)} ăn Tốt giữa (${moveNotation(before, move)}) — trung lộ đối phương mất Tốt chặn, Tượng giữa thiếu che; theo biến: ${narrate(line, endPly)} — ${tally(line, endPly).text}.`;

  return { ok: true, mechanism: "đoạt trung binh tích lũy ưu thế", summary, acted: [move.from] };
}

/** Chiến thuật đoạt trung binh: chỉ gắn khi qua cả bốn tầng của checkDoatTrungBinh. */
export function detectDoatTrungBinh(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkDoatTrungBinh(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "doatTrungBinh", r.summary, "Chiến thuật đoạt trung binh");
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
  const p = after[move.to] ?? before[move.from];
  if (!p) return null;
  const mover = sideOf(p);
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

/** Kỳ lý thế trận cần hình còn giữ qua biến: biến phải có ít nhất bấy nhiêu nửa nước sau nước đi. */
const HOLD_PLIES = 6;

/** Bàn cờ sau từng nửa nước của biến (phần tử i = thế sau nửa nước i, tính cả chính nước đi ở i = 0). */
function lineBoards(before: Board, line: EngineLine): Board[] {
  const out: Board[] = [];
  let board = before;
  for (const e of line.plies) out.push((board = play(board, e.move)));
  return out;
}

/** Ô của quân xuất phát từ ô `origin` sau nửa nước `upTo` của biến; -1 khi quân đã bị ăn. */
function squareInLine(line: EngineLine, origin: number, upTo: number): number {
  let at = origin;
  for (const e of line.plies.slice(0, upTo + 1)) {
    if (e.origin === origin) at = e.move.to;
    else if (e.move.to === at) return -1;
  }
  return at;
}

/** Số ô quân ở `from` đi tới được mà bên `enemy` không khống chế — không dùng nước hợp lệ vì đang bị chiếu thì quân nào cũng "kẹt". */
function safeMoves(board: Board, from: number, enemy: Side): number {
  return pseudoMoves(board, from).filter((t) => attackersOf(board, t, enemy).length === 0).length;
}

/**
 * Kiềm chế tuyến đỉnh cung (Triệu Hâm Hâm Bài 18), kiểm 4 tầng:
 * 1. Hình: Pháo hoặc Xe từ hàng khác vào hàng đỉnh cung đối phương (hàng 2 với Đỏ / hàng 7 với Đen), đối phương còn
 *    ít nhất 2 Mã/Pháo.
 * 2. Mục đích: không tự ăn quân lớn.
 * 3. Cơ chế — "đóng băng thế trận đối phương": số ô đi an toàn của Mã + Pháo đối phương giảm ít nhất 30% (và ít nhất 3 ô)
 *    ngay sau nước đi, quân khóa đứng trên hàng đỉnh cung suốt biến (ít nhất HOLD_PLIES nửa nước), và tới cuối biến
 *    đối phương vẫn chưa gỡ được (vẫn kém thế trước nước đi ít nhất 30%).
 * 4. Kết quả: không hớ, engine chấm bên đi từ +100.
 */
export function checkKiemCheDinhCung(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || !"cr".includes(typeOf(piece))) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const browRow = mover === "r" ? 2 : 7;
  if (rowOf(move.to) !== browRow || rowOf(move.from) === browRow) return null;
  if (pieces(after, opp, "nc").length < 2) return { ok: false, layer: 1, reason: "Đối phương không còn đủ Mã Pháo để kiềm chế" };

  const victim = before[move.to];
  if (victim && isMajor(victim)) return { ok: false, layer: 2, reason: `Nước này ăn ${nameOf(victim)} — mục đích là ăn quân` };
  const line = engineLine(before, move, options);
  if (!line || line.plies.length <= HOLD_PLIES) return { ok: false, layer: 3, reason: "Biến engine quá ngắn để thấy thế kiềm chế còn giữ" };

  const minorMoves = (board: Board) => pieces(board, opp, "nc").reduce((n, s) => n + safeMoves(board, s, mover), 0);
  const boards = lineBoards(before, line);
  const last = line.plies.length - 1;
  const [m0, m1, mEnd] = [minorMoves(before), minorMoves(after), minorMoves(boards[last])];
  if (m0 - m1 < 3 || m1 > 0.7 * m0) return { ok: false, layer: 3, reason: `Mã Pháo đối phương từ ${m0} còn ${m1} ô đi an toàn — chưa bị kiềm chế` };
  const at = squareInLine(line, move.from, last);
  if (at < 0 || rowOf(at) !== browRow) return { ok: false, layer: 3, reason: "Quân kiềm chế bị đuổi khỏi hàng đỉnh cung hoặc bị ăn trong biến" };
  if (mEnd > 0.7 * m0) return { ok: false, layer: 3, reason: `Tới cuối biến Mã Pháo đối phương đã gỡ lại ${mEnd}/${m0} ô đi` };
  if (!soundMove(options)) return { ok: false, layer: 4, reason: `Nước đi hớ ${options?.loss ?? "?"} điểm so với nước tốt nhất` };
  if (!line.moverMates && line.scoreForMover < 100) return { ok: false, layer: 4, reason: `Engine chỉ chấm bên đi +${line.scoreForMover}` };
  return {
    ok: true,
    mechanism: "kiềm chế Mã Pháo",
    summary: `Mã Pháo ${SIDE_NAME[opp]} từ ${m0} còn ${m1} ô đi an toàn, sau ${last} nửa nước vẫn chỉ ${mEnd}; ${nameOf(piece)} đứng vững trên hàng đỉnh cung`,
  };
}

export function detectKiemCheDinhCung(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkKiemCheDinhCung(before, move, after, options);
  if (!r?.ok) return null;
  return fact(
    before,
    move,
    "kiemCheDinhCung",
    `Kiềm chế tuyến đỉnh cung: ${nameOf(before[move.from]!)} vào hàng đỉnh cung (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Kiềm chế tuyến đỉnh cung",
  );
}


// ============================================================================
// 28. CHIẾM TUYẾN TỐT (Triệu Hâm Hâm Bài 19)
// ============================================================================

/**
 * Chiếm tuyến Tốt (Triệu Hâm Hâm Bài 19), kiểm 4 tầng:
 * 1. Hình: Xe từ hàng khác tiến vào tuyến Tốt đối phương (hàng 3 với Đỏ / hàng 6 với Đen).
 * 2. Mục đích: không tự ăn quân lớn.
 * 3. Cơ chế — bài giảng nêu ba mục đích "càn quét binh, áp chế Mã, yểm trợ Mã phe mình tiến lên"; biến engine phải
 *    cho thấy ít nhất một:
 *    - càn quét binh: chính Xe đó ăn Tốt trong biến và không bị ăn mất, kết thúc lời vật chất;
 *    - áp chế Mã: Mã đối phương mất ít nhất 2 ô nhảy an toàn ngay sau nước Xe, và Xe còn đứng trên tuyến Tốt hết biến;
 *    - yểm trợ Mã: Mã bên đi nhảy được vào ô ngọa tào trong biến.
 * 4. Kết quả: không hớ, engine chấm bên đi từ +100.
 */
export function checkChiemTuyenTot(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const pawnRow = mover === "r" ? 3 : 6;
  if (rowOf(move.to) !== pawnRow || rowOf(move.from) === pawnRow) return null;

  const victim = before[move.to];
  if (victim && isMajor(victim)) return { ok: false, layer: 2, reason: `Nước này ăn ${nameOf(victim)} — mục đích là ăn quân` };
  const line = engineLine(before, move, options);
  if (!line) return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };

  // Vị trí của Xe qua biến (theo danh tính); -1 khi Xe bị ăn
  let rookAt = move.to;
  let pawnsWon = 0;
  let lastPawn = -1;
  for (const e of line.plies) {
    if (e.origin === move.from) {
      rookAt = e.move.to;
      if (e.victim === "p") {
        pawnsWon++;
        lastPawn = e.ply;
      }
    } else if (e.move.to === rookAt) {
      rookAt = -1;
    }
  }
  // Ô nhảy an toàn của Mã đối phương (bên đi không khống chế) — không dùng nước hợp lệ vì nước chiếu làm Mã "không đi được"
  const knightMoves = (board: Board) =>
    pieces(board, opp, "n").reduce((n, s) => n + pseudoMoves(board, s).filter((t) => attackersOf(board, t, mover).length === 0).length, 0);
  const ngoaTao = mover === "r" ? [sq(1, 2), sq(1, 6)] : [sq(8, 2), sq(8, 6)];
  const ngoaTaoAt = line.plies.find((e) => e.side === mover && e.type === "n" && ngoaTao.includes(e.move.to))?.ply ?? -1;
  const [knightsBefore, knightsAfter] = [knightMoves(before), knightMoves(after)];

  let mechanism: string;
  let summary: string;
  if (pawnsWon > 0 && rookAt >= 0 && line.outcome.materialSettled >= 100) {
    mechanism = "càn quét binh";
    summary = `${narrate(line, lastPawn)} — Xe lời ${pawnsWon > 1 ? `${pawnsWon} Tốt` : "Tốt"}, không bị bắt lại`;
  } else if (rookAt >= 0 && rowOf(rookAt) === pawnRow && knightsBefore - knightsAfter >= 2) {
    mechanism = "áp chế Mã";
    summary = `Mã ${SIDE_NAME[opp]} từ ${knightsBefore} còn ${knightsAfter} ô nhảy an toàn, Xe đứng vững trên tuyến Tốt hết biến`;
  } else if (ngoaTaoAt >= 0) {
    mechanism = "yểm trợ Mã ngọa tào";
    summary = `${narrate(line, ngoaTaoAt)} — Mã vào ô ngọa tào`;
  } else {
    return { ok: false, layer: 3, reason: "Biến không cho thấy Xe quét Tốt, ghìm Mã hay mở đường cho Mã" };
  }
  if (!soundMove(options)) return { ok: false, layer: 4, reason: `Nước đi hớ ${options?.loss ?? "?"} điểm so với nước tốt nhất` };
  if (!line.moverMates && line.scoreForMover < 100) return { ok: false, layer: 4, reason: `Engine chỉ chấm bên đi +${line.scoreForMover}` };
  return { ok: true, mechanism, summary };
}

export function detectChiemTuyenTot(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkChiemTuyenTot(before, move, after, options);
  if (!r?.ok) return null;
  return fact(
    before,
    move,
    "chiemTuyenTot",
    `Chiếm tuyến Tốt: Xe vào tuyến Tốt đối phương (${moveNotation(before, move)}) để ${r.mechanism}; theo biến: ${r.summary}.`,
    "Chiếm tuyến tốt",
  );
}

// ============================================================================
// 29. KHỐNG CHẾ TUYẾN KỴ HÀ (Triệu Hâm Hâm Bài 20)
// ============================================================================

/**
 * Khống chế tuyến kỵ hà — kỵ hà xa (Triệu Hâm Hâm Bài 20), kiểm 4 tầng:
 * 1. Hình: Xe tiến (không phải lùi) tới bờ sông đối phương (hàng 4 với Đỏ / hàng 5 với Đen).
 * 2. Mục đích: không tự ăn quân lớn.
 * 3. Cơ chế — "chiếm giữ tuyến sông, ngăn cản quân địch qua sông": Xe đứng trên tuyến kỵ hà suốt biến (ít nhất
 *    HOLD_PLIES nửa nước, không bị ăn), và trong biến đối phương không đưa thêm được quân nào qua sông.
 * 4. Kết quả: không hớ, engine chấm bên đi từ +100.
 */
export function checkKhongCheKyHa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const kyHaRow = mover === "r" ? 4 : 5;
  const fr = rowOf(move.from);
  if (rowOf(move.to) !== kyHaRow || fr === kyHaRow || (mover === "r" ? fr < 4 : fr > 5)) return null;

  const victim = before[move.to];
  if (victim && isMajor(victim)) return { ok: false, layer: 2, reason: `Nước này ăn ${nameOf(victim)} — mục đích là ăn quân` };
  const line = engineLine(before, move, options);
  if (!line || line.plies.length <= HOLD_PLIES) return { ok: false, layer: 3, reason: "Biến engine quá ngắn để thấy Xe giữ tuyến sông" };

  const last = line.plies.length - 1;
  const at = squareInLine(line, move.from, last);
  if (at < 0 || rowOf(at) !== kyHaRow) return { ok: false, layer: 3, reason: "Xe bị đuổi khỏi tuyến kỵ hà hoặc bị ăn trong biến" };
  const crossed = (board: Board) => board.filter((p, i) => p && sideOf(p) === opp && crossedRiver(rowOf(i), opp)).length;
  const boards = lineBoards(before, line);
  const [c1, cEnd] = [crossed(after), Math.max(...boards.map(crossed))];
  if (cEnd > c1) return { ok: false, layer: 3, reason: `Đối phương vẫn đưa thêm quân qua sông trong biến (${c1} → ${cEnd})` };
  if (!soundMove(options)) return { ok: false, layer: 4, reason: `Nước đi hớ ${options?.loss ?? "?"} điểm so với nước tốt nhất` };
  if (!line.moverMates && line.scoreForMover < 100) return { ok: false, layer: 4, reason: `Engine chỉ chấm bên đi +${line.scoreForMover}` };
  return {
    ok: true,
    mechanism: "giữ tuyến sông",
    summary: `Xe đứng vững trên tuyến kỵ hà ${last} nửa nước, ${SIDE_NAME[opp]} không đưa thêm được quân nào qua sông`,
  };
}

export function detectKhongCheKyHa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkKhongCheKyHa(before, move, after, options);
  if (!r?.ok) return null;
  return fact(
    before,
    move,
    "khongCheKyHa",
    `Kỵ hà xa: Xe tới bờ sông đối phương (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
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

/** Xe của bên `side` còn ở góc nhà cánh lộ 2/8 (cột 0–1 hoặc 7–8, ba hàng cuối nhà mình). */
function cornerRooks(board: Board, side: Side, wingCols: number[]): number[] {
  const home = side === "b" ? [0, 1, 2] : [7, 8, 9];
  return pieces(board, side, "r").filter((s) => wingCols.includes(colOf(s)) && home.includes(rowOf(s)));
}

/**
 * Phong tỏa & phản phong tỏa lộ Xe (Triệu Hâm Hâm Bài 22), kiểm 4 tầng:
 * 1. Hình — phong tỏa: Pháo hoặc Mã vào lộ 2/8 (cột 1/7) làm Xe đối phương ở góc cánh đó còn ≤ 2 ô đi (mất ít nhất 3);
 *    phản phong tỏa: Pháo/Mã đối phương đang đứng trên lộ 2/8 cánh đó, và Xe nhà ở góc từ ≤ 2 ô đi được giải phóng lên
 *    ≥ 5 ô ngay sau nước đi.
 * 2. Mục đích: không tự ăn quân lớn.
 * 3. Cơ chế — "cuộc chiến giành đường Xe": phong tỏa thì Xe đối phương suốt biến (ít nhất HOLD_PLIES nửa nước) không
 *    lúc nào quá 2 ô đi và không ra khỏi góc; phản phong tỏa thì tới cuối biến Xe nhà vẫn còn và đi được ≥ 5 ô.
 * 4. Kết quả: không hớ, engine chấm bên đi từ +100.
 */
export function checkPhongToaLoXe(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const wings = [[0, 1], [7, 8]];

  // Phong tỏa: Pháo/Mã vào cột 1/7, Xe đối phương ở góc cánh đó (không phải quân vừa bị ăn) bị chặn
  const tc = colOf(move.to);
  const wing = tc === 1 ? wings[0] : tc === 7 ? wings[1] : null;
  const blocked = wing && "cn".includes(typeOf(piece))
    ? cornerRooks(after, opp, wing).find((s) => pseudoMoves(after, s).length <= 2 && pseudoMoves(before, s).length - pseudoMoves(after, s).length >= 3)
    : undefined;
  // Phản phong tỏa: Xe nhà ở góc được giải phóng (kể cả khi chính Xe đi ra), và phải đang có Pháo/Mã đối phương
  // phong tỏa lộ 2/8 cánh đó — Xe chỉ bị quân nhà chắn rồi quân nhà tránh đi là xuất Xe thường, không phải phản phong tỏa
  const enemyOnFile = (w: number[]) => pieces(before, opp, "cn").some((s) => colOf(s) === (w[0] === 0 ? 1 : 7));
  const freed = blocked === undefined
    ? wings.filter(enemyOnFile).flatMap((w) => cornerRooks(before, mover, w)).find((s) => {
      const now = s === move.from ? move.to : s;
      return pseudoMoves(before, s).length <= 2 && pseudoMoves(after, now).length >= 5;
    })
    : undefined;
  if (blocked === undefined && freed === undefined) return null;

  const victim = before[move.to];
  if (victim && isMajor(victim)) return { ok: false, layer: 2, reason: `Nước này ăn ${nameOf(victim)} — mục đích là ăn quân` };
  const line = engineLine(before, move, options);
  if (!line || line.plies.length <= HOLD_PLIES) return { ok: false, layer: 3, reason: "Biến engine quá ngắn để thấy đường Xe còn bị khóa / đã mở" };
  const boards = lineBoards(before, line);
  const last = line.plies.length - 1;

  let mechanism: string;
  let summary: string;
  if (blocked !== undefined) {
    const stuck = boards.every((board, i) => {
      const at = squareInLine(line, blocked, i);
      return at >= 0 && cornerRooks(board, opp, wing!).includes(at) && pseudoMoves(board, at).length <= 2;
    });
    if (!stuck) return { ok: false, layer: 3, reason: "Xe đối phương thoát được khỏi thế phong tỏa trong biến" };
    mechanism = "phong tỏa";
    summary = `Xe ${SIDE_NAME[opp]} ở góc suốt ${last} nửa nước không lúc nào đi được quá 2 ô`;
  } else {
    const at = squareInLine(line, freed!, last);
    const n = at >= 0 ? pseudoMoves(boards[last], at).length : 0;
    if (n < 5) return { ok: false, layer: 3, reason: "Tới cuối biến Xe nhà lại bị khóa hoặc bị ăn" };
    mechanism = "phản phong tỏa";
    summary = `Xe từ ${pseudoMoves(before, freed!).length} ô đi được giải phóng, cuối biến vẫn đi được ${n} ô`;
  }
  if (!soundMove(options)) return { ok: false, layer: 4, reason: `Nước đi hớ ${options?.loss ?? "?"} điểm so với nước tốt nhất` };
  if (!line.moverMates && line.scoreForMover < 100) return { ok: false, layer: 4, reason: `Engine chỉ chấm bên đi +${line.scoreForMover}` };
  return { ok: true, mechanism, summary };
}

export function detectPhongToaLoXe(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkPhongToaLoXe(before, move, after, options);
  if (!r?.ok) return null;
  return fact(
    before,
    move,
    "phongToaLoXe",
    `${r.mechanism === "phong tỏa" ? "Phong tỏa lộ Xe" : "Phản phong tỏa lộ Xe"} (${moveNotation(before, move)}); theo biến: ${r.summary}.`,
    "Phong tỏa lộ Xe",
  );
}

// ============================================================================
// 32. TẬP KÍCH ĐƯỜNG BIÊN - TỐT BIÊN ĐẠI NÁO (Triệu Hâm Hâm Bài 23)
// ============================================================================

/**
 * Tốt biên đại náo (Triệu Hâm Hâm Bài 23), kiểm 4 tầng:
 * 1. Hình: Tốt biên (lộ 1/9) đã qua sông, thọc sâu (hàng 3 với Đỏ / hàng 6 với Đen trở vào) hoặc rẽ ngang thọc sườn.
 * 2–4. `checkAttackLine` với chính con Tốt đó: bài giảng nói "nhân vật then chốt mang lại chiến thắng là quân Tốt biên",
 *    nên Tốt phải chiếu hoặc ăn quân trước hoặc ở đòn quyết định.
 */
export function checkTotBienDaiNao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p") return null;
  const mover = sideOf(piece);
  const fc = colOf(move.from);
  const tc = colOf(move.to);
  const tr = rowOf(move.to);
  if (!(fc === 0 || fc === 8 || tc === 0 || tc === 8) || !crossedRiver(tr, mover)) return null;
  const isDeep = mover === "r" ? tr <= 3 : tr >= 6;
  const isFlankTurn = (fc === 0 && tc === 1) || (fc === 8 && tc === 7);
  if (!isDeep && !isFlankTurn) return { ok: false, layer: 1, reason: "Tốt biên chưa thọc sâu vào trận địa đối phương" };
  return checkAttackLine(before, move, options, [move.from], 1);
}

export function detectTotBienDaiNao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkTotBienDaiNao(before, move, after, options);
  if (!r?.ok) return null;
  return fact(
    before,
    move,
    "totBienDaiNao",
    `Tốt biên đại náo: Tốt biên thọc sâu (${moveNotation(before, move)}) và chính nó ra tay; theo biến: ${r.summary}.`,
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
// 46–47. XE SONG MÃ ĐỐI XE SONG PHÁO (Triệu Hâm Hâm Bài 38 & 39)
// ============================================================================

/** Bên có Xe Song Mã (đúng 1 Xe, 2 Mã, không Pháo) khi bên kia có Xe Song Pháo (1 Xe, 2 Pháo, không Mã); null nếu không khớp. */
function xeMaDoiXePhao(board: Board): Side | null {
  const has = (s: Side, r: number, n: number, c: number) =>
    pieces(board, s, "r").length === r && pieces(board, s, "n").length === n && pieces(board, s, "c").length === c;
  for (const s of ["r", "b"] as const) if (has(s, 1, 2, 0) && has(opponent(s), 1, 0, 2)) return s;
  return null;
}

/**
 * Xe Song Mã đối Xe Song Pháo (bài 38 "tầm ngắn thắng tầm xa" / bài 39 "tầm xa thắng tầm ngắn") là bài đánh giá
 * thế quân, không phải đòn: ghi chú một lần khi ván vừa vào cấu hình này (thế sau khớp, thế trước không), và chỉ khi
 * engine chấm một bên hơn rõ (từ +100) — bên nào hơn thì dẫn bài của bên đó. Thế cân bằng thì im.
 */
export function checkXeMaDoiXePhao(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): { knights: Side; favored: Side; score: number } | null {
  const piece = before[move.from];
  if (!piece || !options?.evalAfter) return null;
  const knights = xeMaDoiXePhao(after);
  if (!knights || xeMaDoiXePhao(before) === knights) return null;
  const forMover = -options.evalAfter.score;
  const forKnights = sideOf(piece) === knights ? forMover : -forMover;
  if (Math.abs(forKnights) < 100) return null;
  return { knights, favored: forKnights > 0 ? knights : opponent(knights), score: Math.abs(forKnights) };
}

function xeMaDoiXePhaoNote(
  before: Board, move: Move, after: Board, options: ZhaoTacticsOptions | undefined, want: "n" | "c",
): ZhaoMiddlegameFact | null {
  const r = checkXeMaDoiXePhao(before, move, after, options);
  if (!r || (r.favored === r.knights) !== (want === "n")) return null;
  const tactic = want === "n" ? "tamNganThangTamXa" : "tamXaThangTamNgan";
  const card = Object.values(ZHAO_LESSONS).find((c) => c.tacticId === tactic)!;
  const score = Math.abs(r.score) >= MATE_THRESHOLD ? "thắng" : `+${r.score}`;
  return fact(
    before,
    move,
    tactic,
    `Ván cờ bước vào thế Xe Song Mã (${SIDE_NAME[r.knights]}) đối Xe Song Pháo (${SIDE_NAME[opponent(r.knights)]}); ` +
      `engine chấm ${SIDE_NAME[r.favored]} ${score}. ${card.principle.slice(card.principle.indexOf(":") + 1).trim()}`,
    card.title,
    "note",
  );
}

export function detectTamNganThangTamXa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  return xeMaDoiXePhaoNote(before, move, after, options, "n");
}

export function detectTamXaThangTamNgan(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  return xeMaDoiXePhaoNote(before, move, after, options, "c");
}

// ============================================================================
// 48. MỘT XE ĐỔI HAI (Triệu Hâm Hâm Bài 40)
// ============================================================================

/**
 * Kiểm 4 tầng cho Bài 40 (Một Xe đổi hai):
 * 1. Hình: Quân đi là Xe (r). Đối phương còn ít nhất 2 quân nhẹ (Mã, Pháo) trước nước đi.
 * 2. Mục đích: Đổi Xe lấy 2 quân nhẹ đối phương. Không phải Xe bị dọa bắt phải chạy trốn vô vọng.
 * 3. Cơ chế: Biến engine chứng minh chính quân Xe này bị mất (origin === move.from), và bên đi ăn được đúng 2 quân nhẹ của đối phương, không bị mất thêm quân chủ lực nào khác.
 * 4. Kết quả: Nước đi soundMove, điểm engine không bị lép nặng (scoreForMover >= -150).
 */
export function checkMotXeDoiHai(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Tầng 1: Hình — đối phương phải có ít nhất 2 quân nhẹ trước nước đi
  const oppMinorsBefore = pieces(before, opp, "nc").length;
  if (oppMinorsBefore < 2) {
    return {
      ok: false,
      layer: 1,
      reason: `Đối phương chỉ có ${oppMinorsBefore} quân nhẹ trước nước đi — không đủ điều kiện đổi Một Xe lấy hai`,
    };
  }

  // Tầng 2: Mục đích — không phải Xe bị dọa bắt phải chạy trốn vô vọng
  const threatened = (exchangeGain(before, move.from, opp) ?? 0) > 0;
  const target = before[move.to];
  if (threatened && (!target || (typeOf(target) !== "n" && typeOf(target) !== "c"))) {
    return {
      ok: false,
      layer: 2,
      reason: "Xe đang bị dọa bắt và nước đi không ăn quân nhẹ — không phải chủ động đổi Xe lấy hai quân nhẹ",
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  // 1. Đúng con Xe vừa đi phải bị mất trong biến
  const rookLost = line.outcome.captures.find(
    (c) => c.by === opp && c.type === "r" && c.origin === move.from,
  );
  if (!rookLost) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine không cho thấy chính con Xe này bị đổi (Xe không bị bắt)",
    };
  }

  // 2. Bên đi ăn được các quân nhẹ đối phương
  const minorsWon = line.outcome.captures.filter(
    (c) => c.by === mover && (c.type === "n" || c.type === "c") && c.ply <= 10,
  );
  if (minorsWon.length < 2) {
    return {
      ok: false,
      layer: 3,
      reason: `Biến engine chỉ ăn được ${minorsWon.length}/2 quân nhẹ đối phương — không đủ cuộc đổi Một Xe lấy hai`,
    };
  }

  // Nếu ăn >= 3 quân nhẹ/quân lớn thì nhường cho Bài 41 (Một Xe đổi ba)
  const piecesWonExcludingPawns = line.outcome.captures.filter(
    (c) => c.by === mover && (c.type === "n" || c.type === "c" || c.type === "r") && c.ply <= 10,
  );
  if (piecesWonExcludingPawns.length >= 3) {
    return {
      ok: false,
      layer: 3,
      reason: `Biến engine ăn được ${piecesWonExcludingPawns.length} quân lớn/nhẹ — thuộc về Một Xe đổi ba (Bài 41)`,
    };
  }
  const endPly = Math.max(rookLost.ply, minorsWon[0].ply, minorsWon[1].ply);

  // 3. Bên đi không bị mất thêm quân chủ lực (Xe, Mã, Pháo) ngoài con Xe này
  const otherMajorLosses = line.outcome.captures.filter(
    (c) => c.by === opp && (c.type === "r" || c.type === "n" || c.type === "c") && c.origin !== move.from && c.ply <= endPly,
  );
  if (otherMajorLosses.length > 0) {
    return {
      ok: false,
      layer: 3,
      reason: "Bên đi bị mất thêm quân chủ lực khác trong cuộc đổi — không phải một Xe đổi hai",
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (line.scoreForMover < -150) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chấm bên đi bị lép (${line.scoreForMover}) — cuộc đổi Xe không đem lại thế trận tốt`,
    };
  }

  const targetName = target ? ` ăn ${PIECE_NAME[typeOf(target)]}` : "";
  const summary = `Một Xe đổi hai: Xe${targetName} (${moveNotation(before, move)}) chủ động đổi Xe lấy hai quân nhẹ đối phương; theo biến: ${narrate(line, endPly)} — ${tally(line, endPly).text}. Triệu Hâm Hâm: bên ít Xe nhưng đông quân chủ lực hơn có thế công linh hoạt và dễ kiểm soát toàn cục.`;

  return { ok: true, mechanism: "chủ động đổi Xe lấy 2 quân nhẹ", summary, acted: [move.from] };
}

/** Một Xe đổi hai: chỉ gắn khi qua cả bốn tầng của checkMotXeDoiHai. */
export function detectMotXeDoiHai(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkMotXeDoiHai(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "motXeDoiHai", r.summary, "Một Xe đổi hai");
}

// ============================================================================
// 49. MỘT XE ĐỔI BA (Triệu Hâm Hâm Bài 41)
// ============================================================================

/**
 * Kiểm 4 tầng cho Bài 41 (Một Xe đổi ba):
 * 1. Hình: Quân đi là Xe (r). Đối phương còn ít nhất 3 quân ngoài Tướng trước nước đi.
 * 2. Mục đích: Hy sinh Xe đổi lấy 3 quân đối phương. Không phải Xe bị dọa bắt phải chạy trốn vô vọng.
 * 3. Cơ chế: Biến engine chứng minh chính quân Xe này bị mất (origin === move.from), và bên đi ăn được ít nhất 3 quân đối phương (trong đó có ít nhất 2 quân nhẹ hoặc 1 Xe), không bị mất thêm quân chủ lực nào khác.
 * 4. Kết quả: Nước đi soundMove, điểm engine không bị lép (scoreForMover >= -100).
 */
export function checkMotXeDoiBa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Tầng 1: Hình — đối phương phải có ít nhất 3 quân ngoài Tướng
  const oppPiecesBefore = pieces(before, opp, "rncabp").length;
  if (oppPiecesBefore < 3) {
    return {
      ok: false,
      layer: 1,
      reason: `Đối phương chỉ có ${oppPiecesBefore} quân ngoài Tướng — không đủ điều kiện đổi Một Xe lấy ba`,
    };
  }

  // Tầng 2: Mục đích — không phải Xe bị dọa bắt phải chạy trốn vô vọng
  const threatened = (exchangeGain(before, move.from, opp) ?? 0) > 0;
  const target = before[move.to];
  if (threatened && !target) {
    return {
      ok: false,
      layer: 2,
      reason: "Xe đang bị dọa bắt và nước đi không ăn quân — không phải chủ động phế Xe đổi ba quân",
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  // 1. Đúng con Xe vừa đi phải bị mất trong biến
  const rookLost = line.outcome.captures.find(
    (c) => c.by === opp && c.type === "r" && c.origin === move.from,
  );
  if (!rookLost) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine không cho thấy chính con Xe này bị đổi (Xe không bị bắt)",
    };
  }

  // 2. Bên đi ăn được ít nhất 3 quân đối phương
  const piecesWon = line.outcome.captures.filter(
    (c) => c.by === mover && c.ply <= 10,
  );
  if (piecesWon.length < 3) {
    return {
      ok: false,
      layer: 3,
      reason: `Biến engine chỉ ăn được ${piecesWon.length}/3 quân đối phương — không đủ cuộc đổi Một Xe lấy ba`,
    };
  }

  // Trong các quân ăn được phải có ít nhất 2 quân nhẹ (Mã, Pháo)
  const minorsWon = piecesWon.filter((c) => c.type === "n" || c.type === "c");
  if (minorsWon.length < 2) {
    return {
      ok: false,
      layer: 3,
      reason: "Một Xe đổi ba đòi hỏi ít nhất 2 quân nhẹ (Mã, Pháo) trong số 3 quân đổi được",
    };
  }

  const endPly = Math.max(rookLost.ply, piecesWon[0].ply, piecesWon[1].ply, piecesWon[2].ply);

  // 3. Bên đi không bị mất thêm quân chủ lực khác (Xe, Mã, Pháo) ngoài con Xe này
  const otherMajorLosses = line.outcome.captures.filter(
    (c) => c.by === opp && (c.type === "r" || c.type === "n" || c.type === "c") && c.origin !== move.from && c.ply <= endPly,
  );
  if (otherMajorLosses.length > 0) {
    return {
      ok: false,
      layer: 3,
      reason: "Bên đi bị mất thêm quân chủ lực khác trong cuộc đổi — không phải một Xe đổi ba",
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (line.scoreForMover < -100) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chấm bên đi bị lép (${line.scoreForMover}) — đổi một Xe lấy ba phải có ưu thế vật chất rõ rệt`,
    };
  }

  const targetName = target ? ` ăn ${PIECE_NAME[typeOf(target)]}` : "";
  const summary = `Một Xe đổi ba: Xe${targetName} (${moveNotation(before, move)}) hy sinh đổi lấy ba quân đối phương; theo biến: ${narrate(line, endPly)} — ${tally(line, endPly).text}. Triệu Hâm Hâm: một Xe đổi ba tuyệt đối có lợi, tạo ưu thế quân số áp đảo để nghiền nát đối thủ.`;

  return { ok: true, mechanism: "hy sinh Xe đổi lấy 3 quân", summary, acted: [move.from] };
}

/** Một Xe đổi ba: chỉ gắn khi qua cả bốn tầng của checkMotXeDoiBa. */
export function detectMotXeDoiBa(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkMotXeDoiBa(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "motXeDoiBa", r.summary, "Một Xe đổi ba");
}

// ============================================================================
// 50. MÃ VẬN NHƯ LONG - KIM THƯƠNG BÀN MÃ (Triệu Hâm Hâm Bài 42)
// ============================================================================

/**
 * Mã vận như long — hồi Mã kim thương (Triệu Hâm Hâm Bài 42), kiểm 4 tầng:
 * 1. Hình: Mã thoái về, sau nước đi khống chế được ít nhất 5 ô.
 * 2. Mục đích: không phải chạy Mã đang bị dọa mà không có quân bảo vệ.
 * 3–4. `checkAttackLine` với chính con Mã đó: Mã thoái để rồi tung đòn — Mã phải chiếu hoặc ăn quân trước hoặc ở đòn
 *    quyết định trong biến.
 */
export function checkMaVanNhuLong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n") return null;
  const mover = sideOf(piece);
  const fr = rowOf(move.from);
  const tr = rowOf(move.to);
  if (!(mover === "r" ? tr > fr : tr < fr)) return null;
  if (pseudoMoves(after, move.to).length < 5) return { ok: false, layer: 1, reason: "Mã thoái về ô chật, không khống chế được bát phương" };
  if (attackersOf(before, move.from, opponent(mover)).length > 0 && !isDefended(before, move.from, mover)) {
    return { ok: false, layer: 2, reason: "Mã đang bị dọa mà không có quân bảo vệ — nước này là chạy quân" };
  }
  return checkAttackLine(before, move, options, [move.from], 1);
}

export function detectMaVanNhuLong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkMaVanNhuLong(before, move, after, options);
  if (!r?.ok) return null;
  return fact(
    before,
    move,
    "maVanNhuLong",
    `Hồi Mã kim thương: Mã thoái về (${moveNotation(before, move)}) rồi chính Mã tung đòn; theo biến: ${r.summary}.`,
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
 * Kiểm 4 tầng cho Bài 46 (Phế Tốt phản công):
 * 1. Hình: Quân đi là Tốt (p). Trước nước đi bên đi còn ít nhất 1 quân chủ lực (Xe, Mã, Pháo).
 * 2. Mục đích: Đưa Tốt vào ô bị đối phương dọa ăn (hoặc phế Tốt). Không phải Tốt an toàn không ai bắt.
 * 3. Cơ chế: Biến engine chứng minh chính con Tốt vừa đi bị đối phương ăn (c.origin === move.from), sau đó các quân khác phát động phản kích có đòn quyết định (decisiveBlow).
 * 4. Kết quả: Nước đi soundMove, điểm engine không bị lép (scoreForMover >= -150).
 */
export function checkPheTotPhanCong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Tầng 1: Hình — bên đi phải còn ít nhất 1 quân chủ lực để phản công
  const majorPieces = pieces(before, mover, "rnc").length;
  if (majorPieces === 0) {
    return {
      ok: false,
      layer: 1,
      reason: "Bên đi không còn quân chủ lực (Xe, Mã, Pháo) nào để phản công sau khi phế Tốt",
    };
  }

  // Tầng 2: Mục đích — Tốt phải bị đối phương có thể ăn ở ô đích (phế Tốt)
  // Loại trừ nước ăn Tốt đối phương (đổi Tốt thông thường)
  const victim = before[move.to];
  if (victim && typeOf(victim) === "p") {
    return {
      ok: false,
      layer: 2,
      reason: "Nước này ăn Tốt đối phương — thuộc về đổi Tốt hoặc mưu Binh, không phải chủ động phế Tốt",
    };
  }
  // Tốt ăn quân lớn hơn rồi bị ăn lại là thắng quân / đổi quân, không phải phế
  if (victim) {
    return {
      ok: false,
      layer: 2,
      reason: "Nước này Tốt ăn quân đối phương — bị ăn lại là đổi quân, không phải chủ động phế Tốt",
    };
  }

  const oppAttackers = attackersOf(after, move.to, opp);
  if (oppAttackers.length === 0) {
    return {
      ok: false,
      layer: 2,
      reason: "Tốt không bị quân đối phương đe dọa ăn — không phải nước phế Tốt",
    };
  }

  // Loại trừ hai Tốt đối mặt đổi nhau thông thường có quân bảo vệ
  const defended = isDefended(after, move.to, mover);
  const onlyPawnsAttack = oppAttackers.every((sq) => typeOf(after[sq]!) === "p");
  if (onlyPawnsAttack && defended) {
    return {
      ok: false,
      layer: 2,
      reason: "Hai bên mời đổi Tốt thông thường có căn bảo vệ — không phải phế Tốt tranh tiên phản công",
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  // 1. Đúng con Tốt vừa đi phải bị mất trong biến
  const pawnLost = line.outcome.captures.find(
    (c) => c.by === opp && c.type === "p" && c.origin === move.from,
  );
  if (!pawnLost) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine không cho thấy con Tốt này bị ăn (phế Tốt nhưng đối phương không ăn)",
    };
  }

  // 2. Sau khi Tốt bị ăn, bên đi phản công có kết quả quyết định
  const blow = decisiveBlow(line, pawnLost.ply + 1);
  if (!blow) {
    return {
      ok: false,
      layer: 3,
      reason: "Sau khi phế Tốt, bên đi không có đòn phản công quyết định (không chiếu bí hay thắng quân lớn)",
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (line.scoreForMover < -150) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chấm bên đi bị lép (${line.scoreForMover}) — phế Tốt không đem lại thế trận tốt`,
    };
  }

  const summary = `Phế Tốt phản công: Tốt (${moveNotation(before, move)}) chủ động phế bỏ mở đường phản kích; theo biến: ${narrate(line, blow.end)} — ${blow.text}. Triệu Hâm Hâm: phế Tốt tranh thế, giải phóng lộ quân cho chủ lực phát động phản kích sấm sét.`;

  return { ok: true, mechanism: "chủ động phế Tốt mở đường phản công", summary, acted: [move.from] };
}

/** Phế Tốt phản công: chỉ gắn khi qua cả bốn tầng của checkPheTotPhanCong. */
export function detectPheTotPhanCong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkPheTotPhanCong(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "pheTotPhanCong", r.summary, "Phế Tốt phản công");
}

// ============================================================================
// 55. CHIẾN THUẬT MƯU BINH - BINH BẤT HUYẾT NHẪN (Triệu Hâm Hâm Bài 47)
// ============================================================================

/**
 * Kiểm 4 tầng cho Bài 47 (Chiến thuật mưu Binh):
 * 1. Hình: Nước đi ăn Tốt đối phương chưa qua sông, không phải Trung binh (Trung binh thuộc Bài 11).
 * 2. Mục đích: "Binh bất huyết nhẫn" — ăn sạch, quân ăn không bị bắt lại chịu thiệt.
 * 3. Cơ chế: Biến engine chứng minh quân ăn không bị đối phương bắt lại ngay, bên đi giữ vững ưu thế vật chất (cleanCapture).
 * 4. Kết quả: Nước đi soundMove, engine không chấm bên đi thua thế (scoreForMover >= -50).
 */
export function checkChienThuatMuuBinh(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const target = before[move.to];
  if (!target || typeOf(target) !== "p" || sideOf(target) !== opp) return null;

  // Tầng 1: Hình — không phải Trung binh và Tốt chưa qua sông
  if (colOf(move.to) === 4) {
    return {
      ok: false,
      layer: 1,
      reason: "Ăn Trung binh thuộc Chiến thuật đoạt Trung binh (Bài 11), không phải mưu Binh",
    };
  }

  if (crossedRiver(rowOf(move.to), opp)) {
    return {
      ok: false,
      layer: 1,
      reason: "Tốt đã qua sông — đây là nước phòng thủ diệt Tốt thâm nhập, không phải mưu Binh đoạt vỏ bọc",
    };
  }

  // Tầng 2: Mục đích — ăn sạch không bị đối phương bắt lại chịu thiệt
  const threatened = (exchangeGain(after, move.to, opp) ?? 0) > 0;
  if (threatened) {
    return {
      ok: false,
      layer: 2,
      reason: "Quân ăn Tốt bị đối phương bắt lại chịu thiệt — không phải ăn sạch binh bất huyết nhẫn",
    };
  }

  // Tầng 3: Cơ chế
  if (!options?.evalAfter) {
    return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  }
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine đủ dài để kiểm" };
  }

  // Quân ăn Tốt không bị ăn mất trong biến ở nước 1
  const pieceLost = line.outcome.captures.find(
    (c) => c.by === opp && c.ply === 1 && c.origin === move.from,
  );
  if (pieceLost) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine cho thấy quân ăn Tốt bị đối phương ăn lại ngay — không phải clean capture",
    };
  }

  if (line.outcome.materialAfterReply < 0) {
    return {
      ok: false,
      layer: 3,
      reason: "Biến engine không giữ được ưu thế vật chất sau khi ăn Tốt",
    };
  }

  // Tầng 4: Kết quả
  if (!soundMove(options)) {
    return {
      ok: false,
      layer: 4,
      reason: `Nước đi hớ ${options.loss ?? "?"} điểm so với nước tốt nhất`,
    };
  }

  if (line.scoreForMover < -50) {
    return {
      ok: false,
      layer: 4,
      reason: `Engine chấm bên đi bị lép (${line.scoreForMover}) — ăn Tốt không đem lại ưu thế`,
    };
  }

  const endPly = Math.min(line.plies.length - 1, 3);
  const summary = `Chiến thuật mưu Binh: ${nameOf(piece)} ăn Tốt (${moveNotation(before, move)}) sạch sẽ không mất căn; theo biến: ${narrate(line, endPly)} — ${tally(line, endPly).text}. Triệu Hâm Hâm: mưu đoạt Tốt sạch sẽ không đổ máu (binh bất huyết nhẫn), xé toang vỏ bọc của địch để tích lũy ưu thế chuyển hóa tàn cuộc.`;

  return { ok: true, mechanism: "ăn Tốt sạch sẽ không mất căn", summary, acted: [move.from] };
}

/** Chiến thuật mưu Binh: chỉ gắn khi qua cả bốn tầng của checkChienThuatMuuBinh. */
export function detectChienThuatMuuBinh(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const r = checkChienThuatMuuBinh(before, move, after, options);
  if (!r?.ok) return null;
  return fact(before, move, "chienThuatMuuBinh", r.summary, "Chiến thuật mưu Binh");
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
  // Tổ hợp nhiều quân cụ thể hơn một quân vào hàng 2: cùng kể một biến chiếu thì gọi tên tổ hợp
  detectOanhTacLoSuon,
  detectSongXePhoiHop,
  detectXeMaPhaoTamTu,
  detectXeSongPhao,
  detectXeSongMa,
  detectManhCongTuyenApDay,
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
