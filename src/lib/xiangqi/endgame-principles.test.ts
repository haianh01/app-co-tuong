import { describe, expect, it } from "vitest";
import { convertChineseGame } from "./chinese-notation";
import { initialPosition, isLegal, legalMoves, parseFen, play, sq, type Board, type Move } from "./engine";
import { explainText } from "./explain";
import { MASTER_GAMES } from "./master-games.generated";
import { minorValues, screenCount } from "./piece-value";
import { ZHAO_ENDGAME_LESSONS } from "./zhao48-endgame-lessons";
import {
  detectCannonHome,
  detectCenterFile,
  detectCheckThenWin,
  detectEndgameTrade,
  detectGuardBlocksHorse,
  detectGuardBreak,
  detectGuardFormation,
  detectHaiDeLaoNguyet,
  detectHighPawn,
  detectInterception,
  detectKingActivity,
  detectKingBoxing,
  detectMatingAttack,
  detectMinorTrade,
  detectOldPawn,
  detectPawnForGuard,
  detectPawnHunt,
  detectPin,
  detectRiverBlock,
  detectBackRankLock,
  detectTrap,
  detectWaitingMove,
  detectWeakPalaceAttack,
  endgamePrincipleFacts,
  endgameTypeNote,
  isEndgame,
  type EndgamePrinciple,
} from "./endgame-principles";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });

/** Thế cờ + nước đi, kiểm tra nước đi hợp lệ để test không dựa trên thế cờ phi luật. */
function setup(fen: string, move: Move): { before: Board; after: Board } {
  const pos = parseFen(fen);
  expect(isLegal(pos, move)).toBe(true);
  return { before: pos.board, after: play(pos.board, move) };
}

/**
 * Thế cờ thật (ván đại sư xqbase hoặc kỳ phổ có lời bình) kèm điểm và biến chính Pikafish 30k nodes:
 * `before` = điểm thế trước theo bên đi, `afterForOpp` = điểm thế sau theo bên đối phương, `pv` = biến của thế sau.
 */
