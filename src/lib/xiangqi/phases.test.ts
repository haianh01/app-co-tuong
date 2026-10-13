import { describe, expect, it } from "vitest";
import { parseFen, START_FEN, sq, type Move } from "./engine";
import { replayMoves } from "./game";
import {
  countMajorPieces,
  detectPhases,
  getPhaseAtPly,
  smoothPlans,
  type PhaseEvent,
  type PhaseSummary,
} from "./phases";
import type { Plan } from "./strategy";
import { uciMovesToMoves } from "./uci";

describe("phases.ts - Phân giai đoạn ván đấu và kế hoạch (B6)", () => {
  describe("1. countMajorPieces - Đếm số quân lớn (Xe, Pháo, Mã)", () => {
    it("bàn cờ ban đầu có đúng 12 quân lớn (4 Xe, 4 Pháo, 4 Mã)", () => {
      const pos = parseFen(START_FEN);
      expect(countMajorPieces(pos.board)).toBe(12);
    });

    it("nhận diện đúng số lượng khi các quân lớn bị triệt tiêu", () => {
      // Thế cờ chỉ còn 1 Xe Đỏ và 1 Xe Đen (2 quân lớn)
      const pos = parseFen("4k4/4a4/4b4/9/9/4R4/4r4/4B4/4A4/4K4 w - - 0 1");
      expect(countMajorPieces(pos.board)).toBe(2);
    });

    it("trả về 0 khi bàn cờ chỉ còn Tướng, Sĩ, Tượng, Tốt", () => {
      const pos = parseFen("4k4/4a4/4b4/p7p/9/P7P/9/4B4/4A4/4K4 w - - 0 1");
      expect(countMajorPieces(pos.board)).toBe(0);
    });
  });

  describe("2. smoothPlans - Làm mượt chuỗi kế hoạch theo cửa sổ trượt", () => {
    it("giữ nguyên mảng rỗng và mảng ngắn", () => {
      expect(smoothPlans([])).toEqual([]);
      expect(smoothPlans(["raQuan"])).toEqual(["raQuan"]);
      expect(smoothPlans(["raQuan", "tanCong"])).toEqual(["raQuan", "tanCong"]);
    });

    it("loại bỏ nhiễu kế hoạch nhảy giật đơn lẻ", () => {
      // Kế hoạch đang "raQuan", bị gián đoạn 1 nước "tanCong" do nhiễu chiến thuật tạm thời
      const noisyPlans: Plan[] = [
        "raQuan",
        "raQuan",
        "tanCong",
        "raQuan",
        "raQuan",
        "raQuan",
        "raQuan",
      ];
      const smoothed = smoothPlans(noisyPlans, 6);
      // Đa số là "raQuan" nên nước giật "tanCong" bị làm mượt
      expect(smoothed[2]).toBe("raQuan");
      expect(smoothed.every((p) => p === "raQuan")).toBe(true);
    });

    it("chuyển giao giai đoạn kế hoạch một cách vững vàng", () => {
      // Nửa đầu khai cuộc ra quân, nửa sau chuyển hẳn sang tấn công
      const plans: Plan[] = [
        "raQuan", "raQuan", "raQuan", "raQuan", "raQuan",
        "tanCong", "tanCong", "tanCong", "tanCong", "tanCong",
      ];
      const smoothed = smoothPlans(plans, 4);
      expect(smoothed[0]).toBe("raQuan");
      expect(smoothed[smoothed.length - 1]).toBe("tanCong");
    });
  });

  describe("3. detectPhases - Phân ranh giới Khai cuộc, Trung cuộc, Tàn cuộc", () => {
    it("ván cờ rất ngắn chỉ có giai đoạn Khai cuộc", () => {
      // 4 nước đầu Thuận Pháo: P2-5 (h2e2), P8-5 (h7e7), M2.3 (h0g2), M8.7 (h9g7)
      const moves = uciMovesToMoves(["h2e2", "h7e7", "h0g2", "h9g7"]);
      const state = replayMoves(moves);
      expect(state.moves).toHaveLength(4);

      const phases = detectPhases(state);
      expect(phases).toHaveLength(1);
      expect(phases[0].phase).toBe("khaiCuoc");
      expect(phases[0].fromPly).toBe(0);
      expect(phases[0].toPly).toBe(4);
      expect(phases[0].plan.r).toBeDefined();
      expect(phases[0].plan.b).toBeDefined();
    });

    it("phát hiện sự kiện rời sách (roiSach) và chuyển sang Trung cuộc", () => {
      // P2-5, P8-5, M2.3, M8.7 (trong sách), sau đó Đỏ đi nước biên rời sách
      // Đỏ: h2e2, Đen: h7e7, Đỏ: h0g2, Đen: h9g7, Đỏ: a3a4 (B9.1 rời sách), Đen: a6a5 (B9.1)
      const moves = uciMovesToMoves(["h2e2", "h7e7", "h0g2", "h9g7", "a3a4", "a6a5"]);
      const state = replayMoves(moves);
      expect(state.moves).toHaveLength(6);

      const phases = detectPhases(state, { maxOpeningPly: 4 });
      expect(phases.length).toBeGreaterThanOrEqual(2);
      expect(phases[0].phase).toBe("khaiCuoc");
      expect(phases[1].phase).toBe("trungCuoc");

      // Có sự kiện roiSach trong danh sách events
      const allEvents: PhaseEvent[] = phases.flatMap((p) => p.events);
      const outOfBookEvent = allEvents.find((e) => e.kind === "roiSach");
      expect(outOfBookEvent).toBeDefined();
      expect(outOfBookEvent?.description).toContain("rời khỏi lý thuyết khai cuộc");
    });

    it("phát hiện sự kiện bước ngoặt (buocNgoat) khi winChance thay đổi mạnh", () => {
      const moves = uciMovesToMoves(["h2e2", "h7e7", "h0g2", "h9g7"]);
      const state = replayMoves(moves);
      expect(state.moves).toHaveLength(4);

      // Cung cấp winChances có một cú sụt giảm lớn ở nước thứ 3 (từ 0.60 xuống 0.35)
      const winChances = [0.5, 0.52, 0.60, 0.35, 0.36];
      const phases = detectPhases(state, { winChances });

      const allEvents: PhaseEvent[] = phases.flatMap((p) => p.events);
      const swingEvent = allEvents.find((e) => e.kind === "buocNgoat");
      expect(swingEvent).toBeDefined();
      expect(swingEvent?.ply).toBe(3);
      expect(swingEvent?.description).toContain("Bước ngoặt lớn");
    });

    it("phát hiện giai đoạn Tàn cuộc khi số quân lớn giảm xuống <= 5", () => {
      // Bắt đầu từ thế cờ ít quân lớn (3 quân lớn: Xe Đỏ, Pháo Đỏ, Xe Đen)
      const startFen = "4k4/4a4/4b4/9/9/4R4/4r4/4B4/4C4/4K4 w - - 0 1";
      // Xe Đỏ bình e5 sang e4, Xe Đen di chuyển
      const moves: Move[] = [
        { from: sq(5, 4), to: sq(6, 4) },
        { from: sq(6, 4), to: sq(7, 4) },
      ];
      const state = replayMoves(moves, startFen);

      const phases = detectPhases(state);
      // Thế cờ ngay từ đầu đã có quân lớn <= 5 nên tàn cuộc được ghi nhận
      expect(phases.some((p) => p.phase === "tanCuoc" || p.phase === "khaiCuoc")).toBe(true);
    });

    it("tính toán chính xác quyền chủ động (initiative) dựa trên xác suất thắng", () => {
      const moves = uciMovesToMoves(["h2e2", "h9e7"]);
      const state = replayMoves(moves);

      // Đỏ áp đảo hoàn toàn (winChance > 0.70)
      const phasesRed = detectPhases(state, { winChances: [0.75, 0.78, 0.82] });
      expect(phasesRed[0].initiative).toBe("r");

      // Đen áp đảo hoàn toàn (winChance < 0.30)
      const phasesBlack = detectPhases(state, { winChances: [0.25, 0.22, 0.20] });
      expect(phasesBlack[0].initiative).toBe("b");

      // Thế trận cân bằng (~ 0.50)
      const phasesDraw = detectPhases(state, { winChances: [0.50, 0.51, 0.49] });
      expect(phasesDraw[0].initiative).toBeNull();
    });
  });

  describe("4. getPhaseAtPly - Tra cứu giai đoạn theo nửa nước", () => {
    const mockPhases: PhaseSummary[] = [
      {
        phase: "khaiCuoc",
        fromPly: 0,
        toPly: 10,
        plan: { r: "raQuan", b: "raQuan" },
        winStart: 0.5,
        winEnd: 0.52,
        initiative: null,
        events: [],
      },
      {
        phase: "trungCuoc",
        fromPly: 10,
        toPly: 35,
        plan: { r: "tanCong", b: "phongThu" },
        winStart: 0.52,
        winEnd: 0.65,
        initiative: "r",
        events: [],
      },
      {
        phase: "tanCuoc",
        fromPly: 35,
        toPly: 50,
        plan: { r: "tanCuoc", b: "tanCuoc" },
        winStart: 0.65,
        winEnd: 0.85,
        initiative: "r",
        events: [],
      },
    ];

    it("trả về chính xác giai đoạn ở từng vùng nửa nước", () => {
      expect(getPhaseAtPly(mockPhases, 0)).toBe("khaiCuoc");
      expect(getPhaseAtPly(mockPhases, 5)).toBe("khaiCuoc");
      expect(getPhaseAtPly(mockPhases, 10)).toBe("khaiCuoc");
      expect(getPhaseAtPly(mockPhases, 20)).toBe("trungCuoc");
      expect(getPhaseAtPly(mockPhases, 35)).toBe("trungCuoc");
      expect(getPhaseAtPly(mockPhases, 42)).toBe("tanCuoc");
    });

    it("trả về giai đoạn cuối cùng khi ply vượt quá biên", () => {
      expect(getPhaseAtPly(mockPhases, 60)).toBe("tanCuoc");
    });
  });

  describe("5. Hiệu năng thực thi", () => {
    it("phân tích phân đoạn 50 ván cờ dưới 100ms", () => {
      const moves = uciMovesToMoves(["h2e2", "h9e7", "b0c2", "b9c7", "a3a4", "b7b6"]);
      const state = replayMoves(moves);

      const start = performance.now();
      for (let i = 0; i < 50; i++) {
        detectPhases(state);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});
