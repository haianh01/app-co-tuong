// Đọc thiết lập ván chơi với máy từ URL (?level=&side=&time=). Dữ liệu từ URL có thể bị sửa tay nên phải chịu được mọi giá trị.

import { describe, expect, it } from "vitest";
import { TIME_OPTIONS, parseSettings, settingsHref, type PlaySettings } from "./settings";

describe("parseSettings", () => {
  it("không có tham số: cấp Trung bình, cầm Đỏ, 10 phút", () => {
    expect(parseSettings({})).toEqual({ level: 3, side: "r", minutes: 10 });
  });

  it.each(["1", "2", "3", "4", "5"])("level=%s hợp lệ", (level) => {
    expect(parseSettings({ level }).level).toBe(Number(level));
  });

  it.each(["0", "6", "-1", "abc", "", "Infinity", "NaN"])("level=%j không hợp lệ → cấp 3", (level) => {
    expect(parseSettings({ level }).level).toBe(3);
  });

  it("level lẻ được làm tròn về cấp gần nhất", () => {
    expect(parseSettings({ level: "2.4" }).level).toBe(2);
    expect(parseSettings({ level: "4.6" }).level).toBe(5);
  });

  it("side=b là cầm Đen, mọi giá trị khác là Đỏ", () => {
    expect(parseSettings({ side: "b" }).side).toBe("b");
    for (const side of ["r", "x", "black", "B"]) expect(parseSettings({ side }).side).toBe("r");
  });

  it.each(["0", "5", "10", "20"])("time=%s là một lựa chọn có sẵn", (time) => {
    expect(parseSettings({ time }).minutes).toBe(Number(time));
  });

  it.each(["15", "7", "-5", "abc", "999"])("time=%s không có trong danh sách → 10 phút", (time) => {
    expect(parseSettings({ time }).minutes).toBe(10);
  });

  it("tham số lặp lại (?level=4&level=1) lấy giá trị đầu", () => {
    expect(parseSettings({ level: ["4", "1"], side: ["b", "r"], time: ["5", "20"] })).toEqual({ level: 4, side: "b", minutes: 5 });
  });
});

describe("parseSettings — thế cờ từ bài giảng (?fen=&lesson=)", () => {
  // Thế bài 4 (Oa tâm mã): Đen đi trước
  const BLACK_TO_MOVE = "3aka3/9/2n5C/9/4P4/9/9/9/9/4K4 b - - 0 1";

  it("không ghi side thì cầm bên đến lượt trong FEN", () => {
    const s = parseSettings({ fen: BLACK_TO_MOVE, lesson: "4" });
    expect(s).toMatchObject({ fen: BLACK_TO_MOVE, lesson: 4, side: "b" });
  });

  it("side ghi rõ trên URL thắng lượt đi trong FEN", () => {
    expect(parseSettings({ fen: BLACK_TO_MOVE, side: "r" }).side).toBe("r");
  });

  it.each([
    ["sai số hàng", "4k4/9/9/4K4 w"],
    ["ký tự lạ", "4k4/9/9/9/9/9/9/9/9/4X4 w"],
    ["thiếu Tướng Đen", "9/9/9/9/9/9/9/9/9/4K4 w"],
    ["bên đến lượt đã bị chiếu bí", "3aka2C/4n4/9/9/9/9/9/9/9/4K4 b"],
    ["chuỗi rác", "<script>"],
  ])("FEN %s → bỏ qua, về thế khai cuộc", (_, fen) => {
    const s = parseSettings({ fen, side: "b" });
    expect(s.fen).toBeUndefined();
    expect(s.side).toBe("b");
  });

  it("book (endgame, opening) chỉ có nghĩa khi có lesson", () => {
    expect(parseSettings({ lesson: "12", book: "endgame" }).book).toBe("endgame");
    expect(parseSettings({ lesson: "12", book: "opening" }).book).toBe("opening");
    expect(parseSettings({ lesson: "12", book: "x" }).book).toBeUndefined();
    expect(parseSettings({ book: "endgame" }).book).toBeUndefined();
    expect(parseSettings({ book: "opening" }).book).toBeUndefined();
  });

  it("lesson không phải số thì bỏ qua", () => {
    expect(parseSettings({ lesson: "abc" }).lesson).toBeUndefined();
  });

  it("settingsHref giữ fen và lesson khi đọc lại", () => {
    const s: PlaySettings = { level: 4, side: "b", minutes: 0, fen: BLACK_TO_MOVE, lesson: 4 };
    const params = Object.fromEntries(new URL(settingsHref(s), "http://x").searchParams);
    expect(parseSettings(params)).toEqual(s);
  });
});

describe("settingsHref", () => {
  it("tạo đường dẫn /play với đủ tham số", () => {
    expect(settingsHref({ level: 5, side: "b", minutes: 0 })).toBe("/play?level=5&side=b&time=0");
  });

  it("đọc lại đúng thiết lập đã tạo, với mọi tổ hợp", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const side of ["r", "b"] as const) {
        for (const { minutes } of TIME_OPTIONS) {
          const s: PlaySettings = { level, side, minutes };
          const params = Object.fromEntries(new URL(settingsHref(s), "http://x").searchParams);
          expect(parseSettings(params)).toEqual(s);
        }
      }
    }
  });
});

describe("TIME_OPTIONS", () => {
  it("có lựa chọn không giới hạn thời gian và các mốc phút tăng dần", () => {
    expect(TIME_OPTIONS[0]).toEqual({ minutes: 0, label: "Không giới hạn" });
    const mins = TIME_OPTIONS.map((t) => t.minutes);
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    expect(new Set(mins).size).toBe(mins.length);
  });
});
