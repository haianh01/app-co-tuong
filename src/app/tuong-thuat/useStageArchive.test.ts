// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueOffline,
  flushOfflineQueue,
  newStageGameId,
  readOfflineQueue,
  useStageArchive,
  type StageGamePayload,
} from "./useStageArchive";

describe("useStageArchive utilities & queue", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("newStageGameId sinh ID 12 ký tự bắt đầu bằng stg_", () => {
    const id = newStageGameId();
    expect(id).toHaveLength(12);
    expect(id.startsWith("stg_")).toBe(true);
    expect(newStageGameId()).not.toBe(newStageGameId());
  });

  it("quản lý hàng đợi offline qua localStorage", () => {
    expect(readOfflineQueue()).toEqual([]);

    const sample: StageGamePayload = {
      id: "stg_12345678",
      room: "room_test_12345678",
      site: "manual",
      round: 1,
      playedOn: "2026-10-22",
      mySide: "r",
      me: { name: "Bạn" },
      opponent: { name: "Đối thủ" },
      result: "win",
      resultSource: "manual",
      startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
      moves: [{ from: 24, to: 25, notation: "P2-5" }],
      plies: 6,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    enqueueOffline(sample);
    expect(readOfflineQueue()).toHaveLength(1);
    expect(readOfflineQueue()[0].id).toBe("stg_12345678");

    enqueueOffline({ ...sample, plies: 10 });
    expect(readOfflineQueue()).toHaveLength(1);
    expect(readOfflineQueue()[0].plies).toBe(10);
  });

  it("flushOfflineQueue gửi lại các ván chưa gửi thành công và dọn sạch hàng đợi", async () => {
    const sample: StageGamePayload = {
      id: "stg_queued",
      room: "room_test_12345678",
      site: "manual",
      playedOn: "2026-10-22",
      mySide: "r",
      me: { name: "Bạn" },
      opponent: { name: "Đối thủ" },
      result: null,
      resultSource: null,
      startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
      moves: [],
      plies: 6,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    enqueueOffline(sample);
    expect(readOfflineQueue()).toHaveLength(1);

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = mockFetch;

    await flushOfflineQueue();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(readOfflineQueue()).toHaveLength(0);
  });

  it("flushOfflineQueue giữ lại ván trong hàng đợi nếu server vẫn lỗi", async () => {
    const sample: StageGamePayload = {
      id: "stg_fail",
      room: "room_test_12345678",
      site: "manual",
      playedOn: "2026-10-22",
      mySide: "r",
      me: { name: "Bạn" },
      opponent: { name: "Đối thủ" },
      result: null,
      resultSource: null,
      startFen: "fen",
      moves: [],
      plies: 6,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    };

    enqueueOffline(sample);

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network Error"));
    global.fetch = mockFetch;

    await flushOfflineQueue();

    expect(readOfflineQueue()).toHaveLength(1);
    expect(readOfflineQueue()[0].id).toBe("stg_fail");
  });
});

describe("useStageArchive hook", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("ván dưới 6 nước: saveNow bỏ qua không gửi", async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const { result } = renderHook(() =>
      useStageArchive({
        room: "my-valid-room-1234",
        site: "manual",
        round: 1,
        mySide: "r",
        me: { name: "Streamer" },
        opponent: { name: "Guest" },
        moves: [{ move: { from: 24, to: 25 } }],
        roundResult: null,
        onBoardResult: null,
      }),
    );

    let saved = false;
    await act(async () => {
      saved = await result.current.saveNow();
    });

    expect(saved).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("ván từ 6 nước: saveNow lưu thành công và cập nhật status=saved", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = mockFetch;

    const moves = [1, 2, 3, 4, 5, 6].map((i) => ({ move: { from: i, to: i + 1 }, notation: `Move${i}` }));

    const { result } = renderHook(() =>
      useStageArchive({
        room: "my-valid-room-1234",
        site: "manual",
        round: 3,
        mySide: "r",
        me: { name: "Streamer" },
        opponent: { name: "Guest" },
        moves,
        roundResult: "win",
        onBoardResult: null,
      }),
    );

    let saved = false;
    await act(async () => {
      saved = await result.current.saveNow();
    });

    expect(saved).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
    expect(result.current.savedRound).toBe(3);

    // Kiểm tra payload gửi đi
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.id).toBe(result.current.gameId);
    expect(body.round).toBe(3);
    expect(body.result).toBe("win");
    expect(body.plies).toBe(6);
  });

  it("newGame tạo gameId mới và reset trạng thái", async () => {
    const { result } = renderHook(() =>
      useStageArchive({
        room: "my-valid-room-1234",
        site: "manual",
        round: 1,
        mySide: "r",
        me: { name: "Streamer" },
        opponent: { name: "Guest" },
        moves: [],
        roundResult: null,
      }),
    );

    const firstId = result.current.gameId;

    act(() => {
      result.current.newGame();
    });

    expect(result.current.gameId).not.toBe(firstId);
    expect(result.current.status).toBe("idle");
  });
  it("tự động chạy phân tích nền sau khi lưu ván thành công (khi có fens >= 7)", async () => {
    const ndjson = [
      JSON.stringify({ index: 0, total: 7, eval: { score: 10 } }),
      JSON.stringify({ index: 6, total: 7, eval: { score: 50 } }),
    ].join("\n") + "\n";

    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/tuong-thuat/games")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes("/api/engine/batch")) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(ndjson));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });
    global.fetch = mockFetch;

    const moves = [1, 2, 3, 4, 5, 6].map((i) => ({ move: { from: i, to: i + 1 } }));
    const fens = ["fen0", "fen1", "fen2", "fen3", "fen4", "fen5", "fen6"];

    const { result } = renderHook(() =>
      useStageArchive({
        room: "my-valid-room-1234",
        site: "manual",
        round: 5,
        mySide: "r",
        me: { name: "Streamer" },
        opponent: { name: "Guest" },
        moves,
        fens,
        roundResult: "win",
        onBoardResult: null,
      }),
    );

    await act(async () => {
      await result.current.saveNow();
    });

    // Chờ stream phân tích xử lý
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.analysisStatus).toBe("done");
    expect(result.current.analysisProgress).toBe(100);
    expect(result.current.analyzedRound).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/engine/batch",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Stage-Room": "my-valid-room-1234" }),
      }),
    );
  });

});
