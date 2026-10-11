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
    expect(screen.getByText("Pháo đi vào ô bị Xe đen ăn mà không có quân bảo vệ. Đen đáp X1.1 ăn không Pháo.")).toBeTruthy();
    expect(screen.queryByText(/B5\.1/)).toBeNull();
  });

  it("đi đúng nước AI chọn thì được khen là nước tốt nhất", async () => {
    // Xe đen đứng ở ô không có gốc: Xe đỏ ăn không.
    const state = replayMoves([{ from: sq(5, 0), to: sq(3, 0) }], "2bakab2/9/9/r3p4/9/R8/4P4/9/9/2BAKAB2 w");
    render(<LiveCoach state={state} player="r" />);
    expect(await screen.findByText("Nước tốt nhất", {}, { timeout: 10_000 })).toBeTruthy();
    expect(screen.getByText(/Độ chính xác 100%/)).toBeTruthy();
    // Nước tốt vẫn có nhận xét chiến lược.
    expect(screen.getByText(/^Kế hoạch: .+X9\.2/)).toBeTruthy();
  });
});
