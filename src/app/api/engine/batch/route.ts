// Endpoint phân tích ván cờ theo lô (batch), trả về dòng dữ liệu NDJSON (Newline Delimited JSON).
// Giúp client nhận tiến độ từng nước theo thời gian thực trong 1 kết nối duy nhất,
// thay thế việc tạo ~150 HTTP request tuần tự.
//
// Kiến trúc 2 lượt (2-Pass Engine Analysis):
// - Pass 1 (Nhanh): 60k nodes, MultiPV 3 cho mọi thế cờ trong ván.
// - Pass 2 (Sâu): 1-3M nodes, MultiPV 4 cho tối đa 10 thế cờ then chốt (winDrop lớn, nước duy nhất, nước hay).

import { connection } from "next/server";
import { winChance, type PositionEval } from "@/lib/xiangqi/analysis";
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
import { getEnginePool, type EngineLimits, type EnginePool, type EngineResult } from "@/server/engine/uci";
import { RateLimiter } from "@/server/rate-limit";

export const ANALYSIS_FAST: EngineLimits = { nodes: 60_000, multipv: 3 };
export const ANALYSIS_DEEP: EngineLimits = {
  nodes: Math.max(500_000, Number(process.env.ENGINE_DEEP_NODES ?? 1_500_000)),
  multipv: Math.max(3, Number(process.env.ENGINE_DEEP_MULTIPV ?? 4)),
};

// Mỗi IP cho phép 30 lượt batch phân tích / 5 phút (mỗi batch là cả một ván cờ).
const limiter = new RateLimiter(30, 5 * 60_000);
const noStore = { "Cache-Control": "no-store" };

/**
 * Chọn lọc tối đa maxCount thế cờ then chốt để chạy lượt phân tích sâu (Pass 2):
 * - Thế bị tụt xác suất thắng nhiều (blunder, mistake, missedWin, inaccuracy).
 * - Nước duy nhất (only) hoặc nước hay (brilliant) có khoảng cách MultiPV lớn.
 * - Thế trận đổi bên dẫn trước.
 */
