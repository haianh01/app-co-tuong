// Ký hiệu nước đi kiểu Việt Nam: <quân><cột><dấu><giá trị>
//   dấu "." = tiến, "/" = thoái, "-" = bình (đi ngang)
//   cột đánh số 1–9 từ phải sang trái theo góc nhìn của bên đi
//   Xe, Pháo, Tốt, Tướng tiến/thoái ghi số bước; Mã, Tượng, Sĩ ghi cột đích.
// Hai quân cùng loại trên cùng cột: dùng "t" (trước) và "s" (sau) thay cho số cột, ví dụ "Xt.3".

import { Board, Move, Side, colOf, rowOf, sideOf, typeOf, PieceType, ROWS } from "./engine";

export const PIECE_LETTER: Record<PieceType, string> = {
  k: "Tg", a: "S", b: "T", n: "M", r: "X", c: "P", p: "B",
};

export const PIECE_NAME: Record<PieceType, string> = {
  k: "Tướng", a: "Sĩ", b: "Tượng", n: "Mã", r: "Xe", c: "Pháo", p: "Tốt",
};

export const PIECE_CHAR: Record<string, string> = {
  K: "帥", A: "仕", B: "相", N: "傌", R: "俥", C: "炮", P: "兵",
  k: "將", a: "士", b: "象", n: "馬", r: "車", c: "砲", p: "卒",
};

const fileNumber = (col: number, s: Side) => (s === "r" ? 9 - col : col + 1);

export function moveNotation(board: Board, m: Move): string {
  const p = board[m.from];
  if (!p) return "?";
  const s = sideOf(p);
  const t = typeOf(p);
  const fr = rowOf(m.from);
  const fc = colOf(m.from);
  const tr = rowOf(m.to);
  const tc = colOf(m.to);

  let file = String(fileNumber(fc, s));
  const sameFile: number[] = [];
  for (let r = 0; r < ROWS; r++) if (board[r * 9 + fc] === p) sameFile.push(r);
  if (sameFile.length === 2) {
    const front = s === "r" ? Math.min(...sameFile) : Math.max(...sameFile);
    file = fr === front ? "t" : "s";
  }

  if (fr === tr) return `${PIECE_LETTER[t]}${file}-${fileNumber(tc, s)}`;
  const forward = s === "r" ? tr < fr : tr > fr;
  const diagonalMover = t === "n" || t === "b" || t === "a";
  const value = diagonalMover ? fileNumber(tc, s) : Math.abs(tr - fr);
  return `${PIECE_LETTER[t]}${file}${forward ? "." : "/"}${value}`;
}
