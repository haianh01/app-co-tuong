/**
 * evaluate-master-games.ts
 * ------------------------
 * Chạy reviewGame và Pikafish trên các ván đại sư đã thu thập từ xqbase.
 * Đo lường:
 * - Tỷ lệ nước cờ bị AI chấm là "sai lầm" (mistake) / "nước kém" (inaccuracy) / "sai lầm lớn" (blunder)
 * - Độ chính xác trung bình của các đại sư
 * - Trích xuất các nước cờ bị AI chê nặng nhất để phân tích nguyên nhân (AI chê nhầm hay đại sư sót cờ do áp lực thời gian)
 */

import fs from "node:fs";
import path from "node:path";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import {
  reviewGame,
  type PositionEval,
  type ReviewResult,
  type MoveClass,
} from "../src/lib/xiangqi/analysis";
import {
  parseFen,
  toFen,
  START_FEN,
  type Position,
} from "../src/lib/xiangqi/engine";
import {
  replayMoves,
  type GameState,
} from "../src/lib/xiangqi/game";
import { engineScore, uciToMove } from "../src/lib/xiangqi/uci";
import { getEnginePool, type UciProcess } from "../src/server/engine/uci";

const dataDir = path.join(process.cwd(), ".data", "master-games");
const allFiles = fs.readdirSync(dataDir).filter((f) => f.startsWith("game_") && f.endsWith(".json"));

// Cho phép truyền giới hạn số ván qua command line: --limit N (mặc định 50 ván để chạy nhanh, hoặc 'all')
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const nodesIdx = args.indexOf("--nodes");
const EVAL_NODES = nodesIdx !== -1 ? parseInt(args[nodesIdx + 1], 10) : 100_000;
const maxGames = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 50;

console.log(`Đang chuẩn bị đánh giá ${Math.min(maxGames, allFiles.length)} ván đại sư bằng Pikafish...`);

interface FaultIncident {
  gameid: number;
  players: string;
  ply: number;
  turn: string;
  playedNotation: string;
  aiSuggestedNotation: string | null;
  cls: MoveClass;
  scoreLoss: number;
  winDrop: number;
  facts: string[];
  fenBefore: string;
}

interface EvaluationSummary {
  gamesAnalyzed: number;
  totalPlies: number;
  avgRedAccuracy: number;
  avgBlackAccuracy: number;
  classCounts: Record<string, number>;
  classPercentages: Record<string, number>;
  topFaults: FaultIncident[];
}

async function evaluatePositionWithProc(
  proc: UciProcess,
  fen: string,
  turn: "r" | "b"
): Promise<PositionEval> {
  const res = await proc.search(fen, { nodes: EVAL_NODES }, undefined, { newGame: false });
  // Thế sát engine trả mate thay cho cp; phải quy đổi, không được coi là 0 điểm
  const rawScore = engineScore(res.cp, res.mate);
  // Pikafish trả điểm theo bên đang đi: dương = bên đang đi ưu thế
  const bestMove = res.bestmove ? uciToMove(res.bestmove) : null;
  const pvMoves = res.pv ? res.pv.map(uciToMove).filter((m): m is NonNullable<typeof m> => m !== null) : undefined;

  return {
    score: rawScore,
    best: bestMove,
    pv: pvMoves,
    depth: res.depth,
    wdl: res.wdl,
  };
}

