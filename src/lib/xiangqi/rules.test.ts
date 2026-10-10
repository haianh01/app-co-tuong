// Luật cờ tướng của engine, đối chiếu với luật thật: cách đi từng quân, chiếu tướng, nước hợp lệ, kết thúc ván.
// Chỉ dùng các export công khai của engine.ts.

import { describe, expect, it } from "vitest";
import { dests, m, mirror, pos, pseudo, sorted } from "@/test/xiangqi";
import {
  COLS, ROWS, START_FEN, applyMove, colOf, findKing, inCheck, initialPosition, insufficientMaterial, isAttacked,
  isLegal, legalMoves, legalMovesFrom, opponent, outcome, parseFen, rowOf, sideOf, sq, toFen, typeOf,
  type Position,
} from "./engine";

function perft(p: Position, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const mv of legalMoves(p)) n += perft(applyMove(p, mv), depth - 1);
  return n;
}

// Hai tướng đặt lệch cột để không "lộ mặt" trong các thế thử cách đi của quân khác.
const KINGS = { "9,3": "K", "0,5": "k" } as const;

describe("tọa độ và quân", () => {
  it("bàn cờ 10 hàng × 9 cột, chỉ số = hàng * 9 + cột", () => {
    expect(ROWS * COLS).toBe(90);
    expect(sq(0, 0)).toBe(0);
    expect(sq(9, 8)).toBe(89);
    for (let i = 0; i < 90; i++) expect(sq(rowOf(i), colOf(i))).toBe(i);
  });

  it("chữ hoa là Đỏ, chữ thường là Đen", () => {
    expect(sideOf("R")).toBe("r");
    expect(sideOf("r")).toBe("b");
    expect(typeOf("N")).toBe("n");
    expect(typeOf("c")).toBe("c");
    expect(opponent("r")).toBe("b");
    expect(opponent("b")).toBe("r");
  });
});

describe("FEN", () => {
  it("thế ban đầu: 32 quân, Đỏ đi trước, ghi lại y nguyên", () => {
    const p = initialPosition();
    expect(p.turn).toBe("r");
    expect(p.board.filter(Boolean)).toHaveLength(32);
    expect(p.board[sq(9, 4)]).toBe("K");
    expect(p.board[sq(0, 4)]).toBe("k");
    expect(p.board[sq(7, 1)]).toBe("C");
    expect(p.board[sq(3, 8)]).toBe("p");
    expect(toFen(p)).toBe(START_FEN);
  });

  it("đọc lượt Đen ('b'); thiếu lượt thì mặc định Đỏ; bỏ qua khoảng trắng thừa", () => {
    expect(parseFen(START_FEN.replace(" w", " b")).turn).toBe("b");
    expect(parseFen(START_FEN.replace(" w", "")).turn).toBe("r");
    expect(toFen(parseFen(`  ${START_FEN.replace(" w", "   b")}  `))).toBe(START_FEN.replace(" w", " b"));
  });

  it.each([
    "3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w",
    "2bakab2/9/9/p1p3p1p/9/4C4/9/C8/9/3K5 w",
    "4k4/9/9/9/9/9/9/9/9/4K4 b",
    "9/9/9/9/9/9/9/9/9/9 w",
  ])("ghi ra đúng chuỗi đã đọc: %s", (fen) => {
    expect(toFen(parseFen(fen))).toBe(fen);
  });

  it.each([
    ["thiếu hàng", "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/RNBAKABNR w"],
    ["thừa hàng", `${START_FEN.split(" ")[0]}/9 w`],
    ["hàng thiếu cột", "rnbakabn/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"],
    ["hàng thừa cột", "rnbakabnrr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"],
    ["ký tự lạ (quân hậu cờ vua)", "rnbqkabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w"],
    ["chuỗi rỗng", ""],
  ])("báo lỗi FEN sai: %s", (_name, fen) => {
    expect(() => parseFen(fen)).toThrow(/FEN không hợp lệ/);
  });
});

