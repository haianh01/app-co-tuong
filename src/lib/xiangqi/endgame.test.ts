import { describe, expect, it } from "vitest";
import { parseFen } from "./engine";
import { detectTheoreticalEndgame } from "./endgame";

const boardOf = (fen: string) => parseFen(fen).board;

describe("detectTheoreticalEndgame - Nhận diện tàn cuộc lý thuyết", () => {
  it("trung cuộc nhiều quân lớn trả về null", () => {
    // Thế cờ khai cuộc / trung cuộc
    const b = boardOf("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
    expect(detectTheoreticalEndgame(b)).toBeNull();
  });

  it("cạn quân tấn công (chỉ còn Tướng Sĩ Tượng) là hòa lý thuyết", () => {
    const b = boardOf("4k4/4a4/4b4/9/9/9/9/4B4/4A4/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res).not.toBeNull();
    expect(res?.id).toBe("draw_bare_kings");
    expect(res?.outcome).toBe("draw");
  });

  it("Đơn Xe hòa Đơn Xe", () => {
    const b = boardOf("4k4/4a4/4b4/9/9/4R4/4r4/4B4/4A4/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_single_rook_each");
    expect(res?.outcome).toBe("draw");
  });

  it("Đơn Pháo không ngòi hòa Đơn Tướng", () => {
    // Đỏ có 1 Pháo, không có quân nào khác
    const b = boardOf("4k4/9/9/9/9/4C4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_cannon_no_screen");
    expect(res?.outcome).toBe("draw");
  });

  it("Đơn Pháo hòa Sĩ Tượng", () => {
    const b = boardOf("3ak4/9/4b4/9/9/4C4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_single_cannon_vs_guards");
    expect(res?.outcome).toBe("draw");
  });

  it("Đơn Mã thắng Đơn Tướng trần", () => {
    const b = boardOf("4k4/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_single_horse_vs_bare_king");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("r");
  });

  it("Đơn Mã hòa Song Sĩ (Sĩ bền)", () => {
    const b = boardOf("3aka3/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_single_horse_vs_advisors");
    expect(res?.outcome).toBe("draw");
  });

  it("Đơn Mã hòa Song Tượng", () => {
    const b = boardOf("4k4/9/2b1b4/9/9/4N4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_single_horse_vs_elephants");
    expect(res?.outcome).toBe("draw");
  });

  it("Đơn Xe hòa Sĩ Tượng toàn", () => {
    // Đen đủ 2 Sĩ 2 Tượng, Đỏ có 1 Xe
    const b = boardOf("2bakab2/9/9/9/9/4R4/9/9/4A4/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_rook_vs_full_guards");
    expect(res?.outcome).toBe("draw");
  });

  it("Đơn Xe thắng Song Sĩ khuyết Tượng", () => {
    const b = boardOf("3aka3/9/9/9/9/4R4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_rook_vs_advisors_no_elephants");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("r");
  });

  it("Đơn Xe thắng Song Tượng khuyết Sĩ", () => {
    const b = boardOf("2b1k1b2/9/9/9/9/4R4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_rook_vs_elephants_no_advisors");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("r");
  });

  it("Đơn Xe thắng Đơn Pháo", () => {
    const b = boardOf("4k4/9/9/9/4c4/4R4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_rook_vs_cannon");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("r");
  });

  it("Đơn Xe thắng Đơn Mã", () => {
    const b = boardOf("4k4/9/9/9/4n4/4R4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_rook_vs_horse");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("r");
  });

  it("Mã Chốt cao thắng Sĩ Tượng toàn", () => {
    // Đen Sĩ Tượng toàn, Đỏ có Mã và Chốt ở hàng 3 (qua sông, chưa lọt đáy)
    const b = boardOf("2bakab2/9/9/4P4/9/4N4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_horse_pawn_vs_full_guards");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("r");
  });

  it("Mã Chốt đáy (Tốt già) hòa Sĩ Tượng toàn", () => {
    // Đỏ có Chốt ở hàng 0 (đáy)
    const b = boardOf("2bakab1P/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_horse_low_pawn_vs_guards");
    expect(res?.outcome).toBe("draw");
  });

  it("Pháo Chốt có ngòi thắng Sĩ Tượng toàn", () => {
    // Đỏ có Pháo, Chốt cao, và Sĩ làm ngòi
    const b = boardOf("2bakab2/9/9/4P4/9/4C4/9/9/4A4/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_cannon_pawn_screen_vs_full_guards");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("r");
  });

  it("Đơn Chốt hòa Đơn Sĩ", () => {
    const b = boardOf("3ak4/9/9/4P4/9/9/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_single_pawn_vs_guards");
    expect(res?.outcome).toBe("draw");
  });

  it("Đen tấn công: Đen có Đơn Xe thắng Đỏ Song Sĩ khuyết Tượng", () => {
    const b = boardOf("4k4/9/9/9/4r4/9/9/9/3AKA3/4K4 b - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_rook_vs_advisors_no_elephants");
    expect(res?.outcome).toBe("win");
    expect(res?.winner).toBe("b");
  });
});
