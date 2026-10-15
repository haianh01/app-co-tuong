// Đổi nước dọa thành dữ kiện kỳ lý (B3):
// - Trích xuất đòn đe dọa từ thế cờ và chuỗi biến chính (PV) của đối phương khi bỏ lượt (null-move).
// - Nhận diện lỗi bỏ qua đòn đe dọa (ignoredThreat).
// - Nhận diện nước cờ tốt hóa giải đòn đe dọa (parried).
// Hoạt động thuần hàm, tất định (deterministic), không gọi engine bên trong.

import {
  type Board, type Move, type Side,
  inCheck, opponent, sideOf, findKing,
} from "./engine";
import { ref, type PieceRef } from "./explain";
import { narratePv, type MaterialDelta } from "./narrate";
import { moveNotation } from "./notation";
import { findBestMove } from "./ai";

/** Ngưỡng điểm tối thiểu để một nước đi được coi là "đòn đe dọa" (tránh nhiễu). */
export const THREAT_GAIN_THRESHOLD = 200;

export interface ThreatData {
  /** Nước cờ đối phương đang đe dọa đi. */
  threatMove: Move | null;
  /** Điểm của bên đe dọa (dương = đối phương có đòn đánh nguy hiểm). */
  score: number;
  /** Chuỗi biến đối phương khai thác nếu được đi tiếp. */
  pv: Move[];
  /** Có phải đòn đe dọa chiếu bí trực tiếp hay không. */
  isMate: boolean;
  /** Bên đang đe dọa ('r' hoặc 'b'). */
  opponent: Side;
  /** Bên bị đe dọa hiện đang bị chiếu sẵn hay không. */
  inCheck?: boolean;
  /**
   * Điểm của bên đe dọa khi KHÔNG được đi thêm (= -điểm của bên đang đi). Có giá trị này thì đòn dọa
   * được đo bằng mức tăng `score - baseScore`; thiếu thì dùng `score` tuyệt đối như cũ — khi đó bên
   * vốn đã hơn ≥ 2 Tốt sẽ luôn bị coi là "đang dọa".
   */
  baseScore?: number;
}

/** Mức lợi mà đòn dọa mang lại cho bên đe dọa so với khi không được đi thêm. */
export function threatGain(t: ThreatData): number {
  return t.baseScore !== undefined ? t.score - t.baseScore : t.score;
}

export interface ThreatFact {
  kind: "threat";
  by: Side;
  /** Ký hiệu nước dọa theo chuẩn Việt Nam (vd: "P2-5", "X1.1"). */
  move: string;
  isMate: boolean;
  /** Chênh lệch vật chất nếu đòn dọa thành công. */
  gain: MaterialDelta;
  /** Các quân cờ đối phương đang nhắm tới đe dọa hoặc ăn. */
  targets: PieceRef[];
  /** Chuỗi biến nước dọa dạng ký hiệu Việt Nam. */
  line: string[];
  /** Lời tóm tắt dữ kiện đe dọa. */
  summary?: string;
}

export interface IgnoredThreatFact {
  kind: "ignoredThreat";
  /** Nước dọa có sẵn của đối phương. */
  threat: string;
  /** Nước đối phương khai thác sau đó. */
  reply: string;
  /** Số điểm thiệt hại theo AI. */
  points: number;
  summary?: string;
}

export interface ParriedFact {
  kind: "parried";
  /** Đòn dọa đối phương từng có. */
  threat: string;
  /** Nước đi đã hóa giải thành công. */
  played: string;
  summary?: string;
}

export interface ThreatMoveContext {
  before: Board;
  move: Move;
  after: Board;
  loss?: number;
  evalBefore?: { score: number; best: Move | null; pv?: Move[] } | null;
  evalAfter?: { score: number; best: Move | null; pv?: Move[] } | null;
  threatBefore?: ThreatData | null;
  threatAfter?: ThreatData | null;
}

