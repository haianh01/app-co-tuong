// Giải đấu Arena: lịch tự động, đăng ký, tính điểm từng ván, kết thúc và trao thưởng.
// Thể thức: trong khung giờ của giải, xong ván là được ghép ván mới. Thắng 2, hòa 1, thua 0;
// đang có chuỗi 2 trận thắng liền thì trận thắng tiếp theo được nhân đôi (4 điểm).

import { and, asc, desc, eq, gt, inArray, lte, ne, or, sql } from "drizzle-orm";
import { findTimeControl } from "@/lib/online/protocol";
import { itemKey } from "@/lib/skins";
import type { Database } from "./db";
import { games, tournamentPlayers, tournaments, userItems, users } from "./db/schema";
import { addCoinsTx, dayKey } from "./economy";
import { onGameSaved, type GameSavedHook } from "./game/persist";

type Tx = Parameters<GameSavedHook>[0];

const MINUTE = 60_000;
/** Ván đang dở khi hết giờ vẫn được tính; quá thời hạn này thì chốt giải luôn. */
export const FINISH_GRACE_MS = 30 * MINUTE;

export interface ArenaTemplate {
  /** 2 ký tự, ghép vào mã giải: "a" + yyyymmdd + key. */
  key: string;
  name: string;
  hour: number;
  minute: number;
  durationMin: number;
  tc: string;
  prizes: number[];
  /** Ngày trong tuần (0 = Chủ nhật); bỏ trống = mọi ngày. */
  weekday?: number;
}

export const ARENA_SCHEDULE: ArenaTemplate[] = [
  { key: "tr", name: "Arena trưa 3+2", hour: 12, minute: 0, durationMin: 30, tc: "3+2", prizes: [1000, 600, 400] },
  { key: "to", name: "Arena tối 5+3", hour: 20, minute: 0, durationMin: 45, tc: "5+3", prizes: [2000, 1200, 800, 400, 400] },
  { key: "cn", name: "Arena Chủ nhật 10+0", hour: 15, minute: 0, durationMin: 90, tc: "10+0", prizes: [5000, 3000, 2000, 1000, 1000], weekday: 0 },
];

export type Tournament = typeof tournaments.$inferSelect;

/** Tạo các giải theo lịch cho hôm nay và ngày mai (giờ Việt Nam). Gọi lại nhiều lần cũng không tạo trùng. */
export async function ensureSchedule(db: Database, now = Date.now()) {
  const rows: (typeof tournaments.$inferInsert)[] = [];
  for (const offset of [0, 1]) {
    const day = dayKey(now + offset * 24 * 60 * MINUTE);
    const weekday = new Date(`${day}T12:00:00+07:00`).getUTCDay();
    for (const t of ARENA_SCHEDULE) {
      if (t.weekday !== undefined && t.weekday !== weekday) continue;
      const tc = findTimeControl(t.tc)!;
      const startsAt = new Date(`${day}T${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:00+07:00`);
      rows.push({
        id: `a${day.replaceAll("-", "")}${t.key}`,
        name: t.name,
        startsAt,
        endsAt: new Date(startsAt.getTime() + t.durationMin * MINUTE),
        minutes: tc.minutes,
        increment: tc.increment,
        prizes: t.prizes,
      });
    }
  }
  await db.insert(tournaments).values(rows).onConflictDoNothing();
}

export async function getTournament(db: Database, id: string) {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  return t ?? null;
}

/** Giải đang/sắp diễn ra và các giải vừa kết thúc trong 3 ngày. */
export async function listTournaments(db: Database, now = Date.now()) {
  const rows = await db
    .select()
    .from(tournaments)
    .where(gt(tournaments.endsAt, new Date(now - 3 * 24 * 60 * MINUTE)))
    .orderBy(asc(tournaments.startsAt));
  return {
    live: rows.filter((t) => t.status !== "finished" && t.startsAt.getTime() <= now),
    upcoming: rows.filter((t) => t.status !== "finished" && t.startsAt.getTime() > now),
    finished: rows.filter((t) => t.status === "finished").reverse(),
  };
}

