import type { ServerResponse } from "node:http";
import { WebSocket } from "ws";
import {
  AI_MODEL,
  AI_PROVIDER,
  hasAiKey,
  handleEvent,
  lessons,
  MAX_AI_REPLIES_PER_MINUTE,
} from "./ai";
import { parseStageRoom, speakNotation } from "./narration";
import { EDGE_VOICES, prepareSpeech, setTtsVoice, synthesizeWithRetry, ttsVoiceName } from "./tts";
import type {
  BotBroadcastMessage,
  BotEventOrigin,
  BotGameInfo,
  BotLiveSettings,
  BotReplyRequest,
  BotReplyResult,
  BotStatusResponse,
} from "./types";
import type { StageState } from "@/app/tuong-thuat/stage-sync";

const CHECK_GAP_MS = 15_000;
const RECONNECT_MS = 5_000;
/** Bình luận cùng người, cùng nội dung trong khoảng này coi là trùng (TikTok hay gửi lặp tin). */
const DUPLICATE_WINDOW_MS = 30_000;
/** Số sự kiện TikTok chờ tối đa; đông hơn thì bỏ bình luận cũ nhất (giữ quà) để AI không trả lời trễ cả phút. */
const MAX_PENDING_TIKTOK = 4;

/** Ước lượng thời gian đọc xong một câu trả lời (~3 từ/giây, cộng quãng nghỉ), để đọc xong mới trả lời tiếp. */
export function speakingMs(text: string): number {
  return text.split(/\s+/).filter(Boolean).length * 330 + 1500;
}

export class LiveBotService {
  private readonly overlayClients = new Set<ServerResponse>();
  private readonly session = { aiReplies: 0, costUsd: 0 };
  private readonly liveSettings: BotLiveSettings = {
    inGame: false,
    style: "coach",
    voice: ttsVoiceName() === EDGE_VOICES.male ? "male" : "female",
    speak: true,
  };

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

  // Hàng đợi TikTok: mỗi lần một bình luận, đọc xong mới tới bình luận sau.
  private readonly tiktokQueue: BotReplyRequest[] = [];
  private tiktokBusy = false;
  private readonly seenChats = new Map<string, number>();

  constructor() {
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
  }

  public getStatus(): BotStatusResponse {
    return {
      provider: AI_PROVIDER,
      model: AI_MODEL,
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

  public updateSettings(settings: Partial<BotLiveSettings>): BotLiveSettings {
    if (typeof settings.inGame === "boolean") {
      this.liveSettings.inGame = settings.inGame;
    }
    if (
      settings.style === "coach" ||
      settings.style === "humorous" ||
      settings.style === "zhaoXinxin"
    ) {
      this.liveSettings.style = settings.style;
    }
    if (settings.voice === "female" || settings.voice === "male") {
      this.liveSettings.voice = settings.voice;
      setTtsVoice(EDGE_VOICES[settings.voice]);
    }
    if (typeof settings.speak === "boolean") {
      this.liveSettings.speak = settings.speak;
    }
    return { ...this.liveSettings };
  }

  public addOverlayClient(res: ServerResponse): () => void {
    this.overlayClients.add(res);
    return () => {
      this.overlayClients.delete(res);
    };
  }

  public broadcast(result: BotBroadcastMessage): void {
    const msg = this.liveSettings.speak ? result : { ...result, silent: true };
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
    const result: BotReplyResult = {
      user: "Bình luận",
      question: "",
      reply: text,
      source: "template",
      latencyMs: 0,
      costUsd: 0,
    };
    prepareSpeech(text);
    this.broadcast({ ...result, origin: "game" });
    console.log(`[Bot ván] ${text}`);
  }

  public async processEvent(
    req: BotReplyRequest,
    origin: BotEventOrigin,
  ): Promise<BotReplyResult> {
    const game = this.getCurrentGameInfo();
    if (game) {
      req = { ...req, game: game.summary, inGame: req.inGame || game.live };
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
        const msg = JSON.parse(data.toString()) as { type?: string; state?: StageState };
        if (msg.type === "state" && msg.state) {
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

      const intro =
        s.ply <= 4
          ? `Ván ${this.stageRound} bắt đầu! Anh chủ kênh ${s.settings.me.name} gặp ${s.settings.opponent.name}.`
          : `Mình bắt đầu theo dõi ván ${this.stageRound}: anh chủ kênh gặp ${s.settings.opponent.name}, đã đi ${Math.ceil(s.ply / 2)} nước.`;
      this.narrateGame(intro);
    }

    if (this.stageEnded) return;

    const today = s.settings.today;
    if (today.win > this.stageRecord.win) {
      this.stageEnded = true;
      return this.narrateGame(`Ván cờ kết thúc! Anh chủ kênh giành chiến thắng.`);
    }
    if (today.loss > this.stageRecord.loss) {
      this.stageEnded = true;
      return this.narrateGame(`Ván cờ kết thúc! Anh chủ kênh đã thua ván này.`);
    }
    if (today.draw > this.stageRecord.draw) {
      this.stageEnded = true;
      return this.narrateGame(`Ván cờ kết thúc với tỷ số hòa.`);
    }

    if (s.ply > this.stagePlies) {
      const lastMove = s.moves.at(-1);
      const moment = s.bigMoment;
      if (moment && moment.id !== this.lastMomentId && lastMove) {
        this.lastMomentId = moment.id;
        const mover =
          lastMove.side === s.mySide ? "Anh chủ kênh" : "Đối thủ";
        const move = speakNotation(lastMove.notation);
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
      summary: `Ván ${s.settings.round}: ${me} gặp ${opp}${openingText}, đã đi ${Math.ceil(s.ply / 2)} nước${moveText}`,
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
