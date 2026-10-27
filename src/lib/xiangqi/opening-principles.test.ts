import { describe, expect, it } from "vitest";
import { parseFen, play, sq, type Board, type Move, isLegal } from "./engine";
import { uciMovesToMoves } from "./uci";
import {
  checkDaiXuatXe,
  detectDaiXuatXe,
  checkTaPhaoPhongXe,
  detectTaPhaoPhongXe,
  checkPhaoDoiMaKhaiCuoc,
  detectPhaoDoiMaKhaiCuoc,
  checkTuongKhongDong,
  detectTuongKhongDong,
  checkXeDeMa,
  detectXeDeMa,
  checkLuongDauXa,
  detectLuongDauXa,
  checkPhiTuongTanTrungBinh,
  detectPhiTuongTanTrungBinh,
} from "./opening-principles";

const real = (fen: string, from: number, to: number, uciPv: string[], scoreForMover: number, loss = 0) => {
  const pos = parseFen(fen);
  const move = { from, to };
  expect(isLegal(pos, move), `Illegal move ${from} -> ${to} on ${fen}`).toBe(true);
  const after = play(pos.board, move);
  const pvMoves = uciMovesToMoves(uciPv);
  return {
    before: pos.board,
    move,
    after,
    options: {
      pv: pvMoves,
      loss,
      evalAfter: { score: -scoreForMover },
    },
  };
};

