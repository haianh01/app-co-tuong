import { describe, expect, it } from "vitest";
import { type Board, type Move, type Side, START_FEN, legalMoves, opponent, parseFen, play, sq } from "./engine";
import { type PlayedMove } from "./game";
import { moveNotation } from "./notation";
import {
  extractWeaknesses,
  narratePlanThread,
  trackPlanThreads,
  type PlanThread,
} from "./plan-thread";

/** Dựng bàn cờ từ danh sách quân: chữ hoa là Đỏ, chữ thường là Đen; hàng 0 là đáy Đen, hàng 9 là đáy Đỏ. */
function boardOf(pieces: [string, number, number][]): Board {
  const b: Board = Array(90).fill(null);
  for (const [p, r, c] of pieces) b[sq(r, c)] = p;
  return b;
}

/** Tìm nước theo ký hiệu Việt Nam. */
function findMove(board: Board, notation: string, turn: Side): Move {
  const m = legalMoves({ board, turn }).find((x) => moveNotation(board, x) === notation);
  if (!m) {
    const available = legalMoves({ board, turn }).map((x) => moveNotation(board, x)).join(", ");
    throw new Error(`Không tìm thấy nước ${notation} cho bên ${turn}. Các nước hợp lệ: ${available}`);
  }
  return m;
}

/** Dựng lịch sử nước đi PlayedMove[] và history Boards[] */
function simulateGame(
  initialBoard: Board,
  notations: string[],
  firstTurn: Side = "r",
): { moves: PlayedMove[]; history: Board[] } {
  const history: Board[] = [initialBoard];
  const moves: PlayedMove[] = [];
  let currentBoard = initialBoard;
  let turn = firstTurn;

  for (const not of notations) {
    const move = findMove(currentBoard, not, turn);
    const piece = currentBoard[move.from]!;
    const captured = currentBoard[move.to];
    const nextBoard = play(currentBoard, move);

    moves.push({
      move,
      notation: not,
      side: turn,
      piece,
      captured,
      check: false,
      chase: false,
    });
    history.push(nextBoard);
    currentBoard = nextBoard;
    turn = opponent(turn);
  }

  return { moves, history };
}

