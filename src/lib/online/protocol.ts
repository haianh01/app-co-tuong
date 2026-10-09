// Giao thức WebSocket giữa trình duyệt và server game. File này dùng chung cho cả hai phía.

import type { Side } from "@/lib/xiangqi/engine";
import type { GameResult } from "@/lib/xiangqi/game";

export const WS_PATH = "/ws";

/** Thể thức đấu xếp hạng (phút mỗi bên, không cộng giờ). */
export const TIME_CONTROLS = [5, 10, 20] as const;
export type TimeControl = (typeof TIME_CONTROLS)[number];

export interface PlayerInfo {
  id: string;
  username: string;
  displayName: string;
  rating: number;
}

export type GameStatus = "playing" | "ended" | "aborted";

export interface GameSnapshot {
  id: string;
  minutes: number;
  players: Record<Side, PlayerInfo>;
  moves: { from: number; to: number }[];
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
  serverNow: number;
}

export interface LobbyStats {
  online: number;
  playing: number;
}

export type ClientMessage =
  | { t: "queue"; minutes: TimeControl }
  | { t: "cancelQueue" }
  | { t: "watch"; gameId: string }
  | { t: "unwatch"; gameId: string }
  | { t: "move"; gameId: string; from: number; to: number; ply: number }
  | { t: "resign"; gameId: string }
  | { t: "abort"; gameId: string }
  | { t: "draw"; gameId: string; action: "offer" | "accept" | "decline" };

export type ServerMessage =
  | { t: "hello"; user: PlayerInfo | null; activeGameId: string | null; stats: LobbyStats }
  | { t: "queue"; minutes: TimeControl | null; since: number | null }
  | { t: "matched"; gameId: string }
  | { t: "game"; game: GameSnapshot }
  | { t: "notFound"; gameId: string }
  | { t: "stats"; stats: LobbyStats }
  | { t: "error"; message: string };

const isId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9]{6,12}$/.test(v);
const isSquare = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 90;

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
      return TIME_CONTROLS.includes(m.minutes as TimeControl) ? { t: "queue", minutes: m.minutes as TimeControl } : null;
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
      return isId(m.gameId) && (m.action === "offer" || m.action === "accept" || m.action === "decline")
        ? { t: "draw", gameId: m.gameId, action: m.action }
        : null;
    default:
      return null;
  }
}
