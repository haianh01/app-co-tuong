// Web Worker chạy reviewGame: nhận {id, state, evals}, trả lại kết quả phân tích kèm đúng id.

import { describe, expect, it, vi } from "vitest";
import { replayMoves } from "./game";

describe("analysis.worker", () => {
  it("nhận state và evals, trả về reviewGame qua postMessage", async () => {
    const fake = { onmessage: null as ((e: MessageEvent) => void) | null, postMessage: vi.fn() };
    vi.stubGlobal("self", fake);
    await import("./analysis.worker");
    expect(fake.onmessage).toBeTypeOf("function");

    const state = replayMoves([]);
    fake.onmessage!({ data: { id: 42, state, evals: [] } } as MessageEvent);
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    const reply = fake.postMessage.mock.calls[0][0];
    expect(reply.id).toBe(42);
    expect(reply.result).toHaveProperty("moves");
    expect(reply.result).toHaveProperty("accuracy");
  });
});
