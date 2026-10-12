// Giải thích vì sao một nước bị chấm là hớ/kém, không cần LLM:
// 1. Rút dữ kiện kỳ lý từ bàn cờ và điểm AI (quân bị treo, bắt đôi, đường chiếu bí, cơ hội bị bỏ lỡ…).
// 2. Ghép dữ kiện thành câu bằng mẫu có sẵn.
// Dữ kiện là JSON thuần: sau này có thể đưa thẳng cho LLM viết lời giảng thay cho bước 2.

import { findBestMove } from "./ai";
import type { PositionEval } from "./analysis";
import {
  Board, Move, Piece, PieceType, Side,
  attackersOf, colOf, inCheck, isDefended, opponent, rowOf, sideOf, typeOf, ROWS, COLS,
  findKing, isAttacked, pseudoMoves, sq,
} from "./engine";
import { PIECE_NAME, moveNotation } from "./notation";
import {
  GAIN_TEXT, LOSS_TEXT, PLAN_NAME, PLAN_TEXT, PRINCIPLES, WEIGHTS, choosePlan, comparePrinciples, principleScores,
  type OpeningFaultType, type Plan, type Principle, detectOpeningFault,
} from "./strategy";
import { detectTheoreticalEndgame, type TheoreticalEndgame } from "./endgame";
import { buildLlmCommentaryPrompt, generateLlmCommentary, type LlmCommentaryOptions, type LlmPrompt } from "./llm-commentary";

/** Điểm thắng tuyệt đối mà AI trả về khi thấy chiếu bí (khớp với MATE trong ai.ts). */
const MATE = 100_000;
const isMateScore = (score: number) => score >= MATE - 100;
/** Số nước (của một bên) đến khi chiếu bí, suy từ điểm AI: MATE − số nửa nước. */
const mateIn = (score: number) => (MATE - score + 1) >> 1;

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Giá trị quân theo cách đếm quen thuộc (100 = một Tốt chưa qua sông). Tướng chỉ dùng khi xếp thứ tự quân ăn. */
const VALUE: Record<PieceType, number> = { k: 10_000, a: 200, b: 200, n: 400, r: 900, c: 450, p: 100 };

function valueAt(board: Board, square: number): number {
  const p = board[square];
  if (!p) return 0;
  const t = typeOf(p);
  if (t !== "p") return VALUE[t] ?? 0;
  const crossed = sideOf(p) === "r" ? rowOf(square) <= 4 : rowOf(square) >= 5;
  return crossed ? 200 : 100;
}

function play(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

/** Nước ăn quân ở `target` bằng quân rẻ nhất của phe `by` mà không tự để tướng bị chiếu. */
function cheapestCapture(board: Board, target: number, by: Side): Board | null {
  let best: { next: Board; value: number } | null = null;
  for (const from of attackersOf(board, target, by)) {
    const value = valueAt(board, from);
    if (best && value >= best.value) continue;
    const next = play(board, { from, to: target });
    if (!inCheck(next, by)) best = { next, value };
  }
  return best?.next ?? null;
}

/** Lời của phe `by` khi được quyền ăn ở `target` (được dừng nếu ăn tiếp không có lợi). */
function swap(board: Board, target: number, by: Side): number {
  const next = cheapestCapture(board, target, by);
  if (!next) return 0;
  return Math.max(0, valueAt(board, target) - swap(next, target, opponent(by)));
}

/**
 * Phe `by` lời bao nhiêu điểm nếu ăn quân ở `target` rồi hai bên thay nhau ăn lại bằng quân rẻ nhất.
 * `null` khi không ăn được. Dương = ăn có lời (quân ở `target` đang bị treo).
 */
export function exchangeGain(board: Board, target: number, by: Side): number | null {
  const victim = board[target];
  if (!victim || sideOf(victim) === by || typeOf(victim) === "k") return null;
  const next = cheapestCapture(board, target, by);
  if (!next) return null;
  return valueAt(board, target) - swap(next, target, opponent(by));
}

/** Các quân (trừ Tướng) của phe `side` mà đối phương ăn được có lời. */
export function hangingPieces(board: Board, side: Side): number[] {
  const out: number[] = [];
  const opp = opponent(side);
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p || sideOf(p) !== side || typeOf(p) === "k") continue;
    if (!isAttacked(board, i, opp)) continue;
    if ((exchangeGain(board, i, opp) ?? 0) > 0) out.push(i);
  }
  return out;
}

/** Quân được nhắc tới trong lời giải thích. `name` đã kèm số cột khi phe đó có hai quân cùng loại, vd. "Xe 1". */
export interface PieceRef {
  piece: Piece;
  square: number;
  name: string;
}

const fileNumber = (col: number, s: Side) => (s === "r" ? 9 - col : col + 1);

