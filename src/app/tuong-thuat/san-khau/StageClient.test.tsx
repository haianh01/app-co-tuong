import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMove, initialPosition, parseFen } from "@/lib/xiangqi/engine";
import { PUZZLES, findPuzzle, type Puzzle } from "@/lib/xiangqi/puzzles";
import { buildPuzzleStage, type StagePuzzleLive, type StagePuzzleState } from "../stage-puzzle";
import { moveNotation } from "@/lib/xiangqi/notation";
import { DEFAULT_STAGE_SETTINGS, buildStageState } from "../stage-sync";
import { StageClient, aiAvatarSrc, aiPerchSrc } from "./StageClient";

vi.mock("@/components/session/SessionProvider", () => ({
  useSession: () => ({ user: null }),
}));

const ROOM = "abcdefghijklmnop_123";

/** WebSocket giả: giữ lại các kết nối để test đẩy tin vào như server. */
class FakeSocket {
  static all: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 1;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {}
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
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
    expect(screen.getByText("ĐANG NGHĨ")).toBeDefined();
    expect(container.textContent).not.toMatch(/[+-]\d\.\d/);
  });

  it("đồng hồ dừng (chưa theo dõi, đang xem lại nước cũ): không hiện giờ giả, không vẽ vòng đếm", () => {
    const { container } = render(<StageClient />);
    FakeSocket.all[0].receive({ t: "state", state: stateAfterCentralCannon() });
    expect(screen.getAllByText("--:--")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/09:10|10:04/);
    expect(container.querySelector('[class*="ringFill"]')).toBeNull();
  });

  it("đồng hồ thật: bên đang đi vẫn tự đếm lùi giữa hai lần trang điều khiển gửi", () => {
    vi.useFakeTimers();
    render(<StageClient />);
    const state = stateAfterCentralCannon();
    state.clocks = { me: 600_000, opponent: 300_000, running: "opponent", perMove: 60_000, perMoveTotal: 60_000, sentAt: Date.now() };
    FakeSocket.all[0].receive({ t: "state", state });
    expect(screen.getByText("05:00")).toBeDefined();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(screen.getByText("04:50")).toBeDefined();
    expect(screen.getByText("10:00")).toBeDefined();
    vi.useRealTimers();
  });

  it("chiếu bí tự đọc câu thắng; Ziga hay người dẫn báo thắng ngay sau đó thì không đọc lại, báo kết quả khác vẫn đọc", async () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const pos = applyMove(parseFen("4k4/R8/9/9/9/R8/9/9/9/3K5 r - - 0 1"), { from: 45, to: 0 });
    ws.receive({
      t: "state",
      state: { ...stateAfterCentralCannon(), board: pos.board, turn: pos.turn, ply: 21, bigMoment: { id: "mate-21", type: "mate", title: "BẠN THẮNG!", badge: "KẾT THÚC" } },
    });
    await act(async () => {});
    expect(screen.getByText("KHÍ THẾ BỪNG BỪNG:")).toBeDefined();

    ws.receive({ t: "voice", event: "win", text: "Câu này không được đọc" });
    expect(screen.queryByText(/Câu này không được đọc/)).toBeNull();

    ws.receive({ t: "voice", event: "loss", text: "Bấm nhầm rồi sửa thành thua" });
    expect(screen.getByText(/Bấm nhầm rồi sửa thành thua/)).toBeDefined();
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

  it("đi thử: bàn cờ có nhãn BIẾN THỬ và sân khấu tối đi", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    ws.receive({ t: "state", state: { ...state, trial: { notations: ["Mã 2 tiến 3", "Mã 8 tiến 7"] } } });

    expect(screen.getAllByText("BIẾN THỬ").length).toBe(1);
    expect(document.querySelector("[class*=trialDim]")).not.toBeNull();
  });

  it("thanh công cụ live: có các nút Vẽ, Đi thử, 4 màu, Undo, Redo, Xóa nét vẽ và tương tác mượt mà", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    ws.receive({ t: "state", state });

    const drawBtn = screen.getByRole("button", { name: /✏️/ });
    const trialBtn = screen.getByRole("button", { name: /🧪/ });
    const undoBtn = screen.getByRole("button", { name: /Hoàn tác nét vẽ/i });
    const redoBtn = screen.getByRole("button", { name: /Làm lại nét vẽ/i });
    const clearBtn = screen.getByRole("button", { name: "Xóa nét vẽ" });

    expect(drawBtn).toBeDefined();
    expect(trialBtn).toBeDefined();
    expect(undoBtn).toBeDefined();
    expect(redoBtn).toBeDefined();
    expect(clearBtn).toBeDefined();

    // Kiểm tra 4 nút màu
    expect(screen.getByRole("button", { name: /Màu xanh dương/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Màu xanh lá/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Màu đỏ/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Màu vàng/i })).toBeDefined();

    // Bật tắt Vẽ
    fireEvent.click(drawBtn);
    expect(drawBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Đang vẽ/i)).toBeDefined();

    // Chọn màu khác
    const redSwatch = screen.getByRole("button", { name: /Màu đỏ/i });
    fireEvent.click(redSwatch);
    expect(redSwatch.getAttribute("aria-pressed")).toBe("true");

    // Bật Đi thử trực tiếp trên sân khấu
    fireEvent.click(trialBtn);
    expect(screen.getByText("BIẾN THỬ")).toBeDefined();
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("NƯỚC THỬ")).toBeDefined();
    expect(screen.getByText("Bấm quân để bày biến")).toBeDefined();

    // Thoát Đi thử
    const exitTrialBtn = screen.getByRole("button", { name: /Thoát đi thử/i });
    fireEvent.click(exitTrialBtn);
    expect(screen.queryByText("NƯỚC THỬ")).toBeNull();
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

    expect(screen.getByText(/AI PHÂN TÍCH · VÁN 5/i)).toBeDefined();
    // Khung giới thiệu (tên kênh, nước, đánh giá, tối ưu) không hiện ở màn phân tích.
    expect(screen.queryByText("Tối ưu:")).toBeNull();
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
    expect(screen.getByText(/AI PHÂN TÍCH · VÁN 5/i)).toBeDefined();

    // 3. Tắt review (trở về ván trực tiếp)
    ws.receive({ t: "state", state: base });
    expect(screen.getByText("VÁN 5")).toBeDefined();

    // 4. Bật review lần thứ 2
    ws.receive({ t: "state", state: reviewState });
    expect(screen.getByText(/AI PHÂN TÍCH · VÁN 5/i)).toBeDefined();
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

  it("bấm nút 💬 mở Bảng Trận cờ & Lời bình chuyên gia", () => {
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

describe("dưới bàn cờ", () => {
  it("không có dải chữ: số nước, lượt đi, lời bình chỉ xem trong bảng Trận cờ", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const state = stateAfterCentralCannon();
    state.moves = [
      {
        ply: 1,
        notation: "Pháo 2 bình 5",
        side: "r",
        zhaoLesson: { lesson: 3, title: "Pháo đầu tranh tiên", kind: "middlegame", quote: "pháo đầu là nước mạnh" },
      },
    ];
    state.activeCommentary = {
      ply: 1,
      notation: "Pháo 2 bình 5",
      side: "r",
      summary: "Bạn đi Pháo đầu",
      assessment: "⚖ Cân bằng (0.0)",
      intent: "Uy hiếp tốt đầu",
      betterMove: "Mã 2 tiến 3",
    };
    ws.receive({ t: "state", state });

    expect(screen.queryByText("NƯỚC 1")).toBeNull();
    expect(screen.queryByText("Đối thủ đang nghĩ…")).toBeNull();
    expect(screen.queryByText("Bạn đi Pháo đầu")).toBeNull();
    expect(screen.queryByText(/Uy hiếp tốt đầu/)).toBeNull();
    expect(screen.queryByText(/Triệu Hâm Hâm #3/)).toBeNull();
  });
});

describe("sân khấu Thử thách cờ thế", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const sample = findPuzzle("bach-dien-tuong")!;
  const deep = PUZZLES.find((p) => (p.line?.length ?? 0) >= 5)!;

  function send(puzzle: StagePuzzleState, base = stateAfterCentralCannon()) {
    FakeSocket.all[0].receive({ t: "state", state: { ...base, puzzle } });
    return base;
  }

  function liveOf(p: Puzzle, patch: Partial<StagePuzzleLive> = {}): StagePuzzleLive {
    return {
      puzzleId: p.id, board: parseFen(p.fen).board, selected: null, targets: [], lastMove: null, checkSquare: null,
      status: "play", tries: 0, moves: [], hintSquare: null, ...patch,
    };
  }

  it("thay hẳn giao diện ván Ziga: tên chương trình, đề bài, mục tiêu", () => {
    render(<StageClient />);
    send({ ...buildPuzzleStage(sample, "intro", 0), number: 1, total: PUZZLES.length });

    expect(screen.getByText("THỬ THÁCH CỜ THẾ")).toBeDefined();
    expect(screen.getByText("Bạch diện tướng")).toBeDefined();
    expect(screen.getByText(sample.goal)).toBeDefined();
    expect(screen.getByText(`THẾ #1 / ${PUZZLES.length}`)).toBeDefined();
    expect(screen.queryByText(/zigavn/i)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Bạn tìm ra nước đầu tiên chưa?");
  });

  it("đếm ngược cho khán giả đoán", () => {
    render(<StageClient />);
    send(buildPuzzleStage(sample, "thinking", 0, { countdown: { startedAt: Date.now(), durationMs: 60_000 } }));
    expect(screen.getByText("GIÂY ĐỂ ĐOÁN")).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("Comment nước đi đầu tiên");
  });

  it("phản chiếu người dẫn đang giải: chọn quân, đi thử, sai, giải xong", () => {
    render(<StageClient />);
    const base = buildPuzzleStage(deep, "intro", 0);

    send({ ...base, live: liveOf(deep, { selected: deep.solution.from }) });
    expect(screen.getByRole("status").textContent).toContain("đang cân nhắc");

    send({ ...base, live: liveOf(deep, { moves: ["X6.1", "S5/4"], tries: 1 }) });
    expect(screen.getByRole("status").textContent).toContain("đang giải: 1. X6.1  S5/4");
    expect(screen.getByText("LẦN 2")).toBeDefined();

    send({ ...base, live: liveOf(deep, { status: "wrong", moves: ["X6.1"], tries: 2 }) });
    expect(screen.getByText("SAI!")).toBeDefined();
    expect(screen.getByText("CHƯA ĐÚNG")).toBeDefined();

    send({ ...base, live: liveOf(deep, { status: "solved", moves: ["X6.1"], tries: 3 }) });
    expect(screen.getByRole("img", { name: "Chiếu bí" })).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("đã giải được sau 3 lần thử");
  });

  it("bàn phản chiếu của thế khác không lên sân khấu", () => {
    render(<StageClient />);
    // usePuzzleLive chỉ gắn `live` khi trùng thế; sân khấu vẫn dùng bàn cờ của thế đang chiếu nếu không có `live`.
    send(buildPuzzleStage(sample, "hint", 0));
    expect(screen.getByRole("status").textContent).toContain(sample.hint);
  });

  it("lật đáp án: chỉ hiện các nước đã lật, đánh số theo nước Đỏ", () => {
    render(<StageClient />);
    send(buildPuzzleStage(deep, "reveal", 2, { caption: "Xe thí quân" }));
    const text = screen.getByRole("status").textContent ?? "";
    expect(screen.getByText("ĐÁP ÁN")).toBeDefined();
    expect(text).toMatch(/^ĐÁP ÁN1\. \S+  \S+ — Xe thí quân$/);
  });

  it("giải xong: triện 絕殺 và lời mời giải thử tại đúng tên miền", () => {
    render(<StageClient />);
    send(buildPuzzleStage(sample, "solved", 1));
    expect(screen.getByRole("img", { name: "Chiếu bí" })).toBeDefined();
    expect(screen.getByText(`Giải thử tại ${window.location.host}/puzzle`)).toBeDefined();
  });

  it("tắt cờ thế không chiếu lại hiệu ứng cũ của ván thật", () => {
    vi.useFakeTimers();
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const base = stateAfterCentralCannon();
    base.bigMoment = { id: "check-5", type: "check", title: "將軍", badge: "將" };

    ws.receive({ t: "state", state: base });
    expect(screen.getByText("將軍")).toBeDefined();
    act(() => vi.advanceTimersByTime(4000));

    ws.receive({ t: "state", state: { ...base, puzzle: buildPuzzleStage(sample, "solved", 1) } });
    act(() => vi.advanceTimersByTime(4000));

    ws.receive({ t: "state", state: base });
    expect(screen.queryByText("將軍")).toBeNull();
  });

  it("nút Lưu ván gửi lệnh về trang điều khiển và hiện dấu đã lưu khi điều khiển báo xong", () => {
    render(<StageClient />);
    const ws = FakeSocket.all[0];
    const base = stateAfterCentralCannon();
    ws.receive({ t: "state", state: base });

    fireEvent.click(screen.getByRole("button", { name: "Lưu ván đấu" }));
    expect(ws.sent).toEqual([{ t: "cmd", cmd: "save" }]);

    ws.receive({ t: "state", state: { ...base, archive: { gameId: "stg_abc", status: "saved", savedRound: 5, error: null } } });
    expect(screen.getByRole("button", { name: /Lưu ván đấu \(đã lưu\)/ })).toBeDefined();
    expect(screen.getByText("✓ Đã lưu Ván 5")).toBeDefined();

    // Sang ván 6: nút về trạng thái chưa lưu.
    ws.receive({
      t: "state",
      state: { ...base, settings: { ...base.settings, round: 6 }, archive: { gameId: "stg_abc", status: "saved", savedRound: 5, error: null } },
    });
    expect(screen.getByRole("button", { name: "Lưu ván đấu" })).toBeDefined();
  });

  it("Lịch sử mở danh sách ván trên bàn cờ, chọn ván thì vào chế độ phân tích ngay trên sân khấu", async () => {
    const start = initialPosition();
    const moves = [
      { from: 7 * 9 + 7, to: 7 * 9 + 4 },
      { from: 2 * 9 + 1, to: 2 * 9 + 4 },
    ];
    const game = {
      id: "stg_hist0001",
      round: 3,
      playedOn: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }),
      mySide: "r",
      me: { name: "Tôi" },
      opponent: { name: "Nmk0325" },
      result: "win",
      startFen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
      moves: moves.map((m) => ({ ...m, notation: moveNotation(start.board, m) })),
      plies: 2,
      endedAt: new Date().toISOString(),
    };
    const analysis = [
      { score: 20, best: moves[0] },
      { score: -30, best: moves[1] },
      { score: 40, best: null },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      // AI sâu cho thế đang xem: nước tốt nhất là Mã 2 tiến 3 (b0c2).
      if (url === "/api/engine")
        return {
          ok: true,
          status: 200,
          json: async () => ({
            move: { from: 82, to: 65 },
            score: 35,
            depth: 22,
            lines: [{ move: { from: 82, to: 65 }, score: 35, depth: 22, pv: ["b0c2"], pvMoves: [{ from: 82, to: 65 }] }],
          }),
        };
      if (url === "/api/engine/threat") return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => (url.includes("/games/") ? { game, analysis } : { games: [game] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StageClient />);
    const ws = FakeSocket.all[0];
    ws.receive({ t: "state", state: stateAfterCentralCannon() });

    fireEvent.click(screen.getByRole("button", { name: "Lịch sử – chọn ván đấu" }));
    const row = await screen.findByText("Ván 3 · vs Nmk0325");
    expect(screen.getByText("1 thắng · 0 hòa · 0 thua")).toBeDefined();

    fireEvent.click(row);
    fireEvent.click(screen.getByRole("button", { name: "Phân tích ván này" }));
    expect(screen.queryByRole("region", { name: "Lịch sử ván đấu" })).toBeNull();

    // Có phân tích sẵn nên không chạy lại cả ván; AI sâu chỉ tính thế đang xem. Ô góc trái đổi sang điều hướng.
    await screen.findByText("Thế cờ xuất phát");
    expect(await screen.findByText(/AI gợi ý: .*Đỏ/, undefined, { timeout: 2000 })).toBeDefined();
    const deepCall = fetchMock.mock.calls.find(([u]) => u === "/api/engine") as unknown as [string, { body: string }];
    expect(JSON.parse(deepCall[1].body).purpose).toBe("deep");
    expect(screen.getByText(/AI PHÂN TÍCH · VÁN 3/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Nước sau" }));
    expect(screen.getByText(/Nước 1:/)).toBeDefined();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/engine/batch"))).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Về trực tiếp" }));
    expect(screen.getByRole("button", { name: "Phân tích ván đấu" })).toBeDefined();
    vi.unstubAllGlobals();
  });
});


describe("nhân vật AI trong khung camera", () => {
  const src = (q: string) => aiAvatarSrc(new URLSearchParams(q), "https://kydai.vn");

  it("mặc định (không ghi ai) và ai=1 trỏ về trang avatar cùng máy chủ, tự bật giọng và chế độ ô nhỏ", () => {
    expect(src("")).toBe("https://kydai.vn/live-bot/avatar.html?voice=1&compact=1");
    expect(src("room=abc")).toBe("https://kydai.vn/live-bot/avatar.html?voice=1&compact=1");
    expect(src("ai=1")).toBe("https://kydai.vn/live-bot/avatar.html?voice=1&compact=1");
  });

  it("giữ tham số riêng của địa chỉ tự nhập", () => {
    const url = new URL(src(`ai=${encodeURIComponent("http://192.168.1.5:4000/avatar?zoom=3&voice=0")}`)!);
    expect(url.host).toBe("192.168.1.5:4000");
    expect(url.searchParams.get("zoom")).toBe("3");
    expect(url.searchParams.get("voice")).toBe("0");
    expect(url.searchParams.get("compact")).toBe("1");
  });

  it("bật cam thì nhân vật ngồi trên vai phải, giữ vai trái nếu địa chỉ tự nhập đã chọn", () => {
    expect(aiPerchSrc(src("")!)).toBe("https://kydai.vn/live-bot/avatar.html?voice=1&compact=1&perch=right");
    const left = src(`ai=${encodeURIComponent("https://kydai.vn/live-bot/avatar.html?perch=left")}`)!;
    expect(new URL(aiPerchSrc(left)).searchParams.get("perch")).toBe("left");
  });

  it("tắt bằng ai=0, hoặc địa chỉ lạ thì không nhúng", () => {
    expect(src("ai=0")).toBeNull();
    expect(src("ai=javascript:alert(1)")).toBeNull();
    expect(src("ai=khong-phai-url")).toBeNull();
  });
});

describe("mở sân khấu là có AI", () => {
  const botCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([u]) => u === "/api/bot/stage");

  it("nối được phòng thì tự báo bot trợ lý vào đúng phòng, và nhúng nhân vật", () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<StageClient />);
    expect(botCalls(fetchMock)).toHaveLength(0); // chưa nối phòng
    FakeSocket.all[0].receive({ t: "state", state: stateAfterCentralCannon() });
    expect(botCalls(fetchMock)).toEqual([["/api/bot/stage", { method: "POST", body: ROOM }]]);
    expect(container.querySelector('iframe[title="Nhân vật AI"]')).not.toBeNull();
    expect(screen.getByText("📋 Tóm tắt")).toBeDefined();
    vi.unstubAllGlobals();
  });

  it("ai=0 thì không nhúng nhân vật, không gọi bot", () => {
    window.history.replaceState(null, "", `/tuong-thuat/san-khau?room=${ROOM}&ai=0`);
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<StageClient />);
    FakeSocket.all[0].receive({ t: "state", state: stateAfterCentralCannon() });
    expect(botCalls(fetchMock)).toHaveLength(0);
    expect(container.querySelector('iframe[title="Nhân vật AI"]')).toBeNull();
    vi.unstubAllGlobals();
  });
});
