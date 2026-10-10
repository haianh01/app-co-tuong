// Sinh thế cờ "sát cục" ngẫu nhiên có kiểm chứng, ghi vào src/lib/xiangqi/puzzles.generated.ts.
//   npx tsx scripts/generate-puzzles.ts [số thế 1 nước] [số thế 2 nước] [seed]
// Mỗi thế: đúng luật, chưa bên nào bị chiếu, có đúng MỘT nước thắng (để người chơi phải tìm, không đi bừa cũng trúng).

import { writeFileSync } from "node:fs";
import {
  applyMove, inCheck, legalMoves, outcome, sq, toFen, typeOf, type Board, type Move, type Position,
} from "../src/lib/xiangqi/engine";
import { toughestReply, winningMoves } from "../src/lib/xiangqi/mate";
import { moveNotation } from "../src/lib/xiangqi/notation";

const [n1 = 24, n2 = 12, seed = 20261010] = process.argv.slice(2).map(Number);

function rng(s: number) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(seed);
const int = (n: number) => Math.floor(rand() * n);
const pick = <T,>(a: readonly T[]) => a[int(a.length)];

type Sq = readonly [number, number];
const PALACE_B: Sq[] = [[0, 3], [0, 4], [0, 5], [1, 3], [1, 4], [1, 5], [2, 3], [2, 4], [2, 5]];
const PALACE_R: Sq[] = PALACE_B.map(([r, c]) => [9 - r, c]);
const ADVISOR_B: Sq[] = [[0, 3], [0, 5], [1, 4], [2, 3], [2, 5]];
const ADVISOR_R: Sq[] = ADVISOR_B.map(([r, c]) => [9 - r, c]);
const ELEPHANT_B: Sq[] = [[0, 2], [0, 6], [2, 0], [2, 4], [2, 8], [4, 2], [4, 6]];
const ELEPHANT_R: Sq[] = ELEPHANT_B.map(([r, c]) => [9 - r, c]);

/** Ô hợp lệ cho tốt: chưa qua sông thì chỉ ở cột chẵn của hàng xuất phát/hàng kế. */
const pawnSquares = (side: "r" | "b"): Sq[] => {
  const out: Sq[] = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const home = side === "r" ? r >= 5 : r <= 4;
      const start = side === "r" ? r === 5 || r === 6 : r === 3 || r === 4;
      if (home ? start && c % 2 === 0 : true) out.push([r, c]);
    }
  }
  return out;
};
const PAWN_R = pawnSquares("r").filter(([r]) => r <= 6);
const PAWN_B = pawnSquares("b");
const anywhere = (rows: [number, number]): Sq[] => {
  const out: Sq[] = [];
  for (let r = rows[0]; r <= rows[1]; r++) for (let c = 0; c < 9; c++) out.push([r, c]);
  return out;
};
const RED_ATTACK = anywhere([0, 4]);
const BLACK_ANY = anywhere([0, 9]);

function randomPosition(): Position | null {
  const board: Board = Array(90).fill(null);
  const put = (p: string, squares: Sq[]) => {
    const free = squares.filter(([r, c]) => !board[sq(r, c)]);
    if (!free.length) return false;
    const [r, c] = pick(free);
    board[sq(r, c)] = p;
    return true;
  };
  put("k", PALACE_B);
  put("K", PALACE_R);
  for (let i = 1 + int(2); i > 0; i--) put("a", ADVISOR_B);
  for (let i = 1 + int(2); i > 0; i--) put("b", ELEPHANT_B);
  for (let i = 1 + int(2); i > 0; i--) {
    const t = pick(["r", "n", "c", "p", "p"] as const);
    put(t, t === "p" ? PAWN_B : BLACK_ANY);
  }
  for (let i = int(3); i > 0; i--) put("A", ADVISOR_R);
  for (let i = int(2); i > 0; i--) put("B", ELEPHANT_R);
  const attackers = 2 + int(2);
  for (let i = 0; i < attackers; i++) {
    const t = pick(["R", "R", "N", "N", "C", "C", "P", "P"] as const);
    put(t, t === "P" ? PAWN_R : RED_ATTACK);
  }
  // Tối đa 2 xe/mã/pháo, 5 tốt, 2 sĩ/tượng mỗi bên.
  const counts = new Map<string, number>();
  for (const p of board) if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  for (const [p, n] of counts) if (n > ("kK".includes(p) ? 1 : "pP".includes(p) ? 5 : 2)) return null;

  const pos: Position = { board, turn: "r" };
  if (inCheck(board, "b") || inCheck(board, "r")) return null;
  if (outcome(pos).over || legalMoves(pos).length < 15) return null;
  // Đen phải còn đường xoay xở (không bị vây sẵn).
  if (legalMoves({ board, turn: "b" }).length < 4) return null;
  return pos;
}

const NAME: Record<string, string> = { r: "Xe", n: "Mã", c: "Pháo", p: "Tốt" };
const MOVER: Record<string, string> = { ...NAME, k: "Tướng (dùng luật lộ mặt tướng)", a: "Sĩ", b: "Tượng" };
const HINT: Record<string, string> = {
  r: "Xe là quân ra đòn quyết định.",
  n: "Mã ra đòn: để ý chân mã và các ô quanh cung tướng.",
  c: "Pháo cần ngòi: tìm quân làm ngòi cho pháo chiếu.",
  p: "Tốt đã qua sông cũng chiếu được tướng.",
};

