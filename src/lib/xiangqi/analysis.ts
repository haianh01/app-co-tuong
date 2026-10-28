import { findBestMove } from "./ai";
import { assessPosition, type PositionAssessment } from "./assess";
import { attackersOf, inCheck, isDefended, legalMoves, opponent, parseFen, play, PIECE_VALUES, sideOf, START_FEN, typeOf, type Board, type Move, type Side } from "./engine";
import { explainMove, personaFacts, type Fact } from "./explain";
import { endgamePrincipleFacts } from "./endgame-principles";
import { detectAllOpeningTactics } from "./opening-principles";
import { classifyMoveOutcome, type MoveOutcome } from "./move-outcome";
import { zhaoOutcomeAllows } from "./zhao-outcome";
import { detectIntent, type IntentFact } from "./intent";
import type { GameState } from "./game";
import { moveNotation } from "./notation";
import {
  isBookMove,
  detectOpeningFromMoves,
  getOpeningGuide,
  type OpeningGuide,
} from "./openings";
import {
  detectPhases,
  getPhaseAtPly,
  type GamePhase,
  type PhaseSummary,
} from "./phases";
import { type PlanThread, trackPlanThreads } from "./plan-thread";
import type { Plan } from "./strategy";
import { detectThreat, type ThreatFact } from "./threats";
import { formatPvLine } from "./uci";

export interface PositionEvalLine {
  best: Move | null;
  score: number;
  depth?: number;
  pv?: Move[];
  line?: string[];
  /** Tỉ lệ thắng/hòa/thua (phần nghìn) do engine tự báo: [thắng, hòa, thua] */
  wdl?: [number, number, number];
}

/** Điểm AI của một thế cờ, tính theo phe đang đến lượt (dương = phe đó đang hơn), kèm nước tốt nhất. */
export interface PositionEval {
  score: number;
  best: Move | null;
  /** Độ sâu tìm kiếm của engine. */
  depth?: number;
  /** Chuỗi nước đi chính từ engine (PV). */
  pv?: Move[];
  /** Chuỗi biến cờ tướng ký hiệu tiếng Việt có sẵn. */
  line?: string[];
  /** Danh sách các biến lựa chọn khi chạy MultiPV. */
  lines?: PositionEvalLine[];
  /** Thế cờ (FEN) tương ứng nếu có. */
  fen?: string;
  /** Tỉ lệ thắng/hòa/thua (phần nghìn) do engine tự báo: [thắng, hòa, thua] */
  wdl?: [number, number, number];
}

export type MoveClass =
  | "brilliant"
  | "only"
  | "best"
  | "book"
  | "missedWin"
  | "inaccuracy"
  | "mistake"
  | "blunder";

export interface MoveReview {
  /** Vị trí sau nước đi (dùng để nhảy tới trong biên bản). */
  ply: number;
  side: Side;
  notation: string;
  /** Điểm mất đi so với nước tốt nhất (đơn vị: 100 = một con tốt). */
  loss: number;
  cls: MoveClass | null;
  /** Nước AI đề xuất thay thế (nếu khác nước đã đi). */
  better: string | null;
  /** Dữ kiện giải thích vì sao nước bị chấm (rỗng nếu nước không bị chấm), xem explain.ts. */
  facts: Fact[];
  /** Chuỗi biến nước phản đòn tiếp theo của đối phương (2-3 nước). */
  line?: string[];
  /** Các ô cờ then chốt liên quan đến sai lầm để hiển thị highlight. */
  highlights?: number[];
  /** Xác suất thắng trước nước đi (0.0 đến 1.0). */
  winBefore?: number;
  /** Xác suất thắng sau nước đi theo người đi (0.0 đến 1.0). */
  winAfter?: number;
  /** Mức giảm xác suất thắng (0.0 đến 1.0). */
  winDrop?: number;
  /** Tọa độ nước đã đi { from, to }. */
  move?: Move;
  /** Tọa độ nước tốt hơn do AI đề xuất. */
  betterMove?: Move | null;
  /** Tọa độ nước phản đòn mạnh nhất của đối phương. */
  replyMove?: Move | null;
  /** Chuỗi nước cờ của biến tiếp diễn để đi thử trên bàn cờ. */
  pvMoves?: Move[];
  /** Biến chính của nước tốt hơn do AI đề xuất (bắt đầu bằng nước đó), để giải thích kế hoạch của nó. */
  betterPvMoves?: Move[];
  /** Đánh giá thế cờ toàn diện sau nước đi (B2). */
  assessment?: PositionAssessment | null;
  /** Các mối đe dọa từ đối phương ở thế cờ hiện tại (B3). */
  threats?: ThreatFact[];
  /** Ý đồ kỳ lý của nước đã đi (B4). */
  intent?: IntentFact | null;
  /** Ý đồ kỳ lý của nước tốt hơn do AI đề xuất (B4). */
  betterIntent?: IntentFact | null;
  /** Giai đoạn ván đấu tại nửa nước này (B6). */
  phase?: GamePhase;
  /** Kế hoạch chiến lược hiện tại của hai bên (B6). */
  plan?: Record<Side, Plan>;
  /** Sách khai cuộc và ý đồ kỳ lý nếu đang ở khai cuộc (B7). */
  openingGuide?: OpeningGuide | null;
}

