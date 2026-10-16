import { describe, expect, it } from "vitest";
import { findBestMove } from "./ai";
import { reviewGame, type MoveReview, type PositionEval, type ReviewResult } from "./analysis";
import { legalMoves, parseFen, START_FEN, type Move } from "./engine";
import { replayMoves } from "./game";
import { moveNotation } from "./notation";
import { balanceText, buildStory, summarizeGame } from "./story";

const A: Move = { from: 1, to: 2 };
const B: Move = { from: 3, to: 4 };
const C: Move = { from: 5, to: 6 };
const EMPTY = replayMoves([]);

/** MoveReview tối thiểu cho ply `ply`; winAfter tính theo bên đi. */
function mv(ply: number, extra: Partial<MoveReview>): MoveReview {
  return { ply, side: ply % 2 === 1 ? "r" : "b", notation: `N${ply}`, loss: 0, cls: null, better: null, facts: [], ...extra };
}
const story = (moves: MoveReview[]) => buildStory({ moves, accuracy: { r: null, b: null } } as ReviewResult, EMPTY);

describe("buildStory", () => {
  it("đối phương đi đúng nước AI tính sau sai lầm: trừng phạt", () => {
    const notes = story([mv(1, { cls: "blunder", replyMove: A, line: ["X1.1"] }), mv(2, { move: A, notation: "X1.1" })]);
    const n = notes.find((x) => x.kind === "punished");
    expect(n?.ply).toBe(2);
    expect(n?.text).toContain("Đen trừng phạt ngay sai lầm N1 của Đỏ");
  });

  it("đối phương đi khác và cũng mắc lỗi: bỏ lỡ cơ hội, nêu nước lẽ ra nên đi", () => {
    const notes = story([
      mv(1, { cls: "mistake", replyMove: A, line: ["M7.8"] }),
      mv(2, { move: B, notation: "M7.6", cls: "inaccuracy" }),
    ]);
    expect(notes.find((x) => x.kind === "unpunished")?.text).toBe(
      "Đen bỏ lỡ cơ hội trừng phạt N1: nước mạnh là M7.8, nhưng Đen lại đi M7.6.",
    );
  });

  it("đối phương đi khác nhưng vẫn là nước tốt: không ghi chú", () => {
    const notes = story([mv(1, { cls: "mistake", replyMove: A }), mv(2, { move: C })]);
    expect(notes.filter((x) => x.kind === "punished" || x.kind === "unpunished")).toEqual([]);
  });

  it("cán cân đổi chiều khi bên dẫn trước rõ mất lợi thế", () => {
    // winAfter theo bên đi: ply 1 Đỏ 70%; ply 2 Đen 75% (tức Đỏ 25%)
    const notes = story([mv(1, { winAfter: 0.7 }), mv(2, { winAfter: 0.75, notation: "P2-5" })]);
    expect(notes.find((x) => x.kind === "swing")?.text).toBe(
      "Cán cân đổi chiều sau Đen P2-5: từ Đỏ chiếm ưu thành Đen chiếm ưu.",
    );
  });

  it("ghi chú chuyển giai đoạn kèm cán cân", () => {
    const notes = story([mv(1, { phase: "khaiCuoc" }), mv(2, { phase: "trungCuoc", winAfter: 0.5 })]);
    expect(notes.find((x) => x.kind === "phase")?.text).toBe("Ván cờ bước vào trung cuộc. Lúc này hai bên cân bằng.");
  });

  it("nêu thế trận khai cuộc và ý đồ điển hình ở nước cuối còn khớp sách", () => {
    const review = {
      moves: [mv(1, {}), mv(2, {}), mv(3, {})],
      accuracy: { r: null, b: null },
      openingGuide: {
        line: { name: "Pháo đầu đối Bình phong Mã", moves: [] },
        name: "Pháo đầu đối Bình phong Mã",
        intent: { r: "Xe tuần hà khống chế bờ sông", b: "Củng cố trung lộ bằng Sĩ" },
        pliesMatched: 2,
        nextMoves: [],
      },
    } as ReviewResult;
    const n = buildStory(review, EMPTY).find((x) => x.kind === "opening");
    expect(n?.ply).toBe(2);
    expect(n?.text).toBe(
      "Thế trận Pháo đầu đối Bình phong Mã. Ý đồ điển hình — Đỏ: Xe tuần hà khống chế bờ sông; Đen: Củng cố trung lộ bằng Sĩ.",
    );
  });

  it("diễn đạt cán cân", () => {
    expect(balanceText(0.9)).toBe("Đỏ ưu thế lớn");
    expect(balanceText(0.3)).toBe("Đen chiếm ưu");
    expect(balanceText(0.52)).toBe("hai bên cân bằng");
  });

  it("chạy trên ván thật: ghi chú sắp theo thứ tự nước, không có ply ngoài ván", () => {
    const seq = "B3.1 P8-5 M2.3 M8.7 T3.5 X9-8 P2-1 B5.1 S4.5 M2.3 X1-4 M3.5 P8-6 B5.1 B5.1 P5.3 M8.7 X1.1 X9-8 P2-5 M3.5 X1-4 B7.1 X4.5".split(" ");
    let pos = parseFen(START_FEN);
    const moves: Move[] = [];
    for (const n of seq) {
      const m = legalMoves(pos).find((x) => moveNotation(pos.board, x) === n)!;
      moves.push(m);
      pos = { board: pos.board.map((p, i) => (i === m.to ? pos.board[m.from] : i === m.from ? null : p)), turn: pos.turn === "r" ? "b" : "r" };
    }
    const state = replayMoves(moves);
    const evals: PositionEval[] = state.history.map((p) => {
      const r = findBestMove(p, 1, () => 0, { depth: 1, timeMs: 60_000, noise: 0 });
      return { score: r.score, best: r.move };
    });
    const notes = buildStory(reviewGame(state, evals), state);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n, i) => i === 0 || notes[i - 1].ply <= n.ply)).toBe(true);
    expect(notes.every((n) => n.ply >= 0 && n.ply <= seq.length)).toBe(true);
    // Hai bên cùng ra quân xong: một câu gộp, không phải "thế cờ lắng xuống" cho từng bên
    const shifts = notes.filter((n) => n.kind === "planShift");
    expect(shifts.map((n) => n.text)).toContain("Hai bên đều đã ra quân xong, chuyển sang tranh vị trí, tăng hoạt động quân.");
    expect(shifts.some((n) => n.text.includes("lắng xuống"))).toBe(false);
  });
});

