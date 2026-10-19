import { describe, expect, it } from "vitest";
import {
  applyMove, attackersOf, initialPosition, legalMoves, pseudoMoves, sideOf, type Board, type Position, type Side,
} from "./engine";

/** Bản tham chiếu (cách tính cũ): sinh nước cho mọi quân phe `by` rồi xem có ô đích không. */
function attackersOfReference(board: Board, target: number, by: Side): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && sideOf(p) === by && pseudoMoves(board, i).includes(target)) out.push(i);
  }
  return out;
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống, để test tất định. */
function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/** Các thế cờ từ ván đi ngẫu nhiên (thế hợp lệ, đủ mọi giai đoạn). */
function randomGameBoards(seed: number, games: number, plies: number): Board[] {
  const rand = rng(seed);
  const out: Board[] = [];
  for (let g = 0; g < games; g++) {
    let pos: Position = initialPosition();
    for (let i = 0; i < plies; i++) {
      const moves = legalMoves(pos);
      if (!moves.length) break;
      pos = applyMove(pos, moves[Math.floor(rand() * moves.length)]);
      out.push(pos.board);
    }
  }
  return out;
}

/** Thế đặt quân ngẫu nhiên (không cần hợp lệ) để phủ các vị trí lạ: Tượng sát sông, Tốt ở mép, quân trong cung... */
function randomScatterBoards(seed: number, count: number): Board[] {
  const rand = rng(seed);
  const pieces = "KAABBNNRRCCPPPPPkaabbnnrrccppppp";
  const out: Board[] = [];
  for (let k = 0; k < count; k++) {
    const b: Board = Array(90).fill(null);
    const n = 4 + Math.floor(rand() * 24);
    for (let j = 0; j < n; j++) b[Math.floor(rand() * 90)] = pieces[Math.floor(rand() * pieces.length)];
    out.push(b);
  }
  return out;
}

describe("attackersOf (dò ngược) cho kết quả giống hệt cách tính cũ", () => {
  it("trên thế từ ván ngẫu nhiên: mọi ô đích, cả hai phe, cả ô có quân dò thử như isDefended", () => {
    let checked = 0;
    for (const board of randomGameBoards(7, 4, 100)) {
      for (let t = 0; t < 90; t++) {
        for (const by of ["r", "b"] as Side[]) {
          expect(attackersOf(board, t, by)).toEqual(attackersOfReference(board, t, by));
          // Thế dò thử: đặt quân đối phương vào ô t (isDefended / exchangeGain dùng kiểu này)
          const probe = board.slice();
          probe[t] = by === "r" ? "p" : "P";
          expect(attackersOf(probe, t, by)).toEqual(attackersOfReference(probe, t, by));
          checked += 2;
        }
      }
    }
    expect(checked).toBeGreaterThan(50_000);
  });

  it("trên thế đặt quân ngẫu nhiên", () => {
    for (const board of randomScatterBoards(11, 120)) {
      for (let t = 0; t < 90; t++) {
        for (const by of ["r", "b"] as Side[]) {
          expect(attackersOf(board, t, by)).toEqual(attackersOfReference(board, t, by));
        }
      }
    }
  });
});
