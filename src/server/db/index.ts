import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
}

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * - `url`: PostgreSQL thật (production).
 * - `dataDir`: PGlite – PostgreSQL nhúng, lưu vào thư mục (dev, không cần cài gì).
 * - không truyền gì: PGlite trong RAM (test).
 * Migration trong thư mục `drizzle/` luôn được chạy khi kết nối.
 */
export async function createDb(options: { url?: string; dataDir?: string } = {}): Promise<DbHandle> {
  if (options.url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: options.url, max: 10 });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS });
    return { db, close: () => pool.end() };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
  const client = new PGlite(options.dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}

// Server game (server.ts) và code của Next chạy chung một tiến trình nhưng là hai bản module khác nhau,
// nên kết nối được giữ trên globalThis để cả hai dùng chung (PGlite chỉ cho phép một kết nối tới thư mục dữ liệu).
const shared = globalThis as typeof globalThis & { __kydaiDb?: Promise<DbHandle> };

export function getDbHandle(): Promise<DbHandle> {
  shared.__kydaiDb ??= createDb(
    process.env.DATABASE_URL
      ? { url: process.env.DATABASE_URL }
      : { dataDir: process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite") },
  );
  return shared.__kydaiDb;
}

export async function getDb(): Promise<Database> {
  return (await getDbHandle()).db;
}
