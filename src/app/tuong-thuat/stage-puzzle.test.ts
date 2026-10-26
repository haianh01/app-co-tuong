import { describe, expect, it } from "vitest";
import { applyMove, isLegal, outcome, parseFen } from "@/lib/xiangqi/engine";
import { PUZZLES, findPuzzle } from "@/lib/xiangqi/puzzles";
import { buildPuzzleStage, countdownSecondsLeft, puzzleSolutionLine } from "./stage-puzzle";

describe("stage-puzzle", () => {
  describe("puzzleSolutionLine", () => {
    it("mọi thế cờ trong PUZZLES đều dựng được biến lời giải dẫn tới Đỏ thắng", () => {
      expect(PUZZLES.length).toBeGreaterThanOrEqual(40);
      for (const puzzle of PUZZLES) {
        const line = puzzleSolutionLine(puzzle);
        expect(line.length).toBe(2 * puzzle.depth - 1);
        expect(line[0].from).toBe(puzzle.solution.from);
        expect(line[0].to).toBe(puzzle.solution.to);

        let pos = parseFen(puzzle.fen);
        for (let i = 0; i < line.length; i++) {
          const m = line[i];
          expect(isLegal(pos, m)).toBe(true);
          pos = applyMove(pos, m);
          if (i < line.length - 1) {
            expect(outcome(pos).over).toBe(false);
          }
        }
        const finalOutcome = outcome(pos);
        expect(finalOutcome).toMatchObject({ over: true, winner: "r" });
      }
    });

    it("ưu tiên dùng puzzle.line có sẵn khi có", () => {
      const deepPuzzle = PUZZLES.find((p) => p.line && p.line.length > 0)!;
      expect(deepPuzzle).toBeDefined();
      const line = puzzleSolutionLine(deepPuzzle);
      expect(line).toEqual(deepPuzzle.line);
    });
  });

  describe("buildPuzzleStage - Chống lộ đáp án", () => {
    const puzzle = findPuzzle("bach-dien-tuong")!;

    it("ở phase intro: không có nước nào trong revealed, không có mũi tên, bàn cờ nguyên bản", () => {
      const state = buildPuzzleStage(puzzle, "intro", 5);
      expect(state.phase).toBe("intro");
      expect(state.revealPly).toBe(0);
      expect(state.revealed).toEqual([]);
      expect(state.arrows).toEqual([]);
      expect(state.highlights).toEqual([]);
      expect(state.hintText).toBeNull();
      expect(state.board).toEqual(parseFen(puzzle.fen).board);
      expect(state.lastMove).toBeNull();
    });

    it("ở phase thinking: có countdown nếu truyền, vẫn không lộ nước đi hay mũi tên", () => {
      const countdown = { startedAt: 1000, durationMs: 30000 };
      const state = buildPuzzleStage(puzzle, "thinking", 3, { countdown });
      expect(state.phase).toBe("thinking");
      expect(state.revealPly).toBe(0);
      expect(state.revealed).toEqual([]);
      expect(state.arrows).toEqual([]);
      expect(state.countdown).toEqual(countdown);
      expect(state.hintText).toBeNull();
      expect(state.board).toEqual(parseFen(puzzle.fen).board);
    });

    it("ở phase hint: chỉ highlight ô quân đi đầu tiên (puzzle.solution.from), không vẽ mũi tên", () => {
      const state = buildPuzzleStage(puzzle, "hint", 4);
      expect(state.phase).toBe("hint");
      expect(state.revealPly).toBe(0);
      expect(state.revealed).toEqual([]);
      expect(state.arrows).toEqual([]);
      expect(state.highlights).toEqual([puzzle.solution.from]);
      expect(state.hintText).toBe(puzzle.hint);
      expect(state.board).toEqual(parseFen(puzzle.fen).board);
    });

    it("ở phase reveal: chỉ chứa đúng các nước đã lật, tuyệt đối không gửi trước các nước sau", () => {
      const multiMovePuzzle = PUZZLES.find((p) => p.depth >= 2)!;
      const totalPlies = 2 * multiMovePuzzle.depth - 1;

      // Lật 1 nước
      const state1 = buildPuzzleStage(multiMovePuzzle, "reveal", 1, { caption: "Nước 1" });
      expect(state1.phase).toBe("reveal");
      expect(state1.revealPly).toBe(1);
      expect(state1.totalPlies).toBe(totalPlies);
      expect(state1.revealed).toHaveLength(1);
      expect(state1.arrows).toHaveLength(1);
      expect(state1.arrows[0].from).toBe(multiMovePuzzle.solution.from);
      expect(state1.arrows[0].to).toBe(multiMovePuzzle.solution.to);
      expect(state1.caption).toBe("Nước 1");

      // Lật 2 nước
      const state2 = buildPuzzleStage(multiMovePuzzle, "reveal", 2);
      expect(state2.revealPly).toBe(2);
      expect(state2.revealed).toHaveLength(2);
      // Nước thứ 1 khớp với state1
      expect(state2.revealed[0]).toBe(state1.revealed[0]);
    });

    it("ở phase solved: lật hết toàn bộ các nước", () => {
      const multiMovePuzzle = PUZZLES.find((p) => p.depth >= 2)!;
      const totalPlies = 2 * multiMovePuzzle.depth - 1;

      const state = buildPuzzleStage(multiMovePuzzle, "solved");
      expect(state.phase).toBe("solved");
      expect(state.revealPly).toBe(totalPlies);
      expect(state.revealed).toHaveLength(totalPlies);
      const endOutcome = outcome({ board: state.board, turn: "b" });
      expect(endOutcome).toMatchObject({ over: true, winner: "r" });
    });

    it("kẹp giá trị revealPly trong khoảng an toàn", () => {
      const stateNeg = buildPuzzleStage(puzzle, "reveal", -1);
      expect(stateNeg.revealPly).toBe(0);
      expect(stateNeg.revealed).toEqual([]);

      const stateExcess = buildPuzzleStage(puzzle, "reveal", 999);
      expect(stateExcess.revealPly).toBe(stateExcess.totalPlies);
    });
  });
});

describe("countdownSecondsLeft", () => {
  const countdown = { startedAt: 10_000, durationMs: 60_000 };

  it("đếm lùi theo thời gian trôi, hết giờ thì về 0", () => {
    expect(countdownSecondsLeft(countdown, 10_000)).toBe(60);
    expect(countdownSecondsLeft(countdown, 25_500)).toBe(45);
    expect(countdownSecondsLeft(countdown, 80_000)).toBe(0);
  });

  it("mốc giờ sân khấu cũ hơn lúc bắt đầu: không hiện lố quá thời lượng", () => {
    expect(countdownSecondsLeft(countdown, 10_000 - 600_000)).toBe(60);
  });
});
