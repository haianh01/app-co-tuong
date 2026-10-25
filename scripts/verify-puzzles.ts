// Bước 2: kiểm chứng biến chính của từng thế sát cục đã quét (scripts/mine-puzzles.ts).
// Với mỗi nước Đỏ còn k nước: Pikafish phải thấy chiếu bí đúng k nước và (khi k ≥ 2) nước tốt thứ nhì
// KHÔNG chiếu bí được trong ≤ k nước — tức lời giải là duy nhất, người giải không bị bắt bẻ vì đi cách khác.
// Nước Đen là nước đỡ dai nhất. Hai nước Đỏ cuối còn được bộ giải vét cạn của dự án (mate.ts) kiểm lại.
// Kết quả: .data/puzzle-mining/verified.jsonl.  npx tsx scripts/verify-puzzles.ts [số engine]

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { applyMove, inCheck, legalMoves, outcome, parseFen, toFen, type Move, type Position } from "../src/lib/xiangqi/engine";
import { winningMoves } from "../src/lib/xiangqi/mate";
import { moveToUci, uciToMove } from "../src/lib/xiangqi/uci";
import { Engine } from "./lib/pikafish";

const [workers = 4] = process.argv.slice(2).map(Number);
const DIR = path.join(process.cwd(), ".data", "puzzle-mining");
const IN = path.join(DIR, "screen.jsonl");
const OUT = path.join(DIR, "verified.jsonl");
const MIN = 3;
const MAX = 9;

const readJsonl = <T,>(f: string): T[] =>
  existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : [];

interface Screened { file: string; title: string; fen: string; mate: number | null }

const uci = (pos: Position) => `${toFen(pos)} - - 0 1`;
const go = (k: number) => `depth ${2 * k + 10} nodes 1500000`;
const same = (a: Move, b: Move) => a.from === b.from && a.to === b.to;

async function verify(e: Engine, fen: string): Promise<{ ok: true; line: Move[]; depth: number } | { ok: false; why: string }> {
  let pos = parseFen(fen);
  if (inCheck(pos.board, "r")) return { ok: false, why: "Đỏ đang bị chiếu" };
  const line: Move[] = [];
  let n = 0;
  for (let k = 0; ; ) {
    const legal = legalMoves(pos);
    const res = await e.search(uci(pos), go(k || MAX), Math.min(2, legal.length));
    const [best, second] = res;
    if (!best || best.mate === null || best.mate <= 0) return { ok: false, why: `không thấy sát ở nước ${line.length}` };
    if (k === 0) {
      n = k = best.mate;
      if (n < MIN || n > MAX) return { ok: false, why: `sát ${n} nước` };
    } else if (best.mate !== k) return { ok: false, why: `nước ${line.length}: sát ${best.mate} thay vì ${k}` };
    if (k >= 2 && second && second.mate !== null && second.mate > 0 && second.mate <= k) {
      return { ok: false, why: `nước ${line.length}: hai cách sát (${best.pv[0]}, ${second.pv[0]})` };
    }
    const m = uciToMove(best.pv[0]);
    if (!m || !legal.some((x) => same(x, m))) return { ok: false, why: "nước engine không hợp lệ" };
    if (k <= 2) {
      // Vét cạn bằng mate.ts: nước này thắng trong k nước và là duy nhất.
      const wins = winningMoves(pos, k);
      if (k === 2 ? !(wins.length === 1 && same(wins[0], m)) : !wins.some((w) => same(w, m))) {
        return { ok: false, why: `vét cạn không khớp ở k=${k}` };
      }
    }
    line.push(m);
    pos = applyMove(pos, m);
    if (k === 1) break;
    const [def] = await e.search(uci(pos), go(k), 1);
    if (!def || def.mate !== -(k - 1)) return { ok: false, why: `Đen đỡ: ${def?.mate}` };
    const r = uciToMove(def.pv[0])!;
    line.push(r);
    pos = applyMove(pos, r);
    k--;
  }
  const o = outcome(pos);
  if (!(o.over && o.winner === "r")) return { ok: false, why: "cuối biến không thắng" };
  return { ok: true, line, depth: n };
}

async function main() {
  const done = new Set(readJsonl<{ fen: string }>(OUT).map((r) => r.fen));
  const todo = readJsonl<Screened>(IN).filter((r) => r.mate !== null && r.mate >= MIN && r.mate <= MAX + 1 && !done.has(r.fen));
  // Sách có tên (cổ phổ) trước, tuyển tập 4000 thế sau — dừng giữa chừng vẫn có đủ nguồn đa dạng.
  todo.sort((a, b) => Number(a.file.includes("4000")) - Number(b.file.includes("4000")));
  console.log(`cần kiểm ${todo.length} thế`);
  let next = 0;
  let good = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      const e = new Engine(64);
      await e.ready();
      while (next < todo.length) {
        const it = todo[next++];
        const r = await verify(e, it.fen);
        if (r.ok) good++;
        const rec = r.ok
          ? { file: it.file, title: it.title, fen: it.fen, ok: true, depth: r.depth, line: r.line.map(moveToUci) }
          : { file: it.file, title: it.title, fen: it.fen, ok: false, why: r.why };
        appendFileSync(OUT, JSON.stringify(rec) + "\n");
        if (next % 50 === 0) console.log(`${next}/${todo.length}, đạt ${good}`);
      }
      e.quit();
    }),
  );
  console.log(`xong: ${good} thế đạt`);
}

main();
