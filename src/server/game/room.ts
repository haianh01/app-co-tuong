// Một ván đấu online: luật, đồng hồ (có cộng giây), cầu hòa, xin thua, hủy ván, bỏ cuộc, chat nhanh, đấu lại.
// Thuần logic, thời gian truyền vào từ ngoài (`now`) để test được; không biết gì về WebSocket hay DB.

import { Move, Side, opponent } from "@/lib/xiangqi/engine";
import type { GameResult } from "@/lib/xiangqi/game";
import { timeoutResult } from "@/lib/xiangqi/game";
import type { ChatLine, GameSnapshot, GameStatus, PlayerInfo, Variant } from "@/lib/online/protocol";
import { createRoomGame, type RoomGame, type RoomGameData } from "./variants";

export interface RoomTimings {
  /** Thời hạn đi nước đầu tiên của mỗi bên; quá hạn thì hủy ván (không tính điểm). */
  firstMoveMs: number;
  /** Mất kết nối quá lâu thì xử thua. */
  abandonMs: number;
}

export const DEFAULT_TIMINGS: RoomTimings = { firstMoveMs: 30_000, abandonMs: 60_000 };

export interface RoomOptions {
  increment?: number;
  rated?: boolean;
  variant?: Variant;
  tournamentId?: string | null;
  timings?: Partial<RoomTimings>;
  /** Thế cờ xuất phát (chỉ dùng cho test). */
  fen?: string;
  /** Cờ úp: thế bày quân úp (để khôi phục ván). */
  setup?: unknown;
}

/** Dữ liệu lưu xuống DB để khôi phục ván khi máy chủ khởi động lại. */
export interface RoomData {
  v: 1;
  id: string;
  players: Record<Side, PlayerInfo>;
  minutes: number;
  increment: number;
  rated: boolean;
  tournamentId: string | null;
  game: RoomGameData;
  clocks: Record<Side, number>;
  startedAt: number;
  drawOffer: Side | null;
  chat: ChatLine[];
}

const SIDES: Side[] = ["r", "b"];
const MAX_CHAT = 40;

export class GameRoom {
  readonly game: RoomGame;
  readonly increment: number;
  readonly rated: boolean;
  readonly tournamentId: string | null;
  status: GameStatus = "playing";
  drawOffer: Side | null = null;
  ratingChange: Record<Side, number> | null = null;
  endedAt: number | null = null;
  startedAt: number;
  chat: ChatLine[] = [];
  rematch: { offeredBy: Side | null; gameId: string | null } = { offeredBy: null, gameId: null };

  /** Thời gian còn lại tính tới `turnStartedAt`; đồng hồ của bên đang đi trừ dần từ mốc đó. */
  private clocks: Record<Side, number>;
  private turnStartedAt: number;
  private connected: Record<Side, boolean> = { r: false, b: false };
  private disconnectedAt: Record<Side, number | null> = { r: null, b: null };
  private readonly timings: RoomTimings;

  constructor(
    readonly id: string,
    readonly players: Record<Side, PlayerInfo>,
    readonly minutes: number,
    now: number,
    options: RoomOptions = {},
  ) {
    this.game = createRoomGame(options.variant ?? "xiangqi", { fen: options.fen, setup: options.setup });
    this.increment = options.increment ?? 0;
    this.rated = options.rated ?? true;
    this.tournamentId = options.tournamentId ?? null;
    this.startedAt = now;
    this.turnStartedAt = now;
    this.clocks = { r: minutes * 60_000, b: minutes * 60_000 };
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
  }

  get variant(): Variant {
    return this.game.variant;
  }

  get turn(): Side {
    return this.game.turn;
  }

  get plies(): number {
    return this.game.plies;
  }

  get result(): GameResult | null {
    return this.game.result;
  }

  /** Đồng hồ chỉ chạy khi cả hai bên đã đi nước đầu (giai đoạn đầu có thời hạn riêng). */
  private get clockRunning(): boolean {
    return this.status === "playing" && this.plies >= 2;
  }

  get firstMoveDeadline(): number | null {
    return this.status === "playing" && this.plies < 2 ? this.turnStartedAt + this.timings.firstMoveMs : null;
  }

