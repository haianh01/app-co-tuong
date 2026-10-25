// Kiểm tra dữ liệu cờ thế: mỗi thế phải giải được đúng như đề bài, có đúng một nước thắng, thông tin hiển thị đầy đủ.

import { describe, expect, it } from "vitest";
import { applyMove, inCheck, isLegal, legalMoves, outcome, parseFen, type Move } from "./engine";
import { toughestReply, verifyLineSolution, verifySolution, winningMoves } from "./mate";
import { FREE_HINT_CHAPTER, PUZZLES } from "./puzzles";

const cases = PUZZLES.map((p) => [p.id, p] as const);
// Thế ngắn giải vét cạn được; thế dài (có biến chính Pikafish) kiểm theo biến chính.
const short = cases.filter(([, p]) => !p.line);
const deep = cases.filter(([, p]) => p.line);
const same = (a: Move, b: Move) => a.from === b.from && a.to === b.to;

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

  it.each(short)("%s: có đúng một nước thắng, không ngắn hơn đề bài", (_id, p) => {
    const pos = parseFen(p.fen);
    expect(isLegal(pos, p.solution)).toBe(true);
    if (p.depth === 2) expect(winningMoves(pos, 1)).toEqual([]);
    const wins = winningMoves(pos, p.depth);
    // Thế kinh điển có thể có vài cách chiếu bí; thế tự sinh thì phải duy nhất.
    if (p.id.startsWith("sat")) expect(wins).toEqual([p.solution]);
    else expect(wins).toContainEqual(p.solution);
    expect(wins.length).toBeLessThan(legalMoves(pos).length);
  });

  it.each(short)("%s: đi theo lời giải với phòng thủ cứng nhất vẫn kết thúc bằng chiếu bí", (_id, p) => {
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

  it("có chương thế dài (từ 3 nước) để luyện tính sâu", () => {
    const depths = new Set(deep.map(([, p]) => p.depth));
    for (const d of [3, 4, 5]) expect(depths.has(d)).toBe(true);
    expect(deep.every(([, p]) => p.depth >= 3)).toBe(true);
  });

  it.each(deep)("%s: biến chính đủ dài, đúng luật, chỉ chiếu bí ở nước cuối", (_id, p) => {
    const line = p.line!;
    expect(line).toHaveLength(2 * p.depth - 1);
    expect(same(line[0], p.solution)).toBe(true);
    let pos = parseFen(p.fen);
    // Không có đường tắt chiếu bí ngay nước đầu.
    expect(winningMoves(pos, 1)).toEqual([]);
    line.forEach((m, i) => {
      expect(isLegal(pos, m)).toBe(true);
      pos = applyMove(pos, m);
      if (i < line.length - 1) expect(outcome(pos).over).toBe(false);
    });
    expect(outcome(pos)).toMatchObject({ over: true, winner: "r" });
    expect(verifyLineSolution(parseFen(p.fen), line, line)).toBe(true);
  });

  it.each(deep)("%s: hai nước cuối vét cạn khớp biến chính (nước áp chót là duy nhất)", (_id, p) => {
    const line = p.line!;
    let pos = parseFen(p.fen);
    for (const m of line.slice(0, -3)) pos = applyMove(pos, m);
    expect(winningMoves(pos, 2)).toEqual([line.at(-3)]);
    // Đen đỡ cách nào cũng bị chiếu bí ngay.
    const after = applyMove(pos, line.at(-3)!);
    for (const r of legalMoves(after)) expect(winningMoves(applyMove(after, r), 1).length).toBeGreaterThan(0);
  });

  it.each(deep)("%s: máy chủ từ chối lời giải dở dang hoặc Đen đi lệch biến", (_id, p) => {
    const line = p.line!;
    const start = parseFen(p.fen);
    expect(verifyLineSolution(start, line.slice(0, -2), line)).toBe(false);
    let pos = applyMove(start, line[0]);
    const other = legalMoves(pos).find((r) => !same(r, line[1]));
    if (other) expect(verifyLineSolution(start, [line[0], other, line[2]], line)).toBe(false);
    pos = applyMove(pos, line[1]);
    expect(inCheck(start.board, "r")).toBe(false);
    // Nước Đỏ thứ hai sai (không phải biến chính, không chiếu bí ngay) bị từ chối.
    const wrong = legalMoves(pos).find((m) => !same(m, line[2]) && !outcome(applyMove(pos, m)).over);
    if (wrong) expect(verifyLineSolution(start, [line[0], line[1], wrong, ...line.slice(3)], line)).toBe(false);
  });
});
