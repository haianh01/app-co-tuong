import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageReplayClient } from "./StageReplayClient";

vi.mock("@/components/session/SessionProvider", () => ({ useSession: () => ({ user: undefined, setUser: () => {}, refresh: () => {} }) }));
vi.mock("@/hooks/useEngine", () => ({
  useEngine: () => async () => null,
}));

describe("StageReplayClient", () => {
  const sampleGame = {
    id: "stg_replay_1",
    ownerKey: "hash123",
    site: "ziga",
    round: 1,
    playedOn: "2026-10-22",
    mySide: "r",
    me: { name: "Bình luận viên", points: "1600" },
    opponent: { name: "KyThuZiga", points: "1580" },
    result: "win",
    resultSource: "manual",
    startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
    moves: [
      { from: 70, to: 67, notation: "P2-5" },
      { from: 1, to: 20, notation: "M8+7" },
    ],
    plies: 2,
    startedAt: "2026-10-22T08:00:00.000Z",
    endedAt: "2026-10-22T08:15:00.000Z",
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("tuong-thuat:stage-room", "test-room-key-12345");
    vi.restoreAllMocks();
  });

  it("tải ván cờ, hiển thị bàn cờ, thông tin hai bên và điều khiển nước đi", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tuong-thuat/games/stg_replay_1")) {
        return new Response(
          JSON.stringify({
            game: sampleGame,
            analysis: null,
          }),
          { status: 200 },
        );
      }
      return originalFetch(input);
    });

    render(<StageReplayClient id="stg_replay_1" />);

    expect(screen.getByText(/Đang tải thông tin ván cờ/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/KyThuZiga/i)).toBeTruthy();
    });

    expect(screen.getByText(/Bình luận viên/i)).toBeTruthy();
    expect(screen.getByText(/2 \/ 2/i)).toBeTruthy(); // Mặc định ở nước cuối (2/2)

    // Bấm nút lùi nước
    const prevBtn = screen.getByRole("button", { name: /Nước trước/i });
    fireEvent.click(prevBtn);

    expect(screen.getByText(/1 \/ 2/i)).toBeTruthy();

    // Bấm nút về nước đầu
    const firstBtn = screen.getByRole("button", { name: /Về nước đầu tiên/i });
    fireEvent.click(firstBtn);

    expect(screen.getByText(/0 \/ 2/i)).toBeTruthy();
    expect(screen.getByText(/Thế cờ xuất phát/i)).toBeTruthy();
  });
  it("bấm chiếu lên sân khấu thì gửi thế cờ đang xem dưới dạng review, lùi nước thì sân khấu lùi theo", async () => {
    const sent: string[] = [];
    class FakeSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      constructor() {
        queueMicrotask(() => this.onopen?.());
      }
      send(text: string) {
        sent.push(text);
      }
      close() {}
    }
    vi.stubGlobal("WebSocket", FakeSocket);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ game: sampleGame, analysis: null }), { status: 200 }));

    render(<StageReplayClient id="stg_replay_1" />);
    const btn = await screen.findByRole("button", { name: /Chiếu lên sân khấu/i });
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
    expect(sent).toHaveLength(0);

    fireEvent.click(btn);
    const lastReview = () => JSON.parse(sent[sent.length - 1]).state.review;
    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    expect(lastReview()).toMatchObject({ gameId: "stg_replay_1", ply: 2, totalPlies: 2, commentary: "Nước 2: M2.3" });

    fireEvent.click(screen.getByRole("button", { name: /Nước trước/i }));
    await waitFor(() => expect(lastReview().ply).toBe(1));
    vi.unstubAllGlobals();
  });
});
