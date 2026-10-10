// Trạng thái một ván đấu (thuần, không phụ thuộc React): lịch sử, biên bản, kết quả.
// Dùng chung cho chơi với máy (client) và đấu online (server kiểm tra nước đi).

import {
  Board, Move, Piece, Position, Side,
  START_FEN, applyMove, chasedPieces, hasMatingMaterial, inCheck, insufficientMaterial, isLegal, opponent, outcome,
  parseFen, toFen,
} from "./engine";
import { moveNotation } from "./notation";

export interface PlayedMove {
  move: Move;
  notation: string;
  side: Side;
  piece: Piece;
  captured: Piece | null;
  /** Nước này có chiếu tướng đối phương không (dùng cho luật cấm chiếu mãi). */
  check: boolean;
  /** Nước này có đuổi bắt quân đối phương không (dùng cho luật cấm đuổi bắt mãi). */
  chase: boolean;
}

export type EndReason =
  | "checkmate" | "stalemate" | "resign" | "timeout" | "timeoutDraw" | "abandon"
  | "repetition" | "perpetualCheck" | "perpetualChase" | "material" | "moveLimit" | "agreement";

export interface GameResult {
  winner: Side | null;
  reason: EndReason;
}

export interface GameState {
  history: Position[];
  moves: PlayedMove[];
  result: GameResult | null;
}

export type GameAction =
  | { type: "move"; move: Move }
  | { type: "undo"; plies: number }
  | { type: "end"; result: GameResult };

/** Số nửa nước liên tiếp không ăn quân thì xử hòa (đơn giản hóa luật 60 nước). */
export const NO_CAPTURE_LIMIT = 120;

export function newGame(fen?: string): GameState {
  return { history: [parseFen(fen ?? START_FEN)], moves: [], result: null };
}

export const currentPosition = (s: GameState) => s.history[s.history.length - 1];

/**
 * Thế cờ lặp lại lần thứ 3 (xét cả chu kỳ lặp):
 * 1. Đúng một bên nước nào cũng chiếu tướng → bên đó thua (cấm "trường chiếu").
 * 2. Không ai chiếu mãi; đúng một bên nước nào cũng chiếu hoặc đuổi bắt (có ít nhất một nước đuổi)
 *    → bên đó thua (cấm "trường sát", đơn giản hóa: xem chasedPieces).
 * 3. Còn lại xử hòa.
 */
function repetitionResult(history: Position[], moves: PlayedMove[]): GameResult | null {
  const keys = history.map(toFen);
  const key = keys[keys.length - 1];
  const first = keys.indexOf(key);
  let count = 0;
  for (const k of keys) if (k === key) count++;
  if (count < 3) return null;

  const cycle = moves.slice(first);
  const own = (s: Side) => cycle.filter((m) => m.side === s);
  const alwaysChecks = (s: Side) => own(s).length > 0 && own(s).every((m) => m.check);
  const alwaysChases = (s: Side) =>
    own(s).length > 0 && own(s).every((m) => m.check || m.chase) && own(s).some((m) => m.chase);

  const checks = { r: alwaysChecks("r"), b: alwaysChecks("b") };
  if (checks.r !== checks.b) return { winner: checks.r ? "b" : "r", reason: "perpetualCheck" };
  if (!checks.r) {
    const chases = { r: alwaysChases("r"), b: alwaysChases("b") };
    if (chases.r !== chases.b) return { winner: chases.r ? "b" : "r", reason: "perpetualChase" };
  }
  return { winner: null, reason: "repetition" };
}

/** Kết quả khi phe `flagged` hết giờ: đối phương thắng, trừ khi đối phương không còn quân để chiếu bí thì hòa. */
export function timeoutResult(board: Board, flagged: Side): GameResult {
  const other = opponent(flagged);
  return hasMatingMaterial(board, other) ? { winner: other, reason: "timeout" } : { winner: null, reason: "timeoutDraw" };
}

/**
 * Mã cố định cho từng quân (theo ô xuất phát) sau `ply` nửa nước: cùng một quân giữ nguyên mã khi di chuyển,
 * để giao diện vẽ hiệu ứng quân trượt thay vì biến mất rồi hiện ra.
 */
