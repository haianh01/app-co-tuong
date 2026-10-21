import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ZigaBroadcastClient } from "./ZigaBroadcastClient";
import { uciToMove, type ZigaParsedMessage } from "@/lib/ziga/ziga-parser";
import { parseFen } from "@/lib/xiangqi/engine";
import type { ZigaRelayPacket } from "@/app/api/tuong-thuat/ziga-relay/route";

class FakeEventSource {
  static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, (e: MessageEvent) => void>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, fn);
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
  emitInit(lastSeq: number) {
    this.listeners.get("init")?.({ data: JSON.stringify({ lastSeq, packets: [] }) } as MessageEvent);
  }
  emit(packet: ZigaRelayPacket) {
    this.onmessage?.({ data: JSON.stringify(packet) } as MessageEvent);
  }
}

function selectPacket(seq: number, from: string | null, targets: string[] = []): ZigaRelayPacket {
  const sqOf = (s: string) => uciToMove(`${s}a0`)!.from;
  return {
    id: `${seq}`,
    seq,
    direction: "ui",
    timestamp: Date.now(),
    encoding: "json",
    payload: null,
    parsed: {
      raw: null,
      eventType: "select",
      selection: { from: from === null ? null : sqOf(from), targets: targets.map(sqOf) },
      summary: "select",
    },
  };
}

function framePacket(seq: number, direction: "in" | "out", parsed: Partial<ZigaParsedMessage>): ZigaRelayPacket {
  return {
    id: `${seq}`,
    seq,
    direction,
    timestamp: Date.now(),
    encoding: "base64",
    payload: "",
    parsed: { raw: "", eventType: "x", summary: "x", ...parsed },
  };
}

function movePacket(seq: number, uci: string): ZigaRelayPacket {
  const move = uciToMove(uci)!;
  return {
    id: `${seq}`,
    seq,
    direction: "in",
    timestamp: Date.now(),
    encoding: "text",
    payload: uci,
    parsed: { raw: uci, eventType: "move", move, summary: uci },
  };
}

