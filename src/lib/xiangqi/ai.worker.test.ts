// Web Worker chạy AI: nhận {id, fen, level}, trả lại kết quả kèm đúng id.

import { describe, expect, it, vi } from "vitest";
import { applyMove, outcome, parseFen } from "./engine";
import { PUZZLES } from "./puzzles";

describe("ai.worker", () => {
  it("trả lời đúng id kèm nước đi tốt nhất", async () => {
    const fake = { onmessage: null as ((e: MessageEvent) => void) | null, postMessage: vi.fn() };
    vi.stubGlobal("self", fake);
    await import("./ai.worker");
    expect(fake.onmessage).toBeTypeOf("function");

    const fen = PUZZLES[0].fen;
    fake.onmessage!({ data: { id: 7, fen, level: 2 } } as MessageEvent);
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    const reply = fake.postMessage.mock.calls[0][0];
    expect(reply.id).toBe(7);
    expect(outcome(applyMove(parseFen(fen), reply.move))).toMatchObject({ over: true, winner: "r" });
    expect(reply).toHaveProperty("depth");
    expect(reply).toHaveProperty("score");
  });
});