/**
 * Trích xuất đòn đe dọa tại một thế cờ đối với bên `sideBeingThreatened`.
 *
 * @param board Bàn cờ hiện tại.
 * @param sideBeingThreatened Bên đang bị đe dọa (bên có lượt đi tiếp theo).
 * @param threatData Dữ liệu engine tính toán đòn đe dọa (tùy chọn, ưu tiên nếu có).
 */
export function detectThreat(
  board: Board,
  sideBeingThreatened: Side,
  threatData?: ThreatData | null,
): ThreatFact | null {
  const opp = opponent(sideBeingThreatened);

  // 1. Nếu có dữ liệu từ engine (ThreatResult)
  if (threatData !== undefined && threatData !== null) {
    if (threatData.inCheck) return null;
    if (!threatData.threatMove) return null;
    if (!threatData.isMate && threatGain(threatData) < THREAT_GAIN_THRESHOLD) return null;

    const by = threatData.opponent ?? opp;
    const pv = threatData.pv && threatData.pv.length > 0 ? threatData.pv : [threatData.threatMove];
    const narration = narratePv(board, by, pv);
    const moveStr = moveNotation(board, threatData.threatMove);
    const lineStr = narration.moves.map((m) => m.notation);

    const targetList: PieceRef[] = [];
    const targetSqSet = new Set<number>();

    if (threatData.isMate) {
      const kSq = findKing(board, sideBeingThreatened);
      if (kSq >= 0) {
        targetSqSet.add(kSq);
        targetList.push(ref(board, kSq));
      }
    }

    if (narration.moves.length > 0) {
      const m0 = narration.moves[0];
      if (m0.captured && !targetSqSet.has(m0.captured.square)) {
        targetSqSet.add(m0.captured.square);
        targetList.push(m0.captured);
      }
      for (const t of m0.threats) {
        if (!targetSqSet.has(t.square)) {
          targetSqSet.add(t.square);
          targetList.push(t);
        }
      }
    }

    const byText = by === "r" ? "Đỏ" : "Đen";
    let summary: string;
    if (threatData.isMate) {
      summary = `${byText} dọa ${moveStr} dẫn tới sát cục`;
    } else if (narration.summary && narration.summary !== "không có nước tiếp diễn") {
      summary = `${byText} dọa ${moveStr}, ${narration.summary}`;
    } else {
      summary = `${byText} dọa ${moveStr}`;
    }

    return {
      kind: "threat",
      by,
      move: moveStr,
      isMate: threatData.isMate,
      gain: narration.delta,
      targets: targetList,
      line: lineStr,
      summary,
    };
  }

  // 2. Dự phòng ngoại tuyến (không có engine): chạy null-move tìm nước mạnh nhất của đối phương
  if (inCheck(board, sideBeingThreatened)) return null;

  const res = findBestMove({ board, turn: opp }, 2, () => 0, { depth: 2, timeMs: 25, noise: 0 });
  if (!res.move) return null;

  const isMate = res.score >= 99000;
  if (!isMate && res.score < THREAT_GAIN_THRESHOLD) return null;

  const pv = [res.move];
  const narration = narratePv(board, opp, pv);
  const moveStr = moveNotation(board, res.move);
  const lineStr = narration.moves.map((m) => m.notation);

  const targetList: PieceRef[] = [];
  const targetSqSet = new Set<number>();

  if (isMate) {
    const kSq = findKing(board, sideBeingThreatened);
    if (kSq >= 0) {
      targetSqSet.add(kSq);
      targetList.push(ref(board, kSq));
    }
  }

  if (narration.moves.length > 0) {
    const m0 = narration.moves[0];
    if (m0.captured && !targetSqSet.has(m0.captured.square)) {
      targetSqSet.add(m0.captured.square);
      targetList.push(m0.captured);
    }
    for (const t of m0.threats) {
      if (!targetSqSet.has(t.square)) {
        targetSqSet.add(t.square);
        targetList.push(t);
      }
    }
  }

  const byText = opp === "r" ? "Đỏ" : "Đen";
  let summary: string;
  if (isMate) {
    summary = `${byText} dọa ${moveStr} dẫn tới sát cục`;
  } else if (narration.summary && narration.summary !== "không có nước tiếp diễn") {
    summary = `${byText} dọa ${moveStr}, ${narration.summary}`;
  } else {
    summary = `${byText} dọa ${moveStr}`;
  }

  return {
    kind: "threat",
    by: opp,
    move: moveStr,
    isMate,
    gain: narration.delta,
    targets: targetList,
    line: lineStr,
    summary,
  };
}

