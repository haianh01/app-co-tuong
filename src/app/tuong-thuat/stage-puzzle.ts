import type { BoardArrow, BoardHighlight } from "@/components/board/XiangqiBoard";
import { applyMove, type Board, type Move, parseFen } from "@/lib/xiangqi/engine";
import { toughestReply, winningMoves } from "@/lib/xiangqi/mate";
import { moveNotation } from "@/lib/xiangqi/notation";
import type { Puzzle } from "@/lib/xiangqi/puzzles";

export type StagePuzzlePhase = "intro" | "thinking" | "hint" | "reveal" | "solved";

export interface StagePuzzleState {
  puzzleId: string;
  title: string;
  chapter: string;
  goal: string;
  source?: string;
  depth: number;
  phase: StagePuzzlePhase;
  board: Board;
  lastMove: Move | null;
  arrows: BoardArrow[];
  highlights: (number | BoardHighlight)[];
  /** Số nửa nước đáp án đã lật / tổng số nửa nước. */
  revealPly: number;
  totalPlies: number;
  /** Ký hiệu các nước ĐÃ lật. Tuyệt đối không gửi trước cả lời giải. */
  revealed: string[];
  /** Lời kể nước vừa lật. */
  caption?: string | null;
  /** Chỉ có khi phase === "hint". */
  hintText?: string | null;
  /** Đếm ngược cho khán giả: sân khấu tự tính phần còn lại từ startedAt. */
  countdown?: { startedAt: number; durationMs: number } | null;
  /** Thứ tự của thế trong kho (1-based) và tổng số thế, hiện "Thế #12 / 105". */
  number?: number;
  total?: number;
  /** Bàn cờ người dẫn đang giải trên trang Cờ thế, phản chiếu lên sân khấu (chỉ khi thế đang chiếu là thế đang giải). */
  live?: StagePuzzleLive | null;
  /** Thành tích buổi live. */
  session?: StagePuzzleSession | null;
}

/** Trạng thái bàn giải của trang Cờ thế: người dẫn chọn quân, đi thử, sai, Đen đỡ, giải xong. */
export interface StagePuzzleLive {
  puzzleId: string;
  board: Board;
  /** Mã định danh từng quân cờ để vẽ hiệu ứng trượt quân (animate slide) mượt mà như bàn cờ thật. */
  ids?: (number | null)[];
  selected: number | null;
  targets: number[];
  lastMove: Move | null;
  checkSquare: number | null;
  status: "play" | "reply" | "wrong" | "solved";
  /** Số lần thử đã hỏng (lần đang đi chưa tính). */
  tries: number;
  /** Ký hiệu các nước của lượt thử đang đi (Đỏ, Đen, Đỏ…). */
  moves: string[];
  /** Ô quân gợi ý khi người dẫn đã mở gợi ý trên trang Cờ thế. */
  hintSquare: number | null;
  /** Các mũi tên người dẫn vẽ trên bàn cờ thế (ví dụ phân tích đòn phối hợp). */
  arrows?: BoardArrow[];
  /** Các ô người dẫn khoanh tròn để chỉ điểm. */
  highlights?: (number | BoardHighlight)[];
}

export interface StagePuzzleSession {
  /** Số thế đã đưa lên sân khấu trong buổi live. */
  shown: number;
  /** Số thế người dẫn tự giải được trên bàn. */
  solved: number;
}

export interface BuildPuzzleStageOptions {
  caption?: string | null;
  countdown?: { startedAt: number; durationMs: number } | null;
  /** Biến lời giải đã dựng sẵn bằng `puzzleSolutionLine` (bỏ qua thì tự dựng, tốn một lần tìm nước sát). */
  line?: Move[];
}

/**
 * Số giây đếm ngược còn lại (làm tròn lên). Thời gian trôi không âm: lúc vừa bắt đầu, `now` của sân khấu có thể còn là
 * mốc cũ (đồng hồ chỉ chạy khi có gì cần đếm) nên không được hiện lố quá `durationMs`.
 */
export function countdownSecondsLeft(countdown: { startedAt: number; durationMs: number }, now: number): number {
  const elapsed = Math.max(0, now - countdown.startedAt);
  return Math.ceil(Math.max(0, countdown.durationMs - elapsed) / 1000);
}