describe("cách đi của Tướng", () => {
  it("đi một bước ngang/dọc trong cung", () => {
    expect(pseudo(pos({ "8,4": "K", "0,3": "k" }), 8, 4)).toEqual(sorted(["7,4", "9,4", "8,3", "8,5"]));
  });

  it("không ra khỏi cung (góc cung chỉ còn 2 nước)", () => {
    expect(pseudo(pos({ "9,3": "K", "0,5": "k" }), 9, 3)).toEqual(sorted(["8,3", "9,4"]));
    expect(pseudo(pos({ "7,5": "K", "0,3": "k" }), 7, 5)).toEqual(sorted(["8,5", "7,4"]));
  });

  it("cung của Đen ở hàng 0–2", () => {
    expect(pseudo(pos({ "2,3": "k", "9,5": "K" }), 2, 3)).toEqual(sorted(["1,3", "2,4"]));
  });

  it("ăn được quân đối phương, không đè lên quân mình", () => {
    const p = pos({ "8,4": "K", "7,4": "r", "8,3": "A", "0,3": "k" });
    expect(pseudo(p, 8, 4)).toContain("7,4");
    expect(pseudo(p, 8, 4)).not.toContain("8,3");
  });

  it("không được bước vào ô bị khống chế", () => {
    // Xe đen khống chế cột 5; cột 3 thì lộ mặt với tướng đen: chỉ còn tiến lên.
    const p = pos({ "9,4": "K", "5,5": "r", "0,3": "k" });
    expect(dests(p, 9, 4)).toEqual(["8,4"]);
  });

  it("không được bước sang cột có tướng đối phương mà không có quân che (lộ mặt tướng)", () => {
    const p = pos({ "9,4": "K", "0,3": "k" });
    expect(dests(p, 9, 4)).toEqual(sorted(["8,4", "9,5"]));
  });
});

describe("cách đi của Sĩ", () => {
  it("ở tâm cung đi được 4 góc", () => {
    expect(pseudo(pos({ "9,4": "K", "0,3": "k", "8,4": "A" }), 8, 4)).toEqual(sorted(["7,3", "7,5", "9,3", "9,5"]));
  });

  it("ở góc cung chỉ về được tâm cung", () => {
    expect(pseudo(pos({ "9,4": "K", "0,3": "k", "9,5": "A" }), 9, 5)).toEqual(["8,4"]);
    expect(pseudo(pos({ "9,4": "K", "0,3": "k", "7,3": "A" }), 7, 3)).toEqual(["8,4"]);
  });

  it("Sĩ Đen cũng chỉ đi trong cung của mình", () => {
    expect(pseudo(pos({ "0,4": "k", "9,3": "K", "1,4": "a" }), 1, 4)).toEqual(sorted(["0,3", "0,5", "2,3", "2,5"]));
  });
});

describe("cách đi của Tượng", () => {
  it("đi chéo 2 ô, từ giữa cánh có 4 nước", () => {
    expect(pseudo(pos({ ...KINGS, "7,4": "B" }), 7, 4)).toEqual(sorted(["5,2", "5,6", "9,2", "9,6"]));
  });

  it("không được qua sông", () => {
    // Tượng đỏ ở hàng 5 (sát sông): hai ô hàng 3 bên kia sông bị cấm.
    expect(pseudo(pos({ ...KINGS, "5,2": "B" }), 5, 2)).toEqual(sorted(["7,0", "7,4"]));
    // Tượng đen ở hàng 4: không xuống được hàng 6.
    expect(pseudo(pos({ ...KINGS, "4,2": "b" }), 4, 2)).toEqual(sorted(["2,0", "2,4"]));
  });

  it("bị cản mắt tượng (ô chéo ở giữa có quân, kể cả quân đối phương) thì không đi hướng đó", () => {
    expect(pseudo(pos({ ...KINGS, "7,4": "B", "6,3": "P" }), 7, 4)).toEqual(sorted(["5,6", "9,2", "9,6"]));
    expect(pseudo(pos({ ...KINGS, "7,4": "B", "8,5": "n" }), 7, 4)).toEqual(sorted(["5,2", "5,6", "9,2"]));
  });

  it("ăn quân ở ô đích, không đè quân mình", () => {
    const p = pos({ ...KINGS, "7,4": "B", "5,2": "p", "5,6": "P" });
    expect(pseudo(p, 7, 4)).toContain("5,2");
    expect(pseudo(p, 7, 4)).not.toContain("5,6");
  });
});

