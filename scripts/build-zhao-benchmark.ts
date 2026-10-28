/**
 * Sinh thế cờ đối chiếu cho modal "So sánh AI & Bài giảng" (src/lib/xiangqi/zhao-benchmark.generated.ts).
 *
 * Thế cờ lấy từ ván đại sư thật (MASTER_GAMES), không tự dựng:
 *   1. Chạy reviewGame của app trên các ván (điểm/biến Pikafish cache chung với audit-zhao-lessons.ts) và gom các nước
 *      được gắn kỳ lý trung cuộc (zhaoMiddlegame) hoặc nguyên lý tàn cuộc có số bài (endgamePrinciple) — tức đã qua
 *      bộ lọc "biến engine xác nhận" của reviewMove. Hai bộ bài đánh số riêng nên mỗi thế ghi kèm `book`.
 *      Cache không có MultiPV nên nước lặng (không chiếu, không ăn quân) rớt ở bộ lọc "nước đáng bình" dù có thể là nước
 *      duy nhất; các nước này (kỳ lý khen đã qua luật kết quả zhao-outcome) được gom thêm, xếp sau.
 *   2. Chấm lại từng ứng viên đúng như modal làm trên trình duyệt: ván một nước từ FEN, Pikafish ANALYSIS (60k nodes,
 *      MultiPV 3), không có lịch sử nước trước. Chỉ giữ thế mà kỳ lý của bài vẫn được gắn — modal mở ra sẽ thấy đúng thế.
 *
 *   npx tsx scripts/build-zhao-benchmark.ts [--nodes 30000] [--per-lesson 1]
 */
import fs from "node:fs";
import path from "node:path";
import { moveOutcomeFromEval, reviewGame, reviewMove, type PositionEval } from "../src/lib/xiangqi/analysis";
import { convertChineseGame } from "../src/lib/xiangqi/chinese-notation";
import { legalMoves, parseFen, toFen, type Move } from "../src/lib/xiangqi/engine";
import { gameReducer, newGame, replayMoves } from "../src/lib/xiangqi/game";
import { MASTER_GAMES } from "../src/lib/xiangqi/master-games.generated";
import { engineScore, MATE_SCORE, moveToUci, toUciFen, uciToMove } from "../src/lib/xiangqi/uci";
import { ZHAO_ENDGAME_LESSONS } from "../src/lib/xiangqi/zhao48-endgame-lessons";
import { ZHAO_LESSONS } from "../src/lib/xiangqi/zhao48-lessons";
import { ZHAO_OPENING_LESSONS } from "../src/lib/xiangqi/zhao48-opening-lessons";
import { zhaoOutcomeAllows } from "../src/lib/xiangqi/zhao-outcome";
import { detectAllZhaoTactics } from "../src/lib/xiangqi/zhao-principles";
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

type Book = "middlegame" | "endgame" | "opening";
type Tone = "praise" | "critique" | "note";
/** Thứ tự ưu tiên khi chọn thế: lời khen (kỳ lý được áp dụng) → lời chê → ghi chú loại tàn cuộc. */
const TONE_ORDER: Record<Tone, number> = { praise: 0, critique: 1, note: 2 };
const BOOK_ORDER: Record<Book, number> = { opening: 0, middlegame: 1, endgame: 2 };

interface Candidate {
  book: Book;
  lesson: number;
  tactic: string;
  tone: Tone;
  gameId: number;
  ply: number;
  fen: string;
  move: Move;
  notation: string;
  historyMoves?: string[];
}

function loadExtraGames(dirPath: string): typeof MASTER_GAMES {
  if (!fs.existsSync(dirPath)) return [];
  const files = fs.readdirSync(dirPath).filter((f) => f.startsWith("game_") && f.endsWith(".json"));
  const extra: typeof MASTER_GAMES = [];
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dirPath, file), "utf-8"));
      const rawMoves: string[] = content.moves_chinese ?? [];
      const conv = convertChineseGame(rawMoves);
      if (!conv.success || conv.moves.length < 6) continue;
      extra.push({
        id: content.gameid,
        red: content.red_player,
        black: content.black_player,
        result: content.result,
        tournament: content.tournament || "",
        date: content.date || "",
        eccoCode: content.ecco_code || "",
        eccoName: content.ecco_name || "",
        masterRed: content.master_red || null,
        masterBlack: content.master_black || null,
        moveCount: conv.notations.length,
        movesVN: conv.notations,
        movesCN: rawMoves,
      });
    } catch {
      // bỏ qua file đang ghi dở
    }
  }
  return extra;
}

