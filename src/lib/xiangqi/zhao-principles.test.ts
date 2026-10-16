import { describe, expect, it } from "vitest";
import { isLegal, parseFen, play, sq, type Board, type Move } from "./engine";
import { explainText, personaFacts } from "./explain";
import {
  detectAllZhaoTactics,
  detectCannonMount,
  detectDecoy,
  detectEndgameConversion,
  detectFlankSwitch,
  detectInitiativeOverMaterial,
  detectInterference,
  detectMatingRace,
  detectPoisonedCapture,
  detectProphylaxis,
  detectTempoChase,
  detectTempoExchange,
  detectWorstPieceImprovement,
} from "./zhao-principles";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });

/** Thế cờ + nước đi, kiểm tra nước đi hợp lệ để test không dựa trên thế cờ phi luật. */
function setup(fen: string, move: Move): { before: Board; after: Board } {
  const pos = parseFen(fen);
  expect(isLegal(pos, move)).toBe(true);
  return { before: pos.board, after: play(pos.board, move) };
}

describe("zhao-principles: nguyên lý tranh tiên bổ sung", () => {
  describe("Ninh thất nhất tử, bất thất nhất tiên", () => {
    // Đen bỏ Mã b5 không căn; Đỏ có thể bình Pháo trung lộ chiếu (Tốt đen e6 làm ngòi).
    const fen = "2bakab2/9/9/4p4/1n7/9/9/1R5C1/9/3AKA3 w - - 0 1";
    const capture = mv(7, 1, 4, 1); // Xe ăn Mã
    const pawnCheck = mv(7, 7, 7, 4); // Pháo bình trung chiếu

    it("phê bình nước ăn Mã khi nước tốt nhất là nước chiếu giữ tiên", () => {
      const { before, after } = setup(fen, capture);
      const f = detectInitiativeOverMaterial(before, capture, after, {
        loss: 180,
        evalBefore: { score: 300, best: pawnCheck, pv: [pawnCheck] },
      });
      expect(f?.tactic).toBe("ninhThatNhatTu");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("Ninh thất nhất tử");
      expect(f?.details).toContain("Nên đi");
    });

    it("khen nước bỏ miếng ăn để chiếu giữ tiên khi engine xác nhận là nước tốt nhất", () => {
      const { before, after } = setup(fen, pawnCheck);
      const f = detectInitiativeOverMaterial(before, pawnCheck, after, {
        loss: 0,
        evalBefore: { score: 300, best: pawnCheck },
      });
      expect(f?.tactic).toBe("ninhThatNhatTu");
      expect(f?.tone).toBeUndefined();
      expect(f?.summary).toContain("không ham ăn Mã");
    });

    it("không khen khi engine thích nước khác (ăn Mã mới là nước tốt nhất)", () => {
      const { before, after } = setup(fen, pawnCheck);
      expect(detectInitiativeOverMaterial(before, pawnCheck, after, { loss: 20, evalBefore: { score: 300, best: capture } })).toBeNull();
    });

    it("không phê bình khi nước tốt nhất cũng là ăn quân", () => {
      const { before, after } = setup(fen, capture);
      const otherCapture = mv(7, 1, 4, 1);
      expect(detectInitiativeOverMaterial(before, capture, after, { loss: 150, evalBefore: { score: 300, best: otherCapture } })).toBeNull();
    });
  });

  describe("Tham ăn mắc mồi", () => {
    // Xe Đỏ g0 đang giữ đáy. Ăn Mã g5 bỏ ngỏ hàng đáy, Xe Đen i5 xuống i0 chiếu.
    const fen = "3aka3/9/9/9/8r/6n2/9/9/4A4/4K1R2 w - - 0 1";
    const capture = mv(9, 6, 5, 6);
    const backRankCheck = mv(4, 8, 9, 8);

    it("phê bình ăn quân trông có lời nhưng bị phản đòn chiếu", () => {
      const { before, after } = setup(fen, capture);
      const f = detectPoisonedCapture(before, capture, after, { loss: 400, pv: [backRankCheck] });
      expect(f?.tactic).toBe("khongThamAn");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("chiếu");
    });

    it("không phê bình khi engine không chấm lỗi nặng", () => {
      const { before, after } = setup(fen, capture);
      expect(detectPoisonedCapture(before, capture, after, { loss: 40, pv: [backRankCheck] })).toBeNull();
    });
  });

  describe("Tranh nước đối công", () => {
    // Đen dọa Xe a3 xuống a0 chiếu bí (Tốt đen e2 khóa đường lên của Tướng).
    // Đỏ không chống mà Xe f4 lên f9 chiếu, Mã g7 giữ ô f9 và e8.
    const fen = "2b1k1b2/9/6N2/9/9/5R3/r8/4p4/9/4K4 w - - 0 1";
    const counterCheck = mv(5, 5, 0, 5);

    it("khen nước chiếu trước khi đang bị dọa sát", () => {
      const { before, after } = setup(fen, counterCheck);
      const f = detectMatingRace(before, counterCheck, after, { loss: 0, pv: [] });
      expect(f?.tactic).toBe("tranhNuoc");
      expect(f?.summary).toContain("dọa sát");
    });

    it("không nhận khi nước đi không chiếu", () => {
      const quiet = mv(5, 5, 5, 6);
      const { before, after } = setup(fen, quiet);
      expect(detectMatingRace(before, quiet, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương không có đòn dọa sát", () => {
      // Bỏ Tốt đen e2: Tướng Đỏ lên e1 thoát được, Xe xuống đáy không còn là sát.
      const fen2 = "2b1k1b2/9/6N2/9/4p4/5R3/r8/9/9/4K4 w - - 0 1";
      const { before, after } = setup(fen2, counterCheck);
      expect(detectMatingRace(before, counterCheck, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Đuổi quân được tiên", () => {
    // Mã c2 nhảy d4 vừa tiến quân vừa dọa Xe đen c6; Mã đứng chỗ an toàn.
    const fen = "2bakab2/9/9/2r1p4/9/9/9/2N6/9/R2AKA3 w - - 0 1";
    const chase = mv(7, 2, 5, 3);

    it("khen khi đối phương phải dùng nước đáp để chạy Xe", () => {
      const { before, after } = setup(fen, chase);
      const f = detectTempoChase(before, chase, after, { loss: 10, pv: [mv(3, 2, 3, 0)] });
      expect(f?.tactic).toBe("duoiQuanDuocTien");
      expect(f?.summary).toContain("tiến lên");
      expect(f?.summary).toContain("dọa ăn Xe");
    });

    it("không nhận khi đối phương lờ đi và phản đòn ăn quân", () => {
      // Đen mặc kệ Xe bị dọa, dùng Tốt e6 ăn Tốt đỏ e5.
      const fen2 = "2bakab2/9/9/2r1p4/4P4/9/9/2N6/9/R2AKA3 w - - 0 1";
      const { before, after } = setup(fen2, chase);
      expect(detectTempoChase(before, chase, after, { loss: 10, pv: [mv(3, 4, 4, 4)] })).toBeNull();
    });
  });

  describe("Dẫn dụ", () => {
    // Xe Đen i7 canh ô d7 (ô Mã ngọa tào). Đỏ thí Xe i5 dụ Xe Đen xuống ăn, rồi Mã c6 vào d7 chiếu.
    const fen = "3aka3/9/8r/9/2N6/R8/4P4/9/9/4K4 w - - 0 1";
    const sac = mv(5, 0, 5, 8);
    const pv = [mv(2, 8, 5, 8), mv(4, 2, 2, 3)];

    it("nhận diện thí Xe dụ quân canh giữ rời vị trí", () => {
      const { before, after } = setup(fen, sac);
      const f = detectDecoy(before, sac, after, { loss: 0, pv });
      expect(f?.tactic).toBe("danDu");
      expect(f?.summary).toContain("đang canh giữ");
      expect(f?.summary).toContain("chiếu");
    });

    it("không nhận khi đối phương không cắn mồi", () => {
      const { before, after } = setup(fen, sac);
      expect(detectDecoy(before, sac, after, { loss: 0, pv: [mv(0, 4, 1, 4), mv(4, 2, 2, 3)] })).toBeNull();
    });
  });

  describe("Chặn đường", () => {
    // Pháo đen g7 được Xe a7 bảo vệ theo hàng ngang; Mã đỏ nhảy vào c7 cắt liên lạc, Xe g3 ăn được Pháo.
    const fen = "3aka3/9/r5c2/4p4/1N7/9/6R2/9/9/4K4 w - - 0 1";
    const cut = mv(4, 1, 2, 2);

    it("nhận diện quân chen vào khiến Pháo mất căn", () => {
      const { before, after } = setup(fen, cut);
      const f = detectInterference(before, cut, after, { loss: 0 });
      expect(f?.tactic).toBe("chanDuong");
      expect(f?.summary).toContain("Pháo đối phương mất căn");
    });

    it("không nhận nước không làm thay đổi căn của quân đối phương", () => {
      const quiet = mv(4, 1, 6, 2);
      const { before, after } = setup(fen, quiet);
      expect(detectInterference(before, quiet, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Giá Pháo", () => {
    // Pháo đỏ e2 chưa có ngòi; Mã d2 nhảy lên e4 làm ngòi, Pháo chiếu Tướng.
    const fen = "3aka3/9/9/9/9/9/9/3NC4/9/4K4 w - - 0 1";
    const mount = mv(7, 3, 5, 4);

    it("nhận diện quân làm ngòi cho Pháo chiếu", () => {
      const { before, after } = setup(fen, mount);
      const f = detectCannonMount(before, mount, after, { loss: 0 });
      expect(f?.tactic).toBe("giaPhao");
      expect(f?.summary).toContain("chiếu Tướng");
    });

    it("không nhận khi quân đi không nằm giữa Pháo và mục tiêu", () => {
      const away = mv(7, 3, 5, 2);
      const { before, after } = setup(fen, away);
      expect(detectCannonMount(before, away, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Đổi quân giành tiên", () => {
    // Xe đỏ đổi Xe đen d7; Xe đen i7 ăn lại thì Mã đỏ g6 vào f8 chiếu.
    const fen = "3aka3/9/3r4r/4p4/6N2/9/3R5/9/9/4K4 w - - 0 1";
    const trade = mv(6, 3, 2, 3);

    it("nhận diện đổi Xe xong vẫn được đi nước chiếu", () => {
      const { before, after } = setup(fen, trade);
      const f = detectTempoExchange(before, trade, after, { loss: 0, pv: [mv(2, 8, 2, 3), mv(4, 6, 2, 5)] });
      expect(f?.tactic).toBe("doiQuanGianhTien");
      expect(f?.summary).toContain("có tiên");
    });

    it("không nhận khi đối phương không ăn lại (đó là ăn quân, không phải đổi)", () => {
      const { before, after } = setup(fen, trade);
      expect(detectTempoExchange(before, trade, after, { loss: 0, pv: [mv(0, 4, 1, 4)] })).toBeNull();
    });
  });

  describe("Cải thiện quân kém nhất", () => {
    // Mã đỏ a1 đứng biên, chỉ 3 đường đi; nhảy ra b3 thoáng hẳn.
    const fen = "3aka3/9/9/4p4/9/9/9/9/N8/3AKA2R w - - 0 1";
    const improve = mv(8, 0, 6, 1);

    it("nhận diện đưa Mã biên ra vị trí hoạt động", () => {
      const { before, after } = setup(fen, improve);
      const f = detectWorstPieceImprovement(before, improve, after, { loss: 0 });
      expect(f?.tactic).toBe("caiThienQuanKem");
      expect(f?.summary).toContain("Mã");
    });

    it("không tính nước ra quân từ ô xuất phát", () => {
      const fen2 = "3aka3/9/9/4p4/9/9/9/9/9/1N1AKA2R w - - 0 1";
      const develop = mv(9, 1, 7, 2);
      const { before, after } = setup(fen2, develop);
      expect(detectWorstPieceImprovement(before, develop, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Thanh đông kích tây", () => {
    // Đỏ vừa dồn Mã, Pháo sang cánh lộ 1-3 (cột g-i), Đen kéo Xe, Mã về giữ; nay Xe a0 lên a7 bắt Pháo đen b7.
    const fen = "3akab2/7r1/1c4n2/4p4/8C/9/9/6N2/9/R3K4 w - - 0 1";
    const swing = mv(9, 0, 2, 0);
    const recentMoves = [mv(9, 7, 7, 6), mv(1, 8, 1, 7), mv(4, 7, 4, 8), mv(0, 7, 2, 6)];

    it("nhận diện chuyển đòn sang cánh đối diện sau khi ép một cánh", () => {
      const { before, after } = setup(fen, swing);
      const f = detectFlankSwitch(before, swing, after, { loss: 0, recentMoves });
      expect(f?.tactic).toBe("thanhDongKichTay");
      expect(f?.summary).toContain("dọa ăn Pháo");
    });

    it("không nhận khi không có lịch sử nước đi", () => {
      const { before, after } = setup(fen, swing);
      expect(detectFlankSwitch(before, swing, after, { loss: 0 })).toBeNull();
    });

    it("không nhận khi đối phương chưa bị kéo về cánh bị ép", () => {
      const { before, after } = setup(fen, swing);
      const quietOpp = [mv(9, 7, 7, 6), mv(0, 3, 1, 4), mv(4, 7, 4, 8), mv(1, 4, 0, 3)];
      expect(detectFlankSwitch(before, swing, after, { loss: 0, recentMoves: quietOpp })).toBeNull();
    });
  });

  describe("Phòng ngừa", () => {
    // Mã đen f5 sắp nhảy vào ngọa tào g2; Đỏ đưa Xe lên i2 khống chế trước.
    const fen = "3aka3/9/9/4p4/9/5n3/9/9/9/3AKA2R w - - 0 1";
    const prevent = mv(9, 8, 7, 8);

    it("nhận diện chặn trước đường Mã vào ngọa tào", () => {
      const { before, after } = setup(fen, prevent);
      const f = detectProphylaxis(before, prevent, after, { loss: 0 });
      expect(f?.tactic).toBe("phongNgua");
      expect(f?.summary).toContain("ngọa tào");
    });

    it("không nhận nước không đụng tới đường tiến của Mã", () => {
      const other = mv(9, 8, 8, 8);
      const { before, after } = setup(fen, other);
      expect(detectProphylaxis(before, other, after, { loss: 0 })).toBeNull();
    });
  });

  describe("Biết dừng công, chuyển hóa tàn cuộc", () => {
    // Đỏ hơn 3 Tốt, đổi Xe; Mã đen ăn lại, Đỏ đi nước yên.
    const fen = "2naka3/9/3r5/9/2P3P2/3R5/4P4/2N6/9/3AKA3 w - - 0 1";
    const trade = mv(5, 3, 2, 3);
    const pv = [mv(0, 2, 2, 3), mv(4, 6, 3, 6)];

    it("nhận diện đổi Xe khi đang hơn, không còn đòn ép", () => {
      const { before, after } = setup(fen, trade);
      const f = detectEndgameConversion(before, trade, after, { loss: 0, evalBefore: { score: 250 }, pv });
      expect(f?.tactic).toBe("chuyenHoaTanCuoc");
      expect(f?.summary).toContain("hơn 3 Tốt");
    });

    it("không nhận khi engine đánh giá thế cờ chưa hơn", () => {
      const { before, after } = setup(fen, trade);
      expect(detectEndgameConversion(before, trade, after, { loss: 0, evalBefore: { score: 20 }, pv })).toBeNull();
    });
  });

  describe("Tổng hợp và hiển thị", () => {
    it("không khen nước nào khi thiếu dữ liệu engine", () => {
      const fen = "3aka3/9/9/9/9/9/9/3NC4/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, mv(7, 3, 5, 4));
      expect(detectAllZhaoTactics(before, mv(7, 3, 5, 4), after)).toEqual([]);
    });

    it("nước vi phạm nguyên lý chỉ nhận lời phê bình, explainText gắn nhãn Cảnh tỉnh", () => {
      const fen = "2bakab2/9/9/4p4/1n7/9/9/1R5C1/9/3AKA3 w - - 0 1";
      const capture = mv(7, 1, 4, 1);
      const best = mv(7, 7, 7, 4);
      const { before, after } = setup(fen, capture);
      const facts = personaFacts(before, capture, after, { loss: 180, evalBefore: { score: 300, best, pv: [best] } });
      const zhao = facts.filter((f) => f.kind === "zhaoMiddlegame");
      expect(zhao.length).toBeGreaterThan(0);
      expect(zhao.every((f) => f.kind === "zhaoMiddlegame" && f.tone === "critique")).toBe(true);
      expect(explainText(facts, "r", 1, "zhaoXinxin")).toMatch(/^\[Triệu Hâm Hâm - Cảnh tỉnh\]/);
    });

    it("personaFacts giữ tối đa 2 nguyên lý Triệu mỗi nước", () => {
      const fen = "3aka3/9/9/9/9/9/9/3NC4/9/4K4 w - - 0 1";
      const { before, after } = setup(fen, mv(7, 3, 5, 4));
      const zhao = personaFacts(before, mv(7, 3, 5, 4), after, { loss: 0 }).filter((f) => f.kind === "zhaoMiddlegame");
      expect(zhao.length).toBeGreaterThan(0);
      expect(zhao.length).toBeLessThanOrEqual(2);
    });
  });
});
