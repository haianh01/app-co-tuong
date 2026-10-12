// AI cờ tướng: negamax + cắt tỉa alpha-beta, tìm kiếm tĩnh (quiescence) cho nước ăn quân,
// đào sâu dần trong giới hạn thời gian. Cấp thấp thêm nhiễu để đánh "người" hơn.

import {
  Board, Move, Position, Side, PieceType,
  pseudoMoves, inCheck, sideOf, typeOf, rowOf, colOf, opponent,
} from "./engine";

export type AiLevel = 1 | 2 | 3 | 4 | 5;

export const AI_LEVELS: Record<AiLevel, { label: string; depth: number; timeMs: number; noise: number }> = {
  1: { label: "Tân thủ", depth: 1, timeMs: 300, noise: 220 },
  2: { label: "Dễ", depth: 2, timeMs: 600, noise: 80 },
  3: { label: "Trung bình", depth: 3, timeMs: 1200, noise: 25 },
  4: { label: "Khó", depth: 4, timeMs: 2500, noise: 0 },
  5: { label: "Đại sư", depth: 7, timeMs: 4500, noise: 0 },
};

const VALUE: Record<PieceType, number> = { k: 0, a: 200, b: 200, n: 400, r: 900, c: 450, p: 100 };
const MATE = 100000;

/** Điểm vị trí đơn giản, tính theo góc nhìn của quân đó (rel = số hàng đã tiến khỏi đáy). */
function positional(t: PieceType, rel: number, col: number): number {
  const center = 4 - Math.abs(col - 4);
  switch (t) {
    case "p":
      if (rel < 5) return 0;
      if (rel === 9) return 20; // tốt chạm đáy kém giá trị
      return 70 + (rel - 5) * 20 + center * 8;
    case "n":
      return center * 8 + Math.min(rel, 6) * 6;
    case "c":
      return (col === 4 ? 20 : 0) + (rel <= 2 ? 10 : 0);
    case "r":
      return (rel >= 5 ? 20 : 0) + center * 3;
    default:
      return 0;
  }
}

export function evaluate(board: Board): number {
  let score = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p) continue;
    const t = typeOf(p);
    const red = sideOf(p) === "r";
    const rel = red ? 9 - rowOf(i) : rowOf(i);
    const v = VALUE[t] + positional(t, rel, colOf(i));
    score += red ? v : -v;
  }
  return score;
}

interface SearchCtx {
  deadline: number;
  nodes: number;
  stopped: boolean;
}

function orderedMoves(board: Board, s: Side, capturesOnly: boolean, first?: Move): Move[] {
  const moves: { m: Move; key: number }[] = [];
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p || sideOf(p) !== s) continue;
    for (const to of pseudoMoves(board, i)) {
      const victim = board[to];
      if (capturesOnly && !victim) continue;
      let key = victim ? VALUE[typeOf(victim)] * 10 - VALUE[typeOf(p)] / 10 + 1 : 0;
      if (victim && typeOf(victim) === "k") key = 1e9;
      if (first && first.from === i && first.to === to) key = 1e10;
      moves.push({ m: { from: i, to }, key });
    }
  }
  moves.sort((a, b) => b.key - a.key);
  return moves.map((x) => x.m);
}

function make(board: Board, m: Move): Board[number] {
  const captured = board[m.to];
  board[m.to] = board[m.from];
  board[m.from] = null;
  return captured;
}

function unmake(board: Board, m: Move, captured: Board[number]) {
  board[m.from] = board[m.to];
  board[m.to] = captured;
}