function ref(board: Board, square: number): PieceRef {
  const piece = board[square]!;
  const s = sideOf(piece);
  const col = colOf(square);
  const name = PIECE_NAME[typeOf(piece)] ?? "Quân";
  const twins = board.filter((p) => p === piece).length;
  if (twins < 2) return { piece, square, name };
  const sameFile: number[] = [];
  for (let r = 0; r < ROWS; r++) if (board[r * 9 + col] === piece) sameFile.push(r);
  if (sameFile.length >= 2) {
    const front = s === "r" ? Math.min(...sameFile) : Math.max(...sameFile);
    return { piece, square, name: `${name} ${rowOf(square) === front ? "trước" : "sau"}` };
  }
  return { piece, square, name: `${name} ${fileNumber(col, s)}` };
}

/** Vì sao quân bị mất. */
export type LossCause =
  | "moved" // quân vừa đi tới ô bị ăn
  | "trade" // vừa ăn quân nhưng bị ăn lại, đổi thiệt
  | "ignored" // quân đã bị bắt từ trước mà không xử lý
  | "opened" // quân vừa đi mở đường cho quân đối phương
  | "screen" // quân vừa đi làm ngòi cho Pháo đối phương
  | "unguarded" // nước đi làm quân mất bảo vệ
  | "other";

export type Fact =
  /** Sau nước này đối phương chiếu bí được trong `moves` nước, bắt đầu bằng `reply`. */
  | { kind: "allowsMate"; moves: number; reply: string }
  /** Đang có đường chiếu bí trong `moves` nước (bắt đầu bằng `better`) mà không đi. */
  | { kind: "missedMate"; moves: number; better: string }
  /** Nước `better` chặn được đường chiếu bí mà nước đã đi để lọt. */
  | { kind: "avoidsMate"; better: string }
  /** Đối phương đáp `reply`, hai quân `checkers` cùng lúc chiếu tướng (chiếu kép). */
  | { kind: "doubleCheck"; reply: string; checkers: PieceRef[] }
  /** Đối phương đáp `reply`: `moved` rút đi mở đường cho `checker` chiếu tướng (chiếu rút), đồng thời đe dọa hoặc ăn `target`. */
  | { kind: "discoveredCheck"; reply: string; moved: PieceRef; checker: PieceRef; target: PieceRef | null }
  /** Đối phương đáp `reply`: `pinner` ghim `pinned` trước `behind` (không thể di chuyển vì để lộ Tướng/quân lớn). */
  | { kind: "pin"; reply: string; pinner: PieceRef; pinned: PieceRef; behind: PieceRef; absolute: boolean }
  /** Quân bị cản chân Mã hoặc đối phương ngáng chân Mã. */
  | { kind: "horseBlock"; horse: PieceRef; blocker: PieceRef; byOpponent: boolean; reply?: string }
  /** Quân bị vây khốn/bắt chết, không còn ô an toàn để tháo lui. */
  | { kind: "trappedPiece"; piece: PieceRef; attacker?: PieceRef; reply?: string }
  /** Đối phương đáp `reply`, dùng `attacker` ăn `victim`; bên đi thiệt `points` (đã tính đổi quân). */
  | {
      kind: "losesPiece"; cause: LossCause; reply: string; victim: PieceRef; attacker: PieceRef;
      moved: PieceRef; took: PieceRef | null; defended: boolean; points: number; free: boolean;
    }
  /** Đối phương đáp `reply`: chiếu tướng và/hoặc bắt các quân `targets` (hai quân trở lên = bắt đôi). */
  | { kind: "threatens"; reply: string; attacker: PieceRef; check: boolean; targets: PieceRef[] }
  /** Nước tốt hơn `better` ăn được `victim` có lời `points`. */
  | { kind: "missedCapture"; better: string; victim: PieceRef; points: number }
  /** Nước tốt hơn `better` đưa `piece` đang bị bắt ra chỗ an toàn. */
  | { kind: "missedEscape"; better: string; piece: PieceRef }
  /** Lỗi căn bản trong khai cuộc (đi một quân nhiều lần, chậm ra Xe). */
  | { kind: "openingFault"; fault: OpeningFaultType; piece?: PieceRef; better?: string; opening?: string }
  /** Không có lỗi chiến thuật: theo kế hoạch `plan`, nước `better` hơn ở các nguyên lý `gains`; nước đã đi làm kém `worsened`. */
  | { kind: "strategy"; plan: Plan; played: string; better: string; gains: Principle[]; worsened: Principle[]; loose: string[]; opening?: string }
  /** Nhận xét chiến lược cho một nước bất kỳ: theo kế hoạch `plan`, nước đã đi cải thiện `gains`, làm kém `worsened`. */
  | { kind: "idea"; plan: Plan; played: string; gains: Principle[]; worsened: Principle[]; loose: string[]; opening?: string }
  /** Không tìm ra lý do cụ thể: chỉ nói nước đáp mạnh nhất và mức thiệt theo AI. */
  | { kind: "evalDrop"; reply: string | null; check: boolean; points: number }
  /** Đang có ưu thế thắng rõ rệt nhưng để rớt về thế cân bằng. */
  | { kind: "missedWin"; better?: string; points?: number }
  /** Nhận diện tàn cuộc lý thuyết thắng hoặc hòa. */
  | { kind: "endgame"; endgame: TheoreticalEndgame };

