import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { insertUser, resetDb } from "@/test/db";
import type { Database } from "./db";
import { coinTransactions, games, puzzleProgress, userItems, users } from "./db/schema";
import {
  CHECKIN_REWARDS, addCoins, awardSeason, buyItem, checkinStatus, claimCheckin, claimMission, claimVipDaily, dayKey,
  equipItem, missionProgress, seasonStandings, startOfDay,
} from "./economy";

let db: Database;
const DAY = 24 * 60 * 60_000;
// 10:00 sáng 10/10/2026 giờ Việt Nam.
const NOW = Date.parse("2026-10-10T10:00:00+07:00");

beforeAll(async () => {
  db = await resetDb();
});

const balance = async (id: string) => (await db.select({ c: users.coins }).from(users).where(eq(users.id, id)))[0].c;

let gameSeq = 0;
async function playGame(redId: string, blackId: string, winner: "r" | "b" | null, endedAt: number, rated = true, delta = 20) {
  gameSeq++;
  const d = winner === "r" ? delta : winner === "b" ? -delta : 0;
  await db.insert(games).values({
    id: `g${String(gameSeq).padStart(7, "0")}`, redId, blackId, minutes: 10, rated, winner, reason: winner ? "resign" : "agreement",
    moves: [], plies: 30, redRatingBefore: 1500, blackRatingBefore: 1500,
    redRatingAfter: 1500 + (rated ? d : 0), blackRatingAfter: 1500 - (rated ? d : 0),
    startedAt: new Date(endedAt - 600_000), endedAt: new Date(endedAt),
  });
}

describe("ngày theo giờ Việt Nam", () => {
  it("00:30 sáng giờ VN vẫn là ngày mới dù giờ UTC còn ngày cũ", () => {
    expect(dayKey(Date.parse("2026-10-09T17:30:00Z"))).toBe("2026-10-10");
    expect(startOfDay(NOW).toISOString()).toBe("2026-10-09T17:00:00.000Z");
  });
});

