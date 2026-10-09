// Một ván đấu online: luật, đồng hồ, cầu hòa, xin thua, hủy ván, bỏ cuộc.
// Thuần logic, thời gian truyền vào từ ngoài (`now`) để test được; không biết gì về WebSocket hay DB.

import { Move, Side, opponent } from "@/lib/xiangqi/engine";
import { GameResult, GameState, currentPosition, gameReducer, newGame } from "@/lib/xiangqi/game";
import type { GameSnapshot, GameStatus, PlayerInfo } from "@/lib/online/protocol";

export interface RoomTimings {
  /** Thời hạn đi nước đầu tiên của mỗi bên; quá hạn thì hủy ván (không tính điểm). */
  firstMoveMs: number;
  /** Mất kết nối quá lâu thì xử thua. */
  abandonMs: number;
}

export const DEFAULT_TIMINGS: RoomTimings = { firstMoveMs: 30_000, abandonMs: 60_000 };

const SIDES: Side[] = ["r", "b"];

export class GameRoom {
  state: GameState;
  status: GameStatus = "playing";
  drawOffer: Side | null = null;
  ratingChange: Record<Side, number> | null = null;
  endedAt: number | null = null;
  readonly startedAt: number;

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
    options: { timings?: Partial<RoomTimings>; fen?: string } = {},
  ) {
    this.state = newGame(options.fen);
    this.startedAt = now;
    this.turnStartedAt = now;
    this.clocks = { r: minutes * 60_000, b: minutes * 60_000 };
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
  }

  get turn(): Side {
    return currentPosition(this.state).turn;
  }

  get plies(): number {
    return this.state.moves.length;
  }

  get result(): GameResult | null {
    return this.state.result;
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
    const next = gameReducer(this.state, { type: "move", move });
    if (next === this.state) return "Nước đi không hợp lệ.";
    this.clocks[side] = this.remaining(side, now);
    this.turnStartedAt = now;
    this.state = next;
    this.drawOffer = null;
    if (next.result) this.finish(now);
    return null;
  }

  resign(userId: string, now: number): string | null {
    const side = this.sideOf(userId);
    if (!side) return "Bạn không phải người chơi trong ván này.";
    if (this.update(now) || this.status !== "playing") return "Ván đấu đã kết thúc.";
    // Xin thua khi chưa đủ hai nước đầu được coi như hủy ván (không tính điểm).
    if (this.plies < 2) {
      this.status = "aborted";
      this.endedAt = now;
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
    this.status = "aborted";
    this.endedAt = now;
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
      this.status = "aborted";
      this.endedAt = now;
      return true;
    }
    const side = this.turn;
    if (this.remaining(side, now) <= 0) {
      this.end({ winner: opponent(side), reason: "timeout" }, now);
      return true;
    }
    if (this.plies >= 2) {
      for (const s of SIDES) {
        const since = this.disconnectedAt[s];
        if (since !== null && now - since >= this.timings.abandonMs) {
          this.end({ winner: opponent(s), reason: "abandon" }, now);
          return true;
        }
      }
    }
    return false;
  }

  snapshot(now: number): GameSnapshot {
    return {
      id: this.id,
      minutes: this.minutes,
      players: this.players,
      moves: this.state.moves.map((m) => ({ from: m.move.from, to: m.move.to })),
      clocks: { r: this.remaining("r", now), b: this.remaining("b", now) },
      turn: this.turn,
      status: this.status,
      result: this.result,
      drawOffer: this.drawOffer,
      ratingChange: this.ratingChange,
      connected: { ...this.connected },
      firstMoveDeadline: this.firstMoveDeadline,
      serverNow: now,
    };
  }

  private end(result: GameResult, now: number) {
    this.state = gameReducer(this.state, { type: "end", result });
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