export function selectKeyPositions(evals: (PositionEval | null)[], maxCount: number = 10): number[] {
  if (evals.length <= 1) return [];
  const candidates: { index: number; score: number }[] = [];

  for (let i = 0; i < evals.length; i++) {
    const cur = evals[i];
    if (!cur) continue;
    let score = 0;
    let isCandidate = false;

    // 1. Kiểm tra mức giảm xác suất thắng giữa 2 nước liên tiếp
    const next = evals[i + 1];
    if (next) {
      const wBefore = cur.wdl ? cur.wdl[0] / 1000 : winChance(cur.score);
      const wAfter = next.wdl ? 1 - next.wdl[0] / 1000 : winChance(-next.score);
      const winDrop = Math.max(0, wBefore - wAfter);
      if (winDrop >= 0.05) {
        isCandidate = true;
        score += winDrop * 100;
        if (winDrop >= 0.20) score += 30; // Nước hớ nặng
        else if (winDrop >= 0.10) score += 15; // Nước kém
      }
      // Đổi bên dẫn trước (bước ngoặt)
      if ((wBefore > 0.55 && wAfter < 0.45) || (wBefore < 0.45 && wAfter > 0.55)) {
        isCandidate = true;
        score += 25;
      }
    }

    // 2. Nước duy nhất (only) hoặc nước hay (brilliant) theo MultiPV
    if (cur.lines && cur.lines.length >= 2) {
      const line1W = cur.lines[0]?.wdl ? cur.lines[0].wdl[0] / 1000 : winChance(cur.lines[0]?.score ?? cur.score);
      const line2W = cur.lines[1]?.wdl ? cur.lines[1].wdl[0] / 1000 : winChance(cur.lines[1]?.score ?? -1500);
      const deltaW = line1W - line2W;
      if (deltaW >= 0.15) {
        isCandidate = true;
        score += deltaW * 60;
      }
    }

    if (isCandidate) {
      candidates.push({ index: i, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxCount).map((c) => c.index).sort((a, b) => a - b);
}

function convertEngineResultToEval(res: EngineResult, fen: string): PositionEval {
  const best = res.bestmove ? uciToMove(res.bestmove) : null;
  const pvMoves = res.pv ? res.pv.map(uciToMove).filter((m): m is Move => m !== null) : [];
  const lines = res.lines?.map((l) => ({
    best: l.bestmove ? uciToMove(l.bestmove) : null,
    score: engineScore(l.cp, l.mate),
    depth: l.depth,
    pv: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
    wdl: l.wdl,
  }));
  return {
    score: engineScore(res.cp, res.mate),
    best,
    depth: res.depth,
    pv: pvMoves,
    lines,
    fen,
    wdl: res.wdl,
  };
}

interface Runner {
  search(fen: string, limits: EngineLimits, searchmoves?: string[], options?: { newGame?: boolean }): Promise<EngineResult>;
  newGame?(): Promise<void>;
}

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

      const executeAnalysis = async (runner: Runner) => {
        // Chỉ gửi ucinewgame 1 lần khi bắt đầu ván để giữ ấm bộ nhớ đệm (Hash) giữa các nước liên tiếp
        if (typeof runner.newGame === "function") {
          try {
            await runner.newGame();
          } catch {
            // Không làm gián đoạn nếu engine mock không hỗ trợ newGame
          }
        }

        // ==========================================
        // PASS 1: LƯỢT NHANH (60k nodes, MultiPV 3)
        // ==========================================
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

          const cacheKey = makeEngineCacheKey(fen, ANALYSIS_FAST);
          if (engineCache.has(cacheKey)) {
            const cached = engineCache.get(cacheKey)!;
            const cachedEval = convertEngineResultToEval(cached, fen);
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
            const res = await runner.search(toUciFen(pos), ANALYSIS_FAST);
            engineCache.set(cacheKey, res);
            const searchedEval = convertEngineResultToEval(res, fen);
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

        // ==========================================
        // PASS 2: LƯỢT SÂU (1.5M nodes, MultiPV 4)
        // Áp dụng cho tối đa 10 thế cờ then chốt
        // ==========================================
        const keyIndices = selectKeyPositions(collectedEvals, 10);
        for (const idx of keyIndices) {
          const fen = fens[idx];
          let pos;
          try {
            pos = parseFen(fen);
          } catch {
            continue;
          }

          const deepCacheKey = makeEngineCacheKey(fen, ANALYSIS_DEEP);
          if (engineCache.has(deepCacheKey)) {
            const cached = engineCache.get(deepCacheKey)!;
            const deepEval = convertEngineResultToEval(cached, fen);
            collectedEvals[idx] = deepEval;
            const updateChunk =
              JSON.stringify({
                index: idx,
                total,
                eval: deepEval,
                phase: "deep",
                isUpdate: true,
              }) + "\n";
            controller.enqueue(encoder.encode(updateChunk));
            continue;
          }

          try {
            const res = await runner.search(toUciFen(pos), ANALYSIS_DEEP);
            engineCache.set(deepCacheKey, res);
            const deepEval = convertEngineResultToEval(res, fen);
            collectedEvals[idx] = deepEval;
            const updateChunk =
              JSON.stringify({
                index: idx,
                total,
                eval: deepEval,
                phase: "deep",
                isUpdate: true,
              }) + "\n";
            controller.enqueue(encoder.encode(updateChunk));
          } catch {
            // Nếu tìm kiếm sâu thất bại, giữ nguyên kết quả của lượt nhanh
          }
        }
      };

      try {
        if (typeof (pool as Partial<EnginePool>).withProcess === "function") {
          await (pool as EnginePool).withProcess(async (proc) => {
            await executeAnalysis(proc);
          });
        } else {
          await executeAnalysis(pool);
        }
      } catch (err) {
        console.error("[analysis/batch] Lỗi tiến trình engine:", err);
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
