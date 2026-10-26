import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUZZLES, findPuzzle } from "@/lib/xiangqi/puzzles";
import { StagePuzzleControl } from "./StagePuzzleControl";
import { buildPuzzleStage } from "./stage-puzzle";

describe("StagePuzzleControl", () => {
  const samplePuzzle = findPuzzle("bach-dien-tuong") ?? PUZZLES[0];

  it("hiển thị ô xem trước toàn bộ lời giải riêng cho người dẫn", () => {
    const onUpdatePuzzle = vi.fn();
    render(
      <StagePuzzleControl
        currentPuzzle={null}
        onUpdatePuzzle={onUpdatePuzzle}
        canOperate={true}
      />
    );

    expect(screen.getByText(/Toàn bộ lời giải/i)).toBeDefined();
    expect(screen.getByText(/Chỉ bạn thấy/i)).toBeDefined();
  });

  it("cho phép người dẫn chọn tiết mục Lên sân khấu -> Đếm ngược -> Gợi ý -> Lật đáp án", () => {
    const onUpdatePuzzle = vi.fn();
    const { rerender } = render(
      <StagePuzzleControl
        currentPuzzle={null}
        onUpdatePuzzle={onUpdatePuzzle}
        canOperate={true}
      />
    );

    // 1. Bấm Lên sân khấu (Intro)
    const introBtn = screen.getByRole("button", { name: /Lên sân khấu/i });
    fireEvent.click(introBtn);
    expect(onUpdatePuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "intro", revealPly: 0 }),
    );

    // Giả lập sân khấu nhận phase intro
    const stageIntro = buildPuzzleStage(samplePuzzle, "intro", 0);
    rerender(
      <StagePuzzleControl
        currentPuzzle={stageIntro}
        onUpdatePuzzle={onUpdatePuzzle}
        canOperate={true}
      />
    );

    // 2. Bấm Bắt đầu đếm ngược (Thinking)
    const thinkingBtn = screen.getByRole("button", { name: /Đếm ngược/i });
    fireEvent.click(thinkingBtn);
    expect(onUpdatePuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "thinking", countdown: expect.any(Object) }),
    );

    // 3. Bấm Gợi ý (Hint)
    const hintBtn = screen.getByRole("button", { name: /Gợi ý/i });
    fireEvent.click(hintBtn);
    expect(onUpdatePuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "hint", hintText: samplePuzzle.hint }),
    );

    // 4. Bấm Lật nước tiếp
    const nextBtn = screen.getByRole("button", { name: /Lật nước tiếp/i });
    fireEvent.click(nextBtn);
    expect(onUpdatePuzzle).toHaveBeenCalledWith(
      expect.objectContaining({ revealPly: 1 }),
    );
  });

  it("khóa các nút điều khiển khi canOperate === false (chống gian lận khi đang đánh ván thật)", () => {
    const onUpdatePuzzle = vi.fn();
    render(
      <StagePuzzleControl
        currentPuzzle={null}
        onUpdatePuzzle={onUpdatePuzzle}
        canOperate={false}
      />
    );

    expect(screen.getByText(/Ván đấu đang diễn ra/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Lên sân khấu/i })).toHaveProperty("disabled", true);
  });

  describe("chọn thế và tự lật", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("đổi bộ lọc chương làm ẩn thế đang chọn: gửi đúng thế đang hiện trong ô chọn", () => {
      const onUpdatePuzzle = vi.fn();
      render(<StagePuzzleControl currentPuzzle={null} onUpdatePuzzle={onUpdatePuzzle} canOperate={true} />);
      const chapter = "Liên sát 3 nước";
      const firstInChapter = PUZZLES.find((p) => p.chapter === chapter)!;

      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: chapter } });
      fireEvent.click(screen.getByRole("button", { name: /Lên sân khấu/i }));

      expect(onUpdatePuzzle).toHaveBeenLastCalledWith(expect.objectContaining({ puzzleId: firstInChapter.id }));
    });

    it("tự lật vẫn chạy khi trang cha render lại liên tục với hàm gửi mới", () => {
      vi.useFakeTimers();
      const deep = PUZZLES.find((p) => (p.line?.length ?? 0) >= 5)!;
      const sent = vi.fn();
      const atPly = (ply: number) => buildPuzzleStage(deep, "reveal", ply);
      const { rerender } = render(
        <StagePuzzleControl currentPuzzle={atPly(1)} onUpdatePuzzle={(p) => sent(p)} canOperate={true} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /Tự lật hết/i }));
      expect(sent).toHaveBeenLastCalledWith(expect.objectContaining({ revealPly: 2 }));
      rerender(<StagePuzzleControl currentPuzzle={atPly(2)} onUpdatePuzzle={(p) => sent(p)} canOperate={true} />);

      // Trang cha render lại mỗi giây (gói tin bàn cờ, đồng hồ), mỗi lần một hàm gửi mới.
      for (let i = 0; i < 3; i++) {
        act(() => vi.advanceTimersByTime(1000));
        rerender(<StagePuzzleControl currentPuzzle={atPly(2)} onUpdatePuzzle={(p) => sent(p)} canOperate={true} />);
      }
      expect(sent).toHaveBeenLastCalledWith(expect.objectContaining({ revealPly: 3 }));
    });

    it("lùi một nước vẫn giữ lời kể trên sân khấu", () => {
      const deep = PUZZLES.find((p) => (p.line?.length ?? 0) >= 5)!;
      const onUpdatePuzzle = vi.fn();
      render(
        <StagePuzzleControl currentPuzzle={buildPuzzleStage(deep, "reveal", 3)} onUpdatePuzzle={onUpdatePuzzle} canOperate={true} />,
      );
      fireEvent.change(screen.getByPlaceholderText(/Nhập lời kể/), { target: { value: "Xe thí quân" } });
      fireEvent.click(screen.getByRole("button", { name: /Lùi 1 nước/i }));

      expect(onUpdatePuzzle).toHaveBeenLastCalledWith(expect.objectContaining({ revealPly: 2, caption: "Xe thí quân" }));
    });
  });
});
