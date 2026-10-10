import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { insertUser, resetDb } from "@/test/db";
import type { AuthUser } from "./auth";
import { adminStats, grantCoins, listReports, promoteAdmins, searchUsers } from "./admin";
import type { Database } from "./db";
import { coinTransactions, games, payments, reports, users } from "./db/schema";

// Server action đọc người dùng từ cookie; ở đây thay bằng người dùng do test chỉ định.
const current = vi.hoisted(() => ({ user: null as AuthUser | null }));
vi.mock("@/server/current-user", () => ({ getCurrentUser: async () => current.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const actions = await import("@/app/actions/admin");

let db: Database;
const asUser = async (id: string) => {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  current.user = { ...u } as unknown as AuthUser;
};
const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];

beforeAll(async () => {
  db = await resetDb();
});

beforeEach(() => {
  current.user = null;
});

describe("phân quyền server action", () => {
  it("người chơi thường không khóa được ai, kể cả khi gọi thẳng action", async () => {
    const mallory = await insertUser(db);
    const victim = await insertUser(db);
    await asUser(mallory.id);
    expect(await actions.adminBan(victim.id, 24, "ghét")).toMatchObject({ ok: false });
    expect(await actions.adminSetRole(mallory.id, "admin")).toMatchObject({ ok: false });
    expect(await actions.adminGrantCoins(mallory.id, 1000)).toMatchObject({ ok: false });
    expect((await row(victim.id)).bannedUntil).toBeNull();
    expect((await row(mallory.id)).role).toBe("user");
    expect((await row(mallory.id)).coins).toBe(0);
  });

  it("chưa đăng nhập cũng bị từ chối", async () => {
    const victim = await insertUser(db);
    expect(await actions.adminBan(victim.id, 24, "")).toMatchObject({ ok: false });
  });

  it("admin khóa rồi mở khóa người chơi", async () => {
    const admin = await insertUser(db, { role: "admin" });
    const cheater = await insertUser(db);
    await asUser(admin.id);
    expect(await actions.adminBan(cheater.id, 24 * 7, "Dùng phần mềm")).toMatchObject({ ok: true });
    const banned = await row(cheater.id);
    expect(banned.banReason).toBe("Dùng phần mềm");
    const days = (banned.bannedUntil!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    expect(await actions.adminUnban(cheater.id)).toMatchObject({ ok: true });
    expect((await row(cheater.id)).bannedUntil).toBeNull();
  });

  it("admin không tự khóa hay tự hạ quyền của mình (tránh mất quyền quản trị cuối cùng)", async () => {
    const admin = await insertUser(db, { role: "admin" });
    await asUser(admin.id);
    expect(await actions.adminBan(admin.id, 24, "")).toMatchObject({ ok: false });
    expect(await actions.adminSetRole(admin.id, "user")).toMatchObject({ ok: false });
    expect((await row(admin.id)).role).toBe("admin");
  });

  it("id rác không chạm tới CSDL", async () => {
    const admin = await insertUser(db, { role: "admin" });
    await asUser(admin.id);
    expect(await actions.adminBan("'; drop table users; --", 24, "")).toMatchObject({ ok: false });
    expect(await actions.adminBan(admin.id.replace(/.$/, "0"), Number.NaN, "")).toMatchObject({ ok: false });
  });
});

describe("cộng / trừ xu", () => {
  it("bấm cộng xu hai lần liền đều được ghi, mỗi lần một giao dịch", async () => {
    const admin = await insertUser(db, { role: "admin" });
    const user = await insertUser(db);
    const [a, b] = await Promise.all([grantCoins(db, user.id, 500, admin.id), grantCoins(db, user.id, 500, admin.id)]);
    expect(a.ok && b.ok).toBe(true);
    expect((await row(user.id)).coins).toBe(1000);
    const tx = await db.select().from(coinTransactions).where(eq(coinTransactions.userId, user.id));
    expect(tx).toHaveLength(2);
    expect(tx.every((t) => t.reason === "admin" && t.ref!.startsWith(admin.id))).toBe(true);
  });

  it("trừ xu quá số dư bị từ chối, số dư không âm", async () => {
    const admin = await insertUser(db, { role: "admin" });
    const user = await insertUser(db, { coins: 100 });
    const res = await grantCoins(db, user.id, -500, admin.id);
    expect(res.ok).toBe(false);
    expect((await row(user.id)).coins).toBe(100);
    expect((await grantCoins(db, user.id, -100, admin.id)).ok).toBe(true);
    expect((await row(user.id)).coins).toBe(0);
  });

  it("số xu 0, số lẻ hoặc quá lớn bị từ chối qua action", async () => {
    const admin = await insertUser(db, { role: "admin" });
    const user = await insertUser(db);
    await asUser(admin.id);
    expect(await actions.adminGrantCoins(user.id, 0)).toMatchObject({ ok: false });
    expect(await actions.adminGrantCoins(user.id, 5_000_000)).toMatchObject({ ok: false });
    expect((await row(user.id)).coins).toBe(0);
  });
});

describe("báo cáo", () => {
  it("xử lý báo cáo đưa nó ra khỏi hàng chờ; xử lý lại không ghi đè người xử lý đầu", async () => {
    const [admin1, admin2, reporter, target] = await Promise.all([
      insertUser(db, { role: "admin" }), insertUser(db, { role: "admin" }), insertUser(db), insertUser(db),
    ]);
    const [r] = await db.insert(reports).values({ reporterId: reporter.id, targetId: target.id, reason: "cheating", note: "đi y như máy" }).returning();

    const open = await listReports(db, "open");
    expect(open.find((x) => x.id === r.id)).toMatchObject({ target: { username: target.username }, reporter: { username: reporter.username } });

    await asUser(admin1.id);
    await actions.adminResolveReport(r.id, "resolved");
    await asUser(admin2.id);
    await actions.adminResolveReport(r.id, "dismissed");

    const [after] = await db.select().from(reports).where(eq(reports.id, r.id));
    expect(after).toMatchObject({ status: "resolved", resolvedBy: admin1.id });
    expect((await listReports(db, "open")).some((x) => x.id === r.id)).toBe(false);
  });
});

describe("thống kê và tìm kiếm", () => {
  it("doanh thu chỉ tính giao dịch đã thanh toán; tài khoản khách không tính là người dùng", async () => {
    await resetDb();
    const a = await insertUser(db);
    const b = await insertUser(db);
    await insertUser(db, { isGuest: true });
    await db.insert(payments).values([
      { id: "p1", userId: a.id, product: "vip30", amount: 49_000, provider: "mock", status: "paid" },
      { id: "p2", userId: a.id, product: "vip30", amount: 49_000, provider: "mock", status: "pending" },
      { id: "p3", userId: b.id, product: "coins5k", amount: 20_000, provider: "mock", status: "failed" },
    ]);
    const now = Date.now();
    await db.insert(games).values({
      id: "old0000001", redId: a.id, blackId: b.id, minutes: 10, winner: "r", reason: "resign", moves: [], plies: 20,
      redRatingBefore: 1500, blackRatingBefore: 1500, redRatingAfter: 1510, blackRatingAfter: 1490,
      startedAt: new Date(now - 3 * 86_400_000), endedAt: new Date(now - 3 * 86_400_000 + 600_000),
    });
    expect(await adminStats(db, now)).toEqual({ users: 2, games: 1, games24h: 0, openReports: 0, revenue: 49_000 });
  });

  it("tìm không phân biệt hoa thường theo tên đăng nhập, tên hiển thị, email", async () => {
    const u = await insertUser(db, { username: "hoangtuong", displayName: "Hoàng Tướng", email: "ht@example.vn" });
    for (const q of ["HOANG", "Hoàng", "EXAMPLE.vn"]) {
      expect((await searchUsers(db, q)).map((x) => x.id)).toContain(u.id);
    }
    // Ký tự đại diện của LIKE trong ô tìm kiếm không được khớp tất cả.
    expect(await searchUsers(db, "%")).toHaveLength(0);
    const under = await insertUser(db, { username: "ten_gach" });
    expect((await searchUsers(db, "n_g")).map((x) => x.id)).toEqual([under.id]);
    expect((await searchUsers(db, "${c}")).map((x) => x.id)).toEqual([]);
  });

  it("ADMIN_USERNAMES cấp quyền theo tên đăng nhập, bỏ qua khoảng trắng và tên không tồn tại", async () => {
    const u = await insertUser(db, { username: "chuquan" });
    expect(await promoteAdmins(db, [" ChuQuan ", "khongcoai", ""])).toBe(1);
    expect((await row(u.id)).role).toBe("admin");
  });
});
