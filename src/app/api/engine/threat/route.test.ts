import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnginePool, ThreatResult } from "@/server/engine/uci";
import { POST } from "./route";

vi.mock("next/server", () => ({
  connection: async () => {},
}));

const globalForEngine = globalThis as unknown as { __enginePool?: Partial<EnginePool> | null };

beforeEach(() => {
  globalForEngine.__enginePool = {
    waiting: 0,
    threat: vi.fn(async (): Promise<ThreatResult> => ({
      threatMove: { from: 79, to: 76 },
      threatUci: "h2e2",
      threatNotation: "P2-5",
      score: 180,
      pv: [{ from: 79, to: 76 }, { from: 9, to: 27 }],
      pvUci: ["h2e2", "b9c7"],
      isMate: false,
      opponent: "b",
      inCheck: false,
    })),
  };
});

describe("POST /api/engine/threat", () => {
  const startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

  it("trả 400 nếu dữ liệu JSON không hợp lệ", async () => {
    const req = new Request("http://localhost/api/engine/threat", {
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
    const req = new Request("http://localhost/api/engine/threat", {
      method: "POST",
      body: JSON.stringify({ fen: "invalid-fen" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("FEN không hợp lệ");
  });

  it("trả 503 nếu chưa cài engine", async () => {
    globalForEngine.__enginePool = null;
    const req = new Request("http://localhost/api/engine/threat", {
      method: "POST",
      body: JSON.stringify({ fen: startFen }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Chưa cài engine");
  });

  it("trả về thông tin nước đe dọa thành công", async () => {
    const req = new Request("http://localhost/api/engine/threat", {
      method: "POST",
      body: JSON.stringify({ fen: startFen }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.threatUci).toBe("h2e2");
    expect(data.threatNotation).toBe("P2-5");
    expect(data.opponent).toBe("b");
    expect(data.score).toBe(180);
    expect(data.pv).toHaveLength(2);
  });
});
