// AI: hàm lượng giá, các tình huống chiến thuật cơ bản, giới hạn thời gian, độ "người" ở cấp thấp.
// Các test dùng thế cờ nhỏ hoặc giả lập đồng hồ để không tốn CPU (cấp cao nhất được nghĩ tới 4,5 giây).

import { describe, expect, it, vi } from "vitest";
import { m, mirror, pos } from "@/test/xiangqi";
import { AI_LEVELS, evaluate, findBestMove, type AiLevel } from "./ai";
import {
  Board, Position, applyMove, colOf, initialPosition, isLegal, legalMoves, outcome, parseFen, rowOf, sq,
} from "./engine";
import { PUZZLES } from "./puzzles";

const LEVELS = [1, 2, 3, 4, 5] as const satisfies readonly AiLevel[];

const flipLR = (b: Board): Board => b.map((_, i) => b[sq(rowOf(i), 8 - colOf(i))]);

/** Bên đi có nước chiếu bí ngay không. */
const hasMateInOne = (p: Position) => legalMoves(p).some((mv) => outcome(applyMove(p, mv)).over);

/** Bộ sinh số ngẫu nhiên có hạt giống (Park–Miller), để test tất định. */
function seeded(seed: number) {
  let x = seed;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

describe("cấp độ", () => {
  it("5 cấp, cấp càng cao nghĩ càng sâu, càng lâu, càng ít 'đi bừa'", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      const lo = AI_LEVELS[LEVELS[i - 1]];
      const hi = AI_LEVELS[LEVELS[i]];
      expect(hi.depth).toBeGreaterThan(lo.depth);
      expect(hi.timeMs).toBeGreaterThan(lo.timeMs);
      expect(hi.noise).toBeLessThanOrEqual(lo.noise);
    }
    expect(AI_LEVELS[4].noise).toBe(0);
    expect(AI_LEVELS[5].noise).toBe(0);
    for (const l of LEVELS) expect(AI_LEVELS[l].label).toMatch(/\S/);
  });
});

describe("hàm lượng giá", () => {
  it("thế ban đầu cân bằng (= 0)", () => {
    expect(evaluate(initialPosition().board)).toBe(0);
  });

  it("đổi màu và lật bàn thì điểm đổi dấu; lật trái–phải thì giữ nguyên", () => {
    for (const p of PUZZLES.map((x) => parseFen(x.fen))) {
      expect(evaluate(mirror(p).board)).toBe(-evaluate(p.board));
      expect(evaluate(flipLR(p.board))).toBe(evaluate(p.board));
    }
  });

  it("hơn quân thì điểm nghiêng về bên đó; Xe > Pháo ≈ Mã > Sĩ, Tượng > Tốt chưa qua sông", () => {
    const base = pos({ "9,3": "K", "0,5": "k" });
    const withPiece = (piece: string, at = "5,0") => evaluate(pos({ "9,3": "K", "0,5": "k", [at]: piece }).board);
    expect(evaluate(base.board)).toBe(0);
    expect(withPiece("R")).toBeGreaterThan(withPiece("C"));
    expect(withPiece("C")).toBeGreaterThan(withPiece("A", "8,4"));
    expect(withPiece("N")).toBeGreaterThan(withPiece("B", "9,2"));
    expect(withPiece("B", "9,2")).toBeGreaterThan(withPiece("P", "6,0"));
    expect(withPiece("r")).toBeLessThan(0);
  });

  it("tốt qua sông có giá trị hơn tốt chưa qua sông; tốt chạm đáy kém giá trị", () => {
    const at = (cell: string) => evaluate(pos({ "9,3": "K", "0,5": "k", [cell]: "P" }).board);
    expect(at("4,4")).toBeGreaterThan(at("6,4"));
    expect(at("2,4")).toBeGreaterThan(at("0,4"));
  });
});

