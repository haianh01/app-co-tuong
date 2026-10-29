import { describe, expect, it } from "vitest";
import { speakNotation, parseStageRoom } from "./narration";
import { splitSentences, cleanForSpeech } from "./tts";
import { loadLessons } from "./ai";

describe("live bot - narration and helpers", () => {
  it("converts xiangqi notation to natural Vietnamese speech", () => {
    expect(speakNotation("P2-5")).toBe("Pháo 2 bình 5");
    expect(speakNotation("M8.7")).toBe("Mã 8 tiến 7");
    expect(speakNotation("X4/2")).toBe("Xe 4 thoái 2");
    expect(speakNotation("Xt.3")).toBe("Xe trước tiến 3");
    expect(speakNotation("invalid")).toBe("invalid");
  });

  it("extracts stage room ID correctly", () => {
    expect(
      parseStageRoom("http://localhost:3000/tuong-thuat/san-khau?room=abc123xyz_test_456"),
    ).toBe("abc123xyz_test_456");

    expect(parseStageRoom("abc123xyz_test_456")).toBe("abc123xyz_test_456");
    expect(parseStageRoom("short")).toBeNull();
  });

  it("cleans and splits sentences for TTS properly", () => {
    const raw = "Pháo 2 bình 5 & Mã 8 tiến 7! Nước cờ rất hay. 👍";
    const cleaned = cleanForSpeech(raw);
    expect(cleaned).toContain("và");
    expect(cleaned).not.toContain("&");
    expect(cleaned).not.toContain("👍");

    const text = "Chào bạn nha! Hôm nay đánh cờ thế nào rồi? Chúc bạn buổi tối vui vẻ.";
    const parts = splitSentences(text);
    expect(parts.length).toBeGreaterThanOrEqual(1);
  });

  it("loads chess lessons from transcript directory", () => {
    const res = loadLessons();
    expect(res).toBeDefined();
    expect(Array.isArray(res.names)).toBe(true);
    expect(res.names.length).toBeGreaterThan(0);
    expect(typeof res.text).toBe("string");
  });
});
