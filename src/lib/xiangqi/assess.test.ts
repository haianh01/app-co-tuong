import { describe, expect, it } from "vitest";
import { parseFen } from "./engine";
import { assessPosition, FACTOR_NAMES } from "./assess";
import { sentence } from "./explain";
import { uciToMove } from "./uci";

describe("assess.ts - Đánh giá thế cờ & phân tích 9 yếu tố kỳ lý (B2)", () => {
  it("thế cờ ban đầu: đánh giá cân bằng (leader: null)", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const { board } = parseFen(fen);
    const result = assessPosition(board);

    expect(result.kind).toBe("assessment");
    expect(result.leader).toBeNull();
    expect(result.dynamic).toBe(false);
  });

  describe("Phân tích các yếu tố kỳ lý đơn lẻ", () => {
    it("vatChat: nhận diện ưu thế khi một bên hơn hẳn 1 Xe", () => {
      // Đỏ hơn hẳn 1 Xe (Đen mất Xe cánh trái)
      const fen = "1nbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 850 });

      expect(result.leader).toBe("r");
      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.factors[0].id).toBe("vatChat");
      expect(result.factors[0].side).toBe("r");
      expect(result.factors[0].weight).toBeGreaterThan(500);
      expect(result.factors[0].pieces.length).toBeGreaterThan(0);
    });

    it("anToanTuong: nhận diện khi cung tướng đối phương bị ép nghẹt thở", () => {
      // Đen trơ trọi không có Sĩ Tượng, 2 Xe đỏ ép cung
      const fen = "r3k1n2/9/9/9/2R1R4/9/4N4/4C4/4A4/4K4 w - - 0 30";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 400 });

      expect(result.leader).toBe("r");
      const hasKingSafety = result.factors.some((f) => f.id === "anToanTuong");
      expect(hasKingSafety).toBe(true);
    });

    it("hoatDongXe: nhận diện ưu thế khi Xe chiếm lộ thông và cắm đáy", () => {
      // Xe đỏ ở cột b lộ thông và cắm đáy, Xe đen bị kìm trong góc
      const fen = "1R2k4/9/9/9/9/9/9/9/r8/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 200 });

      expect(result.leader).toBe("r");
      const rookFactor = result.factors.find((f) => f.id === "hoatDongXe");
      expect(rookFactor).toBeDefined();
      expect(rookFactor?.side).toBe("r");
    });

    it("hoatDongMa: nhận diện khi Mã ngọa tào và hà khẩu áp đảo", () => {
      // Mã đỏ ở c7 (ngọa tào), Mã đen bị cản chân ở biên
      const fen = "4k4/9/2N6/9/9/9/9/9/n8/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 180 });

      expect(result.leader).toBe("r");
      const horseFactor = result.factors.find((f) => f.id === "hoatDongMa");
      expect(horseFactor).toBeDefined();
    });

    it("phao: nhận diện sức ép của Pháo đầu", () => {
      // Pháo đỏ đứng đầu trung lộ (cột 4)
      const fen = "4k4/9/9/9/4C4/9/9/9/9/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 100 });

      const cannonFactor = result.factors.find((f) => f.id === "phao");
      expect(cannonFactor).toBeDefined();
      expect(cannonFactor?.side).toBe("r");
    });

    it("totQuaHa: nhận diện ưu thế Tốt qua sông áp sát cửu cung", () => {
      // 2 Tốt đỏ liên hoàn trong cửu cung đối phương
      const fen = "4k4/9/3PP4/9/9/9/9/9/9/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 350 });

      expect(result.leader).toBe("r");
      const pawnFactor = result.factors.find((f) => f.id === "totQuaHa");
      expect(pawnFactor).toBeDefined();
      expect(pawnFactor?.pieces.length).toBeGreaterThan(0);
    });

    it("quanKem: nhận diện khi đối phương có quân bị treo và mất gốc", () => {
      // Xe đỏ e1 được Tướng e0 bảo vệ; Xe đen e7 bị treo chơ vơ trước nòng Xe đỏ
      const fen = "4k4/9/4r4/9/9/9/9/9/4R4/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 250 });

      const flawFactor = result.factors.find((f) => f.id === "quanKem");
      expect(flawFactor).toBeDefined();
      expect(flawFactor?.side).toBe("r");
    });

    it("sangKien: nhận diện từ chuỗi nước ép buộc liên tiếp trong PV", () => {
      // Hai bên ngang quân, Đỏ có sáng kiến với chuỗi nước ép buộc liên tiếp
      const fen = "4k4/9/9/9/4r4/9/9/4R4/9/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const pv = [uciToMove("e2e9")!, uciToMove("e8e9")!];
      const result = assessPosition(board, { evalCp: 250, pv, turn: "r" });

      const initFactor = result.factors.find((f) => f.id === "sangKien");
      expect(initFactor).toBeDefined();
      expect(initFactor?.side).toBe("r");
    });

    it("khuyetSiTuong: nhận diện khi đối phương khuyết Sĩ đối mặt với Mã", () => {
      // Đen khuyết toàn bộ Sĩ, Đỏ còn Mã
      const fen = "4k4/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 250 });

      const guardFactor = result.factors.find((f) => f.id === "khuyetSiTuong");
      expect(guardFactor).toBeDefined();
    });
  });

  describe("Cơ chế Dynamic (Không bịa lý do khi ưu thế từ biến sâu)", () => {
    it("đặt dynamic: true khi điểm engine lớn (>150cp) mà yếu tố tĩnh giải thích < 40%", () => {
      // Bàn cờ ban đầu cân bằng, nhưng engine thấy biến sâu dẫn tới điểm cao
      const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const { board } = parseFen(fen);
      const pv = [uciToMove("h2e2")!];
      const result = assessPosition(board, { evalCp: 350, pv, turn: "r" });

      expect(result.dynamic).toBe(true);
      expect(result.summary).toContain("Ưu thế đến từ");
    });

    it("đặt dynamic: false khi các yếu tố tĩnh giải thích thỏa đáng (>= 40%)", () => {
      // Đỏ hơn 1 Xe nguyên vẹn (900cp), yếu tố tĩnh giải thích > 80%
      const fen = "1nbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const { board } = parseFen(fen);
      const result = assessPosition(board, { evalCp: 850 });

      expect(result.dynamic).toBe(false);
      expect(result.summary).toBeUndefined();
    });
  });

  describe("Ghép câu bằng sentence() trong explain.ts", () => {
    it("sinh câu giải thích cho đánh giá tĩnh có leader", () => {
      const fen = "1nbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const { board } = parseFen(fen);
      const assessment = assessPosition(board, { evalCp: 850 });

      const text = sentence(assessment, "r", 0);
      expect(text).toContain("Đỏ");
      expect(text).toContain(FACTOR_NAMES.vatChat);
    });

    it("sinh câu giải thích cho đánh giá dynamic", () => {
      const assessment = assessPosition(
        parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1").board,
        {
          evalCp: 350,
          pv: [uciToMove("h2e2")!],
          turn: "r",
        },
      );

      const text = sentence(assessment, "r", 0);
      expect(text).toContain("Ưu thế đến từ chuỗi biến");
    });

    it("sinh câu giải thích cho thế cờ cân bằng", () => {
      const assessment = assessPosition(parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1").board, {
        evalCp: 0,
      });

      const text = sentence(assessment, "r", 0);
      expect(text).toContain("cân bằng");
    });
  });

  describe("Hiệu năng (Performance)", () => {
    it("ngân sách thời gian: assessPosition chạy dưới 2ms mỗi thế", () => {
      const fen = "r1bakab1r/9/1cn2cn2/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R w - - 0 4";
      const { board } = parseFen(fen);

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        assessPosition(board, { evalCp: 15 });
      }
      const duration = performance.now() - start;

      // 100 lần chạy dưới 200ms -> trung bình < 2ms mỗi thế
      expect(duration).toBeLessThan(200);
    });
  });
});
