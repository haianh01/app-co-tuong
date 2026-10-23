/**
 * Đối chiếu điều kiện gắn kỳ lý (biến engine phải xác nhận, xem src/lib/xiangqi/zhao-outcome.ts)
 * với phán quyết người chấm trong .data/expert-commentary/zhao_ratings_round*.json.
 * Mẫu chấm "Đúng" thì phải được gắn; "Sai"/"Chung chung" thì phải bị bỏ.
 *
 *   npx tsx scripts/eval-zhao-ratings.ts [--file zhao_ratings_round1.json] [--nodes 400000]
 */
import fs from "node:fs";
import path from "node:path";
import { opponent, parseFen, play, toFen } from "../src/lib/xiangqi/engine";
import { moveNotation } from "../src/lib/xiangqi/notation";
import { engineScore, uciToMove } from "../src/lib/xiangqi/uci";
import { moveOutcomeFromEval, type PositionEval } from "../src/lib/xiangqi/analysis";
import { zhaoOutcomeAllows } from "../src/lib/xiangqi/zhao-outcome";
import { getEnginePool } from "../src/server/engine/uci";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const file = path.join(process.cwd(), ".data", "expert-commentary", arg("--file", "zhao_ratings_round1.json"));
const nodes = Number(arg("--nodes", "400000"));

async function main() {
  const pool = getEnginePool();
  if (!pool) throw new Error("Không tìm thấy engine Pikafish (engine/pikafish-linux)");
  const samples = JSON.parse(fs.readFileSync(file, "utf8")).samples;
  let agree = 0;
  let rated = 0;
  for (const s of samples) {
    const pos = parseFen(s.fen);
    const move = { from: s.from, to: s.to };
    const after = play(pos.board, move);
    const r = await pool.search(toFen({ board: after, turn: opponent(pos.turn) }), { nodes });
    const pv = (r.pv ?? []).map(uciToMove).filter((m): m is NonNullable<typeof m> => m !== null);
    const ev: PositionEval = { score: engineScore(r.cp, r.mate), best: pv[0] ?? null, pv };
    const o = moveOutcomeFromEval(pos.board, move, ev)!;
    const keep = zhaoOutcomeAllows(s.tactic, o, pos.turn);
    const ok = s.verdict === "dung" ? keep : s.verdict ? !keep : null;
    if (ok !== null) {
      rated++;
      if (ok) agree++;
    }
    let b = after;
    const line = pv.slice(0, 6).map((m) => {
      const n = moveNotation(b, m);
      b = play(b, m);
      return n;
    });
    console.log(
      `${s.id} ${String(s.verdict).padEnd(5)} ${s.tactic.padEnd(20)} ${o.kind.padEnd(13)} now ${String(o.materialNow).padStart(4)} ` +
        `settled ${String(o.materialSettled).padStart(5)} → ${keep ? "GẮN" : "bỏ "} ${ok === null ? "" : ok ? "✓" : "✗"}  ${line.join(" ")}`,
    );
  }
  console.log(`\nKhớp với người chấm: ${agree}/${rated}`);
  pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
