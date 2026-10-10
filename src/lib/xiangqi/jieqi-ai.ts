// Máy chơi cờ úp. Máy chỉ nhìn thấy bàn cờ công khai (quân úp là "H"/"h") — không đọc trộm bố cục bí mật.
// Quân úp được tính theo giá trị trung bình của các quân chưa lộ; quân úp máy "đi thử" trong lúc tính
// coi như chưa rõ cách đi. Tìm kiếm alpha-beta nông với nước giả hợp lệ: nước nào để mất tướng bị loại.

import { rowOf, sideOf, typeOf, type Board, type Move, type Position, type Side } from "./engine";
import { isHidden, jieqiApply, jieqiInCheck, jieqiLegalMoves, jieqiPseudoMoves } from "./jieqi";

export type JieqiLevel = 1 | 2 | 3;

export const JIEQI_LEVELS: { level: JieqiLevel; name: string }[] = [
  { level: 1, name: "Dễ" },
  { level: 2, name: "Vừa" },
  { level: 3, name: "Khó" },
];

const VALUE: Record<string, number> = { k: 0, r: 900, c: 450, n: 400, b: 200, a: 200, p: 100 };
/** Trung bình 15 quân úp: (2 xe + 2 pháo + 2 mã + 2 tượng + 2 sĩ + 5 tốt) / 15 ≈ 330. */
const HIDDEN_VALUE = 330;
const MATE = 100_000;

function pieceValue(p: string, i: number): number {
  if (isHidden(p)) return HIDDEN_VALUE;
  const t = typeOf(p);
  if (t === "p") {
    const crossed = sideOf(p) === "r" ? rowOf(i) <= 4 : rowOf(i) >= 5;
    return crossed ? 200 : 100;
  }
  return VALUE[t];
}

/** Điểm thế cờ theo góc nhìn bên đang đi. */
export function evaluateJieqi(board: Board, side: Side): number {
  let score = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (!p) continue;
    const v = pieceValue(p, i);
    score += sideOf(p) === side ? v : -v;
  }
  return score;
}

function pseudoAll(pos: Position): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < 90; i++) {
    const p = pos.board[i];
    if (!p || sideOf(p) !== pos.turn) continue;
    for (const to of jieqiPseudoMoves(pos.board, i)) out.push({ from: i, to });
  }
  // Ăn quân giá trị cao trước để cắt tỉa tốt hơn.
  return out.sort((a, b) => captureGain(pos.board, b) - captureGain(pos.board, a));
}

const captureGain = (board: Board, m: Move) => (board[m.to] ? pieceValue(board[m.to]!, m.to) * 10 - pieceValue(board[m.from]!, m.from) : 0);

function search(pos: Position, depth: number, alpha: number, beta: number, budget: { nodes: number }): number {
  budget.nodes--;
  if (depth === 0 || budget.nodes <= 0) return evaluateJieqi(pos.board, pos.turn);
  let best = -Infinity;
  for (const m of pseudoAll(pos)) {
    if (pos.board[m.to] && typeOf(pos.board[m.to]!) === "k") return MATE; // ăn được tướng: nước trước đó không hợp lệ
    const next = jieqiApply(pos, m);
    if (jieqiInCheck(next.board, pos.turn)) continue;
    const score = -search(next, depth - 1, -beta, -alpha, budget);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  if (best === -Infinity) return -MATE; // hết nước đi hợp lệ: thua
  return best;
}

/** Chọn nước cho bên đang đi. `random` để cấp thấp đi "người" hơn (thỉnh thoảng không chọn nước tốt nhất). */
export function findJieqiMove(pos: Position, level: JieqiLevel, random: () => number = Math.random): Move | null {
  const moves = jieqiLegalMoves(pos);
  if (!moves.length) return null;
  const depth = level === 1 ? 1 : 2;
  const noise = level === 1 ? 250 : level === 2 ? 60 : 0;
  const budget = { nodes: level === 3 ? 60_000 : 20_000 };
  let best: Move = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const next = jieqiApply(pos, m);
    let score = -search(next, depth - 1 + (level === 3 ? 1 : 0), -Infinity, Infinity, budget);
    // Lật quân sớm có lợi: biết thêm thông tin và mở đường cho quân lớn.
    if (isHidden(pos.board[m.from])) score += 15;
    score += (random() - 0.5) * noise;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

