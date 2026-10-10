import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { applyMove, legalMoves, parseFen, type Move } from "@/lib/xiangqi/engine";
import { toughestReply, winningMoves } from "@/lib/xiangqi/mate";
import { FREE_HINT_CHAPTER, PUZZLES } from "@/lib/xiangqi/puzzles";
import { insertUser, resetDb } from "@/test/db";
import type { Database } from "./db";
import { coinTransactions, puzzleProgress, users } from "./db/schema";
import { missionProgress } from "./economy";
import { HINT_COST, PUZZLE_REWARD, buyHint, puzzleState, submitPuzzle } from "./puzzles";

let db: Database;
const balance = async (id: string) => (await db.select({ c: users.coins }).from(users).where(eq(users.id, id)))[0].c;

const ONE = PUZZLES.find((p) => p.depth === 1 && p.chapter !== FREE_HINT_CHAPTER)!;
const CLASSIC = PUZZLES.find((p) => p.chapter === FREE_HINT_CHAPTER)!;
const TWO = PUZZLES.find((p) => p.depth === 2)!;

/** Lời giải đầy đủ cho thế 2 nước, Đen đỡ cứng nhất. */
function fullLine(fen: string, first: Move): Move[] {
  const a = applyMove(parseFen(fen), first);
  const reply = toughestReply(a, 1)!;
  const [mate] = winningMoves(applyMove(a, reply), 1);
  return [first, reply, mate];
}

beforeAll(async () => {
  db = await resetDb();
});

describe("nộp lời giải", () => {
  it("giải đúng lần đầu: lưu tiến độ 3 sao, thưởng xu; giải lại không thưởng thêm", async () => {
    const u = await insertUser(db);
    const first = await submitPuzzle(db, u.id, ONE.id, [ONE.solution], 1);
    expect(first).toEqual({ ok: true, stars: 3, reward: PUZZLE_REWARD[1], firstSolve: true });
    expect(await balance(u.id)).toBe(PUZZLE_REWARD[1]);

    const again = await submitPuzzle(db, u.id, ONE.id, [ONE.solution], 1);
    expect(again).toMatchObject({ ok: true, reward: 0, firstSolve: false });
    expect(await balance(u.id)).toBe(PUZZLE_REWARD[1]);
  });

  it("gửi nước không chiếu bí (chỉnh sửa request) bị từ chối, không lưu gì", async () => {
    const u = await insertUser(db);
    const pos = parseFen(ONE.fen);
    const wrong = legalMoves(pos).find((m) => m.from !== ONE.solution.from || m.to !== ONE.solution.to)!;
    expect(await submitPuzzle(db, u.id, ONE.id, [wrong], 1)).toMatchObject({ ok: false });
    expect(await db.select().from(puzzleProgress).where(eq(puzzleProgress.userId, u.id))).toEqual([]);
    expect(await balance(u.id)).toBe(0);
  });

  it("dùng lời giải của thế khác cho thế này bị từ chối", async () => {
    const u = await insertUser(db);
    const other = PUZZLES.find((p) => p.depth === 1 && p.id !== ONE.id && (p.solution.from !== ONE.solution.from || p.solution.to !== ONE.solution.to))!;
    expect(await submitPuzzle(db, u.id, ONE.id, [other.solution], 1)).toMatchObject({ ok: false });
  });

  it("thử nhiều lần thì ít sao hơn; giải lại tốt hơn thì sao tăng, tệ hơn thì không giảm", async () => {
    const u = await insertUser(db);
    expect(await submitPuzzle(db, u.id, ONE.id, [ONE.solution], 5)).toMatchObject({ stars: 1 });
    await submitPuzzle(db, u.id, ONE.id, [ONE.solution], 2);
    expect((await puzzleState(db, u.id)).stars[ONE.id]).toBe(2);
    await submitPuzzle(db, u.id, ONE.id, [ONE.solution], 9);
    expect((await puzzleState(db, u.id)).stars[ONE.id]).toBe(2);
  });

  it("thế VIP: người thường bị từ chối, VIP giải được và nhận thưởng lớn hơn", async () => {
    const normal = await insertUser(db);
    const vip = await insertUser(db, { vipUntil: new Date(Date.now() + 86_400_000) });
    const line = fullLine(TWO.fen, TWO.solution);
    expect(await submitPuzzle(db, normal.id, TWO.id, line, 1)).toMatchObject({ ok: false, error: expect.stringMatching(/VIP/) });
    expect(await submitPuzzle(db, vip.id, TWO.id, line, 1)).toMatchObject({ ok: true, reward: PUZZLE_REWARD[2] });
  });

  it("VIP hết hạn thì không còn giải được chương VIP", async () => {
    const lapsed = await insertUser(db, { vipUntil: new Date(Date.now() - 1000) });
    expect(await submitPuzzle(db, lapsed.id, TWO.id, fullLine(TWO.fen, TWO.solution), 1)).toMatchObject({ ok: false });
  });

  it("thế 2 nước: chỉ gửi nước đầu (chưa chiếu bí) bị từ chối", async () => {
    const vip = await insertUser(db, { vipUntil: new Date(Date.now() + 86_400_000) });
    expect(await submitPuzzle(db, vip.id, TWO.id, [TWO.solution], 1)).toMatchObject({ ok: false });
  });

  it("giải thế cờ được tính cho nhiệm vụ 'Giải 1 thế cờ' hôm nay", async () => {
    const u = await insertUser(db);
    await submitPuzzle(db, u.id, CLASSIC.id, [CLASSIC.solution], 1);
    const m = (await missionProgress(db, u.id)).find((x) => x.id === "puzzle1")!;
    expect(m).toMatchObject({ progress: 1, complete: true });
  });
});

