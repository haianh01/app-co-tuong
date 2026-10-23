import { describe, expect, it } from "vitest";
import { isLegal, parseFen, play, sq, type Board, type Move } from "./engine";
import { explainText, personaFacts } from "./explain";
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

    it("nhận diện quân làm ngòi cho Pháo chiếu", () => {
      const { before, after } = setup(fen, mount);
      const f = detectCannonMount(before, mount, after, { loss: 0 });
      expect(f?.tactic).toBe("giaPhao");
      expect(f?.summary).toContain("chiếu Tướng");
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

    it("nhận diện Song Xe áp thành khi đối phương khuyết Sĩ", () => {
      const { before, after } = setup(fen, rookAttack);
      const f = detectKhuyetSiSongXe(before, rookAttack, after, { loss: 0 });
      expect(f?.tactic).toBe("khuyetSiSongXe");
      expect(f?.lesson).toBe(1);
      expect(f?.lessonTitle).toContain("Khuyết Sĩ Kỵ Song Xe");
      expect(f?.videoUrl).toContain("n3SbgwL1GAI");
      expect(f?.summary).toContain("Khuyết Sĩ kỵ Song Xe");
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

    it("nhận diện Mã nhảy vào yếu huyệt Ngọa Tào hàng 2 dọa sát", () => {
      const { before, after } = setup(fen, knightMove);
      const f = detectNgoaTaoKnight(before, knightMove, after, { loss: 0 });
      expect(f?.tactic).toBe("ngoaTaoMa");
      expect(f?.summary).toContain("Mã Ngọa Tào");
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

    it("nhận diện Pháo cắm sâu xuống tuyến đáy đối phương kiềm tỏa phòng tuyến", () => {
      const { before, after } = setup(fen, deepCannonMove);
      const f = detectDeepCannonBottom(before, deepCannonMove, after, { loss: 0 });
      expect(f?.tactic).toBe("phaoTramDay");
      expect(f?.summary).toContain("Pháo trầm đáy");
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
      expect(f?.summary).toContain("Chiến thuật đoạt trung binh");
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

    it("nhận diện tạo lập thế Không Tâm Pháo ngắm thẳng cung Tướng không có che chắn", () => {
      const { before, after } = setup(fen, unmaskCannon);
      const f = detectKhongTamPhao(before, unmaskCannon, after, { loss: 0 });
      expect(f?.tactic).toBe("khongTamPhao");
      expect(f?.lesson).toBe(12);
      expect(f?.summary).toContain("Không tâm pháo");
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

    it("nhận diện tạo lập thế Thiên Địa Pháo: 1 Pháo trung lộ, 1 Pháo cắm đáy", () => {
      const { before, after } = setup(fen, toBottom);
      const f = detectThienDiaPhao(before, toBottom, after, { loss: 0 });
      expect(f?.tactic).toBe("thienDiaPhao");
      expect(f?.lesson).toBe(14);
      expect(f?.summary).toContain("Thiên Địa Pháo");
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

    it("nhận diện cắm Pháo xuống đáy góc khóa Xe đối phương", () => {
      const { before, after } = setup(fen, toCorner);
      const f = detectPhaoDayKhoaXe(before, toCorner, after, { loss: 0 });
      expect(f?.tactic).toBe("phaoDayKhoaXe");
      expect(f?.lesson).toBe(15);
      expect(f?.summary).toContain("Pháo đáy khóa Xe");
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

    it("nhận diện tập trung Song Xe Pháo ở lộ sườn dội hỏa lực tổng lực", () => {
      const { before, after } = setup(fen, attackFlank);
      const f = detectOanhTacLoSuon(before, attackFlank, after, { loss: 0 });
      expect(f?.tactic).toBe("oanhTacLoSuon");
      expect(f?.lesson).toBe(16);
      expect(f?.summary).toContain("Oanh tạc lộ sườn");
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

    it("nhận diện Xe đột kích vào tuyến áp đáy (hàng 2 cung Tướng)", () => {
      const { before, after } = setup(fen, toApDay);
      const f = detectManhCongTuyenApDay(before, toApDay, after, { loss: 0 });
      expect(f?.tactic).toBe("manhCongTuyenApDay");
      expect(f?.lesson).toBe(17);
      expect(f?.summary).toContain("Mạnh công tuyến áp đáy");
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

    it("nhận diện Tốt qua sông lộ 3 đè thẳng vào Mã đối phương", () => {
      const fen = "3akab2/4a4/2n6/9/2P6/9/9/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, pawnCross);
      const f = detectTranhDoatLo3Lo7(before, pawnCross, after, { loss: 0 });
      expect(f?.tactic).toBe("tranhDoatLo3Lo7");
      expect(f?.lesson).toBe(21);
      expect(f?.summary).toContain("Tranh đoạt lộ 3 và lộ 7");
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

    it("nhận diện đôi Xe cùng thâm nhập sâu vào trận địa đối phương", () => {
      const { before, after } = setup(fen, advanceRook);
      const f = detectSongXePhoiHop(before, advanceRook, after, { loss: 0 });
      expect(f?.tactic).toBe("songXePhoiHop");
      expect(f?.lesson).toBe(25);
      expect(f?.summary).toContain("Song Xe phối hợp");
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

    it("nhận diện ba quân Xe Mã Pháo cùng quy tụ một cánh (tam tử quy biên)", () => {
      const { before, after } = setup(fen, cannonJoin);
      const f = detectXeMaPhaoTamTu(before, cannonJoin, after, { loss: 0 });
      expect(f?.tactic).toBe("xeMaPhaoTamTu");
      expect(f?.lesson).toBe(28);
      expect(f?.summary).toContain("Xe Mã Pháo tam tử");
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

    it("nhận diện Xe cùng đôi Mã hiệp đồng tác chiến qua sông", () => {
      const { before, after } = setup(fen, knightAdvance);
      const f = detectXeSongMa(before, knightAdvance, after, { loss: 0 });
      expect(f?.tactic).toBe("xeSongMa");
      expect(f?.lesson).toBe(29);
      expect(f?.summary).toContain("Xe Song Mã");
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

    it("nhận diện Xe Song Pháo cùng tập kết dồn hỏa lực ở một cánh", () => {
      const { before, after } = setup(fen, cannonAdvance);
      const f = detectXeSongPhao(before, cannonAdvance, after, { loss: 0 });
      expect(f?.tactic).toBe("xeSongPhao");
      expect(f?.lesson).toBe(30);
      expect(f?.summary).toContain("Xe Song Pháo");
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

    it("nhận diện Xe Mã phối hợp chém Sĩ phá vỡ trận hình đối phương", () => {
      const { before, after } = setup(fen, rookChopAdvisor);
      const f = detectXeMaLanhChieu(before, rookChopAdvisor, after, { loss: 0 });
      expect(f?.tactic).toBe("xeMaLanhChieu");
      expect(f?.lesson).toBe(31);
      expect(f?.summary).toContain("Xe Mã lãnh chiêu");
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
    it("nhận diện dọa ăn Xe thâm nhập đã hết đường thoát (mọi ô thoát đều bị khống chế)", () => {
      // Xe Đen kẹt ở góc: ăn Mã (8,0) thì Mã (6,1) ăn lại, ăn Tượng (9,2) thì Tượng (7,4) ăn lại, ra (9,1) thì Mã (7,2) ăn.
      const fen = "3akab2/4a4/9/9/9/3C5/1N7/2N1B4/N3K4/r1B6 w - - 0 1";
      const cannonPin = mv(5, 3, 5, 0);
      const { before, after } = setup(fen, cannonPin);
      const f = detectVayXe(before, cannonPin, after, { loss: 0 });
      expect(f?.tactic).toBe("vayXe");
      expect(f?.lesson).toBe(34);
      expect(f?.summary).toContain("Vây Xe đối phương");
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
    it("nhận diện dọa ăn Pháo thâm nhập đã hết đường thoát", () => {
      const fen = "3akab2/4a4/9/9/9/2N6/9/9/N3K4/cN7 w - - 0 1";
      const attackCannon = mv(5, 2, 7, 1);
      const { before, after } = setup(fen, attackCannon);
      const f = detectVayPhao(before, attackCannon, after, { loss: 0 });
      expect(f?.tactic).toBe("vayPhao");
      expect(f?.lesson).toBe(35);
      expect(f?.summary).toContain("Vây Pháo cô lập");
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

    it("nhận diện dồn ép bao vây Mã biên đối phương", () => {
      const { before, after } = setup(fen, attackEdgeKnight);
      const f = detectMaPhungBienTatVong(before, attackEdgeKnight, after, { loss: 0 });
      expect(f?.tactic).toBe("maPhungBienTatVong");
      expect(f?.lesson).toBe(36);
      expect(f?.summary).toContain("Mã phùng biên tất vong");
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

    it("nhận diện dồn ép bao vây Quải Giác Mã đối phương", () => {
      const { before, after } = setup(fen, attackCornerKnight);
      const f = detectVayMaGiac(before, attackCornerKnight, after, { loss: 0 });
      expect(f?.tactic).toBe("vayMaGiac");
      expect(f?.lesson).toBe(37);
      expect(f?.summary).toContain("Vây Mã Giác");
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
      expect(f?.summary).toContain("Chiến thuật mưu Binh");
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

    it("personaFacts giữ tối đa 2 nguyên lý Triệu mỗi nước", () => {
      const fen = "3aka3/9/9/9/9/9/9/3NC4/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, mv(7, 3, 5, 4));
      const zhao = personaFacts(before, mv(7, 3, 5, 4), after, { loss: 0 }).filter((f) => f.kind === "zhaoMiddlegame");
      expect(zhao.length).toBeGreaterThan(0);
      expect(zhao.length).toBeLessThanOrEqual(2);
    });
  });
});
