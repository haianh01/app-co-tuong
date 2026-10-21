import { describe, expect, it } from "vitest";
import type { ZigaParsedMessage } from "./ziga-parser";
import { zigaReplay } from "./ziga-replay";

let seq = 0;
const pkt = (parsed: Partial<ZigaParsedMessage>, direction: "in" | "out" | "ui" = "in") => ({
  seq: ++seq,
  direction,
  parsed: { raw: null, eventType: "x", summary: "x", ...parsed } as ZigaParsedMessage,
});
const move = (from: number, to: number) => pkt({ eventType: "move", move: { from, to } });

describe("zigaReplay", () => {
  it("phát lại đủ từ lần bắt đầu ván gần nhất; trước đó chỉ giữ thông tin người chơi", () => {
    const login = pkt({ eventType: "login", login: { userName: "W1" } });
    const oldMove = move(70, 67);
    const oldEnd = pkt({ eventType: "game_end", gameEnd: { winnerSeat: 0 }, eloUpdate: { seat: 0, elo: 930 } });
    const ready = pkt({ eventType: "ready_sent" }, "out");
    const select = pkt({ eventType: "select", selection: { from: 1, targets: [] } }, "ui");
    const start = pkt({ eventType: "game_start", gameStart: { redSeat: 0, blackSeat: 1 } });
    const m1 = move(70, 67);
    const sent = pkt({ eventType: "move_sent" }, "out");
    const m2 = move(19, 22);

    const r = zigaReplay([login, oldMove, oldEnd, ready, select, start, m1, sent, m2]);
    expect(r.anchored).toBe(true);
    expect(r.moves).toBe(2);
    expect(r.packets.map((p) => p.seq)).toEqual([login.seq, oldEnd.seq, ready.seq, start.seq, m1.seq, sent.seq, m2.seq]);
    // Gói kết thúc ván cũ chỉ còn elo, không còn gameEnd
    const ctx = r.packets[1].parsed;
    expect(ctx.gameEnd).toBeUndefined();
    expect(ctx.eloUpdate).toEqual({ seat: 0, elo: 930 });
    expect(r.packets[2].parsed.eventType).toBe("ready_sent");
  });

  it("lấy mốc là lần vào bàn giữa ván nếu đó là gói mới nhất", () => {
    const start = pkt({ gameStart: { redSeat: 0, blackSeat: 1 } });
    const snap = pkt({
      tableSnapshot: { redSeat: 0, blackSeat: 1, board: [], turn: "b", redRemainingSec: 1, blackRemainingSec: 1 },
    });
    const m = move(19, 22);
    const r = zigaReplay([start, move(70, 67), snap, m]);
    expect(r.packets.map((p) => p.seq)).toEqual([snap.seq, m.seq]);
    expect(r.moves).toBe(1);
  });

  it("có nước đi mà không còn mốc: báo không bày lại được, không phát lại nước nào", () => {
    const r = zigaReplay([pkt({ login: { userName: "W1" } }), move(70, 67)]);
    expect(r).toMatchObject({ anchored: false, moves: 0, orphanMoves: true });
    expect(r.packets.every((p) => !p.parsed.move)).toBe(true);
  });
});
