// Tài khoản và phiên đăng nhập. Không phụ thuộc Next.js: dùng được cả trong server game (WebSocket).

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
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

export const toPublicUser = (u: User): PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  rating: u.rating,
});

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

export async function registerUser(
  db: Database,
  input: { username: string; displayName: string; password: string },
): Promise<{ ok: true; user: PublicUser } | { ok: false; errors: FieldErrors }> {
  const errors = validateRegistration(input);
  if (Object.keys(errors).length) return { ok: false, errors };

  const username = normalizeUsername(input.username);
  const taken = { ok: false as const, errors: { username: "Tên đăng nhập này đã có người dùng." } };
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing.length) return taken;

  try {
    const [user] = await db
      .insert(users)
      .values({ username, displayName: cleanDisplayName(input.displayName), passwordHash: await hashPassword(input.password) })
      .returning();
    return { ok: true, user: toPublicUser(user) };
  } catch (err) {
    // Hai người đăng ký cùng tên cùng lúc: ràng buộc UNIQUE chặn lại.
    if ((err as { code?: string }).code === "23505" || String(err).includes("users_username_unique")) return taken;
    throw err;
  }
}

export async function authenticate(db: Database, username: string, password: string): Promise<PublicUser | null> {
  const [user] = await db.select().from(users).where(eq(users.username, normalizeUsername(username))).limit(1);
  if (!user) {
    dummyHash ??= hashPassword("khong-phai-mat-khau-that");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? toPublicUser(user) : null;
}

// ---- Phiên đăng nhập: cookie giữ token ngẫu nhiên, DB chỉ giữ SHA-256 của token ----

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(db: Database, userId: string, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getUserBySession(db: Database, token: string | undefined, now = Date.now()): Promise<PublicUser | null> {
  if (!token || token.length > 100) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date(now))))
    .limit(1);
  return rows[0] ? toPublicUser(rows[0].user) : null;
}

export async function deleteSession(db: Database, token: string | undefined): Promise<void> {
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

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
