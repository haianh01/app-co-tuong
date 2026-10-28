// Engine mạnh trên server: máy cấp Trung bình trở lên, phân tích ván, huấn luyện.
// Trả 503 khi không có engine / quá tải để trình duyệt tự chuyển về AI JavaScript.

import { connection } from "next/server";
import { legalMoves, parseFen, type Move } from "@/lib/xiangqi/engine";
import { engineScore, moveToUci, toUciFen, uciToMove } from "@/lib/xiangqi/uci";
import { getEnginePool, type EngineLimits } from "@/server/engine/uci";
import { RateLimiter } from "@/server/rate-limit";

import { engineCache, makeEngineCacheKey } from "@/server/engine/cache";

/** Sức mạnh theo cấp. Pikafish không có chế độ giảm Elo, nên làm yếu bằng cách giới hạn số thế cờ được tính. */
const PLAY: Record<number, EngineLimits> = {
  3: { nodes: 2_000 },
  4: { nodes: 30_000 },
  5: { movetime: 1_500 },
};
/** Phân tích / huấn luyện: MultiPV = 3 để đánh giá các phương án lựa chọn, nodes 60k để chính xác. */
const ANALYSIS: EngineLimits = { nodes: 60_000, multipv: 3 };
/** Phân tích sâu một thế cờ (màn livestream xem lại / đi thử): cùng mức với lượt sâu của /api/engine/batch. */
const DEEP: EngineLimits = {
  nodes: Math.max(500_000, Number(process.env.ENGINE_DEEP_NODES ?? 1_500_000)),
  multipv: 3,
};

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

  let body: { fen?: unknown; purpose?: unknown; level?: unknown; avoid?: unknown; action?: unknown; move?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400, headers: noStore });
  }
  const fenStr = String(body.fen ?? "");
  let pos;
  try {
    pos = parseFen(fenStr);
  } catch {
    return Response.json({ error: "FEN không hợp lệ" }, { status: 400, headers: noStore });
  }

  if (body.action === "threat") {
    try {
      const threatRes = await pool.threat(fenStr);
      return Response.json(threatRes, { headers: noStore });
    } catch {
      return Response.json({ error: "Engine lỗi" }, { status: 503, headers: noStore });
    }
  }

  if (body.action === "refute") {
    if (!body.move || (typeof body.move !== "string" && typeof body.move !== "object")) {
      return Response.json({ error: "Nước đi không hợp lệ" }, { status: 400, headers: noStore });
    }
    try {
      const refuteRes = await pool.refute(fenStr, body.move as Move | string);
      return Response.json(refuteRes, { headers: noStore });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Engine lỗi";
      return Response.json({ error: msg }, { status: 400, headers: noStore });
    }
  }

  const limits = body.purpose === "analysis" ? ANALYSIS : body.purpose === "deep" ? DEEP : PLAY[Number(body.level)];
  if (!limits) return Response.json({ error: "Cấp độ không hợp lệ" }, { status: 400, headers: noStore });

  const legal = legalMoves(pos);
  if (legal.length === 0) return Response.json({ move: null, score: 0, depth: 0, nodes: 0 }, { headers: noStore });
  // Nước bị cấm (phạm luật chiếu mãi…): chỉ tìm trong các nước còn lại, trừ khi mọi nước đều bị cấm.
  const avoid = Array.isArray(body.avoid) ? (body.avoid as Move[]) : [];
  const allowed = legal.filter((m) => !avoid.some((a) => a?.from === m.from && a?.to === m.to));
  const searchmoves = avoid.length && allowed.length ? allowed.map(moveToUci) : undefined;

  const cacheKey = !searchmoves ? makeEngineCacheKey(fenStr, limits) : null;
  if (cacheKey && engineCache.has(cacheKey)) {
    const cached = engineCache.get(cacheKey)!;
    const move = cached.bestmove ? uciToMove(cached.bestmove) : null;
    const pvMoves = cached.pv ? cached.pv.map(uciToMove).filter((m): m is Move => m !== null) : [];
    const lines = cached.lines?.map((l) => ({
      move: l.bestmove ? uciToMove(l.bestmove) : null,
      score: engineScore(l.cp, l.mate),
      depth: l.depth,
      pv: l.pv,
      pvMoves: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
      wdl: l.wdl,
    }));
    return Response.json(
      {
        move,
        score: engineScore(cached.cp, cached.mate),
        depth: cached.depth,
        nodes: 0,
        pv: cached.pv ?? [],
        pvMoves,
        lines,
        wdl: cached.wdl,
      },
      { headers: { ...noStore, "X-Cache": "HIT" } },
    );
  }

  try {
    const res = await pool.search(toUciFen(pos), limits, searchmoves);
    if (cacheKey) engineCache.set(cacheKey, res);
    const move = res.bestmove ? uciToMove(res.bestmove) : null;
    const pvMoves = res.pv ? res.pv.map(uciToMove).filter((m): m is Move => m !== null) : [];
    const lines = res.lines?.map((l) => ({
      move: l.bestmove ? uciToMove(l.bestmove) : null,
      score: engineScore(l.cp, l.mate),
      depth: l.depth,
      pv: l.pv,
      pvMoves: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
      wdl: l.wdl,
    }));
    return Response.json(
      {
        move,
        score: engineScore(res.cp, res.mate),
        depth: res.depth,
        nodes: 0,
        pv: res.pv ?? [],
        pvMoves,
        lines,
        wdl: res.wdl,
      },
      { headers: noStore },
    );
  } catch {
    return Response.json({ error: "Engine lỗi" }, { status: 503, headers: noStore });
  }
}
