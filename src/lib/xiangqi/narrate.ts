// Bộ "kể biến" (PV narration): biến một chuỗi nước PV thành diễn biến có nghĩa.
// Với mỗi nửa nước: ghi lại có ăn quân không, có chiếu không, có dọa ăn quân không.
// Cuối chuỗi: tính chênh lệch quân giữa hai phe và tóm tắt thành dữ kiện tự nhiên.
// Ví dụ: "sau X1.1, M2.3, X1-2 thì Đen hơn một Xe".

import {
  Board, Move, PieceType, Side,
  inCheck, isAttacked, isDefended, opponent, sideOf, typeOf, legalMoves,
} from "./engine";
import { exchangeGain, ref, type PieceRef } from "./explain";
import { PIECE_NAME, moveNotation } from "./notation";

/** Giá trị quy đổi quân (khớp với explain.ts). */
export const PIECE_VALUES: Record<PieceType, number> = {
  k: 10_000,
  r: 900,
  c: 450,
  n: 400,
  b: 200,
  a: 200,
  p: 100,
};

export interface PlyNarration {
  /** Thứ tự nửa nước (1, 2, 3...) */
  ply: number;
  /** Phe đi */
  side: Side;
  /** Nước đi */
  move: Move;
  /** Ký hiệu nước đi (vd: "P8-5", "X1.1") */
  notation: string;
  /** Quân đi */
  piece: PieceRef;
  /** Quân bị ăn (null nếu nước không ăn quân) */
  captured: PieceRef | null;
  /** Nước đi có chiếu tướng không */
  isCheck: boolean;
  /** Các quân đối phương bị đe dọa (bị tấn công mà không có bảo vệ hoặc đổi có lời) */
  threats: PieceRef[];
}

export interface MaterialDelta {
  /** Phe chiếm ưu thế quân số (null nếu cân bằng) */
  advantageSide: Side | null;
  /** Số điểm chênh lệch tuyệt đối (>= 0) */
  scoreDiff: number;
  /** Số lượng từng loại quân chênh lệch của bên ưu thế */
  diffPieces: Partial<Record<PieceType, number>>;
  /** Lời diễn giải ngắn gọn (vd: "Đen hơn một Xe", "Đỏ hơn một Mã và một Tốt", "cân bằng quân") */
  text: string;
}

export interface PvNarration {
  /** Diễn biến chi tiết từng nửa nước */
  moves: PlyNarration[];
  /** Bàn cờ trước khi bắt đầu chuỗi */
  startBoard: Board;
  /** Bàn cờ sau khi hoàn thành chuỗi */
  endBoard: Board;
  /** Chênh lệch quân số sau chuỗi biến */
  delta: MaterialDelta;
  /** Chuỗi có dẫn tới chiếu bí không */
  isMate: boolean;
  /** Phe thắng chiếu bí (nếu isMate = true) */
  mateWinner?: Side;
  /** Câu tóm tắt diễn biến (vd: "sau X1.1, M2.3, X1-2 thì Đen hơn một Xe") */
  summary: string;
}

const NUMBER_WORDS: Record<number, string> = {
  1: "một",
  2: "hai",
  3: "ba",
  4: "bốn",
  5: "năm",
};

/** Đếm số lượng từng loại quân của một phe trên bàn cờ. */
export function countPieces(board: Board, side: Side): Record<PieceType, number> {
  const counts: Record<PieceType, number> = { k: 0, r: 0, c: 0, n: 0, b: 0, a: 0, p: 0 };
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && sideOf(p) === side) {
      counts[typeOf(p)]++;
    }
  }
  return counts;
}

