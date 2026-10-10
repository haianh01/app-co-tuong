// Kết nối WebSocket tới server game: trạng thái, nhận/gửi tin, tự kết nối lại khi rớt mạng.
// WebSocket được thay bằng lớp giả để điều khiển từng sự kiện; đồng hồ giả cho thời gian chờ kết nối lại.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientMessage, ServerMessage } from "@/lib/online/protocol";
import { useSocket } from "./useSocket";

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  // Điều khiển từ test:
  open() {
    act(() => {
      this.readyState = FakeSocket.OPEN;
      this.onopen?.();
    });
  }

  receive(data: unknown) {
    act(() => this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) }));
  }

  drop() {
    act(() => this.close());
  }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
});

function setup(onOpen?: (send: (m: ClientMessage) => void) => void) {
  const onMessage = vi.fn<(msg: ServerMessage, at: number) => void>();
  const hook = renderHook(() => useSocket({ onMessage, onOpen }));
  return { ...hook, onMessage };
}

describe("useSocket", () => {
  it("kết nối tới /ws cùng host, trạng thái connecting → open", () => {
    const { result } = setup();
    expect(FakeSocket.all).toHaveLength(1);
    expect(last().url).toBe(`ws://${location.host}/ws`);
    expect(result.current.status).toBe("connecting");
    last().open();
    expect(result.current.status).toBe("open");
  });

  it("trang HTTPS thì dùng wss://", () => {
    vi.stubGlobal("location", { protocol: "https:", host: "kydai.vn" });
    setup();
    expect(last().url).toBe("wss://kydai.vn/ws");
  });

  it("gọi onOpen mỗi lần kết nối được (để gửi lại 'watch')", () => {
    const onOpen = vi.fn((send: (m: ClientMessage) => void) => send({ t: "watch", gameId: "abcdef12" }));
    setup(onOpen);
    last().open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(last().sent).toEqual([JSON.stringify({ t: "watch", gameId: "abcdef12" })]);
  });

  it("chuyển tin nhận được (đã parse JSON) kèm thời điểm nhận", () => {
    const { onMessage } = setup();
    last().open();
    vi.advanceTimersByTime(1234);
    last().receive({ t: "stats", stats: { online: 3, playing: 1 } });
    expect(onMessage).toHaveBeenCalledWith({ t: "stats", stats: { online: 3, playing: 1 } }, expect.any(Number));
    expect(onMessage.mock.calls[0][1]).toBeGreaterThanOrEqual(1234);
  });

  it("bỏ qua tin không phải JSON thay vì làm sập trang", () => {
    const { onMessage } = setup();
    last().open();
    last().receive("không phải json{");
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("chỉ gửi khi đã kết nối", () => {
    const { result } = setup();
    result.current.send({ t: "cancelQueue" });
    expect(last().sent).toEqual([]);
    last().open();
    result.current.send({ t: "cancelQueue" });
    expect(last().sent).toEqual([JSON.stringify({ t: "cancelQueue" })]);
  });

  it("rớt mạng thì kết nối lại, thời gian chờ tăng dần 0,5s → 1s → 2s … tối đa 10s", () => {
    const { result } = setup();
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      last().drop();
      expect(result.current.status).toBe("closed");
      const before = FakeSocket.all.length;
      let waited = 0;
      while (FakeSocket.all.length === before) {
        act(() => vi.advanceTimersByTime(100));
        waited += 100;
      }
      waits.push(waited);
      expect(result.current.status).toBe("connecting");
    }
    expect(waits).toEqual([500, 1000, 2000, 4000, 8000, 10_000, 10_000]);
  });

  it("kết nối lại thành công thì thời gian chờ quay về 0,5s", () => {
    setup();
    last().drop();
    act(() => vi.advanceTimersByTime(500));
    last().drop();
    act(() => vi.advanceTimersByTime(1000));
    last().open();
    last().drop();
    const before = FakeSocket.all.length;
    act(() => vi.advanceTimersByTime(499));
    expect(FakeSocket.all).toHaveLength(before);
    act(() => vi.advanceTimersByTime(1));
    expect(FakeSocket.all).toHaveLength(before + 1);
  });

  it("rời trang thì đóng kết nối và không kết nối lại", () => {
    const { unmount } = setup();
    last().open();
    unmount();
    expect(last().readyState).toBe(FakeSocket.CLOSED);
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("luôn dùng handler mới nhất sau khi component render lại", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook((p: { onMessage: (m: ServerMessage) => void }) => useSocket(p), {
      initialProps: { onMessage: first },
    });
    rerender({ onMessage: second });
    last().open();
    last().receive({ t: "notFound", gameId: "abcdef12" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
