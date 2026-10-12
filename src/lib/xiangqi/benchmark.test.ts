import { describe, expect, it } from "vitest";
import { parseFen } from "./engine";
import { choosePlan, strategicScore, WEIGHTS } from "./strategy";
import { detectTheoreticalEndgame } from "./endgame";
import { BENCHMARK_POSITIONS } from "./benchmark-positions";

describe("Benchmark Test Suite - Bộ 30+ thế cờ mẫu kiểm chuẩn và hồi quy", () => {
  it("chứa ít nhất 30 thế cờ mẫu", () => {
    expect(BENCHMARK_POSITIONS.length).toBeGreaterThanOrEqual(30);
  });

  describe("Hiệu chuẩn và kiểm tra bảng trọng số WEIGHTS", () => {
    it("kế hoạch raQuan: trọng số raQuan cao nhất để khuyến khích phát triển quân", () => {
      expect(WEIGHTS.raQuan.raQuan).toBeGreaterThanOrEqual(WEIGHTS.raQuan.apLuc);
      expect(WEIGHTS.raQuan.raQuan).toBeGreaterThanOrEqual(WEIGHTS.raQuan.tot);
    });

    it("kế hoạch phongThu: trọng số anToan cao nhất để giữ cung tướng", () => {
      expect(WEIGHTS.phongThu.anToan).toBeGreaterThanOrEqual(WEIGHTS.phongThu.apLuc);
      expect(WEIGHTS.phongThu.anToan).toBeGreaterThanOrEqual(WEIGHTS.phongThu.raQuan);
    });

    it("kế hoạch tanCong: trọng số apLuc cao để uy hiếp cung tướng đối phương", () => {
      expect(WEIGHTS.tanCong.apLuc).toBeGreaterThanOrEqual(WEIGHTS.tanCong.anToan);
      expect(WEIGHTS.tanCong.totVaoCung).toBeGreaterThan(0);
      expect(WEIGHTS.tanCong.khuyetSi).toBeGreaterThan(0);
    });

    it("kế hoạch tanCuoc: trọng số tốt và totVaoCung cao để đẩy tốt qua sông", () => {
      expect(WEIGHTS.tanCuoc.tot).toBeGreaterThanOrEqual(2);
      expect(WEIGHTS.tanCuoc.totVaoCung).toBeGreaterThanOrEqual(3);
      expect(WEIGHTS.tanCuoc.khuyetSi).toBeGreaterThanOrEqual(2);
    });

    it("kế hoạch donGianHoa: giữ anToan và matGoc khi đang ưu thế", () => {
      expect(WEIGHTS.donGianHoa.anToan).toBeGreaterThanOrEqual(2);
      expect(WEIGHTS.donGianHoa.matGoc).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Kiểm tra phân loại và đánh giá từng thế cờ mẫu", () => {
    for (const pos of BENCHMARK_POSITIONS) {
      it(`[${pos.id}] ${pos.name}`, () => {
        const { board, turn } = parseFen(pos.fen);

        // 1. Kiểm tra kế hoạch chiến lược (nếu có kỳ vọng)
        if (pos.expected.plan) {
          // Trích xuất ply từ FEN nếu có, mặc định theo category
          const ply = pos.category === "opening" ? 2 : pos.category === "strategy" ? 30 : 40;
          const plan = choosePlan(board, turn, ply);
          expect(plan).toBe(pos.expected.plan);

          // Điểm chiến lược tổng phải tính toán được (không bị NaN hay undefined)
          const score = strategicScore(board, turn, plan);
          expect(Number.isFinite(score)).toBe(true);
        }

        // 2. Kiểm tra tàn cuộc lý thuyết (nếu thuộc category endgame)
        if (pos.category === "endgame") {
          const eg = detectTheoreticalEndgame(board);
          expect(eg).not.toBeNull();
          if (pos.expected.endgameOutcome) {
            expect(eg?.outcome).toBe(pos.expected.endgameOutcome);
          }
          if (pos.expected.endgameWinner) {
            expect(eg?.winner).toBe(pos.expected.endgameWinner);
          }
          if (pos.expected.endgameId) {
            expect(eg?.id).toBe(pos.expected.endgameId);
          }
        }
      });
    }
  });
});
