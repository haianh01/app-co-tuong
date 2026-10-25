// Thế cờ đối chiếu AI với bài giảng Triệu Hâm Hâm: thế trong ván đại sư thật (zhao-benchmark.generated.ts,
// sinh bởi scripts/build-zhao-benchmark.ts) ghép với thẻ bài học (tiêu đề, nguyên lý, câu trích nguyên văn có mốc giờ).
// Thế cờ KHÔNG lấy từ video — video chỉ để nghe lời giảng về kỳ lý đó.

import { ZHAO_BENCHMARK_ROWS, type ZhaoBenchmarkRow } from "./zhao-benchmark.generated";
import { ZHAO_LESSONS, type ZhaoQuote } from "./zhao48-lessons";

export interface ZhaoBenchmarkItem {
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
  /** Ván đại sư chứa thế cờ, `ply` là nửa nước đang xét (tính từ 1). */
  game: ZhaoBenchmarkRow["game"];
}

export const ZHAO_BENCHMARK_LESSONS: ZhaoBenchmarkItem[] = ZHAO_BENCHMARK_ROWS.flatMap((r) => {
  const card = ZHAO_LESSONS[r.lesson];
  if (!card) return [];
  return [{
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
    game: r.game,
  }];
});

/** Thế đầu tiên của mỗi bài — để biết bài nào có thế đối chiếu. */
export const ZHAO_BENCHMARK_MAP: Record<number, ZhaoBenchmarkItem> = {};
for (const item of ZHAO_BENCHMARK_LESSONS) ZHAO_BENCHMARK_MAP[item.lesson] ??= item;
