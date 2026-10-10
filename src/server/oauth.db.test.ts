import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "@/test/db";
import { registerUser } from "./auth";
import type { Database } from "./db";
import { oauthAccounts, users } from "./db/schema";
import { authorizeUrl, fetchProfile, oauthProviders, signInWithOAuth, type OAuthProvider } from "./oauth";

let db: Database;
let fake: Server;
let provider: OAuthProvider;
const seen: { body?: string; auth?: string } = {};

beforeAll(async () => {
  db = await resetDb();
  // Máy chủ OAuth giả: kiểm tra mã + client secret, trả token, rồi trả thông tin người dùng kiểu Google.
  fake = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/token") {
        seen.body = body;
        const p = new URLSearchParams(body);
        if (p.get("code") !== "ma-dung" || p.get("client_secret") !== "bi-mat") {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        res.end(JSON.stringify({ access_token: "tok-123" }));
      } else if (req.url === "/userinfo") {
        seen.auth = req.headers.authorization;
        res.end(JSON.stringify({ sub: "g-42", name: "Lê Hải Đăng", email: "Dang@Gmail.com", email_verified: true }));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((r) => fake.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  [provider] = oauthProviders({
    GOOGLE_CLIENT_ID: "id-cua-app",
    GOOGLE_CLIENT_SECRET: "bi-mat",
    GOOGLE_AUTH_URL: `${base}/auth`,
    GOOGLE_TOKEN_URL: `${base}/token`,
    GOOGLE_USERINFO_URL: `${base}/userinfo`,
  });
});

afterAll(async () => {
  await new Promise((r) => fake.close(r));
});

describe("OAuth", () => {
  it("chỉ bật nhà cung cấp đã cấu hình đủ khóa", () => {
    expect(oauthProviders({})).toEqual([]);
    expect(oauthProviders({ FACEBOOK_CLIENT_ID: "x" })).toEqual([]);
    expect(oauthProviders({ FACEBOOK_CLIENT_ID: "x", FACEBOOK_CLIENT_SECRET: "y" }).map((p) => p.id)).toEqual(["facebook"]);
  });

  it("link xác thực mang đúng client_id, redirect_uri, state", () => {
    const url = new URL(authorizeUrl(provider, "trang-thai", "https://kydai.vn/api/auth/google/callback"));
    expect(url.searchParams.get("client_id")).toBe("id-cua-app");
    expect(url.searchParams.get("redirect_uri")).toBe("https://kydai.vn/api/auth/google/callback");
    expect(url.searchParams.get("state")).toBe("trang-thai");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("đổi mã lấy thông tin người dùng; mã sai thì báo lỗi", async () => {
    const profile = await fetchProfile(provider, "ma-dung", "https://kydai.vn/cb");
    expect(profile).toEqual({ id: "g-42", name: "Lê Hải Đăng", email: "dang@gmail.com", emailVerified: true });
    expect(seen.auth).toBe("Bearer tok-123");
    expect(new URLSearchParams(seen.body).get("grant_type")).toBe("authorization_code");
    await expect(fetchProfile(provider, "ma-sai", "https://kydai.vn/cb")).rejects.toThrow(/400/);
  });

  it("lần đầu tạo tài khoản mới, lần sau đăng nhập lại đúng tài khoản đó", async () => {
    const profile = await fetchProfile(provider, "ma-dung", "https://kydai.vn/cb");
    const first = await signInWithOAuth(db, "google", profile, null);
    expect(first).toMatchObject({ created: true });
    const userId = (first as { userId: string }).userId;
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u).toMatchObject({ displayName: "Lê Hải Đăng", email: "dang@gmail.com", passwordHash: "!", isGuest: false });
    expect(u.username).toMatch(/^lehaidang_[0-9a-f]{6}$/);
    expect(await signInWithOAuth(db, "google", profile, null)).toEqual({ userId, created: false });
  });

  it("không tự gộp với tài khoản có sẵn cùng email (tránh bị chiếm tài khoản)", async () => {
    const victim = await registerUser(db, { username: "nannhan", displayName: "Nạn Nhân", password: "matkhau123" });
    if (!victim.ok) throw new Error();
    await db.update(users).set({ email: "victim@gmail.com", emailVerifiedAt: new Date() }).where(eq(users.id, victim.user.id));
    const res = await signInWithOAuth(db, "google", { id: "g-ke-gian", name: "Kẻ Gian", email: "victim@gmail.com", emailVerified: true }, null);
    expect(res).toMatchObject({ created: true });
    expect((res as { userId: string }).userId).not.toBe(victim.user.id);
    const [created] = await db.select().from(users).where(eq(users.id, (res as { userId: string }).userId));
    expect(created.email).toBeNull();
  });

  it("đang đăng nhập thì liên kết vào tài khoản hiện tại; tài khoản Google đã thuộc người khác thì từ chối", async () => {
    const me = await registerUser(db, { username: "toilienket", displayName: "Tôi", password: "matkhau123" });
    if (!me.ok) throw new Error();
    const res = await signInWithOAuth(db, "google", { id: "g-moi", name: "Tôi", email: null, emailVerified: false }, me.user.id);
    expect(res).toEqual({ userId: me.user.id, created: false });
    const links = await db.select().from(oauthAccounts).where(eq(oauthAccounts.userId, me.user.id));
    expect(links).toHaveLength(1);
    const taken = await signInWithOAuth(db, "google", { id: "g-42", name: "x", email: null, emailVerified: false }, me.user.id);
    expect(taken).toEqual({ error: "Tài khoản này đã được liên kết với một người chơi khác." });
  });
});
