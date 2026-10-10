import { describe, expect, it } from "vitest";
import { findBestMove } from "./ai";
import { sq } from "./engine";
import { replayMoves } from "./game";
import { classify, reviewGame, type PositionEval } from "./analysis";

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
  });
});
