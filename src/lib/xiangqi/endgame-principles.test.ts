import { describe, expect, it } from "vitest";
import { initialPosition, isLegal, parseFen, play, sq, type Board, type Move } from "./engine";
import { explainText } from "./explain";
import { minorValues, screenCount } from "./piece-value";
import {
  detectBangXepHangBinhChung,
  detectBinhChungHuuLoi,
  detectBinhQuyThanToc,
  detectBinhTanSiTuong,
  detectDiemToiHanBinhLuc,
  detectEndgameTrade,
  detectGuardFormation,
  detectHighPawn,
  detectKhuyetSiKyGi,
  detectKhuyetTuongKyPhao,
  detectCoTanPhaoHoan,
  detectDonTotKhongCheTuyen,
  detectMaThangPhao,
  detectChienThuatKiemChe,
  detectChienThuatNuocCho,
  detectChienThuatVayKhon,
  detectKyThuatDonToa,
  detectKyThuatDanhChan,
  detectChienThuatCauHoa,
  detectChienThuatSamSet,
  detectXePhaoHopCong,
  detectXeMaLanhChieu,
  detectXeChotPhaSiTuong,
  detectSongMaSongPhao,
  detectSongMaPhaoDoiMaSongPhao,
  detectMaPhaoDoiMaPhao,
  detectSongPhaoDoiSongMa,
  detectMaTotDoiPhaoTot,
  detectTamAnhChienLuBo,
  detectMaTotDayThangDonSiTuong,
  detectHaiDeLaoNguyet,
  detectCanKhonDaiNaDi,
  detectXeMaDoiXeSongTuong,
  detectThatTinhTuHoi,
  detectKhauDanHangLong,
  detectDaMaThaoDien,
  detectThienLyDocHanh,
  detectChienThuatVaTamLy,
  detectBanChatTanCuoc,
  detectKingActivity,
  detectKingBoxing,
  detectLaoBinhKhongChet,
  detectLoSuonApDay,
  detectMaHoatChienThang,
  detectMinorTrade,
  detectMuuBinhCoXe,
  detectMuuBinhKhongXe,
  detectNguyenTacChiemTrung,
  detectOldPawn,
  detectPawnForGuard,
  detectPhaSiTuongCoXe,
  detectPhaSiTuongKhongXe,
  detectPhanLoaiTanCuoc,
  detectSiTuongPhongAn,
  detectTaiSaoHocTanCuoc,
  detectTuongLinhHoat,
  detectWaitingMove,
  endgamePrincipleFacts,
  isEndgame,
} from "./endgame-principles";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });

/** Thế cờ + nước đi, kiểm tra nước đi hợp lệ để test không dựa trên thế cờ phi luật. */
function setup(fen: string, move: Move): { before: Board; after: Board } {
  const pos = parseFen(fen);
  expect(isLegal(pos, move)).toBe(true);
  return { before: pos.board, after: play(pos.board, move) };
}

