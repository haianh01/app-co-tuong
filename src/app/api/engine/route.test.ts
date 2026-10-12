import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineCache } from "@/server/engine/cache";
import type { EnginePool, EngineResult } from "@/server/engine/uci";
import { POST } from "./route";

vi.mock("next/server", () => ({
  connection: async () => {},
}));

const globalForEngine = globalThis as unknown as { __enginePool?: Partial<EnginePool> | null };

beforeEach(() => {
  engineCache.clear();
  globalForEngine.__enginePool = {
    waiting: 0,
    search: vi.fn(async () => ({
      bestmove: "h2e2",
      depth: 12,
      cp: 50,
      mate: null,
      pv: ["h2e2", "b9c7"],
      lines: [
        { multipv: 1, depth: 12, cp: 50, mate: null, bestmove: "h2e2", pv: ["h2e2", "b9c7"] },
        { multipv: 2, depth: 12, cp: 30, mate: null, bestmove: "b0c2", pv: ["b0c2", "b9c7"] },
      ],
    } satisfies EngineResult)),
  };
});

describe("POST /api/engine", () => {
  const startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

  it("trả { move, score, depth, pv, lines } khi phân tích", async () => {
    const req = new Request("http://localhost/api/engine", {
      method: "POST",
      body: JSON.stringify({ fen: startFen, purpose: "analysis" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.move).toBeDefined();
    expect(data.score).toBe(50);
    expect(data.depth).toBe(12);
    expect(data.pv).toEqual(["h2e2", "b9c7"]);
    expect(data.pvMoves).toHaveLength(2);
    expect(data.lines).toHaveLength(2);
  });

  it("dùng cache LRU và trả header X-Cache: HIT cho lần gọi thứ 2", async () => {
    const req1 = new Request("http://localhost/api/engine", {
      method: "POST",
      body: JSON.stringify({ fen: startFen, purpose: "analysis" }),
      headers: { "Content-Type": "application/json" },
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    expect(res1.headers.get("X-Cache")).toBeNull();

    const req2 = new Request("http://localhost/api/engine", {
      method: "POST",
      body: JSON.stringify({ fen: startFen, purpose: "analysis" }),
      headers: { "Content-Type": "application/json" },
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    expect(res2.headers.get("X-Cache")).toBe("HIT");
    const data2 = await res2.json();
    expect(data2.score).toBe(50);
  });
});
