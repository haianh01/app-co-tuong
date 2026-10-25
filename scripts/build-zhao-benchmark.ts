/**
 * Sinh thế cờ đối chiếu cho modal "So sánh AI & Bài giảng" (src/lib/xiangqi/zhao-benchmark.generated.ts).
 *
 * Thế cờ lấy từ ván đại sư thật (MASTER_GAMES), không tự dựng:
 *   1. Chạy reviewGame của app trên các ván (điểm/biến Pikafish cache chung với audit-zhao-lessons.ts) và gom các nước
 *      được gắn kỳ lý trung cuộc — tức đã qua bộ lọc "biến engine xác nhận" của reviewMove.
 *   2. Chấm lại từng ứng viên đúng như modal làm trên trình duyệt: ván một nước từ FEN, Pikafish ANALYSIS (60k nodes,
 *      MultiPV 3), không có lịch sử nước trước. Chỉ giữ thế mà kỳ lý của bài vẫn được gắn — modal mở ra sẽ thấy đúng thế.
 *
 *   npx tsx scripts/build-zhao-benchmark.ts [--nodes 30000] [--per-lesson 1]
 */
import fs from "node:fs";
import path from "node:path";
import { reviewGame, reviewMove, type PositionEval } from "../src/lib/xiangqi/analysis";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import { legalMoves, parseFen, toFen, type Move } from "../src/lib/xiangqi/engine";
import { gameReducer, newGame, replayMoves } from "../src/lib/xiangqi/game";
import { MASTER_GAMES } from "../src/lib/xiangqi/master-games.generated";
import { engineScore, MATE_SCORE, moveToUci, toUciFen, uciToMove } from "../src/lib/xiangqi/uci";
import { ZHAO_LESSONS } from "../src/lib/xiangqi/zhao48-lessons";
import { getEnginePool } from "../src/server/engine/uci";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const NODES = Number(arg("--nodes", "30000"));
const PER_LESSON = Number(arg("--per-lesson", "1"));
/** Thử tối đa bấy nhiêu ứng viên mỗi bài ở bước chấm lại. */
const TRY_PER_LESSON = 12;
/** Giới hạn giống route /api/engine khi purpose = "analysis". */
const ANALYSIS = { nodes: 60_000, multipv: 3 };

type Cached = { cp: number | null; mate: number | null; pv: string[] };
const cacheDir = path.join(process.cwd(), ".data", "audit-cache");
const load = (f: string): Record<string, Cached> => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {});
const cacheFile = path.join(cacheDir, `master-all-${NODES}.json`);
const cache: Record<string, Cached> = { ...load(path.join(cacheDir, `master-endgame-${NODES}.json`)), ...load(cacheFile) };

interface Candidate {
  lesson: number;
  tactic: string;
  tone: "praise" | "critique";
  gameId: number;
  ply: number;
  fen: string;
  move: Move;
  notation: string;
}