describe("cách đi của Mã", () => {
  it("giữa bàn trống có đủ 8 nước", () => {
    expect(pseudo(pos({ ...KINGS, "4,4": "N" }), 4, 4)).toEqual(
      sorted(["2,3", "2,5", "6,3", "6,5", "3,2", "5,2", "3,6", "5,6"]),
    );
  });

  it("bị cản chân (ô ngang/dọc sát mã) thì mất 2 nước về hướng đó", () => {
    const up = pseudo(pos({ ...KINGS, "4,4": "N", "3,4": "p" }), 4, 4);
    expect(up).not.toContain("2,3");
    expect(up).not.toContain("2,5");
    expect(up).toHaveLength(6);
    const left = pseudo(pos({ ...KINGS, "4,4": "N", "4,3": "P" }), 4, 4);
    expect(left).not.toContain("3,2");
    expect(left).not.toContain("5,2");
    expect(left).toHaveLength(6);
  });

  it("quân đứng chéo sát mã không cản chân", () => {
    expect(pseudo(pos({ ...KINGS, "4,4": "N", "3,3": "p", "5,5": "P" }), 4, 4)).toHaveLength(8);
  });

  it("ở góc bàn chỉ còn 2 nước", () => {
    expect(pseudo(pos({ ...KINGS, "9,0": "N" }), 9, 0)).toEqual(sorted(["7,1", "8,2"]));
  });

  it("ăn quân đối phương, không đè quân mình", () => {
    const p = pos({ ...KINGS, "4,4": "N", "2,3": "r", "2,5": "R" });
    expect(pseudo(p, 4, 4)).toContain("2,3");
    expect(pseudo(p, 4, 4)).not.toContain("2,5");
  });
});

describe("cách đi của Xe", () => {
  it("đi thẳng bao xa cũng được trên hàng và cột trống", () => {
    expect(pseudo(pos({ ...KINGS, "5,4": "R" }), 5, 4)).toHaveLength(8 + 9);
  });

  it("dừng trước quân mình, ăn quân đối phương đầu tiên, không nhảy qua quân", () => {
    const p = pos({ ...KINGS, "5,4": "R", "5,6": "P", "2,4": "n", "1,4": "r" });
    const d = pseudo(p, 5, 4);
    expect(d).toContain("5,5");
    expect(d).not.toContain("5,6");
    expect(d).not.toContain("5,7");
    expect(d).toContain("2,4");
    expect(d).not.toContain("1,4");
  });
});

