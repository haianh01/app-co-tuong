// Web Worker chạy phân tích ván cờ (reviewGame) và sinh các lời giải thích kỳ lý.
// Giúp giảm tải luồng chính của trình duyệt (main UI thread), tránh đơ giật giao diện khi ván có nhiều nước.

import { reviewGame, type PositionEval, type ReviewResult } from "./analysis";
import type { GameState } from "./game";

export interface AnalysisRequest {
  id: number;
  state: GameState;
  evals: (PositionEval | null)[];
}

export interface AnalysisResponse {
  id: number;
  result: ReviewResult;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, state, evals } = e.data;
  const result = reviewGame(state, evals);
  ctx.postMessage({ id, result } satisfies AnalysisResponse);
};
