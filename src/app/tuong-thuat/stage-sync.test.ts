import { describe, expect, it } from "vitest";
import { applyMove, initialPosition, parseFen, START_FEN, type Move } from "@/lib/xiangqi/engine";
import { moveNotation } from "@/lib/xiangqi/notation";
import {
  DEFAULT_STAGE_SETTINGS,
  buildStageState,
  computeCapturedPieces,
  computeMaterialBalance,
  detectBigMoment,
  generateCommentary,
  mergePanelReading,
  canReview,
  formatEvalScore,
  zigaEloRank,
  type StageReviewState,
} from "./stage-sync";

/** Đi một chuỗi nước từ thế ban đầu, trả về thế cuối, ký hiệu và quân bị ăn ở nước cuối. */
function play(moves: Move[]) {
  let pos = initialPosition();
  const notations: string[] = [];
  let captured: string | null = null;
  for (const m of moves) {
    notations.push(moveNotation(pos.board, m));
    captured = pos.board[m.to];
    pos = applyMove(pos, m);
  }
  return { pos, notations, captured };
}

describe("stage-sync", () => {
  it("đếm quân đã bị ăn của mỗi bên", () => {
    const board = [...parseFen(START_FEN).board];
    board[89] = null; // Xe đỏ
    board[19] = null; // Pháo đen
    expect(computeCapturedPieces(board)).toEqual({ redLost: ["r"], blackLost: ["c"] });
  });

  it("chênh lệch quân lực gọi theo Bạn / Đối thủ", () => {
    const board = [...parseFen(START_FEN).board];
    board[19] = null; // Đen mất Pháo
    expect(computeMaterialBalance(board, "r").text).toBe("Bạn hơn 1 Pháo");
    expect(computeMaterialBalance(board, "b").text).toBe("Đối thủ hơn 1 Pháo");
    expect(computeMaterialBalance(parseFen(START_FEN).board, "r").text).toBe("Hai bên ngang quân");
  });

  it("pháo đỏ ăn mã: bình luận và khoảnh khắc lớn đúng bên vừa đi", () => {
    // Pháo 2 (cột 7, hàng 7) bắn qua tốt ăn Mã đen ở (0,7).
    const cannonTakesHorse = { from: 7 * 9 + 7, to: 0 * 9 + 7 };
    const { pos, notations, captured } = play([cannonTakesHorse]);
    expect(captured).toBe("n");

    const asRed = generateCommentary({ board: pos.board, turn: pos.turn, lastMove: cannonTakesHorse, lastNotation: notations[0], capturedPiece: captured, mySide: "r" });
    expect(asRed).toMatchObject({ who: "Bạn", note: "Ăn Mã!", isCapture: true });
    const asBlack = generateCommentary({ board: pos.board, turn: pos.turn, lastMove: cannonTakesHorse, lastNotation: notations[0], capturedPiece: captured, mySide: "b" });
    expect(asBlack?.who).toBe("Đối thủ");

    const moment = detectBigMoment({ board: pos.board, turn: pos.turn, lastMove: cannonTakesHorse, capturedPiece: captured, mySide: "r", ply: 1 });
    expect(moment).toMatchObject({ type: "bigCapture", title: "ĂN MÃ!", id: "cap-n-1" });
  });

  it("không có nước nào: không bình luận, không khoảnh khắc", () => {
    const pos = initialPosition();
    expect(generateCommentary({ board: pos.board, turn: pos.turn, lastMove: null, mySide: "r" })).toBeNull();
    expect(detectBigMoment({ board: pos.board, turn: pos.turn, lastMove: null, mySide: "r", ply: 0 })).toBeNull();
  });

  it("buildStageState: không mang điểm engine, có khai cuộc và tóm tắt", () => {
    const centralCannon = { from: 7 * 9 + 7, to: 7 * 9 + 4 };
    const { pos, notations } = play([centralCannon]);
    const state = buildStageState({
      board: pos.board,
      turn: pos.turn,
      ply: 1,
      lastMove: centralCannon,
      checkSquare: null,
      notations,
      arrows: [],
      highlights: [],
      mySide: "r",
      settings: { ...DEFAULT_STAGE_SETTINGS, round: 3, today: { win: 2, draw: 0, loss: 1 } },
    });
    expect(state).not.toHaveProperty("eval");
    expect(state.commentary).toMatchObject({ who: "Bạn", notation: notations[0] });
    expect(state.recap).toMatchObject({ roundAndPly: "Ván 3 · Nước 1", recordText: "2 thắng · 0 hòa · 1 thua" });
    expect(state.bigMoment).toBeNull();
  });

  it("formatEvalScore: định dạng điểm centipawns sang tiếng Việt chuẩn", () => {
    expect(formatEvalScore(null)).toBe("");
    expect(formatEvalScore(undefined)).toBe("");
    expect(formatEvalScore(0)).toBe("⚖ Cân bằng (0.0)");
    expect(formatEvalScore(25)).toBe("⚖ Cân bằng (0.0)");
    expect(formatEvalScore(150)).toBe("🔴 Đỏ ưu (+1.5)");
    expect(formatEvalScore(750)).toBe("🔴 Đỏ thắng thế (+7.5)");
    expect(formatEvalScore(-200)).toBe("⚫ Đen ưu (-2.0)");
    expect(formatEvalScore(-800)).toBe("⚫ Đen thắng thế (-8.0)");
  });


  it("canReview: thực thi luật chống gian lận chính xác theo luật bàn cờ", () => {
    // 1. Trước ván (0 nước): cho phép chiếu ván cũ
    expect(canReview(false, 0)).toBe(true);
    expect(canReview(true, 0)).toBe(true);

    // 2. Ván đang đánh dở (có nước, chưa hết ván): TUYỆT ĐỐI CHẶN
    expect(canReview(false, 1)).toBe(false);
    expect(canReview(false, 12)).toBe(false);
    expect(canReview(false, 50)).toBe(false);

    // 3. Ván đã kết thúc: CHO PHÉP chiếu phân tích ván vừa đánh
    expect(canReview(true, 12)).toBe(true);
    expect(canReview(true, 60)).toBe(true);
  });

  it("buildStageState: gắn review khi được cung cấp", () => {
    const start = initialPosition();
    const review: StageReviewState = {
      gameId: "stg_rev_1",
      round: 4,
      ply: 10,
      totalPlies: 30,
      board: start.board,
      lastMove: null,
      evalScore: 350,
      bestNotation: "P2-5",
    };
    const state = buildStageState({
      board: start.board,
      turn: start.turn,
      ply: 0,
      lastMove: null,
      checkSquare: null,
      notations: [],
      arrows: [],
      highlights: [],
      mySide: "r",
      settings: DEFAULT_STAGE_SETTINGS,
      review,
    });
    expect(state.review).toEqual(review);
  });

});

