import { describe, expect, it } from "vitest";
import { applyMove, inCheck, isLegal, outcome, parseFen } from "./engine";
import { moveWins } from "./mate";
import { moveNotation } from "./notation";
import { PUZZLES } from "./puzzles";

describe.each(PUZZLES)("thế cờ $id ($title)", (p) => {
  const pos = parseFen(p.fen);

  it("thế ban đầu hợp lệ: chưa ai bị chiếu", () => {
    expect(inCheck(pos.board, "r")).toBe(false);
    expect(inCheck(pos.board, "b")).toBe(false);
  });

  it("nước đầu của lời giải mẫu hợp lệ và ép thắng đúng số nước đề bài", () => {
    expect(isLegal(pos, p.solution)).toBe(true);
    expect(moveWins(pos, p.solution, p.depth)).toBe(true);
    if (p.depth === 1) expect(outcome(applyMove(pos, p.solution))).toMatchObject({ over: true, winner: "r" });
    else expect(outcome(applyMove(pos, p.solution)).over).toBe(false);
  });

  it("ký hiệu lời giải bắt đầu bằng đúng nước đầu", () => {
    expect(p.solutionText.split(" ")[0]).toBe(moveNotation(pos.board, p.solution));
  });
});
