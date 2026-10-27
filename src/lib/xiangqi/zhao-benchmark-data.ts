// Thế cờ đối chiếu AI với bài giảng Triệu Hâm Hâm: thế trong ván đại sư thật (zhao-benchmark.generated.ts,
// sinh bởi scripts/build-zhao-benchmark.ts) ghép với thẻ bài học (tiêu đề, nguyên lý, câu trích nguyên văn có mốc giờ).
// Thế cờ KHÔNG lấy từ video — video chỉ để nghe lời giảng về kỳ lý đó.
// Hai bộ bài (48 trung cuộc, 48 tàn cuộc) đánh số riêng: luôn tra theo cặp (book, lesson).

import { ZHAO_BENCHMARK_ROWS, type ZhaoBenchmarkRow } from "./zhao-benchmark.generated";
import { ZHAO_ENDGAME_LESSONS } from "./zhao48-endgame-lessons";
import { ZHAO_LESSONS, type ZhaoQuote } from "./zhao48-lessons";
import { ZHAO_OPENING_LESSONS } from "./zhao48-opening-lessons";

export type ZhaoBook = ZhaoBenchmarkRow["book"];

export const ZHAO_BOOK_NAME: Record<ZhaoBook, string> = {
  middlegame: "Trung cuộc",
  endgame: "Tàn cuộc",
  opening: "Khai cuộc",
};

export interface ZhaoBenchmarkItem {
  book: ZhaoBook;
  lesson: number;
  title: string;
  tacticId: string;
  tone: ZhaoBenchmarkRow["tone"];
  fen: string;
  move: string; // uci: "c3c9"
  moveNotation: string; // "X2.6"
  video: string;
  principle: string;
  /** Câu trích nguyên văn đầu tiên của bài (nếu có), kèm mốc thời gian trong video. */
  quote: ZhaoQuote | null;
  /** Chuỗi nước đi từ đầu ván đến trước thế cờ (nếu có, dùng để dựng lại ngữ cảnh khai cuộc). */
  historyMoves?: string[];
  /** Ván đại sư chứa thế cờ, `ply` là nửa nước đang xét (tính từ 1). */
  game: ZhaoBenchmarkRow["game"];
}

const cardOf = (book: ZhaoBook, lesson: number) =>
  book === "middlegame"
    ? ZHAO_LESSONS[lesson]
    : book === "endgame"
    ? ZHAO_ENDGAME_LESSONS[lesson]
    : ZHAO_OPENING_LESSONS[lesson];

export const ZHAO_BENCHMARK_LESSONS: ZhaoBenchmarkItem[] = ZHAO_BENCHMARK_ROWS.flatMap((r) => {
  const card = cardOf(r.book, r.lesson);
  if (!card) return [];
  return [{
    book: r.book,
    lesson: r.lesson,
    title: card.title,
    tacticId: r.tactic,
    tone: r.tone,
    fen: r.fen,
    move: r.move,
    moveNotation: r.moveNotation,
    video: card.video,
    principle: card.principle,
    quote: card.quotes[0] ?? null,
    historyMoves: r.historyMoves,
    game: r.game,
  }];
});

/** Đường dẫn chơi tiếp với máy từ thế này (đọc lại bởi parseSettings ở /play). */
export function practiceHref(item: ZhaoBenchmarkItem): string {
  const params = new URLSearchParams({ fen: item.fen, lesson: String(item.lesson) });
  if (item.book !== "middlegame") params.set("book", item.book);
  return `/play?${params.toString()}`;
}

/** Thế đầu tiên của mỗi bài, theo bộ bài — để biết bài nào có thế đối chiếu. */
export const ZHAO_BENCHMARK_MAP: Record<ZhaoBook, Record<number, ZhaoBenchmarkItem>> = {
  middlegame: {},
  endgame: {},
  opening: {},
};
for (const item of ZHAO_BENCHMARK_LESSONS) ZHAO_BENCHMARK_MAP[item.book][item.lesson] ??= item;

