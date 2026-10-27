// Tài khoản và phiên đăng nhập. Không phụ thuộc Next.js: dùng được cả trong server game (WebSocket).

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { SessionUser } from "@/lib/session-types";
import type { Database } from "./db";
import { sessions, users, type User } from "./db/schema";

export const SESSION_COOKIE = "kd_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  rating: number;
}

/** Người dùng kèm thông tin cần cho phân quyền, cửa hàng, giao diện. Không có mật khẩu. */
export interface AuthUser extends PublicUser {
  isGuest: boolean;
  role: "user" | "admin";
  bannedUntil: Date | null;
  banReason: string | null;
  email: string | null;
  emailVerified: boolean;
  coins: number;
  vipUntil: Date | null;
  avatar: string;
  frame: string;
  boardSkin: string;
  pieceSkin: string;
  /** Có đăng nhập bằng mật khẩu được không (tài khoản chỉ dùng Google/Facebook thì không). */
  hasPassword: boolean;
}

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  rating: u.rating,
});

export const toAuthUser = (u: User): AuthUser => ({
  ...toPublicUser(u),
  isGuest: u.isGuest,
  role: u.role === "admin" ? "admin" : "user",
  bannedUntil: u.bannedUntil,
  banReason: u.banReason,
  email: u.email,
  emailVerified: !!u.emailVerifiedAt,
  coins: u.coins,
  vipUntil: u.vipUntil,
  avatar: u.avatar,
  frame: u.frame,
  boardSkin: u.boardSkin,
  pieceSkin: u.pieceSkin,
  hasPassword: u.passwordHash.startsWith("scrypt$"),
});

/** Thông tin người chơi gửi qua WebSocket (công khai). */
export const toPlayerInfo = (u: AuthUser) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  rating: u.rating,
  isGuest: u.isGuest,
  avatar: u.avatar,
  frame: u.frame,
});

export const isBanned = (u: Pick<AuthUser, "bannedUntil">, now = Date.now()) => !!u.bannedUntil && u.bannedUntil.getTime() > now;

/** Dữ liệu gửi cho client qua /api/me. */
export function toSessionUser(u: AuthUser, now = Date.now()): SessionUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    rating: u.rating,
    isGuest: u.isGuest,
    isAdmin: u.role === "admin",
    coins: u.coins,
    vipUntil: u.vipUntil && u.vipUntil.getTime() > now ? u.vipUntil.getTime() : null,
    avatar: u.avatar,
    frame: u.frame,
    boardSkin: u.boardSkin,
    pieceSkin: u.pieceSkin,
    email: u.email,
    emailVerified: u.emailVerified,
    hasPassword: u.hasPassword,
    ban: isBanned(u, now) ? { until: u.bannedUntil!.getTime(), reason: u.banReason } : null,
  };
}
export const isVip = (u: Pick<AuthUser, "vipUntil">, now = Date.now()) => !!u.vipUntil && u.vipUntil.getTime() > now;

/** Mật khẩu không dùng được (khách, tài khoản chỉ đăng nhập bằng Google/Facebook). */
export const NO_PASSWORD = "!";

// ---- Mật khẩu (scrypt, tham số lưu kèm để có thể nâng cấp sau) ----

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, p: typeof SCRYPT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(password, Buffer.from(salt, "base64"), {
    N: Number(n), r: Number(r), p: Number(p), keylen: expected.length,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Băm giả để thời gian phản hồi như nhau dù tên đăng nhập có tồn tại hay không.
let dummyHash: Promise<string> | null = null;

// ---- Đăng ký / đăng nhập ----

export type RegisterField = "username" | "displayName" | "password";
export type FieldErrors = Partial<Record<RegisterField, string>>;

export const normalizeUsername = (s: string) => s.trim().toLowerCase();
const cleanDisplayName = (s: string) => s.trim().replace(/\s+/g, " ");

export function validateRegistration(input: { username: string; displayName: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!/^[a-z0-9_]{3,20}$/.test(normalizeUsername(input.username))) {
    errors.username = "Tên đăng nhập gồm 3–20 ký tự: chữ không dấu, số hoặc dấu gạch dưới.";
  }
  const name = cleanDisplayName(input.displayName);
  if (name.length < 2 || name.length > 32) errors.displayName = "Tên hiển thị dài từ 2 đến 32 ký tự.";
  if (input.password.length < 8) errors.password = "Mật khẩu cần ít nhất 8 ký tự.";
  else if (input.password.length > 128) errors.password = "Mật khẩu quá dài (tối đa 128 ký tự).";
  return errors;
}

const TAKEN = { ok: false as const, errors: { username: "Tên đăng nhập này đã có người dùng." } };

export async function registerUser(
  db: Database,
  input: { username: string; displayName: string; password: string },
): Promise<{ ok: true; user: AuthUser } | { ok: false; errors: FieldErrors }> {
  const errors = validateRegistration(input);
  if (Object.keys(errors).length) return { ok: false, errors };

  const username = normalizeUsername(input.username);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing.length) return TAKEN;

  try {
    const [user] = await db
      .insert(users)
      .values({ username, displayName: cleanDisplayName(input.displayName), passwordHash: await hashPassword(input.password) })
      .returning();
    return { ok: true, user: toAuthUser(user) };
  } catch (err) {
    // Hai người đăng ký cùng tên cùng lúc: ràng buộc UNIQUE chặn lại.
    if (isUniqueViolation(err)) return TAKEN;
    throw err;
  }
}

/** Tạo tài khoản khách: chơi được ván không tính điểm, có thể nâng cấp thành tài khoản thật sau. */
export async function createGuest(db: Database): Promise<AuthUser> {
  for (let attempt = 0; ; attempt++) {
    const suffix = randomBytes(4).toString("hex").slice(0, 6);
    try {
      const [user] = await db
        .insert(users)
        .values({
          username: `khach_${suffix}`,
          displayName: `Khách ${(parseInt(suffix, 16) % 9000) + 1000}`,
          passwordHash: NO_PASSWORD,
          isGuest: true,
        })
        .returning();
      return toAuthUser(user);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 5) throw err;
    }
  }
}