async function main() {
  const pool = getEnginePool();
  if (!pool) throw new Error("Không tìm thấy engine Pikafish (thư mục engine/)");

  // 1. Ứng viên từ reviewGame trên ván đại sư (+ kho phụ nếu có)
  const extraDir = arg("--extra", "");
  const extraGames = extraDir ? loadExtraGames(path.resolve(process.cwd(), extraDir)) : [];
  const seenIds = new Set(MASTER_GAMES.map((g) => g.id));
  const combinedGames = [...MASTER_GAMES, ...extraGames.filter((g) => !seenIds.has(g.id))];
  if (extraGames.length) {
    console.error(`Nạp thêm ${extraGames.length} ván từ ${extraDir} (tổng ${combinedGames.length} ván)`);
  }
  const games = combinedGames.map((g) => ({ g, state: replayMoves(convertChineseGame(g.movesCN).moves) }));
  const missing = [...new Set(games.flatMap(({ state }) => state.history.map((p) => toFen(p))))]
    .filter((f) => !cache[f] && legalMoves(parseFen(f)).length > 0);
  if (missing.length) {
    const totalMissing = missing.length;
    console.error(`Cần chấm ${totalMissing} thế cờ (${NODES} nodes)...`);
    fs.mkdirSync(cacheDir, { recursive: true });
    const save = () => fs.writeFileSync(cacheFile, JSON.stringify(cache));
    let done = 0;
    await Promise.all(Array.from({ length: 2 }, async () => {
      for (let f = missing.pop(); f; f = missing.pop()) {
        const r = await pool.search(f, { nodes: NODES });
        cache[f] = { cp: r.cp, mate: r.mate, pv: r.pv ?? [] };
        if (++done % 500 === 0) {
          console.error(`  đã chấm ${done}/${totalMissing}...`);
          save();
        }
      }
    }));
    save();
  }
  const cachedEval = (fen: string): PositionEval => {
    const c = cache[fen];
    if (!c) return { score: -MATE_SCORE, best: null, pv: [] };
    const pv = c.pv.map(uciToMove).filter((m): m is Move => m !== null);
    return { score: engineScore(c.cp, c.mate), best: pv[0] ?? null, pv };
  };

  const byLesson = new Map<string, Candidate[]>();
  const keyOf = (book: Book, lesson: number) => `${book}:${lesson}`;
  const quiet: Candidate[] = [];
  for (const { g, state } of games) {
    const evals = state.history.map((p) => cachedEval(toFen(p)));
    const review = reviewGame(state, evals);
    review.moves.forEach((r, i) => {
      // 1b. Nước lặng: kỳ lý khen qua luật kết quả nhưng không "đáng bình" khi thiếu MultiPV
      const isFault = r.cls === "blunder" || r.cls === "mistake" || r.cls === "inaccuracy";
      if (r.phase !== "tanCuoc" && r.cls !== "book" && !isFault) {
        const before = state.history[i].board;
        const { move } = state.moves[i];
        const outcome = moveOutcomeFromEval(before, move, evals[i + 1]);
        const zhao = outcome
          ? detectAllZhaoTactics(before, move, state.history[i + 1].board, {
            pv: evals[i + 1]?.pv, loss: r.loss, evalBefore: evals[i], evalAfter: evals[i + 1],
            recentMoves: state.moves.slice(Math.max(0, i - 6), i).map((x) => x.move),
          }).slice(0, 2)
          : [];
        for (const f of zhao) {
          if (!f.lesson || (f.tone ?? "praise") !== "praise" || !zhaoOutcomeAllows(f.tactic, outcome!, f.side)) continue;
          if (r.facts.some((x) => x.kind === "zhaoMiddlegame" && x.tactic === f.tactic)) continue;
          quiet.push({
            book: "middlegame", lesson: f.lesson, tactic: f.tactic, tone: "praise", gameId: g.id, ply: r.ply,
            fen: toFen(state.history[i]), move, notation: state.moves[i].notation,
          });
        }
      }
      for (const f of r.facts) {
        if ((f.kind !== "zhaoMiddlegame" && f.kind !== "endgamePrinciple" && f.kind !== "zhaoOpening") || !f.lesson) continue;
        const book: Book = f.kind === "zhaoMiddlegame" ? "middlegame" : f.kind === "endgamePrinciple" ? "endgame" : "opening";
        const key = keyOf(book, f.lesson);
        const list = byLesson.get(key) ?? [];
        list.push({
          book,
          lesson: f.lesson,
          tactic: f.kind === "zhaoMiddlegame" ? f.tactic : f.kind === "endgamePrinciple" ? f.principle : f.tactic,
          tone: f.tone ?? "praise",
          gameId: g.id,
          ply: r.ply,
          fen: toFen(state.history[i]),
          move: state.moves[i].move,
          notation: state.moves[i].notation,
          historyMoves: book === "opening" ? state.moves.slice(0, i).map((x) => moveToUci(x.move)) : undefined,
        });
        byLesson.set(key, list);
      }
    });
  }
  for (const c of quiet) {
    const key = keyOf(c.book, c.lesson);
    byLesson.set(key, [...(byLesson.get(key) ?? []), c]);
  }

  // 2. Chấm lại như modal: Pikafish ANALYSIS (khai cuộc có chuỗi nước trước, trung/tàn ván một nước)
  const fresh = new Map<string, PositionEval>();
  const liveEval = async (fen: string): Promise<PositionEval> => {
    const hit = fresh.get(fen);
    if (hit) return hit;
    const r = await pool.search(toUciFen(parseFen(fen)), ANALYSIS);
    const pv = (r.pv ?? []).map(uciToMove).filter((m): m is Move => m !== null);
    // Giữ MultiPV như modal: reviewMove dựa vào đó mới nhận ra nước duy nhất / nước hay
    const lines = r.lines?.map((l) => ({
      best: l.bestmove ? uciToMove(l.bestmove) : null,
      score: engineScore(l.cp, l.mate),
      depth: l.depth,
      pv: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
      wdl: l.wdl,
    }));
    const ev: PositionEval = { score: engineScore(r.cp, r.mate), best: r.bestmove ? uciToMove(r.bestmove) : null, pv, lines, wdl: r.wdl };
    fresh.set(fen, ev);
    return ev;
  };
  const confirmedLive = async (c: Candidate): Promise<boolean> => {
    if (c.book === "opening") {
      const priorMoves = (c.historyMoves ?? []).map(uciToMove).filter((m): m is Move => m !== null);
      const fullState = replayMoves([...priorMoves, c.move]);
      const moveIndex = priorMoves.length;
      const before = await liveEval(c.fen);
      const fenAfter = toFen(fullState.history[moveIndex + 1]);
      const after = fullState.result
        ? { score: fullState.result.winner === fullState.moves[moveIndex].side ? -MATE_SCORE : 0, best: null, pv: [] }
        : await liveEval(fenAfter);
      const { review } = reviewMove(fullState.moves[moveIndex], moveIndex, fullState, before, after);
      return review.facts.some((f) =>
        f.kind === "zhaoOpening" && (f.lesson === c.lesson || f.tactic === c.tactic),
      );
    }
    const s1 = gameReducer(newGame(c.fen), { type: "move", move: c.move });
    if (s1.moves.length !== 1) return false;
    const before = await liveEval(c.fen);
    // Như modal: nước kết thúc ván thắng thì đối phương bị sát, hòa thì cân bằng
    const after = s1.result
      ? { score: s1.result.winner === s1.moves[0].side ? -MATE_SCORE : 0, best: null, pv: [] }
      : await liveEval(toFen(s1.history[1]));
    // Như modal: ván dựng từ FEN kèm số nửa nước đã đi trong ván gốc
    const { review } = reviewMove(s1.moves[0], 0, s1, before, after, undefined, [], ["—"], undefined, undefined, c.ply - 1);
    return review.facts.some((f) =>
      c.book === "middlegame"
        ? f.kind === "zhaoMiddlegame" && (f.lesson === c.lesson || f.tactic === c.tactic)
        : f.kind === "endgamePrinciple" && f.lesson === c.lesson,
    );
  };

  const picks: Candidate[] = [];
  const report: string[] = [];
  const keys = [...byLesson.keys()].sort((a, b) => {
    const [ba, la] = a.split(":") as [Book, string];
    const [bb, lb] = b.split(":") as [Book, string];
    return ba === bb ? Number(la) - Number(lb) : BOOK_ORDER[ba] - BOOK_ORDER[bb];
  });
  for (const key of keys) {
    // Mỗi ván tối đa một thế để đa dạng
    const seen = new Set<number>();
    const ordered = [...byLesson.get(key)!]
      .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
      .filter((c) => !seen.has(c.gameId) && seen.add(c.gameId));
    const kept: Candidate[] = [];
    let tried = 0;
    for (const c of ordered) {
      if (kept.length >= PER_LESSON || tried >= TRY_PER_LESSON) break;
      tried++;
      if (await confirmedLive(c)) kept.push(c);
    }
    picks.push(...kept);
    const nQuiet = quiet.filter((c) => keyOf(c.book, c.lesson) === key).length;
    report.push(`${key}: ${byLesson.get(key)!.length} ứng viên${nQuiet ? ` (${nQuiet} nước lặng)` : ""}, thử ${tried}, giữ ${kept.length}`);
  }
  pool.close();

  const meta = new Map(combinedGames.map((g) => [g.id, g]));
  const rows = picks.map((c) => {
    const g = meta.get(c.gameId)!;
    return {
      book: c.book,
      lesson: c.lesson,
      tactic: c.tactic,
      tone: c.tone,
      fen: c.fen,
      move: moveToUci(c.move),
      moveNotation: c.notation,
      ...(c.historyMoves ? { historyMoves: c.historyMoves } : {}),
      game: { id: g.id, red: g.red, black: g.black, tournament: g.tournament, date: g.date, ply: c.ply },
    };
  });
  const out = path.join(process.cwd(), "src", "lib", "xiangqi", "zhao-benchmark.generated.ts");
  fs.writeFileSync(
    out,
    `// Sinh tự động bởi scripts/build-zhao-benchmark.ts — không sửa tay.\n` +
    `// Thế cờ trong ván đại sư (MASTER_GAMES) mà kỳ lý của bài được biến Pikafish xác nhận, kể cả khi chấm lại như modal.\n\n` +
    `export interface ZhaoBenchmarkRow {\n  /** Bộ bài: 48 bài khai cuộc (zhao48-opening-lessons), 48 bài trung cuộc (zhao48-lessons) hay 48 bài tàn cuộc (zhao48-endgame-lessons), đánh số riêng. */\n  book: "middlegame" | "endgame" | "opening";\n  lesson: number;\n  tactic: string;\n  tone: "praise" | "critique" | "note";\n  fen: string;\n  move: string;\n  moveNotation: string;\n  historyMoves?: string[];\n` +
    `  game: { id: number; red: string; black: string; tournament: string; date: string; ply: number };\n}\n\n` +
    `export const ZHAO_BENCHMARK_ROWS: ZhaoBenchmarkRow[] = ${JSON.stringify(rows, null, 2)};\n`,
  );
  const noData = (book: Book, cards: { lesson: number; kind: string }[]) =>
    cards.filter((c) => c.kind !== "summary" && !picks.some((p) => p.book === book && p.lesson === c.lesson)).map((c) => c.lesson).join(", ") || "không";
  console.log(report.join("\n"));
  console.log(`\nĐã ghi ${rows.length} thế vào ${path.relative(process.cwd(), out)}`);
  console.log(`Khai cuộc chưa có thế (trừ bài tổng kết): ${noData("opening", Object.values(ZHAO_OPENING_LESSONS))}`);
  console.log(`Trung cuộc chưa có thế (trừ bài tổng kết): ${noData("middlegame", Object.values(ZHAO_LESSONS))}`);
  console.log(`Tàn cuộc chưa có thế (trừ bài tổng kết): ${noData("endgame", Object.values(ZHAO_ENDGAME_LESSONS))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
