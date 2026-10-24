import { describe, expect, it } from "vitest";
import { isLegal, parseFen, play, sq, type Board, type Move } from "./engine";
import { explainText, personaFacts } from "./explain";
import { detectPalaceBreaker, detectSacrificeForInitiative } from "./middlegame";
import {
  detectAllZhaoTactics,
  detectCannonMount,
  detectDecoy,
  detectEndgameConversion,
  detectFlankSwitch,
  detectInitiativeOverMaterial,
  detectInterference,
  detectMatingRace,
  detectPoisonedCapture,
  detectProphylaxis,
  detectTempoChase,
  detectTempoExchange,
  detectWorstPieceImprovement,
  detectKhuyetSiSongXe,
  detectSmotheredCannonMate,
  detectNgoaTaoKnight,
  detectOaTamKnight,
  checkDeepCannonBottom,
  detectDeepCannonBottom,
  detectVoSuTienTotBien,
  detectMayUiTrungLo,
  detectNhatMaHoanLuongTuong,
  detectDoatTrungBinh,
  detectKhongTamPhao,
  detectThienDiaPhao,
  detectPhaoDayKhoaXe,
  detectOanhTacLoSuon,
  detectManhCongTuyenApDay,
  detectKiemCheDinhCung,
  detectChiemTuyenTot,
  detectKhongCheKyHa,
  detectTranhDoatLo3Lo7,
  detectPhongToaLoXe,
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
  detectTamNganThangTamXa,
  detectTamXaThangTamNgan,
  detectMotXeDoiHai,
  detectMotXeDoiBa,
  detectMaVanNhuLong,
  detectNhatXeThapTu,
  detectNgheThuatVanPhao,
  detectTieuBinhLapDaiCong,
  detectPheTotPhanCong,
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

  describe("Tranh nước đối công", () => {
    // Đen dọa Xe a3 xuống a0 chiếu bí (Tốt đen e2 khóa đường lên của Tướng).
    // Đỏ không chống mà Xe f4 lên f9 chiếu, Mã g7 giữ ô f9 và e8.
    const fen = "2b1k1b2/9/6N2/9/9/5R3/r8/4p4/9/4K4 w - - 0 1";
    const counterCheck = mv(5, 5, 0, 5);

    it("khen nước chiếu trước khi đang bị dọa sát", () => {
      const { before, after } = setup(fen, counterCheck);
      const f = detectMatingRace(before, counterCheck, after, { loss: 0, pv: [] });
      expect(f?.tactic).toBe("tranhNuoc");
      expect(f?.summary).toContain("dọa sát");
    });

    it("không nhận khi nước đi không chiếu", () => {
      const quiet = mv(5, 5, 5, 6);
      const { before, after } = setup(fen, quiet);
      expect(detectMatingRace(before, quiet, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương không có đòn dọa sát", () => {
      // Bỏ Tốt đen e2: Tướng Đỏ lên e1 thoát được, Xe xuống đáy không còn là sát.
      const fen2 = "2b1k1b2/9/6N2/9/4p4/5R3/r8/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen2, counterCheck);
      expect(detectMatingRace(before, counterCheck, after, { loss: 0 })).toBeNull();
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

  describe("Chặn đường", () => {
    // Pháo đen g7 được Xe a7 bảo vệ theo hàng ngang; Mã đỏ nhảy vào c7 cắt liên lạc, Xe g3 ăn được Pháo.
    const fen = "3aka3/9/r5c2/4p4/1N7/9/6R2/9/9/4K4 w - - 0 1";
    const cut = mv(4, 1, 2, 2);

    it("nhận diện quân chen vào khiến Pháo mất căn", () => {
      const { before, after } = setup(fen, cut);
      const f = detectInterference(before, cut, after, { loss: 0 });
      expect(f?.tactic).toBe("chanDuong");
      expect(f?.summary).toContain("Pháo đối phương mất căn");
    });

    it("không nhận nước không làm thay đổi căn của quân đối phương", () => {
      const quiet = mv(4, 1, 6, 2);
      const { before, after } = setup(fen, quiet);
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

  describe("Biết dừng công, chuyển hóa tàn cuộc", () => {
    // Đỏ hơn 3 Tốt, đổi Xe; Mã đen ăn lại, Đỏ đi nước yên.
    const fen = "2naka3/9/3r5/9/2P3P2/3R5/4P4/2N6/9/3AKA3 w - - 0 1";
    const trade = mv(5, 3, 2, 3);
    const pv = [mv(0, 2, 2, 3), mv(4, 6, 3, 6)];

    it("nhận diện đổi Xe khi đang hơn, không còn đòn ép", () => {
      const { before, after } = setup(fen, trade);
      const f = detectEndgameConversion(before, trade, after, { loss: 0, evalBefore: { score: 250 }, pv });
      expect(f?.tactic).toBe("chuyenHoaTanCuoc");
      expect(f?.summary).toContain("hơn 3 Tốt");
    });

    it("không nhận khi engine đánh giá thế cờ chưa hơn", () => {
      const { before, after } = setup(fen, trade);
      expect(detectEndgameConversion(before, trade, after, { loss: 0, evalBefore: { score: 20 }, pv })).toBeNull();
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
    const mateMove = mv(2, 8, 0, 8);

    it("nhận diện Pháo chiếu muộn cung khi Tướng bị chính quân phòng thủ chèn kẹt tuyệt sát", () => {
      const { before, after } = setup(fen, mateMove);
      const f = detectSmotheredCannonMate(before, mateMove, after, { loss: 0 });
      expect(f?.tactic).toBe("muonCungSat");
      expect(f?.summary).toContain("Muộn cung sát");
    });

    it("không nhận khi Pháo chiếu ở khai cuộc (phản chứng: Tướng còn ô thoát, chưa bị muộn cung)", () => {
      // Thế cờ khai cuộc: Đỏ bình Pháo vào trung lộ chiếu qua Tốt đầu, Đen có 2 Sĩ nhưng còn ô thoát
      const openingFen = "3aka3/9/9/9/4p4/9/9/C8/9/4K4 w - - 0 1";
      const checkMove = mv(7, 0, 7, 4);
      const { before, after } = setup(openingFen, checkMove);
      expect(detectSmotheredCannonMate(before, checkMove, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi chiếu bí trên bàn cờ mở nhưng Tướng trơ trọi không bị quân mình chèn kẹt", () => {
      // Đỏ phối hợp Xe Mã Pháo chiếu bí Tướng trơ trọi (bare king), không phải muộn cung
      const bareKingFen = "4k1R2/8C/2N6/9/9/4P4/9/9/9/4K4 w - - 0 1";
      const mateMoveBare = mv(1, 8, 0, 8);
      const { before, after } = setup(bareKingFen, mateMoveBare);
      expect(detectSmotheredCannonMate(before, mateMoveBare, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi Pháo chiếu nhưng không phải chiếu bí (đối phương còn ô thoát)", () => {
      const notMateFen = "3aka3/9/8C/4p4/9/9/9/9/9/4K4 w - - 0 1";
      const checkNotMate = mv(2, 8, 0, 8);
      const { before, after } = setup(notMateFen, checkNotMate);
      expect(detectSmotheredCannonMate(before, checkNotMate, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi nước đi không phải là Pháo chiếu", () => {
      const kingQuietMove = mv(9, 4, 8, 4);
      const { before, after } = setup(fen, kingQuietMove);
      expect(detectSmotheredCannonMate(before, kingQuietMove, after, { loss: 0 })).toBeNull();
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
    // Đen thoái Mã về hoa tim giữa cung (hàng 1 cột 4)
    const fen = "3aka3/9/2n6/9/4P4/9/9/9/9/4K4 b - - 0 1";
    const oaTamMove = mv(2, 2, 1, 4);

    it("phê bình khi Mã nhảy vào hoa tim trung cung chèn kẹt Tướng và Sĩ", () => {
      const { before, after } = setup(fen, oaTamMove);
      const f = detectOaTamKnight(before, oaTamMove, after, { loss: 0 });
      expect(f?.tactic).toBe("oaTamMa");
      expect(f?.summary).toContain("Oa Tâm Mã");
      expect(f?.tone).toBe("critique");
    });

    it("không nhận khi Mã nhảy tới ô khác không phải hoa tim", () => {
      const otherMove = mv(2, 2, 4, 3);
      const { before, after } = setup(fen, otherMove);
      expect(detectOaTamKnight(before, otherMove, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi nước đi không phải là Mã", () => {
      const kingMove = mv(0, 4, 1, 4);
      const { before, after } = setup(fen, kingMove);
      expect(detectOaTamKnight(before, kingMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Pháo Trầm Đáy (Nghệ Thuật Phá Trận & Kiềm Chế - Triệu Hâm Hâm Bài 13 & 14)", () => {
    // Đỏ cắm Pháo xuống tuyến đáy đối phương (hàng 0 cột 1)
    const fen = "3akab2/9/1C7/9/4P4/9/9/9/9/4K4 w - - 0 1";
    const deepCannonMove = mv(2, 1, 0, 1);

    // Thế cờ thật từ ván cao thủ, biến Pikafish ghi lại (ô = hàng * 9 + cột)
    const line = (xs: number[][]): Move[] => xs.map(([from, to]) => ({ from, to }));
    const real = (fen: string, from: number, to: number, pv: number[][], scoreForMover: number, loss = 0) => {
      const pos = parseFen(fen);
      const move = { from, to };
      expect(isLegal(pos, move)).toBe(true);
      const after = play(pos.board, move);
      return { before: pos.board, move, after, options: { pv: line(pv), loss, evalAfter: { score: -scoreForMover } } };
    };

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

    it("nhận diện có Pháo đầu yểm trợ thúc tốt giữa công phá trung lộ", () => {
      const { before, after } = setup(fen, centerPush);
      const f = detectMayUiTrungLo(before, centerPush, after, { loss: 0 });
      expect(f?.tactic).toBe("mayUiTrungLo");
      expect(f?.lesson).toBe(9);
      expect(f?.summary).toContain("Máy ủi trung lộ");
    });

    it("không nhận khi thúc tốt giữa mà không có Pháo đầu ở cột 4", () => {
      const noCannonFen = "3ak4/9/9/9/9/9/4P4/1C7/9/4K4 w - - 0 1";
      const { before, after } = setup(noCannonFen, centerPush);
      expect(detectMayUiTrungLo(before, centerPush, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectNhatMaHoanLuongTuong (Kỳ lý #10 - Nhất Mã hoán Lưỡng Tượng)", () => {
    const fen = "2b1k4/9/4b4/2N6/9/9/9/9/9/4K4 w - - 0 1";
    const takeElephant = mv(3, 2, 2, 4);

    it("nhận diện Mã nhảy qua sông ăn Tượng phá nát cặp Tượng phòng thủ", () => {
      const { before, after } = setup(fen, takeElephant);
      const f = detectNhatMaHoanLuongTuong(before, takeElephant, after, { loss: 0 });
      expect(f?.tactic).toBe("nhatMaHoanLuongTuong");
      expect(f?.lesson).toBe(10);
      expect(f?.summary).toContain("Nhất Mã hoán Lưỡng Tượng");
    });

    it("không nhận khi Mã ăn quân khác không phải Tượng", () => {
      const takePawnFen = "2b1k4/9/4p4/2N6/9/9/9/9/9/4K4 w - - 0 1";
      const takePawn = mv(3, 2, 2, 4);
      const { before, after } = setup(takePawnFen, takePawn);
      expect(detectNhatMaHoanLuongTuong(before, takePawn, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectDoatTrungBinh (Kỳ lý #11 - Chiến thuật đoạt trung binh)", () => {
    const fen = "3ak4/9/9/4p4/9/3N5/9/9/9/4K4 w - - 0 1";
    const takeCenterPawn = mv(5, 3, 3, 4);

    it("nhận diện tiêu diệt Tốt giữa đối phương phá vỡ tim phòng ngự", () => {
      const { before, after } = setup(fen, takeCenterPawn);
      const f = detectDoatTrungBinh(before, takeCenterPawn, after, { loss: 0 });
      expect(f?.tactic).toBe("doatTrungBinh");
      expect(f?.lesson).toBe(11);
      expect(f?.summary).toContain("Mã ăn Tốt giữa");
    });

    it("không nhận khi ăn tốt biên thay vì tốt giữa", () => {
      const edgePawnFen = "3ak4/4a4/9/p8/9/1N7/9/9/9/4K4 w - - 0 1";
      const takeEdgePawn = mv(5, 1, 3, 0);
      const { before, after } = setup(edgePawnFen, takeEdgePawn);
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

    it("nhận diện Pháo chiếm lĩnh hàng ngang đỉnh cung kiềm chế Song Mã Song Pháo", () => {
      const { before, after } = setup(fen, toDinhCung);
      const f = detectKiemCheDinhCung(before, toDinhCung, after, { loss: 0 });
      expect(f?.tactic).toBe("kiemCheDinhCung");
      expect(f?.lesson).toBe(18);
      expect(f?.summary).toContain("Kiềm chế tuyến đỉnh cung");
    });

    it("không nhận khi đối phương không còn đủ 2 quân nhẹ Mã/Pháo", () => {
      const noMinorsFen = "3akab2/4a4/9/9/9/9/9/1C7/9/4K4 w - - 0 1";
      const { before, after } = setup(noMinorsFen, toDinhCung);
      expect(detectKiemCheDinhCung(before, toDinhCung, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectChiemTuyenTot (Kỳ lý #19 - Chiếm tuyến tốt)", () => {
    const toPawnRow = mv(4, 1, 3, 1);

    it("nhận diện Xe quá hà chiếm tuyến tốt nhắm cùng lúc hai Tốt đối phương", () => {
      const fen = "3akab2/4a4/9/p3p4/1R7/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, toPawnRow);
      const f = detectChiemTuyenTot(before, toPawnRow, after, { loss: 0 });
      expect(f?.tactic).toBe("chiemTuyenTot");
      expect(f?.lesson).toBe(19);
      expect(f?.summary).toContain("Chiếm tuyến tốt");
    });

    it("không nhận khi Xe lên tuyến tốt mà không nhắm được Tốt nào", () => {
      const fen = "3akab2/4a4/9/9/1R7/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, toPawnRow);
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

    it("nhận diện Xe tiến sang bờ sông đối phương (kỵ hà xa)", () => {
      const { before, after } = setup(fen, toKyHa);
      const f = detectKhongCheKyHa(before, toKyHa, after, { loss: 0 });
      expect(f?.tactic).toBe("khongCheKyHa");
      expect(f?.lesson).toBe(20);
      expect(f?.summary).toContain("Khống chế tuyến kỵ hà");
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
    it("nhận diện Pháo chặn lộ 2 khiến Xe đối phương ở góc mất đường ra", () => {
      const fen = "1r1ak1b2/4a4/7C1/9/9/9/9/9/9/1R2K4 w - - 0 1";
      const blockRook = mv(2, 7, 2, 1);
      const { before, after } = setup(fen, blockRook);
      const f = detectPhongToaLoXe(before, blockRook, after, { loss: 0 });
      expect(f?.tactic).toBe("phongToaLoXe");
      expect(f?.lesson).toBe(22);
      expect(f?.summary).toContain("Phong tỏa lộ Xe");
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

    it("nhận diện Tốt biên thọc sâu qua sông đại náo cánh biên đối phương", () => {
      const { before, after } = setup(fen, deepPawn);
      const f = detectTotBienDaiNao(before, deepPawn, after, { loss: 0 });
      expect(f?.tactic).toBe("totBienDaiNao");
      expect(f?.lesson).toBe(23);
      expect(f?.summary).toContain("Tốt biên đại náo");
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

  describe("detectTamNganThangTamXa (Kỳ lý #38 - Vũ khí tầm ngắn thắng tầm xa)", () => {
    const fen = "r2akab2/4a4/1R7/3N5/9/1N7/9/1c5c1/9/1R2K4 w - - 0 1";
    const knightStrike = mv(5, 1, 3, 2);

    it("nhận diện Xe Song Mã bóp nghẹt và áp đảo Xe Song Pháo", () => {
      const { before, after } = setup(fen, knightStrike);
      const f = detectTamNganThangTamXa(before, knightStrike, after, { loss: 0 });
      expect(f?.tactic).toBe("tamNganThangTamXa");
      expect(f?.lesson).toBe(38);
      expect(f?.summary).toContain("Vũ khí tầm ngắn thắng tầm xa");
    });

    it("không nhận khi đối phương không có Pháo", () => {
      const noCannonFen = "r2akab2/4a4/1R7/3N5/9/1N7/9/9/9/1R2K4 w - - 0 1";
      const { before, after } = setup(noCannonFen, knightStrike);
      expect(detectTamNganThangTamXa(before, knightStrike, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectTamXaThangTamNgan (Kỳ lý #39 - Vũ khí tầm xa thắng tầm ngắn)", () => {
    const fen = "r2akab2/4a4/1R7/9/1C7/9/9/2C1n1n2/9/1R2K4 w - - 0 1";
    const cannonStrike = mv(7, 2, 3, 2);

    it("nhận diện Xe Song Pháo phát huy hỏa lực tầm xa áp đảo Song Mã", () => {
      const { before, after } = setup(fen, cannonStrike);
      const f = detectTamXaThangTamNgan(before, cannonStrike, after, { loss: 0 });
      expect(f?.tactic).toBe("tamXaThangTamNgan");
      expect(f?.lesson).toBe(39);
      expect(f?.summary).toContain("Vũ khí tầm xa thắng tầm ngắn");
    });

    it("không nhận khi đối phương không có Mã", () => {
      const noKnightFen = "r2akab2/4a4/1R7/9/1C7/9/9/2C6/9/1R2K4 w - - 0 1";
      const { before, after } = setup(noKnightFen, cannonStrike);
      expect(detectTamXaThangTamNgan(before, cannonStrike, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectMotXeDoiHai (Kỳ lý #40 - Một Xe đổi hai)", () => {
    const fen = "3akab2/4a4/9/9/9/9/9/1r7/9/N3K3R w - - 0 1";
    const knightTakesRook = mv(9, 0, 7, 1);

    it("nhận diện cuộc trao đổi chiến lược một Xe lấy hai quân nhẹ", () => {
      const { before, after } = setup(fen, knightTakesRook);
      const f = detectMotXeDoiHai(before, knightTakesRook, after, { loss: 0 });
      expect(f?.tactic).toBe("motXeDoiHai");
      expect(f?.lesson).toBe(40);
      expect(f?.summary).toContain("Một Xe đổi hai");
    });

    it("không nhận khi số lượng Xe hai bên bằng nhau", () => {
      const equalRooksFen = "3akab2/4a4/9/9/9/9/9/1r7/9/N3K4 w - - 0 1";
      const { before, after } = setup(equalRooksFen, knightTakesRook);
      expect(detectMotXeDoiHai(before, knightTakesRook, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectMotXeDoiBa (Kỳ lý #41 - Một Xe đổi ba)", () => {
    const fen = "r2akab2/4a4/9/9/4p4/2N6/9/1C5C1/9/4K4 w - - 0 1";
    const knightEatPawn = mv(5, 2, 4, 4);

    it("nhận diện thế cờ một Xe đổi ba quân ưu thế vật chất áp đảo", () => {
      const { before, after } = setup(fen, knightEatPawn);
      const f = detectMotXeDoiBa(before, knightEatPawn, after, { loss: 0 });
      expect(f?.tactic).toBe("motXeDoiBa");
      expect(f?.lesson).toBe(41);
      expect(f?.summary).toContain("Một Xe đổi ba");
    });

    it("không nhận khi số lượng quân nhẹ hai bên ngang nhau", () => {
      const equalMinorsFen = "r2akab2/4a4/9/9/4p4/2N6/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(equalMinorsFen, knightEatPawn);
      expect(detectMotXeDoiBa(before, knightEatPawn, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectMaVanNhuLong (Kỳ lý #42 - Mã vận như long)", () => {
    const fen = "3akab2/4a4/9/9/9/2N6/9/9/9/4K4 w - - 0 1";
    const hoiMa = mv(5, 2, 7, 3);

    it("nhận diện hồi mã kim thương nén chặt không gian kiểm soát bát phương", () => {
      const { before, after } = setup(fen, hoiMa);
      const f = detectMaVanNhuLong(before, hoiMa, after, { loss: 0 });
      expect(f?.tactic).toBe("maVanNhuLong");
      expect(f?.lesson).toBe(42);
      expect(f?.summary).toContain("Mã vận như long");
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

  describe("detectPheTotPhanCong (Kỳ lý #46 - Phế Tốt phản công)", () => {
    const fen = "3akab2/4a4/2r6/9/9/2P6/2R6/9/9/4K4 w - - 0 1";
    const sacrificePawn = mv(5, 2, 4, 2);

    it("nhận diện phế Tốt mở lộ cho chủ lực phát động phản kích", () => {
      const { before, after } = setup(fen, sacrificePawn);
      const f = detectPheTotPhanCong(before, sacrificePawn, after, { loss: 0 });
      expect(f?.tactic).toBe("pheTotPhanCong");
      expect(f?.lesson).toBe(46);
      expect(f?.summary).toContain("Phế Tốt phản công");
    });

    it("không nhận khi nước đi không phải là Tốt", () => {
      const rookMove = mv(6, 2, 6, 1);
      const { before, after } = setup(fen, rookMove);
      expect(detectPheTotPhanCong(before, rookMove, after, { loss: 0 })).toBeNull();
    });
  });

  describe("detectChienThuatMuuBinh (Kỳ lý #47 - Chiến thuật mưu Binh)", () => {
    it("nhận diện ăn sạch Tốt vỏ bọc chưa qua sông, không bị bắt lại", () => {
      const fen = "3akab2/4a4/9/2p6/9/9/9/9/9/2R1K4 w - - 0 1";
      const capturePawn = mv(9, 2, 3, 2);
      const { before, after } = setup(fen, capturePawn);
      const f = detectChienThuatMuuBinh(before, capturePawn, after, { loss: 0 });
      expect(f?.tactic).toBe("chienThuatMuuBinh");
      expect(f?.lesson).toBe(47);
      expect(f?.summary).toContain("Xe ăn Tốt");
      expect(f?.summary).toContain("không bị bắt lại");
    });

    it("không nhận khi ăn Tốt đã qua sông (ăn quân thường, không phải mưu Binh)", () => {
      const fen = "3akab2/4a4/9/9/9/9/9/2p6/9/2R1K4 w - - 0 1";
      const capturePawn = mv(9, 2, 7, 2);
      const { before, after } = setup(fen, capturePawn);
      expect(detectChienThuatMuuBinh(before, capturePawn, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi ăn quân không phải là Tốt", () => {
      const advisorFen = "3akab2/4a4/2r6/9/9/9/9/9/9/2R1K4 w - - 0 1";
      const rookCaptureRook = mv(9, 2, 2, 2);
      const { before, after } = setup(advisorFen, rookCaptureRook);
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
});
