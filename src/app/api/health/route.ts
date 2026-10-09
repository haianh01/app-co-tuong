import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/server/db";

/** Kiểm tra sức khỏe cho nền tảng triển khai / Playwright: app chạy và kết nối được CSDL. */
export async function GET() {
  await connection();
  try {
    await (await getDb()).execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