/** Chuyển số lượng quân thành cụm từ tiếng Việt (vd: "một Xe", "hai Tốt", "một Pháo và một Mã"). */
export function formatPieceCount(pieces: Partial<Record<PieceType, number>>): string {
  const order: PieceType[] = ["r", "c", "n", "p", "a", "b"];
  const parts: string[] = [];
  for (const t of order) {
    const qty = pieces[t] ?? 0;
    if (qty > 0) {
      const numStr = NUMBER_WORDS[qty] ?? String(qty);
      const name = PIECE_NAME[t] ?? "quân";
      parts.push(`${numStr} ${name}`);
    }
  }
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} và ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} và ${parts[parts.length - 1]}`;
}

const sideLabel = (s: Side) => (s === "r" ? "Đỏ" : "Đen");

/**
 * Tính toán chênh lệch quân số thực tế giữa hai bàn cờ (ban đầu và kết thúc).
 */
export function describeMaterialDelta(startBoard: Board, endBoard: Board): MaterialDelta {
  const startR = countPieces(startBoard, "r");
  const endR = countPieces(endBoard, "r");
  const startB = countPieces(startBoard, "b");
  const endB = countPieces(endBoard, "b");

  // Số quân ròng Đỏ thu được so với Đen:
  // lostBlack = startB - endB
  // lostRed   = startR - endR
  // netRed = lostBlack - lostRed
  const netRed: Record<PieceType, number> = { k: 0, r: 0, c: 0, n: 0, b: 0, a: 0, p: 0 };
  let netScore = 0;

  const types: PieceType[] = ["r", "c", "n", "p", "a", "b"];
  for (const t of types) {
    const lostBlack = startB[t] - endB[t];
    const lostRed = startR[t] - endR[t];
    const diff = lostBlack - lostRed;
    netRed[t] = diff;
    netScore += diff * PIECE_VALUES[t];
  }

  if (netScore === 0) {
    const hasAnyLoss = types.some((t) => startR[t] !== endR[t] || startB[t] !== endB[t]);
    return {
      advantageSide: null,
      scoreDiff: 0,
      diffPieces: {},
      text: hasAnyLoss ? "đổi quân cân bằng" : "cân bằng quân",
    };
  }

  const advSide: Side = netScore > 0 ? "r" : "b";
  const absScore = Math.abs(netScore);
  const factor = advSide === "r" ? 1 : -1;

  const gains: Partial<Record<PieceType, number>> = {};
  const losses: Partial<Record<PieceType, number>> = {};

  for (const t of types) {
    const val = netRed[t] * factor;
    if (val > 0) gains[t] = val;
    else if (val < 0) losses[t] = -val;
  }

  const gainStr = formatPieceCount(gains);
  const lossStr = formatPieceCount(losses);

  let text: string;
  if (gainStr && !lossStr) {
    text = `${sideLabel(advSide)} hơn ${gainStr}`;
  } else if (gainStr && lossStr) {
    text = `${sideLabel(advSide)} đổi ${lossStr} lấy ${gainStr}`;
  } else {
    text = `${sideLabel(advSide)} lời ${absScore} điểm`;
  }

  return {
    advantageSide: advSide,
    scoreDiff: absScore,
    diffPieces: gains,
    text,
  };
}

function play(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

/**
 * Tìm các quân của đối phương bị đe dọa sau nước đi.
 * Là các quân bị tấn công mà không có quân bảo vệ, hoặc đổi quân có lợi cho bên đi.
 */
function findThreats(board: Board, moverSide: Side, movedTo: number): PieceRef[] {
  const opp = opponent(moverSide);
  const threats: PieceRef[] = [];

  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p || sideOf(p) !== opp || typeOf(p) === "k") continue;

    // Ưu tiên quân bị ô đích vừa đi trực tiếp tấn công hoặc bị tấn công nói chung
    if (!isAttacked(board, i, moverSide)) continue;

    const notDefended = !isDefended(board, i, opp);
    const gain = exchangeGain(board, i, moverSide) ?? 0;

    if (notDefended || gain > 0) {
      threats.push(ref(board, i));
    }
  }

  // Đưa quân bị ô movedTo trực tiếp nhắm đến lên đầu
  threats.sort((a, b) => {
    const aDirect = isAttackedDirect(board, a.square, movedTo);
    const bDirect = isAttackedDirect(board, b.square, movedTo);
    if (aDirect && !bDirect) return -1;
    if (!aDirect && bDirect) return 1;
    return PIECE_VALUES[typeOf(b.piece)] - PIECE_VALUES[typeOf(a.piece)];
  });

  return threats.slice(0, 3);
}

function isAttackedDirect(board: Board, target: number, attackerSq: number): boolean {
  const piece = board[attackerSq];
  if (!piece) return false;
  // Giả lập bàn cờ chỉ có 1 quân attackerSq để xem có thể ăn target không
  const singleBoard: Board = new Array(board.length).fill(null);
  // Cần giữ nguyên các quân làm vật cản/ngòi
  for (let i = 0; i < board.length; i++) {
    if (i === attackerSq || i === target || board[i]) {
      singleBoard[i] = board[i];
    }
  }
  return isAttacked(singleBoard, target, sideOf(piece));
}

/**
 * Phân tích và "kể" diễn biến của một chuỗi nước PV.
 *
 * @param startBoard Thế cờ ban đầu
 * @param turn Bên đi trước trong chuỗi
 * @param pv Dãy các nước đi trong biến
 */
export function narratePv(startBoard: Board, turn: Side, pv: Move[]): PvNarration {
  if (!pv || pv.length === 0) {
    const delta = describeMaterialDelta(startBoard, startBoard);
    return {
      moves: [],
      startBoard,
      endBoard: startBoard,
      delta,
      isMate: false,
      summary: "không có nước tiếp diễn",
    };
  }

  let currentBoard = startBoard;
  let currentTurn = turn;
  const plyNarratives: PlyNarration[] = [];

  for (let idx = 0; idx < pv.length; idx++) {
    const m = pv[idx];
    const movingPiece = currentBoard[m.from];
    if (!movingPiece || sideOf(movingPiece) !== currentTurn) {
      // Nước đi không hợp lệ trong chuỗi: dừng tại đây
      break;
    }

    const pieceRef = ref(currentBoard, m.from);
    const notation = moveNotation(currentBoard, m);
    const capturedPiece = currentBoard[m.to] ? ref(currentBoard, m.to) : null;

    const nextBoard = play(currentBoard, m);
    const opp = opponent(currentTurn);
    const check = inCheck(nextBoard, opp);
    const threats = findThreats(nextBoard, currentTurn, m.to);

    plyNarratives.push({
      ply: idx + 1,
      side: currentTurn,
      move: m,
      notation,
      piece: pieceRef,
      captured: capturedPiece,
      isCheck: check,
      threats,
    });

    currentBoard = nextBoard;
    currentTurn = opp;
  }

  const endBoard = currentBoard;
  const delta = describeMaterialDelta(startBoard, endBoard);

  // Kiểm tra chiếu bí ở cuối chuỗi
  let isMate = false;
  let mateWinner: Side | undefined;
  if (inCheck(endBoard, currentTurn)) {
    const legals = legalMoves({ board: endBoard, turn: currentTurn });
    if (legals.length === 0) {
      isMate = true;
      mateWinner = opponent(currentTurn);
    }
  }

  // Tạo câu tóm tắt
  const moveNotations = plyNarratives.map((p) => p.notation);
  let summary = "";
  const movesStr = moveNotations.length <= 4
    ? moveNotations.join(", ")
    : `${moveNotations.slice(0, 3).join(", ")}, … ${moveNotations[moveNotations.length - 1]}`;

  if (isMate && mateWinner) {
    summary = `sau ${movesStr} thì ${sideLabel(mateWinner)} chiếu bí`;
  } else if (delta.advantageSide) {
    summary = `sau ${movesStr} thì ${delta.text}`;
  } else if (delta.text === "đổi quân cân bằng") {
    summary = `sau ${movesStr} thì đổi quân cân bằng`;
  } else {
    summary = `sau ${movesStr} thì thế trận cân bằng`;
  }

  return {
    moves: plyNarratives,
    startBoard,
    endBoard,
    delta,
    isMate,
    mateWinner,
    summary,
  };
}
