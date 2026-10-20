import { describe, expect, it } from "vitest";
import { Stable, clockSeconds, formatClock, isGoldStar, parseClock, parseNick, parsePoints, textInk, textMask, valueKind, type Pixels } from "./zigavn-panels";

// Màu đo trên ảnh chụp zigavn thật.
const BOX: [number, number, number] = [104, 70, 46];
const CREAM: [number, number, number] = [251, 234, 180];
const GOLD: [number, number, number] = [250, 192, 34];
const COIN: [number, number, number] = [222, 160, 96];

/** Ô w×h nền nâu, tô màu `color` cho các cột trong `textCols`. */
function box(w: number, h: number, color: [number, number, number], textCols: number[]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = textCols.includes(x) && y > 2 && y < h - 3 ? color : BOX;
      data.set([...c, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

describe("zigavn-panels", () => {
  it("phân biệt ô đang hiện đồng hồ (chữ vàng) với điểm (chữ kem), bỏ qua đồng xu cam", () => {
    const cols = [10, 11, 14, 15, 18, 19, 22, 23];
    expect(valueKind(box(40, 16, GOLD, cols))).toBe("gold");
    expect(valueKind(box(40, 16, CREAM, cols))).toBe("white");
    expect(valueKind(box(40, 16, COIN, cols))).toBeNull();
    expect(valueKind(box(40, 16, CREAM, []))).toBeNull();
  });

  it("tách chữ ra ảnh đen trên trắng, phóng to", () => {
    const { pixels, count } = textMask(box(10, 8, GOLD, [3]), "gold", 2);
    expect(pixels.width).toBe(20);
    expect(count).toBe(2); // hàng 3 và 4 của cột 3
    const at = (x: number, y: number) => pixels.data[(y * pixels.width + x) * 4];
    expect(at(6, 8)).toBe(0);
    expect(at(0, 0)).toBe(255);
  });

  it("ảnh xám cho nick: chữ kem → tối, nền nâu → trắng", () => {
    const ink = textInk(box(4, 8, CREAM, [1]));
    expect(ink.data[(4 * 4 + 1) * 4]).toBe(0);
    expect(ink.data[(4 * 4 + 0) * 4]).toBe(255);
  });

  it("đọc chuỗi Tesseract trả về", () => {
    expect(parseClock("14:54")).toBe("14:54");
    expect(parseClock(" 9 : 05\n")).toBe("9:05");
    expect(parseClock("1:75")).toBeNull();
    expect(parsePoints("1020")).toBe("1020");
    expect(parsePoints("8 1020")).toBe("1020");
    expect(parsePoints("")).toBeNull();
    // Đồng hồ chữ trắng (ngoài ván hoặc giờ từng nước) không được hiểu là điểm.
    expect(parsePoints("15:00")).toBeNull();
    expect(parsePoints("057")).toBeNull();
    expect(parsePoints("15")).toBeNull();
    expect(parseNick(" W39823757\n")).toBe("W39823757");
    expect(parseNick("EE")).toBeNull();
  });

  it("sao vàng / sao xám", () => {
    expect(isGoldStar(245, 190, 40)).toBe(true);
    expect(isGoldStar(70, 66, 60)).toBe(false);
  });

  it("đổi qua lại giây và mm:ss", () => {
    expect(clockSeconds("14:54")).toBe(894);
    expect(formatClock(894)).toBe("14:54");
    expect(formatClock(-3)).toBe("0:00");
    expect(formatClock(65.9)).toBe("1:05");
  });

  it("Stable: chỉ nhận giá trị đọc giống nhau 2 lần liên tiếp", () => {
    const s = new Stable<string>();
    expect(s.push("A1")).toBeNull();
    expect(s.push("A1")).toBe("A1");
    expect(s.push("AZ")).toBe("A1");
    expect(s.push(null)).toBe("A1");
    expect(s.push("B2")).toBe("A1");
    expect(s.push("B2")).toBe("B2");
  });
});