function real(fen: string, from: number, to: number, pv: number[][], before: number, afterForOpp: number, loss = 0) {
  const pos = parseFen(fen);
  const move = { from, to };
  expect(isLegal(pos, move)).toBe(true);
  return {
    before: pos.board,
    move,
    after: play(pos.board, move),
    options: { pv: pv.map(([f, t]) => ({ from: f, to: t })), loss, evalBefore: { score: before }, evalAfter: { score: afterForOpp } },
  };
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
      expect(f?.lesson).toBe(2); // Phân loại tàn cục: biết thế nào lợi thắng để chủ động chuyển đổi
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
      expect(f?.lesson).toBe(28); // Chiến thuật cầu hòa
    });

    it("không kết luận khi đối phương không ăn lại (thế sau không phải tàn cuộc lý thuyết)", () => {
      const fen = "3ck4/9/3ab4/9/3r5/9/9/3R5/8R/4K4 w - - 0 1";
      const trade = mv(7, 3, 4, 3);
      const { before, after } = setup(fen, trade);
      expect(detectEndgameTrade(before, trade, after, { loss: 0, pv: [mv(0, 4, 0, 5)] })).toBeNull();
    });
  });

  describe("Tốt trong tàn cuộc", () => {
    it("phê bình Tốt xuống đáy biến Pháo Tốt đang thắng thành Pháo Tốt đáy hòa", () => {
      // Pháo Tốt có Sĩ Tượng làm ngòi; engine chấm thế trước là thắng (+300). Tốt xuống đáy: Pikafish hòa 29/30.
      const fen = "2bakab2/1P7/9/9/9/4C4/9/9/9/2BAKAB2 w - - 0 1";
      const down = mv(1, 1, 0, 1);
      const { before, after } = setup(fen, down);
      const f = detectOldPawn(before, down, after, { loss: 250, evalBefore: { score: 300 } });
      expect(f?.principle).toBe("totGia");
      expect(f?.tone).toBe("critique");
      expect(f?.endgame).toBe("Pháo Tốt đáy hòa Sĩ Tượng toàn");
      expect(f?.lesson).toBe(14); // Binh quý thần tốc: xung vội thành Tốt thấp là mất sức
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

    it("khen Tốt đổi Sĩ phá phòng tuyến (khi chỉ có điểm mất, chưa có biến engine)", () => {
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
      expect(f?.lesson).toBe(16);
    });

    it("không tính Tướng né sang cột bị chắn (không khóa thêm ô nào)", () => {
      // Tốt đỏ f6 chắn cột f: Tướng sang f0 không khóa được ô nào trong cung đen.
      const fen = "4k4/9/9/4PP3/9/2N6/p8/9/9/4K4 w - - 0 1";
      const kingOut = mv(9, 4, 9, 5);
      const { before, after } = setup(fen, kingOut);
      expect(detectKingActivity(before, kingOut, after, { loss: 0 })).toBeNull();
    });

    it("khen Xe khóa hàng, Tướng trần đối phương chỉ còn 1 đường đi", () => {
      // Xe Tướng đối Tướng trần: thắng lý thuyết, bên đi đang hơn tuyệt đối.
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      const f = detectKingBoxing(before, box, after, { loss: 0, evalBefore: { score: 2000 } });
      expect(f?.principle).toBe("boTuong");
      expect(f?.summary).toContain("1 đường đi");
    });

    it("bó Tướng là việc của bên đang hơn: bên kém thế khóa bớt một ô của Tướng đối phương thì không nói", () => {
      const fen = "4k4/9/9/9/9/R8/9/9/9/3K5 w - - 0 1";
      const box = mv(5, 0, 1, 0);
      const { before, after } = setup(fen, box);
      expect(detectKingBoxing(before, box, after, { loss: 0, evalBefore: { score: -300 } })).toBeNull();
    });

    it("ván đại sư: Pháo lui khóa đường lên của Tướng khi đang hơn rõ — Bó Tướng", () => {
      const t = real("4c3C/4k4/3a1a3/p2C5/9/8P/9/4B4/4A4/3K5 w", 8, 26,
        [[4, 67], [30, 31], [13, 12], [26, 21], [67, 69], [21, 75], [69, 15], [76, 66], [12, 13]], 508, -520);
      expect(detectKingBoxing(t.before, t.move, t.after, t.options)?.principle).toBe("boTuong");
    });

    it("nước chiếu không phải bó Tướng: Tướng ít đường đi chỉ vì đang bị chiếu (ván đại sư, Xe chiếu dẫn tới sát)", () => {
      const t = real("4kab2/9/r1P2a3/p4N2p/2R3p2/9/1r6P/3C4B/4A4/2B1KA3 w", 38, 40,
        [[5, 13], [32, 21], [4, 5], [66, 68], [55, 59], [40, 13], [6, 22], [13, 22], [18, 9], [22, 4]], 571, -99990);
      expect(detectKingBoxing(t.before, t.move, t.after, t.options)).toBeNull();
      // Nước chiếu này chuyển vị cho đòn sát sau (giữa chừng có nước yên lặng): đốn tỏa
      expect(endgamePrincipleFacts(t.before, t.move, t.after, t.options)[0]?.principle).toBe("kyThuatDonToa");
    });

    it("khen nước chờ bằng Sĩ khi đang thắng và đối phương gần hết nước", () => {
      const fen = "4k4/R8/9/9/9/9/9/9/4A4/3K5 w - - 0 1";
      const wait = mv(8, 4, 9, 5);
      const { before, after } = setup(fen, wait);
      const f = detectWaitingMove(before, wait, after, { loss: 0, evalBefore: { score: 1000 } });
      expect(f?.principle).toBe("nuocCho");
      expect(f?.summary).toContain("1 nước");
      expect(f?.lesson).toBe(24);
    });

    it("không coi là nước chờ khi chưa thắng thế", () => {
      const fen = "4k4/R8/9/9/9/9/9/9/4A4/3K5 w - - 0 1";
      const wait = mv(8, 4, 9, 5);
      const { before, after } = setup(fen, wait);
      expect(detectWaitingMove(before, wait, after, { loss: 0, evalBefore: { score: 30 } })).toBeNull();
    });
  });

  describe("Mã / Pháo theo số ngòi trên bàn", () => {
    it("đầu ván đủ ngòi: giữ giá trị chuẩn Pháo 450, Mã 400", () => {
      const b = initialPosition().board;
      expect(screenCount(b)).toBe(18);
      expect(minorValues(b)).toEqual({ n: 400, c: 450 });
    });

    it("hết Sĩ Tượng, chỉ còn 1 Tốt: Mã đáng giá hơn Pháo", () => {
      const b = parseFen("4k4/9/9/9/2P6/2C6/4N4/9/9/4K4 w - - 0 1").board;
      const v = minorValues(b);
      expect(v.n).toBeGreaterThan(v.c);
    });

    // Đỏ: Pháo c4 có ngòi là Tốt c5, ăn Mã đen c7; Mã đen b9 ăn lại. Không còn Sĩ Tượng, chỉ 1 Tốt.
    const fen = "1n2k4/9/2n6/9/2P6/2C6/4N4/9/9/4K4 w - - 0 1";
    const trade = mv(5, 2, 2, 2);
    const recapture = mv(0, 1, 2, 2);

    it("khen đổi Pháo lấy Mã khi bàn thưa ngòi", () => {
      const { before, after } = setup(fen, trade);
      const f = detectMinorTrade(before, trade, after, { loss: 0, pv: [recapture] });
      expect(f?.principle).toBe("doiPhaoLayMa");
      expect(f?.summary).toContain("1 quân làm ngòi");
      expect(f?.lesson).toBe(22); // Mã vs Pháo: Pháo cần ngòi, Mã độc lập tác chiến
    });

    it("không coi là đổi khi đối phương không ăn lại", () => {
      const { before, after } = setup(fen, trade);
      expect(detectMinorTrade(before, trade, after, { loss: 0, pv: [mv(0, 4, 1, 4)] })).toBeNull();
    });

    it("chê đổi Mã lấy Pháo khi bàn thưa ngòi và engine chấm lỗi", () => {
      // Đỏ: Mã e3 ăn Pháo đen d5; Xe đen d9 ăn lại. Không còn Sĩ Tượng, chỉ 1 Tốt.
      const fen2 = "3rk4/9/9/9/3cP4/9/4N4/2C6/9/4K4 w - - 0 1";
      const take = mv(6, 4, 4, 3);
      const { before, after } = setup(fen2, take);
      const f = detectMinorTrade(before, take, after, { loss: 120, pv: [mv(0, 3, 4, 3)] });
      expect(f?.principle).toBe("doiMaLayPhao");
      expect(f?.tone).toBe("critique");
    });

    it("bàn còn đủ Sĩ Tượng thì không nói gì về đổi Mã / Pháo", () => {
      const fen3 = "1nbakab2/9/2n6/9/2P6/2C6/4N4/9/9/2BAKAB2 w - - 0 1";
      const { before, after } = setup(fen3, trade);
      expect(detectMinorTrade(before, trade, after, { loss: 0, pv: [recapture] })).toBeNull();
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

  describe("Kỳ lý tàn cuộc Triệu Hâm Hâm: chỉ gắn khi biến engine cho thấy đúng điều bài giảng nói", () => {
    describe("Bài 40 — Hải để lao nguyệt", () => {
      // Kỳ phổ: "沉底炮借黑将做架子赶开黑车，这种方式旧称'海底捞月'" — Pháo đáy mượn Tướng đen làm ngòi đuổi Xe đen.
      const fen = "1C2R4/3k5/3r5/9/9/9/5p3/9/9/4K4 w";

      it("Pháo đáy bình vào ngay dưới Tướng đen, lấy Tướng làm ngòi đánh Xe sau lưng Tướng", () => {
        const t = real(fen, 1, 3, [[59, 58]], 824, -949);
        const f = detectHaiDeLaoNguyet(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("haiDeLaoNguyet");
        expect(f?.lesson).toBe(40);
        expect(f?.summary).toContain("lấy chính Tướng làm ngòi đánh Xe");
        expect(endgamePrincipleFacts(t.before, t.move, t.after, t.options)[0]?.principle).toBe("haiDeLaoNguyet");
      });

      it("cùng hình nhưng engine không chấm bên đi hơn thì không gắn", () => {
        const t = real(fen, 1, 3, [[59, 58]], 0, 0);
        expect(detectHaiDeLaoNguyet(t.before, t.move, t.after, t.options)).toBeNull();
      });

      it("không có điểm engine thì không gắn", () => {
        const { before, after } = setup(fen, { from: 1, to: 3 });
        expect(detectHaiDeLaoNguyet(before, { from: 1, to: 3 }, after, { loss: 0 })).toBeNull();
      });
    });

    describe("Bài 24 — nước chờ: đối phương buộc phải tự đi và tự hở", () => {
      it("ván đại sư: Tượng nhích một nước không đe dọa gì, Pháo đen buộc phải ăn Sĩ rồi bị Tướng ăn lại", () => {
        const t = real("3a1k3/4a4/9/p3R2Np/5P3/P8/9/4B4/8r/c3KAB2 w", 67, 51,
          [[81, 86], [85, 86], [80, 72], [31, 32], [13, 23], [34, 23], [72, 45], [23, 30], [5, 4], [41, 40], [3, 13]], 581, -610);
        const f = detectWaitingMove(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("nuocCho");
        expect(f?.summary).toContain("Pháo ăn Sĩ");
        expect(f?.summary).toContain("Tướng ăn Pháo");
      });

      it("nước chuẩn bị một đòn vài nước sau không phải nước chờ (ván đại sư: Tốt tiến để mấy nước sau bắt Mã)", () => {
        const t = real("2bak1b2/1R2a4/N1n3n2/p7p/9/2P6/P3p1c1P/4B4/4A4/2BAK4 w", 47, 38,
          [[4, 5], [18, 11], [24, 31], [38, 29], [31, 48], [29, 20], [48, 55], [76, 86], [55, 74], [85, 76]], 243, -170);
        expect(detectWaitingMove(t.before, t.move, t.after, t.options)).toBeNull();
      });
    });

    describe("Bài 26 — đốn tỏa", () => {
      const t = real("4kab2/4aR3/4N4/3P5/4p1p1p/9/4P1n2/3AB1r2/4A4/4KcB2 w", 22, 11,
        [[4, 3], [14, 86], [69, 78], [86, 32], [78, 77], [76, 68], [77, 74]], 207, -189);

      it("ván đại sư: Mã chiếu buộc Tướng đen tránh, Xe nhân nước tiên ăn Pháo", () => {
        const f = detectCheckThenWin(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("kyThuatDonToa");
        expect(f?.summary).toContain("Mã chiếu");
        expect(f?.summary).toContain("Xe ăn Pháo");
      });

      it("không gọi là vây khốn: Pháo đen không chạy được chỉ vì đang bị chiếu", () => {
        expect(detectTrap(t.before, t.move, t.after, t.options)).toBeNull();
      });
    });

    describe("Bài 25 — vây khốn bắt quân", () => {
      it("ván đại sư: Pháo bình trung lộ, Pháo đỏ chạy đâu cũng bị ăn, theo biến bị bắt", () => {
        const t = real("4k4/4a4/4b4/1P7/5c3/4rp3/7R1/4C4/4K4/9 b", 41, 40,
          [[61, 70], [50, 59], [76, 77], [40, 67], [28, 29], [67, 58], [29, 20], [58, 56], [70, 7], [13, 5], [20, 21], [22, 6]], 514, -543);
        const f = detectTrap(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("chienThuatVayKhon");
        expect(f?.summary).toContain("Pháo ăn Pháo");
      });
    });

    describe("Bài 23 — kiềm chế", () => {
      it("ván đại sư: Xe ghim Pháo đen vào Tướng, theo biến Pháo đỏ ăn được chính con Pháo bị ghim", () => {
        const t = real("4kc3/4a2r1/6R2/p8/8P/2P6/9/5A3/9/2BAKCB2 w", 24, 6,
          [[4, 3], [86, 5], [13, 5], [6, 5], [3, 12], [5, 41], [16, 13], [85, 86], [13, 16], [41, 39], [12, 13]], 508, -514);
        const f = detectPin(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("chienThuatKiemChe");
        expect(f?.summary).toContain("ghim Pháo");
      });

      it("nước Xe ăn Pháo không phải kiềm chế dù sau đó có quân bị ghim (ván đại sư)", () => {
        const t = real("2cak1b2/4a4/4b4/R5N1p/1r7/4P1B2/P8/4B4/4A4/1C2KA3 b", 37, 82,
          [[76, 84], [82, 46], [27, 45], [46, 55], [49, 40], [2, 74], [45, 47], [74, 72]], -1, -1);
        expect(detectPin(t.before, t.move, t.after, t.options)).toBeNull();
      });
    });

    describe("Bài 27 — đánh chặn", () => {
      it("ván đại sư: Pháo chắn ngang đường Pháo đen, chặn nước chiếu bắt Pháo", () => {
        const t = real("2b1k4/4a4/4ba3/3n3c1/1C7/9/P1N6/3AB4/4A4/4K1B2 w", 37, 43,
          [[30, 19], [54, 45], [34, 16], [56, 39], [16, 17], [39, 28], [17, 35]], 13, -10, 3);
        const f = detectInterception(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("kyThuatDanhChan");
        expect(f?.summary).toContain("chiếu bắt Pháo");
      });

      it("Sĩ lui chặn một nước chiếu thường ngày không phải kỹ thuật đánh chặn (ván đại sư)", () => {
        const t = real("3ak1b2/4a4/4bn3/p8/3P4R/9/P8/C8/4A4/2r1KA3 w", 76, 84,
          [[83, 29], [44, 41], [23, 42], [86, 76], [29, 31], [85, 86], [31, 35], [86, 85], [35, 31]], 0, 0);
        expect(detectInterception(t.before, t.move, t.after, t.options)).toBeNull();
        expect(endgamePrincipleFacts(t.before, t.move, t.after, t.options)).toEqual([]);
      });
    });

    describe("Bài 5, 6, 21 — mưu Binh và dọn Tốt", () => {
      it("ván đại sư: Xe ăn Tốt chưa qua sông, đối phương không lấy lại được — mưu Binh có Xe", () => {
        const t = real("3a2b2/4k4/1c1abN3/4pR2p/3P5/2B1P4/2r6/9/4A4/2BAK4 w", 32, 31,
          [[13, 14], [31, 32], [21, 13], [23, 16], [13, 23], [32, 30], [56, 47], [30, 3], [19, 20], [83, 63], [47, 49], [3, 6], [14, 13]], 273, -238);
        const f = detectPawnHunt(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("muuBinhCoXe");
        expect(f?.lesson).toBe(5);
        expect(f?.summary).toContain("Xe ăn Tốt");
      });

      it("Xe ăn Pháo rồi mới ăn Tốt: ý chính là ăn Pháo, không gọi là mưu Binh (ván đại sư)", () => {
        const t = real("4kab2/4a3C/4b3r/p8/9/9/Pc2P3P/4B2R1/4A3N/2BAK4 b", 26, 17,
          [[58, 49], [17, 62], [70, 61], [62, 80], [61, 55], [80, 89], [76, 86]], -5, 4);
        expect(detectPawnHunt(t.before, t.move, t.after, t.options)).toBeNull();
      });

      it("ván đại sư: Xe bám tuyến, Tốt đen bờ sông tiến qua là bị ăn — khống chế tuyến", () => {
        const t = real("3akab2/9/4bn3/p8/3P4p/4r4/PR7/4C4/4A4/2B1KA3 w", 55, 62,
          [[5, 13], [67, 71], [49, 47], [71, 44], [47, 83], [76, 84], [23, 42], [62, 57], [42, 35], [44, 80], [13, 5]], 0, -1);
        const f = detectRiverBlock(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("donTotKhongCheTuyen");
        expect(f?.summary).toContain("Tốt lộ 9");
      });
    });

    describe("Bài 7, 18, 19 — phá Sĩ Tượng, đánh vào cung khuyết", () => {
      it("ván đại sư: Xe ăn Tượng giữ được, bên đi còn Xe — phá Sĩ Tượng có Xe", () => {
        const t = real("4kab2/1r7/r1P2a3/p4N2p/2b3p2/9/8P/3CB3B/4A4/2R1KA3 w", 83, 38,
          [[6, 22], [38, 29], [10, 46], [32, 21], [4, 13], [67, 83]], 527, -521, 6);
        const f = detectGuardBreak(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("phaSiTuongCoXe");
        expect(f?.summary).toContain("Xe ăn Tượng");
      });

      it("ván đại sư: đen chỉ còn một Sĩ, Xe chiếu rồi ăn nốt Sĩ chiếu bí — khuyết Sĩ kỵ Xe", () => {
        const t = real("5k3/4a1N2/9/7R1/2p6/8r/4P3P/4B4/4A4/4KAB2 w", 34, 32, [[13, 23], [32, 23]], 99997, -99998);
        const facts = endgamePrincipleFacts(t.before, t.move, t.after, t.options);
        expect(facts[0]?.principle).toBe("khuyetSiKyGi");
        expect(facts[0]?.summary).toContain("chiếu bí");
      });

      it("ván đại sư: đỏ chỉ còn một Tượng, Xe đen bình chiếu đôi cùng Pháo rồi Pháo ăn Xe — khuyết Tượng sợ Pháo", () => {
        const t = real("3a2R2/4ak3/4b2P1/9/3c5/4r4/9/9/3K5/6B2 b", 39, 12,
          [[6, 15], [14, 5], [15, 16], [49, 48], [75, 76], [12, 16], [25, 16], [48, 50], [16, 15], [50, 77], [76, 85], [77, 86], [85, 76], [86, 87]], 635, -638);
        const f = detectWeakPalaceAttack(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("khuyetTuongKyPhao");
        expect(f?.summary).toContain("chiếu đôi cùng Pháo");
        expect(f?.summary).toContain("Pháo ăn Xe");
      });

      it("Pháo không hề chiếu Tướng, chỉ ăn Mã: không gọi là khuyết Tượng sợ Pháo (ván đại sư)", () => {
        const t = real("3k5/4a2N1/1r3a3/1n6R/p1p6/9/P3P3P/4B4/4A4/2C1KAB2 w", 83, 84,
          [[38, 47], [35, 29], [3, 4], [84, 82], [47, 46], [82, 28], [4, 3], [29, 30], [19, 21]], 814, -800, 14);
        expect(detectWeakPalaceAttack(t.before, t.move, t.after, t.options)).toBeNull();
      });
    });

    describe("Bài 30, 31 — tổ hợp công sát (theo các quân thật sự chiếu trong biến)", () => {
      it("ván đại sư: Mã ăn Sĩ rồi Xe Mã thay nhau chiếu tới chết — Xe Mã lãnh chiêu", () => {
        const t = real("3a1k3/9/5a3/p3R2Np/5P3/P5B2/9/9/8r/c3KAB2 w", 34, 23,
          [[3, 13], [23, 16], [5, 4], [31, 13], [4, 3], [13, 4], [3, 12], [16, 23], [12, 21], [4, 3]], 99989, -99990);
        expect(detectMatingAttack(t.before, t.move, t.after, t.options)?.principle).toBe("xeMaLanhChieu");
      });

      it("ván đại sư: Xe Pháo chiếu dẫn tới sát — Xe Pháo hợp công", () => {
        const t = real("5k3/4a1N2/9/3R5/2p6/5r2C/4P3P/4B4/4A4/4KAB2 w", 30, 34,
          [[50, 86], [76, 86], [5, 14], [53, 17], [14, 23], [34, 32]], 99991, -99994);
        const f = detectMatingAttack(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("xePhaoHopCong");
        expect(f?.summary).toContain("chiếu bí");
      });
    });

    describe("Bài 9, 10, 15, 20 — khống chế và phòng thủ", () => {
      it("ván đại sư: Xe chiếm trung lộ, Tướng đen ở lộ 6 không về được trung lộ", () => {
        const t = real("9/1r3k3/3Rc1R2/8p/9/5r3/P7P/4B4/1n2A4/2B1KA3 w", 24, 22,
          [[10, 46], [21, 12], [14, 5], [22, 24], [73, 66], [12, 66], [46, 48], [24, 6], [5, 14], [6, 15], [14, 5]], 555, -589);
        const f = detectCenterFile(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("nguyenTacChiemTrung");
        expect(f?.summary).toContain("lộ 6");
      });

      it("ván đại sư: Tốt khóa hàng thứ hai, Tướng đen bị giam ở hàng đáy — tuyến áp đáy", () => {
        const t = real("3k5/9/4b4/3PN4/4n1b1P/9/9/4p4/9/3K5 w", 30, 21,
          [[3, 4], [21, 12], [42, 26], [31, 20], [4, 5], [12, 13], [40, 51], [84, 85], [51, 32], [85, 86], [67, 68], [44, 35], [32, 49], [20, 31]], 103, -68);
        expect(detectBackRankLock(t.before, t.move, t.after, t.options)?.principle).toBe("loSuonApDay");
      });

      it("ván đại sư: Sĩ đen đứng vào chân Mã đỏ, Mã mất nước chiếu — Sĩ Tượng phong ấn Mã", () => {
        const t = real("4kab2/1r2a4/r3b4/p1P2N2p/6p2/9/8P/3CB3B/4A4/2R1KA3 b", 13, 23,
          [[29, 20], [10, 55], [32, 21], [4, 13], [83, 29], [13, 14], [66, 63], [55, 54], [67, 47], [5, 13], [63, 68], [54, 59]], -320, 298);
        const f = detectGuardBlocksHorse(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("siTuongPhongAn");
        expect(f?.summary).toContain("chặn chân Mã");
      });

      it("ván đại sư: Pháo từ đáy đối phương lui về nhà, mượn Sĩ làm ngòi nhắm Mã — Pháo hoàn", () => {
        const t = real("1Cba5/4ak3/9/2N2P3/3c4p/P3p4/9/4BA3/4A1n2/2BK5 w", 1, 73,
          [[49, 48], [76, 66], [44, 53], [73, 75], [78, 59], [68, 76], [53, 52], [45, 36], [39, 44], [75, 74], [44, 35], [29, 12], [35, 44]], 41, -39);
        const f = detectCannonHome(t.before, t.move, t.after, t.options);
        expect(f?.principle).toBe("coTanPhaoHoan");
        expect(f?.summary).toContain("mượn Sĩ");
      });
    });

    describe("Bài về một loại tàn cuộc: ghi chú một lần khi ván bước vào thế đó", () => {
      // Ván đại sư: Pháo đỏ ăn Xe đen, ván thành Mã Pháo đối Mã Pháo.
      const fen = "C2k1r3/9/2c1b3b/2p3p1p/pn7/9/P3P1P1P/B3B1N2/9/3AK4 w";

      it("nước ăn Xe đưa ván vào Mã Pháo đối Mã Pháo: ghi chú bài 35, không khen chê", () => {
        const { before, after } = setup(fen, { from: 0, to: 5 });
        const note = endgameTypeNote(before, { from: 0, to: 5 }, after);
        expect(note?.principle).toBe("maPhaoDoiMaPhao");
        expect(note?.tone).toBe("note");
        expect(note?.lesson).toBe(35);
        expect(note?.summary).toContain("Mã Pháo đối Mã Pháo");
      });

      it("đã ở trong thế đó thì nước đi tiếp không ghi chú lại", () => {
        const { after } = setup(fen, { from: 0, to: 5 });
        const pos = { board: after, turn: "b" as const };
        const quiet = legalMoves(pos).find((m) => !after[m.to])!;
        expect(endgameTypeNote(after, quiet, play(after, quiet))).toBeNull();
      });
    });
  });

  describe("Trên 203 ván đại sư (dữ liệu thật, không cần engine)", () => {
    // Kỳ lý kể lại chuyện xảy ra trong biến engine (ăn được gì, sát thế nào) hoặc dựa vào điểm thế sau nước đi thì
    // không được đoán khi chỉ có điểm mất. (Chiếm trung, tuyến áp đáy là nhận định hình học trên bàn cờ, chỉ cần
    // engine xác nhận nước không hớ — không thuộc nhóm này.)
    const NEEDS_LINE = new Set<EndgamePrinciple>([
      "binhTanSiTuong", "muuBinhCoXe", "muuBinhKhongXe", "phaSiTuongCoXe", "phaSiTuongKhongXe", "maHoatChienThang",
      "laoBinhKhongChet", "khuyetSiKyGi", "khuyetTuongKyPhao", "chienThuatKiemChe", "chienThuatVayKhon", "kyThuatDonToa",
      "chienThuatSamSet", "xePhaoHopCong", "xeMaLanhChieu", "xeChotPhaSiTuong", "haiDeLaoNguyet",
      "kyThuatDanhChan", "siTuongPhongAn", "coTanPhaoHoan", "donTotKhongCheTuyen",
    ]);
    const summaryLessons = new Set(Object.values(ZHAO_ENDGAME_LESSONS).filter((c) => c.kind === "summary").map((c) => c.lesson));
    const facts = MASTER_GAMES.slice(0, 80).flatMap((g) => {
      const game = convertChineseGame(g.movesCN);
      return game.moves.flatMap((m, i) =>
        endgamePrincipleFacts(game.positions[i].board, m, game.positions[i + 1].board, { loss: 0, evalBefore: { score: 300 } }));
    });

    it("chỉ có điểm mất, không có biến engine: không gắn kỳ lý nào cần biến", () => {
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.filter((f) => NEEDS_LINE.has(f.principle)).map((f) => f.principle)).toEqual([]);
    });

    it("bài tổng quát và cờ thế (bài 1, 12, 43–48) không bao giờ gắn vào nước đi", () => {
      expect(summaryLessons).toEqual(new Set([1, 12, 43, 44, 45, 46, 47, 48]));
      expect(facts.filter((f) => f.lesson !== undefined && summaryLessons.has(f.lesson))).toEqual([]);
    });

    it("ghi chú loại tàn cuộc gắn đúng thẻ bài và không khen chê", () => {
      for (const f of facts.filter((x) => x.tone === "note")) {
        expect(ZHAO_ENDGAME_LESSONS[f.lesson!]?.kind).toBe("evaluative");
        expect(f.summary).toMatch(/^Ván cờ bước vào tàn cuộc /);
      }
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
      const facts = endgamePrincipleFacts(before, box, after, { loss: 0, evalBefore: { score: 2000 } });
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
