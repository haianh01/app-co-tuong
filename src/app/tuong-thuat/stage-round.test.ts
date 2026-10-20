import { describe, expect, it } from "vitest";
import { initialPosition, parseFen } from "@/lib/xiangqi/engine";
import { changeResult, nextRound, resultOnBoard } from "./stage-round";
import { DEFAULT_STAGE_SETTINGS } from "./stage-sync";

describe("stage-round", () => {
  it("bấm lại kết quả khác thì thay chứ không cộng dồn", () => {
    const zero = { win: 0, draw: 0, loss: 0 };
    const won = changeResult(zero, null, "win");
    expect(won).toEqual({ win: 1, draw: 0, loss: 0 });
    expect(changeResult(won, "win", "loss")).toEqual({ win: 0, draw: 0, loss: 1 });
    expect(changeResult(won, "win", null)).toEqual(zero);
  });

  it("đọc thắng/thua từ bàn cờ theo phe của người dẫn", () => {
    // Hai Xe đỏ khóa hàng 10 và hàng 9: Tướng đen bị chiếu, không còn ô nào để đi.
    const mated = parseFen("R3k4/8R/9/9/9/9/9/9/9/3K5 b - - 0 1");
    expect(resultOnBoard(initialPosition(), "r")).toBeNull();
    expect(resultOnBoard(mated, "r")).toBe("win");
    expect(resultOnBoard(mated, "b")).toBe("loss");
  });

  it("sang ván sau: tự ghi kết quả bàn cờ nếu chưa bấm, tăng số ván, xóa đối thủ cũ", () => {
    const s = { ...DEFAULT_STAGE_SETTINGS, round: 2, opponent: { name: "A40745895", points: "1020" } };
    expect(nextRound(s, null, "win")).toMatchObject({ round: 3, today: { win: 1 }, opponent: { name: "Đối thủ" } });
    // Đã bấm "Thắng" (đã cộng) thì không cộng thêm lần nữa.
    expect(nextRound({ ...s, today: { win: 1, draw: 0, loss: 0 } }, "win", "win").today).toEqual({ win: 1, draw: 0, loss: 0 });
    expect(nextRound(s, null, null).today).toEqual(s.today);
  });
});
