// Khối "Vào trận nhanh" ở trang chủ: chọn thời gian + cấp độ rồi mở /play với đúng tham số.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AI_LEVELS } from "@/lib/xiangqi/ai";
import { parseSettings } from "./play/settings";
import { QuickStart } from "./QuickStart";

const cta = () => screen.getByRole("link", { name: /Vào trận với máy/ });
const group = (name: string) => within(screen.getByRole("group", { name }));
const pressed = (name: string) =>
  group(name).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent);

describe("QuickStart", () => {
  it("mặc định: 10 phút, cấp Trung bình, cầm Đỏ", () => {
    render(<QuickStart />);
    expect(cta().getAttribute("href")).toBe("/play?level=3&side=r&time=10");
    expect(pressed("Thời gian mỗi bên")).toEqual(["10 phút"]);
    expect(pressed("Cấp độ máy")).toEqual(["Trung bình"]);
  });

  it("có đủ 4 lựa chọn thời gian và 5 cấp độ", () => {
    render(<QuickStart />);
    expect(group("Thời gian mỗi bên").getAllByRole("button")).toHaveLength(4);
    expect(group("Cấp độ máy").getAllByRole("button").map((b) => b.textContent)).toEqual(
      Object.values(AI_LEVELS).map((l) => l.label),
    );
  });

  it("chọn thời gian và cấp độ thì đường dẫn đổi theo, chỉ một nút được chọn mỗi nhóm", () => {
    render(<QuickStart />);
    fireEvent.click(group("Thời gian mỗi bên").getByRole("button", { name: "Không giới hạn" }));
    fireEvent.click(group("Cấp độ máy").getByRole("button", { name: "Đại sư" }));
    expect(cta().getAttribute("href")).toBe("/play?level=5&side=r&time=0");
    expect(pressed("Thời gian mỗi bên")).toEqual(["Không giới hạn"]);
    expect(pressed("Cấp độ máy")).toEqual(["Đại sư"]);
  });

  it("đường dẫn tạo ra được trang /play đọc lại đúng", () => {
    render(<QuickStart />);
    fireEvent.click(group("Thời gian mỗi bên").getByRole("button", { name: "5 phút" }));
    fireEvent.click(group("Cấp độ máy").getByRole("button", { name: "Tân thủ" }));
    const params = Object.fromEntries(new URL(cta().getAttribute("href")!, "http://x").searchParams);
    expect(parseSettings(params)).toEqual({ level: 1, side: "r", minutes: 5 });
  });
});
