// Đánh giá các nước đã đi dựa trên điểm AI cho từng thế cờ: nước hớ, nước kém, thiếu chính xác, độ chính xác.

import { findBestMove } from "./ai";
import { inCheck, legalMoves, opponent, type Board, type Move, type Side } from "./engine";
import { explainMove, type Fact } from "./explain";
import type { GameState } from "./game";
import { moveNotation } from "./notation";
import { openingOf } from "./openings";
import { formatPvLine } from "./uci";

/** Điểm AI của một thế cờ, tính theo phe đang đến lượt (dương = phe đó đang hơn), kèm nước tốt nhất. */
export interface PositionEval {
  score: number;
  best: Move | null;
  /** Chuỗi nước đi chính từ engine (PV). */
  pv?: Move[];
  /** Chuỗi biến cờ tướng ký hiệu tiếng Việt có sẵn. */
  line?: string[];
}

export type MoveClass = "blunder" | "mistake" | "inaccuracy";

export interface MoveReview {
  /** Vị trí sau nước đi (dùng để nhảy tới trong biên bản). */
  ply: number;
  side: Side;
  notation: string;
  /** Điểm mất đi so với nước tốt nhất (đơn vị: 100 = một con tốt). */
  loss: number;
  cls: MoveClass | null;
  /** Nước AI đề xuất thay thế (nếu khác nước đã đi). */
  better: string | null;
  /** Dữ kiện giải thích vì sao nước bị chấm (rỗng nếu nước không bị chấm), xem explain.ts. */
  facts: Fact[];
  /** Chuỗi biến nước phản đòn tiếp theo của đối phương (2-3 nước). */
  line?: string[];
  /** Các ô cờ then chốt liên quan đến sai lầm để hiển thị highlight. */
  highlights?: number[];
}

export const CLASS_NAME: Record<MoveClass, string> = {
  blunder: "Nước hớ",
  mistake: "Nước kém",
  inaccuracy: "Thiếu chính xác",
};

/** Giới hạn điểm khi so sánh để thế thắng/thua tuyệt đối (chiếu bí) không làm méo số liệu. */
const CAP = 1500;
const clamp = (v: number) => Math.max(-CAP, Math.min(CAP, v));

function play(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

/** Tính chuỗi biến phản đòn tiếp theo (tối đa maxPly nước) để giải thích sâu cho người chơi. */
export function computeTacticalLine(
  after: Board,
  reply: Move | null,
  mover: Side,
  maxPly: number = 3,
): string[] {
  if (!reply) return [];
  const line: string[] = [];
  let currentBoard = after;
  let currentTurn = opponent(mover);
  let currentMove: Move | null = reply;

  while (currentMove && line.length < maxPly) {
    line.push(moveNotation(currentBoard, currentMove));
    currentBoard = play(currentBoard, currentMove);
    currentTurn = opponent(currentTurn);
    if (inCheck(currentBoard, currentTurn) && legalMoves({ board: currentBoard, turn: currentTurn }).length === 0) {
      break;
    }
    const res = findBestMove({ board: currentBoard, turn: currentTurn }, 1, () => 0, { depth: 1, timeMs: 25, noise: 0 });
    currentMove = res.move;
  }

  return line;
}

/** Tập hợp các ô cờ trọng điểm liên quan đến nước đi và nước đáp. */
export function computeHighlights(move: Move, reply: Move | null, better: Move | null): number[] {
  const set = new Set<number>();
  set.add(move.to);
  if (reply) {
    set.add(reply.from);
    set.add(reply.to);
  }
  if (better) {
    set.add(better.from);
    set.add(better.to);
  }
  return [...set];
}

export function classify(loss: number): MoveClass | null {
  if (loss >= 300) return "blunder";
  if (loss >= 150) return "mistake";
  if (loss >= 70) return "inaccuracy";
  return null;
}

/**
 * `evals[i]` là điểm của thế cờ thứ i (sau i nửa nước), `null` nếu chưa/không phân tích.
 * Một nước mất điểm = điểm trước nước (theo người đi) − điểm sau nước (vẫn theo người đi).
 */
export function reviewGame(state: GameState, evals: (PositionEval | null)[]): { moves: MoveReview[]; accuracy: Record<Side, number | null>; opening?: string } {
  const reviews: MoveReview[] = [];
  const acc: Record<Side, number[]> = { r: [], b: [] };
  const firstMove = state.moves[0]?.notation;
  const op = firstMove ? openingOf(firstMove) : null;
  const opening = op && op.id !== "other" ? op.name : undefined;

  state.moves.forEach((m, i) => {
    const before = evals[i];
    const afterEval = evals[i + 1];
    const isLast = i === state.moves.length - 1;
    let after: number | null = null;
    if (isLast && state.result?.winner === m.side && (state.result.reason === "checkmate" || state.result.reason === "stalemate")) after = CAP;
    else if (afterEval) after = -clamp(afterEval.score);
    if (!before || after === null) {
      reviews.push({ ply: i + 1, side: m.side, notation: m.notation, loss: 0, cls: null, better: null, facts: [] });
      return;
    }
    const playedBest = before.best?.from === m.move.from && before.best?.to === m.move.to;
    const loss = playedBest ? 0 : Math.max(0, clamp(before.score) - after);
    acc[m.side].push(Math.max(0, 100 - loss / 3));
    const cls = classify(loss);
    const historyMoves = state.moves.slice(0, i).map((x) => x.move);
    let line: string[] | undefined;
    if (cls) {
      if (afterEval?.pv && afterEval.pv.length > 0) {
        line = formatPvLine(state.history[i + 1].board, afterEval.pv, 3);
      } else if (afterEval?.line && afterEval.line.length > 0) {
        line = afterEval.line.slice(0, 3);
      } else if (afterEval?.best) {
        line = computeTacticalLine(state.history[i + 1].board, afterEval.best, m.side, 3);
      }
    }
    const highlights = cls ? computeHighlights(m.move, afterEval?.best ?? null, before.best ?? null) : undefined;

    reviews.push({
      ply: i + 1,
      side: m.side,
      notation: m.notation,
      loss: Math.round(loss),
      cls,
      better: cls && before.best ? moveNotation(state.history[i].board, before.best) : null,
      facts: cls
        ? explainMove({
          before: state.history[i].board,
          move: m.move,
          after: state.history[i + 1].board,
          evalBefore: before,
          evalAfter: afterEval,
          loss,
          ply: i,
          opening,
          historyMoves,
        })
        : [],
      line,
      highlights,
    });
  });
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return { moves: reviews, accuracy: { r: avg(acc.r), b: avg(acc.b) }, opening };
}
