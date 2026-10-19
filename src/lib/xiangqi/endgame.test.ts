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

  // Các thế dưới đây đã kiểm bằng Pikafish trên 30 thế ngẫu nhiên mỗi cấu hình (xem VERIFIED_RULES trong endgame.ts).
  it("Mã Tốt cao (không Sĩ Tượng) hòa Sĩ Tượng toàn — không phải thắng như bảng cũ (Pikafish hòa 29/30)", () => {
    const b = boardOf("2bakab2/9/9/4P4/9/4N4/9/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("draw_horse_pawn_vs_full_guards");
    expect(res?.outcome).toBe("draw");
  });

  it("Mã Tốt đáy hòa Sĩ Tượng toàn", () => {
    const b = boardOf("2bakab1P/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1");
    expect(detectTheoreticalEndgame(b)?.outcome).toBe("draw");
  });

  it("Mã Tốt đáy (có Sĩ Tượng) vẫn thắng Song Sĩ khuyết Tượng (Pikafish thắng 28/30)", () => {
    const b = boardOf("3aka1P1/9/9/9/9/4N4/9/9/9/2BAKAB2 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_horse_pawn_vs_advisors");
    expect(res?.winner).toBe("r");
  });

  it("Pháo Tốt cao có đủ Sĩ Tượng làm ngòi thắng Sĩ Tượng toàn (Pikafish thắng 27/30)", () => {
    const b = boardOf("2bakab2/9/9/4P4/9/4C4/9/9/9/2BAKAB2 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_cannon_pawn_full_guards");
    expect(res?.winner).toBe("r");
  });

  it("Pháo Tốt chỉ có một Sĩ làm ngòi: chưa đủ cơ sở kết luận (Pikafish chỉ thắng 9/30 khi có Song Sĩ)", () => {
    const b = boardOf("2bakab2/9/9/4P4/9/4C4/9/9/4A4/4K4 w - - 0 1");
    expect(detectTheoreticalEndgame(b)).toBeNull();
  });

  it("Pháo Tốt không ngòi hòa Sĩ Tượng toàn (Pikafish hòa 30/30)", () => {
    const b = boardOf("2bakab2/9/9/4P4/9/4C4/9/9/9/4K4 w - - 0 1");
    expect(detectTheoreticalEndgame(b)?.id).toBe("draw_cannon_pawn_no_screen");
  });

  it("Pháo Tốt đáy hòa Sĩ Tượng toàn dù có Sĩ Tượng làm ngòi (Pikafish hòa 29/30)", () => {
    const b = boardOf("2bakab1P/9/9/9/9/4C4/9/9/9/2BAKAB2 w - - 0 1");
    expect(detectTheoreticalEndgame(b)?.id).toBe("draw_cannon_bottom_pawn_vs_full_guards");
  });

  it("Mã Pháo thắng Sĩ Tượng toàn (Pikafish thắng 30/30 khi bên công không có Sĩ Tượng)", () => {
    const b = boardOf("2bakab2/9/9/9/9/4N4/4C4/9/9/4K4 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_horse_cannon_vs_guards");
    expect(res?.winner).toBe("r");
  });

  it("Song Tốt hòa Sĩ Tượng toàn (Pikafish hòa 30/30)", () => {
    const b = boardOf("2bakab2/9/9/3P1P3/9/9/9/9/9/4K4 w - - 0 1");
    expect(detectTheoreticalEndgame(b)?.id).toBe("draw_pawn_pair_vs_full_guards");
  });

  it("Xe Tốt hòa Xe Sĩ Tượng toàn (Pikafish hòa 29/30)", () => {
    const b = boardOf("2bakab2/9/4r4/4P4/9/9/4R4/9/9/2BAKAB2 w - - 0 1");
    expect(detectTheoreticalEndgame(b)?.id).toBe("draw_rook_pawn_vs_rook_guards");
  });

  it("Xe Mã có Sĩ Tượng thắng Xe đơn không Sĩ Tượng (Pikafish thắng 27/30)", () => {
    const b = boardOf("4k4/9/4r4/9/9/9/4R4/3N5/9/2BAKAB2 w - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_rook_horse_vs_bare_rook");
    expect(res?.winner).toBe("r");
  });

  it("không suy rộng ra ngoài cấu hình đã kiểm: Mã Tốt có 1 Sĩ đối Sĩ Tượng toàn chưa kết luận", () => {
    // Đã kiểm: không Sĩ Tượng (hòa 29/30) và đủ Sĩ Tượng (hòa 25/30, chưa đủ 90%). Có 1 Sĩ nằm giữa: không nói gì.
    const b = boardOf("2bakab2/9/9/4P4/9/4N4/9/9/4A4/4K4 w - - 0 1");
    expect(detectTheoreticalEndgame(b)).toBeNull();
  });

  it("Mã Tốt chưa qua sông không được tính là thắng Song Sĩ khuyết Tượng", () => {
    const b = boardOf("3aka3/9/9/9/9/4N4/4P4/9/9/2BAKAB2 w - - 0 1");
    expect(detectTheoreticalEndgame(b)?.id).not.toBe("win_horse_pawn_vs_advisors");
  });

  it("Xe Tốt không Sĩ Tượng đối Xe Sĩ Tượng toàn: không khẳng định hòa (bên thủ còn Xe có thể thắng ngược)", () => {
    const b = boardOf("2bakab2/9/4r4/4P4/9/9/4R4/9/9/4K4 w - - 0 1");
    expect(detectTheoreticalEndgame(b)?.id).not.toBe("draw_rook_pawn_vs_rook_guards");
  });

  it("luật kiểm chứng áp cho cả hai phía: Đen Mã Pháo đối Đỏ Sĩ Tượng toàn", () => {
    const b = boardOf("4k4/9/9/4n4/4c4/9/9/9/9/2BAKAB2 b - - 0 1");
    const res = detectTheoreticalEndgame(b);
    expect(res?.id).toBe("win_horse_cannon_vs_guards");
    expect(res?.winner).toBe("b");
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
