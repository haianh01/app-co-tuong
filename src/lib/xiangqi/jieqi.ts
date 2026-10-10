// Cờ úp (揭棋): ngoài hai tướng, 15 quân mỗi bên được úp và xáo ngẫu nhiên vào các ô xuất phát.
// Quân úp ("H" đỏ / "h" đen) đi theo quân của ô xuất phát; đi xong thì lật ra và từ đó đi theo quân thật.
// Sĩ, tượng đã lật đi được khắp bàn (không bị giới hạn trong cung / bên sông).

import {
  COLS, START_FEN, findKing, opponent, parseFen, pseudoMoves, rowOf, colOf, sideOf, sq, typeOf,
  type Board, type Move, type Piece, type PieceType, type Position, type Side,
} from "./engine";
import type { GameResult, GameState, PlayedMove } from "./game";
import { moveNotation } from "./notation";

/** Quân ở mỗi ô của thế xuất phát chuẩn (để biết quân úp đi theo quân gì). */
const START_BOARD = parseFen(START_FEN).board;

export const isHidden = (p: Piece | null | undefined) => p === "H" || p === "h";

/** Các ô có quân úp lúc đầu ván (mọi ô xuất phát trừ tướng). */
export const HIDDEN_SQUARES: Record<Side, number[]> = { r: [], b: [] };
for (let i = 0; i < 90; i++) {
  const p = START_BOARD[i];
  if (p && typeOf(p) !== "k") HIDDEN_SQUARES[sideOf(p)].push(i);
}

/** 15 quân (trừ tướng) của mỗi bên sẽ được xáo vào các ô úp. */
export const HIDDEN_POOL: Record<Side, Piece[]> = {
  r: HIDDEN_SQUARES.r.map((i) => START_BOARD[i]!),
  b: HIDDEN_SQUARES.b.map((i) => START_BOARD[i]!),
};

/** Thế xuất phát nhìn từ bên ngoài: chỉ thấy hai tướng và các quân úp. */
export function jieqiStart(): Position {
  const board: Board = START_BOARD.map((p) => (!p ? null : typeOf(p) === "k" ? p : sideOf(p) === "r" ? "H" : "h"));
  return { board, turn: "r" };
}

/** Xáo bố cục bí mật: ô úp → quân thật. `random` trả số trong [0, 1). */
export function randomLayout(random: () => number = Math.random): Record<number, Piece> {
  const layout: Record<number, Piece> = {};
  for (const side of ["r", "b"] as const) {
    const pool = HIDDEN_POOL[side].slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    HIDDEN_SQUARES[side].forEach((s, k) => (layout[s] = pool[k]));
  }
  return layout;
}

/**
 * Quân úp chỉ có thể nằm ở ô xuất phát (đi là lật), nên cách đi = quân của ô đó.
 * Quân úp ở ô khác (nước vừa đi chưa biết lật ra gì, hoặc máy đang tính thử) thì chưa rõ cách đi: null.
 */
export function effectiveType(board: Board, i: number): PieceType | null {
  const p = board[i];
  if (!p) return null;
  if (!isHidden(p)) return typeOf(p);
  const start = START_BOARD[i];
  return start && sideOf(start) === sideOf(p) && typeOf(start) !== "k" ? typeOf(start) : null;
}

const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
const inBoard = (r: number, c: number) => r >= 0 && r < 10 && c >= 0 && c < COLS;

export function jieqiPseudoMoves(board: Board, from: number): number[] {
  const p = board[from];
  if (!p) return [];
  const side = sideOf(p);
  const type = effectiveType(board, from);
  if (!type) return [];
  const r = rowOf(from);
  const c = colOf(from);
  const free = (i: number) => !board[i] || sideOf(board[i]!) !== side;

  // Sĩ, tượng đã lật: không giới hạn cung / sông.
  if (!isHidden(p) && (type === "a" || type === "b")) {
    const out: number[] = [];
    for (const [dr, dc] of DIAG) {
      if (type === "a") {
        if (inBoard(r + dr, c + dc) && free(sq(r + dr, c + dc))) out.push(sq(r + dr, c + dc));
      } else if (inBoard(r + 2 * dr, c + 2 * dc) && !board[sq(r + dr, c + dc)] && free(sq(r + 2 * dr, c + 2 * dc))) {
        out.push(sq(r + 2 * dr, c + 2 * dc));
      }
    }
    return out;
  }
  // Còn lại đi như cờ tướng thường (quân úp dùng cách đi của ô xuất phát).
  if (!isHidden(p)) return pseudoMoves(board, from);
  const virtual = board.slice();
  virtual[from] = side === "r" ? type.toUpperCase() : type;
  return pseudoMoves(virtual, from);
}