export const CLASS_NAME: Record<MoveClass, string> = {
  brilliant: "Nước hay",
  only: "Nước duy nhất",
  best: "Nước tốt nhất",
  book: "Khai cuộc",
  missedWin: "Bỏ lỡ thắng",
  inaccuracy: "Thiếu chính xác",
  mistake: "Nước kém",
  blunder: "Nước hớ",
};

/** Giới hạn điểm khi so sánh để thế thắng/thua tuyệt đối (chiếu bí) không làm méo số liệu. */
const CAP = 1500;
const clamp = (v: number) => Math.max(-CAP, Math.min(CAP, v));

/** Điểm tương đương chiếu bí. */
const MATE_THRESHOLD = 90_000;

/** Hệ số logistic sigmoid hiệu chỉnh theo thang điểm Pikafish / Xiangqi (~250 cp ứng với ưu thế rõ). */
export const PIKAFISH_K = 0.004;

/**
 * Hiệu chỉnh hệ số logistic k theo dải Elo của người chơi:
 * - Elo thấp: ván đấu nhiều biến động, cần ưu thế lớn hơn để chuyển hóa thắng lợi (k nhỏ hơn).
 * - Elo cao / Kiện tướng: khai thác ưu thế cực tốt, chỉ cần hơn 150-200 cp là xác suất thắng đã áp đảo (k lớn hơn).
 */
export function getPikafishK(elo?: number): number {
  if (typeof elo !== "number" || Number.isNaN(elo)) return PIKAFISH_K;
  if (elo < 1200) return 0.0030;
  if (elo < 1500) return 0.0036;
  if (elo < 1800) return 0.0042;
  if (elo < 2100) return 0.0048;
  return 0.0055;
}

/**
 * Chuyển tỉ lệ [thắng, hòa, thua] (phần nghìn do engine tự báo qua UCI_ShowWDL) thành xác suất kỳ vọng (0.0 đến 1.0).
 * Công thức: (win + 0.5 * draw) / 1000.
 */
export function winChanceFromWdl(wdl: [number, number, number]): number {
  const [win, draw, loss] = wdl;
  const total = win + draw + loss;
  if (total <= 0) return 0.5;
  const score = (win + 0.5 * draw) / total;
  return Math.max(0, Math.min(1, score));
}

export interface WinLossThresholds {
  inaccuracy: number;
  mistake: number;
  blunder: number;
}

/** Ngưỡng khởi điểm giảm xác suất thắng để xếp loại nước đi (chỉnh được). */
export const WIN_LOSS_THRESHOLDS: WinLossThresholds = {
  inaccuracy: 0.05, // 5%
  mistake: 0.10,    // 10%
  blunder: 0.20,    // 20%
};

/**
 * Đổi điểm centipawn sang xác suất thắng (0.0 đến 1.0) theo hàm logistic sigmoid:
 * W(s) = 1 / (1 + e^(-k * s)).
 * Tham số thứ hai có thể là hệ số k (k < 1) hoặc điểm Elo (>= 100).
 */
export function winChance(score: number, kOrElo: number = PIKAFISH_K): number {
  if (score >= MATE_THRESHOLD) return 1;
  if (score <= -MATE_THRESHOLD) return 0;
  const k = kOrElo >= 100 ? getPikafishK(kOrElo) : kOrElo;
  const clamped = Math.max(-10000, Math.min(10000, score));
  return 1 / (1 + Math.exp(-k * clamped));
}

/**
 * Tính độ chính xác của một nước đi theo công thức Lichess dựa trên mức giảm xác suất thắng:
 * acc = 103.1668 * e^(-0.04354 * d) - 3.1669, với d = winDrop * 100.
 */
