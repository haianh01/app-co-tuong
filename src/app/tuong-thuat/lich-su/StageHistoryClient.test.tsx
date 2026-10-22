import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StageHistoryClient } from "./StageHistoryClient";

describe("StageHistoryClient", () => {
  const sampleGames = [
    {
      id: "stg_001",
      ownerKey: "hash123",
      site: "ziga",
      round: 1,
      playedOn: "2026-10-22",
      mySide: "r",
      me: { name: "Bình luận viên", points: "1600" },
      opponent: { name: "KyThuZiga", points: "1580", title: "Tập Sự" },
      result: "win",
      resultSource: "manual",
      startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
      moves: [
        { from: 24, to: 25, notation: "P2-5" },
        { from: 72, to: 71, notation: "M8+7" },
        { from: 70, to: 67, notation: "M2+3" },
        { from: 26, to: 25, notation: "X9-8" },
        { from: 25, to: 24, notation: "X1-2" },
        { from: 71, to: 70, notation: "B7+1" },
      ],
      plies: 6,
      startedAt: "2026-10-22T08:00:00.000Z",
      endedAt: "2026-10-22T08:15:00.000Z",
    },
    {
      id: "stg_002",
      ownerKey: "hash123",
      site: "manual",
      round: 2,
      playedOn: "2026-10-22",
      mySide: "b",
      me: { name: "Bình luận viên", points: "1610" },
      opponent: { name: "CaoThuCo", points: "1720" },
      result: "loss",
      resultSource: "board",
      startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
      moves: [
        { from: 24, to: 25, notation: "P2-5" },
        { from: 72, to: 71, notation: "M8+7" },
      ],
      plies: 2,
      startedAt: "2026-10-22T08:30:00.000Z",
      endedAt: "2026-10-22T08:45:00.000Z",
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("tuong-thuat:stage-room", "test-room-key-12345");
    vi.restoreAllMocks();
  });

  it("tải và hiển thị danh sách ván cờ, thẻ thống kê và khai cuộc", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tuong-thuat/games")) {
        return new Response(JSON.stringify({ games: sampleGames }), { status: 200 });
      }
      return originalFetch(input);
    });

    render(<StageHistoryClient />);

    expect(screen.getByText(/Đang tải lịch sử ván cờ/i)).toBeTruthy();

    // Chờ tải xong
    await waitFor(() => {
      expect(screen.getByText(/KyThuZiga/i)).toBeTruthy();
    });

    // Thống kê
    expect(screen.getByText("2")).toBeTruthy(); // Tổng 2 ván
    expect(screen.getByText(/CaoThuCo/)).toBeTruthy();

    // Badge kết quả
    expect(screen.getByText("Bạn thắng")).toBeTruthy();
    expect(screen.getByText("Đối thủ thắng")).toBeTruthy();

    // Nhận diện khai cuộc (Pháo đầu)
    expect(screen.getAllByText(/Pháo đầu/i).length).toBeGreaterThan(0);
  });

  it("lọc danh sách theo kết quả Thắng", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("result=win")) {
        return new Response(JSON.stringify({ games: [sampleGames[0]] }), { status: 200 });
      }
      return new Response(JSON.stringify({ games: sampleGames }), { status: 200 });
    });
    global.fetch = fetchMock;

    render(<StageHistoryClient />);

    await waitFor(() => {
      expect(screen.getByText(/KyThuZiga/i)).toBeTruthy();
    });

    // Bấm nút Thắng
    const winBtn = screen.getByRole("button", { name: "Thắng" });
    fireEvent.click(winBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("result=win"),
        expect.anything(),
      );
    });
  });
});
