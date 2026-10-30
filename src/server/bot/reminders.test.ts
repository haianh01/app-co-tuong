import { describe, expect, it } from "vitest";
import { createReminderPicker, gamePhase, HOST_REMINDERS, SAFETY_REMINDERS } from "./reminders";

describe("nhắc anh chủ kênh trong ván", () => {
  it("chia giai đoạn: 20 nửa nước đầu là khai cuộc, mất từ 6 Xe Mã Pháo trở lên là tàn cuộc", () => {
    expect(gamePhase(8, [])).toBe("opening");
    expect(gamePhase(30, ["r", "p", "p"])).toBe("middlegame");
    // Tốt, Sĩ, Tượng mất nhiều mấy cũng chưa phải tàn cuộc
    expect(gamePhase(60, ["p", "p", "p", "a", "a", "b", "b", "r"])).toBe("middlegame");
    expect(gamePhase(60, ["r", "r", "n", "c", "c", "n"])).toBe("endgame");
  });

  it("đọc hết một nhóm rồi mới lặp, mỗi nhóm bốc riêng", () => {
    const pick = createReminderPicker(() => 0.42);
    const opening = HOST_REMINDERS.opening.map(() => pick("opening"));
    expect(new Set(opening)).toEqual(new Set(HOST_REMINDERS.opening));
    expect(SAFETY_REMINDERS).toContain(pick("safety"));
    expect(HOST_REMINDERS.opening).toContain(pick("opening"));
  });

  it("câu nhắc ngắn, đọc nhanh trong lúc đang đánh", () => {
    for (const text of [...Object.values(HOST_REMINDERS).flat(), ...SAFETY_REMINDERS]) {
      expect(text.split(/\s+/).length).toBeLessThanOrEqual(30);
    }
  });
});
