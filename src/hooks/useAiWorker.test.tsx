// Gọi AI trong Web Worker: gửi đúng yêu cầu, ghép đúng câu trả lời theo id, dọn worker khi rời trang.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAiWorker } from "./useAiWorker";

class FakeWorker {
  static all: FakeWorker[] = [];
  posted: { id: number; fen: string; level: number }[] = [];
  terminated = false;
  private listeners = new Set<(e: MessageEvent) => void>();

  constructor(readonly url: URL, readonly options: WorkerOptions) {
    FakeWorker.all.push(this);
  }

  postMessage(data: { id: number; fen: string; level: number }) {
    this.posted.push(data);
  }

  addEventListener(_type: "message", fn: (e: MessageEvent) => void) {
    this.listeners.add(fn);
  }

  removeEventListener(_type: "message", fn: (e: MessageEvent) => void) {
    this.listeners.delete(fn);
  }

  terminate() {
    this.terminated = true;
  }

  reply(data: unknown) {
    for (const fn of [...this.listeners]) fn({ data } as MessageEvent);
  }

  get listenerCount() {
    return this.listeners.size;
  }
}

beforeEach(() => {
  FakeWorker.all = [];
  vi.stubGlobal("Worker", FakeWorker);
});

const MOVE = { from: 70, to: 67 };

describe("useAiWorker", () => {
  it("tạo một worker dạng module chạy file ai.worker", () => {
    renderHook(() => useAiWorker());
    expect(FakeWorker.all).toHaveLength(1);
    expect(new URL(FakeWorker.all[0].url).pathname).toMatch(/\/lib\/xiangqi\/ai\.worker\.ts$/);
    expect(FakeWorker.all[0].options).toEqual({ type: "module" });
  });

  it("gửi fen + cấp độ, nhận lại đúng kết quả", async () => {
    const { result } = renderHook(() => useAiWorker());
    const w = FakeWorker.all[0];
    const promise = result.current("fen-1", 3);
    expect(w.posted).toEqual([{ id: 1, fen: "fen-1", level: 3 }]);
    w.reply({ id: 1, move: MOVE, score: 10, depth: 3, nodes: 100 });
    await expect(promise).resolves.toMatchObject({ move: MOVE, depth: 3 });
    expect(w.listenerCount).toBe(0);
  });

  it("nhiều yêu cầu cùng lúc: mỗi lời gọi nhận đúng câu trả lời của mình", async () => {
    const { result } = renderHook(() => useAiWorker());
    const w = FakeWorker.all[0];
    const a = result.current("fen-a", 1);
    const b = result.current("fen-b", 5);
    w.reply({ id: 2, move: { from: 1, to: 2 } });
    w.reply({ id: 1, move: { from: 3, to: 4 } });
    await expect(a).resolves.toMatchObject({ move: { from: 3, to: 4 } });
    await expect(b).resolves.toMatchObject({ move: { from: 1, to: 2 } });
  });

  it("hàm think giữ nguyên qua các lần render (không làm effect chạy lại)", () => {
    const { result, rerender } = renderHook(() => useAiWorker());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(FakeWorker.all).toHaveLength(1);
  });

  it("rời trang thì hủy worker; gọi sau đó bị từ chối", async () => {
    const { result, unmount } = renderHook(() => useAiWorker());
    const think = result.current;
    unmount();
    expect(FakeWorker.all[0].terminated).toBe(true);
    await expect(think("fen", 2)).rejects.toThrow(/chưa sẵn sàng/);
  });
});