/** Khách đăng ký tài khoản thật: giữ nguyên lịch sử ván, đổi tên và đặt mật khẩu. */
export async function upgradeGuest(
  db: Database,
  userId: string,
  input: { username: string; displayName: string; password: string },
): Promise<{ ok: true; user: AuthUser } | { ok: false; errors: FieldErrors }> {
  const errors = validateRegistration(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  const username = normalizeUsername(input.username);
  try {
    const [user] = await db
      .update(users)
      .set({ username, displayName: cleanDisplayName(input.displayName), passwordHash: await hashPassword(input.password), isGuest: false })
      .where(and(eq(users.id, userId), eq(users.isGuest, true)))
      .returning();
    if (!user) return { ok: false, errors: { username: "Tài khoản khách không còn tồn tại." } };
    return { ok: true, user: toAuthUser(user) };
  } catch (err) {
    if (isUniqueViolation(err)) return TAKEN;
    throw err;
  }
}

/** Lỗi vi phạm ràng buộc UNIQUE của PostgreSQL (Drizzle bọc lỗi gốc trong `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    if (e.code === "23505") return true;
  }
  return false;
}

export function isTransientDbError(err: unknown): boolean {
  if (!err) return false;
  for (let e = err as { message?: string; cause?: unknown } | undefined, i = 0; e && i < 5; e = e.cause as typeof e, i++) {
    const msg = (e.message ?? "").toLowerCase();
    if (
      msg.includes("client network socket disconnected") ||
      msg.includes("tls connection") ||
      msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("connection terminated") ||
      msg.includes("socket closed") ||
      msg.includes("broken pipe")
    ) {
      return true;
    }
  }
  return false;
}

export async function authenticate(db: Database, username: string, password: string): Promise<AuthUser | null> {
  const normalized = normalizeUsername(username);
  let user: User | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      [user] = await db.select().from(users).where(eq(users.username, normalized)).limit(1);
      break;
    } catch (err) {
      if (attempt === 1 && isTransientDbError(err)) {
        console.warn("[auth] Kết nối CSDL gián đoạn, thử lại:", (err as Error).message);
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }
      throw err;
    }
  }
  if (!user || !user.passwordHash.startsWith("scrypt$")) {
    dummyHash ??= hashPassword("khong-phai-mat-khau-that");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? toAuthUser(user) : null;
}

export async function getUserById(db: Database, id: string): Promise<AuthUser | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ? toAuthUser(user) : null;
}

// ---- Phiên đăng nhập: cookie giữ token ngẫu nhiên, DB chỉ giữ SHA-256 của token ----

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Database, userId: string, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getUserBySession(db: Database, token: string | undefined, now = Date.now()): Promise<AuthUser | null> {
  if (!token || token.length > 100) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date(now))))
    .limit(1);
  return rows[0] ? toAuthUser(rows[0].user) : null;
}

export async function deleteSession(db: Database, token: string | undefined): Promise<void> {
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** Đăng xuất mọi thiết bị (sau khi đổi mật khẩu, bị khóa tài khoản…). */
export async function deleteUserSessions(db: Database, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export { hashToken };

/** Xóa các phiên đã hết hạn (gọi định kỳ để bảng sessions không phình mãi). */
export async function purgeExpiredSessions(db: Database, now = Date.now()): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date(now)));
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[key] = part.slice(i + 1).trim();
    }
  }
  return out;
}
