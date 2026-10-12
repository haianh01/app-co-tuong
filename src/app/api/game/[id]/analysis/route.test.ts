import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import { GET } from "./route";

vi.mock("next/server", () => ({
  connection: async () => {},
}));

vi.mock("@/server/db", () => ({
  getDb: vi.fn(async () => ({})),
}));

const mockStore = vi.hoisted(() => ({
  getSavedAnalysis: vi.fn<() => Promise<(PositionEval | null)[] | null>>(async () => null),
  getAnalysisQuota: vi.fn(async () => ({
    allowed: true,
    remaining: 3,
    used: 0,
    limit: 3,
    isVip: false,
  })),
}));

vi.mock("@/server/analysis/store", () => ({
  getSavedAnalysis: mockStore.getSavedAnalysis,
  getAnalysisQuota: mockStore.getAnalysisQuota,
}));

beforeEach(() => {
  mockStore.getSavedAnalysis.mockResolvedValue(null);
  mockStore.getAnalysisQuota.mockResolvedValue({
    allowed: true,
    remaining: 3,
    used: 0,
    limit: 3,
    isVip: false,
  });
});

describe("GET /api/game/[id]/analysis", () => {
  it("trả 400 nếu id ván không hợp lệ", async () => {
    const req = new Request("http://localhost/api/game/bad-id!/analysis");
    const res = await GET(req, { params: Promise.resolve({ id: "bad-id!" }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Mã ván không hợp lệ");
  });

  it("trả analyzed: false nếu ván chưa được phân tích", async () => {
    const req = new Request("http://localhost/api/game/g12345/analysis");
    const res = await GET(req, { params: Promise.resolve({ id: "g12345" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.analyzed).toBe(false);
    expect(data.evals).toBeNull();
    expect(data.quota.remaining).toBe(3);
  });

  it("trả analyzed: true và danh sách evals nếu ván đã phân tích", async () => {
    const fakeEvals: PositionEval[] = [
      { score: 100, best: null, depth: 8, pv: [] },
      { score: -50, best: null, depth: 8, pv: [] },
    ];
    mockStore.getSavedAnalysis.mockResolvedValueOnce(fakeEvals);

    const req = new Request("http://localhost/api/game/g12345/analysis");
    const res = await GET(req, { params: Promise.resolve({ id: "g12345" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.analyzed).toBe(true);
    expect(data.evals).toEqual(fakeEvals);
  });
});
