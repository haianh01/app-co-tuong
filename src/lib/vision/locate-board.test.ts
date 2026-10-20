import { describe, expect, it } from "vitest";
import { woodGrid } from "./locate-board";
import type { Pixels } from "./zigavn-panels";

/** Khung w×h nền tối, bàn gỗ ở rect, vạch kẻ lưới 9×10 tối chạy suốt bàn, vài "quân" tròn sáng. */
function frame(w: number, h: number, rect: { x0: number; y0: number; x1: number; y1: number }): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  const cw = (rect.x1 - rect.x0) / 8;
  const ch = (rect.y1 - rect.y0) / 9;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c = [11, 26, 20];
      if (x >= rect.x0 - cw / 2 && x <= rect.x1 + cw / 2 && y >= rect.y0 - ch / 2 && y <= rect.y1 + ch / 2) {
        c = [211, 138, 80];
        const onV = Math.abs(((x - rect.x0) / cw) - Math.round((x - rect.x0) / cw)) * cw < 1.2 && x >= rect.x0 - 1 && x <= rect.x1 + 1;
        const onH = Math.abs(((y - rect.y0) / ch) - Math.round((y - rect.y0) / ch)) * ch < 1.2 && y >= rect.y0 - 1 && y <= rect.y1 + 1;
        if (onV || onH) c = [90, 52, 24];
        // Hàng quân trên cùng và dưới cùng.
        for (const ry of [rect.y0, rect.y1]) {
          const dx = ((x - rect.x0) / cw - Math.round((x - rect.x0) / cw)) * cw;
          if (dx * dx + (y - ry) * (y - ry) < (cw * 0.42) ** 2) c = [243, 223, 182];
        }
      }
      data.set([...c, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

describe("woodGrid", () => {
  it.each([
    [640, 400, { x0: 180, y0: 40, x1: 460, y1: 355 }],
    [640, 360, { x0: 60, y0: 60, x1: 260, y1: 285 }],
  ])("khung %ix%i: đoán lưới sát vùng bàn cờ (ngang trong 3px, dọc trong nửa ô)", (w, h, rect) => {
    const g = woodGrid(frame(w, h, rect))!;
    const ch = (rect.y1 - rect.y0) / 9;
    expect(Math.abs(g.x0 - rect.x0)).toBeLessThan(0.5 * ch + 3);
    expect(Math.abs(g.x1 - rect.x1)).toBeLessThan(0.5 * ch + 3);
    expect(Math.abs((g.y0 + g.y1) / 2 - (rect.y0 + rect.y1) / 2)).toBeLessThan(0.5 * ch);
  });

  it("không có bàn gỗ: null", () => {
    expect(woodGrid({ width: 50, height: 50, data: new Uint8ClampedArray(50 * 50 * 4) })).toBeNull();
  });
});
