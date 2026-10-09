// Chỉ dùng trong Next.js (đọc cookie của request hiện tại).

import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { SESSION_COOKIE, getUserBySession, type PublicUser } from "./auth";
import { getDb } from "./db";

/** Người dùng đang đăng nhập, hoặc `null`. Luôn tính lúc có request (gọi trong `<Suspense>`). */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getUserBySession(await getDb(), token);
});
