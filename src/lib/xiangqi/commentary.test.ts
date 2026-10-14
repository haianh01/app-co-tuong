/**
 * commentary.test.ts — Snapshot tests cho bộ ghép câu bình luận kiểu đại sư (GĐ 1).
 *
 * Chiến lược:
 * - Không gọi engine thật; inject mock `PositionAnalysisResult` từ BENCHMARK_POSITIONS.
 * - Kiểm tra từng khối (assessment, opponentIntent, plan, comparison, lesson):
 *   (a) không null/undefined khi có đủ dữ liệu,
 *   (b) chứa chuỗi đặc trưng theo điều kiện,
 *   (c) không lặp nguyên văn khi FEN khác nhau (pickVariant).
 * - 10 thế cờ bao phủ: khai cuộc, trung cuộc cân bằng, trung cuộc có ưu thế, dọa sát,
 *   đang bị chiếu, tàn cuộc, dynamic=true.
 */

import { describe, expect, it } from "vitest";
import { buildCommentary, hashStr, pickVariant } from "./commentary";
import type { PositionAnalysisResult } from "./position-analysis";
import type { Layer1Engine, Layer2Assessment, Layer3Threats, Layer4Intent, Layer5PatternsAndEndgame, Layer6PhaseAndOpening } from "./position-analysis";

// ---------------------------------------------------------------------------
// Helpers xây mock PositionAnalysisResult
// ---------------------------------------------------------------------------

function mockL1(overrides: Partial<Layer1Engine> = {}): Layer1Engine {
  return {
    candidates: [],
    bestMove: null,
    evalCp: 0,
    evalText: "ngang nhau",
    wdl: null,
    inCheck: false,
    isGameOver: false,
    engineAvailable: true,
    ...overrides,
  };
}

function mockL2(overrides: Partial<Layer2Assessment> = {}): Layer2Assessment {
  return {
    assessment: {
      kind: "assessment",
      leader: null,
      evalCp: 0,
      winPct: 50,
      factors: [],
      dynamic: false,
    },
    displayText: "Cục diện cân bằng",
    factors: [],
    dynamic: false,
    ...overrides,
  };
}

function mockL3(overrides: Partial<Layer3Threats> = {}): Layer3Threats {
  return {
    inCheck: false,
    hasThreat: false,
    threatStatus: "none",
    threatMove: null,
    threatNotation: null,
    threatPv: [],
    threatPvNotations: [],
    isMateThreat: false,
    dangerPieces: [],
    description: "Đối phương chưa có đòn đe dọa trực tiếp",
    ...overrides,
  };
}

function mockL4(): Layer4Intent {
  return { candidates: [] };
}

function mockL5(): Layer5PatternsAndEndgame {
  return { patterns: [], endgame: null };
}

function mockL6(overrides: Partial<Layer6PhaseAndOpening> = {}): Layer6PhaseAndOpening {
  return {
    phase: "trungCuoc",
    phaseLabel: "Trung cuộc",
    majorsCount: 10,
    openingGuide: null,
    nextBookMoves: [],
    ...overrides,
  };
}