describe("cách đi của Pháo", () => {
  it("đi như xe khi không ăn quân, nhưng không được dừng trên quân", () => {
    const d = pseudo(pos({ ...KINGS, "7,1": "C", "7,4": "p" }), 7, 1);
    expect(d).toContain("7,2");
    expect(d).toContain("7,3");
    expect(d).not.toContain("7,4");
  });

  it("phải có đúng một ngòi mới ăn được quân", () => {
    // Không ngòi: không ăn được xe đen đứng ngay trên đường.
    expect(pseudo(pos({ ...KINGS, "7,0": "C", "4,0": "r" }), 7, 0)).not.toContain("4,0");
    // Một ngòi (quân mình hay quân đối phương đều được).
    expect(pseudo(pos({ ...KINGS, "7,0": "C", "5,0": "P", "4,0": "r" }), 7, 0)).toContain("4,0");
    expect(pseudo(pos({ ...KINGS, "7,0": "C", "5,0": "p", "4,0": "r" }), 7, 0)).toContain("4,0");
    // Hai ngòi: không ăn được.
    expect(pseudo(pos({ ...KINGS, "7,0": "C", "6,0": "P", "5,0": "p", "4,0": "r" }), 7, 0)).not.toContain("4,0");
  });

  it("không đi xuyên qua ngòi tới ô trống, không ăn quân mình sau ngòi", () => {
    const d = pseudo(pos({ ...KINGS, "7,0": "C", "5,0": "P", "3,0": "R" }), 7, 0);
    expect(d).toEqual(["6,0", "7,1", "7,2", "7,3", "7,4", "7,5", "7,6", "7,7", "7,8", "8,0", "9,0"].sort());
  });

  it("chỉ ăn quân đầu tiên sau ngòi", () => {
    const d = pseudo(pos({ ...KINGS, "7,0": "C", "5,0": "P", "3,0": "n", "1,0": "r" }), 7, 0);
    expect(d).toContain("3,0");
    expect(d).not.toContain("1,0");
  });
});

describe("cách đi của Tốt", () => {
  it("chưa qua sông chỉ được tiến một bước", () => {
    expect(pseudo(pos({ ...KINGS, "6,0": "P" }), 6, 0)).toEqual(["5,0"]);
    // Hàng 5 vẫn là phía sông của Đỏ.
    expect(pseudo(pos({ ...KINGS, "5,4": "P" }), 5, 4)).toEqual(["4,4"]);
  });

  it("qua sông được tiến hoặc đi ngang, không bao giờ lùi", () => {
    const d = pseudo(pos({ ...KINGS, "4,4": "P" }), 4, 4);
    expect(d).toEqual(sorted(["3,4", "4,3", "4,5"]));
    expect(d).not.toContain("5,4");
  });

  it("tốt chạm đáy chỉ còn đi ngang", () => {
    expect(pseudo(pos({ "9,3": "K", "1,5": "k", "0,4": "P" }), 0, 4)).toEqual(sorted(["0,3", "0,5"]));
  });

  it("tốt ở mép bàn chỉ đi ngang vào trong", () => {
    expect(pseudo(pos({ ...KINGS, "3,0": "P" }), 3, 0)).toEqual(sorted(["2,0", "3,1"]));
  });

  it("tốt Đen tiến xuống; qua sông (hàng 5 trở xuống) mới được đi ngang", () => {
    expect(pseudo(pos({ ...KINGS, "3,4": "p" }), 3, 4)).toEqual(["4,4"]);
    expect(pseudo(pos({ ...KINGS, "4,4": "p" }), 4, 4)).toEqual(["5,4"]);
    expect(pseudo(pos({ ...KINGS, "5,4": "p" }), 5, 4)).toEqual(sorted(["6,4", "5,3", "5,5"]));
  });
});

