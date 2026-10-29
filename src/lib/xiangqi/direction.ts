// Phương hướng — Triệu Hâm Hâm bài 24 "Đặt đúng quân vào đúng vị trí" (tổng kết Mưu Thế).
// Không có quân đúng / vị trí đúng tuyệt đối, chỉ đúng so với mục tiêu giai đoạn. Ở đây mục tiêu giai đoạn đọc từ
// biến tốt nhất của engine: "chiến trường" là trung lộ hay một cánh mà quân bên đi dồn tới trong biến đó
// (cộng các quân đã qua sông — mặt trận đang có).
// Hai bộ kiểm 4 tầng (cùng khuôn PrincipleCheck với zhao-principles.ts):
// - checkLechHuong: chê quân lớn rời chiến trường trong lúc biến tốt nhất dồn quân vào đó (vd. Xe bỏ trung lộ ra biên ăn Tốt).
// - checkDatDungViTri: khen nước lặng đưa quân vào chiến trường hoặc làm căn cho quân không căn,
//   hơn rõ nước "tự nhiên" thứ hai của engine (MultiPV).
// Thuần hàm, tất định, không gọi engine.

import {
  type Board, type Move, type PieceType, type Side,
  attackersOf, colOf, crossedRiver, inCheck, isDefended, opponent, play, rowOf, sideOf, typeOf, PIECE_VALUES,
} from "./engine";
import { engineLine, narrate, pvAfterMove } from "./engine-line";
import { attackedSet, soundMove, type ZhaoTacticsOptions } from "./middlegame";
import { moveNotation, PIECE_NAME } from "./notation";
import type { PrincipleCheck } from "./zhao-principles";

export type Sector = "left" | "center" | "right";

export interface Theater {
  sector: Sector;
  /** Tỉ phần trọng số dồn vào chiến trường này (0..1). */
  share: number;
}

/** Số nửa nước tối đa đọc trong biến để xác định chiến trường và so khống chế. */
const DEPTH = 8;
/** Biến phải dài ít nhất chừng này nửa nước mới so được hai phương án. */
const MIN_DEPTH = 4;
/** Chiến trường phải chiếm ít nhất tỉ phần này của trọng số mới coi là rõ ràng. */
const MIN_SHARE = 0.5;
/** Chênh khống chế (số ô) tối thiểu để nói phương án này giữ chiến trường hơn phương án kia. */
const CONTROL_GAP = 3;
/** Lệch hướng chỉ chê khi nước đi thiệt ít nhất chừng này (100 = một Tốt). */
const MIN_LOSS = 50;
/** Nước đặt quân được khen phải hơn nước thứ hai của engine ít nhất chừng này. */
const MIN_GAP = 40;
/** Quân vừa đặt phải trụ được chừng này nửa nước trong biến. */
const HOLD_PLIES = 6;

export const sectorOf = (sq: number): Sector => {
  const c = colOf(sq);
  return c <= 2 ? "left" : c >= 6 ? "right" : "center";
};

/** Khoảng cách (theo cột) từ ô tới chiến trường; 0 khi đã nằm trong. */
function sectorDistance(sq: number, sector: Sector): number {
  const c = colOf(sq);
  if (sector === "left") return Math.max(0, c - 2);
  if (sector === "right") return Math.max(0, 6 - c);
  return c < 3 ? 3 - c : c > 5 ? c - 5 : 0;
}

/** Tên chiến trường theo cách đánh số lộ của phe `side` (Đỏ: lộ 1 ở cột 8; Đen: lộ 1 ở cột 0). */
export function sectorName(sector: Sector, side: Side): string {
  if (sector === "center") return "trung lộ";
  const low = (sector === "right") === (side === "r");
  return low ? "cánh lộ 1–3" : "cánh lộ 7–9";
}

