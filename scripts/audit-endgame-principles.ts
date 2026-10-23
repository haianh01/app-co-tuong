/**
 * Đo nguyên lý tàn cuộc (endgame-principles.ts) trên 203 ván đại sư (MASTER_GAMES).
 * Với mỗi nửa nước tàn cuộc: chấm thế trước/sau bằng Pikafish (cache theo FEN trong .data/audit-cache),
 * chạy từng detector riêng lẻ và chạy endgamePrincipleFacts kèm bộ lọc của reviewMove (khen chỉ với nước không lỗi,
 * chê chỉ với nước lỗi), rồi in tần suất của từng nguyên lý kèm vài mẫu để đọc lại bằng mắt.
 * Nước đại sư hiếm khi là lỗi: lời chê bắn nhiều = điều kiện sai; lời khen bắn trên phần lớn nước = nhiễu.
 *
 *   npx tsx scripts/audit-endgame-principles.ts [--nodes 30000] [--samples 3] [--only maHoatChienThang]
 */
import fs from "node:fs";
import path from "node:path";
import { classifyWinDrop, winChance } from "../src/lib/xiangqi/analysis";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import { legalMoves, toFen, type Board, type Move, type Position } from "../src/lib/xiangqi/engine";
import * as EP from "../src/lib/xiangqi/endgame-principles";
import { MASTER_GAMES } from "../src/lib/xiangqi/master-games.generated";
import { moveNotation } from "../src/lib/xiangqi/notation";
import { engineScore, MATE_SCORE, uciToMove } from "../src/lib/xiangqi/uci";
import { getEnginePool } from "../src/server/engine/uci";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const NODES = Number(arg("--nodes", "30000"));
const SAMPLES = Number(arg("--samples", "3"));
const ONLY = arg("--only", "");

interface Ev { score: number; best: Move | null; pv: Move[] }
type Detector = (b: Board, m: Move, a: Board, o?: EP.EndgamePrincipleOptions) => EP.EndgamePrincipleFact | null;

const CAP = 1500;
const clamp = (v: number) => Math.max(-CAP, Math.min(CAP, v));

const cacheDir = path.join(process.cwd(), ".data", "audit-cache");
const cacheFile = path.join(cacheDir, `master-endgame-${NODES}.json`);
const cache: Record<string, { cp: number | null; mate: number | null; pv: string[] }> =
  fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};

const detectors = Object.entries(EP)
  .filter(([k, v]) => k.startsWith("detect") && typeof v === "function")
  .map(([k, v]) => [k, v as Detector] as const);

