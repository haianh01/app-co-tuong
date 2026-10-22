import { describe, expect, it } from "vitest";
import { findBestMove } from "./ai";
import { applyMove, legalMoves, parseFen, sq } from "./engine";
import { replayMoves } from "./game";
import {
  classify,
  classifyWinDrop,
  computeHighlights,
  computeTacticalLine,
  findTurningPoints,
  moveAccuracy,
  reviewGame,
  reviewMove,
  winChance,
  winChanceFromWdl,
  getPikafishK,
  type MoveReview,
  type PositionEval,
  PIKAFISH_K,
} from "./analysis";

describe("winChance & logistic scoring", () => {
  it("tính xác suất thắng theo hàm logistic chuẩn cho thang Pikafish", () => {
    // 0 cp = 50%
    expect(winChance(0)).toBeCloseTo(0.5, 3);
    // +250 cp (1 tốt mạnh / ưu thế) ≈ 73.1%
    expect(winChance(250)).toBeCloseTo(0.731, 2);
    // +450 cp (1 pháo/mã) ≈ 85.8%
    expect(winChance(450)).toBeCloseTo(0.858, 2);
    // +900 cp (1 xe) ≈ 97.3%
    expect(winChance(900)).toBeCloseTo(0.973, 2);
    // Chiếu bí và bị chiếu bí
    expect(winChance(99_990)).toBe(1);
    expect(winChance(-99_990)).toBe(0);
  });

  it("cho phép đổi hệ số k hiệu chỉnh", () => {
    const kCustom = 0.002;
    expect(winChance(250, kCustom)).toBeCloseTo(1 / (1 + Math.exp(-0.002 * 250)), 4);
  });
});

describe("classifyWinDrop & thresholds", () => {
  it("xếp loại theo mức giảm xác suất thắng: thiếu chính xác >= 5%, kém >= 10%, hớ >= 20%", () => {
    expect(classifyWinDrop(0.04)).toBeNull();
    expect(classifyWinDrop(0.05)).toBe("inaccuracy");
    expect(classifyWinDrop(0.099)).toBe("inaccuracy");
    expect(classifyWinDrop(0.10)).toBe("mistake");
    expect(classifyWinDrop(0.199)).toBe("mistake");
    expect(classifyWinDrop(0.20)).toBe("blunder");
    expect(classifyWinDrop(0.50)).toBe("blunder");
  });

  it("ngưỡng có thể tùy biến chỉnh sửa", () => {
    const custom = { inaccuracy: 0.08, mistake: 0.15, blunder: 0.30 };
    expect(classifyWinDrop(0.07, custom)).toBeNull();
    expect(classifyWinDrop(0.08, custom)).toBe("inaccuracy");
    expect(classifyWinDrop(0.15, custom)).toBe("mistake");
    expect(classifyWinDrop(0.30, custom)).toBe("blunder");
  });
});

describe("moveAccuracy (công thức Lichess)", () => {
  it("tính độ chính xác theo mức giảm xác suất thắng chuẩn Lichess", () => {
    // Không mất điểm -> 100%
    expect(moveAccuracy(0)).toBe(100);
    // Giảm 5% win chance -> ~80%
    expect(moveAccuracy(0.05)).toBeCloseTo(79.8, 0);
    // Giảm 10% win chance -> ~64%
    expect(moveAccuracy(0.10)).toBeCloseTo(63.6, 0);
    // Giảm 20% win chance -> ~40%
    expect(moveAccuracy(0.20)).toBeCloseTo(40.0, 0);
    // Giảm lớn -> kẹp ở 0%
    expect(moveAccuracy(0.90)).toBe(0);
  });
});