/** Biến bắt đầu bằng `first`: PV có nơi kèm sẵn nước đầu, có nơi không. */
function lineOf(first: Move, pv: Move[] | undefined): Move[] {
  const rest = pv ?? [];
  return rest[0]?.from === first.from && rest[0]?.to === first.to ? rest : [first, ...rest];
}

/** Đi `n` nửa nước đầu của biến; null khi biến không khớp thế cờ. `origins` theo dõi ô ban đầu của từng quân. */
function walk(board: Board, line: Move[], n: number): { board: Board; captured: Set<number> } | null {
  const first = line[0] && board[line[0].from];
  if (!first) return null;
  const origin = new Map<number, number>();
  for (let i = 0; i < board.length; i++) if (board[i]) origin.set(i, i);
  const captured = new Set<number>();
  let b = board;
  let side = sideOf(first);
  for (const m of line.slice(0, n)) {
    const p = b[m.from];
    if (!p || sideOf(p) !== side) return null;
    if (b[m.to]) captured.add(origin.get(m.to) ?? m.to);
    origin.set(m.to, origin.get(m.from) ?? m.from);
    origin.delete(m.from);
    b = play(b, m);
    side = opponent(side);
  }
  return { board: b, captured };
}

/**
 * Chiến trường của phe `side` theo biến `line` (bắt đầu bằng nước của `side`): nơi các nước của `side` đi tới
 * (nước càng sớm càng nặng) cộng nơi đang có quân đã qua sông. Null khi trọng số rải đều, không có hướng rõ.
 */
export function inferTheater(board: Board, side: Side, line: Move[]): Theater | null {
  const weight: Record<Sector, number> = { left: 0, center: 0, right: 0 };
  let b = board;
  let k = 0;
  for (const [ply, m] of line.slice(0, DEPTH).entries()) {
    const p = b[m.from];
    if (!p) break;
    if (ply % 2 === 0) {
      if (sideOf(p) !== side) break;
      weight[sectorOf(m.to)] += 1 / (1 + k / 2);
      k++;
    }
    b = play(b, m);
  }
  if (k < 2) return null;
  board.forEach((p, sq) => {
    if (p && sideOf(p) === side && "rncp".includes(typeOf(p)) && crossedRiver(rowOf(sq), side)) weight[sectorOf(sq)] += 0.5;
  });
  const total = weight.left + weight.center + weight.right;
  const sector = (Object.keys(weight) as Sector[]).reduce((a, s) => (weight[s] > weight[a] ? s : a), "center");
  const share = weight[sector] / total;
  return share >= MIN_SHARE ? { sector, share } : null;
}

/** Không gian ở chiến trường: số ô trong ba cột đó phe `side` khống chế, trừ số ô đối phương khống chế. */
export function theaterControl(board: Board, side: Side, sector: Sector): number {
  const mine = attackedSet(board, side);
  const theirs = attackedSet(board, opponent(side));
  let n = 0;
  for (let sq = 0; sq < board.length; sq++) {
    if (sectorOf(sq) !== sector) continue;
    if (mine.has(sq)) n++;
    if (theirs.has(sq)) n--;
  }
  return n;
}

/** Quân đang bị dọa thật: không căn, hoặc bị quân rẻ hơn bắt. */
function threatened(board: Board, sq: number, side: Side): boolean {
  const p = board[sq];
  if (!p) return false;
  const by = attackersOf(board, sq, opponent(side));
  if (by.length === 0) return false;
  if (!isDefended(board, sq, side)) return true;
  return by.some((a) => PIECE_VALUES[typeOf(board[a]!)] < PIECE_VALUES[typeOf(p)]);
}

/** Trong `n` nửa nước đầu của biến (bắt đầu bằng nước của bên đi), đối phương ăn được quân nào lớn hơn Tốt không. */
function opponentWinsMajor(board: Board, line: Move[], n: number): boolean {
  let b = board;
  for (const [ply, m] of line.slice(0, n).entries()) {
    const victim = b[m.to];
    if (ply % 2 === 1 && victim && typeOf(victim) !== "p") return true;
    b = play(b, m);
  }
  return false;
}

