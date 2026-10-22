// Giải thích vì sao một nước bị chấm là hớ/kém, không cần LLM:
// 1. Rút dữ kiện kỳ lý từ bàn cờ và điểm AI (quân bị treo, bắt đôi, đường chiếu bí, cơ hội bị bỏ lỡ…).
// 2. Ghép dữ kiện thành câu bằng mẫu có sẵn.
// Dữ kiện là JSON thuần: sau này có thể đưa thẳng cho LLM viết lời giảng thay cho bước 2.

import { findBestMove } from "./ai";
import type { PositionEval } from "./analysis";
import {
  Board, Move, Piece, PieceType, Side,
  attackersOf, colOf, inCheck, isDefended, opponent, rowOf, sideOf, typeOf, ROWS, COLS,
  findKing, isAttacked, pseudoMoves, sq, play,
} from "./engine";
import { PIECE_NAME, moveNotation } from "./notation";
import {
  GAIN_TEXT, LOSS_TEXT, PLAN_NAME, PLAN_TEXT, PRINCIPLES, WEIGHTS, choosePlan, comparePrinciples, principleScores,
  type OpeningFaultType, type Plan, type Principle, detectOpeningFault,
} from "./strategy";
import { detectTheoreticalEndgame, type TheoreticalEndgame } from "./endgame";
import { detectAllZhaoTactics } from "./zhao-principles";
import { detectAllXuTactics } from "./xu-principles";
import type { EndgamePrincipleFact } from "./endgame-principles";
import { buildLlmCommentaryPrompt, generateLlmCommentary, type LlmCommentaryOptions, type LlmPrompt } from "./llm-commentary";
import { detectPatterns, type MatePatternId } from "./patterns";
import { type PositionAssessment, FACTOR_NAMES } from "./assess";
import {
  type ThreatFact,
  type IgnoredThreatFact,
  type ParriedFact,
  type ThreatData,
  detectThreat,
  detectThreatMoveFacts,
} from "./threats";
import {
  type Purpose,
  type IntentFact,
  type DetectIntentOptions,
  detectIntent,
  PURPOSE_NAMES,
} from "./intent";
import {
  type InitiativeFact,
  type OpenFileFact,
  type ExchangeFact,
  type ExchangeReason,
  detectInitiative,
  detectOpenFile,
  detectExchange,
  type ZhaoTactics,
  type ZhaoMiddlegameFact,
  type ZhaoTacticsOptions,
  detectZhaoTactics,
  detectPalaceBreaker,
  detectSacrificeForInitiative,
  detectCounterThreat,
  detectFlankOverload,
  type XuTactics,
  type XuMiddlegameFact,
  type XuTacticsOptions,
  detectXuTactics,
  detectSolidDefense,
  detectIncrementalGain,
  detectPositionalClamp,
  detectTransitionExchange,
} from "./middlegame";

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

export function ref(board: Board, square: number): PieceRef {
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
  | { kind: "endgame"; endgame: TheoreticalEndgame }
  /** Nhận diện hình cờ sát cục kinh điển (lập hình, để đối phương lập hình, hoặc phá hình). */
  | {
      kind: "pattern";
      patternId: MatePatternId;
      patternName: string;
      side: Side;
      action: "formed" | "allowed" | "broken";
      reply?: string;
      pieces?: PieceRef[];
      description?: string;
    }
  /** Đánh giá thế cờ toàn diện, giải thích vì sao một bên hơn (B2). */
  | PositionAssessment
  /** Đòn đe dọa của một bên khi bên kia bỏ lượt (B3). */
  | ThreatFact
  /** Nước đi bỏ qua đòn đe dọa có sẵn của đối phương (B3). */
  | IgnoredThreatFact
  /** Nước đi kịp thời hóa giải đòn đe dọa của đối phương (B3). */
  | ParriedFact
  /** Ý đồ chiến thuật / chiến lược của nước cờ (B4). */
  | IntentFact
  /** Tranh tiên / chuỗi nước ép buộc liên tiếp (B5). */
  | InitiativeFact
  /** Lộ mở / chiếm cột thông (B5). */
  | OpenFileFact
  /** Đổi quân có chủ đích (B5). */
  | ExchangeFact
  /** Kỳ lý trung cuộc Triệu Hâm Hâm ("Lục Mạch Thần Kiếm") (B6). */
  | ZhaoMiddlegameFact
  /** Kỳ lý trung cuộc Hứa Ngân Xuyên ("Thái Cực Bổng") (B7). */
  | XuMiddlegameFact
  /** Nguyên lý tàn cuộc của nước đi (đổi quân lý thuyết, Tốt, Tướng, khống chế, phòng thủ). */
  | EndgamePrincipleFact;

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
  /** Dữ liệu đòn đe dọa trước nước đi (nếu có tính toán từ engine). */
  threatBefore?: ThreatData | null;
  /** Dữ liệu đòn đe dọa sau nước đi (nếu có tính toán từ engine). */
  threatAfter?: ThreatData | null;
}

const sameMove = (a: Move | null | undefined, b: Move) => !!a && a.from === b.from && a.to === b.to;

