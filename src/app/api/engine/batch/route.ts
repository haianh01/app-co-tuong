// Endpoint phân tích ván cờ theo lô (batch), trả về dòng dữ liệu NDJSON (Newline Delimited JSON).
// Giúp client nhận tiến độ từng nước theo thời gian thực trong 1 kết nối duy nhất,
// thay thế việc tạo ~150 HTTP request tuần tự.

import { connection } from "next/server";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import { legalMoves, parseFen, type Move } from "@/lib/xiangqi/engine";
import { engineScore, toUciFen, uciToMove } from "@/lib/xiangqi/uci";
import {
  FREE_ANALYSIS_PER_DAY,
  consumeAnalysisQuota,
  getSavedAnalysis,
  saveGameAnalysis,
} from "@/server/analysis/store";
import { SESSION_COOKIE, getUserBySession, parseCookies, type AuthUser } from "@/server/auth";
import { getDb } from "@/server/db";
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

  let body: { fens?: unknown; gameId?: unknown };
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
  const gameId = typeof body.gameId === "string" && /^[A-Za-z0-9]{6,12}$/.test(body.gameId) ? body.gameId : undefined;

  const db = await getDb();
  let user: AuthUser | null = null;
  const token = parseCookies(request.headers.get("cookie") ?? undefined)[SESSION_COOKIE];
  if (token) {
    user = await getUserBySession(db, token);
  }

  // Nếu ván online đã được phân tích trước đó (cùng version và khớp thế cờ), dùng lại ngay kết quả đã lưu mà không tốn quota.
  if (gameId) {
    const saved = await getSavedAnalysis(db, gameId);
    const matches =
      saved &&
      saved.length === total &&
      saved.every((item, i) => !item?.fen || item.fen === fens[i]);

    if (matches) {
      const stream = new ReadableStream({
        start(controller) {
          for (let i = 0; i < saved.length; i++) {
            const chunk = JSON.stringify({ index: i, total: saved.length, eval: saved[i] }) + "\n";
            controller.enqueue(encoder.encode(chunk));
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
  }

  const pool = getEnginePool();
  if (!pool) return Response.json({ error: "Chưa cài engine" }, { status: 503, headers: noStore });
  if (pool.waiting > 32) return Response.json({ error: "Engine đang quá tải" }, { status: 503, headers: noStore });

  // Kiểm tra và trừ quota trên máy chủ (user mỗi ngày, khách theo IP)
  const quota = await consumeAnalysisQuota(db, user, ip);
  if (!quota.success) {
    return Response.json(
      { error: `Bạn đã dùng hết ${FREE_ANALYSIS_PER_DAY} lượt phân tích miễn phí hôm nay.` },
      { status: 429, headers: noStore },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const collectedEvals: (PositionEval | null)[] = [];

      for (let i = 0; i < total; i++) {
        const fen = fens[i];
        let pos;
        try {
          pos = parseFen(fen);
        } catch {
          const errChunk = JSON.stringify({ index: i, total, error: "FEN không hợp lệ" }) + "\n";
          controller.enqueue(encoder.encode(errChunk));
          collectedEvals.push(null);
          continue;
        }

        const legal = legalMoves(pos);
        if (legal.length === 0) {
          const emptyEval: PositionEval = { score: 0, best: null, depth: 0, pv: [], lines: [], fen };
          collectedEvals.push(emptyEval);
          const emptyChunk =
            JSON.stringify({
              index: i,
              total,
              eval: emptyEval,
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
          const cachedEval: PositionEval = {
            score: engineScore(cached.cp, cached.mate),
            best,
            depth: cached.depth,
            pv: pvMoves,
            lines,
            fen,
          };
          collectedEvals.push(cachedEval);
          const chunk =
            JSON.stringify({
              index: i,
              total,
              eval: cachedEval,
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
          const searchedEval: PositionEval = {
            score: engineScore(res.cp, res.mate),
            best,
            depth: res.depth,
            pv: pvMoves,
            lines,
            fen,
          };
          collectedEvals.push(searchedEval);
          const chunk =
            JSON.stringify({
              index: i,
              total,
              eval: searchedEval,
            }) + "\n";
          controller.enqueue(encoder.encode(chunk));
        } catch {
          collectedEvals.push(null);
          const failChunk = JSON.stringify({ index: i, total, error: "Lỗi tìm kiếm engine" }) + "\n";
          controller.enqueue(encoder.encode(failChunk));
        }
      }

      // Lưu kết quả phân tích nếu là ván online và tính toán thành công
      if (gameId && collectedEvals.length === total && !collectedEvals.some((e) => e === null)) {
        try {
          await saveGameAnalysis(db, gameId, collectedEvals);
        } catch (err) {
          console.error(`[analysis/batch] Không thể lưu phân tích ván ${gameId}:`, err);
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