function timeUp(ctx: SearchCtx): boolean {
  if ((++ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) ctx.stopped = true;
  return ctx.stopped;
}

function quiesce(board: Board, s: Side, alpha: number, beta: number, ctx: SearchCtx, qdepth: number): number {
  if (timeUp(ctx)) return 0;
  const stand = s === "r" ? evaluate(board) : -evaluate(board);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  if (qdepth >= 6) return stand;
  for (const m of orderedMoves(board, s, true)) {
    const cap = make(board, m);
    if (inCheck(board, s)) {
      unmake(board, m, cap);
      continue;
    }
    const score = -quiesce(board, opponent(s), -beta, -alpha, ctx, qdepth + 1);
    unmake(board, m, cap);
    if (ctx.stopped) return 0;
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(board: Board, s: Side, depth: number, alpha: number, beta: number, ply: number, ctx: SearchCtx): number {
  if (timeUp(ctx)) return 0;
  const checked = inCheck(board, s);
  if (depth <= 0 && !checked) return quiesce(board, s, alpha, beta, ctx, 0);
  let best = -MATE;
  let legal = 0;
  for (const m of orderedMoves(board, s, false)) {
    const cap = make(board, m);
    if (inCheck(board, s)) {
      unmake(board, m, cap);
      continue;
    }
    legal++;
    const score = -negamax(board, opponent(s), depth - 1, -beta, -alpha, ply + 1, ctx);
    unmake(board, m, cap);
    if (ctx.stopped) return 0;
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  // Hết nước đi = thua (cả khi bị chiếu bí lẫn bị vây chặt).
  if (legal === 0) return -MATE + ply;
  return best;
}

export interface AiResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
  /** Chuỗi nước đi chính của engine dạng UCI (vd: ["h2e2", "b9c7"]). */
  pv?: string[];
  /** Chuỗi nước đi chính dạng Move. */
  pvMoves?: Move[];
}

/** Ghi đè cấu hình của cấp độ (vd. phân tích ván: độ sâu cố định, không nhiễu). */
export interface SearchOverrides {
  depth?: number;
  timeMs?: number;
  noise?: number;
  /** Nước bị cấm ở gốc (vd. phạm luật chiếu mãi); chỉ đi khi không còn nước nào khác. */
  avoid?: Move[];
}

export function findBestMove(
  pos: Position,
  level: AiLevel,
  random: () => number = Math.random,
  overrides: SearchOverrides = {},
): AiResult {
  const cfg = { ...AI_LEVELS[level], ...overrides };
  const board = pos.board.slice();
  const s = pos.turn;
  const ctx: SearchCtx = { deadline: Date.now() + cfg.timeMs, nodes: 0, stopped: false };
  let bestMove: Move | null = null;
  let bestScore = -MATE;
  let reached = 0;
  const avoid = cfg.avoid ?? [];
  const isAvoided = (m: Move) => avoid.some((a) => a.from === m.from && a.to === m.to);
  const allowed = orderedMoves(board, s, false).filter((m) => {
    const cap = make(board, m);
    const ok = !inCheck(board, s);
    unmake(board, m, cap);
    return ok && !isAvoided(m);
  });
  // Mọi nước đều bị cấm thì vẫn phải đi (thua theo luật), không tự bỏ lượt.
  const skip = allowed.length > 0 ? isAvoided : () => false;

  for (let depth = 1; depth <= cfg.depth; depth++) {
    let iterBest: Move | null = null;
    let iterScore = -Infinity;
    let alpha = -MATE - 1;
    for (const m of orderedMoves(board, s, false, bestMove ?? undefined)) {
      if (skip(m)) continue;
      const cap = make(board, m);
      if (inCheck(board, s)) {
        unmake(board, m, cap);
        continue;
      }
      const raw = -negamax(board, opponent(s), depth - 1, -MATE - 1, -alpha + cfg.noise, 1, ctx);
      unmake(board, m, cap);
      if (ctx.stopped) break;
      const score = raw + (cfg.noise ? random() * cfg.noise : 0);
      if (score > iterScore) {
        iterScore = score;
        iterBest = m;
      }
      if (raw > alpha) alpha = raw;
    }
    if (ctx.stopped && depth > 1) break;
    if (iterBest) {
      bestMove = iterBest;
      bestScore = iterScore;
      reached = depth;
    }
    if (bestScore > MATE - 100) break; // đã thấy đường chiếu bí
  }
  return { move: bestMove, score: Math.round(bestScore), depth: reached, nodes: ctx.nodes };
}
