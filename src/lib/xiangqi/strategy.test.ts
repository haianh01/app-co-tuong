import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./engine";
import { choosePlan, principleScores } from "./strategy";

const board = (fen: string) => parseFen(fen).board;

describe("choosePlan", () => {
  it("đầu ván, quân còn ở nhà: ra quân", () => {
    expect(choosePlan(board(START_FEN), "r", 0)).toBe("raQuan");
  });

  it("còn ít quân lớn: tàn cuộc", () => {
    expect(choosePlan(board("3k5/9/9/4p4/9/2P6/9/4B4/4A4/3AK1B2 w"), "r", 60)).toBe("tanCuoc");
  });

  it("đối phương mất hết Sĩ Tượng giữa ván: tấn công", () => {
    expect(choosePlan(board("r3k4/9/2n1c4/p3p3p/9/2P6/P3P3P/1CN1C1N2/9/R2AKAB1R w"), "r", 40)).toBe("tanCong");
  });
});

describe("principleScores", () => {
  it("Xe lên hàng ngang thì thông đường hơn", () => {
    const home = principleScores(board(START_FEN), "r");
    const out = principleScores(board("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/8R/RNBAKABN1 b"), "r");
    expect(out.xe).toBeGreaterThan(home.xe);
  });

  it("đếm Tốt đã qua sông", () => {
    expect(principleScores(board("3k5/9/9/4P4/2P6/9/9/9/9/4K4 w"), "r").tot).toBe(2);
  });
});
