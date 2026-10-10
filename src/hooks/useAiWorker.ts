"use client";

import { useCallback, useEffect, useRef } from "react";
import type { AiLevel, AiResult, SearchOverrides } from "@/lib/xiangqi/ai";

/** Trả về hàm `think(fen, level, overrides?)` chạy AI trong worker; mỗi component giữ một worker riêng. */
export function useAiWorker() {
  const workerRef = useRef<Worker | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("../lib/xiangqi/ai.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  return useCallback((fen: string, level: AiLevel, overrides?: SearchOverrides) => {
    return new Promise<AiResult>((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) {
        reject(new Error("AI chưa sẵn sàng"));
        return;
      }
      const id = ++seq.current;
      const onMessage = (e: MessageEvent<AiResult & { id: number }>) => {
        if (e.data.id !== id) return;
        worker.removeEventListener("message", onMessage);
        resolve(e.data);
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage(overrides ? { id, fen, level, overrides } : { id, fen, level });
    });
  }, []);
}
