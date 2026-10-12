// CSDL cho các file `*.db.test.ts`: một PGlite trong RAM dùng chung cho mọi file (nhóm "db" chạy tuần tự trong
// một worker, không cô lập module), vì mỗi instance tốn ~3 giây khởi động và ~0,5 GB RAM.
// Instance được đặt vào đúng chỗ `getDb()` đọc, nên route handler và server action cũng dùng CSDL test này.

import { sql } from "drizzle-orm";
import { createDb, type Database, type DbHandle } from "@/server/db";
import { users, type User } from "@/server/db/schema";

const shared = globalThis as typeof globalThis & { __kydaiDb?: Promise<DbHandle> };

export async function testDb(): Promise<Database> {
  shared.__kydaiDb ??= createDb();
  return (await shared.__kydaiDb).db;
}

/** Xóa sạch dữ liệu mọi bảng (gọi ở đầu mỗi file để các file không ảnh hưởng nhau). */
export async function resetDb(): Promise<Database> {
  const db = await testDb();
  await db.execute(sql`
    truncate table games, sessions, users, oauth_accounts, email_tokens, coin_transactions, puzzle_progress,
      user_items, payments, reports, live_games, tournaments, tournament_players, season_rewards,
      game_analysis, analysis_usage
    cascade
  `);
  return db;
}

let seq = 0;

/** Thêm người dùng thẳng vào DB (không băm mật khẩu, nhanh hơn registerUser nhiều). */
export async function insertUser(db: Database, values: Partial<typeof users.$inferInsert> = {}): Promise<User> {
  seq++;
  const [user] = await db
    .insert(users)
    .values({ username: `user${seq}`, displayName: `Người chơi ${seq}`, passwordHash: "khong-dang-nhap-duoc", ...values })
    .returning();
  return user;
}

export const playerInfo = (u: User) => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  rating: u.rating,
  isGuest: u.isGuest,
  avatar: u.avatar,
  frame: u.frame,
});
