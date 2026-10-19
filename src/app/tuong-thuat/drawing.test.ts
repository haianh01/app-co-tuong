// Hoàn tác / làm lại nét vẽ, theo các tình huống thật khi bình luận một ván.

import { describe, expect, it } from "vitest";
import { EMPTY_DRAWING, drawingReducer, type DrawingAction, type DrawingHistory } from "./drawing";

const run = (actions: DrawingAction[], from: DrawingHistory = EMPTY_DRAWING) => actions.reduce(drawingReducer, from);
const arrow = (from: number, to: number, color = "#3b82f6"): DrawingAction => ({ type: "annotate", from, to, color });
const mark = (sq: number): DrawingAction => ({ type: "annotate", from: sq, to: sq, color: "#3b82f6" });
const shown = (s: DrawingHistory) => ({
  arrows: s.present.arrows.map((a) => [a.from, a.to]),
  marks: s.present.marks.map((m) => (typeof m === "number" ? m : m.square)),
});

describe("hoàn tác nét vẽ", () => {
  it("vẽ 2 mũi tên và khoanh 1 ô, Ctrl+Z ba lần thì gỡ dần từ nét mới nhất", () => {
    let s = run([arrow(70, 67), arrow(1, 20), mark(4)]);
    expect(shown(s)).toEqual({ arrows: [[70, 67], [1, 20]], marks: [4] });
    s = run([{ type: "undo" }], s);
    expect(shown(s)).toEqual({ arrows: [[70, 67], [1, 20]], marks: [] });
    s = run([{ type: "undo" }, { type: "undo" }], s);
    expect(shown(s)).toEqual({ arrows: [], marks: [] });
    // Hết lịch sử: bấm thêm không làm gì.
    expect(run([{ type: "undo" }], s)).toBe(s);
  });

  it("lỡ tay bấm Xóa nét vẽ: Ctrl+Z lấy lại toàn bộ", () => {
    const s = run([arrow(70, 67, "#ef4444"), mark(4), { type: "clear" }, { type: "undo" }]);
    expect(shown(s)).toEqual({ arrows: [[70, 67]], marks: [4] });
    expect(s.present.arrows[0].color).toBe("#ef4444");
    expect(s.present.marks[0]).toEqual({ square: 4, color: "#3b82f6" });
  });

  it("kéo lại đúng mũi tên đã có để bỏ nó: Ctrl+Z vẽ lại mũi tên đó", () => {
    const s = run([arrow(70, 67), arrow(70, 67)]);
    expect(shown(s).arrows).toEqual([]);
    expect(shown(run([{ type: "undo" }], s)).arrows).toEqual([[70, 67]]);
  });

  it("Ctrl+Y làm lại; vẽ nét mới sau khi hoàn tác thì không làm lại được nữa", () => {
    let s = run([arrow(70, 67), arrow(1, 20), { type: "undo" }, { type: "redo" }]);
    expect(shown(s).arrows).toEqual([[70, 67], [1, 20]]);
    s = run([{ type: "undo" }, mark(40)], s);
    expect(run([{ type: "redo" }], s)).toBe(s);
    expect(shown(s)).toEqual({ arrows: [[70, 67]], marks: [40] });
  });

  it("tự xóa khi có nước mới trên bàn trống không chiếm một bước hoàn tác", () => {
    const s = run([arrow(70, 67), { type: "clear" }, { type: "clear" }, { type: "clear" }]);
    expect(s.past).toHaveLength(2);
    expect(shown(run([{ type: "undo" }], s)).arrows).toEqual([[70, 67]]);
  });
});
