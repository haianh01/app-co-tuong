// Luật của từng biến thể dùng trong GameRoom. Mỗi biến thể cài đặt giao diện RoomGame.

import type { Board, Move, Side } from "@/lib/xiangqi/engine";
import { currentPosition, gameReducer, newGame, replayMoves, type GameResult, type GameState } from "@/lib/xiangqi/game";
import type { SnapshotMove, Variant } from "@/lib/online/protocol";

export type RoomGameData =
  | { variant: "xiangqi"; fen?: string; moves: Move[] }
  | { variant: "jieqi"; setup: unknown; moves: SnapshotMove[] };

export interface RoomGame {
  readonly variant: Variant;
  readonly plies: number;
  readonly turn: Side;
  readonly result: GameResult | null;
  /** Bàn cờ hiện tại (để xét còn quân chiếu bí được không). */
  readonly board: Board;
  /** Áp dụng nước đi nếu hợp lệ. */
  tryMove(move: Move): boolean;
  end(result: GameResult): void;
  /** Nước đi gửi cho client (cờ úp: kèm quân được lật). */
  snapshotMoves(): SnapshotMove[];
  /** Cờ úp: các ô còn quân úp. */
  hiddenSquares(): number[] | undefined;
  /** Thế bày ban đầu cần lưu vào DB để xem lại ván (cờ úp). */
  setup(): unknown;
  toJSON(): RoomGameData;
  restore(data: RoomGameData): void;
}

class XiangqiRoomGame implements RoomGame {
  readonly variant = "xiangqi" as const;
  private state: GameState;

  constructor(private readonly fen?: string) {
    this.state = newGame(fen);
  }

  get plies() {
    return this.state.moves.length;
  }

  get turn() {
    return currentPosition(this.state).turn;
  }

  get result() {
    return this.state.result;
  }

  get board() {
    return currentPosition(this.state).board;
  }

  tryMove(move: Move): boolean {
    const next = gameReducer(this.state, { type: "move", move });
    if (next === this.state) return false;
    this.state = next;
    return true;
  }

  end(result: GameResult) {
    this.state = gameReducer(this.state, { type: "end", result });
  }

  snapshotMoves(): SnapshotMove[] {
    return this.state.moves.map((m) => ({ from: m.move.from, to: m.move.to }));
  }

  hiddenSquares() {
    return undefined;
  }

  setup() {
    return null;
  }

  toJSON(): RoomGameData {
    return { variant: "xiangqi", fen: this.fen, moves: this.snapshotMoves() };
  }

  restore(data: RoomGameData) {
    if (data.variant !== "xiangqi") throw new Error("Sai biến thể khi khôi phục ván");
    this.state = replayMoves(data.moves, data.fen);
  }
}

type Factory = (opts: { fen?: string; setup?: unknown }) => RoomGame;

const factories: Partial<Record<Variant, Factory>> = {
  xiangqi: ({ fen }) => new XiangqiRoomGame(fen),
};

/** Đăng ký biến thể mới (cờ úp đăng ký trong jieqi-room.ts). */
export function registerVariant(variant: Variant, factory: Factory) {
  factories[variant] = factory;
}

export function createRoomGame(variant: Variant, opts: { fen?: string; setup?: unknown } = {}): RoomGame {
  const factory = factories[variant];
  if (!factory) throw new Error(`Chưa hỗ trợ biến thể ${variant}`);
  return factory(opts);
}

/** Tùy chọn để dựng lại GameRoom từ dữ liệu đã lưu. */
createRoomGame.restoreOptions = (data: RoomGameData): { variant: Variant; fen?: string; setup?: unknown } =>
  data.variant === "xiangqi" ? { variant: "xiangqi", fen: data.fen } : { variant: "jieqi", setup: data.setup };
