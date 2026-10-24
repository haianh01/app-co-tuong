/**
 * Đối chiếu kỳ lý trung cuộc Triệu Hâm Hâm với lời bình chuyên gia trong kỳ phổ (data/kypho/loi-binh.jsonl).
 * Lời bình nào (ngoài tàn cuộc) có từ khóa của một đòn (空头炮 = không tâm pháo, 卧槽 = Mã ngọa tào, 闷宫 = muộn cung,
 * 困车 = vây Xe...) thì chấm thế trước / sau bằng Pikafish (cache trong .data/audit-cache), chạy đúng reviewMove của app,
 * rồi đếm số nước được gắn đúng kỳ lý (độ phủ) và in vài nước gắn đúng / bị bỏ sót để đọc lại.
 * Từ khóa chỉ là gợi ý: lời bình hay nói về cả biến hoặc về nước khác, nên đọc mẫu trước khi kết luận.
 *
 *   npx tsx scripts/audit-zhao-corpus.ts [--nodes 30000] [--samples 3] [--only ngoaTao]
 */
import fs from "node:fs";
import path from "node:path";
import { reviewMove, type PositionEval } from "../src/lib/xiangqi/analysis";
import { isLegal, legalMoves, parseFen, toFen, type Move } from "../src/lib/xiangqi/engine";
import { isEndgame } from "../src/lib/xiangqi/endgame-principles";
import { replayMoves } from "../src/lib/xiangqi/game";
import type { ZhaoTactics } from "../src/lib/xiangqi/middlegame";
import { engineScore, MATE_SCORE, uciToMove } from "../src/lib/xiangqi/uci";
import { getEnginePool } from "../src/server/engine/uci";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const NODES = Number(arg("--nodes", "30000"));
const SAMPLES = Number(arg("--samples", "3"));
const ONLY = arg("--only", "");

/** Từ khóa trong lời bình -> các kỳ lý được coi là nhận đúng. */
const GROUPS: { id: string; re: RegExp; expect: ZhaoTactics[] }[] = [
  { id: "khongTamPhao", re: /空头炮|空心炮/, expect: ["khongTamPhao"] },
  { id: "thienDiaPhao", re: /天地炮/, expect: ["thienDiaPhao"] },
  { id: "phaoTramDay", re: /沉底炮|炮沉底/, expect: ["phaoTramDay", "phaoDayKhoaXe", "thienDiaPhao"] },
  { id: "muonCung", re: /闷宫/, expect: ["muonCungSat"] },
  { id: "ngoaTao", re: /卧槽/, expect: ["ngoaTaoMa"] },
  { id: "vayXe", re: /困车|捉死车|车被困|困死车/, expect: ["vayXe"] },
  { id: "vayPhao", re: /困炮|捉死炮|炮被困/, expect: ["vayPhao"] },
  { id: "vayMa", re: /困马|捉死马|马被困|边马/, expect: ["maPhungBienTatVong", "vayMaGiac"] },
  { id: "giaPhao", re: /架炮|炮架/, expect: ["giaPhao"] },
  { id: "danDu", re: /引离|引开|调离/, expect: ["danDu"] },
  { id: "khiTu", re: /弃车|弃马|弃炮|弃子/, expect: ["khiTuTranhTien", "pheQuanPhaSiTuong", "motXeDoiHai", "motXeDoiBa"] },
  { id: "phaSiTuong", re: /破士|破象|破仕|破相/, expect: ["tramSiPhaTuong", "kheoPhaSiTuong", "pheQuanPhaSiTuong"] },
  { id: "trungBinh", re: /中卒|中兵/, expect: ["doatTrungBinh"] },
  { id: "doiQuan", re: /兑车|兑马|兑炮|兑子/, expect: ["doiQuanGianhTien", "chuyenHoaTanCuoc"] },
  { id: "songXe", re: /双车/, expect: ["songXePhoiHop", "khuyetSiSongXe"] },
  { id: "xeMa", re: /车马冷着|冷着/, expect: ["xeMaLanhChieu"] },
];

interface Entry { file: string; fen: string; iccs: string; comment: string }
type Cached = { cp: number | null; mate: number | null; pv: string[] };

const cacheDir = path.join(process.cwd(), ".data", "audit-cache");
const cacheFile = path.join(cacheDir, `kypho-mid-${NODES}.json`);
const cache: Record<string, Cached> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};

