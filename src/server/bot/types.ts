export type BotStyle = "coach" | "humorous" | "zhaoXinxin" | "playful" | "teaseHost" | "serious";
/** Giọng đọc Edge TTS: nữ (Hoài My) hoặc nam (Nam Minh). */
export type BotVoice = "female" | "male";
/** "recap": tự bình ván sau khi Pikafish phân tích xong ván vừa kết thúc. */
export type BotEventKind = "comment" | "gift" | "join" | "recap";
/** "tip": mẹo kỳ lý bot tự đọc khi live im lặng (tips.ts). "remind": nhắc nhẹ anh chủ kênh trong ván (reminders.ts). */
export type BotEventOrigin = "panel" | "tiktok" | "game" | "tip" | "remind";

export interface BotReplyRequest {
  user: string;
  kind: BotEventKind;
  text?: string;
  gift?: string;
  inGame: boolean;
  style: BotStyle;
  /** Tóm tắt ván cờ (chỉ dữ kiện, không có đánh giá engine). */
  game?: string;
  /** Bình ván (chỉ khi ván đã xong): diễn biến và nhận xét Pikafish. */
  postGame?: string;
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
  /** Người live đang tắt giọng: overlay/avatar chỉ hiện chữ, không đọc to. */
  silent?: boolean;
  /** Tên nhân vật lúc gửi, để phụ đề đổi tên ngay khi sửa trên trang Trợ lý. */
  botName?: string;
}

export interface BotLiveSettings {
  inGame: boolean;
  style: BotStyle;
  voice: BotVoice;
  /** Có đọc to câu trả lời không (tắt thì vẫn hiện chữ). */
  speak: boolean;
  /** Live im lặng một lúc thì tự đọc một mẹo kỳ lý (tips.ts). */
  tips: boolean;
  /** Trong ván thật, thỉnh thoảng nhắc nhẹ anh chủ kênh một nguyên tắc chung (reminders.ts, không nhìn thế cờ). */
  remind: boolean;
  /** Bao nhiêu phút im lặng thì đọc một mẹo kỳ lý. */
  tipMinutes: number;
  /** Khoảng cách tối thiểu (phút) giữa hai lần nhắc anh chủ kênh. */
  remindMinutes: number;
  /** Nhân vật: tên (hiện trên phụ đề), cách tự xưng, lý lịch/tính cách gửi cho AI. */
  name: string;
  self: string;
  persona: string;
  /** Anh chủ kênh tự giới thiệu (tên, nghề, sở thích, trình độ, lịch live…); AI chỉ nói về anh ấy theo đây. */
  hostProfile: string;
  /** Bộ đọc: Piper chạy trên máy (ổn định) hoặc Edge TTS của Microsoft (giọng tự nhiên hơn, hay bị cắt). */
  ttsEngine: TtsEngine;
  /** Kênh TikTok để đọc bình luận (không có @); rỗng là chưa đặt, AI không thấy chat. */
  tiktokUsername: string;
}

/** off: chưa đặt kênh; waiting: đang thử vào phòng (chưa lên live thì tự thử lại); connected: đang nhận chat. */
export type BotTikTokState = "off" | "waiting" | "connected";

export type TtsEngine = "piper" | "edge";

export interface BotGameInfo {
  live: boolean;
  summary: string;
  /** Chỉ có khi ván ĐÃ kết thúc: diễn biến cả ván và nhận xét Pikafish, để AI bình ván (fair-play). */
  postGame?: string;
}

export interface BotStatusResponse {
  provider: "gemini" | "claude";
  model: string;
  /** Tên nhân vật (đặt trên trang Trợ lý), hiện trên phụ đề overlay/avatar. */
  botName: string;
  hasKey: boolean;
  lessons: string[];
  maxPerMinute: number;
  session: {
    aiReplies: number;
    costUsd: number;
  };
  settings: BotLiveSettings;
  tiktok: string | null;
  tiktokState: BotTikTokState;
  /** Lý do lần kết nối gần nhất không được (thường là kênh chưa lên live). */
  tiktokError: string | null;
  kydai: string | null;
  stage: string | null;
  game: BotGameInfo | null;
}
