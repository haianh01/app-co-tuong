// Kinh tế trong game: xu (sổ cái), điểm danh, nhiệm vụ hằng ngày, cửa hàng, VIP, mùa giải.
// Ngày tính theo giờ Việt Nam.

import { and, count, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { findItem, itemKey, type ItemKind } from "@/lib/skins";
import { isUniqueViolation } from "./auth";
import type { Database } from "./db";
import { coinTransactions, games, puzzleProgress, seasonRewards, userItems, users } from "./db/schema";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

const TZ = "Asia/Ho_Chi_Minh";
const DAY = 24 * 60 * 60_000;

/** "2026-10-10" theo giờ Việt Nam. */
export function dayKey(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Thời điểm 0 giờ (giờ Việt Nam) của ngày chứa `now`. */
export function startOfDay(now: number): Date {
  return new Date(`${dayKey(now)}T00:00:00+07:00`);
}

/** Mùa giải theo tháng: "2026-10". */
export const seasonKey = (now: number) => dayKey(now).slice(0, 7);

/** Mùa giải đang diễn ra (theo đồng hồ máy chủ). */
export const currentSeason = () => seasonKey(Date.now());

export function seasonRange(season: string): { start: Date; end: Date } {
  const [y, m] = season.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: new Date(`${season}-01T00:00:00+07:00`), end: new Date(`${next}-01T00:00:00+07:00`) };
}

export function previousSeason(season: string): string {
  const [y, m] = season.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export class CoinError extends Error {}

/**
 * Cộng/trừ xu và ghi sổ trong cùng transaction. Không cho số dư âm; cùng `reason` + `ref` chỉ ghi được một lần
 * (chống nhận thưởng hai lần khi bấm liên tục hoặc gửi lại yêu cầu).
 */
export async function addCoins(
  db: Database,
  userId: string,
  amount: number,
  reason: string,
  ref: string | null,
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  try {
    const balance = await db.transaction((tx) => addCoinsTx(tx, userId, amount, reason, ref));
    return { ok: true, balance };
  } catch (err) {
    if (err instanceof CoinError) return { ok: false, error: err.message };
    if (isUniqueViolation(err)) return { ok: false, error: "Bạn đã nhận phần thưởng này rồi." };
    throw err;
  }
}

export async function addCoinsTx(tx: Db, userId: string, amount: number, reason: string, ref: string | null): Promise<number> {
  const [u] = await tx
    .update(users)
    .set({ coins: sql`${users.coins} + ${amount}` })
    .where(amount < 0 ? and(eq(users.id, userId), gte(users.coins, -amount)) : eq(users.id, userId))
    .returning({ coins: users.coins });
  if (!u) throw new CoinError(amount < 0 ? "Không đủ xu." : "Không tìm thấy tài khoản.");
  await tx.insert(coinTransactions).values({ userId, amount, reason, ref });
  return u.coins;
}

// ---- Điểm danh ----

/** Thưởng điểm danh theo ngày liên tiếp (ngày 7 thưởng lớn, sau đó lặp lại). */
export const CHECKIN_REWARDS = [50, 60, 70, 80, 100, 120, 300];

export async function checkinStatus(db: Database, userId: string, now = Date.now()) {
  const rows = await db
    .select({ ref: coinTransactions.ref })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, "checkin")))
    .orderBy(desc(coinTransactions.ref))
    .limit(7);
  const days = new Set(rows.map((r) => r.ref));
  const today = dayKey(now);
  const claimedToday = days.has(today);
  // Đếm chuỗi ngày liên tiếp kết thúc ở hôm nay (nếu đã nhận) hoặc hôm qua.
  let streak = 0;
  for (let i = claimedToday ? 0 : 1; days.has(dayKey(now - i * DAY)); i++) streak++;
  const nextDay = claimedToday ? null : (streak % 7) + 1;
  return { claimedToday, streak, nextDay, nextReward: nextDay ? CHECKIN_REWARDS[nextDay - 1] : null };
}

export async function claimCheckin(db: Database, userId: string, now = Date.now()) {
  const status = await checkinStatus(db, userId, now);
  if (status.claimedToday || !status.nextReward) return { ok: false as const, error: "Hôm nay bạn đã điểm danh rồi." };
  const res = await addCoins(db, userId, status.nextReward, "checkin", dayKey(now));
  return res.ok ? { ok: true as const, reward: status.nextReward, day: status.nextDay!, balance: res.balance } : res;
}

// ---- Nhiệm vụ hằng ngày ----