describe("plan-thread", () => {
  describe("extractWeaknesses (Anti-hallucination & Fail-closed)", () => {
    it("quân đứng yên không bị đối phương dòm ngó: KHÔNG coi là điểm yếu", () => {
      // Đỏ có Tướng, Đen có Tướng và Mã c6 đứng yên, không bị quân Đỏ nào ngắm vào
      const b = boardOf([
        ["K", 9, 4],
        ["k", 0, 3],
        ["n", 3, 2], // Mã c6 không căn nhưng không bị đe dọa
      ]);
      const weaknesses = extractWeaknesses(b, "b");
      expect(weaknesses).toEqual([]);
    });

    it("quân không căn đang bị quân đối phương ngắm vào: xác nhận là điểm yếu thật sự", () => {
      // Đỏ có Xe ở a6 (hàng 3, cột 0), nhìn thẳng vào Mã c6 (hàng 3, cột 2) của Đen
      const b = boardOf([
        ["K", 9, 4],
        ["R", 3, 0], // Xe a6 ngắm vào Mã c6
        ["k", 0, 3],
        ["n", 3, 2], // Mã c6 treo đang bị Xe ngắm
      ]);
      const weaknesses = extractWeaknesses(b, "b");
      expect(weaknesses.length).toBe(1);
      expect(weaknesses[0].kind).toBe("quanTreo");
      expect(weaknesses[0].pieceType).toBe("n");
      expect(weaknesses[0].square).toBe(sq(3, 2));
    });

    it("thế cờ khai cuộc ban đầu: không có điểm yếu ảo nào được tạo ra", () => {
      const startBoard = parseFen(START_FEN).board;
      const redWeaknesses = extractWeaknesses(startBoard, "r");
      const blackWeaknesses = extractWeaknesses(startBoard, "b");
      expect(redWeaknesses).toEqual([]);
      expect(blackWeaknesses).toEqual([]);
    });
  });

  describe("Negative test: Khai cuộc chuẩn sách không được sinh mạch kế hoạch nào", () => {
    it("10 nước khai cuộc cơ bản của ván cờ thật: 0 mạch kế hoạch", () => {
      const startBoard = parseFen(START_FEN).board;
      // 10 nửa nước khai cuộc Pháo đầu đối Bình Phong Mã
      const moves = [
        "P2-5", "M8.7",
        "M2.3", "X9-8",
        "X1.1", "B7.1",
        "X1-4", "S4.5",
        "M8.7", "X8.1",
      ];
      const { moves: playedMoves, history } = simulateGame(startBoard, moves);
      const threads = trackPlanThreads(playedMoves, history);
      // Khai cuộc chuẩn tuyệt đối không được gán mạch kế hoạch
      expect(threads).toHaveLength(0);
    });
  });

  describe("Phân biệt Đòn chiến thuật 2 nước chớp nhoáng vs Kế hoạch thực sự", () => {
    it("Đòn chiến thuật ngắn 2 nước (dọa rồi ăn trong <= 3 nửa nước) bị loại bỏ, không tính là kế hoạch", () => {
      // Chỉ 1 quân Xe Đỏ dọa Mã Đen rồi ăn ngay ở nước tiếp theo
      const b = boardOf([
        ["K", 9, 4],
        ["R", 7, 0], // Xe Đỏ lộ 9
        ["k", 0, 3],
        ["n", 3, 2], // Mã Đen lộ 3 (c7)
      ]);

      const waitMoves = [
        "Tg5-4", "Tg4.1",
        "Tg4-5", "Tg4/1",
        "Tg5-4", "Tg4.1",
        "Tg4-5", "Tg4/1",
        "Tg5-4", "Tg4.1",
      ];
      const quickStrikeMoves = [
        "X9.4",  // ply 10: Xe dọa Mã
        "Tg4/1", // ply 11: Đen đi nước chờ
        "X9-7",  // ply 12: Xe ăn Mã
      ];

      const { moves, history } = simulateGame(b, [...waitMoves, ...quickStrikeMoves]);
      const threads = trackPlanThreads(moves, history);

      // Phải bị loại bỏ vì chỉ là chiến thuật 2 nước (span <= 3, 1 quân tham gia)
      expect(threads).toHaveLength(0);
    });

    it("Kế hoạch nhiều quân phối hợp thành công: 2 Xe Đỏ cùng dồn bắt Mã có lời", () => {
      const b = boardOf([
        ["K", 9, 4],
        ["R", 7, 0], // Xe Đỏ X9
        ["R", 7, 8], // Xe Đỏ X1
        ["k", 0, 3],
        ["n", 3, 2], // Mã Đen c7
      ]);

      const waitMoves = [
        "Tg5-4", "Tg4.1",
        "Tg4-5", "Tg4/1",
        "Tg5-4", "Tg4.1",
        "Tg4-5", "Tg4/1",
        "Tg5-4", "Tg4.1",
      ];
      const planMoves = [
        "X1.4",  // ply 10: Xe 1 tiến lên hàng 3 ngắm Mã (tangApLuc)
        "Tg4/1", // ply 11: Đen đi
        "X9.4",  // ply 12: Xe 9 cùng dồn lên hàng 3 ngắm Mã (tangApLuc)
        "Tg4.1", // ply 13: Đen đi
        "X9-7",  // ply 14: Xe 9 dứt điểm ăn Mã (danhDich)
      ];

      const { moves, history } = simulateGame(b, [...waitMoves, ...planMoves]);
      const threads = trackPlanThreads(moves, history);

      expect(threads.length).toBeGreaterThan(0);
      const horseThread = threads.find((t) => t.target.pieceType === "n");
      expect(horseThread).toBeDefined();
      expect(horseThread?.outcome).toBe("thanhCong");
      expect(horseThread?.strikeMove?.notation).toBe("X9-7");
    });
  });

  describe("Kế hoạch tấn công cung Tướng (cungTuong)", () => {
    it("ghi nhận kế hoạch tấn công cung tướng khi dồn ép và dứt điểm ăn Sĩ", () => {
      // Đỏ có Xe và Pháo áp sát cung Đen
      const b = boardOf([
        ["K", 9, 3], // Tướng Đỏ ở lộ 6 cột 3 tránh đối mặt Tướng lộ 5
        ["k", 0, 4],
        ["a", 0, 3], // Sĩ Đen (cột 3)
        ["a", 0, 5], // Sĩ Đen (cột 5)
        ["b", 0, 2], // Tượng Đen (cột 2)
        ["R", 3, 3], // Xe Đỏ lộ 6
        ["C", 4, 5], // Pháo Đỏ lộ 4
      ]);

      const waitMoves = [
        "Tg6.1", "T3.5",
        "Tg6/1", "T5/3",
        "Tg6.1", "T3.5",
        "Tg6/1", "T5/3",
        "Tg6.1", "T3.5",
      ];
      const attackMoves = [
        "X6.2",  // ply 10: Xe tiến xâm nhập cung uy hiếp (tangApLuc)
        "S4.5",  // ply 11: Đen đi Sĩ lên
        "P4.3",  // ply 12: Pháo tiến áp sát cung (apSat)
        "S5/4",  // ply 13: Đen đi Sĩ về
        "X6.1",  // ply 14: Xe ăn Sĩ Đen ở hàng 0 cột 3 (danhDich)
      ];

      const { moves, history } = simulateGame(b, [...waitMoves, ...attackMoves]);
      const threads = trackPlanThreads(moves, history);

      const palaceThread = threads.find((t) => t.target.kind === "cungTuong");
      expect(palaceThread).toBeDefined();
      expect(palaceThread?.outcome).toBe("thanhCong");
    });

    describe("mạch cung tướng không có đòn dứt điểm: chấm theo eval", () => {
      const b = boardOf([
        ["K", 9, 3],
        ["k", 0, 4],
        ["a", 0, 3],
        ["a", 0, 5],
        ["b", 0, 2],
        ["R", 3, 3],
        ["C", 4, 5],
      ]);
      const notations = [
        "Tg6.1", "T3.5", "Tg6/1", "T5/3", "Tg6.1", "T3.5", "Tg6/1", "T5/3", "Tg6.1", "T3.5",
        "X6.2", "S4.5", // ply 11: tangApLuc
        "X6/1", "T5.3",
        "P4.3", "T3/5", // ply 15: route đủ 3 bước, sau đó Đỏ dừng công
        "Tg6/1", "T5.3", "Tg6.1", "T3/5", "Tg6/1", "T5.3", "Tg6.1", "T3/5", "Tg6/1", "T5.3",
      ];
      const { moves, history } = simulateGame(b, notations);
      /** Eval tính theo bên đến lượt; `red(ply)` là điểm theo chiều Đỏ. */
      const evalsOf = (red: (ply: number) => number) =>
        history.map((_, ply) => ({ score: ply % 2 === 0 ? red(ply) : -red(ply), best: null }));
      const outcome = (evals?: ReturnType<typeof evalsOf>) =>
        trackPlanThreads(moves, history, evals).find((t) => t.target.kind === "cungTuong")?.outcome;

      it("không có eval: fail-closed thành bỏ dở", () => {
        expect(outcome()).toBe("boDo");
      });

      it("eval bên công tăng >= 200cp: thành công", () => {
        expect(outcome(evalsOf((ply) => (ply >= 11 ? 300 : 0)))).toBe("thanhCong");
      });

      it("eval tăng dưới 200cp: bỏ dở", () => {
        expect(outcome(evalsOf((ply) => (ply >= 11 ? 100 : 0)))).toBe("boDo");
      });

      it("điểm chiếu bí được kẹp: chỉ đổi số nước tới bí không được tính là tăng ưu thế", () => {
        // Đỏ bị chiếu bí suốt mạch, chỉ là xa hơn vài nước: chênh lệch thô ~100000 nhưng không phải ưu thế thật.
        expect(outcome(evalsOf((ply) => (ply >= 11 ? -900_000 : -1_000_000)))).toBe("boDo");
      });
    });
  });

  describe("narratePlanThread", () => {
    it("sinh câu bình luận trung tính và chuẩn xác cho thanhCong", () => {
      const mockThread: PlanThread = {
        id: "thread-1",
        side: "r",
        target: {
          id: "b-treo-32",
          kind: "quanTreo",
          side: "b",
          square: 32,
          pieceType: "n",
          description: "Mã 7 không có căn giữ",
        },
        startPly: 11,
        endPly: 15,
        route: [
          { ply: 11, side: "r", move: { from: 1, to: 2 }, notation: "X1.4", role: "tangApLuc", piece: "r" },
          { ply: 13, side: "r", move: { from: 3, to: 4 }, notation: "X9.4", role: "tangApLuc", piece: "r" },
          { ply: 15, side: "r", move: { from: 4, to: 5 }, notation: "X9-7", role: "danhDich", piece: "r" },
        ],
        outcome: "thanhCong",
        strikeMove: { ply: 15, notation: "X9-7" },
        summary: "",
      };

      const narrative = narratePlanThread(mockThread);
      expect(narrative).toContain("Từ nước 6 đến 8");
      expect(narrative).toContain("Đỏ điều quân");
      expect(narrative).toContain("X1.4, X9.4, X9-7");
      expect(narrative).toContain("nhắm vào Mã 7 không có căn giữ");
      expect(narrative).toContain("Đến nước 8, Đỏ hoàn thành ý đồ bằng X9-7.");
    });

    it("sinh câu bình luận chuẩn xác cho đổi quân ngang giá (doiQuan)", () => {
      const mockThread: PlanThread = {
        id: "thread-2",
        side: "r",
        target: {
          id: "b-treo-32",
          kind: "quanTreo",
          side: "b",
          square: 32,
          pieceType: "n",
          description: "Mã 7 không có căn giữ",
        },
        startPly: 11,
        endPly: 15,
        route: [
          { ply: 11, side: "r", move: { from: 1, to: 2 }, notation: "X1.4", role: "tangApLuc", piece: "r" },
          { ply: 13, side: "r", move: { from: 3, to: 4 }, notation: "X9.4", role: "tangApLuc", piece: "c" },
          { ply: 15, side: "r", move: { from: 4, to: 5 }, notation: "X9-7", role: "danhDich", piece: "r" },
        ],
        outcome: "doiQuan",
        strikeMove: { ply: 15, notation: "X9-7" },
        summary: "",
      };

      const narrative = narratePlanThread(mockThread);
      expect(narrative).toContain("Từ nước 6 đến 8");
      expect(narrative).toContain("Đỏ dàn quân");
      expect(narrative).toContain("ép đổi quân ở Mã 7 không có căn giữ");
      expect(narrative).toContain("Đến nước 8, Đỏ tiến hành đổi quân bằng X9-7.");
    });
  });
});