export interface MoveContext {
  before: Board;
  move: Move;
  after: Board;
  /** Điểm AI của thế trước nước đi (theo bên đi) và nước AI chọn. */
  evalBefore: PositionEval | null;
  /** Điểm AI của thế sau nước đi (theo đối phương) và nước đáp AI chọn. */
  evalAfter: PositionEval | null;
  /** Điểm mất so với nước tốt nhất (từ reviewGame). */
  loss: number;
  /** Số nửa nước đã đi trước nước này (để biết giai đoạn ván). */
  ply?: number;
  /** Tên thế trận khai cuộc nếu nhận diện được (vd: "Pháo đầu (Trung pháo)"). */
  opening?: string;
  /** Lịch sử các nước cờ đã đi trước nước này. */
  historyMoves?: Move[];
}

const sameMove = (a: Move | null | undefined, b: Move) => !!a && a.from === b.from && a.to === b.to;

/** Rút các dữ kiện giải thích một nước đi, xếp theo mức quan trọng giảm dần. */
export function explainMove(ctx: MoveContext): Fact[] {
  const { before, move, after, evalBefore, evalAfter, loss } = ctx;
  const mover = sideOf(before[move.from]!);
  const facts: Fact[] = [];
  const reply = evalAfter?.best ?? null;
  const better = evalBefore?.best && !sameMove(evalBefore.best, move) ? evalBefore.best : null;

  // Bỏ lỡ chiếu bí là lý do chính; mọi chuyện xảy ra sau nước đi chỉ là hệ quả.
  if (better && evalBefore && isMateScore(evalBefore.score)) {
    return [{ kind: "missedMate", moves: mateIn(evalBefore.score), better: moveNotation(before, better) }];
  }
  if (reply && evalAfter && isMateScore(evalAfter.score)) {
    facts.push({ kind: "allowsMate", moves: mateIn(evalAfter.score), reply: moveNotation(after, reply) });
    // Thế trước nước đi chưa bị chiếu bí, nên nước AI chọn là nước chặn được.
    if (better) facts.push({ kind: "avoidsMate", better: moveNotation(before, better) });
    return facts;
  }

  if (reply) {
    const checkFact = detectCheckTactics(after, reply, mover);
    if (checkFact) facts.push(checkFact);
  }
  if (facts.length === 0) {
    const selfBlock = detectHorseBlock(ctx, null);
    if (selfBlock && selfBlock.kind === "horseBlock" && !selfBlock.byOpponent) facts.push(selfBlock);
  }
  if (reply && facts.length === 0) {
    const captureFact = after[reply.to] ? lossByCapture(ctx, reply) : null;
    if (captureFact) facts.push(captureFact);
  }
  if (reply && facts.length === 0) {
    const pinFact = detectPin(after, reply, mover);
    if (pinFact) facts.push(pinFact);
  }
  if (facts.length === 0) {
    const horseFact = detectHorseBlock(ctx, reply);
    if (horseFact) facts.push(horseFact);
  }
  if (facts.length === 0) {
    const trappedFact = detectTrappedPiece(ctx, reply);
    if (trappedFact) facts.push(trappedFact);
  }
  if (reply && facts.length === 0) {
    const threat = threatAfter(after, reply, mover);
    if (threat) facts.push(threat);
  }
  if (better) {
    const missed = missedChance(before, after, move, better, mover);
    if (missed) facts.push(missed);
  }
  const tactical = facts.some(
    (f) =>
      f.kind === "losesPiece" ||
      f.kind === "missedCapture" ||
      f.kind === "missedEscape" ||
      f.kind === "doubleCheck" ||
      f.kind === "discoveredCheck" ||
      f.kind === "pin" ||
      f.kind === "horseBlock" ||
      f.kind === "trappedPiece",
  );
  if (better && !tactical) {
    if (ctx.ply !== undefined && ctx.ply <= 16) {
      const fault = detectOpeningFault(before, move, ctx.ply, mover, ctx.historyMoves);
      if (fault) {
        facts.push({
          kind: "openingFault",
          fault: fault.fault,
          piece: ref(before, fault.pieceSquare),
          better: moveNotation(before, better),
          opening: ctx.opening,
        });
      }
    }
    if (facts.length === 0) {
      const eg = detectTheoreticalEndgame(after);
      if (eg) {
        facts.push({ kind: "endgame", endgame: eg });
      } else {
        const plan = strategyFact(ctx, better);
        if (plan) facts.push(plan);
      }
    }
  }
  if (facts.length === 0) {
    const check = !!reply && inCheck(play(after, reply), mover);
    facts.push({ kind: "evalDrop", reply: reply && moveNotation(after, reply), check, points: loss });
  }
  return facts;
}

