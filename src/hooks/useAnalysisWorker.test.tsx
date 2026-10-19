// Hook useAnalysisWorker: chạy reviewGame trong worker, gom đúng id, dọn worker khi unmount.

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewResult } from "@/lib/xiangqi/analysis";
import { replayMoves } from "@/lib/xiangqi/game";
import { useAnalysisWorker } from "./useAnalysisWorker";

class FakeAnalysisWorker {
  static all: FakeAnalysisWorker[] = [];
  posted: unknown[] = [];
  terminated = false;
  private messageListeners = new Set<(e: MessageEvent) => void>();
  private errorListeners = new Set<(e: Event) => void>();

  constructor(readonly url: URL, readonly options: WorkerOptions) {
    FakeAnalysisWorker.all.push(this);
  }

  postMessage(data: unknown) {
    this.posted.push(data);
  }

  addEventListener(type: string, fn: ((e: MessageEvent) => void) & ((e: Event) => void)) {
    if (type === "message") this.messageListeners.add(fn);
    if (type === "error") this.errorListeners.add(fn);
  }

  removeEventListener(type: string, fn: ((e: MessageEvent) => void) & ((e: Event) => void)) {
    if (type === "message") this.messageListeners.delete(fn);
    if (type === "error") this.errorListeners.delete(fn);
  }

  terminate() {
    this.terminated = true;
  }

  reply(data: unknown) {
    for (const fn of [...this.messageListeners]) fn({ data } as MessageEvent);
  }

  emitError() {
    for (const fn of [...this.errorListeners]) fn(new Event("error"));
  }

  get listenerCount() {
    return this.messageListeners.size + this.errorListeners.size;
  }
}

beforeEach(() => {
  FakeAnalysisWorker.all = [];
  vi.stubGlobal("Worker", FakeAnalysisWorker);
});

describe("useAnalysisWorker", () => {
  it("tạo worker chạy file analysis.worker.ts", () => {
    renderHook(() => useAnalysisWorker());
    expect(FakeAnalysisWorker.all).toHaveLength(1);
    expect(new URL(FakeAnalysisWorker.all[0].url).pathname).toMatch(/\/lib\/xiangqi\/analysis\.worker\.ts$/);
  });

  it("gửi state + evals, nhận lại ReviewResult theo đúng id", async () => {
    const { result } = renderHook(() => useAnalysisWorker());
    const w = FakeAnalysisWorker.all[0];
    const state = replayMoves([]);
    const promise = result.current(state, []);
    expect(w.posted).toHaveLength(1);
    const mockReview: ReviewResult = {
      moves: [],
      accuracy: { r: 100, b: 100 },
    };
    w.reply({ id: 1, result: mockReview });
    await expect(promise).resolves.toEqual(mockReview);
    expect(w.listenerCount).toBe(0);
  });

  it("tự động chạy trên luồng chính nếu worker báo lỗi", async () => {
    const { result } = renderHook(() => useAnalysisWorker());
    const w = FakeAnalysisWorker.all[0];
    const state = replayMoves([]);
    const promise = result.current(state, []);
    w.emitError();
    const res = await promise;
    expect(res).toBeDefined();
    expect(res.moves).toBeDefined();
    expect(w.listenerCount).toBe(0);
  });

  it("tự động chạy trên luồng chính nếu worker quá thời gian (timeout)", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAnalysisWorker(500));
    const state = replayMoves([]);
    const promise = result.current(state, []);
    vi.advanceTimersByTime(600);
    const res = await promise;
    expect(res).toBeDefined();
    expect(res.moves).toBeDefined();
    vi.useRealTimers();
  });

  it("rời trang thì terminate worker", () => {
    const { unmount } = renderHook(() => useAnalysisWorker());
    unmount();
    expect(FakeAnalysisWorker.all[0].terminated).toBe(true);
  });
});
