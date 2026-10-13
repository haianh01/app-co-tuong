import { findBestMove } from "./ai";
import { inCheck, legalMoves, opponent, type Board, type Move, type Side } from "./engine";
import { explainMove, type Fact } from "./explain";
import type { GameState } from "./game";
import { moveNotation } from "./notation";
import { isBookMove, openingOf, detectOpeningFromMoves } from "./openings";
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

function play(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
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
}

/**
 * Đánh giá riêng 1 nước đi trong ván cờ.
 * Giúp LiveCoach chỉ cần tính nước mới mà không phải duyệt lại toàn bộ các nước cũ.
 */
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

  if (!before || after === null) {
    return {
      review: { ply: i + 1, side: m.side, notation: m.notation, loss: 0, cls: null, better: null, facts: [] },
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

  const notations = playedNotationsOverride ?? state.moves.slice(0, i + 1).map((x) => x.notation);

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

  let facts: Fact[] = [];
  if (isFault) {
    facts = explainMove({
      before: state.history[i].board,
      move: m.move,
      after: state.history[i + 1].board,
      evalBefore: before,
      evalAfter: afterEval,
      loss,
      ply: i,
      opening,
      historyMoves,
    });

    // Bỏ lỡ cơ hội thắng: đang thắng (W >= 75%) mà về thế cân bằng (W <= 55%)
    // Và không phải do tự nướng quân trực tiếp (losesPiece với cause moved/ignored/screen/opened/unguarded)
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
      );
      reviews.push(review);
      if (accuracy !== null) {
        acc[m.side].push(accuracy);
      }
    });

    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return { moves: reviews, accuracy: { r: avg(acc.r), b: avg(acc.b) }, opening };
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
