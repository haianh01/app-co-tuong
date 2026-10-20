import { describe, expect, it } from "vitest";
import { extractJson, parseZigaPacket, uciToMove } from "./ziga-parser";

describe("ziga-parser", () => {
  it("chuyển đổi đúng tọa độ UCI", () => {
    // Pháo 2 bình 5: h2 -> e2 (col 7 -> col 4, row 7 -> row 7)
    // h=7, 2 -> 9-2 = 7; e=4, 2 -> 9-2 = 7
    // sq(7, 7) = 7*9+7 = 70; sq(7, 4) = 7*9+4 = 67
    const m = uciToMove("h2e2");
    expect(m).toEqual({ from: 70, to: 67 });

    // Tốt 7 tiến 1: c6 -> c5
    // c=2, 6 -> 9-6=3; c=2, 5 -> 9-5=4
    const p = uciToMove("c6c5");
    expect(p).toEqual({ from: 29, to: 38 });
  });

  it("bóc tách được Socket.io packet dạng 42[...]", () => {
    const raw = '42["game_move",{"from":70,"to":67,"piece":"C"}]';
    const json = extractJson(raw);
    expect(Array.isArray(json)).toBe(true);

    const parsed = parseZigaPacket(raw);
    expect(parsed.eventType).toBe("game_move");
    expect(parsed.move).toEqual({ from: 70, to: 67 });
  });

  it("bóc tách được gói tin JSON chứa nước đi UCI và đồng hồ", () => {
    const raw = JSON.stringify({
      action: "move",
      move: "h2e2",
      timeRed: 300,
      timeBlack: 280,
      playerRed: "Kỳ Thủ Đỏ",
      playerBlack: "Kỳ Thủ Đen",
    });

    const parsed = parseZigaPacket(raw);
    expect(parsed.eventType).toBe("move");
    expect(parsed.move).toEqual({ from: 70, to: 67 });
    expect(parsed.clocks?.redMs).toBe(300_000);
    expect(parsed.clocks?.blackMs).toBe(280_000);
    expect(parsed.players?.red?.name).toBe("Kỳ Thủ Đỏ");
  });

  it("xử lý an toàn khi gặp dữ liệu không phải JSON", () => {
    const parsed = parseZigaPacket("PING 123456789");
    expect(parsed.eventType).toBe("raw_text");
    expect(parsed.move).toBeUndefined();
  });
});
