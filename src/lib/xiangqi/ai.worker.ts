// Chạy AI trong Web Worker để giao diện không bị đứng khi máy suy nghĩ.
import { AiLevel, findBestMove } from "./ai";
import { parseFen } from "./engine";

export interface AiRequest {
  id: number;
  fen: string;
  level: AiLevel;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<AiRequest>) => {
  const { id, fen, level } = e.data;
  const result = findBestMove(parseFen(fen), level);
  ctx.postMessage({ id, ...result });
};
