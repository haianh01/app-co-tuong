/**
 * Đo kỳ lý Triệu Hâm Hâm (trung cuộc + tàn cuộc) đúng như người dùng thấy: chạy reviewGame của app trên 203 ván đại sư
 * (MASTER_GAMES) với điểm và biến Pikafish (cache theo FEN trong .data/audit-cache), rồi đếm từng kỳ lý được gắn —
 * đã qua mọi bộ lọc của reviewMove (biến engine xác nhận, nước đáng bình, khen / chê theo phân loại nước) và bỏ lặp.
 * In kèm vài mẫu để đọc lại bằng mắt. Không có MultiPV nên nhãn "nước duy nhất / nước hay" không xuất hiện.
 *
 *   npx tsx scripts/audit-zhao-lessons.ts [--nodes 30000] [--samples 3] [--only phaoTramDay,danDu] [--games 203]
 */
import fs from "node:fs";
import path from "node:path";
import { reviewGame, type PositionEval } from "../src/lib/xiangqi/analysis";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import { legalMoves, parseFen, toFen, type Move } from "../src/lib/xiangqi/engine";
import { replayMoves } from "../src/lib/xiangqi/game";
import { MASTER_GAMES } from "../src/lib/xiangqi/master-games.generated";
import { engineScore, MATE_SCORE, uciToMove } from "../src/lib/xiangqi/uci";
import { getEnginePool } from "../src/server/engine/uci";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const NODES = Number(arg("--nodes", "30000"));
const SAMPLES = Number(arg("--samples", "3"));
const ONLY = new Set(arg("--only", "").split(",").filter(Boolean));
const GAMES = Number(arg("--games", String(MASTER_GAMES.length)));

type Cached = { cp: number | null; mate: number | null; pv: string[] };
const cacheDir = path.join(process.cwd(), ".data", "audit-cache");
const cacheFile = path.join(cacheDir, `master-all-${NODES}.json`);
const load = (f: string): Record<string, Cached> => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {});
// Thế tàn cuộc đã chấm sẵn bởi audit-endgame-principles.ts thì dùng lại
const cache: Record<string, Cached> = { ...load(path.join(cacheDir, `master-endgame-${NODES}.json`)), ...load(cacheFile) };
const save = () => {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
};

async function main() {
  const games = MASTER_GAMES.slice(0, GAMES).map((g) => {
    const conv = convertChineseGame(g.movesCN);
    return { id: g.id, state: replayMoves(conv.moves) };
  });

  // 1. Chấm engine mọi thế cờ còn thiếu
  const fens = [...new Set(games.flatMap((g) => g.state.history.map((p) => toFen(p))))]
    .filter((f) => !cache[f] && legalMoves(parseFen(f)).length > 0);
  if (fens.length) {
    console.error(`Cần chấm ${fens.length} thế cờ (${NODES} nodes)...`);
    const pool = getEnginePool();
    if (!pool) throw new Error("Không tìm thấy engine Pikafish (thư mục engine/)");
    let done = 0;
    await Promise.all(Array.from({ length: 2 }, async () => {
      for (let f = fens.pop(); f; f = fens.pop()) {
        const r = await pool.search(f, { nodes: NODES });
        cache[f] = { cp: r.cp, mate: r.mate, pv: r.pv ?? [] };
        if (++done % 500 === 0) {
          console.error(`  đã chấm ${done}...`);
          save();
        }
      }
    }));
    save();
    pool.close();
  }
  const evalOf = (fen: string): PositionEval => {
    const c = cache[fen];
    if (!c) return { score: -MATE_SCORE, best: null, pv: [] }; // hết nước đi
    const pv = c.pv.map(uciToMove).filter((m): m is Move => m !== null);
    return { score: engineScore(c.cp, c.mate), best: pv[0] ?? null, pv };
  };

  // 2. Chạy reviewGame và gom kỳ lý
  type Row = { n: number; critique: number; samples: string[] };
  const zhao = new Map<string, Row>();
  const endgame = new Map<string, Row>();
  let plies = 0;
  let middlePlies = 0;
  let withZhao = 0;
  for (const g of games) {
    const evals = g.state.history.map((p) => evalOf(toFen(p)));
    const review = reviewGame(g.state, evals);
    review.moves.forEach((r, i) => {
      plies++;
      if (r.phase !== "tanCuoc") middlePlies++;
      const before = g.state.history[i];
      const zf = r.facts.filter((f) => f.kind === "zhaoMiddlegame");
      if (zf.length) withZhao++;
      for (const f of r.facts) {
        if (f.kind !== "zhaoMiddlegame" && f.kind !== "endgamePrinciple") continue;
        const key = f.kind === "zhaoMiddlegame" ? f.tactic : f.principle;
        const table = f.kind === "zhaoMiddlegame" ? zhao : endgame;
        const row = table.get(key) ?? { n: 0, critique: 0, samples: [] };
        row.n++;
        if (f.tone === "critique") row.critique++;
        if (row.samples.length < (ONLY.has(key) ? 40 : SAMPLES)) {
          row.samples.push(
            `ván ${g.id} nửa nước ${r.ply} ${r.notation} (${r.cls ?? "-"}, loss ${r.loss}, điểm ${evals[i].score})\n` +
            `      ${toFen(before)}\n      ${f.summary}`,
          );
        }
        table.set(key, row);
      }
    });
  }

  const pct = (n: number, d: number) => `${(100 * n / d).toFixed(1)}%`;
  console.log(`${games.length} ván, ${plies} nửa nước (ngoài tàn cuộc ${middlePlies}); có kỳ lý trung cuộc: ${withZhao} (${pct(withZhao, plies)})\n`);
  for (const [title, table] of [["Kỳ lý trung cuộc (zhaoMiddlegame)", zhao], ["Nguyên lý tàn cuộc (endgamePrinciple)", endgame]] as const) {
    console.log(`${title}:`);
    for (const [key, row] of [...table].sort((a, b) => b[1].n - a[1].n)) {
      if (ONLY.size && !ONLY.has(key)) continue;
      console.log(`  ${key.padEnd(26)} ${String(row.n).padStart(5)}${row.critique ? ` (chê ${row.critique})` : ""}`);
      for (const s of row.samples) console.log(`    - ${s}`);
    }
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
