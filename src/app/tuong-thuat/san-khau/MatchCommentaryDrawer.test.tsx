import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STAGE_SETTINGS, buildStageState, type StageState } from "../stage-sync";
import { initialPosition } from "@/lib/xiangqi/engine";
import { MatchCommentaryDrawer } from "./MatchCommentaryDrawer";

function createMockState(): StageState {
  const start = initialPosition();
  return buildStageState({
    board: start.board,
    turn: "b",
    ply: 2,
    lastMove: { from: 7 * 9 + 7, to: 7 * 9 + 4 },
    checkSquare: null,
    notations: ["Pháo 2 bình 5", "Mã 8 tiến 7"],
    arrows: [],
    highlights: [],
    mySide: "r",
    settings: {
      ...DEFAULT_STAGE_SETTINGS,
      round: 1,
      today: { win: 2, draw: 1, loss: 0 },
    },
    moves: [
      {
        ply: 1,
        notation: "Pháo 2 bình 5",
        side: "r",
        from: 7 * 9 + 7,
        to: 7 * 9 + 4,
        tag: "good",
      },
      {
        ply: 2,
        notation: "Mã 8 tiến 7",
        side: "b",
        from: 0 * 9 + 7,
        to: 2 * 9 + 6,
        zhaoLesson: {
          lesson: 18,
          title: "Mã Hoạt Chiến Thắng",
          kind: "endgame",
          quote: "người có mã hoạt sẽ có ưu thế rất lớn trong tàn cuộc",
          videoUrl: "https://www.youtube.com/watch?v=FqGq8Oqj1_4",
        },
      },
    ],
    activeCommentary: {
      ply: 2,
      notation: "Mã 8 tiến 7",
      side: "b",
      summary: "Đối thủ đi Mã 8 tiến 7 · Nhảy mã triển khai phòng thủ",
      assessment: "⚖ Cân bằng (0.0)",
      intent: "Phát triển quân mã cánh trái bảo vệ trung lộ",
      zhaoLesson: {
        lesson: 18,
        title: "Mã Hoạt Chiến Thắng",
        kind: "endgame",
        quote: "người có mã hoạt sẽ có ưu thế rất lớn trong tàn cuộc",
        videoUrl: "https://www.youtube.com/watch?v=FqGq8Oqj1_4",
      },
    },
  });
}

describe("MatchCommentaryDrawer", () => {
  it("không hiển thị khi isOpen = false", () => {
    const state = createMockState();
    const { container } = render(
      <MatchCommentaryDrawer
        isOpen={false}
        onClose={() => {}}
        state={state}
        selectedPly={null}
        onSelectPly={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("hiển thị danh sách nước đi 2 cột Đỏ - Đen khi isOpen = true", () => {
    const state = createMockState();
    render(
      <MatchCommentaryDrawer
        isOpen={true}
        onClose={() => {}}
        state={state}
        selectedPly={null}
        onSelectPly={() => {}}
      />
    );

    expect(screen.getByText(/TRẬN CỜ & LỜI BÌNH CHUYÊN GIA/i)).toBeDefined();
    expect(screen.getByText("Pháo 2 bình 5")).toBeDefined();
    expect(screen.getByText("Mã 8 tiến 7")).toBeDefined();
    expect(screen.getByText("1.")).toBeDefined();
  });

  it("bấm chọn nước đi gọi onSelectPly với ply tương ứng", () => {
    const state = createMockState();
    const handleSelectPly = vi.fn();
    render(
      <MatchCommentaryDrawer
        isOpen={true}
        onClose={() => {}}
        state={state}
        selectedPly={null}
        onSelectPly={handleSelectPly}
      />
    );

    const moveBtn = screen.getByText("Pháo 2 bình 5");
    fireEvent.click(moveBtn);
    expect(handleSelectPly).toHaveBeenCalledWith(1);
  });

  it("hiển thị nút quay về trực tiếp khi đang xem lại nước cũ", () => {
    const state = createMockState();
    const handleSelectPly = vi.fn();
    render(
      <MatchCommentaryDrawer
        isOpen={true}
        onClose={() => {}}
        state={state}
        selectedPly={1} // Nước 1 trong khi ván đang ở nước 2
        onSelectPly={handleSelectPly}
      />
    );

    const returnBtn = screen.getByText(/Quay về trực tiếp/i);
    expect(returnBtn).toBeDefined();
    fireEvent.click(returnBtn);
    expect(handleSelectPly).toHaveBeenCalledWith(null);
  });

  it("chuyển sang Tab Lời Bình & Kỳ Lý hiển thị thẻ bài học Triệu Hâm Hâm", () => {
    const state = createMockState();
    render(
      <MatchCommentaryDrawer
        isOpen={true}
        onClose={() => {}}
        state={state}
        selectedPly={2}
        onSelectPly={() => {}}
      />
    );

    // Chuyển sang Tab Lời Bình
    const commentaryTab = screen.getByText(/Lời Bình & Kỳ Lý/i);
    fireEvent.click(commentaryTab);

    // Kiểm tra thông tin bài học Triệu Hâm Hâm
    expect(screen.getByText(/KỲ LÝ TRIỆU HÂM HÂM #18/i)).toBeDefined();
    expect(screen.getByText("Mã Hoạt Chiến Thắng")).toBeDefined();
    expect(screen.getByText(/người có mã hoạt sẽ có ưu thế rất lớn trong tàn cuộc/i)).toBeDefined();
    expect(screen.getByText(/Xem Video Bài Giảng Chi Tiết/i)).toBeDefined();
    expect(screen.getByText(/🎯 Ý ĐỒ CHIẾN LƯỢC & THẾ TRẬN/i)).toBeDefined();
  });

  it("chuyển đổi phong cách bình luận (Triệu Hâm Hâm, Hứa Ngân Xuyên, Chuyên gia)", () => {
    const state = createMockState();
    render(
      <MatchCommentaryDrawer
        isOpen={true}
        onClose={() => {}}
        state={state}
        selectedPly={2}
        onSelectPly={() => {}}
      />
    );

    const commentaryTab = screen.getByText(/Lời Bình & Kỳ Lý/i);
    fireEvent.click(commentaryTab);

    const xuBtn = screen.getByRole("button", { name: /Hứa Ngân Xuyên/i });
    fireEvent.click(xuBtn);
    expect(xuBtn.className).toContain("personaPillActiveXu");

    const defaultBtn = screen.getByRole("button", { name: /Chuyên Gia/i });
    fireEvent.click(defaultBtn);
    expect(defaultBtn.className).toContain("personaPillActive");
  });
});
