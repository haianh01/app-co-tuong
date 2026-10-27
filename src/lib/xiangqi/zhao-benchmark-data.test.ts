// Thế cờ đối chiếu Triệu Hâm Hâm phải là thế thật trong ván đại sư: đúng FEN ở nửa nước đó và đúng nước đã đi trong ván.
// (Bộ cũ gồm thế tự dựng — có thế 3 Sĩ, có "nước mẫu" không hợp lệ — nên kiểm theo ván gốc, không chỉ kiểm cú pháp.)

import { describe, expect, it } from "vitest";
import { convertChineseGame } from "./chinese-notation";
import { toFen } from "./engine";
import { replayMoves } from "./game";
import { MASTER_GAMES } from "./master-games.generated";
import { moveToUci } from "./uci";
import { ZHAO_BENCHMARK_LESSONS, ZHAO_BENCHMARK_MAP, practiceHref } from "./zhao-benchmark-data";
import { ZHAO_ENDGAME_LESSONS } from "./zhao48-endgame-lessons";
import { parseSettings } from "@/app/play/settings";
import { ZHAO_LESSONS } from "./zhao48-lessons";

describe("thế cờ đối chiếu Triệu Hâm Hâm", () => {
  it("có thế cho cả hai bộ bài, mỗi bài có thế đầu tiên trong bản đồ của đúng bộ", () => {
    expect(ZHAO_BENCHMARK_LESSONS.some((x) => x.book === "middlegame")).toBe(true);
    expect(ZHAO_BENCHMARK_LESSONS.some((x) => x.book === "endgame")).toBe(true);
    for (const item of ZHAO_BENCHMARK_LESSONS) expect(ZHAO_BENCHMARK_MAP[item.book][item.lesson]?.book).toBe(item.book);
  });

  it.each(ZHAO_BENCHMARK_LESSONS.map((x) => [x.book, x.lesson, x.game.id, x.game.ply, x] as const))(
    "%s bài %i — ván %i nửa nước %i khớp ván gốc",
    (_, __, gameId, ply, item) => {
      const game = MASTER_GAMES.find((g) => g.id === gameId);
      expect(game).toBeDefined();
      const state = replayMoves(convertChineseGame(game!.movesCN).moves);
      expect(toFen(state.history[ply - 1])).toBe(item.fen);
      expect(moveToUci(state.moves[ply - 1].move)).toBe(item.move);
      expect(state.moves[ply - 1].notation).toBe(item.moveNotation);
    },
  );

  it("không dùng bài tổng kết; tiêu đề, trích dẫn lấy từ thẻ bài của đúng bộ", () => {
    for (const item of ZHAO_BENCHMARK_LESSONS) {
      const card = item.book === "middlegame" ? ZHAO_LESSONS[item.lesson] : ZHAO_ENDGAME_LESSONS[item.lesson];
      expect(card.kind).not.toBe("summary");
      expect(item.title).toBe(card.title);
      if (item.quote) expect(card.quotes).toContainEqual(item.quote);
    }
  });

  it("ghi chú (tone note) chỉ đến từ bài loại đánh giá của đúng bộ bài", () => {
    for (const item of ZHAO_BENCHMARK_LESSONS.filter((x) => x.tone === "note")) {
      const card = item.book === "endgame"
        ? ZHAO_ENDGAME_LESSONS[item.lesson]
        : Object.values(ZHAO_LESSONS).find((c) => c.lesson === item.lesson);
      expect(card?.kind).toBe("evaluative");
    }
  });

  it("link luyện tập mở /play đúng thế và đúng bộ bài", () => {
    for (const item of [ZHAO_BENCHMARK_LESSONS.find((x) => x.book === "middlegame")!, ZHAO_BENCHMARK_LESSONS.find((x) => x.book === "endgame")!]) {
      const s = parseSettings(Object.fromEntries(new URL(practiceHref(item), "http://x").searchParams));
      expect(s).toMatchObject({ fen: item.fen, lesson: item.lesson, side: parseSettings({ fen: item.fen }).side });
      expect(s.book).toBe(item.book === "endgame" ? "endgame" : undefined);
    }
  });
});
