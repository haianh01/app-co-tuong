/**
 * Đo độ phủ lời giải thích trên các ván đại sư đã crawl (.data/expert-commentary).
 * Với mỗi nửa nước: chấm bằng Pikafish, chạy đúng pipeline của app (reviewGame + moveIdea như LiveCoach
 * + detectIntent), rồi xếp lời giải thích vào 3 mức:
 *   - cụ thể: có dữ kiện chiến thuật/ý đồ rõ ràng (mất quân, ghim, thí, đổi quân, giữ tiên, lỗi khai cuộc...)
 *   - nguyên lý: chỉ có nhận xét theo nguyên lý vị trí (Xe thông đường, áp lực lên cung...)
 *   - chung chung: không nói được gì cụ thể ("giữ thế, chưa thay đổi nhiều", chỉ "thiệt X điểm")
 *
 * Sử dụng: npx tsx scripts/measure-coverage.ts [--limit 64] [--nodes 20000]
 */

import fs from "node:fs";
import path from "node:path";
import { reviewGame, type PositionEval } from "../src/lib/xiangqi/analysis";
import { legalMoves, opponent, play, START_FEN, parseFen, toFen, type Move } from "../src/lib/xiangqi/engine";
import { moveIdea, withoutCriticism, type Fact } from "../src/lib/xiangqi/explain";
import { replayMoves } from "../src/lib/xiangqi/game";
import { detectIntent, type Purpose } from "../src/lib/xiangqi/intent";
import { getEnginePool, type UciProcess } from "../src/server/engine/uci";
import { engineScore, uciToMove } from "../src/lib/xiangqi/uci";

const args = process.argv.slice(2);
const argNum = (name: string, def: number) => {
  const i = args.indexOf(name);
  return i >= 0 ? parseInt(args[i + 1], 10) : def;
};
const LIMIT = argNum("--limit", 1000);
const NODES = argNum("--nodes", 20_000);

const dataDir = path.join(process.cwd(), ".data", "expert-commentary");
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("tlkd_") && f.endsWith(".json")).slice(0, LIMIT);

type Level = "cuThe" | "nguyenLy" | "chungChung";
const FAULT = new Set(["blunder", "mistake", "inaccuracy", "missedWin"]);
// Dữ kiện lỗi không nói được nguyên nhân cụ thể
const GENERIC_FACTS = new Set<Fact["kind"]>(["evalDrop"]);
const PRINCIPLE_FACTS = new Set<Fact["kind"]>(["strategy"]);
// Dữ kiện persona chỉ hiện khi người dùng chọn phong cách bình luận của đại sư tương ứng (xem explainText);
// đo ở phong cách mặc định nên không tính.
const PERSONA_FACTS = new Set<Fact["kind"]>(["zhaoMiddlegame", "xuMiddlegame"]);

const count = <K extends string>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);

