import { describe, expect, it } from "vitest";
import { findBestMove } from "./ai";
import { reviewGame, type PositionEval } from "./analysis";
import { applyMove, legalMoves, parseFen, sq, START_FEN, type Position, type Side } from "./engine";
import { exchangeGain, explainMove, explainText, formatPoints, hangingPieces, moveIdea, pickVariant, withoutCriticism, type Fact } from "./explain";
import { replayMoves } from "./game";
import { moveNotation } from "./notation";
import { detectOpeningFault, principleScores } from "./strategy";

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
    expect(r.cls === null || r.cls === "book").toBe(true);
    expect(r.facts).toEqual([]);
  });
});

describe("nguyên lý chiến lược", () => {
  it("khai cuộc: lên Xe biên làm Mã mất căn, đáng lẽ ra Pháo đầu", () => {
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
      "Đang khai cuộc, việc chính là ra quân nhanh và cân đối. Nên đi P2-5: không để quân mất căn và đưa quân vào điểm then chốt, còn X1.1 để Mã 2 mất căn.",
    );
  });
});

describe("đòn chiến thuật nâng cao (Phase 1)", () => {
  it("nhận diện đòn chiếu kép (doubleCheck)", () => {
    // Tướng đỏ ở (9, 4). Xe đen ở (4, 4), Mã đen ở (7, 4) đang chắn.
    // Mã đen nhảy sang (8, 2): vừa chiếu tướng vừa mở đường cho Xe chiếu tướng.
    const before = parseFen("4k4/9/9/9/4r4/9/9/4n4/9/4K4 w").board;
    const after = parseFen("4k4/9/9/9/4r4/9/9/4n4/9/4K4 b").board;
    const move = { from: sq(9, 4), to: sq(9, 4) };
    const reply = { from: sq(7, 4), to: sq(8, 2) };
    const facts = explainMove({
      before,
      move,
      after,
      evalBefore: { score: 0, best: null },
      evalAfter: { score: 500, best: reply },
      loss: 500,
    });
    expect(facts[0]).toMatchObject({ kind: "doubleCheck" });
    expect(explainText(facts, "r")).toContain("cùng lúc chiếu tướng (chiếu kép), buộc Tướng phải chạy.");
  });

  it("nhận diện đòn chiếu rút (discoveredCheck)", () => {
    // Tướng đỏ ở (9, 4). Xe đen ở (4, 4). Mã đen ở (7, 4) đang chắn.
    // Pháo đỏ ở (6, 2).
    // Mã đen nhảy sang (6, 2) ăn Pháo đỏ: không chiếu tướng nhưng mở đường cho Xe đen chiếu.
    const before = parseFen("4k4/9/9/9/4r4/9/2C6/4n4/9/4K4 w").board;
    const after = parseFen("4k4/9/9/9/4r4/9/2C6/4n4/9/4K4 b").board;
    const move = { from: sq(9, 4), to: sq(9, 4) };
    const reply = { from: sq(7, 4), to: sq(6, 2) };
    const facts = explainMove({
      before,
      move,
      after,
      evalBefore: { score: 0, best: null },
      evalAfter: { score: 600, best: reply },
      loss: 600,
    });
    expect(facts[0]).toMatchObject({ kind: "discoveredCheck" });
    expect(explainText(facts, "r")).toContain("chiếu tướng (chiếu rút)");
  });

  it("nhận diện đòn ghim quân (pin) của Xe", () => {
    // Tướng đỏ ở (9, 4), Mã đỏ ở (7, 4). Xe đen ở (3, 1).
    // Xe đen bình sang (3, 4): ghim chặt Mã đỏ trước Tướng đỏ.
    const before = parseFen("4k4/9/9/1r7/9/9/9/4N4/9/4K4 w").board;
    const after = parseFen("4k4/9/9/1r7/9/9/9/4N4/9/4K4 b").board;
    const move = { from: sq(9, 4), to: sq(9, 4) };
    const reply = { from: sq(3, 1), to: sq(3, 4) };
    const facts = explainMove({
      before,
      move,
      after,
      evalBefore: { score: 0, best: null },
      evalAfter: { score: 400, best: reply },
      loss: 400,
    });
    expect(facts[0]).toMatchObject({ kind: "pin", absolute: true });
    expect(explainText(facts, "r")).toContain("ghim chặt Mã");
    expect(explainText(facts, "r")).toContain("không thể di chuyển vì để lộ Tướng");
  });

  it("nhận diện tự cản chân Mã của mình (horseBlock)", () => {
    // King đen ở (0, 3), King đỏ ở (9, 4).
    // Mã đỏ ở (7, 2). Pháo đỏ ở (9, 2).
    // Xe đen ở (7, 6) đang dọa ăn Mã đỏ.
    // Pháo đỏ đi lên (8, 2), cản chân Mã đỏ.
    const before = parseFen("3k5/9/9/9/9/9/9/2N3r2/9/2C1K4 w").board;
    const after = parseFen("3k5/9/9/9/9/9/9/2N3r2/2C6/4K4 b").board;
    const move = { from: sq(9, 2), to: sq(8, 2) };
    const facts = explainMove({
      before,
      move,
      after,
      evalBefore: { score: 0, best: { from: sq(7, 2), to: sq(5, 3) } },
      evalAfter: { score: 400, best: { from: sq(7, 6), to: sq(7, 2) } },
      loss: 400,
    });
    expect(facts[0]).toMatchObject({ kind: "horseBlock", byOpponent: false });
    expect(explainText(facts, "r")).toContain("vừa đi làm cản chân Mã");
  });

  it("nhận diện đối phương ngáng chân Mã (horseBlock)", () => {
    // King đen ở (0, 3), King đỏ ở (9, 4).
    // Mã đỏ ở (7, 2). Xe đen ở (7, 6) đang nhắm ăn Mã đỏ.
    // Tốt đen ở (6, 3) đi sang (6, 2): ngáng chân Mã đỏ!
    const before = parseFen("3k5/9/9/9/9/9/3p5/2N3r2/9/4K4 w").board;
    const after = parseFen("3k5/9/9/9/9/9/3p5/2N3r2/9/4K4 b").board;
    const move = { from: sq(9, 4), to: sq(9, 4) };
    const reply = { from: sq(6, 3), to: sq(6, 2) }; // Tốt đen đi vào ô cản chân (6, 2)
    const facts = explainMove({
      before,
      move,
      after,
      evalBefore: { score: 0, best: null },
      evalAfter: { score: 400, best: reply },
      loss: 400,
    });
    expect(facts[0]).toMatchObject({ kind: "horseBlock", byOpponent: true });
    expect(explainText(facts, "r")).toContain("ngáng chân Mã");
  });

  it("nhận diện quân lớn bị vây khốn không còn ô an toàn (trappedPiece)", () => {
    // Xe đỏ ở (0, 0). King đen ở (0, 3), King đỏ ở (9, 4).
    // Các ô xung quanh Xe (0, 0) là (0, 1) và (1, 0) đều có Tốt đen được Mã đen (2, 2) bảo vệ.
    // Pháo đen ở (5, 0) tấn công Xe đỏ qua ngòi Tốt (1, 0).
    const before = parseFen("R2k5/p8/2n6/9/9/c8/9/9/9/4K4 w").board;
    const after = parseFen("Rp1k5/p8/2n6/9/9/c8/9/9/9/4K4 b").board;
    const move = { from: sq(0, 0), to: sq(0, 0) };
    const facts = explainMove({
      before,
      move,
      after,
      evalBefore: { score: 0, best: null },
      evalAfter: { score: 900, best: null },
      loss: 900,
    });
    expect(facts.some((f) => f.kind === "trappedPiece")).toBe(true);
    expect(explainText(facts, "r")).toContain("bị vây khốn");
  });
});

