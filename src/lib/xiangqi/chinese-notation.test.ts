import { describe, expect, it } from "vitest";
import { convertChineseGame, parseChineseMove } from "./chinese-notation";
import { parseFen, START_FEN } from "./engine";

describe("chinese-notation", () => {
  it("chuyển đổi nước khai cuộc thông dụng", () => {
    const pos = parseFen(START_FEN);
    // Pháo 2 bình 5
    const m1 = parseChineseMove(pos, "炮二平五");
    expect(m1).toBeDefined();
    expect(m1).not.toBeNull();
  });

  it("chuyển đổi chuỗi nước đi một ván hoàn chỉnh", () => {
    // Ván 6688: 兵三进一, 象７进５, 马八进九, 卒１进１...
    const sampleMoves = [
      "兵三进一",
      "象７进５",
      "马八进九",
      "卒１进１",
      "炮八平六",
      "马２进１",
      "车九平八",
      "车１平２",
      "马二进三",
      "士６进５",
    ];

    const result = convertChineseGame(sampleMoves);
    expect(result.success).toBe(true);
    expect(result.moves).toHaveLength(10);
    expect(result.notations[0]).toBe("B3.1");
    expect(result.notations[1]).toBe("T7.5");
    expect(result.notations[2]).toBe("M8.9");
    expect(result.notations[3]).toBe("B1.1");
  });
});
