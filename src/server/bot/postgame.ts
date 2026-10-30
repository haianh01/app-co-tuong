// Bình ván bằng Pikafish SAU KHI ván kết thúc (fair-play: không bao giờ chạy khi ván còn đang đánh).
// Gọi /api/engine của chính app (chế độ "analysis", dùng chung hàng đợi engine, cache và giới hạn tần suất) cho từng thế cờ, rồi chấm từng nước bằng chính reviewGame()
// của app, để lời bình khớp với trang phân tích. Kết quả là đoạn chữ cho AI đọc: nước hỏng nặng nhất, nước nên đi,
// nước hay, độ chính xác hai bên và thế cờ cuối ván.

import { CLASS_NAME, reviewGame, type MoveReview, type PositionEval } from "@/lib/xiangqi/analysis";
import {
  COLS,
  applyMove,
  colOf,
  initialPosition,
  legalMoves,
  rowOf,
  sideOf,
  toFen,
  typeOf,
  type Board,
  type Move,
  type Position,
  type Side,
} from "@/lib/xiangqi/engine";
import { replayMoves } from "@/lib/xiangqi/game";
import { moveNotation } from "@/lib/xiangqi/notation";
import { speakNotation } from "./narration";

const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 30_000;
/** Mỗi bên nêu tối đa từng này nước hỏng, cộng từng này nước hay; đủ để AI bình 2–3 câu mà đề bài không dài. */
const MAX_ERRORS = 3;
const MAX_GOOD = 2;

const BAD = new Set(["blunder", "mistake", "missedWin"]);
const GOOD = new Set(["brilliant", "only"]);

/** Dịch ký hiệu nước ("P2-5") về tọa độ: thử mọi nước hợp lệ, lấy nước có cùng ký hiệu. Không khớp thì dừng ở đó. */
export function movesFromNotations(notations: string[]): Move[] {
  const moves: Move[] = [];
  let pos: Position = initialPosition();
  for (const n of notations) {
    const m = legalMoves(pos).find((x) => moveNotation(pos.board, x) === n);
    if (!m) break;
    moves.push(m);
    pos = applyMove(pos, m);
  }
  return moves;
}

interface EngineResponse {
  move: Move | null;
  score: number;
  depth?: number;
  pvMoves?: Move[];
  wdl?: [number, number, number];
  lines?: { move: Move | null; score: number; depth?: number; pvMoves?: Move[]; wdl?: [number, number, number] }[];
}

