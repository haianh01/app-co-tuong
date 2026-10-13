import { describe, expect, it } from "vitest";
import { parseFen, opponent, type Board, type Move } from "./engine";
import { choosePlan, strategicScore, WEIGHTS, detectOpeningFault } from "./strategy";
import { detectTheoreticalEndgame } from "./endgame";
import { detectOpeningFromMoves } from "./openings";
import { explainMove, type MoveContext } from "./explain";
import { uciToMove } from "./uci";
import { assessPosition } from "./assess";
import { detectIntent, type Purpose } from "./intent";
import { BENCHMARK_POSITIONS } from "./benchmark-positions";

function playMove(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

describe("Benchmark Test Suite - Bộ 30+ thế cờ mẫu kiểm chuẩn và hồi quy", () => {
  it("chứa ít nhất 30 thế cờ mẫu", () => {
    expect(BENCHMARK_POSITIONS.length).toBeGreaterThanOrEqual(30);
  });

  describe("Hiệu chuẩn và kiểm tra bảng trọng số WEIGHTS", () => {
    it("kế hoạch raQuan: trọng số raQuan cao nhất để khuyến khích phát triển quân", () => {
      expect(WEIGHTS.raQuan.raQuan).toBeGreaterThanOrEqual(WEIGHTS.raQuan.apLuc);
      expect(WEIGHTS.raQuan.raQuan).toBeGreaterThanOrEqual(WEIGHTS.raQuan.tot);
    });

    it("kế hoạch phongThu: trọng số anToan cao nhất để giữ cung tướng", () => {
      expect(WEIGHTS.phongThu.anToan).toBeGreaterThanOrEqual(WEIGHTS.phongThu.apLuc);
      expect(WEIGHTS.phongThu.anToan).toBeGreaterThanOrEqual(WEIGHTS.phongThu.raQuan);
    });

    it("kế hoạch tanCong: trọng số apLuc cao để uy hiếp cung tướng đối phương", () => {
      expect(WEIGHTS.tanCong.apLuc).toBeGreaterThanOrEqual(WEIGHTS.tanCong.anToan);
      expect(WEIGHTS.tanCong.totVaoCung).toBeGreaterThan(0);
      expect(WEIGHTS.tanCong.khuyetSi).toBeGreaterThan(0);
    });

    it("kế hoạch tanCuoc: trọng số tốt và totVaoCung cao để đẩy tốt qua sông", () => {
      expect(WEIGHTS.tanCuoc.tot).toBeGreaterThanOrEqual(2);
      expect(WEIGHTS.tanCuoc.totVaoCung).toBeGreaterThanOrEqual(3);
      expect(WEIGHTS.tanCuoc.khuyetSi).toBeGreaterThanOrEqual(2);
    });

    it("kế hoạch donGianHoa: giữ anToan và matGoc khi đang ưu thế", () => {
      expect(WEIGHTS.donGianHoa.anToan).toBeGreaterThanOrEqual(2);
      expect(WEIGHTS.donGianHoa.matGoc).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Kiểm tra phân loại và đánh giá từng thế cờ mẫu", () => {
    for (const pos of BENCHMARK_POSITIONS) {
      it(`[${pos.id}] ${pos.name}`, () => {
        const { board, turn } = parseFen(pos.fen);

        // 1. Kiểm tra kế hoạch chiến lược (nếu có kỳ vọng)
        if (pos.expected.plan) {
          // Trích xuất ply từ FEN nếu có, mặc định theo category
          const ply = pos.category === "opening" ? 2 : pos.category === "strategy" ? 30 : 40;
          const plan = choosePlan(board, turn, ply);
          expect(plan).toBe(pos.expected.plan);

          // Điểm chiến lược tổng phải tính toán được (không bị NaN hay undefined)
          const score = strategicScore(board, turn, plan);
          expect(Number.isFinite(score)).toBe(true);
        }

        // 2. Kiểm tra tên thế trận khai cuộc (nếu có kỳ vọng)
        if (pos.expected.openingName && pos.moves) {
          const detected = detectOpeningFromMoves(pos.moves);
          expect(detected).toBe(pos.expected.openingName);
        }

        // 3. Kiểm tra lỗi khai cuộc (nếu có kỳ vọng)
        if (pos.expected.openingFault) {
          const move = pos.move ? uciToMove(pos.move)! : { from: 0, to: 0 };
          const mover = turn;
          const ply = pos.id.includes("late_rook") ? 8 : 4;
          const historyMoves = pos.id.includes("repeat_piece")
            ? [{ from: 70, to: move.from }, { from: 1, to: 19 }]
            : undefined;
          const fault = detectOpeningFault(board, move, ply, mover, historyMoves);
          expect(fault?.fault).toBe(pos.expected.openingFault);
        }

        // 4. Kiểm tra đòn chiến thuật (nếu có kỳ vọng)
        if (pos.expected.tacticalKind && pos.move) {
          const move = uciToMove(pos.move)!;
          const reply = pos.reply ? uciToMove(pos.reply) : null;
          const after = playMove(board, move);
          const isMate = pos.expected.tacticalKind === "allowsMate";
          const isParried = pos.expected.tacticalKind === "parried";
          const isIgnored = pos.expected.tacticalKind === "ignoredThreat";
          const loss = isParried ? 0 : isIgnored ? 350 : 100;
          const threatBefore =
            isIgnored || isParried
              ? reply
                ? {
                    threatMove: reply,
                    score: 400,
                    pv: [reply],
                    isMate: false,
                    opponent: opponent(turn),
                  }
                : null
              : null;
          const ctx: MoveContext = {
            before: board,
            move,
            after,
            evalBefore: null,
            evalAfter: reply
              ? {
                  score: isMate ? 99999 : 0,
                  best: reply,
                  pv: [reply],
                  depth: 1,
                }
              : null,
            loss,
            ply: 20,
            threatBefore,
          };
          const facts = explainMove(ctx);
          const found = facts.some((f) => f.kind === pos.expected.tacticalKind);
          expect(found).toBe(true);
        }

        // 5. Kiểm tra tàn cuộc lý thuyết (nếu thuộc category endgame)
        if (pos.category === "endgame") {
          const eg = detectTheoreticalEndgame(board);
          expect(eg).not.toBeNull();
          if (pos.expected.endgameOutcome) {
            expect(eg?.outcome).toBe(pos.expected.endgameOutcome);
          }
          if (pos.expected.endgameWinner) {
            expect(eg?.winner).toBe(pos.expected.endgameWinner);
          }
          if (pos.expected.endgameId) {
            expect(eg?.id).toBe(pos.expected.endgameId);
          }
        }

        // 6. Kiểm tra top yếu tố đánh giá thế cờ (nếu có kỳ vọng)
        if (pos.expected.assessmentTop) {
          const assess = assessPosition(board);
          const topIds = assess.factors.map((f) => f.id);
          for (const expectedId of pos.expected.assessmentTop) {
            expect(topIds).toContain(expectedId);
          }
        }

        // 7. Kiểm tra trích xuất ý đồ nước cờ (nếu có kỳ vọng intent)
        if (pos.expected.intent && pos.move) {
          const move = uciToMove(pos.move)!;
          const after = playMove(board, move);
          const isSacMate = pos.id.includes("sacrifice");
          const intent = detectIntent(board, move, after, {
            loss: 0,
            evalAfter: isSacMate ? { score: -99999 } : undefined,
          });
          expect(intent).not.toBeNull();
          for (const expectedPurpose of pos.expected.intent) {
            expect(intent?.purposes).toContain(expectedPurpose as Purpose);
          }
        }
      });
    }
  });
});
