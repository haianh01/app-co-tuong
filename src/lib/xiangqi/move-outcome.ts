// Kết quả cụ thể của một nước đi, đọc từ biến chính (PV) của engine: đổi quân, ăn sạch, phế, thắng quân, chiếu bí...
// Dùng để kiểm chứng kỳ lý: chỉ gắn kỳ lý khi chuyện thật sự xảy ra trong biến khớp với điều bài giảng mô tả
// (vd. "Vây Pháo" thì PV phải ăn được Pháo; "Phế quân" thì phải mất quân ngay rồi được bù).
// Thuần hàm, tất định, không gọi engine.

import { opponent, play, sideOf, typeOf, PIECE_VALUES, type Board, type Move, type PieceType, type Side } from "./engine";

export type MoveOutcomeKind =
  /** Ăn quân rồi bị ăn lại, vật chất về xấp xỉ như cũ. */
  | "exchange"
  /** Ăn quân và giữ được đến cuối biến. */
  | "cleanCapture"
  /** Không ăn ngay nhưng trong biến thắng được vật chất (dọa, bắt quân, đòn phối hợp). */
  | "winsMaterial"
  /** Mất vật chất ngay sau nước đi nhưng được bù: chiếu bí, lấy lại quân, hoặc engine vẫn chấm tốt. */
  | "sacrifice"
  /** Bên đi chiếu bí được theo biến. */
  | "mate"
  /** Mất vật chất mà không được bù. */
  | "losesMaterial"
  /** Không có thay đổi vật chất đáng kể trong biến. */
  | "quiet"
  /** Biến quá ngắn để kết luận. */
  | "unclear";

export interface PvCapture {
  /** Nửa nước thứ mấy tính từ nước vừa đi (0 = chính nước đi). */
  ply: number;
  by: Side;
  type: PieceType;
  /** Ô ban đầu (trước nước đi) của quân bị ăn — để biết đúng con nào bị ăn. */
  origin: number;
}

export interface MoveOutcome {
  kind: MoveOutcomeKind;
  /** Chênh lệch vật chất (theo bên đi) ngay sau nước đi. */
  materialNow: number;
  /** Chênh lệch vật chất sau nước đáp của đối phương. */
  materialAfterReply: number;
  /** Chênh lệch vật chất khi biến đã lắng (hết chuỗi ăn qua ăn lại). */
  materialSettled: number;
  /** Số nửa nước của biến (tính cả nước vừa đi) đã dùng để kết luận. */
  plies: number;
  captures: PvCapture[];
}

export interface MoveOutcomeOptions {
  /** Điểm engine theo bên đi sau nước đi (centipawn, chiếu bí quy đổi lớn). */
  scoreForMover?: number;
  /** Bên đi chiếu bí được theo engine. */
  moverMates?: boolean;
  /** Đối phương chiếu bí được bên đi theo engine (nước đi dẫn tới bị chiếu bí). */
  opponentMates?: boolean;
  /** Số nửa nước tối thiểu của biến (tính cả nước vừa đi) để kết luận. */
  minPlies?: number;
  /** Số nửa nước tối đa xét. */
  horizon?: number;
}

const value = (t: PieceType) => (t === "k" ? 0 : PIECE_VALUES[t]);
/** Dưới ngưỡng này coi như không đổi vật chất (một Tốt). */
const EVEN = 150;

/**
 * Đọc kết quả của `move` (bên đi = chủ quân ở ô xuất phát) theo `pv` — biến chính cho thế SAU nước đi,
 * bắt đầu bằng nước đáp của đối phương.
 */
export function classifyMoveOutcome(before: Board, move: Move, pv: Move[] | undefined, options: MoveOutcomeOptions = {}): MoveOutcome {
  const piece = before[move.from];
  const mover = piece ? sideOf(piece) : "r";
  const horizon = options.horizon ?? 12;
  const minPlies = options.minPlies ?? 4;

  // Theo dõi danh tính quân: ô hiện tại -> ô ban đầu
  const origin = new Map<number, number>();
  for (let i = 0; i < before.length; i++) if (before[i]) origin.set(i, i);

  const line = [move, ...(pv ?? [])].slice(0, horizon);
  const captures: PvCapture[] = [];
  const material: number[] = [];
  let board = before;
  let balance = 0;
  let plies = 0;
  for (const [ply, m] of line.entries()) {
    const p = board[m.from];
    if (!p) break;
    const victim = board[m.to];
    if (victim) {
      const by = sideOf(p);
      captures.push({ ply, by, type: typeOf(victim), origin: origin.get(m.to) ?? m.to });
      balance += (by === mover ? 1 : -1) * value(typeOf(victim));
    }
    origin.set(m.to, origin.get(m.from) ?? m.from);
    origin.delete(m.from);
    board = play(board, m);
    material.push(balance);
    plies++;
  }

  // Biến đã lắng: lấy điểm cuối cùng mà hai nửa nước liền trước không có ăn quân (hết chuỗi đổi quân).
  let settledAt = plies - 1;
  for (let i = plies - 1; i >= 2; i--) {
    const quiet = !captures.some((c) => c.ply === i || c.ply === i - 1);
    if (quiet) {
      settledAt = i;
      break;
    }
  }
  const materialNow = material[0] ?? 0;
  const materialAfterReply = material[1] ?? materialNow;
  const materialSettled = material[Math.max(0, settledAt)] ?? materialNow;
  const base = { materialNow, materialAfterReply, materialSettled, plies, captures };

  if (options.moverMates) return { kind: "mate", ...base };
  if (options.opponentMates) return { kind: "losesMaterial", ...base };
  if (plies < minPlies) return { kind: "unclear", ...base };

  const anyCapture = captures.length > 0;
  const score = options.scoreForMover;
  if (materialNow > 0) {
    // Giữ được gần hết số vừa ăn (kể cả chỉ một Tốt) là ăn sạch; trả lại về xấp xỉ 0 là đổi quân.
    if (materialSettled >= materialNow - 50) return { kind: "cleanCapture", ...base };
    if (Math.abs(materialSettled) < EVEN) return { kind: "exchange", ...base };
  }
  if (materialAfterReply <= -EVEN || materialNow < 0) {
    // Mất quân ngay: phế nếu được bù (lấy lại quân, hoặc engine vẫn chấm không xấu)
    const compensated = materialSettled > -EVEN || (score !== undefined && score >= -50);
    return { kind: compensated ? "sacrifice" : "losesMaterial", ...base };
  }
  if (materialSettled >= 2 * EVEN) return { kind: "winsMaterial", ...base };
  if (materialSettled <= -2 * EVEN) return { kind: "losesMaterial", ...base };
  if (anyCapture && Math.abs(materialSettled) < EVEN) return { kind: "exchange", ...base };
  return { kind: "quiet", ...base };
}

/** Bên đi có ăn được quân loại `types` của đối phương trong biến (kể cả chính nước đi). */
export function moverCaptured(o: MoveOutcome, mover: Side, types: string, withinPly = 99): boolean {
  return o.captures.some((c) => c.by === mover && types.includes(c.type) && c.ply <= withinPly);
}

/** Đối phương có ăn được quân loại `types` của bên đi trong biến. */
export function opponentCaptured(o: MoveOutcome, mover: Side, types: string, withinPly = 99): boolean {
  const opp = opponent(mover);
  return o.captures.some((c) => c.by === opp && types.includes(c.type) && c.ply <= withinPly);
}

/** Số quân loại `types` mà bên `by` ăn được trong biến. */
export function countCaptured(o: MoveOutcome, by: Side, types: string): number {
  return o.captures.filter((c) => c.by === by && types.includes(c.type)).length;
}
