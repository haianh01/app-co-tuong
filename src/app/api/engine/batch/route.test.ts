import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineCache } from "@/server/engine/cache";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import type { EnginePool, EngineResult } from "@/server/engine/uci";
import { POST } from "./route";

vi.mock("next/server", () => ({
  connection: async () => {},
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({})),
}));

interface BatchChunk {
  index: number;
  total: number;
  eval?: {
    score: number;
    best: { from: number; to: number } | null;
    depth?: number;
    pv: { from: number; to: number }[];
    lines?: { best: { from: number; to: number } | null; score: number; depth?: number }[];
  };
  error?: string;
}

const mockStore = vi.hoisted(() => ({
  getSavedAnalysis: vi.fn<() => Promise<(PositionEval | null)[] | null>>(async () => null),
  saveGameAnalysis: vi.fn(async () => {}),
  consumeAnalysisQuota: vi.fn(async () => ({ success: true, remaining: 2 })),
}));

vi.mock("@/server/analysis/store", () => ({
  FREE_ANALYSIS_PER_DAY: 3,
  getSavedAnalysis: mockStore.getSavedAnalysis,
  saveGameAnalysis: mockStore.saveGameAnalysis,
  consumeAnalysisQuota: mockStore.consumeAnalysisQuota,
}));

const globalForEngine = globalThis as unknown as { __enginePool?: Partial<EnginePool> | null };

async function readNdjson<T = unknown>(res: Response): Promise<T[]> {
  const text = await res.text();
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as T);
}

beforeEach(() => {
  engineCache.clear();
  mockStore.consumeAnalysisQuota.mockResolvedValue({ success: true, remaining: 2 });
  mockStore.getSavedAnalysis.mockResolvedValue(null);
  mockStore.saveGameAnalysis.mockClear();
  globalForEngine.__enginePool = {
    waiting: 0,
    search: vi.fn(async () => ({
      bestmove: null,
      depth: 0,
      cp: 0,
      mate: null,
    })),
  };
});

describe("POST /api/engine/batch", () => {
  it("trả 400 nếu dữ liệu không phải JSON", async () => {
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Dữ liệu không hợp lệ");
  });

  it("trả 400 nếu fens không phải mảng hoặc rỗng", async () => {
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: [] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Danh sách FEN không hợp lệ");
  });

  it("trả 503 nếu chưa cài engine", async () => {
    globalForEngine.__enginePool = null;
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: ["rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Chưa cài engine");
  });

  it("stream NDJSON phân tích thành công và ghi vào cache", async () => {
    const mockResult: EngineResult = {
      bestmove: "h2e2",
      depth: 12,
      cp: 50,
      mate: null,
      pv: ["h2e2", "b9c7"],
      lines: [
        { multipv: 1, depth: 12, cp: 50, mate: null, bestmove: "h2e2", pv: ["h2e2", "b9c7"] },
        { multipv: 2, depth: 12, cp: 30, mate: null, bestmove: "b0c2", pv: ["b0c2", "b9c7"] },
      ],
    };

    let searchCalls = 0;
    globalForEngine.__enginePool = {
      waiting: 0,
      search: vi.fn(async () => {
        searchCalls++;
        return mockResult;
      }),
    };

    const startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const req1 = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: [startFen] }),
      headers: { "Content-Type": "application/json" },
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    expect(res1.headers.get("Content-Type")).toContain("application/x-ndjson");

    const chunks1 = await readNdjson<BatchChunk>(res1);
    expect(chunks1).toHaveLength(1);
    expect(chunks1[0].index).toBe(0);
    expect(chunks1[0].total).toBe(1);
    expect(chunks1[0].eval?.depth).toBe(12);
    expect(chunks1[0].eval?.best).toBeDefined();
    expect(chunks1[0].eval?.pv).toHaveLength(2);
    expect(chunks1[0].eval?.lines).toHaveLength(2);
    expect(searchCalls).toBe(1);

    // Lần 2 với cùng FEN sẽ lấy từ LRU cache
    const req2 = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: [startFen] }),
      headers: { "Content-Type": "application/json" },
    });
    const res2 = await POST(req2);
    const chunks2 = await readNdjson<BatchChunk>(res2);
    expect(chunks2).toHaveLength(1);
    expect(chunks2[0].eval?.depth).toBe(12);
    expect(searchCalls).toBe(1); // không gọi search lần thứ 2
  });

  it("báo lỗi theo từng dòng nếu gặp FEN không hợp lệ hoặc lỗi search", async () => {
    globalForEngine.__enginePool = {
      waiting: 0,
      search: vi.fn(async () => {
        throw new Error("engine crashed");
      }),
    };

    const invalidFen = "not-a-fen";
    const validFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: [invalidFen, validFen] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const chunks = await readNdjson<{ index: number; total: number; error?: string }>(res);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].error).toBe("FEN không hợp lệ");
    expect(chunks[1].error).toBe("Lỗi tìm kiếm engine");
  });

  it("trả 429 nếu người dùng đã hết quota trong ngày", async () => {
    mockStore.consumeAnalysisQuota.mockResolvedValueOnce({ success: false, remaining: 0 });

    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: ["rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toContain("hết 3 lượt phân tích");
  });

  it("dùng lại kết quả đã lưu trong game_analysis khi ván online đã được phân tích", async () => {
    const cachedEvals: PositionEval[] = [
      { score: 350, best: null, depth: 10, pv: [] },
      { score: -200, best: null, depth: 10, pv: [] },
    ];
    mockStore.getSavedAnalysis.mockResolvedValueOnce(cachedEvals);

    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({
        fens: ["fen1", "fen2"],
        gameId: "g12345",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const chunks = await readNdjson<BatchChunk>(res);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].eval?.score).toBe(350);
    expect(chunks[1].eval?.score).toBe(-200);

    // Không trừ quota khi ván đã được phân tích trước đó
    expect(mockStore.consumeAnalysisQuota).not.toHaveBeenCalled();
  });

  it("lưu kết quả vào game_analysis sau khi phân tích xong ván online", async () => {
    mockStore.getSavedAnalysis.mockResolvedValueOnce(null);
    mockStore.consumeAnalysisQuota.mockResolvedValueOnce({ success: true, remaining: 2 });

    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({
        fens: ["rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"],
        gameId: "gnew01",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const chunks = await readNdjson<BatchChunk>(res);
    expect(chunks).toHaveLength(1);
    expect(mockStore.saveGameAnalysis).toHaveBeenCalledWith(expect.anything(), "gnew01", expect.any(Array));
  });
});
