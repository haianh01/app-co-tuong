import { describe, expect, it } from "vitest";
import { applyMove, legalMoves, parseFen, sq } from "./engine";
import { forcesWin, toughestReply, verifySolution, winningMoves } from "./mate";

// Thế "Bạch diện tướng": X1-6 (2,8 → 2,3) chiếu bí ngay.
const MATE1 = parseFen("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
const X16 = { from: sq(2, 8), to: sq(2, 3) };
// Hai xe: xe dưới chiếu (tướng chỉ còn lên/xuống trong cung), xe kia đóng nốt.
const MATE2 = parseFen("4k4/9/9/9/9/9/9/9/R8/R3K4 w");

describe("sát cục ép buộc", () => {
  it("tìm đúng nước sát 1 nước", () => {
    expect(winningMoves(MATE1, 1)).toContainEqual(X16);
    expect(forcesWin(MATE1, 1)).toBe(true);
  });

  it("thế ban đầu không có nước thắng thì forcesWin là false", () => {
    expect(forcesWin(parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"), 1)).toBe(false);
  });

  it("song xe ép sát trong 2 nước nhưng không sát được trong 1 nước", () => {
    expect(forcesWin(MATE2, 1)).toBe(false);
    expect(forcesWin(MATE2, 2)).toBe(true);
  });

  it("nước phòng thủ của máy luôn là nước đúng luật", () => {
    const first = winningMoves(MATE2, 2)[0];
    const after = applyMove(MATE2, first);
    const reply = toughestReply(after, 1)!;
    expect(legalMoves(after)).toContainEqual(reply);
  });
});

describe("kiểm tra lời giải gửi lên máy chủ", () => {
  it("nhận lời giải đúng", () => {
    expect(verifySolution(MATE1, [X16], 1)).toBe(true);
  });

  it("từ chối nước không chiếu bí, nước sai luật, lời giải rỗng hoặc số nước chẵn", () => {
    expect(verifySolution(MATE1, [{ from: sq(2, 8), to: sq(3, 8) }], 1)).toBe(false);
    expect(verifySolution(MATE1, [{ from: sq(2, 8), to: sq(9, 8) }], 1)).toBe(false);
    expect(verifySolution(MATE1, [], 1)).toBe(false);
    expect(verifySolution(MATE1, [X16, X16], 1)).toBe(false);
  });

  it("từ chối lời giải dài hơn đề bài, kể cả khi cuối cùng vẫn chiếu bí", () => {
    // Đi một nước vô hại, để Đen đi, rồi mới chiếu bí: 2 nước cho thế 1 nước.
    const idle = legalMoves(MATE1).find((m) => !winningMoves(MATE1, 1).some((w) => w.from === m.from && w.to === m.to) && m.from !== sq(2, 8))!;
    const after = applyMove(MATE1, idle);
    const reply = legalMoves(after)[0];
    expect(verifySolution(MATE1, [idle, reply, X16], 1)).toBe(false);
  });

  it("thế 2 nước: nước đầu không ép được thì bị từ chối dù Đen đỡ sai và vẫn bị chiếu bí", () => {
    const [win] = winningMoves(MATE2, 2);
    const reply = toughestReply(applyMove(MATE2, win), 1)!;
    const after2 = applyMove(applyMove(MATE2, win), reply);
    const [mate] = winningMoves(after2, 1);
    expect(verifySolution(MATE2, [win, reply, mate], 2)).toBe(true);

    // Nước đầu "lỏng" (không ép thắng) bị từ chối, bất kể Đen đi gì sau đó.
    const loose = legalMoves(MATE2).find((m) => !winningMoves(MATE2, 2).some((w) => w.from === m.from && w.to === m.to))!;
    const a = applyMove(MATE2, loose);
    const r = legalMoves(a)[0];
    const finish = winningMoves(applyMove(a, r), 1)[0] ?? legalMoves(applyMove(a, r))[0];
    expect(verifySolution(MATE2, [loose, r, finish], 2)).toBe(false);
  });
});
