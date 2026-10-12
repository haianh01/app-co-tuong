import { and, eq, sql } from "drizzle-orm";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import type { AuthUser } from "@/server/auth";
import { isVip } from "@/server/auth";
import type { Database } from "@/server/db";
import { analysisUsage, gameAnalysis } from "@/server/db/schema";

export const CURRENT_ANALYSIS_VERSION = 1;
export const FREE_ANALYSIS_PER_DAY = 3;

/** Lấy chuỗi ngày YYYY-MM-DD theo múi giờ Việt Nam. */
export function getTodayKey(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Tạo khóa quota cho user hoặc IP theo ngày. */
export function makeQuotaKey(user: AuthUser | null, clientIp: string, todayKey = getTodayKey()): string {
  if (user && !user.isGuest) {
    return `user:${user.id}:${todayKey}`;
  }
  return `ip:${clientIp}:${todayKey}`;
}

/** Lấy kết quả phân tích đã lưu của ván cờ. Trả về null nếu chưa phân tích hoặc version đã cũ. */
export async function getSavedAnalysis(db: Database, gameId: string): Promise<(PositionEval | null)[] | null> {
  const [row] = await db
    .select({ evals: gameAnalysis.evals, version: gameAnalysis.version })
    .from(gameAnalysis)
    .where(and(eq(gameAnalysis.gameId, gameId), eq(gameAnalysis.version, CURRENT_ANALYSIS_VERSION)));

  if (!row) return null;
  return row.evals as (PositionEval | null)[];
}

/** Lưu kết quả phân tích ván cờ vào DB. */
export async function saveGameAnalysis(
  db: Database,
  gameId: string,
  evals: (PositionEval | null)[],
  version = CURRENT_ANALYSIS_VERSION,
): Promise<void> {
  await db
    .insert(gameAnalysis)
    .values({
      gameId,
      version,
      evals,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: gameAnalysis.gameId,
      set: {
        version,
        evals,
        createdAt: new Date(),
      },
    });
}

export interface QuotaStatus {
  allowed: boolean;
  remaining: number;
  used: number;
  limit: number;
  isVip: boolean;
}

/** Kiểm tra quota phân tích hiện tại của user/IP hôm nay. */
export async function getAnalysisQuota(db: Database, user: AuthUser | null, clientIp: string): Promise<QuotaStatus> {
  if (user && isVip(user)) {
    return {
      allowed: true,
      remaining: Infinity,
      used: 0,
      limit: Infinity,
      isVip: true,
    };
  }

  const key = makeQuotaKey(user, clientIp);
  const [row] = await db
    .select({ count: analysisUsage.count })
    .from(analysisUsage)
    .where(eq(analysisUsage.key, key));

  const used = row?.count ?? 0;
  const remaining = Math.max(0, FREE_ANALYSIS_PER_DAY - used);
  return {
    allowed: remaining > 0,
    remaining,
    used,
    limit: FREE_ANALYSIS_PER_DAY,
    isVip: false,
  };
}

/** Ghi nhận 1 lượt phân tích. Trả về false nếu đã hết quota. */
export async function consumeAnalysisQuota(
  db: Database,
  user: AuthUser | null,
  clientIp: string,
): Promise<{ success: boolean; remaining: number }> {
  if (user && isVip(user)) {
    return { success: true, remaining: Infinity };
  }

  const status = await getAnalysisQuota(db, user, clientIp);
  if (!status.allowed) {
    return { success: false, remaining: 0 };
  }

  const key = makeQuotaKey(user, clientIp);
  await db
    .insert(analysisUsage)
    .values({
      key,
      count: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: analysisUsage.key,
      set: {
        count: sql`${analysisUsage.count} + 1`,
        updatedAt: new Date(),
      },
    });

  return { success: true, remaining: status.remaining - 1 };
}