describe("tình huống chiến thuật", () => {
  it.each(LEVELS)("cấp %i thấy nước chiếu bí 1 nước", (level) => {
    const p = parseFen(PUZZLES[0].fen);
    const { move } = findBestMove(p, level, () => 0.5);
    expect(move).not.toBeNull();
    expect(outcome(applyMove(p, move!))).toMatchObject({ over: true, winner: "r" });
  });

  it.each(PUZZLES.map((p) => [p.title, p] as const))("giải được cờ thế '%s'", (_title, puzzle) => {
    const p = parseFen(puzzle.fen);
    const { move } = findBestMove(p, 3, () => 0);
    expect(outcome(applyMove(p, move!))).toMatchObject({ over: true, winner: "r" });
  });

  it("cầm quân Đen cũng chiếu bí được", () => {
    const p = mirror(parseFen(PUZZLES[0].fen));
    const { move } = findBestMove(p, 2, () => 0);
    expect(outcome(applyMove(p, move!))).toMatchObject({ over: true, winner: "b" });
  });

  it("ăn quân được cho không", () => {
    const p = parseFen("4k4/9/9/9/9/4r4/9/9/4R4/3K5 w");
    expect(findBestMove(p, 3, () => 0).move).toEqual(m(8, 4, 5, 4));
  });

  it.each([1, 2, 3] as const)("cấp %i không đổi Xe lấy một Tốt có quân bảo vệ", (level) => {
    // Xe đỏ ăn tốt (3,0) sẽ bị xe đen (0,0) ăn lại.
    const p = pos({ "9,3": "K", "7,0": "R", "0,5": "k", "3,0": "p", "0,0": "r" });
    expect(findBestMove(p, level, () => 0).move).not.toEqual(m(7, 0, 3, 0));
  });

  it.each([2, 3, 4] as const)("cấp %i đỡ được đòn dọa chiếu bí 1 nước của đối phương", (level) => {
    // Đen dọa xe (0,0) xuống (9,0) chiếu bí (xe (8,8) khóa hàng 8). Chỉ 6/18 nước của Đỏ đỡ được.
    const p = pos({ "9,3": "K", "6,6": "R", "0,5": "k", "0,0": "r", "8,8": "r" });
    expect(hasMateInOne({ ...p, turn: "b" })).toBe(true);
    const { move } = findBestMove(p, level, () => 0);
    expect(hasMateInOne(applyMove(p, move!))).toBe(false);
  });

  it("đang bị chiếu thì chọn nước gỡ chiếu", () => {
    const p = pos({ "9,4": "K", "5,4": "r", "0,3": "k", "9,0": "R" });
    const { move } = findBestMove(p, 2, () => 0);
    expect(isLegal(p, move!)).toBe(true);
  });

  it("hết nước đi thì trả về null", () => {
    const stalemated = parseFen("4k4/3P1P3/9/9/9/9/9/9/9/3K5 b");
    expect(findBestMove(stalemated, 3)).toMatchObject({ move: null, depth: 0 });
  });
});

describe("giới hạn thời gian", () => {
  it("hết giờ giữa chừng vẫn trả về nước hợp lệ của độ sâu đã xong", () => {
    // Lần gọi đầu đặt hạn chót; các lần sau đồng hồ đã vượt hạn → dừng ở lần kiểm tra đầu tiên.
    let calls = 0;
    vi.spyOn(Date, "now").mockImplementation(() => (calls++ === 0 ? 1_000 : 1e15));
    const p = initialPosition();
    const res = findBestMove(p, 5, () => 0);
    expect(res.move).not.toBeNull();
    expect(isLegal(p, res.move!)).toBe(true);
    expect(res.depth).toBeGreaterThanOrEqual(1);
    expect(res.depth).toBeLessThan(AI_LEVELS[5].depth);
    expect(res.nodes).toBeGreaterThan(0);
  });

  it("thấy chiếu bí thì dừng sớm, không nghĩ hết giờ", () => {
    const t = performance.now();
    const res = findBestMove(parseFen(PUZZLES[0].fen), 5);
    expect(res.depth).toBe(1);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe("độ ngẫu nhiên", () => {
  it("cấp thấp không phải lúc nào cũng đi cùng một nước", () => {
    const p = initialPosition();
    const moves = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(findBestMove(p, 1, seeded(seed)).move)));
    expect(moves.size).toBeGreaterThan(1);
  });

  it("cấp cao không dùng tới số ngẫu nhiên (đánh ổn định)", () => {
    const random = vi.fn(() => 0.5);
    findBestMove(parseFen(PUZZLES[0].fen), 4, random);
    expect(random).not.toHaveBeenCalled();
  });

  it("nước trả về luôn hợp lệ dọc theo một ván ngẫu nhiên", () => {
    let p = initialPosition();
    const rnd = seeded(42);
    for (let ply = 0; ply < 12 && !outcome(p).over; ply++) {
      const { move } = findBestMove(p, 1, rnd);
      expect(isLegal(p, move!)).toBe(true);
      p = applyMove(p, move!);
    }
  });
});
