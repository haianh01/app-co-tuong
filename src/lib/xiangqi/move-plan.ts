// Kế hoạch của một nước đi: đọc cả biến chính (PV) thay vì chỉ thế cờ ngay sau nước đi.
//  - Mục đích: đòn dọa nước này tạo ra (sát cục / ăn quân có lời), không thì cái lợi thế trận (nguyên lý strategy.ts)
//  - Nước đáp: đối phương bị buộc làm gì (giải chiếu, chạy quân, giữ quân, ăn lại, phòng sát, bỏ mặc)
//  - Nước tiếp theo: bên đi làm gì sau đó và nước đầu đã chuẩn bị gì cho nó (dọn đường, tạo ngòi, nhường chân Mã)
//  - Hướng chung: các quân của bên đi trong biến cùng dồn về một cánh, hoặc nước đi tăng áp lực lên cung tướng
// Thuần hàm, tất định, không gọi engine (không có PV thì chỉ nói được mục đích và hướng chung).

import {
  type Board, type Move, type Side,
  attackersOf, colOf, hasAnyLegalMove, inCheck, legalMoves, opponent, play, pseudoMoves, rowOf, sideOf,
  typeOf, PIECE_VALUES,
} from "./engine";
import { exchangeGain } from "./explain";
import { narratePv } from "./narrate";
import { moveNotation, PIECE_NAME, SIDE_NAME } from "./notation";
import {
  type Plan, type Principle,
  choosePlan, GAIN_TEXT, palacePressure, PLAN_NAME, PRINCIPLES, principleScores, WEIGHTS,
} from "./strategy";

/** Ngưỡng lợi tối thiểu (cp) để coi một nước ăn quân là đòn dọa: một Tốt. */
const THREAT_MIN_GAIN = 100;

export type PlanThreat =
  | { kind: "mate"; move: string }
  | {
      kind: "capture";
      move: string;
      target: number;
      victim: string;
      gain: number;
      /** moved: quân vừa đi dọa ăn; screen: quân vừa đi làm ngòi cho Pháo; discovered: nước đi mở đường cho quân khác; removedDefender: ăn mất quân giữ. */
      by: "moved" | "screen" | "discovered" | "removedDefender";
      attacker: string;
    };

export type ReplyRole = "giaiChieu" | "anLai" | "phanDon" | "chayQuan" | "giuQuan" | "phongSat" | "boMac" | "khac";
export type FollowUpRole = "thucHienDoa" | "tiepTuc" | "donDuong" | "taoNgoi" | "nhuongChan" | "anQuan" | "chieu" | "khac";

export interface PlanStep {
  side: Side;
  move: string;
  text: string;
}

export interface MovePlanFact {
  kind: "movePlan";
  side: Side;
  move: string;
  /** Kế hoạch chung lúc này (strategy.ts choosePlan). */
  plan: Plan;
  /** Đòn dọa nước này tạo ra (null nếu không có). */
  threat: PlanThreat | null;
  /** Cái lợi thế trận lớn nhất của nước đi theo kế hoạch hiện tại (null nếu không đáng kể). */
  gain: Principle | null;
  /** Vai trò nước đáp của đối phương trong PV. */
  replyRole: ReplyRole | null;
  /** Vai trò nước tiếp theo của bên đi trong PV. */
  followUpRole: FollowUpRole | null;
  /** Hướng chung, vd. "dồn Xe, Pháo sang cánh phải (lộ 1–4)". */
  aim: string | null;
  /** Diễn giải 3 bước: nước này → đối phương đáp → bên đi tiếp tục. */
  steps: PlanStep[];
  /** Kết cục cả biến (từ narratePv), null khi biến quá ngắn. */
  outcome: string | null;
  summary: string;
}

export interface MovePlanOptions {
  /** Số nửa nước đã đi, để chọn kế hoạch (ra quân / trung cuộc). Mặc định coi là trung cuộc. */
  ply?: number;
}

const name = (board: Board, sq: number) => PIECE_NAME[typeOf(board[sq]!)] ?? "quân";
const value = (board: Board, sq: number) => PIECE_VALUES[typeOf(board[sq]!)];

/**
 * Đòn dọa do chính `move` tạo ra: nếu đối phương được bỏ lượt, bên đi có nước sát cục, hoặc ăn quân có lời
 * mà trước nước đi chưa có. Đòn ăn quân phải gắn với nước đi (quân vừa đi, quân được mở đường, quân giữ bị ăn mất);
 * đòn dọa có sẵn từ trước không phải ý đồ của nước này.
 */