async function main() {
  // 1. Gom các nửa nước tàn cuộc
  const plies: { game: number; ply: number; pos: Position; move: Move; next: Position }[] = [];
  for (const g of MASTER_GAMES) {
    const conv = convertChineseGame(g.movesCN);
    conv.moves.forEach((move, i) => {
      const pos = conv.positions[i];
      const next = conv.positions[i + 1];
      if (EP.isEndgame(pos.board) || EP.isEndgame(next.board)) plies.push({ game: g.id, ply: i, pos, move, next });
    });
  }

  // 2. Chấm engine các thế cần (trước và sau mỗi nửa nước), có cache
  const fens = [...new Set(plies.flatMap((p) => [toFen(p.pos), toFen(p.next)]))].filter((f) => !cache[f]);
  if (fens.length) {
    const pool = getEnginePool();
    if (!pool) throw new Error("Không tìm thấy engine Pikafish (thư mục engine/)");
    let done = 0;
    await Promise.all(Array.from({ length: 2 }, async () => {
      for (let f = fens.pop(); f; f = fens.pop()) {
        const r = await pool.search(f, { nodes: NODES });
        cache[f] = { cp: r.cp, mate: r.mate, pv: r.pv ?? [] };
        if (++done % 200 === 0) {
          console.error(`  đã chấm ${done} thế...`);
          fs.mkdirSync(cacheDir, { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify(cache));
        }
      }
    }));
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
    pool.close();
  }
  const evalOf = (pos: Position): Ev => {
    if (legalMoves(pos).length === 0) return { score: -MATE_SCORE, best: null, pv: [] };
    const c = cache[toFen(pos)];
    const pv = c.pv.map(uciToMove).filter((m): m is Move => m !== null);
    return { score: engineScore(c.cp, c.mate), best: pv[0] ?? null, pv };
  };

  // 3. Chạy detector
  const raw = new Map<string, number>();
  const kept = new Map<string, { n: number; critique: number; shown: number; samples: string[] }>();
  let withFact = 0;
  let notes = 0;
  let shownPlies = 0;
  // Mô phỏng suppressRepeatedZhaoFacts của reviewGame: cùng bên + cùng nguyên lý trong 12 nửa nước chỉ nói một lần
  const lastSeen = new Map<string, number>();
  for (const p of plies) {
    const before = evalOf(p.pos);
    const after = evalOf(p.next);
    const playedBest = before.best?.from === p.move.from && before.best?.to === p.move.to;
    const loss = playedBest ? 0 : Math.max(0, clamp(before.score) + clamp(after.score));
    const options: EP.EndgamePrincipleOptions = { pv: after.pv, loss, evalBefore: before, evalAfter: after };
    for (const [name, fn] of detectors) {
      if (fn(p.pos.board, p.move, p.next.board, options)) raw.set(name, (raw.get(name) ?? 0) + 1);
    }
    // Phân loại nước như reviewMove: xác suất thắng logistic, nước tốt nhất thì không mất gì
    const winDrop = playedBest ? 0 : Math.max(0, winChance(clamp(before.score)) - winChance(-clamp(after.score)));
    const isFault = classifyWinDrop(winDrop, undefined, loss) !== null;
    const facts = EP.endgamePrincipleFacts(p.pos.board, p.move, p.next.board, options)
      .filter((f) => f.tone === "note" || (f.tone === "critique" ? isFault : !isFault));
    if (facts.some((f) => f.tone === "note")) notes++;
    if (!facts.length) continue;
    if (facts.some((f) => f.tone !== "note")) withFact++;
    let shownHere = false;
    for (const f of facts) {
      const k = kept.get(f.principle) ?? { n: 0, critique: 0, shown: 0, samples: [] };
      k.n++;
      if (f.tone === "critique") k.critique++;
      const key = f.tone === "note" ? `${p.game}:note:${f.principle}` : `${p.game}:${f.side}:${f.principle}`;
      const prev = lastSeen.get(key);
      if (prev === undefined || (f.tone !== "note" && p.ply - prev > 12)) {
        k.shown++;
        if (f.tone !== "note") shownHere = true;
        lastSeen.set(key, p.ply);
      }
      if (k.samples.length < (ONLY && f.principle === ONLY ? 40 : SAMPLES)) {
        k.samples.push(
          `ván ${p.game} nửa nước ${p.ply + 1} ${moveNotation(p.pos.board, p.move)} (loss ${Math.round(loss)}, điểm ${before.score})\n` +
          `      ${toFen(p.pos)}\n      ${f.summary}`,
        );
      }
      kept.set(f.principle, k);
    }
    if (shownHere) shownPlies++;
  }

  const pct = (n: number) => `${(100 * n / plies.length).toFixed(1)}%`;
  console.log(
    `Nửa nước tàn cuộc: ${plies.length} (trong ${MASTER_GAMES.length} ván), có nguyên lý theo nước: ${withFact} (${pct(withFact)}), ` +
      `sau khi bỏ lặp như reviewGame: ${shownPlies} (${pct(shownPlies)}), có ghi chú loại tàn cuộc: ${notes}\n`,
  );
  console.log("Bắn riêng lẻ (chưa xét thứ tự ưu tiên):");
  for (const [name, n] of [...raw].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(34)} ${String(n).padStart(5)}  ${(100 * n / plies.length).toFixed(1)}%`);
  }
  console.log("\nGắn thật (endgamePrincipleFacts + bộ lọc của reviewMove) / còn lại sau khi bỏ lặp:");
  for (const [principle, k] of [...kept].sort((a, b) => b[1].n - a[1].n)) {
    if (ONLY && principle !== ONLY) continue;
    console.log(`  ${principle.padEnd(26)} ${String(k.n).padStart(5)} / ${String(k.shown).padStart(4)}${k.critique ? ` (chê ${k.critique})` : ""}`);
    for (const s of k.samples) console.log(`    - ${s}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
