import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_STAGE_SETTINGS, type StageReviewState } from "./stage-sync";
import { StagePanel } from "./StagePanel";

describe("StagePanel", () => {
  const dummyLink = {
    room: "test-room-123",
    viewers: 2,
    online: true,
    send: vi.fn(),
  };

  const sampleReview: StageReviewState = {
    gameId: "stg_999",
    round: 3,
    ply: 6,
    totalPlies: 20,
    board: new Array(90).fill(null),
    lastMove: null,
    evalScore: 200,
    bestNotation: "P2-5",
    turningPoint: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("hiển thị nút mở điều khiển chiếu phân tích lên sân khấu", () => {
    const onUpdateReview = vi.fn();
    render(
      <StagePanel
        settings={DEFAULT_STAGE_SETTINGS}
        setSettings={() => {}}
        link={dummyLink}
        result={null}
        onResult={() => {}}
        autoRead={false}
        onAutoRead={() => {}}
        clocks={null}
        review={null}
        onUpdateReview={onUpdateReview}
      />
    );

    expect(screen.getByRole("button", { name: /Phân tích lên sân khấu/i })).toBeTruthy();
  });

  it("khi đang có review: hiển thị banner trạng thái phát và nút tắt chiếu", () => {
    const onUpdateReview = vi.fn();
    render(
      <StagePanel
        settings={DEFAULT_STAGE_SETTINGS}
        setSettings={() => {}}
        link={dummyLink}
        result={null}
        onResult={() => {}}
        autoRead={false}
        onAutoRead={() => {}}
        clocks={null}
        review={sampleReview}
        onUpdateReview={onUpdateReview}
      />
    );

    expect(screen.getByText(/Đang chiếu phân tích ván 3 \(Nước 6\/20\)/i)).toBeTruthy();

    const closeBtn = screen.getByRole("button", { name: /✕ Tắt chiếu/i });
    fireEvent.click(closeBtn);

    expect(onUpdateReview).toHaveBeenCalledWith(null);
  });
});
