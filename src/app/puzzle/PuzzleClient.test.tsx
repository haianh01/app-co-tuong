// Màn giải cờ thế: chọn quân, đi đúng/sai, gợi ý, chấm sao, chuyển thế. Đồng hồ giả cho lần tự đặt lại sau nước sai.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sq } from "@/lib/xiangqi/engine";
import { PUZZLES } from "@/lib/xiangqi/puzzles";
import { PuzzleClient } from "./PuzzleClient";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

/** Bấm vào một ô: quân trên ô đó, hoặc chấm "Đi tới ô này". */
function tap(r: number, c: number) {
  const el = document.querySelector<HTMLElement>(`button[data-square="${sq(r, c)}"]`);
  if (!el) throw new Error(`Không có nút ở ô ${r},${c}`);
  fireEvent.click(el);
}

const targets = () => screen.queryAllByRole("button", { name: "Đi tới ô này" }).map((b) => Number(b.dataset.square)).sort((a, b) => a - b);
const status = () => screen.getByRole("status").textContent;
const tries = () => screen.getByText(/Số lần thử/).querySelector("strong")!.textContent;
const listItem = (title: string) => screen.getByRole("button", { name: new RegExp(title) });

/** Giải thế đang mở bằng lời giải mẫu. */
function solve(index: number) {
  const { from, to } = PUZZLES[index].solution;
  tap(Math.floor(from / 9), from % 9);
  tap(Math.floor(to / 9), to % 9);
}

const WRONG = { from: [2, 8], to: [3, 8] } as const; // thế 1: xe đi 1 bước, không chiếu bí

describe("PuzzleClient", () => {
  it("mở thế đầu tiên, liệt kê mọi thế ở trạng thái 'Chưa giải'", () => {
    render(<PuzzleClient />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PUZZLES[0].title);
    expect(screen.getByText(`${PUZZLES[0].chapter.toUpperCase()} · THẾ 1 / ${PUZZLES.length}`)).toBeTruthy();
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    const nav = screen.getByRole("navigation", { name: "Danh sách thế cờ" });
    expect(within(nav).getAllByText("Chưa giải")).toHaveLength(PUZZLES.length);
    expect(listItem(PUZZLES[0].title).getAttribute("aria-current")).toBe("true");
  });

  it("bấm quân Đỏ thì hiện các ô đi được; bấm lại thì bỏ chọn", () => {
    render(<PuzzleClient />);
    tap(2, 8);
    expect(targets().length).toBeGreaterThan(0);
    expect(targets()).toContain(sq(2, 3));
    tap(2, 8);
    expect(targets()).toEqual([]);
  });

  it("không chọn được quân Đen; bấm quân Đen khi đang chọn thì bỏ chọn", () => {
    render(<PuzzleClient />);
    tap(0, 3);
    expect(targets()).toEqual([]);
    tap(2, 8);
    tap(4, 7); // pháo đen, không phải ô xe đi được
    expect(targets()).toEqual([]);
  });

  it("giải đúng ngay lần đầu: báo chiếu bí, 3 sao, đánh dấu 'Đã giải'", () => {
    render(<PuzzleClient />);
    solve(0);
    const dialog = screen.getByRole("dialog", { name: "Chiếu bí! Giải đúng thế cờ." });
    expect(within(dialog).getByText("3 sao")).toBeTruthy();
    expect(status()).toBe(`Chính xác! Ví dụ lời giải: ${PUZZLES[0].solutionText}.`);
    expect(tries()).toBe("1");
    expect(within(listItem(PUZZLES[0].title)).getByText("Đã giải")).toBeTruthy();
  });

  it("đi sai: báo thử lại, khóa bàn cờ, tự đặt lại sau 1,2 giây và vẫn tính số lần thử", () => {
    render(<PuzzleClient />);
    tap(...WRONG.from);
    tap(...WRONG.to);
    expect(status()).toBe("Chưa chiếu bí. Thử lại nhé!");
    expect(tries()).toBe("1");
    tap(3, 8); // bàn cờ đang khóa
    expect(targets()).toEqual([]);

    act(() => vi.advanceTimersByTime(1199));
    expect(status()).toBe("Chưa chiếu bí. Thử lại nhé!");
    act(() => vi.advanceTimersByTime(1));
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    // Xe đã về chỗ cũ.
    expect(document.querySelector(`button[data-square="${sq(2, 8)}"]`)?.getAttribute("aria-label")).toBe("Xe đỏ");

    solve(0);
    expect(tries()).toBe("2");
    expect(screen.getByText("2 sao")).toBeTruthy();
  });

  it("thử từ 4 lần trở lên chỉ còn 1 sao", () => {
    render(<PuzzleClient />);
    for (let i = 0; i < 3; i++) {
      tap(...WRONG.from);
      tap(...WRONG.to);
      act(() => vi.advanceTimersByTime(1200));
    }
    solve(0);
    expect(tries()).toBe("4");
    expect(screen.getByText("1 sao")).toBeTruthy();
  });

  it("dùng gợi ý thì không được 3 sao dù đúng ngay lần đầu", () => {
    render(<PuzzleClient />);
    const hint = screen.getByRole("button", { name: "Gợi ý" }) as HTMLButtonElement;
    fireEvent.click(hint);
    expect(status()).toBe(`Gợi ý: ${PUZZLES[0].hint}`);
    expect(hint.disabled).toBe(true);
    solve(0);
    expect(screen.getByText("2 sao")).toBeTruthy();
  });

  it("'Đặt lại' đưa bàn cờ về thế ban đầu (kể cả đang chờ sau nước sai)", () => {
    render(<PuzzleClient />);
    tap(...WRONG.from);
    tap(...WRONG.to);
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại" }));
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    act(() => vi.advanceTimersByTime(5000));
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
  });

  it("'Thế tiếp theo' mở thế sau; thế cuối không còn nút này", () => {
    render(<PuzzleClient />);
    for (let i = 0; i < PUZZLES.length; i++) {
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PUZZLES[i].title);
      solve(i);
      const next = screen.queryByRole("button", { name: "Thế tiếp theo" });
      if (i < PUZZLES.length - 1) fireEvent.click(next!);
      else expect(next).toBeNull();
    }
    const nav = screen.getByRole("navigation", { name: "Danh sách thế cờ" });
    expect(within(nav).getAllByText("Đã giải")).toHaveLength(PUZZLES.length);
  });

  it("chọn thế trong danh sách; thế mới bắt đầu sạch (không giữ quân đã chọn, gợi ý)", () => {
    render(<PuzzleClient />);
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý" }));
    tap(2, 8);
    fireEvent.click(listItem(PUZZLES[1].title));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(PUZZLES[1].title);
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    expect(targets()).toEqual([]);
    expect(tries()).toBe("0");
  });

  it("'Chơi lại' sau khi giải xong cho giải lại thế đó", () => {
    render(<PuzzleClient />);
    solve(0);
    fireEvent.click(screen.getByRole("button", { name: "Chơi lại" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(status()).toBe("Đến lượt Đỏ. Chọn quân để bắt đầu.");
    expect(within(listItem(PUZZLES[0].title)).getByText("Đã giải")).toBeTruthy();
  });
});
