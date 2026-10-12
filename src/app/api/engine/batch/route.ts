// Endpoint phân tích ván cờ theo lô (batch), trả về dòng dữ liệu NDJSON (Newline Delimited JSON).
// Giúp client nhận tiến độ từng nước theo thời gian thực trong 1 kết nối duy nhất,
// thay thế việc tạo ~150 HTTP request tuần tự.

import { connection } from "next/server";
import { legalMoves, parseFen, type Move } from "@/lib/xiangqi/engine";
import { engineScore, toUciFen, uciToMove } from "@/lib/xiangqi/uci";
import { engineCache, makeEngineCacheKey } from "@/server/engine/cache";
import { getEnginePool, type EngineLimits } from "@/server/engine/uci";
import { RateLimiter } from "@/server/rate-limit";

const ANALYSIS: EngineLimits = { nodes: 60_000, multipv: 3 };

// Mỗi IP cho phép 30 lượt batch phân tích / 5 phút (mỗi batch là cả một ván cờ).
const limiter = new RateLimiter(30, 5 * 60_000);
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  await connection();
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "127.0.0.1";
  if (!limiter.hit(ip)) {
    return Response.json({ error: "Quá nhiều yêu cầu phân tích" }, { status: 429, headers: noStore });
  }

  const pool = getEnginePool();
  if (!pool) return Response.json({ error: "Chưa cài engine" }, { status: 503, headers: noStore });
  if (pool.waiting > 32) return Response.json({ error: "Engine đang quá tải" }, { status: 503, headers: noStore });

  let body: { fens?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400, headers: noStore });
  }

  if (!Array.isArray(body.fens) || body.fens.length === 0) {
    return Response.json({ error: "Danh sách FEN không hợp lệ" }, { status: 400, headers: noStore });
  }

  const fens = body.fens.map(String);
  const total = fens.length;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < total; i++) {
        const fen = fens[i];
        let pos;
        try {
          pos = parseFen(fen);
        } catch {
          const errChunk = JSON.stringify({ index: i, total, error: "FEN không hợp lệ" }) + "\n";
          controller.enqueue(encoder.encode(errChunk));
          continue;
        }

        const legal = legalMoves(pos);
        if (legal.length === 0) {
          const emptyChunk =
            JSON.stringify({
              index: i,
              total,
              eval: { score: 0, best: null, depth: 0, pv: [], lines: [] },
            }) + "\n";
          controller.enqueue(encoder.encode(emptyChunk));
          continue;
        }

        const cacheKey = makeEngineCacheKey(fen, ANALYSIS);
        if (engineCache.has(cacheKey)) {
          const cached = engineCache.get(cacheKey)!;
          const best = cached.bestmove ? uciToMove(cached.bestmove) : null;
          const pvMoves = cached.pv ? cached.pv.map(uciToMove).filter((m): m is Move => m !== null) : [];
          const lines = cached.lines?.map((l) => ({
            best: l.bestmove ? uciToMove(l.bestmove) : null,
            score: engineScore(l.cp, l.mate),
            depth: l.depth,
            pv: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
          }));
          const chunk =
            JSON.stringify({
              index: i,
              total,
              eval: {
                score: engineScore(cached.cp, cached.mate),
                best,
                depth: cached.depth,
                pv: pvMoves,
                lines,
              },
            }) + "\n";
          controller.enqueue(encoder.encode(chunk));
          continue;
        }

        try {
          const res = await pool.search(toUciFen(pos), ANALYSIS);
          engineCache.set(cacheKey, res);
          const best = res.bestmove ? uciToMove(res.bestmove) : null;
          const pvMoves = res.pv ? res.pv.map(uciToMove).filter((m): m is Move => m !== null) : [];
          const lines = res.lines?.map((l) => ({
            best: l.bestmove ? uciToMove(l.bestmove) : null,
            score: engineScore(l.cp, l.mate),
            depth: l.depth,
            pv: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
          }));
          const chunk =
            JSON.stringify({
              index: i,
              total,
              eval: {
                score: engineScore(res.cp, res.mate),
                best,
                depth: res.depth,
                pv: pvMoves,
                lines,
              },
            }) + "\n";
          controller.enqueue(encoder.encode(chunk));
        } catch {
          const failChunk = JSON.stringify({ index: i, total, error: "Lỗi tìm kiếm engine" }) + "\n";
          controller.enqueue(encoder.encode(failChunk));
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      ...noStore,
    },
  });
}
