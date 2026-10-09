import { describe, expect, it } from "vitest";
import {
  START_FEN, applyMove, initialPosition, inCheck, isLegal, legalMoves, outcome,
  parseFen, sq, toFen, Position,
} from "./engine";
import { moveNotation } from "./notation";
import { findBestMove } from "./ai";

function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(pos)) n += perft(applyMove(pos, m), depth - 1);
  return n;
}

describe("FEN", () => {
  it("đọc và ghi lại đúng thế cờ ban đầu", () => {
    expect(toFen(parseFen(START_FEN))).toBe(START_FEN);
  });
  it("báo lỗi FEN sai", () => {
    expect(() => parseFen("rnbakabnr/9 w")).toThrow();
  });
});

describe("sinh nước đi (perft chuẩn)", () => {
  it("thế ban đầu có 44 nước", () => {
    expect(perft(initialPosition(), 1)).toBe(44);
  });
  it("độ sâu 2 = 1.920", () => {
    expect(perft(initialPosition(), 2)).toBe(1920);
  });
  it("độ sâu 3 = 79.666", () => {
    expect(perft(initialPosition(), 3)).toBe(79666);
  });
});

describe("luật đặc biệt", () => {
  it("mã bị cản chân không nhảy được", () => {
    // Mã đỏ ở b0 (hàng 9 cột 1), tốt chặn chân phía trên.
    const pos = parseFen("4k4/9/9/9/9/9/9/9/1P7/1N1K5 w");
    expect(isLegal(pos, { from: sq(9, 1), to: sq(7, 0) })).toBe(false);
    expect(isLegal(pos, { from: sq(9, 1), to: sq(7, 2) })).toBe(false);
    expect(isLegal(pos, { from: sq(9, 1), to: sq(8, 3) })).toBe(true);
  });
  it("pháo phải có ngòi mới ăn được", () => {
    const pos = parseFen("4k4/9/9/9/r8/9/9/C8/9/3K5 w");
    expect(isLegal(pos, { from: sq(7, 0), to: sq(4, 0) })).toBe(false);
    const screened = parseFen("4k4/9/9/9/r8/P8/9/C8/9/3K5 w");
    expect(isLegal(screened, { from: sq(7, 0), to: sq(4, 0) })).toBe(true);
  });
  it("tượng không qua sông, bị cản mắt thì không đi", () => {
    const pos = parseFen("4k4/9/9/9/9/2B6/9/9/9/3K5 w");
    expect(isLegal(pos, { from: sq(5, 2), to: sq(3, 0) })).toBe(false);
    const blocked = parseFen("4k4/9/9/9/9/9/9/9/3P5/2BK5 w");
    expect(isLegal(blocked, { from: sq(9, 2), to: sq(7, 4) })).toBe(false);
  });
  it("hai tướng không được lộ mặt", () => {
    // Xe đỏ đang che giữa hai tướng: không được rời cột.
    const pos = parseFen("4k4/9/9/9/4R4/9/9/9/9/4K4 w");
    expect(isLegal(pos, { from: sq(4, 4), to: sq(4, 0) })).toBe(false);
    expect(isLegal(pos, { from: sq(4, 4), to: sq(2, 4) })).toBe(true);
  });
  it("tốt chưa qua sông chỉ được tiến", () => {
    const pos = initialPosition();
    const moves = legalMoves(pos).filter((m) => m.from === sq(6, 0));
    expect(moves).toEqual([{ from: sq(6, 0), to: sq(5, 0) }]);
  });
});

describe("kết thúc ván", () => {
  it("nhận ra chiếu bí bằng luật lộ mặt tướng", () => {
    const pos = parseFen("3k1a3/9/2R6/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
    const after = applyMove(pos, { from: sq(2, 2), to: sq(2, 3) });
    expect(inCheck(after.board, "b")).toBe(true);
    expect(outcome(after)).toEqual({ over: true, winner: "r", reason: "checkmate" });
  });
  it("bên hết nước đi mà không bị chiếu vẫn thua", () => {
    // Tướng đen bị khóa: không bị chiếu nhưng mọi ô đều bị hai tốt khống chế.
    const pos = parseFen("4k4/3P1P3/9/9/9/9/9/9/9/3K5 b");
    expect(inCheck(pos.board, "b")).toBe(false);
    expect(outcome(pos)).toEqual({ over: true, winner: "r", reason: "stalemate" });
  });
});

describe("ký hiệu", () => {
  it("ghi đúng các nước khai cuộc quen thuộc", () => {
    const pos = initialPosition();
    expect(moveNotation(pos.board, { from: sq(7, 7), to: sq(7, 4) })).toBe("P2-5");
    expect(moveNotation(pos.board, { from: sq(9, 7), to: sq(7, 6) })).toBe("M2.3");
    expect(moveNotation(pos.board, { from: sq(9, 8), to: sq(8, 8) })).toBe("X1.1");
    const black = applyMove(pos, { from: sq(7, 7), to: sq(7, 4) });
    expect(moveNotation(black.board, { from: sq(0, 7), to: sq(2, 6) })).toBe("M8.7");
  });
});

describe("AI", () => {
  it("tìm ra nước chiếu bí 1 nước", () => {
    const pos = parseFen("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
    const { move } = findBestMove(pos, 4);
    expect(move).not.toBeNull();
    const after = applyMove(pos, move!);
    expect(outcome(after)).toMatchObject({ over: true, winner: "r" });
  });
  it("ăn quân Xe được cho không", () => {
    const pos = parseFen("4k4/9/9/9/9/4r4/9/9/4R4/3K5 w");
    const { move } = findBestMove(pos, 3, () => 0);
    expect(move).toEqual({ from: sq(8, 4), to: sq(5, 4) });
  });
});