  sideOf(userId: string): Side | null {
    if (this.players.r.id === userId) return "r";
    if (this.players.b.id === userId) return "b";
    return null;
  }

  remaining(side: Side, now: number): number {
    if (this.clockRunning && side === this.turn) return Math.max(0, this.clocks[side] - (now - this.turnStartedAt));
    return this.clocks[side];
  }

  /** Các hành động trả về thông báo lỗi, hoặc `null` nếu thành công. */
  move(userId: string, move: Move, now: number): string | null {
    const side = this.sideOf(userId);
    if (!side) return "Bạn không phải người chơi trong ván này.";
    if (this.update(now) || this.status !== "playing") return "Ván đấu đã kết thúc.";
    if (side !== this.turn) return "Chưa đến lượt bạn.";
    const wasRunning = this.clockRunning;
    const remaining = this.remaining(side, now);
    if (!this.game.tryMove(move)) return "Nước đi không hợp lệ.";
    // Cộng giây sau mỗi nước khi đồng hồ đã chạy.
    this.clocks[side] = remaining + (wasRunning ? this.increment * 1000 : 0);
    this.turnStartedAt = now;
    // Chỉ nước đi của đối phương mới hủy lời cầu hòa đang chờ.
    if (this.drawOffer && this.drawOffer !== side) this.drawOffer = null;
    if (this.game.result) this.finish(now);
    return null;
  }

  resign(userId: string, now: number): string | null {
    const side = this.sideOf(userId);
    if (!side) return "Bạn không phải người chơi trong ván này.";
    if (this.update(now) || this.status !== "playing") return "Ván đấu đã kết thúc.";
    // Xin thua khi chưa đủ hai nước đầu được coi như hủy ván (không tính điểm).
    if (this.plies < 2) {
      this.abortNow(now);
      return null;
    }
    this.end({ winner: opponent(side), reason: "resign" }, now);
    return null;
  }

  abort(userId: string, now: number): string | null {
    const side = this.sideOf(userId);
    if (!side) return "Bạn không phải người chơi trong ván này.";
    if (this.update(now) || this.status !== "playing") return "Ván đấu đã kết thúc.";
    if (this.plies >= 2) return "Chỉ hủy được ván khi hai bên chưa đi đủ nước đầu.";
    this.abortNow(now);
    return null;
  }

  draw(userId: string, action: "offer" | "accept" | "decline", now: number): string | null {
    const side = this.sideOf(userId);
    if (!side) return "Bạn không phải người chơi trong ván này.";
    if (this.update(now) || this.status !== "playing") return "Ván đấu đã kết thúc.";
    const theirOffer = this.drawOffer === opponent(side);
    if (action === "offer") {
      if (theirOffer) {
        this.end({ winner: null, reason: "agreement" }, now);
        return null;
      }
      if (this.plies < 2) return "Chưa thể cầu hòa khi ván vừa bắt đầu.";
      this.drawOffer = side;
      return null;
    }
    if (!theirOffer) return "Không có lời cầu hòa nào để trả lời.";
    if (action === "accept") this.end({ winner: null, reason: "agreement" }, now);
    else this.drawOffer = null;
    return null;
  }

  say(userId: string, phrase: number, now: number): string | null {
    const side = this.sideOf(userId);
    if (!side) return "Chỉ người chơi mới gửi được tin nhắn.";
    this.chat.push({ side, phrase, at: now });
    if (this.chat.length > MAX_CHAT) this.chat.splice(0, this.chat.length - MAX_CHAT);
    return null;
  }

  /**
   * Đấu lại sau khi ván kết thúc. Trả về `"start"` khi cả hai đã đồng ý (server tạo ván mới),
   * một thông báo lỗi, hoặc `null` khi chỉ cập nhật lời mời.
   */
  rematchAction(userId: string, action: "offer" | "accept" | "decline"): "start" | string | null {
    const side = this.sideOf(userId);
    if (!side) return "Bạn không phải người chơi trong ván này.";
    if (this.status === "playing") return "Ván đấu chưa kết thúc.";
    if (this.tournamentId) return "Ván trong giải đấu không đấu lại được.";
    if (this.rematch.gameId) return null;
    const theirs = this.rematch.offeredBy === opponent(side);
    if (action === "decline") {
      if (theirs) this.rematch.offeredBy = null;
      return null;
    }
    if (theirs) return "start";
    if (action === "accept") return "Không có lời mời đấu lại nào.";
    this.rematch.offeredBy = side;
    return null;
  }

