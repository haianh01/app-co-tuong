import { describe, expect, it } from "vitest";
import { sq } from "@/lib/xiangqi/engine";
import { GameRoom } from "./room";

const RED = { id: "u-red", username: "do", displayName: "Đỏ", rating: 1500 };
const BLACK = { id: "u-black", username: "den", displayName: "Đen", rating: 1500 };
const T0 = 1_000_000;

const P2_5 = { from: sq(7, 7), to: sq(7, 4) };
const M8_7 = { from: sq(0, 7), to: sq(2, 6) };
const M2_3 = { from: sq(9, 7), to: sq(7, 6) };

function room(minutes = 10, fen?: string) {
  return new GameRoom("abcdef12", { r: RED, b: BLACK }, minutes, T0, { fen });
}

/** Đi hai nước mở đầu để đồng hồ bắt đầu chạy. */
function opened(at = T0) {
  const g = room();
  expect(g.move(RED.id, P2_5, at)).toBeNull();
  expect(g.move(BLACK.id, M8_7, at)).toBeNull();
  return g;
}

describe("GameRoom", () => {
  it("chặn người ngoài, sai lượt và nước sai luật", () => {
    const g = room();
    expect(g.move("u-khac", P2_5, T0)).toMatch(/không phải người chơi/);
    expect(g.move(BLACK.id, M8_7, T0)).toMatch(/Chưa đến lượt/);
    expect(g.move(RED.id, { from: sq(9, 0), to: sq(5, 0) }, T0)).toMatch(/không hợp lệ/);
    expect(g.move(RED.id, P2_5, T0)).toBeNull();
    expect(g.plies).toBe(1);
  });

  it("đồng hồ chỉ chạy sau khi hai bên đã đi nước đầu", () => {
    const g = room();
    g.move(RED.id, P2_5, T0 + 20_000);
    g.move(BLACK.id, M8_7, T0 + 45_000);
    expect(g.snapshot(T0 + 45_000).clocks).toEqual({ r: 600_000, b: 600_000 });
    g.move(RED.id, M2_3, T0 + 52_000);
    expect(g.snapshot(T0 + 52_000).clocks).toEqual({ r: 593_000, b: 600_000 });
    expect(g.snapshot(T0 + 55_000).clocks).toEqual({ r: 593_000, b: 597_000 });
  });

  it("hết giờ thì thua", () => {
    const g = opened();
    expect(g.update(T0 + 599_999)).toBe(false);
    expect(g.update(T0 + 600_000)).toBe(true);
    expect(g.status).toBe("ended");
    expect(g.result).toEqual({ winner: "b", reason: "timeout" });
    expect(g.snapshot(T0 + 700_000).clocks.r).toBe(0);
  });

  it("nước đi gửi tới sau khi đã hết giờ vẫn bị xử thua", () => {
    const g = opened();
    expect(g.move(RED.id, M2_3, T0 + 600_500)).toMatch(/kết thúc/);
    expect(g.result).toEqual({ winner: "b", reason: "timeout" });
  });

  it("không đi nước đầu trong thời hạn thì hủy ván", () => {
    const g = room();
    expect(g.snapshot(T0).firstMoveDeadline).toBe(T0 + 30_000);
    g.move(RED.id, P2_5, T0 + 10_000);
    expect(g.update(T0 + 39_999)).toBe(false);
    expect(g.update(T0 + 40_000)).toBe(true);
    expect(g.status).toBe("aborted");
    expect(g.result).toBeNull();
  });

  it("chỉ được hủy ván trước khi đủ hai nước", () => {
    const g = room();
    g.move(RED.id, P2_5, T0);
    expect(g.abort(BLACK.id, T0)).toBeNull();
    expect(g.status).toBe("aborted");
    expect(opened().abort(RED.id, T0)).toMatch(/Chỉ hủy được/);
  });

  it("xin thua", () => {
    const g = opened();
    expect(g.resign(BLACK.id, T0 + 1000)).toBeNull();
    expect(g.result).toEqual({ winner: "r", reason: "resign" });
    expect(g.resign(RED.id, T0 + 2000)).toMatch(/kết thúc/);
  });

  it("cầu hòa: đề nghị, từ chối, chấp nhận", () => {
    const g = opened();
    expect(g.draw(RED.id, "accept", T0)).toMatch(/Không có lời cầu hòa/);
    expect(g.draw(RED.id, "offer", T0)).toBeNull();
    expect(g.drawOffer).toBe("r");
    expect(g.draw(BLACK.id, "decline", T0)).toBeNull();
    expect(g.drawOffer).toBeNull();
    g.draw(BLACK.id, "offer", T0);
    expect(g.draw(RED.id, "accept", T0)).toBeNull();
    expect(g.result).toEqual({ winner: null, reason: "agreement" });
  });

  it("đi một nước sẽ hủy lời cầu hòa đang chờ", () => {
    const g = opened();
    g.draw(BLACK.id, "offer", T0);
    g.move(RED.id, M2_3, T0 + 1000);
    expect(g.drawOffer).toBeNull();
  });

  it("mất kết nối quá lâu thì xử thua, vào lại kịp thì không sao", () => {
    const g = opened();
    g.setConnected("r", true, T0);
    g.setConnected("b", true, T0);
    g.setConnected("b", false, T0 + 1000);
    g.setConnected("b", true, T0 + 50_000);
    expect(g.update(T0 + 70_000)).toBe(false);
    g.setConnected("b", false, T0 + 80_000);
    expect(g.update(T0 + 140_000)).toBe(true);
    expect(g.result).toEqual({ winner: "r", reason: "abandon" });
  });

  it("chiếu bí kết thúc ván", () => {
    const g = room(10, "3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
    expect(g.move(RED.id, { from: sq(2, 8), to: sq(2, 3) }, T0)).toBeNull();
    expect(g.status).toBe("ended");
    expect(g.result).toEqual({ winner: "r", reason: "checkmate" });
  });
});
