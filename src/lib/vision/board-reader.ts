// Đọc bàn cờ từ ảnh chụp màn hình một trang cờ khác, để bàn cờ trong app đi theo (chế độ tường thuật).
//
// Không nhận diện chữ trên quân, chỉ cần biết mỗi giao điểm đang trống, có quân đỏ hay quân đen: hai nước hợp lệ
// khác nhau luôn làm đổi những ô khác nhau, còn luật cờ cho biết quân nào đang đi. Lúc hiệu chỉnh, trang nguồn
// phải đang ở thế cờ ban đầu nên ta chụp luôn ảnh mẫu quân đỏ, quân đen và từng ô trống. Sau đó mỗi khung hình
// chỉ cần hỏi "trong các nước hợp lệ, nước nào làm ảnh khớp hơn hẳn thế cờ hiện tại?". Vì chỉ so ảnh với chính
// giao diện của trang đó nên dùng được với mọi skin.
//
// (Phân biệt từng loại quân qua ảnh thì không chắc: trên ảnh thật một ô chỉ vài chục px, lệch nửa px khi chọn góc
// đã đủ làm hai quân xe khác nhau hơn một xe và một mã.)

import { Board, Move, Piece, Position, Side, applyMove, legalMoves, sideOf } from "@/lib/xiangqi/engine";

/** Số px của một ô trên ảnh chuẩn hóa (vùng bàn cờ được co về 9×10 ô). */
export const CELL_PX = 24;
export const GRID_W = 9 * CELL_PX;
export const GRID_H = 10 * CELL_PX;

/** Chỉ lấy điểm ảnh trong hình tròn bán kính này quanh giao điểm: tránh khung/góc đánh dấu nước vừa đi. */
const SAMPLE_RADIUS = Math.round(CELL_PX * 0.38);
const SAMPLE_STEP = 2;
/**
 * Mỗi điểm lấy trung bình ô vuông (2·BLUR+1)² px quanh nó. Không làm mờ thì quân ở ô khác (lệch nửa px so với lưới
 * lấy mẫu) đã khác mẫu gần bằng quân với ô trống.
 */
const BLUR = 2;
const SAMPLE_OFFSETS = (() => {
  const out: [number, number][] = [];
  for (let dy = -SAMPLE_RADIUS; dy <= SAMPLE_RADIUS; dy += SAMPLE_STEP) {
    for (let dx = -SAMPLE_RADIUS; dx <= SAMPLE_RADIUS; dx += SAMPLE_STEP) {
      if (dx * dx + dy * dy <= SAMPLE_RADIUS * SAMPLE_RADIUS) out.push([dx, dy]);
    }
  }
  return out;
})();

/** Màu RGB (0..1) của các điểm lấy mẫu quanh một giao điểm. */
export type Patch = Float32Array;

/** Tọa độ (px, theo ảnh gốc) của giao điểm góc trên-trái và góc dưới-phải của lưới, như người dùng nhìn thấy. */
export interface Calibration {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Vùng cần cắt từ ảnh gốc: lưới cộng thêm nửa ô mỗi phía để giao điểm rơi vào giữa ô của ảnh chuẩn hóa. */
export function sourceRect(cal: Calibration) {
  const cw = (cal.x1 - cal.x0) / 8;
  const ch = (cal.y1 - cal.y0) / 9;
  return { sx: cal.x0 - cw / 2, sy: cal.y0 - ch / 2, sw: cw * 9, sh: ch * 10 };
}

/** Cắt 90 mẫu từ ảnh chuẩn hóa GRID_W×GRID_H (RGBA). Thứ tự theo màn hình: hàng trên cùng trước. */
export function extractPatches(data: Uint8ClampedArray): Patch[] {
  const patches: Patch[] = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const cx = c * CELL_PX + CELL_PX / 2;
      const cy = r * CELL_PX + CELL_PX / 2;
      const p = new Float32Array(SAMPLE_OFFSETS.length * 3);
      SAMPLE_OFFSETS.forEach(([dx, dy], k) => {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let by = -BLUR; by <= BLUR; by++) {
          for (let bx = -BLUR; bx <= BLUR; bx++) {
            const x = Math.min(GRID_W - 1, Math.max(0, Math.round(cx + dx + bx)));
            const y = Math.min(GRID_H - 1, Math.max(0, Math.round(cy + dy + by)));
            const o = (y * GRID_W + x) * 4;
            r += data[o];
            g += data[o + 1];
            b += data[o + 2];
            n++;
          }
        }
        p[k * 3] = r / n / 255;
        p[k * 3 + 1] = g / n / 255;
        p[k * 3 + 2] = b / n / 255;
      });
      patches.push(p);
    }
  }
  return patches;
}

