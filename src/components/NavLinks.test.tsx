import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavLinks, NavList } from "./NavLinks";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

const active = () => screen.queryAllByRole("link", { current: "page" }).map((a) => a.textContent);

describe("menu chính", () => {
  it("có đủ 5 mục với đúng đường dẫn", () => {
    render(<NavList pathname="/" />);
    const links = screen.getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Sảnh", "/"],
      ["Đấu online", "/online"],
      ["Chơi với máy", "/play"],
      ["Cờ thế", "/puzzle"],
      ["Xếp hạng", "/leaderboard"],
    ]);
  });

  it.each([
    ["/", "Sảnh"],
    ["/online", "Đấu online"],
    ["/game/abc12345", "Đấu online"],
    ["/play", "Chơi với máy"],
    ["/puzzle", "Cờ thế"],
    ["/leaderboard", "Xếp hạng"],
    ["/u/haianh", "Xếp hạng"],
  ])("đang ở %s thì sáng mục '%s'", (path, label) => {
    render(<NavList pathname={path} />);
    expect(active()).toEqual([label]);
  });

  it("'Sảnh' chỉ sáng ở đúng trang chủ, không sáng ở mọi trang", () => {
    render(<NavList pathname="/play" />);
    expect(active()).not.toContain("Sảnh");
  });

  it("trang không thuộc mục nào (đăng nhập, 404) thì không mục nào sáng", () => {
    render(<NavList pathname="/login" />);
    expect(active()).toEqual([]);
  });

  it("chưa biết đường dẫn (bản prerender) thì không mục nào sáng", () => {
    render(<NavList pathname={null} />);
    expect(active()).toEqual([]);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("NavLinks đọc đường dẫn hiện tại từ router", () => {
    pathname.value = "/puzzle";
    render(<NavLinks />);
    expect(active()).toEqual(["Cờ thế"]);
  });
});
