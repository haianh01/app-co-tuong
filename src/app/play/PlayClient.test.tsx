// Đánh với máy: hết ván thì có AI phân tích ván ngay tại chỗ.

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findBestMove, type AiLevel, type SearchOverrides } from "@/lib/xiangqi/ai";
import { parseFen, sq } from "@/lib/xiangqi/engine";
import { PlayClient } from "./PlayClient";

vi.mock("@/components/session/SessionProvider", () => ({ useSession: () => ({ user: undefined, setUser: () => {}, refresh: () => {} }) }));
vi.mock("@/hooks/useGameSounds", () => ({ useMoveSounds: () => {}, useResultSound: () => {} }));
// AI thật chạy trong luồng test thay cho Web Worker, độ sâu giới hạn để test nhẹ.
const levelsAsked = vi.hoisted(() => [] as number[]);
vi.mock("@/hooks/useEngine", () => ({
  useEngine: () => async (fen: string, level: AiLevel, overrides?: SearchOverrides) => {
    levelsAsked.push(level);
    return findBestMove(parseFen(fen), level, () => 0, { depth: 2, ...overrides, timeMs: 60_000 });
  },
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

describe("PlayClient – gợi ý", () => {
  const START = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

  it("ván thường: gợi ý ở cấp Khó (4)", () => {
    levelsAsked.length = 0;
    render(<PlayClient initial={{ level: 1, side: "r", minutes: 0 }} />);
    const before = levelsAsked.length; // trang có thể tự hỏi engine (huấn luyện viên), chỉ xét lời gọi của nút
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý" }));
    expect(levelsAsked.slice(before)).toEqual([4]);
  });

  it("luyện thế từ bài giảng: gợi ý ở cấp mạnh nhất (5) dù đánh với máy cấp thấp", () => {
    levelsAsked.length = 0;
    render(<PlayClient initial={{ level: 1, side: "r", minutes: 0, fen: START, lesson: 1 }} />);
    const before = levelsAsked.length;
    fireEvent.click(screen.getByRole("button", { name: "Gợi ý" }));
    expect(levelsAsked.slice(before)).toEqual([5]);
  });
});

describe("PlayClient – quay lại trang với thế khác", () => {
  it("trang được giữ (Activity) nhưng URL nạp thế bài giảng mới thì bày ván mới theo thế đó", async () => {
    const { rerender } = render(<PlayClient initial={{ level: 1, side: "r", minutes: 0 }} />);
    tap(7, 7); // Pháo 2
    tap(7, 4); // bình 5: ván cũ có nước đi
    await screen.findByText("Đến lượt bạn", {}, { timeout: 10_000 });
    const label = (r: number, c: number) => document.querySelector(`button[data-square="${sq(r, c)}"]`)?.getAttribute("aria-label");
    expect(label(7, 4)).toBe("Pháo đỏ");
    expect(screen.queryByText(/Bài 1:/)).toBeNull();

    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    rerender(<PlayClient initial={{ level: 1, side: "r", minutes: 0, fen, lesson: 1 }} />);
    expect(screen.getByText(/Bài 1:/)).toBeTruthy();
    // Ván mới từ thế bài giảng: Pháo đỏ về lại h3, không còn nước Pháo bình 5 của ván cũ
    expect(label(7, 7)).toBe("Pháo đỏ");
    expect(label(7, 4)).toBeUndefined();
  });
});

describe("PlayClient – bảng kết quả", () => {
  it("đóng được bảng kết quả để xem bàn cờ, ván vẫn kết thúc", () => {
    render(<PlayClient initial={{ level: 1, side: "r", minutes: 0 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Xin thua" }));
    expect(screen.getByRole("button", { name: "Xem bàn cờ" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Xem bàn cờ" }));
    expect(screen.queryByRole("button", { name: "Xem bàn cờ" })).toBeNull();
    // Bảng kết quả đã đóng nhưng ván vẫn kết thúc: không xin thua lại được.
    expect(screen.getByRole("button", { name: "Xin thua" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("PlayClient – Phân tích hình cờ", () => {
  it("nút 'Phân tích hình cờ' luôn có sẵn và bấm vào mở modal", async () => {
    render(<PlayClient initial={{ level: 1, side: "r", minutes: 0 }} />);
    const btn = screen.getByRole("button", { name: "Phân tích hình cờ" });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("🔍 Phân tích hình cờ")).toBeTruthy();
  });
});

