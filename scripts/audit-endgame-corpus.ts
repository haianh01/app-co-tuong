/**
 * Đối chiếu nguyên lý tàn cuộc (endgame-principles.ts) với lời bình của chuyên gia trong kỳ phổ (data/kypho/loi-binh.jsonl).
 * Lời bình nào ở thế tàn cuộc có từ khóa của một kỹ thuật (等着 = nước chờ, 顿挫 = đốn tỏa, 卧槽 = ngọa tào...) thì
 * chấm thế trước / sau bằng Pikafish (cache trong .data/audit-cache), chạy endgamePrincipleFacts kèm bộ lọc của reviewMove,
 * rồi đếm số nước được gắn đúng nguyên lý (độ phủ) và in vài nước bị bỏ sót để xem vì sao.
 * Từ khóa chỉ là gợi ý: lời bình có thể nói về cả biến chứ không riêng nước đó, nên đọc mẫu trước khi kết luận.
 *
 *   npx tsx scripts/audit-endgame-corpus.ts [--nodes 30000] [--misses 3] [--only nuocCho]
 */
import fs from "node:fs";
import path from "node:path";
import { classifyWinDrop, winChance } from "../src/lib/xiangqi/analysis";
import { isLegal, legalMoves, opponent, parseFen, play, toFen, type Move, type Position } from "../src/lib/xiangqi/engine";
import { endgamePrincipleFacts, isEndgame, type EndgamePrinciple } from "../src/lib/xiangqi/endgame-principles";
import { moveNotation } from "../src/lib/xiangqi/notation";
import { engineScore, MATE_SCORE, uciToMove } from "../src/lib/xiangqi/uci";
import { getEnginePool } from "../src/server/engine/uci";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const NODES = Number(arg("--nodes", "30000"));
const MISSES = Number(arg("--misses", "3"));
const ONLY = arg("--only", "");

/** Từ khóa trong lời bình -> các nguyên lý được coi là nhận đúng. */
const GROUPS: { id: string; re: RegExp; expect: EndgamePrinciple[] }[] = [
  { id: "nuocCho", re: /等着|闲着|停着|欠行/, expect: ["nuocCho"] },
  { id: "donToa", re: /顿挫/, expect: ["kyThuatDonToa"] },
  { id: "haiDeLaoNguyet", re: /海底捞月/, expect: ["haiDeLaoNguyet"] },
  { id: "ngoaTao", re: /卧槽/, expect: ["maHoatChienThang", "xeMaLanhChieu"] },
  { id: "vayKhon", re: /捉死|困死|困毙/, expect: ["chienThuatVayKhon", "chienThuatKiemChe"] },
  { id: "kiemChe", re: /牵制|牵住|拴链/, expect: ["chienThuatKiemChe"] },
  { id: "danhChan", re: /拦截/, expect: ["kyThuatDanhChan"] },
  { id: "chiemTrung", re: /占中/, expect: ["nguyenTacChiemTrung"] },
  { id: "cauHoa", re: /守和|巧和|谋和|成和/, expect: ["giaiHoa", "giuSiTuong"] },
  { id: "thang", re: /例胜|胜定/, expect: ["doiVeTanCuocThang"] },
  { id: "totDay", re: /底兵|老兵|底卒|老卒/, expect: ["totGia", "laoBinhKhongChet"] },
  { id: "troCong", re: /助攻|露帅|露将|出帅|出将/, expect: ["tuongTroCong", "loSuonApDay"] },
  { id: "phaSiTuong", re: /破士|破象|破仕|破相|得士|得象|得仕|得相/, expect: ["phaSiTuongCoXe", "phaSiTuongKhongXe", "xeChotPhaSiTuong", "binhTanSiTuong", "totDoiSi"] },
  { id: "muuBinh", re: /吃兵|吃卒|得兵|得卒|谋兵|谋卒/, expect: ["muuBinhCoXe", "muuBinhKhongXe", "donTotKhongCheTuyen"] },
];

interface Entry { file: string; fen: string; iccs: string; move: string; comment: string }

const CAP = 1500;
const clamp = (v: number) => Math.max(-CAP, Math.min(CAP, v));