export function findThreat(before: Board, move: Move, after: Board): PlanThreat | null {
  const mover = sideOf(after[move.to]!);
  const opp = opponent(mover);
  if (inCheck(after, mover)) return null;

  for (const m of legalMoves({ board: after, turn: mover })) {
    const next = play(after, m);
    if (inCheck(next, opp) && !hasAnyLegalMove({ board: next, turn: opp })) {
      return { kind: "mate", move: moveNotation(after, m) };
    }
  }

  const tookDefender = !!before[move.to];
  let best: Extract<PlanThreat, { kind: "capture" }> | null = null;
  for (let sq = 0; sq < after.length; sq++) {
    const p = after[sq];
    if (!p || sideOf(p) !== opp || typeOf(p) === "k") continue;
    const gain = exchangeGain(after, sq, mover) ?? 0;
    if (gain < THREAT_MIN_GAIN || (best && best.gain >= gain)) continue;
    if (gain <= (exchangeGain(before, sq, mover) ?? 0)) continue;
    const old = attackersOf(before, sq, mover);
    const attackers = attackersOf(after, sq, mover).sort((a, b) => value(after, a) - value(after, b));
    const fresh = attackers.filter((a) => a === move.to || !old.includes(a));
    let by: "moved" | "screen" | "discovered" | "removedDefender";
    let from: number;
    if (fresh.includes(move.to)) [by, from] = ["moved", move.to];
    else if (fresh.length > 0) {
      from = fresh[0];
      by = typeOf(after[from]!) === "c" && between(from, sq, move.to) ? "screen" : "discovered";
    }
    else if (tookDefender && attackers.length > 0) [by, from] = ["removedDefender", attackers[0]];
    else continue;
    best = {
      kind: "capture", move: moveNotation(after, { from, to: sq }), target: sq, victim: name(after, sq), gain, by,
      attacker: name(after, from),
    };
  }
  return best;
}

/** Cái lợi thế trận lớn nhất của nước đi, chấm theo trọng số của kế hoạch hiện tại (như moveIdea trong explain.ts). */
function positionalGain(before: Board, after: Board, mover: Side, plan: Plan): Principle | null {
  const b0 = principleScores(before, mover);
  const a = principleScores(after, mover);
  let best: Principle | null = null;
  let bestD = 1;
  for (const p of PRINCIPLES) {
    if (p === "matGoc") continue; // "không để quân mất căn" không phải mục đích của một nước
    const d = WEIGHTS[plan][p] * (a[p] - b0[p]);
    if (d >= bestD) [best, bestD] = [p, d];
  }
  return best;
}

/** Ô `x` nằm giữa `a` và `b` trên cùng hàng hoặc cột. */
function between(a: number, b: number, x: number): boolean {
  const [ra, ca, rb, cb, rx, cx] = [rowOf(a), colOf(a), rowOf(b), colOf(b), rowOf(x), colOf(x)];
  if (ra === rb && rx === ra) return cx > Math.min(ca, cb) && cx < Math.max(ca, cb);
  if (ca === cb && cx === ca) return rx > Math.min(ra, rb) && rx < Math.max(ra, rb);
  return false;
}

/** Ô cản chân Mã khi đi từ `from` tới `to`. */
function horseLeg(from: number, to: number): number {
  const dr = rowOf(to) - rowOf(from);
  const dc = colOf(to) - colOf(from);
  return Math.abs(dr) === 2 ? from + Math.sign(dr) * 9 : from + Math.sign(dc);
}

function classifyReply(before: Board, after: Board, reply: Move, move: Move, mover: Side, threat: PlanThreat | null): { role: ReplyRole; text: string } {
  const opp = opponent(mover);
  const n = moveNotation(after, reply);
  const victim = after[reply.to] ? name(after, reply.to) : null;
  const r1 = play(after, reply);
  const O = SIDE_NAME[opp];

  if (inCheck(after, opp)) return { role: "giaiChieu", text: `${O} buộc phải giải chiếu bằng ${n}` };
  // Nước đi có ăn quân thì đây là ăn lại; không thì đối phương ăn luôn quân vừa tiến lên (hai bên cùng dọa nhau)
  if (reply.to === move.to && victim) return { role: "anLai", text: `${O} ${n} ${before[move.to] ? "ăn lại" : "ăn luôn"} ${victim}` };
  if (victim) return { role: "phanDon", text: `${O} không đỡ mà phản đòn ${n} ăn ${victim}` };
  if (threat?.kind === "mate") {
    // Sau nước đáp, bên đi còn sát một nước không (nước đáp không phải chiếu nên bên đi được đi tiếp)
    const still = legalMoves({ board: r1, turn: mover }).some((m) => {
      const next = play(r1, m);
      return inCheck(next, opp) && !hasAnyLegalMove({ board: next, turn: opp });
    });
    return still
      ? { role: "boMac", text: `${O} đi ${n} nhưng không phòng được sát cục` }
      : { role: "phongSat", text: `${O} buộc phải ${n} phòng sát cục` };
  }
  if (threat?.kind === "capture") {
    if (reply.from === threat.target) return { role: "chayQuan", text: `${O} buộc phải chạy ${threat.victim} (${n})` };
    if ((exchangeGain(r1, threat.target, mover) ?? 0) < THREAT_MIN_GAIN) {
      return { role: "giuQuan", text: `${O} buộc phải ${n} giữ ${threat.victim}` };
    }
    return { role: "boMac", text: `${O} bỏ mặc ${threat.victim} để đi ${n}` };
  }
  return { role: "khac", text: `${O} đáp ${n}` };
}

