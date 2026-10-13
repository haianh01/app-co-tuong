import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnginePool, RefuteResult } from "@/server/engine/uci";
import { POST } from "./route";

vi.mock("next/server", () => ({
  connection: async () => {},
}));

const globalForEngine = globalThis as unknown as { __enginePool?: Partial<EnginePool> | null };

beforeEach(() => {
  globalForEngine.__enginePool = {
    waiting: 0,
    refute: vi.fn(async (): Promise<RefuteResult> => ({
      move: { from: 80, to: 71 },
      moveUci: "i0i1",
      moveNotation: "X1.1",
      isBest: false,
      score: -250,
      bestScore: 50,
      scoreLoss: 300,
      winDrop: 0.35,
      refutationMove: { from: 9, to: 27 },
      refutationUci: "b9c7",
      refutationNotation: "M8.7",
      pv: [{ from: 80, to: 71 }, { from: 9, to: 27 }],
      pvUci: ["i0i1", "b9c7"],
      facts: [],
    })),
  };
});

describe("POST /api/engine/refute", () => {
  const startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

  it("trả 400 nếu dữ liệu JSON không hợp lệ", async () => {
    const req = new Request("http://localhost/api/engine/refute", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Dữ liệu không hợp lệ");
  });

  it("trả 400 nếu FEN không hợp lệ", async () => {
    const req = new Request("http://localhost/api/engine/refute", {
      method: "POST",
      body: JSON.stringify({ fen: "invalid-fen", move: "i0i1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("FEN không hợp lệ");
  });

  it("trả 400 nếu move thiếu hoặc không hợp lệ", async () => {
    const req = new Request("http://localhost/api/engine/refute", {
      method: "POST",
      body: JSON.stringify({ fen: startFen }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Nước đi không hợp lệ");
  });

  it("trả 503 nếu chưa cài engine", async () => {
    globalForEngine.__enginePool = null;
    const req = new Request("http://localhost/api/engine/refute", {
      method: "POST",
      body: JSON.stringify({ fen: startFen, move: "i0i1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Chưa cài engine");
  });

  it("trả về thông tin bác bỏ nước cờ thành công", async () => {
    const req = new Request("http://localhost/api/engine/refute", {
      method: "POST",
      body: JSON.stringify({ fen: startFen, move: "i0i1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.moveUci).toBe("i0i1");
    expect(data.isBest).toBe(false);
    expect(data.scoreLoss).toBe(300);
    expect(data.winDrop).toBe(0.35);
    expect(data.refutationUci).toBe("b9c7");
  });
});