/** Tướng phe `side` có đang bị chiếu không (kể cả lộ mặt tướng). */
export function jieqiInCheck(board: Board, side: Side): boolean {
  const k = findKing(board, side);
  if (k < 0) return true;
  const other = opponent(side);
  const ok = findKing(board, other);
  if (ok >= 0 && colOf(ok) === colOf(k)) {
    const [a, b] = [Math.min(k, ok), Math.max(k, ok)];
    let blocked = false;
    for (let i = a + COLS; i < b; i += COLS) if (board[i]) blocked = true;
    if (!blocked) return true;
  }
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p && sideOf(p) === other && typeOf(p) !== "k" && jieqiPseudoMoves(board, i).includes(k)) return true;
  }
  return false;
}

/** Đi một nước. `reveal` = quân thật khi quân úp được lật (bên không biết thì để trống, quân vẫn úp). */
export function jieqiApply(pos: Position, m: Move, reveal?: Piece): Position {
  const board = pos.board.slice();
  board[m.to] = reveal ?? board[m.from];
  board[m.from] = null;
  return { board, turn: opponent(pos.turn) };
}

export function jieqiLegalMoves(pos: Position): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < 90; i++) {
    const p = pos.board[i];
    if (!p || sideOf(p) !== pos.turn) continue;
    for (const to of jieqiPseudoMoves(pos.board, i)) {
      // Quân vừa đi chỉ còn là vật cản với tướng mình, nên giữ nguyên ký hiệu là đủ để xét tự hở tướng.
      if (!jieqiInCheck(jieqiApply(pos, { from: i, to }).board, pos.turn)) out.push({ from: i, to });
    }
  }
  return out;
}

export const jieqiIsLegal = (pos: Position, m: Move) => jieqiLegalMoves(pos).some((x) => x.from === m.from && x.to === m.to);

// ---- Trạng thái ván ----

export interface JieqiMove {
  from: number;
  to: number;
  /** Quân thật được lật ở nước này (nếu quân đi là quân úp). */
  reveal?: Piece;
}

export interface JieqiState {
  position: Position;
  moves: JieqiMove[];
  /** Thế cờ sau từng nửa nước (để xét lặp lại). */
  keys: string[];
  noCapture: number;
  result: GameResult | null;
}

const key = (pos: Position) => pos.board.map((p) => p ?? ".").join("") + pos.turn;

export function newJieqi(): JieqiState {
  const position = jieqiStart();
  return { position, moves: [], keys: [key(position)], noCapture: 0, result: null };
}

/** Áp dụng nước nếu hợp lệ; trả về trạng thái cũ (cùng tham chiếu) nếu không. */
export function jieqiPlay(state: JieqiState, m: JieqiMove): JieqiState {
  if (state.result || !jieqiIsLegal(state.position, m)) return state;
  const hidden = isHidden(state.position.board[m.from]);
  if (hidden && m.reveal && sideOf(m.reveal) !== state.position.turn) return state;
  const captured = state.position.board[m.to];
  const position = jieqiApply(state.position, m, hidden ? m.reveal : undefined);
  const moves = [...state.moves, { from: m.from, to: m.to, ...(hidden && m.reveal ? { reveal: m.reveal } : {}) }];
  const keys = [...state.keys, key(position)];
  const noCapture = captured ? 0 : state.noCapture + 1;
  return { position, moves, keys, noCapture, result: jieqiResult(position, keys, noCapture) };
}

