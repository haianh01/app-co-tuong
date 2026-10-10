// Kiểm tra dữ liệu cờ thế: mỗi thế phải giải được đúng như đề bài, có đúng một nước thắng, thông tin hiển thị đầy đủ.

import { describe, expect, it } from "vitest";
import { applyMove, isLegal, legalMoves, outcome, parseFen } from "./engine";
import { toughestReply, verifySolution, winningMoves } from "./mate";
import { FREE_HINT_CHAPTER, PUZZLES } from "./puzzles";

const cases = PUZZLES.map((p) => [p.id, p] as const);

describe("dữ liệu cờ thế", () => {
  it("đủ nhiều thế, mã không trùng và dùng được trong URL", () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(40);
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(PUZZLES.map((p) => p.fen)).size).toBe(PUZZLES.length);
    // Tên hiển thị trong danh sách cũng không được trùng (dễ nhầm thế).
    expect(new Set(PUZZLES.map((p) => p.title)).size).toBe(PUZZLES.length);
  });

  it("chương miễn phí gợi ý tồn tại và không phải VIP", () => {
    const free = PUZZLES.filter((p) => p.chapter === FREE_HINT_CHAPTER);
    expect(free.length).toBeGreaterThan(0);
    expect(free.every((p) => !p.vip)).toBe(true);
  });

  it("thế 1 nước dùng đủ loại quân ra đòn quyết định (không chỉ toàn xe)", () => {
    const maters = new Set(
      PUZZLES.filter((p) => p.depth === 1).map((p) => parseFen(p.fen).board[p.solution.from]!.toLowerCase()),
    );
    expect([...maters].sort()).toEqual(["c", "n", "p", "r"]);
  });

  it.each(cases)("%s: đủ thông tin hiển thị, đề khớp số nước", (_id, p) => {
    for (const field of [p.chapter, p.title, p.goal, p.hint, p.solutionText]) expect(field).toMatch(/\S/);
    expect(p.goal).toContain(`chiếu bí trong ${p.depth} nước`);
    expect(p.solutionText.split(" ")).toHaveLength(2 * p.depth - 1);
  });

  it.each(cases)("%s: Đỏ đi trước, ván chưa kết thúc, chưa ai bị chiếu", (_id, p) => {
    const pos = parseFen(p.fen);
    expect(pos.turn).toBe("r");
    expect(outcome(pos).over).toBe(false);
    expect(outcome({ board: pos.board, turn: "b" })).toMatchObject({ over: false, check: false });
    expect(p.goal).toMatch(/Đỏ đi trước/);
  });

  it.each(cases)("%s: có đúng một nước thắng, không ngắn hơn đề bài", (_id, p) => {
    const pos = parseFen(p.fen);
    expect(isLegal(pos, p.solution)).toBe(true);
    if (p.depth === 2) expect(winningMoves(pos, 1)).toEqual([]);
    const wins = winningMoves(pos, p.depth);
    // Thế kinh điển có thể có vài cách chiếu bí; thế tự sinh thì phải duy nhất.
    if (p.id.startsWith("sat")) expect(wins).toEqual([p.solution]);
    else expect(wins).toContainEqual(p.solution);
    expect(wins.length).toBeLessThan(legalMoves(pos).length);
  });

  it.each(cases)("%s: đi theo lời giải với phòng thủ cứng nhất vẫn kết thúc bằng chiếu bí", (_id, p) => {
    let pos = parseFen(p.fen);
    const line = [p.solution];
    pos = applyMove(pos, p.solution);
    for (let left = p.depth - 1; left > 0; left--) {
      const reply = toughestReply(pos, left)!;
      pos = applyMove(pos, reply);
      const [next] = winningMoves(pos, left);
      line.push(reply, next);
      pos = applyMove(pos, next);
    }
    expect(outcome(pos)).toEqual({ over: true, winner: "r", reason: "checkmate" });
    expect(verifySolution(parseFen(p.fen), line, p.depth)).toBe(true);
  });
});
