import { beforeEach, describe, expect, it, vi } from "vitest";
import { engineCache } from "@/server/engine/cache";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import type { EngineLimits, EnginePool, EngineResult } from "@/server/engine/uci";
import type { StageGame } from "@/server/db/schema";
import { POST, selectKeyPositions, ANALYSIS_FAST, ANALYSIS_DEEP } from "./route";

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
  consumeStageAnalysisQuota: vi.fn(async () => ({ success: true, remaining: 24 })),
}));

const mockStageGames = vi.hoisted(() => ({
  getStageGame: vi.fn<() => Promise<StageGame | null>>(async () => null),
  getStageAnalysis: vi.fn<() => Promise<(PositionEval | null)[] | null>>(async () => null),
  saveStageAnalysis: vi.fn(async () => {}),
  hashRoomKey: vi.fn((r: string) => "hashed_" + r),
}));

vi.mock("@/server/analysis/store", () => ({
  FREE_ANALYSIS_PER_DAY: 3,
  STAGE_FREE_ANALYSIS_PER_DAY: 25,
  getSavedAnalysis: mockStore.getSavedAnalysis,
  saveGameAnalysis: mockStore.saveGameAnalysis,
  consumeAnalysisQuota: mockStore.consumeAnalysisQuota,
  consumeStageAnalysisQuota: mockStore.consumeStageAnalysisQuota,
}));

