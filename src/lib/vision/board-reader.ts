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

import { Board, Move, Piece, Position, Side, applyMove, legalMoves, sideOf, toFen } from "@/lib/xiangqi/engine";

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

/** Vị trí của điểm lấy mẫu đối xứng qua trục dọc / trục ngang (để lật mẫu của ô đối xứng). */
const FLIP = (() => {
  const index = new Map(SAMPLE_OFFSETS.map(([dx, dy], k) => [`${dx},${dy}`, k]));
  return {
    x: SAMPLE_OFFSETS.map(([dx, dy]) => index.get(`${-dx},${dy}`)!),
    y: SAMPLE_OFFSETS.map(([dx, dy]) => index.get(`${dx},${-dy}`)!),
  };
})();

function flipPatch(p: Patch, map: number[]): Patch {
  const out = new Float32Array(p.length);
  map.forEach((src, k) => {
    out[k * 3] = p[src * 3];
    out[k * 3 + 1] = p[src * 3 + 1];
    out[k * 3 + 2] = p[src * 3 + 2];
  });
  return out;
}

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
  /**
   * Số ô mà thế ban đầu có quân nhưng ảnh trông như ô trống, hoặc ngược lại. Quân và ô trống khác nhau rất xa nên
   * nhiễu hay chọn góc hơi lệch không gây ra; khác 0 gần như chắc chắn là trang kia đã đi nước trước khi hiệu chỉnh
   * (một nước đã làm 2 ô sai, mà `confidence` vẫn còn ~0.98).
   */
  misplaced: number;
  mismatchedSquares?: number[];
}

/**
 * Hiệu chỉnh từ ảnh của thế cờ `start` (thường là thế ban đầu, hoặc thế người dùng đã tự đi tới cho khớp trang kia;
 * hàng 0 là phía Đen). `bottom` để trống thì tự đoán phe ngồi dưới theo màu chữ trên quân và độ khớp hình ảnh.
 */
export function calibrate(screenPatches: Patch[], start: Board, bottom?: Side): CalibrationResult {
  const evaluate = (b: Side): CalibrationResult => {
    const patches = toBoardOrder(screenPatches, b);
    const templates = learnTemplates(patches, start);

    // Kiểm tra: mỗi ô phải giống nhất với một ô khác cùng nhãn.
    let ok = 0;
    let misplaced = 0;
    const mismatchedSquares: number[] = [];
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
      if (bestLabel === labelOf(start[i])) {
        ok++;
      } else {
        mismatchedSquares.push(i);
        if (!bestLabel !== !start[i]) misplaced++;
      }
    });
    return { bottom: b, templates, confidence: ok / 90, misplaced, mismatchedSquares };
  };

  if (bottom) return evaluate(bottom);

  const resR = evaluate("r");
  const resB = evaluate("b");

  // Nếu một bên có misplaced = 0 và bên kia misplaced > 0 khi confidence tốt:
  if (resR.misplaced === 0 && resB.misplaced > 0 && resR.confidence >= 0.8) return resR;
  if (resB.misplaced === 0 && resR.misplaced > 0 && resB.confidence >= 0.8) return resB;
  if (resR.confidence >= resB.confidence + 0.05) return resR;
  if (resB.confidence >= resR.confidence + 0.05) return resB;

  const fit = (side: Side) =>
    start.reduce((sum, p, sq) => (p ? sum + (sideOf(p) === "r" ? 1 : -1) * redness(screenPatches[screenToSquare(sq, side)]) : sum), 0);
  return fit("r") >= fit("b") ? resR : resB;
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
/** Số nước tối đa đọc bù một lần, khi ảnh không đọc được một lúc mà ván bên kia vẫn đi tiếp. */
const MAX_MISSED = 6;
/** Giới hạn số thế cờ xét trong một lần tìm, để một nhịp chụp không bao giờ treo trang. */
const SEARCH_BUDGET = 40_000;
/** Cần thấy dấu "nước vừa đi" ở chừng này nước trước khi tin vào nó. */
const MARK_MIN_SAMPLES = 2;

/** Tích vô hướng (chia số phần tử, cùng thang với `patchDistance`) của (a − b) với r. */
function projection(a: Patch, b: Patch, r: Patch): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += (a[i] - b[i]) * r[i];
  return s / r.length;
}

/**
 * Theo dõi ván cờ qua từng khung hình. Gọi `feed` với 90 mẫu (thứ tự màn hình) mỗi lần chụp; trả về các nước
 * vừa phát hiện (thường là 0 hoặc 1; nhiều hơn khi phải đọc bù, tối đa MAX_MISSED).
 */