function composition(board: Board) {
  const types = board.filter((p): p is string => !!p && p === p.toUpperCase() && "RNCP".includes(p)).map((p) => typeOf(p));
  const order = ["r", "n", "c", "p"];
  const uniq = order.filter((t) => types.includes(t as never));
  const twice = (t: string) => types.filter((x) => x === t).length >= 2;
  return uniq.map((t) => (twice(t) ? `Song ${NAME[t]}` : NAME[t])).join(" ");
}

interface Out {
  fen: string;
  depth: 1 | 2;
  solution: Move;
  title: string;
  hint: string;
  solutionText: string;
}

const seen = new Set<string>();
const titles = new Map<string, number>();
const ROMAN = ["", " II", " III", " IV", " V", " VI", " VII", " VIII"];

function title(base: string) {
  const k = titles.get(base) ?? 0;
  titles.set(base, k + 1);
  return k < ROMAN.length ? base + ROMAN[k] : `${base} ${k + 1}`;
}

const MATERS = ["r", "n", "c", "r", "n", "c", "p"];

function tryMateIn1(pos: Position, index: number): Out | null {
  const wins = winningMoves(pos, 1);
  if (wins.length !== 1) return null;
  const m = wins[0];
  const after = applyMove(pos, m);
  if ((outcome(after) as { reason?: string }).reason !== "checkmate") return null;
  const piece = typeOf(pos.board[m.from]!);
  if (piece !== MATERS[index % MATERS.length]) return null;
  return {
    fen: toFen(pos), depth: 1, solution: m, title: title(composition(pos.board)), hint: HINT[piece],
    solutionText: moveNotation(pos.board, m),
  };
}

function tryMateIn2(pos: Position): Out | null {
  if (winningMoves(pos, 1, true).length) return null;
  const wins = winningMoves(pos, 2);
  if (wins.length !== 1) return null;
  const m = wins[0];
  const after = applyMove(pos, m);
  const reply = toughestReply(after, 1);
  if (!reply) return null; // Nước đầu đã thắng ngay (vây hết nước) — không đúng thể loại 2 nước.
  const after2 = applyMove(after, reply);
  const [mate] = winningMoves(after2, 1);
  if ((outcome(applyMove(after2, mate)) as { reason?: string }).reason !== "checkmate") return null;
  const piece = typeOf(pos.board[m.from]!);
  const checks = inCheck(after.board, "b");
  return {
    fen: toFen(pos), depth: 2, solution: m, title: title(composition(pos.board)),
    hint: `Nước đầu đi ${MOVER[piece]}${checks ? " và chiếu tướng" : ", không cần chiếu: hãy khóa đường thoát của tướng"}.`,
    solutionText: [moveNotation(pos.board, m), moveNotation(after.board, reply), moveNotation(after2.board, mate)].join(" "),
  };
}

function generate(count: number, fn: (p: Position, index: number) => Out | null, label: string) {
  const out: Out[] = [];
  let tried = 0;
  const t0 = Date.now();
  while (out.length < count) {
    tried++;
    const pos = randomPosition();
    if (!pos) continue;
    const fen = toFen(pos);
    if (seen.has(fen)) continue;
    const res = fn(pos, out.length);
    if (res) {
      seen.add(fen);
      out.push(res);
      process.stdout.write(`\r${label}: ${out.length}/${count} (thử ${tried}, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
  }
  process.stdout.write("\n");
  return out;
}

const mate1 = generate(n1, tryMateIn1, "Sát 1 nước");
const mate2 = generate(n2, tryMateIn2, "Sát 2 nước");

const lines = [
  "// Tự sinh bởi scripts/generate-puzzles.ts — đừng sửa tay. Kiểm chứng trong puzzle-data.test.ts.",
  "",
  'import type { Puzzle } from "./puzzles";',
  "",
  "export const GENERATED_PUZZLES: Puzzle[] = [",
  ...[...mate1.map((p, i) => ({ p, i, id: `sat1-${String(i + 1).padStart(2, "0")}` })), ...mate2.map((p, i) => ({ p, i, id: `sat2-${String(i + 1).padStart(2, "0")}` }))].map(
    ({ p, id }) =>
      `  { id: ${JSON.stringify(id)}, chapter: ${JSON.stringify(p.depth === 1 ? "Sát cục 1 nước" : "Sát cục 2 nước")}, depth: ${p.depth}${p.depth === 2 ? ", vip: true" : ""}, title: ${JSON.stringify(p.title)}, goal: ${JSON.stringify(`Đỏ đi trước, chiếu bí trong ${p.depth} nước.`)}, fen: ${JSON.stringify(p.fen)}, hint: ${JSON.stringify(p.hint)}, solution: { from: ${p.solution.from}, to: ${p.solution.to} }, solutionText: ${JSON.stringify(p.solutionText)} },`,
  ),
  "];",
  "",
];
writeFileSync("src/lib/xiangqi/puzzles.generated.ts", lines.join("\n"));
console.log(`Đã ghi ${mate1.length + mate2.length} thế cờ.`);