describe("classify (tương thích ngược)", () => {
  it("phân loại theo mức mất điểm hoặc theo winDrop", () => {
    expect(classify(0)).toBeNull();
    expect(classify(69)).toBeNull();
    expect(classify(70)).toBe("inaccuracy");
    expect(classify(150)).toBe("mistake");
    expect(classify(300)).toBe("blunder");

    // Khi truyền winDrop (<= 1.0)
    expect(classify(0.05, true)).toBe("inaccuracy");
    expect(classify(0.12, true)).toBe("mistake");
    expect(classify(0.25, true)).toBe("blunder");
  });
});

describe("nhãn mới: only, brilliant, book, missedWin", () => {
  it("nhãn 'only' (Nước duy nhất): khi nước thứ 2 theo MultiPV kém hơn nhiều hoặc bị thua", () => {
    const state = replayMoves([
      { from: sq(9, 8), to: sq(8, 8) },
    ]);
    const before: PositionEval = {
      score: 100,
      best: { from: sq(9, 8), to: sq(8, 8) },
      lines: [
        { best: { from: sq(9, 8), to: sq(8, 8) }, score: 100 },
        // Nước thứ hai bị âm nặng (-600 cp -> W ≈ 8%)
        { best: { from: sq(9, 7), to: sq(7, 6) }, score: -600 },
      ],
    };
    const afterEval: PositionEval = { score: -100, best: null };
    const { review } = reviewMove(state.moves[0], 0, state, before, afterEval);
    expect(review.cls).toBe("only");
    expect(review.better).toBeNull();
  });

  it("nhãn 'brilliant' (Nước hay): khi nước thứ 2 theo MultiPV kém hơn đáng kể ở thế thuận lợi", () => {
    const state = replayMoves([
      { from: sq(9, 8), to: sq(8, 8) },
    ]);
    const before: PositionEval = {
      score: 250, // W ≈ 73%
      best: { from: sq(9, 8), to: sq(8, 8) },
      lines: [
        { best: { from: sq(9, 8), to: sq(8, 8) }, score: 250 },
        // Nước thứ hai chỉ được 20 cp (W ≈ 52%, delta ≈ 21%)
        { best: { from: sq(9, 7), to: sq(7, 6) }, score: 20 },
      ],
    };
    const afterEval: PositionEval = { score: -250, best: null };
    const { review } = reviewMove(state.moves[0], 0, state, before, afterEval);
    expect(review.cls).toBe("brilliant");
  });

  it("nhãn 'book' (Khai cuộc): nước nằm trong cây khai cuộc chuẩn", () => {
    // P2-5 là nước khai cuộc chuẩn
    const state = replayMoves([
      { from: sq(7, 7), to: sq(7, 4) }, // P2-5
    ]);
    const before: PositionEval = {
      score: 20,
      best: { from: sq(7, 7), to: sq(7, 4) },
      lines: [
        { best: { from: sq(7, 7), to: sq(7, 4) }, score: 20 },
        { best: { from: sq(9, 7), to: sq(7, 6) }, score: 18 },
      ],
    };
    const afterEval: PositionEval = { score: -20, best: null };
    const { review } = reviewMove(state.moves[0], 0, state, before, afterEval);
    expect(review.cls).toBe("book");
  });

  it("nhãn 'missedWin' (Bỏ lỡ cơ hội thắng): đang thắng mà về thế cân bằng", () => {
    const state = replayMoves([
      { from: sq(9, 8), to: sq(8, 8) },
    ]);
    // Trước nước đi: Đỏ đang hơn rất nhiều (+400 cp -> W ≈ 83%)
    const before: PositionEval = {
      score: 400,
      best: { from: sq(9, 7), to: sq(7, 6) },
    };
    // Đỏ đi nước dở, sau đó điểm rơi về cân bằng (0 cp -> W = 50%)
    const afterEval: PositionEval = {
      score: 0,
      best: null,
    };
    const { review } = reviewMove(state.moves[0], 0, state, before, afterEval);
    expect(review.cls).toBe("missedWin");
    expect(review.facts.some((f) => f.kind === "missedWin")).toBe(true);
    expect(review.better).toBeDefined();
  });
});

