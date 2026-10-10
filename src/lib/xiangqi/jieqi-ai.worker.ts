// Chạy máy cờ úp trong Web Worker. Chỉ nhận bàn cờ công khai (không có bố cục bí mật).
import type { Board, Side } from "./engine";
import { findJieqiMove, type JieqiLevel } from "./jieqi-ai";

export interface JieqiAiRequest {
  id: number;
  board: Board;
  turn: Side;
  level: JieqiLevel;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<JieqiAiRequest>) => {
  const { id, board, turn, level } = e.data;
  ctx.postMessage({ id, move: findJieqiMove({ board, turn }, level) });
};
