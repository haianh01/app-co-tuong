import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { sq } from "@/lib/xiangqi/engine";
import { insertUser, playerInfo, resetDb } from "@/test/db";
import type { Database } from "./db";
import { coinTransactions, tournamentPlayers, tournaments, userItems, users, type User } from "./db/schema";
import { saveFinishedGame } from "./game/persist";
import { GameRoom } from "./game/room";
import {
  ARENA_SCHEDULE, FINISH_GRACE_MS, advanceTournaments, arenaPoints, ensureSchedule, finishTournament, joinTournament,
  listTournaments, standings,
} from "./tournaments";

let db: Database;
const MIN = 60_000;
// Thứ Bảy 10/10/2026, 10:00 sáng giờ Việt Nam.
const SAT = Date.parse("2026-10-10T10:00:00+07:00");
const P2_5 = { from: sq(7, 7), to: sq(7, 4) };
const M8_7 = { from: sq(0, 7), to: sq(2, 6) };

beforeAll(async () => {
  db = await resetDb();
});

let gameSeq = 0;
/** Một ván giải đấu thật: hai nước mở đầu rồi `outcome` (đỏ thắng / đen thắng / hòa), lưu qua đường lưu ván thật. */
async function play(tid: string, red: User, black: User, outcome: "r" | "b" | "draw", at: number) {
  gameSeq++;
  const room = new GameRoom(`t${String(gameSeq).padStart(7, "0")}`, { r: playerInfo(red), b: playerInfo(black) }, 5, at, {
    increment: 3, rated: true, tournamentId: tid,
  });
  room.move(red.id, P2_5, at + 1000);
  room.move(black.id, M8_7, at + 2000);
  if (outcome === "draw") {
    room.draw(red.id, "offer", at + 3000);
    room.draw(black.id, "accept", at + 4000);
  } else {
    room.resign(outcome === "r" ? black.id : red.id, at + 3000);
  }
  return saveFinishedGame(db, room);
}

const row = async (tid: string, userId: string) =>
  (await db.select().from(tournamentPlayers).where(and(eq(tournamentPlayers.tournamentId, tid), eq(tournamentPlayers.userId, userId))))[0];

describe("lịch giải", () => {
  it("tạo giải hôm nay và ngày mai theo giờ Việt Nam; giải Chủ nhật chỉ có vào Chủ nhật; gọi lại không tạo trùng", async () => {
    await ensureSchedule(db, SAT);
    await ensureSchedule(db, SAT + 5 * MIN);
    const all = await db.select().from(tournaments);
    const ids = all.map((t) => t.id).sort();
    expect(ids).toEqual(["a20261010to", "a20261010tr", "a20261011cn", "a20261011to", "a20261011tr"]);
    const toi = all.find((t) => t.id === "a20261010to")!;
    expect(toi.startsAt.toISOString()).toBe("2026-10-10T13:00:00.000Z"); // 20:00 giờ VN
    expect(toi.endsAt.getTime() - toi.startsAt.getTime()).toBe(45 * MIN);
    expect(toi).toMatchObject({ minutes: 5, increment: 3, status: "scheduled", prizes: ARENA_SCHEDULE[1].prizes });
  });

  it("đến giờ thì bắt đầu; danh sách tách đang diễn ra / sắp diễn ra", async () => {
    const noon = Date.parse("2026-10-10T12:00:30+07:00");
    const { started } = await advanceTournaments(db, noon, new Set());
    expect(started).toEqual(["a20261010tr"]);
    const list = await listTournaments(db, noon);
    expect(list.live.map((t) => t.id)).toEqual(["a20261010tr"]);
    expect(list.upcoming.map((t) => t.id)).toContain("a20261010to");
  });
});

describe("đăng ký", () => {
  it("khách, tài khoản bị khóa và giải đã kết thúc không đăng ký được; đăng ký hai lần không sao", async () => {
    const guest = await insertUser(db, { isGuest: true });
    const banned = await insertUser(db, { bannedUntil: new Date(SAT + 24 * 60 * MIN) });
    const ok = await insertUser(db, { rating: 1650 });
    expect(await joinTournament(db, "a20261010to", guest.id, SAT)).toMatchObject({ ok: false, error: expect.stringMatching(/Khách/) });
    expect(await joinTournament(db, "a20261010to", banned.id, SAT)).toMatchObject({ ok: false });
    expect(await joinTournament(db, "khongco", ok.id, SAT)).toMatchObject({ ok: false });
    expect(await joinTournament(db, "a20261010to", ok.id, SAT)).toEqual({ ok: true });
    expect(await joinTournament(db, "a20261010to", ok.id, SAT)).toEqual({ ok: true });
    expect(await row("a20261010to", ok.id)).toMatchObject({ ratingAtJoin: 1650, score: 0, games: 0 });
    // Giải 20:00–20:45: lúc 21:00 đã hết giờ.
    expect(await joinTournament(db, "a20261010to", ok.id, Date.parse("2026-10-10T21:00:00+07:00"))).toMatchObject({ ok: false });
  });
});