async function main() {
  const entries: Entry[] = fs.readFileSync(path.join(process.cwd(), "data", "kypho", "loi-binh.jsonl"), "utf8")
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const cases: { e: Entry; group: (typeof GROUPS)[number]; move: Move }[] = [];
  for (const e of entries) {
    const group = GROUPS.find((g) => g.re.test(e.comment) && (!ONLY || g.id === ONLY));
    if (!group) continue;
    let pos;
    try {
      pos = parseFen(e.fen);
    } catch {
      continue;
    }
    const move = uciToMove(e.iccs);
    if (!move || !isLegal(pos, move) || isEndgame(pos.board)) continue;
    cases.push({ e, group, move });
  }

  const fens = new Set<string>();
  const states = cases.map((c) => {
    const state = replayMoves([c.move], c.e.fen);
    for (const p of state.history) fens.add(toFen(p));
    return state;
  });
  const todo = [...fens].filter((f) => !cache[f] && legalMoves(parseFen(f)).length > 0);
  if (todo.length) {
    console.error(`Cần chấm ${todo.length} thế cờ (${NODES} nodes)...`);
    const pool = getEnginePool();
    if (!pool) throw new Error("Không tìm thấy engine Pikafish (thư mục engine/)");
    await Promise.all(Array.from({ length: 2 }, async () => {
      for (let f = todo.pop(); f; f = todo.pop()) {
        const r = await pool.search(f, { nodes: NODES });
        cache[f] = { cp: r.cp, mate: r.mate, pv: r.pv ?? [] };
      }
    }));
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
    pool.close();
  }
  const evalOf = (fen: string): PositionEval => {
    const c = cache[fen];
    if (!c) return { score: -MATE_SCORE, best: null, pv: [] };
    const pv = c.pv.map(uciToMove).filter((m): m is Move => m !== null);
    return { score: engineScore(c.cp, c.mate), best: pv[0] ?? null, pv };
  };

  type Stat = { n: number; hit: number; other: Map<string, number>; hits: string[]; misses: string[] };
  const stats = new Map<string, Stat>();
  cases.forEach((c, k) => {
    const state = states[k];
    if (state.moves.length !== 1) return;
    // Thế kỳ phổ là giữa ván: truyền danh sách nước "không thuộc sách" để reviewMove không coi đây là nước khai cuộc
    const { review } = reviewMove(
      state.moves[0], 0, state, evalOf(toFen(state.history[0])), evalOf(toFen(state.history[1])), undefined, [], ["—"],
    );
    const zhao = review.facts.filter((f) => f.kind === "zhaoMiddlegame");
    const s: Stat = stats.get(c.group.id) ?? { n: 0, hit: 0, other: new Map(), hits: [], misses: [] };
    s.n++;
    const row = `${review.notation} (${review.cls ?? "-"}, loss ${review.loss}) ${c.e.fen}\n      lời bình: ${c.e.comment.replace(/\s+/g, " ").slice(0, 110)}\n      gắn: `;
    const hit = zhao.find((f) => f.kind === "zhaoMiddlegame" && c.group.expect.includes(f.tactic));
    if (hit && hit.kind === "zhaoMiddlegame") {
      s.hit++;
      if (s.hits.length < SAMPLES) s.hits.push(row + hit.summary);
    } else {
      for (const f of zhao) if (f.kind === "zhaoMiddlegame") s.other.set(f.tactic, (s.other.get(f.tactic) ?? 0) + 1);
      if (s.misses.length < SAMPLES) s.misses.push(row + (zhao.map((f) => (f.kind === "zhaoMiddlegame" ? f.tactic : "")).join(", ") || "(không)"));
    }
    stats.set(c.group.id, s);
  });

  console.log(`Lời bình ngoài tàn cuộc có từ khóa: ${cases.length}\n`);
  for (const g of GROUPS) {
    const s = stats.get(g.id);
    if (!s) continue;
    const other = [...s.other].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
    console.log(`${g.id.padEnd(14)} ${String(s.hit).padStart(3)}/${String(s.n).padEnd(3)} gắn đúng${other ? `; gắn khác: ${other}` : ""}`);
    for (const h of s.hits) console.log(`    ✓ ${h}`);
    for (const m of s.misses) console.log(`    - ${m}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
