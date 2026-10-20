// Thư viện hình quân của một trang cờ: học từ ảnh lúc thế cờ đã biết (thường là thế ban đầu), lưu lại, để lần sau
// đọc được cả một thế cờ giữa ván mà người dùng không phải tự bày lại từng nước.
//
// MoveTracker chỉ cần phân biệt trống / đỏ / đen (nước đi suy ra từ luật). Đọc thế cờ lạ thì phải biết LOẠI quân,
// nên mỗi mẫu ở đây gắn với chữ FEN của quân (hoặc "" cho ô trống) và đọc bằng mẫu gần nhất, rồi sửa theo số quân
// tối đa của mỗi loại.

import { type Board, type Piece, type Side, sideOf } from "@/lib/xiangqi/engine";
import { type Patch, patchDistance, toBoardOrder } from "./board-reader";

export interface PieceSample {
  /** Chữ FEN của quân ("R", "n"…), "" là ô trống. */
  piece: Piece | "";
  patch: Patch;
}

export interface PieceLibrary {
  samples: PieceSample[];
}

/**
 * Giữ tối đa chừng này mẫu mỗi loại (mẫu mới nhất trước): đủ đa dạng, đọc vẫn nhanh. Ô trống cần nhiều mẫu hơn hẳn:
 * mỗi giao điểm trông một khác (mép sông, đường chéo cung, dấu chữ thập), thiếu mẫu là ô trống bị đọc thành quân.
 */
const MAX_PER_PIECE = 6;
const MAX_EMPTY = 160;

const MAX_COUNT: Record<string, number> = { k: 1, a: 2, b: 2, n: 2, r: 2, c: 2, p: 5 };

/** Học mẫu từ 90 mẫu (thứ tự ô cờ) của một thế cờ đã biết. */
export function learnLibrary(boardPatches: Patch[], board: Board, skip?: ReadonlySet<number>): PieceLibrary {
  return {
    samples: board.flatMap((p, i) => (skip?.has(i) ? [] : [{ piece: p ?? "", patch: boardPatches[i] }])),
  };
}

/** Gộp mẫu mới vào thư viện cũ, mẫu mới đứng trước, cắt bớt mỗi loại. */
export function mergeLibrary(old: PieceLibrary | null, add: PieceLibrary): PieceLibrary {
  const count = new Map<string, number>();
  const samples: PieceSample[] = [];
  for (const s of [...add.samples, ...(old?.samples ?? [])]) {
    const n = count.get(s.piece) ?? 0;
    if (n >= (s.piece ? MAX_PER_PIECE : MAX_EMPTY)) continue;
    count.set(s.piece, n + 1);
    samples.push(s);
  }
  return { samples };
}

export interface BoardReading {
  board: Board;
  bottom: Side;
  /** Tổng khoảng cách tới mẫu đã chọn (nhỏ = khớp tốt). */
  cost: number;
}

/**
 * Đọc thế cờ từ 90 mẫu (thứ tự màn hình). Thử cả hai phía ngồi dưới, lấy phía khớp hơn mà thế cờ đọc ra hợp lệ (mỗi
 * bên đúng một Tướng, không loại nào quá số quân). null nếu không đọc ra thế hợp lệ hoặc thư viện chưa có đủ loại.
 */
export function readBoard(screenPatches: Patch[], lib: PieceLibrary, bottom?: Side): BoardReading | null {
  const kinds = new Set(lib.samples.map((s) => s.piece));
  if (!kinds.has("") || !kinds.has("K") || !kinds.has("k")) return null;
  let best: BoardReading | null = null;
  for (const b of bottom ? [bottom] : (["r", "b"] as Side[])) {
    const reading = readAs(toBoardOrder(screenPatches, b), lib, b);
    if (reading && (!best || reading.cost < best.cost)) best = reading;
  }
  return best;
}

function readAs(patches: Patch[], lib: PieceLibrary, bottom: Side): BoardReading | null {
  // Khoảng cách nhỏ nhất từ mỗi ô tới từng loại.
  const kinds = [...new Set(lib.samples.map((s) => s.piece))];
  const dist = patches.map((p) => {
    const d = new Map<string, number>();
    for (const s of lib.samples) {
      const v = patchDistance(p, s.patch);
      if (v < (d.get(s.piece) ?? Infinity)) d.set(s.piece, v);
    }
    return d;
  });
  const board: Board = patches.map((_, i) => {
    const k = kinds.reduce((a, b) => (dist[i].get(b)! < dist[i].get(a)! ? b : a));
    return k || null;
  });

  // Quá số quân của một loại (vd. đọc 3 Mã): giữ những ô khớp nhất, ô còn lại đổi sang loại cùng phe khớp kế tiếp
  // còn chỗ. Lặp vì đổi loại có thể làm loại khác bị quá.
  for (let guard = 0; guard < 32; guard++) {
    const over = overfull(board);
    if (!over) break;
    const squares = board.flatMap((p, i) => (p === over ? [i] : [])).sort((a, b) => dist[a].get(over)! - dist[b].get(over)!);
    const extra = squares[squares.length - 1];
    const side = sideOf(over);
    const alt = kinds
      .filter((k) => k && k !== over && sideOf(k) === side && countOf(board, k) < MAX_COUNT[k.toLowerCase()])
      .sort((a, b) => dist[extra].get(a)! - dist[extra].get(b)!)[0];
    if (!alt) return null;
    board[extra] = alt;
  }
  if (overfull(board) || countOf(board, "K") !== 1 || countOf(board, "k") !== 1) return null;
  // Đọc ngược phía (xoay 180°) cho cùng tổng khoảng cách vì mẫu không gắn với ô; Tướng nằm trong cung của phe mình
  // mới là hướng đúng.
  if (!inPalace(board.indexOf("K"), "r") || !inPalace(board.indexOf("k"), "b")) return null;
  const cost = board.reduce((sum, p, i) => sum + dist[i].get(p ?? "")!, 0);
  return { board, bottom, cost };
}

function inPalace(square: number, side: Side): boolean {
  const r = Math.floor(square / 9);
  const c = square % 9;
  return c >= 3 && c <= 5 && (side === "r" ? r >= 7 : r <= 2);
}

const countOf = (board: Board, piece: string) => board.reduce((n, p) => (p === piece ? n + 1 : n), 0);

function overfull(board: Board): string | null {
  const counts = new Map<string, number>();
  for (const p of board) if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  for (const [p, n] of counts) if (n > MAX_COUNT[p.toLowerCase()]) return p;
  return null;
}

/** Lưu/đọc thư viện dạng JSON (mẫu mã hóa base64 của Float32Array). */
export function serializeLibrary(lib: PieceLibrary): string {
  const b64 = (p: Patch) => {
    let s = "";
    for (const b of new Uint8Array(p.buffer, p.byteOffset, p.byteLength)) s += String.fromCharCode(b);
    return btoa(s);
  };
  return JSON.stringify(lib.samples.map((s) => [s.piece, b64(s.patch)]));
}

export function parseLibrary(text: string): PieceLibrary | null {
  try {
    const rows = JSON.parse(text) as [string, string][];
    return {
      samples: rows.map(([piece, b64]) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return { piece, patch: new Float32Array(bytes.buffer) };
      }),
    };
  } catch {
    return null;
  }
}