describe("chiếu tướng", () => {
  it("Xe chiếu theo cột; có quân chắn thì hết chiếu", () => {
    expect(inCheck(pos({ "9,4": "K", "2,4": "r", "0,3": "k" }).board, "r")).toBe(true);
    expect(inCheck(pos({ "9,4": "K", "2,4": "r", "5,4": "P", "0,3": "k" }).board, "r")).toBe(false);
  });

  it("Xe chiếu theo hàng ngang", () => {
    expect(inCheck(pos({ "9,4": "K", "9,0": "r", "0,3": "k" }).board, "r")).toBe(true);
  });

  it("Pháo chiếu khi có đúng một ngòi", () => {
    expect(inCheck(pos({ "9,4": "K", "2,4": "c", "0,3": "k" }).board, "r")).toBe(false);
    expect(inCheck(pos({ "9,4": "K", "2,4": "c", "5,4": "p", "0,3": "k" }).board, "r")).toBe(true);
    expect(inCheck(pos({ "9,4": "K", "2,4": "c", "5,4": "P", "8,4": "A", "0,3": "k" }).board, "r")).toBe(false);
  });

  it("Mã chiếu khi chân mã trống; chân mã tính từ phía con mã, không phải phía tướng", () => {
    // Mã đỏ ở (2,5) nhảy tới tướng đen (0,4): chân mã là (1,5).
    expect(inCheck(pos({ "0,4": "k", "2,5": "N", "9,3": "K" }).board, "b")).toBe(true);
    expect(inCheck(pos({ "0,4": "k", "2,5": "N", "1,5": "a", "9,3": "K" }).board, "b")).toBe(false);
    // Quân ở (1,4) sát tướng không phải chân mã: vẫn bị chiếu.
    expect(inCheck(pos({ "0,4": "k", "2,5": "N", "1,4": "a", "9,3": "K" }).board, "b")).toBe(true);
  });

  it("Mã nằm ngang (chân mã ngang) cũng chiếu được", () => {
    // Mã đỏ (1,6) → (0,4): chân mã là (1,5).
    expect(inCheck(pos({ "0,4": "k", "1,6": "N", "9,3": "K" }).board, "b")).toBe(true);
    expect(inCheck(pos({ "0,4": "k", "1,6": "N", "1,5": "p", "9,3": "K" }).board, "b")).toBe(false);
  });

  it("Tốt chiếu từ phía trước, tốt đã qua sông chiếu được từ bên cạnh", () => {
    expect(inCheck(pos({ "0,4": "k", "1,4": "P", "9,3": "K" }).board, "b")).toBe(true);
    expect(inCheck(pos({ "0,4": "k", "0,3": "P", "9,3": "K" }).board, "b")).toBe(true);
    expect(inCheck(pos({ "9,4": "K", "8,4": "p", "0,3": "k" }).board, "r")).toBe(true);
    expect(inCheck(pos({ "8,4": "K", "8,3": "p", "0,5": "k" }).board, "r")).toBe(true);
  });

  it("Tốt không chiếu ngược ra phía sau", () => {
    // Tướng đen (2,4) đứng sau lưng tốt đỏ (1,4); tướng đỏ (7,4) sau lưng tốt đen (8,4).
    expect(inCheck(pos({ "2,4": "k", "1,4": "P", "9,3": "K" }).board, "b")).toBe(false);
    expect(inCheck(pos({ "7,4": "K", "8,4": "p", "0,3": "k" }).board, "r")).toBe(false);
  });

  it("Tốt chéo góc không chiếu", () => {
    expect(inCheck(pos({ "0,4": "k", "1,3": "P", "9,3": "K" }).board, "b")).toBe(false);
  });

  it("hai tướng đối mặt trên cùng cột không có quân chắn: cả hai đều bị tính là bị chiếu", () => {
    const facing = pos({ "9,4": "K", "0,4": "k" }).board;
    expect(inCheck(facing, "r")).toBe(true);
    expect(inCheck(facing, "b")).toBe(true);
    expect(inCheck(pos({ "9,4": "K", "5,4": "p", "0,4": "k" }).board, "r")).toBe(false);
  });

  it("Tướng, Sĩ, Tượng không chiếu được tướng đối phương từ xa", () => {
    expect(isAttacked(pos({ "9,4": "K", "0,3": "k", "1,4": "a", "2,2": "b" }).board, sq(9, 4), "b")).toBe(false);
  });

  it("findKing tìm đúng ô của tướng; mất tướng thì coi như bị chiếu", () => {
    const p = pos({ "8,3": "K", "1,5": "k" });
    expect(findKing(p.board, "r")).toBe(sq(8, 3));
    expect(findKing(p.board, "b")).toBe(sq(1, 5));
    const noRed = pos({ "1,5": "k" });
    expect(findKing(noRed.board, "r")).toBe(-1);
    expect(inCheck(noRed.board, "r")).toBe(true);
  });
});