export function patchDistance(a: Patch, b: Patch): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s / a.length;
}

/** Ô thứ `screen` trên màn hình nguồn ứng với ô nào của bàn cờ, khi phe `bottom` ngồi phía dưới. */
export const screenToSquare = (screen: number, bottom: Side) => (bottom === "r" ? screen : 89 - screen);

/** Đổi 90 mẫu từ thứ tự màn hình sang thứ tự ô cờ của engine. */
export function toBoardOrder(screenPatches: Patch[], bottom: Side): Patch[] {
  const out = new Array<Patch>(90);
  screenPatches.forEach((p, i) => {
    out[screenToSquare(i, bottom)] = p;
  });
  return out;
}

/** Nhãn của một giao điểm: trống, có quân đỏ, có quân đen. */
type Label = "" | Side;
const labelOf = (p: Piece | null): Label => (p ? sideOf(p) : "");

export interface Templates {
  /** Mẫu quân của mỗi phe (16 mẫu mỗi phe từ thế ban đầu). */
  pieces: Record<Side, Patch[]>;
  /** Mẫu ô trống của chính ô đó (nếu đã từng thấy ô đó trống). */
  emptyAt: (Patch | null)[];
  /** Mọi mẫu ô trống, dùng khi ô chưa có mẫu riêng. */
  emptyAll: Patch[];
}

export function learnTemplates(patches: Patch[], board: Board): Templates {
  const pieces: Record<Side, Patch[]> = { r: [], b: [] };
  const emptyAt: (Patch | null)[] = Array(90).fill(null);
  const emptyAll: Patch[] = [];
  board.forEach((p, i) => {
    if (p) pieces[sideOf(p)].push(patches[i]);
    else {
      emptyAt[i] = patches[i];
      emptyAll.push(patches[i]);
    }
  });
  return { pieces, emptyAt, emptyAll };
}

/** Độ "đỏ" của mẫu: chữ trên quân đỏ làm kênh R vượt hẳn G, B. */
function redness(p: Patch): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 3) s += Math.max(0, p[i] - Math.max(p[i + 1], p[i + 2]));
  return s / (p.length / 3);
}

export interface CalibrationResult {
  bottom: Side;
  templates: Templates;
  /** Tỉ lệ ô mà ô giống nhất với nó có cùng nhãn trống/đỏ/đen (0..1). Thấp nghĩa là chọn sai góc hoặc trang kia chưa ở thế ban đầu. */
  confidence: number;
}

/**
 * Hiệu chỉnh từ ảnh thế cờ ban đầu. `bottom` để trống thì tự đoán phe ngồi dưới theo màu chữ trên quân.
 * `start` là bàn cờ ban đầu của engine (hàng 0 là phía Đen).
 */
