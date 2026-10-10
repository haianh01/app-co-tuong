// Luồng một ván cờ (game.ts): biên bản, ăn quân, chiếu, các kiểu kết thúc, đi lại, dựng lại ván.
// So khớp từng trường của PlayedMove thay vì cả object (để thêm trường mới không làm vỡ test).

import { describe, expect, it } from "vitest";
import { m, mirror, pos } from "@/test/xiangqi";
import {
  Move, Position, START_FEN, applyMove, inCheck, initialPosition, legalMoves, parseFen, sq, toFen,
} from "./engine";
import {
  NO_CAPTURE_LIMIT, REASON_TEXT, currentPosition, describeResult, gameReducer, newGame, replayMoves,
  type EndReason, type GameState,
} from "./game";

const P2_5 = m(7, 7, 7, 4);
const M8_7 = m(0, 7, 2, 6);
const M2_3 = m(9, 7, 7, 6);

const play = (state: GameState, ...moves: Move[]) =>
  moves.reduce((s, move) => gameReducer(s, { type: "move", move }), state);

/** Lật một nước đi theo chiều dọc (dùng cùng `mirror`). */
const flip = (mv: Move): Move => ({ from: sq(9 - Math.floor(mv.from / 9), mv.from % 9), to: sq(9 - Math.floor(mv.to / 9), mv.to % 9) });

/**
 * Sinh `count` nửa nước không ăn quân, không chiếu, không bao giờ lặp lại thế cờ (để thử luật 60 nước).
 * Chọn tất định: nước hợp lệ đầu tiên thỏa điều kiện.
 */
function quietMoves(start: Position, count: number): Move[] {
  const seen = new Set([toFen(start)]);
  const out: Move[] = [];
  let p = start;
  while (out.length < count) {
    const next = legalMoves(p).find((mv) => {
      if (p.board[mv.to]) return false;
      const after = applyMove(p, mv);
      return !inCheck(after.board, after.turn) && !seen.has(toFen(after));
    });
    if (!next) throw new Error("Không sinh đủ nước đi yên lặng");
    p = applyMove(p, next);
    seen.add(toFen(p));
    out.push(next);
  }
  return out;
}

describe("ván mới", () => {
  it("bắt đầu từ thế chuẩn, chưa có nước nào, chưa có kết quả", () => {
    const s = newGame();
    expect(s.moves).toEqual([]);
    expect(s.result).toBeNull();
    expect(s.history).toHaveLength(1);
    expect(toFen(currentPosition(s))).toBe(START_FEN);
  });

  it("bắt đầu từ FEN tùy ý (cờ thế), kể cả Đen đi trước", () => {
    const s = newGame("4k4/9/9/9/9/9/9/9/9/3K5 b");
    expect(currentPosition(s).turn).toBe("b");
  });

  it("FEN sai thì báo lỗi ngay", () => {
    expect(() => newGame("abc")).toThrow();
  });
});