function detectPatternFact(ctx: MoveContext, mover: Side, reply: Move | null): Fact | null {
  const { before, after } = ctx;
  const opp = opponent(mover);

  // 1. Bên đi (mover) vừa lập thế sát cục mới mà thế trước chưa có (chỉ xét khi nước đi không bị hớ)
  if (ctx.loss <= 50) {
    const patternsAfter = detectPatterns(after, mover);
    const patternsBefore = detectPatterns(before, mover);
    const formed = patternsAfter.find((pa) => !patternsBefore.some((pb) => pb.id === pa.id));
    if (formed) {
      return {
        kind: "pattern",
        patternId: formed.id,
        patternName: formed.name,
        side: mover,
        action: "formed",
        pieces: formed.pieces.filter((sq) => after[sq]).map((sq) => ref(after, sq)),
        description: formed.description,
      };
    }
  }

  // 2. Bên đi (mover) vừa phá được thế sát cục của đối phương
  const oppBefore = detectPatterns(before, opp);
  const oppAfter = detectPatterns(after, opp);
  const broken = oppBefore.find((pb) => !oppAfter.some((pa) => pa.id === pb.id));
  if (broken) {
    return {
      kind: "pattern",
      patternId: broken.id,
      patternName: broken.name,
      side: mover,
      action: "broken",
      description: broken.description,
    };
  }

  // 3. Đối phương (opp) đáp reply lập thế sát cục
  if (reply) {
    const next = play(after, reply);
    const oppReplyPatterns = detectPatterns(next, opp);
    const allowed = oppReplyPatterns.find((pr) => !oppBefore.some((pb) => pb.id === pr.id));
    if (allowed) {
      return {
        kind: "pattern",
        patternId: allowed.id,
        patternName: allowed.name,
        side: opp,
        action: "allowed",
        reply: moveNotation(after, reply),
        pieces: allowed.pieces.filter((sq) => next[sq]).map((sq) => ref(next, sq)),
        description: allowed.description,
      };
    }
  }

  return null;
}

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
  if (facts.length === 0) {
    const patFact = detectPatternFact(ctx, mover, reply);
    if (patFact) facts.push(patFact);
  }
  if (reply && facts.length === 0) {
    const threat = threatAfter(after, reply, mover);
    if (threat) facts.push(threat);
  }
  if (ctx.threatBefore) {
    const threatMoveFacts = detectThreatMoveFacts(ctx);
    for (const tf of threatMoveFacts) {
      if (!facts.some((f) => f.kind === tf.kind)) {
        facts.push(tf);
      }
    }
  }
  if (better) {
    const missed = missedChance(before, after, move, better, mover);
    if (missed) facts.push(missed);
  }
  const tactical = facts.some(
    (f) =>
      f.kind === "pattern" ||
      f.kind === "losesPiece" ||
      f.kind === "missedCapture" ||
      f.kind === "missedEscape" ||
      f.kind === "doubleCheck" ||
      f.kind === "discoveredCheck" ||
      f.kind === "pin" ||
      f.kind === "horseBlock" ||
      f.kind === "trappedPiece" ||
      f.kind === "threat" ||
      f.kind === "ignoredThreat" ||
      f.kind === "parried",
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

/**
 * Thế cờ để đo nguyên lý vị trí của nước `m`: ngay sau nước đi, trừ khi nước đáp đầu tiên của đối phương
 * ăn quân mình (khi đó đo sau nước ăn đó để không khen quân sắp mất). Không đi hết PV: việc đối phương
 * chặn đường hay đổi quân ở các nước sau không phải do nước `m` gây ra.
 */
function positionAfterMove(board: Board, m: Move, reply?: Move | null, pv?: Move[]): Board {
  const after = play(board, m);
  const mover = sideOf(board[m.from]!);
  let first: Move | null | undefined = reply;
  if (pv && pv.length > 0) first = pv[0]?.from === m.from && pv[0]?.to === m.to ? (pv[1] ?? null) : pv[0];
  if (first === undefined) {
    first = findBestMove({ board: after, turn: opponent(mover) }, 1, () => 0, { depth: 1, timeMs: 30, noise: 0 }).move;
  }
  if (!first || !after[first.from] || sideOf(after[first.from]!) === mover) return after;
  const victim = after[first.to];
  return victim && sideOf(victim) === mover ? play(after, first) : after;
}

/** Nước được chấm tốt thì bỏ phần chê trong nhận xét chiến lược: engine đã xác nhận nước đi ổn. */
export function withoutCriticism(f: Fact): Fact {
  return f.kind === "idea" ? { ...f, worsened: [], loose: [] } : f;
}

function strategyFact(ctx: MoveContext, better: Move): Fact | null {
  const { before, move, evalAfter, evalBefore } = ctx;
  const mover = sideOf(before[move.from]!);
  const plan = choosePlan(before, mover, ctx.ply ?? 40);
  const played = positionAfterMove(before, move, evalAfter?.best ?? null);
  const betterReply =
    evalBefore?.pv !== undefined
      ? evalBefore.pv[1] ?? null
      : evalBefore?.lines?.[0]?.pv !== undefined
        ? evalBefore.lines[0].pv[1] ?? null
        : undefined;
  const gaps = comparePrinciples(before, played, positionAfterMove(before, better, betterReply), mover, plan);
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

/** Quân lớn của phe `mover` mất căn sau nước đi (trước đó còn căn), kèm tên. */
function newlyLoose(before: Board, move: Move, after: Board, mover: Side): string[] {
  const isLoose = (b: Board, i: number) => !!b[i] && sideOf(b[i]!) === mover && "rnc".includes(typeOf(b[i]!)) && !isDefended(b, i, mover);
  const origin = (i: number) => (i === move.to ? move.from : i);
  return after.map((_, i) => i).filter((i) => isLoose(after, i) && !isLoose(before, origin(i))).map((i) => ref(after, i).name);
}

/**
 * Nhận xét chiến lược cho mọi nước (kể cả nước tốt): kế hoạch hiện tại và nước này làm được / làm hỏng gì
 * so với trước khi đi. Đo ngay sau nước đi; chỉ tính thêm nước đáp khi nước đó ăn quân mình (xem positionAfterMove).
 */
/**
 * Ý đồ đủ tin cậy để hiển thị thay cho nhận xét nguyên lý. Thí quân, đặt sát, lập hình giữ như trước;
 * thêm các nhãn đã được người hiểu cờ chấm trên ván đại sư: hóa giải 7/7, ăn quân thật 7/7, chiếu tướng 2/2.
 * Tróc quân (giữ tiên không chiếu) và đổi quân chưa đủ mẫu kiểm chứng nên chưa hiển thị.
 */
function isShownIntent(intent: IntentFact, before: Board, move: Move): boolean {
  if (intent.purposes.some((p) => p === "thiQuan" || p === "datSat" || p === "lapHinh")) return true;
  const primary = intent.primaryPurpose;
  if (primary === "hoaGiai" || primary === "anQuan") return true;
  if (primary === "giuTien") return inCheck(play(before, move), opponent(sideOf(before[move.from]!)));
  return false;
}

export function moveIdea(
  before: Board,
  move: Move,
  reply: Move | null,
  ply: number,
  opening?: string,
  historyMoves?: Move[],
  /** Engine đã chấp nhận nước này (tốt nhất hoặc không bị chấm lỗi): bỏ qua kiểm tra lỗi khai cuộc. */
  isBest?: boolean,
  pv?: Move[],
  intentOptions?: DetectIntentOptions,
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

  // Tận dụng intent khi là nước tốt nhất (B4)
  if (isBest) {
    const intent = detectIntent(before, move, play(before, move), {
      ...intentOptions,
      pv: intentOptions?.pv ?? pv,
      ply: intentOptions?.ply ?? ply,
    });
    if (intent && isShownIntent(intent, before, move)) return intent;
  }

  const plan = choosePlan(before, mover, ply);
  const after = positionAfterMove(before, move, reply, pv);
  const b0 = principleScores(before, mover);
  const a = principleScores(after, mover);
  const deltas = PRINCIPLES.map((p) => ({ p, d: WEIGHTS[plan][p] * (a[p] - b0[p]) }));
  return {
    kind: "idea",
    plan,
    played: moveNotation(before, move),
    gains: deltas.filter((x) => x.d >= 1).sort((x, y) => y.d - x.d).slice(0, 2).map((x) => x.p),
    // Ngưỡng chê cao hơn ngưỡng khen: thay đổi nhỏ (vd. Xe đối phương thêm một ô) không đáng nhắc.
    // Riêng quân mất căn giữ ngưỡng thấp vì nói được đúng tên quân.
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

/**
 * Chọn một cách diễn đạt trong `variants`. Không có `seed` thì luôn lấy câu chuẩn (phần tử đầu);
 * có `seed` (số nửa nước) thì chọn cố định theo seed và `key`, để cả ván đọc không lặp một mẫu câu
 * mà server và client vẫn ra cùng một câu.
 */
export function pickVariant<T>(variants: readonly T[], seed: number | undefined, key = ""): T {
  if (seed === undefined || variants.length === 1) return variants[0];
  let h = Math.imul(seed + 1, 0x9e3779b1);
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return variants[(h >>> 0) % variants.length];
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function sentence(f: Fact, mover: Side = "r", seed?: number): string {
  const O = SIDE_NAME[opponent(mover)];
  const o = COLOR[opponent(mover)];
  const v = <T>(key: string, variants: readonly T[]) => pickVariant(variants, seed, key);
  const gain = (p: Principle) => v(`gain.${p}`, GAIN_TEXT[p]);
  const loss = (p: Principle, loose: string[]) =>
    p === "matGoc" && loose.length
      ? v("loss.loose", [`để ${loose.join(", ")} mất căn`, `khiến ${loose.join(", ")} không còn căn`])
      : v(`loss.${p}`, LOSS_TEXT[p]);
  switch (f.kind) {
    case "allowsMate":
      return f.moves <= 1
        ? v("allowsMate1", [
            `Nước này để ${O} chiếu bí ngay bằng ${f.reply}.`,
            `Sai lầm quyết định: ${O} chiếu bí ngay bằng ${f.reply}.`,
            `Sau nước này, ${O} chỉ cần đi ${f.reply} là chiếu bí.`,
          ])
        : v("allowsMate", [
            `Nước này để ${O} có đường chiếu bí trong ${f.moves} nước, bắt đầu bằng ${f.reply}.`,
            `Sau nước này, ${O} có đòn chiếu bí ${f.moves} nước, mở đầu bằng ${f.reply}.`,
            `Nước này mở ra cho ${O} đường chiếu bí ${f.moves} nước, khởi đầu là ${f.reply}.`,
          ]);
    case "missedMate":
      return f.moves <= 1
        ? v("missedMate1", [
            `Bỏ lỡ nước chiếu bí ${f.better}.`,
            `Có ${f.better} chiếu bí ngay mà không đi.`,
            `Đã có sẵn nước chiếu bí ${f.better} nhưng lại bỏ qua.`,
          ])
        : v("missedMate", [
            `Bỏ lỡ đường chiếu bí trong ${f.moves} nước, bắt đầu bằng ${f.better}.`,
            `Có đòn chiếu bí ${f.moves} nước mở đầu bằng ${f.better} nhưng không nhận ra.`,
            `Bỏ qua cơ hội kết thúc ván: ${f.better} mở đầu đòn chiếu bí ${f.moves} nước.`,
          ]);
    case "avoidsMate":
      return v("avoidsMate", [
        `Nên đi ${f.better} để chặn đường chiếu bí đó.`,
        `Cần đi ${f.better} để hóa giải đòn chiếu bí này.`,
        `Nước phòng thủ đúng là ${f.better}, chặn được đường chiếu bí.`,
      ]);
    case "pattern": {
      const actor = f.side === "r" ? "Đỏ" : "Đen";
      const victim = opponent(f.side) === "r" ? "Đỏ" : "Đen";
      if (f.action === "formed") {
        return v(`pattern.formed.${f.patternId}`, [
          `${actor} lập thế ${f.patternName}, dọa chiếu bí.`,
          `${actor} hình thành thế trận ${f.patternName} cực kỳ hiểm hóc.`,
          `Sau nước này, ${actor} tạo ra thế sát ${f.patternName}.`,
        ]);
      }
      if (f.action === "allowed") {
        const rep = f.reply ? ` (${f.reply})` : "";
        return v(`pattern.allowed.${f.patternId}`, [
          `Nước đi sơ hở để ${actor} lập thế ${f.patternName}${rep}, dọa chiếu bí.`,
          `Để ${actor} có cơ hội đi ${f.reply ?? "tiếp"} tạo thế ${f.patternName} sát cục.`,
          `Tạo điều kiện cho ${actor} lập thế ${f.patternName}${rep}, khó tránh khỏi thất thế.`,
        ]);
      }
      return v(`pattern.broken.${f.patternId}`, [
        `${actor} kịp thời hóa giải thế ${f.patternName} của ${victim}.`,
        `Nước đi phòng thủ chuẩn xác, phá vỡ thế ${f.patternName} nguy hiểm của ${victim}.`,
        `Hóa giải thành công thế sát ${f.patternName} của ${victim}.`,
      ]);
    }
    case "doubleCheck": {
      const names = f.checkers.map((c) => `${c.name} ${o}`).join(" và ");
      return v("doubleCheck", [
        `${O} đáp ${f.reply}, ${names} cùng lúc chiếu tướng (chiếu kép), buộc Tướng phải chạy.`,
        `${O} có thể đi ${f.reply} tạo thế chiếu kép: ${names} cùng chiếu, Tướng buộc phải chạy.`,
        `Sau ${f.reply} của ${O}, ${names} cùng chiếu tướng (chiếu kép); không thể chặn cả hai nên Tướng phải chạy.`,
      ]);
    }
    case "discoveredCheck": {
      const moved = `${f.moved.name} ${o}`;
      const checker = `${f.checker.name} ${o}`;
      if (f.target) {
        return v("discoveredCheckTarget", [
          `${O} đáp ${f.reply}, rút ${moved} mở đường cho ${checker} chiếu tướng (chiếu rút), đồng thời đe dọa ăn ${f.target.name}.`,
          `${O} có đòn chiếu rút ${f.reply}: ${moved} rút đi để ${checker} chiếu tướng, đồng thời nhắm ăn ${f.target.name}.`,
          `Sau nước này, ${O} có thể đi ${f.reply} rút ${moved} cho ${checker} chiếu tướng (chiếu rút); vừa phải đỡ chiếu vừa khó giữ ${f.target.name}.`,
        ]);
      }
      return v("discoveredCheck", [
        `${O} đáp ${f.reply}, rút ${moved} mở đường cho ${checker} chiếu tướng (chiếu rút).`,
        `${O} có đòn chiếu rút ${f.reply}: ${moved} rút đi để ${checker} chiếu tướng.`,
        `${O} có thể đi ${f.reply}, ${moved} dạt ra mở đường cho ${checker} chiếu tướng (chiếu rút).`,
      ]);
    }
    case "pin": {
      const pinner = `${f.pinner.name} ${o}`;
      const pinned = f.pinned.name;
      const target = f.absolute ? "Tướng" : f.behind.name;
      const guard = f.absolute ? "không thể di chuyển vì để lộ Tướng" : `di chuyển sẽ để mất ${target}`;
      const leave = f.absolute ? "không thể rời đi vì sẽ lộ Tướng" : `rời đi là mất ${target}`;
      return v("pin", [
        `${O} đáp ${f.reply}, ${pinner} ghim chặt ${pinned} ở trước ${target} (${guard}).`,
        `${O} có thể đi ${f.reply} ghim ${pinned}: ${pinned} đứng giữa ${pinner} và ${target} nên ${leave}.`,
        `Sau ${f.reply} của ${O}, ${pinned} bị ${pinner} ghim trước ${target}, ${leave}.`,
      ]);
    }
    case "horseBlock": {
      const horse = f.horse.name;
      if (f.byOpponent) {
        return v("horseBlockOpp", [
          `${O} đáp ${f.reply}, ngáng chân ${horse}, khiến ${horse} bị bó và không thể hoạt động.`,
          `${O} có thể đi ${f.reply} chặn đúng chân ${horse}, Mã mất đường nhảy và dễ bị bắt.`,
          `Sau ${f.reply} của ${O}, ${horse} bị ngáng chân nên khó xoay xở.`,
        ]);
      }
      return v("horseBlockSelf", [
        `${f.blocker.name} vừa đi làm cản chân ${horse}, khiến ${horse} mất đường cơ động và khả năng phòng thủ.`,
        `${f.blocker.name} tự chặn chân ${horse} của mình, khiến Mã vừa khó cơ động vừa mất khả năng bảo vệ.`,
        `Nước này đặt ${f.blocker.name} vào đúng chân ${horse} (tự cản chân Mã), làm Mã bị bó và hở hàng phòng thủ.`,
      ]);
    }
    case "trappedPiece": {
      const att = f.attacker ? ` dưới đòn tấn công của ${f.attacker.name} ${o}` : "";
      const rep = f.reply ? ` (${f.reply})` : "";
      return v("trappedPiece", [
        `${f.piece.name} bị vây khốn${att}${rep}, không còn ô an toàn nào để tháo lui.`,
        `${f.piece.name} rơi vào thế bị vây${att}${rep}: đi đâu cũng bị ăn.`,
        `${f.piece.name} đã lọt vào vòng vây${att}${rep} và không còn đường rút an toàn.`,
      ]);
    }
    case "losesPiece": {
      const victim = f.victim.name;
      const attacker = `${f.attacker.name} ${o}`;
      const points = formatPoints(f.points);
      const tail = f.free
        ? v("losesPiece.free", [`ăn không ${victim}`, `bắt gọn ${victim}`, `ăn ${victim} mà không mất gì`])
        : v("losesPiece.trade", [
            `ăn ${victim}, lời ${points} điểm sau khi đổi quân`,
            `ăn ${victim}, sau khi đổi quân vẫn lời ${points} điểm`,
          ]);
      const guard = f.defended ? "; có quân bảo vệ nhưng đổi quân vẫn thiệt" : " mà không có quân bảo vệ";
      const reply = `${O} đáp ${f.reply} ${tail}.`;
      switch (f.cause) {
        case "moved":
          return v("losesPiece.moved", [
            `${victim} đi vào ô bị ${attacker} ăn${guard}. ${reply}`,
            `${victim} đi vào tầm ăn của ${attacker}${guard}. ${reply}`,
            `Nước này dâng ${victim} cho ${attacker}${guard}. ${reply}`,
          ]);
        case "trade":
          return v("losesPiece.tradeCause", [
            `${f.moved.name} ăn ${f.took!.name} ${o} nhưng bị ${attacker} ăn lại (${f.reply}), đổi như vậy thiệt ${points} điểm.`,
            `${f.moved.name} ăn ${f.took!.name} ${o} rồi bị ${attacker} ăn lại bằng ${f.reply}; cuộc đổi quân này thiệt ${points} điểm.`,
            `Đổi ${f.moved.name} lấy ${f.took!.name} ${o} là đổi lỗ: ${O} ăn lại bằng ${f.reply}, thiệt ${points} điểm.`,
          ]);
        case "ignored":
          return v("losesPiece.ignored", [
            `${victim} đang bị ${attacker} bắt nhưng nước này không xử lý. ${reply}`,
            `Bỏ mặc ${victim} đang bị ${attacker} bắt. ${reply}`,
            `${victim} bị ${attacker} bắt từ trước mà nước này không cứu. ${reply}`,
          ]);
        case "opened":
          return v("losesPiece.opened", [
            `${f.moved.name} rời chỗ cũ, mở đường cho ${attacker}. ${reply}`,
            `${f.moved.name} vừa đi đã để lộ đường cho ${attacker}. ${reply}`,
            `Khi ${f.moved.name} rời đi, ${attacker} có đường tấn công. ${reply}`,
          ]);
        case "screen":
          return v("losesPiece.screen", [
            `${f.moved.name} đứng vào làm ngòi cho ${attacker}. ${reply}`,
            `${f.moved.name} chen vào làm ngòi cho ${attacker}. ${reply}`,
            `${f.moved.name} đứng sai chỗ, thành ngòi cho ${attacker}. ${reply}`,
          ]);
        case "unguarded":
          return v("losesPiece.unguarded", [
            `Nước này làm ${victim} mất bảo vệ. ${reply}`,
            `Nước này khiến ${victim} không còn được bảo vệ đủ. ${reply}`,
            `Sau nước này ${victim} thiếu quân bảo vệ. ${reply}`,
          ]);
        default:
          return reply;
      }
    }
    case "threatens": {
      const names = f.targets.map((t) => t.name).join(" và ");
      if (f.check) {
        return v("threatensCheck", [
          `${O} đáp ${f.reply}, vừa chiếu tướng vừa đe dọa ăn ${names}.`,
          `${O} có ${f.reply} chiếu tướng, kèm theo đòn bắt ${names}.`,
          `Sau nước này, ${O} có thể đi ${f.reply} vừa chiếu vừa bắt ${names}.`,
        ]);
      }
      if (f.targets.length >= 2) {
        return v("threatensFork", [
          `${O} đáp ${f.reply}, cùng lúc bắt ${names}.`,
          `${O} có đòn bắt đôi ${f.reply}, nhắm cả ${names}.`,
          `${O} có thể đi ${f.reply} bắt đôi ${names}, khó giữ được cả hai.`,
        ]);
      }
      return v("threatens", [
        `${O} đáp ${f.reply}, đe dọa ăn ${names}.`,
        `${O} có thể đi ${f.reply} bắt ${names}.`,
        `Sau nước này, ${O} có ${f.reply} tấn công ${names}.`,
      ]);
    }
    case "missedCapture":
      return v("missedCapture", [
        `Nên đi ${f.better} ăn ${f.victim.name} ${o}.`,
        `Lẽ ra có thể đi ${f.better} ăn ${f.victim.name} ${o}.`,
        `Bỏ lỡ ${f.better} ăn ${f.victim.name} ${o}, lời ${formatPoints(f.points)} điểm.`,
      ]);
    case "missedEscape":
      return v("missedEscape", [
        `Nên đi ${f.better} để đưa ${f.piece.name} khỏi chỗ bị bắt.`,
        `Cần đi ${f.better} cứu ${f.piece.name} đang bị bắt.`,
        `Lẽ ra phải đi ${f.better} để ${f.piece.name} thoát khỏi chỗ bị bắt.`,
      ]);
    case "openingFault": {
      const head = f.opening ? `Trong thế trận ${f.opening}: ` : "";
      const pName = f.piece?.name ?? "Quân này";
      const betterPart = f.better ? v("openingFault.better", [` Nên đi ${f.better}.`, ` Hợp lý hơn là ${f.better}.`]) : "";
      if (f.fault === "repeatPiece") {
        return v("openingFault.repeat", [
          `${head}${pName} đã đi nhiều lần trong khai cuộc khi các quân lớn khác chưa ra trận.${betterPart}`,
          `${head}khai cuộc kỵ đi một quân nhiều lần: ${pName} lại đi tiếp trong khi các quân lớn khác còn nằm nhà.${betterPart}`,
          `${head}${pName} đi đi lại lại, làm chậm nhịp ra quân của cả thế trận.${betterPart}`,
        ]);
      }
      if (f.fault === "oneWing") {
        return v("openingFault.oneWing", [
          `${head}một cánh đã ra đủ Xe Mã Pháo mà cánh kia vẫn nằm nhà; khai cuộc cần ra quân cân bằng hai cánh.${betterPart}`,
          `${head}quân lớn dồn hết một cánh, cánh còn lại chưa động: nên chuyển sang ra quân cánh kia.${betterPart}`,
        ]);
      }
      if (f.fault === "advisorBlocksRook") {
        return v("openingFault.advisorBlocksRook", [
          `${head}bổ Sĩ lên giữa cung chặn mất hàng 2, Xe sau này không đi hoành sang cánh kia được.${betterPart}`,
          `${head}Sĩ đứng giữa cung cắt đường ngang của Xe, hai cánh khó hô ứng nhau.${betterPart}`,
        ]);
      }
      if (f.fault === "earlyAdvisor") {
        return v("openingFault.earlyAdvisor", [
          `${head}bổ Sĩ quá sớm khi quân lớn còn nằm nhà: chậm ra quân và lộ ý đồ sớm. Sĩ chỉ nên lên khi cần phòng một đòn cụ thể.${betterPart}`,
          `${head}khai cuộc cần ra quân lớn trước; bổ Sĩ lúc này chưa cần, lại để đối phương đoán được hướng bày trận.${betterPart}`,
        ]);
      }
      if (f.fault === "edgeElephant") {
        return v("openingFault.edgeElephant", [
          `${head}phi Tượng ra biên làm hai Tượng rời nhau, mất liên hoàn, cung tướng yếu đi.${betterPart}`,
          `${head}Tượng biên không che được Tượng kia, khai cuộc kỵ phi Tượng loạn.${betterPart}`,
        ]);
      }
      if (f.fault === "doubleEdgeHorse") {
        return v("openingFault.doubleEdgeHorse", [
          `${head}cả hai Mã đều ra biên, ít chỗ nhảy ("Mã đi biên là Mã chết").${betterPart}`,
          `${head}Mã thứ hai cũng ra biên, hai Mã đều kém linh hoạt; khai cuộc nên ra Chính Mã.${betterPart}`,
        ]);
      }
      if (f.fault === "ignoreCenter") {
        return v("openingFault.ignoreCenter", [
          `${head}bỏ trung lộ: Pháo đầu đối phương đang nhắm Tốt đầu mà Tốt không có quân bảo vệ. Gặp Pháo đầu cần lên Mã chính giữ Tốt đầu, hoặc đặt Pháo đối lại.${betterPart}`,
          `${head}Tốt đầu bị Pháo đầu đối phương nhắm mà không có căn: trung lộ là đường tấn công chính, khai cuộc không được bỏ ngỏ.${betterPart}`,
        ]);
      }
      if (f.fault === "earlyCannon") {
        return v("openingFault.earlyCannon", [
          `${head}${pName} xuất kích sang sông khi hai Mã còn nằm nhà: Pháo đi lẻ dễ bị đuổi mất nước, quân phía sau chưa kịp tiếp ứng. Nên ra Mã trước rồi mới đưa Pháo lên.${betterPart}`,
          `${head}chưa ra Mã đã đưa Pháo qua sông: đánh đơn độc sớm, đối phương vừa đuổi Pháo vừa ra quân được tiên.${betterPart}`,
        ]);
      }
      if (f.fault === "edgeHorse") {
        return v("openingFault.edgeHorse", [
          `${head}Mã đầu tiên đã ra biên trong khi còn đường ra Chính Mã: Mã biên ít chỗ nhảy, trung lộ không có Mã giữ ("Mã đi biên là Mã chết").${betterPart}`,
          `${head}chưa có Mã chính nào mà đã ra Mã biên: Mã kém linh hoạt, không bảo vệ được Tốt đầu.${betterPart}`,
        ]);
      }
      return v("openingFault.lateRook", [
        `${head}khai cuộc cần sớm xuất Xe chiếm lộ thông (chậm ra Xe sẽ thất thế, "Một Xe mười quân").${betterPart}`,
        `${head}hai Xe vẫn nằm ở góc dù khai cuộc đã qua mấy nước; Xe là quân mạnh nhất, ra chậm là thiệt ("Một Xe mười quân").${betterPart}`,
        `${head}nên tranh thủ đưa Xe ra lộ thông trước, quân mạnh nhất còn nằm nhà thì thế trận thiếu sức.${betterPart}`,
      ]);
    }
    case "strategy": {
      const intro = v(`plan.${f.plan}`, PLAN_TEXT[f.plan])(O, f.opening);
      const lead = intro ? intro + " " : "";
      const why = f.gains.map(gain).join(" và ");
      const worse = f.worsened.length
        ? v("strategy.worse", [", còn ", "; trong khi đó "]) + `${f.played} ${loss(f.worsened[0], f.loose)}`
        : "";
      return v("strategy", [
        `${lead}Nên đi ${f.better}: ${why}${worse}.`,
        `${lead}Tốt hơn là ${f.better}, vì ${why}${worse}.`,
        `${lead}${f.better} là lựa chọn tốt hơn: ${why}${worse}.`,
      ]);
    }
    case "idea": {
      const head =
        f.opening && f.plan === "raQuan"
          ? v("idea.headOpening", [
              `Kế hoạch ra quân (${f.opening}):`,
              `Ra quân theo ${f.opening}:`,
              `Trong thế trận ${f.opening}:`,
            ])
          : v("idea.head", [
              `Kế hoạch: ${PLAN_NAME[f.plan]}.`,
              `Hướng chính lúc này: ${PLAN_NAME[f.plan]}.`,
              `Trọng tâm: ${PLAN_NAME[f.plan]}.`,
            ]);
      const good = f.gains.map((p) => (p === "matGoc" ? "quân có căn hơn" : gain(p))).join(" và ");
      const bad = f.worsened.length ? loss(f.worsened[0], f.loose) : "";
      if (good && bad) {
        return v("idea.mixed", [
          `${head} ${f.played} giúp ${good}, nhưng ${bad}.`,
          `${head} ${f.played} được cái ${good}, tiếc là ${bad}.`,
          `${head} ${f.played} giúp ${good}, song lại ${bad}.`,
        ]);
      }
      if (good) {
        return v("idea.good", [`${head} ${f.played} giúp ${good}.`, `${head} Ưu điểm của ${f.played}: ${good}.`]);
      }
      if (bad) {
        return v("idea.bad", [`${head} ${f.played} ${bad}.`, `${head} Nhược điểm của ${f.played}: ${bad}.`]);
      }
      return v("idea.neutral", [
        `${head} ${f.played} giữ thế, chưa thay đổi nhiều.`,
        `${head} ${f.played} là nước chờ, thế cờ chưa đổi nhiều.`,
        `${head} ${f.played} không làm thế cờ thay đổi đáng kể.`,
      ]);
    }
    case "evalDrop": {
      const lost = `${SIDE_NAME[mover]} thiệt khoảng ${formatPoints(f.points)} điểm`;
      if (!f.reply) {
        return v("evalDrop", [`Theo AI, ${lost} so với nước tốt nhất.`, `So với nước tốt nhất, ${lost} theo đánh giá của AI.`]);
      }
      const check = f.check ? " (chiếu tướng)" : "";
      return v("evalDropReply", [
        `Nước đáp mạnh nhất của ${O} là ${f.reply}${check}; theo AI, ${lost}.`,
        `${O} sẽ đáp ${f.reply}${check}; tính ra ${lost} so với nước tốt nhất.`,
        `Sau nước đáp ${f.reply}${check} của ${O}, AI tính ${lost}.`,
      ]);
    }
    case "missedWin": {
      const betterPart = f.better ? ` (nên đi ${f.better})` : "";
      return v("missedWin", [
        `Bỏ lỡ cơ hội thắng rõ rệt: thế cờ đang áp đảo nhưng để rớt về thế cân bằng${betterPart}.`,
        `Thế thắng trong tầm tay nhưng để tuột mất, ván cờ trở về cân bằng${betterPart}.`,
        `Đang áp đảo mà đi nước này thì ưu thế gần như mất hết${betterPart}.`,
      ]);
    }
    case "endgame":
      return v("endgame", [
        `Thế cờ tàn cuộc lý thuyết: ${f.endgame.name}. ${f.endgame.description}`,
        `Đây là tàn cuộc lý thuyết "${f.endgame.name}". ${f.endgame.description}`,
        `Thế cờ đã thành tàn cuộc ${f.endgame.name}. ${f.endgame.description}`,
      ]);
    case "assessment": {
      if (f.dynamic && f.summary) {
        return f.summary;
      }
      if (!f.leader) {
        return v("assessment.neutral", [
          "Thế cờ giằng co cân bằng, hai bên ngang ngửa về thế trận.",
          "Thế trận cân bằng, chưa bên nào tạo được ưu thế rõ rệt.",
        ]);
      }
      const leaderName = SIDE_NAME[f.leader];
      const factorDescs = f.factors.map((fa) => FACTOR_NAMES[fa.id]).join(", ");
      return v("assessment.leader", [
        `${leaderName} chiếm ưu thế nhờ ${factorDescs}.`,
        `Ưu thế thuộc về ${leaderName} với các yếu tố: ${factorDescs}.`,
      ]);
    }
    case "threat": {
      const byName = SIDE_NAME[f.by];
      if (f.isMate) {
        return v("threat.mate", [
          `${byName} đang đe dọa sát cục bằng nước ${f.move}.`,
          `Nguy hiểm: ${byName} dọa chiếu bí với ${f.move}.`,
          `${byName} chuẩn bị đòn sát cục bắt đầu bằng ${f.move}.`,
        ]);
      }
      if (f.summary) {
        return f.summary;
      }
      return v("threat.gain", [
        `${byName} dọa ${f.move}${f.line.length > 1 ? ` (biến: ${f.line.join(", ")})` : ""}.`,
        `Đối phương đang đe dọa nước ${f.move}.`,
      ]);
    }
    case "ignoredThreat": {
      return v("ignoredThreat", [
        `Nước đi bỏ qua đòn đe dọa ${f.threat} của ${O}, để ${O} đi ${f.reply} chiếm ưu thế (+${formatPoints(f.points)} điểm).`,
        `Bỏ qua nước dọa ${f.threat} của đối phương; ${O} lập tức khai thác bằng ${f.reply} (+${formatPoints(f.points)} điểm).`,
        `Không phòng thủ đòn dọa ${f.threat}, để ${O} đáp trả bằng ${f.reply}.`,
      ]);
    }
    case "parried": {
      return v("parried", [
        `Nước ${f.played} kịp thời hóa giải đòn đe dọa ${f.threat} của ${O}.`,
        `${f.played} là nước phòng thủ chuẩn xác, vô hiệu hóa đòn dọa ${f.threat}.`,
        `Kịp thời đi ${f.played} để chặn đứng đòn dọa ${f.threat} của ${O}.`,
      ]);
    }
    case "intent":
      return f.summary;
    case "initiative":
      return f.summary;
    case "openFile":
      return f.summary;
    case "exchange":
      return f.summary;
    case "zhaoMiddlegame":
      return f.summary;
    case "xuMiddlegame":
      return f.summary;
    case "endgamePrinciple":
      return f.summary;
  }
}

export type CommentaryStyle = "default" | "zhaoXinxin" | "xuYinchuan";

/**
 * Dữ kiện kỳ lý trung cuộc của nước đi theo hai phong cách đại sư (B6, B7).
 * Luôn rút cả hai; explainText chỉ hiện dữ kiện khớp với phong cách đang chọn.
 */
export function personaFacts(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions & XuTacticsOptions,
): Fact[] {
  const out: Fact[] = [];
  // Tối đa 2 nguyên lý mỗi nước để lời bình không bị loãng (đã xếp theo ưu tiên).
  out.push(...detectAllZhaoTactics(before, move, after, options).slice(0, 2));
  out.push(...detectAllXuTactics(before, move, after, options).slice(0, 2));
  return out;
}

/**
 * Lời giải thích hoàn chỉnh cho một nước của phe `mover`.
 * `seed` (thường là số nửa nước) đổi cách diễn đạt giữa các nước; bỏ trống thì dùng câu chuẩn.
 * `style`: tùy chọn phong cách bình luận ("zhaoXinxin" hoặc "xuYinchuan").
 */
export function explainText(
  facts: Fact[],
  mover: Side,
  seed?: number,
  style?: CommentaryStyle,
): string {
  // Dữ kiện của mỗi đại sư chỉ hiện khi chọn đúng góc nhìn đó.
  const visible = facts.filter((f) =>
    f.kind === "zhaoMiddlegame" ? style === "zhaoXinxin" : f.kind === "xuMiddlegame" ? style === "xuYinchuan" : true,
  );
  const base = visible.map((f) => capitalize(sentence(f, mover, seed))).join(" ");
  if (!style || style === "default" || !base) return base;

  if (style === "zhaoXinxin") {
    const hasZhao = visible.some((f) => f.kind === "zhaoMiddlegame");
    // Chỉ khen tấn công khi chính bên đi tạo thế công, không phải khi đối phương đe dọa / lập hình.
    const hasAggressive = visible.some(
      (f) =>
        (f.kind === "initiative" && f.side === mover) ||
        (f.kind === "threat" && f.by === mover) ||
        (f.kind === "pattern" && f.side === mover && f.action === "formed"),
    );
    const zhaoFacts = visible.filter((f): f is ZhaoMiddlegameFact => f.kind === "zhaoMiddlegame");
    const lessonFact = zhaoFacts.find((f) => f.lesson !== undefined);
    const lessonTag = lessonFact ? ` (Kỳ lý #${lessonFact.lesson}: ${lessonFact.lessonTitle})` : "";
    const quoteSuffix = lessonFact?.quote && lessonFact?.videoUrl
      ? ` 💬 Triệu Hâm Hâm (${lessonFact.quote.at}): "${lessonFact.quote.text}" [Xem video: ${lessonFact.videoUrl}]`
      : "";

    if (hasZhao && zhaoFacts.every((f) => f.tone === "critique")) {
      return `[Triệu Hâm Hâm - Cảnh tỉnh]${lessonTag}: ${base}${quoteSuffix}`;
    }
    if (hasZhao) {
      return `[Triệu Hâm Hâm - Công sát]${lessonTag}: ${base}${quoteSuffix}`;
    }
    if (hasAggressive) return `[Triệu Hâm Hâm]: Tận dụng thời cơ tung đòn hỏa lực bão táp! ${base}`;
    return `[Triệu Hâm Hâm]: ${base}`;
  }

  if (style === "xuYinchuan") {
    const hasXu = visible.some((f) => f.kind === "xuMiddlegame");
    const xuFacts = visible.filter((f) => f.kind === "xuMiddlegame");
    const hasDefensive = visible.some(
      (f) =>
        f.kind === "parried" ||
        f.kind === "endgame" ||
        (f.kind === "endgamePrinciple" && f.side === mover && f.tone !== "critique") ||
        ((f.kind === "openFile" || f.kind === "exchange") && f.side === mover),
    );
    if (hasXu && xuFacts.every((f) => f.kind === "xuMiddlegame" && f.tone === "critique")) return `[Hứa Ngân Xuyên - Cảnh tỉnh]: ${base}`;
    if (hasXu) return `[Hứa Ngân Xuyên - Thái cực]: ${base}`;
    if (hasDefensive) return `[Hứa Ngân Xuyên]: Điềm tĩnh tích lũy ưu thế, dĩ nhu khắc cương. ${base}`;
    return `[Hứa Ngân Xuyên]: ${base}`;
  }

  return base;
}

export {
  buildLlmCommentaryPrompt,
  generateLlmCommentary,
  detectTheoreticalEndgame,
  type LlmCommentaryOptions,
  type LlmPrompt,
  type TheoreticalEndgame,
  type ThreatFact,
  type IgnoredThreatFact,
  type ParriedFact,
  type ThreatData,
  detectThreat,
  detectThreatMoveFacts,
  type Purpose,
  type IntentFact,
  detectIntent,
  PURPOSE_NAMES,
  type InitiativeFact,
  type OpenFileFact,
  type ExchangeFact,
  type ExchangeReason,
  detectInitiative,
  detectOpenFile,
  detectExchange,
  type ZhaoTactics,
  type ZhaoMiddlegameFact,
  type ZhaoTacticsOptions,
  detectZhaoTactics,
  detectPalaceBreaker,
  detectSacrificeForInitiative,
  detectCounterThreat,
  detectFlankOverload,
  type XuTactics,
  type XuMiddlegameFact,
  type XuTacticsOptions,
  detectXuTactics,
  detectSolidDefense,
  detectIncrementalGain,
  detectPositionalClamp,
  detectTransitionExchange,
  detectAllXuTactics,
};