describe("ZigaBroadcastClient", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("render trang tường thuật Ziga thành công không lỗi", () => {
    render(<ZigaBroadcastClient />);
    expect(screen.getByText("Đồng bộ trực tiếp Ziga")).toBeDefined();
    expect(screen.getByText("🔍 Soi gói tin WebSocket (Inspector)")).toBeDefined();
    expect(screen.getByText("📜 Script bắt gói tin Ziga")).toBeDefined();
  });

  it("giữ một kết nối SSE duy nhất và nhận đúng các nước tới sát nhau", () => {
    render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    act(() => {
      es.emitInit(0);
      es.emit(movePacket(1, "h2e2"));
      es.emit(movePacket(2, "h7e7"));
    });
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(screen.getByText(/Đã nhận nước cờ từ Ziga/)).toBeDefined();
    expect(screen.queryByText(/không hợp lệ/)).toBeNull();
  });

  it("bỏ qua gói trùng seq và nước bị gửi lặp lại", () => {
    render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    act(() => {
      es.emitInit(0);
      es.emit(movePacket(1, "h2e2"));
      es.emit(movePacket(1, "h2e2"));
      es.emit(movePacket(2, "h2e2"));
    });
    expect(screen.queryByText(/không hợp lệ/)).toBeNull();
  });

  it("tự đặt lại bàn khi phát hiện nước mở đầu của ván mới", () => {
    render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    act(() => {
      es.emitInit(0);
      es.emit(movePacket(1, "h2e2"));
      es.emit(movePacket(2, "h7e7"));
      // Ván mới: b2e2 không đi được (e2 đang có pháo đỏ) nhưng hợp lệ từ thế khởi đầu
      es.emit(movePacket(3, "b2e2"));
    });
    expect(screen.getByText(/Phát hiện ván mới/)).toBeDefined();
  });

  it("hiện quân đang chọn và chấm nước đọc từ bàn cờ Ziga, xoá khi đã đi", () => {
    const { container } = render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    const pressed = () => container.querySelectorAll('[data-square][aria-pressed="true"]');
    const dots = () => container.querySelectorAll('[aria-label="Đi tới ô này"]');

    act(() => {
      es.emitInit(0);
      es.emit(selectPacket(1, "h2", ["e2", "f2", "g2"]));
    });
    expect(pressed()).toHaveLength(1);
    expect(dots()).toHaveLength(3);

    act(() => es.emit(movePacket(2, "h2e2")));
    expect(pressed()).toHaveLength(0);
    expect(dots()).toHaveLength(0);
  });

  it("theo dõi sẵn sàng, bắt đầu ván, nhận ra phe mình và tự ghi kết quả khi ván kết thúc", () => {
    render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    act(() => {
      es.emitInit(0);
      es.emit(framePacket(1, "in", { eventType: "player_status", playerStatus: { seat: 1, ready: true, code: 1 } }));
      es.emit(framePacket(2, "in", { eventType: "player_status", playerStatus: { seat: 0, ready: false, code: 2 } }));
    });
    expect(screen.getByText(/Ghế 1: ✓ Sẵn sàng/)).toBeDefined();
    expect(screen.getByText(/Ghế 0: … chưa sẵn sàng/)).toBeDefined();

    act(() => es.emit(framePacket(3, "in", { eventType: "game_start", gameStart: { redSeat: 0, blackSeat: 1 } })));
    expect(screen.getByText(/Ván mới bắt đầu/)).toBeDefined();
    expect(screen.queryByLabelText("Trạng thái sẵn sàng")).toBeNull();

    // Mình gửi nước đầu tiên (Đỏ đang đi) → mình là ghế 0, cầm Đỏ
    act(() => {
      es.emit(framePacket(4, "out", { eventType: "move_sent" }));
      es.emit(movePacket(5, "h2e2"));
      es.emit(framePacket(6, "in", { eventType: "game_event", gameEvent: { reason: "resign", code: 6, seat: 1 } }));
    });
    expect(screen.getByText(/Đối thủ: đầu hàng/)).toBeDefined();

    act(() => es.emit(framePacket(7, "in", { eventType: "game_end", gameEnd: { winnerSeat: 0 } })));
    expect(screen.getByText(/Ván kết thúc — Đỏ thắng \(đã ghi: thắng\)/)).toBeDefined();
  });

  it("bấm sẵn sàng trên Ziga → biết ghế của mình, hiện Bạn / Đối thủ ngay từ trước ván", () => {
    render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    act(() => {
      es.emitInit(0);
      es.emit(framePacket(1, "in", { eventType: "player_status", playerStatus: { seat: 0, ready: true, code: 1 } }));
      es.emit(framePacket(2, "out", { eventType: "ready_sent" }));
      es.emit(framePacket(3, "in", { eventType: "player_status", playerStatus: { seat: 1, ready: true, code: 1 } }));
    });
    expect(screen.getByText("Bạn: ✓ Sẵn sàng")).toBeDefined();
    expect(screen.getByText("Đối thủ: ✓ Sẵn sàng")).toBeDefined();
  });

  it("điền tên + elo hai bên vào sân khấu từ gói đăng nhập và thông tin bàn, cập nhật elo sau ván", () => {
    render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    act(() => {
      es.emitInit(0);
      es.emit(framePacket(1, "in", { eventType: "login", login: { userName: "W43604711" } }));
      es.emit(
        framePacket(2, "in", {
          eventType: "table_info",
          roster: { replace: true, list: [{ seat: 0, name: "A64082416", elo: 958 }, { seat: 1, name: "W43604711", elo: 915 }] },
        }),
      );
    });
    expect(screen.getByDisplayValue("W43604711")).toBeDefined();
    expect(screen.getByDisplayValue("A64082416")).toBeDefined();
    expect(screen.getByDisplayValue("915")).toBeDefined();

    act(() => es.emit(framePacket(3, "in", { eventType: "elo_update", eloUpdate: { seat: 1, elo: 930 } })));
    expect(screen.getByDisplayValue("930")).toBeDefined();
  });

  it("vào bàn giữa ván: bày lại đúng thế cờ Ziga gửi", () => {
    const { container } = render(<ZigaBroadcastClient />);
    const es = FakeEventSource.instances[0];
    const board = parseFen("rnbakab1r/9/1c4nc1/p1p1p1p1p/9/6P2/P1P1P3P/1C2C4/9/RNBAKABNR b").board;
    act(() => {
      es.emitInit(0);
      es.emit(
        framePacket(1, "in", {
          eventType: "table_sync",
          timeControl: { totalSec: 900, perMoveSec: 60 },
          tableSnapshot: { redSeat: 0, blackSeat: 1, board, turn: "b", redRemainingSec: 896, blackRemainingSec: 857 },
        }),
      );
    });
    expect(screen.getByText(/vào bàn giữa ván/)).toBeDefined();
    // Pháo đỏ đã sang e2: ô e2 có quân, ô h2 trống
    expect(container.querySelector(`[data-square="${uciToMove("e2e3")!.from}"]`)?.getAttribute("aria-label")).toMatch(/Pháo đỏ/);
    expect(container.querySelector(`[data-square="${uciToMove("h2h3")!.from}"]`)).toBeNull();
  });
});
