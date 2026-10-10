import { describe, expect, it } from "vitest";
import { DEFAULT_RATING } from "@/server/rating";
import { rankTitle } from "./rank";

describe("danh hiệu theo Elo", () => {
  // [Elo, danh hiệu]: kiểm tra đúng mốc và ngay dưới mốc của từng bậc.
  it.each([
    [3000, "Đại sư"],
    [2100, "Đại sư"],
    [2099, "Cửu đẳng"],
    [2025, "Cửu đẳng"],
    [2024, "Bát đẳng"],
    [1950, "Bát đẳng"],
    [1949, "Thất đẳng"],
    [1850, "Thất đẳng"],
    [1849, "Lục đẳng"],
    [1750, "Lục đẳng"],
    [1749, "Ngũ đẳng"],
    [1650, "Ngũ đẳng"],
    [1649, "Tứ đẳng"],
    [1550, "Tứ đẳng"],
    [1549, "Tam đẳng"],
    [1400, "Tam đẳng"],
    [1399, "Nhị đẳng"],
    [1300, "Nhị đẳng"],
    [1299, "Nhất đẳng"],
    [1200, "Nhất đẳng"],
    [1199, "Tân thủ"],
    [800, "Tân thủ"],
    [0, "Tân thủ"],
    [-100, "Tân thủ"],
  ])("Elo %i → %s", (rating, name) => {
    expect(rankTitle(rating).name).toBe(name);
  });

  it("người mới (Elo khởi điểm) là Tam đẳng", () => {
    expect(rankTitle(DEFAULT_RATING)).toMatchObject({ name: "Tam đẳng", seal: "三段" });
  });

  it("Elo càng cao danh hiệu càng không thấp hơn", () => {
    let prevMin = -Infinity;
    for (let r = 0; r <= 2500; r += 25) {
      const { min } = rankTitle(r);
      expect(min).toBeGreaterThanOrEqual(prevMin);
      expect(r).toBeGreaterThanOrEqual(min);
      prevMin = min;
    }
  });

  it("mỗi bậc có ấn (chữ Hán) riêng", () => {
    const seals = new Map<string, string>();
    for (let r = 0; r <= 2500; r += 25) {
      const t = rankTitle(r);
      expect(t.seal).toMatch(/\S/);
      seals.set(t.name, t.seal);
    }
    expect(seals.size).toBe(11);
    expect(new Set(seals.values()).size).toBe(11);
  });
});
