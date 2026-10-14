// Chuyển đổi ký hiệu cờ tướng chữ Hán (Chinese notation / WXF) sang Move và ký hiệu Việt Nam.
// Định dạng: 4 ký tự, ví dụ: "相三进五", "炮８平４", "前炮退一", "后马进六".

import {
  type Board,
  type Move,
  type PieceType,
  type Position,
  type Side,
  COLS,
  ROWS,
  colOf,
  legalMoves,
  opponent,
  play,
  rowOf,
  sideOf,
  sq,
  typeOf,
} from "./engine";
import { moveNotation } from "./notation";

const NUM_MAP: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  "１": 1, "２": 2, "３": 3, "４": 4, "５": 5, "６": 6, "７": 7, "８": 8, "９": 9,
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};

const PIECE_CHAR_TO_TYPE: Record<string, PieceType> = {
  帅: "k", 将: "k",
  仕: "a", 士: "a",
  相: "b", 象: "b",
  马: "n", 傌: "n",
  车: "r", 俥: "r",
  炮: "c", 砲: "c",
  兵: "p", 卒: "p",
};

/** Cột 1-9 theo góc nhìn của bên đi: Đỏ từ phải sang trái (9 - c), Đen từ phải sang trái (c + 1). */
export function fileNumber(c: number, s: Side): number {
  return s === "r" ? 9 - c : c + 1;
}

/** Chuyển số cột (1-9) sang chỉ số cột bàn cờ 0-8. */
export function fileToFileCol(f: number, s: Side): number {
  return s === "r" ? 9 - f : f - 1;
}

/**
 * Kiểm tra xem một nước đi hợp lệ `m` có khớp với chuỗi ký hiệu chữ Hán `text` không.
 */
function matchesChinese(pos: Position, m: Move, text: string): boolean {
  if (text.length !== 4) return false;
  const p = pos.board[m.from];
  if (!p || sideOf(p) !== pos.turn) return false;
  const pType = typeOf(p);

  const c0 = text[0];
  const c1 = text[1];
  const c2 = text[2]; // Hành động: 进 (tiến), 退 (thoái), 平 (bình)
  const c3 = text[3]; // Đích hoặc số bước

  // 1. Kiểm tra hành động
  const fr = rowOf(m.from);
  const fc = colOf(m.from);
  const tr = rowOf(m.to);
  const tc = colOf(m.to);

  let expectedAction: "进" | "退" | "平";
  if (fr === tr) {
    expectedAction = "平";
  } else {
    const isForward = pos.turn === "r" ? tr < fr : tr > fr;
    expectedAction = isForward ? "进" : "退";
  }

  if (c2 !== expectedAction) return false;

  // 2. Kiểm tra giá trị thứ 4 (bước hoặc cột đích)
  const val4 = NUM_MAP[c3];
  if (val4 === undefined) return false;

  const isDiagonal = pType === "n" || pType === "b" || pType === "a";
  if (isDiagonal || expectedAction === "平") {
    // Với quân đi chéo hoặc đi ngang, ký tự thứ 4 là cột đích
    if (fileNumber(tc, pos.turn) !== val4) return false;
  } else {
    // Với quân đi thẳng tiến/thoái, ký tự thứ 4 là số bước đi
    if (Math.abs(tr - fr) !== val4) return false;
  }

  // 3. Kiểm tra quân và vị trí bắt đầu
  const isDisambig = c0 === "前" || c0 === "后" || c0 === "中" || ((c0 in NUM_MAP) && (c1 === "兵" || c1 === "卒"));

  if (isDisambig) {
    const targetType = PIECE_CHAR_TO_TYPE[c1];
    if (targetType !== pType) return false;

    // Tìm các quân cùng loại trên cùng cột với m.from
    const piecesOnSameCol: number[] = [];
    for (let r = 0; r < ROWS; r++) {
      const idx = sq(r, fc);
      const piece = pos.board[idx];
      if (piece && sideOf(piece) === pos.turn && typeOf(piece) === pType) {
        piecesOnSameCol.push(idx);
      }
    }

    if (piecesOnSameCol.length < 2) return false;

    if (piecesOnSameCol.length === 2) {
      const frontIdx = pos.turn === "r"
        ? (rowOf(piecesOnSameCol[0]) < rowOf(piecesOnSameCol[1]) ? piecesOnSameCol[0] : piecesOnSameCol[1])
        : (rowOf(piecesOnSameCol[0]) > rowOf(piecesOnSameCol[1]) ? piecesOnSameCol[0] : piecesOnSameCol[1]);
      const rearIdx = frontIdx === piecesOnSameCol[0] ? piecesOnSameCol[1] : piecesOnSameCol[0];

      if (c0 === "前" && m.from !== frontIdx) return false;
      if (c0 === "后" && m.from !== rearIdx) return false;
    } else if (piecesOnSameCol.length > 2) {
      const sortedByFront = piecesOnSameCol.slice().sort((a, b) =>
        pos.turn === "r" ? rowOf(a) - rowOf(b) : rowOf(b) - rowOf(a)
      );
      const rankIdx = sortedByFront.indexOf(m.from);
      if (c0 === "前" && rankIdx !== 0) return false;
      if (c0 === "中" && rankIdx !== 1) return false;
      if (c0 === "后" && rankIdx !== sortedByFront.length - 1) return false;
      if (c0 in NUM_MAP && rankIdx !== (NUM_MAP[c0] - 1)) return false;
    }
  } else {
    const expectedType = PIECE_CHAR_TO_TYPE[c0];
    if (expectedType !== pType) return false;

    const startFile = NUM_MAP[c1];
    if (startFile === undefined || fileNumber(fc, pos.turn) !== startFile) return false;
  }

  return true;
}

