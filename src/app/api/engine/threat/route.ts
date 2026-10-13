import { connection } from "next/server";
import { parseFen } from "@/lib/xiangqi/engine";
import { getEnginePool, type EngineLimits } from "@/server/engine/uci";
import { RateLimiter } from "@/server/rate-limit";

// Mỗi IP: 300 lần / 5 phút
const limiter = new RateLimiter(300, 5 * 60_000);
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  await connection();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  if (!limiter.hit(ip)) return Response.json({ error: "Quá nhiều yêu cầu" }, { status: 429, headers: noStore });

  const pool = getEnginePool();
  if (!pool) return Response.json({ error: "Chưa cài engine" }, { status: 503, headers: noStore });
  if (pool.waiting > 32) return Response.json({ error: "Engine đang quá tải" }, { status: 503, headers: noStore });

  let body: { fen?: unknown; limits?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400, headers: noStore });
  }

  const fenStr = String(body.fen ?? "");
  try {
    parseFen(fenStr);
  } catch {
    return Response.json({ error: "FEN không hợp lệ" }, { status: 400, headers: noStore });
  }

  const limits: EngineLimits =
    typeof body.limits === "object" && body.limits !== null
      ? (body.limits as EngineLimits)
      : { nodes: 40_000, multipv: 1 };

  try {
    const result = await pool.threat(fenStr, limits);
    return Response.json(result, { headers: noStore });
  } catch {
    return Response.json({ error: "Engine lỗi khi tính nước đe dọa" }, { status: 503, headers: noStore });
  }
}
