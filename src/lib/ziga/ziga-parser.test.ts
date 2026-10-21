import { describe, expect, it } from "vitest";
import { toFen } from "@/lib/xiangqi/engine";
import { extractJson, parseZigaPacket, uciToMove, parseZigaBinaryFrame, parseZigaUiEvent } from "./ziga-parser";

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

describe("parseZigaBinaryFrame", () => {
  const hex = (s: string) => new Uint8Array(s.split(" ").map((b) => parseInt(b, 16)));

  it("giải mã gói nước đi 0x1c bắt được từ Ziga", () => {
    // Đỏ g3g4 (tốt tiến), bên vừa đi còn 892s
    const red = parseZigaBinaryFrame(hex("00 0d 1c 00 00 00 05 06 03 06 04 00 00 03 7c"));
    expect(red?.uciMove).toBe("g3g4");
    expect(red?.move).toEqual(uciToMove("g3g4"));
    // Đen b7e7 (pháo bình trung)
    const black = parseZigaBinaryFrame(hex("00 0d 1c 00 00 00 06 01 07 04 07 00 00 03 80"));
    expect(black?.uciMove).toBe("b7e7");
    expect(black?.move).toEqual(uciToMove("b7e7"));
  });

  it("nhận khung không phải nước đi nhưng không bịa ra move", () => {
    const ping = parseZigaBinaryFrame(hex("00 05 25 00 00 00 00"));
    expect(ping?.eventType).toBe("ziga_0x25");
    expect(ping?.move).toBeUndefined();
  });

  it("trả null khi độ dài khung không khớp (không phải dữ liệu Ziga)", () => {
    expect(parseZigaBinaryFrame(hex("00 09 1c 00 00 00 05 06 03"))).toBeNull();
    expect(parseZigaBinaryFrame(new TextEncoder().encode('42["move",{}]'))).toBeNull();
  });
});

describe("parseZigaUiEvent", () => {
  it("đổi toạ độ tuyệt đối của quân chọn và chấm nước sang chỉ số ô", () => {
    // Pháo đỏ h2 (cột 7, hàng 2) chọn, đi được e2 và h9 (ăn mã)
    const parsed = parseZigaUiEvent({
      type: "select",
      from: { c: 7, r: 2 },
      targets: [{ c: 4, r: 2 }, { c: 7, r: 9 }, { c: 99, r: 0 }],
    });
    expect(parsed.selection).toEqual({
      from: uciToMove("h2e2")!.from,
      targets: [uciToMove("h2e2")!.to, uciToMove("h2h9")!.to],
    });
  });

  it("bỏ chọn khi from = null", () => {
    expect(parseZigaUiEvent({ type: "select", from: null, targets: [] }).selection).toEqual({ from: null, targets: [] });
  });
});

describe("parseZigaBinaryFrame — trạng thái ván", () => {
  const hex = (s: string) => new Uint8Array(s.split(" ").map((b) => parseInt(b, 16)));

  it("đọc sẵn sàng / chưa sẵn sàng của từng ghế (0x2c)", () => {
    expect(parseZigaBinaryFrame(hex("00 07 2c 00 00 00 07 00 01"))?.playerStatus).toEqual({ seat: 0, ready: true, code: 1 });
    expect(parseZigaBinaryFrame(hex("00 07 2c 00 00 00 08 01 02"))?.playerStatus).toEqual({ seat: 1, ready: false, code: 2 });
  });

  it("nhận ra gói bấm sẵn sàng của mình (0x2b)", () => {
    expect(parseZigaBinaryFrame(hex("00 06 2b 00 00 00 00 01"))?.eventType).toBe("ready_sent");
  });

  it("đọc ván bắt đầu, ghế đi trước cầm Đỏ (0x1a)", () => {
    expect(parseZigaBinaryFrame(hex("00 07 1a 00 00 00 03 01 00"))?.gameStart).toEqual({ redSeat: 1, blackSeat: 0 });
  });

  it("đọc lý do: chiếu hết, hết giờ, đầu hàng (0x1d)", () => {
    expect(parseZigaBinaryFrame(hex("00 07 1d 00 00 00 2a 03 01"))?.gameEvent).toEqual({ reason: "checkmate", code: 3, seat: 1 });
    expect(parseZigaBinaryFrame(hex("00 07 1d 00 00 00 07 05 01"))?.gameEvent?.reason).toBe("timeout");
    expect(parseZigaBinaryFrame(hex("00 07 1d 00 00 00 02 06 01"))?.gameEvent?.reason).toBe("resign");
  });

  it("đọc ghế thắng, 0xff là hoà (0x24)", () => {
    expect(parseZigaBinaryFrame(hex("00 06 24 00 00 00 2b 01"))?.gameEnd).toEqual({ winnerSeat: 1 });
    expect(parseZigaBinaryFrame(hex("00 06 24 00 00 00 03 ff"))?.gameEnd).toEqual({ winnerSeat: null });
  });
});

