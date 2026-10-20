// Đọc ô thông tin người chơi hai bên bàn cờ của zigavn.com: nick, điểm (trước ván) / đồng hồ (trong ván), số sao.
//
// Vị trí đo trên ảnh chụp tab zigavn (982×624 CSS px), tính theo lưới bàn cờ: (0,0) là giao điểm góc trên-trái,
// (1,1) là giao điểm góc dưới-phải — đúng hai góc người dùng bấm khi bắt đầu theo dõi. Giao diện zigavn co giãn
// đều theo cửa sổ nên các tỉ lệ này giữ nguyên. Ô trái luôn là người đang đăng nhập (người dẫn), ô phải là đối thủ.
//
// Ô điểm/đồng hồ dùng chung một chỗ: trước ván là điểm chữ TRẮNG cạnh đồng xu, trong ván là đồng hồ chữ VÀNG cạnh
// quân Tướng/Soái. Vì vậy tách chữ theo màu chứ không theo vị trí (biểu tượng hai lúc to nhỏ khác nhau).

export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type PanelSide = "me" | "opponent";

export const ZIGAVN_PANELS: Record<PanelSide, { name: Region; value: Region; stars: { x: number; y: number }[] }> = {
  me: {
    name: { x0: -0.455, y0: 0.311, x1: -0.183, y1: 0.348 },
    value: { x0: -0.411, y0: 0.379, x1: -0.258, y1: 0.413 },
    stars: [-0.3695, -0.3169, -0.2649].map((x) => ({ x, y: 0.2547 })),
  },
  opponent: {
    name: { x0: 1.19, y0: 0.311, x1: 1.462, y1: 0.348 },
    value: { x0: 1.234, y0: 0.379, x1: 1.387, y1: 0.413 },
    stars: [1.2752, 1.3279, 1.3798].map((x) => ({ x, y: 0.2547 })),
  },
};

/** Ảnh RGBA tối giản (cùng dạng ImageData của trình duyệt) để test được trên Node. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type TextColor = "white" | "gold";

function isText(r: number, g: number, b: number, color: TextColor): boolean {
  // Chữ "trắng" thật ra màu kem (~251,234,180): sáng, lục cao gần bằng đỏ. Nền ô nâu tối, đồng xu cam (lục thấp hơn).
  if (color === "white") return r > 190 && g > 180 && b > 120 && r - g < 40;
  // Chữ vàng của đồng hồ (~250,192,34): đỏ và lục cao, lam rất thấp. Đồng xu cam (~222,160,96) lam cao hơn hẳn.
  return r > 180 && g > 140 && b < 75 && r - b > 140;
}

/**
 * Tách chữ theo màu: trả về ảnh chữ ĐEN trên nền TRẮNG (dạng Tesseract đọc tốt nhất), phóng to `scale` lần, cùng số
 * điểm ảnh chữ tìm được (0 = không có chữ màu đó).
 */
export function textMask(img: Pixels, color: TextColor, scale = 3): { pixels: Pixels; count: number } {
  const w = img.width * scale;
  const h = img.height * scale;
  const out = new Uint8ClampedArray(w * h * 4).fill(255);
  let count = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      if (!isText(img.data[o], img.data[o + 1], img.data[o + 2], color)) continue;
      count++;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const p = ((y * scale + dy) * w + x * scale + dx) * 4;
          out[p] = out[p + 1] = out[p + 2] = 0;
        }
      }
    }
  }
  return { pixels: { width: w, height: h, data: out }, count };
}

/**
 * Chữ kem trên nền nâu (ô nick) giữ độ đậm nhạt thay vì đen/trắng tuyệt đối: chữ nhỏ (~9px) mà cắt ngưỡng thì nét
 * dính nhau, Tesseract đọc nhầm 8↔5, 2↔Z. Trả về ảnh xám (chữ tối trên nền sáng) cùng kích thước; người gọi phóng to
 * mượt (canvas drawImage) trước khi đọc.
 */
export function textInk(img: Pixels): Pixels {
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const lum = 0.3 * img.data[i] + 0.59 * img.data[i + 1] + 0.11 * img.data[i + 2];
    // Nền ô ~75, chữ ~228.
    const ink = Math.min(1, Math.max(0, (lum - 95) / (215 - 95)));
    out[i] = out[i + 1] = out[i + 2] = Math.round(255 * (1 - ink));
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** Chữ vàng chiếm ít nhất chừng này phần ô thì ô đang là đồng hồ. */
const MIN_TEXT_SHARE = 0.03;

/** Ô điểm/đồng hồ đang hiện loại nào. null: ô trống hoặc bị che. */
export function valueKind(img: Pixels): TextColor | null {
  const total = img.width * img.height;
  if (textMask(img, "gold", 1).count >= MIN_TEXT_SHARE * total) return "gold";
  if (textMask(img, "white", 1).count >= MIN_TEXT_SHARE * total) return "white";
  return null;
}

/** "14:54" → "14:54"; chuỗi Tesseract đọc lẫn ký tự rác thì lấy cụm mm:ss đầu tiên hợp lệ. */
export function parseClock(text: string): string | null {
  const m = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(text);
  if (!m || Number(m[2]) > 59) return null;
  return `${Number(m[1])}:${m[2]}`;
}

/**
 * Điểm: một số 3–6 chữ số, không bắt đầu bằng 0. Chuỗi có dạng giờ ("15:00", hay "057" do mất dấu hai chấm của
 * "0:57") là đồng hồ chữ trắng chứ không phải điểm.
 */
export function parsePoints(text: string): string | null {
  if (parseClock(text) || /[:.]/.test(text)) return null;
  const runs = text.match(/\d+/g);
  if (!runs) return null;
  const n = runs.reduce((a, b) => (b.length > a.length ? b : a));
  return /^[1-9]\d{2,5}$/.test(n) ? n : null;
}

/** Nick zigavn: chữ và số liền nhau (thường dạng W39823757). Bỏ khoảng trắng, ký tự lạ do đọc nhầm viền. */
export function parseNick(text: string): string | null {
  const t = text.replace(/[^A-Za-z0-9_.]/g, "");
  return t.length >= 3 && t.length <= 24 ? t : null;
}

/** Ngôi sao đã đạt: vàng sáng; chưa đạt: xám tối. */
export function isGoldStar(r: number, g: number, b: number): boolean {
  return r > 170 && g > 120 && b < 100 && r - b > 100;
}

/** Mm:ss → giây. */
export function clockSeconds(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Một giá trị chỉ được nhận khi đọc ra giống nhau `need` lần liên tiếp: một khung bị che (hiệu ứng, chuột lướt qua)
 * không làm nick nhảy lung tung.
 */
export class Stable<T> {
  private candidate: T | null = null;
  private seen = 0;
  value: T | null = null;
  constructor(private readonly need = 2) {}
  push(v: T | null): T | null {
    if (v === null) return this.value;
    if (v === this.candidate) this.seen++;
    else {
      this.candidate = v;
      this.seen = 1;
    }
    if (this.seen >= this.need) this.value = v;
    return this.value;
  }
}
