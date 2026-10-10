// GET /api/health: nền tảng triển khai và Playwright dùng để biết app đã sẵn sàng (kết nối được CSDL).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DbHandle } from "@/server/db";
import { testDb } from "@/test/db";
import { GET } from "./route";

// Ngoài Next không có "request scope": connection() chỉ cần không làm gì.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

const shared = globalThis as typeof globalThis & { __kydaiDb?: Promise<DbHandle> };

// Một test thay CSDL bằng bản hỏng: giữ lại CSDL test dùng chung để trả về sau (không tạo PGlite mới).
let original: Promise<DbHandle> | undefined;
beforeEach(async () => {
  await testDb();
  original = shared.__kydaiDb;
});
afterEach(() => {
  shared.__kydaiDb = original;
});

describe("GET /api/health", () => {
  it("CSDL hoạt động: 200 { ok: true }, không cache", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("CSDL lỗi: 503 { ok: false } thay vì ném lỗi 500", async () => {
    const real = await testDb();
    const broken = { db: { ...real, execute: () => Promise.reject(new Error("mất kết nối")) }, close: async () => {} };
    shared.__kydaiDb = Promise.resolve(broken as unknown as DbHandle);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
