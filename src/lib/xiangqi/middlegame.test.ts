import { describe, expect, it } from "vitest";
import { parseFen, sq, type Board, type Move } from "./engine";
import { sentence } from "./explain";
import {
  analyzeForcingPlies,
  detectInitiative,
  isOpenFile,
  isSemiOpenFile,
  detectOpenFile,
  detectExchange,
  type InitiativeFact,
  type OpenFileFact,
  type ExchangeFact,
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

  describe("4. Tích hợp câu chữ (sentence)", () => {
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
    });
  });

  describe("5. Hiệu năng thực thi", () => {
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
