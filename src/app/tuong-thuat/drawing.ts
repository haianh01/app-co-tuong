// Nét vẽ bình luận trên bàn cờ, có lịch sử để hoàn tác (Ctrl+Z) và làm lại (Ctrl+Y / Ctrl+Shift+Z).

import type { BoardArrow, BoardHighlight } from "@/components/board/XiangqiBoard";

export interface Drawing {
  arrows: BoardArrow[];
  marks: BoardHighlight[];
}

export interface DrawingHistory {
  past: Drawing[];
  present: Drawing;
  future: Drawing[];
}

export type DrawingAction =
  /** Kéo từ ô này sang ô khác: thêm mũi tên (hoặc bỏ nếu đã có); from === to: khoanh/bỏ khoanh ô. */
  | { type: "annotate"; from: number; to: number; color: string }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

/** Giữ tối đa chừng này bước để hoàn tác. */
const LIMIT = 100;

export const EMPTY_DRAWING: DrawingHistory = { past: [], present: { arrows: [], marks: [] }, future: [] };

function annotate({ arrows, marks }: Drawing, from: number, to: number, color: string): Drawing {
  if (from === to) {
    const existingIdx = marks.findIndex((m) => (typeof m === "number" ? m === from : m.square === from));
    if (existingIdx >= 0) {
      return { arrows, marks: marks.filter((_, i) => i !== existingIdx) };
    }
    return { arrows, marks: [...marks, { square: from, color }] };
  }
  const same = (a: BoardArrow) => a.from === from && a.to === to;
  return {
    arrows: arrows.some(same) ? arrows.filter((a) => !same(a)) : [...arrows, { from, to, kind: "custom", color }],
    marks,
  };
}

export function drawingReducer(state: DrawingHistory, action: DrawingAction): DrawingHistory {
  switch (action.type) {
    case "undo": {
      if (state.past.length === 0) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) };
    }
    case "clear":
    case "annotate": {
      const next =
        action.type === "clear" ? EMPTY_DRAWING.present : annotate(state.present, action.from, action.to, action.color);
      // Xóa khi chưa vẽ gì thì không tính là một bước (tự xóa khi có nước mới sẽ không làm đầy lịch sử).
      if (next.arrows.length === 0 && next.marks.length === 0 && state.present.arrows.length === 0 && state.present.marks.length === 0) {
        return state;
      }
      return { past: [...state.past, state.present].slice(-LIMIT), present: next, future: [] };
    }
  }
}
