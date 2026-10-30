import type { ServerResponse } from "node:http";
import { WebSocket } from "ws";
import {
  AI_MODEL,
  AI_PROVIDER,
  botCharacter,
  DEFAULT_BOT_STYLE,
  hasAiKey,
  handleEvent,
  isBotStyle,
  lessons,
  MAX_AI_REPLIES_PER_MINUTE,
  setCharacter,
} from "./ai";
import { LIMITS, loadSavedSettings, saveSettings } from "./config";
import { analyzeGame, movesFromNotations } from "./postgame";
import { parseStageRoom, speakNotation } from "./narration";
import { createReminderPicker, gamePhase, type GamePhase } from "./reminders";
import { createTipPicker } from "./tips";
import {
  EDGE_VOICES,
  prepareSpeech,
  setTtsEngine,
  setTtsVoice,
  synthesizeWithRetry,
  ttsEngineName,
  ttsVoiceName,
} from "./tts";
import type {
  BotBroadcastMessage,
  BotEventOrigin,
  BotGameInfo,
  BotLiveSettings,
  BotReplyRequest,
  BotReplyResult,
  BotStatusResponse,
} from "./types";
import type { StageReviewState, StageState } from "@/app/tuong-thuat/stage-sync";

const CHECK_GAP_MS = 15_000;
const RECONNECT_MS = 5_000;
/** Bình luận cùng người, cùng nội dung trong khoảng này coi là trùng (TikTok hay gửi lặp tin). */
const DUPLICATE_WINDOW_MS = 30_000;
/** Số sự kiện TikTok chờ tối đa; đông hơn thì bỏ bình luận cũ nhất (giữ quà) để AI không trả lời trễ cả phút. */
const MAX_PENDING_TIKTOK = 4;
/** Mặc định: live im lặng (bot không nói gì) bao lâu thì đọc một mẹo kỳ lý; đổi trên trang Trợ lý (tipMinutes). */
export const TIP_QUIET_MS = (Number(process.env.BOT_TIP_MINUTES) || 4) * 60_000;
const TIP_CHECK_MS = 30_000;
/** Mặc định: khoảng cách giữa hai lần nhắc nhẹ anh chủ kênh trong ván; đổi trên trang Trợ lý (remindMinutes). */
export const REMIND_GAP_MS = (Number(process.env.BOT_REMIND_MINUTES) || 3) * 60_000;
/** Bot vừa nói xong (bình luận nước ăn quân, trả lời chat) thì chờ chừng này rồi mới nhắc, cho khỏi dồn tiếng. */
const REMIND_AFTER_SPEECH_MS = 8_000;
/** Đồng hồ anh chủ kênh dưới mức này thì im lặng hẳn, không làm phân tâm. */
const REMIND_MIN_CLOCK_MS = 60_000;

/** Ước lượng thời gian đọc xong một câu trả lời (~3 từ/giây, cộng quãng nghỉ), để đọc xong mới trả lời tiếp. */
export function speakingMs(text: string): number {
  return text.split(/\s+/).filter(Boolean).length * 330 + 1500;
}

export class LiveBotService {
  private readonly overlayClients = new Set<ServerResponse>();
  private readonly session = { aiReplies: 0, costUsd: 0 };
  private readonly liveSettings: BotLiveSettings = {
    inGame: false,
    style: DEFAULT_BOT_STYLE,
    voice: ttsVoiceName() === EDGE_VOICES.male ? "male" : "female",
    speak: true,
    tips: process.env.BOT_TIPS !== "0",
    remind: process.env.BOT_REMIND !== "0",
    tipMinutes: TIP_QUIET_MS / 60_000,
    remindMinutes: REMIND_GAP_MS / 60_000,
    ...botCharacter(),
    ttsEngine: ttsEngineName(),
  };
  private readonly nextTip = createTipPicker();
  private readonly nextReminder = createReminderPicker();
  // Nhắc anh chủ kênh trong ván: lần nhắc trước, giai đoạn đã nhắc, và có vừa mất quân lớn không.
  private lastRemindAt = 0;
  private remindPhase: GamePhase = "opening";
  private remindSafety = false;
  private lastSpokeAt = Date.now();

