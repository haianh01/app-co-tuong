import { describe, expect, it } from "vitest";
import { applyMove, initialPosition } from "@/lib/xiangqi/engine";
import { moveNotation } from "@/lib/xiangqi/notation";
import { DEFAULT_STAGE_SETTINGS, buildStageState } from "./stage-sync";
import { trialPosition, trialReducer } from "./trial";

const CANNON = { from: 7 * 9 + 7, to: 7 * 9 + 4 }; // Pháo đỏ bình giữa
const HORSE = { from: 0 * 9 + 1, to: 2 * 9 + 2 }; // Mã đen lên

describe("trialReducer", () => {
  it("đi thử trên bàn tạm, lùi từng nước, thoát thì bỏ hết", () => {
    const base = initialPosition();
    let t = trialReducer(null, { type: "start", base, startCount: 3 });
    t = trialReducer(t, { type: "move", move: CANNON });
    t = trialReducer(t, { type: "move", move: HORSE });
    expect(t?.startCount).toBe(3);
    expect(t?.moves.map((m) => m.notation)).toEqual([
      moveNotation(base.board, CANNON),
      moveNotation(applyMove(base, CANNON).board, HORSE),
    ]);
    expect(trialPosition(t!).board).toEqual(applyMove(applyMove(base, CANNON), HORSE).board);

    t = trialReducer(t, { type: "back" });
    expect(t?.moves).toHaveLength(1);
    expect(trialReducer(trialReducer(t, { type: "back" }), { type: "back" })?.moves).toEqual([]);
    expect(trialReducer(t, { type: "exit" })).toBeNull();
  });

  it("chưa bật đi thử thì nước đi bị bỏ qua", () => {
    expect(trialReducer(null, { type: "move", move: CANNON })).toBeNull();
  });
});

describe("buildStageState khi đi thử", () => {
  it("bàn cờ là biến thử, không bình luận / không khoảnh khắc lớn, giữ lượt của ván thật", () => {
    const start = initialPosition();
    const trialPos = applyMove(start, CANNON);
    const state = buildStageState({
      board: trialPos.board,
      turn: "r",
      ply: 0,
      lastMove: CANNON,
      checkSquare: null,
      notations: [],
      arrows: [],
      highlights: [],
      mySide: "r",
      settings: DEFAULT_STAGE_SETTINGS,
      trial: { notations: [moveNotation(start.board, CANNON)] },
    });
    expect(state.trial?.notations).toHaveLength(1);
    expect(state.commentary).toBeNull();
    expect(state.bigMoment).toBeNull();
    expect(state.turn).toBe("r");
    expect(state.board).toEqual(trialPos.board);
  });
});
