import { describe, expect, it } from "vitest";
import { ZHAO_ENDGAME_LESSONS } from "@/lib/xiangqi/zhao48-endgame-lessons";
import { ZHAO_LESSONS } from "@/lib/xiangqi/zhao48-lessons";
import { ZHAO_OPENING_LESSONS } from "@/lib/xiangqi/zhao48-opening-lessons";
import { createTipPicker, KY_LY_TIPS, tipSpeech } from "./tips";

const BOOKS = { opening: ZHAO_OPENING_LESSONS, middlegame: ZHAO_LESSONS, endgame: ZHAO_ENDGAME_LESSONS };

describe("mẹo kỳ lý", () => {
  it("mỗi trích dẫn là nguyên văn trong quotes của đúng thẻ bài (bot đọc nó như lời Triệu Hâm Hâm)", () => {
    const wrong = KY_LY_TIPS.filter((t) => {
      const card = BOOKS[t.book][t.lesson];
      return !card || (t.quote !== undefined && !card.quotes.some((q) => q.text.includes(t.quote!)));
    });
    expect(wrong).toEqual([]);
  });

  it("mỗi mẹo đọc ngắn gọn, dưới 60 từ, và không trùng nhau", () => {
    const long = KY_LY_TIPS.map(tipSpeech).filter((s) => s.split(/\s+/).length > 60);
    expect(long).toEqual([]);
    expect(new Set(KY_LY_TIPS.map((t) => t.text)).size).toBe(KY_LY_TIPS.length);
  });

  it("đọc hết các mẹo rồi mới lặp, và không lặp ngay câu vừa đọc khi sang vòng mới", () => {
    const next = createTipPicker();
    const n = KY_LY_TIPS.length;
    const round1 = Array.from({ length: n }, next);
    expect(new Set(round1).size).toBe(n);
    for (let i = 0; i < 20; i++) {
      const last = round1.at(-1);
      const round2 = Array.from({ length: n }, next);
      expect(round2[0]).not.toBe(last);
      expect(new Set(round2).size).toBe(n);
      round1.splice(0, n, ...round2);
    }
  });
});
