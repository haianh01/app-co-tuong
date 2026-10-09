import { describe, expect, it } from "vitest";
import { applyMove, inCheck, isLegal, outcome, parseFen } from "./engine";
import { moveNotation } from "./notation";
import { PUZZLES } from "./puzzles";

describe.each(PUZZLES)("thế cờ $title", (p) => {
  const pos = parseFen(p.fen);

  it("thế ban đầu hợp lệ: chưa ai bị chiếu", () => {
    expect(inCheck(pos.board, "r")).toBe(false);
    expect(inCheck(pos.board, "b")).toBe(false);
  });

  it("lời giải mẫu là nước hợp lệ và chiếu bí", () => {
    expect(isLegal(pos, p.solution)).toBe(true);
    expect(outcome(applyMove(pos, p.solution))).toMatchObject({ over: true, winner: "r" });
  });

  it("ký hiệu lời giải khớp", () => {
    expect(moveNotation(pos.board, p.solution)).toBe(p.solutionText);
  });
});