/**
 * Dựng toàn bộ chuỗi nước đi lời giải cho một thế cờ:
 * - Có sẵn `puzzle.line` (thế dài đã kiểm chứng Pikafish) thì dùng luôn.
 * - Thế ngắn 1-2 nước: nước đầu là `puzzle.solution`, Đen đỡ bằng `toughestReply`,
 *   Đỏ đánh tiếp bằng nước thắng đầu tiên từ `winningMoves`.
 */
export function puzzleSolutionLine(puzzle: Puzzle): Move[] {
  if (puzzle.line && puzzle.line.length > 0) {
    return puzzle.line;
  }
  let pos = parseFen(puzzle.fen);
  const line: Move[] = [puzzle.solution];
  pos = applyMove(pos, puzzle.solution);
  for (let left = puzzle.depth - 1; left > 0; left--) {
    const reply = toughestReply(pos, left);
    if (!reply) break;
    pos = applyMove(pos, reply);
    const winning = winningMoves(pos, left, true);
    if (winning.length === 0) break;
    const next = winning[0];
    line.push(reply, next);
    pos = applyMove(pos, next);
  }
  return line;
}

/**
 * Dựng trạng thái sân khấu cờ thế theo phase và số nước đã lật.
 * TUYỆT ĐỐI KHÔNG LỘ ĐÁP ÁN:
 * - Trước phase reveal (intro, thinking, hint): revealPly = 0, revealed = [], arrows không chứa nước giải.
 * - Phase hint: chỉ làm nổi bật quân gợi ý (ô puzzle.solution.from), không vẽ mũi tên.
 * - Phase reveal / solved: chỉ gửi đúng `revealPly` nửa nước đã lật và mũi tên của nước vừa lật.
 */
export function buildPuzzleStage(
  puzzle: Puzzle,
  phase: StagePuzzlePhase,
  revealPly = 0,
  opts?: BuildPuzzleStageOptions,
): StagePuzzleState {
  const fullLine = opts?.line ?? puzzleSolutionLine(puzzle);
  const totalPlies = fullLine.length;

  const initialPos = parseFen(puzzle.fen);

  if (phase === "intro" || phase === "thinking" || phase === "hint") {
    return {
      puzzleId: puzzle.id,
      title: puzzle.title,
      chapter: puzzle.chapter,
      goal: puzzle.goal,
      source: puzzle.source,
      depth: puzzle.depth,
      phase,
      board: initialPos.board,
      lastMove: null,
      arrows: [],
      highlights: phase === "hint" ? [puzzle.solution.from] : [],
      revealPly: 0,
      totalPlies,
      revealed: [],
      caption: null,
      hintText: phase === "hint" ? puzzle.hint : null,
      countdown: phase === "thinking" ? (opts?.countdown ?? null) : null,
    };
  }

  // Phase reveal hoặc solved
  const clampedPly = phase === "solved" ? totalPlies : Math.max(0, Math.min(revealPly, totalPlies));
  let curPos = initialPos;
  const revealed: string[] = [];
  let lastMove: Move | null = null;

  for (let i = 0; i < clampedPly; i++) {
    const m = fullLine[i];
    revealed.push(moveNotation(curPos.board, m));
    curPos = applyMove(curPos, m);
    lastMove = m;
  }

  const arrows: BoardArrow[] = lastMove
    ? [
        {
          from: lastMove.from,
          to: lastMove.to,
          kind: "played",
          color: "#ef4444",
        },
      ]
    : [];

  const highlights: (number | BoardHighlight)[] = lastMove ? [lastMove.from, lastMove.to] : [];

  return {
    puzzleId: puzzle.id,
    title: puzzle.title,
    chapter: puzzle.chapter,
    goal: puzzle.goal,
    source: puzzle.source,
    depth: puzzle.depth,
    phase,
    board: curPos.board,
    lastMove,
    arrows,
    highlights,
    revealPly: clampedPly,
    totalPlies,
    revealed,
    caption: opts?.caption ?? null,
    hintText: null,
    countdown: null,
  };
}
