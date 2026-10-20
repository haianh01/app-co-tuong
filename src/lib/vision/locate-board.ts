// Tìm lại bàn cờ trong khung chụp khi trang nguồn đổi bố cục (kéo giãn cửa sổ, phóng to/thu nhỏ trang): đoán lưới từ
// vùng màu gỗ của bàn cờ, rồi trang theo dõi dò tinh bằng cách so ảnh với thế cờ đang có (xem useScreenMirror).

import type { Pixels } from "./zigavn-panels";

/** Hình chữ nhật lưới (giao điểm góc trên-trái → góc dưới-phải) theo pixel của ảnh. */
export interface GridRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Màu gỗ mặt bàn (đo trên zigavn ~211,138,80; bàn gỗ sáng các trang khác ~233,200,142). */
function isWood(r: number, g: number, b: number): boolean {
  return r > 170 && g > 110 && g < 215 && b > 50 && b < 160 && r - b > 60;
}

/**
 * Đoạn dài nhất các chỉ số mà `ok` đúng, bỏ qua khe hở ngắn hơn `gap` (vạch kẻ lưới chạy suốt bàn cờ làm cột/hàng
 * đó gần như không có gỗ, không được làm đứt vùng).
 */
function longestRun(n: number, ok: (i: number) => boolean, gap: number): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  let last = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && ok(i)) {
      if (start < 0 || i - last > gap) {
        if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last];
        start = i;
      }
      last = i;
    }
  }
  if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last];
  return best;
}

/** Lưới 9×10 có tỉ lệ rộng/cao gần 8:9 (ô gần vuông); ngoài khoảng này thì không phải bàn cờ. */
const MIN_ASPECT = 0.7;
const MAX_ASPECT = 1.1;

/**
 * Đoán lưới từ vùng gỗ: các cột/hàng mà gỗ chiếm phần lớn chiều kia của vùng gỗ. Quân cờ và vạch kẻ chỉ che một phần
 * mỗi cột/hàng nên không làm đứt vùng. null nếu không thấy bàn gỗ đủ lớn.
 */
export function woodGrid(img: Pixels): GridRect | null {
  const { width: w, height: h, data } = img;
  const wood = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) wood[i] = isWood(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 1 : 0;
  const colCount = new Uint32Array(w);
  const rowCount = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (wood[y * w + x]) {
        colCount[x]++;
        rowCount[y]++;
      }
    }
  }
  // Ước lượng thô kích thước bàn từ cột/hàng nhiều gỗ nhất, rồi giữ các cột/hàng có gỗ chiếm >40% kích thước đó.
  const maxCol = Math.max(...colCount);
  const maxRow = Math.max(...rowCount);
  if (maxCol < h * 0.2 || maxRow < w * 0.1) return null;
  const gap = Math.max(4, Math.round(Math.min(w, h) / 100));
  const xs = longestRun(w, (x) => colCount[x] > 0.4 * maxCol, gap);
  const ys = longestRun(h, (y) => rowCount[y] > 0.4 * maxRow, gap);
  if (!xs || !ys) return null;
  const rect = { x0: xs[0], y0: ys[0], x1: xs[1], y1: ys[1] };
  const aspect = (rect.x1 - rect.x0) / Math.max(1, rect.y1 - rect.y0);
  return aspect >= MIN_ASPECT && aspect <= MAX_ASPECT ? rect : null;
}
