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

describe("nguyên lý mới", () => {
  it("điểm then chốt: Pháo đầu và Mã hà khẩu", () => {
    // Pháo đỏ ở cột giữa, Mã đỏ ở hà khẩu (hàng 5, cột 6).
    const s = principleScores(board("4k4/9/9/9/9/6N2/9/4C4/9/4K4 w"), "r");
    expect(s.diemThenChot).toBe(2);
  });

  it("cắt liên lạc: đếm quân lớn đối phương không có gốc", () => {
    // Xe đen bảo vệ Mã đen cùng hàng; Pháo đen đứng riêng không có gốc.
    const s = principleScores(board("3k5/9/r1n6/9/6c2/9/9/9/9/4K4 w"), "r");
    expect(s.catLienLac).toBe(2); // Xe (không ai giữ) và Pháo; Mã có Xe giữ
  });

  it("khống chế Tướng: Xe chiếm hàng trước mặt Tướng đối phương", () => {
    const free = principleScores(board("4k4/9/9/9/9/9/9/9/9/3K5 w"), "r").khongCheTuong;
    const held = principleScores(board("4k4/R8/9/9/9/9/9/9/9/3K5 w"), "r").khongCheTuong;
    expect(held).toBeGreaterThan(free);
  });
});
