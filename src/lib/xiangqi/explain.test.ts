import { describe, expect, it } from "vitest";
import { findBestMove } from "./ai";
import { reviewGame, type PositionEval } from "./analysis";
import { parseFen, sq, type Position } from "./engine";
import { exchangeGain, explainText, formatPoints, hangingPieces } from "./explain";
import { replayMoves } from "./game";

/** Cùng độ sâu với màn phân tích ván (3), bỏ giới hạn thời gian để kết quả không phụ thuộc tốc độ máy. */
function evalOf(pos: Position): PositionEval {
  const res = findBestMove(pos, 3, () => 0, { depth: 3, timeMs: 60_000, noise: 0 });
  return { score: res.score, best: res.move };
}

/** Đi các nước từ `fen`, chấm bằng AI thật rồi trả về nhận xét của nước cuối cùng. */
function review(fen: string, moves: [number, number, number, number][]) {
  const state = replayMoves(moves.map(([fr, fc, tr, tc]) => ({ from: sq(fr, fc), to: sq(tr, tc) })), fen);
  expect(state.moves).toHaveLength(moves.length);
  const evals = state.history.map((pos, i) => (i === state.history.length - 1 && state.result ? null : evalOf(pos)));
  const last = reviewGame(state, evals).moves.at(-1)!;
  return { ...last, text: explainText(last.facts, last.side) };
}

describe("exchangeGain", () => {
  it("quân không được bảo vệ: ăn không, lời trọn giá trị quân", () => {
    const board = parseFen("2bakab2/9/9/4p4/r8/C8/4P4/9/9/2BAKAB2 w").board;
    expect(exchangeGain(board, sq(5, 0), "b")).toBe(450);
    expect(hangingPieces(board, "r")).toEqual([sq(5, 0)]);
  });

  it("Mã được Xe bảo vệ: Xe đen ăn Mã sẽ bị ăn lại nên không có lời", () => {
    const board = parseFen("2bakab2/9/2r6/4p4/9/2N5R/4P4/9/9/2BAKAB2 w").board;
    expect(exchangeGain(board, sq(5, 2), "b")).toBe(400 - 900);
    expect(hangingPieces(board, "r")).toEqual([]);
  });

  it("Xe bị Mã bắt, dù có bảo vệ vẫn thiệt vì Xe đắt hơn Mã", () => {
    const board = parseFen("2bakab2/9/9/3n5/4p4/2R5R/4P4/9/9/2BAKAB2 w").board;
    expect(exchangeGain(board, sq(5, 2), "b")).toBe(900 - 400);
  });

  it("Pháo ăn lại qua ngòi: Pháo đỏ có ngòi Tốt bảo vệ quân phía trước", () => {
    const board = parseFen("3akab2/9/4r4/9/9/4C4/4P4/4C4/9/3AKAB2 w").board;
    expect(exchangeGain(board, sq(5, 4), "b")).toBe(450 - 900);
  });

  it("quân đang che mặt tướng không được ăn (lộ mặt tướng)", () => {
    // Mã đen đứng giữa hai tướng trên cùng một cột: nhảy đi ăn Xe là tự để lộ mặt tướng.
    const board = parseFen("3k5/9/9/2R6/9/3n5/9/9/9/3K5 w").board;
    expect(exchangeGain(board, sq(3, 2), "b")).toBeNull();
  });
});

describe("formatPoints", () => {
  it("làm tròn tới nửa điểm, dùng dấu phẩy thập phân", () => {
    expect(formatPoints(450)).toBe("4,5");
    expect(formatPoints(900)).toBe("9");
    expect(formatPoints(20)).toBe("0,5");
  });
});

