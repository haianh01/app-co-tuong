// Huấn luyện khi đánh với máy: chấm ngay từng nước của người chơi bằng AI thật (chạy trong luồng test thay cho worker).

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { findBestMove, type AiLevel, type SearchOverrides } from "@/lib/xiangqi/ai";
import { parseFen, sq } from "@/lib/xiangqi/engine";
import { replayMoves } from "@/lib/xiangqi/game";
import { LiveCoach } from "./LiveCoach";

vi.mock("@/hooks/useEngine", () => ({
  useEngine: () => async (fen: string, level: AiLevel, overrides?: SearchOverrides) =>
    findBestMove(parseFen(fen), level, () => 0, { ...overrides, timeMs: 60_000 }),
}));

const FEN = "2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w";

/** Lời bình đổi cách diễn đạt theo từng nước, nên chỉ kiểm tra đoạn lời bình có đủ các dữ kiện bắt buộc. */
const note = (...parts: string[]) => (_: string, el: Element | null) =>
  el?.tagName === "P" && parts.every((p) => el.textContent!.includes(p));

describe("LiveCoach", () => {
  it("chưa đi nước nào thì chỉ có lời dẫn", () => {
    render(<LiveCoach state={replayMoves([], FEN)} player="r" />);
    expect(screen.getByText(/Mỗi nước bạn đi sẽ được AI chấm/)).toBeTruthy();
  });

  it("nước hớ của người chơi được chấm và giải thích ngay, nước của máy thì không", async () => {
    // Bạn (Đỏ) đẩy Pháo vào chỗ bị Xe ăn; máy (Đen) đáp bằng một nước Tốt.
    const state = replayMoves([{ from: sq(7, 0), to: sq(5, 0) }, { from: sq(3, 4), to: sq(4, 4) }], FEN);
    render(<LiveCoach state={state} player="r" />);
    expect(await screen.findByText("Nước hớ", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(note("Pháo", "Xe đen", "X1.1", "ăn"))).toBeTruthy();
    // Nước của máy không có mục chấm riêng, chỉ xuất hiện như nước đáp thực tế để đối chiếu với biến AI dự tính
    expect(screen.queryByText(/\d+\.\s*B5\.1/)).toBeNull();
    expect(screen.getByText(/thực tế đối phương đi/).textContent).toContain("B5.1");
  });

  it("đi đúng nước AI chọn thì được khen là nước tốt nhất", async () => {
    // Xe đen đứng ở ô không có gốc: Xe đỏ ăn không.
    const state = replayMoves([{ from: sq(5, 0), to: sq(3, 0) }], "2bakab2/9/9/r3p4/9/R8/4P4/9/9/2BAKAB2 w");
    render(<LiveCoach state={state} player="r" />);
    expect(await screen.findByText("Nước tốt nhất", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(/Độ chính xác 100%/)).toBeTruthy();
    // Nước tốt có ý đồ đã kiểm chứng (ăn quân thật) thì nêu ý đồ thay cho nhận xét nguyên lý chung chung.
    expect(screen.getByText(note("Ăn Xe"))).toBeTruthy();
  });

  it("cache kết quả theo cặp FEN: giữ nguyên kết quả nước cũ khi đi thêm nước mới", async () => {
    const m1 = { from: sq(7, 0), to: sq(5, 0) };
    const m2 = { from: sq(3, 4), to: sq(4, 4) };
    const state1 = replayMoves([m1, m2], FEN);
    const { rerender } = render(<LiveCoach state={state1} player="r" />);

    expect(await screen.findByText("Nước hớ", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(note("Pháo", "Xe đen", "X1.1", "ăn"))).toBeTruthy();

    // Đi thêm nước thứ 3 (Đỏ đi)
    const m3 = { from: sq(5, 0), to: sq(5, 1) };
    const state2 = replayMoves([m1, m2, m3], FEN);
    rerender(<LiveCoach state={state2} player="r" />);

    // Nước cũ vẫn hiển thị đúng từ cache
    expect(screen.getByText(note("Pháo", "Xe đen", "X1.1", "ăn"))).toBeTruthy();
  });

  it("máy đi hớ mà bạn ăn ngay: ghi nhận bạn đã trừng phạt sai lầm của máy", async () => {
    // 1. Tốt đỏ tiến; 2. Xe đen chạy vào ngay trước mặt Tốt; 3. Tốt đỏ ăn Xe.
    const state = replayMoves(
      [
        { from: sq(6, 4), to: sq(5, 4) },
        { from: sq(4, 0), to: sq(4, 4) },
        { from: sq(5, 4), to: sq(4, 4) },
      ],
      "2bakab2/9/9/9/r8/9/4P4/C8/9/2BAKAB2 w",
    );
    render(<LiveCoach state={state} player="r" />);
    expect(await screen.findByText(/Bạn trừng phạt ngay sai lầm/, {}, { timeout: 20_000 })).toBeTruthy();
  });
});
