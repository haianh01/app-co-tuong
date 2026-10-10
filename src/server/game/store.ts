// Lưu các ván đang diễn ra xuống DB để khôi phục khi máy chủ khởi động lại.

import { eq } from "drizzle-orm";
import type { Database } from "../db";
import { liveGames } from "../db/schema";
import type { RoomData } from "./room";

export class LiveStore {
  /** Ghi tuần tự theo từng ván để lần ghi sau không bị lần ghi trước đè lên. */
  private chains = new Map<string, Promise<void>>();

  constructor(
    private readonly db: Database,
    private readonly log: (message: string, err?: unknown) => void,
  ) {}

  save(data: RoomData) {
    this.enqueue(data.id, async () => {
      const row = { id: data.id, data, updatedAt: new Date() };
      await this.db.insert(liveGames).values(row).onConflictDoUpdate({ target: liveGames.id, set: { data, updatedAt: row.updatedAt } });
    });
  }

  remove(id: string) {
    this.enqueue(id, async () => {
      await this.db.delete(liveGames).where(eq(liveGames.id, id));
    });
  }

  async loadAll(): Promise<RoomData[]> {
    const rows = await this.db.select().from(liveGames);
    return rows.map((r) => r.data as RoomData).filter((d) => d?.v === 1);
  }

  /** Chờ mọi lần ghi đang dở (dùng khi tắt máy chủ và trong test). */
  async flush() {
    await Promise.all(this.chains.values());
  }

  private enqueue(id: string, write: () => Promise<void>) {
    const next = (this.chains.get(id) ?? Promise.resolve())
      .then(write)
      .catch((err) => this.log(`Không lưu được ván đang chơi ${id}`, err));
    this.chains.set(id, next);
    void next.then(() => {
      if (this.chains.get(id) === next) this.chains.delete(id);
    });
  }
}