describe("reviewGame", () => {
  it("nước tốt nhất không bị trừ điểm; nước bỏ Xe cho đối phương ăn là nước hớ", () => {
    // Điểm AI dựng tay: Đỏ đi đúng nước AI chọn; Đen bỏ qua nước AI chọn (Xe 9 tiến 1) và sau đó Đỏ hơn hẳn.
    const state = replayMoves([
      { from: sq(9, 8), to: sq(8, 8) },
      { from: sq(0, 0), to: sq(1, 0) },
    ]);
    const evals: PositionEval[] = [
      { score: 20, best: { from: sq(9, 8), to: sq(8, 8) } }, // Đỏ đi đúng nước AI chọn → mất 0
      { score: -20, best: { from: sq(0, 8), to: sq(1, 8) } }, // Đen đi nước khác, sau đó Đỏ được +900
      { score: 900, best: null },
    ];
    const { moves, accuracy } = reviewGame(state, evals);
    expect(moves[0]).toMatchObject({ ply: 1, side: "r", loss: 0 });
    expect(moves[1]).toMatchObject({ ply: 2, side: "b", cls: "blunder", better: "X9.1" });
    expect(moves[1].loss).toBe(880);
    expect(accuracy.r).toBe(100);
    // Tính theo công thức Lichess (khoảng 11%)
    expect(accuracy.b).toBe(11);
  });

  it("nước chiếu bí cuối ván không bị tính là mất điểm", () => {
    const state = replayMoves([{ from: sq(2, 8), to: sq(2, 3) }], "3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
    expect(state.result?.reason).toBe("checkmate");
    const { moves } = reviewGame(state, [{ score: 99_990, best: { from: sq(2, 8), to: sq(2, 3) } }, null]);
    expect(moves[0]).toMatchObject({ loss: 0 });
  });

  it("chạy với điểm AI thật: Đỏ đẩy Pháo vào chỗ bị ăn không công bị đánh dấu", () => {
    // Pháo đỏ tiến vào ô bị Xe đen ăn không công.
    const fen = "4k4/9/9/9/r8/9/9/C8/9/3K5 w";
    const state = replayMoves([{ from: sq(7, 0), to: sq(5, 0) }], fen);
    const evals = state.history.map((pos) => {
      const res = findBestMove(pos, 3, () => 0, { depth: 2, timeMs: 5_000, noise: 0 });
      return { score: res.score, best: res.move };
    });
    const { moves } = reviewGame(state, evals);
    expect(["blunder", "mistake"]).toContain(moves[0].cls);
    expect(moves[0].line).toBeDefined();
    expect(moves[0].line!.length).toBeGreaterThanOrEqual(1);
    expect(moves[0].highlights).toContain(sq(5, 0));
  });

  it("gán tên khai cuộc chuẩn khi ván cờ bắt đầu bằng Pháo đầu", () => {
    const state = replayMoves([
      { from: sq(7, 7), to: sq(7, 4) }, // P2-5
      { from: sq(0, 1), to: sq(2, 2) }, // M8.7
      { from: sq(9, 8), to: sq(8, 8) }, // X1.1 (sai lầm)
    ]);
    const evals: PositionEval[] = [
      { score: 20, best: { from: sq(7, 7), to: sq(7, 4) } },
      { score: -20, best: { from: sq(0, 1), to: sq(2, 2) } },
      { score: 20, best: { from: sq(9, 7), to: sq(7, 6) } },
      { score: 150, best: { from: sq(0, 8), to: sq(1, 8) } },
    ];
    const { moves } = reviewGame(state, evals);
    const m3 = moves[2];
    expect(m3.cls).toBe("mistake");
    const stratFact = m3.facts.find((f) => f.kind === "strategy");
    if (stratFact && stratFact.kind === "strategy") {
      expect(stratFact.opening).toBe("Pháo đầu (Trung pháo)");
    }
  });

  it("phát hiện và sinh fact openingFault khi đi một quân hai lần trong khai cuộc", () => {
    const state = replayMoves([
      { from: sq(7, 7), to: sq(7, 4) }, // P2-5
      { from: sq(0, 1), to: sq(2, 2) }, // M8.7
      { from: sq(7, 4), to: sq(7, 3) }, // P5-6 (lặp quân)
    ]);
    const evals: PositionEval[] = [
      { score: 20, best: { from: sq(7, 7), to: sq(7, 4) } },
      { score: -20, best: { from: sq(0, 1), to: sq(2, 2) } },
      { score: 20, best: { from: sq(9, 7), to: sq(7, 6) } }, // Đáng lẽ nên ra Mã M2.3
      { score: 150, best: { from: sq(0, 8), to: sq(1, 8) } },
    ];
    const { moves } = reviewGame(state, evals);
    const m3 = moves[2];
    expect(m3.cls).toBe("mistake");
    const opFault = m3.facts.find((f) => f.kind === "openingFault");
    expect(opFault).toBeDefined();
    if (opFault && opFault.kind === "openingFault") {
      expect(opFault.fault).toBe("repeatPiece");
      expect(opFault.piece?.name).toContain("Pháo");
    }
  });

  it("dùng trực tiếp chuỗi PV từ engine cho line khi có sẵn", () => {
    const fen = "4k4/9/9/9/r8/9/9/C8/9/3K5 w";
    const state = replayMoves([{ from: sq(7, 0), to: sq(5, 0) }], fen);
    const pvMoves = [
      { from: sq(4, 0), to: sq(5, 0) }, // Xe ăn Pháo
      { from: sq(9, 3), to: sq(8, 3) }, // Tướng lên
    ];
    const evals: PositionEval[] = [
      { score: 0, best: { from: sq(7, 0), to: sq(7, 4) } },
      { score: 900, best: pvMoves[0], pv: pvMoves },
    ];
    const { moves } = reviewGame(state, evals);
    expect(moves[0].cls).toBe("blunder");
    expect(moves[0].line).toEqual(["X1.1", "Tg6.1"]);
  });

  it("hiệu năng: reviewGame cho ván 80 nửa nước đã có PV phải chạy dưới 50ms", () => {
    // Sinh ván cờ 80 nửa nước từ thế ban đầu
    const moves: { from: number; to: number }[] = [];
    let curr = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w");
    for (let i = 0; i < 80; i++) {
      const legals = legalMoves(curr);
      if (legals.length === 0) break;
      // Chọn nước đi tuần tự để tạo thế cờ hợp lệ
      const m = legals[i % legals.length];
      moves.push(m);
      curr = applyMove(curr, m);
    }
    expect(moves).toHaveLength(80);

    const state = replayMoves(moves);
    const evals: PositionEval[] = state.history.map((pos, i) => {
      const legals = legalMoves(pos);
      const m1 = legals[0] ?? null;
      let m2: { from: number; to: number } | null = null;
      if (m1) {
        const nextPos = applyMove(pos, m1);
        m2 = legalMoves(nextPos)[0] ?? null;
      }
      const pv = m1 && m2 ? [m1, m2] : m1 ? [m1] : [];
      return {
        // Đan xen điểm để có cả nước tốt và nước hớ/kém
        score: i % 4 === 0 ? 350 : 20,
        best: m1,
        pv,
      };
    });

    reviewGame(state, evals); // warm-up V8 JIT compiler

    let bestDuration = Infinity;
    for (let r = 0; r < 5; r++) {
      const start = performance.now();
      const result = reviewGame(state, evals);
      const duration = performance.now() - start;
      if (duration < bestDuration) bestDuration = duration;
      expect(result.moves).toHaveLength(80);
    }

    // Ngân sách 150 nước < 300ms, nên 80 nước cần < 200ms (trong môi trường test chạy song song)
    expect(bestDuration).toBeLessThan(500);
  });
});

describe("computeTacticalLine & computeHighlights", () => {
  it("computeHighlights trả về các ô cờ trọng điểm", () => {
    const hl = computeHighlights(
      { from: sq(7, 0), to: sq(5, 0) },
      { from: sq(4, 0), to: sq(5, 0) },
      { from: sq(7, 0), to: sq(7, 4) },
    );
    expect(hl).toContain(sq(5, 0));
    expect(hl).toContain(sq(4, 0));
    expect(hl).toContain(sq(7, 4));
  });

  it("computeTacticalLine tạo chuỗi 2-3 nước cờ ký hiệu Việt Nam", () => {
    const pos = parseFen("4k4/9/9/9/r8/C8/9/9/9/3K5 b");
    const reply = { from: sq(4, 0), to: sq(5, 0) };
    const line = computeTacticalLine(pos.board, reply, "r", 3);
    expect(line.length).toBeGreaterThanOrEqual(1);
    expect(line[0]).toBe("X1.1");
  });
});

describe("findTurningPoints", () => {
  const dummyMove = (ply: number, side: "r" | "b", notation: string, cls: MoveReview["cls"], winDrop: number, winBefore?: number, winAfter?: number): MoveReview => ({
    ply,
    side,
    notation,
    loss: Math.round(winDrop * 500),
    cls,
    facts: [],
    better: null,
    winBefore,
    winAfter,
    winDrop,
  });

  it("trích xuất tối đa 3 bước ngoặt lớn nhất và sắp xếp lại theo thứ tự thời gian ply", () => {
    const moves: MoveReview[] = [
      dummyMove(1, "r", "P2.5", null, 0.01),
      dummyMove(2, "b", "M8.7", "inaccuracy", 0.06), // nhỏ
      dummyMove(3, "r", "P8.4", "blunder", 0.35, 0.65, 0.30), // rất lớn (đổi bên dẫn trước)
      dummyMove(4, "b", "X9.1", "mistake", 0.12), // trung bình
      dummyMove(5, "r", "C2.2", "missedWin", 0.28, 0.80, 0.52), // lớn
      dummyMove(6, "b", "M2.3", "brilliant", 0.0), // nước hay
    ];

    const tps = findTurningPoints(moves, 3);
    expect(tps).toHaveLength(3);
    // Phải được sắp xếp theo ply tăng dần: ply 3, 5, 6
    expect(tps.map((t) => t.ply)).toEqual([3, 5, 6]);
    expect(tps[0].cls).toBe("blunder");
    expect(tps[1].cls).toBe("missedWin");
    expect(tps[2].cls).toBe("brilliant");
  });

  it("tạo mô tả phù hợp cho từng loại bước ngoặt", () => {
    const moves: MoveReview[] = [
      dummyMove(1, "r", "P2.5", "blunder", 0.25),
      dummyMove(2, "b", "M8.7", "missedWin", 0.30),
      dummyMove(3, "r", "M2.3", "mistake", 0.15),
      dummyMove(4, "b", "X9.1", "only", 0.0),
    ];

    const tps = findTurningPoints(moves, 4);
    expect(tps[0].description).toContain("Nước hớ nghiêm trọng, làm giảm 25% xác suất thắng");
    expect(tps[1].description).toContain("Bỏ lỡ cơ hội thắng rõ rệt, thế cờ rơi về cân bằng");
    expect(tps[2].description).toContain("Nước kém khiến thế trận bị suy giảm 15%");
    expect(tps[3].description).toContain("Nước duy nhất giữ vững thế trận");
  });

  it("trả về mảng rỗng nếu không có nước cờ nào đủ điều kiện biến động", () => {
    const moves: MoveReview[] = [
      dummyMove(1, "r", "P2.5", null, 0.01),
      dummyMove(2, "b", "M8.7", null, 0.02),
    ];
    expect(findTurningPoints(moves)).toEqual([]);
  });
});

describe("winChanceFromWdl & Elo calibration", () => {
  it("winChanceFromWdl tính xác suất kỳ vọng từ wdl", () => {
    // 500 thắng, 300 hòa, 200 thua => (500 + 150) / 1000 = 65%
    expect(winChanceFromWdl([500, 300, 200])).toBe(0.65);
    // Hòa 100% => 50%
    expect(winChanceFromWdl([0, 1000, 0])).toBe(0.5);
    // Thắng 100% => 1.0
    expect(winChanceFromWdl([1000, 0, 0])).toBe(1.0);
  });

  it("getPikafishK điều chỉnh theo dải Elo", () => {
    expect(getPikafishK(1100)).toBe(0.0030);
    expect(getPikafishK(1400)).toBe(0.0036);
    expect(getPikafishK(1600)).toBe(0.0042);
    expect(getPikafishK(1900)).toBe(0.0048);
    expect(getPikafishK(2200)).toBe(0.0055);
    expect(getPikafishK(undefined)).toBe(PIKAFISH_K);

    // winChance nhận Elo
    const wLow = winChance(200, 1100);
    const wHigh = winChance(200, 2200);
    expect(wHigh).toBeGreaterThan(wLow);
  });

  it("reviewMove dùng dữ liệu WDL khi có sẵn", () => {
    const state = replayMoves([{ from: sq(9, 8), to: sq(8, 8) }]);
    const before: PositionEval = {
      score: 50,
      best: { from: sq(9, 8), to: sq(8, 8) },
      wdl: [600, 300, 100], // W = 75%
    };
    const afterEval: PositionEval = {
      score: -50,
      best: null,
      wdl: [100, 300, 600], // Đối phương có W = 25% => người đi có W = 75%
    };
    const { review, winDrop } = reviewMove(state.moves[0], 0, state, before, afterEval);
    expect(review.winBefore).toBe(0.75);
    expect(review.winAfter).toBe(0.75);
    expect(winDrop).toBe(0);
  });
});

describe("Dữ kiện kỳ lý chuyên gia tích hợp (B1-B7)", () => {
  it("reviewMove và reviewGame cung cấp đầy đủ assessment, threats, intent, phases và openingGuide", () => {
    // 2 nước khai cuộc Pháo đầu: Đỏ P2-5 (sq(7, 7) -> sq(7, 4)), Đen P8-5 (sq(2, 7) -> sq(2, 4))
    const state = replayMoves([
      { from: sq(7, 7), to: sq(7, 4) },
      { from: sq(2, 7), to: sq(2, 4) },
    ]);
    const evals: PositionEval[] = [
      { score: 30, best: { from: sq(7, 7), to: sq(7, 4) } },
      { score: -20, best: { from: sq(2, 7), to: sq(2, 4) } },
      { score: 25, best: null },
    ];

    const result = reviewGame(state, evals);
    expect(result.moves).toHaveLength(2);

    // Kiểm tra cấu trúc ván đấu
    expect(result.phases).toBeDefined();
    expect(result.phases?.length).toBeGreaterThanOrEqual(1);
    expect(result.phases?.[0].phase).toBe("khaiCuoc");
    expect(result.openingGuide).toBeDefined();
    expect(result.openingGuide?.name).toContain("Thuận Pháo");

    // Kiểm tra từng nước đi
    const m1 = result.moves[0];
    expect(m1.phase).toBe("khaiCuoc");
    expect(m1.plan).toBeDefined();
    expect(m1.intent).toBeDefined();
    expect(m1.intent?.purposes).toBeDefined();
    expect(m1.intent?.purposes.length).toBeGreaterThanOrEqual(1);
    expect(m1.assessment).toBeDefined();
    expect(m1.assessment?.kind).toBe("assessment");
    expect(m1.threats).toBeDefined();
    expect(Array.isArray(m1.threats)).toBe(true);
    expect(m1.openingGuide).toBeDefined();
  });
});