describe("đi quân", () => {
  it("ghi biên bản: ký hiệu, bên đi, quân đi, không ăn, không chiếu; đổi lượt", () => {
    const s = play(newGame(), P2_5);
    expect(s.moves).toHaveLength(1);
    expect(s.moves[0]).toMatchObject({ move: P2_5, notation: "P2-5", side: "r", piece: "C", captured: null, check: false });
    expect(currentPosition(s).turn).toBe("b");
    expect(s.history).toHaveLength(2);
    expect(s.result).toBeNull();
  });

  it("nước của Đen ghi theo góc nhìn của Đen", () => {
    const s = play(newGame(), P2_5, M8_7);
    expect(s.moves[1]).toMatchObject({ notation: "M8.7", side: "b", piece: "n" });
  });

  it("ghi lại quân bị ăn", () => {
    // Pháo đỏ cột 8 lấy pháo đen (2,1) làm ngòi, ăn mã đen (0,1).
    const s = play(newGame(), m(7, 1, 0, 1));
    expect(s.moves[0]).toMatchObject({ piece: "C", captured: "n" });
    expect(currentPosition(s).board.filter(Boolean)).toHaveLength(31);
  });

  it("ghi nhận nước chiếu tướng", () => {
    // Xe đỏ lên hàng 0 chiếu tướng đen; tướng còn đường thoát nên chưa hết ván.
    const s = play(newGame("4k4/9/9/9/9/9/9/9/9/R2K5 w"), m(9, 0, 0, 0));
    expect(s.moves[0].check).toBe(true);
    expect(s.result).toBeNull();
  });

  it.each([
    ["sai cách đi", m(9, 0, 5, 0)],
    ["đi quân của đối phương", m(0, 0, 1, 0)],
    ["đi từ ô trống", m(5, 4, 4, 4)],
    ["đứng yên tại chỗ", m(9, 0, 9, 0)],
  ])("bỏ qua nước %s (trả lại đúng state cũ)", (_name, move) => {
    const start = newGame();
    expect(gameReducer(start, { type: "move", move })).toBe(start);
  });

  it("không sửa state cũ (dùng được với useReducer)", () => {
    const start = newGame();
    const snapshot = JSON.stringify(start);
    play(start, P2_5, M8_7);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe("kết thúc bằng luật cờ", () => {
  it("chiếu bí: bên chiếu thắng, không đi tiếp được nữa", () => {
    const s = play(newGame("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w"), m(2, 8, 2, 3));
    expect(s.result).toEqual({ winner: "r", reason: "checkmate" });
    expect(s.moves[0].check).toBe(true);
    expect(play(s, m(0, 3, 1, 3))).toBe(s);
  });

  it("Đen chiếu bí Đỏ thì Đen thắng", () => {
    const fen = toFen(mirror(parseFen("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w")));
    const s = play(newGame(fen), flip(m(2, 8, 2, 3)));
    expect(s.result).toEqual({ winner: "b", reason: "checkmate" });
  });

  it("vây hết nước đi (không chiếu) cũng thắng", () => {
    // Tốt đỏ tiến lên (1,3): tướng đen không còn ô nào để đi.
    const s = play(newGame("4k4/5P3/3P5/9/9/9/9/9/9/3K5 w"), m(2, 3, 1, 3));
    expect(s.moves[0].check).toBe(false);
    expect(s.result).toEqual({ winner: "r", reason: "stalemate" });
  });

  it("ăn quân cuối cùng có thể chiếu bí → hòa vì không đủ quân", () => {
    // Tốt đen (8,3) đang chiếu bên sườn; tướng đỏ ăn nó, trên bàn chỉ còn hai tướng.
    const s = play(newGame("5k3/9/9/9/9/9/9/9/3pK4/9 w"), m(8, 4, 8, 3));
    expect(s.result).toEqual({ winner: null, reason: "material" });
  });

  it("còn sĩ tượng hai bên vẫn là hòa vì không đủ quân", () => {
    const s = play(newGame("3k1a3/9/4b4/9/9/9/9/9/4p4/3AKA3 w"), m(9, 4, 8, 4));
    expect(s.result).toEqual({ winner: null, reason: "material" });
  });
});

describe("lặp lại thế cờ", () => {
  // Hai xe ra vào góc bàn, không đe dọa quân nào.
  const shuffle = [m(9, 0, 8, 0), m(0, 0, 1, 0), m(8, 0, 9, 0), m(1, 0, 0, 0)];

  it("lặp lần 2 chưa sao, lặp lần 3 thì hòa", () => {
    let s = newGame();
    s = play(s, ...shuffle);
    expect(s.result).toBeNull();
    s = play(s, ...shuffle.slice(0, 3));
    expect(s.result).toBeNull();
    s = play(s, shuffle[3]);
    expect(s.moves).toHaveLength(8);
    expect(s.result).toEqual({ winner: null, reason: "repetition" });
  });

  it("Đỏ chiếu mãi (mọi nước trong chu kỳ đều chiếu) thì Đỏ thua", () => {
    let s = newGame("3k5/9/9/9/9/4R4/9/9/9/5K3 w");
    const cycle = [m(5, 4, 5, 3), m(0, 3, 0, 4), m(5, 3, 5, 4), m(0, 4, 0, 3)];
    s = play(s, ...cycle, ...cycle);
    expect(s.moves.filter((x) => x.side === "r").every((x) => x.check)).toBe(true);
    expect(s.result).toEqual({ winner: "b", reason: "perpetualCheck" });
  });

  it("Đen chiếu mãi thì Đen thua", () => {
    const fen = toFen(mirror(parseFen("3k5/9/9/9/9/4R4/9/9/9/5K3 w")));
    const cycle = [m(5, 4, 5, 3), m(0, 3, 0, 4), m(5, 3, 5, 4), m(0, 4, 0, 3)].map(flip);
    const s = play(newGame(fen), ...cycle, ...cycle);
    expect(s.result).toEqual({ winner: "r", reason: "perpetualCheck" });
  });

  it("chiếu xen kẽ nước không chiếu thì không phạm luật chiếu mãi: hòa", () => {
    // Xe đỏ sang cột 3 chiếu, tướng đen tránh; xe về cột 0 (không chiếu), tướng đen quay lại.
    const cycle = [m(5, 0, 5, 3), m(0, 3, 0, 4), m(5, 3, 5, 0), m(0, 4, 0, 3)];
    const s = play(newGame("3k5/9/9/9/9/R8/9/9/9/5K3 w"), ...cycle, ...cycle);
    expect(s.moves.map((x) => x.check)).toEqual([true, false, false, false, true, false, false, false]);
    expect(s.result).toEqual({ winner: null, reason: "repetition" });
  });
});

describe(`${NO_CAPTURE_LIMIT / 2} nước không ăn quân`, () => {
  it(`hòa đúng ở nửa nước thứ ${NO_CAPTURE_LIMIT}, không sớm hơn`, () => {
    const moves = quietMoves(initialPosition(), NO_CAPTURE_LIMIT);
    const almost = replayMoves(moves.slice(0, -1));
    expect(almost.moves).toHaveLength(NO_CAPTURE_LIMIT - 1);
    expect(almost.result).toBeNull();
    expect(play(almost, moves[moves.length - 1]).result).toEqual({ winner: null, reason: "moveLimit" });
  });

  it("có nước ăn quân thì đếm lại từ sau nước đó", () => {
    const capture = m(7, 1, 0, 1);
    const afterCapture = applyMove(initialPosition(), capture);
    const quiet = quietMoves(afterCapture, NO_CAPTURE_LIMIT);
    const s = replayMoves([capture, ...quiet.slice(0, -1)]);
    expect(s.moves).toHaveLength(NO_CAPTURE_LIMIT);
    expect(s.result).toBeNull();
    expect(play(s, quiet[quiet.length - 1]).result).toEqual({ winner: null, reason: "moveLimit" });
  });
});

describe("đi lại (undo)", () => {
  it("lùi 1 hoặc 2 nửa nước, trở về đúng thế cũ", () => {
    const s = play(newGame(), P2_5, M8_7, M2_3);
    const one = gameReducer(s, { type: "undo", plies: 1 });
    expect(one.moves.map((x) => x.notation)).toEqual(["P2-5", "M8.7"]);
    expect(currentPosition(one).turn).toBe("r");
    const two = gameReducer(s, { type: "undo", plies: 2 });
    expect(toFen(currentPosition(two))).toBe(toFen(currentPosition(play(newGame(), P2_5))));
  });

  it("lùi quá số nước đã đi thì về thế ban đầu", () => {
    const s = gameReducer(play(newGame(), P2_5), { type: "undo", plies: 10 });
    expect(s.moves).toEqual([]);
    expect(s.history).toHaveLength(1);
  });

  it.each([0, -1])("lùi %i nửa nước hoặc lùi khi chưa đi gì: không đổi", (plies) => {
    const s = play(newGame(), P2_5);
    expect(gameReducer(s, { type: "undo", plies })).toBe(s);
    const empty = newGame();
    expect(gameReducer(empty, { type: "undo", plies: 2 })).toBe(empty);
  });

  it("đi lại sau khi ván đã kết thúc thì ván tiếp tục", () => {
    const mated = play(newGame("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w"), m(2, 8, 2, 3));
    const back = gameReducer(mated, { type: "undo", plies: 1 });
    expect(back.result).toBeNull();
    expect(currentPosition(back).turn).toBe("r");
    expect(play(back, m(2, 8, 2, 7)).moves).toHaveLength(1);
  });

  it("đi lại rồi đi lại nước cũ cho cùng kết quả", () => {
    const s = play(newGame(), P2_5, M8_7);
    const redo = play(gameReducer(s, { type: "undo", plies: 1 }), M8_7);
    expect(toFen(currentPosition(redo))).toBe(toFen(currentPosition(s)));
    expect(redo.moves.map((x) => x.notation)).toEqual(s.moves.map((x) => x.notation));
  });
});

describe("kết thúc từ bên ngoài (xin thua, hết giờ…)", () => {
  it("ghi kết quả và chặn nước đi tiếp", () => {
    const s = gameReducer(play(newGame(), P2_5), { type: "end", result: { winner: "b", reason: "resign" } });
    expect(s.result).toEqual({ winner: "b", reason: "resign" });
    expect(play(s, M8_7)).toBe(s);
  });

  it("không ghi đè kết quả đã có", () => {
    const mated = play(newGame("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w"), m(2, 8, 2, 3));
    expect(gameReducer(mated, { type: "end", result: { winner: "b", reason: "timeout" } })).toBe(mated);
  });
});

describe("replayMoves", () => {
  it("dựng lại ván từ danh sách nước", () => {
    const s = replayMoves([P2_5, M8_7, M2_3]);
    expect(s.moves.map((x) => x.notation)).toEqual(["P2-5", "M8.7", "M2.3"]);
    expect(currentPosition(s).turn).toBe("b");
  });

  it("danh sách rỗng là ván mới", () => {
    expect(replayMoves([]).history).toHaveLength(1);
  });

  it("dừng ở nước sai luật đầu tiên, bỏ qua phần sau (dữ liệu hỏng không làm sập trang)", () => {
    const s = replayMoves([P2_5, m(9, 0, 5, 0), M8_7]);
    expect(s.moves.map((x) => x.notation)).toEqual(["P2-5"]);
  });

  it("dựng lại từ FEN", () => {
    const s = replayMoves([m(2, 8, 2, 3)], "3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w");
    expect(s.result).toEqual({ winner: "r", reason: "checkmate" });
  });
});

describe("mô tả kết quả", () => {
  it("hòa", () => {
    expect(describeResult({ winner: null, reason: "agreement" }, "r")).toEqual({
      title: "Hòa cờ", detail: "Hai bên đồng ý hòa", seal: "和",
    });
  });

  it("người chơi thắng / thua", () => {
    expect(describeResult({ winner: "r", reason: "checkmate" }, "r")).toEqual({
      title: "Bạn thắng!", detail: "Chiếu bí · Đen thua", seal: "勝",
    });
    expect(describeResult({ winner: "r", reason: "checkmate" }, "b")).toEqual({
      title: "Bạn thua", detail: "Chiếu bí · Đen thua", seal: "負",
    });
    expect(describeResult({ winner: "b", reason: "resign" }, "r")).toMatchObject({ title: "Bạn thua", detail: "Xin thua · Đỏ thua" });
  });

  it("người xem thấy tên bên thắng", () => {
    expect(describeResult({ winner: "r", reason: "timeout" }, null)).toMatchObject({ title: "Đỏ thắng", seal: "勝" });
    expect(describeResult({ winner: "b", reason: "abandon" }, null)).toMatchObject({ title: "Đen thắng", seal: "勝" });
  });

  it("mọi lý do kết thúc đều có chữ hiển thị", () => {
    for (const [reason, text] of Object.entries(REASON_TEXT)) {
      expect(text, reason).toMatch(/\S/);
      expect(describeResult({ winner: null, reason: reason as EndReason }, null).detail).toBe(text);
    }
    expect(REASON_TEXT.moveLimit).toBe(`${NO_CAPTURE_LIMIT / 2} nước không ăn quân`);
  });
});

describe("tiện ích", () => {
  it("currentPosition là thế sau nước cuối", () => {
    const s = play(newGame(), P2_5);
    expect(currentPosition(s)).toBe(s.history[1]);
    expect(currentPosition(s).board[sq(7, 4)]).toBe("C");
  });

  it("thế cờ dựng bằng pos() khớp với FEN tương ứng", () => {
    expect(toFen(pos({ "0,4": "k", "9,4": "K" }))).toBe("4k4/9/9/9/9/9/9/9/9/4K4 w");
  });
});
