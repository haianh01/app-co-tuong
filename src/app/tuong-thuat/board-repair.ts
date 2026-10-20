// Sửa biên bản khi bàn cờ ở đây lệch với trang nguồn (bộ theo dõi nhận nhầm một nước, ví dụ tưởng có nước ăn quân):
// tìm cách lùi ít nước nhất rồi đi lại ít nước nhất để ra đúng thế cờ đọc được trên màn hình.

import { applyMove, legalMoves, type Board, type Move, type Position } from "@/lib/xiangqi/engine";

export interface Repair {
  /** Số nửa nước cần lùi. */
  undo: number;
  /** Các nước đi lại sau khi lùi. */
  moves: Move[];
}

const sameBoard = (a: Board, b: Board) => a.every((p, i) => p === b[i]);

/**
 * `history[0..n]` là các thế cờ đã ghi (history[n] là thế hiện tại). Thử lùi 0..maxUndo nước rồi đi lại 0..maxRedo
 * nước hợp lệ cho tới khi ra đúng `target`. Ưu tiên lùi ít, rồi đi lại ít (sửa nhỏ nhất). null nếu không tìm ra.
 */
export function findRepair(history: Position[], target: Board, maxUndo = 2, maxRedo = 2): Repair | null {
  const n = history.length - 1;
  for (let undo = 0; undo <= Math.min(maxUndo, n); undo++) {
    const base = history[n - undo];
    for (let redo = undo === 0 ? 1 : 0; redo <= maxRedo; redo++) {
      const moves = search(base, target, redo);
      if (moves) return { undo, moves };
    }
  }
  return null;
}

function search(pos: Position, target: Board, depth: number): Move[] | null {
  if (depth === 0) return sameBoard(pos.board, target) ? [] : null;
  for (const m of legalMoves(pos)) {
    const rest = search(applyMove(pos, m), target, depth - 1);
    if (rest) return [m, ...rest];
  }
  return null;
}
