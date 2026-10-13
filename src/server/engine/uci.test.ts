import { afterAll, describe, expect, it, vi } from "vitest";
import { legalMoves, parseFen } from "@/lib/xiangqi/engine";
import { engineScore, toUciFen, uciToMove } from "@/lib/xiangqi/uci";
import {
  EnginePool,
  computeSearchTimeoutMs,
  defaultEnginePath,
  parseInfo,
  type EngineLimits,
  type EngineResult,
} from "./uci";

describe("parseInfo", () => {
  it("đọc độ sâu, điểm và chuỗi biến PV", () => {
    expect(parseInfo("info depth 12 seldepth 18 multipv 1 score cp -34 nodes 1 pv h2e2 b9c7")).toEqual({
      depth: 12,
      multipv: 1,
      cp: -34,
      pv: ["h2e2", "b9c7"],
    });
    expect(parseInfo("info depth 10 multipv 2 score cp 45 pv b0c2 h9g7")).toEqual({
      depth: 10,
      multipv: 2,
      cp: 45,
      pv: ["b0c2", "h9g7"],
    });
    expect(parseInfo("info depth 5 score mate 2 pv a0a9")).toEqual({ depth: 5, mate: 2, pv: ["a0a9"] });
  });

  it("đọc dữ liệu WDL (tỉ lệ thắng/hòa/thua) do engine báo", () => {
    const parsed = parseInfo("info depth 15 multipv 1 score cp 50 wdl 520 380 100 nodes 60000 pv h2e2 b9c7");
    expect(parsed.wdl).toEqual([520, 380, 100]);
    expect(parsed.cp).toBe(50);
    expect(parsed.pv).toEqual(["h2e2", "b9c7"]);
  });
});

describe("computeSearchTimeoutMs", () => {
  it("tính thời gian chờ theo movetime", () => {
    expect(computeSearchTimeoutMs({ movetime: 1_500 })).toBe(11_500);
  });

  it("tính thời gian chờ theo nodes để không cắt ngang lượt phân tích sâu", () => {
    // 60k nodes: ~17.4s
    const fastTimeout = computeSearchTimeoutMs({ nodes: 60_000 });
    expect(fastTimeout).toBeGreaterThanOrEqual(17_000);

    // 1.5M nodes (lượt sâu): phải trên 70s thay vì bị cắt bởi 15s cũ
    const deepTimeout = computeSearchTimeoutMs({ nodes: 1_500_000 });
    expect(deepTimeout).toBeGreaterThanOrEqual(75_000);

    // 3M nodes: trên 130s
    const veryDeepTimeout = computeSearchTimeoutMs({ nodes: 3_000_000 });
    expect(veryDeepTimeout).toBeGreaterThanOrEqual(135_000);
  });

  it("tính thời gian chờ theo depth hoặc mặc định", () => {
    expect(computeSearchTimeoutMs({ depth: 15 })).toBeGreaterThanOrEqual(15_000);
    expect(computeSearchTimeoutMs({})).toBe(30_000);
  });
});

describe("EnginePool APIs: threat & refute", () => {
  it("threat(fen): đổi lượt đi (null-move) tìm nước đe dọa của đối phương", async () => {
    const pool = new EnginePool("fake-exe", 1);
    const mockSearch = vi.fn(async (): Promise<EngineResult> => ({
      bestmove: "h2e2",
      depth: 10,
      cp: 200,
      mate: null,
      pv: ["h2e2", "b9c7"],
    }));
    pool.search = mockSearch;

    const startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const threat = await pool.threat(startFen, { nodes: 10_000 });

    expect(threat.opponent).toBe("b");
    expect(threat.threatUci).toBe("h2e2");
    expect(threat.threatMove).toBeDefined();
    expect(threat.isMate).toBe(false);
    expect(threat.inCheck).toBe(false);
    expect(mockSearch).toHaveBeenCalledWith(
      expect.stringContaining(" b - - 0 1"),
      expect.anything(),
    );
  });

  it("threat(fen): báo inCheck khi bên đang đi đang bị chiếu sẵn", async () => {
    const pool = new EnginePool("fake-exe", 1);
    // Thế cờ Đỏ đang bị chiếu trực tiếp bởi Xe đen
    const inCheckFen = "4k4/9/9/9/4r4/9/9/9/9/4K4 w";
    const threat = await pool.threat(inCheckFen);
    expect(threat.inCheck).toBe(true);
    expect(threat.threatMove).toBeNull();
    expect(threat.threatNotation).toBe("Đang bị chiếu tướng");
  });

  it("refute(fen, move): trả về isBest = true nếu nước kiểm tra trùng nước tốt nhất", async () => {
    const pool = new EnginePool("fake-exe", 1);
    pool.search = vi.fn(async (): Promise<EngineResult> => ({
      bestmove: "h2e2",
      depth: 10,
      cp: 50,
      mate: null,
      pv: ["h2e2", "b9c7"],
    }));

    const startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const res = await pool.refute(startFen, "h2e2");

    expect(res.isBest).toBe(true);
    expect(res.scoreLoss).toBe(0);
    expect(res.winDrop).toBe(0);
    expect(res.facts).toEqual([]);
    expect(res.refutationUci).toBe("b9c7");
  });

  it("refute(fen, move): tính mức mất điểm, xác suất giảm và dữ kiện khi nước đi kém hơn", async () => {
    const pool = new EnginePool("fake-exe", 1);
    let searchCount = 0;
    pool.search = vi.fn(async (_fen: string, _limits: EngineLimits, searchmoves?: string[]): Promise<EngineResult> => {
      searchCount++;
      if (!searchmoves) {
        // Nước tốt nhất ban đầu: Pháo 2 bình 5 (+50)
        return {
          bestmove: "h2e2",
          depth: 12,
          cp: 50,
          mate: null,
          pv: ["h2e2", "b9c7"],
        };
      }
      // Nước bị chất vấn: Xe 1 tiến 1 (-300)
      return {
        bestmove: "i0i1",
        depth: 12,
        cp: -300,
        mate: null,
        pv: ["i0i1", "b9c7"],
      };
    });

    const startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";
    const res = await pool.refute(startFen, "i0i1");

    expect(res.isBest).toBe(false);
    expect(res.scoreLoss).toBe(350);
    expect(res.winDrop).toBeGreaterThan(0.2);
    expect(res.refutationUci).toBe("b9c7");
    expect(searchCount).toBeGreaterThanOrEqual(2);
  });
});

const exe = defaultEnginePath();

describe.skipIf(!exe)("Pikafish thật", () => {
  const pool = new EnginePool(exe!, 1);
  afterAll(() => pool.close());

  it("thấy nước chiếu bí ngay", async () => {
    const pos = parseFen("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
    const res = await pool.search(toUciFen(pos), { nodes: 20_000 });
    expect(uciToMove(res.bestmove!)).toEqual({ from: 26, to: 21 });
    expect(engineScore(res.cp, res.mate)).toBe(99_999);
  }, 30_000);

  it("chỉ tìm trong các nước được phép (searchmoves)", async () => {
    const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w");
    const res = await pool.search(toUciFen(pos), { nodes: 5_000 }, ["a3a4", "i3i4"]);
    expect(["a3a4", "i3i4"]).toContain(res.bestmove);
    expect(legalMoves(pos).length).toBe(44);
  }, 30_000);
});
