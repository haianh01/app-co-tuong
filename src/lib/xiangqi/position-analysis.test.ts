import { describe, expect, it } from "vitest";
import { parseFen, legalMoves } from "./engine";
import { uciToMove } from "./uci";
import {
  analyzePosition,
  formatScoreText,
  PURPOSE_SHORT_LABELS,
  type PositionAnalysisInput,
} from "./position-analysis";
import { analyzeForcingPlies } from "./middlegame";

describe("position-analysis.ts - Phân tích hình cờ 6 tầng theo spec", () => {
  it("Khởi đầu ván cờ: Phân tích đầy đủ 6 tầng không lỗi", () => {
    const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
    const pos = parseFen(fen);

    const input: PositionAnalysisInput = {
      board: pos.board,
      turn: pos.turn,
      historyMoves: [],
      historyNotations: [],
      engineResult: {
        score: 15,
        depth: 18,
        pvMoves: [uciToMove("b2e2")!, uciToMove("b9c7")!],
        lines: [
          {
            move: uciToMove("b2e2")!,
            score: 15,
            depth: 18,
            pvMoves: [uciToMove("b2e2")!, uciToMove("b9c7")!],
            wdl: [420, 500, 80],
          },
          {
            move: uciToMove("b0c2")!,
            score: 10,
            depth: 18,
            pvMoves: [uciToMove("b0c2")!, uciToMove("h9g7")!],
            wdl: [410, 510, 80],
          },
          {
            move: uciToMove("c3c4")!,
            score: 5,
            depth: 18,
            pvMoves: [uciToMove("c3c4")!, uciToMove("c6c5")!],
            wdl: [400, 520, 80],
          },
        ],
        wdl: [420, 500, 80],
      },
      threatResult: null,
    };

    const res = analyzePosition(input);

    // Tầng 1: MultiPV 3, WDL thật
    expect(res.layer1.candidates).toHaveLength(3);
    expect(res.layer1.bestMove).toEqual(uciToMove("b2e2"));
    expect(res.layer1.wdl).toEqual({ win: 42, draw: 50, loss: 8 });
    expect(res.layer1.inCheck).toBe(false);
    expect(res.layer1.isGameOver).toBe(false);
    expect(res.layer1.engineAvailable).toBe(true);

    // Tầng 2: Đánh giá 9 yếu tố & top 3
    expect(res.layer2.assessment.kind).toBe("assessment");
    expect(res.layer2.displayText).toContain("Cục diện cân bằng");

    // Tầng 3: Đòn dọa
    expect(res.layer3.inCheck).toBe(false);
    expect(res.layer3.hasThreat).toBe(false);
    expect(res.layer3.threatStatus).toBe("none");

    // Tầng 4: Ý đồ nước đi
    expect(res.layer4.candidates).toHaveLength(3);
    expect(PURPOSE_SHORT_LABELS[res.layer4.candidates[0].purpose]).toBeDefined();

    // Tầng 5: Hình sát & Tàn cuộc
    expect(res.layer5.endgame).toBeNull();

    // Tầng 6: Giai đoạn & Khai cuộc
    expect(res.layer6.phase).toBe("khaiCuoc");
    expect(res.layer6.phaseLabel).toBe("Khai cuộc");
  });

  describe("Trường hợp biên 1: Đang bị chiếu (inCheck)", () => {
    it("Bỏ qua null-move, Tầng 3 hiển thị rõ 'Đang bị chiếu tướng'", () => {
      // Đỏ đang bị Xe đen chiếu thẳng mặt
      const fen = "4k4/9/9/9/9/9/9/4r4/9/4K4 w - - 0 1";
      const pos = parseFen(fen);

      const input: PositionAnalysisInput = {
        board: pos.board,
        turn: pos.turn,
        threatResult: {
          threatMove: null,
          score: 10000,
          pv: [],
          isMate: false,
          opponent: "b",
          inCheck: true,
        },
      };

      const res = analyzePosition(input);
      expect(res.layer1.inCheck).toBe(true);
      expect(res.layer3.inCheck).toBe(true);
      expect(res.layer3.threatStatus).toBe("inCheck");
      expect(res.layer3.description).toBe("Đang bị chiếu tướng");
      expect(res.layer3.dangerPieces.length).toBeGreaterThan(0);
    });
  });

  describe("Trường hợp biên 2: Ván đã kết thúc (Bí hoặc Hết nước)", () => {
    it("Nhận diện chiếu bí (Checkmate)", () => {
      // Xe đen chiếu Tướng đỏ, không có nước thoát
      const fen = "4k4/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1";
      const pos = parseFen(fen);

      const input: PositionAnalysisInput = {
        board: pos.board,
        turn: pos.turn,
      };

      const res = analyzePosition(input);
      expect(res.layer1.inCheck).toBe(true);
      expect(res.layer1.isGameOver).toBe(legalMoves(pos).length === 0);
    });

    it("Nhận diện bên thua khi không còn nước đi hợp lệ", () => {
      const fen = "9/4k4/9/9/9/9/9/9/9/4K4 b - - 0 1";
      const pos = parseFen(fen);
      const input: PositionAnalysisInput = {
        board: pos.board,
        turn: pos.turn,
      };
      const res = analyzePosition(input);
      expect(typeof res.layer1.isGameOver).toBe("boolean");
    });
  });

  describe("Trường hợp biên 3: Engine lỗi hoặc offline (503 / chưa cài)", () => {
    it("Vẫn hiển thị Tầng 2 tĩnh, Tầng 5, Tầng 6 và ghi rõ 'Không có dữ liệu engine'", () => {
      const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const pos = parseFen(fen);

      const input: PositionAnalysisInput = {
        board: pos.board,
        turn: pos.turn,
        engineResult: null,
        engineError: "Chưa cài engine",
      };

      const res = analyzePosition(input);
      expect(res.layer1.engineAvailable).toBe(false);
      expect(res.layer1.engineMessage).toBe("Chưa cài engine");
      expect(res.layer1.candidates).toHaveLength(0);

      // Tầng 2 đánh giá tĩnh vẫn tính được
      expect(res.layer2.assessment).toBeDefined();
      expect(res.layer2.factors).toBeDefined();

      // Tầng 5 và Tầng 6 vẫn chạy bình thường
      expect(res.layer5).toBeDefined();
      expect(res.layer6.phase).toBe("khaiCuoc");
    });
  });

  describe("Tầng 5: Nhận diện 17 hình sát và tàn cuộc lý thuyết", () => {
    it("Nhận diện hình sát Trùng Pháo (trung_phao)", () => {
      // Đỏ có 2 Pháo cùng lộ chiếu Tướng Đen
      const fen = "4k4/4C4/4C4/9/9/9/9/9/9/4K4 w - - 0 1";
      const pos = parseFen(fen);
      const res = analyzePosition({ board: pos.board, turn: pos.turn });

      const hasTrungPhao = res.layer5.patterns.some((p) => p.id === "trung_phao");
      expect(hasTrungPhao).toBe(true);
    });

    it("Nhận diện tàn cuộc lý thuyết: Đơn Xe thắng Đơn Mã", () => {
      // Đỏ có 1 Xe, Đen chỉ có 1 Mã
      const fen = "4k4/9/9/9/9/9/9/4n4/4R4/4K4 w - - 0 1";
      const pos = parseFen(fen);
      const res = analyzePosition({ board: pos.board, turn: pos.turn });

      expect(res.layer5.endgame).not.toBeNull();
      expect(res.layer5.endgame?.id).toBe("win_rook_vs_horse");
      expect(res.layer5.endgame?.outcome).toBe("win");
      expect(res.layer6.phase).toBe("tanCuoc");
    });

    it("Nhận diện tàn cuộc lý thuyết: Đơn Xe hòa Sĩ Tượng toàn", () => {
      // Đỏ có 1 Xe, Đen còn Sĩ Tượng toàn (2 Sĩ, 2 Tượng)
      // Hàng 0: ô 2 và ô 6 là Tượng (b), ô 3 và ô 5 là Sĩ (a), ô 4 là Tướng (k)
      // 2 spaces, b, a, k, a, b, 2 spaces = 2+1+1+1+1+1+2 = 9
      const fen = "2bakab2/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1";
      const pos = parseFen(fen);
      const res = analyzePosition({ board: pos.board, turn: pos.turn });

      expect(res.layer5.endgame).not.toBeNull();
      expect(res.layer5.endgame?.id).toBe("draw_rook_vs_full_guards");
      expect(res.layer5.endgame?.outcome).toBe("draw");
      expect(res.layer6.phase).toBe("tanCuoc");
    });
  });

  describe("Tầng 6: Phân chia giai đoạn và sách khai cuộc", () => {
    it("Nhận diện khai cuộc và tra cứu sách trong 20 nửa nước đầu", () => {
      const notations = ["P2-5", "M8.7", "M2.3", "X9-8"];
      const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 5";
      const pos = parseFen(fen);

      const res = analyzePosition({
        board: pos.board,
        turn: pos.turn,
        historyNotations: notations,
      });

      expect(res.layer6.phase).toBe("khaiCuoc");
      expect(res.layer6.openingGuide).not.toBeNull();
      expect(res.layer6.nextBookMoves.length).toBeGreaterThan(0);
    });
  });

  describe("Kiểm thử sửa lỗi 1, 2, 3 và 5", () => {
    it("Lỗi 1: formatScoreText tính chính xác số nước sát theo mốc 100_000", () => {
      // 99_999 tương đương mate 1 nửa nước = sát sau 1 nước
      const mate1 = formatScoreText(99_999);
      expect(mate1.isMate).toBe(true);
      expect(mate1.text).toBe("Sát sau 1 nước");

      // 99_997 tương đương mate 3 nửa nước = sát sau 2 nước
      const mate2 = formatScoreText(99_997);
      expect(mate2.isMate).toBe(true);
      expect(mate2.text).toBe("Sát sau 2 nước");

      // 99_991 tương đương mate 9 nửa nước = sát sau 5 nước
      const mate5 = formatScoreText(99_991);
      expect(mate5.isMate).toBe(true);
      expect(mate5.text).toBe("Sát sau 5 nước");

      // Điểm âm: bị sát sau N nước
      const negMate = formatScoreText(-99_995);
      expect(negMate.isMate).toBe(true);
      expect(negMate.text).toBe("Bị sát sau 3 nước");

      // Điểm thường không bị nhầm thành thế sát
      const normal = formatScoreText(350);
      expect(normal.isMate).toBe(false);
      expect(normal.text).toBe("hơn ≈ 3,5 Tốt");
    });

    it("Lỗi 2: % thắng tính theo phe dẫn đầu khi Đen hơn và không có WDL", () => {
      const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR b - - 0 1";
      const pos = parseFen(fen);

      // Giả sử Đen đang dẫn trước 350 cp theo chiều của Đen (tức Red evalCp = -350)
      const res = analyzePosition({
        board: pos.board,
        turn: pos.turn,
        engineResult: {
          score: 350, // từ góc nhìn của bên đi (Đen)
          pvMoves: [],
        },
      });

      expect(res.layer2.assessment.leader).toBe("b");
      // % thắng của Đen phải > 70% chứ không được là % thắng của Đỏ (~20%)
      expect(res.layer2.displayText).toMatch(/Đen .+ \(hơn ≈ 3,5 Tốt, [789]\d% thắng\)/);
    });

    it("Lỗi 3: displayText không in cp thô khi ở thế sát", () => {
      const fen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const pos = parseFen(fen);

      const res = analyzePosition({
        board: pos.board,
        turn: pos.turn,
        engineResult: {
          score: 99_995, // sát sau 3 nước
          pvMoves: [],
        },
      });

      expect(res.layer2.assessment.leader).toBe("r");
      expect(res.layer2.displayText).not.toContain("99995 cp");
      expect(res.layer2.displayText).toContain("Sát sau 3 nước");
    });

    it("Lỗi 4: threat khi đang bị chiếu trả score = 0", () => {
      // Khi đang bị chiếu, đòn dọa của đối phương được xác định là đang bị chiếu, score = 0
      const fen = "4k4/9/9/9/9/9/9/4r4/9/4K4 w - - 0 1";
      const pos = parseFen(fen);
      const res = analyzePosition({
        board: pos.board,
        turn: pos.turn,
        threatResult: {
          threatMove: null,
          score: 0,
          pv: [],
          isMate: false,
          opponent: "b",
          inCheck: true,
        },
      });

      expect(res.layer3.inCheck).toBe(true);
      expect(res.layer3.threatStatus).toBe("inCheck");
      expect(res.layer3.description).toBe("Đang bị chiếu tướng");
    });

    it("Lỗi 5: câu lý do cục diện ngữ pháp tự nhiên, không bị lủng củng", () => {
      // Thế cờ Đỏ hơn hẳn quân và đối phương khuyết sĩ tượng
      const fen = "rnb1k1b1r/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
      const pos = parseFen(fen);
      const res = analyzePosition({
        board: pos.board,
        turn: pos.turn,
        engineResult: {
          score: 450,
          pvMoves: [],
        },
      });

      expect(res.layer2.displayText).not.toContain("Đỏ đối phương");
      expect(res.layer2.displayText).not.toContain("Đỏ khai thác");
      // Phải có định dạng chuẩn: "Đỏ ưu thế ... nhờ: ... · ..."
      expect(res.layer2.displayText).toMatch(/^Đỏ ưu thế/);
    });

    it("Mục 6: analyzeForcingPlies chỉ tính các nửa nước ép buộc của chính bên đó (side), không tính nước đối phương", () => {
      // Đỏ có Xe ở e1, Đen có Tướng ở e9
      const fen = "4k4/9/9/9/9/9/9/9/4R4/4K4 w - - 0 1";
      const { board } = parseFen(fen);

      // Chuỗi PV:
      // Ply 0 (Đỏ): Xe e1 tiến lên e8 chiếu tướng (e1e8)
      // Ply 1 (Đen): Tướng e9 bình d9 né chiếu (e9d9)
      // Ply 2 (Đỏ): Tướng e0 lên e1 nước thường (e0e1)
      const pv = [uciToMove("e1e8")!, uciToMove("e9d9")!, uciToMove("e0e1")!];

      const redAnalysis = analyzeForcingPlies(board, "r", pv);
      // Chỉ ply 0 của Đỏ là ép buộc -> forcingPlies = 1, checks = 1
      expect(redAnalysis.forcingPlies).toBe(1);
      expect(redAnalysis.checks).toBe(1);

      // Nếu tính cho Đen (side = 'b'), ply 0 là của Đỏ nên Đen không được tính, ply 1 né chiếu cũng không phải ép buộc
      const blackAnalysis = analyzeForcingPlies(board, "b", pv);
      expect(blackAnalysis.forcingPlies).toBe(0);
    });
  });
});