export function calibrate(screenPatches: Patch[], start: Board, bottom?: Side): CalibrationResult {
  if (!bottom) {
    // Màn hình hàng 0–3 và 6–9 là hai phe; quân đỏ nằm phía nào thì phía đó "đỏ" hơn.
    let top = 0;
    let low = 0;
    screenPatches.forEach((p, i) => {
      const r = Math.floor(i / 9);
      if (r <= 3) top += redness(p);
      else if (r >= 6) low += redness(p);
    });
    bottom = low >= top ? "r" : "b";
  }
  const patches = toBoardOrder(screenPatches, bottom);
  const templates = learnTemplates(patches, start);

  // Kiểm tra: mỗi ô phải giống nhất với một ô khác cùng nhãn.
  let ok = 0;
  patches.forEach((p, i) => {
    let best = Infinity;
    let bestLabel: Label = "";
    patches.forEach((q, j) => {
      if (j === i) return;
      const d = patchDistance(p, q);
      if (d < best) {
        best = d;
        bestLabel = labelOf(start[j]);
      }
    });
    if (bestLabel === labelOf(start[i])) ok++;
  });
  return { bottom, templates, confidence: ok / 90 };
}

/**
 * Ô đổi nhãn phải khớp nhãn mới tốt hơn rõ rệt (khoảng cách mới < IMPROVE × khoảng cách cũ) và nhãn mới phải là
 * nhãn khớp nhất trong ba nhãn. Không đặt chặt hơn được: ô ở mép bàn (hàng cuối có quân từ đầu ván) chưa có mẫu
 * ô trống riêng, lần đầu trống chỉ khớp "trống" tốt hơn "có quân" khoảng 2 lần.
 */
const IMPROVE = 0.7;
const LABELS: Label[] = ["", "r", "b"];
/**
 * Sau nước ứng viên, số ô mà nhãn khớp nhất trên ảnh khác nhãn trên bàn cờ không được vượt quá mức này. Chặn trường
 * hợp ảnh không còn là ván đang theo dõi (trang kia đóng ván, chuyển trang, chọn sai vùng): khi đó "ăn qua ăn lại"
 * nào cũng giải thích được vài ô vừa trống.
 */
const MAX_MISMATCH = 3;
/** Một ô coi là "đổi" khi khác nhãn cũ quá NOISE_FACTOR lần độ nhiễu thường gặp (trung vị toàn bàn). */
const NOISE_FACTOR = 4;
const MIN_NOISE = 1e-4;

/**
 * Theo dõi ván cờ qua từng khung hình. Gọi `feed` với 90 mẫu (thứ tự màn hình) mỗi lần chụp; trả về các nước
 * vừa phát hiện (thường là 0 hoặc 1, tối đa 2 nếu hai bên đi liền trong một nhịp chụp).
 */
export class MoveTracker {
  position: Position;
  /**
   * Chẩn đoán khung gần nhất (hiện cho người dùng): ảnh còn đang chuyển động không, và (khi ảnh đứng yên, sau khi
   * đã xét nước mới) bao nhiêu ô trên ảnh khác thế cờ đang theo dõi. Lệch nhiều ô kéo dài = mất dấu ván.
   */
  last: { moving: boolean; mismatched: number[] } = { moving: false, mismatched: [] };
  private prev: Patch[] | null = null;

  constructor(
    private templates: Templates,
    private bottom: Side,
    position: Position,
  ) {
    this.position = position;
  }

  /** Đặt lại thế cờ (sau khi người dùng sửa tay hoặc lùi nước). */
  setPosition(pos: Position) {
    this.position = pos;
    this.prev = null;
  }

