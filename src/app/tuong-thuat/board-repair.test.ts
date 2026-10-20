import { describe, expect, it } from "vitest";
import { applyMove, initialPosition, type Move, type Position } from "@/lib/xiangqi/engine";
import { findRepair } from "./board-repair";

function historyOf(moves: Move[]): Position[] {
  const out = [initialPosition()];
  for (const m of moves) out.push(applyMove(out[out.length - 1], m));
  return out;
}

const centralCannon = { from: 7 * 9 + 7, to: 7 * 9 + 4 }; // Pháo 2 bình 5
const horse = { from: 0 * 9 + 7, to: 2 * 9 + 6 }; // Mã đen lên
const cannonTakesHorse = { from: 7 * 9 + 1, to: 0 * 9 + 1 }; // Pháo đỏ ăn Mã (nhận nhầm)
const redHorse = { from: 9 * 9 + 7, to: 7 * 9 + 6 }; // Mã đỏ lên (nước thật)

describe("findRepair", () => {
  it("nhận nhầm nước cuối thành nước ăn quân: lùi 1, đi lại nước đúng", () => {
    const wrong = historyOf([centralCannon, horse, cannonTakesHorse]);
    const real = historyOf([centralCannon, horse, redHorse]);
    expect(findRepair(wrong, real[3].board)).toEqual({ undo: 1, moves: [redHorse] });
  });

  it("bỏ sót một nước: không lùi, đi thêm nước đó", () => {
    const seen = historyOf([centralCannon]);
    const real = historyOf([centralCannon, horse]);
    expect(findRepair(seen, real[2].board)).toEqual({ undo: 0, moves: [horse] });
  });

  it("nhận nhầm một nước rồi đọc thêm một nước sau đó: lùi 2, đi lại 2", () => {
    const blackRook = { from: 0 * 9 + 8, to: 1 * 9 + 8 }; // Xe đen lên, đi được trong cả hai trường hợp
    const wrong = historyOf([centralCannon, horse, cannonTakesHorse, blackRook]);
    const real = historyOf([centralCannon, horse, redHorse, blackRook]);
    expect(findRepair(wrong, real[4].board)).toEqual({ undo: 2, moves: [redHorse, blackRook] });
  });

  it("không có cách nào ra thế đọc được trong 2 nước: null", () => {
    const seen = historyOf([centralCannon]);
    const far = historyOf([centralCannon, horse, redHorse, { from: 0 * 9 + 1, to: 2 * 9 + 2 }, { from: 9 * 9 + 1, to: 7 * 9 + 2 }]);
    expect(findRepair(seen, far[5].board)).toBeNull();
  });
});
