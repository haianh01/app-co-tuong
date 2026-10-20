import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_CONTROL, clockAfterMove, readClock, startClock, stopClock } from "./game-clock";

const S = 1000;

describe("game-clock", () => {
  it("mỗi bên 15 phút, bên tới lượt bị trừ giờ, mỗi nước đếm lùi từ 1 phút", () => {
    const c = startClock(DEFAULT_TIME_CONTROL, "r", 0);
    expect(readClock(c, 20 * S)).toEqual({ total: { r: 880 * S, b: 900 * S }, perMove: 40 * S });
  });

  it("phát hiện nước đi: chốt giờ bên vừa đi, chuyển lượt, đồng hồ từng nước đặt lại", () => {
    let c = startClock(DEFAULT_TIME_CONTROL, "r", 0);
    c = clockAfterMove(c, "r", 12 * S); // Đỏ nghĩ 12 giây
    expect(readClock(c, 12 * S)).toEqual({ total: { r: 888 * S, b: 900 * S }, perMove: 60 * S });
    c = clockAfterMove(c, "b", 42 * S); // Đen nghĩ 30 giây
    expect(readClock(c, 50 * S)).toEqual({ total: { r: 880 * S, b: 870 * S }, perMove: 52 * S });
  });

  it("quá 1 phút cho một nước: đồng hồ từng nước dừng ở 0, tổng vẫn trừ tiếp", () => {
    const c = startClock(DEFAULT_TIME_CONTROL, "b", 0);
    expect(readClock(c, 75 * S)).toEqual({ total: { r: 900 * S, b: 825 * S }, perMove: 0 });
  });

  it("đọc bù 2 nước trong một nhịp: bên thứ hai không bị trừ giờ", () => {
    let c = startClock(DEFAULT_TIME_CONTROL, "r", 0);
    c = clockAfterMove(c, "r", 10 * S);
    c = clockAfterMove(c, "b", 10 * S);
    expect(readClock(c, 10 * S).total).toEqual({ r: 890 * S, b: 900 * S });
  });

  it("vào giữa ván: lấy giờ còn lại đã biết; hết ván thì dừng", () => {
    let c = startClock(DEFAULT_TIME_CONTROL, "r", 0, { r: 600 * S, b: 540 * S });
    c = stopClock(c, 5 * S);
    expect(readClock(c, 100 * S)).toEqual({ total: { r: 595 * S, b: 540 * S }, perMove: null });
  });
});