async function main() {
  const pool = getEnginePool();
  if (!pool) throw new Error("Không tìm thấy engine Pikafish (thư mục engine/)");

  // 1. Ứng viên từ reviewGame trên ván đại sư
  const games = MASTER_GAMES.map((g) => ({ g, state: replayMoves(convertChineseGame(g.movesCN).moves) }));
  const missing = [...new Set(games.flatMap(({ state }) => state.history.map((p) => toFen(p))))]
    .filter((f) => !cache[f] && legalMoves(parseFen(f)).length > 0);
  if (missing.length) {
    console.error(`Cần chấm ${missing.length} thế cờ (${NODES} nodes)...`);
    await Promise.all(Array.from({ length: 2 }, async () => {
      for (let f = missing.pop(); f; f = missing.pop()) {
        const r = await pool.search(f, { nodes: NODES });
        cache[f] = { cp: r.cp, mate: r.mate, pv: r.pv ?? [] };
      }
    }));
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  const cachedEval = (fen: string): PositionEval => {
    const c = cache[fen];
    if (!c) return { score: -MATE_SCORE, best: null, pv: [] };
    const pv = c.pv.map(uciToMove).filter((m): m is Move => m !== null);
    return { score: engineScore(c.cp, c.mate), best: pv[0] ?? null, pv };
  };

  const byLesson = new Map<number, Candidate[]>();
  for (const { g, state } of games) {
    const review = reviewGame(state, state.history.map((p) => cachedEval(toFen(p))));
    review.moves.forEach((r, i) => {
      for (const f of r.facts) {
        if (f.kind !== "zhaoMiddlegame" || !f.lesson) continue;
        const list = byLesson.get(f.lesson) ?? [];
        list.push({
          lesson: f.lesson,
          tactic: f.tactic,
          tone: f.tone ?? "praise",
          gameId: g.id,
          ply: r.ply,
          fen: toFen(state.history[i]),
          move: state.moves[i].move,
          notation: state.moves[i].notation,
        });
        byLesson.set(f.lesson, list);
      }
    });
  }

  // 2. Chấm lại như modal: một nước, không lịch sử, Pikafish ANALYSIS
  const fresh = new Map<string, PositionEval>();
  const liveEval = async (fen: string): Promise<PositionEval> => {
    const hit = fresh.get(fen);
    if (hit) return hit;
    const r = await pool.search(toUciFen(parseFen(fen)), ANALYSIS);
    const pv = (r.pv ?? []).map(uciToMove).filter((m): m is Move => m !== null);
    const ev = { score: engineScore(r.cp, r.mate), best: r.bestmove ? uciToMove(r.bestmove) : null, pv };
    fresh.set(fen, ev);
    return ev;
  };
  const confirmedLive = async (c: Candidate): Promise<boolean> => {
    const s1 = gameReducer(newGame(c.fen), { type: "move", move: c.move });
    if (s1.moves.length !== 1) return false;
    const before = await liveEval(c.fen);
    const after = s1.result ? null : await liveEval(toFen(s1.history[1]));
    const { review } = reviewMove(s1.moves[0], 0, s1, before, after, undefined, [], []);
    return review.facts.some((f) => f.kind === "zhaoMiddlegame" && (f.lesson === c.lesson || f.tactic === c.tactic));
  };

  const picks: Candidate[] = [];
  const report: string[] = [];
  for (const lesson of [...byLesson.keys()].sort((a, b) => a - b)) {
    // Lời khen trước (minh hoạ kỳ lý được áp dụng), mỗi ván tối đa một thế để đa dạng
    const seen = new Set<number>();
    const ordered = [...byLesson.get(lesson)!]
      .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "praise" ? -1 : 1))
      .filter((c) => !seen.has(c.gameId) && seen.add(c.gameId));
    const kept: Candidate[] = [];
    let tried = 0;
    for (const c of ordered) {
      if (kept.length >= PER_LESSON || tried >= TRY_PER_LESSON) break;
      tried++;
      if (await confirmedLive(c)) kept.push(c);
    }
    picks.push(...kept);
    report.push(`Bài ${lesson}: ${byLesson.get(lesson)!.length} ứng viên, thử ${tried}, giữ ${kept.length}`);
  }
  pool.close();

  const meta = new Map(MASTER_GAMES.map((g) => [g.id, g]));
  const rows = picks.map((c) => {
    const g = meta.get(c.gameId)!;
    return {
      lesson: c.lesson,
      tactic: c.tactic,
      tone: c.tone,
      fen: c.fen,
      move: moveToUci(c.move),
      moveNotation: c.notation,
      game: { id: g.id, red: g.red, black: g.black, tournament: g.tournament, date: g.date, ply: c.ply },
    };
  });
  const out = path.join(process.cwd(), "src", "lib", "xiangqi", "zhao-benchmark.generated.ts");
  fs.writeFileSync(
    out,
    `// Sinh tự động bởi scripts/build-zhao-benchmark.ts — không sửa tay.\n` +
    `// Thế cờ trong ván đại sư (MASTER_GAMES) mà kỳ lý của bài được biến Pikafish xác nhận, kể cả khi chấm lại như modal.\n\n` +
    `export interface ZhaoBenchmarkRow {\n  lesson: number;\n  tactic: string;\n  tone: "praise" | "critique";\n  fen: string;\n  move: string;\n  moveNotation: string;\n` +
    `  game: { id: number; red: string; black: string; tournament: string; date: string; ply: number };\n}\n\n` +
    `export const ZHAO_BENCHMARK_ROWS: ZhaoBenchmarkRow[] = ${JSON.stringify(rows, null, 2)};\n`,
  );
  const noData = Object.values(ZHAO_LESSONS).filter((c) => c.kind !== "summary" && !picks.some((p) => p.lesson === c.lesson));
  console.log(report.join("\n"));
  console.log(`\nĐã ghi ${rows.length} thế vào ${path.relative(process.cwd(), out)}`);
  console.log(`Bài chưa có thế (không phải bài tổng kết): ${noData.map((c) => c.lesson).join(", ") || "không"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