function jieqiResult(pos: Position, keys: string[], noCapture: number): GameResult | null {
  if (jieqiLegalMoves(pos).length === 0) {
    return { winner: opponent(pos.turn), reason: jieqiInCheck(pos.board, pos.turn) ? "checkmate" : "stalemate" };
  }
  const last = keys[keys.length - 1];
  if (keys.filter((k) => k === last).length >= 3) return { winner: null, reason: "repetition" };
  if (noCapture >= 120) return { winner: null, reason: "moveLimit" };
  return null;
}

export const jieqiEnd = (state: JieqiState, result: GameResult): JieqiState => (state.result ? state : { ...state, result });

export function replayJieqi(moves: JieqiMove[]): JieqiState {
  let s = newJieqi();
  for (const m of moves) {
    const next = jieqiPlay(s, m);
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Thế cờ sau `ply` nửa nước (để xem lại). */
export function jieqiPositions(moves: JieqiMove[]): Position[] {
  const out = [jieqiStart()];
  for (const m of moves) out.push(jieqiApply(out[out.length - 1], m, isHidden(out[out.length - 1].board[m.from]) ? m.reveal : undefined));
  return out;
}

const NAME: Record<string, string> = { r: "Xe", n: "Mã", b: "Tượng", a: "Sĩ", c: "Pháo", p: "Tốt", k: "Tướng" };

/** Ký hiệu nước đi; quân úp ghi theo quân của ô xuất phát, kèm quân được lật. */
export function jieqiNotation(board: Board, m: JieqiMove): string {
  const p = board[m.from];
  if (!p) return "?";
  if (!isHidden(p)) return moveNotation(board, m);
  const virtual = board.slice();
  const t = effectiveType(board, m.from)!;
  virtual[m.from] = sideOf(p) === "r" ? t.toUpperCase() : t;
  const base = moveNotation(virtual, m);
  return m.reveal ? `${base} (lật ${NAME[typeOf(m.reveal)]})` : `${base} (úp)`;
}

/** Mã cố định cho từng quân (cho hiệu ứng trượt), theo ô xuất phát. */
export function jieqiPieceIds(moves: JieqiMove[], ply = moves.length): (number | null)[] {
  const ids: (number | null)[] = jieqiStart().board.map((p, i) => (p ? i : null));
  for (const m of moves.slice(0, ply)) {
    ids[m.to] = ids[m.from];
    ids[m.from] = null;
  }
  return ids;
}

/** Bố cục ở dạng lưu trữ / gửi đi: mảng [ô, quân]. */
export const layoutEntries = (layout: Record<number, Piece>) => Object.entries(layout).map(([s, p]) => [Number(s), p] as [number, Piece]);
export const layoutFrom = (entries: unknown): Record<number, Piece> | null => {
  if (!Array.isArray(entries)) return null;
  const out: Record<number, Piece> = {};
  for (const e of entries) {
    if (!Array.isArray(e) || !Number.isInteger(e[0]) || typeof e[1] !== "string" || !/^[RNBACPrnbacp]$/.test(e[1])) return null;
    out[e[0]] = e[1];
  }
  return out;
};

/**
 * Chuyển ván cờ úp sang dạng GameState của cờ tướng (lịch sử thế cờ, biên bản, quân bị ăn) để dùng chung
 * giao diện ván đấu / xem lại. Không kiểm tra luật: dữ liệu đến từ máy chủ đã kiểm tra.
 */
export function jieqiGameState(moves: JieqiMove[], result: GameResult | null = null): GameState {
  const history = jieqiPositions(moves);
  const played: PlayedMove[] = moves.map((m, i) => {
    const before = history[i];
    const after = history[i + 1];
    return {
      move: { from: m.from, to: m.to },
      notation: jieqiNotation(before.board, m),
      side: before.turn,
      piece: m.reveal ?? before.board[m.from]!,
      captured: before.board[m.to],
      check: jieqiInCheck(after.board, after.turn),
      chase: false,
    };
  });
  return { history, moves: played, result };
}