  private tiktokUsername: string = (process.env.TIKTOK_USERNAME ?? "")
    .replace(/^@/, "")
    .trim();
  private kydaiPlayer: string = (process.env.KYDAI_PLAYER ?? "").trim();
  private kydaiUrl: string = process.env.KYDAI_URL ?? "http://localhost:3000";

  // Stage tracking state
  private stageWs: WebSocket | null = null;
  private stageRoom: string | null = null;
  private stageRound = -1;
  private stagePlies = 0;
  private stageOpening?: string;
  private lastMomentId = "";
  private lastCheckAt = 0;
  private stageEnded = false;
  private stageRecord = { win: 0, draw: 0, loss: 0 };
  private lastStageState: StageState | null = null;
  private stageResult: "win" | "loss" | "draw" | null = null;
  // Bình ván sau trận: bước ngoặt app tìm được khi chiếu xem lại, và kết quả Pikafish của bot.
  // `stageGame` tăng mỗi ván mới để bỏ kết quả phân tích về muộn của ván cũ.
  private stageTurningPoint: StageReviewState["turningPoint"] = null;
  private stageAnalysis: string | null = null;
  private stageAnalyzing = false;
  private stageGame = 0;

  // Hàng đợi TikTok: mỗi lần một bình luận, đọc xong mới tới bình luận sau.
  private readonly tiktokQueue: BotReplyRequest[] = [];
  private tiktokBusy = false;
  private readonly seenChats = new Map<string, number>();

  constructor() {
    // Cài đặt đã lưu từ trang Trợ lý (lần chạy trước) đè lên giá trị mặc định.
    this.applySettings(loadSavedSettings());

    // Warm up TTS
    synthesizeWithRetry("Xin chào").then(
      () => console.log("[Bot] TTS giọng đọc đã sẵn sàng"),
      (err: unknown) =>
        console.warn(`[Bot] TTS khởi động: ${String(err)}`),
    );

    if (process.env.KYDAI_STAGE) {
      this.joinStage(process.env.KYDAI_STAGE);
    }

    if (this.tiktokUsername) {
      this.startTikTokListener(this.tiktokUsername);
    }

    setInterval(() => {
      this.maybeSpeakTip();
      if (this.lastStageState && !this.stageEnded) this.maybeRemindHost(this.lastStageState);
    }, TIP_CHECK_MS).unref?.();
  }

  /**
   * Nhắc nhẹ anh chủ kênh một nguyên tắc chung (reminders.ts) trong ván thật. Chỉ nói khi anh vừa đi xong
   * (đang tới lượt đối thủ) để không chen vào lúc anh đang nghĩ, và im hẳn khi đồng hồ sắp hết.
   */
  private maybeRemindHost(s: StageState, now = Date.now()): void {
    if (!this.liveSettings.remind || !this.overlayClients.size) return;
    if (s.turn === s.mySide || s.ply < 6) return;
    if (s.clocks && s.clocks.me < REMIND_MIN_CLOCK_MS) return;
    if (now - this.lastSpokeAt < REMIND_AFTER_SPEECH_MS) return;
    const phase = gamePhase(s.ply, [...s.captured.redLost, ...s.captured.blackLost]);
    // Vừa mất quân lớn hoặc vừa sang giai đoạn mới thì nhắc ngay, còn lại cách nhau remindMinutes.
    const group = this.remindSafety ? "safety" : phase;
    if (!this.remindSafety && phase === this.remindPhase && now - this.lastRemindAt < this.liveSettings.remindMinutes * 60_000) return;
    this.remindSafety = false;
    this.remindPhase = phase;
    this.lastRemindAt = now;
    this.speakTemplate(this.nextReminder(group), "Nhắc anh chủ kênh", "remind");
  }

