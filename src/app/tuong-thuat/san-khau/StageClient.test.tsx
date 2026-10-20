import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMove, initialPosition } from "@/lib/xiangqi/engine";
import { moveNotation } from "@/lib/xiangqi/notation";
import { DEFAULT_STAGE_SETTINGS, buildStageState } from "../stage-sync";
import { StageClient } from "./StageClient";

vi.mock("@/components/session/SessionProvider", () => ({
  useSession: () => ({ user: null }),
}));

const ROOM = "abcdefghijklmnop_123";

/** WebSocket giả: giữ lại các kết nối để test đẩy tin vào như server. */
class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {}
  receive(msg: unknown) {
    act(() => {
      this.onopen?.();
      this.onmessage?.({ data: JSON.stringify(msg) });
    });
  }
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  window.history.replaceState(null, "", `/tuong-thuat/san-khau?room=${ROOM}`);
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

function stateAfterCentralCannon() {
  const start = initialPosition();
  const move = { from: 7 * 9 + 7, to: 7 * 9 + 4 };
  const pos = applyMove(start, move);
  return buildStageState({
    board: pos.board,
    turn: pos.turn,
    ply: 1,
    lastMove: move,
    checkSquare: null,
    notations: [moveNotation(start.board, move)],
    arrows: [],
    highlights: [],
    mySide: "r",
    settings: {
      ...DEFAULT_STAGE_SETTINGS,
      round: 5,
      me: { name: "W39823757", points: "1000", title: "Tập Sự", stars: 2 },
      opponent: { name: "A40745895", points: "1020" },
      host: "BLV Hải Anh",
      today: { win: 3, draw: 1, loss: 1 },
    },
  });
}

describe("StageClient", () => {
  it("không có mã phòng: hướng dẫn mở từ trang Tường thuật, không kết nối", () => {
    window.history.replaceState(null, "", "/tuong-thuat/san-khau");
    render(<StageClient />);
    expect(screen.getByText(/cần có mã phòng/)).toBeDefined();
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("nhận trạng thái qua /ws/stage và hiện thẻ Bạn / Đối thủ, nước vừa đi, khung camera; không có điểm engine", () => {
    const { container } = render(<StageClient />);
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].url).toContain(`/ws/stage?room=${ROOM}&role=view`);

    FakeSocket.all[0].receive({ t: "state", state: stateAfterCentralCannon() });

    expect(screen.getByText("VÁN 5")).toBeDefined();
    expect(screen.getByText("W39823757")).toBeDefined();
    expect(screen.getByText("A40745895")).toBeDefined();
    expect(screen.getByText("1020 điểm")).toBeDefined();
    expect(screen.getByText("BẠN")).toBeDefined();
    expect(screen.getByText("BLV Hải Anh")).toBeDefined();
    expect(screen.getByText("Đang chơi trên zigavn.com")).toBeDefined();
    // Vừa đi xong nước của mình: tới lượt đối thủ.
    expect(screen.getByText("Đối thủ đang nghĩ…")).toBeDefined();
    expect(screen.getByText("ĐANG NGHĨ")).toBeDefined();
    expect(container.textContent).not.toMatch(/[+-]\d\.\d/);
  });

  it("đồng hồ: tổng giờ hai bên, bên đang chạy có thêm thời gian còn cho nước này", () => {
    render(<StageClient />);
    const state = stateAfterCentralCannon();
    state.clocks = { me: 842_000, opponent: 871_000, running: "opponent", perMove: 45_000, perMoveTotal: 60_000, sentAt: Date.now() };
    FakeSocket.all[0].receive({ t: "state", state });
    expect(screen.getByText("14:02")).toBeDefined();
    expect(screen.getByText("14:31")).toBeDefined();
    expect(screen.getByText("Nước này 0:45")).toBeDefined();
  });

  it("tin recap từ trang điều khiển bật thẻ tóm tắt cho người mới", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    ws.receive({ t: "state", state: stateAfterCentralCannon() });
    expect(screen.queryByText(/MỚI VÀO XEM/)).toBeNull();
    ws.receive({ t: "recap" });
    expect(screen.getByText(/MỚI VÀO XEM/)).toBeDefined();
    expect(screen.getByText("Hôm nay: 3 thắng · 1 hòa · 1 thua")).toBeDefined();
  });
});
