import { act, fireEvent, render, screen } from "@testing-library/react";
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
      host: "Cờ Tướng Hải Anh",
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
    expect(screen.getByText("1020")).toBeDefined();
    expect(screen.getByText("BẠN")).toBeDefined();
    expect(screen.getByText("Cờ Tướng Hải Anh")).toBeDefined();
    expect(screen.getByText("Đang chơi trên zigavn.com")).toBeDefined();
    // Vừa đi xong nước của mình: tới lượt đối thủ.
    expect(screen.getByText("Đối thủ đang nghĩ…")).toBeDefined();
    expect(screen.getByText("ĐANG NGHĨ")).toBeDefined();
    expect(container.textContent).not.toMatch(/[+-]\d\.\d/);
  });

  it("chưa đặt tên kênh: tiêu đề dùng tên kì thủ của người dẫn, không hiện chữ BLV", () => {
    render(<StageClient />);
    const state = stateAfterCentralCannon();
    state.settings.host = "";
    FakeSocket.all[0].receive({ t: "state", state });
    // Một lần ở tiêu đề, một lần ở thẻ người chơi.
    expect(screen.getAllByText("W39823757")).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/BLV/);
  });

  it("đồng hồ: tổng giờ hai bên, bên đang chạy có thêm thời gian còn cho nước này", () => {
    render(<StageClient />);
    const state = stateAfterCentralCannon();
    state.clocks = { me: 842_000, opponent: 871_000, running: "opponent", perMove: 45_000, perMoveTotal: 60_000, sentAt: Date.now() };
    FakeSocket.all[0].receive({ t: "state", state });
    expect(screen.getByText("14:02")).toBeDefined();
    expect(screen.getByText("14:31")).toBeDefined();
    expect(screen.getByRole("timer", { name: "Nước này 0:45" })).toBeDefined();
    expect(screen.getByText("45")).toBeDefined();
  });

  it("trước ván: hiện sẵn sàng / chưa sẵn sàng trên thẻ hai bên, đang đánh thì ẩn", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    ws.receive({ t: "state", state: { ...stateAfterCentralCannon(), ready: { me: true, opponent: false } } });
    expect(screen.getByText("Sẵn sàng")).toBeDefined();
    expect(screen.getByText("CHƯA SẴN SÀNG")).toBeDefined();

    ws.receive({ t: "state", state: { ...stateAfterCentralCannon(), ready: null } });
    expect(screen.queryByText("Sẵn sàng")).toBeNull();
    expect(screen.queryByText("CHƯA SẴN SÀNG")).toBeNull();
  });

  it("tin recap từ trang điều khiển bật thẻ tóm tắt cho người mới, có nút đóng", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    ws.receive({ t: "state", state: stateAfterCentralCannon() });
    expect(screen.queryByText(/MỚI VÀO XEM/)).toBeNull();
    ws.receive({ t: "recap" });
    expect(screen.getByText(/MỚI VÀO XEM/)).toBeDefined();
    expect(screen.getByText("Hôm nay: 3 thắng · 1 hòa · 1 thua")).toBeDefined();

    // Bấm nút đóng trên thẻ tóm tắt
    act(() => {
      screen.getByTitle("Đóng tóm tắt").click();
    });
    expect(screen.queryByText(/MỚI VÀO XEM/)).toBeNull();
  });

  it("nút Tóm tắt trên sân khấu cho phép toggle hiện và ẩn", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    ws.receive({ t: "state", state: stateAfterCentralCannon() });
    expect(screen.queryByText(/MỚI VÀO XEM/)).toBeNull();

    // Bấm nút "📋 Tóm tắt" trên thanh matchBar
    act(() => {
      screen.getByText("📋 Tóm tắt").click();
    });
    expect(screen.getByText(/MỚI VÀO XEM/)).toBeDefined();

    // Bấm lại để ẩn
    act(() => {
      screen.getByText("✕ Ẩn tóm tắt").click();
    });
    expect(screen.queryByText(/MỚI VÀO XEM/)).toBeNull();
  });

  it("nhận tin voice chiếu/thắng/thua hiện speech bubble tương ứng", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    ws.receive({ t: "state", state: stateAfterCentralCannon() });

    // Tin nhắn voice khi bị chiếu
    ws.receive({ t: "voice", event: "check", text: "Người đâu Cứu trẫm" });
    expect(screen.getByText(/"Người đâu Cứu trẫm"/)).toBeDefined();
    expect(screen.getByText("HOÀNG THƯỢNG:")).toBeDefined();

    // Tin nhắn voice khi thắng
    ws.receive({ t: "voice", event: "win", text: "Bạn sắp đạt đến mục tiêu 2000 elo rồi" });
    expect(screen.getByText(/"Bạn sắp đạt đến mục tiêu 2000 elo rồi"/)).toBeDefined();
    expect(screen.getByText("KHÍ THẾ BỪNG BỪNG:")).toBeDefined();

    // Tin nhắn voice khi thua
    ws.receive({ t: "voice", event: "loss", text: "Đừng buồn bạn chỉ thiếu chút may mắn thôi" });
    expect(screen.getByText(/"Đừng buồn bạn chỉ thiếu chút may mắn thôi"/)).toBeDefined();
    expect(screen.getByText("ĐỘNG VIÊN:")).toBeDefined();
  });

  it("cho phép tùy chỉnh câu nói qua settings", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    state.settings.voiceLines = {
      check: "Kỳ phùng địch thủ, cứu giá mau!",
      win: "Đại thắng rồi, phong thần thôi!",
      loss: "Thua keo này ta bày keo khác!",
      enabled: true,
    };
    ws.receive({ t: "state", state });

    ws.receive({ t: "voice", event: "check", text: state.settings.voiceLines.check });
    expect(screen.getByText(/"Kỳ phùng địch thủ, cứu giá mau!"/)).toBeDefined();
  });

  it("tắt giọng nói trong settings thì tin voice từ trang điều khiển không hiện bubble", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    state.settings.voiceLines = { ...state.settings.voiceLines!, enabled: false };
    ws.receive({ t: "state", state });

    ws.receive({ t: "voice", event: "check", text: "Người đâu Cứu trẫm" });
    expect(screen.queryByText(/"Người đâu Cứu trẫm"/)).toBeNull();
  });

  it("hết ván: ribbon hiện kết quả thay cho lượt đi", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    // Tướng đen bị Xe đỏ ở cột 4 chiếu, hai ô bên bị Xe đỏ ở cột 3/5 khống chế → đỏ chiếu bí.
    const board: (string | null)[] = Array(90).fill(null);
    board[4] = "k";
    board[9 * 9 + 4] = "K";
    board[9 * 9 + 3] = "R";
    board[9 * 9 + 5] = "R";
    board[5 * 9 + 4] = "R";
    const state = stateAfterCentralCannon();
    ws.receive({ t: "state", state: { ...state, board: board as typeof state.board, turn: "b" } });

    expect(screen.getByText("Kết thúc: Bạn thắng")).toBeDefined();
    expect(screen.queryByText("Đối thủ đang nghĩ…")).toBeNull();
  });

  it("đi thử: bàn cờ có nhãn BIẾN THỬ, ribbon hiện chuỗi nước thử thay cho nước thật", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    ws.receive({ t: "state", state: { ...state, trial: { notations: ["Mã 2 tiến 3", "Mã 8 tiến 7"] } } });

    expect(screen.getAllByText("BIẾN THỬ").length).toBe(2);
    expect(screen.getByText("Mã 2 tiến 3 → Mã 8 tiến 7")).toBeDefined();
    expect(screen.getByText("Không phải nước thật")).toBeDefined();
    expect(document.querySelector("[class*=trialDim]")).not.toBeNull();
  });


  it("chế độ review: hiển thị huy hiệu AI phân tích, bước ngoặt trận đấu và điểm số", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const base = stateAfterCentralCannon();
    const state = {
      ...base,
      review: {
        gameId: "stg_123",
        round: 5,
        ply: 8,
        totalPlies: 24,
        board: base.board,
        lastMove: { from: 24, to: 25 },
        evalScore: 450,
        bestNotation: "X1.1",
        turningPoint: {
          index: 0,
          ply: 8,
          notation: "P2-5",
          side: "r",
          cls: "blunder",
          winDrop: 0.25,
          description: "Nước sai lầm nghiêm trọng để mất Pháo",
        },
        commentary: "Bên Đỏ xuất tướng vội vàng, tạo điều kiện cho Đen phản công.",
      },
    };
    ws.receive({ t: "state", state });

    expect(screen.getByText(/PHÂN TÍCH VÁN 5/i)).toBeDefined();
    expect(screen.getByText(/AI PHÂN TÍCH · VÁN 5/i)).toBeDefined();
    expect(screen.getAllByText(/🔴 Đỏ ưu \(\+4\.5\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/⚡ Bước ngoặt #1: P2-5/i)).toBeDefined();
    // Khung giới thiệu tách nhãn và giá trị thành hai span trên cùng một dòng.
    expect(screen.getByText("Tối ưu:").closest("li")?.textContent).toContain("X1.1");
    expect(screen.getByText(/Bên Đỏ xuất tướng vội vàng/i)).toBeDefined();
  });


  it("bật và tắt chế độ review qua lại không làm crash React do lệch số lượng hook", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const base = stateAfterCentralCannon();

    // 1. Gửi trạng thái bình thường (không review)
    ws.receive({ t: "state", state: base });
    expect(screen.getByText("VÁN 5")).toBeDefined();

    // 2. Bật review
    const reviewState = {
      ...base,
      review: {
        gameId: "stg_toggle",
        round: 5,
        ply: 2,
        totalPlies: 4,
        board: base.board,
        lastMove: null,
        evalScore: 200,
        bestNotation: "P2-5",
      },
    };
    ws.receive({ t: "state", state: reviewState });
    expect(screen.getByText(/PHÂN TÍCH VÁN 5/i)).toBeDefined();

    // 3. Tắt review (trở về ván trực tiếp)
    ws.receive({ t: "state", state: base });
    expect(screen.getByText("VÁN 5")).toBeDefined();

    // 4. Bật review lần thứ 2
    ws.receive({ t: "state", state: reviewState });
    expect(screen.getByText(/PHÂN TÍCH VÁN 5/i)).toBeDefined();
  });

  it("khoảnh khắc chiếu tướng hiện con ấn chữ Hán 將軍 nhỏ gọn không che bàn cờ", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    state.bigMoment = {
      id: "check-5",
      type: "check",
      title: "將軍",
      badge: "將",
    };
    ws.receive({ t: "state", state });
    expect(screen.getByText("將軍")).toBeDefined();
    expect(screen.queryByText("CHIẾU TƯỚNG!")).toBeNull();
  });

  it("bấm nút 💬 hoặc dải ribbon mở Bảng Trận cờ & Lời bình chuyên gia", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    state.moves = [
      { ply: 1, notation: "Pháo 2 bình 5", side: "r" },
    ];
    ws.receive({ t: "state", state });

    // Ban đầu chưa có dialog
    expect(screen.queryByRole("dialog", { name: /Biên bản trận cờ và Lời bình/i })).toBeNull();

    // Bấm nút 💬 ở thanh dưới
    const chatBtn = screen.getByLabelText(/Biên bản trận cờ và lời bình chuyên gia/i);
    fireEvent.click(chatBtn);

    // Dialog mở ra
    expect(screen.getByRole("dialog", { name: /Biên bản trận cờ và Lời bình/i })).toBeDefined();
    expect(screen.getByText(/TRẬN CỜ & LỜI BÌNH CHUYÊN GIA/i)).toBeDefined();
  });
});
