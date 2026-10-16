import { describe, expect, it } from "vitest";
import { isLegal, parseFen, play, sq, type Board, type Move } from "./engine";
import { explainText, personaFacts, type Fact } from "./explain";
import {
  detectAllXuTactics,
  detectCentralControl,
  detectCounterFromDefense,
  detectCutOffRetreat,
  detectDefuseAttack,
  detectGradualConstriction,
  detectPieceRepositioning,
  detectPrematureAttack,
  detectPreserveMaterial,
  detectStrategicLine,
  detectStructuralWeakness,
  detectTargetingWeakness,
  detectWaitingMove,
} from "./xu-principles";
import {
  detectIncrementalGain,
  detectPositionalClamp,
  detectSolidDefense,
  detectTransitionExchange,
} from "./middlegame";

const mv = (fr: number, fc: number, tr: number, tc: number): Move => ({ from: sq(fr, fc), to: sq(tr, tc) });

/** Thế cờ + nước đi, kiểm tra nước đi hợp lệ để test không dựa trên thế cờ phi luật. */
function setup(fen: string, move: Move): { before: Board; after: Board } {
  const pos = parseFen(fen);
  expect(isLegal(pos, move)).toBe(true);
  return { before: pos.board, after: play(pos.board, move) };
}

describe("xu-principles: 16 nguyên lý trung cuộc góc nhìn Hứa Ngân Xuyên", () => {
  describe("1. Nhu hòa kiềm tỏa", () => {
    // Đen có Tướng d9 (sq(0, 3)), Mã d7 (sq(2, 3)); Đỏ có Xe d1 (sq(8, 3)) tiến lên d5 (sq(4, 3))
    const fenPin = "3k5/9/3n5/9/9/9/9/9/3R5/5K3 w - - 0 1";
    const pinMove = mv(8, 3, 4, 3);

    it("phát hiện nước ghim quân thực sự (Xe ghim Mã vào Tướng)", () => {
      const { before, after } = setup(fenPin, pinMove);
      const f = detectPositionalClamp(before, pinMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("nhuHoaKiemToa");
      expect(f?.summary).toContain("Nhu hòa kiềm tỏa");
      expect(f?.details).toContain("Xe ghim Mã");
    });

    it("KHÔNG tính khi Xe chỉ đứng ở hàng gần sông mà không ghim hay đè quân đối phương (rà lỗi)", () => {
      // Đỏ có Xe d1 tiến lên d5 trên bàn cờ trống không có quân đối phương để ghim
      const fenEmpty = "3k5/9/9/9/9/9/9/9/3R5/5K3 w - - 0 1";
      const emptyMove = mv(8, 3, 4, 3);
      const { before, after } = setup(fenEmpty, emptyMove);
      const f = detectPositionalClamp(before, emptyMove, after, { loss: 0 });
      expect(f).toBeNull();
    });
  });

  describe("2. Cố nhược kim thang (Phòng thủ kiên cố)", () => {
    // Đen có Xe e4 qua sông đe dọa (sq(5, 4)); Đỏ có Sĩ d0 (sq(9, 3)) lên e1 (sq(8, 4))
    const fenDefense = "3k5/9/9/9/9/4r4/9/9/9/3AK4 w - - 0 1";
    const sMove = mv(9, 3, 8, 4);

    it("phát hiện củng cố phòng thủ khi đối phương có quân qua sông đe dọa", () => {
      const { before, after } = setup(fenDefense, sMove);
      const f = detectSolidDefense(before, sMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("phongThuKienCo");
      expect(f?.summary).toContain("Phòng thủ kiên cố");
    });

    it("không tính khi không có nguy cơ đe dọa nào", () => {
      const fenPeace = "3k5/9/9/9/9/9/9/9/9/3AK4 w - - 0 1";
      const { before, after } = setup(fenPeace, sMove);
      const f = detectSolidDefense(before, sMove, after, { loss: 0 });
      expect(f).toBeNull();
    });
  });

  describe("3. Tích tiểu thành đại (Tích lũy ưu thế)", () => {
    // Đen có Mã d7 (sq(2, 3)); Đỏ có Tốt d5 (sq(5, 3)) tiến lên d6 (sq(4, 3)) đè Mã
    const fenPawn = "3k5/9/3n5/9/9/3P5/9/9/9/5K3 w - - 0 1";
    const pawnMove = mv(5, 3, 4, 3);

    it("phát hiện Tốt qua sông đè Mã", () => {
      const { before, after } = setup(fenPawn, pawnMove);
      const f = detectIncrementalGain(before, pawnMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("tichLuyUuThe");
      expect(f?.summary).toContain("Tích tiểu thành đại");
    });
  });

  describe("4. Ép đổi quy tàn", () => {
    // Đỏ hơn quân/điểm, chủ động đổi Xe
    const fenTrade = "3k5/9/3r5/9/3R5/9/9/9/9/5K3 w - - 0 1";
    const tradeMove = mv(4, 3, 2, 3);

    it("phát hiện đổi Xe quy tàn khi đang ưu thế", () => {
      const { before, after } = setup(fenTrade, tradeMove);
      const f = detectTransitionExchange(before, tradeMove, after, { loss: 0, evalBefore: { score: 120 } });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("epDoiGianHoa");
      expect(f?.summary).toContain("Ép đổi quy tàn");
    });
  });

  describe("5. Nôn nóng khinh suất [Cảnh tỉnh]", () => {
    // Trung cuộc còn nhiều quân lớn; Đỏ hậu phương đang bị Xe đen uy hiếp ở e3 (sq(6, 4)), nhưng lại xông Xe sang a8 (sq(1, 0)) bị engine chấm blunder
    const fen = "3k5/9/9/9/2c1C4/9/4r4/R8/9/5K3 w - - 0 1";
    const rushMove = mv(7, 0, 1, 0);

    it("cảnh tỉnh xông quân công khi hậu phương đang bị đe dọa dẫn đến blunder", () => {
      const { before, after } = setup(fen, rushMove);
      const f = detectPrematureAttack(before, rushMove, after, { loss: 160 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("nonNongKhinSuat");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("Nôn nóng khinh suất");
    });

    it("không cảnh tỉnh khi nước đi chuẩn xác (loss thấp)", () => {
      const { before, after } = setup(fen, rushMove);
      expect(detectPrematureAttack(before, rushMove, after, { loss: 20 })).toBeNull();
    });
  });

  describe("6. Lỏng lẻo trận hình [Cảnh tỉnh]", () => {
    // Trung cuộc còn nhiều quân lớn; Đỏ dâng Xe vào e6 (3, 4) bị Xe đen bắt không căn
    const fen = "3k5/4r4/9/9/2c3C2/9/9/9/4R4/5K3 w - - 0 1";
    const blunderMove = mv(8, 4, 3, 4);

    it("cảnh tỉnh nước đi làm rạn nứt cấu trúc phòng thủ", () => {
      const { before, after } = setup(fen, blunderMove);
      const f = detectStructuralWeakness(before, blunderMove, after, { loss: 400 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("longLeoTranHinh");
      expect(f?.tone).toBe("critique");
      expect(f?.summary).toContain("Lỏng lẻo trận hình");
    });
  });

  describe("7. Tằm ăn dâu (Bóp nghẹt không gian)", () => {
    // Xe Đỏ từ d2 (7, 3) bình sang e2 (7, 4) ghim Mã Đen ở e5 (4, 4) vào Tướng Đen ở e9 (0, 4), triệt tiêu 8 nước nhảy
    const fen = "4k4/9/9/9/4n4/9/9/3R5/9/3K5 w - - 0 1";
    const blockMove = mv(7, 3, 7, 4);

    it("phát hiện nước bóp nghẹt không gian đối phương", () => {
      const { before, after } = setup(fen, blockMove);
      const f = detectGradualConstriction(before, blockMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("tamAnDau");
      expect(f?.summary).toContain("Tằm ăn dâu");
    });
  });

  describe("8. Dĩ tĩnh chế động (Nước chờ thâm sâu)", () => {
    // Thế cờ an toàn, Đỏ khẽ dịch Tướng giữ thế
    const fen = "3k5/9/9/9/9/9/9/9/9/5K3 w - - 0 1";
    const waitMove = mv(9, 5, 8, 5);

    it("phát hiện nước chờ nhàn nhã giữ thế khi không có áp lực", () => {
      const { before, after } = setup(fen, waitMove);
      const f = detectWaitingMove(before, waitMove, after, { loss: 0, evalBefore: { score: 10 } });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("diTinhCheDong");
      expect(f?.summary).toContain("Dĩ tĩnh chế động");
    });
  });

  describe("9. Vận quân tinh tế (Cải thiện vị trí quân)", () => {
    // Mã biên (sq(9, 0)) nhảy vào trung tâm c1 (sq(8, 2)) gia tăng độ cơ động
    const fen = "3k5/9/9/9/9/9/9/9/9/N4K3 w - - 0 1";
    const repoMove = mv(9, 0, 8, 2);

    it("phát hiện chuyển Mã từ biên vào trung tâm mở rộng tầm hoạt động", () => {
      const { before, after } = setup(fen, repoMove);
      const f = detectPieceRepositioning(before, repoMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("dieuChinhQuanKem");
      expect(f?.summary).toContain("Vận quân tinh tế");
    });
  });

  describe("10. Khoét sâu điểm yếu", () => {
    // Đen có Tốt yếu cô lập ở d6 (sq(3, 3)); Xe Đỏ ở a0 (sq(9, 0)) sang d0 (sq(9, 3)) dọa ăn
    const fen = "3k5/9/9/3p5/9/9/9/9/9/R4K3 w - - 0 1";
    const attackMove = mv(9, 0, 9, 3);

    it("phát hiện nước dồn hỏa lực vào điểm yếu đối phương", () => {
      const { before, after } = setup(fen, attackMove);
      const f = detectTargetingWeakness(before, attackMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("khoetSauDiemYeu");
      expect(f?.summary).toContain("Khoét sâu điểm yếu");
    });
  });

  describe("11. Hóa giải sát khí", () => {
    // Đen có Xe ở e2 (sq(7, 4)) uy hiếp; Xe Đỏ ở e1 (sq(8, 4)) ăn Xe Đen giải tỏa nguy hiểm
    const fen = "3k5/9/9/9/9/9/9/4r4/4R4/5K3 w - - 0 1";
    const defuseMove = mv(8, 4, 7, 4);

    it("phát hiện nước tháo ngòi đợt tấn công nguy hiểm", () => {
      const { before, after } = setup(fen, defuseMove);
      const f = detectDefuseAttack(before, defuseMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("hoaGiaiSatKhi");
      expect(f?.summary).toContain("Hóa giải sát khí");
    });
  });

  describe("12. Chiếm lĩnh yếu đạo", () => {
    // Xe Đỏ chiếm lộ sườn 6 (cột 3) thông thoáng
    const fen = "3k5/9/9/9/9/9/9/9/9/R4K3 w - - 0 1";
    const lineMove = mv(9, 0, 9, 3);

    it("phát hiện Xe chiếm lộ sườn huyết mạch", () => {
      const { before, after } = setup(fen, lineMove);
      const f = detectStrategicLine(before, lineMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("chiemLinhYeuDao");
      expect(f?.summary).toContain("Chiếm lĩnh yếu đạo");
    });
  });

  describe("13. Bảo toàn binh lực", () => {
    // Mã Đỏ ở e5 (sq(4, 4)) bị Xe Đen ở e8 (sq(1, 4)) dọa ăn; Mã nhảy về f3 (sq(6, 5)) có Xe Đỏ ở f1 (sq(8, 5)) giữ
    const fen = "3k5/4r4/9/9/4N4/9/9/9/5R3/5K3 w - - 0 1";
    const saveMove = mv(4, 4, 6, 5);

    it("phát hiện lui quân về an toàn từ chối rủi ro", () => {
      const { before, after } = setup(fen, saveMove);
      const f = detectPreserveMaterial(before, saveMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("baoToanBinhLuc");
      expect(f?.summary).toContain("Bảo toàn binh lực");
    });
  });

  describe("14. Phản tiên đoạt thế", () => {
    // Phòng tuyến Đỏ vững chắc, Pháo Đỏ ở e2 (sq(7, 4)) chuyển sang d2 (sq(7, 3)) đe dọa Xe Đen ở d8 (sq(1, 3))
    const fen = "3k5/3r5/9/9/9/9/9/4C4/5A3/5K3 w - - 0 1";
    const counterMove = mv(7, 4, 7, 3);

    it("phát hiện phản kích giành tiên từ thế trận phòng thủ vững", () => {
      const { before, after } = setup(fen, counterMove);
      const f = detectCounterFromDefense(before, counterMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("phanTienDoatThe");
      expect(f?.summary).toContain("Phản tiên đoạt thế");
    });
  });

  describe("15. Khống chế trung lộ", () => {
    // Pháo Đỏ bình vào trung lộ (cột 4) gia cố trục trung tâm
    const fen = "3k5/9/9/9/9/9/9/1C7/9/5K3 w - - 0 1";
    const centerMove = mv(7, 1, 7, 4);

    it("phát hiện bình Pháo đầu khống chế trung lộ", () => {
      const { before, after } = setup(fen, centerMove);
      const f = detectCentralControl(before, centerMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("khongCheTrungLo");
      expect(f?.summary).toContain("Khống chế trung lộ");
    });
  });

  describe("16. Khóa đường tháo lui", () => {
    // Mã Đen ở e2 (sq(7, 4)) đã dâng sâu; Xe Đỏ ở a1 (sq(8, 0)) sang e1 (sq(8, 4)) chẹn chân Mã
    const fen = "3k5/9/9/9/9/9/9/4n4/R8/5K3 w - - 0 1";
    const trapMove = mv(8, 0, 8, 4);

    it("phát hiện chặn đường rút của quân địch dâng sâu", () => {
      const { before, after } = setup(fen, trapMove);
      const f = detectCutOffRetreat(before, trapMove, after, { loss: 0 });
      expect(f).not.toBeNull();
      expect(f?.tactic).toBe("khoaDuongThaoLui");
      expect(f?.summary).toContain("Khóa đường tháo lui");
    });
  });

  describe("Tích hợp personaFacts và explainText (Hứa Ngân Xuyên)", () => {
    it("personaFacts trả về tối đa 2 nguyên lý Hứa Ngân Xuyên mỗi nước", () => {
      const fen = "3k5/9/3n5/9/9/9/9/9/3R5/5K3 w - - 0 1";
      const pinMove = mv(8, 3, 4, 3);
      const { before, after } = setup(fen, pinMove);
      const facts = personaFacts(before, pinMove, after, { loss: 0 });
      const xuFacts = facts.filter((f) => f.kind === "xuMiddlegame");
      expect(xuFacts.length).toBeGreaterThan(0);
      expect(xuFacts.length).toBeLessThanOrEqual(2);
    });

    it("explainText gắn tiền tố [Hứa Ngân Xuyên - Cảnh tỉnh] khi nước đi vi phạm nguyên lý", () => {
      const critiqueFact: Fact = {
        kind: "xuMiddlegame",
        side: "r",
        tactic: "nonNongKhinSuat",
        move: "M8.7",
        summary: "Nôn nóng khinh suất: xông quân tấn công khi hậu phương chưa vững.",
        tone: "critique",
      };
      const text = explainText([critiqueFact], "r", 1, "xuYinchuan");
      expect(text).toMatch(/^\[Hứa Ngân Xuyên - Cảnh tỉnh\]/);
    });

    it("explainText gắn tiền tố [Hứa Ngân Xuyên - Thái cực] khi nước đi chuẩn xác theo kỳ lý Thái Cực", () => {
      const clampFact: Fact = {
        kind: "xuMiddlegame",
        side: "r",
        tactic: "nhuHoaKiemToa",
        move: "X2.4",
        summary: "Nhu hòa kiềm tỏa đậm chất Thái Cực: Xe ghim chặt Mã đối phương.",
      };
      const text = explainText([clampFact], "r", 1, "xuYinchuan");
      expect(text).toMatch(/^\[Hứa Ngân Xuyên - Thái cực\]/);
    });
  });
});