/** Thế cờ sau một nước và nước đáp mạnh nhất của đối phương (để việc đổi quân dở dang không làm lệch chỉ số). */
function settle(board: Board, m: Move, reply?: Move | null): Board {
  const after = play(board, m);
  if (reply !== undefined) return reply ? play(after, reply) : after;
  const turn = opponent(sideOf(board[m.from]!));
  // Tìm phản đòn nhanh 1 nửa nước (< 1ms) để giải quyết nước ăn lại quân, tránh block main thread
  const r = findBestMove({ board: after, turn }, 1, () => 0, { depth: 1, timeMs: 30, noise: 0 }).move;
  return r ? play(after, r) : after;
}

function strategyFact(ctx: MoveContext, better: Move): Fact | null {
  const { before, move, evalAfter, evalBefore } = ctx;
  const mover = sideOf(before[move.from]!);
  const plan = choosePlan(before, mover, ctx.ply ?? 40);
  const played = settle(before, move, evalAfter?.best ?? null);
  const betterReply =
    evalBefore?.pv !== undefined
      ? evalBefore.pv[1] ?? null
      : evalBefore?.lines?.[0]?.pv !== undefined
        ? evalBefore.lines[0].pv[1] ?? null
        : undefined;
  const gaps = comparePrinciples(before, played, settle(before, better, betterReply), mover, plan);
  if (gaps.length === 0) return null;
  const top = gaps.slice(0, 2);
  const isLoose = (b: Board, i: number) => !!b[i] && sideOf(b[i]!) === mover && "rnc".includes(typeOf(b[i]!)) && !isDefended(b, i, mover);
  // Quân vừa đi được đối chiếu với ô cũ của nó; quân khác giữ nguyên ô.
  const origin = (i: number) => (i === move.to ? move.from : i);
  return {
    kind: "strategy",
    plan,
    played: moveNotation(before, move),
    better: moveNotation(before, better),
    gains: top.map((g) => g.principle),
    worsened: top.filter((g) => g.worsened).map((g) => g.principle).slice(0, 1),
    loose: played.map((_, i) => i).filter((i) => isLoose(played, i) && !isLoose(before, origin(i))).map((i) => ref(played, i).name),
    opening: ctx.opening,
  };
}

/** Quân lớn của phe `mover` mất gốc sau nước đi (trước đó còn gốc), kèm tên. */
function newlyLoose(before: Board, move: Move, after: Board, mover: Side): string[] {
  const isLoose = (b: Board, i: number) => !!b[i] && sideOf(b[i]!) === mover && "rnc".includes(typeOf(b[i]!)) && !isDefended(b, i, mover);
  const origin = (i: number) => (i === move.to ? move.from : i);
  return after.map((_, i) => i).filter((i) => isLoose(after, i) && !isLoose(before, origin(i))).map((i) => ref(after, i).name);
}

/**
 * Nhận xét chiến lược cho mọi nước (kể cả nước tốt): kế hoạch hiện tại và nước này làm được / làm hỏng gì
 * so với trước khi đi (đã tính nước đáp `reply` của đối phương nếu có).
 */
export function moveIdea(
  before: Board,
  move: Move,
  reply: Move | null,
  ply: number,
  opening?: string,
  historyMoves?: Move[],
  isBest?: boolean,
): Fact {
  const mover = sideOf(before[move.from]!);
  if (!isBest && historyMoves) {
    const fault = detectOpeningFault(before, move, ply, mover, historyMoves);
    if (fault) {
      return {
        kind: "openingFault",
        fault: fault.fault,
        piece: ref(before, fault.pieceSquare),
        opening,
      };
    }
  }

  const plan = choosePlan(before, mover, ply);
  const after = settle(before, move, reply);
  const b0 = principleScores(before, mover);
  const a = principleScores(after, mover);
  const deltas = PRINCIPLES.map((p) => ({ p, d: WEIGHTS[plan][p] * (a[p] - b0[p]) }));
  return {
    kind: "idea",
    plan,
    played: moveNotation(before, move),
    gains: deltas.filter((x) => x.d >= 1).sort((x, y) => y.d - x.d).slice(0, 2).map((x) => x.p),
    // Ngưỡng chê cao hơn ngưỡng khen: thay đổi nhỏ (vd. Xe đối phương thêm một ô) không đáng nhắc.
    // Riêng quân mất gốc giữ ngưỡng thấp vì nói được đúng tên quân.
    worsened: deltas.filter((x) => x.d <= (x.p === "matGoc" ? -1 : -1.5)).sort((x, y) => x.d - y.d).slice(0, 1).map((x) => x.p),
    loose: newlyLoose(before, move, after, mover),
    opening,
  };
}

