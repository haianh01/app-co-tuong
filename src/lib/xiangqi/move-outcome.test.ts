import { describe, expect, it } from "vitest";
import { parseFen, sq, type Move } from "./engine";
import { classifyMoveOutcome, countCaptured } from "./move-outcome";
import { zhaoOutcomeAllows } from "./zhao-outcome";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });
// Hai bên đi qua lại vô hại để biến đủ dài mà không đổi vật chất (Tướng đứng sau Sĩ, không lộ mặt).
const shuffle = (n: number): Move[] =>
  Array.from({ length: n }, (_, i) => (i % 4 === 0 ? mv(0, 3, 1, 4) : i % 4 === 1 ? mv(9, 3, 8, 4) : i % 4 === 2 ? mv(1, 4, 0, 3) : mv(8, 4, 9, 3)));

describe("classifyMoveOutcome", () => {
  it("ăn Xe rồi bị ăn lại ngay là đổi quân", () => {
    // Xe Đỏ (5,0) ăn Xe Đen (2,0); Xe Đen (0,0) ăn lại.
    const pos = parseFen("r2akab2/9/r8/9/9/R8/9/9/9/3AKAB2 w");
    const o = classifyMoveOutcome(pos.board, mv(5, 0, 2, 0), [mv(0, 0, 2, 0), ...shuffle(4)]);
    expect(o.kind).toBe("exchange");
    expect(o.materialNow).toBe(900);
    expect(o.materialSettled).toBe(0);
  });

  it("ăn Tốt giữ được đến cuối biến là ăn sạch (kể cả chỉ +100)", () => {
    const pos = parseFen("3akab2/9/9/p8/9/9/9/9/9/R2AKAB2 w");
    const o = classifyMoveOutcome(pos.board, mv(9, 0, 3, 0), shuffle(5));
    expect(o.kind).toBe("cleanCapture");
    expect(o.materialSettled).toBe(100);
  });

  it("đi quân vào chỗ bị ăn không mà không được bù là mất quân", () => {
    // Pháo Đỏ đi vào ô Xe Đen ăn được, không có căn.
    const pos = parseFen("3akab2/9/9/9/r8/9/9/C8/9/3AKAB2 w");
    const o = classifyMoveOutcome(pos.board, mv(7, 0, 5, 0), [mv(4, 0, 5, 0), ...shuffle(4)], { scoreForMover: -400 });
    expect(o.kind).toBe("losesMaterial");
    expect(o.materialAfterReply).toBe(-450);
  });

  it("mất quân ngay nhưng engine vẫn chấm tốt là phế", () => {
    const pos = parseFen("3akab2/9/9/9/r8/9/9/C8/9/3AKAB2 w");
    const o = classifyMoveOutcome(pos.board, mv(7, 0, 5, 0), [mv(4, 0, 5, 0), ...shuffle(4)], { scoreForMover: 300 });
    expect(o.kind).toBe("sacrifice");
  });

  it("biến quá ngắn thì không kết luận", () => {
    const pos = parseFen("3akab2/9/9/p8/9/9/9/9/9/R2AKAB2 w");
    expect(classifyMoveOutcome(pos.board, mv(9, 0, 3, 0), [mv(0, 3, 1, 4)]).kind).toBe("unclear");
  });

  it("đếm đúng quân bị ăn theo từng bên", () => {
    const pos = parseFen("r2akab2/9/r8/9/9/R8/9/9/9/3AKAB2 w");
    const o = classifyMoveOutcome(pos.board, mv(5, 0, 2, 0), [mv(0, 0, 2, 0), ...shuffle(4)]);
    expect(countCaptured(o, "r", "r")).toBe(1);
    expect(countCaptured(o, "b", "r")).toBe(1);
  });
});

describe("zhaoOutcomeAllows", () => {
  const exchange = (() => {
    const pos = parseFen("r2akab2/9/r8/9/9/R8/9/9/9/3AKAB2 w");
    return classifyMoveOutcome(pos.board, mv(5, 0, 2, 0), [mv(0, 0, 2, 0), ...shuffle(4)]);
  })();
  const pawnKept = (() => {
    const pos = parseFen("3akab2/9/9/p8/9/9/9/9/9/R2AKAB2 w");
    return classifyMoveOutcome(pos.board, mv(9, 0, 3, 0), shuffle(5));
  })();

  it("đổi Xe không được gắn kỳ lý tấn công hay Vây Xe", () => {
    expect(zhaoOutcomeAllows("xeSongPhao", exchange, "r")).toBe(false);
    expect(zhaoOutcomeAllows("vayXe", exchange, "r")).toBe(false);
  });

  it("nước tự nó ăn quân không được gắn kỳ lý tấn công", () => {
    expect(zhaoOutcomeAllows("songXePhoiHop", pawnKept, "r")).toBe(false);
  });

  it("ăn sạch Tốt thì được gắn Mưu Binh", () => {
    expect(zhaoOutcomeAllows("chienThuatMuuBinh", pawnKept, "r")).toBe(true);
  });

  it("Một Xe đổi hai cần mất Xe và ăn được hai quân", () => {
    expect(zhaoOutcomeAllows("motXeDoiHai", pawnKept, "r")).toBe(false);
  });

  it("kỳ lý thuần thế trận (không kiểm chứng được) không gắn vào từng nước", () => {
    expect(zhaoOutcomeAllows("kiemCheDinhCung", pawnKept, "r")).toBe(false);
    expect(zhaoOutcomeAllows("khongCheKyHa", pawnKept, "r")).toBe(false);
  });
});
