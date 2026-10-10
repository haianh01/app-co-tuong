// Ký hiệu nước đi kiểu Việt Nam, đối chiếu với cách ghi biên bản quen thuộc.

import { describe, expect, it } from "vitest";
import { m, pos } from "@/test/xiangqi";
import { applyMove, initialPosition, parseFen, sq } from "./engine";
import { PIECE_CHAR, PIECE_LETTER, PIECE_NAME, moveNotation } from "./notation";

const start = initialPosition().board;
const afterCannon = applyMove(initialPosition(), m(7, 7, 7, 4)).board;

describe("Đỏ: cột đánh số 1–9 từ phải sang trái (theo góc nhìn bên Đỏ)", () => {
  it.each([
    ["Pháo bình", m(7, 7, 7, 4), "P2-5"],
    ["Pháo cánh trái bình", m(7, 1, 7, 4), "P8-5"],
    ["Mã lên", m(9, 7, 7, 6), "M2.3"],
    ["Mã trái lên", m(9, 1, 7, 2), "M8.7"],
    ["Xe tiến", m(9, 8, 8, 8), "X1.1"],
    ["Xe trái tiến 2", m(9, 0, 7, 0), "X9.2"],
    ["Tốt tiến", m(6, 2, 5, 2), "B7.1"],
    ["Tốt giữa tiến", m(6, 4, 5, 4), "B5.1"],
    ["Tượng lên", m(9, 6, 7, 4), "T3.5"],
    ["Tượng trái lên", m(9, 2, 7, 4), "T7.5"],
    ["Sĩ lên", m(9, 5, 8, 4), "S4.5"],
    ["Sĩ trái lên", m(9, 3, 8, 4), "S6.5"],
    ["Tướng tiến", m(9, 4, 8, 4), "Tg5.1"],
  ])("%s → %s", (_name, move, text) => {
    expect(moveNotation(start, move)).toBe(text);
  });
});

describe("Đen: cột đánh số 1–9 từ phải sang trái theo góc nhìn bên Đen", () => {
  it.each([
    ["Mã lên", m(0, 7, 2, 6), "M8.7"],
    ["Mã phải lên", m(0, 1, 2, 2), "M2.3"],
    ["Pháo bình", m(2, 7, 2, 4), "P8-5"],
    ["Pháo phải bình", m(2, 1, 2, 4), "P2-5"],
    ["Tốt tiến", m(3, 2, 4, 2), "B3.1"],
    ["Xe tiến", m(0, 0, 1, 0), "X1.1"],
    ["Tượng lên", m(0, 2, 2, 4), "T3.5"],
    ["Sĩ lên", m(0, 3, 1, 4), "S4.5"],
    ["Tướng tiến", m(0, 4, 1, 4), "Tg5.1"],
  ])("%s → %s", (_name, move, text) => {
    expect(moveNotation(afterCannon, move)).toBe(text);
  });
});

describe("tiến / thoái / bình", () => {
  it("Xe, Pháo, Tốt, Tướng ghi số bước khi tiến/thoái", () => {
    const b = pos({ "9,4": "K", "0,3": "k", "4,0": "R", "5,8": "C" }).board;
    expect(moveNotation(b, m(4, 0, 8, 0))).toBe("X9/4");
    expect(moveNotation(b, m(4, 0, 0, 0))).toBe("X9.4");
    expect(moveNotation(b, m(5, 8, 9, 8))).toBe("P1/4");
    expect(moveNotation(pos({ "8,4": "K", "0,3": "k" }).board, m(8, 4, 9, 4))).toBe("Tg5/1");
  });

  it("Mã, Tượng, Sĩ ghi cột đích khi tiến/thoái (đi chéo)", () => {
    const b = pos({ "9,4": "K", "0,3": "k", "7,6": "N", "7,4": "B", "8,4": "A" }).board;
    expect(moveNotation(b, m(7, 6, 9, 7))).toBe("M3/2");
    expect(moveNotation(b, m(7, 6, 5, 5))).toBe("M3.4");
    expect(moveNotation(b, m(7, 4, 9, 2))).toBe("T5/7");
    expect(moveNotation(b, m(8, 4, 9, 5))).toBe("S5/4");
  });

  it("đi ngang ghi cột đích", () => {
    const b = pos({ "9,4": "K", "0,3": "k", "8,8": "R", "4,4": "P" }).board;
    expect(moveNotation(b, m(8, 8, 8, 7))).toBe("X1-2");
    expect(moveNotation(b, m(4, 4, 4, 3))).toBe("B5-6");
    expect(moveNotation(b, m(9, 4, 9, 5))).toBe("Tg5-4");
  });

  it("Đen thoái là đi lên phía trên bàn cờ", () => {
    const b = pos({ "9,3": "K", "0,4": "k", "5,0": "r", "2,6": "n" }).board;
    expect(moveNotation(b, m(5, 0, 1, 0))).toBe("X1/4");
    expect(moveNotation(b, m(2, 6, 0, 7))).toBe("M7/8");
  });
});