function lossByCapture(ctx: MoveContext, reply: Move): Fact | null {
  const { before, move, after } = ctx;
  const mover = sideOf(before[move.from]!);
  const opp = opponent(mover);
  const q = reply.to;
  const gain = exchangeGain(after, q, opp);
  if (gain === null || gain <= 0) return null;

  const took = before[move.to] ? ref(before, move.to) : null;
  const attacker = ref(after, reply.from);
  let cause: LossCause;
  let points = gain;
  if (q === move.to) {
    if (took) {
      points = gain - valueAt(before, move.to);
      if (points <= 0) return null; // đổi quân ngang hoặc có lời: lý do nằm chỗ khác
      cause = "trade";
    } else cause = "moved";
  } else if ((exchangeGain(before, q, opp) ?? 0) > 0) cause = "ignored";
  else if (!attackersOf(before, q, opp).includes(reply.from)) {
    cause = typeOf(after[reply.from]!) === "c" && between(reply.from, q, move.to) ? "screen" : "opened";
  } else cause = "unguarded";

  return {
    kind: "losesPiece",
    cause,
    reply: moveNotation(after, reply),
    victim: ref(after, q),
    attacker,
    moved: ref(after, move.to),
    took,
    defended: isDefended(after, q, mover),
    points,
    free: cause !== "trade" && gain >= valueAt(after, q),
  };
}

/** Ô `x` có nằm giữa `a` và `b` trên cùng một hàng hoặc cột không. */
function between(a: number, b: number, x: number): boolean {
  const [ra, ca, rb, cb, rx, cx] = [rowOf(a), colOf(a), rowOf(b), colOf(b), rowOf(x), colOf(x)];
  if (ra === rb && rx === ra) return cx > Math.min(ca, cb) && cx < Math.max(ca, cb);
  if (ca === cb && cx === ca) return rx > Math.min(ra, rb) && rx < Math.max(ra, rb);
  return false;
}

function threatAfter(after: Board, reply: Move, mover: Side): Fact | null {
  const next = play(after, reply);
  const check = inCheck(next, mover);
  const already = new Set(hangingPieces(after, mover));
  const targets = hangingPieces(next, mover).filter((s) => !already.has(s));
  // Chiếu mà không kèm bắt quân thì chưa đủ để giải thích, để phần mức thiệt nói thay.
  if (targets.length === 0) return null;
  targets.sort((a, b) => valueAt(next, b) - valueAt(next, a));
  return {
    kind: "threatens",
    reply: moveNotation(after, reply),
    attacker: ref(next, reply.to),
    check,
    targets: targets.slice(0, 2).map((s) => ref(next, s)),
  };
}

function missedChance(before: Board, after: Board, move: Move, better: Move, mover: Side): Fact | null {
  const opp = opponent(mover);
  const notation = moveNotation(before, better);
  if (before[better.to]) {
    const next = play(before, better);
    const points = valueAt(before, better.to) - swap(next, better.to, opp);
    if (points > 0) return { kind: "missedCapture", better: notation, victim: ref(before, better.to), points };
    return null;
  }
  if (move.from !== better.from && after[better.from] === before[better.from]
    && isAttacked(before, better.from, opp)
    && (exchangeGain(before, better.from, opp) ?? 0) > 0
    && isAttacked(after, better.from, opp)
    && (exchangeGain(after, better.from, opp) ?? 0) > 0) {
    return { kind: "missedEscape", better: notation, piece: ref(before, better.from) };
  }
  return null;
}

function detectCheckTactics(after: Board, reply: Move, mover: Side): Fact | null {
  const opp = opponent(mover);
  const next = play(after, reply);
  const king = findKing(next, mover);
  if (king < 0 || !isAttacked(next, king, opp)) return null;

  const checkers = attackersOf(next, king, opp);
  if (checkers.length >= 2) {
    return {
      kind: "doubleCheck",
      reply: moveNotation(after, reply),
      checkers: checkers.map((sqIdx) => ref(next, sqIdx)),
    };
  }

  // Chiếu rút: quân chiếu không phải là quân vừa di chuyển
  if (checkers.length === 1 && checkers[0] !== reply.to) {
    const checker = ref(next, checkers[0]);
    const moved = ref(next, reply.to);
    const took = after[reply.to] ? ref(after, reply.to) : null;
    const hanging = hangingPieces(next, mover).filter((s) => s !== king);
    const target = took ?? (hanging.length ? ref(next, hanging[0]) : null);
    return {
      kind: "discoveredCheck",
      reply: moveNotation(after, reply),
      moved,
      checker,
      target,
    };
  }

  return null;
}

function isPinnedOnLine(board: Board, pSq: number, pinnedSq: number, behindSq: number): boolean {
  const [pr, pc] = [rowOf(pSq), colOf(pSq)];
  const [r1, c1] = [rowOf(pinnedSq), colOf(pinnedSq)];
  const [r2, c2] = [rowOf(behindSq), colOf(behindSq)];
  if (pr === r1 && r1 === r2) {
    const minC = Math.min(pc, c2);
    const maxC = Math.max(pc, c2);
    return c1 > minC && c1 < maxC;
  }
  if (pc === c1 && c1 === c2) {
    const minR = Math.min(pr, r2);
    const maxR = Math.max(pr, r2);
    return r1 > minR && r1 < maxR;
  }
  return false;
}

