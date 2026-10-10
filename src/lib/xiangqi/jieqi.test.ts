import { describe, expect, it } from "vitest";
import { initialPosition, legalMoves, sq, type Board, type Position } from "./engine";
import {
  HIDDEN_POOL, HIDDEN_SQUARES, jieqiApply, jieqiInCheck, jieqiLegalMoves, jieqiNotation, jieqiPlay, jieqiStart, layoutEntries,
  layoutFrom, newJieqi, randomLayout, replayJieqi,
} from "./jieqi";

const empty = (): Board => Array(90).fill(null);
const targets = (pos: Position, from: number) => jieqiLegalMoves(pos).filter((m) => m.from === from).map((m) => m.to).sort((a, b) => a - b);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

describe("thế xuất phát cờ úp", () => {
  it("mỗi bên 1 tướng lộ và 15 quân úp ở đúng các ô xuất phát", () => {
    const { board } = jieqiStart();
    expect(board.filter((p) => p === "H")).toHaveLength(15);
    expect(board.filter((p) => p === "h")).toHaveLength(15);
    expect(board[sq(9, 4)]).toBe("K");
    expect(board[sq(0, 4)]).toBe("k");
    expect(HIDDEN_SQUARES.r).toHaveLength(15);
  });

  it("nước đi đầu tiên giống hệt cờ tướng (quân úp đi theo quân của ô xuất phát): 44 nước", () => {
    expect(jieqiLegalMoves(jieqiStart())).toHaveLength(legalMoves(initialPosition()).length);
    expect(jieqiLegalMoves(jieqiStart())).toHaveLength(44);
  });

  it("bố cục xáo ngẫu nhiên giữ đúng bộ quân mỗi bên; cùng hạt giống thì như nhau; lưu/đọc lại được", () => {
    const a = randomLayout(seeded(7));
    expect(randomLayout(seeded(7))).toEqual(a);
    expect(randomLayout(seeded(8))).not.toEqual(a);
    for (const side of ["r", "b"] as const) {
      const got = HIDDEN_SQUARES[side].map((s) => a[s]).sort();
      expect(got).toEqual(HIDDEN_POOL[side].slice().sort());
    }
    expect(layoutFrom(layoutEntries(a))).toEqual(a);
    expect(layoutFrom([[0, "K"]])).toBeNull(); // không cho bố cục chứa tướng
    expect(layoutFrom("rác")).toBeNull();
  });
});

describe("cách đi", () => {
  it("quân úp ở ô tốt chỉ tiến 1 bước; lật ra Xe thì lần sau đi như Xe", () => {
    let s = newJieqi();
    s = jieqiPlay(s, { from: sq(6, 0), to: sq(5, 0), reveal: "R" });
    expect(s.position.board[sq(5, 0)]).toBe("R");
    s = jieqiPlay(s, { from: sq(3, 8), to: sq(4, 8), reveal: "p" });
    // Xe ở (5,0) giờ đi ngang được cả hàng.
    expect(targets(s.position, sq(5, 0))).toEqual(expect.arrayContaining([sq(5, 1), sq(5, 8), sq(4, 0), sq(3, 0)]));
  });

  it("Tượng đã lật được qua sông; Sĩ đã lật được ra khỏi cung", () => {
    const board = empty();
    board[sq(9, 4)] = "K";
    board[sq(0, 3)] = "k";
    board[sq(5, 2)] = "B"; // tượng đỏ ở bờ sông bên mình
    board[sq(6, 6)] = "A"; // sĩ đỏ ở ngoài cung
    const pos: Position = { board, turn: "r" };
    expect(targets(pos, sq(5, 2))).toEqual(expect.arrayContaining([sq(3, 0), sq(3, 4)]));
    expect(targets(pos, sq(6, 6))).toEqual([sq(5, 5), sq(5, 7), sq(7, 5), sq(7, 7)].sort((a, b) => a - b));
  });

  it("quân úp ở ô Sĩ vẫn chỉ đi trong cung (như Sĩ) cho tới khi lật", () => {
    const pos = jieqiStart();
    expect(targets(pos, sq(9, 3))).toEqual([sq(8, 4)]);
  });

  it("quân úp luôn ở ô xuất phát bên mình nên không thể trực tiếp chiếu tướng đối phương (cả 15 ô)", () => {
    for (const side of ["r", "b"] as const) {
      for (const s0 of HIDDEN_SQUARES[side]) {
        const board = empty();
        board[sq(9, 4)] = "K";
        board[sq(0, 4)] = "k";
        board[sq(4, 4)] = "p"; // chắn cột giữa để hai tướng không đối mặt
        board[s0] = side === "r" ? "H" : "h";
        expect(jieqiInCheck(board, side === "r" ? "b" : "r")).toBe(false);
      }
    }
  });

  it("quân úp ở ô Pháo đi và ăn như Pháo: cần đúng một ngòi", () => {
    const board = empty();
    board[sq(9, 4)] = "K";
    board[sq(0, 3)] = "k";
    board[sq(7, 1)] = "H"; // ô pháo đỏ
    board[sq(5, 1)] = "p"; // ngòi
    board[sq(3, 1)] = "r"; // mục tiêu sau ngòi
    const pos: Position = { board, turn: "r" };
    const t = targets(pos, sq(7, 1));
    expect(t).toContain(sq(3, 1)); // ăn qua ngòi
    expect(t).not.toContain(sq(5, 1)); // không ăn trực tiếp như xe
    expect(t).toContain(sq(6, 1));
  });

  it("không được đi nước làm tướng mình bị chiếu, kể cả bởi quân úp của đối phương", () => {
    const board = empty();
    board[sq(9, 4)] = "K";
    board[sq(0, 4)] = "k";
    board[sq(7, 4)] = "N"; // mã đỏ đứng chắn giữa hai tướng
    const pos: Position = { board, turn: "r" };
    // Mã rời cột giữa thì hai tướng đối mặt: không hợp lệ.
    expect(targets(pos, sq(7, 4))).toEqual([]);
  });
});

