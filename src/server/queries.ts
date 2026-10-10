// Truy vấn đọc cho các trang (bảng xếp hạng, hồ sơ, xem lại ván).

import { and, count, desc, eq, gt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "./db";
import { applyMove, initialPosition } from "@/lib/xiangqi/engine";
import { moveNotation } from "@/lib/xiangqi/notation";
import { tallyOpenings } from "@/lib/xiangqi/openings";
import { coinTransactions, games, puzzleProgress, users, type StoredMove } from "./db/schema";

const publicColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatar: users.avatar,
  frame: users.frame,
  isGuest: users.isGuest,
  rating: users.rating,
  peakRating: users.peakRating,
  gamesPlayed: users.gamesPlayed,
  wins: users.wins,
  draws: users.draws,
  losses: users.losses,
  createdAt: users.createdAt,
};

export type PublicProfile = Awaited<ReturnType<typeof getProfile>>;

export async function getLeaderboard(db: Database, limit = 50) {
  return db
    .select(publicColumns)
    .from(users)
    .where(and(gt(users.gamesPlayed, 0), eq(users.isGuest, false)))
    .orderBy(desc(users.rating), desc(users.gamesPlayed))
    .limit(limit);
}

export async function getProfile(db: Database, username: string) {
  const [row] = await db.select(publicColumns).from(users).where(eq(users.username, username.toLowerCase())).limit(1);
  return row ?? null;
}

const red = alias(users, "red");
const black = alias(users, "black");

const gameColumns = {
  id: games.id,
  minutes: games.minutes,
  increment: games.increment,
  variant: games.variant,
  rated: games.rated,
  tournamentId: games.tournamentId,
  setup: games.setup,
  winner: games.winner,
  reason: games.reason,
  plies: games.plies,
  moves: games.moves,
  redRatingBefore: games.redRatingBefore,
  blackRatingBefore: games.blackRatingBefore,
  redRatingAfter: games.redRatingAfter,
  blackRatingAfter: games.blackRatingAfter,
  startedAt: games.startedAt,
  endedAt: games.endedAt,
  red: { id: red.id, username: red.username, displayName: red.displayName, avatar: red.avatar, frame: red.frame },
  black: { id: black.id, username: black.username, displayName: black.displayName, avatar: black.avatar, frame: black.frame },
};

export type GameRecord = NonNullable<Awaited<ReturnType<typeof getGameRecord>>>;

export async function getRecentGames(db: Database, userId: string, limit = 20) {
  return db
    .select(gameColumns)
    .from(games)
    .innerJoin(red, eq(games.redId, red.id))
    .innerJoin(black, eq(games.blackId, black.id))
    .where(or(eq(games.redId, userId), eq(games.blackId, userId)))
    .orderBy(desc(games.endedAt))
    .limit(limit);
}

export async function getGameRecord(db: Database, id: string) {
  const [row] = await db
    .select(gameColumns)
    .from(games)
    .innerJoin(red, eq(games.redId, red.id))
    .innerJoin(black, eq(games.blackId, black.id))
    .where(eq(games.id, id))
    .limit(1);
  return row ?? null;
}

/** Thống kê thêm cho hồ sơ: khai cuộc (theo nước đầu), số thế cờ đã giải, số mùa vào top 10, VIP. */
export async function getProfileExtras(db: Database, userId: string, now = Date.now()) {
  const [recent, [solved], [seasons], [u]] = await Promise.all([
    db
      .select({
        redId: games.redId,
        winner: games.winner,
        first: sql<StoredMove | null>`${games.moves}->0`,
        second: sql<StoredMove | null>`${games.moves}->1`,
      })
      .from(games)
      .where(and(or(eq(games.redId, userId), eq(games.blackId, userId)), eq(games.variant, "xiangqi")))
      .orderBy(desc(games.endedAt))
      .limit(300),
    db.select({ n: count() }).from(puzzleProgress).where(eq(puzzleProgress.userId, userId)),
    db.select({ n: count() }).from(coinTransactions).where(and(eq(coinTransactions.userId, userId), eq(coinTransactions.reason, "season"))),
    db.select({ vipUntil: users.vipUntil }).from(users).where(eq(users.id, userId)),
  ]);

  const start = initialPosition();
  const asRed: Parameters<typeof tallyOpenings>[0] = [];
  const asBlack: Parameters<typeof tallyOpenings>[0] = [];
  for (const g of recent) {
    const side = g.redId === userId ? "r" : "b";
    const result = g.winner === null ? "draw" : g.winner === side ? "win" : "loss";
    if (!g.first) continue;
    if (side === "r") asRed.push({ notation: moveNotation(start.board, g.first), result });
    else if (g.second) asBlack.push({ notation: moveNotation(applyMove(start, g.first).board, g.second), result });
  }
  return {
    openingsRed: tallyOpenings(asRed),
    openingsBlack: tallyOpenings(asBlack),
    puzzlesSolved: solved.n,
    seasonsTop10: seasons.n,
    vip: !!u?.vipUntil && u.vipUntil.getTime() > now,
  };
}
