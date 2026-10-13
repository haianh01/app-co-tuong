import { describe, expect, it } from "vitest";
import { parseFen, sq, type Board, type Move } from "./engine";
import { sentence, moveIdea } from "./explain";
import { detectIntent, type IntentFact } from "./intent";

function playMove(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

describe("intent.ts - Trích xuất ý đồ nước đi và giải thích nước tốt (B4)", () => {
  describe("detectIntent - Nhận diện các mục đích kỳ lý", () => {
    it("nhận diện thí quân (thiQuan) khi bỏ quân lớn để mở đường sát cục", () => {
      // Đỏ thí Xe đâm đáy ăn Sĩ (e2e9) vào miệng Tướng đối phương để dẫn tới chiếu bí
      const pos = parseFen("3k5/4a4/9/9/4P4/9/9/4R4/9/4K4 w - - 0 1");
      const sacMove: Move = { from: sq(7, 4), to: sq(0, 4) }; // e2e9
      const after = playMove(pos.board, sacMove);

      const intent = detectIntent(pos.board, sacMove, after, {
        pv: [sacMove],
        evalAfter: { score: -99999 }, // Đối phương bị chiếu bí
        loss: 0,
      });

      expect(intent).not.toBeNull();
      expect(intent?.purposes).toContain("thiQuan");
      expect(intent?.purposes).toContain("datSat");
      expect(intent?.summary).toContain("Thí");
      expect(intent?.summary).toContain("sát cục");
    });

    it("nhận diện đạt sát (datSat) khi nước đi chiếu bí ngay lập tức", () => {
      // Thế Bạch diện tướng: X1-6 chiếu bí ngay
      const pos = parseFen("3k1a3/9/8R/9/P6c1/5n3/p7p/6N2/9/3AKAB2 w - - 0 1");
      const mateMove: Move = { from: sq(2, 8), to: sq(2, 3) }; // X1-6 chiếu bí
      const after = playMove(pos.board, mateMove);

      const intent = detectIntent(pos.board, mateMove, after, {
        loss: 0,
      });

      expect(intent).not.toBeNull();
      expect(intent?.purposes).toContain("datSat");
      expect(intent?.summary).toContain("chiếu bí");
    });

    it("nhận diện lập hình sát cục (lapHinh) khi hình thành thế sát cục kinh điển", () => {
      // Thế cờ Đỏ nhảy Mã vào chân cản lập thế Mã hậu Pháo
      // Pháo đỏ ở e9, Mã đỏ ở e7 chuẩn bị nhảy vào d5
      const before = parseFen("4k4/4C4/9/9/9/4N4/9/9/9/4K4 w - - 0 1").board;
      const move: Move = { from: sq(5, 4), to: sq(3, 3) }; // e4d6
      const after = playMove(before, move);

      const intent = detectIntent(before, move, after, { loss: 0 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes.some((p) => p === "lapHinh" || p === "caiThienQuan")).toBe(true);
    });

    it("nhận diện ăn quân (anQuan) khi bắt quân lớn có lời", () => {
      // Đỏ dùng Xe e2 ăn Mã e7 không có quân bảo vệ (lời 1 Mã)
      const pos = parseFen("3k5/9/4n4/9/9/9/9/4R4/9/4K4 w - - 0 1");
      const capMove: Move = { from: sq(7, 4), to: sq(2, 4) }; // Xe ăn Mã e7
      const after = playMove(pos.board, capMove);

      const intent = detectIntent(pos.board, capMove, after, { loss: 0 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes).toContain("anQuan");
      expect(intent?.summary).toContain("Ăn Mã");
    });

    it("nhận diện hóa giải (hoaGiai) khi giải chiếu tướng an toàn", () => {
      // Đỏ đang bị Xe đen chiếu tướng, Tướng đỏ bước né chiếu
      const pos = parseFen("4k4/9/9/9/9/9/4r4/9/9/4K4 w - - 0 1");
      const escapeMove: Move = { from: sq(9, 4), to: sq(9, 3) }; // e0d0
      const after = playMove(pos.board, escapeMove);

      const intent = detectIntent(pos.board, escapeMove, after, { loss: 0 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes).toContain("hoaGiai");
      expect(intent?.summary).toContain("Giải chiếu tướng");
    });

    it("nhận diện bó quân (boQuan) khi cản chân Mã đối phương", () => {
      const pos = parseFen("3k5/9/R3n4/p8/4P4/9/9/9/9/4K4 w - - 0 1");
      const blockMove: Move = { from: sq(4, 4), to: sq(3, 4) }; // e5e6 ngáng chân Mã e7
      const after = playMove(pos.board, blockMove);

      const intent = detectIntent(pos.board, blockMove, after, { loss: 0 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes).toContain("boQuan");
    });

    it("nhận diện đổi quân (doiQuan) khi Xe ăn Xe đối phương", () => {
      // Đen có Tướng ở d9 bảo vệ Xe ở d8; Đỏ dùng Xe ở d2 ăn Xe d8 (đổi quân cân bằng)
      const pos = parseFen("3k5/3r5/9/9/9/9/9/3R5/9/4K4 w - - 0 1");
      const tradeMove: Move = { from: sq(7, 3), to: sq(1, 3) }; // Xe ăn Xe d8
      const after = playMove(pos.board, tradeMove);

      const intent = detectIntent(pos.board, tradeMove, after, { loss: 0 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes).toContain("doiQuan");
      expect(intent?.summary).toContain("Đổi quân");
    });

    it("nhận diện cải thiện quân (caiThienQuan) khi Mã lên hà khẩu", () => {
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      // Nước Mã 2 tiến 3 (h0g2)
      const move: Move = { from: sq(9, 1), to: sq(7, 2) };
      const after = playMove(pos.board, move);

      const intent = detectIntent(pos.board, move, after, { loss: 0 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes).toContain("caiThienQuan");
    });

    it("nhận diện giữ tiên (giuTien) khi chiếu ép đối phương", () => {
      const pos = parseFen("4k4/9/9/9/4P4/9/9/9/3R5/4K4 w - - 0 1");
      const checkMove: Move = { from: sq(8, 3), to: sq(0, 3) }; // d1d9 chiếu
      const after = playMove(pos.board, checkMove);

      const intent = detectIntent(pos.board, checkMove, after, { loss: 0 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes.some((p) => p === "giuTien" || p === "datSat")).toBe(true);
    });

    it("nhận diện kỹ thuật tàn cuộc (kyThuatTanCuoc) trong thế cờ tàn", () => {
      // Tàn cuộc Đơn Tốt áp sát
      const pos = parseFen("4k4/4P4/9/9/9/9/9/9/9/4K4 w - - 0 50");
      const pawnMove: Move = { from: sq(1, 4), to: sq(0, 4) }; // Tốt tiến e9
      const after = playMove(pos.board, pawnMove);

      const intent = detectIntent(pos.board, pawnMove, after, { loss: 0, ply: 60 });
      expect(intent).not.toBeNull();
      expect(intent?.purposes.some((p) => p === "kyThuatTanCuoc" || p === "datSat")).toBe(true);
    });
  });

  describe("Tích hợp moveIdea và sentence", () => {
    it("sentence() định dạng câu tự nhiên từ intent fact", () => {
      const fact: IntentFact = {
        kind: "intent",
        move: "X5.7",
        side: "r",
        purposes: ["thiQuan", "datSat"],
        line: ["X5.7", "Tg5.1"],
        summary: "Thí Xe mở đường sát cục quyết định",
        pieces: [],
      };

      const text = sentence(fact);
      expect(text).toBe("Thí Xe mở đường sát cục quyết định");
    });

    it("moveIdea() trả về intent khi là nước tốt nhất có yếu tố thí quân / sát cục", () => {
      const pos = parseFen("3k5/4a4/9/9/4P4/9/9/4R4/9/4K4 w - - 0 1");
      const sacMove: Move = { from: sq(7, 4), to: sq(0, 4) }; // e2e9

      const fact = moveIdea(
        pos.board,
        sacMove,
        null,
        20,
        undefined,
        undefined,
        true, // isBest
        [sacMove], // pv
        { evalAfter: { score: -99999 } },
      );

      expect(fact.kind).toBe("intent");
      if (fact.kind === "intent") {
        expect(fact.purposes).toContain("thiQuan");
        expect(fact.purposes).toContain("datSat");
      }
    });
  });

  describe("Hiệu năng thực thi", () => {
    it("đánh giá ý đồ cho 150 thế cờ dưới 150ms", () => {
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      const move: Move = { from: sq(7, 1), to: sq(7, 4) }; // P2-5
      const after = playMove(pos.board, move);

      const start = performance.now();
      for (let i = 0; i < 150; i++) {
        detectIntent(pos.board, move, after, { loss: 0, ply: 1 });
      }
      const duration = performance.now() - start;

      // Ngân sách yêu cầu cho 150 thế cờ là < 300ms
      expect(duration).toBeLessThan(150);
    });
  });
});
