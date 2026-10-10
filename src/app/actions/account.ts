"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  changePassword, deleteAccount, requestEmailChange, requestPasswordReset, resetPassword, updateProfile,
} from "@/server/account";
import { SESSION_COOKIE } from "@/server/auth";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { getGameServer } from "@/server/game/registry";
import { RateLimiter } from "@/server/rate-limit";

export interface FormResult {
  ok?: string;
  error?: string;
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
// Giới hạn gửi email: mỗi tài khoản/địa chỉ 5 lần mỗi giờ.
const mailLimit = new RateLimiter(5, 60 * 60_000);

async function requireUser() {
  const user = await getCurrentUser();
  if (!user || user.isGuest) return null;
  return user;
}

export async function saveProfile(_prev: FormResult | undefined, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  if (!user) return { error: "Bạn cần đăng nhập." };
  const error = await updateProfile(await getDb(), user.id, { displayName: text(form.get("displayName")), avatar: text(form.get("avatar")) });
  if (error) return { error };
  await getGameServer()?.refreshUser(user.id);
  return { ok: "Đã lưu hồ sơ." };
}

export async function savePassword(_prev: FormResult | undefined, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  if (!user) return { error: "Bạn cần đăng nhập." };
  const next = text(form.get("next"));
  if (next !== text(form.get("confirm"))) return { error: "Mật khẩu nhập lại không khớp." };
  const error = await changePassword(await getDb(), user.id, text(form.get("current")), next);
  return error ? { error } : { ok: "Đã đổi mật khẩu." };
}

export async function saveEmail(_prev: FormResult | undefined, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  if (!user) return { error: "Bạn cần đăng nhập." };
  if (!mailLimit.hit(`verify:${user.id}`)) return { error: "Bạn đã gửi quá nhiều lần, vui lòng thử lại sau." };
  try {
    const error = await requestEmailChange(await getDb(), user.id, text(form.get("email")));
    return error ? { error } : { ok: "Đã gửi link xác nhận. Hãy mở email và bấm vào link trong 24 giờ." };
  } catch {
    return { error: "Không gửi được email, vui lòng thử lại sau." };
  }
}

export async function removeAccount(_prev: FormResult | undefined, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  if (!user) return { error: "Bạn cần đăng nhập." };
  if (text(form.get("confirm")).trim().toLowerCase() !== user.username) return { error: "Tên đăng nhập nhập lại không đúng." };
  await deleteAccount(await getDb(), user.id);
  getGameServer()?.disconnectUser(user.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function forgotPassword(_prev: FormResult | undefined, form: FormData): Promise<FormResult> {
  const email = text(form.get("email")).trim().toLowerCase();
  const sent = { ok: "Nếu email này đã được xác nhận cho một tài khoản, link đặt lại mật khẩu đã được gửi tới hộp thư." };
  if (!mailLimit.hit(`reset:${email}`)) return sent;
  try {
    await requestPasswordReset(await getDb(), email);
  } catch {
    return { error: "Không gửi được email, vui lòng thử lại sau." };
  }
  return sent;
}

export async function setNewPassword(_prev: FormResult | undefined, form: FormData): Promise<FormResult> {
  const password = text(form.get("password"));
  if (password !== text(form.get("confirm"))) return { error: "Mật khẩu nhập lại không khớp." };
  const error = await resetPassword(await getDb(), text(form.get("token")), password);
  if (error) return { error };
  redirect("/login?reset=1");
}
