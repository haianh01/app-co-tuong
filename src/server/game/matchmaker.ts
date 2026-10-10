// Hàng đợi ghép cặp. Thuần logic (thời gian truyền vào), không biết gì về WebSocket.

import type { PlayerInfo, QueueKey } from "@/lib/online/protocol";

export interface QueueEntry {
  user: PlayerInfo;
  key: QueueKey;
  since: number;
}

export const queueKeyId = (k: QueueKey) => `${k.variant}|${k.tc}|${k.rated ? "rated" : "casual"}`;

/**
 * Khoảng Elo chấp nhận được khi ghép ván tính điểm: bắt đầu ±100, mỗi giây chờ nới thêm 10
 * (chờ khoảng 1 phút là gặp gần như bất kỳ ai). Ván không tính điểm: ghép ngay, ai vào trước ghép trước.
 */
export function ratingWindow(entry: QueueEntry, now: number): number {
  if (!entry.key.rated) return Infinity;
  return 100 + Math.floor((now - entry.since) / 1000) * 10;
}

export class Matchmaker {
  private queues = new Map<string, QueueEntry[]>();

  /** Thêm người vào hàng đợi (bỏ khỏi hàng đợi khác nếu đang chờ). */
  add(user: PlayerInfo, key: QueueKey, now: number): QueueEntry {
    this.remove(user.id);
    const entry: QueueEntry = { user, key, since: now };
    const id = queueKeyId(key);
    this.queues.set(id, [...(this.queues.get(id) ?? []), entry]);
    return entry;
  }

  remove(userId: string): QueueEntry | null {
    let removed: QueueEntry | null = null;
    for (const [id, queue] of this.queues) {
      const rest = queue.filter((e) => {
        if (e.user.id !== userId) return true;
        removed = e;
        return false;
      });
      if (rest.length) this.queues.set(id, rest);
      else this.queues.delete(id);
    }
    return removed;
  }

  find(userId: string): QueueEntry | null {
    for (const queue of this.queues.values()) {
      const e = queue.find((x) => x.user.id === userId);
      if (e) return e;
    }
    return null;
  }

  get size(): number {
    let n = 0;
    for (const q of this.queues.values()) n += q.length;
    return n;
  }

  /** Lấy ra các cặp ghép được lúc `now` (người chờ lâu được ưu tiên). */
  takePairs(now: number): [QueueEntry, QueueEntry][] {
    const pairs: [QueueEntry, QueueEntry][] = [];
    for (const [id, queue] of this.queues) {
      const waiting = [...queue].sort((a, b) => a.since - b.since);
      const used = new Set<QueueEntry>();
      for (const a of waiting) {
        if (used.has(a)) continue;
        let best: QueueEntry | null = null;
        for (const b of waiting) {
          if (b === a || used.has(b) || b.user.id === a.user.id) continue;
          const gap = Math.abs(a.user.rating - b.user.rating);
          if (gap > Math.max(ratingWindow(a, now), ratingWindow(b, now))) continue;
          if (!best || gap < Math.abs(a.user.rating - best.user.rating)) best = b;
        }
        if (best) {
          used.add(a);
          used.add(best);
          pairs.push([a, best]);
        }
      }
      const rest = queue.filter((e) => !used.has(e));
      if (rest.length) this.queues.set(id, rest);
      else this.queues.delete(id);
    }
    return pairs;
  }
}
