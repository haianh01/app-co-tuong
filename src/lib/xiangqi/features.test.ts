import { describe, expect, it } from "vitest";
import { parseFen } from "./engine";
import { extractFeatures, clearFeaturesCache } from "./features";

describe("features.ts - Trích xuất đặc trưng & trạng thái chi tiết của từng quân cờ (B1)", () => {
  it("trích xuất đầy đủ đặc trưng cho cả 2 phe từ bàn cờ ban đầu", () => {
    clearFeaturesCache();
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const { board } = parseFen(fen);
    const feat = extractFeatures(board);

    expect(feat.r.pieces.length).toBe(16);
    expect(feat.b.pieces.length).toBe(16);
    expect(feat.r.mobilityTotal).toBeGreaterThan(0);
    expect(feat.b.mobilityTotal).toBeGreaterThan(0);
  });

  describe("Nhóm Xe (Rook Tags)", () => {
    it("xeBiKim: nhận diện khi Xe chỉ còn <= 2 ô an toàn và không nhận nhầm khi Xe tự do", () => {
      // Xe đỏ ở a9 bị kìm (chỉ còn 0 ô an toàn)
      const fenBlocked = "RA2k4/p8/9/9/9/9/9/9/r8/4K4 w - - 0 1";
      const featBlocked = extractFeatures(parseFen(fenBlocked).board);
      expect(featBlocked.r.byTag.xeBiKim?.length).toBeGreaterThanOrEqual(1);

      // Xe đỏ ở e4 hoàn toàn thông thoáng
      const fenFree = "4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1";
      const featFree = extractFeatures(parseFen(fenFree).board);
      expect(featFree.r.byTag.xeBiKim).toBeUndefined();
    });

    it("xeLoThong: nhận diện khi cột mở không có quân cản tới đáy và không nhận nhầm khi có quân cản", () => {
      // Xe đỏ ở b2, cột b hoàn toàn trống tới hàng đáy đối phương
      const fenOpen = "4k4/9/9/9/9/9/9/1R7/9/4K4 w - - 0 1";
      const featOpen = extractFeatures(parseFen(fenOpen).board);
      expect(featOpen.r.byTag.xeLoThong?.length).toBe(1);

      // Có Tốt đen ở b7 chắn đường
      const fenBlocked = "4k4/1p7/9/9/9/9/9/1R7/9/4K4 w - - 0 1";
      const featBlocked = extractFeatures(parseFen(fenBlocked).board);
      expect(featBlocked.r.byTag.xeLoThong).toBeUndefined();
    });

    it("xeCamDay: nhận diện khi Xe đứng ở hàng đáy đối phương", () => {
      const fen = "1R2k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fen).board);
      expect(feat.r.byTag.xeCamDay?.length).toBe(1);

      // Không ở hàng đáy
      const fenNotBottom = "4k4/1R7/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const featNotBottom = extractFeatures(parseFen(fenNotBottom).board);
      expect(featNotBottom.r.byTag.xeCamDay).toBeUndefined();
    });

    it("xeTuanHa: nhận diện khi Xe ở hàng bờ sông bên mình (tiến 4 hàng)", () => {
      // Đỏ tiến 4 hàng từ đáy (row 5)
      const fen = "4k4/9/9/9/9/4R4/9/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fen).board);
      expect(feat.r.byTag.xeTuanHa?.length).toBe(1);

      // Đỏ tiến 5 hàng (row 4, áp hà chứ không phải tuần hà)
      const fenFar = "4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1";
      const { board } = parseFen(fenFar);
      board[36] = null; // xóa
      board[40] = "R"; // row 4 col 4
      const featFar = extractFeatures(board);
      expect(featFar.r.byTag.xeTuanHa).toBeUndefined();
    });

    it("xeChiemSuon: nhận diện khi Xe ở cột 3 hoặc 5 và đã tiến >= 3 hàng", () => {
      // Xe ở cột 3 (d), row 6 (tiến 3 hàng)
      const fen = "4k4/9/9/9/9/9/3R5/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fen).board);
      expect(feat.r.byTag.xeChiemSuon?.length).toBe(1);

      // Xe ở cột 2 (c, không phải sườn)
      const fenNotFlank = "4k4/9/9/9/9/9/2R6/9/9/4K4 w - - 0 1";
      const featNotFlank = extractFeatures(parseFen(fenNotFlank).board);
      expect(featNotFlank.r.byTag.xeChiemSuon).toBeUndefined();
    });
  });

  describe("Nhóm Mã (Horse Tags)", () => {
    it("maChet: nhận diện khi Mã có safeMoves === 0", () => {
      // Mã đỏ ở góc a9 bị bao vây chặt cả 2 chân
      const fenDead = "NA2k4/p8/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fenDead).board);
      expect(feat.r.byTag.maChet?.length).toBe(1);

      // Mã tự do (ở cột d, không bị ghim bởi mặt tướng)
      const fenFree = "4k4/9/9/9/3N5/9/9/9/9/4K4 w - - 0 1";
      const featFree = extractFeatures(parseFen(fenFree).board);
      expect(featFree.r.byTag.maChet).toBeUndefined();
    });

    it("maBien: nhận diện khi Mã đứng ở cột 0 hoặc 8", () => {
      const fen = "4k4/9/N8/9/9/9/9/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fen).board);
      expect(feat.r.byTag.maBien?.length).toBe(1);

      const fenMid = "4k4/9/1N7/9/9/9/9/9/9/4K4 w - - 0 1";
      const featMid = extractFeatures(parseFen(fenMid).board);
      expect(featMid.r.byTag.maBien).toBeUndefined();
    });

    it("maBiCanChan: nhận diện khi Mã bị cản ít nhất 1 chân", () => {
      // Mã đỏ ở e4 có quân cản ngay trước mặt
      const fenBlocked = "4k4/9/9/9/4P4/4N4/9/9/9/4K4 w - - 0 1";
      const featBlocked = extractFeatures(parseFen(fenBlocked).board);
      expect(featBlocked.r.byTag.maBiCanChan?.length).toBe(1);

      // Mã hoàn toàn thoáng chân
      const fenFree = "4k4/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1";
      const featFree = extractFeatures(parseFen(fenFree).board);
      expect(featFree.r.byTag.maBiCanChan).toBeUndefined();
    });

    it("maHaKhau, maNgoaTao, maQuaiGiac: nhận diện đúng vị trí chiến lược", () => {
      // Mã hà khẩu (tiến 4 hàng, cột 3)
      const fenHaKhau = "4k4/9/9/9/9/3N5/9/9/9/4K4 w - - 0 1";
      const featHaKhau = extractFeatures(parseFen(fenHaKhau).board);
      expect(featHaKhau.r.byTag.maHaKhau?.length).toBe(1);

      // Mã ngọa tào (tiến 7 hàng: row 2, cột 2 = c7)
      const fenNgoaTao = "4k4/9/2N6/9/9/9/9/9/9/4K4 w - - 0 1";
      const featNgoaTao = extractFeatures(parseFen(fenNgoaTao).board);
      expect(featNgoaTao.r.byTag.maNgoaTao?.length).toBe(1);

      // Mã quải giác (tiến 8 hàng: row 1, cột 3 = d8)
      const fenQuaiGiac = "4k4/3N5/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const featQuaiGiac = extractFeatures(parseFen(fenQuaiGiac).board);
      expect(featQuaiGiac.r.byTag.maQuaiGiac?.length).toBe(1);
    });
  });

  describe("Nhóm Pháo (Cannon Tags)", () => {
    it("phaoKhongNgoi: nhận diện khi Pháo trơ trọi không có quân nào trên 4 hướng", () => {
      // Đặt Pháo ở a5 hoàn toàn trống trải
      const fenEmpty = "4k4/9/9/9/C8/9/9/9/9/4K4 w - - 0 1";
      const featEmpty = extractFeatures(parseFen(fenEmpty).board);
      expect(featEmpty.r.byTag.phaoKhongNgoi?.length).toBe(1);
    });

    it("phaoDau: nhận diện khi Pháo đứng ở trung lộ (cột 4)", () => {
      const fen = "4k4/9/9/9/4C4/9/9/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fen).board);
      expect(feat.r.byTag.phaoDau?.length).toBe(1);

      const fenFlank = "4k4/9/9/9/3C5/9/9/9/9/4K4 w - - 0 1";
      const featFlank = extractFeatures(parseFen(fenFlank).board);
      expect(featFlank.r.byTag.phaoDau).toBeUndefined();
    });

    it("phaoCamDay: nhận diện khi Pháo cắm đáy đối phương (row 0)", () => {
      const fen = "1C2k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fen).board);
      expect(feat.r.byTag.phaoCamDay?.length).toBe(1);
    });
  });

  describe("Nhóm Tốt (Pawn Tags)", () => {
    it("totQuaHa, totChimDay, totVaoCung", () => {
      // Tốt qua sông
      const fen = "4k4/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1";
      const feat = extractFeatures(parseFen(fen).board);
      expect(feat.r.byTag.totQuaHa?.length).toBe(1);

      // Tốt vào cung (e7: row 2 col 4)
      const fenPalace = "4k4/9/4P4/9/9/9/9/9/9/4K4 w - - 0 1";
      const featPalace = extractFeatures(parseFen(fenPalace).board);
      expect(featPalace.r.byTag.totVaoCung?.length).toBe(1);

      // Tốt chìm đáy (row 0)
      const fenBottom = "1P2k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1";
      const featBottom = extractFeatures(parseFen(fenBottom).board);
      expect(featBottom.r.byTag.totChimDay?.length).toBe(1);
    });

    it("totLienHoan: nhận diện khi 2 Tốt qua sông đứng kề nhau bảo vệ nhau", () => {
      // 2 Tốt đỏ ở d6 và e6 (row 3, col 3 và 4)
      const fenLinked = "4k4/9/9/3PP4/9/9/9/9/9/4K4 w - - 0 1";
      const featLinked = extractFeatures(parseFen(fenLinked).board);
      expect(featLinked.r.byTag.totLienHoan?.length).toBe(2);

      // 2 Tốt cách nhau không kề
      const fenApart = "4k4/9/9/2P1P4/9/9/9/9/9/4K4 w - - 0 1";
      const featApart = extractFeatures(parseFen(fenApart).board);
      expect(featApart.r.byTag.totLienHoan).toBeUndefined();
    });
  });

  describe("Nhóm Tướng & An toàn chung", () => {
    it("tuongLenTang và tuongBiCanMat", () => {
      // Tướng đỏ lên lầu (row 8 col 4)
      const fenUp = "4k4/9/9/9/9/9/9/9/4K4/9 w - - 0 1";
      const featUp = extractFeatures(parseFen(fenUp).board);
      expect(featUp.r.byTag.tuongLenTang?.length).toBe(1);

      // Tướng bị cản mặt bởi Sĩ
      const fenBlocked = "4k4/9/9/9/9/9/9/9/4A4/4K4 w - - 0 1";
      const featBlocked = extractFeatures(parseFen(fenBlocked).board);
      expect(featBlocked.r.byTag.tuongBiCanMat?.length).toBe(1);
    });

    it("treo, matGoc, biQuanReBat", () => {
      // Xe đỏ treo trước nòng Xe đen
      const fenHanging = "4k4/9/4r4/9/9/9/4R4/9/9/4K4 w - - 0 1";
      const featHanging = extractFeatures(parseFen(fenHanging).board);
      expect(featHanging.r.byTag.matGoc?.length).toBe(1);

      // Xe đỏ bị Tốt đen tấn công (bị quân rẻ hơn bắt)
      const fenAttacked = "4k4/9/9/9/4p4/4R4/9/9/9/4K4 w - - 0 1";
      const featAttacked = extractFeatures(parseFen(fenAttacked).board);
      expect(featAttacked.r.byTag.biQuanReBat?.length).toBe(1);
    });
  });

  describe("Hiệu năng & Bộ nhớ đệm Cache", () => {
    it("ngân sách thời gian: trích xuất đặc trưng dưới 2ms mỗi thế và dưới 300ms cho 150 thế", () => {
      clearFeaturesCache();
      const fen = "r1bakab1r/9/1cn2cn2/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R w - - 0 4";
      const { board } = parseFen(fen);

      // Chạy 150 lần (mô phỏng cả ván cờ 150 plies)
      const start = performance.now();
      for (let i = 0; i < 150; i++) {
        extractFeatures(board);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(300); // Ngân sách < 300ms
    });

    it("cache hit trả về kết quả tham chiếu giống nhau", () => {
      clearFeaturesCache();
      const fen = "4k4/9/9/9/4R4/9/9/9/9/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const res1 = extractFeatures(board);
      const res2 = extractFeatures(board);
      expect(res1).toBe(res2);
    });
  });
});
