import { describe, expect, it } from "vitest";
import { parseFen, sq } from "./engine";
import {
  canHorseReach,
  countBetween,
  detectPatterns,
  hasPattern,
} from "./patterns";

describe("patterns.ts - Bộ nhận diện hình sát cục kinh điển", () => {
  describe("5 sát pháp bổ sung (định nghĩa theo 36 sát pháp cơ bản)", () => {
    it("Bạt hoàng Mã: Xe đỏ đứng chặn chân Mã đang nhắm Tướng", () => {
      // Mã đỏ d7 nhắm Tướng e9 qua chân d8, Xe đỏ đứng ở d8: Xe đi là Mã chiếu.
      const b = parseFen("4k4/3R5/3N5/4p4/9/9/9/9/9/4K4 w").board;
      expect(hasPattern(b, "r", "bat_hoang_ma")).toBe(true);
    });

    it("Bạt hoàng Mã: chân Mã bị Mã đối phương chặn thì không phải", () => {
      const b = parseFen("4k4/3n5/3N5/4p4/9/9/9/9/9/4K4 w").board;
      expect(hasPattern(b, "r", "bat_hoang_ma")).toBe(false);
    });

    it("Pháo niễn đan sa: Pháo chìm đáy ăn được Sĩ qua ngòi Tượng, Xe đỏ sát đáy", () => {
      const b = parseFen("C1bak4/8R/9/4p4/9/9/9/9/9/4K4 w").board;
      expect(hasPattern(b, "r", "phao_nien_dan_sa")).toBe(true);
    });

    it("Pháo niễn đan sa: không có Xe phối hợp sát đáy thì không phải", () => {
      const b = parseFen("C1bak4/9/9/4p4/9/9/9/9/9/R3K4 w").board;
      expect(hasPattern(b, "r", "phao_nien_dan_sa")).toBe(false);
    });

    it("Tống Phật quy điện: Tốt có Xe bảo vệ chiếu Tướng đã lên tầng", () => {
      const b = parseFen("9/4k4/4P3R/9/9/9/9/9/9/3K5 b").board;
      expect(hasPattern(b, "r", "tong_phat_quy_dien")).toBe(true);
    });

    it("Tống Phật quy điện: Tốt không ai bảo vệ (Tướng ăn được) thì không phải", () => {
      const b = parseFen("9/4k4/4P4/9/9/9/9/9/9/3K5 b").board;
      expect(hasPattern(b, "r", "tong_phat_quy_dien")).toBe(false);
    });

    it("Thần áp quân: Xe đen chặn ô thoát của chính Tướng đen khi bị Xe đỏ chiếu ngang", () => {
      const b = parseFen("3rk3R/9/4P4/9/9/9/9/9/9/3K5 b").board;
      expect(hasPattern(b, "r", "than_ap_quan")).toBe(true);
    });

    it("Thần áp quân: ô thoát bị Sĩ chặn (không phải quân tấn công) thì không phải", () => {
      const b = parseFen("3ak3R/9/4P4/9/9/9/9/9/9/3K5 b").board;
      expect(hasPattern(b, "r", "than_ap_quan")).toBe(false);
    });

    it("Tam tử quy biên: Xe Mã Pháo đỏ cùng dồn về cánh trái cung đen", () => {
      const b = parseFen("4k4/R8/1C7/2N6/4p4/9/9/9/9/4K4 w").board;
      expect(hasPattern(b, "r", "tam_tu_quy_bien")).toBe(true);
    });

    it("Tam tử quy biên: một quân ở cánh kia thì chưa phải", () => {
      const b = parseFen("4k4/R8/7C1/2N6/4p4/9/9/9/9/4K4 w").board;
      expect(hasPattern(b, "r", "tam_tu_quy_bien")).toBe(false);
    });
  });

  describe("Hàm phụ trợ hình học", () => {
    it("countBetween đếm đúng số quân giữa hai ô", () => {
      // Bàn cờ rỗng trừ 1 quân ở (4, 4)
      const pos = parseFen("4k4/9/9/9/4P4/9/9/9/9/4K4 w");
      // Giữa (0, 4) và (9, 4) có 1 quân P ở (4, 4)
      expect(countBetween(pos.board, sq(0, 4), sq(9, 4))).toBe(1);
      // Giữa (0, 4) và (4, 4) không có quân nào
      expect(countBetween(pos.board, sq(0, 4), sq(4, 4))).toBe(0);
      // Không cùng hàng hoặc cột: trả về -1
      expect(countBetween(pos.board, sq(0, 0), sq(1, 1))).toBe(-1);
    });

    it("canHorseReach kiểm tra chân Mã chính xác", () => {
      // Mã ở (2, 2) nhảy tới (0, 3) (dr = -2, dc = 1). Ô cản chân là (1, 2)
      const openBoard = parseFen("4k4/9/2N6/9/9/9/9/9/9/4K4 w");
      expect(canHorseReach(openBoard.board, sq(2, 2), sq(0, 3))).toBe(true);

      // Đặt 1 quân cản chân ở (1, 2)
      const blockedBoard = parseFen("4k4/2p6/2N6/9/9/9/9/9/9/4K4 w");
      expect(canHorseReach(blockedBoard.board, sq(2, 2), sq(0, 3))).toBe(false);
    });
  });

  describe("1. Mã hậu Pháo (ma_hau_phao)", () => {
    it("nhận diện đúng khi Pháo mượn Mã làm ngòi chiếu Tướng", () => {
      // Pháo đỏ ở (6, 4), Mã đỏ ở (3, 4), Tướng đen ở (0, 4)
      const pos = parseFen("4k4/9/9/4N4/9/9/4C4/9/9/4K4 w");
      const res = detectPatterns(pos.board, "r");
      expect(res.some((p) => p.id === "ma_hau_phao")).toBe(true);
      expect(hasPattern(pos.board, "r", "ma_hau_phao")).toBe(true);
    });

    it("KHÔNG nhận diện khi có quân khác chen vào giữa Pháo và Mã", () => {
      // Có Tốt ở (5, 4) chen giữa Pháo (6, 4) và Mã (3, 4)
      const pos = parseFen("4k4/9/9/4N4/9/4p4/4C4/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "ma_hau_phao")).toBe(false);
    });
  });

  describe("2. Trùng Pháo (trung_phao)", () => {
    it("nhận diện đúng hai Pháo cùng lộ chiếu Tướng", () => {
      // Pháo 1 ở (2, 4), Pháo 2 ở (4, 4), Sĩ đen ở (1, 4) làm ngòi, Tướng đen ở (0, 4)
      const pos = parseFen("4k4/4a4/4C4/9/4C4/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "trung_phao")).toBe(true);
    });

    it("KHÔNG nhận diện khi có quân cản giữa 2 Pháo", () => {
      // Có quân ở (3, 4) chen giữa 2 Pháo
      const pos = parseFen("4k4/4a4/4C4/4p4/4C4/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "trung_phao")).toBe(false);
    });
  });

  describe("3. Thiết môn xuyên (thiet_mon_xuyen)", () => {
    it("nhận diện đúng Pháo đầu cột 4 kết hợp Xe cắm đáy", () => {
      // Tướng đen ở (0, 4), Xe đỏ cắm đáy ở (0, 0), Pháo đỏ ở (5, 4) cột 4
      const pos = parseFen("R3k4/9/9/9/9/4C4/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "thiet_mon_xuyen")).toBe(true);
    });

    it("KHÔNG nhận diện nếu Pháo không nằm ở cột trung lộ", () => {
      // Pháo nằm ở cột 3 (5, 3) thay vì cột 4
      const pos = parseFen("R3k4/9/9/9/9/3C5/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "thiet_mon_xuyen")).toBe(false);
    });
  });

  describe("4. Song Xe thác (song_xe_thac)", () => {
    it("nhận diện đúng khi 2 Xe cùng áp sát cung Tướng", () => {
      // 2 Xe đỏ ở (0, 1) và (1, 7) gần cung Đen
      const pos = parseFen("1R2k4/7R1/9/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "song_xe_thac")).toBe(true);
    });

    it("KHÔNG nhận diện khi 1 Xe vẫn ở xa cung", () => {
      // 1 Xe ở (0, 1), 1 Xe ở (9, 0) sân nhà
      const pos = parseFen("1R2k4/9/9/9/9/9/9/9/9/R3K4 w");
      expect(hasPattern(pos.board, "r", "song_xe_thac")).toBe(false);
    });
  });

  describe("5. Bạch kiểm tướng (bach_kiem_tuong)", () => {
    it("nhận diện đúng khi hai Tướng lộ mặt và có Xe chiếu ngang", () => {
      // Tướng đỏ ở (9, 4), Tướng đen ở (0, 4) lộ mặt thông suốt, Xe đỏ ở (0, 1) chiếu ngang
      const pos = parseFen("1R2k4/9/9/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "bach_kiem_tuong")).toBe(true);
    });

    it("KHÔNG nhận diện nếu giữa 2 Tướng có quân che mặt", () => {
      // Tốt ở (4, 4) che mặt 2 Tướng
      const pos = parseFen("1R2k4/9/9/9/4P4/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "bach_kiem_tuong")).toBe(false);
    });
  });

  describe("6. Ngọa tào Mã (ngoa_tao_ma)", () => {
    it("nhận diện đúng Mã ở ô ngọa tào (1, 1) không bị cản chân", () => {
      const pos = parseFen("4k4/1N7/9/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "ngoa_tao_ma")).toBe(true);
    });
  });

  describe("7. Điếu ngư Mã (dieu_ngu_ma)", () => {
    it("nhận diện đúng Mã câu cá ở ô (2, 2)", () => {
      const pos = parseFen("4k4/9/2N6/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "dieu_ngu_ma")).toBe(true);
    });
  });

  describe("8. Bát giác Mã (bat_giac_ma)", () => {
    it("nhận diện đúng Mã ở ô Bát giác (2, 3)", () => {
      // Mã ở (2, 3) nhảy chiếu Tướng ở (0, 4) không bị cản chân
      const pos = parseFen("4k4/9/3N5/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "bat_giac_ma")).toBe(true);
    });
  });

  describe("9. Muộn cung (muon_cung)", () => {
    it("nhận diện đúng khi Tướng kẹt giữa 2 Sĩ và bị Xe chiếu thẳng mặt", () => {
      // Tướng đen ở (0, 4), 2 Sĩ đen ở (0, 3) và (0, 5), Xe đỏ ở (2, 4) chiếu
      const pos = parseFen("3aka3/9/4R4/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "muon_cung")).toBe(true);
    });

    it("KHÔNG nhận diện nếu 1 Sĩ đã rời vị trí", () => {
      // Chỉ còn 1 Sĩ ở (0, 3)
      const pos = parseFen("3ak4/9/4R4/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "muon_cung")).toBe(false);
    });
  });

  describe("10. Đại đao khu oa (dai_dao_khu_oa)", () => {
    it("nhận diện đúng khi Xe đâm thẳng vào tâm cung (1, 4)", () => {
      const pos = parseFen("4k4/4R4/9/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "dai_dao_khu_oa")).toBe(true);
    });
  });

  describe("11. Nhị quỷ phách môn (nhi_quy_phach_mon)", () => {
    it("nhận diện đúng khi hai Tốt áp sát nách cung", () => {
      // Hai Tốt đỏ ở (1, 3) và (1, 5) áp sát Tướng đen ở (0, 4)
      const pos = parseFen("4k4/3P1P3/9/9/9/9/9/9/9/4K4 w");
      expect(hasPattern(pos.board, "r", "nhi_quy_phach_mon")).toBe(true);
    });
  });

  describe("Hiệu năng kiểm tra", () => {
    it("quét toàn bộ 22 hình cờ 1.000 lần phải chạy dưới 300ms (<0.3ms/lần)", () => {
      const pos = parseFen("r1bakab1r/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w");
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        detectPatterns(pos.board);
      }
      const elapsed = performance.now() - start;
      // 1.000 lần quét cho cả 2 phe (34.000 lượt kiểm tra)
      expect(elapsed).toBeLessThan(300);
    });
  });
});
