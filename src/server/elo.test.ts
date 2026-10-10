// Công thức Elo (rating.ts) với các tình huống xếp hạng thực tế.

import { describe, expect, it } from "vitest";
import { DEFAULT_RATING, expectedScore, kFactor, ratingDelta } from "./rating";

describe("điểm kỳ vọng", () => {
  it("ngang điểm thì 50%", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
  });

  it("hai bên cộng lại luôn bằng 1", () => {
    for (const [a, b] of [[1500, 1700], [1200, 2100], [1800, 1799], [0, 3000]]) {
      expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 12);
    }
  });

  it("hơn 400 điểm thì kỳ vọng thắng ~91%, hơn 200 điểm ~76%", () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 6);
    expect(expectedScore(1700, 1500)).toBeCloseTo(0.76, 2);
  });

  it("đối thủ càng yếu thì kỳ vọng càng cao", () => {
    expect(expectedScore(1500, 1300)).toBeGreaterThan(expectedScore(1500, 1400));
  });
});

describe("hệ số K", () => {
  it.each([[0, 40], [1, 40], [29, 40], [30, 20], [31, 20], [1000, 20]])("đã chơi %i ván → K = %i", (games, k) => {
    expect(kFactor(games)).toBe(k);
  });
});

describe("điểm thay đổi sau ván", () => {
  it("người mới ngang điểm: thắng +20, thua −20, hòa 0", () => {
    expect(ratingDelta(1500, 1500, 1, 0)).toBe(20);
    expect(ratingDelta(1500, 1500, 0, 0)).toBe(-20);
    expect(ratingDelta(1500, 1500, 0.5, 0)).toBe(0);
  });

  it("người chơi lâu (từ 30 ván) thay đổi bằng một nửa", () => {
    expect(ratingDelta(1500, 1500, 1, 30)).toBe(10);
    expect(ratingDelta(1500, 1500, 0, 30)).toBe(-10);
  });

  it("thắng người mạnh hơn 400 điểm được nhiều (+36), thắng người yếu hơn được ít (+4)", () => {
    expect(ratingDelta(1500, 1900, 1, 0)).toBe(36);
    expect(ratingDelta(1900, 1500, 1, 0)).toBe(4);
  });

  it("thua người yếu hơn bị trừ nhiều", () => {
    expect(ratingDelta(1900, 1500, 0, 0)).toBe(-36);
  });

  it("hòa với người mạnh hơn thì được cộng, người mạnh bị trừ", () => {
    expect(ratingDelta(1500, 1700, 0.5, 0)).toBe(10);
    expect(ratingDelta(1700, 1500, 0.5, 0)).toBe(-10);
  });

  it("cùng hệ số K thì tổng điểm hai bên gần như bằng 0 (chỉ lệch do làm tròn)", () => {
    for (const [a, b] of [[1500, 1500], [1500, 1650], [1320, 1980], [2100, 1200], [1499, 1501]]) {
      for (const score of [0, 0.5, 1]) {
        const sum = ratingDelta(a, b, score, 5) + ratingDelta(b, a, 1 - score, 5);
        expect(Math.abs(sum)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("không bao giờ vượt quá K; thắng không bị trừ, thua không được cộng", () => {
    for (const [a, b] of [[0, 3000], [3000, 0], [1500, 1500], [1200, 1210]]) {
      for (const games of [0, 50]) {
        const k = kFactor(games);
        const win = ratingDelta(a, b, 1, games);
        const draw = ratingDelta(a, b, 0.5, games);
        const loss = ratingDelta(a, b, 0, games);
        expect(win).toBeGreaterThanOrEqual(0);
        expect(loss).toBeLessThanOrEqual(0);
        expect(win).toBeGreaterThanOrEqual(draw);
        expect(draw).toBeGreaterThanOrEqual(loss);
        for (const d of [win, draw, loss]) expect(Math.abs(d)).toBeLessThanOrEqual(k);
        expect(Number.isInteger(win) && Number.isInteger(draw) && Number.isInteger(loss)).toBe(true);
      }
    }
  });

  it("Elo khởi điểm là 1500", () => {
    expect(DEFAULT_RATING).toBe(1500);
  });
});