export function moveAccuracy(winDrop: number): number {
  const d = Math.max(0, winDrop) * 100;
  const raw = 103.1668 * Math.exp(-0.04354 * d) - 3.1669;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function classifyWinDrop(
  winDrop: number,
  thresholds: WinLossThresholds = WIN_LOSS_THRESHOLDS,
  loss?: number,
): "blunder" | "mistake" | "inaccuracy" | null {
  if (winDrop >= thresholds.blunder || (loss !== undefined && loss >= 300 && winDrop >= 0.05)) {
    return "blunder";
  }
  if (winDrop >= thresholds.mistake || (loss !== undefined && loss >= 150 && winDrop >= 0.03)) {
    return "mistake";
  }
  if (winDrop >= thresholds.inaccuracy || (loss !== undefined && loss >= 70 && winDrop >= 0.02)) {
    return "inaccuracy";
  }
  return null;
}

/** Tính chuỗi biến phản đòn tiếp theo (tối đa maxPly nước) để giải thích sâu cho người chơi. */
export function computeTacticalLine(
  after: Board,
  reply: Move | null,
  mover: Side,
  maxPly: number = 3,
): string[] {
  if (!reply) return [];
  const line: string[] = [];
  let currentBoard = after;
  let currentTurn = opponent(mover);
  let currentMove: Move | null = reply;

  while (currentMove && line.length < maxPly) {
    line.push(moveNotation(currentBoard, currentMove));
    currentBoard = play(currentBoard, currentMove);
    currentTurn = opponent(currentTurn);
    if (inCheck(currentBoard, currentTurn) && legalMoves({ board: currentBoard, turn: currentTurn }).length === 0) {
      break;
    }
    const res = findBestMove({ board: currentBoard, turn: currentTurn }, 1, () => 0, { depth: 1, timeMs: 25, noise: 0 });
    currentMove = res.move;
  }

  return line;
}

/** Tập hợp các ô cờ trọng điểm liên quan đến nước đi và nước đáp. */
export function computeHighlights(move: Move, reply: Move | null, better: Move | null): number[] {
  const set = new Set<number>();
  set.add(move.to);
  if (reply) {
    set.add(reply.from);
    set.add(reply.to);
  }
  if (better) {
    set.add(better.from);
    set.add(better.to);
  }
  return [...set];
}

export function classify(
  lossOrWinDrop: number,
  isWinDrop: boolean = false,
  thresholds: WinLossThresholds = WIN_LOSS_THRESHOLDS,
): MoveClass | null {
  if (isWinDrop || (lossOrWinDrop >= 0 && lossOrWinDrop <= 1.0)) {
    return classifyWinDrop(lossOrWinDrop, thresholds);
  }
  if (lossOrWinDrop >= 300) return "blunder";
  if (lossOrWinDrop >= 150) return "mistake";
  if (lossOrWinDrop >= 70) return "inaccuracy";
  return null;
}

export interface ReviewResult {
  moves: MoveReview[];
  accuracy: Record<Side, number | null>;
  opening?: string;
  phases?: PhaseSummary[];
  openingGuide?: OpeningGuide | null;
  planThreads?: PlanThread[];
}

/**
 * Đánh giá riêng 1 nước đi trong ván cờ.
 * Giúp LiveCoach chỉ cần tính nước mới mà không phải duyệt lại toàn bộ các nước cũ.
 */
/**
 * Nước "đáng bình": nước duy nhất/nước hay theo MultiPV, chiếu, ăn quân lớn, hoặc tạo đe dọa mới
 * lên quân lớn đối phương (không căn, hoặc bị quân rẻ hơn dọa).
 */
export function isSignificantMove(before: Board, move: Move, after: Board, cls: MoveClass | null): boolean {
  if (cls === "only" || cls === "brilliant") return true;
  const piece = before[move.from];
  if (!piece) return false;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(after, opp)) return true;
  const captured = before[move.to];
  if (captured && typeOf(captured) !== "p") return true;
  for (let sq = 0; sq < after.length; sq++) {
    const p = after[sq];
    if (!p || sideOf(p) !== opp || !"rnc".includes(typeOf(p))) continue;
    if (!attackersOf(after, sq, mover).includes(move.to) || attackersOf(before, sq, mover).includes(move.from)) continue;
    if (!isDefended(after, sq, opp) || PIECE_VALUES[typeOf(piece)] < PIECE_VALUES[typeOf(p)]) return true;
  }
  return false;
}

