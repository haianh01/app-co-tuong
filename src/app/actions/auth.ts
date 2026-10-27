"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import {
  SESSION_COOKIE, authenticate, createGuest, createSession, getUserBySession, normalizeUsername, registerUser, upgradeGuest,
  type AuthUser, type FieldErrors,
} from "@/server/auth";
import { getDb } from "@/server/db";
import { RateLimiter } from "@/server/rate-limit";

export interface AuthFormState {
  errors?: FieldErrors & { form?: string };
  values?: { username?: string; displayName?: string };
}

// Tối đa 10 lần đăng nhập sai cho mỗi tài khoản trong 15 phút.
const loginFailures = new RateLimiter(10, 15 * 60_000);
// Giới hạn chung số tài khoản khách tạo mỗi phút (chống tạo hàng loạt).
const guestCreations = new RateLimiter(60, 60_000);

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getUserBySession(await getDb(), token) : null;
}

async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(await getDb(), userId);
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt });
}

export async function register(_prev: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const username = text(formData.get("username"));
  const displayName = text(formData.get("displayName"));
  const input = { username, displayName, password: text(formData.get("password")) };
  try {
    const db = await getDb();
    // Khách đăng ký: nâng cấp chính tài khoản khách để giữ lịch sử ván.
    const current = await currentUser();
    if (current?.isGuest) {
      const res = await upgradeGuest(db, current.id, input);
      if (!res.ok) return { errors: res.errors, values: { username, displayName } };
    } else {
      const res = await registerUser(db, input);
      if (!res.ok) return { errors: res.errors, values: { username, displayName } };
      await startSession(res.user.id);
    }
  } catch (err) {
    console.error("[auth] Lỗi kết nối CSDL khi đăng ký:", err);
    return {
      errors: { form: "Không thể kết nối đến máy chủ CSDL hoặc mạng gián đoạn. Vui lòng thử lại sau giây lát." },
      values: { username, displayName },
    };
  }
  redirect(safeNext(formData.get("next")));
}

export async function login(_prev: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const username = text(formData.get("username"));
  const key = normalizeUsername(username);
  if (loginFailures.blocked(key)) {
    return { errors: { form: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút." }, values: { username } };
  }
  let user: AuthUser | null;
  try {
    user = await authenticate(await getDb(), username, text(formData.get("password")));
  } catch (err) {
    console.error("[auth] Lỗi kết nối CSDL khi đăng nhập:", err);
    return {
      errors: { form: "Không thể kết nối đến máy chủ CSDL hoặc mạng gián đoạn. Vui lòng thử lại sau giây lát." },
      values: { username },
    };
  }
  if (!user) {
    loginFailures.hit(key);
    return { errors: { form: "Sai tên đăng nhập hoặc mật khẩu." }, values: { username } };
  }
  loginFailures.reset(key);
  try {
    await startSession(user.id);
  } catch (err) {
    console.error("[auth] Lỗi tạo phiên đăng nhập:", err);
    return {
      errors: { form: "Không thể tạo phiên đăng nhập. Vui lòng thử lại." },
      values: { username },
    };
  }
  redirect(safeNext(formData.get("next")));
}

/** Chơi thử không cần đăng ký: tạo tài khoản khách (chỉ chơi ván không tính điểm). */
export async function playAsGuest(next?: string): Promise<{ error?: string }> {
  try {
    if (!(await currentUser())) {
      if (!guestCreations.hit("all")) return { error: "Hệ thống đang bận, vui lòng thử lại sau ít phút." };
      const guest = await createGuest(await getDb());
      await startSession(guest.id);
    }
  } catch (err) {
    console.error("[auth] Lỗi tạo tài khoản khách:", err);
    return { error: "Không thể kết nối đến máy chủ CSDL. Vui lòng thử lại sau giây lát." };
  }
  redirect(safeNext(next, "/online"));
}
