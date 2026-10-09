import { eq } from "drizzle-orm";
import type { Side } from "@/lib/xiangqi/engine";
import type { Database } from "../db";
import { games, users, type User } from "../db/schema";
import { ratingDelta } from "../rating";
import type { GameRoom } from "./room";

/**
 * Lưu ván đã kết thúc và cập nhật Elo + thống kê của hai người chơi trong cùng một transaction.
 * Điểm được tính từ điểm hiện tại trong DB (khóa dòng bằng FOR UPDATE) để các ván kết thúc
 * cùng lúc không ghi đè lên nhau.
 */
export async function saveFinishedGame(
  db: Database,
  room: GameRoom,
): Promise<{ delta: Record<Side, number>; after: Record<Side, number> }> {
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
    const delta = {
      r: ratingDelta(red.rating, black.rating, redScore, red.gamesPlayed),
      b: ratingDelta(black.rating, red.rating, 1 - redScore, black.gamesPlayed),
    };

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

    await tx.insert(games).values({
      id: room.id,
      redId: red.id,
      blackId: black.id,
      minutes: room.minutes,
      rated: true,
      winner: result.winner,
      reason: result.reason,
      moves: room.state.moves.map((m) => ({ from: m.move.from, to: m.move.to })),
      plies: room.plies,
      redRatingBefore: red.rating,
      blackRatingBefore: black.rating,
      redRatingAfter: red.rating + delta.r,
      blackRatingAfter: black.rating + delta.b,
      startedAt: new Date(room.startedAt),
      endedAt: new Date(room.endedAt ?? Date.now()),
    });
    return { delta, after: { r: red.rating + delta.r, b: black.rating + delta.b } };
  });
}
