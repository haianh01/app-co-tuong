import { describe, expect, it } from "vitest";
import { computeBadges, type BadgeStats } from "@/lib/badges";
import { applyMove, initialPosition, legalMoves } from "./engine";
import { moveNotation } from "./notation";
import { isBookMove, openingOf, tallyOpenings } from "./openings";

const start = initialPosition();
const red = (n: string) => openingOf(n).name;

describe("nhận diện khai cuộc", () => {
  it("các khai cuộc phổ biến của Đỏ", () => {
    expect(red("P2-5")).toBe("Pháo đầu (Trung pháo)");
    expect(red("P8-5")).toBe("Pháo đầu (Trung pháo)");
    expect(red("M2.3")).toBe("Khởi mã");
    expect(red("M8.7")).toBe("Khởi mã");
    expect(red("T3.5")).toBe("Phi tượng");
    expect(red("T7.5")).toBe("Phi tượng");
    expect(red("B3.1")).toBe("Tiên nhân chỉ lộ (tiến tốt)");
    expect(red("B7.1")).toBe("Tiên nhân chỉ lộ (tiến tốt)");
  });

  it("phân biệt sĩ giác pháo (cùng bên) và quá cung pháo (sang bên kia cung)", () => {
    expect(red("P2-4")).toBe("Sĩ giác pháo");
    expect(red("P8-6")).toBe("Sĩ giác pháo");
    expect(red("P2-6")).toBe("Quá cung pháo");
    expect(red("P8-4")).toBe("Quá cung pháo");
  });

  it("nước hiếm gom vào nhóm chung, không bao giờ lỗi", () => {
    expect(red("X1.1")).toBe("Khai cuộc khác");
    expect(red("Tg5.1")).toBe("Khai cuộc khác");
    expect(red("T3.1")).toBe("Khai cuộc khác");
    expect(red("")).toBe("Khai cuộc khác");
  });

  it("mọi nước đầu hợp lệ của cả hai bên đều nhận diện được", () => {
    for (const m of legalMoves(start)) {
      expect(openingOf(moveNotation(start.board, m)).name).toMatch(/\S/);
      const after = applyMove(start, m);
      for (const r of legalMoves(after)) expect(openingOf(moveNotation(after.board, r)).id).toBeTruthy();
    }
  });

  it("thống kê theo khai cuộc gộp đúng và xếp theo số ván", () => {
    const stats = tallyOpenings([
      { notation: "P2-5", result: "win" },
      { notation: "P8-5", result: "loss" },
      { notation: "P2-5", result: "draw" },
      { notation: "M2.3", result: "win" },
    ]);
    expect(stats[0]).toMatchObject({ id: "center", games: 3, wins: 1, draws: 1, losses: 1 });
    expect(stats[1]).toMatchObject({ id: "horse", games: 1, wins: 1 });
  });

  it("nhận diện các nước trong cây khai cuộc chuẩn", () => {
    // Nước đầu tiên
    expect(isBookMove(["P2-5"])).toBe(true);
    expect(isBookMove(["M8.7"])).toBe(true);
    expect(isBookMove(["X1.1"])).toBe(false);

    // Chuỗi Pháo đầu đối Bình Phong Mã
    expect(isBookMove(["P2-5", "M8.7"])).toBe(true);
    expect(isBookMove(["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"])).toBe(true);
    // Nước lệch khỏi sách
    expect(isBookMove(["P2-5", "M8.7", "Tg5.1"])).toBe(false);
  });
});

describe("huy hiệu", () => {
  const base: BadgeStats = { gamesPlayed: 0, wins: 0, peakRating: 1500, puzzlesSolved: 0, puzzlesTotal: 45, seasonsTop10: 0, vip: false };
  const earned = (s: Partial<BadgeStats>) => computeBadges({ ...base, ...s }).filter((b) => b.earned).map((b) => b.id);

  it("tài khoản mới chưa có huy hiệu nào", () => {
    expect(earned({})).toEqual([]);
  });

  it("thua ván đầu vẫn được 'Nhập môn' nhưng chưa có 'Khai thắng'", () => {
    expect(earned({ gamesPlayed: 1 })).toEqual(["first-game"]);
  });

  it("Elo cao nhất từng đạt được giữ huy hiệu dù Elo hiện tại tụt", () => {
    expect(earned({ gamesPlayed: 50, wins: 30, peakRating: 1810 })).toEqual(
      expect.arrayContaining(["elo-1600", "elo-1800"]),
    );
    expect(earned({ peakRating: 1810 })).not.toContain("elo-2000");
  });

  it("'Vua cờ thế' cần giải hết, không được khi danh sách trống", () => {
    expect(earned({ puzzlesSolved: 44 })).not.toContain("puzzle-all");
    expect(earned({ puzzlesSolved: 45 })).toContain("puzzle-all");
    expect(earned({ puzzlesTotal: 0 })).not.toContain("puzzle-all");
  });
});
