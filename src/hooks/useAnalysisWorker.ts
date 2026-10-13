"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GameState } from "@/lib/xiangqi/game";
import { reviewGame, type PositionEval, type ReviewResult } from "@/lib/xiangqi/analysis";

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Hook chạy `reviewGame(state, evals)` trong Web Worker riêng.
 * Nếu môi trường không hỗ trợ Worker (test jsdom, SSR), hoặc worker bị lỗi / quá thời gian,
 * tự động fallback về gọi trực tiếp trên luồng chính.
 */
export function useAnalysisWorker(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    try {
      const worker = new Worker(new URL("../lib/xiangqi/analysis.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      // Fallback khi không thể khởi tạo Worker
    }
  }, []);

  return useCallback((state: GameState, evals: (PositionEval | null)[]): Promise<ReviewResult> => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.resolve(reviewGame(state, evals));
    }
    return new Promise((resolve) => {
      const id = ++seq.current;
      let settled = false;

      const finish = (res: ReviewResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(res);
      };

      const fallback = () => {
        finish(reviewGame(state, evals));
      };

      const timer = setTimeout(() => {
        fallback();
      }, timeoutMs);

      const onMessage = (e: MessageEvent<{ id: number; result: ReviewResult }>) => {
        if (!e.data || e.data.id !== id) return;
        finish(e.data.result);
      };

      const onError = () => {
        fallback();
      };

      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);

      try {
        worker.postMessage({ id, state, evals });
      } catch {
        fallback();
      }
    });
  }, [timeoutMs]);
}