describe("giải thích nước đi bằng AI thật", () => {
  it("đi quân vào ô bị ăn mà không có bảo vệ", () => {
    const r = review("2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w", [[7, 0, 5, 0]]);
    expect(r.cls).toBe("blunder");
    expect(r.facts[0]).toMatchObject({ kind: "losesPiece", cause: "moved", free: true });
    expect(r.text).toBe("Pháo đi vào ô bị Xe đen ăn mà không có quân bảo vệ. Đen đáp X1.1 ăn không Pháo.");
  });

  it("bỏ mặc quân đang bị bắt, kèm nước nên đi để thoát", () => {
    // Xe đỏ đang bị Mã đen bắt, Đỏ lại đẩy Tốt biên.
    const r = review("2bakab2/9/9/3n5/4p4/2R6/4P3P/9/9/2BAKAB2 w", [[6, 8, 5, 8]]);
    expect(r.facts[0]).toMatchObject({ kind: "losesPiece", cause: "ignored" });
    expect(r.text).toContain("Xe đang bị Mã đen bắt nhưng nước này không xử lý. Đen đáp M4.3 ăn không Xe.");
  });

  it("quân đi chỗ khác làm mở đường cho Xe đối phương", () => {
    // Mã đỏ đang chặn cột biên giữa Xe đen và Pháo đỏ.
    const r = review("3k5/9/r8/9/9/N8/9/9/C8/4K4 w", [[5, 0, 3, 1]]);
    expect(r.facts[0]).toMatchObject({ kind: "losesPiece", cause: "opened" });
    expect(r.text).toBe("Mã rời chỗ cũ, mở đường cho Xe đen. Đen đáp X1.6 ăn không Pháo. Nên đi P9.6 ăn Xe đen.");
  });

  it("quân đứng vào làm ngòi cho Pháo đối phương", () => {
    const r = review("2bakab2/9/1c7/4p4/9/9/4P4/2N6/1R7/2BAKAB2 w", [[7, 2, 5, 1]]);
    expect(r.facts[0]).toMatchObject({ kind: "losesPiece", cause: "screen" });
    expect(r.text).toContain("Mã đứng vào làm ngòi cho Pháo đen. Đen đáp P2.6 ăn không Xe.");
  });

  it("rút quân bảo vệ làm quân khác bị treo", () => {
    // Xe đỏ ở hàng 5 đang bảo vệ Mã; rút Xe về là Mã bị Xe đen ăn không.
    const r = review("2bakab2/9/2r6/4p4/9/2N5R/4P4/9/9/2BAKAB2 w", [[5, 8, 8, 8]]);
    expect(r.facts[0]).toMatchObject({ kind: "losesPiece", cause: "unguarded" });
    expect(r.text).toContain("Nước này làm Mã mất bảo vệ. Đen đáp X3.3 ăn không Mã.");
  });

  it("đổi Xe lấy Pháo được bảo vệ là thiệt", () => {
    const r = review("3k5/9/1c3r3/9/9/1R7/9/9/9/4K4 w", [[5, 1, 2, 1]]);
    expect(r.facts[0]).toMatchObject({ kind: "losesPiece", cause: "trade", points: 450 });
    expect(r.text).toBe("Xe ăn Pháo đen nhưng bị Xe đen ăn lại (X6-2), đổi như vậy thiệt 4,5 điểm.");
  });

  it("đi Tướng để đối phương vừa chiếu vừa bắt Xe, trong khi đáng lẽ ăn được Mã", () => {
    const r = review("4k4/9/9/9/9/n1R6/9/9/9/3K5 w", [[9, 3, 8, 3]]);
    expect(r.facts.map((f) => f.kind)).toEqual(["threatens", "missedCapture"]);
    expect(r.text).toBe("Đen đáp M1.2, vừa chiếu tướng vừa đe dọa ăn Xe. Nên đi X7-9 ăn Mã đen.");
  });

  it("để đối phương chiếu bí, chỉ ra nước chặn", () => {
    const r = review("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 b", [[6, 0, 7, 0]]);
    expect(r.facts).toEqual([
      { kind: "allowsMate", moves: 1, reply: "X1-6" },
      { kind: "avoidsMate", better: "M6/5" },
    ]);
    expect(r.text).toBe("Nước này để Đỏ chiếu bí ngay bằng X1-6. Nên đi M6/5 để chặn đường chiếu bí đó.");
  });

  it("bỏ lỡ nước chiếu bí", () => {
    const r = review("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w", [[4, 0, 3, 0]]);
    expect(r.facts).toEqual([{ kind: "missedMate", moves: 1, better: "X1-6" }]);
    expect(r.text).toBe("Bỏ lỡ nước chiếu bí X1-6.");
  });

  it("nước không bị chấm thì không có lời giải thích", () => {
    const r = review("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w", [[7, 7, 7, 4]]);
    expect(r.cls).toBeNull();
    expect(r.facts).toEqual([]);
  });
});

describe("nguyên lý chiến lược", () => {
  it("khai cuộc: lên Xe biên làm Mã mất gốc, đáng lẽ ra Pháo đầu", () => {
    // Điểm AI dựng tay: nước đáp là một nước yên (không ăn, không bắt quân nào), nên lý do phải là chiến lược.
    const state = replayMoves([{ from: sq(9, 8), to: sq(8, 8) }]);
    const evals: PositionEval[] = [
      { score: 20, best: { from: sq(7, 7), to: sq(7, 4) } },
      { score: 130, best: { from: sq(0, 1), to: sq(2, 2) } },
    ];
    const m = reviewGame(state, evals).moves[0];
    expect(m.cls).toBe("mistake");
    expect(m.facts).toEqual([
      { kind: "strategy", plan: "raQuan", played: "X1.1", better: "P2-5", gains: ["matGoc", "diemThenChot"], worsened: ["matGoc"], loose: ["Mã 2"] },
    ]);
    expect(explainText(m.facts, m.side)).toBe(
      "Đang khai cuộc, việc chính là ra quân nhanh và cân đối. Nên đi P2-5: không để quân mất gốc và đưa quân vào điểm then chốt, còn X1.1 để Mã 2 mất gốc.",
    );
  });
});