describe("nước đi hợp lệ", () => {
  it("chỉ quân của bên đến lượt mới có nước đi; ô trống không có nước", () => {
    const p = initialPosition();
    expect(legalMovesFrom(p, sq(0, 0))).toEqual([]);
    expect(legalMovesFrom(p, sq(4, 4))).toEqual([]);
    expect(legalMovesFrom(p, sq(9, 0)).length).toBe(2);
  });

  it("thế ban đầu: Đỏ có 44 nước, Đen (nếu được đi trước) cũng 44 nước", () => {
    expect(legalMoves(initialPosition())).toHaveLength(44);
    expect(legalMoves(parseFen(START_FEN.replace(" w", " b")))).toHaveLength(44);
  });

  it("quân bị ghim bởi xe không được rời đường ghim, nhưng được đi dọc đường ghim", () => {
    const p = pos({ "9,4": "K", "6,4": "R", "2,4": "r", "0,3": "k" });
    expect(dests(p, 6, 4)).toEqual(sorted(["2,4", "3,4", "4,4", "5,4", "7,4", "8,4"]));
  });

  it("quân bị ghim bởi pháo: rời cột làm mất một ngòi thì bị chiếu → cấm", () => {
    // Pháo đen (2,4), giữa có sĩ đỏ (8,4) và xe đỏ (6,4): hai ngòi nên chưa chiếu.
    const p = pos({ "9,4": "K", "8,4": "A", "6,4": "R", "2,4": "c", "0,3": "k" });
    expect(inCheck(p.board, "r")).toBe(false);
    expect(dests(p, 6, 4).every((d) => d.endsWith(",4"))).toBe(true);
    expect(dests(p, 8, 4)).toEqual([]);
  });

  it("đang bị chiếu thì chỉ được đi nước gỡ chiếu", () => {
    // Xe đen chiếu theo cột 4. Tướng đỏ không lên (8,4) (vẫn trên cột xe),
    // không sang (9,3) (lộ mặt với tướng đen cột 3): chỉ còn (9,5).
    const p = pos({ "9,4": "K", "5,4": "r", "0,3": "k" });
    expect(inCheck(p.board, "r")).toBe(true);
    expect(legalMoves(p).map((x) => `${rowOf(x.to)},${colOf(x.to)}`)).toEqual(["9,5"]);
  });

  it("gỡ chiếu bằng cách ăn quân đang chiếu hoặc lấy quân chắn", () => {
    // Xe đen (5,4) chiếu; hai sĩ chặn đường chạy ngang của tướng.
    const p = pos({ "9,4": "K", "9,3": "A", "9,5": "A", "5,4": "r", "5,0": "R", "8,2": "N", "0,3": "k" });
    const all = legalMoves(p).map((x) => `${rowOf(x.from)},${colOf(x.from)}>${rowOf(x.to)},${colOf(x.to)}`);
    expect(all.sort()).toEqual(sorted([
      "5,0>5,4", // xe đỏ ăn xe chiếu
      "8,2>7,4", // mã nhảy vào chắn
      "9,3>8,4", // sĩ lên chắn
      "9,5>8,4",
    ]));
  });

  it("không được đi nước làm hai tướng lộ mặt", () => {
    const p = pos({ "4,4": "R", "9,4": "K", "0,4": "k" });
    expect(isLegal(p, { from: sq(4, 4), to: sq(4, 0) })).toBe(false);
    expect(isLegal(p, { from: sq(4, 4), to: sq(2, 4) })).toBe(true);
  });

  it("isLegal từ chối ô trống, quân đối phương, ô đích sai luật", () => {
    const p = initialPosition();
    expect(isLegal(p, m(5, 0, 4, 0))).toBe(false);
    expect(isLegal(p, m(3, 0, 4, 0))).toBe(false);
    expect(isLegal(p, m(9, 0, 5, 0))).toBe(false);
    expect(isLegal(p, m(6, 0, 5, 0))).toBe(true);
  });

  it("mọi nước hợp lệ đều không để tướng mình bị chiếu", () => {
    const p = parseFen("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 b");
    for (const mv of legalMoves(p)) expect(inCheck(applyMove(p, mv).board, "b")).toBe(false);
  });
});