export const MISSIONS = [
  { id: "play3", name: "Chơi 3 ván online", goal: 3, reward: 80 },
  { id: "win1", name: "Thắng 1 ván xếp hạng", goal: 1, reward: 100 },
  { id: "puzzle1", name: "Giải 1 thế cờ", goal: 1, reward: 50 },
] as const;

export type MissionId = (typeof MISSIONS)[number]["id"];

export async function missionProgress(db: Database, userId: string, now = Date.now()) {
  const since = startOfDay(now);
  const mine = or(eq(games.redId, userId), eq(games.blackId, userId));
  const [[played], [won], [solved], claims] = await Promise.all([
    db.select({ n: count() }).from(games).where(and(mine, gte(games.endedAt, since))),
    db
      .select({ n: count() })
      .from(games)
      .where(
        and(
          eq(games.rated, true),
          gte(games.endedAt, since),
          or(and(eq(games.redId, userId), eq(games.winner, "r")), and(eq(games.blackId, userId), eq(games.winner, "b"))),
        ),
      ),
    db.select({ n: count() }).from(puzzleProgress).where(and(eq(puzzleProgress.userId, userId), gte(puzzleProgress.solvedAt, since))),
    db
      .select({ ref: coinTransactions.ref })
      .from(coinTransactions)
      .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, "mission"))),
  ]);
  const done: Record<MissionId, number> = { play3: played.n, win1: won.n, puzzle1: solved.n };
  const claimed = new Set(claims.map((c) => c.ref));
  const day = dayKey(now);
  return MISSIONS.map((m) => ({
    ...m,
    progress: Math.min(m.goal, done[m.id]),
    complete: done[m.id] >= m.goal,
    claimed: claimed.has(`${m.id}:${day}`),
  }));
}

export async function claimMission(db: Database, userId: string, missionId: string, now = Date.now()) {
  const list = await missionProgress(db, userId, now);
  const m = list.find((x) => x.id === missionId);
  if (!m) return { ok: false as const, error: "Nhiệm vụ không tồn tại." };
  if (!m.complete) return { ok: false as const, error: "Bạn chưa hoàn thành nhiệm vụ này." };
  return addCoins(db, userId, m.reward, "mission", `${m.id}:${dayKey(now)}`);
}

// ---- VIP ----

export const VIP_DAILY_COINS = 300;

export async function claimVipDaily(db: Database, userId: string, now = Date.now()) {
  const [u] = await db.select({ vipUntil: users.vipUntil }).from(users).where(eq(users.id, userId));
  if (!u?.vipUntil || u.vipUntil.getTime() <= now) return { ok: false as const, error: "Chỉ dành cho thành viên VIP." };
  return addCoins(db, userId, VIP_DAILY_COINS, "vip_daily", dayKey(now));
}

/** `null` nếu không phải VIP; ngược lại cho biết hôm nay đã nhận quà VIP chưa. */
export async function vipDailyStatus(db: Database, userId: string, now = Date.now()) {
  const [u] = await db.select({ vipUntil: users.vipUntil }).from(users).where(eq(users.id, userId));
  if (!u?.vipUntil || u.vipUntil.getTime() <= now) return null;
  const [tx] = await db
    .select({ id: coinTransactions.id })
    .from(coinTransactions)
    .where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, "vip_daily"), eq(coinTransactions.ref, dayKey(now))));
  return { claimed: !!tx, until: u.vipUntil };
}

/** Gia hạn VIP thêm `days` ngày (tính từ hạn hiện tại nếu còn, không thì từ bây giờ). */
export async function extendVip(tx: Db, userId: string, days: number, now = Date.now()) {
  const [u] = await tx.select({ vipUntil: users.vipUntil }).from(users).where(eq(users.id, userId));
  const base = u?.vipUntil && u.vipUntil.getTime() > now ? u.vipUntil.getTime() : now;
  const until = new Date(base + days * DAY);
  await tx.update(users).set({ vipUntil: until }).where(eq(users.id, userId));
  return until;
}

// ---- Cửa hàng ----

const column = { board: "boardSkin", piece: "pieceSkin", frame: "frame" } as const;

export async function ownedItems(db: Database, userId: string): Promise<string[]> {
  const rows = await db.select({ itemId: userItems.itemId }).from(userItems).where(eq(userItems.userId, userId));
  return rows.map((r) => r.itemId);
}

