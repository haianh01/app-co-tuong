// Cờ úp trên máy chủ: giữ bố cục bí mật, chỉ lộ quân khi được lật (người chơi không đọc trộm được qua mạng).

import type { Move } from "@/lib/xiangqi/engine";
import type { GameResult } from "@/lib/xiangqi/game";
import {
  isHidden, jieqiEnd, jieqiPlay, layoutEntries, layoutFrom, newJieqi, randomLayout, replayJieqi,
  type JieqiState,
} from "@/lib/xiangqi/jieqi";
import type { SnapshotMove } from "@/lib/online/protocol";
import { registerVariant, type RoomGame, type RoomGameData } from "./variants";

export class JieqiRoomGame implements RoomGame {
  readonly variant = "jieqi" as const;
  private state: JieqiState = newJieqi();
  private readonly layout: Record<number, string>;

  constructor(setup?: unknown) {
    this.layout = layoutFrom(setup) ?? randomLayout();
  }

  get plies() {
    return this.state.moves.length;
  }

  get turn() {
    return this.state.position.turn;
  }

  get result() {
    return this.state.result;
  }

  get board() {
    return this.state.position.board;
  }

  tryMove(move: Move): boolean {
    const hidden = isHidden(this.state.position.board[move.from]);
    const next = jieqiPlay(this.state, { ...move, reveal: hidden ? this.layout[move.from] : undefined });
    if (next === this.state) return false;
    this.state = next;
    return true;
  }

  end(result: GameResult) {
    this.state = jieqiEnd(this.state, result);
  }

  snapshotMoves(): SnapshotMove[] {
    return this.state.moves.map((m) => (m.reveal ? { from: m.from, to: m.to, reveal: m.reveal } : { from: m.from, to: m.to }));
  }

  hiddenSquares() {
    const out: number[] = [];
    this.state.position.board.forEach((p, i) => isHidden(p) && out.push(i));
    return out;
  }

  /** Bố cục bí mật: chỉ lưu vào DB (để xem lại ván đã xong), không bao giờ gửi cho người chơi. */
  setup() {
    return layoutEntries(this.layout);
  }

  toJSON(): RoomGameData {
    return { variant: "jieqi", setup: this.setup(), moves: this.snapshotMoves() };
  }

  restore(data: RoomGameData) {
    if (data.variant !== "jieqi") throw new Error("Sai biến thể khi khôi phục ván");
    this.state = replayJieqi(data.moves);
  }
}

registerVariant("jieqi", ({ setup }) => new JieqiRoomGame(setup));
