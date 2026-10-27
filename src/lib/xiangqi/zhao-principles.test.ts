import { describe, expect, it } from "vitest";
import { isLegal, legalMoves, parseFen, play, sq, typeOf, type Board, type Move } from "./engine";
import { engineLine } from "./engine-line";
import { explainText, personaFacts } from "./explain";
import { detectPalaceBreaker, detectSacrificeForInitiative } from "./middlegame";
import {
  detectAllZhaoTactics,
  detectCannonMount,
  detectDecoy,
  checkEndgameConversion,
  detectEndgameConversion,
  detectFlankSwitch,
  detectInitiativeOverMaterial,
  checkInterference,
  detectInterference,
  checkMatingRace,
  detectMatingRace,
  detectPoisonedCapture,
  detectProphylaxis,
  detectTempoChase,
  detectTempoExchange,
  detectWorstPieceImprovement,
  detectKhuyetSiSongXe,
  checkSmotheredCannonMate,
  detectSmotheredCannonMate,
  detectNgoaTaoKnight,
  checkOaTamKnight,
  detectOaTamKnight,
  checkDeepCannonBottom,
  detectDeepCannonBottom,
  detectVoSuTienTotBien,
  checkMayUiTrungLo,
  detectMayUiTrungLo,
  checkNhatMaHoanLuongTuong,
  detectNhatMaHoanLuongTuong,
  checkDoatTrungBinh,
  detectDoatTrungBinh,
  detectKhongTamPhao,
  detectThienDiaPhao,
  detectPhaoDayKhoaXe,
  detectOanhTacLoSuon,
  detectManhCongTuyenApDay,
  checkKiemCheDinhCung,
  detectKiemCheDinhCung,
  checkChiemTuyenTot,
  detectChiemTuyenTot,
  checkKhongCheKyHa,
  detectKhongCheKyHa,
  detectTranhDoatLo3Lo7,
  checkPhongToaLoXe,
  detectPhongToaLoXe,
  checkTotBienDaiNao,
  detectTotBienDaiNao,
  detectSongXePhoiHop,
  detectPhaoGanh,
  detectLienHoanMa,
  detectXeMaPhaoTamTu,
  detectXeSongMa,
  detectXeSongPhao,
  detectXeMaLanhChieu,
  detectKheoPhaSiTuong,
  detectPheQuanPhaSiTuong,
  detectVayXe,
  detectVayPhao,
  detectMaPhungBienTatVong,
  detectVayMaGiac,
  checkXeMaDoiXePhao,
  detectTamNganThangTamXa,
  detectTamXaThangTamNgan,
  checkMotXeDoiHai,
  detectMotXeDoiHai,
  checkMotXeDoiBa,
  detectMotXeDoiBa,
  checkMaVanNhuLong,
  detectMaVanNhuLong,
  detectNhatXeThapTu,
  detectNgheThuatVanPhao,
  detectTieuBinhLapDaiCong,
  checkPheTotPhanCong,
  detectPheTotPhanCong,
  checkChienThuatMuuBinh,
  detectChienThuatMuuBinh,
  detectCucBoDiDaKichThieu,
} from "./zhao-principles";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });

/** Thế cờ + nước đi, kiểm tra nước đi hợp lệ để test không dựa trên thế cờ phi luật. */
function setup(fen: string, move: Move): { before: Board; after: Board } {
  const pos = parseFen(fen);
  expect(isLegal(pos, move)).toBe(true);
  return { before: pos.board, after: play(pos.board, move) };
}

/**
 * Thế cờ thật (ván đại sư xqbase) kèm điểm và biến chính Pikafish 30k nodes: `before` = điểm thế trước theo bên đi,
 * `afterForOpp` = điểm thế sau theo bên đối phương, `pv` = biến của thế sau (bắt đầu bằng nước đáp).
 */
function attack(fen: string, from: number, to: number, pv: number[][], before: number, afterForOpp: number, loss = 0) {
  const pos = parseFen(fen);
  const move = { from, to };
  expect(isLegal(pos, move)).toBe(true);
  return {
    before: pos.board,
    move,
    after: play(pos.board, move),
    options: { pv: pv.map(([f, t]) => ({ from: f, to: t })), loss, evalBefore: { score: before }, evalAfter: { score: afterForOpp } },
  };
}

// Thế cờ thật từ ván cao thủ, biến Pikafish ghi lại (ô = hàng * 9 + cột)
const line = (xs: number[][]): Move[] => xs.map(([from, to]) => ({ from, to }));
const real = (fen: string, from: number, to: number, pv: number[][], scoreForMover: number, loss = 0) => {
  const pos = parseFen(fen);
  const move = { from, to };
  expect(isLegal(pos, move)).toBe(true);
  const after = play(pos.board, move);
  return { before: pos.board, move, after, options: { pv: line(pv), loss, evalAfter: { score: -scoreForMover } } };
};

