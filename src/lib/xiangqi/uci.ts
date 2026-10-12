// Chuyển đổi giữa cách biểu diễn của dự án và giao thức UCI của engine (Pikafish, Fairy-Stockfish).
// UCI dùng tọa độ ICCS: cột a–i từ trái sang (phía Đỏ), hàng 0–9 tính từ đáy bên Đỏ, vd. "h2e2" = Pháo 2 bình 5.

import { COLS, ROWS, toFen, type Board, type Move, type Position } from "./engine";
import { moveNotation } from "./notation";

/** Điểm chiếu bí theo quy ước của ai.ts: MATE − số nửa nước đến khi chiếu bí. */
export const MATE_SCORE = 100_000;

export function moveToUci(m: Move): string {
  const sqName = (i: number) => String.fromCharCode(97 + (i % COLS)) + String(ROWS - 1 - Math.floor(i / COLS));
  return sqName(m.from) + sqName(m.to);
}

export function uciToMove(s: string): Move | null {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(s)) return null;
  const sq = (f: string, r: string) => (ROWS - 1 - Number(r)) * COLS + (f.charCodeAt(0) - 97);
  return { from: sq(s[0], s[1]), to: sq(s[2], s[3]) };
}

/** FEN đầy đủ cho UCI (thêm các trường mà engine đòi). */
export const toUciFen = (pos: Position) => `${toFen(pos)} - - 0 1`;

/**
 * Đổi điểm của engine (theo bên đang đi) về thang của dự án.
 * Chiếu bí trong n nước: bên đang đi chiếu bí được = MATE − (2n − 1) nửa nước; bị chiếu bí = −(MATE − 2n).
 */
export function engineScore(cp: number | null, mate: number | null): number {
  if (mate === null) return cp ?? 0;
  if (mate > 0) return MATE_SCORE - (2 * mate - 1);
  return -(MATE_SCORE - 2 * Math.abs(mate));
}

function play(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

/** Chuyển mảng các chuỗi nước đi UCI thành mảng Move. */
export function uciMovesToMoves(pv: string[]): Move[] {
  return pv.map(uciToMove).filter((m): m is Move => m !== null);
}

/**
 * Chuyển mảng các nước đi PV thành danh sách ký hiệu tiếng Việt từ một thế cờ ban đầu.
 * Tối đa maxPly nước (mặc định 3).
 */
export function formatPvLine(board: Board, pvMoves: Move[], maxPly: number = 3): string[] {
  let curr = board;
  const line: string[] = [];
  for (let i = 0; i < Math.min(pvMoves.length, maxPly); i++) {
    const m = pvMoves[i];
    if (!curr[m.from]) break;
    line.push(moveNotation(curr, m));
    curr = play(curr, m);
  }
  return line;
}
