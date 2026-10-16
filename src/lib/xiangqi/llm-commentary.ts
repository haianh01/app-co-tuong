// Sinh prompt và lời bình luận từ các Fact kỳ lý cho LLM (OpenAI, Gemini, Claude...).
// Dựa trên cấu trúc Fact JSON thuần từ engine/explain.ts.
// Nếu không cấu hình LLM, tự động fallback về lời bình mẫu chuẩn của explainText().

import type { Side } from "./engine";
import { explainText, type Fact } from "./explain";
import type { TheoreticalEndgame } from "./endgame";

export interface LlmCommentaryOptions {
  facts: Fact[];
  mover: Side;
  playedNotation: string;
  betterNotation?: string;
  classification?: string; // "Nước hớ", "Nước kém", "Thiếu chính xác", "Nước hay", v.v.
  winDropPercent?: number; // % sụt giảm xác suất thắng
  openingName?: string;
  endgame?: TheoreticalEndgame | null;
  /** Tùy chọn phong cách bình luận: "coach" (huấn luyện viên sư phạm), "grandmaster" (đại kiện tướng sắc sảo), "humorous" (hóm hỉnh), "zhaoXinxin" (Lục Mạch Thần Kiếm Triệu Hâm Hâm), "xuYinchuan" (Thái Cực Bổng Hứa Ngân Xuyên) */
  style?: "coach" | "grandmaster" | "humorous" | "zhaoXinxin" | "xuYinchuan";
}

export interface LlmPrompt {
  systemPrompt: string;
  userPrompt: string;
}

const STYLE_INSTRUCTIONS: Record<NonNullable<LlmCommentaryOptions["style"]>, string> = {
  coach: "Giọng điệu huấn luyện viên sư phạm, ân cần, giải thích nguyên nhân và rút ra bài học kỳ lý cho người chơi.",
  grandmaster: "Giọng điệu Đại kiện tướng sắc sảo, đanh thép, chỉ rõ sự tinh vi hoặc sai lầm nghiêm trọng trong kỳ đạo.",
  humorous: "Giọng điệu bình luận viên dí dỏm, hóm hỉnh nhưng vẫn chuẩn xác thuật ngữ kỳ nghệ.",
  zhaoXinxin: "Giọng điệu 'Lục Mạch Thần Kiếm' Triệu Hâm Hâm: Sát khí sắc bén, đề cao tốc độ công thành, quả cảm 'thí quân đoạt tiên', phê phán sự do dự thủ thế và tán dương các đòn phế quân phá thành dũng mãnh. Bình theo các kỳ lý tranh tiên: ninh thất nhất tử bất thất nhất tiên, tham ăn mắc mồi, tranh nước đối công, đuổi quân được tiên, đổi quân giành tiên, dẫn dụ, chặn đường, giá Pháo, cải thiện quân kém nhất, thanh đông kích tây, phòng ngừa, biết dừng công chuyển tàn cuộc (dữ kiện zhaoMiddlegame, tone \"critique\" là nước vi phạm nguyên lý).",
  xuYinchuan: "Giọng điệu 'Thái Cực Bổng' Hứa Ngân Xuyên: Trầm tĩnh, sâu sắc, đề cao sự kín kẽ không tì vết, tôn vinh nghệ thuật 'dĩ nhu khắc cương', tích lũy từng ưu thế nhỏ và chuyển hóa tinh tế về tàn cuộc thắng. Bình theo các kỳ lý Thái Cực: cố nhược kim thang, tích tiểu thành đại, nhu hòa kiềm tỏa, ép đổi quy tàn, tằm ăn dâu, dĩ tĩnh chế động, vận quân tinh tế, khoét sâu điểm yếu, hóa giải sát khí, chiếm lĩnh yếu đạo, bảo toàn binh lực, phản tiên đoạt thế, khống chế trung lộ, khóa đường tháo lui (dữ kiện xuMiddlegame; tone \"critique\" là nước cảnh tỉnh nôn nóng khinh suất hoặc lỏng lẻo trận hình).",
};

/**
 * Xây dựng prompt chuẩn chỉnh cho LLM từ danh sách các Fact kỳ lý JSON.
 */
