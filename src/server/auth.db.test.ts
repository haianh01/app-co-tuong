import { beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "@/test/db";
import {
  NO_PASSWORD, SESSION_TTL_MS, authenticate, createGuest, createSession, deleteSession, deleteUserSessions,
  getUserBySession, hashPassword, parseCookies, purgeExpiredSessions, registerUser, toSessionUser, upgradeGuest,
  verifyPassword,
} from "./auth";
import type { Database } from "./db";
import { users } from "./db/schema";

let db: Database;

beforeAll(async () => {
  db = await resetDb();
});

describe("mật khẩu", () => {
  it("băm và kiểm tra đúng/sai; chuỗi lạ không bao giờ khớp", async () => {
    const stored = await hashPassword("mat-khau-123");
    expect(stored).toMatch(/^scrypt\$/);
    expect(await verifyPassword("mat-khau-123", stored)).toBe(true);
    expect(await verifyPassword("mat-khau-124", stored)).toBe(false);
    expect(await verifyPassword("bat-ky", NO_PASSWORD)).toBe(false);
  });
});

describe("đăng ký / đăng nhập", () => {
  it("kiểm tra dữ liệu đầu vào", async () => {
    const res = await registerUser(db, { username: "a b", displayName: "x", password: "123" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(["displayName", "password", "username"]);
  });

  it("đăng ký, chặn trùng tên (không phân biệt hoa thường), đăng nhập", async () => {
    const res = await registerUser(db, { username: "HaiAnh", displayName: "  Hải   Anh ", password: "matkhau123" });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.user).toMatchObject({ username: "haianh", displayName: "Hải Anh", rating: 1500, isGuest: false, hasPassword: true });
    }
    const dup = await registerUser(db, { username: "haianh", displayName: "Khác", password: "matkhau123" });
    expect(dup).toEqual({ ok: false, errors: { username: "Tên đăng nhập này đã có người dùng." } });

    expect(await authenticate(db, "HAIANH", "matkhau123")).toMatchObject({ username: "haianh" });
    expect(await authenticate(db, "haianh", "sai-mat-khau")).toBeNull();
    expect(await authenticate(db, "khong-ton-tai", "matkhau123")).toBeNull();
  });

  it("hai người đăng ký cùng tên cùng lúc: một người được, người kia nhận thông báo trùng tên", async () => {
    const input = { username: "cungluc", displayName: "Cùng Lúc", password: "matkhau123" };
    const results = await Promise.all([registerUser(db, input), registerUser(db, input)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, errors: { username: "Tên đăng nhập này đã có người dùng." } });
  });

  it("phiên đăng nhập: tạo, đọc, hết hạn, xóa, đăng xuất mọi thiết bị", async () => {
    const user = await authenticate(db, "haianh", "matkhau123");
    const now = Date.now();
    const { token } = await createSession(db, user!.id, now);
    const other = await createSession(db, user!.id, now);
    expect(await getUserBySession(db, token, now)).toMatchObject({ id: user!.id });
    expect(await getUserBySession(db, token, now + SESSION_TTL_MS + 1)).toBeNull();
    expect(await getUserBySession(db, "token-bịa", now)).toBeNull();
    await deleteSession(db, token);
    expect(await getUserBySession(db, token, now)).toBeNull();
    expect(await getUserBySession(db, other.token, now)).not.toBeNull();
    await deleteUserSessions(db, user!.id);
    expect(await getUserBySession(db, other.token, now)).toBeNull();
  });

  it("dọn các phiên đã hết hạn, giữ phiên còn hạn", async () => {
    const user = await authenticate(db, "haianh", "matkhau123");
    const now = Date.now();
    const old = await createSession(db, user!.id, now - SESSION_TTL_MS - 1000);
    const fresh = await createSession(db, user!.id, now);
    await purgeExpiredSessions(db, now);
    expect(await getUserBySession(db, old.token, now - SESSION_TTL_MS - 500)).toBeNull();
    expect(await getUserBySession(db, fresh.token, now)).toMatchObject({ id: user!.id });
  });
});

describe("khách", () => {
  it("tạo khách, không đăng nhập bằng mật khẩu được, nâng cấp giữ nguyên tài khoản", async () => {
    const guest = await createGuest(db);
    expect(guest).toMatchObject({ isGuest: true, hasPassword: false });
    expect(guest.username).toMatch(/^khach_[0-9a-f]{6}$/);
    expect(await authenticate(db, guest.username, "")).toBeNull();

    const taken = await upgradeGuest(db, guest.id, { username: "haianh", displayName: "Khách Cũ", password: "matkhau123" });
    expect(taken).toEqual({ ok: false, errors: { username: "Tên đăng nhập này đã có người dùng." } });

    const res = await upgradeGuest(db, guest.id, { username: "khachcu", displayName: "Khách Cũ", password: "matkhau123" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user).toMatchObject({ id: guest.id, username: "khachcu", isGuest: false, hasPassword: true });
    expect(await authenticate(db, "khachcu", "matkhau123")).toMatchObject({ id: guest.id });
    // Tài khoản thật không "nâng cấp" lại được.
    const again = await upgradeGuest(db, guest.id, { username: "khac", displayName: "Khác", password: "matkhau123" });
    expect(again.ok).toBe(false);
  });
});

describe("toSessionUser", () => {
  it("báo khóa tài khoản còn hiệu lực, bỏ qua khóa đã hết hạn", async () => {
    const now = Date.now();
    const user = (await authenticate(db, "haianh", "matkhau123"))!;
    expect(toSessionUser({ ...user, bannedUntil: new Date(now + 60_000), banReason: "Gian lận" }, now).ban).toEqual({
      until: now + 60_000,
      reason: "Gian lận",
    });
    expect(toSessionUser({ ...user, bannedUntil: new Date(now - 1) }, now).ban).toBeNull();
    expect(toSessionUser({ ...user, vipUntil: new Date(now - 1) }, now).vipUntil).toBeNull();
    const rows = await db.select().from(users);
    expect(rows.every((r) => r.passwordHash !== "matkhau123")).toBe(true);
  });
});

describe("parseCookies", () => {
  it("đọc header Cookie", () => {
    expect(parseCookies("a=1; kd_session=abc%2Fdef; b")).toEqual({ a: "1", kd_session: "abc/def" });
    expect(parseCookies(undefined)).toEqual({});
  });
});