  /** Đọc mẹo kỳ lý khi có overlay đang mở, không còn bình luận chờ và bot đã im lặng đủ tipMinutes. */
  private maybeSpeakTip(now = Date.now()): void {
    if (!this.liveSettings.tips || !this.overlayClients.size) return;
    if (this.tiktokBusy || this.tiktokQueue.length) return;
    if (now - this.lastSpokeAt < this.liveSettings.tipMinutes * 60_000) return;
    this.speakTemplate(this.nextTip(), "Mẹo kỳ lý", "tip");
  }

  public getStatus(): BotStatusResponse {
    return {
      provider: AI_PROVIDER,
      model: AI_MODEL,
      botName: this.liveSettings.name,
      hasKey: hasAiKey,
      lessons: lessons.names,
      maxPerMinute: MAX_AI_REPLIES_PER_MINUTE,
      session: { ...this.session },
      settings: { ...this.liveSettings },
      tiktok: this.tiktokUsername || null,
      kydai: this.kydaiPlayer || null,
      stage: this.stageRoom,
      game: this.getCurrentGameInfo(),
    };
  }

  /** Đổi cài đặt từ trang Trợ lý / Sân khấu; giá trị lạ bị bỏ qua. Lưu ra file để lần chạy sau dùng lại. */
  public updateSettings(settings: Partial<BotLiveSettings>): BotLiveSettings {
    this.applySettings(settings);
    saveSettings(this.liveSettings);
    return { ...this.liveSettings };
  }

  private applySettings(settings: Partial<BotLiveSettings>): void {
    if (typeof settings.inGame === "boolean") {
      this.liveSettings.inGame = settings.inGame;
    }
    if (isBotStyle(settings.style)) {
      this.liveSettings.style = settings.style;
    }
    if (settings.voice === "female" || settings.voice === "male") {
      this.liveSettings.voice = settings.voice;
      setTtsVoice(EDGE_VOICES[settings.voice]);
    }
    if (typeof settings.speak === "boolean") {
      this.liveSettings.speak = settings.speak;
    }
    if (typeof settings.tips === "boolean") {
      this.liveSettings.tips = settings.tips;
    }
    if (typeof settings.remind === "boolean") {
      this.liveSettings.remind = settings.remind;
    }
    const [minMinutes, maxMinutes] = LIMITS.minutes;
    const minutes = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(maxMinutes, Math.max(minMinutes, Math.round(v))) : null;
    this.liveSettings.tipMinutes = minutes(settings.tipMinutes) ?? this.liveSettings.tipMinutes;
    this.liveSettings.remindMinutes = minutes(settings.remindMinutes) ?? this.liveSettings.remindMinutes;
    if (settings.ttsEngine === "piper" || settings.ttsEngine === "edge") {
      this.liveSettings.ttsEngine = settings.ttsEngine;
      setTtsEngine(settings.ttsEngine);
    }
    // Ô để trống thì giữ như cũ, không để nhân vật mất tên hay mất lý lịch.
    const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    const name = text(settings.name, LIMITS.name);
    const self = text(settings.self, LIMITS.self);
    const persona = text(settings.persona, LIMITS.persona);
    // Phần về anh chủ kênh được xóa trắng (anh không muốn AI kể gì về mình).
    const hostProfile = typeof settings.hostProfile === "string" ? settings.hostProfile.trim().slice(0, LIMITS.hostProfile) : null;
    if (name || self || persona || hostProfile !== null) {
      this.liveSettings.name = name ?? this.liveSettings.name;
      this.liveSettings.self = self ?? this.liveSettings.self;
      this.liveSettings.persona = persona ?? this.liveSettings.persona;
      this.liveSettings.hostProfile = hostProfile ?? this.liveSettings.hostProfile;
      const { name: n, self: me, persona: p, hostProfile: h } = this.liveSettings;
      setCharacter({ name: n, self: me, persona: p, hostProfile: h });
    }
  }

