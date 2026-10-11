"use client";

import { useCallback } from "react";
import type { AiLevel, AiResult, SearchOverrides } from "@/lib/xiangqi/ai";
import { useAiWorker } from "./useAiWorker";

/** Cấp từ đây trở lên đánh bằng engine mạnh trên server; cấp thấp hơn dùng AI JavaScript trong trình duyệt. */
export const SERVER_FROM_LEVEL = 3;

export type EnginePurpose = "play" | "analysis";

/**
 * Trả về `think(fen, level, overrides?, purpose?)`:
 * - "play" cấp 1–2: AI JavaScript trong Web Worker (như trước).
 * - "play" cấp 3–5 và "analysis": engine trên server (/api/engine).
 * Server lỗi / chưa cài engine / quá tải → tự quay về AI JavaScript với cùng tham số.
 */
export function useEngine() {
  const local = useAiWorker();
  return useCallback(
    async (fen: string, level: AiLevel, overrides?: SearchOverrides, purpose: EnginePurpose = "play"): Promise<AiResult> => {
      if (purpose === "play" && level < SERVER_FROM_LEVEL) return local(fen, level, overrides);
      try {
        const res = await fetch("/api/engine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fen, level, purpose, avoid: overrides?.avoid }),
        });
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as AiResult;
      } catch {
        return local(fen, level, overrides);
      }
    },
    [local],
  );
}
