import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "@/test/db";
import {
  changePassword, confirmEmail, deleteAccount, requestEmailChange, requestPasswordReset, resetPassword, updateProfile,
} from "./account";
import { authenticate, createSession, getUserBySession, registerUser } from "./auth";
import type { Database } from "./db";
import { users } from "./db/schema";
import { setMailer, type Mail } from "./mailer";
import { getLeaderboard } from "./queries";

let db: Database;
const outbox: Mail[] = [];
const linkIn = (mail: Mail) => new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
let userId: string;

beforeAll(async () => {
  db = await resetDb();
  setMailer(async (m) => {
    outbox.push(m);
  });
  const res = await registerUser(db, { username: "minhduc", displayName: "Minh Đức", password: "matkhau123" });
  if (!res.ok) throw new Error("đăng ký lỗi");
  userId = res.user.id;
});

afterAll(() => setMailer(undefined));

describe("email và khôi phục mật khẩu", () => {
  it("chưa xác nhận email thì quên mật khẩu không gửi gì (không lộ email nào có tài khoản)", async () => {
    await requestEmailChange(db, userId, "Duc@Example.com");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("duc@example.com");
    await requestPasswordReset(db, "duc@example.com");
    await requestPasswordReset(db, "khong-ai@example.com");
    expect(outbox).toHaveLength(1);
  });

  it("xác nhận email bằng link, link chỉ dùng được một lần", async () => {
    const token = linkIn(outbox[0]);
    expect(await confirmEmail(db, token)).toBe("ok");
    expect(await confirmEmail(db, token)).toBe("invalid");
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.email).toBe("duc@example.com");
    expect(u.emailVerifiedAt).not.toBeNull();
  });

  it("email đã thuộc tài khoản khác thì không đặt được", async () => {
    const other = await registerUser(db, { username: "nguoikhac", displayName: "Người Khác", password: "matkhau123" });
    if (!other.ok) throw new Error();
    expect(await requestEmailChange(db, other.user.id, "duc@example.com")).toMatch(/đã được dùng/);
    expect(await requestEmailChange(db, other.user.id, "khong-phai-email")).toMatch(/không hợp lệ/);
  });

  it("đặt lại mật khẩu: link hết hạn sau 1 giờ, đặt xong thì đăng xuất mọi nơi", async () => {
    const { token: session } = await createSession(db, userId);
    const now = Date.now();
    await requestPasswordReset(db, "DUC@example.com", now);
    const expired = linkIn(outbox[outbox.length - 1]);
    expect(await resetPassword(db, expired, "matkhaumoi1", now + 61 * 60_000)).toMatch(/không hợp lệ hoặc đã hết hạn/);

    await requestPasswordReset(db, "duc@example.com", now);
    const token = linkIn(outbox[outbox.length - 1]);
    expect(await resetPassword(db, token, "ngan", now)).toMatch(/ít nhất 8/);
    expect(await resetPassword(db, token, "matkhaumoi1", now)).toBeNull();
    expect(await resetPassword(db, token, "matkhaumoi2", now)).toMatch(/không hợp lệ/);
    expect(await authenticate(db, "minhduc", "matkhaumoi1")).not.toBeNull();
    expect(await authenticate(db, "minhduc", "matkhau123")).toBeNull();
    expect(await getUserBySession(db, session)).toBeNull();
  });
});

describe("đổi thông tin", () => {
  it("đổi mật khẩu cần đúng mật khẩu hiện tại", async () => {
    expect(await changePassword(db, userId, "sai", "matkhaumoi9")).toMatch(/không đúng/);
    expect(await changePassword(db, userId, "matkhaumoi1", "matkhaumoi9")).toBeNull();
    expect(await authenticate(db, "minhduc", "matkhaumoi9")).not.toBeNull();
  });

  it("đổi tên hiển thị và avatar có kiểm tra", async () => {
    expect(await updateProfile(db, userId, { displayName: "  Đức   Minh ", avatar: "long" })).toBeNull();
    expect(await updateProfile(db, userId, { displayName: "A", avatar: "long" })).toMatch(/2 đến 32/);
    expect(await updateProfile(db, userId, { displayName: "Đức", avatar: "khong-co" })).toMatch(/Avatar/);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u).toMatchObject({ displayName: "Đức Minh", avatar: "long" });
  });
});

describe("xóa tài khoản", () => {
  it("xóa thông tin cá nhân, không đăng nhập lại được, không còn trên bảng xếp hạng", async () => {
    await db.update(users).set({ gamesPlayed: 3 }).where(eq(users.id, userId));
    expect((await getLeaderboard(db)).some((r) => r.id === userId)).toBe(true);
    const { token } = await createSession(db, userId);
    await deleteAccount(db, userId);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u).toMatchObject({ displayName: "Người chơi đã xóa", email: null, passwordHash: "!" });
    expect(u.username).toMatch(/^daxoa_/);
    expect(await authenticate(db, "minhduc", "matkhaumoi9")).toBeNull();
    expect(await getUserBySession(db, token)).toBeNull();
    expect((await getLeaderboard(db)).some((r) => r.id === userId)).toBe(false);
  });
});