vi.mock("@/server/stage-games", () => ({
  getStageGame: mockStageGames.getStageGame,
  getStageAnalysis: mockStageGames.getStageAnalysis,
  saveStageAnalysis: mockStageGames.saveStageAnalysis,
  hashRoomKey: mockStageGames.hashRoomKey,
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
  mockStageGames.getStageGame.mockResolvedValue(null);
  mockStageGames.getStageAnalysis.mockResolvedValue(null);
  mockStageGames.saveStageAnalysis.mockClear();
  mockStore.consumeStageAnalysisQuota.mockResolvedValue({ success: true, remaining: 24 });
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

  it("trả 503 nếu chưa cài engine mà không trừ quota", async () => {
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
    expect(mockStore.consumeAnalysisQuota).not.toHaveBeenCalled();
  });

  it("trả 503 nếu engine đang quá tải và không trừ quota", async () => {
    globalForEngine.__enginePool = {
      waiting: 33,
      search: vi.fn(),
    };
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: ["rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"] }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("Engine đang quá tải");
    expect(mockStore.consumeAnalysisQuota).not.toHaveBeenCalled();
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

  it("không dùng lại kết quả đã lưu nếu số nước hoặc FEN không khớp", async () => {
    const cachedEvals: PositionEval[] = [
      { score: 350, best: null, depth: 10, pv: [], fen: "fen1" },
      { score: -200, best: null, depth: 10, pv: [], fen: "fen2" },
    ];
    mockStore.getSavedAnalysis.mockResolvedValueOnce(cachedEvals);

    // Gửi request với 3 FEN (lệch số lượng so với 2 evals đã lưu)
    const reqDifferentCount = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({
        fens: ["fen1", "fen2", "fen3"],
        gameId: "g12345",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const resCount = await POST(reqDifferentCount);
    expect(resCount.status).toBe(200);
    expect(mockStore.consumeAnalysisQuota).toHaveBeenCalledTimes(1);

    mockStore.consumeAnalysisQuota.mockClear();
    mockStore.getSavedAnalysis.mockResolvedValueOnce(cachedEvals);

    // Gửi request với FEN khác
    const reqDifferentFen = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({
        fens: ["fen1", "fen_mismatch"],
        gameId: "g12345",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const resFen = await POST(reqDifferentFen);
    expect(resFen.status).toBe(200);
    expect(mockStore.consumeAnalysisQuota).toHaveBeenCalledTimes(1);
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

  it("ghi log lỗi console.error nếu lưu kết quả vào DB thất bại", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockStore.getSavedAnalysis.mockResolvedValueOnce(null);
    mockStore.saveGameAnalysis.mockRejectedValueOnce(new Error("DB error"));

    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({
        fens: ["rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"],
        gameId: "gerr01",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await readNdjson<BatchChunk>(res);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[analysis/batch] Không thể lưu phân tích ván gerr01:"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("selectKeyPositions: lọc đúng các thế cờ then chốt (winDrop lớn, nước duy nhất)", () => {
    const evals: (PositionEval | null)[] = [
      { score: 300, best: null }, // index 0: Đỏ đang hơn (+300)
      { score: -300, best: null }, // index 1: Đen đang thua (-300), winDrop = 0
      { score: 300, best: null }, // index 2: Đỏ đang hơn (+300)
      { score: 400, best: null }, // index 3: Đen được +400 (Đỏ thành -400) => Đỏ mắc sai lầm nghiêm trọng ở thế 2!
      {
        score: -400,
        best: null,
        lines: [
          { score: -400, best: null },
          { score: -1500, best: null }, // Nước duy nhất (only): nước 2 thua thảm
        ],
      }, // index 4: only move
    ];

    const keys = selectKeyPositions(evals, 2);
    expect(keys).toEqual([2, 4]);
  });

  it("chạy 2-pass: Pass 1 lượt nhanh và Pass 2 lượt sâu cập nhật cho thế then chốt", async () => {
    const searchCalls: { limits: EngineLimits; fen: string }[] = [];
    globalForEngine.__enginePool = {
      waiting: 0,
      search: vi.fn(async (fen: string, limits: EngineLimits): Promise<EngineResult> => {
        searchCalls.push({ limits, fen });
        // Nếu là Pass 2 (lượt sâu)
        if (limits.nodes === ANALYSIS_DEEP.nodes) {
          return {
            bestmove: "h2e2",
            depth: 20,
            cp: 80,
            mate: null,
            pv: ["h2e2", "b9c7", "b0c2"],
          };
        }
        // Pass 1: Lượt nhanh
        return {
          bestmove: "h2e2",
          depth: 10,
          cp: searchCalls.length === 1 ? 400 : -300, // Tạo winDrop lớn giữa 2 thế cờ
          mate: null,
          pv: ["h2e2"],
        };
      }),
    };

    const fen1 = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const fen2 = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b";
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      body: JSON.stringify({ fens: [fen1, fen2] }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const chunks = await readNdjson<{ index: number; total: number; eval?: PositionEval; phase?: string; isUpdate?: boolean }>(res);

    // Chunks phải gồm Pass 1 (2 thế cờ) và ít nhất 1 chunk cập nhật của Pass 2
    expect(chunks.length).toBeGreaterThan(2);
    const deepChunks = chunks.filter((c) => c.phase === "deep" && c.isUpdate === true);
    expect(deepChunks.length).toBeGreaterThanOrEqual(1);
    expect(deepChunks[0].eval?.depth).toBe(20);

    // Engine phải được gọi với cả ANALYSIS_FAST và ANALYSIS_DEEP
    const fastCalls = searchCalls.filter((c) => c.limits.nodes === ANALYSIS_FAST.nodes);
    const deepCalls = searchCalls.filter((c) => c.limits.nodes === ANALYSIS_DEEP.nodes);
    expect(fastCalls.length).toBe(2);
    expect(deepCalls.length).toBeGreaterThanOrEqual(1);
  });
  it("trả 400 nếu có stageGameId nhưng thiếu hoặc sai khóa phòng room", async () => {
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fens: ["rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"],
        stageGameId: "stg_123456",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Khóa phòng/);
  });

  it("trả 404 nếu không tìm thấy stageGameId thuộc phòng", async () => {
    mockStageGames.getStageGame.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fens: ["rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"],
        stageGameId: "stg_notfound",
        room: "my-valid-room-12345",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("dùng lại kết quả đã lưu trong stage_game_analysis khi ván sân khấu đã được phân tích", async () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    mockStageGames.getStageGame.mockResolvedValueOnce({ id: "stg_cached" } as unknown as StageGame);
    const cachedEvals = [{ score: 55, best: null, depth: 10, pv: [], fen }];
    mockStageGames.getStageAnalysis.mockResolvedValueOnce(cachedEvals);

    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fens: [fen],
        stageGameId: "stg_cached",
        room: "my-valid-room-12345",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const chunks = await readNdjson<BatchChunk>(res);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].eval?.score).toBe(55);
    expect(mockStore.consumeStageAnalysisQuota).not.toHaveBeenCalled();
  });

  it("lưu kết quả vào stage_game_analysis sau khi phân tích xong ván sân khấu", async () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    mockStageGames.getStageGame.mockResolvedValueOnce({ id: "stg_tosave" } as unknown as StageGame);

    const req = new Request("http://localhost/api/engine/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fens: [fen],
        stageGameId: "stg_tosave",
        room: "my-valid-room-12345",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await readNdjson(res);

    expect(mockStageGames.saveStageAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      "stg_tosave",
      expect.any(Array),
    );
  });

});
