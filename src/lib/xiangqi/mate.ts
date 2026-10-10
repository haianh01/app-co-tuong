// Tìm sát cục ép buộc (dùng cho cờ thế): sinh đề, kiểm tra lời giải ở máy chủ, chọn nước phòng thủ cho máy.
// Trong cờ tướng, bên hết nước đi (bị chiếu bí hay bị vây) đều thua, nên "thắng" = đối phương hết nước.

import { applyMove, legalMoves, outcome, type Move, type Position } from "./engine";

const won = (pos: Position) => {
  const o = outcome(pos);
  return o.over && o.winner !== pos.turn;
};

/** Bên đang đi có ép thắng được trong tối đa `n` nước của mình không. */
export function forcesWin(pos: Position, n: number): boolean {
  return winningMoves(pos, n, true).length > 0;
}

/** Các nước của bên đang đi dẫn tới thắng ép buộc trong tối đa `n` nước. */
export function winningMoves(pos: Position, n: number, firstOnly = false): Move[] {
  const out: Move[] = [];
  for (const m of legalMoves(pos)) {
    if (moveWins(pos, m, n)) {
      out.push(m);
      if (firstOnly) break;
    }
  }
  return out;
}

/** Nước `m` có ép thắng trong tối đa `n` nước (tính cả nước này) không. */
export function moveWins(pos: Position, m: Move, n: number): boolean {
  const next = applyMove(pos, m);
  if (won(next)) return true;
  if (n <= 1) return false;
  const replies = legalMoves(next);
  return replies.every((r) => forcesWin(applyMove(next, r), n - 1));
}

/**
 * Nước phòng thủ "cứng" nhất cho bên thua: nước để lại ít nước thắng nhất cho đối phương
 * (hòa thì lấy nước đầu tiên, để luôn tất định). `n` là số nước thắng đối phương còn được dùng.
 */
export function toughestReply(pos: Position, n: number): Move | null {
  let best: Move | null = null;
  let fewest = Infinity;
  for (const r of legalMoves(pos)) {
    const after = applyMove(pos, r);
    const wins = winningMoves(after, n).length;
    if (wins === 0) return r; // Thoát được: đề sai, nhưng vẫn trả về để người gọi phát hiện.
    if (wins < fewest) {
      fewest = wins;
      best = r;
    }
  }
  return best;
}

/**
 * Kiểm tra một lời giải gửi lên: các nước xen kẽ hai bên, bắt đầu từ bên đi trước.
 * Hợp lệ khi mọi nước đúng luật, mỗi nước của bên giải giữ được thắng ép buộc trong số nước còn lại,
 * và ván kết thúc bằng thắng sau tối đa `n` nước của bên giải.
 */
export function verifySolution(start: Position, moves: Move[], n: number): boolean {
  if (moves.length === 0 || moves.length > 2 * n - 1 || moves.length % 2 === 0) return false;
  let pos = start;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (!legalMoves(pos).some((x) => x.from === m.from && x.to === m.to)) return false;
    if (i % 2 === 0 && !moveWins(pos, m, n - i / 2)) return false;
    pos = applyMove(pos, m);
  }
  return won(pos);
}