export type JoinResult = { ok: true } | { ok: false; error: string };

export async function joinTournament(db: Database, id: string, userId: string, now = Date.now()): Promise<JoinResult> {
  const t = await getTournament(db, id);
  if (!t) return { ok: false, error: "Giải đấu không tồn tại." };
  if (t.status === "finished" || t.endsAt.getTime() <= now) return { ok: false, error: "Giải đấu đã kết thúc." };
  const [u] = await db.select({ rating: users.rating, isGuest: users.isGuest, bannedUntil: users.bannedUntil }).from(users).where(eq(users.id, userId));
  if (!u) return { ok: false, error: "Không tìm thấy tài khoản." };
  if (u.isGuest) return { ok: false, error: "Khách chưa tham gia giải đấu được. Hãy tạo tài khoản (miễn phí)." };
  if (u.bannedUntil && u.bannedUntil.getTime() > now) return { ok: false, error: "Tài khoản của bạn đang bị khóa chơi online." };
  await db.insert(tournamentPlayers).values({ tournamentId: id, userId, ratingAtJoin: u.rating }).onConflictDoNothing();
  return { ok: true };
}

export async function isJoined(db: Database, id: string, userId: string) {
  const [row] = await db
    .select({ id: tournamentPlayers.userId })
    .from(tournamentPlayers)
    .where(and(eq(tournamentPlayers.tournamentId, id), eq(tournamentPlayers.userId, userId)));
  return !!row;
}

export async function standings(db: Database, id: string, limit = 100) {
  return db
    .select({
      userId: tournamentPlayers.userId, score: tournamentPlayers.score, games: tournamentPlayers.games, wins: tournamentPlayers.wins,
      draws: tournamentPlayers.draws, losses: tournamentPlayers.losses,
      username: users.username, displayName: users.displayName, avatar: users.avatar, frame: users.frame, rating: users.rating,
    })
    .from(tournamentPlayers)
    .innerJoin(users, eq(users.id, tournamentPlayers.userId))
    .where(eq(tournamentPlayers.tournamentId, id))
    .orderBy(desc(tournamentPlayers.score), desc(tournamentPlayers.wins), asc(tournamentPlayers.games), asc(tournamentPlayers.joinedAt))
    .limit(limit);
}

/** Điểm một ván cho một người: thắng 2 (4 nếu hai ván trước đó trong giải đều thắng), hòa 1, thua 0. */
export function arenaPoints(result: "win" | "draw" | "loss", previous: ("win" | "draw" | "loss")[]) {
  if (result === "draw") return 1;
  if (result === "loss") return 0;
  return previous.length >= 2 && previous[0] === "win" && previous[1] === "win" ? 4 : 2;
}

/** Hook lưu ván: cộng điểm giải (chạy trong transaction lưu ván, sau khi ván đã được ghi). */
export const scoreTournamentGame: GameSavedHook = async (tx, room) => {
  const id = room.tournamentId;
  const result = room.result;
  if (!id || !result) return;
  const [t] = await tx.select({ status: tournaments.status }).from(tournaments).where(eq(tournaments.id, id)).for("update");
  if (!t || t.status !== "running") return;

  for (const side of ["r", "b"] as const) {
    const userId = room.players[side].id;
    const outcome = result.winner === null ? "draw" : result.winner === side ? "win" : "loss";
    const prev = await tx
      .select({ redId: games.redId, winner: games.winner })
      .from(games)
      .where(and(eq(games.tournamentId, id), ne(games.id, room.id), or(eq(games.redId, userId), eq(games.blackId, userId))))
      .orderBy(desc(games.endedAt))
      .limit(2);
    const previous = prev.map((g) => {
      const mine = g.redId === userId ? "r" : "b";
      return g.winner === null ? "draw" : g.winner === mine ? "win" : "loss";
    }) as ("win" | "draw" | "loss")[];
    const points = arenaPoints(outcome, previous);
    await tx
      .insert(tournamentPlayers)
      .values({ tournamentId: id, userId, ratingAtJoin: room.players[side].rating })
      .onConflictDoNothing();
    await tx
      .update(tournamentPlayers)
      .set({
        score: sql`${tournamentPlayers.score} + ${points}`,
        games: sql`${tournamentPlayers.games} + 1`,
        wins: sql`${tournamentPlayers.wins} + ${outcome === "win" ? 1 : 0}`,
        draws: sql`${tournamentPlayers.draws} + ${outcome === "draw" ? 1 : 0}`,
        losses: sql`${tournamentPlayers.losses} + ${outcome === "loss" ? 1 : 0}`,
      })
      .where(and(eq(tournamentPlayers.tournamentId, id), eq(tournamentPlayers.userId, userId)));
  }
};

