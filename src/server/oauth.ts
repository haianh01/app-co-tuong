// Đăng nhập bằng Google / Facebook (OAuth 2.0, authorization code). Bật khi có biến môi trường:
//   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, FACEBOOK_CLIENT_ID + FACEBOOK_CLIENT_SECRET.
// Địa chỉ chuyển hướng cần khai báo với nhà cung cấp: {PUBLIC_URL}/api/auth/{google|facebook}/callback

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NO_PASSWORD, isUniqueViolation } from "./auth";
import type { Database } from "./db";
import { oauthAccounts, users } from "./db/schema";

export type ProviderId = "google" | "facebook";

export interface OAuthProvider {
  id: ProviderId;
  name: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
}

export interface OAuthProfile {
  id: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
}

export function oauthProviders(env: Record<string, string | undefined> = process.env): OAuthProvider[] {
  const list: OAuthProvider[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    list.push({
      id: "google",
      name: "Google",
      authUrl: env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
      userInfoUrl: env.GOOGLE_USERINFO_URL ?? "https://openidconnect.googleapis.com/v1/userinfo",
      scope: "openid email profile",
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
  }
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) {
    list.push({
      id: "facebook",
      name: "Facebook",
      authUrl: env.FACEBOOK_AUTH_URL ?? "https://www.facebook.com/v19.0/dialog/oauth",
      tokenUrl: env.FACEBOOK_TOKEN_URL ?? "https://graph.facebook.com/v19.0/oauth/access_token",
      userInfoUrl: env.FACEBOOK_USERINFO_URL ?? "https://graph.facebook.com/me?fields=id,name,email",
      scope: "public_profile,email",
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
    });
  }
  return list;
}

export const findProvider = (id: string) => oauthProviders().find((p) => p.id === id) ?? null;

export const newState = () => randomBytes(24).toString("base64url");

export function authorizeUrl(p: OAuthProvider, state: string, redirectUri: string): string {
  const url = new URL(p.authUrl);
  url.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: p.scope,
    state,
  }).toString();
  return url.toString();
}

/** Đổi mã xác thực lấy access token rồi đọc thông tin người dùng. */
export async function fetchProfile(p: OAuthProvider, code: string, redirectUri: string): Promise<OAuthProfile> {
  const tokenRes = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      code,
      client_id: p.clientId,
      client_secret: p.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Đổi mã OAuth thất bại (${tokenRes.status})`);
  const { access_token: token } = (await tokenRes.json()) as { access_token?: string };
  if (!token) throw new Error("Nhà cung cấp không trả access token");
  const infoRes = await fetch(p.userInfoUrl, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!infoRes.ok) throw new Error(`Đọc thông tin người dùng thất bại (${infoRes.status})`);
  const info = (await infoRes.json()) as Record<string, unknown>;
  const id = String(info.sub ?? info.id ?? "");
  if (!id) throw new Error("Thiếu mã người dùng từ nhà cung cấp");
  const email = typeof info.email === "string" ? info.email.toLowerCase() : null;
  return {
    id,
    name: typeof info.name === "string" ? info.name : "",
    email,
    // Google trả email_verified; Facebook chỉ trả email đã xác minh.
    emailVerified: !!email && (p.id === "facebook" || info.email_verified === true),
  };
}

function usernameFrom(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 12);
  return `${base || "kythu"}_${randomBytes(3).toString("hex")}`.slice(0, 20);
}

/**
 * Đăng nhập / liên kết bằng tài khoản nhà cung cấp.
 * - Đã liên kết trước đó: đăng nhập vào tài khoản đó.
 * - Đang đăng nhập (`currentUserId`): liên kết với tài khoản hiện tại.
 * - Còn lại: tạo tài khoản mới. Không tự gộp với tài khoản có cùng email (tránh bị chiếm tài khoản).
 */
export async function signInWithOAuth(
  db: Database,
  provider: ProviderId,
  profile: OAuthProfile,
  currentUserId: string | null,
): Promise<{ userId: string; created: boolean } | { error: string }> {
  const [link] = await db
    .select()
    .from(oauthAccounts)
    .where(eq(oauthAccounts.providerUserId, profile.id))
    .then((rows) => rows.filter((r) => r.provider === provider));
  if (link) {
    if (currentUserId && link.userId !== currentUserId) return { error: "Tài khoản này đã được liên kết với một người chơi khác." };
    return { userId: link.userId, created: false };
  }
  if (currentUserId) {
    await db.insert(oauthAccounts).values({ provider, providerUserId: profile.id, userId: currentUserId });
    await db.update(users).set({ isGuest: false }).where(eq(users.id, currentUserId));
    return { userId: currentUserId, created: false };
  }

  const displayName = (profile.name.trim().replace(/\s+/g, " ") || "Kỳ thủ").slice(0, 32).padEnd(2, ".");
  let emailFree = false;
  if (profile.email && profile.emailVerified) {
    emailFree = !(await db.select({ id: users.id }).from(users).where(eq(users.email, profile.email)).limit(1)).length;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const [user] = await db
        .insert(users)
        .values({
          username: usernameFrom(profile.name),
          displayName,
          passwordHash: NO_PASSWORD,
          email: emailFree ? profile.email : null,
          emailVerifiedAt: emailFree ? new Date() : null,
        })
        .returning();
      await db.insert(oauthAccounts).values({ provider, providerUserId: profile.id, userId: user.id });
      return { userId: user.id, created: true };
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 4) throw err;
    }
  }
}