export function pieceIds(state: GameState, ply = state.moves.length): (number | null)[] {
  const ids = state.history[0].board.map((p, i) => (p ? i : null));
  for (const m of state.moves.slice(0, ply)) {
    ids[m.move.to] = ids[m.move.from];
    ids[m.move.from] = null;
  }
  return ids;
}

function drawCheck(history: Position[], moves: PlayedMove[]): GameResult | null {
  const last = history[history.length - 1];
  const repeated = repetitionResult(history, moves);
  if (repeated) return repeated;
  if (insufficientMaterial(last.board)) return { winner: null, reason: "material" };
  const tail = moves.slice(-NO_CAPTURE_LIMIT);
  if (tail.length === NO_CAPTURE_LIMIT && tail.every((m) => !m.captured)) return { winner: null, reason: "moveLimit" };
  return null;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "move": {
      if (state.result) return state;
      const pos = currentPosition(state);
      if (!isLegal(pos, action.move)) return state;
      const next = applyMove(pos, action.move);
      const played: PlayedMove = {
        move: action.move,
        notation: moveNotation(pos.board, action.move),
        side: pos.turn,
        piece: pos.board[action.move.from]!,
        captured: pos.board[action.move.to],
        check: inCheck(next.board, next.turn),
        chase: chasedPieces(pos.board, next.board, pos.turn).length > 0,
      };
      const history = [...state.history, next];
      const moves = [...state.moves, played];
      const o = outcome(next);
      const result: GameResult | null = o.over
        ? { winner: o.winner, reason: o.reason === "checkmate" ? "checkmate" : "stalemate" }
        : drawCheck(history, moves);
      return { history, moves, result };
    }
    case "undo": {
      const plies = Math.min(action.plies, state.moves.length);
      if (plies <= 0) return state;
      return {
        history: state.history.slice(0, state.history.length - plies),
        moves: state.moves.slice(0, state.moves.length - plies),
        result: null,
      };
    }
    case "end":
      return state.result ? state : { ...state, result: action.result };
  }
}

/** Dựng lại trạng thái ván từ danh sách nước đi (dùng khi nhận dữ liệu từ server hoặc xem lại ván). */
export function replayMoves(moves: Move[], fen?: string): GameState {
  let state = newGame(fen);
  for (const move of moves) {
    const next = gameReducer(state, { type: "move", move });
    if (next === state) break;
    state = next;
  }
  return state;
}

export const REASON_TEXT: Record<EndReason, string> = {
  checkmate: "Chiếu bí",
  stalemate: "Hết nước đi",
  resign: "Xin thua",
  timeout: "Hết giờ",
  timeoutDraw: "Hết giờ nhưng đối phương không đủ quân để chiếu bí",
  abandon: "Bỏ cuộc (mất kết nối quá lâu)",
  repetition: "Lặp lại thế cờ 3 lần",
  perpetualCheck: "Chiếu mãi (phạm luật trường chiếu)",
  perpetualChase: "Đuổi bắt mãi (phạm luật trường sát)",
  material: "Không đủ quân để chiếu bí",
  moveLimit: `${NO_CAPTURE_LIMIT / 2} nước không ăn quân`,
  agreement: "Hai bên đồng ý hòa",
};

/** `viewer = null` cho người xem: tiêu đề nêu bên thắng thay vì "Bạn thắng/thua". */
export function describeResult(result: GameResult, viewer: Side | null): { title: string; detail: string; seal: string } {
  if (!result.winner) return { title: "Hòa cờ", detail: REASON_TEXT[result.reason], seal: "和" };
  const loserName = result.winner === "r" ? "Đen" : "Đỏ";
  const detail = `${REASON_TEXT[result.reason]} · ${loserName} thua`;
  if (viewer === null) {
    return { title: result.winner === "r" ? "Đỏ thắng" : "Đen thắng", detail, seal: "勝" };
  }
  const won = result.winner === viewer;
  return { title: won ? "Bạn thắng!" : "Bạn thua", detail, seal: won ? "勝" : "負" };
}
