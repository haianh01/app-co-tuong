import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMove, parseFen } from "@/lib/xiangqi/engine";
import type { BotReplyRequest } from "./types";

// Không đọc/ghi file cài đặt thật của máy chạy test.
process.env.BOT_SETTINGS_FILE = "";

const setTtsVoice = vi.fn();
const setTtsEngine = vi.fn();
vi.mock("./tts", () => ({
  prepareSpeech: vi.fn(),
  synthesizeWithRetry: vi.fn(() => Promise.resolve()),
  EDGE_VOICES: { female: "vi-VN-HoaiMyNeural", male: "vi-VN-NamMinhNeural" },
  setTtsVoice: (v: string) => setTtsVoice(v),
  ttsVoiceName: () => "vi-VN-HoaiMyNeural",
  setTtsEngine: (e: string) => setTtsEngine(e),
  ttsEngineName: () => "piper",
}));

const answered: string[] = [];
vi.mock("./ai", () => ({
  AI_MODEL: "test",
  AI_PROVIDER: "gemini",
  botCharacter: () => ({ name: "AI trợ lý", self: "mình", persona: "Trợ lý cờ tướng.", hostProfile: "" }),
  setCharacter: vi.fn(),
  DEFAULT_BOT_STYLE: "coach",
  isBotStyle: (v: unknown) => ["coach", "humorous", "zhaoXinxin", "playful", "teaseHost", "serious"].includes(v as string),
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

/** Kết nối TikTok giả: `offline` là chưa lên live. */
const tiktok = vi.hoisted(() => {
  class FakeConn {
    static all: FakeConn[] = [];
    static offline = false;
    handlers: Record<string, (arg?: unknown) => void> = {};
    constructor(public username: string) {
      FakeConn.all.push(this);
    }
    on(event: string, fn: (arg?: unknown) => void) {
      this.handlers[event] = fn;
      return this;
    }
    async connect() {
      if (FakeConn.offline) throw new Error("The requested user isn't online");
      this.handlers.connected?.({ roomId: "1" });
    }
    async disconnect() {
      this.handlers.disconnected?.();
    }
  }
  return { FakeConn };
});
vi.mock("tiktok-live-connector", () => ({
  TikTokLiveConnection: tiktok.FakeConn,
  WebcastEvent: { CHAT: "chat", GIFT: "gift", MEMBER: "member" },
  ControlEvent: { CONNECTED: "connected", DISCONNECTED: "disconnected" },
}));

const { LiveBotService, parseTikTokUsername, speakingMs, TIP_QUIET_MS } = await import("./service");

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

describe("kết nối kênh TikTok", () => {
  const { FakeConn } = tiktok;
  beforeEach(() => {
    vi.useFakeTimers();
    answered.length = 0;
    FakeConn.all = [];
    FakeConn.offline = false;
    delete process.env.TIKTOK_USERNAME;
  });
  afterEach(() => vi.useRealTimers());

  it("nhận @ten, ten và link kênh; chuỗi lạ thì coi như chưa đặt", () => {
    expect(parseTikTokUsername(" @anh.it_dz ")).toBe("anh.it_dz");
    expect(parseTikTokUsername("anh.it_dz")).toBe("anh.it_dz");
    expect(parseTikTokUsername("https://www.tiktok.com/@anh.it_dz/live?x=1")).toBe("anh.it_dz");
    expect(parseTikTokUsername("không phải tên")).toBe("");
  });

  it("chưa đặt kênh thì không kết nối và báo off", () => {
    const bot = new LiveBotService();
    expect(FakeConn.all).toHaveLength(0);
    expect(bot.getStatus()).toMatchObject({ tiktok: null, tiktokState: "off" });
  });

  it("đặt kênh khi chưa lên live: tự thử lại tới khi vào được, rồi nhận bình luận", async () => {
    FakeConn.offline = true;
    const bot = new LiveBotService();
    bot.updateSettings({ tiktokUsername: "@kenh" });
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeConn.all.map((c) => c.username)).toEqual(["kenh"]);
    expect(bot.getStatus()).toMatchObject({ tiktok: "kenh", tiktokState: "waiting" });
    expect(bot.getStatus().tiktokError).toMatch(/online/);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeConn.all).toHaveLength(2);

    FakeConn.offline = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(bot.getStatus()).toMatchObject({ tiktokState: "connected", tiktokError: null });

    FakeConn.all.at(-1)!.handlers.chat({ content: "Pháo đầu là gì?", user: { nickname: "Minh" } });
    await vi.advanceTimersByTimeAsync(0);
    expect(answered).toEqual(["Pháo đầu là gì?"]);
  });

  it("rớt kết nối giữa live thì tự vào lại bằng kết nối mới", async () => {
    const bot = new LiveBotService();
    bot.updateSettings({ tiktokUsername: "kenh" });
    await vi.advanceTimersByTimeAsync(0);
    FakeConn.all[0].handlers.disconnected();
    expect(bot.getStatus().tiktokState).toBe("waiting");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeConn.all).toHaveLength(2);
    expect(bot.getStatus().tiktokState).toBe("connected");
  });

  it("xóa kênh thì ngắt hẳn, không còn thử lại ngầm", async () => {
    const bot = new LiveBotService();
    bot.updateSettings({ tiktokUsername: "kenh" });
    await vi.advanceTimersByTimeAsync(0);
    bot.updateSettings({ tiktokUsername: "" });
    expect(bot.getStatus()).toMatchObject({ tiktok: null, tiktokState: "off" });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(FakeConn.all).toHaveLength(1);
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

describe("mẹo kỳ lý khi live im lặng", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const listen = (bot: InstanceType<typeof LiveBotService>) => {
    const sent: Record<string, unknown>[] = [];
    bot.addOverlayClient({
      write: (chunk: string) => sent.push(JSON.parse(chunk.replace(/^data: /, ""))),
    } as never);
    return sent;
  };

  it("im lặng đủ lâu thì đọc một mẹo (câu mẫu, không gọi AI); bot vừa nói thì đếm lại từ đầu", async () => {
    const bot = new LiveBotService();
    const sent = listen(bot);

    await vi.advanceTimersByTimeAsync(TIP_QUIET_MS - 60_000);
    bot.narrateGame("Ván 1 bắt đầu!");
    await vi.advanceTimersByTimeAsync(TIP_QUIET_MS - 30_000);
    expect(sent.filter((m) => m.origin === "tip")).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(60_000);
    const tips = sent.filter((m) => m.origin === "tip");
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({ source: "template", costUsd: 0, user: "Mẹo kỳ lý" });
    expect(tips[0].reply).toEqual(expect.any(String));

    // mẹo vừa đọc cũng tính là bot đã nói: mẹo sau phải chờ thêm đủ TIP_QUIET_MS
    await vi.advanceTimersByTimeAsync(TIP_QUIET_MS - 60_000);
    expect(sent.filter((m) => m.origin === "tip")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent.filter((m) => m.origin === "tip")).toHaveLength(2);
  });

  it("không có overlay nào mở hoặc đã tắt mẹo thì không đọc; bật lại thì đọc ở lần kiểm kế tiếp", async () => {
    const quiet = new LiveBotService();
    await vi.advanceTimersByTimeAsync(TIP_QUIET_MS * 2);
    const late = listen(quiet);
    quiet.updateSettings({ tips: false });
    await vi.advanceTimersByTimeAsync(TIP_QUIET_MS * 2);
    expect(late).toHaveLength(0);
    quiet.updateSettings({ tips: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(late.map((m) => m.origin)).toEqual(["tip"]);
  });
});

describe("kết thúc ván trên sân khấu", () => {
  const mated = () => {
    const pos = parseFen("4k4/R8/9/9/9/R8/9/9/9/3K5 r - - 0 1");
    const before = { ...pos, ply: 20, mySide: "r", settings: { round: 1, me: { name: "Anh" }, opponent: { name: "Khách" }, today: { win: 0, draw: 0, loss: 0 } }, captured: { redLost: [], blackLost: [] }, moves: [], bigMoment: null, clocks: null };
    const after = applyMove(pos, { from: 45, to: 0 });
    return {
      before,
      after: { ...before, ...after, ply: 21, moves: [{ notation: "Xe 1 tiến 5", side: "r" }], bigMoment: { id: "mate-21", type: "mate", title: "BẠN THẮNG!", badge: "KẾT THÚC" } },
    };
  };

  it("chiếu bí mà chưa bấm kết quả: bot vẫn chốt ván (trang Thị giác máy tính chỉ cộng thành tích lúc sang ván sau)", () => {
    const bot = new LiveBotService();
    const sent: { reply: string }[] = [];
    bot.addOverlayClient({ write: (chunk: string) => sent.push(JSON.parse(chunk.replace(/^data: /, ""))) } as never);
    const feed = (s: unknown) => (bot as unknown as { onStageState: (s: unknown) => void }).onStageState(s);
    const { before, after } = mated();
    feed(before);
    feed(after);
    expect(sent.at(-1)?.reply).toBe("Ván cờ kết thúc! Anh chủ kênh giành chiến thắng.");
    expect(bot.getCurrentGameInfo()?.live).toBe(false);
    // Bấm "Thắng" ngay sau đó (hoặc Ziga báo hết ván) không đọc lại lần nữa.
    const n = sent.length;
    feed({ ...after, settings: { ...after.settings, today: { win: 1, draw: 0, loss: 0 } } });
    expect(sent).toHaveLength(n);
  });
});

describe("nhắc nhẹ anh chủ kênh trong ván thật", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const state = (ply: number, over: Record<string, unknown> = {}) =>
    ({
      ply,
      // anh chủ kênh cầm Đỏ: ply chẵn là tới lượt Đỏ (anh đang nghĩ), ply lẻ là anh vừa đi xong
      turn: ply % 2 === 0 ? "r" : "b",
      mySide: "r",
      settings: { round: 1, me: { name: "Anh" }, opponent: { name: "Khách" }, today: { win: 0, draw: 0, loss: 0 } },
      captured: { redLost: [], blackLost: [] },
      moves: Array.from({ length: ply }, (_, i) => ({ notation: "B3.1", side: i % 2 === 0 ? "r" : "b" })),
      bigMoment: null,
      clocks: null,
      ...over,
    }) as never;

  const setup = () => {
    const bot = new LiveBotService();
    const sent: { origin: string; reply: string }[] = [];
    bot.addOverlayClient({ write: (chunk: string) => sent.push(JSON.parse(chunk.replace(/^data: /, ""))) } as never);
    const feed = (s: unknown) => (bot as unknown as { onStageState: (s: unknown) => void }).onStageState(s);
    const reminders = () => sent.filter((m) => m.origin === "remind");
    return { bot, feed, reminders };
  };

  it("chỉ nhắc khi anh vừa đi xong, cách nhau vài phút, và tắt được", async () => {
    const { bot, feed, reminders } = setup();
    feed(state(0));
    await vi.advanceTimersByTimeAsync(10_000);
    feed(state(6)); // tới lượt anh đang nghĩ: im
    expect(reminders()).toHaveLength(0);
    feed(state(7)); // anh vừa đi xong
    expect(reminders()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);
    feed(state(9));
    expect(reminders()).toHaveLength(1); // chưa đủ khoảng cách

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    feed(state(11));
    expect(reminders()).toHaveLength(2);

    bot.updateSettings({ remind: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    feed(state(13));
    expect(reminders()).toHaveLength(2);
  });

  it("vừa mất quân lớn thì nhắc giữ bình tĩnh ngay nước sau; đồng hồ dưới 1 phút thì im", async () => {
    const { feed, reminders } = setup();
    feed(state(0));
    await vi.advanceTimersByTimeAsync(10_000);
    feed(state(7));
    expect(reminders()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(10_000);
    // đối phương ăn Xe của anh
    feed(state(8, { bigMoment: { id: "m1", type: "bigCapture", title: "", subtitle: "Đối thủ ăn Xe", badge: "" }, captured: { redLost: ["r"], blackLost: [] } }));
    await vi.advanceTimersByTimeAsync(10_000);
    feed(state(9, { captured: { redLost: ["r"], blackLost: [] }, clocks: { me: 30_000, opponent: 300_000 } }));
    expect(reminders()).toHaveLength(1); // sắp hết giờ: không làm phân tâm

    feed(state(11, { captured: { redLost: ["r"], blackLost: [] } }));
    expect(reminders()).toHaveLength(2);
    expect(reminders()[1].reply).toMatch(/Bình tĩnh|chắc|Hít một hơi/);
  });
});

describe("cài đặt trên trang Trợ lý thay cho .env", () => {
  it("đổi nhân vật, bộ đọc và số phút; ô trống hay giá trị lạ thì giữ như cũ", () => {
    const bot = new LiveBotService();
    bot.updateSettings({ name: "  Mèo Pháo ", persona: "Mèo mê cờ.", ttsEngine: "edge", tipMinutes: 6, remindMinutes: 2 });
    expect(bot.getStatus().botName).toBe("Mèo Pháo");
    expect(bot.getStatus().settings).toMatchObject({ self: "mình", persona: "Mèo mê cờ.", ttsEngine: "edge", tipMinutes: 6, remindMinutes: 2 });
    expect(setTtsEngine).toHaveBeenLastCalledWith("edge");

    bot.updateSettings({ name: "   ", ttsEngine: "google" as never, tipMinutes: 999, remindMinutes: "5" as never });
    expect(bot.getStatus().settings).toMatchObject({ name: "Mèo Pháo", ttsEngine: "edge", tipMinutes: 30, remindMinutes: 2 });
  });
});

describe("anh chủ kênh tự giới thiệu cho AI", () => {
  it("lưu được, sửa được, và xóa trắng được", () => {
    const bot = new LiveBotService();
    bot.updateSettings({ hostProfile: "  Lập trình viên, live tối thứ 7.  " });
    expect(bot.getStatus().settings.hostProfile).toBe("Lập trình viên, live tối thứ 7.");
    bot.updateSettings({ name: "Tiểu Tốt" });
    expect(bot.getStatus().settings.hostProfile).toBe("Lập trình viên, live tối thứ 7.");
    bot.updateSettings({ hostProfile: "" });
    expect(bot.getStatus().settings.hostProfile).toBe("");
  });
});
