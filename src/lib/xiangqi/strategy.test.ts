import { describe, expect, it } from "vitest";
import { START_FEN, parseFen } from "./engine";
import { choosePlan, coordination, detectOpeningFault, linkedGuards, principleScores, wingImbalance } from "./strategy";

const board = (fen: string) => parseFen(fen).board;

describe("choosePlan", () => {
  it("đầu ván, quân còn ở nhà: ra quân", () => {
    expect(choosePlan(board(START_FEN), "r", 0)).toBe("raQuan");
  });

  it("còn ít quân lớn: tàn cuộc", () => {
    expect(choosePlan(board("3k5/9/9/4p4/9/2P6/9/4B4/4A4/3AK1B2 w"), "r", 60)).toBe("tanCuoc");
  });

  it("lộ mở vào cung từ phần sân mình chưa phải tấn công (hồi quy B7.1)", () => {
    // Pháo đỏ bên sân mình và Xe ở hàng đáy nhìn dọc lộ trống vào cung Đen: không có quân nào qua sông ép cung
    const fen = "2bakabr1/3r5/4c1n2/p1p1n1p1p/9/4c1P2/P1P1N3P/2NCB3C/4A4/1RBAKR3 w";
    expect(choosePlan(board(fen), "r", 22)).not.toBe("tanCong");
  });

  it("Xe và Mã qua sông khống chế cung: tấn công", () => {
    const fen = "1rbakab2/9/1c5c1/3N5/4R4/9/9/1C5C1/9/2BAKABN1 w";
    expect(choosePlan(board(fen), "r", 40)).toBe("tanCong");
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

describe("nguyên lý kỳ lý bổ sung", () => {
  it("Mã đi biên bị trừ điểm", () => {
    const center = principleScores(board("4k4/9/9/9/9/9/9/2N6/9/4K4 w"), "r").maBien;
    const edge = principleScores(board("4k4/9/9/9/9/9/9/N8/9/4K4 w"), "r").maBien;
    expect(edge).toBeLessThan(center);
  });

  it("Sĩ Tượng liên hoàn: thế đầu ván có Tượng liên hoàn, chèn mắt Tượng thì mất", () => {
    expect(linkedGuards(board("4k4/9/9/9/9/9/9/4B4/9/2B1K4 w"), "r")).toBe(1);
    expect(linkedGuards(board("4k4/9/9/9/9/9/9/4B4/3N5/2B1K4 w"), "r")).toBe(0);
    expect(linkedGuards(board("4k4/9/9/9/9/9/9/9/4A4/3AK4 w"), "r")).toBe(1);
  });

  it("phối hợp: Xe một mình chưa tính, Xe cùng Mã ép cung thì tính", () => {
    expect(coordination(board("4k4/9/9/9/9/3R5/9/9/9/4K4 w"), "r")).toBe(0);
    expect(coordination(board("4k4/9/9/5N3/9/3R5/9/9/9/4K4 w"), "r")).toBe(2);
  });
});

describe("detectOpeningFault: lỗi hình cờ", () => {
  it("phi Tượng ra biên", () => {
    // Tượng đỏ cột 2 hàng 9 bay lên cột 0 hàng 7.
    const f = detectOpeningFault(board(START_FEN), { from: 83, to: 63 }, 2, "r", []);
    expect(f?.fault).toBe("edgeElephant");
  });

  it("phi Tượng về giữa không bị bắt lỗi", () => {
    expect(detectOpeningFault(board(START_FEN), { from: 83, to: 67 }, 2, "r", [])).toBeNull();
  });

  it("Mã thứ hai cũng ra biên", () => {
    // Mã đỏ trái đã ở biên (cột 0 hàng 7); Mã phải cột 7 nhảy ra cột 8 hàng 7.
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/NC5C1/9/R1BAKABNR w";
    expect(detectOpeningFault(board(fen), { from: 88, to: 71 }, 4, "r", [])?.fault).toBe("doubleEdgeHorse");
  });
});

describe("ba nguyên tắc khai cuộc và bổ Sĩ (bài 2, 14, 47)", () => {
  it("lệch cánh: một cánh ra đủ ba quân, cánh kia chưa động mà vẫn đi quân cánh đã ra", () => {
    // Đỏ: Pháo 2 bình 5, Mã 2 tiến 3, Xe 1 bình 2 (đúng kỳ lý), cánh trái còn nguyên.
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKABR1 w";
    expect(wingImbalance(board(fen), "r")).toBe(3);
    // Đi tiếp Xe 2 tiến 4 (cánh đã ra): lỗi lệch cánh.
    expect(detectOpeningFault(board(fen), { from: 88, to: 52 }, 6, "r", [])?.fault).toBe("oneWing");
    // Mã 8 tiến 9 (ra cánh trái): đúng như ví dụ bài 2, không lỗi.
    expect(detectOpeningFault(board(fen), { from: 82, to: 63 }, 6, "r", [])).toBeNull();
  });

  it("yếu đạo: Xe trực lộ 2/8 được tính", () => {
    const before = principleScores(board("4k4/9/9/9/9/9/9/9/9/4K3R w"), "r").yeuDao;
    const after = principleScores(board("4k4/9/9/9/9/9/9/9/9/4K2R1 w"), "r").yeuDao;
    expect(after).toBeGreaterThan(before);
  });

  it("Sĩ lên giữa cung chặn đường Xe hoành", () => {
    // Đen: Xe góc còn ở nhà, bổ Sĩ 6 tiến 5 (ô 5 → 13).
    const f = detectOpeningFault(board(START_FEN), { from: 5, to: 13 }, 3, "b", []);
    expect(f?.fault).toBe("advisorBlocksRook");
  });

});
