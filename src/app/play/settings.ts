import type { AiLevel } from "@/lib/xiangqi/ai";
import { findKing, legalMoves, parseFen, type Side } from "@/lib/xiangqi/engine";

export interface PlaySettings {
  level: AiLevel;
  side: Side;
  /** Phút mỗi bên; 0 = không giới hạn. */
  minutes: number;
  /** Thế bắt đầu (FEN) khi luyện từ bài giảng; không có = thế khai cuộc. */
  fen?: string;
  /** Bài giảng Triệu Hâm Hâm của thế cờ, `book` cho biết bộ bài (khai cuộc, trung cuộc hay tàn cuộc, đánh số riêng). */
  lesson?: number;
  book?: "endgame" | "opening";
  /** Số nửa nước đã đi trước thế `fen` trong ván gốc (để huấn luyện biết còn trong khai cuộc hay không). */
  startPly?: number;
}

export const TIME_OPTIONS = [
  { minutes: 0, label: "Không giới hạn" },
  { minutes: 5, label: "5 phút" },
  { minutes: 10, label: "10 phút" },
  { minutes: 20, label: "20 phút" },
];

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseSettings(params: Params): PlaySettings {
  const level = Number(first(params.level));
  const minutes = Number(first(params.time));
  const lesson = Number(first(params.lesson)) || undefined;
  const ply = Number(first(params.ply));
  // FEN lạ từ URL thì bỏ qua (về thế khai cuộc) thay vì làm hỏng ván
  let fen = first(params.fen);
  let fenTurn: Side | undefined;
  if (fen) {
    try {
      const pos = parseFen(fen);
      // Phải đủ hai Tướng và bên đến lượt còn nước đi thì mới chơi tiếp được
      if (findKing(pos.board, "r") < 0 || findKing(pos.board, "b") < 0 || legalMoves(pos).length === 0) throw new Error();
      fenTurn = pos.turn;
    } catch {
      fen = undefined;
    }
  }

  const sideParam = first(params.side);
  const side: Side = sideParam === "b" || sideParam === "r" ? sideParam : fenTurn ?? "r";
  const bookParam = first(params.book);

  return {
    level: (level >= 1 && level <= 5 ? Math.round(level) : 3) as AiLevel,
    side,
    minutes: TIME_OPTIONS.some((t) => t.minutes === minutes) ? minutes : 10,
    fen: fen || undefined,
    lesson,
    book: lesson && (bookParam === "endgame" || bookParam === "opening") ? bookParam : undefined,
    startPly: fen && Number.isInteger(ply) && ply >= 0 ? ply : undefined,
  };
}

export function settingsHref(s: PlaySettings): string {
  const params = new URLSearchParams({
    level: String(s.level),
    side: s.side,
    time: String(s.minutes),
  });
  if (s.fen) params.set("fen", s.fen);
  if (s.lesson) params.set("lesson", String(s.lesson));
  if (s.lesson && s.book) params.set("book", s.book);
  if (s.fen && s.startPly !== undefined) params.set("ply", String(s.startPly));
  return `/play?${params.toString()}`;
}
