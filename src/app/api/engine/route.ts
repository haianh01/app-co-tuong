// Engine mạnh trên server: máy cấp Trung bình trở lên, phân tích ván, huấn luyện.
// Trả 503 khi không có engine / quá tải để trình duyệt tự chuyển về AI JavaScript.

import { connection } from "next/server";
import { legalMoves, parseFen, type Move } from "@/lib/xiangqi/engine";
import { engineScore, moveToUci, toUciFen, uciToMove } from "@/lib/xiangqi/uci";
import { getEnginePool, type EngineLimits } from "@/server/engine/uci";
import { RateLimiter } from "@/server/rate-limit";

/** Sức mạnh theo cấp. Pikafish không có chế độ giảm Elo, nên làm yếu bằng cách giới hạn số thế cờ được tính. */
const PLAY: Record<number, EngineLimits> = {
  3: { nodes: 2_000 },
  4: { nodes: 30_000 },
  5: { movetime: 1_500 },
};
/** Phân tích / huấn luyện: đủ sâu để chính xác (khoảng 12–14 nửa nước) mà vẫn nhanh. */
const ANALYSIS: EngineLimits = { nodes: 60_000 };

// Mỗi IP: 600 lần / 5 phút (phân tích một ván dài ~ 100–200 lần).
const limiter = new RateLimiter(600, 5 * 60_000);
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  await connection();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  if (!limiter.hit(ip)) return Response.json({ error: "Quá nhiều yêu cầu" }, { status: 429, headers: noStore });

  const pool = getEnginePool();
  if (!pool) return Response.json({ error: "Chưa cài engine" }, { status: 503, headers: noStore });
  if (pool.waiting > 32) return Response.json({ error: "Engine đang quá tải" }, { status: 503, headers: noStore });

  let body: { fen?: unknown; purpose?: unknown; level?: unknown; avoid?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400, headers: noStore });
  }
  let pos;
  try {
    pos = parseFen(String(body.fen ?? ""));
  } catch {
    return Response.json({ error: "FEN không hợp lệ" }, { status: 400, headers: noStore });
  }
  const limits = body.purpose === "analysis" ? ANALYSIS : PLAY[Number(body.level)];
  if (!limits) return Response.json({ error: "Cấp độ không hợp lệ" }, { status: 400, headers: noStore });

  const legal = legalMoves(pos);
  if (legal.length === 0) return Response.json({ move: null, score: 0, depth: 0, nodes: 0 }, { headers: noStore });
  // Nước bị cấm (phạm luật chiếu mãi…): chỉ tìm trong các nước còn lại, trừ khi mọi nước đều bị cấm.
  const avoid = Array.isArray(body.avoid) ? (body.avoid as Move[]) : [];
  const allowed = legal.filter((m) => !avoid.some((a) => a?.from === m.from && a?.to === m.to));
  const searchmoves = avoid.length && allowed.length ? allowed.map(moveToUci) : undefined;

  try {
    const res = await pool.search(toUciFen(pos), limits, searchmoves);
    const move = res.bestmove ? uciToMove(res.bestmove) : null;
    return Response.json({ move, score: engineScore(res.cp, res.mate), depth: res.depth, nodes: 0 }, { headers: noStore });
  } catch {
    return Response.json({ error: "Engine lỗi" }, { status: 503, headers: noStore });
  }
}
