import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZHAO_OPENING_LESSONS } from "./zhao48-opening-lessons";

describe("zhao48-opening-lessons: kiểm tra tính xác thực của thẻ bài kỳ lý khai cuộc", () => {
  const expertDir = path.resolve(__dirname, "../../../.data/expert-commentary");

  // Phụ đề gốc nằm trong .data/ (không đưa lên git vì có bản quyền): máy không có thì không kiểm được, bỏ qua thay vì báo lỗi.
  it.skipIf(!fs.existsSync(expertDir))("mọi câu trích (quote) phải tồn tại nguyên văn trong phụ đề và đúng mốc thời gian", () => {
    const lessons = Object.values(ZHAO_OPENING_LESSONS);
    expect(lessons.length).toBe(48);

    for (const card of lessons) {
      const prefix = `zhao48_opening_bai${String(card.lesson).padStart(2, "0")}_`;
      const file = fs.readdirSync(expertDir).find((f) => f.startsWith(prefix));
      expect(file, `Không tìm thấy file dữ liệu cho bài ${card.lesson}`).toBeDefined();

      const data = JSON.parse(fs.readFileSync(path.join(expertDir, file!), "utf-8"));
      const transcript: Record<string, string> = data.transcript ?? {};

      expect(card.quotes.length).toBeGreaterThan(0);
      for (const q of card.quotes) {
        let matched = false;
        for (const [k, text] of Object.entries(transcript)) {
          if (text.startsWith(`[${q.at}]`) && text.includes(q.text)) {
            matched = true;
            break;
          }
        }
        expect(
          matched,
          `Bài ${card.lesson} quote [${q.at}] "${q.text}" không tồn tại nguyên văn trong phụ đề!`,
        ).toBe(true);
      }
    }
  });

  it("mỗi bài có video ID hợp lệ, nguyên lý và tín hiệu rõ ràng", () => {
    expect(Object.keys(ZHAO_OPENING_LESSONS).length).toBe(48);
    for (const card of Object.values(ZHAO_OPENING_LESSONS)) {
      expect(card.video).toMatch(/^[a-zA-Z0-9_-]{11}$/);
      expect(card.principle.length).toBeGreaterThan(20);
      expect(card.signals.length).toBeGreaterThan(0);
      expect(["detectable", "evaluative", "summary"]).toContain(card.kind);
    }
  });
});
