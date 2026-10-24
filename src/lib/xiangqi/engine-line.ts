// Biến chính (PV) của engine đi thử trên bàn cờ: để kiểm điều một kỳ lý nói có thật sự xảy ra trong biến
// (quân nào chiếu, ăn được gì, ai ăn lại, sát sau mấy nước) và kể lại chuỗi nước đó thành lời bình.
// Dùng chung cho kỳ lý trung cuộc (zhao-principles.ts) và tàn cuộc (endgame-principles.ts).
// Thuần hàm, tất định, không gọi engine.

import {
  type Board, type Move, type PieceType, type Side, attackersOf, findKing, inCheck, opponent, play, sideOf, typeOf, PIECE_VALUES,
} from "./engine";
import type { ZhaoTacticsOptions } from "./middlegame";
import { classifyMoveOutcome, type MoveOutcome } from "./move-outcome";
import { moveNotation, PIECE_NAME, SIDE_NAME } from "./notation";
import { MATE_SCORE, MATE_THRESHOLD } from "./uci";

/** Một nửa nước trong biến chính, tính cả chính nước vừa đi (ply 0). */
export interface LinePly {
  ply: number;
  side: Side;
  type: PieceType;
  move: Move;
  /** Ô của quân đi trong thế `before` — theo dõi danh tính quân qua biến. */
  origin: number;
  victim: PieceType | null;
  /** Bên đi nước này đang bị chiếu (nước đỡ / tránh chiếu). */
  evading: boolean;
  /** Nước này chiếu Tướng bên kia. */
  check: boolean;
  /** Ô ban đầu (trong thế `before`) và loại của các quân đang chiếu sau nước này — kể cả chiếu lộ diện. */
  checkers: number[];
  checkerTypes: PieceType[];
  notation: string;
}

export interface EngineLine {
  plies: LinePly[];
  outcome: MoveOutcome;
  /** Điểm engine theo bên đi sau nước đi. */
  scoreForMover: number;
  moverMates: boolean;
  /** Số nước bên đi còn phải đi tới khi chiếu bí (0 = chính nước này chiếu bí); null khi không sát. */
  mateIn: number | null;
}

/** PV tính từ thế SAU nước đi. Có nơi truyền PV bắt đầu bằng chính nước vừa đi — bỏ nước đó đi. */
export function pvAfterMove(options: ZhaoTacticsOptions | undefined, move: Move): Move[] {
  const pv = options?.pv ?? [];
  return pv[0]?.from === move.from && pv[0]?.to === move.to ? pv.slice(1) : pv;
}

const HORIZON = 16;
/** Mỗi lần chấm một nước, các bộ nhận diện dùng chung một biến đã đi thử (khóa theo object options của lần gọi). */
const lineCache = new WeakMap<object, { before: Board; move: Move; line: EngineLine | null }>();

/** Biến engine sau nước đi; null khi không có điểm engine hoặc biến quá ngắn để kết luận. */
export function engineLine(before: Board, move: Move, options?: ZhaoTacticsOptions): EngineLine | null {
  if (!options) return null;
  const hit = lineCache.get(options);
  if (hit && hit.before === before && hit.move.from === move.from && hit.move.to === move.to) return hit.line;
  const line = buildLine(before, move, options);
  lineCache.set(options, { before, move, line });
  return line;
}

function buildLine(before: Board, move: Move, options: ZhaoTacticsOptions): EngineLine | null {
  const piece = before[move.from];
  if (!piece || !options.evalAfter) return null;
  const mover = sideOf(piece);
  const scoreForMover = -options.evalAfter.score;
  const moverMates = scoreForMover >= MATE_THRESHOLD;
  const pv = pvAfterMove(options, move);
  if (!moverMates && pv.length < 3) return null;

  const origin = new Map<number, number>();
  for (let i = 0; i < before.length; i++) if (before[i]) origin.set(i, i);
  const plies: LinePly[] = [];
  let board = before;
  let side = mover;
  for (const [ply, m] of [move, ...pv].slice(0, HORIZON).entries()) {
    const p = board[m.from];
    if (!p || sideOf(p) !== side) break; // biến không khớp thế cờ
    const victim = board[m.to];
    const next = play(board, m);
    const moved = origin.get(m.from) ?? m.from;
    origin.set(m.to, moved);
    origin.delete(m.from);
    const check = inCheck(next, opponent(side));
    const king = check ? findKing(next, opponent(side)) : -1;
    const checkSquares = king >= 0 ? attackersOf(next, king, side) : [];
    plies.push({
      ply, side, type: typeOf(p), move: m, origin: moved,
      victim: victim ? typeOf(victim) : null,
      evading: inCheck(board, side),
      check,
      checkers: checkSquares.map((s) => origin.get(s) ?? s),
      checkerTypes: checkSquares.map((s) => typeOf(next[s]!)),
      notation: moveNotation(board, m),
    });
    board = next;
    side = opponent(side);
  }
  const outcome = classifyMoveOutcome(before, move, pv, {
    scoreForMover, moverMates, opponentMates: scoreForMover <= -MATE_THRESHOLD,
  });
  const mateIn = moverMates ? Math.max(0, Math.round((MATE_SCORE - scoreForMover) / 2)) : null;
  return { plies, outcome, scoreForMover, moverMates, mateIn };
}

/** Nửa nước cuối cần kể của đòn sát: nước chiếu bí nếu biến đủ dài, không thì hết biến. */
export function mateEnd(line: EngineLine): number {
  const last = line.plies.length - 1;
  return line.mateIn === null ? last : Math.min(last, 2 * line.mateIn);
}

