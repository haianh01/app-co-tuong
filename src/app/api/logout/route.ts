import { SESSION_COOKIE, deleteSession, parseCookies } from "@/server/auth";
import { getDb } from "@/server/db";

export async function POST(request: Request) {
  // Chỉ nhận yêu cầu từ chính trang web (chống CSRF).
  const origin = request.headers.get("origin");
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === request.headers.get("host");
    } catch {}
    if (!sameHost) return new Response(null, { status: 403 });
  }
  const token = parseCookies(request.headers.get("cookie") ?? undefined)[SESSION_COOKIE];
  await deleteSession(await getDb(), token);
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` },
  });
}