describe("endgame-principles: nguyên lý tàn cuộc", () => {
  describe("Đổi quân về tàn cuộc lý thuyết", () => {
    it("khen đổi Xe đưa về Đơn Xe thắng Đơn Pháo (đối phương thiếu Sĩ Tượng)", () => {
      // Đỏ 2 Xe, Đen Xe Pháo + 1 Sĩ 1 Tượng. Xe đỏ ăn Xe d6, Pháo đen d9 ăn lại qua ngòi Sĩ d7.
      const fen = "3ck4/9/3ab4/9/3r5/9/9/3R5/8R/4K4 w - - 0 1";
      const trade = mv(7, 3, 4, 3);
      const { before, after } = setup(fen, trade);
      const f = detectEndgameTrade(before, trade, after, { loss: 0, pv: [mv(0, 3, 4, 3)] });
      expect(f?.principle).toBe("doiVeTanCuocThang");
      expect(f?.endgame).toBe("Đơn Xe thắng Đơn Pháo");
    });

    it("phê bình đổi Xe khi đang thắng, đưa về Đơn Xe hòa Sĩ Tượng toàn", () => {
      // Đỏ 2 Xe đánh Xe đen; Đen đủ Sĩ Tượng. Đỏ đổi Xe, Tượng đen e7 ăn lại.
      const fen = "2baka3/9/4b4/9/2r6/9/9/2R6/8R/4K4 w - - 0 1";
      const trade = mv(7, 2, 4, 2);
      const { before, after } = setup(fen, trade);
      const f = detectEndgameTrade(before, trade, after, {
        loss: 250,
        evalBefore: { score: 320 },
        pv: [mv(2, 4, 4, 2)],
      });
      expect(f?.principle).toBe("doiQuanMatThang");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("Đơn Xe hòa Sĩ Tượng toàn");
    });

    it("khen bên kém quân đổi về tàn cuộc hòa (giải hòa)", () => {
      // Đỏ Xe + Sĩ Tượng toàn đối Xe Pháo + Sĩ Tượng. Xe đỏ ăn Pháo, Xe đen ăn lại: còn Xe đen đối Sĩ Tượng toàn.
      const fen = "2baka3/9/4b4/6r2/9/R5c2/9/4B4/9/2BAKA3 w - - 0 1";
      const trade = mv(5, 0, 5, 6);
      const { before, after } = setup(fen, trade);
      const f = detectEndgameTrade(before, trade, after, {
        loss: 0,
        evalBefore: { score: -250 },
        pv: [mv(3, 6, 5, 6)],
      });
      expect(f?.principle).toBe("giaiHoa");
      expect(f?.endgame).toBe("Đơn Xe hòa Sĩ Tượng toàn");
    });

    it("không kết luận khi đối phương không ăn lại (thế sau không phải tàn cuộc lý thuyết)", () => {
      const fen = "3ck4/9/3ab4/9/3r5/9/9/3R5/8R/4K4 w - - 0 1";
      const trade = mv(7, 3, 4, 3);
      const { before, after } = setup(fen, trade);
      expect(detectEndgameTrade(before, trade, after, { loss: 0, pv: [mv(0, 4, 0, 5)] })).toBeNull();
    });
  });

  describe("Tốt trong tàn cuộc", () => {
    it("phê bình Tốt xuống đáy biến Pháo Tốt đang thắng thành Pháo Tốt đáy hòa", () => {
      // Pháo Tốt có Sĩ Tượng làm ngòi; engine chấm thế trước là thắng (+300). Tốt xuống đáy: Pikafish hòa 29/30.
      const fen = "2bakab2/1P7/9/9/9/4C4/9/9/9/2BAKAB2 w - - 0 1";
      const down = mv(1, 1, 0, 1);
      const { before, after } = setup(fen, down);
      const f = detectOldPawn(before, down, after, { loss: 250, evalBefore: { score: 300 } });
      expect(f?.principle).toBe("totGia");
      expect(f?.tone).toBe("critique");
      expect(f?.endgame).toBe("Pháo Tốt đáy hòa Sĩ Tượng toàn");
    });

    it("không phê bình Tốt xuống đáy khi engine không chấm lỗi và kết quả lý thuyết không đổi", () => {
      // Đỏ còn Xe: Tốt xuống đáy chỉ là nước bình thường.
      const fen = "2baka3/1P7/4b4/9/9/5R3/9/9/9/4K4 w - - 0 1";
      const down = mv(1, 1, 0, 1);
      const { before, after } = setup(fen, down);
      expect(detectOldPawn(before, down, after, { loss: 10, evalBefore: { score: 300 } })).toBeNull();
    });

    it("khen Tốt cao bình vào áp cung, chưa xuống đáy", () => {
      const fen = "3aka3/9/2P6/9/9/c8/6N2/9/9/5K3 w - - 0 1";
      const step = mv(2, 2, 2, 3);
      const { before, after } = setup(fen, step);
      const f = detectHighPawn(before, step, after, { loss: 0 });
      expect(f?.principle).toBe("totApCung");
    });

    it("khen Tốt đổi Sĩ phá phòng tuyến", () => {
      const fen = "3aka3/3P5/9/7n1/9/9/6N2/4C4/9/5K3 w - - 0 1";
      const take = mv(1, 3, 0, 3);
      const { before, after } = setup(fen, take);
      const f = detectPawnForGuard(before, take, after, { loss: 0 });
      expect(f?.principle).toBe("totDoiSi");
      expect(f?.summary).toContain("Tốt đổi Sĩ");
    });
  });

  describe("Tướng và khống chế", () => {
    it("khen Tướng ra lộ khóa cung đối phương bằng luật lộ mặt Tướng", () => {
      const fen = "4k4/9/9/4P4/9/2N6/p8/9/9/4K4 w - - 0 1";
      const kingOut = mv(9, 4, 9, 5);
      const { before, after } = setup(fen, kingOut);
      const f = detectKingActivity(before, kingOut, after, { loss: 0 });
      expect(f?.principle).toBe("tuongTroCong");
      expect(f?.summary).toContain("lộ 4");
    });

    it("không tính Tướng né sang cột bị chắn (không khóa thêm ô nào)", () => {
      // Tốt đỏ f6 chắn cột f: Tướng sang f0 không khóa được ô nào trong cung đen.
      const fen = "4k4/9/9/4PP3/9/2N6/p8/9/9/4K4 w - - 0 1";
      const kingOut = mv(9, 4, 9, 5);
      const { before, after } = setup(fen, kingOut);
      expect(detectKingActivity(before, kingOut, after, { loss: 0 })).toBeNull();
    });

    it("khen Xe khóa hàng, Tướng trần đối phương chỉ còn 1 đường đi", () => {
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      const f = detectKingBoxing(before, box, after, { loss: 0 });
      expect(f?.principle).toBe("boTuong");
      expect(f?.summary).toContain("1 đường đi");
    });

    it("khen nước chờ bằng Sĩ khi đang thắng và đối phương gần hết nước", () => {
      const fen = "4k4/R8/9/9/9/9/9/9/4A4/3K5 w - - 0 1";
      const wait = mv(8, 4, 9, 5);
      const { before, after } = setup(fen, wait);
      const f = detectWaitingMove(before, wait, after, { loss: 0, evalBefore: { score: 1000 } });
      expect(f?.principle).toBe("nuocCho");
      expect(f?.summary).toContain("1 nước");
    });

    it("không coi là nước chờ khi chưa thắng thế", () => {
      const fen = "4k4/R8/9/9/9/9/9/9/4A4/3K5 w - - 0 1";
      const wait = mv(8, 4, 9, 5);
      const { before, after } = setup(fen, wait);
      expect(detectWaitingMove(before, wait, after, { loss: 0, evalBefore: { score: 30 } })).toBeNull();
    });
  });

  describe("Mã / Pháo theo số ngòi trên bàn", () => {
    it("đầu ván đủ ngòi: giữ giá trị chuẩn Pháo 450, Mã 400", () => {
      const b = initialPosition().board;
      expect(screenCount(b)).toBe(18);
      expect(minorValues(b)).toEqual({ n: 400, c: 450 });
    });

    it("hết Sĩ Tượng, chỉ còn 1 Tốt: Mã đáng giá hơn Pháo", () => {
      const b = parseFen("4k4/9/9/9/2P6/2C6/4N4/9/9/4K4 w - - 0 1").board;
      const v = minorValues(b);
      expect(v.n).toBeGreaterThan(v.c);
    });

    // Đỏ: Pháo c4 có ngòi là Tốt c5, ăn Mã đen c7; Mã đen b9 ăn lại. Không còn Sĩ Tượng, chỉ 1 Tốt.
    const fen = "1n2k4/9/2n6/9/2P6/2C6/4N4/9/9/4K4 w - - 0 1";
    const trade = mv(5, 2, 2, 2);
    const recapture = mv(0, 1, 2, 2);

    it("khen đổi Pháo lấy Mã khi bàn thưa ngòi", () => {
      const { before, after } = setup(fen, trade);
      const f = detectMinorTrade(before, trade, after, { loss: 0, pv: [recapture] });
      expect(f?.principle).toBe("doiPhaoLayMa");
      expect(f?.summary).toContain("1 quân làm ngòi");
    });

    it("không coi là đổi khi đối phương không ăn lại", () => {
      const { before, after } = setup(fen, trade);
      expect(detectMinorTrade(before, trade, after, { loss: 0, pv: [mv(0, 4, 1, 4)] })).toBeNull();
    });

    it("chê đổi Mã lấy Pháo khi bàn thưa ngòi và engine chấm lỗi", () => {
      // Đỏ: Mã e3 ăn Pháo đen d5; Xe đen d9 ăn lại. Không còn Sĩ Tượng, chỉ 1 Tốt.
      const fen2 = "3rk4/9/9/9/3cP4/9/4N4/2C6/9/4K4 w - - 0 1";
      const take = mv(6, 4, 4, 3);
      const { before, after } = setup(fen2, take);
      const f = detectMinorTrade(before, take, after, { loss: 120, pv: [mv(0, 3, 4, 3)] });
      expect(f?.principle).toBe("doiMaLayPhao");
      expect(f?.tone).toBe("critique");
    });

    it("bàn còn đủ Sĩ Tượng thì không nói gì về đổi Mã / Pháo", () => {
      const fen3 = "1nbakab2/9/2n6/9/2P6/2C6/4N4/9/9/2BAKAB2 w - - 0 1";
      const { before, after } = setup(fen3, trade);
      expect(detectMinorTrade(before, trade, after, { loss: 0, pv: [recapture] })).toBeNull();
    });
  });

  describe("Phòng thủ tàn cuộc", () => {
    it("khen bên kém quân đưa Sĩ về liên hoàn", () => {
      const fen = "3ak4/9/5a3/4P4/9/8R/9/9/9/4K4 b - - 0 1";
      const link = mv(2, 5, 1, 4);
      const { before, after } = setup(fen, link);
      const f = detectGuardFormation(before, link, after, { loss: 0, evalBefore: { score: -500 } });
      expect(f?.principle).toBe("giuSiTuong");
      expect(f?.side).toBe("b");
    });
  });

  describe("48 Kỳ lý tàn cuộc Triệu Hâm Hâm (Bài 1 - 36)", () => {
    describe("Bài 1: Tại sao cần học tàn cuộc (taiSaoHocTanCuoc)", () => {
      it("khen Mã nhảy vào vị trí thoáng, phát huy tối đa công năng trong tàn cuộc", () => {
        const fen = "4k4/9/9/9/9/9/9/9/9/1N1K5 w - - 0 1";
        const leap = mv(9, 1, 7, 2);
        const { before, after } = setup(fen, leap);
        const f = detectTaiSaoHocTanCuoc(before, leap, after, { loss: 0 });
        expect(f?.principle).toBe("taiSaoHocTanCuoc");
        expect(f?.lesson).toBe(1);
        expect(f?.quote?.at).toBe("01:20");
        expect(f?.videoUrl).toContain("-M048nOYU0I?t=80");
      });

      it("không khen khi nước đi không an toàn hoặc bị lỗi engine", () => {
        const fen = "4k4/9/9/9/9/9/9/9/9/1N1K5 w - - 0 1";
        const leap = mv(9, 1, 7, 2);
        const { before, after } = setup(fen, leap);
        expect(detectTaiSaoHocTanCuoc(before, leap, after, { loss: 100 })).toBeNull();
      });
    });

    describe("Bài 2: Phân loại tàn cục (phanLoaiTanCuoc)", () => {
      it("khen chuyển hóa từ tàn cuộc thực chiến phức tạp về định thức tàn cuộc thực dụng", () => {
        const fen = "3ak4/9/4N4/9/9/9/9/9/9/3K5 w - - 0 1";
        const eatAdvisor = mv(2, 4, 0, 3);
        const { before, after } = setup(fen, eatAdvisor);
        const f = detectPhanLoaiTanCuoc(before, eatAdvisor, after, { loss: 0 });
        expect(f?.principle).toBe("phanLoaiTanCuoc");
        expect(f?.lesson).toBe(2);
        expect(f?.quote?.at).toBe("00:26");
        expect(f?.videoUrl).toContain("s8wOya9HGVM?t=26");
        expect(f?.endgame).toBe("Đơn Mã thắng Đơn Tướng");
      });

      it("không kích hoạt nếu trước nước đi đã khớp tàn cuộc lý thuyết", () => {
        const fen = "4k4/9/3N5/9/9/9/9/9/9/3K5 w - - 0 1";
        const leap = mv(2, 3, 4, 4);
        const { before, after } = setup(fen, leap);
        expect(detectPhanLoaiTanCuoc(before, leap, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 3: Điểm tới hạn của binh lực (diemToiHanBinhLuc)", () => {
      it("khen bên công có đơn quân mạnh và 2 Tốt qua sông áp sát Sĩ Tượng toàn", () => {
        const fen = "2bakab2/9/9/3P1P3/9/9/4N4/9/9/3K5 w - - 0 1";
        const advancePawn = mv(3, 3, 2, 3);
        const { before, after } = setup(fen, advancePawn);
        const f = detectDiemToiHanBinhLuc(before, advancePawn, after, { loss: 0 });
        expect(f?.principle).toBe("diemToiHanBinhLuc");
        expect(f?.lesson).toBe(3);
        expect(f?.quote?.at).toBe("01:01");
        expect(f?.videoUrl).toContain("HriX5ETJ52A?t=61");
      });

      it("không kích hoạt khi chưa có đủ 2 Tốt qua sông", () => {
        const fen = "2bakab2/9/9/3P5/9/9/4N4/9/9/3K5 w - - 0 1";
        const advancePawn = mv(3, 3, 2, 3);
        const { before, after } = setup(fen, advancePawn);
        expect(detectDiemToiHanBinhLuc(before, advancePawn, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 4: Binh và tàn Sĩ Tượng (binhTanSiTuong)", () => {
      it("khen Mã thoái lui chuyển hướng độc hiểm khi đối phương khuyết Sĩ Tượng", () => {
        const fen = "3ak4/9/3P5/3N5/9/9/9/9/9/3K5 w - - 0 1";
        const retreatKnight = mv(3, 3, 5, 2);
        const { before, after } = setup(fen, retreatKnight);
        const f = detectBinhTanSiTuong(before, retreatKnight, after, { loss: 0 });
        expect(f?.principle).toBe("binhTanSiTuong");
        expect(f?.lesson).toBe(4);
        expect(f?.quote?.at).toBe("00:47");
        expect(f?.videoUrl).toContain("tepNEiE7FJU?t=47");
      });

      it("không kích hoạt khi đối phương vẫn còn đủ 4 Sĩ Tượng", () => {
        const fen = "2bakab2/9/3P5/3N5/9/9/9/9/9/3K5 w - - 0 1";
        const retreatKnight = mv(3, 3, 5, 2);
        const { before, after } = setup(fen, retreatKnight);
        expect(detectBinhTanSiTuong(before, retreatKnight, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 5: Mưu đoạt Chốt - Tàn cuộc có Xe (muuBinhCoXe)", () => {
      it("khen Xe quét tiêu diệt Tốt đối phương trong tàn cuộc có Xe", () => {
        const fen = "4k4/9/9/3p5/3R5/9/9/9/9/3K5 w - - 0 1";
        const eatPawn = mv(4, 3, 3, 3);
        const { before, after } = setup(fen, eatPawn);
        const f = detectMuuBinhCoXe(before, eatPawn, after, { loss: 0 });
        expect(f?.principle).toBe("muuBinhCoXe");
        expect(f?.lesson).toBe(5);
        expect(f?.quote?.at).toBe("00:42");
        expect(f?.videoUrl).toContain("wBOQuix_tpc?t=42");
      });

      it("không kích hoạt khi nước ăn Tốt bị engine chấm lỗi", () => {
        const fen = "4k4/9/9/3p5/3R5/9/9/9/9/3K5 w - - 0 1";
        const eatPawn = mv(4, 3, 3, 3);
        const { before, after } = setup(fen, eatPawn);
        expect(detectMuuBinhCoXe(before, eatPawn, after, { loss: 150 })).toBeNull();
      });
    });

    describe("Bài 6: Mưu đoạt Chốt - Tàn cuộc không có Xe (muuBinhKhongXe)", () => {
      it("khen Pháo ăn Tốt đối phương trong tàn cuộc không có Xe", () => {
        const fen = "4k4/9/3p5/3P5/3C5/9/9/9/9/3K5 w - - 0 1";
        const eatPawn = mv(4, 3, 2, 3);
        const { before, after } = setup(fen, eatPawn);
        const f = detectMuuBinhKhongXe(before, eatPawn, after, { loss: 0 });
        expect(f?.principle).toBe("muuBinhKhongXe");
        expect(f?.lesson).toBe(6);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("XXpTFNBdJrM?t=4");
      });

      it("không kích hoạt nếu bàn cờ vẫn còn quân Xe", () => {
        const fen = "4k4/9/3p5/3P5/3C4r/9/9/9/9/3K5 w - - 0 1";
        const eatPawn = mv(4, 3, 2, 3);
        const { before, after } = setup(fen, eatPawn);
        expect(detectMuuBinhKhongXe(before, eatPawn, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 7: Tuyệt kỹ phá Sĩ Tượng - Tàn cuộc có Xe (phaSiTuongCoXe)", () => {
      it("khen Xe ăn Sĩ hoặc khoét sâu khi đối phương khuyết Sĩ Tượng", () => {
        const fen = "3ak4/9/9/9/9/9/4N4/3R5/9/3K5 w - - 0 1";
        const eatAdvisor = mv(7, 3, 0, 3);
        const { before, after } = setup(fen, eatAdvisor);
        const f = detectPhaSiTuongCoXe(before, eatAdvisor, after, { loss: 0 });
        expect(f?.principle).toBe("phaSiTuongCoXe");
        expect(f?.lesson).toBe(7);
        expect(f?.quote?.at).toBe("00:28");
        expect(f?.videoUrl).toContain("hFaP9upTB-w?t=28");
      });

      it("không kích hoạt khi đối phương đủ 4 Sĩ Tượng", () => {
        const fen = "2bakab2/9/9/9/9/9/4N4/3R5/9/3K5 w - - 0 1";
        const eatAdvisor = mv(7, 3, 0, 3);
        const { before, after } = setup(fen, eatAdvisor);
        expect(detectPhaSiTuongCoXe(before, eatAdvisor, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 8: Tuyệt kỹ phá Sĩ Tượng - Tàn cuộc không có Xe (phaSiTuongKhongXe)", () => {
      it("khen Song Tốt áp sát kiềm chế phá vỡ Sĩ Tượng đối phương", () => {
        const fen = "3ak4/9/3P1P3/9/9/9/9/9/9/3K5 w - - 0 1";
        const advancePawn = mv(2, 3, 1, 3);
        const { before, after } = setup(fen, advancePawn);
        const f = detectPhaSiTuongKhongXe(before, advancePawn, after, { loss: 0 });
        expect(f?.principle).toBe("phaSiTuongKhongXe");
        expect(f?.lesson).toBe(8);
        expect(f?.quote?.at).toBe("00:25");
        expect(f?.videoUrl).toContain("1wpanrf2XUc?t=25");
      });

      it("không kích hoạt khi bàn cờ vẫn còn Xe", () => {
        const fen = "3ak4/9/3P1P3/9/9/9/9/R8/9/3K5 w - - 0 1";
        const advancePawn = mv(2, 3, 1, 3);
        const { before, after } = setup(fen, advancePawn);
        expect(detectPhaSiTuongKhongXe(before, advancePawn, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 9: Nguyên tắc chiếm trung trong cờ tàn (nguyenTacChiemTrung)", () => {
      it("khen Xe hoặc quân lớn chiếm giữ lộ trung tâm then chốt", () => {
        const fen = "5k3/9/9/9/9/9/9/1R7/9/3K5 w - - 0 1";
        const occupyCenter = mv(7, 1, 7, 4);
        const { before, after } = setup(fen, occupyCenter);
        const f = detectNguyenTacChiemTrung(before, occupyCenter, after, { loss: 0 });
        expect(f?.principle).toBe("nguyenTacChiemTrung");
        expect(f?.lesson).toBe(9);
        expect(f?.quote?.at).toBe("01:26");
        expect(f?.videoUrl).toContain("w-0PzwsDpEM?t=86");
      });

      it("không kích hoạt nếu quân đã ở sẵn trên trung lộ", () => {
        const fen = "5k3/9/9/9/9/9/9/4R4/9/3K5 w - - 0 1";
        const advanceCenter = mv(7, 4, 1, 4);
        const { before, after } = setup(fen, advanceCenter);
        expect(detectNguyenTacChiemTrung(before, advanceCenter, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 10: Lộ sườn và tuyến sinh mệnh - Tuyến áp đáy (loSuonApDay)", () => {
      it("khen Tả Tốt Hữu Tướng khống chế hai lộ sườn và tuyến áp đáy", () => {
        const fen = "4k4/9/5P3/9/9/9/9/9/9/3K5 w - - 0 1";
        const lockRib = mv(2, 5, 1, 5);
        const { before, after } = setup(fen, lockRib);
        const f = detectLoSuonApDay(before, lockRib, after, { loss: 0 });
        expect(f?.principle).toBe("loSuonApDay");
        expect(f?.lesson).toBe(10);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("HVun2kG58LE?t=4");
      });

      it("không kích hoạt khi không có quân phối hợp ở lộ sườn đối diện", () => {
        const fen = "3k5/9/5P3/9/9/9/9/9/9/4K4 w - - 0 1";
        const lockRib = mv(2, 5, 1, 5);
        const { before, after } = setup(fen, lockRib);
        expect(detectLoSuonApDay(before, lockRib, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 11: Mã hoạt đem lại chiến thắng (maHoatChienThang)", () => {
      it("khen Mã nhảy vào vị trí Ngọa Tào điểm huyệt trong cờ tàn", () => {
        const fen = "4k4/9/9/2N6/9/9/9/9/9/3K5 w - - 0 1";
        const leapNgoaTao = mv(3, 2, 1, 1);
        const { before, after } = setup(fen, leapNgoaTao);
        const f = detectMaHoatChienThang(before, leapNgoaTao, after, { loss: 0 });
        expect(f?.principle).toBe("maHoatChienThang");
        expect(f?.lesson).toBe(11);
        expect(f?.quote?.at).toBe("02:54");
        expect(f?.videoUrl).toContain("tQkFXamj6s4?t=174");
      });

      it("không khen khi nước nhảy Mã bị lỗi engine", () => {
        const fen = "4k4/9/9/2N6/9/9/9/9/9/3K5 w - - 0 1";
        const leapNgoaTao = mv(3, 2, 1, 1);
        const { before, after } = setup(fen, leapNgoaTao);
        expect(detectMaHoatChienThang(before, leapNgoaTao, after, { loss: 100 })).toBeNull();
      });
    });

    describe("Bài 12: Bảng xếp hạng phối hợp binh chủng mạnh nhất trong cờ tàn (bangXepHangBinhChung)", () => {
      it("khen Mã Pháo hiệp đồng tác chiến, tạo ngòi và bổ trợ cho nhau", () => {
        const fen = "4k4/9/9/9/9/4C4/3N5/9/9/3K5 w - - 0 1";
        const coordinate = mv(6, 3, 4, 4);
        const { before, after } = setup(fen, coordinate);
        const f = detectBangXepHangBinhChung(before, coordinate, after, { loss: 0 });
        expect(f?.principle).toBe("bangXepHangBinhChung");
        expect(f?.lesson).toBe(12);
        expect(f?.quote?.at).toBe("01:07");
        expect(f?.videoUrl).toContain("20HzC6oMzNw?t=67");
      });

      it("không kích hoạt nếu phe đi chỉ có Mã mà không có Pháo", () => {
        const fen = "4k4/9/9/9/9/9/3N5/9/9/3K5 w - - 0 1";
        const leap = mv(6, 3, 4, 4);
        const { before, after } = setup(fen, leap);
        expect(detectBangXepHangBinhChung(before, leap, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 13: Binh chủng hữu lợi - Mã Pháo mạnh hơn Song Pháo (binhChungHuuLoi)", () => {
      it("khen bên có Mã Pháo đối đầu với Song Pháo chiếm ưu thế binh chủng", () => {
        const fen = "4k4/9/2c3c2/9/4C4/9/3N5/9/9/3K5 w - - 0 1";
        const moveCannon = mv(4, 4, 4, 1);
        const { before, after } = setup(fen, moveCannon);
        const f = detectBinhChungHuuLoi(before, moveCannon, after, { loss: 0 });
        expect(f?.principle).toBe("binhChungHuuLoi");
        expect(f?.lesson).toBe(13);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("Mt7cOJyVw6w?t=5");
      });

      it("không kích hoạt nếu đối phương cũng có cả Mã lẫn Pháo", () => {
        const fen = "4k4/9/2c1n4/9/4C4/9/3N5/9/9/3K5 w - - 0 1";
        const moveCannon = mv(4, 4, 4, 1);
        const { before, after } = setup(fen, moveCannon);
        expect(detectBinhChungHuuLoi(before, moveCannon, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 14: Bí quyết chọn thời điểm tấn Tốt - Binh quý thần tốc (binhQuyThanToc)", () => {
      it("khen thúc Tốt cao dũng mãnh khi có quân lớn yểm trợ áp sát", () => {
        const fen = "4k4/9/9/3P5/9/9/4N4/9/9/3K5 w - - 0 1";
        const advancePawn = mv(3, 3, 2, 3);
        const { before, after } = setup(fen, advancePawn);
        const f = detectBinhQuyThanToc(before, advancePawn, after, { loss: 0 });
        expect(f?.principle).toBe("binhQuyThanToc");
        expect(f?.lesson).toBe(14);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("ko40Hq7h9v4?t=4");
      });

      it("không kích hoạt nếu Tốt chưa qua sông", () => {
        const fen = "4k4/9/9/9/9/9/3P5/9/9/3K5 w - - 0 1";
        const advancePawn = mv(6, 3, 5, 3);
        const { before, after } = setup(fen, advancePawn);
        expect(detectBinhQuyThanToc(before, advancePawn, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 15: Tuyệt kỹ dùng Sĩ Tượng phong ấn Song Mã (siTuongPhongAn)", () => {
      it("khen Tượng bay lên làm ngòi cho Pháo công thủ toàn diện", () => {
        const fen = "4k4/9/9/9/4C4/9/9/9/9/2B1K4 w - - 0 1";
        const flyBishop = mv(9, 2, 7, 4);
        const { before, after } = setup(fen, flyBishop);
        const f = detectSiTuongPhongAn(before, flyBishop, after, { loss: 0 });
        expect(f?.principle).toBe("siTuongPhongAn");
        expect(f?.lesson).toBe(15);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("P43P3lsCS-U?t=5");
      });

      it("không kích hoạt nếu không cản Mã và không có Pháo làm ngòi", () => {
        const fen = "4k4/9/9/9/9/9/9/9/9/2B1K4 w - - 0 1";
        const flyBishop = mv(9, 2, 7, 4);
        const { before, after } = setup(fen, flyBishop);
        expect(detectSiTuongPhongAn(before, flyBishop, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 16: Giữ vị trí Tướng linh hoạt trong cờ tàn (tuongLinhHoat)", () => {
      it("khen thượng Tướng lên lầu hai mở rộng đường ra hỗ trợ công sát", () => {
        const fen = "4k4/9/9/9/9/9/4N4/9/9/3K5 w - - 0 1";
        const stepUpKing = mv(9, 3, 8, 3);
        const { before, after } = setup(fen, stepUpKing);
        const f = detectTuongLinhHoat(before, stepUpKing, after, { loss: 0 });
        expect(f?.principle).toBe("tuongLinhHoat");
        expect(f?.lesson).toBe(16);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("Ko55ZmZPuVI?t=4");
      });

      it("không kích hoạt khi Tướng chỉ đi ngang", () => {
        const fen = "4k4/9/9/9/9/9/4N4/9/9/3K5 w - - 0 1";
        const stepSideKing = mv(9, 3, 9, 4);
        const { before, after } = setup(fen, stepSideKing);
        expect(detectTuongLinhHoat(before, stepSideKing, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 17: Chốt lụt vĩnh viễn không chết - Lão Binh (laoBinhKhongChet)", () => {
      it("khen Tốt đáy bình sang ngang khống chế tuyến đáy cửu cung", () => {
        const fen = "3P1k3/9/9/9/9/9/9/9/9/3K5 w - - 0 1";
        const slidePawn = mv(0, 3, 0, 4);
        const { before, after } = setup(fen, slidePawn);
        const f = detectLaoBinhKhongChet(before, slidePawn, after, { loss: 0 });
        expect(f?.principle).toBe("laoBinhKhongChet");
        expect(f?.lesson).toBe(17);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("RoGgqcs7Tho?t=4");
      });

      it("không kích hoạt nếu Tốt chưa ở hàng đáy", () => {
        const fen = "9/3P1k3/9/9/9/9/9/9/9/3K5 w - - 0 1";
        const slidePawn = mv(1, 3, 1, 4);
        const { before, after } = setup(fen, slidePawn);
        expect(detectLaoBinhKhongChet(before, slidePawn, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 18: Khuyết Sĩ kỵ gì - Khuyết Sĩ kỵ Song Xe Song Pháo (khuyetSiKyGi)", () => {
      it("khen Xe Tốt khoét sâu khi đối phương khuyết Sĩ", () => {
        const fen = "3ak4/9/9/4P4/9/9/9/3R5/9/3K5 w - - 0 1";
        const attackPalace = mv(7, 3, 1, 3);
        const { before, after } = setup(fen, attackPalace);
        const f = detectKhuyetSiKyGi(before, attackPalace, after, { loss: 0 });
        expect(f?.principle).toBe("khuyetSiKyGi");
        expect(f?.lesson).toBe(18);
        expect(f?.quote?.at).toBe("00:22");
        expect(f?.videoUrl).toContain("DaPsULPGIuU?t=22");
      });

      it("không kích hoạt khi đối phương đủ 2 Sĩ", () => {
        const fen = "3akab2/9/9/4P4/9/9/9/3R5/9/3K5 w - - 0 1";
        const attackPalace = mv(7, 3, 1, 3);
        const { before, after } = setup(fen, attackPalace);
        expect(detectKhuyetSiKyGi(before, attackPalace, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 19: Khuyết Tượng sợ Pháo (khuyetTuongKyPhao)", () => {
      it("khen Pháo tấn công sườn/đáy khi đối phương khuyết Tượng", () => {
        const fen = "3ak1b2/9/9/9/9/9/9/4C4/9/3K5 w - - 0 1";
        const attackCannon = mv(7, 4, 1, 4);
        const { before, after } = setup(fen, attackCannon);
        const f = detectKhuyetTuongKyPhao(before, attackCannon, after, { loss: 0 });
        expect(f?.principle).toBe("khuyetTuongKyPhao");
        expect(f?.lesson).toBe(19);
        expect(f?.quote?.at).toBe("02:26");
        expect(f?.videoUrl).toContain("jUUsLOiP1uA?t=146");
      });

      it("không kích hoạt khi đối phương vẫn còn đủ 2 Tượng", () => {
        const fen = "2bakab2/9/9/9/9/9/9/4C4/9/3K5 w - - 0 1";
        const attackCannon = mv(7, 4, 1, 4);
        const { before, after } = setup(fen, attackCannon);
        expect(detectKhuyetTuongKyPhao(before, attackCannon, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 20: Cờ tàn Pháo hoàn (coTanPhaoHoan)", () => {
      it("khen Pháo thoái lui về trận địa nhà mượn Sĩ Tượng làm ngòi nổ", () => {
        const fen = "3ak4/9/9/9/1C7/9/9/4A4/9/3K5 w - - 0 1";
        const retreatCannon = mv(4, 1, 7, 1);
        const { before, after } = setup(fen, retreatCannon);
        const f = detectCoTanPhaoHoan(before, retreatCannon, after, { loss: 0 });
        expect(f?.principle).toBe("coTanPhaoHoan");
        expect(f?.lesson).toBe(20);
        expect(f?.quote?.at).toBe("01:23");
        expect(f?.videoUrl).toContain("Q6jMjsM3HRQ?t=83");
      });

      it("không kích hoạt khi Pháo tiến lên thay vì thoái quy gia", () => {
        const fen = "3ak4/9/9/9/1C7/9/9/4A4/9/3K5 w - - 0 1";
        const advanceCannon = mv(4, 1, 3, 1);
        const { before, after } = setup(fen, advanceCannon);
        expect(detectCoTanPhaoHoan(before, advanceCannon, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 21: Dọn Tốt khống chế tuyến (donTotKhongCheTuyen)", () => {
      it("khen Xe chiếm tuyến tuần hà khống chế ngăn Tốt đối phương vượt sông", () => {
        const fen = "3ak4/9/9/4p4/9/9/9/R8/9/3K5 w - - 0 1";
        const patrolRook = mv(7, 0, 5, 0);
        const { before, after } = setup(fen, patrolRook);
        const f = detectDonTotKhongCheTuyen(before, patrolRook, after, { loss: 0 });
        expect(f?.principle).toBe("donTotKhongCheTuyen");
        expect(f?.lesson).toBe(21);
        expect(f?.quote?.at).toBe("01:11");
        expect(f?.videoUrl).toContain("amVASIEKTlg?t=71");
      });

      it("không kích hoạt nếu đối phương không có quân Tốt nào", () => {
        const fen = "3ak4/9/9/9/9/9/9/R8/9/3K5 w - - 0 1";
        const patrolRook = mv(7, 0, 5, 0);
        const { before, after } = setup(fen, patrolRook);
        expect(detectDonTotKhongCheTuyen(before, patrolRook, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 22: Mã vs Pháo trong tàn cuộc (maThangPhao)", () => {
      it("khen Mã nhảy vào điểm huyệt áp sát cung đối phương định vị không gian", () => {
        const fen = "3ak4/9/9/9/3N5/9/9/9/9/3K1c3 w - - 0 1";
        const outpostHorse = mv(4, 3, 2, 2);
        const { before, after } = setup(fen, outpostHorse);
        const f = detectMaThangPhao(before, outpostHorse, after, { loss: 0 });
        expect(f?.principle).toBe("maThangPhao");
        expect(f?.lesson).toBe(22);
        expect(f?.quote?.at).toBe("12:41");
        expect(f?.videoUrl).toContain("jM43iVKLiP8?t=761");
      });

      it("không kích hoạt khi Mã thoái lui về sân nhà", () => {
        const fen = "3ak4/9/9/9/3N5/9/9/9/9/3K1c3 w - - 0 1";
        const retreatHorse = mv(4, 3, 6, 2);
        const { before, after } = setup(fen, retreatHorse);
        expect(detectMaThangPhao(before, retreatHorse, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 23: Chiến thuật cờ tàn - Phép kiềm chế (chienThuatKiemChe)", () => {
      it("khen Xe khóa chặt quân chủ lực của đối phương vào thế bất động", () => {
        const fen = "1n2k4/9/9/9/9/9/9/1R7/9/3K5 w - - 0 1";
        const pinMove = mv(7, 1, 1, 1);
        const { before, after } = setup(fen, pinMove);
        const f = detectChienThuatKiemChe(before, pinMove, after, { loss: 0 });
        expect(f?.principle).toBe("chienThuatKiemChe");
        expect(f?.lesson).toBe(23);
        expect(f?.quote?.at).toBe("02:51");
        expect(f?.videoUrl).toContain("eIo0wo1GCGc?t=171");
      });

      it("không kích hoạt nếu đối phương chỉ còn Tướng trần (không có quân chủ lực)", () => {
        const fen = "3ak4/9/9/9/9/9/9/1R7/9/3K5 w - - 0 1";
        const pinMove = mv(7, 1, 1, 1);
        const { before, after } = setup(fen, pinMove);
        expect(detectChienThuatKiemChe(before, pinMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 24: Chiến thuật cờ tàn - Nước chờ (chienThuatNuocCho)", () => {
      it("khen Sĩ/Tướng đi nước chờ tinh tế khi đối phương bị hạn chế nước đi", () => {
        const fen = "3ak4/9/9/9/9/9/9/9/3A5/3K5 w - - 0 1";
        const waitingMove = mv(8, 3, 9, 4);
        const { before, after } = setup(fen, waitingMove);
        const f = detectChienThuatNuocCho(before, waitingMove, after, { loss: 0 });
        expect(f?.principle).toBe("chienThuatNuocCho");
        expect(f?.lesson).toBe(24);
        expect(f?.quote?.at).toBe("01:15");
        expect(f?.videoUrl).toContain("yX31jXr2Tuo?t=75");
      });

      it("không kích hoạt nếu nước đi là nước chiếu tướng", () => {
        const fen = "3ak4/9/9/9/9/9/9/R8/9/3K5 w - - 0 1";
        const checkMove = mv(7, 0, 0, 0);
        const { before, after } = setup(fen, checkMove);
        expect(detectChienThuatNuocCho(before, checkMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 25: Chiến thuật cờ tàn - Vây khốn (chienThuatVayKhon)", () => {
      it("khen bao vây và bắt chết quân lớn của đối thủ trong tàn cuộc", () => {
        const fen = "3ak4/9/9/9/9/9/9/9/1R7/1n1K5 w - - 0 1";
        const captureKnight = mv(8, 1, 9, 1);
        const { before, after } = setup(fen, captureKnight);
        const f = detectChienThuatVayKhon(before, captureKnight, after, { loss: 0 });
        expect(f?.principle).toBe("chienThuatVayKhon");
        expect(f?.lesson).toBe(25);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("WoAbngtSdTM?t=5");
      });

      it("không kích hoạt khi đi nước cờ bình thường không vây bắt quân lớn", () => {
        const fen = "3ak4/9/9/9/9/9/9/9/1R7/1n1K5 w - - 0 1";
        const quietMove = mv(8, 1, 8, 0);
        const { before, after } = setup(fen, quietMove);
        expect(detectChienThuatVayKhon(before, quietMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 26: Kỹ thuật đốn tỏa (kyThuatDonToa)", () => {
      it("khen chiếu tướng tranh tiên ép Tướng đối phương di chuyển lệch vị", () => {
        const fen = "4k4/9/9/9/9/9/9/R8/9/3K5 w - - 0 1";
        const checkKing = mv(7, 0, 0, 0);
        const { before, after } = setup(fen, checkKing);
        const f = detectKyThuatDonToa(before, checkKing, after, { loss: 0 });
        expect(f?.principle).toBe("kyThuatDonToa");
        expect(f?.lesson).toBe(26);
        expect(f?.quote?.at).toBe("01:34");
        expect(f?.videoUrl).toContain("b7SZnVTtLkM?t=94");
      });

      it("không kích hoạt khi nước đi không phải là nước chiếu tướng", () => {
        const fen = "4k4/9/9/9/9/9/9/R8/9/3K5 w - - 0 1";
        const nonCheck = mv(7, 0, 7, 5);
        const { before, after } = setup(fen, nonCheck);
        expect(detectKyThuatDonToa(before, nonCheck, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 27: Kỹ thuật đánh chặn (kyThuatDanhChan)", () => {
      it("khen quân cờ chắn tuyến phong tỏa hỏa lực đối phương từ xa", () => {
        const fen = "3ak4/4r4/9/9/9/9/9/4C4/9/3K5 w - - 0 1";
        const blockFile = mv(7, 4, 6, 4);
        const { before, after } = setup(fen, blockFile);
        const f = detectKyThuatDanhChan(before, blockFile, after, { loss: 0 });
        expect(f?.principle).toBe("kyThuatDanhChan");
        expect(f?.lesson).toBe(27);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("PRy4jSbJRPo?t=5");
      });

      it("không kích hoạt nếu đối phương không có quân nặng cần đánh chặn", () => {
        const fen = "3ak4/9/9/9/9/9/9/4C4/9/3K5 w - - 0 1";
        const blockFile = mv(7, 4, 6, 4);
        const { before, after } = setup(fen, blockFile);
        expect(detectKyThuatDanhChan(before, blockFile, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 28: Chiến thuật cầu hòa (chienThuatCauHoa)", () => {
      it("khen diệt Tốt đối phương để quy về thế hòa khi đang ở thế bất lợi", () => {
        const fen = "3ak4/9/9/4p4/9/9/9/4R4/9/3K5 w - - 0 1";
        const capturePawn = mv(7, 4, 3, 4);
        const { before, after } = setup(fen, capturePawn);
        const f = detectChienThuatCauHoa(before, capturePawn, after, { loss: 0, evalBefore: { score: -150 } });
        expect(f?.principle).toBe("chienThuatCauHoa");
        expect(f?.lesson).toBe(28);
        expect(f?.quote?.at).toBe("00:39");
        expect(f?.videoUrl).toContain("RbhN1vumxek?t=39");
      });

      it("không kích hoạt khi người chơi đang áp đảo thắng thế", () => {
        const fen = "3ak4/9/9/4p4/9/9/9/4R4/9/3K5 w - - 0 1";
        const capturePawn = mv(7, 4, 3, 4);
        const { before, after } = setup(fen, capturePawn);
        expect(detectChienThuatCauHoa(before, capturePawn, after, { loss: 0, evalBefore: { score: 300 } })).toBeNull();
      });
    });

    describe("Bài 29: Chiến thuật sấm sét (chienThuatSamSet)", () => {
      it("khen đòn đột kích cục bộ chớp nhoáng tạo sát cục bất ngờ", () => {
        const fen = "3ak4/9/9/9/4N4/9/9/9/9/3K5 w - - 0 1";
        const flashAttack = mv(4, 4, 2, 3);
        const { before, after } = setup(fen, flashAttack);
        const f = detectChienThuatSamSet(before, flashAttack, after, { loss: 0 });
        expect(f?.principle).toBe("chienThuatSamSet");
        expect(f?.lesson).toBe(29);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("akTcbzh1MaM?t=5");
      });

      it("không kích hoạt khi quân thoái lui về sân nhà không uy hiếp cung", () => {
        const fen = "3ak4/9/9/9/4N4/9/9/9/9/3K5 w - - 0 1";
        const retreatMove = mv(4, 4, 6, 3);
        const { before, after } = setup(fen, retreatMove);
        expect(detectChienThuatSamSet(before, retreatMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 30: Tuyệt đỉnh tàn cuộc Xe Pháo (xePhaoHopCong)", () => {
      it("khen tổ hợp Xe Pháo cùng dồn hỏa lực công kích cửu cung", () => {
        const fen = "3ak4/9/9/9/9/9/9/2R1C4/9/3K5 w - - 0 1";
        const rookAttack = mv(7, 2, 2, 2);
        const { before, after } = setup(fen, rookAttack);
        const f = detectXePhaoHopCong(before, rookAttack, after, { loss: 0 });
        expect(f?.principle).toBe("xePhaoHopCong");
        expect(f?.lesson).toBe(30);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("DvaUWgJFvJk?t=4");
      });

      it("không kích hoạt nếu phe tấn công không có đủ cả Xe lẫn Pháo", () => {
        const fen = "3ak4/9/9/9/9/9/9/2R6/9/3K5 w - - 0 1";
        const rookAttack = mv(7, 2, 2, 2);
        const { before, after } = setup(fen, rookAttack);
        expect(detectXePhaoHopCong(before, rookAttack, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 31: Xe Mã lãnh chiêu (xeMaLanhChieu)", () => {
      it("khen đòn nguội hiểm hóc của Xe Mã phối hợp công sát cửu cung", () => {
        const fen = "3ak4/9/9/9/9/9/9/2R1N4/9/3K5 w - - 0 1";
        const rookPenetrates = mv(7, 2, 1, 2);
        const { before, after } = setup(fen, rookPenetrates);
        const f = detectXeMaLanhChieu(before, rookPenetrates, after, { loss: 0 });
        expect(f?.principle).toBe("xeMaLanhChieu");
        expect(f?.lesson).toBe(31);
        expect(f?.quote?.at).toBe("00:06");
        expect(f?.videoUrl).toContain("ViC0z9if74M?t=6");
      });

      it("không kích hoạt nếu phe đi không có quân Mã phối hợp", () => {
        const fen = "3ak4/9/9/9/9/9/9/2R6/9/3K5 w - - 0 1";
        const rookPenetrates = mv(7, 2, 1, 2);
        const { before, after } = setup(fen, rookPenetrates);
        expect(detectXeMaLanhChieu(before, rookPenetrates, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 32: Kỹ thuật Xe Chốt phá Sĩ Tượng (xeChotPhaSiTuong)", () => {
      it("khen Xe Tốt phối hợp phá vỡ hệ thống Sĩ Tượng của đối phương", () => {
        const fen = "3ak4/9/9/4P4/9/9/9/2R6/9/3K5 w - - 0 1";
        const rookAttacks = mv(7, 2, 2, 2);
        const { before, after } = setup(fen, rookAttacks);
        const f = detectXeChotPhaSiTuong(before, rookAttacks, after, { loss: 0 });
        expect(f?.principle).toBe("xeChotPhaSiTuong");
        expect(f?.lesson).toBe(32);
        expect(f?.quote?.at).toBe("01:46");
        expect(f?.videoUrl).toContain("dx9Kmpo_yho?t=106");
      });

      it("không kích hoạt nếu phe đi không có quân Tốt qua sông", () => {
        const fen = "3ak4/9/9/9/9/9/9/2R6/9/3K5 w - - 0 1";
        const rookAttacks = mv(7, 2, 2, 2);
        const { before, after } = setup(fen, rookAttacks);
        expect(detectXeChotPhaSiTuong(before, rookAttacks, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 33: Tàn cuộc Song Mã Song Pháo (songMaSongPhao)", () => {
      it("khen tác chiến tàn cuộc đại binh đoàn Song Mã Song Pháo không có Xe", () => {
        const fen = "3ak4/9/9/9/9/9/9/2N1N4/4C4/3K5 w - - 0 1";
        const horseMove = mv(7, 2, 5, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectSongMaSongPhao(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("songMaSongPhao");
        expect(f?.lesson).toBe(33);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("zCWkJ5v8aTw?t=4");
      });

      it("không kích hoạt nếu trên bàn cờ vẫn còn quân Xe", () => {
        const fen = "3ak4/9/9/9/9/9/9/2N1N4/4C2R1/3K5 w - - 0 1";
        const horseMove = mv(7, 2, 5, 3);
        const { before, after } = setup(fen, horseMove);
        expect(detectSongMaSongPhao(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 34: Tàn cuộc Song Mã Pháo đối Mã Song Pháo (songMaPhaoDoiMaSongPhao)", () => {
      it("khen cuộc chiến so tài giữa 2 Mã 1 Pháo và 1 Mã 2 Pháo", () => {
        const fen = "3ak4/9/2n1c4/9/4c4/9/9/2N1N4/4C4/3K5 w - - 0 1";
        const horseMove = mv(7, 2, 5, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectSongMaPhaoDoiMaSongPhao(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("songMaPhaoDoiMaSongPhao");
        expect(f?.lesson).toBe(34);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("mO3mG0KZRcQ?t=4");
      });

      it("không kích hoạt nếu cả hai bên có binh chủng đối xứng (cùng 1 Mã 1 Pháo)", () => {
        const fen = "3ak4/9/2n6/9/4c4/9/9/2N6/4C4/3K5 w - - 0 1";
        const horseMove = mv(7, 2, 5, 3);
        const { before, after } = setup(fen, horseMove);
        expect(detectSongMaPhaoDoiMaSongPhao(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 35: Lý thuyết cốt lõi của tàn cuộc Mã Pháo đối Mã Pháo (maPhaoDoiMaPhao)", () => {
      it("khen tàn cuộc Đơn Mã Pháo đối Đơn Mã Pháo giằng co tinh vi", () => {
        const fen = "3ak4/9/2n6/9/4c4/9/9/2N6/4C4/3K5 w - - 0 1";
        const horseMove = mv(7, 2, 5, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectMaPhaoDoiMaPhao(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("maPhaoDoiMaPhao");
        expect(f?.lesson).toBe(35);
        expect(f?.quote?.at).toBe("00:04");
        expect(f?.videoUrl).toContain("Au7TR2QgniY?t=4");
      });

      it("không kích hoạt nếu phe đi có nhiều hơn 1 quân Mã", () => {
        const fen = "3ak4/9/2n6/9/4c4/9/9/2N1N4/4C4/3K5 w - - 0 1";
        const horseMove = mv(7, 2, 5, 3);
        const { before, after } = setup(fen, horseMove);
        expect(detectMaPhaoDoiMaPhao(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 36: Tàn cuộc Song Pháo đối Song Mã (songPhaoDoiSongMa)", () => {
      it("khen Song Pháo kiểm soát hai cánh kiềm chế Song Mã của đối phương", () => {
        const fen = "3ak4/9/2n1n4/9/9/9/9/2C1C4/9/3K5 w - - 0 1";
        const cannonFlank = mv(7, 2, 7, 1);
        const { before, after } = setup(fen, cannonFlank);
        const f = detectSongPhaoDoiSongMa(before, cannonFlank, after, { loss: 0 });
        expect(f?.principle).toBe("songPhaoDoiSongMa");
        expect(f?.lesson).toBe(36);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("kF1lZytRkNg?t=5");
      });

      it("không kích hoạt nếu đối phương có quân Pháo", () => {
        const fen = "3ak4/9/2n1n4/4c4/9/9/9/2C1C4/9/3K5 w - - 0 1";
        const cannonFlank = mv(7, 2, 7, 1);
        const { before, after } = setup(fen, cannonFlank);
        expect(detectSongPhaoDoiSongMa(before, cannonFlank, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 37: Tàn cuộc Mã Tốt đối Pháo Tốt (maTotDoiPhaoTot)", () => {
      it("khen Mã Tốt khống chế tuyến phong tỏa Pháo Tốt", () => {
        const fen = "3ak4/9/4c4/9/4p4/5P3/4N4/9/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectMaTotDoiPhaoTot(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("maTotDoiPhaoTot");
        expect(f?.lesson).toBe(37);
        expect(f?.quote?.at).toBe("02:11");
        expect(f?.videoUrl).toContain("_TxJNNeHi7A?t=131");
      });

      it("không kích hoạt nếu bàn cờ còn Xe", () => {
        const fen = "3ak4/9/4c4/9/4p4/5P3/4N4/R8/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        expect(detectMaTotDoiPhaoTot(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 38: Tam Anh Chiến Lữ Bố (tamAnhChienLuBo)", () => {
      it("khen Đơn Xe tác chiến chống quần hùng Mã Pháo trong tàn cuộc", () => {
        const fen = "3ak4/9/2n1n4/4c4/9/9/R8/9/9/4K4 w - - 0 1";
        const rookMove = mv(6, 0, 2, 0);
        const { before, after } = setup(fen, rookMove);
        const f = detectTamAnhChienLuBo(before, rookMove, after, { loss: 0 });
        expect(f?.principle).toBe("tamAnhChienLuBo");
        expect(f?.lesson).toBe(38);
        expect(f?.quote?.at).toBe("00:49");
        expect(f?.videoUrl).toContain("QaUMyl-30g4?t=49");
      });

      it("không kích hoạt nếu phe Xe có thêm quân nhẹ", () => {
        const fen = "3ak4/9/2n1n4/4c4/9/9/RN7/9/9/4K4 w - - 0 1";
        const rookMove = mv(6, 0, 2, 0);
        const { before, after } = setup(fen, rookMove);
        expect(detectTamAnhChienLuBo(before, rookMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 39: Mã Tốt đáy thắng Đơn Sĩ Tượng (maTotDayThangDonSiTuong)", () => {
      it("khen Mã phối hợp Tốt đáy ép cung sát cục Đơn Sĩ Tượng", () => {
        const fen = "3a1k3/4P1b2/9/9/9/9/5N3/9/9/4K4 w - - 0 1";
        const horseMove = mv(6, 5, 4, 4);
        const { before, after } = setup(fen, horseMove);
        const f = detectMaTotDayThangDonSiTuong(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("maTotDayThangDonSiTuong");
        expect(f?.lesson).toBe(39);
        expect(f?.quote?.at).toBe("01:01");
        expect(f?.videoUrl).toContain("DTlMu7DsQdU?t=61");
      });

      it("không kích hoạt nếu Tốt chưa ở hàng cận đáy hoặc đáy", () => {
        const fen = "3a1k3/5b3/9/9/9/4P4/5N3/9/9/4K4 w - - 0 1";
        const horseMove = mv(6, 5, 4, 4);
        const { before, after } = setup(fen, horseMove);
        expect(detectMaTotDayThangDonSiTuong(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 40: Xe Pháo khuyết Sĩ thắng Xe Pháo (haiDeLaoNguyet)", () => {
      it("khen Pháo lặn xuống đáy mò trăng đáy biển Hải Để Lao Nguyệt", () => {
        const fen = "1r2k1C2/9/9/9/9/9/9/R8/4c4/4K4 w - - 0 1";
        const rookMove = mv(7, 0, 0, 0);
        const { before, after } = setup(fen, rookMove);
        const f = detectHaiDeLaoNguyet(before, rookMove, after, { loss: 0 });
        expect(f?.principle).toBe("haiDeLaoNguyet");
        expect(f?.lesson).toBe(40);
        expect(f?.quote?.at).toBe("07:21");
        expect(f?.videoUrl).toContain("lIpw6oiD9EM?t=441");
      });

      it("không kích hoạt nếu Pháo không ở hàng đáy", () => {
        const fen = "1r2k4/9/6C2/9/9/9/9/R8/4c4/4K4 w - - 0 1";
        const rookMove = mv(7, 0, 5, 0);
        const { before, after } = setup(fen, rookMove);
        expect(detectHaiDeLaoNguyet(before, rookMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 41: Xe Pháo đơn Sĩ đối Xe Song Tượng (canKhonDaiNaDi)", () => {
      it("khen sát pháp Càn Khôn Đại Nã Di điều chuyển ép Song Tượng lùi đáy", () => {
        const fen = "2b1k1b1r/9/9/9/9/9/4C4/R8/4A4/4K4 w - - 0 1";
        const cannonMove = mv(6, 4, 1, 4);
        const { before, after } = setup(fen, cannonMove);
        const f = detectCanKhonDaiNaDi(before, cannonMove, after, { loss: 0 });
        expect(f?.principle).toBe("canKhonDaiNaDi");
        expect(f?.lesson).toBe(41);
        expect(f?.quote?.at).toBe("00:22");
        expect(f?.videoUrl).toContain("PCukWSQ4sQE?t=22");
      });

      it("không kích hoạt nếu bên phòng thủ có thêm Sĩ", () => {
        const fen = "2ba1kb1r/9/9/9/9/9/4C4/R8/4A4/4K4 w - - 0 1";
        const cannonMove = mv(6, 4, 1, 4);
        const { before, after } = setup(fen, cannonMove);
        expect(detectCanKhonDaiNaDi(before, cannonMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 42: Xe Mã đối Xe Song Tượng (xeMaDoiXeSongTuong)", () => {
      it("khen Xe Mã chèn mắt Tượng phá vỡ phòng tuyến Song Tượng", () => {
        const fen = "2b1k1b1r/9/9/9/9/9/4N4/R8/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectXeMaDoiXeSongTuong(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("xeMaDoiXeSongTuong");
        expect(f?.lesson).toBe(42);
        expect(f?.quote?.at).toBe("01:11");
        expect(f?.videoUrl).toContain("U80kaWbbXAk?t=71");
      });

      it("không kích hoạt nếu phe tấn công có thêm quân Pháo", () => {
        const fen = "2b1k1b1r/9/9/9/9/9/4N2C1/R8/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        expect(detectXeMaDoiXeSongTuong(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 43: Cạm bẫy giăng kín trong cờ thế Thất Tinh Tụ Hội (thatTinhTuHoi)", () => {
      it("khen Xe Pháo Tốt tính toán nhịp độ phá giải cạm bẫy Thất Tinh Tụ Hội", () => {
        const fen = "r3k4/9/2c6/9/2p1P4/9/9/1RC6/9/3K5 w - - 0 1";
        const rookMove = mv(7, 1, 1, 1);
        const { before, after } = setup(fen, rookMove);
        const f = detectThatTinhTuHoi(before, rookMove, after, { loss: 0 });
        expect(f?.principle).toBe("thatTinhTuHoi");
        expect(f?.lesson).toBe(43);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("Uj1voqULEp4?t=5");
      });

      it("không kích hoạt nếu phe tấn công có thêm Mã", () => {
        const fen = "r3k4/9/2c6/9/2p1P4/9/9/1RCN5/9/3K5 w - - 0 1";
        const rookMove = mv(7, 1, 1, 1);
        const { before, after } = setup(fen, rookMove);
        expect(detectThatTinhTuHoi(before, rookMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 44: Giải mã Tứ đại danh cuộc - Khâu Dẫn Hàng Long (khauDanHangLong)", () => {
      it("khen Song Xe kiên nhẫn đối phó bầy Tốt trói chặt tiền tuyến", () => {
        const fen = "4k4/9/9/9/9/9/4p4/4p4/R6R1/3K5 w - - 0 1";
        const rookMove = mv(8, 0, 7, 0);
        const { before, after } = setup(fen, rookMove);
        const f = detectKhauDanHangLong(before, rookMove, after, { loss: 0 });
        expect(f?.principle).toBe("khauDanHangLong");
        expect(f?.lesson).toBe(44);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("Q-KyLnoNcEs?t=5");
      });

      it("không kích hoạt nếu phe Tốt chỉ có 1 Tốt qua sông", () => {
        const fen = "4k4/9/9/9/9/9/9/4p4/R6R1/3K5 w - - 0 1";
        const rookMove = mv(8, 0, 7, 0);
        const { before, after } = setup(fen, rookMove);
        expect(detectKhauDanHangLong(before, rookMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 45: Cờ thế giang hồ Dã Mã Thao Điền (daMaThaoDien)", () => {
      it("khen Xe Mã tung đòn ngọa tào lãnh chiêu trong thế Dã Mã Thao Điền", () => {
        const fen = "4k2r1/9/9/9/4N4/9/9/R8/9/3K5 w - - 0 1";
        const horseMove = mv(4, 4, 2, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectDaMaThaoDien(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("daMaThaoDien");
        expect(f?.lesson).toBe(45);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("naUZGByE95w?t=5");
      });

      it("không kích hoạt nếu phe tấn công không có quân Mã", () => {
        const fen = "4k2r1/9/9/9/9/9/9/R8/9/3K5 w - - 0 1";
        const rookMove = mv(7, 0, 2, 0);
        const { before, after } = setup(fen, rookMove);
        expect(detectDaMaThaoDien(before, rookMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 46: Thiên Lý Độc Hành (thienLyDocHanh)", () => {
      it("khen Đơn Mã độc hành vượt trùng vây đối mặt Xe Tốt", () => {
        const fen = "4k2r1/9/9/9/4p4/9/4N4/9/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectThienLyDocHanh(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("thienLyDocHanh");
        expect(f?.lesson).toBe(46);
        expect(f?.quote?.at).toBe("00:05");
        expect(f?.videoUrl).toContain("EuSeQTFCa_M?t=5");
      });

      it("không kích hoạt nếu phe Mã có thêm quân Xe", () => {
        const fen = "4k2r1/9/9/9/4p4/9/4N4/R8/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        expect(detectThienLyDocHanh(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 47: Bài học xương máu về chiến thuật và tâm lý (chienThuatVaTamLy)", () => {
      it("khen thế Xe Mã Tốt kiên định tiến công chống Xe Pháo", () => {
        const fen = "4k2r1/9/4c4/9/9/5P3/4N4/R8/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        const f = detectChienThuatVaTamLy(before, horseMove, after, { loss: 0 });
        expect(f?.principle).toBe("chienThuatVaTamLy");
        expect(f?.lesson).toBe(47);
        expect(f?.quote?.at).toBe("04:09");
        expect(f?.videoUrl).toContain("M16GyhAmi_Q?t=249");
      });

      it("không kích hoạt nếu phe Xe Mã thiếu quân Tốt", () => {
        const fen = "4k2r1/9/4c4/9/9/9/4N4/R8/9/3K5 w - - 0 1";
        const horseMove = mv(6, 4, 4, 3);
        const { before, after } = setup(fen, horseMove);
        expect(detectChienThuatVaTamLy(before, horseMove, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 48: Bản chất cốt lõi của tàn cuộc (banChatTanCuoc)", () => {
      it("khen xuất Tướng kiểm soát thế trận tột đỉnh", () => {
        const fen = "4k2r1/9/9/9/9/9/9/R8/9/4K4 w - - 0 1";
        const kingMove = mv(9, 4, 9, 3);
        const { before, after } = setup(fen, kingMove);
        const f = detectBanChatTanCuoc(before, kingMove, after, { loss: 0 });
        expect(f?.principle).toBe("banChatTanCuoc");
        expect(f?.lesson).toBe(48);
        expect(f?.quote?.at).toBe("03:05");
        expect(f?.videoUrl).toContain("NzESbWX8YKo?t=185");
      });

      it("không kích hoạt nếu Tướng chỉ đi thẳng lên thay vì xuất lộ sườn", () => {
        const fen = "3k5/9/9/9/9/9/9/R7r/9/4K4 w - - 0 1";
        const kingMove = mv(9, 4, 8, 4);
        const { before, after } = setup(fen, kingMove);
        expect(detectBanChatTanCuoc(before, kingMove, after, { loss: 0 })).toBeNull();
      });
    });
  });

  describe("Tổng hợp", () => {
    it("không xét nguyên lý tàn cuộc ở khai cuộc", () => {
      const pos = initialPosition();
      const m = mv(7, 1, 7, 4);
      expect(isEndgame(pos.board)).toBe(false);
      expect(endgamePrincipleFacts(pos.board, m, play(pos.board, m), { loss: 0 })).toEqual([]);
    });

    it("mỗi nước chỉ một nguyên lý, và lời bình hiện ở góc nhìn mặc định", () => {
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      const facts = endgamePrincipleFacts(before, box, after, { loss: 0 });
      expect(facts).toHaveLength(1);
      expect(explainText(facts, "r", 1, "default")).toContain("Bó Tướng");
    });

    it("không khen khi thiếu dữ liệu engine", () => {
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      expect(endgamePrincipleFacts(before, box, after)).toEqual([]);
    });
  });
});