/**
 * Kể lại biến tới nửa nước `upTo`: nước ăn quân, chiếu, đỡ chiếu, nước đầu và nước cuối; nước yên lặng ở giữa thay bằng "…".
 * Biến dài thì giữ hai nước đầu và bốn nước cuối để lời bình đọc được.
 */
export function narrate(line: EngineLine, upTo: number): string {
  const mover = line.plies[0].side;
  const parts: string[] = [];
  let skipped = false;
  for (const e of line.plies.slice(0, upTo + 1)) {
    if (e.ply !== 0 && e.ply !== upTo && !e.victim && !e.check && !e.evading) {
      skipped = true;
      continue;
    }
    if (skipped) parts.push("…");
    skipped = false;
    const who = e.side === mover ? "" : `${SIDE_NAME[e.side]} `;
    const name = PIECE_NAME[e.type];
    const act = e.victim
      ? `${name} ăn ${PIECE_NAME[e.victim]}`
      : e.evading && !e.check ? (e.type === "k" ? "Tướng tránh chiếu" : `${name} đỡ chiếu`) : name;
    // Chiếu lộ diện: quân vừa đi mở đường, quân phía sau mới là quân chiếu; hai quân cùng chiếu là chiếu đôi
    const discovered = e.check && !e.checkers.includes(e.origin);
    const tail = !e.check
      ? (e.victim || e.evading ? "" : " đi")
      : discovered ? `${e.victim ? "" : " đi"}, ${PIECE_NAME[e.checkerTypes[0]]} chiếu`
      : e.checkers.length > 1 ? ` chiếu đôi cùng ${PIECE_NAME[e.checkerTypes.find((_, i) => e.checkers[i] !== e.origin)!]}` : " chiếu";
    parts.push(`${who}${act}${tail} (${e.notation})`);
  }
  const shown = parts.length > 7 ? [...parts.slice(0, 2), "…", ...parts.slice(-4)] : parts;
  return shown.filter((p, i) => p !== "…" || shown[i - 1] !== "…").join(", ");
}

/** Kết quả vật chất tới nửa nước `key`, kể cả nước ăn lại ngay trong hai nửa nước sau đó. */
export function tally(line: EngineLine, key: number): { upTo: number; text: string } {
  let upTo = key;
  for (let i = key + 1; i <= key + 2 && i < line.plies.length; i++) if (line.plies[i].victim) upTo = i;
  const mover = line.plies[0].side;
  const names = (side: Side) => {
    const ts = line.plies.slice(0, upTo + 1).filter((e) => e.victim && e.side === side).map((e) => e.victim!);
    return [...new Set(ts)].map((t) => {
      const k = ts.filter((x) => x === t).length;
      return k > 1 ? `${k} ${PIECE_NAME[t]}` : PIECE_NAME[t];
    });
  };
  const gains = names(mover);
  const losses = names(opponent(mover));
  return { upTo, text: losses.length ? `đổi ${losses.join(", ")} lấy ${gains.join(", ")}` : `thắng ${gains.join(", ")}` };
}

export const mateText = (line: EngineLine) =>
  line.mateIn === 0 ? "chiếu bí" : `chiếu bí sau ${line.mateIn} nước nữa`;

/**
 * Quân có ô ban đầu `from` (theo danh tính) làm được gì cho bên đi trong biến tới nửa nước `upTo`:
 * số lần nó chiếu Tướng (kể cả chiếu lộ diện khi quân khác mở đường) và các quân nó ăn.
 */
export function pieceRole(line: EngineLine, from: number, upTo: number): { checks: number; captures: PieceType[] } {
  const mover = line.plies[0].side;
  let checks = 0;
  const captures: PieceType[] = [];
  for (const e of line.plies.slice(0, upTo + 1)) {
    if (e.side !== mover) continue;
    if (e.checkers.includes(from)) checks++;
    if (e.origin === from && e.victim) captures.push(e.victim);
  }
  return { checks, captures };
}

/**
 * Đòn quyết định của bên đi trong biến: chiếu bí, hoặc nước ăn quân đáng giá nhất (không tính Tốt) trong 10 nửa nước
 * đầu, kể từ nửa nước `fromPly`. Trả về nửa nước cuối cần kể và lời tổng kết vật chất (kể cả nước ăn lại ngay sau đó);
 * null khi biến không có đòn nào như vậy.
 */
export function decisiveBlow(line: EngineLine, fromPly = 1): { end: number; text: string; mate: boolean } | null {
  if (line.moverMates) return { end: mateEnd(line), text: mateText(line), mate: true };
  const mover = line.plies[0].side;
  const won = line.outcome.captures
    .filter((c) => c.by === mover && c.type !== "p" && c.ply >= fromPly && c.ply <= 10)
    .sort((a, b) => PIECE_VALUES[b.type] - PIECE_VALUES[a.type] || a.ply - b.ply)[0];
  if (!won) return null;
  const t = tally(line, won.ply);
  return { end: t.upTo, text: t.text, mate: false };
}

/** Nửa nước (từ `from` trở đi) bên đi ăn được quân loại `types`, -1 nếu không có. */
export function moverCaptureAt(line: EngineLine, types: string, from = 1): number {
  const mover = line.plies[0].side;
  const c = line.outcome.captures.find((x) => x.by === mover && types.includes(x.type) && x.ply >= from);
  return c ? c.ply : -1;
}
