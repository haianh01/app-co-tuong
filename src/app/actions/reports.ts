"use server";

import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { reports } from "@/server/db/schema";
import { RateLimiter } from "@/server/rate-limit";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";

// Mỗi người tối đa 10 báo cáo mỗi giờ.
const reportLimit = new RateLimiter(10, 60 * 60_000);

export async function reportPlayer(input: {
  targetId: string;
  gameId?: string | null;
  reason: ReportReason;
  note?: string;
}): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Bạn cần đăng nhập để báo cáo." };
  if (!REPORT_REASONS.some((r) => r.id === input.reason)) return { ok: false, message: "Lý do không hợp lệ." };
  if (input.targetId === user.id) return { ok: false, message: "Không thể tự báo cáo chính mình." };
  if (!/^[0-9a-f-]{36}$/i.test(input.targetId)) return { ok: false, message: "Người chơi không hợp lệ." };
  const gameId = input.gameId && /^[A-Za-z0-9]{6,12}$/.test(input.gameId) ? input.gameId : null;
  if (!reportLimit.hit(user.id)) return { ok: false, message: "Bạn đã gửi quá nhiều báo cáo, vui lòng thử lại sau." };

  const db = await getDb();
  if (gameId) {
    const existing = await db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.reporterId, user.id), eq(reports.targetId, input.targetId), eq(reports.gameId, gameId)))
      .limit(1);
    if (existing.length) return { ok: true, message: "Bạn đã báo cáo người chơi này trong ván này rồi." };
  }
  await db.insert(reports).values({
    reporterId: user.id,
    targetId: input.targetId,
    gameId,
    reason: input.reason,
    note: input.note?.trim().slice(0, 500) || null,
  });
  return { ok: true, message: "Đã gửi báo cáo. Cảm ơn bạn, quản trị viên sẽ xem xét." };
}
