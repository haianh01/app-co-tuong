import { describe, expect, it } from "vitest";
import { initialPosition, sq } from "./engine";
import { formatPvLine, uciMovesToMoves, MATE_SCORE, engineScore, moveToUci, toUciFen, uciToMove } from "./uci";

describe("tọa độ UCI", () => {
  it("Pháo 2 bình 5 của Đỏ là h2e2, Mã 8 tiến 7 của Đen là b9c7", () => {
    expect(moveToUci({ from: sq(7, 7), to: sq(7, 4) })).toBe("h2e2");
    expect(moveToUci({ from: sq(0, 1), to: sq(2, 2) })).toBe("b9c7");
    expect(uciToMove("h2e2")).toEqual({ from: sq(7, 7), to: sq(7, 4) });
    expect(uciToMove("b9c7")).toEqual({ from: sq(0, 1), to: sq(2, 2) });
  });

  it("từ chối chuỗi không phải nước đi", () => {
    expect(uciToMove("(none)")).toBeNull();
    expect(uciToMove("j0a1")).toBeNull();
  });

  it("FEN gửi engine có đủ các trường", () => {
    expect(toUciFen(initialPosition())).toBe("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
  });
});

describe("đổi điểm engine về thang của dự án", () => {
  it("centipawn giữ nguyên; chiếu bí đổi theo số nửa nước như ai.ts", () => {
    expect(engineScore(35, null)).toBe(35);
    expect(engineScore(null, 1)).toBe(MATE_SCORE - 1); // mình chiếu bí ngay nước này
    expect(engineScore(null, 2)).toBe(MATE_SCORE - 3);
    expect(engineScore(null, -1)).toBe(-(MATE_SCORE - 2)); // bị chiếu bí sau nước đáp
  });
});

describe("chuỗi biến PV", () => {
  it("uciMovesToMoves chuyển đúng mảng chuỗi thành mảng Move", () => {
    const moves = uciMovesToMoves(["h2e2", "b9c7", "invalid"]);
    expect(moves).toHaveLength(2);
    expect(moves[0]).toEqual({ from: sq(7, 7), to: sq(7, 4) });
    expect(moves[1]).toEqual({ from: sq(0, 1), to: sq(2, 2) });
  });

  it("formatPvLine tạo chuỗi ký hiệu cờ tướng Việt Nam từ mảng Move", () => {
    const pos = initialPosition();
    const pvMoves = uciMovesToMoves(["h2e2", "b9c7"]);
    const line = formatPvLine(pos.board, pvMoves, 3);
    expect(line).toEqual(["P2-5", "M2.3"]);
  });
});
