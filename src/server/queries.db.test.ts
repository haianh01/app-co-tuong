import { beforeAll, describe, expect, it } from "vitest";
import { sq } from "@/lib/xiangqi/engine";
import { insertUser, resetDb } from "@/test/db";
import type { Database } from "./db";
import { coinTransactions, games, puzzleProgress } from "./db/schema";
import { getProfileExtras } from "./queries";

let db: Database;
let seq = 0;

// Nước đầu thật trên bàn cờ (hàng 9 là hàng quân Đỏ): Pháo đầu P2-5, Khởi mã M2.3; Đen đáp Mã 8 tiến 7 (M8.7 theo phía Đen).
const P2_5 = { from: sq(7, 7), to: sq(7, 4) };
const M2_3 = { from: sq(9, 7), to: sq(7, 6) };
const BLACK_M8_7 = { from: sq(0, 7), to: sq(2, 6) };

async function game(redId: string, blackId: string, winner: "r" | "b" | null, moves: { from: number; to: number }[], variant = "xiangqi") {
  seq++;
  await db.insert(games).values({
    id: `q${String(seq).padStart(7, "0")}`, redId, blackId, minutes: 10, winner, reason: winner ? "resign" : "agreement", variant,
    moves, plies: moves.length, redRatingBefore: 1500, blackRatingBefore: 1500, redRatingAfter: 1500, blackRatingAfter: 1500,
    startedAt: new Date(Date.now() - 600_000 - seq), endedAt: new Date(Date.now() - seq),
  });
}

beforeAll(async () => {
  db = await resetDb();
});

describe("thống kê hồ sơ", () => {
  it("gom khai cuộc theo bên cầm quân, tính thắng/hòa/thua đúng phía người chơi", async () => {
    const me = await insertUser(db);
    const opp = await insertUser(db);
    await game(me.id, opp.id, "r", [P2_5, BLACK_M8_7]);
    await game(me.id, opp.id, "b", [P2_5, BLACK_M8_7]);
    await game(me.id, opp.id, null, [M2_3]);
    await game(opp.id, me.id, "b", [P2_5, BLACK_M8_7]); // tôi cầm Đen và thắng
    await game(opp.id, me.id, "r", [P2_5]); // Đen chưa kịp đi: không tính khai cuộc Đen
    await game(me.id, opp.id, "r", []); // ván không có nước nào

    const x = await getProfileExtras(db, me.id);
    expect(x.openingsRed).toEqual([
      expect.objectContaining({ name: "Pháo đầu (Trung pháo)", games: 2, wins: 1, losses: 1, draws: 0 }),
      expect.objectContaining({ name: "Khởi mã", games: 1, draws: 1 }),
    ]);
    expect(x.openingsBlack).toEqual([expect.objectContaining({ name: "Khởi mã", games: 1, wins: 1 })]);
  });

  it("đếm thế cờ đã giải, số mùa nhận thưởng; VIP hết hạn không tính", async () => {
    const u = await insertUser(db, { vipUntil: new Date(Date.now() - 1000) });
    await db.insert(puzzleProgress).values([
      { userId: u.id, puzzleId: "sat1-01", stars: 3, attempts: 1 },
      { userId: u.id, puzzleId: "sat1-02", stars: 1, attempts: 5 },
    ]);
    await db.insert(coinTransactions).values({ userId: u.id, amount: 500, reason: "season", ref: "2026-09" });
    expect(await getProfileExtras(db, u.id)).toMatchObject({ puzzlesSolved: 2, seasonsTop10: 1, vip: false, openingsRed: [] });
  });
});
