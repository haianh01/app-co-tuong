"use client";

import { useCallback, useEffect, useRef } from "react";
import type { GameState } from "@/lib/xiangqi/game";
import { reviewGame, type PositionEval, type ReviewResult } from "@/lib/xiangqi/analysis";

/**
 * Hook chạy `reviewGame(state, evals)` trong Web Worker riêng.
 * Nếu môi trường không hỗ trợ Worker (test jsdom, SSR), tự động fallback về gọi trực tiếp.
 */
export function useAnalysisWorker() {
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
      const onMessage = (e: MessageEvent<{ id: number; result: ReviewResult }>) => {
        if (e.data.id !== id) return;
        worker.removeEventListener("message", onMessage);
        resolve(e.data.result);
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({ id, state, evals });
    });
  }, []);
}