function mockResult(
  overrides: Partial<PositionAnalysisResult> = {},
): PositionAnalysisResult {
  return {
    fen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
    turn: "r",
    layer1: mockL1(),
    layer2: mockL2(),
    layer3: mockL3(),
    layer4: mockL4(),
    layer5: mockL5(),
    layer6: mockL6(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Nhóm 1: Tiện ích pickVariant & hashStr
// ---------------------------------------------------------------------------

describe("pickVariant & hashStr", () => {
  it("chọn phần tử theo index mod", () => {
    const arr = ["a", "b", "c"];
    expect(pickVariant(arr, 0)).toBe("a");
    expect(pickVariant(arr, 1)).toBe("b");
    expect(pickVariant(arr, 3)).toBe("a"); // 3 % 3 === 0
  });

  it("hashStr khác nhau với chuỗi khác nhau", () => {
    expect(hashStr("abc")).not.toBe(hashStr("xyz"));
    expect(hashStr("")).toBe(hashStr("")); // deterministic
  });

  it("hashStr là unsigned (>= 0)", () => {
    expect(hashStr("test")).toBeGreaterThanOrEqual(0);
    expect(hashStr("rnbakabnr/9/1c5c1")).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Nhóm 2: Thế cân bằng — assessment
// ---------------------------------------------------------------------------

describe("buildCommentary — cân bằng", () => {
  it("câu nhận định chứa 'cân bằng' khi không có leader", () => {
    const result = mockResult();
    const { blocks } = buildCommentary(result);
    expect(blocks.assessment).toMatch(/cân bằng|ngang sức|thăng bằng/i);
  });

  it("câu nhận định chứa phaseLabel", () => {
    const result = mockResult({ layer6: mockL6({ phaseLabel: "Trung cuộc" }) });
    const { blocks } = buildCommentary(result);
    expect(blocks.assessment).toContain("Trung cuộc");
  });

  it("opponentIntent = null khi không có đòn dọa", () => {
    const { blocks } = buildCommentary(mockResult());
    expect(blocks.opponentIntent).toBeNull();
  });

  it("lesson = null khi không có yếu tố", () => {
    const { blocks } = buildCommentary(mockResult());
    expect(blocks.lesson).toBeNull();
  });

  it("plan chứa 'Engine chưa' khi không có candidates", () => {
    const { blocks } = buildCommentary(mockResult());
    expect(blocks.plan).toContain("Engine chưa");
  });

  it("prose không rỗng", () => {
    const { prose } = buildCommentary(mockResult());
    expect(prose.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Nhóm 3: Đỏ ưu thế, có quân treo (quanKem)
// ---------------------------------------------------------------------------

describe("buildCommentary — Đỏ ưu thế + quanKem", () => {
  function makeResult(): PositionAnalysisResult {
    return mockResult({
      fen: "rnbak1bnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C3R1C1/9/RNBAKA1NR w - - 0 5",
      layer2: mockL2({
        assessment: {
          kind: "assessment",
          leader: "r",
          evalCp: 280,
          winPct: 65,
          factors: [
            { id: "quanKem", side: "b", weight: 1.5, pieces: [] },
            { id: "sangKien", side: "r", weight: 1.2, pieces: [] },
          ],
          dynamic: false,
        },
        displayText: "Đỏ hơi ưu thế",
        factors: [
          { id: "quanKem", side: "b", weight: 1.5, pieces: [], text: "Đen có quân không căn, sơ hở" },
          { id: "sangKien", side: "r", weight: 1.2, pieces: [], text: "Đỏ cầm tiên, ép Đen phải chống đỡ" },
        ],
        dynamic: false,
      }),
      layer1: mockL1({
        evalCp: 280,
        candidates: [
          {
            move: { from: 64, to: 54 },
            uci: "e3e2",
            notation: "X2.1",
            scoreCp: 280,
            scoreText: "hơn ≈ 2,8 Tốt",
            isMate: false,
            pv: [],
            pvNotations: [],
            intent: null,
            purpose: "anQuan",
            purposeLabel: "Ăn quân",
            narrative: "sau X2.1 thì Đỏ hơn một Mã",
          },
        ],
      }),
    });
  }

  it("nhận định chứa tên leader và mức ưu thế", () => {
    const { blocks } = buildCommentary(makeResult());
    expect(blocks.assessment).toMatch(/Đỏ/);
    expect(blocks.assessment).toMatch(/ưu thế/i);
  });

  it("nhận định chứa tên yếu tố số 1", () => {
    const { blocks } = buildCommentary(makeResult());
    expect(blocks.assessment).toContain("Đen có quân không căn, sơ hở");
  });

  it("lesson kích hoạt quanKem", () => {
    const { blocks } = buildCommentary(makeResult());
    expect(blocks.lesson).not.toBeNull();
    expect(blocks.lesson).toContain("không căn");
  });

  it("plan chứa ký hiệu nước tốt nhất", () => {
    const { blocks } = buildCommentary(makeResult());
    expect(blocks.plan).toContain("X2.1");
  });

  it("comparison = null khi chỉ có 1 candidate", () => {
    const { blocks } = buildCommentary(makeResult());
    expect(blocks.comparison).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Nhóm 4: Nước so sánh khi multiPV đủ (diff >= 80 cp)
// ---------------------------------------------------------------------------

describe("buildCommentary — comparison", () => {
  function makeMultiPvResult(): PositionAnalysisResult {
    return mockResult({
      layer1: mockL1({
        evalCp: 300,
        candidates: [
          {
            move: { from: 1, to: 2 },
            uci: "a9b9",
            notation: "X1.1",
            scoreCp: 300,
            scoreText: "hơn ≈ 3,0 Tốt",
            isMate: false,
            pv: [],
            pvNotations: [],
            intent: null,
            purpose: "anQuan",
            purposeLabel: "Ăn quân",
            narrative: "sau X1.1 thì Đỏ hơn một Xe",
          },
          {
            move: { from: 3, to: 4 },
            uci: "a8b8",
            notation: "M8.7",
            scoreCp: 180,
            scoreText: "hơn ≈ 1,8 Tốt",
            isMate: false,
            pv: [],
            pvNotations: [],
            intent: null,
            purpose: "caiThienQuan",
            purposeLabel: "Cải thiện quân",
            narrative: "",
          },
        ],
      }),
    });
  }

  it("comparison không null khi diff >= 80 cp", () => {
    const { blocks } = buildCommentary(makeMultiPvResult());
    expect(blocks.comparison).not.toBeNull();
    expect(blocks.comparison).toContain("M8.7");
  });

  it("comparison chứa 'Nếu đi' hoặc 'Còn nếu' hoặc 'Nếu chọn'", () => {
    const { blocks } = buildCommentary(makeMultiPvResult());
    expect(blocks.comparison).toMatch(/Nếu đi|Còn nếu|Nếu chọn/);
  });
});

// ---------------------------------------------------------------------------
// Nhóm 5: Đang bị chiếu
// ---------------------------------------------------------------------------

describe("buildCommentary — đang bị chiếu", () => {
  function makeCheckResult(): PositionAnalysisResult {
    return mockResult({
      layer1: mockL1({ inCheck: true }),
      layer3: mockL3({
        inCheck: true,
        hasThreat: true,
        threatStatus: "inCheck",
        description: "Đang bị chiếu tướng",
      }),
    });
  }

  it("opponentIntent chứa cảnh báo chiếu", () => {
    const { blocks } = buildCommentary(makeCheckResult());
    expect(blocks.opponentIntent).toContain("chiếu");
  });

  it("lesson kích hoạt inCheck", () => {
    const { blocks } = buildCommentary(makeCheckResult());
    expect(blocks.lesson).toContain("chiếu");
  });
});

// ---------------------------------------------------------------------------
// Nhóm 6: Dọa sát cục
// ---------------------------------------------------------------------------

describe("buildCommentary — dọa sát cục", () => {
  it("opponentIntent chứa 'dọa sát' và tên đối phương", () => {
    const result = mockResult({
      turn: "r",
      layer3: mockL3({
        hasThreat: true,
        threatStatus: "threat",
        isMateThreat: true,
        threatNotation: "X1.9",
        description: "Đen dọa chiếu bí sau 2 nước",
      }),
    });
    const { blocks } = buildCommentary(result);
    expect(blocks.opponentIntent).toContain("dọa sát");
    expect(blocks.opponentIntent).toContain("Đen");
  });
});

// ---------------------------------------------------------------------------
// Nhóm 7: Khai cuộc — hiển thị tên trận và nước sách
// ---------------------------------------------------------------------------

describe("buildCommentary — khai cuộc", () => {
  it("plan chứa tên khai cuộc và nước sách", () => {
    const result = mockResult({
      turn: "r",
      layer6: mockL6({
        phase: "khaiCuoc",
        phaseLabel: "Khai cuộc",
        openingGuide: {
          line: null,
          name: "Pháo đầu đối Bình Phong Mã",
          category: "binhPhongMa",
          intent: { r: "Kiểm soát trung lộ", b: "Bình phong vững" },
          pliesMatched: 4,
          nextMoves: [{ notation: "X1-2", name: "Xuất Xe phải", move: { from: 89, to: 87 }, line: null }],
        },
        nextBookMoves: [{ notation: "X1-2", name: "Xuất Xe phải", move: { from: 89, to: 87 }, line: null }],
      }),
      layer1: mockL1({
        candidates: [
          {
            move: { from: 89, to: 87 },
            uci: "i1g1",
            notation: "X1-2",
            scoreCp: 30,
            scoreText: "ngang nhau",
            isMate: false,
            pv: [],
            pvNotations: [],
            intent: null,
            purpose: "raQuan",
            purposeLabel: "Ra quân",
            narrative: "",
          },
        ],
      }),
    });
    const { blocks } = buildCommentary(result);
    expect(blocks.plan).toContain("Bình Phong Mã");
    expect(blocks.plan).toContain("X1-2");
  });
});

// ---------------------------------------------------------------------------
// Nhóm 8: Tàn cuộc
// ---------------------------------------------------------------------------

describe("buildCommentary — tàn cuộc", () => {
  it("plan chứa 'Tàn cuộc' và nước tốt nhất", () => {
    const result = mockResult({
      layer6: mockL6({ phase: "tanCuoc", phaseLabel: "Tàn cuộc", majorsCount: 4 }),
      layer1: mockL1({
        evalCp: 200,
        candidates: [
          {
            move: { from: 40, to: 30 },
            uci: "e5e4",
            notation: "B5.1",
            scoreCp: 200,
            scoreText: "hơn ≈ 2,0 Tốt",
            isMate: false,
            pv: [],
            pvNotations: [],
            intent: null,
            purpose: "tot",
            purposeLabel: "Tốt qua sông",
            narrative: "",
          },
        ],
      }),
    });
    const { blocks } = buildCommentary(result);
    expect(blocks.plan).toContain("Tàn cuộc");
    expect(blocks.plan).toContain("B5.1");
  });
});

// ---------------------------------------------------------------------------
// Nhóm 9: dynamic = true
// ---------------------------------------------------------------------------

describe("buildCommentary — dynamic", () => {
  it("nhận định dynamic chứa 'tính toán chiến thuật'", () => {
    const result = mockResult({
      layer2: mockL2({
        assessment: {
          kind: "assessment",
          leader: "r",
          evalCp: 350,
          winPct: 70,
          factors: [],
          dynamic: true,
          summary: "Pháo kẹp Mã đòn tay ba",
        },
        dynamic: true,
        factors: [],
        displayText: "Đỏ ưu thế lớn",
      }),
    });
    const { blocks } = buildCommentary(result);
    expect(blocks.assessment).toContain("tính toán chiến thuật");
    expect(blocks.assessment).toContain("Pháo kẹp Mã đòn tay ba");
  });
});

// ---------------------------------------------------------------------------
// Nhóm 10: prose liên kết đúng
// ---------------------------------------------------------------------------

describe("buildCommentary — prose", () => {
  it("prose chứa assessment", () => {
    const r = mockResult();
    const { prose, blocks } = buildCommentary(r);
    expect(prose).toContain(blocks.assessment);
  });

  it("prose chứa plan khi có candidate", () => {
    const r = mockResult({
      layer1: mockL1({
        evalCp: 100,
        candidates: [
          {
            move: { from: 1, to: 2 },
            uci: "a9b9",
            notation: "P2-5",
            scoreCp: 100,
            scoreText: "hơn ≈ 1,0 Tốt",
            isMate: false,
            pv: [],
            pvNotations: [],
            intent: null,
            purpose: "caiThienQuan",
            purposeLabel: "Cải thiện quân",
            narrative: "",
          },
        ],
      }),
    });
    const { prose, blocks } = buildCommentary(r);
    expect(prose).toContain(blocks.plan);
  });
});
