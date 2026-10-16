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
      // Đỏ có Xe e3 (sq(6, 4)) đang bị Pháo Đen e7 (sq(2, 4)) nhắm ăn trực tiếp không căn
      // Thay vì chạy Xe, Đỏ tung Mã c7 (sq(2, 2)) nhảy d9 (sq(0, 3)) phản chiếu Tướng e9!
      const pos = parseFen("4k4/9/2N1c4/9/9/9/4R4/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(2, 2), to: sq(0, 3) };
      const after = playMove(pos.board, move);

      const fact = detectCounterThreat(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("diCongViThu");
      expect(fact?.summary).toContain("Dĩ công vi thủ");
    });

    it("detectFlankOverload phát hiện thế Tụ binh đột kích áp đảo 1 cánh", () => {
      // Cánh phải Đỏ (cols 6, 7, 8): Đỏ đã có Xe ở sq(2, 8) và Pháo ở sq(3, 7)
      // Nước này Đỏ điều thêm Mã từ sq(4, 4) sang sq(2, 6) (col 6) -> tụ đủ 3 quân tấn công cánh đó
      const pos = parseFen("8k/9/8R/7C1/4N4/9/9/9/9/4K4 w - - 0 1");
      const move: Move = { from: sq(4, 4), to: sq(2, 6) };
      const after = playMove(pos.board, move);

      const fact = detectFlankOverload(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("tuBinhDotKich");
      expect(fact?.summary).toContain("Tụ binh đột kích");
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
    it("detectSolidDefense phát hiện nước củng cố Sĩ/Tượng phòng thủ kiên cố", () => {
      // Đỏ có Tướng e0 (sq(9, 4)), Sĩ d0 (sq(9, 3)) lên e1 (sq(8, 4)) củng cố cung
      const pos = parseFen("4k4/9/9/9/9/9/9/9/9/3AK4 w - - 0 1");
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

    it("detectPositionalClamp phát hiện nước nhu hòa kiềm tỏa tuyến trọng yếu", () => {
      // Đỏ có Xe d1 (sq(8, 3)) tiến lên tuần hà d5 (sq(5, 3)) khống chế
      const pos = parseFen("4k4/9/9/9/9/9/9/9/3R5/4K4 w - - 0 1");
      const move: Move = { from: sq(8, 3), to: sq(5, 3) };
      const after = playMove(pos.board, move);

      const fact = detectPositionalClamp(pos.board, move, after, { loss: 0 });
      expect(fact).not.toBeNull();
      expect(fact?.tactic).toBe("nhuHoaKiemToa");
      expect(fact?.summary).toContain("Nhu hòa kiềm tỏa");
    });

    it("detectTransitionExchange phát hiện nước đổi Xe ép đổi quy tàn khi ưu thế", () => {
      // Đỏ có Xe d5 (sq(5, 3)), Đen có Xe d7 (sq(2, 3)), Đỏ ăn Xe d7 với score >= 80
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
