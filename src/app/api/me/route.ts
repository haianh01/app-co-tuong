import { connection } from "next/server";
import { SESSION_COOKIE, getUserBySession, parseCookies } from "@/server/auth";
import { getDb } from "@/server/db";

/** Người dùng hiện tại (cho menu tài khoản trên header). */
export async function GET(request: Request) {
  await connection();
  const token = parseCookies(request.headers.get("cookie") ?? undefined)[SESSION_COOKIE];
  const user = await getUserBySession(await getDb(), token);
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
