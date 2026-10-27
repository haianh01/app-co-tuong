/**
 * Đo kỳ lý khai cuộc Triệu Hâm Hâm trên 203 ván đại sư (MASTER_GAMES)
 * qua luồng reviewGame thật của app, sử dụng cache Pikafish 30k nodes.
 *
 *   npx tsx scripts/audit-opening-principles.ts [--samples 3] [--games 203]
 */
import fs from "node:fs";
import path from "node:path";
import { reviewGame, type PositionEval } from "../src/lib/xiangqi/analysis";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import { toFen, type Move } from "../src/lib/xiangqi/engine";
import { replayMoves } from "../src/lib/xiangqi/game";
import { MASTER_GAMES } from "../src/lib/xiangqi/master-games.generated";
import { engineScore, MATE_SCORE, uciToMove } from "../src/lib/xiangqi/uci";
import { ZHAO_OPENING_LESSONS } from "../src/lib/xiangqi/zhao48-opening-lessons";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const SAMPLES = Number(arg("--samples", "3"));
const GAMES = Number(arg("--games", String(MASTER_GAMES.length)));

type Cached = { cp: number | null; mate: number | null; pv: string[] };
const cacheDir = path.join(process.cwd(), ".data", "audit-cache");
const cacheFile = path.join(cacheDir, "master-all-30000.json");

if (!fs.existsSync(cacheFile)) {
  console.error("Không tìm thấy file cache:", cacheFile);
  process.exit(1);
}

const cache: Record<string, Cached> = JSON.parse(fs.readFileSync(cacheFile, "utf8"));

function evalOf(fen: string): PositionEval {
  const c = cache[fen] ?? cache[fen.split(" ").slice(0, 2).join(" ")];
  if (!c) return { score: -MATE_SCORE, best: null, pv: [] };
  const pv = c.pv.map(uciToMove).filter((m): m is Move => m !== null);
  return { score: engineScore(c.cp, c.mate), best: pv[0] ?? null, pv };
}

interface StatRow {
  lesson: number;
  title: string;
  tactic: string;
  total: number;
  praise: number;
  critique: number;
  samples: { gameId: number; ply: number; fen: string; text: string }[];
}

async function main() {
  const games = MASTER_GAMES.slice(0, GAMES).map((g) => {
    const conv = convertChineseGame(g.movesCN);
    return { id: g.id, state: replayMoves(conv.moves) };
  });

  const stats = new Map<number, StatRow>();
  for (let i = 1; i <= 48; i++) {
    const card = ZHAO_OPENING_LESSONS[i];
    stats.set(i, {
      lesson: i,
      title: card.title,
      tactic: card.tacticId,
      total: 0,
      praise: 0,
      critique: 0,
      samples: [],
    });
  }

  let totalPlies = 0;
  let openingPlies = 0; // <= 24 nửa nước đầu
  let pliesWithOpeningFact = 0;
  let totalOpeningFaults = 0;

  for (const g of games) {
    const evals = g.state.history.map((p) => evalOf(toFen(p)));
    const review = reviewGame(g.state, evals);

    review.moves.forEach((r, i) => {
      totalPlies++;
      const isOpeningPly = i < 24;
      if (isOpeningPly) openingPlies++;

      const openingFacts = r.facts.filter((f) => f.kind === "zhaoOpening");
      const faults = r.facts.filter((f) => f.kind === "openingFault");
      totalOpeningFaults += faults.length;

      if (openingFacts.length > 0) {
        pliesWithOpeningFact++;
        for (const f of openingFacts) {
          if (f.kind !== "zhaoOpening") continue;
          const row = stats.get(f.lesson);
          if (!row) continue;
          row.total++;
          if (f.tone === "critique") {
            row.critique++;
          } else {
            row.praise++;
          }
          if (row.samples.length < SAMPLES) {
            row.samples.push({
              gameId: g.id,
              ply: i + 1,
              fen: toFen(g.state.history[i]),
              text: f.summary,
            });
          }
        }
      }
    });
  }

  console.log("================================================================================");
  console.log(`BÁO CÁO AUDIT KỲ LÝ KHAI CUỘC TRÊN ${games.length} VÁN ĐẠI SƯ (MASTER_GAMES)`);
  console.log("================================================================================");
  console.log(`Tổng số nước đi toàn ván: ${totalPlies}`);
  console.log(`Số nước trong giai đoạn khai cuộc (≤ 24 nửa nước đầu): ${openingPlies}`);
  console.log(`Số nước được gắn kỳ lý khai cuộc Triệu Hâm Hâm: ${pliesWithOpeningFact} (${((pliesWithOpeningFact / openingPlies) * 100).toFixed(2)}% nước khai cuộc)`);
  console.log(`Tổng số lỗi openingFault phát hiện: ${totalOpeningFaults}`);
  console.log("--------------------------------------------------------------------------------\n");

  console.log("| Bài | Tên bài | Tactic ID | Tổng | Khen | Chê |");
  console.log("|-----|---------|-----------|------|------|-----|");

  const activeRows: StatRow[] = [];
  const zeroRows: StatRow[] = [];

  for (let i = 1; i <= 48; i++) {
    const row = stats.get(i)!;
    if (row.total > 0) {
      activeRows.push(row);
      console.log(`| ${row.lesson} | ${row.title} | \`${row.tactic}\` | ${row.total} | ${row.praise} | ${row.critique} |`);
    } else {
      zeroRows.push(row);
    }
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`CÁC BÀI ĐÃ BẮN (${activeRows.length} bài) VÀ MẪU ĐỐI SOÁT:`);
  console.log("--------------------------------------------------------------------------------");
  for (const row of activeRows) {
    console.log(`\n### Bài ${row.lesson}: ${row.title} (Tổng: ${row.total} - Khen: ${row.praise}, Chê: ${row.critique})`);
    for (let s = 0; s < row.samples.length; s++) {
      const sample = row.samples[s];
      console.log(`  [Mẫu ${s + 1}] Ván #${sample.gameId}, Nước ${sample.ply}:`);
      console.log(`    FEN: ${sample.fen}`);
      console.log(`    Lời bình: ${sample.text}`);
    }
  }

  console.log("\n--------------------------------------------------------------------------------");
  console.log(`CÁC BÀI CHƯA BẮN LẦN NÀO TRÊN 203 VÁN ĐẠI SƯ (${zeroRows.length} bài):`);
  console.log("--------------------------------------------------------------------------------");
  for (const row of zeroRows) {
    const card = ZHAO_OPENING_LESSONS[row.lesson];
    console.log(`- Bài ${row.lesson}: ${row.title} (kind: ${card.kind})`);
  }
}

main().catch((err) => {
  console.error("Lỗi audit:", err);
  process.exit(1);
});
