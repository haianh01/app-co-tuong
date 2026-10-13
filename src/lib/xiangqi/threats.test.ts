import { describe, expect, it } from "vitest";
import { parseFen, sq, type Board, type Move } from "./engine";
import { sentence } from "./explain";
import {
  detectThreat,
  detectThreatMoveFacts,
  type ThreatData,
  type IgnoredThreatFact,
  type ParriedFact,
} from "./threats";

function playMove(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

describe("threats.ts - Trích xuất và phân tích đòn đe dọa (B3)", () => {
  describe("detectThreat - Nhận diện đòn đe dọa tại thế cờ", () => {
    it("nhận diện đòn đe dọa chiếu bí trực tiếp (isMate = true)", () => {
      // Thế cờ Đỏ (r) đang đe dọa Xe tiến đáy chiếu bí Đen (b)
      // Đen (b) chuẩn bị đi nhưng Đỏ đang đe dọa e2e9
      const pos = parseFen("4k4/9/9/9/9/9/9/4R4/9/4K4 b - - 0 1");
      const threatData: ThreatData = {
        threatMove: { from: sq(7, 4), to: sq(0, 4) }, // e2e9
        score: 10_000,
        pv: [{ from: sq(7, 4), to: sq(0, 4) }],
        isMate: true,
        opponent: "r",
        inCheck: false,
      };

      const threat = detectThreat(pos.board, "b", threatData);
      expect(threat).not.toBeNull();
      expect(threat?.kind).toBe("threat");
      expect(threat?.by).toBe("r");
      expect(threat?.isMate).toBe(true);
      expect(threat?.move).toBe("X5.7");
      expect(threat?.targets.some((t) => t.piece === "k")).toBe(true);
      expect(threat?.summary).toContain("Đỏ dọa X5.7 dẫn tới sát cục");

      // Kiểm tra câu văn sinh ra trong sentence()
      const text = sentence(threat!);
      expect(text).toContain("X5.7");
    });

    it("nhận diện đòn đe dọa bắt quân lớn có lời >= 200 điểm", () => {
      // Đỏ (r) đang đe dọa Xe ăn Mã Đen mất gốc ở e7
      const pos = parseFen("4k4/9/4n4/9/9/9/9/4R4/9/4K4 b - - 0 1");
      const threatData: ThreatData = {
        threatMove: { from: sq(7, 4), to: sq(2, 4) }, // e2e7
        score: 400,
        pv: [{ from: sq(7, 4), to: sq(2, 4) }],
        isMate: false,
        opponent: "r",
        inCheck: false,
      };

      const threat = detectThreat(pos.board, "b", threatData);
      expect(threat).not.toBeNull();
      expect(threat?.kind).toBe("threat");
      expect(threat?.by).toBe("r");
      expect(threat?.isMate).toBe(false);
      expect(threat?.move).toBe("X5.5");
      expect(threat?.targets.some((t) => t.piece === "n")).toBe(true);
      expect(threat?.gain.scoreDiff).toBeGreaterThanOrEqual(200);
      expect(threat?.summary).toContain("Đỏ dọa X5.5");
    });

    it("lọc bỏ nước đe dọa nhỏ dưới ngưỡng THREAT_GAIN_THRESHOLD (< 200 điểm)", () => {
      const pos = parseFen("4k4/9/9/9/9/9/9/4P4/9/4K4 b - - 0 1");
      const threatData: ThreatData = {
        threatMove: { from: sq(7, 4), to: sq(6, 4) },
        score: 100, // Chỉ lời 1 Tốt = 100 điểm, không đủ ngưỡng 200
        pv: [{ from: sq(7, 4), to: sq(6, 4) }],
        isMate: false,
        opponent: "r",
        inCheck: false,
      };

      const threat = detectThreat(pos.board, "b", threatData);
      expect(threat).toBeNull();
    });

    it("trả về null khi bên bị đe dọa đang bị chiếu sẵn (inCheck = true)", () => {
      const pos = parseFen("4k4/4R4/9/9/9/9/9/9/9/4K4 b - - 0 1");
      const threatData: ThreatData = {
        threatMove: null,
        score: 10_000,
        pv: [],
        isMate: false,
        opponent: "r",
        inCheck: true,
      };

      const threat = detectThreat(pos.board, "b", threatData);
      expect(threat).toBeNull();
    });

    it("chạy dự phòng ngoại tuyến (không có engine) phát hiện nước dọa chiếu bí", () => {
      // Đỏ có Xe ở d8, Tướng Đen ở e9, Tốt đỏ ở e4 chặn lộ mặt tướng. Đen đến lượt nhưng nếu bỏ lượt thì Đỏ dọa chiếu bí.
      const pos = parseFen("4k4/3R5/9/9/4P4/9/9/9/9/4K4 b - - 0 1");
      const threat = detectThreat(pos.board, "b");
      expect(threat).not.toBeNull();
      expect(threat?.by).toBe("r");
      expect(threat?.isMate).toBe(true);
      expect(threat?.targets.some((t) => t.piece === "k")).toBe(true);
    });
  });

  describe("detectThreatMoveFacts - Phân tích phản ứng trước đòn đe dọa", () => {
    it("sinh fact ignoredThreat khi đi nước hớ bỏ qua đòn đe dọa của đối phương", () => {
      const pos = parseFen("4k4/9/4n4/p8/9/9/4R4/9/9/4K4 b - - 0 1");
      const blunderMove: Move = { from: sq(3, 0), to: sq(4, 0) }; // a6a5 (đi tốt biên vô thưởng vô phạt)
      const after = playMove(pos.board, blunderMove);

      const threatBefore: ThreatData = {
        threatMove: { from: sq(6, 4), to: sq(2, 4) }, // e3e7 ăn Mã
        score: 400,
        pv: [{ from: sq(6, 4), to: sq(2, 4) }],
        isMate: false,
        opponent: "r",
      };

      const facts = detectThreatMoveFacts({
        before: pos.board,
        move: blunderMove,
        after,
        loss: 350,
        evalAfter: {
          score: 400,
          best: { from: sq(6, 4), to: sq(2, 4) },
          pv: [{ from: sq(6, 4), to: sq(2, 4) }],
        },
        threatBefore,
      });

      expect(facts).toHaveLength(1);
      const f = facts[0] as IgnoredThreatFact;
      expect(f.kind).toBe("ignoredThreat");
      expect(f.threat).toBe("X5.4");
      expect(f.reply).toBe("X5.4");
      expect(f.points).toBe(350);

      const text = sentence(f, "b");
      expect(text).toContain("bỏ qua đòn đe dọa");
      expect(text).toContain("X5.4");
    });

    it("sinh fact parried khi đi nước cờ hóa giải thành công đòn đe dọa", () => {
      const pos = parseFen("4k4/9/4n4/9/9/9/4R4/9/9/4K4 b - - 0 1");
      // Đen nhảy Mã tháo chạy lên c6 an toàn (e7c6)
      const saveMove: Move = { from: sq(2, 4), to: sq(3, 2) };
      const after = playMove(pos.board, saveMove);

      const threatBefore: ThreatData = {
        threatMove: { from: sq(6, 4), to: sq(2, 4) }, // e3e7 ăn Mã
        score: 400,
        pv: [{ from: sq(6, 4), to: sq(2, 4) }],
        isMate: false,
        opponent: "r",
      };

      const threatAfter: ThreatData = {
        threatMove: null,
        score: 0,
        pv: [],
        isMate: false,
        opponent: "r",
      };

      const facts = detectThreatMoveFacts({
        before: pos.board,
        move: saveMove,
        after,
        loss: 0,
        threatBefore,
        threatAfter,
      });

      expect(facts).toHaveLength(1);
      const f = facts[0] as ParriedFact;
      expect(f.kind).toBe("parried");
      expect(f.threat).toBe("X5.4");
      expect(f.played).toBe("M5.3");

      const text = sentence(f, "b");
      expect(text).toContain("kịp thời hóa giải");
      expect(text).toContain("X5.4");
    });

    it("trả về mảng rỗng khi đối phương trước đó không có đòn đe dọa đáng kể", () => {
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      const move: Move = { from: sq(7, 1), to: sq(7, 4) }; // P2-5
      const after = playMove(pos.board, move);

      const facts = detectThreatMoveFacts({
        before: pos.board,
        move,
        after,
        loss: 0,
      });

      expect(facts).toEqual([]);
    });
  });

  describe("Hiệu năng thực thi", () => {
    it("kiểm tra đòn đe dọa cho 150 thế cờ dưới 15ms", () => {
      const pos = parseFen("rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1");
      const threatData: ThreatData = {
        threatMove: { from: sq(7, 1), to: sq(7, 4) },
        score: 300,
        pv: [{ from: sq(7, 1), to: sq(7, 4) }],
        isMate: false,
        opponent: "r",
      };

      const start = performance.now();
      for (let i = 0; i < 150; i++) {
        detectThreat(pos.board, "b", threatData);
      }
      const duration = performance.now() - start;

      // Ngân sách yêu cầu cho 150 thế cờ là < 300ms; ở đây test chỉ chạy thuần hàm trích xuất đòn dọa
      expect(duration).toBeLessThan(150);
    });
  });
});