describe("gợi ý", () => {
  it("trừ 10 xu một lần cho mỗi thế; xem lại miễn phí; gợi ý làm mất sao tối đa", async () => {
    const u = await insertUser(db, { coins: 25 });
    expect(await buyHint(db, u.id, ONE.id)).toMatchObject({ ok: true, charged: HINT_COST, from: ONE.solution.from });
    expect(await buyHint(db, u.id, ONE.id)).toMatchObject({ ok: true, charged: 0 });
    expect(await balance(u.id)).toBe(25 - HINT_COST);
    expect((await puzzleState(db, u.id)).hints).toEqual([ONE.id]);
    // Giải ngay lần đầu nhưng đã xem gợi ý: 2 sao.
    expect(await submitPuzzle(db, u.id, ONE.id, [ONE.solution], 1)).toMatchObject({ stars: 2 });
  });

  it("không đủ xu thì không có gợi ý, số dư giữ nguyên", async () => {
    const u = await insertUser(db, { coins: HINT_COST - 1 });
    expect(await buyHint(db, u.id, ONE.id)).toMatchObject({ ok: false });
    expect(await balance(u.id)).toBe(HINT_COST - 1);
  });

  it("bấm gợi ý hai lần cùng lúc chỉ bị trừ xu một lần", async () => {
    const u = await insertUser(db, { coins: 100 });
    const res = await Promise.all([buyHint(db, u.id, ONE.id), buyHint(db, u.id, ONE.id)]);
    expect(res.every((r) => r.ok)).toBe(true);
    expect(await balance(u.id)).toBe(100 - HINT_COST);
    const tx = await db.select().from(coinTransactions).where(and(eq(coinTransactions.userId, u.id), eq(coinTransactions.reason, "hint")));
    expect(tx).toHaveLength(1);
  });

  it("chương hướng dẫn được gợi ý miễn phí và vẫn được 3 sao", async () => {
    const u = await insertUser(db);
    expect(await buyHint(db, u.id, CLASSIC.id)).toMatchObject({ ok: true, charged: 0 });
    expect(await submitPuzzle(db, u.id, CLASSIC.id, [CLASSIC.solution], 1)).toMatchObject({ stars: 3 });
  });

  it("không mua được gợi ý thế VIP khi không phải VIP", async () => {
    const u = await insertUser(db, { coins: 100 });
    expect(await buyHint(db, u.id, TWO.id)).toMatchObject({ ok: false });
    expect(await balance(u.id)).toBe(100);
  });
});