describe("opening-principles: bộ nhận diện 4 tầng kỳ lý khai cuộc", () => {
  // ==========================================================================
  // Bài 11: Đại xuất Xe (checkDaiXuatXe) — Game 5446 ply 23
  // ==========================================================================
  describe("Bài 11: Đại xuất Xe", () => {
    // Ván thật: Game 5446 ply 23 (Đen Xe biên i9 xuất thẳng xuống i7 khi Đỏ có Mã biên a6)
    const fen = "2bakac1r/2c6/n3bRn2/N3p3p/6p2/2P6/P3P1P1P/2C1B2CN/3r5/2BAKA2R b - - 0 12";
    const uciPv = ["i9i7", "c2c8", "a7c8", "i0h0"];

    it("ok: true - Xe biên tiến thẳng lên hàng chốt kiểm soát cánh Mã biên đối phương (Game 5446)", () => {
      const t = real(fen, 8, 26, uciPv, 29, 0);
      const res = checkDaiXuatXe(t.before, t.move, t.after, t.options);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.mechanism).toContain("Xe biên dâng cao");
        expect(res.summary).toContain("Đại xuất Xe");
      }
      const fact = detectDaiXuatXe(t.before, t.move, t.after, t.options);
      expect(fact?.lesson).toBe(11);
      expect(fact?.tactic).toBe("daiXuatXe");
    });

    it("Tầng 1 trượt: đối phương không có Mã ở biên", () => {
      const pos = parseFen(fen);
      const board = [...pos.board];
      board[sq(7, 8)] = null; // Bỏ Mã biên Đỏ ở ô i3 (sq(7, 8))
      const move = { from: 8, to: 26 };
      const after = play(board, move);
      const res = checkDaiXuatXe(board, move, after, { pv: uciMovesToMoves(uciPv), evalAfter: { score: 0 }, loss: 0 });
      expect(res).toMatchObject({ ok: false, layer: 1 });
    });

    it("Tầng 2 trượt: đang bị chiếu Tướng", () => {
      const pos = parseFen(fen);
      const board = [...pos.board];
      board[13] = "R"; // Xe Đỏ chiếu Tướng Đen
      const move = { from: 8, to: 26 };
      const after = play(board, move);
      const res = checkDaiXuatXe(board, move, after, { pv: uciMovesToMoves(uciPv), evalAfter: { score: 0 }, loss: 0 });
      expect(res).toMatchObject({ ok: false, layer: 2 });
    });

    it("Tầng 3 trượt: không có biến engine PV", () => {
      const pos = parseFen(fen);
      const move = { from: 8, to: 26 };
      const after = play(pos.board, move);
      const res = checkDaiXuatXe(pos.board, move, after, undefined);
      expect(res).toMatchObject({ ok: false, layer: 3 });
    });

    it("Tầng 4 trượt: nước đi bị hớ điểm (loss >= 30)", () => {
      const t = real(fen, 8, 26, uciPv, -100, 80);
      const res = checkDaiXuatXe(t.before, t.move, t.after, t.options);
      expect(res).toMatchObject({ ok: false, layer: 4 });
    });
  });

  // ==========================================================================
  // Bài 16: Tả Pháo phong Xe (checkTaPhaoPhongXe) — Game 386 ply 12
  // ==========================================================================
  describe("Bài 16: Tả Pháo phong Xe", () => {
    // Ván thật: Game 386 ply 12 (Đỏ Pháo c2 dâng lên c4 phong tỏa Xe Đen)
    const fen = "rn1akabr1/9/3cb1n2/p1p1p3p/6p2/8P/P1P1P1Pc1/1CN1B1C1N/9/R2AKABR1 w - - 0 7";
    const uciPv = ["b2b4", "c6c5", "b0c2", "c5c4"];

    it("ok: true - dâng Pháo kiềm chế đường xuất Xe đối phương (Game 386)", () => {
      const t = real(fen, 64, 46, uciPv, 52, 0);
      const res = checkTaPhaoPhongXe(t.before, t.move, t.after, t.options);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.summary).toContain("Tả Pháo phong Xe");
      }
      const fact = detectTaPhaoPhongXe(t.before, t.move, t.after, t.options);
      expect(fact?.lesson).toBe(16);
      expect(fact?.tactic).toBe("taPhaoPhongXe");
    });

    it("Tầng 1 trượt: đối phương đã xuất Xe khỏi góc ban đầu", () => {
      const pos = parseFen(fen);
      const board = [...pos.board];
      board[0] = null; // Xe Đen ở góc a9 không còn
      const move = { from: 64, to: 46 };
      const after = play(board, move);
      const res = checkTaPhaoPhongXe(board, move, after, { pv: uciMovesToMoves(uciPv), evalAfter: { score: 0 }, loss: 0 });
      expect(res).toMatchObject({ ok: false, layer: 1 });
    });

    it("Tầng 3 trượt: không có dữ liệu engine thì không gắn", () => {
      const pos = parseFen(fen);
      const move = { from: 64, to: 46 };
      const after = play(pos.board, move);
      const res = checkTaPhaoPhongXe(pos.board, move, after, undefined);
      expect(res).toMatchObject({ ok: false, layer: 3 });
      expect(detectTaPhaoPhongXe(pos.board, move, after, undefined)).toBeNull();
    });
  });

  // ==========================================================================
  // Bài 17: Pháo đổi Mã sớm (checkPhaoDoiMaKhaiCuoc) — Game 3631 ply 12
  // ==========================================================================
  describe("Bài 17: Pháo đổi Mã sớm", () => {
    // Ván thật: Game 3631 ply 12 (Đỏ Pháo e2 ăn Mã e6)
    const fen = "r1b1kab1r/4a4/1c3cn2/p1p1n3p/6p2/2P6/P3P1P1P/4C1N2/9/RNBAKABR1 w - - 0 7";
    const uciPv = ["e2e6", "f7e7", "e6e5", "b7d7", "b0c2"];

    it("ok: true - phê bình nước Pháo đổi Mã sớm làm tiêu hao quân chủ lực (Game 3631)", () => {
      const t = real(fen, 67, 31, uciPv, -100, 60);
      const res = checkPhaoDoiMaKhaiCuoc(t.before, t.move, t.after, t.options);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.summary).toContain("Pháo đổi Mã sớm");
      }
      const fact = detectPhaoDoiMaKhaiCuoc(t.before, t.move, t.after, t.options);
      expect(fact?.tone).toBe("critique");
      expect(fact?.lesson).toBe(17);
    });

    it("Tầng 4 trượt: nước ăn Mã này engine đánh giá là tốt / không hớ điểm thì không chê", () => {
      const t = real(fen, 67, 31, uciPv, 200, 0);
      const res = checkPhaoDoiMaKhaiCuoc(t.before, t.move, t.after, t.options);
      expect(res).toMatchObject({ ok: false, layer: 4 });
    });
  });

  // ==========================================================================
  // Bài 19: Tướng không động ở khai cuộc (checkTuongKhongDong)
  // ==========================================================================
  describe("Bài 19: Tướng không động ở khai cuộc", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const uciPv = ["e6e5", "b0c2", "c9e7", "c0e2"];

    it("ok: true - phê bình nước Tướng dâng sớm vô cớ khi chưa bị chiếu", () => {
      const t = real(fen, sq(9, 4), sq(8, 4), uciPv, -200, 90);
      const res = checkTuongKhongDong(t.before, t.move, t.after, t.options);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.summary).toContain("Tướng không động");
      }
      const fact = detectTuongKhongDong(t.before, t.move, t.after, t.options);
      expect(fact?.tone).toBe("critique");
      expect(fact?.lesson).toBe(19);
    });

    it("Tầng 2 trượt: Tướng chạy khi đang bị chiếu thì không phê bình", () => {
      // Đặt Xe Đen ở ô e2 (sq(7, 4)), thông thẳng chiếu Tướng Đỏ ở e0 (sq(9, 4))
      const pos = parseFen(fen);
      const board = [...pos.board];
      board[sq(6, 4)] = null; // Bỏ chốt đỏ ở giữa
      board[sq(7, 4)] = "r";  // Xe Đen chiếu thẳng mặt Tướng Đỏ
      const move = { from: sq(9, 4), to: sq(8, 4) };
      const after = play(board, move);
      const res = checkTuongKhongDong(board, move, after, { pv: uciMovesToMoves(uciPv), evalAfter: { score: 0 }, loss: 90 });
      expect(res).toMatchObject({ ok: false, layer: 2 });
    });
  });

  // ==========================================================================
  // Bài 27: Xe đè Mã (checkXeDeMa) — Game 2230 ply 18
  // ==========================================================================
  describe("Bài 27: Xe đè Mã", () => {
    // Ván thật: Game 2230 ply 18 (Đỏ Xe g4 bình sang f4 đè Mã Đen f5)
    const fen = "1r1akabr1/9/2n1b2c1/p1p1p3p/5n3/6R2/PcP1P3P/N1C1C1N2/9/1RBAKAB2 w - - 0 10";
    const uciPv = ["c3c4", "h7g7", "g2f4", "b3b4"];

    it("ok: true - Xe tiến đè khống chế Mã đối phương (Game 2230)", () => {
      const t = real(fen, 51, 50, uciPv, -18, 0);
      const res = checkXeDeMa(t.before, t.move, t.after, t.options);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.summary).toContain("Xe đè Mã");
      }
      const fact = detectXeDeMa(t.before, t.move, t.after, t.options);
      expect(fact?.lesson).toBe(27);
    });

    it("Tầng 1 trượt: không có Mã đối phương trong tầm đè ép", () => {
      const pos = parseFen(fen);
      const board = [...pos.board];
      board[41] = null; // Bỏ Mã Đen ở ô f5 (sq(4, 5) = 41)
      const move = { from: 51, to: 50 };
      const after = play(board, move);
      const res = checkXeDeMa(board, move, after, { pv: uciMovesToMoves(uciPv), evalAfter: { score: 0 }, loss: 0 });
      expect(res).toMatchObject({ ok: false, layer: 1 });
    });
  });

  // ==========================================================================
  // Bài 42: Lưỡng đầu xà (checkLuongDauXa) — Game 606 ply 14
  // ==========================================================================
  describe("Bài 42: Lưỡng đầu xà", () => {
    // Ván thật: Game 606 ply 14 (Đỏ đã có chốt 7, giờ thúc tiếp chốt 3 tạo Lưỡng đầu xà)
    const fen = "1rbaka2r/9/2n1bcn2/p3p1p1p/2p6/6P2/PcP1P3P/N1C1C1N2/9/1RBAKABR1 w - - 0 8";
    const uciPv = ["e3e4", "f9e8", "d0e1", "i9f9"];

    it("ok: true - hoàn thành cấu trúc Lưỡng đầu xà thúc cả chốt 3 và 7 (Game 606)", () => {
      const t = real(fen, 56, 47, uciPv, 30, 0);
      const res = checkLuongDauXa(t.before, t.move, t.after, t.options);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.summary).toContain("Lưỡng đầu xà");
      }
      const fact = detectLuongDauXa(t.before, t.move, t.after, t.options);
      expect(fact?.lesson).toBe(42);
    });

    it("Tầng 1 trượt: chốt đối diện chưa tiến", () => {
      const pos = parseFen(fen);
      const board = [...pos.board];
      board[sq(5, 6)] = null; // Chốt 7 chưa tiến
      board[sq(6, 6)] = "P";
      const move = { from: 56, to: 47 };
      const after = play(board, move);
      const res = checkLuongDauXa(board, move, after, { pv: uciMovesToMoves(uciPv), evalAfter: { score: 0 }, loss: 0 });
      expect(res).toMatchObject({ ok: false, layer: 1 });
    });
  });

  // ==========================================================================
  // Bài 45: Phi Tượng tấn trung binh (checkPhiTuongTanTrungBinh) — Game 2256 ply 21
  // ==========================================================================
  describe("Bài 45: Phi Tượng tấn trung binh", () => {
    // Ván thật: Game 2256 ply 21 (Đen đã phi chính Tượng ở e7, giờ thúc B5+1 mở lộ)
    const fen = "r3kab2/1c2a4/2n1b1n1c/2p1p2rp/p5p2/1CPN5/P3P1P1P/3CB1N2/R4R3/2BAKA3 b - - 0 11";
    const uciPv = ["e6e5", "d2c2", "b8c8", "a1b1"];

    it("ok: true - Phi Tượng chủ động thúc trung binh mở lộ (Game 2256)", () => {
      const t = real(fen, 31, 40, uciPv, 12, 0);
      const res = checkPhiTuongTanTrungBinh(t.before, t.move, t.after, t.options);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.summary).toContain("Phi Tượng tấn trung binh");
      }
      const fact = detectPhiTuongTanTrungBinh(t.before, t.move, t.after, t.options);
      expect(fact?.lesson).toBe(45);
    });

    it("Tầng 1 trượt: chưa phi chính Tượng", () => {
      const pos = parseFen(fen);
      const board = [...pos.board];
      board[sq(2, 4)] = null; // Bỏ Tượng Đen ở trung tâm e7
      const move = { from: 31, to: 40 };
      const after = play(board, move);
      const res = checkPhiTuongTanTrungBinh(board, move, after, { pv: uciMovesToMoves(uciPv), evalAfter: { score: 0 }, loss: 0 });
      expect(res).toMatchObject({ ok: false, layer: 1 });
    });
  });
});