describe("nhận xét chiến lược cho mọi nước (moveIdea)", () => {
  // Pháo đầu – Bình phong mã, rồi Đỏ ra Xe và đưa Xe qua hà.
  const line = [[7, 7, 7, 4], [0, 7, 2, 6], [9, 7, 7, 6], [0, 8, 0, 7], [9, 8, 9, 7], [0, 1, 2, 2], [9, 7, 3, 7]] as const;
  const state = replayMoves(line.map(([a, b, c, d]) => ({ from: sq(a, b), to: sq(c, d) })));
  const idea = (i: number) => {
    const reply = findBestMove(state.history[i + 1], 3, () => 0, { depth: 3, timeMs: 60_000, noise: 0 }).move;
    return explainText([moveIdea(state.history[i].board, state.moves[i].move, reply, i)], "r");
  };

  it("nước khai cuộc tốt vẫn có nhận xét theo kế hoạch ra quân", () => {
    expect(idea(2)).toBe("Kế hoạch: ra quân. M2.3 giúp đưa thêm quân ra trận.");
    expect(idea(4)).toBe("Kế hoạch: ra quân. X1-2 giúp Xe thông đường hơn và quân có căn hơn.");
  });

  it("Xe qua hà: khen ra quân nhưng nhắc Xe mất căn", () => {
    // "Xe thông đường hơn" trước đây là nhờ nước đáp B7.1 của Đen; ngay sau X2.6 Xe chưa thoáng hơn đáng kể
    expect(idea(6)).toBe("Kế hoạch: ra quân. X2.6 giúp đưa thêm quân ra trận và chiếm yếu đạo, nhưng để Xe 2 mất căn.");
  });

  it("không quy việc đối phương chặn đường vào cung cho nước vừa đi (hồi quy B7.1)", () => {
    // Ván người dùng báo: sau 12. B7.1 X4.5 áp lực lên cung giảm là do X4.5 của Đen, không phải do B7.1
    const seq = "B3.1 P8-5 M2.3 M8.7 T3.5 X9-8 P2-1 B5.1 S4.5 M2.3 X1-4 M3.5 P8-6 B5.1 B5.1 P5.3 M8.7 X1.1 X9-8 P2-5 M3.5 X1-4 B7.1 X4.5".split(" ");
    let pos = parseFen(START_FEN);
    const boards = [];
    const moves = [];
    for (const n of seq) {
      const m = legalMoves(pos).find((x) => moveNotation(pos.board, x) === n)!;
      expect(m, n).toBeDefined();
      boards.push(pos.board);
      moves.push(m);
      pos = applyMove(pos, m);
    }
    const fact = moveIdea(boards[22], moves[22], moves[23], 22);
    expect(fact.kind).toBe("idea");
    expect(fact.kind === "idea" && fact.worsened).not.toContain("apLuc");
    expect(explainText([fact], "r")).not.toContain("dễ thở");
  });

  it("withoutCriticism bỏ phần chê, giữ phần khen", () => {
    const f: Fact = { kind: "idea", plan: "tanCong", played: "B7.1", gains: ["tot"], worsened: ["apLuc"], loose: ["Mã 7"] };
    const g = withoutCriticism(f);
    expect(g.kind === "idea" && g.worsened).toEqual([]);
    expect(g.kind === "idea" && g.loose).toEqual([]);
    expect(g.kind === "idea" && g.gains).toEqual(["tot"]);
  });

  it("gắn tên khai cuộc vào kế hoạch khi được cung cấp", () => {
    const move = { from: sq(9, 7), to: sq(7, 6) };
    const text = explainText([moveIdea(state.history[2].board, move, null, 2, "Pháo đầu (Trung pháo)")], "r");
    expect(text).toContain("Kế hoạch ra quân (Pháo đầu (Trung pháo))");
  });
});