function classifyFollowUp(
  before: Board, move: Move, board: Board, next: Move, mover: Side, threat: PlanThreat | null,
): { role: FollowUpRole; text: string } {
  const S = SIDE_NAME[mover];
  const n = moveNotation(board, next);
  const piece = name(board, next.from);
  const victim = board[next.to] ? name(board, next.to) : null;
  const gives = inCheck(play(board, next), opponent(mover));
  const tail = victim ? ` ăn ${victim}` : gives ? " chiếu tướng" : "";

  if (threat?.kind === "capture" && next.to === threat.target && victim) {
    return { role: "thucHienDoa", text: `${S} thực hiện đòn dọa, ${n} ăn ${victim}` };
  }
  if (next.from === move.to) return { role: "tiepTuc", text: `${S} tiếp tục đưa ${piece} ${n}${tail}` };

  // Nước tiếp theo không đi được trước nước đầu: nước đầu đã chuẩn bị cho nó
  const prepared = moveNotation(before, move);
  if (before[next.from] === board[next.from] && !pseudoMoves(before, next.from).includes(next.to)) {
    const t = typeOf(board[next.from]!);
    if (t === "c" && victim && between(next.from, next.to, move.to)) {
      return { role: "taoNgoi", text: `${S} ${n}${tail}, nhờ ${prepared} làm ngòi cho Pháo` };
    }
    if (t === "n" && horseLeg(next.from, next.to) === move.from) {
      return { role: "nhuongChan", text: `${S} ${n}${tail}, nhờ ${prepared} đã nhường chân cho Mã` };
    }
    if (next.to === move.from || between(next.from, next.to, move.from)) {
      return { role: "donDuong", text: `${S} ${n}${tail}, nhờ ${prepared} đã dọn đường cho ${piece}` };
    }
  }
  if (victim) return { role: "anQuan", text: `${S} ${n} ăn ${victim}` };
  if (gives) return { role: "chieu", text: `${S} ${n} chiếu tướng` };
  return { role: "khac", text: `${S} tiếp theo ${n}` };
}

/** Cánh theo số lộ của bên đi: lộ 1–4 bên phải, lộ 5 trung lộ, lộ 6–9 bên trái. */
function wingOf(sq: number, s: Side): "phai" | "trung" | "trai" {
  const file = s === "r" ? 9 - colOf(sq) : colOf(sq) + 1;
  return file === 5 ? "trung" : file < 5 ? "phai" : "trai";
}
const WING_TEXT = { phai: "cánh phải (lộ 1–4)", trung: "trung lộ", trai: "cánh trái (lộ 6–9)" } as const;

/** Hướng chung: hai quân lớn trở lên của bên đi trong biến dồn sang sân đối phương ở cùng một cánh, hoặc nước đi tăng áp lực lên cung tướng. */
function findAim(before: Board, after: Board, mover: Side, line: Move[]): string | null {
  const opp = opponent(mover);
  const wings = new Map<keyof typeof WING_TEXT, Set<string>>();
  let cur = before;
  for (let i = 0; i < Math.min(line.length, 6); i++) {
    const m = line[i];
    const p = cur[m.from];
    if (!p) break;
    if (sideOf(p) === mover && "rncp".includes(typeOf(p)) && (mover === "r" ? rowOf(m.to) <= 4 : rowOf(m.to) >= 5)) {
      const w = wingOf(m.to, mover);
      if (!wings.has(w)) wings.set(w, new Set());
      wings.get(w)!.add(PIECE_NAME[typeOf(p)]);
    }
    cur = play(cur, m);
  }
  for (const [w, pieces] of wings) {
    if (pieces.size >= 2) return `dồn ${[...pieces].join(", ")} sang ${WING_TEXT[w]}`;
  }
  const pressureGain = palacePressure(after, opp) - palacePressure(before, opp);
  if (pressureGain >= 2) return `tăng áp lực lên cung tướng ${SIDE_NAME[opp]} (thêm ${pressureGain} ô bị khống chế)`;
  return null;
}

