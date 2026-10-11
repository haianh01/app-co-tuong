// Đánh giá các nước đã đi dựa trên điểm AI cho từng thế cờ: nước hớ, nước kém, thiếu chính xác, độ chính xác.

import type { Move, Side } from "./engine";
import { explainMove, type Fact } from "./explain";
import type { GameState } from "./game";
import { moveNotation } from "./notation";

/** Điểm AI của một thế cờ, tính theo phe đang đến lượt (dương = phe đó đang hơn), kèm nước tốt nhất. */
export interface PositionEval {
  score: number;
  best: Move | null;
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
}

export const CLASS_NAME: Record<MoveClass, string> = {
  blunder: "Nước hớ",
  mistake: "Nước kém",
  inaccuracy: "Thiếu chính xác",
};

/** Giới hạn điểm khi so sánh để thế thắng/thua tuyệt đối (chiếu bí) không làm méo số liệu. */
const CAP = 1500;
const clamp = (v: number) => Math.max(-CAP, Math.min(CAP, v));

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
export function reviewGame(state: GameState, evals: (PositionEval | null)[]): { moves: MoveReview[]; accuracy: Record<Side, number | null> } {
  const reviews: MoveReview[] = [];
  const acc: Record<Side, number[]> = { r: [], b: [] };
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
        })
        : [],
    });
  });
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return { moves: reviews, accuracy: { r: avg(acc.r), b: avg(acc.b) } };
}
