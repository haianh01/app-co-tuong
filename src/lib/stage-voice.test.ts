import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVoiceLineText, playStageVoiceEvent, speakStageVoice } from "./stage-voice";
import { DEFAULT_STAGE_VOICE_LINES } from "@/app/tuong-thuat/stage-sync";
import * as soundModule from "./sound";

describe("stage-voice", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      speechSynthesis: {
        speak: vi.fn(),
        cancel: vi.fn(),
        getVoices: vi.fn(() => [{ lang: "vi-VN", name: "Vietnamese Voice" }]),
      },
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {
      text: string;
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      voice = null;
      constructor(text: string) {
        this.text = text;
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("getVoiceLineText trả về đúng các câu thoại mặc định", () => {
    expect(getVoiceLineText("check")).toBe(DEFAULT_STAGE_VOICE_LINES.check);
    expect(getVoiceLineText("check")).toBe("Người đâu Cứu trẫm");
    expect(getVoiceLineText("win")).toBe("Bạn sắp đạt đến mục tiêu 2000 elo rồi");
    expect(getVoiceLineText("loss")).toBe("Đừng buồn bạn chỉ thiếu chút may mắn thôi");
  });

  it("getVoiceLineText trả về câu tùy chỉnh", () => {
    expect(getVoiceLineText("check", { check: "Cứu giá mau!" })).toBe("Cứu giá mau!");
  });

  it("speakStageVoice gọi SpeechSynthesis với vi-VN", () => {
    const ok = speakStageVoice("Người đâu Cứu trẫm");
    expect(ok).toBe(true);
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
  });

  it("speakStageVoice trả về false nếu chuỗi rỗng", () => {
    const ok = speakStageVoice("   ");
    expect(ok).toBe(false);
  });

  it("playStageVoiceEvent gọi playSound và trả về text", () => {
    const playSoundSpy = vi.spyOn(soundModule, "playSound").mockImplementation(() => {});

    const text = playStageVoiceEvent("check");
    expect(text).toBe("Người đâu Cứu trẫm");
    expect(playSoundSpy).toHaveBeenCalledWith("check");
  });

  it("playStageVoiceEvent trả về null khi enabled = false", () => {
    const text = playStageVoiceEvent("win", { enabled: false });
    expect(text).toBeNull();
  });
});