/** Quân lớn của `side` (khác ô `skip`) không căn trong `before` mà có căn trong `after`. */
function newlyGuarded(before: Board, after: Board, side: Side, skip: number): number[] {
  const out: number[] = [];
  after.forEach((p, sq) => {
    if (!p || sq === skip || sideOf(p) !== side || !"rnc".includes(typeOf(p)) || before[sq] !== p) return;
    if (!isDefended(before, sq, side) && isDefended(after, sq, side)) out.push(sq);
  });
  return out;
}

/** Tàn cuộc (cùng ngưỡng với choosePlan): nguyên lý tàn cuộc lo, phương hướng trung cuộc không bàn. */
const MIDDLEGAME_MAJORS = 6;

/**
 * Phần mở đầu chung: trung cuộc, nước lặng của Xe/Mã/Pháo, không đỡ chiếu, không chiếu, không ăn quân lớn.
 */
function quietMajor(before: Board, move: Move, after: Board): { mover: Side; type: PieceType } | null {
  const piece = before[move.from];
  if (!piece || !"rnc".includes(typeOf(piece))) return null;
  if (before.filter((p) => p && "rnc".includes(typeOf(p))).length < MIDDLEGAME_MAJORS) return null;
  const mover = sideOf(piece);
  if (inCheck(before, mover) || inCheck(after, opponent(mover))) return null;
  const victim = before[move.to];
  if (victim && typeOf(victim) !== "p") return null;
  return { mover, type: typeOf(piece) };
}

function lineText(before: Board, move: Move, options: ZhaoTacticsOptions | undefined, upTo: number): string {
  const line = engineLine(before, move, options);
  return line ? narrate(line, Math.min(upTo, line.plies.length - 1)) : "";
}

/**
 * Lệch hướng (chê): quân lớn rời chiến trường mà biến tốt nhất đang dồn quân vào.
 * 1. Hình: nước lặng của Xe/Mã/Pháo đi xa chiến trường hơn; nước tốt nhất đặt quân ngay trong chiến trường.
 * 2. Mục đích: quân không bị dọa (rời đi không phải chạy quân).
 * 3. Cơ chế: cùng độ sâu, biến tốt nhất giữ chiến trường hơn biến đã đi ≥ CONTROL_GAP ô, và đối phương thật sự
 *    đưa quân vào chiến trường bị bỏ trống.
 * 4. Kết quả: nước đi thiệt ≥ MIN_LOSS.
 */
