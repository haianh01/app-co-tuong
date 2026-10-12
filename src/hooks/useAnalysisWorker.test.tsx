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
  private listeners = new Set<(e: MessageEvent) => void>();

  constructor(readonly url: URL, readonly options: WorkerOptions) {
    FakeAnalysisWorker.all.push(this);
  }

  postMessage(data: unknown) {
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

  it("rời trang thì terminate worker", () => {
    const { unmount } = renderHook(() => useAnalysisWorker());
    unmount();
    expect(FakeAnalysisWorker.all[0].terminated).toBe(true);
  });
});