describe("ván cờ úp", () => {
  it("dựng lại ván từ danh sách nước (có quân lật) ra đúng thế cờ; nước sai luật dừng lại", () => {
    const moves = [
      { from: sq(7, 7), to: sq(7, 4), reveal: "N" },
      { from: sq(2, 7), to: sq(2, 4), reveal: "r" },
      { from: sq(9, 4), to: sq(8, 4) },
    ];
    const s = replayJieqi(moves);
    expect(s.moves).toHaveLength(3);
    expect(s.position.board[sq(7, 4)]).toBe("N");
    expect(s.position.board[sq(2, 4)]).toBe("r");
    expect(replayJieqi([{ from: sq(9, 4), to: sq(0, 4) }]).moves).toHaveLength(0);
  });

  it("quân lật phải đúng phe; ký hiệu ghi rõ quân úp được lật thành gì", () => {
    const s = newJieqi();
    expect(jieqiPlay(s, { from: sq(6, 4), to: sq(5, 4), reveal: "r" })).toBe(s);
    expect(jieqiNotation(s.position.board, { from: sq(7, 7), to: sq(7, 4), reveal: "C" })).toBe("P2-5 (lật Pháo)");
    expect(jieqiNotation(s.position.board, { from: sq(9, 7), to: sq(7, 6), reveal: "R" })).toBe("M2.3 (lật Xe)");
  });

  it("không ai còn nước đi thì bên đó thua (chiếu bí)", () => {
    // Đỏ: tướng (9,4), Xe (1,0) thật; Đen: tướng (0,4) bị hai xe khóa.
    const board = empty();
    board[sq(9, 3)] = "K";
    board[sq(0, 4)] = "k";
    board[sq(1, 0)] = "R";
    board[sq(2, 8)] = "R";
    let s = newJieqi();
    s = { ...s, position: { board, turn: "r" }, keys: [] };
    s = jieqiPlay(s, { from: sq(2, 8), to: sq(0, 8) });
    expect(s.result).toEqual({ winner: "r", reason: "checkmate" });
  });
});

describe("hiển thị tạm nước của quân úp", () => {
  it("quân úp vừa đi (chưa biết lật ra gì) không làm lỗi, chưa có nước đi, vẫn chắn đường", () => {
    const start = jieqiStart();
    const moved = jieqiApply(start, { from: sq(6, 4), to: sq(5, 4) }); // không có thông tin lật
    expect(moved.board[sq(5, 4)]).toBe("H");
    expect(() => jieqiLegalMoves({ ...moved, turn: "r" })).not.toThrow();
    expect(jieqiLegalMoves({ ...moved, turn: "r" }).some((m) => m.from === sq(5, 4))).toBe(false);
    expect(jieqiInCheck(moved.board, "b")).toBe(false);
    expect(jieqiInCheck(moved.board, "r")).toBe(false);
  });
});
