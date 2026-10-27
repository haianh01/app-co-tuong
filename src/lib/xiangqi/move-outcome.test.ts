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
    expect(zhaoOutcomeAllows("voSuTienTotBien", pawnKept, "r")).toBe(false);
    expect(zhaoOutcomeAllows("phaoGanh", pawnKept, "r")).toBe(false);
    expect(zhaoOutcomeAllows("lienHoanMa", pawnKept, "r")).toBe(false);
  });

  describe("Xe Mã lãnh chiêu (bài 31): nước chém Sĩ tự nó ăn quân, phải dứt điểm", () => {
    it("ván đại sư: Mã ăn Sĩ rồi Xe Mã thay nhau chiếu tới chết — được gắn", () => {
      const pos = parseFen("3a1k3/9/5a3/p3R2Np/5P3/P5B2/9/9/8r/c3KAB2 w");
      const pv: Move[] = [[3, 13], [23, 16], [5, 4], [31, 13], [4, 3], [13, 4], [3, 12], [16, 23], [12, 21], [4, 3]].map(([from, to]) => ({ from, to }));
      const o = classifyMoveOutcome(pos.board, { from: 34, to: 23 }, pv, { scoreForMover: 99989, moverMates: true, opponentMates: false });
      expect(o.kind).toBe("mate");
      expect(zhaoOutcomeAllows("xeMaLanhChieu", o, "r")).toBe(true);
    });

    it("ván đại sư: Mã chém Sĩ, theo biến chỉ lời thêm một Tốt (+300) — chưa phải dứt điểm, không gắn", () => {
      const pos = parseFen("6b2/4k3c/3aba1c1/p3p2N1/1r1C4P/2PR1N3/P3P3n/4B4/4A4/2BAK4 w");
      const pv: Move[] = [[25, 88], [50, 31], [17, 15], [48, 52], [37, 39], [52, 88], [39, 30], [88, 34], [15, 14], [58, 49], [62, 69], [23, 40], [13, 4], [34, 33], [14, 13], [33, 69], [13, 31]]
        .map(([from, to]) => ({ from, to }));
      const o = classifyMoveOutcome(pos.board, { from: 34, to: 23 }, pv, { scoreForMover: 461, moverMates: false, opponentMates: false });
      expect(o.materialNow).toBe(200);
      expect(o.materialSettled).toBe(300);
      expect(zhaoOutcomeAllows("xeMaLanhChieu", o, "r")).toBe(false);
    });
  });
});
