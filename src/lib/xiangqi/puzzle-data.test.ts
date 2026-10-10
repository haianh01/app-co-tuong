// Kiểm tra dữ liệu cờ thế: mỗi thế phải giải được đúng như mô tả, thông tin hiển thị đầy đủ.

import { describe, expect, it } from "vitest";
import { applyMove, isLegal, legalMoves, outcome, parseFen } from "./engine";
import { PUZZLES } from "./puzzles";

describe("dữ liệu cờ thế", () => {
  it("có ít nhất một thế, mã không trùng và dùng được trong URL", () => {
    expect(PUZZLES.length).toBeGreaterThan(0);
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it.each(PUZZLES.map((p) => [p.title, p] as const))("'%s': đủ thông tin hiển thị", (_t, p) => {
    for (const field of [p.chapter, p.title, p.goal, p.hint, p.solutionText]) expect(field).toMatch(/\S/);
  });

  it.each(PUZZLES.map((p) => [p.title, p] as const))("'%s': Đỏ đi trước, ván chưa kết thúc", (_t, p) => {
    const pos = parseFen(p.fen);
    expect(pos.turn).toBe("r");
    expect(outcome(pos).over).toBe(false);
    expect(p.goal).toMatch(/Đỏ đi trước/);
  });

  it.each(PUZZLES.map((p) => [p.title, p] as const))("'%s': lời giải là chiếu bí thật (không phải vây hết nước)", (_t, p) => {
    const pos = parseFen(p.fen);
    expect(isLegal(pos, p.solution)).toBe(true);
    expect(outcome(applyMove(pos, p.solution))).toEqual({ over: true, winner: "r", reason: "checkmate" });
  });

  it.each(PUZZLES.map((p) => [p.title, p] as const))("'%s': thế cờ có lời giải trong 1 nước như đề bài", (_t, p) => {
    const pos = parseFen(p.fen);
    const mates = legalMoves(pos).filter((mv) => outcome(applyMove(pos, mv)).over);
    expect(mates.length).toBeGreaterThanOrEqual(1);
    // Không phải thế "nước nào cũng thắng": vẫn có nước sai để người chơi phải nghĩ.
    expect(mates.length).toBeLessThan(legalMoves(pos).length);
  });
});
