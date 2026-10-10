// Giao thức WebSocket giữa trình duyệt và server game. File này dùng chung cho cả hai phía.

import type { Side } from "@/lib/xiangqi/engine";
import type { GameResult } from "@/lib/xiangqi/game";

export const WS_PATH = "/ws";

/** "xiangqi" = cờ tướng, "jieqi" = cờ úp. */
export type Variant = "xiangqi" | "jieqi";
export const VARIANTS: { id: Variant; name: string }[] = [
  { id: "xiangqi", name: "Cờ tướng" },
  { id: "jieqi", name: "Cờ úp" },
];

export interface TimeControl {
  id: string;
  minutes: number;
  /** Giây cộng thêm sau mỗi nước. */
  increment: number;
  name: string;
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: "3+2", minutes: 3, increment: 2, name: "Chớp" },
  { id: "5+3", minutes: 5, increment: 3, name: "Nhanh" },
  { id: "10+0", minutes: 10, increment: 0, name: "Tiêu chuẩn" },
  { id: "10+5", minutes: 10, increment: 5, name: "Tiêu chuẩn" },
  { id: "20+0", minutes: 20, increment: 0, name: "Cổ điển" },
];

export const findTimeControl = (id: string) => TIME_CONTROLS.find((t) => t.id === id) ?? null;
export const tcLabel = (minutes: number, increment: number) => `${minutes}+${increment}`;

/** Chat nhanh: chỉ gửi được các câu soạn sẵn (không cần kiểm duyệt nội dung). */
export const QUICK_CHAT = [
  "Chào bạn!",
  "Chúc ván cờ vui!",
  "Nước hay!",
  "Cảm ơn!",
  "Xin lỗi, mạng hơi chậm",
  "Nhanh lên nào",
  "Ván đấu hay quá!",
  "Hẹn gặp lại!",
] as const;

export interface PlayerInfo {
  id: string;
  username: string;
  displayName: string;
  rating: number;
  isGuest: boolean;
  avatar: string;
  frame: string;
}

export interface ChatLine {
  side: Side;
  phrase: number;
  at: number;
}

export type GameStatus = "playing" | "ended" | "aborted";

export interface SnapshotMove {
  from: number;
  to: number;
  /** Cờ úp: quân thật được lật ra ở nước này. */
  reveal?: string;
}

export interface GameSnapshot {
  id: string;
  variant: Variant;
  minutes: number;
  increment: number;
  rated: boolean;
  tournamentId: string | null;
  players: Record<Side, PlayerInfo>;
  moves: SnapshotMove[];
  /** Cờ úp: các quân úp còn lại trên bàn (ô → phe), không lộ quân thật. */
  hidden?: number[];
  /** Thời gian còn lại (ms) của mỗi bên, tính tại thời điểm `serverNow`. */
  clocks: Record<Side, number>;
  turn: Side;
  status: GameStatus;
  result: GameResult | null;
  drawOffer: Side | null;
  ratingChange: Record<Side, number> | null;
  connected: Record<Side, boolean>;
  /** Hạn chót để đi nước đầu tiên (ms epoch); quá hạn ván bị hủy. `null` khi đã qua giai đoạn này. */
  firstMoveDeadline: number | null;
  chat: ChatLine[];
  rematch: { offeredBy: Side | null; gameId: string | null };
  serverNow: number;
}

export interface LiveGameSummary {
  id: string;
  variant: Variant;
  minutes: number;
  increment: number;
  rated: boolean;
  red: { displayName: string; rating: number };
  black: { displayName: string; rating: number };
  plies: number;
}

export interface LobbyStats {
  online: number;
  playing: number;
  games: LiveGameSummary[];
}

export interface QueueKey {
  variant: Variant;
  tc: string;
  rated: boolean;
}

export type ClientMessage =
  | ({ t: "queue" } & QueueKey)
  | { t: "cancelQueue" }
  | { t: "watch"; gameId: string }
  | { t: "unwatch"; gameId: string }
  | { t: "move"; gameId: string; from: number; to: number; ply: number }
  | { t: "resign"; gameId: string }
  | { t: "abort"; gameId: string }
  | { t: "draw"; gameId: string; action: "offer" | "accept" | "decline" }
  | { t: "chat"; gameId: string; phrase: number }
  | { t: "rematch"; gameId: string; action: "offer" | "accept" | "decline" };

export type ServerMessage =
  | { t: "hello"; user: PlayerInfo | null; activeGameId: string | null; stats: LobbyStats }
  | { t: "queue"; key: QueueKey | null; since: number | null }
  | { t: "matched"; gameId: string }
  | { t: "game"; game: GameSnapshot }
  | { t: "notFound"; gameId: string }
  | { t: "stats"; stats: LobbyStats }
  | { t: "error"; message: string };

const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9]{6,12}$/.test(v);
const isSquare = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 90;
const isVariant = (v: unknown): v is Variant => v === "xiangqi" || v === "jieqi";
const isOfferAction = (v: unknown): v is "offer" | "accept" | "decline" => v === "offer" || v === "accept" || v === "decline";

/** Kiểm tra tin nhắn từ client; trả `null` nếu sai định dạng. Không bao giờ tin dữ liệu từ client. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    m = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  switch (m.t) {
    case "queue":
      return typeof m.tc === "string" && findTimeControl(m.tc) && typeof m.rated === "boolean" && isVariant(m.variant)
        ? { t: "queue", tc: m.tc, rated: m.rated, variant: m.variant }
        : null;
    case "cancelQueue":
      return { t: "cancelQueue" };
    case "watch":
    case "unwatch":
    case "resign":
    case "abort":
      return isId(m.gameId) ? { t: m.t, gameId: m.gameId } : null;
    case "move":
      return isId(m.gameId) && isSquare(m.from) && isSquare(m.to) && Number.isInteger(m.ply) && (m.ply as number) >= 0
        ? { t: "move", gameId: m.gameId, from: m.from, to: m.to, ply: m.ply as number }
        : null;
    case "draw":
    case "rematch":
      return isId(m.gameId) && isOfferAction(m.action) ? { t: m.t, gameId: m.gameId, action: m.action } : null;
    case "chat":
      return isId(m.gameId) && Number.isInteger(m.phrase) && (m.phrase as number) >= 0 && (m.phrase as number) < QUICK_CHAT.length
        ? { t: "chat", gameId: m.gameId, phrase: m.phrase as number }
        : null;
    default:
      return null;
  }
}