async function evaluate(engineUrl: string, pos: Position): Promise<PositionEval | null> {
  if (legalMoves(pos).length === 0) return null; // hết nước (bị chiếu bí / hết đường): không cần engine
  const fen = toFen(pos);
  const res = await fetch(`${engineUrl}/api/engine`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fen, purpose: "analysis" }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`engine ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const r = (await res.json()) as EngineResponse;
  return {
    score: r.score,
    best: r.move,
    depth: r.depth,
    pv: r.pvMoves,
    wdl: r.wdl,
    fen,
    lines: r.lines?.map((l) => ({ best: l.move, score: l.score, depth: l.depth, pv: l.pvMoves, wdl: l.wdl })),
  };
}

/** Chạy engine cho mọi thế cờ, vài thế song song (engine của app có hàng đợi, giới hạn 600 lần / 5 phút). */
async function evaluateAll(engineUrl: string, positions: Position[]): Promise<(PositionEval | null)[]> {
  const out: (PositionEval | null)[] = new Array(positions.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < positions.length) {
      const i = next++;
      out[i] = await evaluate(engineUrl, positions[i]);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

const PIECE_TEXT: Record<string, string> = { k: "Tướng", a: "Sĩ", b: "Tượng", n: "Mã", r: "Xe", c: "Pháo", p: "Tốt" };
const ORDER = ["k", "r", "c", "n", "a", "b", "p"];

/** Thế cờ bằng chữ. Cột 1–9 đếm từ phải sang trái theo phía mỗi bên (như ký hiệu nước đi);
 *  hàng 1–10 đếm từ đáy bên mình lên ("hàng 1" là hàng đáy). */
export function describeBoard(board: Board): string {
  const sides: Record<Side, string[]> = { r: [], b: [] };
  const pieces = board
    .map((p, i) => ({ p, i }))
    .filter((x): x is { p: string; i: number } => !!x.p)
    .sort((a, b) => ORDER.indexOf(typeOf(a.p)) - ORDER.indexOf(typeOf(b.p)));
  for (const { p, i } of pieces) {
    const side = sideOf(p);
    const col = side === "r" ? COLS - colOf(i) : colOf(i) + 1;
    const row = side === "r" ? 10 - rowOf(i) : rowOf(i) + 1;
    sides[side].push(`${PIECE_TEXT[typeOf(p)]} cột ${col} hàng ${row}`);
  }
  return `Đỏ: ${sides.r.join(", ")}. Đen: ${sides.b.join(", ")}.`;
}

const pct = (x: number | null | undefined) => (x == null ? "?" : `${Math.round(x)}%`);

function describeMove(m: MoveReview, who: string): string {
  const parts = [`nước ${Math.ceil(m.ply / 2)} ${who} đi ${speakNotation(m.notation)}: ${CLASS_NAME[m.cls!]}`];
  if (m.winDrop != null) parts.push(`tụt khoảng ${Math.round(m.winDrop * 100)}% cơ hội thắng`);
  if (m.better) parts.push(`lẽ ra nên đi ${speakNotation(m.better)}`);
  if (m.line?.length) parts.push(`đối phương đáp tiếp ${m.line.map(speakNotation).join(", ")}`);
  for (const f of m.facts) {
    if (f.kind === "allowsMate") parts.push(`để đối phương chiếu bí trong ${f.moves} nước`);
    if (f.kind === "missedMate") parts.push(`bỏ lỡ chiếu bí trong ${f.moves} nước`);
  }
  return `- ${parts.join("; ")}`;
}

export interface PostGameAnalysis {
  /** Đoạn chữ đưa vào đề bài cho AI (thẻ <sau_van>). */
  text: string;
  /** Số nửa nước đã phân tích (có thể ít hơn cả ván nếu không dịch được ký hiệu). */
  plies: number;
}

/** Phân tích cả ván. `hostSide`: phe anh chủ kênh. Engine không chạy được thì ném lỗi để nơi gọi ghi log. */
export async function analyzeGame(opts: { engineUrl: string; moves: Move[]; hostSide: Side }): Promise<PostGameAnalysis> {
  const state = replayMoves(opts.moves);
  const evals = await evaluateAll(opts.engineUrl, state.history);
  const review = reviewGame(state, evals);
  const who = (s: Side) => (s === opts.hostSide ? "anh chủ kênh" : "đối thủ");
  const byDrop = (a: MoveReview, b: MoveReview) => (b.winDrop ?? b.loss / 1000) - (a.winDrop ?? a.loss / 1000);

  const lines: string[] = [
    `Pikafish đã phân tích ${opts.moves.length} nửa nước. Độ chính xác: anh chủ kênh ${pct(review.accuracy[opts.hostSide])}, đối thủ ${pct(review.accuracy[opts.hostSide === "r" ? "b" : "r"])}.`,
  ];
  for (const side of [opts.hostSide, opts.hostSide === "r" ? "b" : "r"] as Side[]) {
    const errors = review.moves
      .filter((m) => m.side === side && m.cls && BAD.has(m.cls))
      .sort(byDrop)
      .slice(0, MAX_ERRORS)
      .sort((a, b) => a.ply - b.ply);
    lines.push(
      errors.length
        ? `Nước hỏng của ${who(side)} (theo thứ tự ván):\n${errors.map((m) => describeMove(m, who(side))).join("\n")}`
        : `${who(side)[0].toUpperCase()}${who(side).slice(1)} không có nước hớ hay nước kém nào.`,
    );
  }
  const good = review.moves
    .filter((m) => m.cls && GOOD.has(m.cls))
    .slice(0, MAX_GOOD)
    .map((m) => `- nước ${Math.ceil(m.ply / 2)} ${who(m.side)} đi ${speakNotation(m.notation)}: ${CLASS_NAME[m.cls!]}`);
  if (good.length) lines.push(`Nước đáng khen:\n${good.join("\n")}`);
  lines.push(`Thế cờ cuối ván: ${describeBoard(state.history.at(-1)!.board)}`);
  return { text: lines.join("\n"), plies: opts.moves.length };
}