/**
 * Phân tích tương tác giữa nước đi vừa thực hiện và đòn đe dọa của đối phương:
 * - Trả về `ignoredThreat` nếu bỏ qua đòn đe dọa và bị trừng phạt.
 * - Trả về `parried` nếu nước đi hóa giải thành công đòn đe dọa.
 */
export function detectThreatMoveFacts(
  ctx: ThreatMoveContext,
): (IgnoredThreatFact | ParriedFact)[] {
  // Chỉ phân tích tương tác khi có dữ liệu đòn đe dọa được truyền từ engine/bên ngoài
  if (!ctx.threatBefore) return [];

  const { before, move, after } = ctx;
  const mover = sideOf(before[move.from]!);
  const tBefore = detectThreat(before, mover, ctx.threatBefore);

  if (!tBefore) return [];

  const loss = ctx.loss ?? 0;

  // 1. Kiểm tra bỏ qua đòn đe dọa (ignoredThreat)
  // Xảy ra khi nước đi bị đánh giá lỗi (loss >= 80) hoặc để lọt sát cục
  const isLossSignificant = loss >= 80 || (tBefore.isMate && loss >= 40);
  if (isLossSignificant) {
    const reply = ctx.evalAfter?.best ?? null;
    const replyStr = reply ? moveNotation(after, reply) : tBefore.move;
    return [
      {
        kind: "ignoredThreat",
        threat: tBefore.move,
        reply: replyStr,
        points: Math.round(loss > 0 ? loss : tBefore.gain.scoreDiff || 200),
        summary: `Nước đi bỏ qua đòn đe dọa ${tBefore.move} của đối phương, để đối phương đi ${replyStr}.`,
      },
    ];
  }

  // 2. Kiểm tra hóa giải đòn đe dọa (parried)
  // Xảy ra khi nước đi chuẩn xác (loss <= 50) và đòn đe dọa không còn tồn tại hoặc bị triệt tiêu
  if (loss <= 50) {
    let threatStillExists = false;

    // threatAfter chỉ dùng được khi nó là đòn của chính bên đã dọa trước đó (không phải đòn của bên vừa đi)
    const lingering = ctx.threatAfter && ctx.threatAfter.opponent === opponent(mover) ? ctx.threatAfter : null;
    if (lingering) {
      threatStillExists = lingering.isMate || threatGain(lingering) >= THREAT_GAIN_THRESHOLD;
    } else {
      const tAfter = detectThreat(after, mover);
      if (tAfter) {
        // Nếu trước đó dọa sát cục mà giờ hết dọa sát cục -> đã hóa giải
        if (tBefore.isMate && !tAfter.isMate) {
          threatStillExists = false;
        } else if (tAfter.gain.scoreDiff >= THREAT_GAIN_THRESHOLD) {
          threatStillExists = true;
        }
      }
    }

    if (!threatStillExists) {
      return [
        {
          kind: "parried",
          threat: tBefore.move,
          played: moveNotation(before, move),
          summary: `Nước ${moveNotation(before, move)} kịp thời hóa giải đòn đe dọa ${tBefore.move} của đối phương.`,
        },
      ];
    }
  }

  return [];
}