export function checkLechHuong(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const q = quietMajor(before, move, after);
  if (!q) return null;
  const best = options?.evalBefore?.best;
  if (!best || (best.from === move.from && best.to === move.to)) return null;
  const { mover, type } = q;

  // Tầng 1: hình
  const bestLine = lineOf(best, options?.evalBefore?.pv);
  const theater = inferTheater(before, mover, bestLine);
  if (!theater) return { ok: false, layer: 1, reason: "Biến tốt nhất không dồn quân về một chiến trường rõ ràng" };
  const { sector } = theater;
  if (sectorOf(move.to) === sector || sectorDistance(move.to, sector) <= sectorDistance(move.from, sector)) {
    return { ok: false, layer: 1, reason: "Quân không rời xa chiến trường" };
  }
  // Bài giảng so hai cách đặt quân lớn (Xe 4 bình 1 / Xe 4 thoái 2): nước nên đi cũng phải là Xe/Mã/Pháo vào chiến trường
  const bestPiece = before[best.from];
  if (!bestPiece || !"rnc".includes(typeOf(bestPiece)) || sectorOf(best.to) !== sector) {
    return { ok: false, layer: 1, reason: "Nước tốt nhất không đặt quân lớn vào chiến trường" };
  }

  // Tầng 2: mục đích
  if (threatened(before, move.from, mover)) return { ok: false, layer: 2, reason: "Quân đang bị dọa, rời đi là chạy quân" };

  // Tầng 3: cơ chế
  if (!options?.evalAfter) return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  const playedLine = [move, ...pvAfterMove(options, move)];
  const depth = Math.min(DEPTH, playedLine.length, bestLine.length);
  if (depth < MIN_DEPTH) return { ok: false, layer: 3, reason: "Biến quá ngắn để so hai phương án" };
  const playedEnd = walk(before, playedLine, depth);
  const bestEnd = walk(before, bestLine, depth);
  if (!playedEnd || !bestEnd) return { ok: false, layer: 3, reason: "Biến không khớp thế cờ" };
  const gap = theaterControl(bestEnd.board, mover, sector) - theaterControl(playedEnd.board, mover, sector);
  if (gap < CONTROL_GAP) return { ok: false, layer: 3, reason: `Hai phương án giữ chiến trường gần như nhau (chênh ${gap} ô)` };
  const intrusions = playedLine.slice(0, depth).filter((m, i) => i % 2 === 1 && sectorOf(m.to) === sector).length;
  if (intrusions === 0) return { ok: false, layer: 3, reason: "Đối phương không tận dụng chiến trường bị bỏ trống" };
  // Đối phương phạt bằng cách ăn quân lớn thì nước sai vì chiến thuật — lời giải thích đúng là mất quân, không phải lệch hướng
  if (opponentWinsMajor(before, playedLine, depth)) {
    return { ok: false, layer: 3, reason: "Biến phạt bằng đòn ăn quân, không phải chuyện phương hướng" };
  }

  // Tầng 4: kết quả
  if (options.loss === undefined || options.loss < MIN_LOSS) return { ok: false, layer: 4, reason: "Nước đi không thiệt rõ" };

  const where = sectorName(sector, mover);
  const ate = before[move.to] ? ", tuy ăn được Tốt" : "";
  const told = lineText(before, move, options, 4);
  return {
    ok: true,
    mechanism: `${PIECE_NAME[type]} rời ${where}; biến tốt nhất giữ hơn ${gap} ô ở đó`,
    summary:
      `Lệch hướng: ${moveNotation(before, move)} đưa ${PIECE_NAME[type]} rời ${where}${ate}, trong khi phương hướng lúc này là dồn quân vào ${where}` +
      ` — nên ${moveNotation(before, best)}. Sau ${Math.floor(depth / 2)} nước, bên đi khống chế ${where} kém ${gap} ô so với nước nên đi` +
      (told ? `; theo biến: ${told}.` : "."),
  };
}

/**
 * Đặt đúng quân vào đúng vị trí (khen): nước lặng tốt nhất đưa quân vào chiến trường hoặc làm căn cho quân không căn,
 * hơn rõ nước thứ hai của engine.
 * 1. Hình: nước lặng của Xe/Mã/Pháo, chính là nước tốt nhất; quân vào chiến trường (từ ngoài) hoặc làm căn cho Xe/Mã/Pháo
 *    đang không căn.
 * 2. Mục đích: quân không bị dọa (không phải chạy quân).
 * 3. Cơ chế: quân vừa đặt trụ được HOLD_PLIES nửa nước; quân được làm căn không bị ăn trong biến; vào chiến trường thì
 *    cuối biến khống chế ở đó hơn biến của nước thứ hai ≥ 2 ô.
 * 4. Kết quả: không hớ, hơn nước thứ hai ≥ MIN_GAP, bên đi không đang thua rõ.
 */