describe("hai quân cùng loại trên một cột: dùng 't' (trước) và 's' (sau)", () => {
  it("Đỏ: quân trước là quân gần phía Đen hơn", () => {
    const b = pos({ "9,4": "K", "0,3": "k", "5,0": "R", "8,0": "R" }).board;
    expect(moveNotation(b, m(5, 0, 5, 3))).toBe("Xt-6");
    expect(moveNotation(b, m(8, 0, 8, 4))).toBe("Xs-5");
    expect(moveNotation(b, m(5, 0, 2, 0))).toBe("Xt.3");
  });

  it("Đen: quân trước là quân gần phía Đỏ hơn", () => {
    const b = pos({ "9,3": "K", "0,4": "k", "2,0": "r", "4,0": "r" }).board;
    expect(moveNotation(b, m(4, 0, 5, 0))).toBe("Xt.1");
    expect(moveNotation(b, m(2, 0, 1, 0))).toBe("Xs/1");
  });

  it("áp dụng cho cả Mã, Pháo", () => {
    const b = pos({ "9,4": "K", "0,3": "k", "5,2": "N", "7,2": "N", "6,7": "C", "8,7": "C" }).board;
    expect(moveNotation(b, m(5, 2, 3, 3))).toBe("Mt.6");
    expect(moveNotation(b, m(7, 2, 9, 1))).toBe("Ms/8");
    expect(moveNotation(b, m(8, 7, 8, 4))).toBe("Ps-5");
  });

  it("khác loại quân hoặc khác màu trên cùng cột thì vẫn ghi số cột", () => {
    expect(moveNotation(pos({ "9,4": "K", "0,3": "k", "5,0": "R", "8,0": "C" }).board, m(5, 0, 5, 3))).toBe("X9-6");
    expect(moveNotation(pos({ "9,4": "K", "0,3": "k", "5,0": "R", "2,0": "r" }).board, m(5, 0, 5, 3))).toBe("X9-6");
  });
});

describe("trường hợp biên", () => {
  it("ô xuất phát trống trả về '?'", () => {
    expect(moveNotation(start, m(5, 4, 4, 4))).toBe("?");
  });

  it("lời giải cờ thế ghi đúng", () => {
    const b = parseFen("3aka3/8R/7c1/p7p/2N6/9/9/9/9/5K3 w").board;
    expect(moveNotation(b, { from: sq(4, 2), to: sq(2, 3) })).toBe("M7.6");
  });
});

describe("bảng tên quân", () => {
  it("đủ 7 loại quân, chữ viết tắt không trùng nhau", () => {
    const types = ["k", "a", "b", "n", "r", "c", "p"] as const;
    for (const t of types) {
      expect(PIECE_LETTER[t]).toMatch(/\S/);
      expect(PIECE_NAME[t]).toMatch(/\S/);
    }
    expect(new Set(Object.values(PIECE_LETTER)).size).toBe(7);
  });

  it("đủ chữ Hán cho 14 quân, Đỏ và Đen khác chữ", () => {
    const letters = "kabnrcp".split("");
    for (const l of letters) {
      expect(PIECE_CHAR[l.toUpperCase()]).toBeTruthy();
      expect(PIECE_CHAR[l]).toBeTruthy();
      expect(PIECE_CHAR[l.toUpperCase()]).not.toBe(PIECE_CHAR[l]);
    }
  });
});
