// Thao tác quản trị: thống kê, tìm người chơi, khóa/mở khóa, phân quyền, cộng xu, xử lý báo cáo.

import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "./db";
import { games, payments, reports, users } from "./db/schema";
import { addCoins } from "./economy";

export async function adminStats(db: Database, now = Date.now()) {
  const day = new Date(now - 24 * 60 * 60_000);
  const [[u], [g], [g24], [r], [p]] = await Promise.all([
    db.select({ n: count() }).from(users).where(eq(users.isGuest, false)),
    db.select({ n: count() }).from(games),
    db.select({ n: count() }).from(games).where(gt(games.endedAt, day)),
    db.select({ n: count() }).from(reports).where(eq(reports.status, "open")),
    db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)` }).from(payments).where(eq(payments.status, "paid")),
  ]);
  return { users: u.n, games: g.n, games24h: g24.n, openReports: r.n, revenue: Number(p.n) };
}

export async function searchUsers(db: Database, q: string, limit = 30) {
  const term = q.trim();
  const cols = {
    id: users.id, username: users.username, displayName: users.displayName, email: users.email, role: users.role,
    rating: users.rating, gamesPlayed: users.gamesPlayed, coins: users.coins, isGuest: users.isGuest,
    bannedUntil: users.bannedUntil, banReason: users.banReason, vipUntil: users.vipUntil, createdAt: users.createdAt,
  };
  // Thoát ký tự đại diện của LIKE để "%" hay "_" được tìm đúng nghĩa đen.
  const pattern = `%${term.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
  const where = term
    ? or(ilike(users.username, pattern), ilike(users.displayName, pattern), ilike(users.email, pattern))
    : undefined;
  return db.select(cols).from(users).where(where).orderBy(desc(users.createdAt)).limit(limit);
}

export async function banUser(db: Database, userId: string, hours: number, reason: string, now = Date.now()) {
  const until = new Date(now + Math.max(1, Math.min(hours, 24 * 3650)) * 60 * 60_000);
  await db.update(users).set({ bannedUntil: until, banReason: reason.trim().slice(0, 200) || null }).where(eq(users.id, userId));
  return until;
}

export async function unbanUser(db: Database, userId: string) {
  await db.update(users).set({ bannedUntil: null, banReason: null }).where(eq(users.id, userId));
}

export async function setRole(db: Database, userId: string, role: "user" | "admin") {
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

/** Cấp quyền quản trị theo danh sách tên đăng nhập (biến ADMIN_USERNAMES, phân cách dấu phẩy). */
export async function promoteAdmins(db: Database, usernames: string[]) {
  const names = usernames.map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return 0;
  const rows = await db.update(users).set({ role: "admin" }).where(inArray(users.username, names)).returning({ id: users.id });
  return rows.length;
}

export async function grantCoins(db: Database, userId: string, amount: number, adminId: string) {
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1_000_000) throw new Error("Số xu không hợp lệ");
  return addCoins(db, userId, amount, "admin", `${adminId}:${randomBytes(8).toString("hex")}`);
}

const reporter = alias(users, "reporter");
const target = alias(users, "target");

export async function listReports(db: Database, status: "open" | "resolved" | "dismissed" | "all" = "open", limit = 50) {
  return db
    .select({
      id: reports.id, reason: reports.reason, note: reports.note, status: reports.status, gameId: reports.gameId,
      createdAt: reports.createdAt,
      reporter: { id: reporter.id, username: reporter.username, displayName: reporter.displayName },
      target: {
        id: target.id, username: target.username, displayName: target.displayName, bannedUntil: target.bannedUntil,
      },
    })
    .from(reports)
    .innerJoin(reporter, eq(reports.reporterId, reporter.id))
    .innerJoin(target, eq(reports.targetId, target.id))
    .where(status === "all" ? undefined : eq(reports.status, status))
    .orderBy(desc(reports.createdAt))
    .limit(limit);
}

export async function resolveReport(db: Database, id: number, status: "resolved" | "dismissed", adminId: string, now = Date.now()) {
  await db
    .update(reports)
    .set({ status, resolvedBy: adminId, resolvedAt: new Date(now) })
    .where(and(eq(reports.id, id), eq(reports.status, "open")));
}

/** Số báo cáo đang mở về một người (để ưu tiên xử lý). */
export async function openReportCount(db: Database, userId: string) {
  const [r] = await db.select({ n: count() }).from(reports).where(and(eq(reports.targetId, userId), eq(reports.status, "open")));
  return r.n;
}