describe("zhao-principles: nguyên lý tranh tiên bổ sung", () => {
  describe("Ninh thất nhất tử, bất thất nhất tiên", () => {
    // Đen bỏ Mã b5 không căn; Đỏ có thể bình Pháo trung lộ chiếu (Tốt đen e6 làm ngòi).
    const fen = "2bakab2/9/9/4p4/1n7/9/9/1R5C1/9/3AKA3 w - - 0 1";
    const capture = mv(7, 1, 4, 1); // Xe ăn Mã
    const pawnCheck = mv(7, 7, 7, 4); // Pháo bình trung chiếu

    it("phê bình nước ăn Mã khi nước tốt nhất là nước chiếu giữ tiên", () => {
      const { before, after } = setup(fen, capture);
      const f = detectInitiativeOverMaterial(before, capture, after, {
        loss: 180,
        evalBefore: { score: 300, best: pawnCheck, pv: [pawnCheck] },
      });
      expect(f?.tactic).toBe("ninhThatNhatTu");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("Ninh thất nhất tử");
      expect(f?.details).toContain("Nên đi");
    });

    it("khen nước bỏ miếng ăn để chiếu giữ tiên khi engine xác nhận là nước tốt nhất", () => {
      const { before, after } = setup(fen, pawnCheck);
      const f = detectInitiativeOverMaterial(before, pawnCheck, after, {
        loss: 0,
        evalBefore: { score: 300, best: pawnCheck },
      });
      expect(f?.tactic).toBe("ninhThatNhatTu");
      expect(f?.tone).toBeUndefined();
      expect(f?.summary).toContain("không ham ăn Mã");
    });

    it("không khen khi engine thích nước khác (ăn Mã mới là nước tốt nhất)", () => {
      const { before, after } = setup(fen, pawnCheck);
      expect(detectInitiativeOverMaterial(before, pawnCheck, after, { loss: 20, evalBefore: { score: 300, best: capture } })).toBeNull();
    });

    it("không phê bình khi nước tốt nhất cũng là ăn quân", () => {
      const { before, after } = setup(fen, capture);
      const otherCapture = mv(7, 1, 4, 1);
      expect(detectInitiativeOverMaterial(before, capture, after, { loss: 150, evalBefore: { score: 300, best: otherCapture } })).toBeNull();
    });
  });

  describe("Tham ăn mắc mồi", () => {
    // Xe Đỏ g0 đang giữ đáy. Ăn Mã g5 bỏ ngỏ hàng đáy, Xe Đen i5 xuống i0 chiếu.
    const fen = "3aka3/9/9/9/8r/6n2/9/9/4A4/4K1R2 w - - 0 1";
    const capture = mv(9, 6, 5, 6);
    const backRankCheck = mv(4, 8, 9, 8);

    it("phê bình ăn quân trông có lời nhưng bị phản đòn chiếu", () => {
      const { before, after } = setup(fen, capture);
      const f = detectPoisonedCapture(before, capture, after, { loss: 400, pv: [backRankCheck] });
      expect(f?.tactic).toBe("khongThamAn");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("chiếu");
    });

    it("không phê bình khi engine không chấm lỗi nặng", () => {
      const { before, after } = setup(fen, capture);
      expect(detectPoisonedCapture(before, capture, after, { loss: 40, pv: [backRankCheck] })).toBeNull();
    });
  });

  describe("Binh quý thần tốc (Tranh nước đối công - Triệu Hâm Hâm Bài 8)", () => {
    // Đen dọa Xe a3 xuống a0 chiếu bí (Tốt đen e2 khóa đường lên của Tướng).
    // Đỏ không chống mà Xe f4 lên f9 chiếu, Mã g7 giữ ô f9 và e8.
    const fen = "2b1k1b2/9/6N2/9/9/5R3/r8/4p4/9/4K4 w - - 0 1";
    const counterCheck = mv(5, 5, 0, 5);

    it("khen nước chiếu trước khi đang bị dọa sát và biến engine sát trước", () => {
      // Biến: Đen Tướng tránh T5-4, Đỏ Xe chiếu tiếp dẫn tới sát
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(0, 5), sq(0, 4)],
        [sq(0, 3), sq(1, 3)],
        [sq(0, 4), sq(1, 4)],
      ];
      const t = real(fen, sq(5, 5), sq(0, 5), pv, 100000, 0);
      const r = checkMatingRace(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "chiếu trước giành nước" });
      expect(r && r.ok && r.summary).toContain("Binh quý thần tốc");
      expect(r && r.ok && r.summary).toContain("Đối phương đang dọa sát");
      expect(r && r.ok && r.summary).toContain("chiếu trước giành nước");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectMatingRace(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("tranhNuoc");
      expect(f?.summary).toContain("dọa sát");
    });

    it("chỉ có hình chiếu trước khi bị dọa sát, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, counterCheck);
      expect(detectMatingRace(before, counterCheck, after, { loss: 0 })).toBeNull();
      expect(checkMatingRace(before, counterCheck, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: đối phương không có đòn dọa sát", () => {
      // Bỏ Tốt đen e2: Tướng Đỏ lên e1 thoát được, Xe xuống đáy không còn là sát
      const fen2 = "2b1k1b2/9/6N2/9/4p4/5R3/r8/9/9/4K4 w - - 0 1";
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen2, sq(5, 5), sq(0, 5), pv, 100000, 0);
      const r = checkMatingRace(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không có đòn dọa sát");
    });

    it("Tầng 1 trượt: nước đi không chiếu Tướng giành nước", () => {
      const quiet = mv(5, 5, 5, 6);
      const pv = [
        [sq(6, 0), sq(9, 0)],
      ];
      const t = real(fen, sq(5, 5), sq(5, 6), pv, -100000, 500);
      const r = checkMatingRace(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không chiếu Tướng giành nước");
    });

    it("Tầng 2 trượt: nước đi ăn quân lớn nhưng không chiếu bí trong biến", () => {
      // Có Pháo đen ở f9 (0, 5), Xe đỏ ăn Pháo chiếu nhưng không sát được
      const eatFen = "2b1kcb2/9/6N2/9/9/5R3/r8/4p4/9/4K4 w - - 0 1";
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(0, 5), sq(0, 4)],
        [sq(0, 3), sq(0, 4)],
      ];
      const t = real(eatFen, sq(5, 5), sq(0, 5), pv, 100, 0);
      const r = checkMatingRace(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("mục đích là ăn quân");
    });

    it("Tầng 3 trượt: biến engine không sát trước, bị đối phương phản sát", () => {
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(0, 5), sq(0, 6)],
        [sq(6, 0), sq(9, 0)],
      ];
      const t = real(fen, sq(5, 5), sq(0, 5), pv, -100000, 0);
      const r = checkMatingRace(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("không cho thấy bên đi sát trước");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(5, 5), sq(0, 5), pv, 100000, 200);
      const r = checkMatingRace(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });

    it("bên đi đang bị chiếu sẵn: trả về null", () => {
      const inCheckFen = "2b1k1b2/9/6N2/9/9/5R3/9/3n5/9/4K4 w - - 0 1";
      const kingMove = mv(9, 4, 9, 5);
      const { before, after } = setup(inCheckFen, kingMove);
      expect(checkMatingRace(before, kingMove, after, { loss: 0 })).toBeNull();
      expect(detectMatingRace(before, kingMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Đuổi quân được tiên", () => {
    // Mã c2 nhảy d4 vừa tiến quân vừa dọa Xe đen c6; Mã đứng chỗ an toàn.
    const fen = "2bakab2/9/9/2r1p4/9/9/9/2N6/9/R2AKA3 w - - 0 1";
    const chase = mv(7, 2, 5, 3);

    it("khen khi đối phương phải dùng nước đáp để chạy Xe", () => {
      const { before, after } = setup(fen, chase);
      const f = detectTempoChase(before, chase, after, { loss: 10, pv: [mv(3, 2, 3, 0)] });
      expect(f?.tactic).toBe("duoiQuanDuocTien");
      expect(f?.summary).toContain("tiến lên");
      expect(f?.summary).toContain("dọa ăn Xe");
    });

    it("không nhận khi đối phương lờ đi và phản đòn ăn quân", () => {
      // Đen mặc kệ Xe bị dọa, dùng Tốt e6 ăn Tốt đỏ e5.
      const fen2 = "2bakab2/9/9/2r1p4/4P4/9/9/2N6/9/R2AKA3 w - - 0 1";
      const { before, after } = setup(fen2, chase);
      expect(detectTempoChase(before, chase, after, { loss: 10, pv: [mv(3, 4, 4, 4)] })).toBeNull();
    });
  });

  describe("Dẫn dụ", () => {
    // Xe Đen i7 canh ô d7 (ô Mã ngọa tào). Đỏ thí Xe i5 dụ Xe Đen xuống ăn, rồi Mã c6 vào d7 chiếu.
    const fen = "3aka3/9/8r/9/2N6/R8/4P4/9/9/4K4 w - - 0 1";
    const sac = mv(5, 0, 5, 8);
    const pv = [mv(2, 8, 5, 8), mv(4, 2, 2, 3)];

    it("nhận diện thí Xe dụ quân canh giữ rời vị trí", () => {
      const { before, after } = setup(fen, sac);
      const f = detectDecoy(before, sac, after, { loss: 0, pv });
      expect(f?.tactic).toBe("danDu");
      expect(f?.summary).toContain("đang canh giữ");
      expect(f?.summary).toContain("chiếu");
    });

    it("không nhận khi đối phương không cắn mồi", () => {
      const { before, after } = setup(fen, sac);
      expect(detectDecoy(before, sac, after, { loss: 0, pv: [mv(0, 4, 1, 4), mv(4, 2, 2, 3)] })).toBeNull();
    });
  });

  describe("Chặn đường (Rút Đao Chém Nước - Triệu Hâm Hâm Bài 6)", () => {
    // Pháo đen g7 được Xe a7 bảo vệ theo hàng ngang; Mã đỏ nhảy vào c7 cắt liên lạc, Xe g3 ăn được Pháo.
    const fen = "3aka3/9/r5c2/4p4/1N7/9/6R2/9/9/4K4 w - - 0 1";
    const cut = mv(4, 1, 2, 2);

    it("công nhận đòn chặn đường cắt căn khi biến engine bắt được quân bị cắt căn", () => {
      // Biến: Đen T5-4, Đỏ Xe ăn Pháo g7, Đen T4-5
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(6, 6), sq(2, 6)],
        [sq(0, 3), sq(0, 4)],
      ];
      const t = real(fen, sq(4, 1), sq(2, 2), pv, 500, 0);
      const r = checkInterference(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "cắt liên lạc đoạt quân" });
      expect(r && r.ok && r.summary).toContain("Chặn đường");
      expect(r && r.ok && r.summary).toContain("Pháo đối phương mất căn");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectInterference(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("chanDuong");
      expect(f?.summary).toContain("Pháo đối phương mất căn");
    });

    it("chỉ có hình cắt căn, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, cut);
      expect(detectInterference(before, cut, after, { loss: 0 })).toBeNull();
      expect(checkInterference(before, cut, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: chen vào tuyến nhưng quân đối phương không mất căn hoặc không bị dọa ăn có lời", () => {
      // Không có Xe đỏ ở g3 dọa ăn Pháo đen ở g7
      const noThreatFen = "3aka3/9/r5c2/4p4/1N7/9/9/9/9/4K4 w - - 0 1";
      const t = real(noThreatFen, sq(4, 1), sq(2, 2), [[sq(0, 4), sq(0, 3)]], 0, 0);
      const r = checkInterference(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không mất căn hoặc không bị dọa ăn có lời");
    });

    it("Tầng 2 trượt: nước chen ăn quân (mục đích là ăn quân chứ không phải chen vào cắt liên lạc)", () => {
      // Có Tốt đen ở c7, Mã đỏ nhảy ăn Tốt c7
      const pawnFen = "3aka3/9/r1p3c2/4p4/1N7/9/6R2/9/9/4K4 w - - 0 1";
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(6, 6), sq(2, 6)],
        [sq(0, 3), sq(0, 4)],
      ];
      const t = real(pawnFen, sq(4, 1), sq(2, 2), pv, 500, 0);
      const r = checkInterference(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("mục đích là ăn quân");
    });

    it("Tầng 3 trượt: biến engine đối phương chạy quân thoát, không bắt được quân bị cắt căn", () => {
      // Đen chạy Pháo sang lộ 9 thoát thân
      const pv = [
        [sq(2, 6), sq(2, 8)],
        [sq(6, 6), sq(6, 4)],
        [sq(2, 8), sq(2, 6)],
      ];
      const t = real(fen, sq(4, 1), sq(2, 2), pv, 100, 0);
      const r = checkInterference(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("Biến không bắt được Pháo bị cắt căn");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(0, 4), sq(0, 3)],
        [sq(6, 6), sq(2, 6)],
        [sq(0, 3), sq(0, 4)],
      ];
      const t = real(fen, sq(4, 1), sq(2, 2), pv, 500, 200);
      const r = checkInterference(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });

    it("nước đi không chen vào tuyến giao liên nào: trả về null", () => {
      const quiet = mv(4, 1, 6, 2);
      const { before, after } = setup(fen, quiet);
      expect(checkInterference(before, quiet, after, { loss: 0 })).toBeNull();
      expect(detectInterference(before, quiet, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Giá Pháo", () => {
    // Pháo đỏ e2 chưa có ngòi; Mã d2 nhảy lên e4 làm ngòi, Pháo chiếu Tướng.
    const fen = "3aka3/9/9/9/9/9/9/3NC4/9/4K4 w - - 0 1";
    const mount = mv(7, 3, 5, 4);

    it("chỉ có hình (quân làm ngòi cho Pháo chiếu) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, mount);
      expect(detectCannonMount(before, mount, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi quân đi không nằm giữa Pháo và mục tiêu", () => {
      const away = mv(7, 3, 5, 2);
      const { before, after } = setup(fen, away);
      expect(detectCannonMount(before, away, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Đổi quân giành tiên", () => {
    // Xe đỏ đổi Xe đen d7; Xe đen i7 ăn lại thì Mã đỏ g6 vào f8 chiếu.
    const fen = "3aka3/9/3r4r/4p4/6N2/9/3R5/9/9/4K4 w - - 0 1";
    const trade = mv(6, 3, 2, 3);

    it("nhận diện đổi Xe xong vẫn được đi nước chiếu", () => {
      const { before, after } = setup(fen, trade);
      const f = detectTempoExchange(before, trade, after, { loss: 0, pv: [mv(2, 8, 2, 3), mv(4, 6, 2, 5)] });
      expect(f?.tactic).toBe("doiQuanGianhTien");
      expect(f?.summary).toContain("có tiên");
    });

    it("không nhận khi đối phương không ăn lại (đó là ăn quân, không phải đổi)", () => {
      const { before, after } = setup(fen, trade);
      expect(detectTempoExchange(before, trade, after, { loss: 0, pv: [mv(0, 4, 1, 4)] })).toBeNull();
    });
  });

  describe("Cải thiện quân kém nhất", () => {
    // Mã đỏ a1 đứng biên, chỉ 3 đường đi; nhảy ra b3 thoáng hẳn.
    const fen = "3aka3/9/9/4p4/9/9/9/9/N8/3AKA2R w - - 0 1";
    const improve = mv(8, 0, 6, 1);

    it("nhận diện đưa Mã biên ra vị trí hoạt động", () => {
      const { before, after } = setup(fen, improve);
      const f = detectWorstPieceImprovement(before, improve, after, { loss: 0 });
      expect(f?.tactic).toBe("caiThienQuanKem");
      expect(f?.summary).toContain("Mã");
    });

    it("không tính nước ra quân từ ô xuất phát", () => {
      const fen2 = "3aka3/9/9/4p4/9/9/9/9/9/1N1AKA2R w - - 0 1";
      const develop = mv(9, 1, 7, 2);
      const { before, after } = setup(fen2, develop);
      expect(detectWorstPieceImprovement(before, develop, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Thanh đông kích tây", () => {
    // Đỏ vừa dồn Mã, Pháo sang cánh lộ 1-3 (cột g-i), Đen kéo Xe, Mã về giữ; nay Xe a0 lên a7 bắt Pháo đen b7.
    const fen = "3akab2/7r1/1c4n2/4p4/8C/9/9/6N2/9/R3K4 w - - 0 1";
    const swing = mv(9, 0, 2, 0);
    const recentMoves = [mv(9, 7, 7, 6), mv(1, 8, 1, 7), mv(4, 7, 4, 8), mv(0, 7, 2, 6)];

    it("nhận diện chuyển đòn sang cánh đối diện sau khi ép một cánh", () => {
      const { before, after } = setup(fen, swing);
      const f = detectFlankSwitch(before, swing, after, { loss: 0, recentMoves });
      expect(f?.tactic).toBe("thanhDongKichTay");
      expect(f?.summary).toContain("dọa ăn Pháo");
    });

    it("không nhận khi không có lịch sử nước đi", () => {
      const { before, after } = setup(fen, swing);
      expect(detectFlankSwitch(before, swing, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương chưa bị kéo về cánh bị ép", () => {
      const { before, after } = setup(fen, swing);
      const quietOpp = [mv(9, 7, 7, 6), mv(0, 3, 1, 4), mv(4, 7, 4, 8), mv(1, 4, 0, 3)];
      expect(detectFlankSwitch(before, swing, after, { loss: 0, recentMoves: quietOpp })).toBeNull();
    });
  });

  describe("Phòng ngừa", () => {
    // Mã đen f5 sắp nhảy vào ngọa tào g2; Đỏ đưa Xe lên i2 khống chế trước.
    const fen = "3aka3/9/9/4p4/9/5n3/9/9/9/3AKA2R w - - 0 1";
    const prevent = mv(9, 8, 7, 8);

    it("nhận diện chặn trước đường Mã vào ngọa tào", () => {
      const { before, after } = setup(fen, prevent);
      const f = detectProphylaxis(before, prevent, after, { loss: 0 });
      expect(f?.tactic).toBe("phongNgua");
      expect(f?.summary).toContain("ngọa tào");
    });

    it("không nhận nước không đụng tới đường tiến của Mã", () => {
      const other = mv(9, 8, 8, 8);
      const { before, after } = setup(fen, other);
      expect(detectProphylaxis(before, other, after, { loss: 0 })).toBeNull();
    });
  });

  describe("checkEndgameConversion (Kỳ lý #5 - Hơn quân cần giản hóa / Chuyển hóa tàn cuộc)", () => {
    // Đỏ hơn 3 Tốt, đổi Xe; Mã đen ăn lại, Đỏ đi nước yên.
    const fen = "2naka3/9/3r5/9/2P3P2/3R5/4P4/2N6/9/3AKA3 w - - 0 1";
    const trade = mv(5, 3, 2, 3);
    const pv = [mv(0, 2, 2, 3), mv(4, 6, 3, 6), mv(0, 4, 0, 5)];

    it("công nhận khi đang hơn vật chất, chủ động đổi quân lớn giản hóa về tàn cuộc", () => {
      const { before, after } = setup(fen, trade);
      const options = { loss: 0, evalBefore: { score: 250 }, evalAfter: { score: -200 }, pv };
      const r = checkEndgameConversion(before, trade, after, options);
      expect(r).toMatchObject({ ok: true, mechanism: "chủ động đổi quân lớn giản hóa về tàn cuộc" });
      expect(r && r.ok && r.summary).toContain("Hơn quân cần giản hóa");
      expect(r && r.ok && r.summary).toContain("hơn 3 Tốt");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectEndgameConversion(before, trade, after, options);
      expect(f?.tactic).toBe("chuyenHoaTanCuoc");
      expect(f?.lesson).toBe(5);
    });

    it("chỉ có hình đổi quân, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, trade);
      expect(detectEndgameConversion(before, trade, after, { loss: 0 })).toBeNull();
      expect(checkEndgameConversion(before, trade, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: trước nước đi bên đi không hơn vật chất", () => {
      // Mỗi bên 1 Xe, 1 Mã, 1 Tốt ở cột 4 cản Tướng: vật chất hai bên cân bằng
      const equalFen = "2naka3/9/3r5/4p4/9/3R5/4P4/2N6/9/3AKA3 w - - 0 1";
      const { before, after } = setup(equalFen, trade);
      const options = { loss: 0, evalBefore: { score: 250 }, evalAfter: { score: -200 }, pv };
      const r = checkEndgameConversion(before, trade, after, options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không hơn vật chất trước nước đi");
    });

    it("Tầng 2 trượt: điểm engine trước nước đi chưa đủ ưu thế (< 100)", () => {
      const { before, after } = setup(fen, trade);
      const options = { loss: 0, evalBefore: { score: 20 }, evalAfter: { score: -20 }, pv };
      const r = checkEndgameConversion(before, trade, after, options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("chưa đủ ưu thế");
      expect(detectEndgameConversion(before, trade, after, options)).toBeNull();
    });

    it("Tầng 3 trượt: đối phương không ăn lại đổi quân", () => {
      const { before, after } = setup(fen, trade);
      const noRecapturePv = [mv(0, 2, 1, 4), mv(4, 6, 3, 6), mv(0, 4, 0, 5)];
      const options = { loss: 0, evalBefore: { score: 250 }, evalAfter: { score: -200 }, pv: noRecapturePv };
      const r = checkEndgameConversion(before, trade, after, options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("không cho thấy đối phương ăn lại đổi quân");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const { before, after } = setup(fen, trade);
      const options = { loss: 200, evalBefore: { score: 250 }, evalAfter: { score: -200 }, pv };
      const r = checkEndgameConversion(before, trade, after, options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });
  });

  describe("Khuyết Sĩ Kỵ Song Xe (Triệu Hâm Hâm Bài 1)", () => {
    // Đen khuyết 1 Sĩ (chỉ còn 1 Sĩ tại d9/sq 3). Đỏ đủ Song Xe, Xe Đỏ cắm xuống đáy tấn công
    const fen = "4kab2/9/4b4/1R7/4P4/9/9/4B4/4A4/1R2KAB2 w - - 0 1";
    const rookAttack = mv(3, 1, 0, 1);

    it("chỉ có hình (Song Xe áp thành khi đối phương khuyết Sĩ) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, rookAttack);
      expect(detectKhuyetSiSongXe(before, rookAttack, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương còn đủ 2 Sĩ", () => {
      // Đen còn nguyên 2 Sĩ tại sq 3 và sq 5
      const fullAdvisorsFen = "3akab2/9/4b4/1R7/4P4/9/9/4B4/4A4/1R2KAB2 w - - 0 1";
      const { before, after } = setup(fullAdvisorsFen, rookAttack);
      expect(detectKhuyetSiSongXe(before, rookAttack, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi bên công chỉ còn 1 Xe", () => {
      // Đỏ chỉ có 1 Xe duy nhất tại hàng 3 cột 1
      const singleRookFen = "4kab2/9/4b4/1R7/4P4/9/9/4B4/4A4/4KAB2 w - - 0 1";
      const { before, after } = setup(singleRookFen, rookAttack);
      expect(detectKhuyetSiSongXe(before, rookAttack, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Xe di chuyển trong sân nhà chưa qua sông", () => {
      const homeMoveFen = "4kab2/9/4b4/9/4P4/9/1R7/4B4/4A4/1R2KAB2 w - - 0 1";
      const homeMove = mv(6, 1, 5, 1);
      const { before, after } = setup(homeMoveFen, homeMove);
      expect(detectKhuyetSiSongXe(before, homeMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Muộn cung sát (Khuyết Tượng sợ Pháo - Triệu Hâm Hâm Bài 2)", () => {
    // Đỏ Pháo cắm đáy chiếu qua ngòi Sĩ đen, Tướng đen bị Song Sĩ và Mã Oa Tâm chèn kẹt tuyệt sát
    const fen = "3aka3/4n4/8C/9/9/9/9/9/9/4K4 w - - 0 1";
    const mateMove = mv(2, 8, 0, 8); // P1.2 cắm đáy chiếu qua Sĩ (0, 5)

    it("nhận diện Pháo chiếu muộn cung khi Tướng bị chính quân phòng thủ chèn kẹt tuyệt sát", () => {
      const t = real(fen, sq(2, 8), sq(0, 8), [], 100000);
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "muộn cung sát" });
      expect(r && r.ok && r.summary).toContain("Muộn cung sát");
      expect(r && r.ok && r.summary).toContain("Song Sĩ, Mã chèn kẹt");
      expect(r && r.ok && r.summary).toContain("chiếu bí ngay");

      const f = detectSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("muonCungSat");
      expect(f?.summary).toContain("chiếu bí ngay");
    });

    it("nhận diện khi biến engine dẫn tới đòn sát muộn cung của Pháo sau nước đỡ", () => {
      // Đỏ Pháo cắm đáy chiếu; Đen có Xe ở hàng 4 cột 7 phải thoái về chắn (0, 7); Pháo ăn Xe chiếu bí
      const multiPlyFen = "3aka3/4n4/8C/9/7r1/9/9/9/9/4K4 w - - 0 1";
      const pv = [
        [sq(4, 7), sq(0, 7)], // Đen Xe thoái đỡ chiếu
        [sq(0, 8), sq(0, 7)], // Đỏ Pháo ăn Xe chiếu bí
      ];
      const t = real(multiPlyFen, sq(2, 8), sq(0, 8), pv, 99998);
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "muộn cung sát" });
      expect(r && r.ok && r.summary).toContain("theo biến:");
      expect(r && r.ok && r.summary).toContain("chiếu bí");
    });

    it("chỉ có hình Pháo cắm chiếu, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, mateMove);
      expect(detectSmotheredCannonMate(before, mateMove, after, { loss: 0 })).toBeNull();
      expect(checkSmotheredCannonMate(before, mateMove, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: Pháo đi nước không chiếu Tướng và không hướng vào cung", () => {
      const awayFen = "3aka3/4n4/9/9/9/9/9/C8/9/4K4 w - - 0 1";
      const sideMove = mv(7, 0, 7, 1);
      const t = real(awayFen, sq(7, 0), sq(7, 1), [], 100);
      expect(checkSmotheredCannonMate(t.before, t.move, t.after, t.options)).toMatchObject({
        ok: false, layer: 1,
      });
    });

    it("Tầng 2 trượt: Pháo ăn Xe nhưng biến không dẫn tới chiếu bí (mục đích là ăn quân)", () => {
      // Có Tốt đỏ ở (2, 4) làm ngòi để Pháo ở (2, 8) ăn Xe đen ở (2, 0)
      const captureFen = "3aka3/4n4/r3P3C/9/9/9/9/9/9/4K4 w - - 0 1";
      const captureMove = mv(2, 8, 2, 0); // Pháo ăn Xe ngang qua Tốt
      const t = real(captureFen, sq(2, 8), sq(2, 0), [[sq(0, 4), sq(0, 3)]], 500);
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("mục đích là ăn quân");
    });

    it("Tầng 3 trượt: Pháo chiếu nhưng biến engine không dẫn tới chiếu bí", () => {
      // Thế cờ khai cuộc: Đỏ bình Pháo chiếu nhưng Tướng còn ô thoát và engine không chấm sát
      const openingFen = "3aka3/9/9/9/4p4/9/9/C8/9/4K4 w - - 0 1";
      const checkMove = mv(7, 0, 7, 4);
      const t = real(openingFen, sq(7, 0), sq(7, 4), [[sq(0, 4), sq(1, 4)]], 50);
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3, reason: "Biến không dẫn tới chiếu bí" });
    });

    it("Tầng 3 trượt: Pháo khác mới là quân chiếu bí, không phải Pháo vừa đi (Lỗi 3)", () => {
      // Đỏ có Pháo 1 ở (0, 6), Pháo 2 ở (0, 8), Tướng ở (9, 5).
      // Pháo 1 ở (0, 6) rút về (2, 6) mở đường cho Pháo 2 ở (0, 8) chiếu bí qua Sĩ (0, 5).
      // Quân chiếu bí là Pháo 2 ở (0, 8), còn Pháo vừa đi là Pháo 1 ở (2, 6) (checkers không chứa move.to)
      // -> loại ở Tầng 3 vì không phải Pháo vừa đi chiếu muộn cung
      const discoveredFen = "3akaC1C/4n4/9/9/9/9/9/9/9/5K3 w - - 0 1";
      const t = real(discoveredFen, sq(0, 6), sq(2, 6), [], 100000);
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("không phải đòn Muộn cung của Pháo");
    });

    it("Tầng 3 trượt: biến engine kết thúc khi đối phương vẫn còn nước chống đỡ, chưa phải thế bí thật (Lỗi 4)", () => {
      // Đỏ Pháo cắm đáy chiếu Tướng ở (0, 8) qua Sĩ (0, 5), nhưng Tướng Đen còn ô (1, 4) chạy thoát
      // Tướng đỏ ở (9, 5) để không phạm luật lộ mặt tướng
      const notMateFen = "3aka3/9/8C/9/9/9/9/9/9/5K3 w - - 0 1";
      const t = real(notMateFen, sq(2, 8), sq(0, 8), [], 100000);
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("đối phương vẫn còn nước chống đỡ, chưa phải thế bí thật");
    });

    it("Tầng 3 trượt: chiếu bí trên bàn cờ mở nhưng Tướng trơ trọi không bị quân mình chèn kẹt", () => {
      // Đỏ phối hợp Xe Mã Pháo chiếu bí Tướng trơ trọi (bare king), không phải muộn cung
      const bareKingFen = "4k1R2/8C/2N6/9/9/4P4/9/9/9/4K4 w - - 0 1";
      const mateMoveBare = mv(1, 8, 0, 8);
      const t = real(bareKingFen, sq(1, 8), sq(0, 8), [], 100000);
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("không bị chính quân nhà chèn kẹt");
    });

    it("Tầng 4 trượt: nước đi hớ so với nước tốt nhất", () => {
      const t = real(fen, sq(2, 8), sq(0, 8), [], 100000, 150); // loss = 150
      const r = checkSmotheredCannonMate(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 150 điểm");
    });

    it("không phải quân Pháo: trả về null", () => {
      const kingMove = mv(9, 4, 8, 4);
      const { before, after } = setup(fen, kingMove);
      expect(checkSmotheredCannonMate(before, kingMove, after, { loss: 0 })).toBeNull();
      expect(detectSmotheredCannonMate(before, kingMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Mã Ngọa Tào (Thuật dùng Mã mạnh nhất - Triệu Hâm Hâm Bài 3)", () => {
    // Đỏ Mã cắm ngọa tào tại lộ 7 tuyến 2 (hàng 1 cột 2)
    const fen = "4k4/9/9/1N7/4P4/9/9/9/9/4K4 w - - 0 1";
    const knightMove = mv(3, 1, 1, 2);

    it("chỉ có hình (Mã nhảy vào yếu huyệt Ngọa Tào hàng 2 dọa sát) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, knightMove);
      expect(detectNgoaTaoKnight(before, knightMove, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Mã nhảy tới ô không phải Ngọa Tào", () => {
      const otherMove = mv(3, 1, 4, 3);
      const { before, after } = setup(fen, otherMove);
      expect(detectNgoaTaoKnight(before, otherMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Oa Tâm Mã (Mã Xấu Nhất - Triệu Hâm Hâm Bài 4)", () => {
    // Đen thoái Mã về hoa tim giữa cung (hàng 1 cột 4), tự chèn kẹt Tướng và bị Đỏ cắm Pháo đáy chiếu bí
    const fen = "3aka3/9/2n5C/9/4P4/9/9/9/9/4K4 b - - 0 1";
    const oaTamMove = mv(2, 2, 1, 4);

    it("phê bình khi Mã nhảy vào hoa tim trung cung khiến Tướng bị chèn kẹt và bị chiếu bí trong biến", () => {
      // Đỏ đáp C8.2 chiếu qua ngòi Sĩ (0, 5), Tướng đen bị kẹt bởi Song Sĩ và Mã hoa tim (1, 4) chiếu bí ngay
      const pv = [[sq(2, 8), sq(0, 8)]];
      const t = real(fen, sq(2, 2), sq(1, 4), pv, -100000, 1500);
      const r = checkOaTamKnight(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "Oa Tâm Mã tự chèn kẹt" });
      expect(r && r.ok && r.summary).toContain("Oa Tâm Mã");
      expect(r && r.ok && r.summary).toContain("bịt kín đường thoát của Tướng");
      expect(r && r.ok && r.summary).toContain("theo biến:");
      expect(r && r.ok && r.summary).toContain("chiếu bí");

      const f = detectOaTamKnight(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("oaTamMa");
      expect(f?.tone).toBe("critique");
    });

    it("phê bình khi Mã nhảy vào hoa tim và bị đối phương vây bắt trong biến (Lỗi 1: knightCaptured)", () => {
      // Đỏ có Xe ở (1, 0), Tướng ở (9, 4). Đen có Tướng ở (0, 4), Sĩ ở (0, 3) và (0, 5), Mã ở (2, 2).
      // Đen đi N2.4 nhảy vào hoa tim (1, 4).
      // Biến PV: Đỏ R1.4 ăn Mã ở (1, 4) tại ply 1 (origin của Mã là (2, 2)), Đen chạy Tướng, Đỏ rút Xe.
      const captureFen = "3aka3/R8/2n6/9/9/9/9/9/9/4K4 b - - 0 1";
      const pv = [
        [sq(1, 0), sq(1, 4)],
        [sq(0, 4), sq(0, 5)],
        [sq(1, 4), sq(1, 0)],
      ];
      const t = real(captureFen, sq(2, 2), sq(1, 4), pv, -500, 450);
      const r = checkOaTamKnight(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "Oa Tâm Mã tự chèn kẹt" });
      expect(r && r.ok && r.summary).toContain("Mã nhập tâm trở thành mục tiêu bị vây bắt");
    });

    it("chỉ có hình Mã về hoa tim, không có biến engine thì không phê bình", () => {
      const { before, after } = setup(fen, oaTamMove);
      expect(detectOaTamKnight(before, oaTamMove, after, { loss: 500 })).toBeNull();
      expect(checkOaTamKnight(before, oaTamMove, after, { loss: 500 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: Mã nhảy vào cung nhưng không phải ô hoa tim (nhảy vào góc cung)", () => {
      const palaceFen = "4ka3/9/2n5C/9/4P4/9/9/9/9/4K4 b - - 0 1";
      const cornerMove = mv(2, 2, 0, 3);
      const t = real(palaceFen, sq(2, 2), sq(0, 3), [[sq(9, 4), sq(8, 4)]], -500, 200);
      expect(checkOaTamKnight(t.before, t.move, t.after, t.options)).toMatchObject({
        ok: false, layer: 1,
      });
    });

    it("Tầng 2 trượt: Mã ăn Xe xâm nhập hoa tim (mục đích là ăn quân bảo vệ cung)", () => {
      const invadeFen = "3aka3/4R4/2n5C/9/4P4/9/9/9/9/4K4 b - - 0 1";
      const t = real(invadeFen, sq(2, 2), sq(1, 4), [[sq(2, 8), sq(0, 8)]], -100000, 1500);
      const r = checkOaTamKnight(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("mục đích là ăn quân");
    });

    it("Tầng 3 trượt: biến engine bên đi không bị phạt (thế cờ an toàn, không mất quân)", () => {
      // Đen đi Mã hoa tim nhưng Đỏ không có đòn công sát và thế cờ cân bằng
      const safeFen = "3aka3/9/2n6/9/4P4/9/9/9/9/4K4 b - - 0 1";
      const pv = [
        [sq(9, 4), sq(8, 4)],
        [sq(0, 4), sq(0, 3)],
        [sq(8, 4), sq(9, 4)],
      ];
      const t = real(safeFen, sq(2, 2), sq(1, 4), pv, 0, 200);
      const r = checkOaTamKnight(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3, reason: "Biến engine không cho thấy bên đi bị phạt: không bị sát, không mất quân" });
    });

    it("Tầng 3 trượt: đối phương chiếu bí ở cánh khác không dùng Mã làm ngòi và Tướng không kề Mã (Lỗi 5)", () => {
      // Tướng đen ở góc cung (0, 3) (không kề kẹp trực tiếp hoa tim theo hàng/cột)
      // Đỏ có Xe ở (4, 0) cắm xuống (0, 0) chiếu bí, không dùng Pháo và không bắt Mã hoa tim
      const sideFen = "3k5/9/2n6/9/R8/9/9/9/9/4K4 b - - 0 1";
      const pv = [
        [sq(4, 0), sq(0, 0)],
      ];
      const t = real(sideFen, sq(2, 2), sq(1, 4), pv, -100000, 1000);
      const r = checkOaTamKnight(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({
        ok: false,
        layer: 3,
        reason: "Biến thua không xuất phát từ việc Mã ở hoa tim: Tướng không bị cản, Mã không bị bắt",
      });
    });

    it("Tầng 4 trượt: nước đi không phải sai lầm (loss < 100 và engine không chấm thua)", () => {
      const safeFen = "3aka3/9/2n6/9/4P4/9/9/9/9/4K4 b - - 0 1";
      const pv = [
        [sq(9, 4), sq(8, 4)],
        [sq(0, 4), sq(0, 3)],
        [sq(8, 4), sq(9, 4)],
      ];
      const t = real(safeFen, sq(2, 2), sq(1, 4), pv, 100, 0); // loss = 0, score = +100
      const r = checkOaTamKnight(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi không phải sai lầm");
    });

    it("không phải quân Mã: trả về null", () => {
      const kingMove = mv(0, 4, 1, 4);
      const { before, after } = setup(fen, kingMove);
      expect(checkOaTamKnight(before, kingMove, after, { loss: 500 })).toBeNull();
      expect(detectOaTamKnight(before, kingMove, after, { loss: 500 })).toBeNull();
    });

    it("Mã nhảy ra ngoài cung: trả về null", () => {
      const otherMove = mv(2, 2, 4, 3);
      const { before, after } = setup(fen, otherMove);
      expect(checkOaTamKnight(before, otherMove, after, { loss: 500 })).toBeNull();
      expect(detectOaTamKnight(before, otherMove, after, { loss: 500 })).toBeNull();
    });
  });

  describe("Pháo Trầm Đáy (Nghệ Thuật Phá Trận & Kiềm Chế - Triệu Hâm Hâm Bài 13 & 14)", () => {
    // Đỏ cắm Pháo xuống tuyến đáy đối phương (hàng 0 cột 1)
    const fen = "3akab2/9/1C7/9/4P4/9/9/9/9/4K4 w - - 0 1";
    const deepCannonMove = mv(2, 1, 0, 1);

    it("chỉ có hình Pháo xuống đáy, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, deepCannonMove);
      expect(detectDeepCannonBottom(before, deepCannonMove, after, { loss: 0 })).toBeNull();
      expect(checkDeepCannonBottom(before, deepCannonMove, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
    });

    it("rút bắt quân: Pháo chiếu rồi chính Pháo ăn Xe", () => {
      const t = real("1R1rka3/4a4/4bc3/8p/5n3/9/P7P/B3C4/2C6/3AKAB2 w", 74, 2,
        [[3, 21], [2, 5], [21, 3], [5, 3], [4, 5], [3, 12], [13, 3], [1, 3], [5, 14], [67, 64], [41, 30], [64, 10]], 1131);
      expect(checkDeepCannonBottom(t.before, t.move, t.after, t.options)).toMatchObject({ ok: true, mechanism: "rút bắt quân" });
      const f = detectDeepCannonBottom(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("phaoTramDay");
      expect(f?.summary).toContain("Pháo ăn Xe");
    });

    it("công sát: chính nước Pháo xuống đáy là chiếu bí (biến trống)", () => {
      const t = real("4kab2/4a1c2/4b1n2/pN2p3p/9/P1B5P/4P4/4C4/c2CA4/4KAB2 b", 15, 87, [], 100000);
      expect(checkDeepCannonBottom(t.before, t.move, t.after, t.options)).toMatchObject({ ok: true, mechanism: "công sát" });
    });

    it("Pháo đang bị dọa mà không thắng Xe hay chiếu bí thì là chạy quân", () => {
      const t = real("2baka3/9/2n3cR1/p1p1p3p/1r7/P8/1rP1P3P/N1C1C1N2/9/2BAKAB2 b", 24, 87,
        [[86, 76], [20, 13], [58, 49], [13, 24], [49, 40], [37, 40], [67, 58], [55, 64], [65, 67], [3, 13], [76, 66], [64, 66]], -294, 250);
      expect(checkDeepCannonBottom(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("Pháo bị ăn ngay mà không lấy lại được là biếu không", () => {
      const t = real("2bakab2/5r3/1R2c1n2/p3p1N1p/9/2P3P2/P1crP3P/BCN1C4/9/2RAKAB2 b", 56, 83,
        [[63, 83], [14, 32], [67, 69], [31, 40], [84, 76], [40, 49], [58, 49], [57, 60], [33, 52], [60, 51], [69, 24], [51, 24]], 28);
      const r = checkDeepCannonBottom(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("biếu không");
    });

    it("lời bình kể đúng khi Pháo ăn Sĩ rồi bị Tướng ăn lại (không nói 'không bị ăn lại')", () => {
      const t = real("4ka3/4a4/9/p2R4p/1c4pr1/4P4/P5P1P/4C4/4N4/r2AKAB2 b", 37, 82,
        [[76, 83], [82, 84], [85, 84], [81, 83], [84, 75], [43, 79], [67, 76], [83, 2], [49, 40], [79, 77], [54, 45], [77, 86]], 206);
      const r = checkDeepCannonBottom(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "mưu Sĩ Tượng" });
      expect(r && r.ok && r.summary).toContain("Tướng ăn Pháo");
      expect(r && r.ok && r.summary).toContain("đổi Pháo lấy Sĩ, Mã");
    });

    it("nhắm Sĩ mà lấy chính Tướng làm ngòi thì không phải kiềm Sĩ Tượng", () => {
      const t = real("4kab2/3Na4/b2cn3c/4n3p/P3p1p2/1CR6/3rP1P1P/2C1B1N2/4A4/4KAB2 w", 46, 1,
        [[4, 3], [12, 19], [31, 20], [65, 20], [21, 19], [20, 18], [19, 82], [18, 0], [3, 12], [76, 66], [57, 66], [1, 6]], 278);
      expect(checkDeepCannonBottom(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 1 });
    });

    it("Pháo xuống đáy ăn Tượng mà không thắng thêm gì là ăn quân", () => {
      const t = real("2r1kab2/4a1c2/1c2b4/p3PR2p/2P6/9/P5p1P/1CN1C4/7r1/R1BAKAB2 b", 15, 87,
        [[86, 76], [2, 38], [64, 73], [79, 88], [81, 63], [87, 69], [76, 86], [69, 87], [86, 76], [22, 2]], 1);
      expect(checkDeepCannonBottom(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("không nhận khi Pháo di chuyển không tới tuyến đáy", () => {
      const riverMove = mv(2, 1, 4, 1);
      const { before, after } = setup(fen, riverMove);
      expect(detectDeepCannonBottom(before, riverMove, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Pháo đã ở tuyến đáy và chỉ di chuyển ngang", () => {
      const bottomFen = "C3kab2/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1";
      const slideMove = mv(0, 0, 0, 1);
      const { before, after } = setup(bottomFen, slideMove);
      expect(detectDeepCannonBottom(before, slideMove, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi nước đi tuyến đáy là Xe chứ không phải Pháo", () => {
      const rookFen = "3akab2/9/1R7/9/4P4/9/9/9/9/4K4 w - - 0 1";
      const rookMove = mv(2, 1, 0, 1);
      const { before, after } = setup(rookFen, rookMove);
      expect(detectDeepCannonBottom(before, rookMove, after, { loss: 0 })).toBeNull();
    });
  });


  describe("detectVoSuTienTotBien (Kỳ lý #7 - Vô sự tiến tốt biên)", () => {
    const fen = "4k3r/4a4/1c7/9/9/9/P7P/4A4/R8/4K1C2 w - - 0 1";
    const moveEdge = mv(6, 0, 5, 0);

    it("nhận diện thúc tốt biên trong thế trận giằng co mở rộng không gian", () => {
      const { before, after } = setup(fen, moveEdge);
      const f = detectVoSuTienTotBien(before, moveEdge, after, { loss: 0 });
      expect(f?.tactic).toBe("voSuTienTotBien");
      expect(f?.lesson).toBe(7);
      expect(f?.summary).toContain("Vô sự tiến tốt biên");
    });

    it("không nhận khi tốt di chuyển ăn quân đối phương", () => {
      const captureFen = "4k3r/4a4/1c7/9/9/n8/P7P/4A4/R8/4K1C2 w - - 0 1";
      const captureMove = mv(6, 0, 5, 0);
      const { before, after } = setup(captureFen, captureMove);
      expect(detectVoSuTienTotBien(before, captureMove, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi nước đi là tốt giữa chứ không phải tốt biên", () => {
      const centerFen = "4k3r/4a4/1c7/9/9/9/4P4/4A4/R8/4K1C2 w - - 0 1";
      const centerMove = mv(6, 4, 5, 4);
      const { before, after } = setup(centerFen, centerMove);
      expect(detectVoSuTienTotBien(before, centerMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectMayUiTrungLo (Kỳ lý #9 - Máy ủi trung lộ)", () => {
    const fen = "3ak4/9/9/9/9/9/4P4/4C4/9/4K4 w - - 0 1";
    const centerPush = mv(6, 4, 5, 4);

    it("chỉ có hình Pháo đầu + Tốt giữa + Xe trung lộ, không có biến engine thì không gắn", () => {
      const withRook = "3ak4/9/9/9/9/9/4P4/4C4/3R5/4K4 w - - 0 1";
      const { before, after } = setup(withRook, centerPush);
      expect(checkMayUiTrungLo(before, centerPush, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
      expect(detectMayUiTrungLo(before, centerPush, after, { loss: 0 })).toBeNull();
    });

    it("thiếu Xe/Mã trung lộ phối hợp thì trượt tầng hình", () => {
      const { before, after } = setup(fen, centerPush);
      expect(checkMayUiTrungLo(before, centerPush, after, { loss: 0 })).toMatchObject({ ok: false, layer: 1 });
    });

    it("không có Pháo đầu ở cột 4 thì trượt tầng hình", () => {
      const noCannonFen = "3ak4/9/9/9/9/9/4P4/1C7/3R5/4K4 w - - 0 1";
      const { before, after } = setup(noCannonFen, centerPush);
      expect(checkMayUiTrungLo(before, centerPush, after, { loss: 0 })).toMatchObject({ ok: false, layer: 1 });
    });
  });

  describe("detectNhatMaHoanLuongTuong (Kỳ lý #10 - Nhất Mã hoán Lưỡng Tượng)", () => {
    // Đen có đôi Tượng ở (0, 2) và (2, 4), Sĩ ở (1, 3).
    // Đỏ có Mã ở (3, 2), Xe ở (0, 0).
    // Mã đỏ nhảy vào c7 (2, 4) ăn Tượng đối phương; Sĩ đen ăn Mã; Xe đỏ sang ăn nốt Tượng còn lại ở (0, 2).
    const fen = "R1b1k4/3a5/4b4/2N6/9/9/9/9/9/4K4 w - - 0 1";
    const takeElephant = mv(3, 2, 2, 4);

    it("công nhận khi Mã phế đổi lấy đôi Tượng và cả 2 Tượng đều bị ăn trong biến", () => {
      const pv = [
        [sq(1, 3), sq(2, 4)],
        [sq(0, 0), sq(0, 2)],
        [sq(0, 4), sq(0, 5)],
      ];
      const t = real(fen, sq(3, 2), sq(2, 4), pv, 100, 0);
      const r = checkNhatMaHoanLuongTuong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "phế Mã đoạt Song Tượng" });
      expect(r && r.ok && r.summary).toContain("Nhất Mã hoán Lưỡng Tượng");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectNhatMaHoanLuongTuong(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("nhatMaHoanLuongTuong");
      expect(f?.lesson).toBe(10);
      expect(f?.summary).toContain("Nhất Mã hoán Lưỡng Tượng");
    });

    it("chỉ có hình ăn Tượng, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, takeElephant);
      expect(detectNhatMaHoanLuongTuong(before, takeElephant, after, { loss: 0 })).toBeNull();
      expect(checkNhatMaHoanLuongTuong(before, takeElephant, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: đối phương trước nước đi chỉ có 1 Tượng (không phải hoán Song Tượng)", () => {
      const oneElephantFen = "R3k4/3a5/4b4/2N6/9/9/9/9/9/4K4 w - - 0 1";
      const pv = [
        [sq(1, 3), sq(2, 4)],
        [sq(0, 0), sq(0, 4)],
      ];
      const t = real(oneElephantFen, sq(3, 2), sq(2, 4), pv, 100, 0);
      const r = checkNhatMaHoanLuongTuong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không phải thế cờ hoán Song Tượng");
    });

    it("Tầng 2 trượt: Mã đang bị dọa bắt ăn Tượng vớt vát", () => {
      // Xe đen ở (3, 0) dọa ăn Mã đỏ ở (3, 2)
      const threatenedFen = "R1b1k4/3a5/4b4/r1N6/9/9/9/9/9/4K4 w - - 0 1";
      const pv = [
        [sq(1, 3), sq(2, 4)],
        [sq(0, 0), sq(0, 2)],
        [sq(0, 4), sq(0, 5)],
      ];
      const t = real(threatenedFen, sq(3, 2), sq(2, 4), pv, 100, 0);
      const r = checkNhatMaHoanLuongTuong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("Mã đang bị dọa bắt");
    });

    it("Tầng 3 trượt: biến engine không ăn được con Tượng thứ hai (chỉ đổi 1 lấy 1)", () => {
      // Đỏ không ăn Tượng còn lại mà đi nước yên lặng
      const pv = [
        [sq(1, 3), sq(2, 4)],
        [sq(0, 0), sq(0, 1)],
        [sq(0, 4), sq(0, 5)],
      ];
      const t = real(fen, sq(3, 2), sq(2, 4), pv, 0, 0);
      const r = checkNhatMaHoanLuongTuong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("chỉ ăn được 1/2 Tượng");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(1, 3), sq(2, 4)],
        [sq(0, 0), sq(0, 2)],
        [sq(0, 4), sq(0, 5)],
      ];
      const t = real(fen, sq(3, 2), sq(2, 4), pv, 100, 200);
      const r = checkNhatMaHoanLuongTuong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });

    it("không nhận khi Mã ăn quân khác không phải Tượng", () => {
      const takePawnFen = "R1b1k4/3a5/4p4/2N6/9/9/9/9/9/4K4 w - - 0 1";
      const takePawn = mv(3, 2, 2, 4);
      const { before, after } = setup(takePawnFen, takePawn);
      expect(checkNhatMaHoanLuongTuong(before, takePawn, after, { loss: 0 })).toBeNull();
      expect(detectNhatMaHoanLuongTuong(before, takePawn, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectDoatTrungBinh (Kỳ lý #11 - Chiến thuật đoạt trung binh)", () => {
    // Đen có Tốt giữa ở (3, 4); Đỏ có Mã ở (5, 3).
    // Mã đỏ nhảy lên ăn Tốt giữa (3, 4).
    const fen = "3ak4/9/9/4p4/9/3N5/9/9/9/4K4 w - - 0 1";
    const takeCenterPawn = mv(5, 3, 3, 4);

    it("công nhận khi ăn sạch Tốt giữa và giữ được lợi thế vật chất trong biến", () => {
      const pv = [
        [sq(0, 3), sq(1, 4)],
        [sq(9, 4), sq(8, 4)],
        [sq(1, 4), sq(0, 3)],
      ];
      const t = real(fen, sq(5, 3), sq(3, 4), pv, 150, 0);
      const r = checkDoatTrungBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "đoạt trung binh tích lũy ưu thế" });
      expect(r && r.ok && r.summary).toContain("Đoạt trung binh");
      expect(r && r.ok && r.summary).toContain("Tốt giữa");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectDoatTrungBinh(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("doatTrungBinh");
      expect(f?.lesson).toBe(11);
      expect(f?.summary).toContain("Đoạt trung binh");
    });

    it("chỉ có hình ăn Tốt giữa, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, takeCenterPawn);
      expect(detectDoatTrungBinh(before, takeCenterPawn, after, { loss: 0 })).toBeNull();
      expect(checkDoatTrungBinh(before, takeCenterPawn, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 2 trượt: quân đang bị dọa bắt ăn Tốt giữa vớt vát", () => {
      // Xe đen ở (5, 0) dọa ăn Mã đỏ ở (5, 3)
      const threatenedFen = "3ak4/9/9/4p4/9/r2N5/9/9/9/4K4 w - - 0 1";
      const pv = [
        [sq(0, 3), sq(1, 4)],
        [sq(9, 4), sq(8, 4)],
        [sq(1, 4), sq(0, 3)],
      ];
      const t = real(threatenedFen, sq(5, 3), sq(3, 4), pv, 150, 0);
      const r = checkDoatTrungBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("Quân đang bị dọa bắt");
    });

    it("Tầng 3 trượt: biến engine đối phương ăn lại được quân, không giữ được vật chất", () => {
      // Đen có Xe ở (3, 8), ăn lại Mã đỏ ở (3, 4)
      const recaptureFen = "3ak4/9/9/4p3r/9/3N5/9/9/9/4K4 w - - 0 1";
      const pv = [
        [sq(3, 8), sq(3, 4)],
        [sq(9, 4), sq(8, 4)],
        [sq(3, 4), sq(3, 8)],
      ];
      const t = real(recaptureFen, sq(5, 3), sq(3, 4), pv, -300, 0);
      const r = checkDoatTrungBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("đoạt trung binh không giữ được vật chất");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(0, 3), sq(1, 4)],
        [sq(9, 4), sq(8, 4)],
        [sq(1, 4), sq(0, 3)],
      ];
      const t = real(fen, sq(5, 3), sq(3, 4), pv, 150, 200);
      const r = checkDoatTrungBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });

    it("không nhận khi ăn tốt biên thay vì tốt giữa", () => {
      const edgePawnFen = "3ak4/4a4/9/p8/9/1N7/9/9/9/4K4 w - - 0 1";
      const takeEdgePawn = mv(5, 1, 3, 0);
      const { before, after } = setup(edgePawnFen, takeEdgePawn);
      expect(checkDoatTrungBinh(before, takeEdgePawn, after, { loss: 0 })).toBeNull();
      expect(detectDoatTrungBinh(before, takeEdgePawn, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectKhongTamPhao (Kỳ lý #12 - Không tâm pháo / Pháo trống)", () => {
    const fen = "4k4/9/9/9/4P4/9/9/4C4/9/4K4 w - - 0 1";
    const unmaskCannon = mv(4, 4, 4, 3);

    it("chỉ có hình (tạo lập thế Không Tâm Pháo ngắm thẳng cung Tướng không có che chắn) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, unmaskCannon);
      expect(detectKhongTamPhao(before, unmaskCannon, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi trên cột 4 vẫn còn quân che chắn trước mặt Tướng", () => {
      const blockedFen = "4k4/4a4/9/9/4P4/9/9/4C4/9/4K4 w - - 0 1";
      const { before, after } = setup(blockedFen, unmaskCannon);
      expect(detectKhongTamPhao(before, unmaskCannon, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi thế pháo trống đã có sẵn từ trước nước đi", () => {
      const alreadyBareFen = "4k4/9/9/9/9/9/9/4C4/9/4K1R2 w - - 0 1";
      const otherMove = mv(9, 6, 8, 6);
      const { before, after } = setup(alreadyBareFen, otherMove);
      expect(detectKhongTamPhao(before, otherMove, after, { loss: 0 })).toBeNull();
    });
  });


  describe("detectThienDiaPhao (Kỳ lý #14 - Thiên Địa Pháo)", () => {
    const fen = "3akab2/9/1C7/9/9/9/9/4C4/9/4K4 w - - 0 1";
    const toBottom = mv(2, 1, 0, 1);

    it("chỉ có hình (tạo lập thế Thiên Địa Pháo: 1 Pháo trung lộ, 1 Pháo cắm đáy) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, toBottom);
      expect(detectThienDiaPhao(before, toBottom, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Pháo cắm đáy mà không có Pháo trung lộ", () => {
      const noCenterFen = "3akab2/4a4/1C7/9/9/9/9/1C7/9/4K4 w - - 0 1";
      const { before, after } = setup(noCenterFen, toBottom);
      expect(detectThienDiaPhao(before, toBottom, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectPhaoDayKhoaXe (Kỳ lý #15 - Pháo đáy khóa Xe)", () => {
    const fen = "r3kab2/4a4/1C7/9/9/9/9/9/9/4K4 w - - 0 1";
    const toCorner = mv(2, 1, 0, 1);

    it("chỉ có hình (cắm Pháo xuống đáy góc khóa Xe đối phương) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, toCorner);
      expect(detectPhaoDayKhoaXe(before, toCorner, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương không có Xe ở góc bị khóa", () => {
      const noRookFen = "4kab2/4a4/1C7/9/9/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(noRookFen, toCorner);
      expect(detectPhaoDayKhoaXe(before, toCorner, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectOanhTacLoSuon (Kỳ lý #16 - Oanh tạc lộ sườn)", () => {
    const fen = "3akab2/4a4/9/3R5/9/3C5/9/9/9/4K4 w - - 0 1";
    const attackFlank = mv(3, 3, 1, 3);

    it("chỉ có hình (tập trung Song Xe Pháo ở lộ sườn dội hỏa lực tổng lực) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, attackFlank);
      expect(detectOanhTacLoSuon(before, attackFlank, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi chỉ có 1 quân lớn ở lộ sườn", () => {
      const singleMajorFen = "3akab2/4a4/9/3R5/9/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(singleMajorFen, attackFlank);
      expect(detectOanhTacLoSuon(before, attackFlank, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectManhCongTuyenApDay (Kỳ lý #17 - Mạnh công tuyến áp đáy)", () => {
    const fen = "3akab2/4a4/9/3R5/9/9/9/9/9/4K4 w - - 0 1";
    const toApDay = mv(3, 3, 1, 3);

    it("chỉ có hình (Xe đột kích vào tuyến áp đáy (hàng 2 cung Tướng)) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, toApDay);
      expect(detectManhCongTuyenApDay(before, toApDay, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Xe di chuyển tới hàng khác không phải tuyến áp đáy", () => {
      const toOtherRow = mv(3, 3, 2, 3);
      const { before, after } = setup(fen, toOtherRow);
      expect(detectManhCongTuyenApDay(before, toOtherRow, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectKiemCheDinhCung (Kỳ lý #18 - Kiềm chế tuyến đỉnh cung)", () => {
    const fen = "1n1akab2/4a4/7c1/9/9/9/9/1C7/9/4K4 w - - 0 1";
    const toDinhCung = mv(7, 1, 2, 1);

    it("chỉ có hình Pháo lên hàng đỉnh cung, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, toDinhCung);
      expect(checkKiemCheDinhCung(before, toDinhCung, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
      expect(detectKiemCheDinhCung(before, toDinhCung, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương không còn đủ 2 quân nhẹ Mã/Pháo", () => {
      const noMinorsFen = "3akab2/4a4/9/9/9/9/9/1C7/9/4K4 w - - 0 1";
      const { before, after } = setup(noMinorsFen, toDinhCung);
      expect(detectKiemCheDinhCung(before, toDinhCung, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectChiemTuyenTot (Kỳ lý #19 - Chiếm tuyến tốt)", () => {
    const toPawnRow = mv(4, 1, 3, 1);

    it("chỉ có hình Xe lên tuyến Tốt, không có biến engine thì không gắn", () => {
      const fen = "3akab2/4a4/9/p3p4/1R7/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, toPawnRow);
      expect(checkChiemTuyenTot(before, toPawnRow, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
      expect(detectChiemTuyenTot(before, toPawnRow, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Xe di chuyển sang ô khác không phải tuyến tốt", () => {
      const fen = "3akab2/4a4/9/p3p4/1R7/9/9/9/9/4K4 w - - 0 1";
      const toOtherRow = mv(4, 1, 2, 1);
      const { before, after } = setup(fen, toOtherRow);
      expect(detectChiemTuyenTot(before, toOtherRow, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectKhongCheKyHa (Kỳ lý #20 - Khống chế tuyến kỵ hà)", () => {
    const fen = "3akab2/4a4/9/9/9/9/9/1R7/9/4K4 w - - 0 1";
    const toKyHa = mv(7, 1, 4, 1);

    it("chỉ có hình Xe kỵ hà, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, toKyHa);
      expect(checkKhongCheKyHa(before, toKyHa, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
      expect(detectKhongCheKyHa(before, toKyHa, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Xe chỉ tiến đến tuần hà (bờ sông phe mình)", () => {
      const toTuanHa = mv(7, 1, 5, 1);
      const { before, after } = setup(fen, toTuanHa);
      expect(detectKhongCheKyHa(before, toTuanHa, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectTranhDoatLo3Lo7 (Kỳ lý #21 - Tranh đoạt lộ 3 và lộ 7)", () => {
    const pawnCross = mv(4, 2, 3, 2);

    it("chỉ có hình (Tốt qua sông lộ 3 đè thẳng vào Mã đối phương) mà không có biến engine xác nhận đòn: không gắn", () => {
      const fen = "3akab2/4a4/2n6/9/2P6/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, pawnCross);
      expect(detectTranhDoatLo3Lo7(before, pawnCross, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi chỉ đứng trên lộ 3 mà không đe dọa Mã/Tượng nào", () => {
      const fen = "3akab2/4a4/9/9/2P6/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, pawnCross);
      expect(detectTranhDoatLo3Lo7(before, pawnCross, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đi quân ở lộ khác không phải lộ 3/7", () => {
      const otherFen = "3akab2/4a4/9/9/4P4/9/9/9/9/4K4 w - - 0 1";
      const centerPawnCross = mv(4, 4, 3, 4);
      const { before, after } = setup(otherFen, centerPawnCross);
      expect(detectTranhDoatLo3Lo7(before, centerPawnCross, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectPhongToaLoXe (Kỳ lý #22 - Phong tỏa & phản phong tỏa lộ Xe)", () => {
    it("Pháo chặn lộ 2 mà Xe đối phương vẫn đi được 4 ô (ăn được chính Pháo không ai bảo vệ) thì không phải phong tỏa", () => {
      const fen = "1r1ak1b2/4a4/7C1/9/9/9/9/9/9/1R2K4 w - - 0 1";
      const blockRook = mv(2, 7, 2, 1);
      const { before, after } = setup(fen, blockRook);
      expect(checkPhongToaLoXe(before, blockRook, after, { loss: 0 })).toBeNull();
    });

    it("chỉ có hình Pháo (có Xe bảo vệ) khóa Xe ở góc còn 2 ô, không có biến engine thì không gắn", () => {
      const fen = "nrb1kab2/4a4/7C1/9/9/9/9/9/9/1R2K4 w - - 0 1";
      const blockRook = mv(2, 7, 2, 1);
      const { before, after } = setup(fen, blockRook);
      expect(checkPhongToaLoXe(before, blockRook, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
      expect(detectPhongToaLoXe(before, blockRook, after, { loss: 0 })).toBeNull();
    });

    it("không nhận nước xuất Xe từ góc ra lộ 2 thường lệ ở khai cuộc", () => {
      const fen = "r3kab2/4a4/9/9/9/9/9/9/9/R3K4 w - - 0 1";
      const devRook = mv(9, 0, 9, 1);
      const { before, after } = setup(fen, devRook);
      expect(detectPhongToaLoXe(before, devRook, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectTotBienDaiNao (Kỳ lý #23 - Tốt biên đại náo)", () => {
    const fen = "3akab2/4a4/9/9/P8/9/9/9/9/4K4 w - - 0 1";
    const deepPawn = mv(4, 0, 3, 0);

    it("chỉ có hình Tốt biên thọc sâu, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, deepPawn);
      expect(checkTotBienDaiNao(before, deepPawn, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
      expect(detectTotBienDaiNao(before, deepPawn, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Tốt biên chưa qua sông", () => {
      const ownSideFen = "3akab2/4a4/9/9/9/9/P8/9/9/4K4 w - - 0 1";
      const ownSideMove = mv(6, 0, 5, 0);
      const { before, after } = setup(ownSideFen, ownSideMove);
      expect(detectTotBienDaiNao(before, ownSideMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectSongXePhoiHop (Kỳ lý #25 - Song Xe phối hợp)", () => {
    const fen = "3akab2/4a4/9/1R7/9/9/9/1R7/9/4K4 w - - 0 1";
    const advanceRook = mv(7, 1, 4, 1);

    it("chỉ có hình (đôi Xe cùng thâm nhập sâu vào trận địa đối phương) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, advanceRook);
      expect(detectSongXePhoiHop(before, advanceRook, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi chỉ có một Xe trên bàn cờ", () => {
      const singleRookFen = "3akab2/4a4/9/9/9/9/9/1R7/9/4K4 w - - 0 1";
      const { before, after } = setup(singleRookFen, advanceRook);
      expect(detectSongXePhoiHop(before, advanceRook, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectPhaoGanh (Kỳ lý #26 - Pháo gánh & Đạn tử pháo)", () => {
    it("nhận diện Pháo về cùng hàng lập thế Pháo gánh hai Pháo giữ căn lẫn nhau", () => {
      const fen = "3akab2/4a4/9/9/9/7C1/9/1C2B4/9/4K4 w - - 0 1";
      const cannonBack = mv(5, 7, 7, 7);
      const { before, after } = setup(fen, cannonBack);
      const f = detectPhaoGanh(before, cannonBack, after, { loss: 0 });
      expect(f?.tactic).toBe("phaoGanh");
      expect(f?.lesson).toBe(26);
      expect(f?.summary).toContain("Pháo gánh");
    });

    it("không nhận khi quân khác (Tượng) đi vào làm ngòi — thế gánh không do Pháo tạo", () => {
      const fen = "3akab2/4a4/9/9/9/9/9/1C5C1/9/2B1K4 w - - 0 1";
      const elephantUp = mv(9, 2, 7, 4);
      const { before, after } = setup(fen, elephantUp);
      expect(detectPhaoGanh(before, elephantUp, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectLienHoanMa (Kỳ lý #27 - Liên hoàn Mã)", () => {
    const fen = "3akab2/4a4/9/9/9/3N5/9/9/9/1N2K4 w - - 0 1";
    const knightConnect = mv(9, 1, 7, 2);

    it("nhận diện nhảy Mã liên kết giữ căn lẫn nhau thành thế Liên hoàn Mã", () => {
      const { before, after } = setup(fen, knightConnect);
      const f = detectLienHoanMa(before, knightConnect, after, { loss: 0 });
      expect(f?.tactic).toBe("lienHoanMa");
      expect(f?.lesson).toBe(27);
      expect(f?.summary).toContain("Liên hoàn Mã");
    });

    it("không nhận khi Mã nhảy đi nơi khác không giữ căn cho nhau", () => {
      const knightOther = mv(9, 1, 7, 0);
      const { before, after } = setup(fen, knightOther);
      expect(detectLienHoanMa(before, knightOther, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectXeMaPhaoTamTu (Kỳ lý #28 - Xe Mã Pháo tam tử)", () => {
    const fen = "3akab2/4a4/1R7/3N5/9/9/9/2C6/9/4K4 w - - 0 1";
    const cannonJoin = mv(7, 2, 4, 2);

    it("chỉ có hình (ba quân Xe Mã Pháo cùng quy tụ một cánh (tam tử quy biên)) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, cannonJoin);
      expect(detectXeMaPhaoTamTu(before, cannonJoin, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi quân chuyển sang cánh đối diện", () => {
      const cannonOtherWing = mv(7, 2, 7, 7);
      const { before, after } = setup(fen, cannonOtherWing);
      expect(detectXeMaPhaoTamTu(before, cannonOtherWing, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectXeSongMa (Kỳ lý #29 - Xe Song Mã)", () => {
    const fen = "3akab2/4a4/1R7/3N5/9/1N7/9/9/9/4K4 w - - 0 1";
    const knightAdvance = mv(5, 1, 3, 2);

    it("chỉ có hình (Xe cùng đôi Mã hiệp đồng tác chiến qua sông) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, knightAdvance);
      expect(detectXeSongMa(before, knightAdvance, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Mã chưa qua sông", () => {
      const knightBack = mv(5, 1, 7, 2);
      const { before, after } = setup(fen, knightBack);
      expect(detectXeSongMa(before, knightBack, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectXeSongPhao (Kỳ lý #30 - Xe Song Pháo)", () => {
    const fen = "3akab2/4a4/1R7/9/1C7/9/9/2C6/9/4K4 w - - 0 1";
    const cannonAdvance = mv(7, 2, 3, 2);

    it("chỉ có hình (Xe Song Pháo cùng tập kết dồn hỏa lực ở một cánh) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, cannonAdvance);
      expect(detectXeSongPhao(before, cannonAdvance, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Pháo rời khỏi cánh công", () => {
      const cannonAway = mv(7, 2, 7, 4);
      const { before, after } = setup(fen, cannonAway);
      expect(detectXeSongPhao(before, cannonAway, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectXeMaLanhChieu (Kỳ lý #31 - Xe Mã lãnh chiêu)", () => {
    const fen = "3akab2/3Ra4/9/9/9/9/9/3N5/9/4K4 w - - 0 1";
    const rookChopAdvisor = mv(1, 3, 0, 3);

    it("chỉ có hình (Xe Mã phối hợp chém Sĩ phá vỡ trận hình đối phương) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, rookChopAdvisor);
      expect(detectXeMaLanhChieu(before, rookChopAdvisor, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi không có Mã phối hợp", () => {
      const noKnightFen = "3akab2/3Ra4/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(noKnightFen, rookChopAdvisor);
      expect(detectXeMaLanhChieu(before, rookChopAdvisor, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectKheoPhaSiTuong (Kỳ lý #32 - Khéo phá Sĩ Tượng)", () => {
    const fen = "3akab2/3Pa4/9/9/9/9/9/9/9/4K4 w - - 0 1";
    const pawnEatAdvisor = mv(1, 3, 0, 3);

    it("nhận diện đoạt Sĩ Tượng khéo léo không phải trả giá đắt", () => {
      const { before, after } = setup(fen, pawnEatAdvisor);
      const f = detectKheoPhaSiTuong(before, pawnEatAdvisor, after, { loss: 0 });
      expect(f?.tactic).toBe("kheoPhaSiTuong");
      expect(f?.lesson).toBe(32);
      expect(f?.summary).toContain("Khéo phá Sĩ Tượng");
    });

    it("không nhận khi ăn quân không phải Sĩ Tượng", () => {
      const eatPawnFen = "3akab2/4a4/3p5/3P5/9/9/9/9/9/4K4 w - - 0 1";
      const eatPawn = mv(3, 3, 2, 3);
      const { before, after } = setup(eatPawnFen, eatPawn);
      expect(detectKheoPhaSiTuong(before, eatPawn, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectPheQuanPhaSiTuong (Kỳ lý #33 - Phế quân phá Sĩ Tượng)", () => {
    const fen = "3akab2/3pa4/3C5/9/9/9/9/9/9/4K4 w - - 0 1";
    const cannonSacAdvisor = mv(2, 3, 0, 3);

    it("nhận diện quyết đoán phế Pháo chém Sĩ phá vỡ phòng tuyến đối phương", () => {
      const { before, after } = setup(fen, cannonSacAdvisor);
      const f = detectPheQuanPhaSiTuong(before, cannonSacAdvisor, after, { loss: 0 });
      expect(f?.tactic).toBe("pheQuanPhaSiTuong");
      expect(f?.lesson).toBe(33);
      expect(f?.summary).toContain("Phế quân phá Sĩ Tượng");
    });

    it("không nhận khi ăn Sĩ bằng quân nhỏ không phải phế quân lớn", () => {
      const pawnEatFen = "3akab2/3Pa4/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const pawnMove = mv(1, 3, 0, 3);
      const { before, after } = setup(pawnEatFen, pawnMove);
      expect(detectPheQuanPhaSiTuong(before, pawnMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectVayXe (Kỳ lý #34 - Vây Xe)", () => {
    it("chỉ có hình (dọa ăn Xe thâm nhập đã hết đường thoát (mọi ô thoát đều bị khống chế)) mà không có biến engine xác nhận đòn: không gắn", () => {
      // Xe Đen kẹt ở góc: ăn Mã (8,0) thì Mã (6,1) ăn lại, ăn Tượng (9,2) thì Tượng (7,4) ăn lại, ra (9,1) thì Mã (7,2) ăn.
      const fen = "3akab2/4a4/9/9/9/3C5/1N7/2N1B4/N3K4/r1B6 w - - 0 1";
      const cannonPin = mv(5, 3, 5, 0);
      const { before, after } = setup(fen, cannonPin);
      expect(detectVayXe(before, cannonPin, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Xe bị dọa vẫn còn đường thoát", () => {
      const fen = "3akab2/4a4/9/9/9/9/9/1r7/9/1N2K4 w - - 0 1";
      const attackRook = mv(9, 1, 8, 3);
      const { before, after } = setup(fen, attackRook);
      expect(detectVayXe(before, attackRook, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Xe đối phương chưa qua sông", () => {
      const backRookFen = "1r1akab2/4a4/9/9/9/9/9/9/9/1N2K4 w - - 0 1";
      const attackRook = mv(9, 1, 8, 3);
      const { before, after } = setup(backRookFen, attackRook);
      expect(detectVayXe(before, attackRook, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectVayPhao (Kỳ lý #35 - Vây Pháo)", () => {
    it("chỉ có hình (dọa ăn Pháo thâm nhập đã hết đường thoát) mà không có biến engine xác nhận đòn: không gắn", () => {
      const fen = "3akab2/4a4/9/9/9/2N6/9/9/N3K4/cN7 w - - 0 1";
      const attackCannon = mv(5, 2, 7, 1);
      const { before, after } = setup(fen, attackCannon);
      expect(detectVayPhao(before, attackCannon, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Pháo bị dọa vẫn còn đường thoát an toàn", () => {
      const fen = "3akab2/4a4/9/9/9/9/9/1c7/9/1N2K4 w - - 0 1";
      const attackCannon = mv(9, 1, 8, 3);
      const { before, after } = setup(fen, attackCannon);
      expect(detectVayPhao(before, attackCannon, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Pháo đối phương chưa qua sông", () => {
      const backCannonFen = "3akab2/4a4/1c7/9/9/9/9/9/9/1N2K4 w - - 0 1";
      const attackCannon = mv(9, 1, 8, 3);
      const { before, after } = setup(backCannonFen, attackCannon);
      expect(detectVayPhao(before, attackCannon, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectMaPhungBienTatVong (Kỳ lý #36 - Mã phùng biên tất vong)", () => {
    const fen = "3akab2/4a4/9/9/9/9/9/n8/9/R3K4 w - - 0 1";
    const attackEdgeKnight = mv(9, 0, 8, 0);

    it("chỉ có hình (dồn ép bao vây Mã biên đối phương) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, attackEdgeKnight);
      expect(detectMaPhungBienTatVong(before, attackEdgeKnight, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Mã đối phương không đứng ở cột biên", () => {
      const centerKnightFen = "3akab2/4a4/9/9/9/9/9/2n6/9/R3K4 w - - 0 1";
      const { before, after } = setup(centerKnightFen, attackEdgeKnight);
      expect(detectMaPhungBienTatVong(before, attackEdgeKnight, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectVayMaGiac (Kỳ lý #37 - Vây Mã Giác)", () => {
    const fen = "3nkab2/4a4/R8/9/9/9/9/9/9/4K4 w - - 0 1";
    const attackCornerKnight = mv(2, 0, 2, 3);

    it("chỉ có hình (dồn ép bao vây Quải Giác Mã đối phương) mà không có biến engine xác nhận đòn: không gắn", () => {
      const { before, after } = setup(fen, attackCornerKnight);
      expect(detectVayMaGiac(before, attackCornerKnight, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương không có Mã ở góc cung", () => {
      const noCornerFen = "3akab2/4a4/R8/9/9/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(noCornerFen, attackCornerKnight);
      expect(detectVayMaGiac(before, attackCornerKnight, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Xe Song Mã đối Xe Song Pháo (Kỳ lý #38 & #39) — ghi chú thế quân, thế thật", () => {
    // Bài đánh giá thế quân chỉ dùng điểm engine của thế sau, không dùng biến — biến để trống
    // Ván 8086: Đen Pháo ăn Pháo, vào thế Đỏ Xe Song Mã đối Đen Xe Song Pháo; engine chấm Đỏ +315 (Đỏ thắng ván)
    const knightsWin = real("2b1ka3/4a4/2r1b2R1/p1c1p3p/9/2BN1N3/c3PC2P/3AB4/9/4KA3 b", 54, 59, [], -315);
    // Ván 5226: Đỏ Tốt ăn Mã, vào thế Đỏ Xe Song Mã đối Đen Xe Song Pháo; engine chấm Đen +367 (Đen thắng ván)
    const cannonsWin = real("3k1ab2/3ca4/4c4/pr2n3p/2b1P1p2/7R1/4N1P1P/B1N1B4/9/3AKA3 w", 40, 31, [], -367);

    it("vào cấu hình, bên Xe Song Mã được chấm hơn: ghi chú bài 38, không khen chê nước đi", () => {
      const { before, move, after, options } = knightsWin;
      expect(checkXeMaDoiXePhao(before, move, after, options)).toEqual({ knights: "r", favored: "r", score: 315 });
      const f = detectTamNganThangTamXa(before, move, after, options);
      expect(f).toMatchObject({ tactic: "tamNganThangTamXa", lesson: 38, tone: "note" });
      expect(f?.summary).toContain("Xe Song Mã (Đỏ) đối Xe Song Pháo (Đen); engine chấm Đỏ +315");
      expect(detectTamXaThangTamNgan(before, move, after, options)).toBeNull();
    });

    it("vào cấu hình, bên Xe Song Pháo được chấm hơn: ghi chú bài 39", () => {
      const { before, move, after, options } = cannonsWin;
      expect(checkXeMaDoiXePhao(before, move, after, options)).toEqual({ knights: "r", favored: "b", score: 367 });
      expect(detectTamXaThangTamNgan(before, move, after, options)).toMatchObject({ tactic: "tamXaThangTamNgan", lesson: 39, tone: "note" });
      expect(detectTamNganThangTamXa(before, move, after, options)).toBeNull();
    });

    it("thế cân bằng (ván 2230, engine chấm −2) thì im", () => {
      const t = real("4kab2/4a4/2n1b4/p2CN3p/9/2P1r4/P3CR2n/4B4/4A4/4KA3 b", 49, 31, [], 2);
      expect(checkXeMaDoiXePhao(t.before, t.move, t.after, t.options)).toBeNull();
    });

    it("đã ở sẵn cấu hình từ trước thì không ghi chú lại", () => {
      const { after } = knightsWin;
      const pos = { board: after, turn: "r" as const };
      const quiet = legalMoves(pos).find((m) => typeOf(after[m.from]!) === "k")!;
      const next = play(after, quiet);
      expect(checkXeMaDoiXePhao(after, quiet, next, { evalAfter: { score: -400 } })).toBeNull();
    });

    it("không có điểm engine thì không ghi chú", () => {
      const { before, move, after } = knightsWin;
      expect(checkXeMaDoiXePhao(before, move, after, { loss: 0 })).toBeNull();
    });
  });

  describe("checkMotXeDoiHai (Kỳ lý #40 - Một Xe đổi hai)", () => {
    // Đỏ: Xe ở (0, 1), Mã ở (4, 3), Tướng ở (9, 3).
    // Đen: Xe ở (6, 2), Mã ở (0, 2), Pháo ở (2, 4), Tướng ở (0, 5).
    // Xe đỏ ăn Mã đen ở (0, 2); Xe đen ở (6, 2) ăn Xe đỏ ở (0, 2); Mã đỏ ở (4, 3) nhảy ăn Pháo đen ở (2, 4).
    const fen = "1Rn2k3/9/4c4/9/3N5/9/2r6/9/9/3K5 w - - 0 1";
    const takeKnight = mv(0, 1, 0, 2);

    it("công nhận khi Xe đổi lấy 2 quân nhẹ (Mã, Pháo) và chính quân Xe vừa đi bị mất trong biến", () => {
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(0, 1), sq(0, 2), pv, 50, 0);
      const r = checkMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "chủ động đổi Xe lấy 2 quân nhẹ" });
      expect(r && r.ok && r.summary).toContain("Một Xe đổi hai");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("motXeDoiHai");
      expect(f?.lesson).toBe(40);
      expect(f?.summary).toContain("Một Xe đổi hai");
    });

    it("vẫn công nhận Một Xe đổi hai khi Xe đổi lấy 2 quân nhẹ và ăn kèm 1 Tốt (Lỗi 7: không bị đẩy sang Bài 41)", () => {
      // Xe đỏ ăn Mã đen ở (0, 2); Xe đen ở (6, 2) ăn lại Xe đỏ; Mã đỏ ăn Pháo đen ở (2, 4);
      // sau đó Tốt đỏ ở (4, 4) ăn thêm 1 Tốt đen ở (3, 4) (tổng ăn 3 quân: 2 quân nhẹ + 1 Tốt)
      const fenWithPawn = "1Rn2k3/9/4c4/4p4/3NP4/9/2r6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
        [sq(0, 2), sq(0, 1)],
        [sq(4, 4), sq(3, 4)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fenWithPawn, sq(0, 1), sq(0, 2), pv, 150, 0);
      const r = checkMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "chủ động đổi Xe lấy 2 quân nhẹ" });
      expect(r && r.ok && r.summary).toContain("Một Xe đổi hai");
    });

    it("chỉ có hình Xe ăn quân nhẹ, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, takeKnight);
      expect(detectMotXeDoiHai(before, takeKnight, after, { loss: 0 })).toBeNull();
      expect(checkMotXeDoiHai(before, takeKnight, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: đối phương trước nước đi chỉ có 1 quân nhẹ", () => {
      // Thay Pháo đen ở (2, 4) bằng Tốt đen ở (2, 4)
      const oneMinorFen = "1Rn2k3/9/4p4/9/3N5/9/2r6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
      ];
      const t = real(oneMinorFen, sq(0, 1), sq(0, 2), pv, 50, 0);
      const r = checkMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không đủ điều kiện đổi Một Xe lấy hai");
    });

    it("Tầng 2 trượt: Xe đang bị dọa bắt và nước đi không ăn quân nhẹ", () => {
      // Xe đen ở (6, 1) dọa ăn không Xe đỏ ở (0, 1). Xe đỏ chạy sang ô trống (0, 0).
      const threatenedFen = "1Rn2k3/9/4c4/9/3N5/9/1r7/9/9/3K5 w - - 0 1";
      const runAway = mv(0, 1, 0, 0);
      const pv = [
        [sq(6, 1), sq(0, 0)],
        [sq(4, 3), sq(2, 4)],
      ];
      const t = real(threatenedFen, sq(0, 1), sq(0, 0), pv, 50, 0);
      const r = checkMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("Xe đang bị dọa bắt");
    });

    it("Tầng 3 trượt: biến engine chỉ ăn được 1 quân nhẹ", () => {
      // Đỏ không ăn Pháo đen mà đi nước yên lặng
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(3, 5)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(0, 1), sq(0, 2), pv, 0, 0);
      const r = checkMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("chỉ ăn được 1/2 quân nhẹ");
    });

    it("Tầng 3 trượt: chính quân Xe vừa đi không bị mất trong biến", () => {
      // Đen không ăn Xe đỏ mà đi Xe sang (6, 3), Xe đỏ lùi về (5, 2) an toàn
      const pv = [
        [sq(6, 2), sq(6, 3)],
        [sq(0, 2), sq(5, 2)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(0, 1), sq(0, 2), pv, 200, 0);
      const r = checkMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("Xe không bị bắt");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(0, 1), sq(0, 2), pv, 50, 200);
      const r = checkMotXeDoiHai(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });

    it("không nhận khi quân đi không phải Xe", () => {
      const takeWithKnight = mv(4, 3, 2, 4);
      const { before, after } = setup(fen, takeWithKnight);
      expect(checkMotXeDoiHai(before, takeWithKnight, after, { loss: 0 })).toBeNull();
      expect(detectMotXeDoiHai(before, takeWithKnight, after, { loss: 0 })).toBeNull();
    });
  });

  describe("checkMotXeDoiBa (Kỳ lý #41 - Một Xe đổi ba)", () => {
    // Đỏ: Xe ở (0, 1), Mã ở (4, 3), Tốt ở (4, 4), Tướng ở (9, 3).
    // Đen: Xe ở (6, 2), Mã ở (0, 2), Pháo ở (2, 4), Tốt ở (3, 4), Tướng ở (0, 5).
    // Xe đỏ ăn Mã (0, 2); Xe đen ở (6, 2) ăn Xe đỏ (0, 2); Mã đỏ ăn Pháo (2, 4); Xe đen đi (0, 1); Tốt đỏ ăn Tốt đen (3, 4).
    const fen = "1Rn2k3/9/4c4/4p4/3NP4/9/2r6/9/9/3K5 w - - 0 1";
    const takeKnight = mv(0, 1, 0, 2);

    it("công nhận khi hy sinh Xe đổi lấy 3 quân (Mã, Pháo, Tốt) và chính quân Xe vừa đi bị mất trong biến", () => {
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
        [sq(0, 2), sq(0, 1)],
        [sq(4, 4), sq(3, 4)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(0, 1), sq(0, 2), pv, 150, 0);
      const r = checkMotXeDoiBa(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "hy sinh Xe đổi lấy 3 quân" });
      expect(r && r.ok && r.summary).toContain("Một Xe đổi ba");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectMotXeDoiBa(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("motXeDoiBa");
      expect(f?.lesson).toBe(41);
      expect(f?.summary).toContain("Một Xe đổi ba");
    });

    it("chỉ có hình phế Xe, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, takeKnight);
      expect(detectMotXeDoiBa(before, takeKnight, after, { loss: 0 })).toBeNull();
      expect(checkMotXeDoiBa(before, takeKnight, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: đối phương có ít hơn 3 quân ngoài Tướng", () => {
      // Chỉ có Mã (0, 2) và Xe (6, 2) ngoài Tướng
      const fewPiecesFen = "1Rn2k3/9/9/9/3N5/9/2r6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
      ];
      const t = real(fewPiecesFen, sq(0, 1), sq(0, 2), pv, 100, 0);
      const r = checkMotXeDoiBa(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không đủ điều kiện đổi Một Xe lấy ba");
    });

    it("Tầng 2 trượt: Xe đang bị dọa bắt và nước đi không ăn quân", () => {
      // Xe đen ở (6, 1) dọa ăn không Xe đỏ ở (0, 1). Xe đỏ chạy sang ô trống (0, 0).
      const threatenedFen = "1Rn2k3/9/4c4/4p4/3NP4/9/1r7/9/9/3K5 w - - 0 1";
      const runAway = mv(0, 1, 0, 0);
      const pv = [
        [sq(6, 1), sq(0, 0)],
        [sq(4, 3), sq(2, 4)],
        [sq(0, 0), sq(0, 1)],
        [sq(4, 4), sq(3, 4)],
      ];
      const t = real(threatenedFen, sq(0, 1), sq(0, 0), pv, 100, 0);
      const r = checkMotXeDoiBa(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("Xe đang bị dọa bắt");
    });

    it("Tầng 3 trượt: biến engine chỉ ăn được 2 quân (nhường cho Bài 40)", () => {
      // Biến engine chỉ ăn Mã và Pháo, không ăn tiếp Tốt
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(0, 1), sq(0, 2), pv, 100, 0);
      const r = checkMotXeDoiBa(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("chỉ ăn được 2/3 quân đối phương");
    });

    it("Tầng 3 trượt: ăn 3 quân nhưng chỉ có 1 quân nhẹ và 1 Xe (không đủ 2 quân nhẹ) (Lỗi 8)", () => {
      // Thay Pháo đen (2, 4) bằng Tốt đen (2, 4).
      // Biến: Đỏ ăn Mã (0, 2), Xe đen ăn Xe đỏ (0, 2), Mã đỏ ăn Xe đen (0, 2), Tốt đỏ ăn Tốt (3, 4)
      // Ăn được 3 quân: 1 Mã, 1 Xe, 1 Tốt. Nhưng chỉ có 1 quân nhẹ -> trượt tầng 3
      const oneMinorFen = "1Rn2k3/9/4p4/4p4/3NP4/9/2r6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(0, 2)],
        [sq(0, 5), sq(0, 4)],
        [sq(4, 4), sq(3, 4)],
      ];
      const t = real(oneMinorFen, sq(0, 1), sq(0, 2), pv, 100, 0);
      const r = checkMotXeDoiBa(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("đòi hỏi ít nhất 2 quân nhẹ");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(6, 2), sq(0, 2)],
        [sq(4, 3), sq(2, 4)],
        [sq(0, 2), sq(0, 1)],
        [sq(4, 4), sq(3, 4)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(0, 1), sq(0, 2), pv, 100, 200);
      const r = checkMotXeDoiBa(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });
  });

  describe("detectMaVanNhuLong (Kỳ lý #42 - Mã vận như long)", () => {
    const fen = "3akab2/4a4/9/9/9/2N6/9/9/9/4K4 w - - 0 1";
    const hoiMa = mv(5, 2, 7, 3);

    it("chỉ có hình hồi Mã, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, hoiMa);
      expect(checkMaVanNhuLong(before, hoiMa, after, { loss: 0 })).toMatchObject({ ok: false, layer: 3 });
      expect(detectMaVanNhuLong(before, hoiMa, after, { loss: 0 })).toBeNull();
    });

    it("Mã đang bị Xe dọa mà không có quân bảo vệ thì hồi Mã là chạy quân", () => {
      const chased = "3akab2/4a4/9/9/9/2N3r2/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(chased, hoiMa);
      expect(checkMaVanNhuLong(before, hoiMa, after, { loss: 0 })).toMatchObject({ ok: false, layer: 2 });
    });

    it("không nhận khi Mã tiến về phía trước không phải hồi mã", () => {
      const advanceKnight = mv(5, 2, 3, 3);
      const { before, after } = setup(fen, advanceKnight);
      expect(detectMaVanNhuLong(before, advanceKnight, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectNhatXeThapTu (Kỳ lý #43 - Nhất Xe thập tự)", () => {
    const fen = "3akab2/4a4/9/9/9/9/9/9/9/1R2K4 w - - 0 1";
    const rookThapTu = mv(9, 1, 5, 1);

    it("nhận diện Xe chiếm vị trí huyết mạch kiểm soát thập tự tung hoành", () => {
      const { before, after } = setup(fen, rookThapTu);
      const f = detectNhatXeThapTu(before, rookThapTu, after, { loss: 0 });
      expect(f?.tactic).toBe("nhatXeThapTu");
      expect(f?.lesson).toBe(43);
      expect(f?.summary).toContain("Nhất Xe thập tự");
    });

    it("không nhận khi Xe đi tới hàng không thuộc tuyến chiến lược", () => {
      const edgeMove = mv(9, 1, 9, 0);
      const { before, after } = setup(fen, edgeMove);
      expect(detectNhatXeThapTu(before, edgeMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectNgheThuatVanPhao (Kỳ lý #44 - Nghệ thuật vận Pháo)", () => {
    const fen = "3akab2/4a4/9/9/9/9/9/9/9/1C2K4 w - - 0 1";
    const cannonMove = mv(9, 1, 7, 1);

    it("nhận diện Pháo vận chuyển chiếm lĩnh vị trí sĩ giác / tuần hà viễn trình", () => {
      const { before, after } = setup(fen, cannonMove);
      const f = detectNgheThuatVanPhao(before, cannonMove, after, { loss: 0 });
      expect(f?.tactic).toBe("ngheThuatVanPhao");
      expect(f?.lesson).toBe(44);
      expect(f?.summary).toContain("Nghệ thuật vận Pháo");
    });

    it("không nhận khi Pháo di chuyển không tới vị trí chiến lược", () => {
      const normalMove = mv(9, 1, 6, 1);
      const { before, after } = setup(fen, normalMove);
      expect(detectNgheThuatVanPhao(before, normalMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectTieuBinhLapDaiCong (Kỳ lý #45 - Tiểu binh lập đại công)", () => {
    const fen = "3akab2/4a4/9/3n5/2P6/9/9/9/9/4K4 w - - 0 1";
    const pawnStrike = mv(4, 2, 3, 2);

    it("nhận diện Tốt qua sông thọc sâu uy hiếp quân lực đối phương", () => {
      const { before, after } = setup(fen, pawnStrike);
      const f = detectTieuBinhLapDaiCong(before, pawnStrike, after, { loss: 0 });
      expect(f?.tactic).toBe("tieuBinhLapDaiCong");
      expect(f?.lesson).toBe(45);
      expect(f?.summary).toContain("Tiểu binh lập đại công");
    });

    it("không nhận khi Tốt chưa qua sông", () => {
      const homePawnFen = "3akab2/4a4/9/9/9/9/2P6/9/9/4K4 w - - 0 1";
      const homeMove = mv(6, 2, 5, 2);
      const { before, after } = setup(homePawnFen, homeMove);
      expect(detectTieuBinhLapDaiCong(before, homeMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("checkPheTotPhanCong (Kỳ lý #46 - Phế Tốt phản công)", () => {
    // Đỏ: Xe ở (6, 2), Tốt ở (5, 2), Tướng ở (9, 3).
    // Đen: Xe ở (2, 2), Sĩ ở (1, 4), Tướng ở (0, 5).
    // Tốt đỏ tiến lên (4, 2); Xe đen ở (2, 2) ăn Tốt đỏ (4, 2); Xe đỏ ở (6, 2) ăn Xe đen (4, 2).
    const fen = "5k3/4a4/2r6/9/9/2P6/2R6/9/9/3K5 w - - 0 1";
    const sacrificePawn = mv(5, 2, 4, 2);

    it("công nhận khi Tốt phế mở đường cho Xe phản công ăn quân lớn của đối phương", () => {
      const pv = [
        [sq(2, 2), sq(4, 2)],
        [sq(6, 2), sq(4, 2)],
        [sq(1, 4), sq(0, 5)],
      ];
      const t = real(fen, sq(5, 2), sq(4, 2), pv, 400, 0);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "chủ động phế Tốt mở đường phản công" });
      expect(r && r.ok && r.summary).toContain("Phế Tốt phản công");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("pheTotPhanCong");
      expect(f?.lesson).toBe(46);
      expect(f?.summary).toContain("Phế Tốt phản công");
    });

    it("chỉ có hình phế Tốt, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, sacrificePawn);
      expect(detectPheTotPhanCong(before, sacrificePawn, after, { loss: 0 })).toBeNull();
      expect(checkPheTotPhanCong(before, sacrificePawn, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: bên đi không còn quân chủ lực nào để phản công", () => {
      // Thay Xe đỏ bằng Tốt đỏ ở (6, 2)
      const noMajorFen = "5k3/4a4/2r6/9/9/2P6/2P6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(2, 2), sq(4, 2)],
        [sq(6, 2), sq(5, 2)],
      ];
      const t = real(noMajorFen, sq(5, 2), sq(4, 2), pv, 0, 0);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("không còn quân chủ lực");
    });

    it("Tầng 2 trượt: Tốt đi vào ô an toàn không bị ai dọa ăn", () => {
      // Chuyển Xe đen sang (2, 0) để ô (4, 2) không bị ai đe dọa
      const safeFen = "5k3/4a4/r8/9/9/2P6/2R6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(2, 0), sq(2, 1)],
        [sq(6, 2), sq(4, 2)],
      ];
      const t = real(safeFen, sq(5, 2), sq(4, 2), pv, 100, 0);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("không phải nước phế Tốt");
    });

    it("Tầng 2 trượt: nước ăn Tốt đối phương là đổi Tốt thường chứ không phải phế Tốt (Lỗi 6)", () => {
      // Tốt đen ở (4, 2), Tốt đỏ ở (5, 2) ăn Tốt đen ở (4, 2)
      const pawnExchangeFen = "5k3/4a4/2r6/9/2p6/2P6/2R6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(2, 2), sq(4, 2)], // Xe đen ăn lại Tốt
        [sq(6, 2), sq(4, 2)], // Xe đỏ ăn lại Xe đen
      ];
      const t = real(pawnExchangeFen, sq(5, 2), sq(4, 2), pv, 400, 0);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("thuộc về đổi Tốt hoặc mưu Binh");
    });

    it("Tầng 2 trượt: hai bên mời đổi Tốt thông thường có căn bảo vệ (Lỗi 6)", () => {
      // Tốt đen ở (3, 2), Tốt đỏ ở (5, 2) tiến lên (4, 2) đối mặt Tốt đen
      // Ô (4, 2) chỉ có Tốt đen ở (3, 2) ngắm và được Xe đỏ ở (6, 2) bảo vệ
      const headOnFen = "5k3/4a4/9/2p6/9/2P6/2R6/9/9/3K5 w - - 0 1";
      const pv = [
        [sq(3, 2), sq(4, 2)],
        [sq(6, 2), sq(4, 2)],
      ];
      const t = real(headOnFen, sq(5, 2), sq(4, 2), pv, 0, 0);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("Hai bên mời đổi Tốt thông thường có căn bảo vệ");
    });

    it("Tầng 3 trượt: đối phương không ăn con Tốt này trong biến", () => {
      // Xe đen không ăn Tốt mà đi ngang sang (2, 3)
      const pv = [
        [sq(2, 2), sq(2, 3)],
        [sq(6, 2), sq(6, 3)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(5, 2), sq(4, 2), pv, 100, 0);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("phế Tốt nhưng đối phương không ăn");
    });

    it("Tầng 3 trượt: sau khi Tốt bị ăn, bên đi không có đòn phản công quyết định", () => {
      // Xe đen ăn Tốt ở (4, 2), nhưng Xe đỏ không phản công ăn Xe đen mà chạy Tướng
      const pv = [
        [sq(2, 2), sq(4, 2)],
        [sq(9, 3), sq(8, 3)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(5, 2), sq(4, 2), pv, -200, 0);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("không có đòn phản công quyết định");
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(2, 2), sq(4, 2)],
        [sq(6, 2), sq(4, 2)],
        [sq(1, 4), sq(0, 5)],
      ];
      const t = real(fen, sq(5, 2), sq(4, 2), pv, 400, 200);
      const r = checkPheTotPhanCong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });

    it("không nhận khi nước đi không phải là Tốt", () => {
      const rookMove = mv(6, 2, 6, 1);
      const { before, after } = setup(fen, rookMove);
      expect(checkPheTotPhanCong(before, rookMove, after, { loss: 0 })).toBeNull();
      expect(detectPheTotPhanCong(before, rookMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("checkChienThuatMuuBinh (Kỳ lý #47 - Chiến thuật mưu Binh)", () => {
    // Đỏ: Xe ở (9, 2), Tướng ở (9, 4).
    // Đen: Tốt ở (3, 2), Sĩ ở (1, 4), Tướng ở (0, 5).
    // Xe đỏ ăn Tốt đen ở (3, 2) sạch sẽ không bị bắt lại.
    const fen = "5k3/4a4/9/2p6/9/9/9/9/9/2R1K4 w - - 0 1";
    const capturePawn = mv(9, 2, 3, 2);

    it("công nhận khi ăn sạch Tốt vỏ bọc chưa qua sông không mất căn", () => {
      const pv = [
        [sq(0, 5), sq(0, 4)],
        [sq(3, 2), sq(3, 0)],
        [sq(0, 4), sq(0, 5)],
      ];
      const t = real(fen, sq(9, 2), sq(3, 2), pv, 150, 0);
      const r = checkChienThuatMuuBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "ăn Tốt sạch sẽ không mất căn" });
      expect(r && r.ok && r.summary).toContain("Chiến thuật mưu Binh");
      expect(r && r.ok && r.summary).toContain("sạch sẽ không mất căn");
      expect(r && r.ok && r.summary).toContain("theo biến:");

      const f = detectChienThuatMuuBinh(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("chienThuatMuuBinh");
      expect(f?.lesson).toBe(47);
      expect(f?.summary).toContain("Chiến thuật mưu Binh");
    });

    it("chỉ có hình ăn Tốt, không có biến engine thì không gắn", () => {
      const { before, after } = setup(fen, capturePawn);
      expect(detectChienThuatMuuBinh(before, capturePawn, after, { loss: 0 })).toBeNull();
      expect(checkChienThuatMuuBinh(before, capturePawn, after, { loss: 0 })).toMatchObject({
        ok: false, layer: 3, reason: "Không có biến engine để kiểm",
      });
    });

    it("Tầng 1 trượt: ăn Trung binh (thuộc Bài 11 đoạt Trung binh)", () => {
      // Xe đỏ ở (3, 1) ăn Trung binh đen ở (3, 4)
      const centerPawnFen = "5k3/4a4/9/1R2p4/9/9/9/9/9/3K5 w - - 0 1";
      const eatCenter = mv(3, 1, 3, 4);
      const pv = [
        [sq(0, 5), sq(0, 4)],
        [sq(3, 4), sq(3, 0)],
      ];
      const t = real(centerPawnFen, sq(3, 1), sq(3, 4), pv, 150, 0);
      const r = checkChienThuatMuuBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("Ăn Trung binh thuộc Chiến thuật đoạt Trung binh");
    });

    it("Tầng 1 trượt: ăn Tốt đã qua sông (phòng thủ diệt Tốt thâm nhập)", () => {
      // Tốt đen ở (7, 2) đã qua sông sang đất đỏ
      const crossedPawnFen = "5k3/4a4/9/9/9/9/9/2p6/9/2R1K4 w - - 0 1";
      const eatCrossed = mv(9, 2, 7, 2);
      const pv = [
        [sq(0, 5), sq(0, 4)],
        [sq(7, 2), sq(7, 0)],
      ];
      const t = real(crossedPawnFen, sq(9, 2), sq(7, 2), pv, 150, 0);
      const r = checkChienThuatMuuBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 1 });
      expect(r && !r.ok && r.reason).toContain("Tốt đã qua sông");
    });

    it("Tầng 2 trượt: Tốt có căn, ăn Tốt bị đối phương bắt lại chịu thiệt", () => {
      // Mã đen ở (1, 1) giữ Tốt đen ở (3, 2). Xe đỏ ăn Tốt bị Mã đen ăn lại mất Xe.
      const guardedFen = "5k3/1n2a4/9/2p6/9/9/9/9/9/2R1K4 w - - 0 1";
      const pv = [
        [sq(1, 1), sq(3, 2)],
        [sq(9, 4), sq(9, 5)],
      ];
      const t = real(guardedFen, sq(9, 2), sq(3, 2), pv, -800, 0);
      const r = checkChienThuatMuuBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 2 });
      expect(r && !r.ok && r.reason).toContain("Quân ăn Tốt bị đối phương bắt lại chịu thiệt");
    });

    it("Tầng 3 trượt: quân ăn Tốt bị đối phương ăn lại ngay ở ply 1 trong biến (Lỗi 2: pieceLost)", () => {
      // Đỏ: Xe ở (9, 2), Mã đỏ ở (4, 4) giữ (3, 2), Tướng ở (9, 4).
      // Đen: Tốt ở (3, 2), Xe đen ở (0, 2), Sĩ ở (1, 4), Tướng ở (0, 5).
      // Xe đỏ ăn Tốt ở (3, 2). Vì Mã đỏ ở (4, 4) giữ (3, 2) nên exchangeGain <= 0 (Tầng 2 cho qua).
      // Nhưng biến engine ở ply 1: Xe đen ở (0, 2) ăn Xe đỏ ở (3, 2) (c.origin === move.from).
      const fen = "2r2k3/4a4/9/2p6/4N4/9/9/9/9/2R1K4 w - - 0 1";
      const pv = [
        [sq(0, 2), sq(3, 2)],
        [sq(4, 4), sq(3, 2)],
        [sq(0, 5), sq(0, 4)],
      ];
      const t = real(fen, sq(9, 2), sq(3, 2), pv, 0, 0);
      const r = checkChienThuatMuuBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({
        ok: false,
        layer: 3,
        reason: "Biến engine cho thấy quân ăn Tốt bị đối phương ăn lại ngay — không phải clean capture",
      });
    });

    it("Tầng 4 trượt: nước đi hớ điểm so với nước tốt nhất", () => {
      const pv = [
        [sq(0, 5), sq(0, 4)],
        [sq(3, 2), sq(3, 0)],
        [sq(0, 4), sq(0, 5)],
      ];
      const t = real(fen, sq(9, 2), sq(3, 2), pv, 150, 200);
      const r = checkChienThuatMuuBinh(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 4 });
      expect(r && !r.ok && r.reason).toContain("Nước đi hớ 200 điểm");
    });

    it("không nhận khi ăn quân không phải là Tốt", () => {
      const advisorFen = "5k3/4a4/2r6/9/9/9/9/9/9/2R1K4 w - - 0 1";
      const rookCaptureRook = mv(9, 2, 2, 2);
      const { before, after } = setup(advisorFen, rookCaptureRook);
      expect(checkChienThuatMuuBinh(before, rookCaptureRook, after, { loss: 0 })).toBeNull();
      expect(detectChienThuatMuuBinh(before, rookCaptureRook, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectCucBoDiDaKichThieu (Kỳ lý #48 - Cục bộ dĩ đa kích thiểu)", () => {
    const fen = "3akab2/4a4/9/9/9/9/9/RN1R5/9/4K4 w - - 0 1";
    const concentrateStrike = mv(7, 3, 3, 3);

    it("nhận diện tập trung ưu thế binh lực áp đảo tại cục bộ then chốt", () => {
      const { before, after } = setup(fen, concentrateStrike);
      const f = detectCucBoDiDaKichThieu(before, concentrateStrike, after, { loss: 0 });
      expect(f?.tactic).toBe("cucBoDiDaKichThieu");
      expect(f?.lesson).toBe(48);
      expect(f?.summary).toContain("Cục bộ lấy nhiều đánh ít");
    });

    it("không nhận khi không có ưu thế quân số tại cánh đó", () => {
      const balancedFen = "3akab2/4a4/9/9/9/9/9/r3R4/9/4K4 w - - 0 1";
      const rookAdvance = mv(7, 4, 3, 4);
      const { before, after } = setup(balancedFen, rookAdvance);
      expect(detectCucBoDiDaKichThieu(before, rookAdvance, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Tổng hợp và hiển thị", () => {
    it("không khen nước nào khi thiếu dữ liệu engine", () => {
      const fen = "3aka3/9/9/9/9/9/9/3NC4/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, mv(7, 3, 5, 4));
      expect(detectAllZhaoTactics(before, mv(7, 3, 5, 4), after)).toEqual([]);
    });

    it("nước vi phạm nguyên lý chỉ nhận lời phê bình, explainText gắn nhãn Cảnh tỉnh", () => {
      const fen = "2bakab2/9/9/4p4/1n7/9/9/1R5C1/9/3AKA3 w - - 0 1";
      const capture = mv(7, 1, 4, 1);
      const best = mv(7, 7, 7, 4);
      const { before, after } = setup(fen, capture);
      const facts = personaFacts(before, capture, after, { loss: 180, evalBefore: { score: 300, best, pv: [best] } });
      const zhao = facts.filter((f) => f.kind === "zhaoMiddlegame");
      expect(zhao.length).toBeGreaterThan(0);
      expect(zhao.every((f) => f.kind === "zhaoMiddlegame" && f.tone === "critique")).toBe(true);
      expect(explainText(facts, "r", 1, "zhaoXinxin")).toMatch(/^\[Triệu Hâm Hâm - Cảnh tỉnh\]/);
    });

    it("personaFacts giữ tối đa 2 nguyên lý Triệu mỗi nước (ván đại sư: Mã ngọa tào chiếu bắt Pháo)", () => {
      const t = attack("2baka3/9/4b1n2/CN2p4/Pc3n2p/2P6/4P1p1P/4B4/4A4/2BAK4 w", 28, 11,
        [[4, 13], [36, 37], [13, 14], [27, 9], [14, 23], [58, 49], [60, 59], [9, 10], [59, 58], [37, 28], [22, 6], [85, 86], [24, 43], [28, 29], [43, 60], [29, 30], [60, 79], [86, 85]], 288, -286);
      const zhao = personaFacts(t.before, t.move, t.after, t.options).filter((f) => f.kind === "zhaoMiddlegame");
      expect(zhao.length).toBeGreaterThan(0);
      expect(zhao.length).toBeLessThanOrEqual(2);
    });

    it("hai kỳ lý cùng kể một biến engine thì chỉ giữ kỳ lý đứng trước (ván đại sư: Xe ăn Sĩ, đen ăn Pháo)", () => {
      const t = attack("4RabC1/3k3r1/7r1/4p3p/2p3b2/4c4/P1n5P/2N1B4/4A4/2BAKR3 w", 4, 5,
        [[16, 7], [86, 14], [12, 21], [5, 3], [21, 22], [65, 58], [56, 73], [67, 87], [25, 88], [83, 67], [7, 70], [3, 2], [49, 67], [85, 86], [88, 87], [86, 77]], 223, -181);
      const zhao = detectAllZhaoTactics(t.before, t.move, t.after, t.options);
      const lines = zhao.map((f) => f.line).filter(Boolean);
      expect(new Set(lines).size).toBe(lines.length);
      expect(zhao.map((f) => f.tactic)).toContain("tramSiPhaTuong");
      expect(zhao.map((f) => f.tactic)).not.toContain("pheQuanPhaSiTuong");
    });
  });
});

describe("zhao-principles: kỳ lý tấn công chỉ gắn khi biến engine cho thấy đúng các quân làm nên hình ra tay", () => {
  describe("Giá Pháo", () => {
    it("ván đại sư: Tốt bình làm ngòi, Pháo chiếu lộ diện, theo biến Tốt ăn Mã", () => {
      const t = attack("3a5/4k4/5a3/3P2N2/1P1n2b2/4C4/4p4/4BA3/4A1n2/2BK5 w", 30, 31,
        [[13, 12], [37, 38], [78, 59], [38, 39], [58, 57], [31, 32], [3, 13], [49, 51], [12, 3], [33, 16], [42, 26], [32, 23], [13, 23], [16, 23], [59, 48], [51, 49]], 573, -575);
      const f = detectCannonMount(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("giaPhao");
      expect(f?.summary).toContain("Pháo chiếu");
      expect(f?.summary).toContain("Tốt ăn Mã");
    });

    it("ván đại sư: Xe làm ngòi cho Pháo dọa ăn Pháo, nhưng đối phương chỉ cần đổi lại — không gắn", () => {
      const t = attack("2bR1a3/C1c1k2r1/6n2/4p3p/2p3b2/4c4/Prn5P/2N1B1C2/4A4/2BAK3R b", 55, 10,
        [[9, 11], [10, 11], [69, 24], [2, 22], [89, 86], [11, 12], [3, 1], [12, 75], [1, 10], [75, 12], [10, 28], [12, 66], [28, 10], [66, 12]], 0, 0);
      expect(detectCannonMount(t.before, t.move, t.after, t.options)).toBeNull();
    });
  });

  it("ván đại sư: Xe Mã Pháo cùng dồn về một cánh, Xe chiếu đôi cùng Pháo rồi bắt Pháo — Xe Mã Pháo tam tử", () => {
    const t = attack("4kab2/4a1c2/2R1b4/9/9/1r1n2PNC/P1C1P3P/3AB4/9/c3KAB2 b", 46, 82,
      [[85, 76], [82, 73], [56, 74], [48, 59], [76, 75], [81, 83], [20, 18], [73, 74], [75, 84], [83, 81], [18, 19], [59, 52], [19, 1], [22, 2], [66, 76], [74, 11], [53, 44], [13, 3]], 566, -508, 58);
    const f = detectXeMaPhaoTamTu(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("xeMaPhaoTamTu");
    expect(f?.lesson).toBe(28);
    expect(f?.summary).toContain("Xe chiếu đôi cùng Pháo");
  });

  it("ván đại sư: Mã nhảy vào ngọa tào chiếu, Tướng phải tránh, Tốt ăn Pháo — Mã ngọa tào (gọi đúng lộ theo bên đi)", () => {
    const t = attack("2baka3/9/4b1n2/CN2p4/Pc3n2p/2P6/4P1p1P/4B4/4A4/2BAK4 w", 28, 11,
      [[4, 13], [36, 37], [13, 14], [27, 9], [14, 23], [58, 49], [60, 59], [9, 10], [59, 58], [37, 28], [22, 6], [85, 86], [24, 43], [28, 29], [43, 60], [29, 30], [60, 79], [86, 85]], 288, -286);
    const f = detectNgoaTaoKnight(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("ngoaTaoMa");
    expect(f?.summary).toContain("hàng 2 lộ 7");
    expect(f?.summary).toContain("Tốt ăn Pháo");
  });

  it("ván đại sư: Pháo xuống đáy thành Thiên Địa Pháo, chiếu liên tục rồi ăn Xe", () => {
    const t = attack("1R1rka3/4a4/4bc3/8p/5n3/9/P7P/B3C4/2C6/3AKAB2 w", 74, 2,
      [[3, 21], [2, 5], [21, 3], [5, 3], [4, 5], [3, 75], [5, 14], [1, 28], [35, 44], [63, 83]], 831, -830);
    const f = detectThienDiaPhao(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("thienDiaPhao");
    expect(f?.lesson).toBe(14);
    expect(f?.summary).toContain("Pháo ăn Xe");
  });

  it("ván đại sư: Xe Pháo dồn trên lộ sườn, thí Xe chiếu rồi sát — Oanh tạc lộ sườn", () => {
    const t = attack("2bakab2/9/6n2/p3p1p1p/2P2r3/4RnP2/P2Ccr2P/4C4/4A4/2BAK1B1R b", 59, 86,
      [[85, 86], [50, 69], [86, 85], [41, 86]], 99995, -99996);
    const f = detectOanhTacLoSuon(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("oanhTacLoSuon");
    expect(f?.lesson).toBe(16);
    expect(f?.summary).toContain("chiếu bí");
  });

  it("ván đại sư: Xe vào hàng 2 cung Tướng chiếu, chuỗi chiếu kết thúc bằng Xe ăn Pháo — Mạnh công tuyến áp đáy", () => {
    const t = attack("9/1r3k3/9/8p/6R2/4cr3/P2R4P/4B4/1n2A4/2B1KA3 w", 42, 15,
      [[14, 23], [57, 21], [49, 22], [15, 24], [23, 14], [24, 22], [10, 64], [21, 12], [14, 5], [12, 3], [5, 14], [22, 24], [73, 66], [85, 84]], 485, -403);
    const f = detectManhCongTuyenApDay(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("manhCongTuyenApDay");
    expect(f?.lesson).toBe(17);
    expect(f?.summary).toContain("Xe ăn Pháo");
  });

  describe("Tranh đoạt lộ 3, lộ 7", () => {
    it("ván đại sư: Xe vào lộ 7 nhắm Mã biên, theo biến chính Xe ăn Mã", () => {
      const t = attack("2bak4/4an3/2R1b4/4p3p/p5P2/9/P3P1r1P/n2CB1N2/4A4/4KAB2 w", 20, 65,
        [[14, 25], [42, 41], [25, 14], [65, 63], [14, 33], [41, 32]], 391, -422);
      const f = detectTranhDoatLo3Lo7(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("tranhDoatLo3Lo7");
      expect(f?.summary).toContain("Xe ăn Mã");
    });

    it("ván đại sư: Pháo vào lộ 3 nhắm Mã nhưng quân ra tay trong biến là quân khác, thế cân bằng — không gắn", () => {
      const t = attack("1rbaka1R1/1r7/2n3c2/p1p1p3p/9/P1P6/c3P1n1P/2C1C1N2/2N6/R1BAKAB2 b", 54, 56,
        [[74, 63], [60, 67], [87, 67], [10, 64], [69, 50], [64, 65], [63, 56], [65, 56], [50, 39], [56, 57], [39, 20], [1, 73], [20, 31], [73, 75], [86, 76], [24, 22], [31, 50]], 12, -30);
      expect(detectTranhDoatLo3Lo7(t.before, t.move, t.after, t.options)).toBeNull();
    });
  });

  describe("thứ tự ưu tiên: tổ hợp nhiều quân gọi tên trước Mạnh công tuyến áp đáy (cùng kể một biến)", () => {
    it("ván đại sư: Xe xuống hàng 2 chiếu, hai Xe cùng tuyến thay nhau chiếu tới sát — Song Xe phối hợp", () => {
      const t = attack("2R2abC1/3ka4/9/pr2r3p/6p2/P7P/4P1P2/4B4/4A4/1cR1KAB2 w", 83, 11,
        [[12, 21], [11, 20], [21, 12], [7, 16], [13, 23], [20, 11], [12, 21], [11, 13], [23, 13], [2, 20]], 99989, -99990);
      expect(detectManhCongTuyenApDay(t.before, t.move, t.after, t.options)?.tactic).toBe("manhCongTuyenApDay");
      const tactics = detectAllZhaoTactics(t.before, t.move, t.after, t.options).map((f) => f.tactic);
      expect(tactics).toContain("songXePhoiHop");
      expect(tactics).not.toContain("manhCongTuyenApDay");
    });

    it("ván đại sư: Xe chiếu đôi cùng Pháo, Pháo ăn Mã rồi Xe ăn Pháo — Xe Song Pháo", () => {
      const t = attack("3a1k3/4a4/9/7Rp/2b6/6B2/8P/6C2/2NK4c/5rBc1 b", 86, 77,
        [[75, 66], [80, 74], [34, 88], [77, 68], [87, 67], [68, 69], [88, 7], [5, 14], [7, 16], [14, 5], [16, 61], [69, 78], [61, 7], [5, 14], [7, 61]], 356, -375);
      expect(detectManhCongTuyenApDay(t.before, t.move, t.after, t.options)?.tactic).toBe("manhCongTuyenApDay");
      const tactics = detectAllZhaoTactics(t.before, t.move, t.after, t.options).map((f) => f.tactic);
      expect(tactics).toContain("xeSongPhao");
      expect(tactics).not.toContain("manhCongTuyenApDay");
    });
  });

  describe("Xe Song Mã", () => {
    it("ván đại sư: Mã chiếu, Xe chiếu tiếp rồi Xe ăn Mã — cả Xe lẫn Mã cùng ra tay", () => {
      const t = attack("2bk5/4a4/3ab1n2/p1N2R3/8p/2P1C4/P1Nr4c/4B3B/4A4/4K4 w", 29, 10,
        [[3, 4], [56, 45], [24, 43], [32, 34], [4, 5], [34, 7], [5, 14], [7, 43], [57, 59], [45, 28], [59, 50], [28, 39], [50, 49], [43, 41], [13, 23], [10, 21], [49, 67], [21, 4], [14, 13], [4, 15], [13, 14]], 603, -557);
      const f = detectXeSongMa(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("xeSongMa");
      expect(f?.lesson).toBe(29);
      expect(f?.summary).toContain("Xe ăn Mã");
    });

    it("ván đại sư: Xe đen ăn Pháo một mình, thế cân bằng (−6) — không phải Xe Song Mã", () => {
      const t = attack("4kab2/4a4/2n1b4/p2CN3p/5R3/2P4r1/P3C3n/4B4/4A4/4KA3 b", 52, 49,
        [[31, 50], [49, 58], [47, 38], [58, 59], [38, 29], [20, 31], [41, 40], [31, 42]], -6, 8);
      expect(detectXeSongMa(t.before, t.move, t.after, t.options)).toBeNull();
    });
  });

  it("ván đại sư: đen còn một Sĩ, hai Xe đỏ cùng đánh vào cung, theo biến đổi Xe lấy Tượng Sĩ Mã Xe — Khuyết Sĩ kỵ Song Xe", () => {
    const t = attack("2bakc3/3R2R2/2n1b3c/2p1r3p/p3C1p2/2P1P4/P5P1P/1r2B1N2/4A4/4KAB2 w", 15, 24,
      [[26, 17], [24, 22], [3, 13], [22, 13], [20, 13], [12, 13], [4, 3], [13, 31], [64, 82], [76, 84], [82, 84], [85, 76], [17, 15], [40, 37], [5, 4], [37, 1], [2, 22], [1, 4], [84, 75], [76, 85]], 391, -378);
    const f = detectKhuyetSiSongXe(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("khuyetSiSongXe");
    expect(f?.lesson).toBe(1);
    expect(f?.videoUrl).toContain("n3SbgwL1GAI");
    expect(f?.summary).toContain("chỉ còn một Sĩ");
  });

  describe("Vây quân: biến phải bắt được đúng con bị vây", () => {
    it("ván đại sư: Xe chặn đường lui của Pháo đã vào sâu, theo biến Xe ăn Pháo — Vây Pháo", () => {
      const t = attack("r3kab2/1R2a4/nR1cb4/p3p3p/5NpC1/8r/P3P2N1/4B4/4A4/4KAB2 b", 53, 52,
        [[61, 68], [52, 43], [41, 30], [43, 34], [54, 45], [34, 32], [30, 37], [22, 38], [68, 49], [32, 41], [19, 28], [21, 24], [28, 31]], -35, 45);
      const f = detectVayPhao(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("vayPhao");
      expect(f?.lesson).toBe(35);
      expect(f?.summary).toContain("Xe ăn Pháo");
    });

    it("ván đại sư: nước chiếu lộ diện khiến Pháo đen hết đường chạy chỉ vì phải đỡ chiếu — không gọi là vây", () => {
      const t = attack("3k1ab2/4a4/4b4/9/1C4p2/2BC5/P2c2P1P/3Ac1n2/9/4KA3 w", 37, 39,
        [[3, 4], [39, 57], [67, 31], [54, 45], [69, 58], [85, 84], [58, 77], [86, 76], [77, 60], [45, 36], [31, 49], [48, 30], [60, 41], [30, 28], [41, 30]], -36, 35);
      expect(detectVayPhao(t.before, t.move, t.after, t.options)).toBeNull();
    });

    it("ván đại sư: Pháo dồn Mã biên, theo biến chính Pháo ăn Mã — Mã phùng biên tất vong", () => {
      const t = attack("3akab2/9/2n1b1nrc/p1p1pR2p/3c5/3r2P2/P1P1P3P/NC2B1N2/2C6/1R1AKAB2 b", 39, 36,
        [[56, 47], [36, 63], [51, 42], [24, 13], [69, 50]], 39, -32);
      const f = detectMaPhungBienTatVong(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("maPhungBienTatVong");
      expect(f?.lesson).toBe(36);
      expect(f?.summary).toContain("Pháo ăn Mã");
    });

    it("ván đại sư: nước Pháo ăn Xe thì mục đích là ăn Xe, không phải dồn Mã biên — không gắn", () => {
      const t = attack("2bak4/4a4/nC2b2rc/p1r3p1p/9/2P3P2/P7P/N3B4/9/2BAKA2R w", 19, 25,
        [[29, 32], [89, 88], [32, 59], [47, 38], [22, 38], [88, 34], [26, 62], [34, 35], [38, 22], [25, 18], [2, 18], [35, 8], [13, 5], [54, 45]], -2, 0);
      expect(detectMaPhungBienTatVong(t.before, t.move, t.after, t.options)).toBeNull();
    });
  });

  describe("Khí tử tranh tiên", () => {
    it("ván đại sư: thí Mã chiếu, Sĩ ăn Mã, Xe chiếu tiếp rồi ăn Pháo", () => {
      const t = attack("4kab2/4a4/4b2N1/1R2P3p/9/4C4/P2r2p2/1C7/4A2n1/c1BAK1c2 b", 79, 68,
        [[76, 68], [57, 58], [85, 86], [58, 49], [25, 32], [49, 50]], -79, 114);
      const f = detectSacrificeForInitiative(t.before, t.move, t.after, t.options);
      expect(f?.tactic).toBe("khiTuTranhTien");
      expect(f?.summary).toContain("Đỏ Sĩ ăn Mã");
      expect(f?.summary).toContain("Xe ăn Pháo");
      expect(f?.summary).not.toContain("Lục Mạch");
    });

    it("ván đại sư: Xe chiếu, bị Sĩ ăn rồi Xe kia ăn lại ngay — đó là đổi Xe, không phải thí quân", () => {
      const t = attack("4kab2/4a4/1c2b2cn/pR1rn4/6p2/2R5C/P1CrP1P1P/4B1N2/2N1A4/4KAB2 b", 57, 84,
        [[76, 84], [30, 28], [58, 49], [31, 50], [56, 59], [26, 43], [74, 57], [50, 61], [59, 61], [25, 61]], -33, 42);
      expect(detectSacrificeForInitiative(t.before, t.move, t.after, t.options)).toBeNull();
    });
  });

  it("ván đại sư: Pháo ăn Tượng chiếu, Sĩ đỡ, Xe ăn thêm Tượng — Trảm Tượng kể lại đúng biến, không nói quá", () => {
    const t = attack("2bakr3/4a4/4b1n2/p3n3p/4C4/4P4/P1R2cp1P/1C2B1N2/4A4/4KA3 w", 40, 22,
      [[13, 21], [56, 2], [5, 14], [69, 58], [14, 10], [58, 47], [10, 55], [49, 40], [59, 56], [47, 58], [31, 42], [58, 51], [4, 13], [64, 66], [13, 22], [2, 29], [42, 49], [51, 32], [49, 66], [76, 66]], 103, -162);
    const f = detectPalaceBreaker(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("tramSiPhaTuong");
    expect(f?.summary).toContain("thắng 2 Tượng");
    expect(f?.summary).not.toContain("hiểm nghèo");
  });

  it("ván đại sư: Pháo ăn Tượng chiếu, Sĩ đỡ, Xe ăn Xe — Khéo phá Sĩ Tượng kể lại phần tiếp theo", () => {
    const t = attack("1r2kab2/1R2a4/4b4/p3n4/5n2p/P1R6/6c2/N3C1N2/9/2BAKAB2 b", 60, 87,
      [[86, 76], [1, 10], [63, 56], [41, 48], [69, 50], [48, 67]], 71, -54);
    const f = detectKheoPhaSiTuong(t.before, t.move, t.after, t.options);
    expect(f?.tactic).toBe("kheoPhaSiTuong");
    expect(f?.summary).toContain("không phải trả giá");
    expect(f?.summary).toContain("Xe ăn Xe");
  });

  describe("engineLine - an toàn khi PV ngắn (Lỗi 9)", () => {
    // Đen đi nước dở, Đỏ chiếu bí trong 1 nước (pv ngắn < 3 plies)
    const mateFen = "3aka3/9/2n5C/9/4P4/9/9/9/9/4K4 b - - 0 1";
    const move = { from: sq(2, 2), to: sq(1, 4) };
    const pv = [{ from: sq(2, 8), to: sq(0, 8) }];
    const options = {
      pv,
      evalAfter: { score: 100000 },
    };
    const pos = parseFen(mateFen);

    it("mặc định trả về null khi pv.length < 3 dù đối phương chiếu bí (bảo vệ 32 nơi gọi khác)", () => {
      const lineDefault = engineLine(pos.board, move, options);
      expect(lineDefault).toBeNull();
    });

    it("chỉ trả về line khi allowShortOpponentMate = true (dùng riêng cho Oa Tâm)", () => {
      const lineOaTam = engineLine(pos.board, move, options, true);
      expect(lineOaTam).not.toBeNull();
      expect(lineOaTam?.scoreForMover).toBe(-100000);
      expect(lineOaTam?.plies.length).toBe(2);
    });
  });
});


describe("zhao-principles: kỳ lý thế trận chỉ gắn khi biến engine cho thấy cơ chế (thế thật, Pikafish 30k nodes)", () => {
  describe("Máy ủi trung lộ (Bài 9)", () => {
    it("thúc Tốt giữa ăn Mã thì mục đích là ăn quân", () => {
      const t = real("2r1kab2/4a1c2/1c2b4/p3nR2p/2P1P4/9/P5p1P/1CN1C4/7r1/R1BAKAB2 w", 40, 31,
        [[15, 87], [86, 76], [2, 38], [31, 22], [38, 65], [85, 86], [19, 1], [22, 13], [4, 13], [64, 46], [87, 89], [32, 31], [13, 12]], -106, 29);
      expect(checkMayUiTrungLo(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("đủ hình trung lộ nhưng biến không sát, không thắng quân thì không gắn", () => {
      const t = real("1rbakab2/9/nc6c/p1p1p3p/5np2/2PCP1P2/P3N3P/2N1C4/2r6/1RBAKAB1R w", 49, 40,
        [[41, 58], [65, 58], [19, 22], [82, 1], [18, 1], [51, 42], [22, 40], [48, 49], [74, 56], [58, 51], [26, 22], [51, 40], [31, 40], [49, 51], [6, 26], [42, 41], [56, 60], [51, 52], [26, 6], [41, 40]], 19);
      expect(checkMayUiTrungLo(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 3 });
      expect(detectMayUiTrungLo(t.before, t.move, t.after, t.options)).toBeNull();
    });
  });

  describe("Chiếm tuyến Tốt (Bài 19)", () => {
    it("càn quét binh: Xe vào tuyến Tốt ăn Tốt, không bị bắt, engine chấm +347", () => {
      const t = real("2Rcka3/4a4/9/p7p/1r7/4P1P2/P7P/9/4C4/r1N1KAB2 b", 81, 54,
        [[49, 40], [37, 55], [40, 41], [13, 21], [87, 67], [5, 13], [83, 66], [55, 61], [67, 83], [4, 5], [76, 77], [5, 4], [77, 68], [61, 62]], 347, 34);
      const r = checkChiemTuyenTot(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "càn quét binh" });
      expect(r && r.ok && r.summary).toContain("Xe ăn Tốt (X1/3)");
      expect(r && r.ok && r.summary).toContain("không bị bắt lại");
      expect(detectChiemTuyenTot(t.before, t.move, t.after, t.options)?.lesson).toBe(19);
    });

    it("Xe vào tuyến Tốt ăn Mã thì mục đích là ăn quân", () => {
      const t = real("4kab2/4a4/1cc1b4/pC2p1Cnp/4r4/7RP/P1N6/4B4/4A4/4KAB2 w", 52, 34,
        [[19, 18], [34, 52], [40, 38], [56, 49], [38, 37], [49, 30], [37, 82], [76, 84], [20, 21], [30, 47], [18, 54], [47, 54], [82, 55], [52, 45], [21, 57], [45, 27], [57, 58], [67, 83], [22, 2]], 340);
      expect(checkChiemTuyenTot(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("nước mạnh (+335) nhưng Xe không quét Tốt, không ghìm Mã, không mở đường Mã thì không phải chiếm tuyến Tốt", () => {
      const t = real("4kab2/c3a4/c3b4/p1C1p1C2/1r7/P2R5/9/4BN3/4A4/4KAB2 w", 48, 30,
        [[37, 82], [76, 84], [18, 45], [29, 31], [45, 81], [68, 51], [82, 46], [84, 76], [9, 11], [85, 84], [11, 83], [84, 75], [46, 73], [75, 66], [83, 74], [67, 83], [73, 64], [66, 75]], 335);
      expect(checkChiemTuyenTot(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 3 });
    });

    it("có cơ chế nhưng engine chỉ chấm thế cân bằng thì không khen", () => {
      const t = real("r3kab2/3na4/2c1b2cn/p2r5/6p2/2R5C/P3P1P1P/NC2B1N2/9/1R1AKAB2 b", 30, 57,
        [[86, 76], [57, 54], [64, 65], [20, 65], [47, 65], [12, 31], [63, 56], [31, 50], [56, 49], [0, 3], [69, 88], [54, 58], [88, 71], [25, 23]], -7, 2);
      expect(checkChiemTuyenTot(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 4 });
    });
  });

  describe("Tốt biên đại náo (Bài 23)", () => {
    it("Tốt biên ăn Mã thì mục đích là ăn quân", () => {
      const t = real("3rkab2/4a3C/4b2Pn/p7C/9/5R3/Pc2Pn2P/4B2c1/4A3N/2BAK4 w", 25, 26,
        [[59, 78], [85, 86], [3, 30], [80, 69], [55, 82], [35, 53], [30, 29], [67, 47], [29, 33], [53, 51], [6, 26], [17, 8], [22, 6]], -19);
      expect(checkTotBienDaiNao(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("Tốt biên thọc sâu mà biến không có đòn thì không gắn", () => {
      const t = real("4kab2/4a4/4b4/8R/2n5P/p8/8r/2C1B4/4A4/3AK1B2 b", 45, 54,
        [[65, 47], [38, 21], [35, 30], [62, 44], [30, 27]], 1, 1);
      expect(checkTotBienDaiNao(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 3 });
    });
  });

  describe("Mã vận như long — hồi Mã kim thương (Bài 42)", () => {
    it("công sát: Mã thoái về chiếu rồi chính Mã chiếu tiếp tới sát", () => {
      const t = real("5kb2/3Ra4/5a3/3N5/9/9/9/4K4/4An3/3r1AB2 b", 77, 60,
        [[67, 68], [84, 48], [30, 49], [60, 49], [68, 67], [49, 60], [67, 68], [48, 50]], 99992);
      const r = checkMaVanNhuLong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "công sát" });
      expect(r && r.ok && r.summary).toContain("Mã chiếu (M6/7)");
      expect(r && r.ok && r.summary).toContain("chiếu bí");
    });

    it("thắng quân: Mã thoái về rồi chính Mã ăn lại Mã trong biến", () => {
      const t = real("2r1kab2/1P2a4/4n3b/9/R8/2Cc3N1/P3P2nP/2C1B1N2/1R1cA4/4KA2r w", 52, 59,
        [[2, 47], [67, 47], [61, 78], [59, 78], [75, 78], [76, 68], [78, 87], [86, 76], [48, 51], [47, 67], [87, 78], [76, 86], [51, 60], [36, 0], [13, 3], [65, 2], [4, 13], [2, 5]], 579);
      const r = checkMaVanNhuLong(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "thắng quân" });
      expect(r && r.ok && r.summary).toContain("Mã ăn Mã");
    });

    it("Mã đang bị dọa không có quân bảo vệ thì thoái về là chạy quân", () => {
      const t = real("r3kab2/4a4/2n1b2Rc/pc2p3p/9/3N3n1/P3P2NP/1C2C4/9/2BAKAB2 b", 52, 33,
        [[64, 66], [0, 2], [25, 43], [20, 9], [67, 31], [2, 83], [66, 69], [33, 14], [31, 49], [83, 56], [43, 40]], 13);
      expect(checkMaVanNhuLong(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("hồi Mã mà biến không có đòn thì không gắn", () => {
      const t = real("4kab2/4a4/2nc5/p1C1p1Cnp/2b1r4/1N2Nc2P/P3P4/4B4/4A4/3RKAB2 w", 49, 56,
        [[34, 53], [84, 30], [53, 42], [58, 49], [42, 49], [29, 31], [21, 22], [31, 49], [50, 46], [49, 51], [6, 26], [33, 34], [22, 25], [51, 49], [26, 6]], 90, 70);
      expect(checkMaVanNhuLong(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 3 });
    });

    it("Mã có ra tay nhưng engine chấm bên đi thua thì không khen", () => {
      const t = real("4ka3/4a4/4b1r2/p7p/4P4/P5N2/1RR5P/3AB4/5n3/c3KAB2 b", 77, 66,
        [[85, 84], [66, 55], [56, 55], [22, 2], [55, 56], [2, 18], [56, 29], [81, 86], [29, 27], [86, 59], [87, 71], [59, 14], [27, 35], [24, 21], [84, 85], [13, 23], [85, 76]], -336);
      expect(checkMaVanNhuLong(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 4 });
    });
  });
  describe("Kiềm chế tuyến đỉnh cung (Bài 18)", () => {
    it("Xe vào hàng đỉnh cung ăn Pháo thì mục đích là ăn quân", () => {
      const t = real("1rbakabr1/9/2nR2n2/p1p1p3p/6p2/2PNP4/P5PcP/BC2CcN2/9/3AKABR1 b", 1, 64,
        [[21, 24], [64, 73], [48, 31], [68, 63], [31, 14], [3, 13], [14, 7], [63, 81], [84, 76], [73, 82], [76, 84], [82, 1], [84, 76]], -74, 65);
      expect(checkKiemCheDinhCung(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("Pháo lên hàng đỉnh cung mà Mã Pháo đối phương gần như không mất ô đi thì không phải kiềm chế", () => {
      const t = real("1rbakabr1/9/2n3n2/p1p1p3p/6p2/2P1P4/P4cPcP/BCN1C1N2/3R5/3AKABR1 w", 75, 21,
        [[2, 22], [21, 20], [59, 68], [64, 19], [68, 65], [69, 76], [65, 56], [67, 64], [1, 0], [88, 70], [24, 41], [19, 28], [41, 60], [64, 55], [42, 51], [55, 60], [51, 60]], -103, 71);
      const r = checkKiemCheDinhCung(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("từ 17 còn 16");
    });

    it("hớ 95 điểm so với nước tốt nhất thì không khen", () => {
      const t = real("2bak3r/4a4/8c/p6rp/2p3RC1/2P1P4/7RP/N2CB4/4A4/2BAK3c w", 42, 24,
        [[8, 7], [24, 26], [34, 43], [61, 43], [7, 43], [85, 86], [13, 5], [47, 38], [43, 38], [86, 77], [38, 41], [76, 68], [41, 43]], 537, 95);
      expect(checkKiemCheDinhCung(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 4 });
    });
  });

  describe("Khống chế tuyến kỵ hà (Bài 20)", () => {
    it("Xe tới bờ sông ăn Xe thì mục đích là ăn quân", () => {
      const t = real("2bakab2/9/2n3n2/p2Rp1p1p/1rr6/1N7/P3c1P1P/2R1C1C2/4A4/2BAK1B2 w", 65, 38,
        [[37, 38], [46, 65], [58, 40], [65, 48], [40, 58], [60, 51], [6, 22], [69, 33], [20, 37], [30, 28], [37, 56], [48, 31], [24, 31], [28, 31]], 10, 16);
      expect(checkKhongCheKyHa(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("Xe kỵ hà mà đối phương vẫn đưa thêm quân qua sông thì không phải khống chế tuyến sông", () => {
      const t = real("3akab2/9/2n1b4/p1C1p3p/4c2n1/2P2R3/P3C2rP/2N6/4A4/2B1KAB2 w", 50, 41,
        [[61, 52], [87, 67], [3, 13], [29, 30], [43, 50], [47, 38], [50, 57], [38, 39], [57, 74], [85, 84], [20, 39], [58, 31], [39, 46], [41, 40], [46, 65], [30, 75], [74, 81], [84, 85]], 9, 2);
      const r = checkKhongCheKyHa(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: false, layer: 3 });
      expect(r && !r.ok && r.reason).toContain("qua sông");
    });

    it("Xe bị đuổi khỏi tuyến kỵ hà trong biến thì không gắn", () => {
      const t = real("4kab2/4a4/4b4/p3r4/2P3n1p/9/P5R2/4C4/4A4/2B1KA3 b", 31, 49,
        [[38, 29], [44, 53], [29, 20], [42, 31], [60, 56], [31, 50], [67, 63], [49, 48], [63, 27], [48, 57]], -8, 2);
      expect(checkKhongCheKyHa(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 3 });
    });

    it("engine chấm cân bằng thì không khen", () => {
      const t = real("3ak1b2/4a4/4bn3/p8/3P4p/4r4/P7R/4C4/4A4/2B1KA3 w", 62, 44,
        [[49, 47], [76, 84], [47, 83], [44, 41], [83, 65], [67, 40], [23, 40], [41, 40], [65, 56]], 4);
      expect(checkKhongCheKyHa(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 4 });
    });
  });

  describe("Phong tỏa & phản phong tỏa lộ Xe (Bài 22)", () => {
    it("phong tỏa: Mã vào lộ 2, Xe Đen ở góc suốt biến không đi được quá 2 ô, engine chấm +263", () => {
      const t = real("2b3br1/3kaR3/9/p3C1N1p/6p2/2P1P4/P5PcP/4K1N2/1r7/2cA1ABR1 w", 33, 16,
        [[61, 79], [47, 38], [12, 3], [14, 13], [42, 51], [69, 76]], 263);
      const r = checkPhongToaLoXe(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "phong tỏa" });
      expect(r && r.ok && r.summary).toContain("không lúc nào đi được quá 2 ô");
    });

    it("phản phong tỏa: Pháo Đen chặn lộ 2, Xe Đỏ ra lộ 2 và cuối biến vẫn đi được rộng", () => {
      const t = real("2bak3r/2r1a4/1c2b1nc1/p4Rp1p/2pNp2C1/6P2/n1P1P3P/N2CB4/4A4/R1BAK4 w", 81, 82,
        [[19, 37], [32, 33], [37, 39], [43, 39], [8, 7], [33, 34], [25, 26], [34, 7], [24, 7], [82, 28], [26, 62], [28, 34], [7, 24], [51, 42], [22, 42], [39, 42]], 278, 2);
      const r = checkPhongToaLoXe(t.before, t.move, t.after, t.options);
      expect(r).toMatchObject({ ok: true, mechanism: "phản phong tỏa" });
      expect(detectPhongToaLoXe(t.before, t.move, t.after, t.options)?.summary).toContain("Phản phong tỏa lộ Xe");
    });

    it("quân nhà tự tránh cho Xe ra (không có Pháo/Mã đối phương chặn lộ 2/8) thì không phải phản phong tỏa", () => {
      const t = real("1rb1ka3/4a4/1c2b3c/p4Cp2/2n6/3N2P1C/P1R1P2rP/4B4/4A4/2BAKR3 b", 19, 20,
        [[32, 29], [61, 62], [53, 35], [1, 73], [56, 47], [33, 42], [35, 33], [42, 51], [86, 59], [62, 89], [59, 86]], 100);
      expect(checkPhongToaLoXe(t.before, t.move, t.after, t.options)).toBeNull();
    });

    it("Pháo vào lộ 2 ăn Mã thì mục đích là ăn quân", () => {
      const t = real("2b3br1/3kaR1N1/9/p3C3p/6p2/2P1P4/P5PcP/4K1N2/1r7/2cA1ABR1 b", 7, 16,
        [[14, 16], [61, 54], [31, 29], [73, 64], [67, 76], [83, 82], [16, 34], [64, 66], [29, 35], [66, 75], [76, 67], [75, 66], [67, 76], [82, 73], [34, 27], [66, 75], [76, 67], [75, 66], [67, 76], [54, 56], [27, 81], [66, 75], [76, 67], [73, 64], [35, 17], [13, 23]], -406, 143);
      expect(checkPhongToaLoXe(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 2 });
    });

    it("Xe ra rồi cuối biến lại bị khóa thì không gắn", () => {
      const t = real("rn2kabn1/4a4/4b3c/p1p1C3p/6p2/2c6/P3P1P1P/N3C1N2/9/R1BAKAB2 w", 81, 82,
        [[1, 20], [82, 28], [29, 38], [31, 34], [0, 1], [28, 1], [20, 1], [34, 16], [1, 20]], 4);
      expect(checkPhongToaLoXe(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 3 });
    });

    it("phản phong tỏa đúng hình nhưng engine chấm cân bằng thì không khen", () => {
      const t = real("1rbaka2r/9/1cn1bcn2/p3p1p1p/2p6/6P2/P1P1P3P/N1C1C1N2/9/R1BAKABR1 w", 81, 82,
        [[19, 55], [88, 34], [5, 13], [34, 33], [8, 26], [33, 32], [55, 28]], 21);
      expect(checkPhongToaLoXe(t.before, t.move, t.after, t.options)).toMatchObject({ ok: false, layer: 4 });
    });
  });
});
