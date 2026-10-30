import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotReplyRequest } from "./types";

const setTtsVoice = vi.fn();
vi.mock("./tts", () => ({
  prepareSpeech: vi.fn(),
  synthesizeWithRetry: vi.fn(() => Promise.resolve()),
  EDGE_VOICES: { female: "vi-VN-HoaiMyNeural", male: "vi-VN-NamMinhNeural" },
  setTtsVoice: (v: string) => setTtsVoice(v),
  ttsVoiceName: () => "vi-VN-HoaiMyNeural",
}));

const answered: string[] = [];
vi.mock("./ai", () => ({
  AI_MODEL: "test",
  AI_PROVIDER: "gemini",
  hasAiKey: true,
  lessons: { names: [], text: "" },
  MAX_AI_REPLIES_PER_MINUTE: 6,
  handleEvent: vi.fn(async (req: BotReplyRequest) => {
    answered.push(req.text ?? req.kind);
    return {
      user: req.user,
      question: req.text ?? "",
      reply: `Trả lời ${req.user}: nhớ giữ Mã bằng Pháo nhé.`,
      source: "ai",
      latencyMs: 0,
      costUsd: 0,
    };
  }),
}));

const { LiveBotService, speakingMs } = await import("./service");

const comment = (user: string, text: string): BotReplyRequest => ({
  user,
  kind: "comment",
  text,
  inGame: false,
  style: "coach",
});

describe("bình luận TikTok trên live", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    answered.length = 0;
    delete process.env.TIKTOK_USERNAME;
    delete process.env.KYDAI_STAGE;
  });
  afterEach(() => vi.useRealTimers());

  it("TikTok gửi lặp cùng một tin (cùng msgId hoặc cùng người cùng chữ) thì chỉ nhận lần đầu", () => {
    const bot = new LiveBotService();
    const t = 1_000_000;
    expect(bot.isDuplicateChat("7391", "Minh", "Thầy ơi em hay mất Mã đầu ván", t)).toBe(false);
    expect(bot.isDuplicateChat("7391", "Minh", "Thầy ơi em hay mất Mã đầu ván", t + 200)).toBe(true);
    // msgId khác nhưng cùng người gõ lại y hệt ngay sau đó (gửi đúp)
    expect(bot.isDuplicateChat("7392", "Minh", "thầy ơi em hay mất mã đầu ván ", t + 3_000)).toBe(true);
    // người khác hỏi cùng câu vẫn được trả lời
    expect(bot.isDuplicateChat("7393", "Lan", "Thầy ơi em hay mất Mã đầu ván", t + 4_000)).toBe(false);
    // hỏi lại sau một lúc lâu thì coi là câu mới
    expect(bot.isDuplicateChat("7394", "Minh", "Thầy ơi em hay mất Mã đầu ván", t + 60_000)).toBe(false);
  });

  it("trả lời từng bình luận một, đọc xong câu trước mới trả lời câu sau", async () => {
    const bot = new LiveBotService();
    bot.enqueueTikTok(comment("Minh", "Mất Mã đầu ván thì sao ạ?"));
    bot.enqueueTikTok(comment("Lan", "Pháo đầu nên đi gì?"));

    await vi.advanceTimersByTimeAsync(0);
    expect(answered).toEqual(["Mất Mã đầu ván thì sao ạ?"]);

    const wait = speakingMs("Trả lời Minh: nhớ giữ Mã bằng Pháo nhé.");
    await vi.advanceTimersByTimeAsync(wait - 100);
    expect(answered).toHaveLength(1); // vẫn đang đọc câu của Minh

    await vi.advanceTimersByTimeAsync(200);
    expect(answered).toEqual(["Mất Mã đầu ván thì sao ạ?", "Pháo đầu nên đi gì?"]);
  });

  it("chat dồn dập thì bỏ bình luận cũ nhất đang chờ, không trả lời trễ cả phút", async () => {
    const bot = new LiveBotService();
    for (const [i, user] of ["A", "B", "C", "D", "E", "F", "G"].entries()) {
      bot.enqueueTikTok(comment(user, `câu ${i + 1}`));
    }
    await vi.advanceTimersByTimeAsync(120_000);
    // câu 1 đang được trả lời ngay; còn chờ tối đa 4 câu mới nhất
    expect(answered).toEqual(["câu 1", "câu 4", "câu 5", "câu 6", "câu 7"]);
  });
});

describe("đổi phong cách và giọng AI lúc đang live", () => {
  it("chọn giọng nam thì đổi giọng đọc ngay; giá trị lạ bị bỏ qua", () => {
    const bot = new LiveBotService();
    expect(bot.getStatus().settings).toMatchObject({ style: "coach", voice: "female" });

    bot.updateSettings({ style: "humorous", voice: "male" });
    expect(bot.getStatus().settings).toMatchObject({ style: "humorous", voice: "male" });
    expect(setTtsVoice).toHaveBeenLastCalledWith("vi-VN-NamMinhNeural");

    setTtsVoice.mockClear();
    bot.updateSettings({ voice: "robot" as never, style: "rap" as never });
    expect(bot.getStatus().settings).toMatchObject({ style: "humorous", voice: "male" });
    expect(setTtsVoice).not.toHaveBeenCalled();
  });
});

describe("tắt giọng AI lúc đang live", () => {
  it("tắt thì overlay/avatar nhận câu trả lời kèm silent (vẫn hiện chữ), bật lại thì đọc như cũ", async () => {
    const bot = new LiveBotService();
    const sent: Record<string, unknown>[] = [];
    bot.addOverlayClient({
      write: (chunk: string) => sent.push(JSON.parse(chunk.replace(/^data: /, ""))),
    } as never);
    const ask = (text: string) =>
      bot.processEvent({ user: "khach", kind: "comment", text, inGame: false, style: "coach" }, "panel");

    bot.updateSettings({ speak: false });
    expect(bot.getStatus().settings.speak).toBe(false);
    await ask("Xe đi đâu ạ?");
    bot.updateSettings({ speak: "no" as never });
    await ask("Còn Mã?");
    bot.updateSettings({ speak: true });
    await ask("Pháo thì sao?");

    expect(sent.map((m) => [m.question, m.silent ?? false, Boolean(m.reply)])).toEqual([
      ["Xe đi đâu ạ?", true, true],
      ["Còn Mã?", true, true],
      ["Pháo thì sao?", false, true],
    ]);
  });
});
