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
  | { type: "annotate"; from: number; to: number; color: string; label?: string | number }
  | { type: "clear" }
  | { type: "undo" }
  | { type: "redo" };

/** Giữ tối đa chừng này bước để hoàn tác. */
const LIMIT = 100;

export const EMPTY_DRAWING: DrawingHistory = { past: [], present: { arrows: [], marks: [] }, future: [] };

function annotate(
  { arrows, marks }: Drawing,
  from: number,
  to: number,
  color: string,
  label?: string | number,
): Drawing {
  if (from === to) {
    const existingIdx = marks.findIndex((m) => (typeof m === "number" ? m === from : m.square === from));
    if (existingIdx >= 0) {
      return { arrows, marks: marks.filter((_, i) => i !== existingIdx) };
    }
    return { arrows, marks: [...marks, { square: from, color }] };
  }
  const same = (a: BoardArrow) => a.from === from && a.to === to;
  if (arrows.some(same)) {
    // Xóa mũi tên nếu đã có và đánh số lại tuần tự cho các mũi tên còn lại
    const remaining = arrows.filter((a) => !same(a)).map((a, i) => ({ ...a, label: i + 1 }));
    return { arrows: remaining, marks };
  }
  const nextNumber = arrows.length + 1;
  const newArrow: BoardArrow = {
    from,
    to,
    kind: "custom",
    color,
    label: label ?? nextNumber,
  };
  return {
    arrows: [...arrows, newArrow],
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
        action.type === "clear"
          ? EMPTY_DRAWING.present
          : annotate(state.present, action.from, action.to, action.color, action.label);
      // Xóa khi chưa vẽ gì thì không tính là một bước (tự xóa khi có nước mới sẽ không làm đầy lịch sử).
      if (next.arrows.length === 0 && next.marks.length === 0 && state.present.arrows.length === 0 && state.present.marks.length === 0) {
        return state;
      }
      return { past: [...state.past, state.present].slice(-LIMIT), present: next, future: [] };
    }
  }
}
