"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE, authenticate, createSession, normalizeUsername, registerUser,
  type FieldErrors,
} from "@/server/auth";
import { getDb } from "@/server/db";
import { RateLimiter } from "@/server/rate-limit";

export interface AuthFormState {
  errors?: FieldErrors & { form?: string };
  values?: { username?: string; displayName?: string };
}

// Tối đa 10 lần đăng nhập sai cho mỗi tài khoản trong 15 phút.
const loginFailures = new RateLimiter(10, 15 * 60_000);

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** Chỉ cho phép quay về đường dẫn nội bộ, tránh bị lợi dụng chuyển hướng sang trang khác. */
function safeNext(v: FormDataEntryValue | null): string {
  const s = text(v);
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/online";
}

async function startSession(userId: string) {
  const { token, expiresAt } = await createSession(await getDb(), userId);
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt });
}

export async function register(_prev: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const username = text(formData.get("username"));
  const displayName = text(formData.get("displayName"));
  const res = await registerUser(await getDb(), { username, displayName, password: text(formData.get("password")) });
  if (!res.ok) return { errors: res.errors, values: { username, displayName } };
  await startSession(res.user.id);
  redirect(safeNext(formData.get("next")));
}

export async function login(_prev: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const username = text(formData.get("username"));
  const key = normalizeUsername(username);
  if (loginFailures.blocked(key)) {
    return { errors: { form: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút." }, values: { username } };
  }
  const user = await authenticate(await getDb(), username, text(formData.get("password")));
  if (!user) {
    loginFailures.hit(key);
    return { errors: { form: "Sai tên đăng nhập hoặc mật khẩu." }, values: { username } };
  }
  loginFailures.reset(key);
  await startSession(user.id);
  redirect(safeNext(formData.get("next")));
}