  public addOverlayClient(res: ServerResponse): () => void {
    this.overlayClients.add(res);
    return () => {
      this.overlayClients.delete(res);
    };
  }

  public broadcast(result: BotBroadcastMessage): void {
    if (result.reply) this.lastSpokeAt = Date.now();
    const msg = { ...result, botName: this.liveSettings.name, ...(this.liveSettings.speak ? {} : { silent: true }) };
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of this.overlayClients) {
      try {
        res.write(data);
      } catch {
        this.overlayClients.delete(res);
      }
    }
  }

  public narrateGame(text: string): void {
    this.speakTemplate(text, "Bình luận", "game");
    console.log(`[Bot ván] ${text}`);
  }

  /** Câu mẫu có sẵn (không gọi AI): diễn biến ván hoặc mẹo kỳ lý. */
  private speakTemplate(text: string, user: string, origin: "game" | "tip" | "remind"): void {
    const result: BotReplyResult = {
      user,
      question: "",
      reply: text,
      source: "template",
      latencyMs: 0,
      costUsd: 0,
    };
    prepareSpeech(text);
    this.broadcast({ ...result, origin });
  }

  public async processEvent(
    req: BotReplyRequest,
    origin: BotEventOrigin,
  ): Promise<BotReplyResult> {
    const game = this.getCurrentGameInfo();
    if (game) {
      req = { ...req, game: game.summary, postGame: game.postGame, inGame: req.inGame || game.live };
    }
    const result = await handleEvent(req);
    if (result.source === "ai") {
      this.session.aiReplies++;
    }
    this.session.costUsd += result.costUsd;
    if (result.reply) {
      prepareSpeech(result.reply);
    }
    this.broadcast({ ...result, origin });
    if (origin === "tiktok") {
      console.log(
        `[Bot Live] @${result.user}: ${result.question} → ${result.reply ?? `(bỏ qua: ${result.reason ?? ""})`}`,
      );
    }
    return result;
  }

  public joinStage(linkOrRoom: string): string | null {
    const room = parseStageRoom(linkOrRoom);
    if (!room) return null;
    if (this.stageRoom === room && this.stageWs?.readyState === WebSocket.OPEN) {
      return room;
    }
    this.stageRoom = room;
    this.connectStage();
    return room;
  }

  private connectStage(): void {
    if (!this.stageRoom) return;
    try {
      this.stageWs?.terminate();
    } catch {}

    const wsUrl = `${this.kydaiUrl.replace(/^http/, "ws").replace(/\/$/, "")}/ws/stage?room=${encodeURIComponent(this.stageRoom)}&role=view`;
    const ws = new WebSocket(wsUrl);
    this.stageWs = ws;

    ws.on("open", () => {
      console.log(`[Bot Sân khấu] Đã kết nối phòng ${this.stageRoom}`);
    });

    ws.on("message", (data) => {
      try {
        // Giao thức sân khấu dùng trường "t" (xem StageControlMessage trong stage-protocol.ts).
        const msg = JSON.parse(data.toString()) as { t?: string; state?: StageState };
        if (msg.t === "state" && msg.state) {
          this.onStageState(msg.state);
        }
      } catch (e) {
        console.warn("[Bot Sân khấu] Lỗi giải mã tin nhắn:", e);
      }
    });

    ws.on("close", () => {
      if (this.stageWs === ws) {
        setTimeout(() => this.connectStage(), RECONNECT_MS);
      }
    });

    ws.on("error", () => {
      ws.close();
    });
  }

  private onStageState(s: StageState): void {
    // Xem lại ván đã xong: giữ bước ngoặt app tìm được; app chỉ cho xem lại khi ván xong hoặc chưa bắt đầu (canReview).
    if (s.review?.turningPoint && (this.stageEnded || s.ply === 0)) this.stageTurningPoint = s.review.turningPoint;
    if (s.trial || s.review || s.puzzle) return;
    this.lastStageState = s;

    if (
      s.settings.round !== this.stageRound ||
      s.ply < this.stagePlies - 2 ||
      (s.ply <= 1 && this.stagePlies > 4)
    ) {
      this.stageRound = s.settings.round;
      this.stagePlies = s.ply;
      this.stageOpening = undefined;
      this.lastMomentId = "";
      this.stageEnded = false;
      this.stageRecord = { ...s.settings.today };
      this.stageResult = null;
      this.stageTurningPoint = null;
      this.stageAnalysis = null;
      this.stageAnalyzing = false;
      this.stageGame++;
      this.lastRemindAt = 0;
      this.remindPhase = "opening";
      this.remindSafety = false;

      const intro =
        s.ply <= 4
          ? `Ván ${this.stageRound} bắt đầu! Anh chủ kênh ${s.settings.me.name} gặp ${s.settings.opponent.name}.`
          : `Mình bắt đầu theo dõi ván ${this.stageRound}: anh chủ kênh gặp ${s.settings.opponent.name}, đã đi ${Math.ceil(s.ply / 2)} nước.`;
      this.narrateGame(intro);
    }

    if (this.stageEnded) return;

    const today = s.settings.today;
    if (today.win > this.stageRecord.win) {
      return this.finishStage(s, "win", `Ván cờ kết thúc! Anh chủ kênh giành chiến thắng.`);
    }
    if (today.loss > this.stageRecord.loss) {
      return this.finishStage(s, "loss", `Ván cờ kết thúc! Anh chủ kênh đã thua ván này.`);
    }
    if (today.draw > this.stageRecord.draw) {
      return this.finishStage(s, "draw", `Ván cờ kết thúc với tỷ số hòa.`);
    }

    if (s.ply > this.stagePlies) {
      const lastMove = s.moves.at(-1);
      const moment = s.bigMoment;
      if (moment && moment.id !== this.lastMomentId && lastMove) {
        this.lastMomentId = moment.id;
        const mover =
          lastMove.side === s.mySide ? "Anh chủ kênh" : "Đối thủ";
        const move = speakNotation(lastMove.notation);
        if (moment.type === "bigCapture" && lastMove.side !== s.mySide) this.remindSafety = true;
        if (moment.type === "bigCapture" && moment.subtitle) {
          this.narrateGame(
            `${mover} ${move}, ${moment.subtitle.replace(/^(Bạn|Đối thủ) /, "").toLowerCase()}!`,
          );
        } else if (
          moment.type === "check" &&
          Date.now() - this.lastCheckAt > CHECK_GAP_MS
        ) {
          this.lastCheckAt = Date.now();
          this.narrateGame(`${mover} ${move}, chiếu tướng!`);
        }
      }
      this.stagePlies = s.ply;
      this.maybeRemindHost(s);
    }

    const name = s.openingName?.replace(/\s*\(.*\)\s*$/, "");
    if (
      s.ply >= 4 &&
      s.ply <= 16 &&
      name &&
      name !== this.stageOpening &&
      (!this.stageOpening || name.length > this.stageOpening.length)
    ) {
      this.stageOpening = name;
      this.narrateGame(`Ván này đang theo khai cuộc ${name}.`);
    }
  }

  private finishStage(s: StageState, result: "win" | "loss" | "draw", text: string): void {
    this.stageEnded = true;
    this.stageResult = result;
    this.narrateGame(text);
    this.analyzeStage(s);
  }

  /** Chạy Pikafish cho cả ván vừa xong (chỉ gọi khi ván đã kết thúc), xong thì AI tự bình ván. */
  private analyzeStage(s: StageState): void {
    const notations = s.moves.map((m) => m.notation);
    const moves = movesFromNotations(notations);
    if (moves.length < 4) return;
    if (moves.length < notations.length) {
      console.warn(`[Bot bình ván] Chỉ dịch được ${moves.length}/${notations.length} nước, phân tích phần đó`);
    }
    const game = this.stageGame;
    const started = Date.now();
    this.stageAnalyzing = true;
    analyzeGame({ engineUrl: this.kydaiUrl, moves, hostSide: s.mySide })
      .then((r) => {
        if (game !== this.stageGame) return;
        this.stageAnalysis = r.text;
        console.log(`[Bot bình ván] Pikafish xong ${r.plies} nửa nước trong ${((Date.now() - started) / 1000).toFixed(1)} giây`);
        void this.recapGame();
      })
      .catch((err: unknown) => console.warn(`[Bot bình ván] Không chạy được engine: ${String(err)}`))
      .finally(() => {
        if (game === this.stageGame) this.stageAnalyzing = false;
      });
  }

  /** AI tự bình ván cho cả phòng. inGame theo trạng thái ván thật (đã xong), không theo công tắc tay. */
  private async recapGame(): Promise<void> {
    const game = this.getCurrentGameInfo();
    if (!game?.postGame || game.live) return;
    const result = await this.processEvent(
      { user: "Bình ván", kind: "recap", inGame: false, style: this.liveSettings.style },
      "game",
    );
    console.log(`[Bot bình ván] ${result.reply ?? `(bỏ qua: ${result.reason ?? ""})`}`);
  }

  /** Bình ván: chỉ khi ván đã kết thúc. Nhận xét lấy từ Pikafish; AI không tự đánh giá thế cờ. */
  private postGameText(s: StageState): string {
    const who = (side: string) => (side === s.mySide ? "anh chủ kênh" : "đối thủ");
    const lines: string[] = [];
    if (this.stageResult) {
      lines.push(`Kết quả: anh chủ kênh ${this.stageResult === "win" ? "thắng" : this.stageResult === "loss" ? "thua" : "hòa"}.`);
    }
    const pairs: string[] = [];
    for (let i = 0; i < s.moves.length; i += 2) {
      const black = s.moves[i + 1];
      pairs.push(`${i / 2 + 1}. ${speakNotation(s.moves[i].notation)}${black ? `, ${speakNotation(black.notation)}` : ""}`);
    }
    if (pairs.length) lines.push(`Diễn biến (mỗi nước: Đỏ, Đen): ${pairs.join("; ")}.`);
    if (this.stageAnalysis) lines.push(this.stageAnalysis);
    else if (this.stageAnalyzing) lines.push("Pikafish đang phân tích ván, chưa có kết quả: chỉ kể diễn biến, chưa khen chê nước nào.");
    else lines.push("Chưa có phân tích engine cho ván này: chỉ kể diễn biến, không khen chê nước nào.");
    const tp = this.stageTurningPoint;
    if (tp) lines.push(`Bước ngoặt app chỉ ra khi xem lại: nước ${Math.ceil(tp.ply / 2)} ${who(tp.side)} ${speakNotation(tp.notation)}. ${tp.description}`);
    return lines.join("\n");
  }

  public getCurrentGameInfo(): BotGameInfo | null {
    if (!this.lastStageState) return null;
    const s = this.lastStageState;
    if (s.trial || s.review || s.puzzle) return null;
    const me = s.settings.me.name;
    const opp = s.settings.opponent.name;
    const move = s.moves.at(-1)?.notation;
    const moveText = move ? `, nước gần nhất ${speakNotation(move)}` : "";
    const openingText = s.openingName ? `, khai cuộc ${s.openingName}` : "";
    return {
      live: !this.stageEnded,
      summary: `Ván ${s.settings.round}: ${me} gặp ${opp}, anh chủ kênh cầm ${s.mySide === "r" ? "Đỏ" : "Đen"}${openingText}, đã đi ${Math.ceil(s.ply / 2)} nước${moveText}`,
      postGame: this.stageEnded ? this.postGameText(s) : undefined,
    };
  }

  /** Đã gặp bình luận này chưa: cùng msgId, hoặc cùng người cùng nội dung trong DUPLICATE_WINDOW_MS. */
  public isDuplicateChat(msgId: string | undefined, user: string, text: string, now = Date.now()): boolean {
    for (const [key, at] of this.seenChats) {
      if (now - at > DUPLICATE_WINDOW_MS) this.seenChats.delete(key);
    }
    const keys = [`${user}|${text.trim().toLowerCase()}`];
    if (msgId) keys.push(`id:${msgId}`);
    const seen = keys.some((k) => this.seenChats.has(k));
    for (const k of keys) this.seenChats.set(k, now);
    return seen;
  }

  public enqueueTikTok(req: BotReplyRequest): void {
    this.tiktokQueue.push(req);
    while (this.tiktokQueue.length > MAX_PENDING_TIKTOK) {
      const i = this.tiktokQueue.findIndex((r) => r.kind !== "gift");
      if (i < 0) break;
      const [dropped] = this.tiktokQueue.splice(i, 1);
      console.log(`[Bot Live] Bỏ qua @${dropped.user}: ${dropped.text ?? "(vào phòng)"} (đang trả lời không kịp)`);
    }
    void this.drainTikTok();
  }

  private async drainTikTok(): Promise<void> {
    if (this.tiktokBusy) return;
    this.tiktokBusy = true;
    try {
      while (this.tiktokQueue.length) {
        const req = this.tiktokQueue.shift()!;
        const result = await this.processEvent(req, "tiktok").catch((err: unknown) => {
          console.warn(`[Bot Live] Lỗi xử lý @${req.user}: ${String(err)}`);
          return null;
        });
        if (result?.reply) await new Promise((r) => setTimeout(r, speakingMs(result.reply!)));
      }
    } finally {
      this.tiktokBusy = false;
    }
  }

  private startTikTokListener(username: string): void {
    void (async () => {
      try {
        const { TikTokLiveConnection, WebcastEvent, ControlEvent } =
          await import("tiktok-live-connector");
        const conn = new TikTokLiveConnection(username, {
          signApiKey: process.env.EULER_API_KEY || undefined,
        });
        const name = (u?: { nickname?: string; displayId?: string }) =>
          u?.nickname || u?.displayId || "bạn";

        conn.on(WebcastEvent.CHAT, (msg) => {
          if (!msg.content) return;
          const user = name(msg.user);
          if (this.isDuplicateChat(msg.common?.msgId, user, msg.content)) return;
          this.enqueueTikTok({
            user,
            kind: "comment",
            text: msg.content,
            ...this.liveSettings,
          });
        });

        conn.on(WebcastEvent.GIFT, (msg) => {
          if (msg.gift?.combo && !msg.repeatEnd) return;
          const count =
            msg.repeatCount && msg.repeatCount > 1
              ? `${msg.repeatCount} `
              : "";
          this.enqueueTikTok({
            user: name(msg.user),
            kind: "gift",
            gift: `${count}${msg.gift?.name || "quà"}`,
            ...this.liveSettings,
          });
        });

        let lastGreeting = 0;
        conn.on(WebcastEvent.MEMBER, (msg) => {
          const now = Date.now();
          if (now - lastGreeting < 20_000) return;
          lastGreeting = now;
          this.enqueueTikTok({
            user: name(msg.user),
            kind: "join",
            ...this.liveSettings,
          });
        });

        conn.on(ControlEvent.CONNECTED, (state) =>
          console.log(
            `[TikTok] Đã vào phòng live của @${username} (room ${state.roomId})`,
          ),
        );
        conn.on(ControlEvent.DISCONNECTED, () =>
          console.log(`[TikTok] Mất kết nối tới @${username}, sẽ thử lại sau 30s`),
        );

        await conn.connect();
      } catch (err: unknown) {
        console.warn(
          `[TikTok] Chưa kết nối được @${username}: ${String(err).slice(0, 100)}`,
        );
      }
    })();
  }
}
