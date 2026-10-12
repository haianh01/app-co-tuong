// Màn phân tích ván: chạy AI thật (trong luồng test thay cho Web Worker), bấm vào nước bị chấm để xem lời giải thích.

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findBestMove, type AiLevel, type SearchOverrides } from "@/lib/xiangqi/ai";
import { parseFen, sq } from "@/lib/xiangqi/engine";
import { replayMoves, type GameState } from "@/lib/xiangqi/game";
import { AnalysisPanel, type AnalysisUpdateInfo } from "./AnalysisPanel";

vi.mock("@/components/session/SessionProvider", () => ({ useSession: () => ({ user: undefined, setUser: () => {}, refresh: () => {} }) }));
// Bỏ giới hạn thời gian để kết quả không phụ thuộc tốc độ máy; độ sâu vẫn do màn phân tích quyết định.
vi.mock("@/hooks/useEngine", () => ({
  useEngine: () => async (fen: string, level: AiLevel, overrides?: SearchOverrides) =>
    findBestMove(parseFen(fen), level, () => 0, { ...overrides, timeMs: 60_000 }),
}));

/** Giữ nước đang xem như GameReplay: mở ở nước cuối, bấm vào nước bị chấm thì nhảy tới đó. */
function Harness({ state, onUpdate }: { state: GameState; onUpdate?: (info: AnalysisUpdateInfo) => void }) {
  const [ply, setPly] = useState(state.moves.length);
  return <AnalysisPanel state={state} ply={ply} onSelect={setPly} viewer="r" onAnalysisUpdate={onUpdate} />;
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

    const red = await screen.findByRole("button", { name: /1\. Đỏ P9\.2/ }, { timeout: 5000 });
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

  it("nhận kết quả từ stream NDJSON của /api/engine/batch", async () => {
    const state = replayMoves(
      [{ from: sq(7, 0), to: sq(5, 0) }, { from: sq(3, 4), to: sq(4, 4) }],
      "2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w",
    );

    const ndjsonLines = [
      JSON.stringify({ index: 0, total: 3, eval: { score: 0, best: { from: sq(7, 0), to: sq(0, 0) }, depth: 10, pv: [] } }),
      JSON.stringify({ index: 1, total: 3, eval: { score: 450, best: { from: sq(4, 0), to: sq(5, 0) }, depth: 10, pv: [] } }),
      JSON.stringify({ index: 2, total: 3, eval: { score: -450, best: null, depth: 10, pv: [] } }),
    ].join("\n") + "\n";

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/engine/batch")) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(ndjsonLines));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        });
      }
      return originalFetch(input);
    });

    try {
      render(<Harness state={state} />);
      fireEvent.click(screen.getByRole("button", { name: "Phân tích ván" }));

      const red = await screen.findByRole("button", { name: /1\. Đỏ P9\.2/ });
      expect(red).toBeTruthy();
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/engine/batch", expect.anything());
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("hỗ trợ biểu đồ điểm, chuyển bước ngoặt và đi thử biến tiếp diễn", async () => {
    const state = replayMoves(
      [{ from: sq(7, 0), to: sq(5, 0) }, { from: sq(3, 4), to: sq(4, 4) }],
      "2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w",
    );

    const onUpdate = vi.fn();
    render(<Harness state={state} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Phân tích ván" }));

    const red = await screen.findByRole("button", { name: /1\. Đỏ P9\.2/ }, { timeout: 5000 });
    expect(red).toBeTruthy();

    // 1. Biểu đồ điểm cả ván hiện diện
    const chart = screen.getByRole("img", { name: /Biểu đồ điểm/i });
    expect(chart).toBeTruthy();

    // 2. Tóm tắt 3 bước ngoặt
    const tpCard = screen.getByRole("button", { name: /Bước ngoặt #1/i });
    expect(tpCard).toBeTruthy();
    fireEvent.click(tpCard);
    expect(screen.getByText("Pháo đi vào ô bị Xe đen ăn mà không có quân bảo vệ. Đen đáp X1.1 ăn không Pháo.")).toBeTruthy();

    // 3. Đi thử biến tiếp diễn
    const tryBtn = screen.getByRole("button", { name: /Đi thử biến này/i });
    fireEvent.click(tryBtn);

    expect(screen.getByText(/Đang đi thử biến tiếp diễn/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Lùi/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tiến/i })).toBeTruthy();

    // Thoát đi thử
    fireEvent.click(screen.getByRole("button", { name: /Thoát đi thử/i }));
    expect(screen.queryByText(/Đang đi thử biến tiếp diễn/i)).toBeNull();

    // 4. Callback onAnalysisUpdate đã được gọi để gửi arrows / preview lên component cha
    expect(onUpdate).toHaveBeenCalled();
  });

  it("hiển thị ngay phân tích khi nhận initialAnalysis từ SSR", async () => {
    const state = replayMoves(
      [{ from: sq(7, 0), to: sq(5, 0) }, { from: sq(3, 4), to: sq(4, 4) }],
      "2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w",
    );
    const initialEvals = [
      { score: 0, best: { from: sq(7, 0), to: sq(0, 0) } },
      { score: 450, best: { from: sq(4, 0), to: sq(5, 0) } },
      { score: -450, best: null },
    ];

    render(
      <AnalysisPanel
        state={state}
        ply={2}
        onSelect={() => {}}
        viewer="r"
        initialAnalysis={initialEvals}
      />,
    );

    // Không cần bấm "Phân tích ván", danh sách nước cờ đã có sẵn ngay lập tức
    const red = await screen.findByRole("button", { name: /1\. Đỏ P9\.2/ });
    expect(red).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Phân tích ván" })).toBeNull();
  });

  it("tự động tải phân tích đã lưu qua GET /api/game/[id]/analysis khi có gameId", async () => {
    const state = replayMoves(
      [{ from: sq(7, 0), to: sq(5, 0) }, { from: sq(3, 4), to: sq(4, 4) }],
      "2bakab2/9/9/4p4/r8/9/4P4/C8/9/2BAKAB2 w",
    );
    const savedEvals = [
      { score: 0, best: { from: sq(7, 0), to: sq(0, 0) } },
      { score: 450, best: { from: sq(4, 0), to: sq(5, 0) } },
      { score: -450, best: null },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/game/game123/analysis")) {
        return Response.json({
          analyzed: true,
          evals: savedEvals,
        });
      }
      return originalFetch(input);
    });

    try {
      render(
        <AnalysisPanel
          gameId="game123"
          state={state}
          ply={2}
          onSelect={() => {}}
          viewer="r"
        />,
      );

      // Tự động load và hiển thị nước cờ
      const red = await screen.findByRole("button", { name: /1\. Đỏ P9\.2/ });
      expect(red).toBeTruthy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