describe("summarizeGame", () => {
  const review = (moves: MoveReview[], acc = { r: 90, b: 80 }) => ({ moves, accuracy: acc }) as ReviewResult;

  it("gộp các sai lầm sát nhau thành chuỗi và nêu kết cục", () => {
    const moves = [
      mv(1, { phase: "khaiCuoc", winAfter: 0.5 }),
      mv(2, { phase: "trungCuoc", winAfter: 0.5 }),
      mv(3, { cls: "inaccuracy", winDrop: 0.06, winAfter: 0.44 }),
      mv(4, { cls: "mistake", winDrop: 0.12, winAfter: 0.62 }),
      mv(5, { cls: "blunder", winDrop: 0.3, notation: "B7.1", winAfter: 0.2 }),
      mv(6, { winAfter: 0.85 }),
    ];
    const state = { ...EMPTY, result: { winner: "b", reason: "checkmate" } } as typeof EMPTY;
    expect(summarizeGame(review(moves), state)).toBe(
      "Ván cờ: hai bên cân bằng tới trung cuộc. " +
        "Chuỗi sai lầm ở nước 2–3 quyết định thế trận, nặng nhất là Đỏ B7.1, có lợi cho Đen. " +
        "Đen thắng. Độ chính xác: Đỏ 90%, Đen 80%.",
    );
  });

  it("một sai lầm đơn lẻ, ván chưa kết thúc", () => {
    const moves = [
      mv(1, { phase: "trungCuoc", winAfter: 0.7 }),
      mv(2, { winAfter: 0.3 }),
      mv(3, { winAfter: 0.7 }),
      mv(4, { winAfter: 0.3 }),
      mv(5, { cls: "blunder", winDrop: 0.4, notation: "X1.1", winAfter: 0.25 }),
    ];
    expect(summarizeGame(review(moves, { r: null, b: null } as never), EMPTY)).toBe(
      "Ván cờ: Đỏ chiếm ưu khi vào trung cuộc. " +
        "Thời điểm quyết định là Đỏ X1.1 ở nước 3 (nước hớ), đẩy thế cờ về phía Đen. " +
        "Thế cờ dừng ở: Đen chiếm ưu.",
    );
  });

  it("không có sai lầm lớn", () => {
    const moves = [mv(1, { phase: "trungCuoc", winAfter: 0.5 }), mv(2, { cls: "inaccuracy", winDrop: 0.05, winAfter: 0.52 })];
    expect(summarizeGame(review(moves), EMPTY)).toContain("Không có sai lầm lớn");
  });
});
