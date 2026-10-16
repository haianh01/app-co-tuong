/**
 * Lấy mẫu ngẫu nhiên các nước được detectIntent gán ý chính, để người hiểu cờ chấm đúng/sai.
 * Chạy Pikafish trên các ván đại sư (.data/expert-commentary), gom theo nhãn ý chính rồi chọn ngẫu nhiên
 * (seed cố định) mỗi nhãn `--per` ca. Xuất JSON gồm FEN trước nước đi, nước đi, câu tóm tắt và biến tiếp theo.
 *
 * Sử dụng: npx tsx scripts/sample-intents.ts --out <file.json> [--per 15] [--nodes 20000]
 */

import fs from "node:fs";
import path from "node:path";
import { legalMoves, opponent, play, START_FEN, parseFen, toFen, type Move } from "../src/lib/xiangqi/engine";
import { replayMoves } from "../src/lib/xiangqi/game";
import { detectIntent, type Purpose } from "../src/lib/xiangqi/intent";
import { moveNotation } from "../src/lib/xiangqi/notation";
import { getEnginePool, type UciProcess } from "../src/server/engine/uci";
import { engineScore, uciToMove } from "../src/lib/xiangqi/uci";

const args = process.argv.slice(2);
const arg = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = arg("--out", "intent-samples.json");
const PER = parseInt(arg("--per", "15"), 10);
const NODES = parseInt(arg("--nodes", "20000"), 10);
const LABELS: Purpose[] = ["giuTien", "anQuan", "hoaGiai", "thiQuan", "doiQuan"];
// Gom dư ứng viên rồi mới chọn ngẫu nhiên, để mẫu trải đều nhiều ván thay vì dồn vào vài ván đầu
const POOL_TARGET = PER * 4;

/** Sinh số giả ngẫu nhiên có seed (mulberry32) để lần chạy sau ra cùng bộ mẫu. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sample {
  id: string;
  label: Purpose;
  fen: string;
  move: Move;
  notation: string;
  side: "r" | "b";
  moveNo: number;
  summary: string;
  purposes: Purpose[];
  line: string[];
  game: string;
}

async function main() {
  const pool = getEnginePool();
  if (!pool) throw new Error("Không khởi tạo được Pikafish");
  const dataDir = path.join(process.cwd(), ".data", "expert-commentary");
  const rand = rng(20261016);
  const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("tlkd_") && f.endsWith(".json"));
  // Xáo thứ tự ván để không thiên về các ván đầu thư mục
  files.sort(() => rand() - 0.5);

  const buckets = new Map<Purpose, Sample[]>(LABELS.map((l) => [l, []]));
  const full = () => LABELS.every((l) => buckets.get(l)!.length >= POOL_TARGET);

  await pool.withProcess(async (proc: UciProcess) => {
    for (const file of files) {
      if (full()) break;
      const game = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
      const moves: Move[] = game.movesCoords.map((m: { from: number; to: number }) => ({ from: m.from, to: m.to }));
      let pos = parseFen(START_FEN);
      let legal = true;
      for (const m of moves) {
        if (!legalMoves(pos).some((x) => x.from === m.from && x.to === m.to)) {
          legal = false;
          break;
        }
        pos = { board: play(pos.board, m), turn: opponent(pos.turn) };
      }
      if (!legal) continue;

      const state = replayMoves(moves);
      const evals: { score: number; pv: Move[] }[] = [];
      for (const p of state.history) {
        const r = await proc.search(toFen(p), { nodes: NODES }, undefined, { newGame: false });
        evals.push({ score: engineScore(r.cp, r.mate), pv: (r.pv ?? []).map(uciToMove).filter((x): x is Move => x !== null) });
      }

      state.moves.forEach((pm, i) => {
        const before = state.history[i];
        const after = state.history[i + 1];
        const moverAfter = -evals[i + 1].score;
        const intent = detectIntent(before.board, pm.move, after.board, {
          pv: [pm.move, ...evals[i + 1].pv],
          evalBefore: { score: evals[i].score },
          evalAfter: { score: evals[i + 1].score },
          loss: Math.max(0, evals[i].score - moverAfter),
        });
        const label = intent?.primaryPurpose;
        if (!intent || !label || !buckets.has(label)) return;
        const bucket = buckets.get(label)!;
        if (bucket.length >= POOL_TARGET) return;
        // Biến tiếp theo: các nước engine tính sau nước đã đi (tối đa 4 nửa nước)
        const line: string[] = [];
        let b = after.board;
        for (const m of evals[i + 1].pv.slice(0, 4)) {
          if (!b[m.from]) break;
          line.push(moveNotation(b, m));
          b = play(b, m);
        }
        bucket.push({
          id: `${game.id}_${i + 1}`,
          label,
          fen: toFen(before),
          move: pm.move,
          notation: pm.notation,
          side: pm.side,
          moveNo: Math.ceil((i + 1) / 2),
          summary: intent.summary,
          purposes: intent.purposes,
          line,
          game: `${game.red} vs ${game.black}`,
        });
      });
      process.stdout.write(`\r${LABELS.map((l) => `${l}:${buckets.get(l)!.length}`).join(" ")}   `);
    }
  });

  const out: Sample[] = [];
  for (const l of LABELS) {
    const b = buckets.get(l)!;
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    out.push(...b.slice(0, PER));
  }
  // Trộn thứ tự giữa các nhãn để người chấm không bị "quen tay" theo từng nhãn
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\nĐã ghi ${out.length} mẫu vào ${OUT}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