describe("parseZigaBinaryFrame — người chơi, elo, thể thức, thế cờ giữa ván", () => {
  // Khung thật bắt từ zigavn.com (người dẫn W43604711 ngồi ghế 1)
  const hex = (s: string) => new Uint8Array(s.split(" ").map((b) => parseInt(b, 16)));
  const LOGIN = "00 6f 05 ff ff ff ff 00 09 57 34 33 36 30 34 37 31 31 00 08 32 30 32 33 32 30 39 37 00 3b 68 74 74 70 73 3a 2f 2f 73 76 32 2e 7a 69 67 61 76 6e 2e 63 6f 6d 2f 61 76 61 74 61 72 73 2f 64 65 66 61 75 6c 74 2f 61 76 61 74 61 72 5f 64 65 66 61 75 6c 74 5f 31 2e 70 6e 67 00 00 00 04 00 00 02 28 02 05 00 00 03 93 00 00 03 e8 01 00 01 13 0b 35";
  const TABLE_INFO = "00 b3 1b ff ff ff ff 00 00 00 01 00 09 41 36 34 30 38 32 34 31 36 00 00 00 00 00 04 00 3b 68 74 74 70 73 3a 2f 2f 73 76 32 2e 7a 69 67 61 76 6e 2e 63 6f 6d 2f 61 76 61 74 61 72 73 2f 64 65 66 61 75 6c 74 2f 61 76 61 74 61 72 5f 64 65 66 61 75 6c 74 5f 36 2e 70 6e 67 00 00 03 be 00 00 00 00 09 57 34 33 36 30 34 37 31 31 01 01 00 00 00 04 00 3b 68 74 74 70 73 3a 2f 2f 73 76 32 2e 7a 69 67 61 76 6e 2e 63 6f 6d 2f 61 76 61 74 61 72 73 2f 64 65 66 61 75 6c 74 2f 61 76 61 74 61 72 5f 64 65 66 61 75 6c 74 5f 31 2e 70 6e 67 00 00 03 93 00 00 00";
  const TABLE_SYNC_MID_GAME = "00 7d 33 ff ff ff ff 02 00 00 03 84 00 00 00 3c 00 01 00 00 00 1d 00 00 03 80 00 00 03 59 01 04 00 00 03 00 00 05 00 00 02 00 00 06 00 00 00 00 00 08 00 00 01 02 00 04 02 00 01 00 00 07 00 00 00 03 00 02 03 00 04 03 00 06 04 00 08 03 00 04 09 00 05 09 00 03 09 00 06 09 00 02 09 00 08 09 00 00 09 00 07 07 00 01 07 00 06 07 00 01 09 00 08 06 00 06 06 00 04 06 00 02 06 00 00 06 00";
  const LEAVE = "00 06 27 00 00 00 03 00";
  const JOIN = "00 5a c6 00 00 00 05 00 09 41 32 30 31 32 35 34 30 33 00 02 00 00 00 03 00 3b 68 74 74 70 73 3a 2f 2f 73 76 32 2e 7a 69 67 61 76 6e 2e 63 6f 6d 2f 61 76 61 74 61 72 73 2f 64 65 66 61 75 6c 74 2f 61 76 61 74 61 72 5f 64 65 66 61 75 6c 74 5f 33 2e 70 6e 67 00 00 04 7d 00 00 00";
  const ELO = "00 0a fd 00 00 00 2d 00 00 00 04 10";

  it("lấy tên tài khoản của mình từ gói đăng nhập (0x05)", () => {
    expect(parseZigaBinaryFrame(hex(LOGIN))?.login).toEqual({ userName: "W43604711" });
  });

  it("đọc tên + elo cả bàn (0x1b), người vào (0xc6), người rời (0x27)", () => {
    expect(parseZigaBinaryFrame(hex(TABLE_INFO))?.roster).toEqual({
      replace: true,
      list: [
        { seat: 0, name: "A64082416", elo: 958 },
        { seat: 1, name: "W43604711", elo: 915 },
      ],
    });
    expect(parseZigaBinaryFrame(hex(JOIN))?.roster).toEqual({ replace: false, list: [{ seat: 0, name: "A20125403", elo: 1149 }] });
    expect(parseZigaBinaryFrame(hex(LEAVE))?.playerLeave).toEqual({ seat: 0 });
  });

  it("đọc elo mới sau ván (0xfd)", () => {
    expect(parseZigaBinaryFrame(hex(ELO))?.eloUpdate).toEqual({ seat: 0, elo: 1040 });
  });

  it("đọc thể thức và thế cờ khi vào bàn giữa ván (0x33)", () => {
    const parsed = parseZigaBinaryFrame(hex(TABLE_SYNC_MID_GAME));
    expect(parsed?.timeControl).toEqual({ totalSec: 900, perMoveSec: 60 });
    const snap = parsed?.tableSnapshot;
    expect(snap && toFen({ board: snap.board, turn: snap.turn })).toBe("rnbakab1r/9/1c4nc1/p1p1p1p1p/9/6P2/P1P1P3P/1C2C4/9/RNBAKABNR b");
    expect(snap).toMatchObject({ redSeat: 0, blackSeat: 1, redRemainingSec: 896, blackRemainingSec: 857 });
  });

  it("0x33 khi chưa vào ván thì chỉ có thể thức", () => {
    const parsed = parseZigaBinaryFrame(hex("00 0e 33 ff ff ff ff 01 00 00 03 84 00 00 00 3c"));
    expect(parsed?.timeControl).toEqual({ totalSec: 900, perMoveSec: 60 });
    expect(parsed?.tableSnapshot).toBeUndefined();
  });
});
