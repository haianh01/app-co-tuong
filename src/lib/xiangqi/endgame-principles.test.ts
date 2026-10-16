import { describe, expect, it } from "vitest";
import { initialPosition, isLegal, parseFen, play, sq, type Board, type Move } from "./engine";
import { explainText } from "./explain";
import {
  detectEndgameTrade,
  detectGuardFormation,
  detectHighPawn,
  detectKingActivity,
  detectKingBoxing,
  detectOldPawn,
  detectPawnForGuard,
  detectWaitingMove,
  endgamePrincipleFacts,
  isEndgame,
} from "./endgame-principles";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });

/** Thế cờ + nước đi, kiểm tra nước đi hợp lệ để test không dựa trên thế cờ phi luật. */
function setup(fen: string, move: Move): { before: Board; after: Board } {
  const pos = parseFen(fen);
  expect(isLegal(pos, move)).toBe(true);
  return { before: pos.board, after: play(pos.board, move) };
}

describe("endgame-principles: nguyên lý tàn cuộc", () => {
  describe("Đổi quân về tàn cuộc lý thuyết", () => {
    it("khen đổi Xe đưa về Đơn Xe thắng Đơn Pháo (đối phương thiếu Sĩ Tượng)", () => {
      // Đỏ 2 Xe, Đen Xe Pháo + 1 Sĩ 1 Tượng. Xe đỏ ăn Xe d6, Pháo đen d9 ăn lại qua ngòi Sĩ d7.
      const fen = "3ck4/9/3ab4/9/3r5/9/9/3R5/8R/4K4 w - - 0 1";
      const trade = mv(7, 3, 4, 3);
      const { before, after } = setup(fen, trade);
      const f = detectEndgameTrade(before, trade, after, { loss: 0, pv: [mv(0, 3, 4, 3)] });
      expect(f?.principle).toBe("doiVeTanCuocThang");
      expect(f?.endgame).toBe("Đơn Xe thắng Đơn Pháo");
    });

    it("phê bình đổi Xe khi đang thắng, đưa về Đơn Xe hòa Sĩ Tượng toàn", () => {
      // Đỏ 2 Xe đánh Xe đen; Đen đủ Sĩ Tượng. Đỏ đổi Xe, Tượng đen e7 ăn lại.
      const fen = "2baka3/9/4b4/9/2r6/9/9/2R6/8R/4K4 w - - 0 1";
      const trade = mv(7, 2, 4, 2);
      const { before, after } = setup(fen, trade);
      const f = detectEndgameTrade(before, trade, after, {
        loss: 250,
        evalBefore: { score: 320 },
        pv: [mv(2, 4, 4, 2)],
      });
      expect(f?.principle).toBe("doiQuanMatThang");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("Đơn Xe hòa Sĩ Tượng toàn");
    });

    it("khen bên kém quân đổi về tàn cuộc hòa (giải hòa)", () => {
      // Đỏ Xe + Sĩ Tượng toàn đối Xe Pháo + Sĩ Tượng. Xe đỏ ăn Pháo, Xe đen ăn lại: còn Xe đen đối Sĩ Tượng toàn.
      const fen = "2baka3/9/4b4/6r2/9/R5c2/9/4B4/9/2BAKA3 w - - 0 1";
      const trade = mv(5, 0, 5, 6);
      const { before, after } = setup(fen, trade);
      const f = detectEndgameTrade(before, trade, after, {
        loss: 0,
        evalBefore: { score: -250 },
        pv: [mv(3, 6, 5, 6)],
      });
      expect(f?.principle).toBe("giaiHoa");
      expect(f?.endgame).toBe("Đơn Xe hòa Sĩ Tượng toàn");
    });

    it("không kết luận khi đối phương không ăn lại (thế sau không phải tàn cuộc lý thuyết)", () => {
      const fen = "3ck4/9/3ab4/9/3r5/9/9/3R5/8R/4K4 w - - 0 1";
      const trade = mv(7, 3, 4, 3);
      const { before, after } = setup(fen, trade);
      expect(detectEndgameTrade(before, trade, after, { loss: 0, pv: [mv(0, 4, 0, 5)] })).toBeNull();
    });
  });

  describe("Tốt trong tàn cuộc", () => {
    it("phê bình Tốt xuống đáy biến Mã Chốt thắng thành Mã Chốt đáy hòa", () => {
      const fen = "2baka3/1P7/4b4/9/9/5N3/9/9/9/4K4 w - - 0 1";
      const down = mv(1, 1, 0, 1);
      const { before, after } = setup(fen, down);
      const f = detectOldPawn(before, down, after, { loss: 250, evalBefore: { score: 300 } });
      expect(f?.principle).toBe("totGia");
      expect(f?.tone).toBe("critique");
      expect(f?.endgame).toBe("Mã Chốt đáy (Tốt già) hòa Sĩ Tượng toàn");
    });

    it("không phê bình Tốt xuống đáy khi engine không chấm lỗi và kết quả lý thuyết không đổi", () => {
      // Đỏ còn Xe: Tốt xuống đáy chỉ là nước bình thường.
      const fen = "2baka3/1P7/4b4/9/9/5R3/9/9/9/4K4 w - - 0 1";
      const down = mv(1, 1, 0, 1);
      const { before, after } = setup(fen, down);
      expect(detectOldPawn(before, down, after, { loss: 10, evalBefore: { score: 300 } })).toBeNull();
    });

    it("khen Tốt cao bình vào áp cung, chưa xuống đáy", () => {
      const fen = "3aka3/9/2P6/9/9/c8/6N2/9/9/5K3 w - - 0 1";
      const step = mv(2, 2, 2, 3);
      const { before, after } = setup(fen, step);
      const f = detectHighPawn(before, step, after, { loss: 0 });
      expect(f?.principle).toBe("totApCung");
    });

    it("khen Tốt đổi Sĩ phá phòng tuyến", () => {
      const fen = "3aka3/3P5/9/7n1/9/9/6N2/4C4/9/5K3 w - - 0 1";
      const take = mv(1, 3, 0, 3);
      const { before, after } = setup(fen, take);
      const f = detectPawnForGuard(before, take, after, { loss: 0 });
      expect(f?.principle).toBe("totDoiSi");
      expect(f?.summary).toContain("Tốt đổi Sĩ");
    });
  });

  describe("Tướng và khống chế", () => {
    it("khen Tướng ra lộ khóa cung đối phương bằng luật lộ mặt Tướng", () => {
      const fen = "4k4/9/9/4P4/9/2N6/p8/9/9/4K4 w - - 0 1";
      const kingOut = mv(9, 4, 9, 5);
      const { before, after } = setup(fen, kingOut);
      const f = detectKingActivity(before, kingOut, after, { loss: 0 });
      expect(f?.principle).toBe("tuongTroCong");
      expect(f?.summary).toContain("lộ 4");
    });

    it("không tính Tướng né sang cột bị chắn (không khóa thêm ô nào)", () => {
      // Tốt đỏ f6 chắn cột f: Tướng sang f0 không khóa được ô nào trong cung đen.
      const fen = "4k4/9/9/4PP3/9/2N6/p8/9/9/4K4 w - - 0 1";
      const kingOut = mv(9, 4, 9, 5);
      const { before, after } = setup(fen, kingOut);
      expect(detectKingActivity(before, kingOut, after, { loss: 0 })).toBeNull();
    });

    it("khen Xe khóa hàng, Tướng trần đối phương chỉ còn 1 đường đi", () => {
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      const f = detectKingBoxing(before, box, after, { loss: 0 });
      expect(f?.principle).toBe("boTuong");
      expect(f?.summary).toContain("1 đường đi");
    });

    it("khen nước chờ bằng Sĩ khi đang thắng và đối phương gần hết nước", () => {
      const fen = "4k4/R8/9/9/9/9/9/9/4A4/3K5 w - - 0 1";
      const wait = mv(8, 4, 9, 5);
      const { before, after } = setup(fen, wait);
      const f = detectWaitingMove(before, wait, after, { loss: 0, evalBefore: { score: 1000 } });
      expect(f?.principle).toBe("nuocCho");
      expect(f?.summary).toContain("1 nước");
    });

    it("không coi là nước chờ khi chưa thắng thế", () => {
      const fen = "4k4/R8/9/9/9/9/9/9/4A4/3K5 w - - 0 1";
      const wait = mv(8, 4, 9, 5);
      const { before, after } = setup(fen, wait);
      expect(detectWaitingMove(before, wait, after, { loss: 0, evalBefore: { score: 30 } })).toBeNull();
    });
  });

  describe("Phòng thủ tàn cuộc", () => {
    it("khen bên kém quân đưa Sĩ về liên hoàn", () => {
      const fen = "3ak4/9/5a3/4P4/9/8R/9/9/9/4K4 b - - 0 1";
      const link = mv(2, 5, 1, 4);
      const { before, after } = setup(fen, link);
      const f = detectGuardFormation(before, link, after, { loss: 0, evalBefore: { score: -500 } });
      expect(f?.principle).toBe("giuSiTuong");
      expect(f?.side).toBe("b");
    });
  });

  describe("Tổng hợp", () => {
    it("không xét nguyên lý tàn cuộc ở khai cuộc", () => {
      const pos = initialPosition();
      const m = mv(7, 1, 7, 4);
      expect(isEndgame(pos.board)).toBe(false);
      expect(endgamePrincipleFacts(pos.board, m, play(pos.board, m), { loss: 0 })).toEqual([]);
    });

    it("mỗi nước chỉ một nguyên lý, và lời bình hiện ở góc nhìn mặc định", () => {
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      const facts = endgamePrincipleFacts(before, box, after, { loss: 0 });
      expect(facts).toHaveLength(1);
      expect(explainText(facts, "r", 1, "default")).toContain("Bó Tướng");
    });

    it("không khen khi thiếu dữ liệu engine", () => {
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      expect(endgamePrincipleFacts(before, box, after)).toEqual([]);
    });
  });
});
