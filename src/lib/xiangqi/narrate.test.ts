import { describe, expect, it } from "vitest";
import { parseFen, sq, type Move } from "./engine";
import {
  describeMaterialDelta,
  formatPieceCount,
  narratePv,
} from "./narrate";

describe("narrate.ts - Bộ kể biến", () => {
  describe("formatPieceCount", () => {
    it("định dạng đúng số lượng quân đơn lẻ", () => {
      expect(formatPieceCount({ r: 1 })).toBe("một Xe");
      expect(formatPieceCount({ c: 1 })).toBe("một Pháo");
      expect(formatPieceCount({ n: 2 })).toBe("hai Mã");
      expect(formatPieceCount({ p: 3 })).toBe("ba Tốt");
    });

    it("nối các loại quân bằng 'và' hoặc dấu phẩy", () => {
      expect(formatPieceCount({ r: 1, c: 1 })).toBe("một Xe và một Pháo");
      expect(formatPieceCount({ r: 1, n: 1, p: 2 })).toBe("một Xe, một Mã và hai Tốt");
    });
  });

  describe("describeMaterialDelta", () => {
    it("cân bằng quân khi hai bàn cờ giống nhau", () => {
      const pos = parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
      const delta = describeMaterialDelta(pos.board, pos.board);
      expect(delta.advantageSide).toBeNull();
      expect(delta.scoreDiff).toBe(0);
      expect(delta.text).toBe("cân bằng quân");
    });

    it("phát hiện Đen hơn một Xe", () => {
      // Trước: Đỏ có Xe (sq 9,0), Đen có Xe (sq 0,0)
      const start = parseFen("r3k4/9/9/9/9/9/9/9/9/R3K4 w");
      // Sau: Đỏ mất Xe
      const end = parseFen("r3k4/9/9/9/9/9/9/9/9/4K4 w");
      const delta = describeMaterialDelta(start.board, end.board);
      expect(delta.advantageSide).toBe("b");
      expect(delta.text).toBe("Đen hơn một Xe");
      expect(delta.diffPieces.r).toBe(1);
    });

    it("phát hiện Đỏ hơn một Mã và một Tốt", () => {
      const start = parseFen("4k4/4n4/4p4/9/9/9/9/9/9/4K4 w");
      const end = parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
      const delta = describeMaterialDelta(start.board, end.board);
      expect(delta.advantageSide).toBe("r");
      expect(delta.text).toBe("Đỏ hơn một Mã và một Tốt");
    });

    it("phát hiện đổi quân cân bằng khi hai bên cùng mất Xe", () => {
      const start = parseFen("r3k4/9/9/9/9/9/9/9/9/R3K4 w");
      const end = parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
      const delta = describeMaterialDelta(start.board, end.board);
      expect(delta.advantageSide).toBeNull();
      expect(delta.text).toBe("đổi quân cân bằng");
    });
  });

  describe("narratePv", () => {
    it("ghi lại ăn quân và tóm tắt 'sau ... thì Đen hơn một Xe'", () => {
      // Đỏ có Xe ở (4,0), Đen có Xe ở (0,0). Đen đi X1.4 ăn Xe đỏ.
      // Bàn cờ: Đen Xe ở (0,0), Đỏ Xe ở (4,0)
      const pos = parseFen("r3k4/9/9/9/R8/9/9/9/9/4K4 b");
      const pv: Move[] = [
        { from: sq(0, 0), to: sq(4, 0) }, // Đen ăn Xe đỏ
      ];

      const res = narratePv(pos.board, "b", pv);
      expect(res.moves).toHaveLength(1);
      expect(res.moves[0].captured).not.toBeNull();
      expect(res.moves[0].captured?.name).toContain("Xe");
      expect(res.delta.advantageSide).toBe("b");
      expect(res.summary).toContain("Đen hơn một Xe");
    });

    it("ghi nhận nước chiếu tướng (isCheck)", () => {
      // Đỏ có Xe ở (1,4), Tướng Đen ở (0,4). Đỏ đi chiếu tướng.
      const pos = parseFen("4k4/9/9/9/4R4/9/9/9/9/4K4 w");
      const pv: Move[] = [
        { from: sq(4, 4), to: sq(1, 4) }, // Xe tiến chiếu
      ];

      const res = narratePv(pos.board, "r", pv);
      expect(res.moves[0].isCheck).toBe(true);
    });

    it("ghi nhận đe dọa ăn quân (threats)", () => {
      // Đỏ có Xe ở (9,0), Đen có Pháo không bảo vệ ở (5,1).
      // Đỏ đi X9.4 tới (5,0) đe dọa ăn Pháo đen ở (5,1).
      const pos = parseFen("4k4/9/9/9/9/1c7/9/9/9/R3K4 w");
      const pv: Move[] = [
        { from: sq(9, 0), to: sq(5, 0) }, // Xe tiến lên ngang hàng với Pháo
      ];

      const res = narratePv(pos.board, "r", pv);
      expect(res.moves[0].threats.length).toBeGreaterThan(0);
      expect(res.moves[0].threats[0].name).toContain("Pháo");
    });

    it("phát hiện chuỗi kết thúc bằng chiếu bí (isMate)", () => {
      // Thế cờ Đỏ chiếu bí: Tướng Đen kẹt góc, Xe đỏ đâm đáy chiếu bí
      // Đen ở (0,3), Xe đỏ ở (1,3). Xe đỏ đi xuống (0,3)? Không, Xe ở (1,3) đâm xuống (0,3) ăn tướng?
      // Chuẩn: Tướng đen ở (0,4), Xe đỏ ở (1,0) bình chiếu ở (1,4), có mặt tướng đỏ ở (9,4).
      // Khi đó Đen hết nước đi = chiếu bí.
      const pos = parseFen("4k4/R8/9/9/9/9/9/9/9/4K4 w");
      const pv: Move[] = [
        { from: sq(1, 0), to: sq(0, 0) }, // Xe xuống đáy chiếu bí (mặt tướng đối mặt)
      ];

      const res = narratePv(pos.board, "r", pv);
      // Tướng đen bị Xe ở (0,0) chiếu dọc hàng 0, Tướng không sang được vì mặt tướng đỏ ở (9,4)
      expect(res.isMate).toBe(true);
      expect(res.mateWinner).toBe("r");
      expect(res.summary).toContain("Đỏ chiếu bí");
    });

    it("xử lý mượt mà khi chuỗi rỗng", () => {
      const pos = parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
      const res = narratePv(pos.board, "r", []);
      expect(res.moves).toHaveLength(0);
      expect(res.summary).toBe("không có nước tiếp diễn");
    });
  });
});