describe("mergePanelReading", () => {
  const none = { name: null, points: null, stars: null };

  it("điền nick, điểm, sao đọc được; đối thủ đổi nick thì bỏ thông tin cũ", () => {
    const s = { ...DEFAULT_STAGE_SETTINGS, me: { name: "Bạn", title: "Tập Sự" }, opponent: { name: "A1", points: "900", title: "Kỳ Thủ" } };
    const next = mergePanelReading(s, { name: "W39823757", points: "1000", stars: 2 }, { name: "A40745895", points: null, stars: 2 });
    expect(next.me).toEqual({ name: "W39823757", points: "1000", stars: 2, title: "Tập Sự" });
    expect(next.opponent).toEqual({ name: "A40745895", stars: 2 });
  });

  it("cùng đối thủ: chỉ cập nhật phần mới đọc được, giữ phần còn lại", () => {
    const s = { ...DEFAULT_STAGE_SETTINGS, opponent: { name: "A40745895", points: "1020", title: "Tập Sự" } };
    expect(mergePanelReading(s, none, { name: "A40745895", points: null, stars: 2 }).opponent).toEqual({ name: "A40745895", points: "1020", title: "Tập Sự", stars: 2 });
  });

  it("không có gì đổi: trả lại đúng object cũ", () => {
    const s = { ...DEFAULT_STAGE_SETTINGS, me: { name: "W1", stars: 2 } };
    expect(mergePanelReading(s, { name: "W1", points: null, stars: 2 }, none)).toBe(s);
  });
});

