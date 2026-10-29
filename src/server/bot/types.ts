export type BotStyle = "coach" | "humorous" | "zhaoXinxin";
export type BotEventKind = "comment" | "gift" | "join";
export type BotEventOrigin = "panel" | "tiktok" | "game";

export interface BotReplyRequest {
  user: string;
  kind: BotEventKind;
  text?: string;
  gift?: string;
  inGame: boolean;
  style: BotStyle;
  /** Tóm tắt ván cờ (chỉ dữ kiện, không có đánh giá engine). */
  game?: string;
}

export interface BotTokenUsage {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface BotReplyResult {
  user: string;
  question: string;
  reply: string | null;
  source: "ai" | "template" | "skipped";
  reason?: string;
  latencyMs: number;
  usage?: BotTokenUsage;
  costUsd: number;
}

export interface BotBroadcastMessage extends BotReplyResult {
  origin: BotEventOrigin;
}

export interface BotLiveSettings {
  inGame: boolean;
  style: BotStyle;
}

export interface BotGameInfo {
  live: boolean;
  summary: string;
}

export interface BotStatusResponse {
  provider: "gemini" | "claude";
  model: string;
  hasKey: boolean;
  lessons: string[];
  maxPerMinute: number;
  session: {
    aiReplies: number;
    costUsd: number;
  };
  settings: BotLiveSettings;
  tiktok: string | null;
  kydai: string | null;
  stage: string | null;
  game: BotGameInfo | null;
}