export function checkDatDungViTri(
  before: Board, move: Move, after: Board, options?: ZhaoTacticsOptions,
): PrincipleCheck | null {
  const q = quietMajor(before, move, after);
  if (!q || before[move.to]) return null;
  const best = options?.evalBefore?.best;
  if (!best || best.from !== move.from || best.to !== move.to) return null;
  const lines = options?.evalBefore?.lines;
  const alt = lines?.[1];
  if (!lines?.[0] || !alt?.best || (alt.best.from === move.from && alt.best.to === move.to)) return null;
  const { mover, type } = q;

  // Tầng 1: hình
  const line = lineOf(move, options?.evalBefore?.pv ?? [move, ...pvAfterMove(options, move)]);
  const theater = inferTheater(before, mover, line);
  const enters = !!theater && sectorOf(move.to) === theater.sector && sectorOf(move.from) !== theater.sector;
  // Chỉ tính quân mà chính quân vừa đi làm căn: bỏ quân vừa đi ra khỏi bàn thì quân kia lại không căn
  const lifted = after.slice();
  lifted[move.to] = null;
  const roots = newlyGuarded(before, after, mover, move.to).filter((sq) => !isDefended(lifted, sq, mover));
  if (!enters && roots.length === 0) return { ok: false, layer: 1, reason: "Quân không vào chiến trường, cũng không làm căn cho quân nào" };

  // Tầng 2: mục đích
  if (threatened(before, move.from, mover)) return { ok: false, layer: 2, reason: "Quân đang bị dọa, nước đi là chạy quân" };

  // Tầng 3: cơ chế
  if (!options?.evalAfter) return { ok: false, layer: 3, reason: "Không có biến engine để kiểm" };
  const played = [move, ...pvAfterMove(options, move)];
  if (played.length < HOLD_PLIES) return { ok: false, layer: 3, reason: "Biến quá ngắn" };
  const held = walk(before, played, HOLD_PLIES);
  if (!held) return { ok: false, layer: 3, reason: "Biến không khớp thế cờ" };
  if (held.captured.has(move.from)) return { ok: false, layer: 3, reason: "Quân vừa đặt bị ăn trong biến" };
  const keptRoots = roots.filter((sq) => !held.captured.has(sq));
  let gainText = "";
  if (enters) {
    const altLine = lineOf(alt.best, alt.pv);
    const depth = Math.min(DEPTH, played.length, altLine.length);
    const playedEnd = depth >= MIN_DEPTH ? walk(before, played, depth) : null;
    const altEnd = depth >= MIN_DEPTH ? walk(before, altLine, depth) : null;
    const gap = playedEnd && altEnd
      ? theaterControl(playedEnd.board, mover, theater!.sector) - theaterControl(altEnd.board, mover, theater!.sector)
      : 0;
    if (gap >= 2) gainText = `cuối biến khống chế ${sectorName(theater!.sector, mover)} hơn ${gap} ô so với ${moveNotation(before, alt.best)}`;
  }
  const rootText = keptRoots.length > 0
    ? `làm căn cho ${keptRoots.map((sq) => PIECE_NAME[typeOf(before[sq]!)]).join(", ")} đang không căn`
    : "";
  if (!gainText && !rootText) return { ok: false, layer: 3, reason: "Biến không cho thấy quân vừa đặt giữ chiến trường hay làm căn" };

  // Tầng 4: kết quả
  if (!soundMove(options, 10)) return { ok: false, layer: 4, reason: "Nước đi có thiệt" };
  const scoreGap = lines[0].score - alt.score;
  if (scoreGap < MIN_GAP) return { ok: false, layer: 4, reason: `Nước thứ hai của engine gần như ngang (chênh ${scoreGap})` };
  if (-options.evalAfter.score < -100) return { ok: false, layer: 4, reason: "Bên đi đang thua rõ" };

  const reasons = [enters ? `đưa ${PIECE_NAME[type]} vào ${sectorName(theater!.sector, mover)} — chiến trường của biến tốt nhất` : "", rootText, gainText]
    .filter(Boolean)
    .join("; ");
  return {
    ok: true,
    mechanism: reasons,
    summary:
      `Đặt đúng quân vào đúng vị trí: ${moveNotation(before, move)} ${reasons}.` +
      ` Nước tự nhiên ${moveNotation(before, alt.best)} kém ${Math.round(scoreGap)} điểm theo engine.`,
  };
}