export class MoveTracker {
  position: Position;
  /**
   * Chẩn đoán khung gần nhất (hiện cho người dùng): ảnh còn đang chuyển động không, và (khi ảnh đứng yên, sau khi
   * đã xét nước mới) bao nhiêu ô trên ảnh khác thế cờ đang theo dõi. Lệch nhiều ô kéo dài = mất dấu ván.
   */
  last: { moving: boolean; mismatched: number[] } = { moving: false, mismatched: [] };
  private prev: Patch[] | null = null;
  /**
   * Ảnh (nhãn từng ô) + thế cờ của lần tìm gần nhất không ra lời giải: ảnh còn đứng yên từ đó thì khỏi tìm lại mỗi
   * nhịp. Xóa khi ảnh đổi.
   */
  private failedKey: string | null = null;
  /** Nước đơn đọc được gần nhất và ảnh lúc đó, khi trang kia còn đang đánh dấu nó là nước vừa đi. */
  private marking: { move: Move; patches: Patch[] } | null = null;
  /**
   * Dấu "nước vừa đi" của trang kia ở ô đi và ô đến (tổng cộng dồn qua `n` nước): ảnh ô lúc có dấu trừ ảnh chính ô
   * đó sau nước kế tiếp, khi dấu đã chuyển đi. Học từ chính trang kia nên đúng với mọi giao diện; trang không đánh
   * dấu thì phần này chỉ còn nhiễu và không được dùng.
   */
  private mark: { from: Float32Array; to: Float32Array; n: number } | null = null;

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
    this.marking = null;
  }

  feed(screenPatches: Patch[]): Move[] {
    const patches = toBoardOrder(screenPatches, this.bottom);
    const prev = this.prev;
    this.prev = patches;
    const noise = this.noiseFloor(patches);
    // Ảnh còn đang thay đổi (quân đang trượt, hiệu ứng) thì chờ khung sau, tránh nhận nhầm điểm dừng giữa đường.
    if (!prev) return [];
    this.last = { moving: true, mismatched: this.last.mismatched };
    for (let i = 0; i < 90; i++) {
      if (patchDistance(prev[i], patches[i]) > NOISE_FACTOR * noise) {
        // Ảnh vừa đổi: lần tìm thất bại trước không còn đúng cho ảnh mới (dù nhãn từng ô có thể y hệt).
        this.failedKey = null;
        return [];
      }
    }

    const moves = this.infer(patches, noise);
    this.learnMark(moves, patches);
    for (const m of moves) this.position = applyMove(this.position, m);
    const board = this.position.board;
    // Ô vừa trống lần đầu: lưu mẫu ô trống riêng của nó cho các lần sau. Xét ở thế cuối: trong chuỗi nhiều nước, ô
    // xuất phát của nước trước có thể đã bị quân khác đi vào. Trừ ô đi của nước cuối: trang kia đang đánh dấu nó,
    // mẫu chụp bây giờ lẫn cả dấu (learnMark lấy lại khi dấu đã chuyển đi).
    for (const m of moves.slice(0, -1)) if (!this.templates.emptyAt[m.from] && !board[m.from]) this.templates.emptyAt[m.from] = patches[m.from];
    const mismatched: number[] = [];
    for (let i = 0; i < 90; i++) {
      const label = labelOf(board[i]);
      if ((["", "r", "b"] as Label[]).some((l) => l !== label && this.dist(patches[i], l, i) < this.dist(patches[i], label, i))) mismatched.push(i);
    }
    this.last = { moving: false, mismatched };
    return moves;
  }

  /**
   * Hình ô trống của ô `square`: mẫu riêng nếu ô đã từng trống, không thì lật mẫu của ô đối xứng (vạch kẻ bàn cờ
   * đối xứng trái–phải, trên–dưới). Ô có quân từ đầu ván (góc xe, ô tướng…) hay được mượn kiểu này. Hình nền sát
   * thì ít ô bị tưởng nhầm là có dấu nước vừa đi, bộ tìm khi đọc bù xét ít nước hơn hẳn.
   */
  private emptyLike(square: number): Patch | null {
    const own = this.templates.emptyAt[square];
    if (own) return own;
    const r = Math.floor(square / 9);
    const c = square % 9;
    const mirrors: [number, number[][]][] = [
      [r * 9 + (8 - c), [FLIP.x]],
      [(9 - r) * 9 + c, [FLIP.y]],
      [(9 - r) * 9 + (8 - c), [FLIP.x, FLIP.y]],
    ];
    for (const [sq, flips] of mirrors) {
      const t = this.templates.emptyAt[sq];
      if (t) return flips.reduce((p, map) => flipPatch(p, map), t);
    }
    return null;
  }

  /** Có nước mới: ô đi / ô đến của nước đơn trước đó đã hết dấu, so với ảnh lúc còn dấu thì ra hình của dấu. */
  private learnMark(moves: Move[], patches: Patch[]) {
    if (!moves.length) return;
    const was = this.marking;
    this.marking = moves.length === 1 ? { move: moves[0], patches } : null;
    if (!was) return;
    const { move: m, patches: then } = was;
    if (moves.some((x) => [x.from, x.to].some((sq) => sq === m.from || sq === m.to))) return;
    const add = (sum: Float32Array | undefined, sq: number) => {
      const out = sum ?? new Float32Array(then[sq].length);
      for (let i = 0; i < out.length; i++) out[i] += then[sq][i] - patches[sq][i];
      return out;
    };
    this.mark = { from: add(this.mark?.from, m.from), to: add(this.mark?.to, m.to), n: (this.mark?.n ?? 0) + 1 };
    // Ô đi giờ trống mà không còn dấu: làm mẫu ô trống riêng tốt hơn mẫu chụp lúc còn dấu.
    this.templates.emptyAt[m.from] = patches[m.from];
  }

  /** Hình dấu ở ô đi / ô đến, chỉ những phần nổi hẳn trên nhiễu; null nếu chưa học đủ hoặc trang kia không đánh dấu. */
  private markModel(noise: number): { from: Patch | null; to: Patch | null } | null {
    if (!this.mark || this.mark.n < MARK_MIN_SAMPLES) return null;
    const { n } = this.mark;
    const visible = (sum: Float32Array) => {
      const r = sum.map((v) => v / n);
      return patchDistance(r, new Float32Array(r.length)) > NOISE_FACTOR * noise ? r : null;
    };
    const from = visible(this.mark.from);
    const to = visible(this.mark.to);
    return from || to ? { from, to } : null;
  }

  /**
   * Nước `m` có phải nước vừa đi theo dấu trên ảnh không: chiếu phần chênh của ô so với hình thường lên hình dấu.
   * Mỗi ô cho khoảng +1 nếu có dấu, −1 nếu không; sai lệch của hình thường (mượn từ ô khác) gần như không ảnh hưởng
   * vì chỉ phần trùng hướng với dấu mới được tính.
   */
  private markEvidence(m: Move, after: Board, patches: Patch[], model: { from: Patch | null; to: Patch | null }): number {
    return this.markAt(patches, m.from, "", model.from) + this.markAt(patches, m.to, labelOf(after[m.to]), model.to);
  }

  /** Ô `square` (nhãn `label`) có mang dấu `r` không: khoảng +1 nếu có, −1 nếu không, 0 khi không có hình dấu. */
  private markAt(patches: Patch[], square: number, label: Label, r: Patch | null): number {
    if (!r) return 0;
    const e = patchDistance(r, new Float32Array(r.length));
    return (2 * projection(patches[square], this.base(patches[square], label, square), r) - e) / e;
  }

  /** Mẫu không dấu gần nhất với `p` cho nhãn `label` ở ô `square`. */
  private base(p: Patch, label: Label, square: number): Patch {
    const own = label ? null : this.emptyLike(square);
    if (own) return own;
    const ts = label ? this.templates.pieces[label] : this.templates.emptyAll;
    return ts.reduce((a, t) => (patchDistance(p, t) < patchDistance(p, a) ? t : a));
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
    // Điểm của một thế cờ ứng viên: mọi ô đổi nhãn đều phải khớp nhãn mới hơn hẳn; điểm càng âm càng tốt. Kèm số ô
    // trên ảnh vẫn khác thế cờ đó.
    const score = (after: Board): { total: number; mismatch: number } | null => {
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
      return { total, mismatch };
    };

    // Ô mà ảnh khác thế cờ hiện tại. Ô đổi nhãn nào cũng phải nằm trong đây (score đòi nhãn mới khớp nhất), nên
    // không có ô nào thì chẳng nước nào giải thích được, và mỗi nước trong chuỗi phải đi từ hoặc tới một ô trong đây
    // (hoặc ô có dấu, xem dưới).
    const diff = new Set<number>();
    for (let i = 0; i < 90; i++) if (seen[i] !== labelOf(before[i])) diff.add(i);
    if (!diff.size) return [];
    const key = `${seen.join(",")}|${toFen(this.position)}`;
    if (key === this.failedKey) return [];
    const model = this.markModel(noise);
    // Ô đang mang dấu nước vừa đi cũng được xét: quân đi ra rồi quay về chỗ cũ không làm đổi ô nào trên ảnh, chỉ để
    // lại dấu ở ô nó vừa rời.
    const touch = new Set(diff);
    if (model) {
      for (let i = 0; i < 90; i++) {
        if (this.markAt(patches, i, seen[i], seen[i] ? model.to : model.from) > 0) touch.add(i);
      }
    }
    const mismatchOf = (board: Board) => {
      let n = 0;
      for (let i = 0; i < 90; i++) if (seen[i] !== labelOf(board[i])) n++;
      return n;
    };

    // Ít nước trước: thường là 1 nước, 2 khi đối phương đáp nhanh giữa hai lần chụp, nhiều hơn khi ảnh không đọc
    // được một lúc (người dùng chuyển cửa sổ, ảnh bị che) mà ván bên kia vẫn đi tiếp. Chuỗi ngắn còn lệch vài ô có
    // thể là chuỗi dài hơn bị bỏ sót một nước (lệch ≤ MAX_MISMATCH vẫn được nhận): tìm tiếp sâu hơn, chuỗi dài chỉ
    // thắng khi khớp ảnh hơn hẳn.
    // Đọc bù nhiều nước thì ảnh cuối không cho biết thứ tự (xe rồi mã hay mã rồi xe ra cùng thế cờ), có khi cả số nước
    // (xe đi thẳng hay dừng giữa đường), tức là bên nào vừa đi. Dấu "nước vừa đi" của trang kia cho biết nước cuối:
    // ưu tiên chuỗi kết thúc đúng chỗ có dấu, kể cả phải dài hơn 1–2 nước.
    type Candidate = { moves: Move[]; total: number; mismatch: number; mark: number; marked: boolean };
    const better = (a: Candidate, b: Candidate | null) => {
      if (!b) return true;
      if (a.mismatch !== b.mismatch) return a.mismatch < b.mismatch;
      if (a.marked !== b.marked) return a.marked;
      if (a.moves.length !== b.moves.length) return a.moves.length < b.moves.length;
      // Cùng số nước (thường là cùng các nước, khác thứ tự): nước cuối nào trông có dấu hơn thì thắng.
      if (model && a.mark !== b.mark) return a.mark > b.mark;
      return a.total < b.total;
    };
    // Gán trong hàm walk: ép kiểu để TypeScript không thu hẹp về null.
    let best = null as Candidate | null;
    let budget = SEARCH_BUDGET;
    const walk = (pos: Position, moves: Move[], depth: number) => {
      if (budget-- <= 0) return;
      if (moves.length === depth) {
        const s = score(pos.board);
        if (!s) return;
        const mark = model ? this.markEvidence(moves[moves.length - 1], pos.board, patches, model) : 0;
        const c = { moves: [...moves], ...s, mark, marked: mark > 0 };
        if (better(c, best)) best = c;
        return;
      }
      // Mỗi nước chỉ đổi nhãn 2 ô: còn lệch quá nhiều thì số nước còn lại không đủ sửa (hoặc không thắng được lời
      // giải đã có).
      const target = !best ? MAX_MISMATCH : model ? best.mismatch : best.mismatch - 1;
      if (mismatchOf(pos.board) > 2 * (depth - moves.length) + target) return;
      for (const m of legalMoves(pos)) {
        if (!touch.has(m.from) && !touch.has(m.to)) continue;
        moves.push(m);
        walk(applyMove(pos, m), moves, depth);
        moves.pop();
      }
    };
    let limit = MAX_MISSED;
    for (let depth = 1; depth <= limit && budget > 0; depth++) {
      walk(this.position, [], depth);
      if (!best || best.mismatch > 0) continue;
      // Đã khớp hẳn. Đọc từng nước (thường gặp nhất) thì xong; đọc bù mà nước cuối không nằm chỗ có dấu thì thử
      // thêm tối đa 2 nước nữa.
      if (!model || best.marked || best.moves.length < 2) break;
      limit = Math.min(limit, best.moves.length + 2);
    }
    if (!best) this.failedKey = key;
    return best?.moves ?? [];
  }
}
