import { describe, expect, it } from "vitest";
import { rankTitle } from "@/lib/online/rank";
import { expectedScore, kFactor, ratingDelta } from "./rating";

describe("Elo", () => {
  it("hai người ngang điểm: thắng +K/2, thua −K/2, hòa 0", () => {
    expect(ratingDelta(1500, 1500, 1, 0)).toBe(20);
    expect(ratingDelta(1500, 1500, 0, 0)).toBe(-20);
    expect(ratingDelta(1500, 1500, 0.5, 0)).toBe(0);
  });

  it("thắng người mạnh hơn được nhiều điểm hơn", () => {
    expect(ratingDelta(1500, 1700, 1, 0)).toBeGreaterThan(ratingDelta(1500, 1300, 1, 0));
    expect(expectedScore(1700, 1500)).toBeCloseTo(0.76, 2);
  });

  it("người chơi lâu năm thay đổi điểm chậm hơn", () => {
    expect(kFactor(29)).toBe(40);
    expect(kFactor(30)).toBe(20);
    expect(ratingDelta(1500, 1500, 1, 100)).toBe(10);
  });
});

describe("danh hiệu", () => {
  it("theo mốc Elo", () => {
    expect(rankTitle(1500).name).toBe("Tam đẳng");
    expect(rankTitle(1199).name).toBe("Tân thủ");
    expect(rankTitle(1200).name).toBe("Nhất đẳng");
    expect(rankTitle(2100).seal).toBe("大師");
  });
});
