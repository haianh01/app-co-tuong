import { describe, expect, it } from "vitest";
import { sq } from "./engine";
import { currentPosition, gameReducer, newGame, replayMoves } from "./game";

describe("gameReducer", () => {
  it("ghi biên bản và đổi lượt", () => {
    const s = gameReducer(newGame(), { type: "move", move: { from: sq(7, 7), to: sq(7, 4) } });
    expect(s.moves.map((m) => m.notation)).toEqual(["P2-5"]);
    expect(currentPosition(s).turn).toBe("b");
  });

  it("bỏ qua nước đi sai luật", () => {
    const start = newGame();
    expect(gameReducer(start, { type: "move", move: { from: sq(9, 0), to: sq(5, 0) } })).toBe(start);
  });

  it("đi lại 2 nửa nước", () => {
    let s = newGame();
    s = gameReducer(s, { type: "move", move: { from: sq(7, 7), to: sq(7, 4) } });
    s = gameReducer(s, { type: "move", move: { from: sq(0, 7), to: sq(2, 6) } });
    s = gameReducer(s, { type: "undo", plies: 2 });
    expect(s.moves).toHaveLength(0);
    expect(s.history).toHaveLength(1);
  });

  it("ghi nhận chiếu bí", () => {
    const s = gameReducer(newGame("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w"), {
      type: "move", move: { from: sq(2, 8), to: sq(2, 3) },
    });
    expect(s.result).toEqual({ winner: "r", reason: "checkmate" });
  });

  it("xử hòa khi lặp thế cờ 3 lần", () => {
    let s = newGame();
    const shuffle = [
      { from: sq(9, 0), to: sq(8, 0) }, { from: sq(0, 0), to: sq(1, 0) },
      { from: sq(8, 0), to: sq(9, 0) }, { from: sq(1, 0), to: sq(0, 0) },
    ];
    for (let i = 0; i < 2; i++) for (const move of shuffle) s = gameReducer(s, { type: "move", move });
    expect(s.result).toEqual({ winner: null, reason: "repetition" });
  });

  it("bên chiếu mãi khi lặp thế 3 lần bị xử thua", () => {
    // Xe đỏ chiếu qua lại giữa cột 4 và 5, tướng đen buộc phải chạy qua lại.
    let s = newGame("3k5/9/9/9/9/4R4/9/9/9/5K3 w");
    const cycle = [
      { from: sq(5, 4), to: sq(5, 3) }, { from: sq(0, 3), to: sq(0, 4) },
      { from: sq(5, 3), to: sq(5, 4) }, { from: sq(0, 4), to: sq(0, 3) },
    ];
    for (let i = 0; i < 2; i++) {
      for (const move of cycle) {
        expect(s.result).toBeNull();
        s = gameReducer(s, { type: "move", move });
      }
    }
    expect(s.moves.filter((m) => m.side === "r").every((m) => m.check)).toBe(true);
    expect(s.result).toEqual({ winner: "b", reason: "perpetualCheck" });
  });

  it("replayMoves dựng lại đúng ván từ danh sách nước", () => {
    const s = replayMoves([{ from: sq(7, 7), to: sq(7, 4) }, { from: sq(0, 7), to: sq(2, 6) }]);
    expect(s.moves.map((m) => m.notation)).toEqual(["P2-5", "M8.7"]);
    expect(currentPosition(s).turn).toBe("r");
  });
});
