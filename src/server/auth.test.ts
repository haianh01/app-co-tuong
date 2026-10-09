import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS, authenticate, createSession, deleteSession, getUserBySession,
  hashPassword, parseCookies, purgeExpiredSessions, registerUser, verifyPassword,
} from "./auth";
import { createDb, type DbHandle } from "./db";

let h: DbHandle;

beforeAll(async () => {
  h = await createDb();
});

afterAll(async () => {
  await h.close();
});

describe("mật khẩu", () => {
  it("băm và kiểm tra đúng/sai", async () => {
    const stored = await hashPassword("mat-khau-123");
    expect(stored).toMatch(/^scrypt\$/);
    expect(await verifyPassword("mat-khau-123", stored)).toBe(true);
    expect(await verifyPassword("mat-khau-124", stored)).toBe(false);
  });
});

describe("đăng ký / đăng nhập", () => {
  it("kiểm tra dữ liệu đầu vào", async () => {
    const res = await registerUser(h.db, { username: "a b", displayName: "x", password: "123" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(["displayName", "password", "username"]);
  });

  it("đăng ký, chặn trùng tên (không phân biệt hoa thường), đăng nhập", async () => {
    const res = await registerUser(h.db, { username: "HaiAnh", displayName: "  Hải   Anh ", password: "matkhau123" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user.username).toBe("haianh");
      expect(res.user.displayName).toBe("Hải Anh");
      expect(res.user.rating).toBe(1500);
    }
    const dup = await registerUser(h.db, { username: "haianh", displayName: "Khác", password: "matkhau123" });
    expect(dup).toEqual({ ok: false, errors: { username: "Tên đăng nhập này đã có người dùng." } });

    expect(await authenticate(h.db, "HAIANH", "matkhau123")).toMatchObject({ username: "haianh" });
    expect(await authenticate(h.db, "haianh", "sai-mat-khau")).toBeNull();
    expect(await authenticate(h.db, "khong-ton-tai", "matkhau123")).toBeNull();
  });

  it("phiên đăng nhập: tạo, đọc, hết hạn, xóa", async () => {
    const user = await authenticate(h.db, "haianh", "matkhau123");
    const now = Date.now();
    const { token } = await createSession(h.db, user!.id, now);
    expect(await getUserBySession(h.db, token, now)).toMatchObject({ id: user!.id });
    expect(await getUserBySession(h.db, token, now + SESSION_TTL_MS + 1)).toBeNull();
    expect(await getUserBySession(h.db, "token-bịa", now)).toBeNull();
    await deleteSession(h.db, token);
    expect(await getUserBySession(h.db, token, now)).toBeNull();
  });

  it("dọn các phiên đã hết hạn, giữ phiên còn hạn", async () => {
    const user = await authenticate(h.db, "haianh", "matkhau123");
    const now = Date.now();
    const old = await createSession(h.db, user!.id, now - SESSION_TTL_MS - 1000);
    const fresh = await createSession(h.db, user!.id, now);
    await purgeExpiredSessions(h.db, now);
    expect(await getUserBySession(h.db, old.token, now - SESSION_TTL_MS - 500)).toBeNull();
    expect(await getUserBySession(h.db, fresh.token, now)).toMatchObject({ id: user!.id });
  });
});

describe("parseCookies", () => {
  it("đọc header Cookie", () => {
    expect(parseCookies("a=1; kd_session=abc%2Fdef; b")).toEqual({ a: "1", kd_session: "abc/def" });
    expect(parseCookies(undefined)).toEqual({});
  });
});
