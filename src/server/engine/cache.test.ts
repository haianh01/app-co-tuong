import { describe, expect, it } from "vitest";
import { LruCache, makeEngineCacheKey } from "./cache";

describe("LruCache", () => {
  it("lưu và đọc dữ liệu chính xác", () => {
    const cache = new LruCache<string, number>(3);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBeUndefined();
  });

  it("xoá phần tử ít dùng nhất khi vượt quá capacity", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    // Truy cập 'a' để 'a' thành recently used
    expect(cache.get("a")).toBe(1);
    // Thêm 'c' -> 'b' là phần tử cũ nhất sẽ bị loại bỏ
    cache.set("c", 3);
    expect(cache.has("b")).toBe(false);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("ghi đè phần tử cập nhật lại vị trí", () => {
    const cache = new LruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);
    expect(cache.has("b")).toBe(false);
    expect(cache.get("a")).toBe(10);
    expect(cache.get("c")).toBe(3);
  });
});

describe("makeEngineCacheKey", () => {
  it("tạo khoá duy nhất từ FEN và limits", () => {
    const k1 = makeEngineCacheKey("fen1", { nodes: 60000, multipv: 3 });
    const k2 = makeEngineCacheKey("fen1", { nodes: 60000, multipv: 1 });
    const k3 = makeEngineCacheKey("fen2", { nodes: 60000, multipv: 3 });
    expect(k1).not.toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).toContain("fen1");
    expect(k1).toContain("3");
  });
});