function detectPin(after: Board, reply: Move, mover: Side): Fact | null {
  const opp = opponent(mover);
  const next = play(after, reply);
  const pSq = reply.to;
  const pinnerPiece = next[pSq];
  if (!pinnerPiece || sideOf(pinnerPiece) !== opp || typeOf(pinnerPiece) !== "r") return null;

  const pr = rowOf(pSq);
  const pc = colOf(pSq);

  for (const [dr, dc] of ORTHO) {
    let r = pr + dr;
    let c = pc + dc;
    const line: number[] = [];
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
      const idx = sq(r, c);
      if (next[idx]) line.push(idx);
      r += dr;
      c += dc;
    }
    if (line.length >= 2) {
      const pinnedSq = line[0];
      const behindSq = line[1];
      const p1 = next[pinnedSq]!;
      const p2 = next[behindSq]!;
      if (sideOf(p1) === mover && sideOf(p2) === mover && typeOf(p1) !== "k") {
        const isAbsolute = typeOf(p2) === "k";
        const isRelative = typeOf(p2) === "r" && valueAt(next, pinnedSq) < valueAt(next, behindSq);
        if (isAbsolute || isRelative) {
          let wasPinned = false;
          for (let i = 0; i < after.length; i++) {
            const p = after[i];
            if (p && sideOf(p) === opp && typeOf(p) === "r" && isPinnedOnLine(after, i, pinnedSq, behindSq)) {
              wasPinned = true;
              break;
            }
          }
          if (!wasPinned) {
            return {
              kind: "pin",
              reply: moveNotation(after, reply),
              pinner: ref(next, pSq),
              pinned: ref(next, pinnedSq),
              behind: ref(next, behindSq),
              absolute: isAbsolute,
            };
          }
        }
      }
    }
  }
  return null;
}

