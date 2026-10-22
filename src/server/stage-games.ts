import { createHash } from "node:crypto";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import { CURRENT_ANALYSIS_VERSION } from "@/server/analysis/store";
import type { Database } from "@/server/db";
import {
  stageGameAnalysis,
  stageGames,
  type StageGame,
  type StageGameInsert,
} from "@/server/db/schema";

/** Băm khóa phòng livestream (SHA-256) làm định danh sở hữu dữ liệu trong DB. */
export function hashRoomKey(room: string): string {
  return createHash("sha256").update(room.trim()).digest("hex");
}

/** Lưu (hoặc cập nhật kết quả) ván cờ sân khấu theo id đã sinh trước. */
export async function saveStageGame(
  db: Database,
  input: StageGameInsert,
): Promise<StageGame> {
  const existing = await getStageGame(db, input.id);
  if (existing && existing.ownerKey !== input.ownerKey) {
    throw new Error("Unauthorized: Ván cờ thuộc về phòng khác");
  }

  const [saved] = await db
    .insert(stageGames)
    .values(input)
    .onConflictDoUpdate({
      target: stageGames.id,
      set: {
        round: input.round,
        playedOn: input.playedOn,
        mySide: input.mySide,
        me: input.me,
        opponent: input.opponent,
        result: input.result,
        resultSource: input.resultSource,
        startFen: input.startFen,
        moves: input.moves,
        plies: input.plies,
        timeControl: input.timeControl,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        ...(input.userId ? { userId: input.userId } : {}),
      },
      setWhere: eq(stageGames.ownerKey, input.ownerKey),
    })
    .returning();
  return saved ?? existing;
}

/** Lấy thông tin ván cờ theo id. Nếu truyền ownerKey thì bắt buộc phải khớp chủ phòng. */
export async function getStageGame(
  db: Database,
  id: string,
  ownerKey?: string,
): Promise<StageGame | null> {
  const conditions = [eq(stageGames.id, id)];
  if (ownerKey) {
    conditions.push(eq(stageGames.ownerKey, ownerKey));
  }
  const [game] = await db
    .select()
    .from(stageGames)
    .where(and(...conditions));
  return game ?? null;
}

export interface ListStageGamesOptions {
  date?: string;
  result?: "win" | "draw" | "loss";
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Lấy danh sách ván đấu của phòng, hỗ trợ lọc theo ngày, kết quả, tên đối thủ và phân trang cursor. */
export async function listStageGames(
  db: Database,
  ownerKey: string,
  options: ListStageGamesOptions = {},
): Promise<{ games: StageGame[]; nextCursor: string | null }> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 30));
  const conditions = [eq(stageGames.ownerKey, ownerKey)];

  if (options.date) {
    conditions.push(eq(stageGames.playedOn, options.date));
  }
  if (options.result) {
    conditions.push(eq(stageGames.result, options.result));
  }
  if (options.q && options.q.trim()) {
    const search = `%${options.q.trim()}%`;
    conditions.push(
      or(
        sql`${stageGames.opponent}->>'name' ILIKE ${search}`,
        sql`${stageGames.me}->>'name' ILIKE ${search}`,
      )!,
    );
  }
  if (options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(stageGames.endedAt, cursorDate));
    }
  }

  const rows = await db
    .select()
    .from(stageGames)
    .where(and(...conditions))
    .orderBy(desc(stageGames.endedAt))
    .limit(limit + 1);

  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop(); // loại bỏ phần tử thừa dùng để kiểm tra còn trang sau không
    nextCursor = rows[rows.length - 1].endedAt.toISOString();
  }

  return { games: rows, nextCursor };
}

/** Lưu kết quả phân tích engine của ván sân khấu. */
export async function saveStageAnalysis(
  db: Database,
  gameId: string,
  evals: (PositionEval | null)[],
  version = CURRENT_ANALYSIS_VERSION,
): Promise<void> {
  await db
    .insert(stageGameAnalysis)
    .values({
      gameId,
      version,
      evals,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: stageGameAnalysis.gameId,
      set: {
        version,
        evals,
        createdAt: new Date(),
      },
    });
}

/** Lấy kết quả phân tích đã lưu của ván sân khấu. Trả về null nếu chưa phân tích hoặc version đã cũ. */
export async function getStageAnalysis(
  db: Database,
  gameId: string,
): Promise<(PositionEval | null)[] | null> {
  const [row] = await db
    .select({ evals: stageGameAnalysis.evals, version: stageGameAnalysis.version })
    .from(stageGameAnalysis)
    .where(
      and(
        eq(stageGameAnalysis.gameId, gameId),
        eq(stageGameAnalysis.version, CURRENT_ANALYSIS_VERSION),
      ),
    );

  if (!row) return null;
  return row.evals as (PositionEval | null)[];
}
