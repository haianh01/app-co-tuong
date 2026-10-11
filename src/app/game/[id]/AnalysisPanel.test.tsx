// Màn phân tích ván: chạy AI thật (trong luồng test thay cho Web Worker), bấm vào nước bị chấm để xem lời giải thích.

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findBestMove, type AiLevel, type SearchOverrides } from "@/lib/xiangqi/ai";
import { parseFen, sq } from "@/lib/xiangqi/engine";
import { replayMoves, type GameState } from "@/lib/xiangqi/game";
import { AnalysisPanel } from "./AnalysisPanel";

vi.mock("@/components/session/SessionProvider", () => ({ useSession: () => ({ user: undefined, setUser: () => {}, refresh: () => {} }) }));
// Bỏ giới hạn thời gian để kết quả không phụ thuộc tốc độ máy; độ sâu vẫn do màn phân tích quyết định.
vi.mock("@/hooks/useAiWorker", () => ({
  useAiWorker: () => async (fen: string, level: AiLevel, overrides?: SearchOverrides) =>
    findBestMove(parseFen(fen), level, () => 0, { ...overrides, timeMs: 60_000 }),
}));

/** Giữ nước đang xem như GameReplay: mở ở nước cuối, bấm vào nước bị chấm thì nhảy tới đó. */
function Harness({ state }: { state: GameState }) {
  const [ply, setPly] = useState(state.moves.length);
  return <AnalysisPanel state={state} ply={ply} onSelect={setPly} viewer="r" />;
}

beforeEach(() => {
  localStorage.clear();
});

describe("AnalysisPanel", () => {
  it("bấm vào nước hớ thì hiện lời giải thích của đúng nước đó", async () => {
    // Đỏ đẩy Pháo vào chỗ bị Xe ăn; Đen không ăn mà lại đẩy Tốt.
    const state = replayMoves(
      [{ from: sq(7, 0), to: sq(5, 0) }, { from: sq(3, 4), to: sq(4, 4) }],
      "2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w",
    );
    render(<Harness state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "Phân tích ván" }));

    const red = await screen.findByRole("button", { name: /1\. Đỏ P9\.2/ });
    const black = screen.getByRole("button", { name: /1\. Đen B5\.1/ });
    // Như màn xem lại ván: bàn cờ đang ở nước cuối nên lời giải thích của nước đó hiện sẵn.
    expect(screen.getByText("Nên đi X1.1 ăn Pháo đỏ.")).toBeTruthy();
    expect(screen.queryByText(/Pháo đi vào ô bị Xe đen ăn/)).toBeNull();

    fireEvent.click(red);
    expect(screen.getByText("Pháo đi vào ô bị Xe đen ăn mà không có quân bảo vệ. Đen đáp X1.1 ăn không Pháo.")).toBeTruthy();
    expect(screen.queryByText("Nên đi X1.1 ăn Pháo đỏ.")).toBeNull();

    fireEvent.click(black);
    expect(screen.getByText("Nên đi X1.1 ăn Pháo đỏ.")).toBeTruthy();
  });
});