  feed(screenPatches: Patch[]): Move[] {
    const patches = toBoardOrder(screenPatches, this.bottom);
    const prev = this.prev;
    this.prev = patches;
    const noise = this.noiseFloor(patches);
    // Ảnh còn đang thay đổi (quân đang trượt, hiệu ứng) thì chờ khung sau, tránh nhận nhầm điểm dừng giữa đường.
    if (!prev) return [];
    this.last = { moving: true, mismatched: this.last.mismatched };
    for (let i = 0; i < 90; i++) if (patchDistance(prev[i], patches[i]) > NOISE_FACTOR * noise) return [];

    const moves = this.infer(patches, noise);
    for (const m of moves) {
      const before = this.position.board;
      this.position = applyMove(this.position, m);
      // Ô vừa trống lần đầu: lưu mẫu ô trống riêng của nó cho các lần sau.
      if (!this.templates.emptyAt[m.from] && before[m.from]) this.templates.emptyAt[m.from] = patches[m.from];
    }
    const board = this.position.board;
    const mismatched: number[] = [];
    for (let i = 0; i < 90; i++) {
      const label = labelOf(board[i]);
      if ((["", "r", "b"] as Label[]).some((l) => l !== label && this.dist(patches[i], l, i) < this.dist(patches[i], label, i))) mismatched.push(i);
    }
    this.last = { moving: false, mismatched };
    return moves;
  }

  private noiseFloor(patches: Patch[]): number {
    const board = this.position.board;
    const ds = patches.map((p, i) => this.dist(p, labelOf(board[i]), i)).sort((a, b) => a - b);
    return Math.max(MIN_NOISE, ds[45]);
  }

  private dist(p: Patch, label: Label, square: number): number {
    if (!label) {
      const own = this.templates.emptyAt[square];
      if (own) return patchDistance(p, own);
      return Math.min(...this.templates.emptyAll.map((t) => patchDistance(p, t)));
    }
    return Math.min(...this.templates.pieces[label].map((t) => patchDistance(p, t)));
  }

  /** Nước (hoặc cặp nước) hợp lệ giải thích ảnh tốt nhất; rỗng nếu thế cờ hiện tại vẫn khớp. */
  private infer(patches: Patch[], noise: number): Move[] {
    const cache = new Map<string, number>();
    const d = (i: number, label: Label) => {
      const key = `${i}:${label}`;
      let v = cache.get(key);
      if (v === undefined) {
        v = this.dist(patches[i], label, i);
        cache.set(key, v);
      }
      return v;
    };
    const before = this.position.board;
    // Nhãn khớp nhất của từng ô trên ảnh.
    const seen = patches.map((_, i) => LABELS.reduce((a, l) => (d(i, l) < d(i, a) ? l : a)));
    // Điểm của một thế cờ ứng viên: mọi ô đổi nhãn đều phải khớp nhãn mới hơn hẳn; điểm càng âm càng tốt.
    const score = (after: Board): number | null => {
      let total = 0;
      let changed = 0;
      for (let i = 0; i < 90; i++) {
        const was = labelOf(before[i]);
        const is = labelOf(after[i]);
        if (was === is) continue;
        const old = d(i, was);
        const now = d(i, is);
        if (old <= NOISE_FACTOR * noise || now >= IMPROVE * old) return null;
        if (LABELS.some((l) => l !== is && d(i, l) < now)) return null;
        total += now - old;
        changed++;
      }
      // Hai nước triệt tiêu nhau (đi rồi lui về) không làm đổi ô nào: không phải lời giải thích.
      if (!changed) return null;
      let mismatch = 0;
      for (let i = 0; i < 90; i++) if (seen[i] !== labelOf(after[i]) && ++mismatch > MAX_MISMATCH) return null;
      return total;
    };

    let best: { moves: Move[]; score: number } | null = null;
    for (const m of legalMoves(this.position)) {
      const s = score(applyMove(this.position, m).board);
      if (s !== null && (!best || s < best.score)) best = { moves: [m], score: s };
    }
    if (best) return best.moves;

    // Không nước đơn nào khớp: thử hai nước liền nhau (đối phương đáp rất nhanh giữa hai lần chụp).
    for (const m1 of legalMoves(this.position)) {
      const p1 = applyMove(this.position, m1);
      for (const m2 of legalMoves(p1)) {
        const s = score(applyMove(p1, m2).board);
        if (s !== null && (!best || s < best.score)) best = { moves: [m1, m2], score: s };
      }
    }
    return best?.moves ?? [];
  }
}