/**
 * Chuyên gia chỉ bình kỳ lý ở nước quan trọng: lời chê chỉ đi với nước bị chấm lỗi,
 * lời khen chỉ đi với nước không lỗi VÀ đáng bình; nước theo sách khai cuộc không gắn kỳ lý trung cuộc.
 * Trên hết, biến engine phải xác nhận điều kỳ lý nói (zhao-outcome.ts) — không có biến thì không gắn.
 */
function keepZhaoFact(f: Fact, cls: MoveClass | null, isFault: boolean, before: Board, move: Move, after: Board, outcome: MoveOutcome | null): boolean {
  if (f.kind !== "zhaoMiddlegame") return true;
  if (cls === "book") return false;
  // Ghi chú thế quân (bộ nhận diện đã lấy điểm engine nói bên nào hơn) không khen chê nước đi nên không qua RULES
  if (f.tone === "note") return true;
  if (!outcome) return false;
  if (!zhaoOutcomeAllows(f.tactic, outcome, f.side)) return false;
  if (f.tone === "critique") return isFault;
  return !isFault && isSignificantMove(before, move, after, cls);
}

/**
 * Nguyên lý tàn cuộc: lời chê chỉ đi với nước bị chấm lỗi, lời khen chỉ đi với nước không lỗi
 * (bộ nhận diện đã tự kiểm biến engine); ghi chú loại tàn cuộc không khen chê nên luôn giữ.
 */
function keepEndgameFact(f: Fact, isFault: boolean): boolean {
  if (f.kind !== "endgamePrinciple" || f.tone === "note") return true;
  return f.tone === "critique" ? isFault : !isFault;
}

/**
 * Nguyên lý khai cuộc: lời chê chỉ đi với nước bị chấm lỗi, lời khen chỉ đi với nước không lỗi
 * (bộ nhận diện đã tự kiểm biến engine); nước theo sách nếu đúng kỳ lý thì chỉ khen.
 */
function keepOpeningFact(f: Fact, cls: MoveClass | null, isFault: boolean): boolean {
  if (f.kind !== "zhaoOpening") return true;
  if (cls === "book") return f.tone !== "critique";
  return f.tone === "critique" ? isFault : !isFault;
}

/** Kết quả của nước đi theo biến engine (null khi không có điểm/biến sau nước đi). */
export function moveOutcomeFromEval(before: Board, move: Move, afterEval: PositionEval | null): MoveOutcome | null {
  if (!afterEval) return null;
  // afterEval chấm theo đối phương (bên đi tiếp theo)
  return classifyMoveOutcome(before, move, afterEval.pv, {
    scoreForMover: -afterEval.score,
    moverMates: afterEval.score <= -MATE_THRESHOLD,
    opponentMates: afterEval.score >= MATE_THRESHOLD,
  });
}

/**
 * Bỏ kỳ lý lặp lại: cùng một kỳ lý (trung cuộc hoặc tàn cuộc) cho cùng một bên trong vòng `window` nửa nước gần nhất
 * chỉ nói một lần (thế trận giữ nguyên thì bộ nhận diện khớp liên tục, nhắc lại mỗi nước thành nhiễu).
 * Ghi chú loại tàn cuộc và ghi chú thế quân trung cuộc chỉ nói một lần cho cả ván.
 */
export function suppressRepeatedZhaoFacts(reviews: MoveReview[], window = 12): void {
  const lastSeen = new Map<string, number>();
  reviews.forEach((r, i) => {
    r.facts = r.facts.filter((f) => {
      let key: string;
      let span = window;
      if (f.kind === "zhaoMiddlegame") {
        key = f.tone === "note" ? `note:${f.tactic}` : `${f.side}:${f.tactic}`;
        if (f.tone === "note") span = Infinity;
      } else if (f.kind === "endgamePrinciple") {
        key = f.tone === "note" ? `note:${f.principle}` : `${f.side}:${f.principle}`;
        if (f.tone === "note") span = Infinity;
      } else if (f.kind === "zhaoOpening") {
        key = `${f.side}:opening:${f.lesson}`;
      } else {
        return true;
      }
      const prev = lastSeen.get(key);
      if (prev !== undefined && i - prev <= span) return false;
      lastSeen.set(key, i);
      return true;
    });
  });
}

const START_BOARD = parseFen(START_FEN).board;