async function run() {
  const pool = getEnginePool();
  if (!pool) {
    console.error("Không khởi tạo được engine pool.");
    return;
  }
  const summary: EvaluationSummary = {
    gamesAnalyzed: 0,
    totalPlies: 0,
    avgRedAccuracy: 0,
    avgBlackAccuracy: 0,
    classCounts: {
      best: 0,
      book: 0,
      brilliant: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
      missedWin: 0,
    },
    classPercentages: {},
    topFaults: [],
  };

  const redAccuracies: number[] = [];
  const blackAccuracies: number[] = [];

  const targetFiles = allFiles.slice(0, maxGames);

  await pool.withProcess(async (proc) => {
    // Warmup Pikafish
    await proc.search(START_FEN, { nodes: 15000 }, undefined, { newGame: false });

    for (let gIdx = 0; gIdx < targetFiles.length; gIdx++) {
      const file = targetFiles[gIdx];
      const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
      const rawMoves = content.moves_chinese ?? [];
      const conv = convertChineseGame(rawMoves);
      if (!conv.success || conv.moves.length < 10) continue;

      const t0 = Date.now();

      // Xây dựng GameState bằng replayMoves
      const state: GameState = replayMoves(conv.moves);

      // Đánh giá từng thế cờ (từ ply 0 đến ply N)
      const evals: (PositionEval | null)[] = [];
      for (let pIdx = 0; pIdx < conv.positions.length; pIdx++) {
        const pos = conv.positions[pIdx];
        const fen = toFen(pos);
        try {
          const ev = await evaluatePositionWithProc(proc, fen, pos.turn);
          evals.push(ev);
        } catch {
          evals.push(null);
        }
      }

      // Chạy reviewGame của app
      const reviewRes: ReviewResult = reviewGame(state, evals);

      if (reviewRes.accuracy.r !== null) redAccuracies.push(reviewRes.accuracy.r);
      if (reviewRes.accuracy.b !== null) blackAccuracies.push(reviewRes.accuracy.b);

      summary.gamesAnalyzed++;
      summary.totalPlies += reviewRes.moves.length;

      for (const m of reviewRes.moves) {
        if (m.cls && m.cls in summary.classCounts) {
          summary.classCounts[m.cls]++;
        }

        // Thu thập các nước bị chê là blunder hoặc mistake nặng
        if ((m.cls === "blunder" || m.cls === "mistake") && m.loss >= 120) {
          summary.topFaults.push({
            gameid: content.gameid,
            players: `${content.red_player} vs ${content.black_player}`,
            ply: m.ply,
            turn: m.side === "r" ? "Đỏ" : "Đen",
            playedNotation: m.notation,
            aiSuggestedNotation: m.better,
            cls: m.cls,
            scoreLoss: m.loss,
            winDrop: m.winDrop ?? 0,
            facts: m.facts.map((f) => f.kind),
            fenBefore: toFen(conv.positions[m.ply - 1]),
          });
        }
      }

      const elapsed = Date.now() - t0;
      console.log(
        `[${gIdx + 1}/${targetFiles.length}] Game ${content.gameid} ` +
          `(${content.red_player} vs ${content.black_player}): ` +
          `${conv.moves.length} plies, Acc: R ${reviewRes.accuracy.r}% / B ${reviewRes.accuracy.b}% (${elapsed}ms)`
      );
    }
  });

  pool.close();

  // Tính phần trăm & trung bình
  summary.avgRedAccuracy = Math.round(redAccuracies.reduce((a, b) => a + b, 0) / (redAccuracies.length || 1));
  summary.avgBlackAccuracy = Math.round(blackAccuracies.reduce((a, b) => a + b, 0) / (blackAccuracies.length || 1));

  for (const [cls, count] of Object.entries(summary.classCounts)) {
    summary.classPercentages[cls] = Math.round((count / (summary.totalPlies || 1)) * 1000) / 10;
  }

  // Sắp xếp các nước bị chê theo độ chênh lệch điểm (scoreLoss giảm dần)
  summary.topFaults.sort((a, b) => b.scoreLoss - a.scoreLoss);

  console.log("\n============================================================");
  console.log("KẾT QUẢ ĐO LƯỜNG: AI CHÊ NƯỚC ĐẠI SƯ");
  console.log("============================================================");
  console.log(`Số ván đã phân tích: ${summary.gamesAnalyzed}`);
  console.log(`Tổng số nửa nước (plies): ${summary.totalPlies}`);
  console.log(`Độ chính xác trung bình bên Đỏ: ${summary.avgRedAccuracy}%`);
  console.log(`Độ chính xác trung bình bên Đen: ${summary.avgBlackAccuracy}%`);
  console.log("\nPhân bố phân loại nước đi (Move Classification):");
  for (const [cls, count] of Object.entries(summary.classCounts)) {
    const pct = summary.classPercentages[cls];
    console.log(`  - ${cls.padEnd(12)}: ${count.toString().padStart(5)} nước (${pct}%)`);
  }

  console.log(`\nTổng số nước bị gắn nhãn sai sót:`);
  const totalFaults =
    summary.classCounts.inaccuracy + summary.classCounts.mistake + summary.classCounts.blunder;
  console.log(
    `  => ${totalFaults} / ${summary.totalPlies} nước (${Math.round((totalFaults / summary.totalPlies) * 1000) / 10}%)`
  );
  console.log(`     - Nước kém (inaccuracy) : ${summary.classCounts.inaccuracy} (${summary.classPercentages.inaccuracy}%)`);
  console.log(`     - Sai lầm (mistake)     : ${summary.classCounts.mistake} (${summary.classPercentages.mistake}%)`);
  console.log(`     - Sai lầm lớn (blunder) : ${summary.classCounts.blunder} (${summary.classPercentages.blunder}%)`);

  console.log(`\nTop 10 tình huống AI chê nặng nhất:`);
  for (let i = 0; i < Math.min(10, summary.topFaults.length); i++) {
    const f = summary.topFaults[i];
    console.log(
      `  ${i + 1}. [Game ${f.gameid}] ${f.players} - Ply ${f.ply} (${f.turn}): ` +
        `Đại sư đi ${f.playedNotation}, AI đòi đi ${f.aiSuggestedNotation} ` +
        `[${f.cls}, mất ${f.scoreLoss} cp, tụt ${(f.winDrop * 100).toFixed(1)}% thắng]`
    );
  }

  const outPath = path.join(dataDir, "ai_evaluation_report.json");
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nĐã lưu báo cáo chi tiết vào: ${outPath}`);
}

run().catch(console.error);
