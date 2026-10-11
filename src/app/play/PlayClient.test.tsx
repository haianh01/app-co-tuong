// Đánh với máy: hết ván thì có AI phân tích ván ngay tại chỗ.

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findBestMove, type AiLevel, type SearchOverrides } from "@/lib/xiangqi/ai";
import { parseFen, sq } from "@/lib/xiangqi/engine";
import { PlayClient } from "./PlayClient";

vi.mock("@/components/session/SessionProvider", () => ({ useSession: () => ({ user: undefined, setUser: () => {}, refresh: () => {} }) }));
vi.mock("@/hooks/useGameSounds", () => ({ useMoveSounds: () => {}, useResultSound: () => {} }));
// AI thật chạy trong luồng test thay cho Web Worker, độ sâu giới hạn để test nhẹ.
vi.mock("@/hooks/useAiWorker", () => ({
  useAiWorker: () => async (fen: string, level: AiLevel, overrides?: SearchOverrides) =>
    findBestMove(parseFen(fen), level, () => 0, { depth: 2, ...overrides, timeMs: 60_000 }),
}));

function tap(r: number, c: number) {
  fireEvent.click(document.querySelector<HTMLElement>(`button[data-square="${sq(r, c)}"]`)!);
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/play");
});

describe("PlayClient – phân tích sau ván", () => {
  it("chỉ hiện phân tích khi hết ván, chạy được trên ván vừa đánh", async () => {
    render(<PlayClient initial={{ level: 1, side: "r", minutes: 0 }} />);
    expect(screen.queryByRole("button", { name: "Phân tích ván" })).toBeNull();

    tap(7, 7); // Pháo 2
    tap(7, 4); // bình 5
    await screen.findByText("Đến lượt bạn", {}, { timeout: 10_000 });
    expect(screen.queryByRole("button", { name: "Phân tích ván" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Xin thua" }));
    fireEvent.click(screen.getByRole("button", { name: "Phân tích ván" }));
    await screen.findByText(/Độ chính xác Đỏ/, {}, { timeout: 10_000 });
  });
});

describe("PlayClient – bảng kết quả", () => {
  it("đóng được bảng kết quả để xem bàn cờ, ván vẫn kết thúc", () => {
    render(<PlayClient initial={{ level: 1, side: "r", minutes: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Xin thua" }));
    expect(screen.getByRole("button", { name: "Xem bàn cờ" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xem bàn cờ" }));
    expect(screen.queryByRole("button", { name: "Xem bàn cờ" })).toBeNull();
    // Bảng kết quả đã đóng nhưng ván vẫn kết thúc: không xin thua lại được, vẫn mở được phân tích.
    expect(screen.getByRole("button", { name: "Xin thua" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Phân tích ván" })).toBeTruthy();
  });
});
