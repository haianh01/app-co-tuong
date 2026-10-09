// Luật cờ tướng: biểu diễn bàn cờ, sinh nước đi hợp lệ, kiểm tra chiếu, kết thúc ván.
// Bàn cờ là mảng 90 ô, chỉ số = hàng * 9 + cột. Hàng 0 ở phía Đen (trên), hàng 9 ở phía Đỏ (dưới).
// Quân Đỏ viết hoa (K A B N R C P), quân Đen viết thường.

export type Side = "r" | "b";
export type PieceType = "k" | "a" | "b" | "n" | "r" | "c" | "p";
export type Piece = string;
export type Board = (Piece | null)[];

export interface Move {
  from: number;
  to: number;
}

export interface Position {
  board: Board;
  turn: Side;
}

export const ROWS = 10;
export const COLS = 9;
export const START_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w";

export const sq = (r: number, c: number) => r * COLS + c;
export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;
export const sideOf = (p: Piece): Side => (p === p.toUpperCase() ? "r" : "b");
export const typeOf = (p: Piece) => p.toLowerCase() as PieceType;
export const opponent = (s: Side): Side => (s === "r" ? "b" : "r");

const inBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const inPalace = (r: number, c: number, s: Side) =>
  c >= 3 && c <= 5 && (s === "r" ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
const crossedRiver = (r: number, s: Side) => (s === "r" ? r <= 4 : r >= 5);

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
// [dr, dc, legR, legC]: bước mã và ô cản chân tương ứng.
const HORSE = [
  [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
  [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
] as const;

export function parseFen(fen: string): Position {
  const [placement, turn = "w"] = fen.trim().split(/\s+/);
  const rows = placement.split("/");
  if (rows.length !== ROWS) throw new Error(`FEN không hợp lệ: cần ${ROWS} hàng`);
  const board: Board = [];
  for (const row of rows) {
    let count = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        const n = Number(ch);
        for (let i = 0; i < n; i++) board.push(null);
        count += n;
      } else {
        if (!/[kabnrcp]/i.test(ch)) throw new Error(`FEN không hợp lệ: ký tự "${ch}"`);
        board.push(ch);
        count++;
      }
    }
    if (count !== COLS) throw new Error(`FEN không hợp lệ: hàng "${row}" không đủ ${COLS} cột`);
  }
  return { board, turn: turn === "b" ? "b" : "r" };
}

export function toFen(pos: Position): string {
  const rows: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    let row = "";
    let empty = 0;
    for (let c = 0; c < COLS; c++) {
      const p = pos.board[sq(r, c)];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${pos.turn === "r" ? "w" : "b"}`;
}

export const initialPosition = () => parseFen(START_FEN);

/** Nước đi theo đúng cách đi của quân, chưa xét việc tự để tướng bị chiếu. */
export function pseudoMoves(board: Board, from: number): number[] {
  const p = board[from];
  if (!p) return [];
  const s = sideOf(p);
  const r = rowOf(from);
  const c = colOf(from);
  const out: number[] = [];
  const add = (rr: number, cc: number) => {
    if (!inBoard(rr, cc)) return;
    const q = board[sq(rr, cc)];
    if (!q || sideOf(q) !== s) out.push(sq(rr, cc));
  };

  switch (typeOf(p)) {
    case "k":
      for (const [dr, dc] of ORTHO) if (inPalace(r + dr, c + dc, s)) add(r + dr, c + dc);
      break;
    case "a":
      for (const [dr, dc] of DIAG) if (inPalace(r + dr, c + dc, s)) add(r + dr, c + dc);
      break;
    case "b":
      for (const [dr, dc] of DIAG) {
        const rr = r + 2 * dr;
        const cc = c + 2 * dc;
        if (!inBoard(rr, cc) || crossedRiver(rr, s) || board[sq(r + dr, c + dc)]) continue;
        add(rr, cc);
      }
      break;
    case "n":
      for (const [dr, dc, lr, lc] of HORSE) {
        if (!inBoard(r + dr, c + dc) || board[sq(r + lr, c + lc)]) continue;
        add(r + dr, c + dc);
      }
      break;
    case "r":
    case "c": {
      const cannon = typeOf(p) === "c";
      for (const [dr, dc] of ORTHO) {
        let rr = r + dr;
        let cc = c + dc;
        let screened = false;
        while (inBoard(rr, cc)) {
          const q = board[sq(rr, cc)];
          if (!screened) {
            if (!q) out.push(sq(rr, cc));
            else if (!cannon) {
              if (sideOf(q) !== s) out.push(sq(rr, cc));
              break;
            } else screened = true;
          } else if (q) {
            if (sideOf(q) !== s) out.push(sq(rr, cc));
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
      break;
    }
    case "p":
      add(r + (s === "r" ? -1 : 1), c);
      if (crossedRiver(r, s)) {
        add(r, c - 1);
        add(r, c + 1);
      }
      break;
  }
  return out;
}

export function findKing(board: Board, s: Side): number {
  const k = s === "r" ? "K" : "k";
  return board.indexOf(k);
}

/** Ô `target` có bị phe `by` tấn công không. Chỉ dùng cho ô của tướng (gồm cả luật lộ mặt tướng). */
export function isAttacked(board: Board, target: number, by: Side): boolean {
  const r = rowOf(target);
  const c = colOf(target);
  const own = (p: Piece | null, t: PieceType) => !!p && sideOf(p) === by && typeOf(p) === t;

  // Xe, pháo, và tướng đối mặt trên cùng cột.
  for (const [dr, dc] of ORTHO) {
    let rr = r + dr;
    let cc = c + dc;
    let screened = false;
    while (inBoard(rr, cc)) {
      const q = board[sq(rr, cc)];
      if (q) {
        if (!screened) {
          if (own(q, "r") || (dc === 0 && own(q, "k"))) return true;
          screened = true;
        } else {
          if (own(q, "c")) return true;
          break;
        }
      }
      rr += dr;
      cc += dc;
    }
  }

  // Mã: tìm mã có thể nhảy tới target, chân mã tính từ phía con mã.
  for (const [dr, dc, lr, lc] of HORSE) {
    const hr = r - dr;
    const hc = c - dc;
    if (!inBoard(hr, hc) || !own(board[sq(hr, hc)], "n")) continue;
    if (!board[sq(hr + lr, hc + lc)]) return true;
  }

  // Tốt.
  const fwd = by === "r" ? 1 : -1; // tốt đỏ ở hàng dưới target sẽ tiến lên target
  if (inBoard(r + fwd, c) && own(board[sq(r + fwd, c)], "p")) return true;
  for (const dc of [-1, 1]) {
    if (inBoard(r, c + dc) && own(board[sq(r, c + dc)], "p") && crossedRiver(r, by)) return true;
  }
  return false;
}

export function inCheck(board: Board, s: Side): boolean {
  const k = findKing(board, s);
  return k < 0 || isAttacked(board, k, opponent(s));
}

export function applyMove(pos: Position, m: Move): Position {
  const board = pos.board.slice();
  board[m.to] = board[m.from];
  board[m.from] = null;
  return { board, turn: opponent(pos.turn) };
}

function leavesKingSafe(board: Board, m: Move, s: Side): boolean {
  const captured = board[m.to];
  board[m.to] = board[m.from];
  board[m.from] = null;
  const safe = !inCheck(board, s);
  board[m.from] = board[m.to];
  board[m.to] = captured;
  return safe;
}

export function legalMovesFrom(pos: Position, from: number): Move[] {
  const p = pos.board[from];
  if (!p || sideOf(p) !== pos.turn) return [];
  const board = pos.board.slice();
  return pseudoMoves(board, from)
    .map((to) => ({ from, to }))
    .filter((m) => leavesKingSafe(board, m, pos.turn));
}

export function legalMoves(pos: Position): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < pos.board.length; i++) {
    const p = pos.board[i];
    if (p && sideOf(p) === pos.turn) out.push(...legalMovesFrom(pos, i));
  }
  return out;
}

export function isLegal(pos: Position, m: Move): boolean {
  return legalMovesFrom(pos, m.from).some((x) => x.to === m.to);
}

export type Outcome =
  | { over: false; check: boolean }
  | { over: true; winner: Side | null; reason: "checkmate" | "stalemate" | "draw" };

/** Trong cờ tướng, bên hết nước đi (dù bị chiếu hay không) là thua. */
export function outcome(pos: Position): Outcome {
  const check = inCheck(pos.board, pos.turn);
  if (legalMoves(pos).length > 0) return { over: false, check };
  return { over: true, winner: opponent(pos.turn), reason: check ? "checkmate" : "stalemate" };
}

/** Chỉ còn tướng, sĩ, tượng ở cả hai bên thì không bên nào chiếu bí được. */
export function insufficientMaterial(board: Board): boolean {
  return board.every((p) => !p || "kab".includes(typeOf(p)));
}