describe("tri thức khai cuộc & định thức tàn cuộc (Phase 3)", () => {
  it("phát hiện lỗi đi một quân nhiều lần trong khai cuộc (repeatPiece)", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const pos = parseFen(fen);
    // Giả sử Đỏ đã đi Pháo (7, 7) -> (7, 4), bàn cờ hiện tại Pháo đỏ ở (7, 4)
    pos.board[sq(7, 4)] = "C";
    pos.board[sq(7, 7)] = null;
    const history = [
      { from: sq(7, 7), to: sq(7, 4) },
      { from: sq(0, 1), to: sq(2, 2) },
    ];
    const fault = detectOpeningFault(pos.board, { from: sq(7, 4), to: sq(5, 4) }, 2, "r", history);
    expect(fault).not.toBeNull();
    expect(fault?.fault).toBe("repeatPiece");
  });

  it("phát hiện lỗi chậm xuất Xe quá 8 nửa nước (lateRook)", () => {
    // 2 Xe đỏ vẫn ở vị trí xuất phát (81 và 89), ply = 8, nước đi lại là đi Tốt hoặc Mã
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const pos = parseFen(fen);
    const fault = detectOpeningFault(pos.board, { from: sq(6, 4), to: sq(5, 4) }, 8, "r", []);
    expect(fault).not.toBeNull();
    expect(fault?.fault).toBe("lateRook");
  });

  it("định thức tàn cuộc: khuyết Sĩ kỵ Song Xa / Pháo gánh", () => {
    // Đỏ có Mã, Đen chỉ còn 1 Sĩ -> điểm khuyetSi của Đỏ phải > 0
    const board = parseFen("3k1a3/9/9/9/9/9/9/4N4/9/4K4 w").board;
    const scores = principleScores(board, "r");
    expect(scores.khuyetSi).toBeGreaterThan(0);
  });

  it("định thức tàn cuộc: khuyết Tượng kỵ Pháo", () => {
    // Đỏ có Pháo, Đen không còn Tượng nào -> điểm khuyetTuong của Đỏ phải > 0
    const board = parseFen("4k4/9/9/9/9/9/9/4C4/9/4K4 w").board;
    const scores = principleScores(board, "r");
    expect(scores.khuyetTuong).toBeGreaterThan(0);
  });

  it("định thức tàn cuộc: tốt vào cung", () => {
    // Tốt đỏ lọt vào cung tướng Đen (row <= 2, col trong [3..5])
    const board = parseFen("4k4/4P4/9/9/9/9/9/9/9/4K4 w").board;
    const scores = principleScores(board, "r");
    expect(scores.totVaoCung).toBeGreaterThan(0);
  });

  it("explainText diễn đạt cảnh báo lỗi khai cuộc tự nhiên", () => {
    const textRepeat = explainText([{ kind: "openingFault", fault: "repeatPiece" }], "r");
    expect(textRepeat).toContain("đã đi nhiều lần trong khai cuộc");
    const textRook = explainText([{ kind: "openingFault", fault: "lateRook" }], "r");
    expect(textRook).toContain("Một Xe mười quân");
  });

  it("detectOpeningFault hoạt động với cả bàn cờ trước nước đi (before) lẫn sau nước đi (after)", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const beforePos = parseFen(fen);
    beforePos.board[sq(7, 4)] = "C";
    beforePos.board[sq(7, 7)] = null;
    const move = { from: sq(7, 4), to: sq(5, 4) };
    const history = [
      { from: sq(7, 7), to: sq(7, 4) },
      { from: sq(0, 1), to: sq(2, 2) },
    ];

    // 1. Kiểm tra với bàn cờ trước nước đi
    const faultBefore = detectOpeningFault(beforePos.board, move, 2, "r", history);
    expect(faultBefore).not.toBeNull();
    expect(faultBefore?.fault).toBe("repeatPiece");
    expect(faultBefore?.pieceSquare).toBe(move.from);

    // 2. Tạo bàn cờ sau nước đi (ô move.from đã trống, quân ở move.to)
    const afterBoard = beforePos.board.slice();
    afterBoard[move.to] = afterBoard[move.from];
    afterBoard[move.from] = null;
    const faultAfter = detectOpeningFault(afterBoard, move, 2, "r", history);
    expect(faultAfter).not.toBeNull();
    expect(faultAfter?.fault).toBe("repeatPiece");
    expect(faultAfter?.pieceSquare).toBe(move.to);
  });

  it("explainMove báo lỗi openingFault trong phân tích ván", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const beforePos = parseFen(fen);
    beforePos.board[sq(7, 4)] = "C";
    beforePos.board[sq(7, 7)] = null;
    const move = { from: sq(7, 4), to: sq(5, 4) };
    const afterBoard = beforePos.board.slice();
    afterBoard[move.to] = afterBoard[move.from];
    afterBoard[move.from] = null;

    const history = [
      { from: sq(7, 7), to: sq(7, 4) },
      { from: sq(0, 1), to: sq(2, 2) },
    ];

    const facts = explainMove({
      before: beforePos.board,
      move,
      after: afterBoard,
      evalBefore: { score: 20, best: { from: sq(9, 7), to: sq(7, 6) } }, // Nên ra Mã thay vì đi Pháo tiếp
      evalAfter: { score: 150, best: null },
      loss: 130,
      ply: 2,
      historyMoves: history,
    });

    const opFault = facts.find((f) => f.kind === "openingFault");
    expect(opFault).toBeDefined();
    expect(opFault?.kind === "openingFault" && opFault.fault).toBe("repeatPiece");
  });

  it("moveIdea không báo lỗi openingFault khi nước đó là nước tốt nhất của engine (isBest = true)", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const beforePos = parseFen(fen);
    beforePos.board[sq(7, 4)] = "C";
    beforePos.board[sq(7, 7)] = null;
    const move = { from: sq(7, 4), to: sq(7, 3) };
    const history = [
      { from: sq(7, 7), to: sq(7, 4) },
      { from: sq(0, 1), to: sq(2, 2) },
    ];

    // Khi isBest = false: báo lỗi openingFault
    const ideaWrong = moveIdea(beforePos.board, move, null, 2, undefined, history, false);
    expect(ideaWrong.kind).toBe("openingFault");

    // Khi isBest = true: không báo lỗi openingFault, giải thích theo kế hoạch
    const ideaBest = moveIdea(beforePos.board, move, null, 2, undefined, history, true);
    expect(ideaBest.kind).toBe("idea");
  });

  it("explainText định dạng câu tàn cuộc lý thuyết tự nhiên và chuẩn xác", () => {
    const text = explainText(
      [
        {
          kind: "endgame",
          endgame: {
            id: "draw_bare_kings",
            name: "Cạn quân tấn công",
            outcome: "draw",
            description: "Cả hai bên chỉ còn Tướng và Sĩ Tượng, không còn quân có thể tấn công chiếu bí.",
          },
        },
      ],
      "r"
    );
    expect(text).toContain("Thế cờ tàn cuộc lý thuyết: Cạn quân tấn công");
    expect(text).toContain("không còn quân có thể tấn công chiếu bí");
  });
});