/**
 * Chuyển trạng thái giải theo giờ: đến giờ thì "running"; hết giờ và không còn ván đang dở (hoặc quá hạn chờ)
 * thì chốt và trao thưởng. `busy` là các giải còn ván đang chơi. Trả về giải vừa bắt đầu / vừa kết thúc.
 */
export async function advanceTournaments(db: Database, now: number, busy: Set<string>) {
  const started = await db
    .update(tournaments)
    .set({ status: "running" })
    .where(and(eq(tournaments.status, "scheduled"), lte(tournaments.startsAt, new Date(now)), gt(tournaments.endsAt, new Date(now))))
    .returning({ id: tournaments.id });
  // Giải đã qua giờ mà chưa từng chạy (vd. máy chủ tắt cả buổi): chuyển thẳng sang chạy để được chốt bên dưới.
  await db
    .update(tournaments)
    .set({ status: "running" })
    .where(and(eq(tournaments.status, "scheduled"), lte(tournaments.endsAt, new Date(now))));

  const due = await db
    .select({ id: tournaments.id, endsAt: tournaments.endsAt })
    .from(tournaments)
    .where(and(eq(tournaments.status, "running"), lte(tournaments.endsAt, new Date(now))));
  const finished: string[] = [];
  for (const t of due) {
    if (busy.has(t.id) && now < t.endsAt.getTime() + FINISH_GRACE_MS) continue;
    if (await finishTournament(db, t.id)) finished.push(t.id);
  }
  return { started: started.map((s) => s.id), finished };
}

/** Chốt giải và trao thưởng (chỉ một lần). Người có ít nhất 1 ván mới được xếp hạng nhận thưởng. */
export async function finishTournament(db: Database, id: string) {
  return db.transaction(async (tx) => {
    const [t] = await tx
      .update(tournaments)
      .set({ status: "finished" })
      .where(and(eq(tournaments.id, id), eq(tournaments.status, "running")))
      .returning();
    if (!t) return null;
    const top = await tx
      .select({ userId: tournamentPlayers.userId })
      .from(tournamentPlayers)
      .where(and(eq(tournamentPlayers.tournamentId, id), gt(tournamentPlayers.games, 0)))
      .orderBy(desc(tournamentPlayers.score), desc(tournamentPlayers.wins), asc(tournamentPlayers.games), asc(tournamentPlayers.joinedAt))
      .limit(t.prizes.length);
    for (const [i, p] of top.entries()) {
      await addCoinsTx(tx, p.userId, t.prizes[i], "tournament", id);
    }
    if (top[0]) await tx.insert(userItems).values({ userId: top[0].userId, itemId: itemKey("frame", "arena") }).onConflictDoNothing();
    return { id, winners: top.map((p) => p.userId) };
  });
}

/** Các giải đang chạy (để server game ghép cặp). */
export async function runningTournaments(db: Database) {
  return db.select().from(tournaments).where(inArray(tournaments.status, ["running"]));
}

onGameSaved(scoreTournamentGame);
