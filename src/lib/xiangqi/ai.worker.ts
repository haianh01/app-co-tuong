// Chạy AI trong Web Worker để giao diện không bị đứng khi máy suy nghĩ.
import { AiLevel, SearchOverrides, findBestMove } from "./ai";
import { parseFen } from "./engine";

export interface AiRequest {
  id: number;
  fen: string;
  level: AiLevel;
  /** Phân tích ván: độ sâu/thời gian cố định, không nhiễu (tùy chọn). */
  overrides?: SearchOverrides;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, fen, level, overrides } = e.data;
  const result = findBestMove(parseFen(fen), level, Math.random, overrides);
  ctx.postMessage({ id, ...result });
};