const cacheDir = path.join(process.cwd(), ".data", "audit-cache");
const cacheFile = path.join(cacheDir, `kypho-endgame-${NODES}.json`);
const cache: Record<string, { cp: number | null; mate: number | null; pv: string[] }> =
  fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};

async function main() {
  const file = path.join(process.cwd(), "data", "kypho", "loi-binh.jsonl");
  const entries: Entry[] = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const cases: { e: Entry; group: (typeof GROUPS)[number]; pos: Position; move: Move; next: Position }[] = [];
  for (const e of entries) {
    const group = GROUPS.find((g) => g.re.test(e.comment) && (!ONLY || g.id === ONLY));
    if (!group) continue;
    let pos: Position;
    try {
      pos = parseFen(e.fen);
    } catch {
      continue;
    }
    const move = uciToMove(e.iccs);
    if (!move || !isLegal(pos, move)) continue;
    const next = { board: play(pos.board, move), turn: opponent(pos.turn) };
    if (!isEndgame(pos.board) && !isEndgame(next.board)) continue;
    cases.push({ e, group, pos, move, next });
  }

  const fens = [...new Set(cases.flatMap((c) => [toFen(c.pos), toFen(c.next)]))].filter((f) => !cache[f]);
  if (fens.length) {
    const pool = getEnginePool();
    if (!pool) throw new Error("Không tìm thấy engine Pikafish (thư mục engine/)");
    await Promise.all(Array.from({ length: 2 }, async () => {
      for (let f = fens.pop(); f; f = fens.pop()) {
        if (legalMoves(parseFen(f)).length === 0) continue;
        const r = await pool.search(f, { nodes: NODES });
        cache[f] = { cp: r.cp, mate: r.mate, pv: r.pv ?? [] };
      }
    }));
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
    pool.close();
  }
  const evalOf = (pos: Position) => {
    const c = cache[toFen(pos)];
    if (!c) return { score: -MATE_SCORE, best: null, pv: [] as Move[] };
    const pv = c.pv.map(uciToMove).filter((m): m is Move => m !== null);
    return { score: engineScore(c.cp, c.mate), best: pv[0] ?? null, pv };
  };

  type Stat = { n: number; hit: number; other: Map<string, number>; misses: string[] };
  const stats = new Map<string, Stat>();
  for (const c of cases) {
    const before = evalOf(c.pos);
    const after = evalOf(c.next);
    const playedBest = before.best?.from === c.move.from && before.best?.to === c.move.to;
    const loss = playedBest ? 0 : Math.max(0, clamp(before.score) + clamp(after.score));
    const winDrop = playedBest ? 0 : Math.max(0, winChance(clamp(before.score)) - winChance(-clamp(after.score)));
    const isFault = classifyWinDrop(winDrop, undefined, loss) !== null;
    const facts = endgamePrincipleFacts(c.pos.board, c.move, c.next.board, { pv: after.pv, loss, evalBefore: before, evalAfter: after })
      .filter((f) => f.tone !== "note" && (f.tone === "critique" ? isFault : !isFault));
    const s: Stat = stats.get(c.group.id) ?? { n: 0, hit: 0, other: new Map(), misses: [] };
    s.n++;
    if (facts.some((f) => c.group.expect.includes(f.principle))) {
      s.hit++;
    } else {
      for (const f of facts) s.other.set(f.principle, (s.other.get(f.principle) ?? 0) + 1);
      if (s.misses.length < MISSES) {
        s.misses.push(
          `${moveNotation(c.pos.board, c.move)} (loss ${Math.round(loss)}, điểm ${before.score}) ${toFen(c.pos)}\n` +
          `      lời bình: ${c.e.comment.replace(/\s+/g, " ").slice(0, 120)}\n` +
          `      gắn: ${facts.map((f) => f.principle).join(", ") || "(không)"}`,
        );
      }
    }
    stats.set(c.group.id, s);
  }

  console.log(`Lời bình ở thế tàn cuộc có từ khóa: ${cases.length}\n`);
  for (const g of GROUPS) {
    const s = stats.get(g.id);
    if (!s) continue;
    const other = [...s.other].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
    console.log(`${g.id.padEnd(16)} ${String(s.hit).padStart(3)}/${String(s.n).padEnd(3)} gắn đúng${other ? `; gắn khác: ${other}` : ""}`);
    for (const m of s.misses) console.log(`    - ${m}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
