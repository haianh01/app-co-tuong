import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistorySheet } from "./StageControls";

const ROOM = "phong-live-abcdef123456";
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const game = (id: string, round: number, opponent: string) => ({
  id,
  round,
  plies: 40,
  playedOn: today,
  endedAt: new Date().toISOString(),
  result: "win",
  opponent: { name: opponent },
});

describe("xoá ván trong Lịch sử trên sân khấu", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function openSheet(deleteStatus: number) {
    const deletes: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          deletes.push(url);
          return new Response("{}", { status: deleteStatus });
        }
        return new Response(JSON.stringify({ games: [game("stg_aaaaaaaa", 1, "Hùng"), game("stg_bbbbbbbb", 2, "Lan")] }));
      }),
    );
    render(<HistorySheet room={ROOM} onClose={() => {}} onOpen={() => {}} />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Ván 1 · vs Hùng/ }));
    });
    return deletes;
  }

  it("bấm 🗑 chưa xoá ngay, phải bấm Xoá hẳn; xoá xong ván biến khỏi danh sách", async () => {
    const deletes = await openSheet(200);

    fireEvent.click(screen.getByRole("button", { name: "Xoá ván này" }));
    expect(deletes).toEqual([]);

    // Đổi ý: Thôi thì quay về các nút cũ
    fireEvent.click(screen.getByRole("button", { name: "Thôi" }));
    expect(screen.getByRole("button", { name: "Phân tích ván này" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Xoá ván này" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xoá hẳn" }));
    });

    expect(deletes).toEqual([`/api/tuong-thuat/games/stg_aaaaaaaa?room=${ROOM}`]);
    expect(screen.queryByText(/vs Hùng/)).toBeNull();
    expect(screen.getByText(/vs Lan/)).toBeTruthy();
  });

  it("server lỗi thì giữ ván lại và báo không xoá được", async () => {
    await openSheet(500);
    fireEvent.click(screen.getByRole("button", { name: "Xoá ván này" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Xoá hẳn" }));
    });
    expect(screen.getByText("Không xoá được, thử lại")).toBeTruthy();
    expect(screen.getByText(/vs Hùng/)).toBeTruthy();
  });
});