/**
 * Giải thích kế hoạch của `move`: nước này nhằm gì, đối phương buộc phải làm gì và bên đi làm gì tiếp theo.
 * `pv` là biến chính bắt đầu bằng `move` (hoặc biến sau nước đi, tự nối thêm `move` vào đầu).
 */
export function explainMovePlan(before: Board, move: Move, pv: Move[] = [], options: MovePlanOptions = {}): MovePlanFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const after = play(before, move);
  const line = pv[0]?.from === move.from && pv[0]?.to === move.to ? pv : [move, ...pv];
  const notation = moveNotation(before, move);
  const S = SIDE_NAME[mover];

  const isCheck = inCheck(after, opp);
  const isMate = isCheck && !hasAnyLegalMove({ board: after, turn: opp });
  const threat = isCheck ? null : findThreat(before, move, after);
  const plan = choosePlan(before, mover, options.ply ?? 40);
  const gain = isMate ? null : positionalGain(before, after, mover, plan);
  const captured = before[move.to] ? name(before, move.to) : null;

  const purposes: string[] = [];
  if (isMate) purposes.push("chiếu bí");
  else if (isCheck) purposes.push(captured ? `ăn ${captured} chiếu tướng` : "chiếu tướng");
  else if (captured) purposes.push(`ăn ${captured}`);
  if (threat?.kind === "mate") purposes.push(`dọa ${threat.move} chiếu bí`);
  else if (threat?.kind === "capture") {
    purposes.push(
      threat.by === "moved" ? `${name(after, move.to)} dọa ăn ${threat.victim} (${threat.move})`
        : threat.by === "screen" ? `làm ngòi cho Pháo dọa ăn ${threat.victim} (${threat.move})`
        : threat.by === "discovered" ? `mở đường cho ${threat.attacker} dọa ăn ${threat.victim} (${threat.move})`
          : `trừ quân giữ, dọa tiếp ${threat.move} ăn ${threat.victim}`,
    );
  }
  if (gain && purposes.length < 2) purposes.push(GAIN_TEXT[gain][0]);
  const steps: PlanStep[] = [
    { side: mover, move: notation, text: `${S} ${notation}${purposes.length ? `: ${purposes.join(", ")}` : ""}` },
  ];

  let replyRole: ReplyRole | null = null;
  let followUpRole: FollowUpRole | null = null;
  const reply = line[1];
  if (!isMate && reply && after[reply.from] && sideOf(after[reply.from]!) === opp) {
    const r = classifyReply(before, after, reply, move, mover, threat);
    replyRole = r.role;
    steps.push({ side: opp, move: moveNotation(after, reply), text: r.text });
    const r1 = play(after, reply);
    const next = line[2];
    if (next && r1[next.from] && sideOf(r1[next.from]!) === mover) {
      const f = classifyFollowUp(before, move, r1, next, mover, threat);
      followUpRole = f.role;
      steps.push({ side: mover, move: moveNotation(r1, next), text: f.text });
    }
  }

  const aim = isMate ? null : findAim(before, after, mover, line);

  let outcome: string | null = null;
  if (line.length >= 4) {
    const n = narratePv(before, mover, line, { skipThreats: true });
    if (n.summary && n.summary !== "không có nước tiếp diễn") outcome = n.summary;
  }

  // Không nói được mục đích, hướng chung lẫn vai trò của nước đáp / nước tiếp theo thì không có gì đáng giải thích
  const meaningful = purposes.length > 0 || aim
    || (replyRole && replyRole !== "khac") || (followUpRole && followUpRole !== "khac");
  if (!meaningful) return null;

  const parts = [steps.map((s) => s.text).join("; ")];
  if (aim) parts.push(`Hướng chung: ${aim}`);
  else if (!isMate && plan !== "canBang") parts.push(`Kế hoạch: ${PLAN_NAME[plan]}`);
  if (outcome) parts.push(`Cả biến: ${outcome}`);
  const summary = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(". ") + ".";

  return { kind: "movePlan", side: mover, move: notation, plan, threat, gain, replyRole, followUpRole, aim, steps, outcome, summary };
}
