import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageReviewControl } from "./StageReviewControl";

describe("StageReviewControl", () => {
  const sampleGame = {
    id: "stg_rev_1",
    ownerKey: "hash123",
    site: "ziga",
    round: 1,
    playedOn: "2026-10-22",
    mySide: "r",
    me: { name: "BLV", points: "1600" },
    opponent: { name: "KyThu", points: "1580" },
    result: "win",
    startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
    moves: [
      { from: 70, to: 67, notation: "P2-5" },
      { from: 1, to: 20, notation: "M8+7" },
    ],
    plies: 2,
  };

  const sampleAnalysis = [
    { score: 0, best: { from: 70, to: 67 }, depth: 10, pv: [] },
    { score: 350, best: { from: 1, to: 20 }, depth: 10, pv: [] },
    { score: -350, best: null, depth: 10, pv: [] },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("tải danh sách ván, hiển thị chi tiết và cho phép phát nước đi lên sân khấu", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tuong-thuat/games?room=room_123")) {
        return new Response(JSON.stringify({ games: [sampleGame] }), { status: 200 });
      }
      if (url.includes("/api/tuong-thuat/games/stg_rev_1")) {
        return new Response(JSON.stringify({ game: sampleGame, analysis: sampleAnalysis }), { status: 200 });
      }
      return originalFetch(input);
    });

    const onUpdateReview = vi.fn();

    render(
      <StageReviewControl
        room="room_123"
        currentReview={null}
        onUpdateReview={onUpdateReview}
      />
    );

    // Chờ tải xong danh sách và chi tiết ván
    await waitFor(() => {
      expect(screen.getByText(/Ván 1/i)).toBeTruthy();
    });

    // Bấm nút chiếu nước lên sân khấu
    const broadcastBtn = await screen.findByRole("button", { name: /Chiếu lên sân khấu/i });
    fireEvent.click(broadcastBtn);

    expect(onUpdateReview).toHaveBeenCalled();
    const sentReview = onUpdateReview.mock.calls[0][0];
    expect(sentReview).toMatchObject({
      gameId: "stg_rev_1",
      round: 1,
      totalPlies: 2,
    });
  });

  it("hỗ trợ nút tắt chiếu phân tích để trở về ván trực tiếp", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tuong-thuat/games?room=room_123")) {
        return new Response(JSON.stringify({ games: [sampleGame] }), { status: 200 });
      }
      if (url.includes("/api/tuong-thuat/games/stg_rev_1")) {
        return new Response(JSON.stringify({ game: sampleGame, analysis: sampleAnalysis }), { status: 200 });
      }
      return originalFetch(input);
    });

    const onUpdateReview = vi.fn();

    render(
      <StageReviewControl
        room="room_123"
        currentReview={{
          gameId: "stg_rev_1",
          round: 1,
          ply: 2,
          totalPlies: 2,
          board: new Array(90).fill(null),
          lastMove: null,
          evalScore: 350,
        }}
        onUpdateReview={onUpdateReview}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Tắt chiếu/i })).toBeTruthy();
    });

    const closeBtn = screen.getByRole("button", { name: /Tắt chiếu/i });
    fireEvent.click(closeBtn);

    expect(onUpdateReview).toHaveBeenCalledWith(null);
  });
});