export function buildLlmCommentaryPrompt(options: LlmCommentaryOptions): LlmPrompt {
  const {
    facts,
    mover,
    playedNotation,
    betterNotation,
    classification,
    winDropPercent,
    openingName,
    endgame,
    style = "coach",
  } = options;

  const moverName = mover === "r" ? "bên Đỏ (Tiên)" : "bên Đen (Hậu)";
  const styleText = STYLE_INSTRUCTIONS[style];

  const systemPrompt = [
    "Bạn là một Đại kiện tướng Cờ Tướng kiêm Huấn luyện viên cờ tướng hàng đầu Việt Nam.",
    "Nhiệm vụ của bạn là viết một đoạn bình luận ngắn (từ 2 đến 3 câu tiếng Việt) phân tích nước cờ dựa trên các DỮ KIỆN KỲ LÝ (Facts JSON) được cung cấp.",
    "",
    "NGUYÊN TẮC BÌNH LUẬN:",
    "1. Sử dụng thuật ngữ Cờ Tướng Việt Nam chuẩn xác (vd: 'chiếu rút', 'chiếu kép', 'ghim quân', 'cản chân Mã', 'quân bị treo/mất căn', 'bắt đôi', 'bị vây khốn', 'khuyết Sĩ kỵ Mã', 'Sĩ Tượng toàn', 'tàn cuộc lý thuyết', v.v.).",
    "2. Tuyệt đối bám sát các Fact được cung cấp trong JSON; KHÔNG tự bịa đặt nước đi hay vị trí quân không có trong dữ kiện.",
    "3. Chỉ rõ vì sao nước đã đi lại bị đánh giá như vậy (hậu quả trước mắt hoặc lâu dài) và giải thích ý đồ nước nên đi (nếu có).",
    `4. Phong cách: ${styleText}`,
    "5. Chỉ trả về lời bình luận cuối cùng, không kèm giải thích mở đầu hay thẻ markdown.",
  ].join("\n");

  const contextLines = [
    `Bên thực hiện nước đi: ${moverName}`,
    `Nước đã đi: ${playedNotation}`,
    classification ? `Đánh giá nước cờ: ${classification}${winDropPercent ? ` (giảm ${winDropPercent.toFixed(1)}% xác suất thắng)` : ""}` : "",
    betterNotation ? `Nước tốt hơn được đề xuất: ${betterNotation}` : "",
    openingName ? `Thế trận khai cuộc: ${openingName}` : "",
    endgame ? `Tàn cuộc lý thuyết: ${endgame.name} (${endgame.outcome === "win" ? "Thế cờ thắng lý thuyết" : "Thế cờ hòa lý thuyết"})` : "",
  ].filter(Boolean);

  const factsJson = JSON.stringify(facts, null, 2);

  const userPrompt = [
    "Hãy viết lời bình luận cho tình huống cờ sau:",
    "",
    "--- THÔNG TIN NƯỚC CỜ ---",
    contextLines.join("\n"),
    "",
    "--- CÁC DỮ KIỆN KỲ LÝ (FACTS JSON) ---",
    factsJson,
    "",
    "Viết lời bình luận 2-3 câu súc tích bằng tiếng Việt:",
  ].join("\n");

  return { systemPrompt, userPrompt };
}

/**
 * Tạo lời bình luận cho nước cờ từ các Fact.
 * - Nếu có truyền `llmCaller` (hàm gọi API LLM), sẽ sinh prompt và gọi LLM.
 * - Nếu không có `llmCaller` hoặc LLM gặp sự cố, tự động fallback về `explainText(facts, mover)`.
 */
export async function generateLlmCommentary(
  options: LlmCommentaryOptions,
  llmCaller?: (prompt: LlmPrompt) => Promise<string>
): Promise<string> {
  if (llmCaller) {
    try {
      const prompt = buildLlmCommentaryPrompt(options);
      const res = await llmCaller(prompt);
      if (res && res.trim().length > 0) {
        return res.trim();
      }
    } catch {
      // Fallback về mẫu câu chuẩn của explainText khi LLM gặp lỗi mạng/quota
    }
  }
  return explainText(options.facts, options.mover);
}
