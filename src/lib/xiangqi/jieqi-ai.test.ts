import { describe, expect, it } from "vitest";
import { sq, type Board, type Position } from "./engine";
import { findJieqiMove } from "./jieqi-ai";
import { jieqiApply, jieqiLegalMoves, jieqiStart, newJieqi, jieqiPlay, randomLayout, isHidden } from "./jieqi";

const empty = (): Board => Array(90).fill(null);

/** Số quân úp bị ăn khi chưa lật (dựng lại ván để đếm). */
function countHiddenCaptured(moves: { from: number; to: number; reveal?: string }[]) {
  let pos = jieqiStart();
  let n = 0;
  for (const m of moves) {
    if (isHidden(pos.board[m.to])) n++;
    pos = jieqiApply(pos, m, isHidden(pos.board[m.from]) ? m.reveal : undefined);
  }
  return n;
}
const fixed = () => 0.5;

describe("máy chơi cờ úp", () => {
  it("ăn quân lớn đang bị treo", () => {
    const board = empty();
    board[sq(9, 4)] = "K";
    board[sq(0, 3)] = "k";
    board[sq(5, 0)] = "R";
    board[sq(5, 7)] = "r"; // xe đen không ai bảo vệ, cùng hàng
    const pos: Position = { board, turn: "r" };
    for (const level of [1, 2, 3] as const) {
      expect(findJieqiMove(pos, level, fixed)).toEqual({ from: sq(5, 0), to: sq(5, 7) });
    }
  });

  it("chiếu bí được thì chiếu bí (cấp Vừa trở lên)", () => {
    const board = empty();
    board[sq(9, 3)] = "K";
    board[sq(0, 4)] = "k";
    board[sq(1, 0)] = "R";
    board[sq(2, 8)] = "R";
    const pos: Position = { board, turn: "r" };
    const m = findJieqiMove(pos, 2, fixed)!;
    const after = jieqiApply(pos, m);
    expect(jieqiLegalMoves(after)).toEqual([]);
  });

  it("luôn đi nước hợp lệ, kể cả khi tự chơi với mình cả ván (không đọc trộm bố cục)", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const layout = randomLayout(rnd);
    let s = newJieqi();
    for (let i = 0; i < 40 && !s.result; i++) {
      const visible = s.position;
      // Máy chỉ nhận bàn cờ công khai: số quân úp = 30 − số quân đã lật − số quân úp đã bị ăn.
      const revealed = s.moves.filter((x) => x.reveal).length;
      const hiddenTaken = countHiddenCaptured(s.moves);
      expect(visible.board.filter((p) => isHidden(p))).toHaveLength(30 - revealed - hiddenTaken);
      const m = findJieqiMove(visible, 1, rnd)!;
      expect(jieqiLegalMoves(visible)).toContainEqual(m);
      const reveal = isHidden(visible.board[m.from]) ? layout[m.from] : undefined;
      s = jieqiPlay(s, { ...m, reveal });
    }
    expect(s.moves.length).toBeGreaterThan(10);
  });

  it("nước đầu tiên của cấp Khó tính xong trong thời gian chấp nhận được", () => {
    const t0 = performance.now();
    expect(findJieqiMove(jieqiStart(), 3, fixed)).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(4000);
  });
});