/**
 * Số nửa nước đã đi trước thế đầu của ván: 0 nếu ván bắt đầu từ thế khai cuộc chuẩn,
 * `null` nếu nạp từ FEN mà không biết đã đi bao nhiêu nước (khi đó không xét kỳ lý khai cuộc).
 */
function plyBeforeStart(state: GameState, startPly?: number): number | null {
  if (startPly !== undefined) return startPly;
  const first = state.history[0];
  return first.turn === "r" && first.board.every((p, k) => p === START_BOARD[k]) ? 0 : null;
}

export function reviewMove(
  m: { move: Move; side: Side; notation: string },
  i: number,
  state: GameState,
  before: PositionEval | null,
  afterEval: PositionEval | null,
  opening?: string,
  historyMovesOverride?: Move[],
  playedNotationsOverride?: string[],
  thresholds: WinLossThresholds = WIN_LOSS_THRESHOLDS,
  phases?: PhaseSummary[],
  /** Số nửa nước đã đi trước thế đầu của `state` (ván nạp từ FEN giữa ván), xem plyBeforeStart. */
  startPly?: number,
): {
  review: MoveReview;
  scoreLoss: number | null;
  winDrop: number | null;
  accuracy: number | null;
} {
  const isLast = i === state.moves.length - 1;
  let after: number | null = null;
  if (isLast && state.result?.winner === m.side && (state.result.reason === "checkmate" || state.result.reason === "stalemate")) {
    after = CAP;
  } else if (afterEval) {
    after = -clamp(afterEval.score);
  }

  const notations = playedNotationsOverride ?? state.moves.slice(0, i + 1).map((x) => x.notation);
  const phase: GamePhase = phases ? getPhaseAtPly(phases, i + 1) : (i + 1 <= 24 ? "khaiCuoc" : "trungCuoc");
  const currentPhaseSummary = phases?.find((p) => i + 1 >= p.fromPly && i + 1 <= p.toPly);
  const plan = currentPhaseSummary?.plan;
  const openingGuide =
    i + 1 <= 20 && isBookMove(notations)
      ? getOpeningGuide(notations)
      : null;

  if (!before || after === null) {
    return {
      review: {
        ply: i + 1,
        side: m.side,
        notation: m.notation,
        loss: 0,
        cls: null,
        better: null,
        facts: [],
        phase,
        plan,
        openingGuide,
      },
      scoreLoss: null,
      winDrop: null,
      accuracy: null,
    };
  }

  const beforeScore = clamp(before.score);
  const afterScore = after;
  const wBefore = before.wdl ? winChanceFromWdl(before.wdl) : winChance(beforeScore);
  const wAfter = afterEval?.wdl ? 1 - winChanceFromWdl(afterEval.wdl) : winChance(afterScore);

  const playedBest = before.best?.from === m.move.from && before.best?.to === m.move.to;
  const loss = playedBest ? 0 : Math.max(0, beforeScore - afterScore);
  const winDrop = playedBest ? 0 : Math.max(0, wBefore - wAfter);
  const accuracy = moveAccuracy(winDrop);

  let cls: MoveClass | null = null;
  if (playedBest) {
    // Xét MultiPV nếu có ít nhất 2 biến
    if (before.lines && before.lines.length >= 2) {
      const line1Score = before.lines[0]?.score ?? before.score;
      const line2Score = before.lines[1]?.score ?? -CAP;
      const wLine1 = before.lines[0]?.wdl ? winChanceFromWdl(before.lines[0].wdl) : winChance(line1Score);
      const wLine2 = before.lines[1]?.wdl ? winChanceFromWdl(before.lines[1].wdl) : winChance(line2Score);
      const deltaW12 = wLine1 - wLine2;

      // Nước duy nhất (only): nước 1 giữ được thế cờ trong khi nước 2 thua thảm bại
      if (
        wLine1 >= 0.35 &&
        (wLine2 <= 0.20 || deltaW12 >= 0.25 || line2Score <= -MATE_THRESHOLD)
      ) {
        cls = "only";
      } else if (wLine1 >= 0.50 && deltaW12 >= 0.15) {
        // Nước hay (brilliant): nước thứ hai kém hơn nhiều
        cls = "brilliant";
      }
    }

    if (!cls && i < 16 && isBookMove(notations)) {
      cls = "book";
    }
  } else {
    // Không phải nước tốt nhất
    if (i < 16 && winDrop < thresholds.inaccuracy && isBookMove(notations)) {
      cls = "book";
    } else {
      cls = classifyWinDrop(winDrop, thresholds, loss);
    }
  }

  const isFault = cls === "blunder" || cls === "mistake" || cls === "inaccuracy";
  const historyMoves = historyMovesOverride ?? state.moves.slice(0, i).map((x) => x.move);

  let line: string[] | undefined;
  if (cls) {
    if (afterEval?.pv && afterEval.pv.length > 0) {
      line = formatPvLine(state.history[i + 1].board, afterEval.pv, 3);
    } else if (afterEval?.line && afterEval.line.length > 0) {
      line = afterEval.line.slice(0, 3);
    } else if (afterEval?.best && isFault) {
      line = computeTacticalLine(state.history[i + 1].board, afterEval.best, m.side, 3);
    }
  }

  const highlights = cls ? computeHighlights(m.move, afterEval?.best ?? null, isFault ? (before.best ?? null) : null) : undefined;
  let better = isFault && before.best ? moveNotation(state.history[i].board, before.best) : null;

  // Số nửa nước tính từ đầu ván thật (undefined nếu ván nạp từ FEN mà không rõ): lỗi và kỳ lý khai cuộc dựa vào đây
  const offset = plyBeforeStart(state, startPly);
  const gamePly = offset === null ? undefined : offset + i;

  let facts: Fact[] = [];
  if (isFault) {
    facts = explainMove({
      before: state.history[i].board,
      move: m.move,
      after: state.history[i + 1].board,
      evalBefore: before,
      evalAfter: afterEval,
      loss,
      ply: gamePly,
      opening,
      historyMoves,
    });

    // Bỏ lỡ cơ hội thắng: đang thắng (W >= 75%) mà về thế cân bằng (W <= 55%)
    // Và không phải do tự nướng quân trực tiếp
    const hasDirectPieceLoss = facts.some(
      (f) =>
        f.kind === "losesPiece" &&
        (f.cause === "moved" ||
          f.cause === "ignored" ||
          f.cause === "screen" ||
          f.cause === "opened" ||
          f.cause === "unguarded")
    );
    if (wBefore >= 0.75 && wAfter <= 0.55 && winDrop >= thresholds.blunder && !hasDirectPieceLoss) {
      cls = "missedWin";
      better = before.best ? moveNotation(state.history[i].board, before.best) : null;
      facts.push({
        kind: "missedWin",
        better: better ?? undefined,
        points: Math.round(loss),
      });
    }
  }

  // 1. Ý đồ kỳ lý của nước đã đi (B4)
  let intent: IntentFact | null = null;
  if (isFault || cls !== null || i === state.moves.length - 1) {
    intent = detectIntent(state.history[i].board, m.move, state.history[i + 1].board, {
      pv: afterEval?.pv,
      evalBefore: before,
      evalAfter: afterEval,
      loss,
      ply: i,
    });
    if ((cls === "brilliant" || cls === "only") && intent && !facts.some((f) => f.kind === "intent")) {
      facts.push(intent);
    }
  }

  // Kỳ lý trung cuộc theo phong cách đại sư (B6, B7); explainText chỉ hiện khi chọn góc nhìn tương ứng
  const outcome = moveOutcomeFromEval(state.history[i].board, m.move, afterEval);
  facts.push(
    ...personaFacts(state.history[i].board, m.move, state.history[i + 1].board, {
      pv: afterEval?.pv,
      loss,
      evalBefore: before,
      evalAfter: afterEval,
      recentMoves: state.moves.slice(Math.max(0, i - 6), i).map((x) => x.move),
    }).filter((f) => keepZhaoFact(f, cls, isFault, state.history[i].board, m.move, state.history[i + 1].board, outcome)),
    // Nguyên lý tàn cuộc: hiện ở mọi góc nhìn bình luận
    ...endgamePrincipleFacts(state.history[i].board, m.move, state.history[i + 1].board, {
      pv: afterEval?.pv,
      loss,
      evalBefore: before,
      evalAfter: afterEval,
    }).filter((f) => keepEndgameFact(f, isFault)),
  );

  // Kỳ lý khai cuộc Triệu Hâm Hâm: tối đa 1 kỳ lý mỗi nước, chỉ xét ≤ 24 nửa nước đầu tính từ đầu ván thật, không trùng openingFault
  if (gamePly !== undefined && gamePly < 24) {
    const openingCandidates = detectAllOpeningTactics(state.history[i].board, m.move, state.history[i + 1].board, {
      pv: afterEval?.pv,
      loss,
      evalBefore: before,
      evalAfter: afterEval,
    }).filter((f) => keepOpeningFact(f, cls, isFault));
    const hasOpeningFault = facts.some((f) => f.kind === "openingFault");
    const chosenOpening = openingCandidates[0] ?? null;
    if (chosenOpening && !hasOpeningFault) {
      facts.push(chosenOpening);
    }
  }

  // 2. Ý đồ của nước AI đề xuất tốt hơn nếu nước đi bị chấm lỗi (B4)
  let betterIntent: IntentFact | null = null;
  if (isFault && before.best) {
    const betterNext = play(state.history[i].board, before.best);
    betterIntent = detectIntent(state.history[i].board, before.best, betterNext, {
      pv: before.pv,
      evalBefore: before,
      evalAfter: afterEval,
      loss: 0,
      ply: i,
    });
  }

  // 3. Đánh giá thế cờ toàn diện sau nước đi (B2)
  let assessment: PositionAssessment | null = null;
  if (afterEval) {
    const nextTurn = opponent(m.side);
    // afterEval.score tính theo nextTurn (bên sắp đi); quy đổi sang chiều của Đỏ (dương = Đỏ hơn, âm = Đen hơn)
    const evalRed = nextTurn === "r" ? afterEval.score : -afterEval.score;
    const winPctRed = afterEval.wdl
      ? (nextTurn === "r" ? winChanceFromWdl(afterEval.wdl) : 1 - winChanceFromWdl(afterEval.wdl)) * 100
      : winChance(evalRed) * 100;

    const isSignificant = isFault || cls === "brilliant" || cls === "only" || Math.abs(afterEval.score) >= 200 || i === state.moves.length - 1;
    if (isSignificant) {
      assessment = assessPosition(state.history[i + 1].board, {
        evalCp: evalRed,
        winPct: winPctRed,
        pv: afterEval.pv,
        turn: nextTurn,
      });
    } else {
      assessment = {
        kind: "assessment",
        leader: null,
        evalCp: evalRed,
        winPct: winPctRed,
        factors: [],
        dynamic: false,
        summary: "Cục diện giằng co cân bằng.",
      };
    }
  }

  // 4. Mối đe dọa của đối phương ở thế cờ hiện tại (B3)
  const threats: ThreatFact[] = [];
  if (afterEval?.best && (afterEval.score >= 200 || afterEval.score >= 90000)) {
    const currentThreat = detectThreat(state.history[i + 1].board, m.side, {
      threatMove: afterEval.best,
      score: afterEval.score,
      isMate: afterEval.score >= 90000,
      pv: afterEval.pv ?? [afterEval.best],
      opponent: opponent(m.side),
    });
    if (currentThreat) threats.push(currentThreat);
  } else if (!afterEval && isFault) {
    const currentThreat = detectThreat(state.history[i + 1].board, m.side);
    if (currentThreat) threats.push(currentThreat);
  }

  const replyMove = afterEval?.best ?? afterEval?.pv?.[0] ?? null;
  const betterMove = before.best ?? null;
  const pvMoves = afterEval?.pv ?? (afterEval?.best ? [afterEval.best] : undefined);

  const review: MoveReview = {
    ply: i + 1,
    side: m.side,
    notation: m.notation,
    loss: Math.round(loss),
    cls,
    better,
    facts,
    line,
    highlights,
    winBefore: Math.round(wBefore * 1000) / 1000,
    winAfter: Math.round(wAfter * 1000) / 1000,
    winDrop: Math.round(winDrop * 1000) / 1000,
    move: m.move,
    betterMove: isFault ? betterMove : null,
    replyMove: isFault ? replyMove : null,
    pvMoves,
    betterPvMoves: isFault && betterMove ? (before.pv?.length ? before.pv : [betterMove]) : undefined,
    assessment,
    threats,
    intent,
    betterIntent,
    phase,
    plan,
    openingGuide,
  };

  return { review, scoreLoss: loss, winDrop, accuracy };
}

