import { connection } from "next/server";
import { SESSION_COOKIE, getUserBySession, parseCookies, toSessionUser } from "@/server/auth";
import { getDb } from "@/server/db";

/** Người dùng hiện tại (cho menu tài khoản, skin bàn cờ, số xu…). */
export async function GET(request: Request) {
  await connection();
  const token = parseCookies(request.headers.get("cookie") ?? undefined)[SESSION_COOKIE];
  const user = await getUserBySession(await getDb(), token);
  return Response.json({ user: user ? toSessionUser(user) : null }, { headers: { "Cache-Control": "no-store" } });
}
