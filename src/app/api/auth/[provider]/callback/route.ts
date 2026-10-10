import { connection } from "next/server";
import { PUBLIC_URL } from "@/lib/site";
import { SESSION_COOKIE, createSession, getUserBySession, parseCookies } from "@/server/auth";
import { getDb } from "@/server/db";
import { fetchProfile, findProvider, signInWithOAuth } from "@/server/oauth";

const OAUTH_COOKIE = "kd_oauth";

function back(path: string, cookies: string[] = []) {
  const headers = new Headers({ Location: `${PUBLIC_URL}${path}` });
  headers.append("Set-Cookie", `${OAUTH_COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax`);
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

/** Nhà cung cấp gọi lại: kiểm tra `state`, đổi mã lấy thông tin, đăng nhập hoặc liên kết tài khoản. */
export async function GET(request: Request, ctx: RouteContext<"/api/auth/[provider]/callback">) {
  await connection();
  const { provider: id } = await ctx.params;
  const provider = findProvider(id);
  if (!provider) return new Response("Chưa cấu hình đăng nhập bằng dịch vụ này.", { status: 404 });

  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get("cookie") ?? undefined);
  let saved: { state?: string; link?: boolean; next?: string } = {};
  try {
    saved = JSON.parse(cookies[OAUTH_COOKIE] ?? "{}");
  } catch {}
  const code = url.searchParams.get("code");
  if (!code || !saved.state || url.searchParams.get("state") !== saved.state) return back("/login?oauth=failed");

  const db = await getDb();
  try {
    const profile = await fetchProfile(provider, code, `${PUBLIC_URL}/api/auth/${provider.id}/callback`);
    const current = saved.link ? await getUserBySession(db, cookies[SESSION_COOKIE]) : null;
    const res = await signInWithOAuth(db, provider.id, profile, current?.id ?? null);
    if ("error" in res) return back(`/settings?oauth=${encodeURIComponent(res.error)}`);
    if (current) return back("/settings?oauth=linked");
    const { token, expiresAt } = await createSession(db, res.userId);
    const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
    return back(saved.next ?? "/online", [
      `${SESSION_COOKIE}=${token}; Path=/; Expires=${expiresAt.toUTCString()}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    ]);
  } catch (err) {
    console.error("[oauth]", err);
    return back("/login?oauth=failed");
  }
}
