// Menu tài khoản trên header: chưa đăng nhập / đã đăng nhập / đăng xuất.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/session-types";
import { UserMenu } from "./UserMenu";

const nav = vi.hoisted(() => ({ pathname: "/", push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
}));

const session = vi.hoisted(() => ({ user: undefined as unknown, setUser: vi.fn() }));
vi.mock("./session/SessionProvider", () => ({ useSession: () => ({ ...session, refresh: () => {} }) }));

const USER: SessionUser = {
  id: "u1", username: "haianh", displayName: "hải Anh", rating: 1520, isGuest: false, isAdmin: false, coins: 1200,
  vipUntil: null, avatar: "tuong-do", frame: "none", boardSkin: "go", pieceSkin: "wood", email: null,
  emailVerified: false, hasPassword: true, ban: null,
};

beforeEach(() => {
  nav.pathname = "/";
  nav.push.mockReset();
  nav.refresh.mockReset();
  session.user = undefined;
  session.setUser.mockReset();
});

const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

describe("UserMenu", () => {
  it("đang tải thông tin thì chỉ giữ chỗ (không nháy nút đăng nhập)", () => {
    const { container } = render(<UserMenu />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("chưa đăng nhập: nút đăng nhập/đăng ký quay lại đúng trang đang xem", () => {
    session.user = null;
    nav.pathname = "/play";
    render(<UserMenu />);
    expect(href("Đăng nhập")).toBe("/login?next=%2Fplay");
    expect(href("Đăng ký")).toBe("/register?next=%2Fplay");
  });

  it.each(["/login", "/register"])("đang ở %s thì sau khi đăng nhập về sảnh online", (path) => {
    session.user = null;
    nav.pathname = path;
    render(<UserMenu />);
    expect(href("Đăng nhập")).toBe("/login?next=%2Fonline");
  });

  it("đã đăng nhập: hiện avatar, tên, Elo, số xu; tên dẫn tới trang cài đặt", () => {
    session.user = USER;
    render(<UserMenu />);
    const account = screen.getByRole("link", { name: /hải Anh/ });
    expect(account.getAttribute("href")).toBe("/settings");
    expect(account.textContent).toContain("Elo 1520");
    expect(account.textContent?.startsWith("帥")).toBe(true);
    expect(screen.getByRole("link", { name: "1200 xu, mở cửa hàng" }).getAttribute("href")).toBe("/shop");
    expect(screen.queryByRole("link", { name: "Quản trị" })).toBeNull();
  });

  it("khách: không hiện xu, nhắc lưu tài khoản (giữ lịch sử ván)", () => {
    session.user = { ...USER, isGuest: true, displayName: "Khách 1234" };
    render(<UserMenu />);
    const account = screen.getByRole("link", { name: /Khách 1234/ });
    expect(account.getAttribute("href")).toBe("/register?next=/online");
    expect(account.textContent).toContain("Lưu tài khoản");
    expect(screen.queryByRole("link", { name: /xu, mở cửa hàng/ })).toBeNull();
  });

  it("VIP và quản trị viên", () => {
    session.user = { ...USER, vipUntil: Date.now() + 86_400_000, isAdmin: true };
    render(<UserMenu />);
    expect(screen.getByRole("link", { name: /hải Anh/ }).textContent).toContain("VIP");
    expect(screen.getByRole("link", { name: "Quản trị" }).getAttribute("href")).toBe("/admin");
  });

  it("đăng xuất: gọi POST /api/logout, xóa người dùng, về trang chủ và làm mới", async () => {
    session.user = USER;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<UserMenu />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { method: "POST" });
    expect(session.setUser).toHaveBeenCalledWith(null);
    expect(nav.push).toHaveBeenCalledWith("/");
    expect(nav.refresh).toHaveBeenCalled();
  });
});
