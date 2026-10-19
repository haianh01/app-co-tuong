// Giá trị Mã / Pháo thay đổi theo số "ngòi" trên bàn (Sĩ, Tượng, Tốt của cả hai bên).
// Pháo cần ngòi để ăn quân và chiếu; Mã thì không. Kiểm chứng bằng Pikafish (2026-10-16): cùng thế, một bên Mã một bên Pháo,
// 30–40 thế ngẫu nhiên mỗi cấu hình, điểm kỳ vọng của bên có Mã:
//   không Sĩ Tượng, mỗi bên 1 Tốt: 0,90 · 2 Tốt: 0,71 · 3 Tốt: 0,55 · mỗi bên 1 Sĩ + 2 Tốt: 0,71 · thêm Xe, 1 Tốt: 0,65
//   đủ Sĩ Tượng hai bên (1–3 Tốt, có hoặc không có Xe): 0,32–0,47
// => "Tàn cuộc Mã mạnh hơn Pháo" chỉ đúng khi bàn đã thưa ngòi; còn đủ Sĩ Tượng thì Pháo vẫn nhỉnh hơn hoặc ngang Mã.

import { type Board, type PieceType, typeOf, PIECE_VALUES } from "./engine";

/** Số quân có thể làm ngòi cho Pháo: Sĩ, Tượng và Tốt của cả hai bên. Đầu ván là 18. */
export function screenCount(board: Board): number {
  let n = 0;
  for (const p of board) if (p && "abp".includes(typeOf(p))) n++;
  return n;
}

/** Giá trị Mã và Pháo theo số ngòi trên bàn. Bàn đủ ngòi giữ giá trị chuẩn (Pháo 450, Mã 400). */
export function minorValues(board: Board): { n: number; c: number } {
  const s = screenCount(board);
  if (s <= 4) return { n: 450, c: 350 }; // gần như không còn ngòi: Mã hơn rõ (0,71–0,90)
  if (s <= 7) return { n: 425, c: 400 }; // ít ngòi: Mã nhỉnh hơn (0,55–0,71)
  return { n: PIECE_VALUES.n, c: PIECE_VALUES.c }; // đủ ngòi: Pháo nhỉnh hơn hoặc ngang Mã
}

/** Giá trị quân có tính số ngòi trên bàn (chỉ Mã và Pháo thay đổi). */
export function contextValue(type: PieceType, board: Board): number {
  if (type === "n" || type === "c") return minorValues(board)[type];
  return PIECE_VALUES[type];
}