describe("xu", () => {
  it("không tiêu quá số dư; mọi thay đổi đều có trong sổ", async () => {
    const u = await insertUser(db, { coins: 100 });
    expect(await addCoins(db, u.id, -150, "shop", "x")).toEqual({ ok: false, error: "Không đủ xu." });
    expect(await balance(u.id)).toBe(100);
    expect(await addCoins(db, u.id, -100, "shop", "y")).toEqual({ ok: true, balance: 0 });
    const ledger = await db.select().from(coinTransactions).where(eq(coinTransactions.userId, u.id));
    expect(ledger.map((t) => t.amount)).toEqual([-100]);
  });

  it("bấm nhận cùng một phần thưởng hai lần cùng lúc: chỉ nhận một lần", async () => {
    const u = await insertUser(db);
    const results = await Promise.all([addCoins(db, u.id, 50, "checkin", "2026-10-10"), addCoins(db, u.id, 50, "checkin", "2026-10-10")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await balance(u.id)).toBe(50);
  });
});

describe("điểm danh", () => {
  it("chuỗi ngày liên tiếp tăng thưởng; ngày 7 thưởng lớn; bỏ một ngày thì bắt đầu lại", async () => {
    const u = await insertUser(db);
    for (let d = 0; d < 7; d++) {
      const res = await claimCheckin(db, u.id, NOW + d * DAY);
      expect(res).toMatchObject({ ok: true, day: d + 1, reward: CHECKIN_REWARDS[d] });
    }
    expect(await claimCheckin(db, u.id, NOW + 6 * DAY + 3600_000)).toMatchObject({ ok: false });
    expect(await balance(u.id)).toBe(CHECKIN_REWARDS.reduce((a, b) => a + b, 0));
    // Ngày 8 liên tiếp: vòng mới, quay lại mức ngày 1.
    expect(await claimCheckin(db, u.id, NOW + 7 * DAY)).toMatchObject({ ok: true, day: 1 });
    // Nghỉ ngày 9, điểm danh ngày 10: chuỗi bắt đầu lại.
    expect((await checkinStatus(db, u.id, NOW + 9 * DAY)).nextDay).toBe(1);
  });
});

describe("nhiệm vụ hằng ngày", () => {
  it("chưa xong thì không nhận được; xong thì nhận đúng một lần; ván hôm qua không tính", async () => {
    const me = await insertUser(db);
    const other = await insertUser(db);
    await playGame(me.id, other.id, "r", NOW - DAY); // hôm qua
    expect(await claimMission(db, me.id, "win1", NOW)).toMatchObject({ ok: false, error: "Bạn chưa hoàn thành nhiệm vụ này." });
    await playGame(other.id, me.id, "b", NOW - 3600_000); // thắng bằng quân Đen hôm nay
    await playGame(me.id, other.id, null, NOW - 1800_000, false); // ván giao hữu hòa
    const list = await missionProgress(db, me.id, NOW);
    expect(list.find((m) => m.id === "win1")).toMatchObject({ progress: 1, complete: true, claimed: false });
    expect(list.find((m) => m.id === "play3")).toMatchObject({ progress: 2, complete: false });
    expect(await claimMission(db, me.id, "win1", NOW)).toMatchObject({ ok: true, balance: 100 });
    expect(await claimMission(db, me.id, "win1", NOW)).toMatchObject({ ok: false });
    await db.insert(puzzleProgress).values({ userId: me.id, puzzleId: "p1", stars: 3, attempts: 1, solvedAt: new Date(NOW - 60_000) });
    expect(await claimMission(db, me.id, "puzzle1", NOW)).toMatchObject({ ok: true, balance: 150 });
  });
});

describe("cửa hàng", () => {
  it("mua cần đủ xu, không mua trùng, đồ miễn phí trang bị ngay, đồ VIP cần VIP", async () => {
    const u = await insertUser(db, { coins: 5000 });
    expect(await buyItem(db, u.id, "board", "jade")).toEqual({ ok: false, error: "Không đủ xu." });
    expect(await equipItem(db, u.id, "board", "jade")).toMatchObject({ ok: false });
    expect(await buyItem(db, u.id, "board", "bamboo")).toEqual({ ok: true, balance: 1400 });
    expect(await buyItem(db, u.id, "board", "bamboo")).toEqual({ ok: false, error: "Bạn đã có vật phẩm này." });
    expect(await balance(u.id)).toBe(1400);
    expect(await equipItem(db, u.id, "board", "bamboo")).toEqual({ ok: true });
    expect(await equipItem(db, u.id, "piece", "wood")).toEqual({ ok: true });
    expect(await buyItem(db, u.id, "board", "imperial")).toMatchObject({ ok: false, error: "Vật phẩm này không bán." });
    expect(await equipItem(db, u.id, "board", "imperial", NOW)).toMatchObject({ ok: false });
    await db.update(users).set({ vipUntil: new Date(NOW + DAY) }).where(eq(users.id, u.id));
    expect(await equipItem(db, u.id, "board", "imperial", NOW)).toEqual({ ok: true });
    expect((await db.select().from(users).where(eq(users.id, u.id)))[0].boardSkin).toBe("imperial");
  });

  it("thưởng VIP hằng ngày chỉ cho VIP, mỗi ngày một lần", async () => {
    const u = await insertUser(db);
    expect(await claimVipDaily(db, u.id, NOW)).toMatchObject({ ok: false });
    await db.update(users).set({ vipUntil: new Date(NOW + DAY) }).where(eq(users.id, u.id));
    expect(await claimVipDaily(db, u.id, NOW)).toMatchObject({ ok: true, balance: 300 });
    expect(await claimVipDaily(db, u.id, NOW + 1000)).toMatchObject({ ok: false });
  });
});

describe("mùa giải", () => {
  it("xếp theo Elo kiếm được trong tháng, cần đủ 5 ván; trao thưởng đúng một lần", async () => {
    const a = await insertUser(db, { displayName: "Vô Địch" });
    const b = await insertUser(db, { displayName: "Á Quân" });
    const c = await insertUser(db, { displayName: "Ít Ván" });
    const inSeason = Date.parse("2026-09-15T12:00:00+07:00");
    for (let i = 0; i < 5; i++) await playGame(a.id, b.id, "r", inSeason + i * 1000);
    await playGame(c.id, b.id, "r", inSeason + 9000);
    await playGame(a.id, b.id, "r", Date.parse("2026-10-01T00:30:00+07:00")); // tháng sau, không tính

    const standings = await seasonStandings(db, "2026-09", 10, 5);
    expect(standings.map((s) => [s.displayName, s.points, s.games])).toEqual([["Vô Địch", 100, 5], ["Á Quân", -120, 6]]);

    expect(await awardSeason(db, "2026-09")).toBe(2);
    expect(await awardSeason(db, "2026-09")).toBeNull();
    expect(await balance(a.id)).toBe(5000);
    const frames = await db.select().from(userItems).where(eq(userItems.userId, a.id));
    expect(frames.map((f) => f.itemId)).toContain("frame:champion");
    expect(await equipItem(db, a.id, "frame", "champion")).toEqual({ ok: true });
    expect(await equipItem(db, c.id, "frame", "champion")).toMatchObject({ ok: false });
  });
});
