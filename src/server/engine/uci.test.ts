// Chạy engine thật (Pikafish). Bỏ qua khi máy chưa có file engine (vd. CI chưa tải).
import { afterAll, describe, expect, it } from "vitest";
import { legalMoves, parseFen } from "@/lib/xiangqi/engine";
import { engineScore, toUciFen, uciToMove } from "@/lib/xiangqi/uci";
import { EnginePool, defaultEnginePath, parseInfo } from "./uci";

describe("parseInfo", () => {
  it("đọc độ sâu, điểm và chuỗi biến PV", () => {
    expect(parseInfo("info depth 12 seldepth 18 multipv 1 score cp -34 nodes 1 pv h2e2 b9c7")).toEqual({ depth: 12, multipv: 1, cp: -34, pv: ["h2e2", "b9c7"] });
    expect(parseInfo("info depth 10 multipv 2 score cp 45 pv b0c2 h9g7")).toEqual({ depth: 10, multipv: 2, cp: 45, pv: ["b0c2", "h9g7"] });
    expect(parseInfo("info depth 5 score mate 2 pv a0a9")).toEqual({ depth: 5, mate: 2, pv: ["a0a9"] });
  });
});

const exe = defaultEnginePath();

describe.skipIf(!exe)("Pikafish thật", () => {
  const pool = new EnginePool(exe!, 1);
  afterAll(() => pool.close());

  it("thấy nước chiếu bí ngay", async () => {
    // Đỏ: Xe 1 bình 6 chiếu bí (thế đã dùng ở test phân tích ván).
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