describe("đa dạng cách diễn đạt (explainText với seed)", () => {
  // Nước của cùng một bên cách nhau 2 nửa nước, nên kiểm tra trên các seed chẵn (Đỏ) và lẻ (Đen) riêng.
  const seeds = (parity: 0 | 1) => Array.from({ length: 30 }, (_, i) => i * 2 + parity + 1);

  function expectVariedButFaithful(facts: Fact[], side: Side, mustInclude: string[]) {
    for (const parity of [0, 1] as const) {
      const texts = seeds(parity).map((s) => explainText(facts, side, s));
      expect(new Set(texts).size).toBeGreaterThanOrEqual(2);
      for (const t of texts) {
        for (const needle of mustInclude) expect(t).toContain(needle);
        expect(t).not.toMatch(/undefined|null|NaN| {2}| \.|\.\./);
        expect(t[0]).toBe(t[0].toUpperCase());
        expect(t.endsWith(".")).toBe(true);
      }
    }
    expect(explainText(facts, side, 7)).toBe(explainText(facts, side, 7));
  }

  it("không truyền seed thì luôn ra câu chuẩn, và pickVariant chia đều cho nước của cùng một bên", () => {
    expect(pickVariant(["a", "b", "c"], undefined, "k")).toBe("a");
    for (const parity of [0, 1] as const) {
      const counts = { a: 0, b: 0, c: 0 };
      for (let i = 0; i < 300; i++) counts[pickVariant(["a", "b", "c"] as const, i * 2 + parity, "k")]++;
      for (const n of Object.values(counts)) expect(n).toBeGreaterThan(60);
    }
  });

  it("mất quân vì đi vào ô bị ăn: mọi cách nói đều nêu đúng quân, quân ăn và nước đáp", () => {
    const r = review("2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w", [[7, 0, 5, 0]]);
    expectVariedButFaithful(r.facts, r.side, ["Pháo", "Xe đen", "X1.1"]);
  });

  it("đổi Xe lấy Pháo được bảo vệ: giữ đúng nước ăn lại và số điểm thiệt", () => {
    const r = review("3k5/9/1c3r3/9/9/1R7/9/9/9/4K4 w", [[5, 1, 2, 1]]);
    expectVariedButFaithful(r.facts, r.side, ["Xe", "Pháo đen", "X6-2", "4,5 điểm"]);
  });

  it("vừa chiếu vừa bắt Xe, kèm nước nên đi ăn Mã", () => {
    const r = review("4k4/9/9/9/9/n1R6/9/9/9/3K5 w", [[9, 3, 8, 3]]);
    expectVariedButFaithful(r.facts, r.side, ["M1.2", "Xe", "X7-9", "Mã đen"]);
  });

  it("để đối phương chiếu bí: giữ nước chiếu bí và nước chặn", () => {
    const r = review("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 b", [[6, 0, 7, 0]]);
    expectVariedButFaithful(r.facts, r.side, ["Đỏ", "X1-6", "M6/5", "chiếu bí"]);
  });

  it("lỗi chiến lược khai cuộc: luôn nêu nước nên đi, nước đã đi và quân mất căn", () => {
    const state = replayMoves([{ from: sq(9, 8), to: sq(8, 8) }]);
    const evals: PositionEval[] = [
      { score: 20, best: { from: sq(7, 7), to: sq(7, 4) } },
      { score: 130, best: { from: sq(0, 1), to: sq(2, 2) } },
    ];
    const m = reviewGame(state, evals).moves[0];
    expectVariedButFaithful(m.facts, m.side, ["P2-5", "X1.1", "Mã 2 "]);
  });

  it("nhận xét kế hoạch cho Xe qua hà: luôn nhắc tên nước và quân mất căn", () => {
    const line = [[7, 7, 7, 4], [0, 7, 2, 6], [9, 7, 7, 6], [0, 8, 0, 7], [9, 8, 9, 7], [0, 1, 2, 2], [9, 7, 3, 7]] as const;
    const state = replayMoves(line.map(([a, b, c, d]) => ({ from: sq(a, b), to: sq(c, d) })));
    const reply = findBestMove(state.history[7], 3, () => 0, { depth: 3, timeMs: 60_000, noise: 0 }).move;
    const fact = moveIdea(state.history[6].board, state.moves[6].move, reply, 6);
    expectVariedButFaithful([fact], "r", ["X2.6", "Xe 2 "]);
  });

  it("lỗi khai cuộc không có tên thế trận vẫn viết hoa đầu câu", () => {
    expect(explainText([{ kind: "openingFault", fault: "lateRook" }], "r")).toMatch(/^Khai cuộc cần sớm xuất Xe/);
  });

  describe("nhận diện hình cờ sát cục (patterns)", () => {
    it("explainMove phát hiện khi nước đi lập thế Mã hậu Pháo", () => {
      // Trước: Pháo đỏ ở (6, 2), Mã đỏ ở (3, 4), Tướng đen ở (0, 4)
      const beforePos = parseFen("4k4/9/9/4N4/9/9/2C6/9/9/4K4 w");
      // Đỏ đi P7-5 (từ (6, 2) sang (6, 4)) lập thế Mã hậu Pháo!
      const move = { from: sq(6, 2), to: sq(6, 4) };
      const afterBoard = beforePos.board.slice();
      afterBoard[move.to] = afterBoard[move.from];
      afterBoard[move.from] = null;

      const facts = explainMove({
        before: beforePos.board,
        move,
        after: afterBoard,
        evalBefore: { score: 500, best: move },
        evalAfter: { score: -500, best: null },
        loss: 0,
      });

      const pat = facts.find((f) => f.kind === "pattern");
      expect(pat).toBeDefined();
      expect(pat?.kind === "pattern" && pat.patternId).toBe("ma_hau_phao");
      expect(pat?.kind === "pattern" && pat.action).toBe("formed");

      const text = explainText(facts, "r");
      expect(text).toContain("Mã hậu Pháo");
    });

    it("explainMove phát hiện khi nước đi để đối phương lập thế Trùng Pháo", () => {
      const facts: Fact[] = [
        {
          kind: "pattern",
          patternId: "trung_phao",
          patternName: "Trùng Pháo",
          side: "b",
          action: "allowed",
          reply: "P5.2",
        },
      ];
      const text = explainText(facts, "r");
      expect(text).toContain("Trùng Pháo");
    });
  });
});
