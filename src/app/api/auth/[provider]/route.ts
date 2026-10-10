import { connection } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { PUBLIC_URL } from "@/lib/site";
import { authorizeUrl, findProvider, newState } from "@/server/oauth";

const OAUTH_COOKIE = "kd_oauth";

/** Bắt đầu đăng nhập / liên kết: lưu `state` vào cookie ngắn hạn rồi chuyển sang trang của nhà cung cấp. */
export async function GET(request: Request, ctx: RouteContext<"/api/auth/[provider]">) {
  await connection();
  const { provider: id } = await ctx.params;
  const provider = findProvider(id);
  if (!provider) return new Response("Chưa cấu hình đăng nhập bằng dịch vụ này.", { status: 404 });
  const url = new URL(request.url);
  const state = newState();
  const payload = JSON.stringify({ state, link: url.searchParams.get("link") === "1", next: safeNext(url.searchParams.get("next"), "/online") });
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production";
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl(provider, state, `${PUBLIC_URL}/api/auth/${provider.id}/callback`),
      "Set-Cookie": `${OAUTH_COOKIE}=${encodeURIComponent(payload)}; Path=/api/auth; Max-Age=600; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    },
  });
}
