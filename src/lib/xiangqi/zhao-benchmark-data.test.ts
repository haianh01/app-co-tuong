// Thế cờ đối chiếu Triệu Hâm Hâm phải là thế thật trong ván đại sư: đúng FEN ở nửa nước đó và đúng nước đã đi trong ván.
// (Bộ cũ gồm thế tự dựng — có thế 3 Sĩ, có "nước mẫu" không hợp lệ — nên kiểm theo ván gốc, không chỉ kiểm cú pháp.)

import { describe, expect, it } from "vitest";
import { convertChineseGame } from "./chinese-notation";
import { toFen } from "./engine";
import { replayMoves } from "./game";
import { MASTER_GAMES } from "./master-games.generated";
import { moveToUci } from "./uci";
import { ZHAO_BENCHMARK_LESSONS, ZHAO_BENCHMARK_MAP } from "./zhao-benchmark-data";
import { ZHAO_LESSONS } from "./zhao48-lessons";

describe("thế cờ đối chiếu Triệu Hâm Hâm", () => {
  it("có dữ liệu và mỗi bài có thế đầu tiên trong bản đồ", () => {
    expect(ZHAO_BENCHMARK_LESSONS.length).toBeGreaterThan(0);
    for (const item of ZHAO_BENCHMARK_LESSONS) expect(ZHAO_BENCHMARK_MAP[item.lesson]).toBeDefined();
  });

  it.each(ZHAO_BENCHMARK_LESSONS.map((x) => [x.lesson, x.game.id, x.game.ply, x] as const))(
    "bài %i — ván %i nửa nước %i khớp ván gốc",
    (_, gameId, ply, item) => {
      const game = MASTER_GAMES.find((g) => g.id === gameId);
      expect(game).toBeDefined();
      const state = replayMoves(convertChineseGame(game!.movesCN).moves);
      expect(toFen(state.history[ply - 1])).toBe(item.fen);
      expect(moveToUci(state.moves[ply - 1].move)).toBe(item.move);
      expect(state.moves[ply - 1].notation).toBe(item.moveNotation);
    },
  );

  it("chỉ dùng bài trung cuộc gắn được vào từng nước, tiêu đề lấy từ thẻ bài", () => {
    for (const item of ZHAO_BENCHMARK_LESSONS) {
      const card = ZHAO_LESSONS[item.lesson];
      expect(card.kind).not.toBe("summary");
      expect(item.title).toBe(card.title);
      if (item.quote) expect(card.quotes).toContainEqual(item.quote);
    }
  });
});