  isConnected(side: Side): boolean {
    return this.connected[side];
  }

  setConnected(side: Side, connected: boolean, now: number) {
    this.connected[side] = connected;
    this.disconnectedAt[side] = connected ? null : (this.disconnectedAt[side] ?? now);
  }

  /** Xử lý các sự kiện theo thời gian. Trả `true` nếu ván vừa kết thúc hoặc bị hủy. */
  update(now: number): boolean {
    if (this.status !== "playing") return false;
    if (this.plies < 2 && now - this.turnStartedAt >= this.timings.firstMoveMs) {
      this.abortNow(now);
      return true;
    }
    const side = this.turn;
    if (this.remaining(side, now) <= 0) {
      this.end(timeoutResult(this.game.board, side), now);
      return true;
    }
    if (this.plies >= 2) {
      // Cả hai cùng rời quá lâu: ai rời trước thì thua.
      const gone = SIDES.filter((s) => {
        const since = this.disconnectedAt[s];
        return since !== null && now - since >= this.timings.abandonMs;
      }).sort((a, b) => this.disconnectedAt[a]! - this.disconnectedAt[b]!);
      if (gone.length) {
        this.end({ winner: opponent(gone[0]), reason: "abandon" }, now);
        return true;
      }
    }
    return false;
  }

  snapshot(now: number): GameSnapshot {
    return {
      id: this.id,
      variant: this.variant,
      minutes: this.minutes,
      increment: this.increment,
      rated: this.rated,
      tournamentId: this.tournamentId,
      players: this.players,
      moves: this.game.snapshotMoves(),
      hidden: this.game.hiddenSquares(),
      clocks: { r: this.remaining("r", now), b: this.remaining("b", now) },
      turn: this.turn,
      status: this.status,
      result: this.result,
      drawOffer: this.drawOffer,
      ratingChange: this.ratingChange,
      connected: { ...this.connected },
      firstMoveDeadline: this.firstMoveDeadline,
      chat: this.chat,
      rematch: { ...this.rematch },
      serverNow: now,
    };
  }

  toJSON(now: number): RoomData {
    return {
      v: 1,
      id: this.id,
      players: this.players,
      minutes: this.minutes,
      increment: this.increment,
      rated: this.rated,
      tournamentId: this.tournamentId,
      game: this.game.toJSON(),
      clocks: { r: this.remaining("r", now), b: this.remaining("b", now) },
      startedAt: this.startedAt,
      drawOffer: this.drawOffer,
      chat: this.chat,
    };
  }

  /** Khôi phục ván đang chơi; đồng hồ được tính tiếp từ `now` (thời gian máy chủ ngừng không bị trừ). */
  static fromJSON(data: RoomData, now: number, timings?: Partial<RoomTimings>): GameRoom {
    const room = new GameRoom(data.id, data.players, data.minutes, now, {
      increment: data.increment,
      rated: data.rated,
      tournamentId: data.tournamentId,
      timings,
      ...createRoomGame.restoreOptions(data.game),
    });
    room.game.restore(data.game);
    room.clocks = { ...data.clocks };
    room.startedAt = data.startedAt;
    room.drawOffer = data.drawOffer;
    room.chat = data.chat ?? [];
    return room;
  }

  private abortNow(now: number) {
    this.status = "aborted";
    this.endedAt = now;
    this.drawOffer = null;
  }

  private end(result: GameResult, now: number) {
    this.game.end(result);
    this.finish(now);
  }

  private finish(now: number) {
    const s = this.turn;
    this.clocks[s] = this.remaining(s, now);
    this.turnStartedAt = now;
    this.status = "ended";
    this.endedAt = now;
    this.drawOffer = null;
  }
}