const HORSE_STEPS = [
  [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
  [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
] as const;

function isHorseLeg(horseSq: number, legSq: number): boolean {
  const hr = rowOf(horseSq);
  const hc = colOf(horseSq);
  const lr = rowOf(legSq);
  const lc = colOf(legSq);
  for (const [, , dr, dc] of HORSE_STEPS) {
    if (hr + dr === lr && hc + dc === lc) return true;
  }
  return false;
}

function detectHorseBlock(ctx: MoveContext, reply: Move | null): Fact | null {
  const { before, move, after } = ctx;
  const mover = sideOf(before[move.from]!);
  const opp = opponent(mover);

  // 1. Tự cản chân Mã của mình: move.to cản chân một con Mã của mover
  for (let i = 0; i < before.length; i++) {
    const p = before[i];
    if (p && sideOf(p) === mover && typeOf(p) === "n" && i !== move.from) {
      if (isHorseLeg(i, move.to)) {
        const hr = rowOf(i);
        const hc = colOf(i);
        const mr = rowOf(move.to);
        const mc = colOf(move.to);
        const blockedDests = HORSE_STEPS
          .filter(([, , dr, dc]) => hr + dr === mr && hc + dc === mc)
          .map(([stepR, stepC]) => sq(hr + stepR, hc + stepC))
          .filter((dest) => rowOf(dest) >= 0 && rowOf(dest) < ROWS && colOf(dest) >= 0 && colOf(dest) < COLS);

        const horseHanging = isAttacked(after, i, opp) && (exchangeGain(after, i, opp) ?? 0) > 0;
        const lostDefense = blockedDests.some((d) => {
          const victim = before[d];
          return (
            victim &&
            sideOf(victim) === mover &&
            isDefended(before, d, mover) &&
            !isDefended(after, d, mover) &&
            isAttacked(after, d, opp) &&
            (exchangeGain(after, d, opp) ?? 0) > 0
          );
        });

        if (horseHanging || lostDefense) {
          return {
            kind: "horseBlock",
            horse: ref(after, i),
            blocker: ref(after, move.to),
            byOpponent: false,
          };
        }
      }
    }
  }

  // 2. Đối phương ngáng chân Mã
  if (reply) {
    const next = play(after, reply);
    for (let i = 0; i < after.length; i++) {
      const p = after[i];
      if (p && sideOf(p) === mover && typeOf(p) === "n") {
        if (isHorseLeg(i, reply.to)) {
          const horseHanging = isAttacked(next, i, opp) && (exchangeGain(next, i, opp) ?? 0) > 0;
          if (horseHanging) {
            return {
              kind: "horseBlock",
              horse: ref(next, i),
              blocker: ref(next, reply.to),
              byOpponent: true,
              reply: moveNotation(after, reply),
            };
          }
        }
      }
    }
  }

  return null;
}

function safeEscapeMoves(board: Board, from: number, s: Side): number {
  const opp = opponent(s);
  let safe = 0;
  for (const to of pseudoMoves(board, from)) {
    const next = play(board, { from, to });
    if (inCheck(next, s)) continue;
    const gain = exchangeGain(next, to, opp) ?? 0;
    if (gain <= 0) safe++;
  }
  return safe;
}

function detectTrappedPiece(ctx: MoveContext, reply: Move | null): Fact | null {
  const { before, move, after } = ctx;
  const mover = sideOf(before[move.from]!);
  const opp = opponent(mover);

  const checkCandidate = (i: number): Fact | null => {
    const p = after[i];
    if (!p || sideOf(p) !== mover || !"rnc".includes(typeOf(p))) return null;
    if (!isAttacked(after, i, opp)) return null;
    const gain = exchangeGain(after, i, opp) ?? 0;
    if (gain > 0) {
      const safe = safeEscapeMoves(after, i, mover);
      if (safe === 0) {
        const hadSafeBefore = i === move.to ? true : safeEscapeMoves(before, i, mover) > 0;
        if (hadSafeBefore) {
          const attackers = attackersOf(after, i, opp);
          return {
            kind: "trappedPiece",
            piece: ref(after, i),
            attacker: attackers.length ? ref(after, attackers[0]) : undefined,
            reply: reply ? moveNotation(after, reply) : undefined,
          };
        }
      }
    }
    return null;
  };

  const direct = checkCandidate(move.to);
  if (direct) return direct;
  for (let i = 0; i < after.length; i++) {
    if (i !== move.to) {
      const fact = checkCandidate(i);
      if (fact) return fact;
    }
  }
  return null;
}

// ——— Ghép câu ———

const SIDE_NAME: Record<Side, string> = { r: "Đỏ", b: "Đen" };
const COLOR: Record<Side, string> = { r: "đỏ", b: "đen" };

/** Điểm (100 = 1) làm tròn tới nửa điểm, dấu phẩy thập phân kiểu Việt. */
export function formatPoints(points: number): string {
  return String(Math.max(0.5, Math.round(points / 50) / 2)).replace(".", ",");
}

function sentence(f: Fact, mover: Side): string {
  const O = SIDE_NAME[opponent(mover)];
  const o = COLOR[opponent(mover)];
  switch (f.kind) {
    case "allowsMate":
      return f.moves <= 1
        ? `Nước này để ${O} chiếu bí ngay bằng ${f.reply}.`
        : `Nước này để ${O} có đường chiếu bí trong ${f.moves} nước, bắt đầu bằng ${f.reply}.`;
    case "missedMate":
      return f.moves <= 1
        ? `Bỏ lỡ nước chiếu bí ${f.better}.`
        : `Bỏ lỡ đường chiếu bí trong ${f.moves} nước, bắt đầu bằng ${f.better}.`;
    case "avoidsMate":
      return `Nên đi ${f.better} để chặn đường chiếu bí đó.`;
    case "doubleCheck": {
      const names = f.checkers.map((c) => `${c.name} ${o}`).join(" và ");
      return `${O} đáp ${f.reply}, ${names} cùng lúc chiếu tướng (chiếu kép), buộc Tướng phải chạy.`;
    }
    case "discoveredCheck": {
      const moved = `${f.moved.name} ${o}`;
      const checker = `${f.checker.name} ${o}`;
      if (f.target) {
        return `${O} đáp ${f.reply}, rút ${moved} mở đường cho ${checker} chiếu tướng (chiếu rút), đồng thời đe dọa ăn ${f.target.name}.`;
      }
      return `${O} đáp ${f.reply}, rút ${moved} mở đường cho ${checker} chiếu tướng (chiếu rút).`;
    }
    case "pin": {
      const pinner = `${f.pinner.name} ${o}`;
      const target = f.absolute ? "Tướng" : f.behind.name;
      const guard = f.absolute ? "không thể di chuyển vì để lộ Tướng" : `di chuyển sẽ để mất ${target}`;
      return `${O} đáp ${f.reply}, ${pinner} ghim chặt ${f.pinned.name} ở trước ${target} (${guard}).`;
    }
    case "horseBlock": {
      if (f.byOpponent) {
        return `${O} đáp ${f.reply}, ngáng chân ${f.horse.name}, khiến ${f.horse.name} bị bó và không thể hoạt động.`;
      }
      return `${f.blocker.name} vừa đi làm cản chân ${f.horse.name}, khiến ${f.horse.name} mất đường cơ động và khả năng phòng thủ.`;
    }
    case "trappedPiece": {
      const att = f.attacker ? ` dưới đòn tấn công của ${f.attacker.name} ${o}` : "";
      const rep = f.reply ? ` (${f.reply})` : "";
      return `${f.piece.name} bị vây khốn${att}${rep}, không còn ô an toàn nào để tháo lui.`;
    }
    case "losesPiece": {
      const victim = f.victim.name;
      const attacker = `${f.attacker.name} ${o}`;
      const tail = f.free ? `ăn không ${victim}` : `ăn ${victim}, lời ${formatPoints(f.points)} điểm sau khi đổi quân`;
      const guard = f.defended ? "; có quân bảo vệ nhưng đổi quân vẫn thiệt" : " mà không có quân bảo vệ";
      switch (f.cause) {
        case "moved":
          return `${victim} đi vào ô bị ${attacker} ăn${guard}. ${O} đáp ${f.reply} ${tail}.`;
        case "trade":
          return `${f.moved.name} ăn ${f.took!.name} ${o} nhưng bị ${attacker} ăn lại (${f.reply}), đổi như vậy thiệt ${formatPoints(f.points)} điểm.`;
        case "ignored":
          return `${victim} đang bị ${attacker} bắt nhưng nước này không xử lý. ${O} đáp ${f.reply} ${tail}.`;
        case "opened":
          return `${f.moved.name} rời chỗ cũ, mở đường cho ${attacker}. ${O} đáp ${f.reply} ${tail}.`;
        case "screen":
          return `${f.moved.name} đứng vào làm ngòi cho ${attacker}. ${O} đáp ${f.reply} ${tail}.`;
        case "unguarded":
          return `Nước này làm ${victim} mất bảo vệ. ${O} đáp ${f.reply} ${tail}.`;
        default:
          return `${O} đáp ${f.reply} ${tail}.`;
      }
    }
    case "threatens": {
      const names = f.targets.map((t) => t.name);
      if (f.check) return `${O} đáp ${f.reply}, vừa chiếu tướng vừa đe dọa ăn ${names.join(" và ")}.`;
      if (names.length >= 2) return `${O} đáp ${f.reply}, cùng lúc bắt ${names.join(" và ")}.`;
      return `${O} đáp ${f.reply}, đe dọa ăn ${names[0]}.`;
    }
    case "missedCapture":
      return `Nên đi ${f.better} ăn ${f.victim.name} ${o}.`;
    case "missedEscape":
      return `Nên đi ${f.better} để đưa ${f.piece.name} khỏi chỗ bị bắt.`;
    case "openingFault": {
      const head = f.opening ? `Trong thế trận ${f.opening}: ` : "";
      const pName = f.piece?.name ?? "Quân này";
      const betterPart = f.better ? ` Nên đi ${f.better}.` : "";
      if (f.fault === "repeatPiece") {
        return `${head}${pName} đã đi nhiều lần trong khai cuộc khi các quân lớn khác chưa ra trận.${betterPart}`;
      }
      return `${head}khai cuộc cần sớm xuất Xe chiếm lộ thông (chậm ra Xe sẽ thất thế, "Một Xe mười quân").${betterPart}`;
    }
    case "strategy": {
      const intro = PLAN_TEXT[f.plan](O, f.opening);
      const why = f.gains.map((p) => GAIN_TEXT[p]).join(" và ");
      const loss = f.worsened[0] === "matGoc" && f.loose.length ? `để ${f.loose.join(", ")} mất gốc` : LOSS_TEXT[f.worsened[0]];
      const worse = f.worsened.length ? `, còn ${f.played} ${loss}` : "";
      return `${intro ? intro + " " : ""}Nên đi ${f.better}: ${why}${worse}.`;
    }
    case "idea": {
      const head = f.opening && f.plan === "raQuan" ? `Kế hoạch ra quân (${f.opening}):` : `Kế hoạch: ${PLAN_NAME[f.plan]}.`;
      const lossText = (p: Principle) => (p === "matGoc" && f.loose.length ? `để ${f.loose.join(", ")} mất gốc` : LOSS_TEXT[p]);
      const good = f.gains.map((p) => (p === "matGoc" ? "quân có gốc hơn" : GAIN_TEXT[p])).join(" và ");
      if (good && f.worsened.length) return `${head} ${f.played} giúp ${good}, nhưng ${lossText(f.worsened[0])}.`;
      if (good) return `${head} ${f.played} giúp ${good}.`;
      if (f.worsened.length) return `${head} ${f.played} ${lossText(f.worsened[0])}.`;
      return `${head} ${f.played} giữ thế, chưa thay đổi nhiều.`;
    }
    case "evalDrop": {
      const lost = `${SIDE_NAME[mover]} thiệt khoảng ${formatPoints(f.points)} điểm`;
      if (!f.reply) return `Theo AI, ${lost} so với nước tốt nhất.`;
      return `Nước đáp mạnh nhất của ${O} là ${f.reply}${f.check ? " (chiếu tướng)" : ""}; theo AI, ${lost}.`;
    }
    case "missedWin": {
      const betterPart = f.better ? ` (nên đi ${f.better})` : "";
      return `Bỏ lỡ cơ hội thắng rõ rệt: thế cờ đang áp đảo nhưng để rớt về thế cân bằng${betterPart}.`;
    }
    case "endgame": {
      return `Thế cờ tàn cuộc lý thuyết: ${f.endgame.name}. ${f.endgame.description}`;
    }
  }
}

/** Lời giải thích hoàn chỉnh cho một nước của phe `mover`. */
export function explainText(facts: Fact[], mover: Side): string {
  return facts.map((f) => sentence(f, mover)).join(" ");
}

export {
  buildLlmCommentaryPrompt,
  generateLlmCommentary,
  detectTheoreticalEndgame,
  type LlmCommentaryOptions,
  type LlmPrompt,
  type TheoreticalEndgame,
};
