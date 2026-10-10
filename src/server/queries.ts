// Truy vấn đọc cho các trang (bảng xếp hạng, hồ sơ, xem lại ván).

import { desc, eq, gt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "./db";
import { games, users } from "./db/schema";

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
    .where(gt(users.gamesPlayed, 0))
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