/**
 * Tìm nước đi `Move` hợp lệ trong thế cờ `pos` khớp với ký hiệu chữ Hán.
 */
export function parseChineseMove(pos: Position, text: string): Move | null {
  const clean = text.trim();
  if (clean.length !== 4) return null;

  const legals = legalMoves(pos);
  const matched = legals.filter((m) => matchesChinese(pos, m, clean));
  if (matched.length === 1) return matched[0];

  return matched[0] ?? null;
}

export interface ConvertedGame {
  moves: Move[];
  notations: string[];
  positions: Position[];
  success: boolean;
  failedAtPly?: number;
  failedNotation?: string;
}

/**
 * Chuyển đổi toàn bộ danh sách nước đi chữ Hán từ thế cờ ban đầu thành danh sách Move.
 */
export function convertChineseGame(chineseMoves: string[], startPos?: Position): ConvertedGame {
  let currPos = startPos ?? {
    board: [
      "r", "n", "b", "a", "k", "a", "b", "n", "r",
      null, null, null, null, null, null, null, null, null,
      null, "c", null, null, null, null, null, "c", null,
      "p", null, "p", null, "p", null, "p", null, "p",
      null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null, null,
      "P", null, "P", null, "P", null, "P", null, "P",
      null, "C", null, null, null, null, null, "C", null,
      null, null, null, null, null, null, null, null, null,
      "R", "N", "B", "A", "K", "A", "B", "N", "R",
    ],
    turn: "r",
  };

  const moves: Move[] = [];
  const notations: string[] = [];
  const positions: Position[] = [currPos];

  for (let i = 0; i < chineseMoves.length; i++) {
    const raw = chineseMoves[i];
    const m = parseChineseMove(currPos, raw);
    if (!m) {
      return {
        moves,
        notations,
        positions,
        success: false,
        failedAtPly: i + 1,
        failedNotation: raw,
      };
    }
    const vnNotation = moveNotation(currPos.board, m);
    moves.push(m);
    notations.push(vnNotation);

    const nextBoard = play(currPos.board, m);
    currPos = { board: nextBoard, turn: opponent(currPos.turn) };
    positions.push(currPos);
  }

  return { moves, notations, positions, success: true };
}
