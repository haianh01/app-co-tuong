import { describe, expect, it } from "vitest";
import { findBestMove } from "./ai";
import { parseFen, sq } from "./engine";
import { replayMoves } from "./game";
import { classify, computeHighlights, computeTacticalLine, reviewGame, type PositionEval } from "./analysis";

describe("classify", () => {
  it("phân loại theo mức mất điểm", () => {
    expect(classify(0)).toBeNull();
    expect(classify(69)).toBeNull();
    expect(classify(70)).toBe("inaccuracy");
    expect(classify(150)).toBe("mistake");
    expect(classify(300)).toBe("blunder");
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
    expect(moves[0]).toMatchObject({ ply: 1, side: "r", loss: 0, cls: null });
    expect(moves[1]).toMatchObject({ ply: 2, side: "b", cls: "blunder", better: "X9.1" });
    expect(moves[1].loss).toBe(880);
    expect(accuracy.r).toBe(100);
    expect(accuracy.b).toBe(0);
  });

  it("nước chiếu bí cuối ván không bị tính là mất điểm", () => {
    const state = replayMoves([{ from: sq(2, 8), to: sq(2, 3) }], "3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
    expect(state.result?.reason).toBe("checkmate");
    const { moves } = reviewGame(state, [{ score: 99_990, best: { from: sq(2, 8), to: sq(2, 3) } }, null]);
    expect(moves[0]).toMatchObject({ loss: 0, cls: null });
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
    expect(moves[0].cls).toBe("blunder");
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

