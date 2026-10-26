import { describe, expect, it } from "vitest";
import { parseFen, sq, type Board, type Move } from "./engine";
import { sentence, explainText, type Fact } from "./explain";
import {
  analyzeForcingPlies,
  detectInitiative,
  isOpenFile,
  isSemiOpenFile,
  detectOpenFile,
  detectExchange,
  detectPalaceBreaker,
  detectSacrificeForInitiative,
  detectCounterThreat,
  detectFlankOverload,
  detectZhaoTactics,
  detectSolidDefense,
  detectIncrementalGain,
  detectPositionalClamp,
  detectTransitionExchange,
  detectXuTactics,
  type InitiativeFact,
  type OpenFileFact,
  type ExchangeFact,
  type ZhaoMiddlegameFact,
  type XuMiddlegameFact,
} from "./middlegame";

function playMove(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

describe("middlegame.ts - Khái niệm trung cuộc cờ tướng (B5)", () => {
  describe("1. Tranh tiên (Initiative): Chuỗi nước ép buộc liên tiếp", () => {
    it("đếm chính xác số nước ép buộc trong PV (gồm chiếu và ăn quân)", () => {
      // Thế cờ Đỏ liên tục chiếu và ăn quân trong PV:
      // Tướng Đen ở e9 (sq(0, 4)), Mã Đen ở d7 (sq(2, 3)), Tướng Đỏ ở d0 (sq(9, 3))
      // Nước 1: Xe d2d9 (sq(7, 3) -> sq(0, 3)) chiếu ngang vào Tướng e9
      // Nước 2: Tướng Đen né e8 (sq(0, 4) -> sq(1, 4))
      // Nước 3: Xe d9 ăn Mã d7 (sq(0, 3) -> sq(2, 3))
      const pos = parseFen("4k4/9/3n5/9/9/9/9/3R5/9/3K5 w - - 0 1");
      const m1: Move = { from: sq(7, 3), to: sq(0, 3) }; // X4.7 chiếu ngang
      const r1: Move = { from: sq(0, 4), to: sq(1, 4) }; // Tg né e8
      const m2: Move = { from: sq(0, 3), to: sq(2, 3) }; // X ăn Mã d7

      const analysis = analyzeForcingPlies(pos.board, "r", [m1, r1, m2]);
      expect(analysis.forcingPlies).toBe(2);
      expect(analysis.checks).toBe(1);
      expect(analysis.captures).toBe(1);
    });

    it("dừng chuỗi ép buộc khi gặp nước đi không ép buộc", () => {
      const pos = parseFen("4k4/9/9/9/9/9/9/3R5/9/3K5 w - - 0 1");
      const quietMove: Move = { from: sq(7, 3), to: sq(7, 2) }; // X4-3 (nước chờ, không chiếu, không ăn)
      const reply: Move = { from: sq(0, 4), to: sq(1, 4) };

      const analysis = analyzeForcingPlies(pos.board, "r", [quietMove, reply]);
      expect(analysis.forcingPlies).toBe(0);
    });

    it("detectInitiative trả về InitiativeFact khi forcingPlies >= 2", () => {
      const pos = parseFen("4k4/9/3n5/9/9/9/9/3R5/9/3K5 w - - 0 1");
      const m1: Move = { from: sq(7, 3), to: sq(0, 3) };
      const r1: Move = { from: sq(0, 4), to: sq(1, 4) };
      const m2: Move = { from: sq(0, 3), to: sq(2, 3) };

      const fact = detectInitiative(pos.board, "r", [m1, r1, m2]);
      expect(fact).not.toBeNull();
      expect(fact?.kind).toBe("initiative");
      expect(fact?.forcingPlies).toBe(2);
      expect(fact?.summary).toContain("Đỏ nắm quyền chủ động");
    });
  });

  describe("2. Lộ mở (Open Files): Cột mở và chiếm lộ thông", () => {
    it("nhận diện cột mở hoàn toàn khi không có Tốt nào trên cột", () => {
      // Cột 4 (e-file) không có bất kỳ Tốt nào
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p3p1p/9/9/P1P3P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      expect(isOpenFile(pos.board, 4)).toBe(true);
      // Cột 0 (a-file) có Tốt Đen p và Tốt Đỏ P
      expect(isOpenFile(pos.board, 0)).toBe(false);
    });

    it("nhận diện cột bán mở khi phe mình không có Tốt trên cột", () => {
      // Cột 2 có Tốt Đen nhưng không có Tốt Đỏ
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P3P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      expect(isSemiOpenFile(pos.board, 2, "r")).toBe(true);
      expect(isSemiOpenFile(pos.board, 2, "b")).toBe(false);
    });

    it("detectOpenFile phát hiện Xe chuyển vào chiếm lộ mở hoàn toàn", () => {
      // Cột 4 không có Tốt, Xe ở cột 0 bình sang cột 4
      const pos = parseFen("4k4/9/9/9/9/9/9/R8/9/4K4 w - - 0 1");
      const move: Move = { from: sq(7, 0), to: sq(7, 4) }; // Xe từ a2 sang e2
      const after = playMove(pos.board, move);

      const fact = detectOpenFile(pos.board, move, after);
      expect(fact).not.toBeNull();
      expect(fact?.kind).toBe("openFile");
      expect(fact?.file).toBe(4);
      expect(fact?.fileNotation).toBe(5); // Cột 4 của Đỏ là lộ 5 (9 - 4)
      expect(fact?.isOpen).toBe(true);
      expect(fact?.summary).toContain("chiếm lộ mở cột 5");
    });
  });

  describe("3. Đổi quân có chủ đích (Purposeful Exchange): 3 lý do trung cuộc", () => {
    it("nhận diện lý do phaPhongTuyen khi Xe đổi Sĩ đối phương", () => {
      // Đỏ dùng Xe ăn Sĩ đen ở e8 (sq(1, 4))
      const pos = parseFen("3k5/4a4/9/9/9/9/9/4R4/9/4K4 w - - 0 1");
      const move: Move = { from: sq(7, 4), to: sq(1, 4) }; // Xe ăn Sĩ e8
      const after = playMove(pos.board, move);

      const fact = detectExchange(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.reason).toBe("phaPhongTuyen");
      expect(fact?.summary).toContain("phá vỡ phòng tuyến");
    });

    it("nhận diện lý do truKhuQuanCong khi đổi quân đang uy hiếp nửa bàn cờ mình", () => {
      // Xe Đen đã qua sông cắm sâu ở hàng 8 (hàng đáy Đỏ d0), Xe Đỏ ăn Xe Đen
      const pos = parseFen("4k4/9/9/9/9/9/9/9/3r5/3R1K3 w - - 0 1");
      const move: Move = { from: sq(9, 3), to: sq(8, 3) }; // Xe Đỏ ăn Xe Đen
      const after = playMove(pos.board, move);

      const fact = detectExchange(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.reason).toBe("truKhuQuanCong");
      expect(fact?.summary).toContain("trừ khử");
    });

    it("nhận diện lý do donGianHoa khi đang hơn quân lớn (> 200 điểm)", () => {
      // Đỏ hơn hẳn một Xe lớn, Xe Đỏ đổi Xe Đen ở giữa bàn cờ
      const pos = parseFen("4k4/9/9/3r5/9/9/3R5/8R/9/4K4 w - - 0 1");
      const move: Move = { from: sq(6, 3), to: sq(3, 3) }; // Xe Đỏ ăn Xe Đen d6
      const after = playMove(pos.board, move);

      const fact = detectExchange(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.reason).toBe("donGianHoa");
      expect(fact?.summary).toContain("đơn giản hóa thế trận");
    });
  });

  describe("4. Kỳ lý trung cuộc Triệu Hâm Hâm (Lục Mạch Thần Kiếm)", () => {
    it("detectPalaceBreaker phát hiện đòn Trảm Sĩ phá Tượng xé toang cung cấm", () => {
      // Đen có Tướng e9 (sq(0, 4)), Sĩ d9 (sq(0, 3)), Sĩ f9 (sq(0, 5))
      // Đỏ có Xe d7 (sq(2, 3)). Xe Đỏ chém Sĩ d9 (có căn Tướng/Sĩ giữ).
      const pos = parseFen("3akab2/9/3R5/9/9/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(2, 3), to: sq(0, 3) };
      const after = playMove(pos.board, move);

      const fact = detectPalaceBreaker(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("tramSiPhaTuong");
      expect(fact?.summary).toContain("Trảm Sĩ phá thành");
      expect(fact?.details).toContain("Xe trảm Sĩ");
    });

    it("detectPalaceBreaker xét căn sau khi ăn: quân bắt không còn làm ngòi cho Pháo đối phương", () => {
      // Xe Đỏ d4 (sq(5, 3)) là ngòi giữa Pháo Đen d1 (sq(8, 3)) và Sĩ Đen d7 (sq(2, 3)).
      // Ăn Sĩ xong Xe rời ngòi, Pháo không ăn lại được: Sĩ bị ăn không, không phải phế Xe.
      const pos = parseFen("5k3/9/3a5/9/9/3R5/9/9/3c5/4K4 w - - 0 1");
      const move: Move = { from: sq(5, 3), to: sq(2, 3) };
      const after = playMove(pos.board, move);

      const fact = detectPalaceBreaker(pos.board, move, after, { loss: 0 });
      expect(fact?.summary).toContain("cung Tướng đối phương mất một quân che");
      expect(fact?.summary).not.toContain("đổi quân lớn");
    });

    it("detectSacrificeForInitiative phát hiện đòn Khí tử tranh tiên táo bạo", () => {
      // Đen có Tướng e9 (sq(0, 4)), Xe a9 (sq(0, 0))
      // Đỏ có Xe d7 (sq(2, 3)). Đỏ tiến Xe d7 lên d9 (sq(0, 3)) chiếu ngang Tướng e9 vào tầm ăn của Xe Đen a9
      const pos = parseFen("r3k4/9/3R5/9/9/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(2, 3), to: sq(0, 3) };
      const after = playMove(pos.board, move);

      const fact = detectSacrificeForInitiative(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("khiTuTranhTien");
      expect(fact?.summary).toContain("Khí tử tranh tiên");
    });

    it("detectCounterThreat phát hiện đòn Dĩ công vi thủ khi đang bị đe dọa", () => {
      // Mã Đỏ a3 bị Xe Đen a6 bắt, không có căn. Thay vì cứu Mã, Đỏ bình Xe i1 sang g1 dọa ăn Mã đen g7
      // (không căn); Xe đứng g1 an toàn. Đen ăn Mã thì cũng mất Mã.
      const pos = parseFen("2bakab2/9/6n2/r3p4/9/9/N3P4/9/8R/3AKA3 w - - 0 1");
      const move: Move = { from: sq(8, 8), to: sq(8, 6) };
      const after = playMove(pos.board, move);

      const fact = detectCounterThreat(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("diCongViThu");
      expect(fact?.summary).toContain("Dĩ công vi thủ");
      expect(fact?.summary).toContain("dọa ăn Mã");
    });

    it("detectCounterThreat bỏ qua nước phản công bằng quân tự treo (Xe lên bị Xe đối phương ăn không)", () => {
      // Xe Đỏ i0 lên i7 cùng hàng Xe Đen a7: Đen đi trước, ăn Xe không mất gì — đó là hớ, không phải phản công.
      const pos = parseFen("4k4/9/r8/9/4p4/9/N8/9/9/3K4R w - - 0 1");
      const move: Move = { from: sq(9, 8), to: sq(2, 8) };
      const after = playMove(pos.board, move);

      expect(detectCounterThreat(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("detectCounterThreat bỏ qua khi chính quân bị dọa bỏ chạy (phòng thủ thường)", () => {
      const pos = parseFen("2bakab2/9/6n2/r3p4/9/9/N3P4/9/8R/3AKA3 w - - 0 1");
      const move: Move = { from: sq(6, 0), to: sq(4, 1) }; // Mã chạy, đồng thời dọa lại
      const after = playMove(pos.board, move);

      expect(detectCounterThreat(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("detectCounterThreat bỏ qua nước không tự tạo đe dọa mới", () => {
      // Xe Đỏ i7 đã bắt Xe Đen a7 từ trước; Đỏ chỉ đi Tướng nên không phải phản công.
      const pos = parseFen("4k4/9/r7R/9/9/9/N8/9/9/3K5 w - - 0 1");
      const move: Move = { from: sq(9, 3), to: sq(8, 3) };
      const after = playMove(pos.board, move);

      expect(detectCounterThreat(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("detectSacrificeForInitiative bỏ qua nước đổi quân ngang (đối phương ăn lại không lời)", () => {
      // Như trên nhưng Mã Đỏ c7 (sq(2, 2)) giữ ô d9: Xe Đen ăn Xe thì bị Mã ăn lại.
      const pos = parseFen("r3k4/9/2NR5/9/9/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(2, 3), to: sq(0, 3) };
      const after = playMove(pos.board, move);

      expect(detectSacrificeForInitiative(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("detectFlankOverload không tính quân còn nằm nhà (bình Pháo nước đầu)", () => {
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      const move: Move = { from: sq(7, 7), to: sq(7, 2) };
      const after = playMove(pos.board, move);

      expect(detectFlankOverload(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("detectFlankOverload: đủ hình Tụ binh mà không có biến engine xác nhận đòn thì không gắn", () => {
      // Xe Đỏ i7 đã bắt Mã đen g7; Tốt i6 qua sông, Pháo h5. Mã Đỏ f5 nhảy sang h6 — giờ Xe và Mã cùng nhắm Mã g7,
      // 4 quân tấn công trên cánh chỉ có 1 quân giữ. Hình đủ, nhưng "tụ binh" chỉ nói khi biến cho thấy các quân đó ra tay.
      const pos = parseFen("2baka3/9/4b1n1R/9/8P/5N1C1/9/9/9/3AKA3 w - - 0 1");
      const move: Move = { from: sq(5, 5), to: sq(4, 7) };
      const after = playMove(pos.board, move);

      expect(detectFlankOverload(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("detectFlankOverload bỏ qua khi các quân đứng chung cánh nhưng không cùng nhắm điểm nào", () => {
      // Xe i9 (đáy), Pháo h5, Mã sang h6: đủ 3 quân trên cánh nhưng cánh đối phương trống trơn, không có mục tiêu chung.
      const pos = parseFen("3aka2R/9/4b4/9/9/5N1C1/9/9/9/3AKA3 w - - 0 1");
      const move: Move = { from: sq(5, 5), to: sq(4, 7) };
      const after = playMove(pos.board, move);

      expect(detectFlankOverload(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("detectPalaceBreaker bỏ qua khi ăn Tượng biên mà cung đối phương không bị uy hiếp", () => {
      // Xe Đỏ a3 lên ăn Tượng a7; Mã đen c7 chặn hàng ngang nên Xe không khống chế ô nào trong cung.
      const pos = parseFen("3aka3/9/b1n6/4p4/9/9/R8/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(6, 0), to: sq(2, 0) };
      const after = playMove(pos.board, move);

      expect(detectPalaceBreaker(pos.board, move, after, { loss: 0 })).toBeNull();
    });

    it("các đòn Triệu không khen khi thiếu dữ liệu engine (không có loss/evalAfter)", () => {
      const pos = parseFen("r3k4/9/3R5/9/9/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(2, 3), to: sq(0, 3) };
      const after = playMove(pos.board, move);

      expect(detectSacrificeForInitiative(pos.board, move, after)).toBeNull();
      expect(detectSacrificeForInitiative(pos.board, move, after, { evalAfter: { score: 400 } })).toBeNull();
      expect(detectSacrificeForInitiative(pos.board, move, after, { evalAfter: { score: -50 } })?.tactic).toBe("khiTuTranhTien");
    });

    it("detectZhaoTactics trả về đòn có độ ưu tiên cao nhất", () => {
      const pos = parseFen("3akab2/9/3R5/9/9/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(2, 3), to: sq(0, 3) };
      const after = playMove(pos.board, move);

      const fact = detectZhaoTactics(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("tramSiPhaTuong");
    });
  });

  describe("5. Kỳ lý trung cuộc Hứa Ngân Xuyên (Thái Cực Bổng)", () => {
    it("detectSolidDefense phát hiện nước củng cố Sĩ/Tượng phòng thủ kiên cố khi có uy hiếp", () => {
      // Đen có Xe e4 qua sông đe dọa (sq(5, 4)), Đỏ có Sĩ d0 (sq(9, 3)) lên e1 (sq(8, 4)) củng cố trung cung
      const pos = parseFen("3k5/9/9/9/4r4/9/9/9/9/3AK4 w - - 0 1");
      const move: Move = { from: sq(9, 3), to: sq(8, 4) };
      const after = playMove(pos.board, move);

      const fact = detectSolidDefense(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("phongThuKienCo");
      expect(fact?.summary).toContain("Phòng thủ kiên cố");
      expect(fact?.details).toContain("Củng cố Sĩ");
    });

    it("detectIncrementalGain phát hiện nước Tốt qua sông tích tiểu thành đại", () => {
      // Đen có Mã d7 (sq(2, 3)), Đỏ có Tốt d5 (sq(5, 3)) tiến lên d6 (sq(4, 3)) qua sông đè Mã
      const pos = parseFen("4k4/9/3n5/9/9/3P5/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(5, 3), to: sq(4, 3) };
      const after = playMove(pos.board, move);

      const fact = detectIncrementalGain(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("tichLuyUuThe");
      expect(fact?.summary).toContain("Tích tiểu thành đại");
    });

    it("detectPositionalClamp phát hiện nước nhu hòa kiềm tỏa ghim quân thực sự", () => {
      // Đen có Tướng d9 (sq(0, 3)), Mã d7 (sq(2, 3)); Đỏ có Xe d1 (sq(8, 3)) tiến lên d5 (sq(4, 3)) ghim Mã vào Tướng
      const pos = parseFen("3k5/9/3n5/9/9/9/9/9/3R5/4K4 w - - 0 1");
      const move: Move = { from: sq(8, 3), to: sq(4, 3) };
      const after = playMove(pos.board, move);

      const fact = detectPositionalClamp(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("nhuHoaKiemToa");
      expect(fact?.summary).toContain("Nhu hòa kiềm tỏa");
      expect(fact?.details).toContain("Xe ghim Mã");
    });

    it("detectPositionalClamp KHÔNG tính khi Xe chỉ đứng ở hàng gần sông mà không ghim hay đè quân đối phương", () => {
      // Đỏ có Xe d1 tiến lên d5 trên bàn cờ trống không có quân đối phương để ghim hay đè
      const pos = parseFen("4k4/9/9/9/9/9/9/9/3R5/4K4 w - - 0 1");
      const move: Move = { from: sq(8, 3), to: sq(4, 3) };
      const after = playMove(pos.board, move);

      const fact = detectPositionalClamp(pos.board, move, after, { loss: 0 });
      expect(fact).toBeNull();
    });

    it("detectTransitionExchange phát hiện nước đổi Xe ép đổi quy tàn khi ưu thế", () => {
      // Đỏ có Xe d5 (sq(4, 3)), Đen có Xe d7 (sq(2, 3)), Đỏ ăn Xe d7 với score >= 80
      const pos = parseFen("4k4/9/3r5/9/3R5/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(4, 3), to: sq(2, 3) };
      const after = playMove(pos.board, move);

      const fact = detectTransitionExchange(pos.board, move, after, {
        loss: 0,
        evalBefore: { score: 150 },
      });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("epDoiGianHoa");
      expect(fact?.summary).toContain("Ép đổi quy tàn");
    });

    it("detectXuTactics tổng hợp ưu tiên chuẩn xác", () => {
      const pos = parseFen("4k4/9/3r5/9/3R5/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(4, 3), to: sq(2, 3) };
      const after = playMove(pos.board, move);

      const fact = detectXuTactics(pos.board, move, after, {
        loss: 0,
        evalBefore: { score: 150 },
      });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("epDoiGianHoa");
    });
  });

  describe("6. Tích hợp câu chữ (sentence & explainText theo phong cách)", () => {
    it("sentence() định dạng chuẩn xác từng fact trung cuộc", () => {
      const initFact: InitiativeFact = {
        kind: "initiative",
        side: "r",
        forcingPlies: 3,
        checks: 2,
        captures: 1,
        summary: "Đỏ nắm quyền chủ động, tạo chuỗi 3 nước ép liên tiếp với 2 đòn chiếu và 1 pha bắt quân.",
      };
      expect(sentence(initFact)).toContain("quyền chủ động");

      const openFact: OpenFileFact = {
        kind: "openFile",
        side: "r",
        file: 4,
        fileNotation: 5,
        isOpen: true,
        piece: { piece: "R", square: 76, name: "Xe" },
        summary: "Xe chiếm lộ mở cột 5, kiểm soát toàn bộ tuyến dọc trận địa.",
      };
      expect(sentence(openFact)).toContain("lộ mở cột 5");

      const exFact: ExchangeFact = {
        kind: "exchange",
        side: "r",
        move: "X4.7",
        reason: "phaPhongTuyen",
        traded: { piece: "a", square: 4, name: "Sĩ" },
        summary: "Đổi Xe lấy Sĩ đối phương nhằm phá vỡ phòng tuyến bảo vệ Tướng.",
      };
      expect(sentence(exFact)).toContain("phá vỡ phòng tuyến");

      const zhaoFact: ZhaoMiddlegameFact = {
        kind: "zhaoMiddlegame",
        side: "r",
        tactic: "tramSiPhaTuong",
        move: "X4.7",
        summary: "Trảm Sĩ phá thành theo phong cách Triệu Hâm Hâm: phế đổi Xe xé toang phòng tuyến cung Tướng, đưa Tướng đối phương vào thế hiểm nghèo.",
      };
      expect(sentence(zhaoFact)).toContain("Triệu Hâm Hâm");

      const xuFact: XuMiddlegameFact = {
        kind: "xuMiddlegame",
        side: "r",
        tactic: "phongThuKienCo",
        move: "S4.5",
        summary: "Phòng thủ kiên cố theo phong cách Thái Cực Bổng Hứa Ngân Xuyên: củng cố Sĩ tạo thế trận vững như bàn thạch, triệt tiêu mầm mống công kích của đối phương.",
      };
      expect(sentence(xuFact)).toContain("Hứa Ngân Xuyên");
    });

    it("explainText gắn tiền tố phong cách chuẩn xác theo nút bấm", () => {
      const facts: Fact[] = [
        {
          kind: "initiative",
          side: "r",
          forcingPlies: 3,
          checks: 2,
          captures: 1,
          summary: "Đỏ nắm quyền chủ động, tạo chuỗi 3 nước ép liên tiếp.",
        },
      ];

      const zhaoText = explainText(facts, "r", 1, "zhaoXinxin");
      expect(zhaoText).toContain("[Triệu Hâm Hâm");
      expect(zhaoText).toContain("hỏa lực bão táp");

      const xuText = explainText(facts, "r", 1, "xuYinchuan");
      expect(xuText).toContain("[Hứa Ngân Xuyên");

      const defaultText = explainText(facts, "r", 1, "default");
      expect(defaultText).not.toContain("[");
    });

    it("explainText chỉ khen tấn công khi chính bên đi tạo thế công", () => {
      const facts: Fact[] = [
        {
          kind: "pattern",
          patternId: "ma_hau_phao",
          patternName: "Mã hậu Pháo",
          side: "b",
          action: "allowed",
          reply: "M2.3",
        },
      ];
      const text = explainText(facts, "r", 1, "zhaoXinxin");
      expect(text).toContain("[Triệu Hâm Hâm]");
      expect(text).not.toContain("hỏa lực bão táp");
    });

    it("explainText chỉ hiện dữ kiện đại sư khớp góc nhìn đang chọn", () => {
      const zhao: Fact = { kind: "zhaoMiddlegame", side: "r", tactic: "tramSiPhaTuong", move: "X6.3", summary: "Câu Triệu." };
      const xu: Fact = { kind: "xuMiddlegame", side: "r", tactic: "tichLuyUuThe", move: "X6.3", summary: "Câu Hứa." };

      expect(explainText([zhao, xu], "r", 1, "default")).toBe("");
      expect(explainText([zhao, xu], "r", 1, "zhaoXinxin")).toBe("[Triệu Hâm Hâm - Công sát]: Câu Triệu.");
      expect(explainText([zhao, xu], "r", 1, "xuYinchuan")).toBe("[Hứa Ngân Xuyên - Thái cực]: Câu Hứa.");
    });
  });

  describe("7. Hiệu năng thực thi", () => {
    it("đánh giá 150 thế cờ trung cuộc dưới 150ms", () => {
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      const move: Move = { from: sq(9, 1), to: sq(7, 2) };
      const after = playMove(pos.board, move);

      const start = performance.now();
      for (let i = 0; i < 150; i++) {
        detectOpenFile(pos.board, move, after);
        detectExchange(pos.board, move, after);
        analyzeForcingPlies(pos.board, "r", [move]);
      }
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(150);
    });
  });
});
