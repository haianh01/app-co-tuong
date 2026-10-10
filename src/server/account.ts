// Quản lý tài khoản: email (xác nhận), quên mật khẩu, đổi thông tin, xóa tài khoản.

import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { PUBLIC_URL } from "@/lib/site";
import { AVATARS } from "@/lib/skins";
import {
  NO_PASSWORD, deleteUserSessions, hashPassword, hashToken, isUniqueViolation, verifyPassword,
} from "./auth";
import type { Database } from "./db";
import { emailTokens, oauthAccounts, users } from "./db/schema";
import { actionMail, sendMail } from "./mailer";

const RESET_TTL_MS = 60 * 60_000;
const VERIFY_TTL_MS = 24 * 60 * 60_000;

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isValidEmail = (s: string) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s) && s.length <= 254;

async function issueToken(db: Database, userId: string, kind: "reset" | "verify", email: string | null, ttl: number, now: number) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(emailTokens).values({ id: hashToken(token), userId, kind, email, expiresAt: new Date(now + ttl) });
  return token;
}

/** Lấy và đánh dấu đã dùng một mã email còn hạn; trả về null nếu sai/hết hạn/đã dùng. */
async function consumeToken(db: Database, token: string, kind: "reset" | "verify", now: number) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: new Date(now) })
    .where(and(eq(emailTokens.id, hashToken(token)), eq(emailTokens.kind, kind), isNull(emailTokens.usedAt), gt(emailTokens.expiresAt, new Date(now))))
    .returning();
  return row ?? null;
}

/** Đặt (hoặc đổi) email: gửi link xác nhận; email chỉ được dùng để khôi phục mật khẩu sau khi xác nhận. */
export async function requestEmailChange(db: Database, userId: string, rawEmail: string, now = Date.now()): Promise<string | null> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return "Email không hợp lệ.";
  const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, userId))).limit(1);
  if (taken) return "Email này đã được dùng cho tài khoản khác.";
  const token = await issueToken(db, userId, "verify", email, VERIFY_TTL_MS, now);
  await sendMail(
    actionMail(email, "Xác nhận email", "Bấm nút dưới đây để xác nhận email cho tài khoản cờ tướng của bạn.", "Xác nhận email",
      `${PUBLIC_URL}/verify-email?token=${token}`, "Link có hiệu lực trong 24 giờ. Nếu không phải bạn yêu cầu, hãy bỏ qua email này."),
  );
  return null;
}

export async function confirmEmail(db: Database, token: string, now = Date.now()): Promise<"ok" | "invalid" | "taken"> {
  const row = await consumeToken(db, token, "verify", now);
  if (!row?.email) return "invalid";
  try {
    await db.update(users).set({ email: row.email, emailVerifiedAt: new Date(now) }).where(eq(users.id, row.userId));
    return "ok";
  } catch (err) {
    if (isUniqueViolation(err)) return "taken";
    throw err;
  }
}

/**
 * Quên mật khẩu: gửi link đặt lại nếu email đã xác nhận. Luôn trả về như nhau để không lộ email nào có tài khoản.
 */
export async function requestPasswordReset(db: Database, rawEmail: string, now = Date.now()): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return;
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user?.emailVerifiedAt) return;
  const token = await issueToken(db, user.id, "reset", null, RESET_TTL_MS, now);
  await sendMail(
    actionMail(email, "Đặt lại mật khẩu", `Bạn (tài khoản ${user.username}) vừa yêu cầu đặt lại mật khẩu.`, "Đặt mật khẩu mới",
      `${PUBLIC_URL}/reset-password?token=${token}`, "Link có hiệu lực trong 1 giờ. Nếu không phải bạn yêu cầu, hãy bỏ qua email này."),
  );
}

export async function resetPassword(db: Database, token: string, password: string, now = Date.now()): Promise<string | null> {
  if (password.length < 8) return "Mật khẩu cần ít nhất 8 ký tự.";
  if (password.length > 128) return "Mật khẩu quá dài (tối đa 128 ký tự).";
  const row = await consumeToken(db, token, "reset", now);
  if (!row) return "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.";
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, row.userId));
  await deleteUserSessions(db, row.userId);
  return null;
}

export async function changePassword(db: Database, userId: string, current: string, next: string): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return "Không tìm thấy tài khoản.";
  if (user.passwordHash !== NO_PASSWORD && !(await verifyPassword(current, user.passwordHash))) return "Mật khẩu hiện tại không đúng.";
  if (next.length < 8) return "Mật khẩu mới cần ít nhất 8 ký tự.";
  if (next.length > 128) return "Mật khẩu quá dài (tối đa 128 ký tự).";
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  return null;
}

export async function updateProfile(db: Database, userId: string, input: { displayName: string; avatar: string }): Promise<string | null> {
  const name = input.displayName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 32) return "Tên hiển thị dài từ 2 đến 32 ký tự.";
  if (!AVATARS.some((a) => a.id === input.avatar)) return "Avatar không hợp lệ.";
  await db.update(users).set({ displayName: name, avatar: input.avatar }).where(eq(users.id, userId));
  return null;
}

/**
 * Xóa tài khoản: xóa thông tin cá nhân, đăng xuất mọi nơi. Các ván đã chơi được giữ lại dưới tên ẩn danh
 * (để không làm sai lịch sử của người chơi khác) – xem Chính sách quyền riêng tư.
 */
export async function deleteAccount(db: Database, userId: string): Promise<void> {
  const suffix = randomBytes(4).toString("hex");
  await db
    .update(users)
    .set({
      username: `daxoa_${suffix}`,
      displayName: "Người chơi đã xóa",
      passwordHash: NO_PASSWORD,
      email: null,
      emailVerifiedAt: null,
      avatar: "tuong-do",
      frame: "none",
      isGuest: true,
    })
    .where(eq(users.id, userId));
  await db.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId));
  await deleteUserSessions(db, userId);
}