async function main() {
  const pool = getEnginePool();
  if (!pool) throw new Error("Không khởi tạo được Pikafish");

  const levels = new Map<Level, number>();
  const faultLevels = new Map<Level, number>();
  const goodLevels = new Map<Level, number>();
  // Mức độ cụ thể của những gì người dùng THẬT SỰ đọc (dữ kiện lỗi + nhận xét LiveCoach), không tính ý đồ ẩn
  const shownLevels = new Map<Level, number>();
  const primaries = new Map<string, number>();
  const factKinds = new Map<string, number>();
  const shownIntents = new Map<string, number>();
  let plies = 0;
  let skippedGames = 0;

  await pool.withProcess(async (proc: UciProcess) => {
    for (const [gi, file] of files.entries()) {
      const game = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
      const moves: Move[] = game.movesCoords.map((m: { from: number; to: number }) => ({ from: m.from, to: m.to }));

      // Bỏ ván có nước phạm quy
      let pos = parseFen(START_FEN);
      let legal = true;
      for (const m of moves) {
        if (!legalMoves(pos).some((x) => x.from === m.from && x.to === m.to)) {
          legal = false;
          break;
        }
        pos = { board: play(pos.board, m), turn: opponent(pos.turn) };
      }
      if (!legal) {
        skippedGames++;
        continue;
      }

      const state = replayMoves(moves);
      const evals: PositionEval[] = [];
      for (const p of state.history) {
        const r = await proc.search(toFen(p), { nodes: NODES }, undefined, { newGame: false });
        evals.push({
          score: engineScore(r.cp, r.mate),
          best: r.bestmove ? uciToMove(r.bestmove) : null,
          pv: (r.pv ?? []).map(uciToMove).filter((x): x is Move => x !== null),
          wdl: r.wdl,
        });
      }

      const review = reviewGame(state, evals);
      review.moves.forEach((rv, i) => {
        plies++;
        const before = state.history[i].board;
        const move = state.moves[i].move;
        const after = state.history[i + 1].board;
        const isFault = !!rv.cls && FAULT.has(rv.cls);
        const isBest = !!evals[i].best && evals[i].best!.from === move.from && evals[i].best!.to === move.to;

        // Nhận xét như LiveCoach đang hiển thị
        // Gọi giống hệt LiveCoach: có PV và điểm engine để ý đồ được xác nhận
        const idea = moveIdea(
          before,
          move,
          evals[i + 1]?.best ?? null,
          i,
          undefined,
          state.moves.slice(0, i).map((x) => x.move),
          isBest || !isFault,
          evals[i + 1]?.pv,
          { evalBefore: { score: evals[i].score }, evalAfter: evals[i + 1] ? { score: evals[i + 1].score } : null, loss: rv.loss },
        );
        const shown = isFault ? idea : withoutCriticism(idea);
        if (shown.kind === "intent") count(shownIntents, shown.primaryPurpose);

        const moverAfter = evals[i + 1] ? -evals[i + 1].score : evals[i].score;
        const intent = detectIntent(before, move, after, {
          pv: [move, ...(evals[i + 1]?.pv ?? [])],
          evalBefore: { score: evals[i].score },
          evalAfter: evals[i + 1] ? { score: evals[i + 1].score } : null,
          loss: Math.max(0, evals[i].score - moverAfter),
        });
        const primary: Purpose | "—" = intent?.primaryPurpose ?? "—";
        count(primaries, primary);
        for (const f of rv.facts) count(factKinds, f.kind);

        const facts = rv.facts.filter((f) => !PERSONA_FACTS.has(f.kind));
        const specificFact = facts.some((f) => !GENERIC_FACTS.has(f.kind) && !PRINCIPLE_FACTS.has(f.kind));
        const specificIdea = shown.kind === "intent" || shown.kind === "openingFault";
        const specificIntent = primary !== "—" && primary !== "caiThienQuan";
        const principle =
          facts.some((f) => PRINCIPLE_FACTS.has(f.kind)) ||
          (shown.kind === "idea" && (shown.gains.length > 0 || shown.worsened.length > 0 || shown.loose.length > 0));

        const level: Level = specificFact || specificIdea || specificIntent ? "cuThe" : principle ? "nguyenLy" : "chungChung";
        count(levels, level);
        count(isFault ? faultLevels : goodLevels, level);
        count(shownLevels, specificFact || specificIdea ? "cuThe" : principle ? "nguyenLy" : "chungChung");
      });

      process.stdout.write(`\r[${gi + 1}/${files.length}] ${plies} nửa nước`);
    }
  });

  const pct = (m: Map<Level, number>, k: Level) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    return total ? `${Math.round(((m.get(k) ?? 0) / total) * 100)}% (${m.get(k) ?? 0}/${total})` : "—";
  };
  const table = (title: string, m: Map<Level, number>) => {
    console.log(`\n${title}`);
    console.log(`  cụ thể      ${pct(m, "cuThe")}`);
    console.log(`  nguyên lý   ${pct(m, "nguyenLy")}`);
    console.log(`  chung chung ${pct(m, "chungChung")}`);
  };

  console.log(`\n\nĐÃ ĐO ${plies} nửa nước trên ${files.length - skippedGames} ván (bỏ ${skippedGames} ván phạm quy), Pikafish ${NODES} nodes`);
  table("TẤT CẢ CÁC NƯỚC — hệ thống phát hiện được (gồm cả ý đồ detectIntent)", levels);
  table("TẤT CẢ CÁC NƯỚC — người dùng thật sự đọc được (dữ kiện lỗi + nhận xét LiveCoach)", shownLevels);
  table("NƯỚC BỊ CHẤM LỖI (thiếu chính xác / kém / hớ / bỏ lỡ thắng)", faultLevels);
  table("NƯỚC TỐT (không bị chấm lỗi)", goodLevels);
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  console.log("\nÝ chính (detectIntent.primaryPurpose):");
  for (const [k, v] of sorted(primaries)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log("\nÝ đồ được hiển thị cho người dùng (theo ý chính):");
  for (const [k, v] of sorted(shownIntents)) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log("\nLoại dữ kiện giải thích lỗi (explainMove):");
  for (const [k, v] of sorted(factKinds)) console.log(`  ${k.padEnd(16)} ${v}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