/**
 * `evals[i]` là điểm của thế cờ thứ i (sau i nửa nước), `null` nếu chưa/không phân tích.
 * Đánh giá toàn bộ ván cờ theo xác suất thắng logistic và tính độ chính xác Lichess.
 */
export function reviewGame(state: GameState, evals: (PositionEval | null)[]): ReviewResult {
  const reviews: MoveReview[] = [];
  const acc: Record<Side, number[]> = { r: [], b: [] };
  const allNotations = state.moves.map((x) => x.notation);
  const opening = detectOpeningFromMoves(allNotations);
  const allMoves = state.moves.map((x) => x.move);

  // Tính xác suất thắng cho từng ply để phân chia giai đoạn chuẩn xác
  const winChances = evals.map((ev, plyIdx) => {
    if (!ev) return 0.5;
    if (ev.wdl) {
      const pTurn = plyIdx % 2 === 0 ? "r" : "b";
      const w = winChanceFromWdl(ev.wdl);
      return pTurn === "r" ? w : 1 - w;
    }
    const pTurn = plyIdx % 2 === 0 ? "r" : "b";
    const scoreRed = pTurn === "r" ? ev.score : -ev.score;
    return winChance(scoreRed);
  });

  const phases = detectPhases(state, { evaluations: evals, winChances });
  const gameOpeningNotations = allNotations.slice(0, Math.min(allNotations.length, 16));
  const openingGuide = getOpeningGuide(gameOpeningNotations);

  state.moves.forEach((m, i) => {
    const historyMoves = allMoves.slice(0, i);
    const playedNotations = allNotations.slice(0, i + 1);
    const { review, accuracy } = reviewMove(
      m,
      i,
      state,
      evals[i],
      evals[i + 1],
      opening,
      historyMoves,
      playedNotations,
      WIN_LOSS_THRESHOLDS,
      phases,
    );
    reviews.push(review);
    if (accuracy !== null) {
      acc[m.side].push(accuracy);
    }
  });

  suppressRepeatedZhaoFacts(reviews);

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const planThreads = trackPlanThreads(state.moves, state.history.map((h) => h.board), evals);
  return {
    moves: reviews,
    accuracy: { r: avg(acc.r), b: avg(acc.b) },
    opening,
    phases,
    openingGuide,
    planThreads,
  };
}

  export interface TurningPoint {
    ply: number;
    side: Side;
    notation: string;
    cls: MoveClass | null;
    winDrop: number;
    description: string;
  }

  /**
   * Tóm tắt tối đa `limit` khoảnh khắc bước ngoặt quan trọng nhất của ván cờ,
   * sắp xếp theo tiến trình thời gian ván cờ (ply tăng dần).
   */
  export function findTurningPoints(moves: MoveReview[], limit: number = 3): TurningPoint[] {
    const candidates: { review: MoveReview; score: number }[] = [];

    for (const m of moves) {
      const drop = m.winDrop ?? 0;
      if (drop < 0.05 && m.cls !== "brilliant" && m.cls !== "only") continue;

      let score = drop * 100;
      if (m.cls === "blunder") score += 15;
      else if (m.cls === "missedWin") score += 20;
      else if (m.cls === "brilliant") score += 22;
      else if (m.cls === "mistake") score += 8;

      // Nếu thế trận đổi bên dẫn trước
      if (m.winBefore !== undefined && m.winAfter !== undefined) {
        if ((m.winBefore > 0.55 && m.winAfter < 0.45) || (m.winBefore < 0.45 && m.winAfter > 0.55)) {
          score += 25;
        }
      }

      candidates.push({ review: m, score });
    }

    // Sắp xếp theo độ biến động giảm dần để chọn các bước ngoặt lớn nhất
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates.slice(0, limit).map((c) => c.review);

    // Sắp xếp lại theo thứ tự thời gian (ply tăng dần)
    selected.sort((a, b) => a.ply - b.ply);

    return selected.map((m) => {
      let description = "Bước ngoặt làm thay đổi cục diện ván cờ";
      const dropPct = Math.round((m.winDrop ?? 0) * 100);
      if (m.cls === "missedWin") {
        description = "Bỏ lỡ cơ hội thắng rõ rệt, thế cờ rơi về cân bằng";
      } else if (m.cls === "blunder") {
        description = `Nước hớ nghiêm trọng, làm giảm ${dropPct}% xác suất thắng`;
      } else if (m.cls === "mistake") {
        description = `Nước kém khiến thế trận bị suy giảm ${dropPct}%`;
      } else if (m.cls === "brilliant") {
        description = "Nước cờ xuất thần tạo đột phá chiến lược";
      } else if (m.cls === "only") {
        description = "Nước duy nhất giữ vững thế trận";
      }
      return {
        ply: m.ply,
        side: m.side,
        notation: m.notation,
        cls: m.cls,
        winDrop: m.winDrop ?? 0,
        description,
      };
    });
  }
