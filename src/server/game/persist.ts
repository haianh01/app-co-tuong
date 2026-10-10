import { eq } from "drizzle-orm";
import type { Side } from "@/lib/xiangqi/engine";
import type { Database } from "../db";
import { games, users, type User } from "../db/schema";
import { ratingDelta } from "../rating";
import type { GameRoom } from "./room";

export interface SavedGame {
  /** Elo thay đổi (null với ván không tính điểm). */
  delta: Record<Side, number> | null;
  /** Elo sau ván. */
  after: Record<Side, number>;
}

/** Hook chạy trong cùng transaction khi lưu ván (vd. cộng điểm giải đấu). */
export type GameSavedHook = (
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  room: GameRoom,
) => Promise<void>;

const hooks: GameSavedHook[] = [];
export const onGameSaved = (hook: GameSavedHook) => hooks.push(hook);

/**
 * Lưu ván đã kết thúc. Ván tính điểm: cập nhật Elo + thống kê hai người chơi trong cùng transaction,
 * tính từ điểm hiện tại trong DB (khóa dòng bằng FOR UPDATE) để các ván kết thúc cùng lúc không ghi đè nhau.
 * Ván không tính điểm: chỉ lưu để xem lại.
 */
export async function saveFinishedGame(db: Database, room: GameRoom): Promise<SavedGame> {
  const result = room.result;
  if (room.status !== "ended" || !result) throw new Error(`Ván ${room.id} chưa kết thúc`);

  return db.transaction(async (tx) => {
    const lock = async (id: string) => {
      const [u] = await tx.select().from(users).where(eq(users.id, id)).for("update");
      if (!u) throw new Error(`Không tìm thấy người chơi ${id}`);
      return u;
    };
    const red = await lock(room.players.r.id);
    const black = await lock(room.players.b.id);

    const redScore = result.winner === "r" ? 1 : result.winner === "b" ? 0 : 0.5;
    const delta = room.rated
      ? {
          r: ratingDelta(red.rating, black.rating, redScore, red.gamesPlayed),
          b: ratingDelta(black.rating, red.rating, 1 - redScore, black.gamesPlayed),
        }
      : null;

    if (delta) {
      const update = (u: User, d: number, score: number) =>
        tx
          .update(users)
          .set({
            rating: u.rating + d,
            peakRating: Math.max(u.peakRating, u.rating + d),
            gamesPlayed: u.gamesPlayed + 1,
            wins: u.wins + (score === 1 ? 1 : 0),
            draws: u.draws + (score === 0.5 ? 1 : 0),
            losses: u.losses + (score === 0 ? 1 : 0),
          })
          .where(eq(users.id, u.id));
      await update(red, delta.r, redScore);
      await update(black, delta.b, 1 - redScore);
    }

    const after = { r: red.rating + (delta?.r ?? 0), b: black.rating + (delta?.b ?? 0) };
    await tx.insert(games).values({
      id: room.id,
      redId: red.id,
      blackId: black.id,
      minutes: room.minutes,
      increment: room.increment,
      variant: room.variant,
      rated: room.rated,
      tournamentId: room.tournamentId,
      winner: result.winner,
      reason: result.reason,
      moves: room.game.snapshotMoves(),
      setup: room.game.setup(),
      plies: room.plies,
      redRatingBefore: red.rating,
      blackRatingBefore: black.rating,
      redRatingAfter: after.r,
      blackRatingAfter: after.b,
      startedAt: new Date(room.startedAt),
      endedAt: new Date(room.endedAt ?? Date.now()),
    });
    for (const hook of hooks) await hook(tx, room);
    return { delta, after };
  });
}