describe("zigaEloRank", () => {
  it("phân loại đúng 5 bậc Elo và tính số sao tự động", () => {
    // 1. Tập sự (< 1200)
    expect(zigaEloRank(900)).toMatchObject({ tier: "tapsu", title: "Tập sự", stars: 1, avatarUrl: "/stage/avatar_tapsu.jpg" });
    expect(zigaEloRank(1000)).toMatchObject({ tier: "tapsu", stars: 2 });
    expect(zigaEloRank("1150")).toMatchObject({ tier: "tapsu", stars: 3 });

    // 2. Phong trào (1200 - 1599)
    expect(zigaEloRank(1250)).toMatchObject({ tier: "phongtrao", title: "Phong trào", stars: 1, avatarUrl: "/stage/avatar_phongtrao.jpg" });
    expect(zigaEloRank(1400)).toMatchObject({ tier: "phongtrao", stars: 2 });
    expect(zigaEloRank("1,550 Điểm")).toMatchObject({ tier: "phongtrao", stars: 3 });

    // 3. Kỳ thủ (1600 - 1999)
    expect(zigaEloRank(1650)).toMatchObject({ tier: "kythu", title: "Kỳ thủ", stars: 1, avatarUrl: "/stage/avatar_black.jpg" });
    expect(zigaEloRank(1800)).toMatchObject({ tier: "kythu", stars: 2 });

    // 4. Kỳ sĩ (2000 - 2399)
    expect(zigaEloRank(2050)).toMatchObject({ tier: "kysi", title: "Kỳ sĩ", stars: 1, avatarUrl: "/stage/avatar_red.jpg" });
    expect(zigaEloRank(2250)).toMatchObject({ tier: "kysi", stars: 2 });

    // 5. Kỳ vương (>= 2400)
    expect(zigaEloRank(2450)).toMatchObject({ tier: "kyvuong", title: "Kỳ vương", stars: 1, avatarUrl: "/stage/avatar_kyvuong.jpg" });
    expect(zigaEloRank(2750)).toMatchObject({ tier: "kyvuong", stars: 3 });
  });

  it("giữ nguyên title và stars hiện có nếu được cung cấp", () => {
    const res = zigaEloRank(1300, "Đặc Cấp Phong Trào", 3);
    expect(res).toMatchObject({ tier: "phongtrao", title: "Đặc Cấp Phong Trào", stars: 3 });
  });

  it("fallback theo từ khóa trong danh hiệu khi không có điểm Elo số", () => {
    expect(zigaEloRank(null, "Tập sự cấp 1")).toMatchObject({ tier: "tapsu", avatarUrl: "/stage/avatar_tapsu.jpg" });
    expect(zigaEloRank(null, "Phong trào cao cấp")).toMatchObject({ tier: "phongtrao", avatarUrl: "/stage/avatar_phongtrao.jpg" });
    expect(zigaEloRank(null, "Kỳ vương lừng danh")).toMatchObject({ tier: "kyvuong", avatarUrl: "/stage/avatar_kyvuong.jpg" });
    expect(zigaEloRank(null, "Kỳ sĩ Lưu Bị")).toMatchObject({ tier: "kysi", avatarUrl: "/stage/avatar_red.jpg" });
    expect(zigaEloRank(null, "Kỳ thủ Quan Vũ")).toMatchObject({ tier: "kythu", avatarUrl: "/stage/avatar_black.jpg" });
  });

  it("fallback mặc định theo phe khi không có điểm và không có danh hiệu", () => {
    expect(zigaEloRank(null, null, null, "r")).toMatchObject({ tier: "kysi", avatarUrl: "/stage/avatar_red.jpg" });
    expect(zigaEloRank(null, null, null, "b")).toMatchObject({ tier: "kythu", avatarUrl: "/stage/avatar_black.jpg" });
  });
});

describe("buildStageState - puzzle và review loại trừ nhau", () => {
  const baseParams = {
    board: parseFen(START_FEN).board,
    turn: "r" as const,
    ply: 0,
    lastMove: null,
    checkSquare: null,
    notations: [],
    arrows: [],
    highlights: [],
    mySide: "r" as const,
    settings: DEFAULT_STAGE_SETTINGS,
  };

  const sampleReview: StageReviewState = {
    gameId: "game-1",
    round: 1,
    ply: 2,
    totalPlies: 10,
    board: parseFen(START_FEN).board,
    lastMove: null,
    evalScore: 50,
  };

  const samplePuzzle = {
    puzzleId: "bach-dien-tuong",
    title: "Bạch diện tướng",
    chapter: "Sát cục cơ bản",
    goal: "Đỏ đi trước, chiếu bí trong 1 nước.",
    depth: 1,
    phase: "intro" as const,
    board: parseFen(START_FEN).board,
    lastMove: null,
    arrows: [],
    highlights: [],
    revealPly: 0,
    totalPlies: 1,
    revealed: [],
  };

  it("gán đúng puzzle vào stage state khi được truyền", () => {
    const state = buildStageState({ ...baseParams, puzzle: samplePuzzle });
    expect(state.puzzle).toBe(samplePuzzle);
    expect(state.review).toBeNull();
  });

  it("khi có cả review và puzzle: puzzle được ưu tiên và review bị tắt (loại trừ nhau)", () => {
    const state = buildStageState({ ...baseParams, review: sampleReview, puzzle: samplePuzzle });
    expect(state.puzzle).toBe(samplePuzzle);
    expect(state.review).toBeNull();
  });

  it("khi có cả biến thử và puzzle: biến thử bị tắt trên sân khấu", () => {
    const state = buildStageState({ ...baseParams, trial: { notations: ["P2-5"] }, puzzle: samplePuzzle });
    expect(state.puzzle).toBe(samplePuzzle);
    expect(state.trial).toBeNull();
  });

  it("khi không có puzzle: review hoạt động bình thường", () => {
    const state = buildStageState({ ...baseParams, review: sampleReview });
    expect(state.review).toBe(sampleReview);
    expect(state.puzzle).toBeNull();
  });
});
