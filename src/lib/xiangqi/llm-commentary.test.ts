import { describe, expect, it, vi } from "vitest";
import { buildLlmCommentaryPrompt, generateLlmCommentary } from "./llm-commentary";
import type { Fact } from "./explain";

describe("llm-commentary - Tạo prompt và lời bình cho LLM từ Fact", () => {
  const sampleFact: Fact = {
    kind: "losesPiece",
    cause: "moved",
    reply: "X1.6",
    victim: { piece: "C", square: 40, name: "Pháo" },
    attacker: { piece: "r", square: 10, name: "Xe" },
    moved: { piece: "C", square: 40, name: "Pháo" },
    took: null,
    defended: false,
    points: 450,
    free: true,
  };

  it("buildLlmCommentaryPrompt tạo prompt đầy đủ thông tin kỳ lý và JSON Fact", () => {
    const prompt = buildLlmCommentaryPrompt({
      facts: [sampleFact],
      mover: "r",
      playedNotation: "P2-5",
      betterNotation: "M2.3",
      classification: "Nước hớ",
      winDropPercent: 25.5,
      openingName: "Thuận Pháo",
    });

    // Kiểm tra system prompt
    expect(prompt.systemPrompt).toContain("Đại kiện tướng Cờ Tướng");
    expect(prompt.systemPrompt).toContain("thuật ngữ Cờ Tướng Việt Nam");
    expect(prompt.systemPrompt).toContain("Huấn luyện viên");

    // Kiểm tra user prompt
    expect(prompt.userPrompt).toContain("bên Đỏ (Tiên)");
    expect(prompt.userPrompt).toContain("P2-5");
    expect(prompt.userPrompt).toContain("M2.3");
    expect(prompt.userPrompt).toContain("Nước hớ");
    expect(prompt.userPrompt).toContain("25.5%");
    expect(prompt.userPrompt).toContain("Thuận Pháo");
    expect(prompt.userPrompt).toContain('"kind": "losesPiece"');
    expect(prompt.userPrompt).toContain('"points": 450');
  });

  it("hỗ trợ các phong cách bình luận khác nhau", () => {
    const promptGm = buildLlmCommentaryPrompt({
      facts: [sampleFact],
      mover: "b",
      playedNotation: "M8.7",
      style: "grandmaster",
    });
    expect(promptGm.systemPrompt).toContain("Đại kiện tướng sắc sảo");

    const promptHumor = buildLlmCommentaryPrompt({
      facts: [sampleFact],
      mover: "b",
      playedNotation: "M8.7",
      style: "humorous",
    });
    expect(promptHumor.systemPrompt).toContain("hóm hỉnh");

    const promptZhao = buildLlmCommentaryPrompt({
      facts: [sampleFact],
      mover: "r",
      playedNotation: "X4.7",
      style: "zhaoXinxin",
    });
    expect(promptZhao.systemPrompt).toContain("Lục Mạch Thần Kiếm");
    expect(promptZhao.systemPrompt).toContain("Triệu Hâm Hâm");

    const promptXu = buildLlmCommentaryPrompt({
      facts: [sampleFact],
      mover: "b",
      playedNotation: "S4.5",
      style: "xuYinchuan",
    });
    expect(promptXu.systemPrompt).toContain("Thái Cực Bổng");
    expect(promptXu.systemPrompt).toContain("Hứa Ngân Xuyên");
  });

  it("generateLlmCommentary trả về kết quả từ llmCaller khi có", async () => {
    const mockLlm = vi.fn().mockResolvedValue("Nước P2-5 đi Pháo vào miệng Xe mà không có quân bảo vệ, khiến Đỏ mất trắng Pháo.");

    const commentary = await generateLlmCommentary(
      {
        facts: [sampleFact],
        mover: "r",
        playedNotation: "P2-5",
      },
      mockLlm
    );

    expect(mockLlm).toHaveBeenCalledTimes(1);
    expect(commentary).toContain("mất trắng Pháo");
  });

  it("generateLlmCommentary tự động fallback về explainText khi không có llmCaller", async () => {
    const commentary = await generateLlmCommentary({
      facts: [sampleFact],
      mover: "r",
      playedNotation: "P2-5",
    });

    // Fallback về explainText chuẩn
    expect(commentary).toContain("Pháo đi vào ô bị Xe đen ăn mà không có quân bảo vệ");
  });

  it("generateLlmCommentary tự động fallback về explainText khi llmCaller ném lỗi", async () => {
    const mockFaultyLlm = vi.fn().mockRejectedValue(new Error("API rate limit exceeded"));

    const commentary = await generateLlmCommentary(
      {
        facts: [sampleFact],
        mover: "r",
        playedNotation: "P2-5",
      },
      mockFaultyLlm
    );

    expect(mockFaultyLlm).toHaveBeenCalledTimes(1);
    expect(commentary).toContain("Pháo đi vào ô bị Xe đen ăn mà không có quân bảo vệ");
  });
});
