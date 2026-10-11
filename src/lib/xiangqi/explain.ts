// Giải thích vì sao một nước bị chấm là hớ/kém, không cần LLM:
// 1. Rút dữ kiện kỳ lý từ bàn cờ và điểm AI (quân bị treo, bắt đôi, đường chiếu bí, cơ hội bị bỏ lỡ…).
// 2. Ghép dữ kiện thành câu bằng mẫu có sẵn.
// Dữ kiện là JSON thuần: sau này có thể đưa thẳng cho LLM viết lời giảng thay cho bước 2.

import type { PositionEval } from "./analysis";
import {
  Board, Move, Piece, PieceType, Side,
  attackersOf, colOf, inCheck, isDefended, opponent, rowOf, sideOf, typeOf, ROWS,
} from "./engine";
import { PIECE_NAME, moveNotation } from "./notation";

/** Điểm thắng tuyệt đối mà AI trả về khi thấy chiếu bí (khớp với MATE trong ai.ts). */
const MATE = 100_000;
const isMateScore = (score: number) => score >= MATE - 100;
/** Số nước (của một bên) đến khi chiếu bí, suy từ điểm AI: MATE − số nửa nước. */
const mateIn = (score: number) => (MATE - score + 1) >> 1;

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
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p || sideOf(p) !== side || typeOf(p) === "k") continue;
    if ((exchangeGain(board, i, opponent(side)) ?? 0) > 0) out.push(i);
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
  /** Không tìm ra lý do cụ thể: chỉ nói nước đáp mạnh nhất và mức thiệt theo AI. */
  | { kind: "evalDrop"; reply: string | null; check: boolean; points: number };

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
    const reason = (after[reply.to] ? lossByCapture(ctx, reply) : null) ?? threatAfter(after, reply, mover);
    if (reason) facts.push(reason);
  }
  if (better) {
    const missed = missedChance(before, after, move, better, mover);
    if (missed) facts.push(missed);
  }
  if (facts.length === 0) {
    const check = !!reply && inCheck(play(after, reply), mover);
    facts.push({ kind: "evalDrop", reply: reply && moveNotation(after, reply), check, points: loss });
  }
  return facts;
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
  // Nước tốt hơn là cứu một quân đang bị bắt mà nước đã đi bỏ mặc.
  if (move.from !== better.from && after[better.from] === before[better.from]
    && (exchangeGain(before, better.from, opp) ?? 0) > 0
    && (exchangeGain(after, better.from, opp) ?? 0) > 0) {
    return { kind: "missedEscape", better: notation, piece: ref(before, better.from) };
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
    case "evalDrop": {
      const lost = `${SIDE_NAME[mover]} thiệt khoảng ${formatPoints(f.points)} điểm`;
      if (!f.reply) return `Theo AI, ${lost} so với nước tốt nhất.`;
      return `Nước đáp mạnh nhất của ${O} là ${f.reply}${f.check ? " (chiếu tướng)" : ""}; theo AI, ${lost}.`;
    }
  }
}

/** Lời giải thích hoàn chỉnh cho một nước của phe `mover`. */
export function explainText(facts: Fact[], mover: Side): string {
  return facts.map((f) => sentence(f, mover)).join(" ");
}
