// Tiện ích dựng thế cờ cho test: đặt quân theo tọa độ "hàng,cột" thay vì viết FEN bằng tay.
// Hàng 0 ở phía Đen (trên), hàng 9 ở phía Đỏ (dưới); cột 0 ở bên trái.

import {
  Board, Position, Side, applyMove, colOf, legalMovesFrom, parseFen, pseudoMoves, rowOf, sq,
  type Move,
} from "@/lib/xiangqi/engine";

/** Ví dụ: `{ "9,4": "K", "0,4": "k" }`. */
export type Pieces = Record<string, string>;

export function pos(pieces: Pieces, turn: Side = "r"): Position {
  const board: Board = Array(90).fill(null);
  for (const [key, piece] of Object.entries(pieces)) {
    const [r, c] = key.split(",").map(Number);
    board[sq(r, c)] = piece;
  }
  return { board, turn };
}

export const m = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });

const label = (i: number) => `${rowOf(i)},${colOf(i)}`;

/** Các ô đích hợp lệ (đã xét chiếu tướng) của quân ở (r, c), dạng "hàng,cột", sắp xếp. */
export function dests(p: Position, r: number, c: number): string[] {
  return legalMovesFrom(p, sq(r, c)).map((x) => label(x.to)).sort();
}

/** Các ô đích theo cách đi của quân, chưa xét chiếu tướng. */
export function pseudo(p: Position, r: number, c: number): string[] {
  return pseudoMoves(p.board, sq(r, c)).map(label).sort();
}

export const sorted = (xs: string[]) => [...xs].sort();

/** Đi một chuỗi nước từ FEN (không kiểm tra luật, chỉ dùng để dựng thế). */
export function play(fen: string, moves: Move[]): Position {
  return moves.reduce(applyMove, parseFen(fen));
}

/** Đổi màu quân và lật bàn cờ theo chiều dọc: thế cờ "soi gương" giữa Đỏ và Đen. */
export function mirror(p: Position): Position {
  const board: Board = Array(90).fill(null);
  p.board.forEach((piece, i) => {
    if (!piece) return;
    const swapped = piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase();
    board[sq(9 - rowOf(i), colOf(i))] = swapped;
  });
  return { board, turn: p.turn === "r" ? "b" : "r" };
}