describe("applyMove", () => {
  it("không sửa thế cũ, đổi lượt, quân bị ăn biến mất", () => {
    const p = pos({ "9,3": "K", "0,5": "k", "5,0": "R", "2,0": "n" });
    const before = p.board.slice();
    const next = applyMove(p, m(5, 0, 2, 0));
    expect(p.board).toEqual(before);
    expect(next.turn).toBe("b");
    expect(next.board[sq(2, 0)]).toBe("R");
    expect(next.board[sq(5, 0)]).toBeNull();
    expect(next.board.filter(Boolean)).toHaveLength(3);
  });
});

describe("kết thúc ván", () => {
  it("thế ban đầu chưa kết thúc, không ai bị chiếu", () => {
    expect(outcome(initialPosition())).toEqual({ over: false, check: false });
  });

  it("đang bị chiếu nhưng còn nước gỡ thì chưa thua", () => {
    expect(outcome(pos({ "9,4": "K", "5,4": "r", "0,3": "k" }))).toEqual({ over: false, check: true });
  });

  it("chiếu bí bằng hai xe (song xe)", () => {
    const p = pos({ "0,4": "k", "0,0": "R", "1,8": "R", "9,3": "K" }, "b");
    expect(outcome(p)).toEqual({ over: true, winner: "r", reason: "checkmate" });
  });

  it("Đỏ bị chiếu bí thì Đen thắng", () => {
    expect(outcome(mirror(pos({ "0,4": "k", "0,0": "R", "1,8": "R", "9,3": "K" }, "b")))).toEqual({
      over: true, winner: "b", reason: "checkmate",
    });
  });

  it("hết nước đi mà không bị chiếu vẫn là thua (khác cờ vua)", () => {
    const p = parseFen("4k4/3P1P3/9/9/9/9/9/9/9/3K5 b");
    expect(inCheck(p.board, "b")).toBe(false);
    expect(outcome(p)).toEqual({ over: true, winner: "r", reason: "stalemate" });
  });
});

describe("không đủ quân chiếu bí", () => {
  it("chỉ còn Tướng, Sĩ, Tượng ở cả hai bên", () => {
    expect(insufficientMaterial(pos({ "9,4": "K", "9,3": "A", "9,2": "B", "0,4": "k", "0,6": "b" }).board)).toBe(true);
    expect(insufficientMaterial(pos({ "9,4": "K", "0,3": "k" }).board)).toBe(true);
  });

  it.each(["P", "p", "N", "c", "R"])("còn %s thì vẫn có thể chiếu bí", (piece) => {
    expect(insufficientMaterial(pos({ "9,4": "K", "0,3": "k", "5,0": piece }).board)).toBe(false);
  });

  it("thế ban đầu đủ quân", () => {
    expect(insufficientMaterial(initialPosition().board)).toBe(false);
  });
});

describe("đối xứng Đỏ/Đen", () => {
  it("thế soi gương có cùng số nước đi", () => {
    for (const fen of ["3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w", "2bakab2/9/9/p1p3p1p/9/4C4/9/C8/9/3K5 w"]) {
      const p = parseFen(fen);
      expect(legalMoves(mirror(p))).toHaveLength(legalMoves(p).length);
    }
  });
});

describe("perft (số thế cờ chuẩn của cờ tướng)", () => {
  it("độ sâu 1 / 2 / 3 = 44 / 1.920 / 79.666", () => {
    const start = initialPosition();
    expect(perft(start, 1)).toBe(44);
    expect(perft(start, 2)).toBe(1920);
    expect(perft(start, 3)).toBe(79666);
  });

  it("Đen đi trước từ thế ban đầu cho cùng kết quả độ sâu 2", () => {
    expect(perft(parseFen(START_FEN.replace(" w", " b")), 2)).toBe(1920);
  });
});
