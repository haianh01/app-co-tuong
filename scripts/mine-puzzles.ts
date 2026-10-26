// Khai thác cờ thế sát cục từ kho kỳ phổ trong data/kypho-raw/qp (适情雅趣, 烂柯神机, 绝对精妙杀局…).
// Bước 1 (screen): giải mã bày quân, Pikafish quét nhanh, giữ thế Đỏ đi trước chiếu bí được trong 3–9 nước.
// Kết quả ghi nối tiếp vào .data/puzzle-mining/screen.jsonl (chạy lại thì bỏ qua file đã quét).
//   npx tsx scripts/mine-puzzles.ts [số engine, mặc định 4] [nodes, mặc định 300000]

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { inCheck, outcome, toFen, type Board } from "../src/lib/xiangqi/engine";
import { Engine } from "./lib/pikafish";
import { decodeQp, decodeXqf } from "./lib/xqf";

const [workers = 4, nodes = 300_000] = process.argv.slice(2).map(Number);
const ROOT = path.join(process.cwd(), "data", "kypho-raw", "qp");
const OUT_DIR = path.join(process.cwd(), ".data", "puzzle-mining");
const OUT = path.join(OUT_DIR, "screen.jsonl");

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = path.join(d, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

interface Item { file: string; title: string; fen: string }

function load(): Item[] {
  const files = [...walk(path.join(ROOT, "XQF-象棋谱大全", "残局")), ...walk(path.join(ROOT, "ChessQ-gamebooks"))];
  const seen = new Set<string>();
  const items: Item[] = [];
  for (const file of files) {
    let board: Board | null = null;
    let title = "";
    if (/\.xqf$/i.test(file)) {
      const d = decodeXqf(readFileSync(file));
      if (d) ({ board, title } = d);
    } else if (/\.qp$/i.test(file)) board = decodeQp(readFileSync(file));
    if (!board) continue;
    const pos = { board, turn: "r" as const };
    if (inCheck(board, "b") || outcome(pos).over) continue;
    const fen = toFen(pos);
    if (seen.has(fen)) continue;
    seen.add(fen);
    items.push({ file: path.relative(ROOT, file).replaceAll("\\", "/"), title, fen });
  }
  return items;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const done = new Set(
    existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).fen as string) : [],
  );
  const todo = load().filter((it) => !done.has(it.fen));
  console.log(`còn ${todo.length} thế cần quét (${done.size} đã có)`);
  let next = 0;
  let found = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: workers }, async () => {
      const e = new Engine(32);
      await e.ready();
      while (next < todo.length) {
        const it = todo[next++];
        const [best] = await e.search(`${it.fen} - - 0 1`, `nodes ${nodes}`);
        const rec = { ...it, mate: best?.mate ?? null, cp: best?.cp ?? null, pv: best?.pv ?? [] };
        if (rec.mate && rec.mate > 0) found++;
        appendFileSync(OUT, JSON.stringify(rec) + "\n");
        if (next % 200 === 0) console.log(`${next}/${todo.length}, có sát ${found}, ${Math.round((Date.now() - t0) / 1000)}s`);
      }
      e.quit();
    }),
  );
  console.log(`xong: ${found} thế có sát cục`);
}

main();
