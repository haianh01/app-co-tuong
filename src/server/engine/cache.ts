// Bộ đệm LRU cho kết quả engine trên server.
// Các thế cờ khai cuộc và trung cuộc phổ biến lặp lại rất nhiều giữa các ván đấu,
// lưu cache giúp trả về ngay lập tức (< 1ms) mà không cần gọi tiến trình Pikafish.

import type { EngineLimits, EngineResult } from "./uci";

export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(public readonly capacity: number = 3000) {
    if (capacity <= 0) throw new Error("Capacity must be greater than 0");
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // Đưa lên vị trí gần nhất
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.capacity) {
      // Xoá phần tử lâu nhất chưa dùng (đầu Map)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Tạo khoá cache duy nhất theo FEN và các giới hạn tìm kiếm. */
export function makeEngineCacheKey(fen: string, limits: EngineLimits): string {
  const parts = [
    fen.trim(),
    limits.nodes ?? "",
    limits.depth ?? "",
    limits.movetime ?? "",
    limits.multipv ?? 1,
  ];
  return parts.join("|");
}

const globalForCache = globalThis as unknown as { __engineCache?: LruCache<string, EngineResult> };

/** Singleton cache dùng chung cho cả tiến trình server. */
export const engineCache: LruCache<string, EngineResult> =
  globalForCache.__engineCache ?? (globalForCache.__engineCache = new LruCache<string, EngineResult>(3000));
