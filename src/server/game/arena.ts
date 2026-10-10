// Ghép cặp giải Arena trong RAM: người đã bấm "Sẵn sàng", đang trực tuyến và không bận ván nào
// được ghép với người có điểm gần nhất (tránh gặp lại đối thủ vừa đấu nếu có lựa chọn khác).

import type { PlayerInfo } from "@/lib/online/protocol";
import type { Side } from "@/lib/xiangqi/engine";

export interface ArenaInfo {
  id: string;
  minutes: number;
  increment: number;
  variant: string;
  endsAt: number;
}

interface Entrant {
  user: PlayerInfo;
  score: number;
  lastOpponent: string | null;
  lastSide: Side | null;
  /** Không ghép trước thời điểm này (nghỉ vài giây sau mỗi ván). */
  restUntil: number;
}

export interface ArenaPairing {
  arena: ArenaInfo;
  red: PlayerInfo;
  black: PlayerInfo;
}

export const ARENA_REST_MS = 4000;

export class ArenaPool {
  private readonly arenas = new Map<string, ArenaInfo>();
  private readonly ready = new Map<string, Map<string, Entrant>>();
  /** Lịch sử theo giải (giữ cả khi tạm nghỉ, để tránh gặp lại và luân phiên màu). */
  private readonly memory = new Map<string, Map<string, Pick<Entrant, "lastOpponent" | "lastSide" | "score">>>();

  /** Cập nhật danh sách giải đang chạy (từ DB). Giải không còn trong danh sách bị xóa khỏi bộ nhớ. */
  sync(list: ArenaInfo[]) {
    const ids = new Set(list.map((a) => a.id));
    for (const id of this.arenas.keys()) {
      if (!ids.has(id)) {
        this.arenas.delete(id);
        this.ready.delete(id);
        this.memory.delete(id);
      }
    }
    for (const a of list) this.arenas.set(a.id, a);
  }

  has(id: string) {
    return this.arenas.has(id);
  }

  setReady(id: string, user: PlayerInfo, score: number) {
    const mem = this.mem(id).get(user.id);
    const set = this.ready.get(id) ?? new Map<string, Entrant>();
    const cur = set.get(user.id);
    set.set(user.id, {
      user,
      score,
      lastOpponent: mem?.lastOpponent ?? null,
      lastSide: mem?.lastSide ?? null,
      restUntil: cur?.restUntil ?? 0,
    });
    this.ready.set(id, set);
  }

  isReady(id: string, userId: string) {
    return !!this.ready.get(id)?.has(userId);
  }

  unready(id: string, userId: string) {
    this.ready.get(id)?.delete(userId);
  }

  /** Người chơi rời mạng: bỏ khỏi mọi giải (kết nối lại thì trang giải tự đăng ký lại). */
  drop(userId: string) {
    for (const set of this.ready.values()) set.delete(userId);
  }

  /** Ghi nhận ván vừa xong: cập nhật điểm, đối thủ, màu quân và cho nghỉ một chút. */
  finished(id: string, red: string, black: string, scores: Record<string, number>, now: number) {
    for (const [me, opp, side] of [[red, black, "r"], [black, red, "b"]] as const) {
      const mem = { lastOpponent: opp, lastSide: side as Side, score: scores[me] ?? this.mem(id).get(me)?.score ?? 0 };
      this.mem(id).set(me, mem);
      const e = this.ready.get(id)?.get(me);
      if (e) Object.assign(e, mem, { restUntil: now + ARENA_REST_MS });
    }
  }

  /** Lấy các cặp ghép được lúc này. `available` kiểm tra người chơi còn trực tuyến và không bận. */
  pair(now: number, available: (userId: string) => boolean): ArenaPairing[] {
    const out: ArenaPairing[] = [];
    for (const [id, set] of this.ready) {
      const arena = this.arenas.get(id);
      if (!arena || now >= arena.endsAt) continue;
      const pool = [...set.values()]
        .filter((e) => e.restUntil <= now && available(e.user.id))
        .sort((a, b) => b.score - a.score || b.user.rating - a.user.rating);
      while (pool.length >= 2) {
        const a = pool.shift()!;
        // Đối thủ điểm gần nhất, trừ người vừa đấu (trừ khi chỉ còn đúng người đó).
        let j = pool.findIndex((b) => b.user.id !== a.lastOpponent && a.user.id !== b.lastOpponent);
        if (j < 0) {
          if (pool.length > 1) continue; // để a chờ lượt sau, ghép những người còn lại
          j = 0;
        }
        const [b] = pool.splice(j, 1);
        // Luân phiên màu: ai vừa cầm Đỏ thì lần này cầm Đen.
        const aRed = a.lastSide === "r" ? false : b.lastSide === "r" ? true : a.lastSide === "b" || Math.random() < 0.5;
        out.push({ arena, red: aRed ? a.user : b.user, black: aRed ? b.user : a.user });
      }
    }
    return out;
  }

  private mem(id: string) {
    let m = this.memory.get(id);
    if (!m) {
      m = new Map();
      this.memory.set(id, m);
    }
    return m;
  }
}