describe("tính điểm", () => {
  it("thắng 2, hòa 1, thua 0; chuỗi 2 trận thắng thì trận thắng thứ 3 được 4 điểm, hòa cắt chuỗi", () => {
    expect(arenaPoints("win", [])).toBe(2);
    expect(arenaPoints("win", ["win"])).toBe(2);
    expect(arenaPoints("win", ["win", "win"])).toBe(4);
    expect(arenaPoints("win", ["draw", "win"])).toBe(2);
    expect(arenaPoints("draw", ["win", "win"])).toBe(1);
    expect(arenaPoints("loss", ["win", "win"])).toBe(0);
  });

  it("các ván trong giải cộng điểm đúng cho cả hai bên, ván ngoài giải không ảnh hưởng", async () => {
    const tid = "a20261010tr";
    const [a, b, c] = await Promise.all([insertUser(db), insertUser(db), insertUser(db)]);
    for (const u of [a, b, c]) await joinTournament(db, tid, u.id, Date.parse("2026-10-10T12:01:00+07:00"));
    let t = Date.parse("2026-10-10T12:02:00+07:00");
    await play(tid, a, b, "r", t); // a +2
    await play(tid, c, a, "b", (t += 5 * MIN)); // a +2 (chuỗi 2)
    await play(tid, a, b, "r", (t += 5 * MIN)); // a +4 (chuỗi 3)
    await play(tid, b, a, "draw", (t += 5 * MIN)); // a +1, b +1
    await play(tid, a, c, "r", (t += 5 * MIN)); // a +2 (hòa đã cắt chuỗi)
    await play(tid, c, b, "b", (t += 5 * MIN)); // b +2

    expect(await row(tid, a.id)).toMatchObject({ score: 11, games: 5, wins: 4, draws: 1, losses: 0 });
    expect(await row(tid, b.id)).toMatchObject({ score: 3, games: 4, wins: 1, draws: 1, losses: 2 });
    expect(await row(tid, c.id)).toMatchObject({ score: 0, games: 3, losses: 3 });

    const s = await standings(db, tid);
    expect(s.map((x) => x.userId)).toEqual([a.id, b.id, c.id]);
  });

  it("ván giải đấu kết thúc sau khi giải đã chốt thì không được cộng điểm", async () => {
    const tid = "a20261010to";
    // Chỉ bật giải tối (không gọi advanceTournaments để giải trưa còn nguyên cho test sau).
    await db.update(tournaments).set({ status: "running" }).where(eq(tournaments.id, tid));
    const [x, y] = await Promise.all([insertUser(db), insertUser(db)]);
    await finishTournament(db, tid);
    await play(tid, x, y, "r", Date.parse("2026-10-10T20:44:00+07:00"));
    expect(await row(tid, x.id)).toBeUndefined();
  });
});

describe("kết thúc và trao thưởng", () => {
  it("hết giờ nhưng còn ván đang chơi thì chờ; ván xong (hoặc quá hạn chờ) thì chốt, trao xu đúng hạng và khung cho quán quân", async () => {
    const tid = "a20261010tr";
    const end = Date.parse("2026-10-10T12:30:00+07:00");
    const ranked = await standings(db, tid);
    const before = await Promise.all(ranked.map(async (r) => (await db.select({ c: users.coins }).from(users).where(eq(users.id, r.userId)))[0].c));

    expect((await advanceTournaments(db, end + MIN, new Set([tid]))).finished).toEqual([]);
    expect((await advanceTournaments(db, end + FINISH_GRACE_MS + MIN, new Set([tid]))).finished).toEqual([tid]);
    // Chốt lại lần nữa không trao thưởng thêm.
    expect(await finishTournament(db, tid)).toBeNull();

    const prizes = ARENA_SCHEDULE[0].prizes;
    // Người có 0 ván không nhận thưởng; ở đây cả 3 đều đã chơi.
    for (const [i, r] of ranked.entries()) {
      const [u] = await db.select({ c: users.coins }).from(users).where(eq(users.id, r.userId));
      expect(u.c - before[i]).toBe(prizes[i] ?? 0);
    }
    const tx = await db.select().from(coinTransactions).where(and(eq(coinTransactions.reason, "tournament"), eq(coinTransactions.ref, tid)));
    expect(tx).toHaveLength(Math.min(prizes.length, ranked.length));
    const frames = await db.select().from(userItems).where(eq(userItems.itemId, "frame:arena"));
    expect(frames.map((f) => f.userId)).toEqual([ranked[0].userId]);
  });

  it("người đăng ký nhưng không chơi ván nào không được thưởng dù giải vắng người", async () => {
    const tid = "a20261011tr";
    const [idle, player, opp] = await Promise.all([insertUser(db), insertUser(db), insertUser(db)]);
    const start = Date.parse("2026-10-11T12:00:30+07:00");
    await advanceTournaments(db, start, new Set());
    for (const u of [idle, player, opp]) await joinTournament(db, tid, u.id, start);
    await play(tid, player, opp, "r", start + MIN);
    const res = await finishTournament(db, tid);
    expect(res?.winners).toEqual([player.id, opp.id]);
  });
});
