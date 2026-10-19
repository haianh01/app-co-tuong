import { describe, expect, it } from "vitest";
import { type Board, type Move, legalMoves, opponent, play, sq, type Side } from "./engine";
import { moveNotation } from "./notation";
import { explainMovePlan } from "./move-plan";

/** Dựng bàn cờ từ danh sách quân: chữ hoa là Đỏ, chữ thường là Đen; hàng 0 là đáy Đen, hàng 9 là đáy Đỏ. */
function boardOf(pieces: [string, number, number][]): Board {
  const b: Board = Array(90).fill(null);
  for (const [p, r, c] of pieces) b[sq(r, c)] = p;
  return b;
}

/** Tìm nước theo ký hiệu Việt Nam, báo lỗi nếu không hợp lệ (để test không lặng lẽ sai thế cờ). */
function mv(board: Board, notation: string, turn: Side = "r"): Move {
  const m = legalMoves({ board, turn }).find((x) => moveNotation(board, x) === notation);
  if (!m) throw new Error(`Không có nước ${notation}`);
  return m;
}

/** Chuỗi nước theo ký hiệu, Đỏ đi trước, hai bên luân phiên. */
function line(board: Board, notations: string[]): Move[] {
  const out: Move[] = [];
  let b = board;
  let turn: Side = "r";
  for (const n of notations) {
    const m = mv(b, n, turn);
    out.push(m);
    b = play(b, m);
    turn = opponent(turn);
  }
  return out;
}

describe("explainMovePlan", () => {
  it("Xe tiến dọa ăn Mã không căn, Đen phải chạy Mã, Đỏ tiếp tục đưa Xe", () => {
    // Đỏ: Tướng e0, Xe a0. Đen: Tướng d9, Mã c6 không có quân giữ.
    const b = boardOf([["K", 9, 4], ["R", 9, 0], ["k", 0, 3], ["n", 3, 2]]);
    const pv = line(b, ["X9.6", "M3.5", "X9.3"]);
    const plan = explainMovePlan(b, pv[0], pv)!;
    expect(plan.threat).toMatchObject({ kind: "capture", by: "moved", victim: "Mã" });
    expect(plan.replyRole).toBe("chayQuan");
    expect(plan.followUpRole).toBe("tiepTuc");
    expect(plan.steps[0].text).toContain("Xe dọa ăn Mã");
    expect(plan.steps[1].text).toContain("buộc phải chạy Mã");
  });

  it("Mã nhảy lên làm ngòi cho Pháo dọa ăn Xe; Đen bỏ mặc thì Đỏ thực hiện đòn dọa", () => {
    // Pháo Đỏ b2 nhìn thẳng Xe Đen b7, chưa có ngòi. Mã Đỏ c2 nhảy lên b4 làm ngòi.
    const b = boardOf([["K", 9, 4], ["C", 7, 1], ["N", 7, 2], ["k", 0, 3], ["r", 2, 1]]);
    const pv = line(b, ["M7.8", "Tg4.1", "P8.5"]);
    const plan = explainMovePlan(b, pv[0], pv)!;
    expect(plan.threat).toMatchObject({ kind: "capture", by: "screen", victim: "Xe" });
    expect(plan.steps[0].text).toContain("làm ngòi cho Pháo dọa ăn Xe");
    expect(plan.replyRole).toBe("boMac");
    expect(plan.followUpRole).toBe("thucHienDoa");
  });

  it("Mã ra khỏi đường, nước sau Xe đi qua ô cũ của Mã: nói rõ nước đầu đã dọn đường", () => {
    // Xe Đỏ a0 bị Mã Đỏ a2 chắn; Mã nhảy b4 rồi Xe tiến a4.
    const b = boardOf([["K", 9, 4], ["R", 9, 0], ["N", 7, 0], ["k", 0, 3]]);
    const pv = line(b, ["M9.8", "Tg4.1", "X9.4"]);
    const plan = explainMovePlan(b, pv[0], pv)!;
    expect(plan.followUpRole).toBe("donDuong");
    expect(plan.steps[2].text).toContain("dọn đường cho Xe");
  });

  it("Xe bình sang khóa hàng 2, dọa Xe kia xuống đáy chiếu bí; Đen phải chặn lộ 5", () => {
    // Xe Đỏ lộ 5 giữ cột giữa (Tướng Đen không ăn được Xe ở e9 vì sẽ lộ mặt Tướng). Xe lộ 1 lên hàng 2 của Đen
    // khóa đường chạy d8 thì Xe lộ 5 xuống đáy là sát. Đen chỉ có Xe a7 kịp bình sang chặn lộ 5.
    const b = boardOf([["K", 9, 4], ["R", 5, 4], ["R", 9, 8], ["k", 0, 3], ["r", 2, 0]]);
    const pv = line(b, ["X1.8", "X1-5"]);
    const plan = explainMovePlan(b, pv[0], pv)!;
    expect(plan.threat?.kind).toBe("mate");
    expect(plan.steps[0].text).toContain("chiếu bí");
    expect(plan.replyRole).toBe("phongSat");
  });

  it("đòn dọa có sẵn từ trước không bị gán cho một nước Tốt không liên quan", () => {
    // Xe Đỏ a6 đã nhìn Mã Đen c6 từ trước; Đỏ đi Tốt i3 lên i4.
    const b = boardOf([["K", 9, 4], ["R", 3, 0], ["P", 6, 8], ["k", 0, 3], ["n", 3, 2]]);
    const plan = explainMovePlan(b, mv(b, "B1.1"), []);
    expect(plan?.threat ?? null).toBeNull();
  });

  it("hai Mã cùng dọa nhau, Đen ăn trước: là ăn luôn, không phải ăn lại", () => {
    const b = boardOf([["K", 9, 4], ["N", 7, 2], ["k", 0, 3], ["n", 3, 2]]);
    const pv = line(b, ["M7.6", "M3.4"]);
    const plan = explainMovePlan(b, pv[0], pv)!;
    expect(plan.threat).toMatchObject({ kind: "capture", by: "moved", victim: "Mã" });
    expect(plan.replyRole).toBe("anLai");
    expect(plan.steps[1].text).toContain("ăn luôn Mã");
    expect(plan.steps[1].text).not.toContain("ăn lại");
  });

  it("nước chiếu bí không kèm biến tiếp theo", () => {
    const b = boardOf([["K", 9, 4], ["R", 5, 4], ["R", 1, 8], ["k", 0, 3]]);
    const m = mv(b, "X5.5");
    const plan = explainMovePlan(b, m, [m])!;
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].text).toContain("chiếu bí");
    expect(plan.aim).toBeNull();
  });
});