export async function buyItem(db: Database, userId: string, kind: ItemKind, id: string) {
  const item = findItem(kind, id);
  if (!item) return { ok: false as const, error: "Vật phẩm không tồn tại." };
  if (item.price <= 0 || item.vipOnly || ("rewardOnly" in item && item.rewardOnly)) {
    return { ok: false as const, error: "Vật phẩm này không bán." };
  }
  try {
    const balance = await db.transaction(async (tx) => {
      await tx.insert(userItems).values({ userId, itemId: itemKey(kind, id) });
      return addCoinsTx(tx, userId, -item.price, "shop", itemKey(kind, id));
    });
    return { ok: true as const, balance };
  } catch (err) {
    if (err instanceof CoinError) return { ok: false as const, error: err.message };
    if (isUniqueViolation(err)) return { ok: false as const, error: "Bạn đã có vật phẩm này." };
    throw err;
  }
}

export async function equipItem(db: Database, userId: string, kind: ItemKind, id: string, now = Date.now()) {
  const item = findItem(kind, id);
  if (!item) return { ok: false as const, error: "Vật phẩm không tồn tại." };
  const [u] = await db.select({ vipUntil: users.vipUntil }).from(users).where(eq(users.id, userId));
  const vip = !!u?.vipUntil && u.vipUntil.getTime() > now;
  const free = item.price === 0 && !item.vipOnly && !("rewardOnly" in item && item.rewardOnly);
  const owned = (await ownedItems(db, userId)).includes(itemKey(kind, id));
  if (!free && !owned && !(item.vipOnly && vip)) {
    return { ok: false as const, error: item.vipOnly ? "Chỉ thành viên VIP mới dùng được." : "Bạn chưa sở hữu vật phẩm này." };
  }
  await db.update(users).set({ [column[kind]]: id }).where(eq(users.id, userId));
  return { ok: true as const };
}

// ---- Mùa giải ----

/** Xếp hạng mùa: tổng Elo kiếm được trong tháng (ván tính điểm), cần ít nhất `minGames` ván. */
export async function seasonStandings(db: Database, season: string, limit = 50, minGames = 1) {
  const { start, end } = seasonRange(season);
  const result = await db.execute(sql`
    select user_id, sum(delta)::int as points, count(*)::int as games from (
      select red_id as user_id, red_rating_after - red_rating_before as delta from ${games}
        where rated and ended_at >= ${start} and ended_at < ${end}
      union all
      select black_id, black_rating_after - black_rating_before from ${games}
        where rated and ended_at >= ${start} and ended_at < ${end}
    ) t group by user_id having count(*) >= ${minGames} order by points desc, games desc limit ${limit}
  `);
  // pg và PGlite đều trả kết quả trong `.rows`.
  const data = (result as unknown as { rows: { user_id: string; points: number; games: number }[] }).rows;
  if (!data.length) return [];
  const info = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, rating: users.rating, avatar: users.avatar, frame: users.frame, isGuest: users.isGuest })
    .from(users)
    .where(inArray(users.id, data.map((d) => d.user_id)));
  const byId = new Map(info.map((u) => [u.id, u]));
  return data
    .filter((d) => byId.get(d.user_id) && !byId.get(d.user_id)!.isGuest)
    .map((d) => ({ ...byId.get(d.user_id)!, points: Number(d.points), games: Number(d.games) }));
}

/** Thưởng cuối mùa: top 10 (ít nhất 5 ván) nhận xu theo SEASON_PRIZES và khung "Kỳ Vương". */
export const SEASON_ELIGIBLE_GAMES = 5;
export const SEASON_PRIZES = [5000, 3000, 2000, 1000, 1000, 500, 500, 500, 500, 500];

/** Trao thưởng mùa `season` (chỉ một lần). Trả về số người được thưởng, hoặc null nếu đã trao rồi. */
export async function awardSeason(db: Database, season: string): Promise<number | null> {
  const standings = await seasonStandings(db, season, SEASON_PRIZES.length, SEASON_ELIGIBLE_GAMES);
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(seasonRewards).values({ season });
      for (const [i, s] of standings.entries()) {
        await addCoinsTx(tx, s.id, SEASON_PRIZES[i], "season", season);
        await tx.insert(userItems).values({ userId: s.id, itemId: itemKey("frame", "champion") }).onConflictDoNothing();
      }
      return standings.length;
    });
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/** Gọi định kỳ: nếu mùa trước chưa trao thưởng thì trao. */
export async function awardPreviousSeasonIfDue(db: Database, now = Date.now()) {
  return awardSeason(db, previousSeason(seasonKey(now)));
}

export async function coinHistory(db: Database, userId: string, limit = 30) {
  return db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(desc(coinTransactions.createdAt), desc(coinTransactions.id))
    .limit(limit);
}
