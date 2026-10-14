/**
 * commentary.ts — Bộ ghép câu bình luận kiểu đại sư (GĐ 1).
 *
 * Nhận kết quả 6 tầng từ `analyzePosition`, ghép thành đoạn bình luận có cấu trúc:
 *   1. **Nhận định** — giai đoạn + cán cân (ưu tiên: sát cục > vật chất > vị trí).
 *   2. **Đối phương muốn** — đòn dọa hoặc ý đồ của bên không đi (GĐ 2, bản nền).
 *   3. **Kế hoạch** — nước tốt nhất + kế hoạch theo giai đoạn + tóm tắt PV.
 *   4. **Nước so sánh** — "nếu đi X?" (GĐ 4, bản nền: chỉ dùng multiPV sẵn có).
 *   5. **Bài học** — nguyên tắc kỳ lý kích hoạt bởi yếu tố số 1 (GĐ 5, bản nền).
 *
 * Không gọi engine, không có I/O — thuần hàm, tất định, dễ test snapshot.
 */

import type { PositionAnalysisResult } from "./position-analysis";
import { formatPawnAdvantage, formatScoreText } from "./position-analysis";
import { MATE_THRESHOLD } from "./uci";

// ---------------------------------------------------------------------------
// Kiểu dữ liệu
// ---------------------------------------------------------------------------

export interface CommentaryBlock {
  /** Nhận định cục diện tổng quát (giai đoạn + cán cân). */
  assessment: string;
  /** Ý đồ / đòn dọa của đối phương (null nếu không có thông tin). */
  opponentIntent: string | null;
  /** Kế hoạch nước tốt nhất + tóm tắt PV. */
  plan: string;
  /** Nước so sánh "nếu đi X?" (null nếu không đủ multiPV). */
  comparison: string | null;
  /** Bài học kỳ lý ngắn (null nếu không kích hoạt). */
  lesson: string | null;
}

export interface MasterCommentary {
  /** Các khối đã ghép sẵn, hiển thị theo thứ tự. */
  blocks: CommentaryBlock;
  /**
   * Đoạn văn xuôi liên tục dành cho hiển thị gọn (nối các khối không-null).
   * Mỗi khối ngăn cách bởi dấu xuống dòng.
   */
  prose: string;
}

// ---------------------------------------------------------------------------
// Tiện ích nội bộ
// ---------------------------------------------------------------------------

/**
 * Chọn một câu từ mảng biến thể dựa trên `seed` (thường là hash đơn giản
 * của FEN hoặc ký hiệu nước đi) để cùng thế cờ không luôn ra cùng câu.
 */
export function pickVariant<T>(variants: T[], seed: number): T {
  return variants[Math.abs(seed) % variants.length];
}

/** Hash chuỗi đơn giản (djb2) cho `pickVariant`. */
export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0; // unsigned
}

const sideName = (s: "r" | "b") => (s === "r" ? "Đỏ" : "Đen");

// ---------------------------------------------------------------------------
// Khối 1: Nhận định
// ---------------------------------------------------------------------------

function buildAssessment(result: PositionAnalysisResult): string {
  const { layer1, layer2, layer6 } = result;
  const phaseLabel = layer6.phaseLabel; // "Khai cuộc" / "Trung cuộc" / "Tàn cuộc"

  // 1a. Ưu tiên cao nhất: chiếu bí hoặc nguy cơ sát cục
  if (layer1.isGameOver && layer1.gameOverReason) {
    return `**${phaseLabel}.** ${layer1.gameOverReason}.`;
  }

  const best = layer1.candidates[0];
  if (best?.isMate) {
    const mateIn = best.mateInPlies != null ? Math.ceil(best.mateInPlies / 2) : "?";
    const who = sideName(result.turn);
    const scoreLabel = best.scoreCp > 0
      ? `${who} đang có sát cục sau ${mateIn} nước`
      : `${who} đang bị sát sau ${mateIn} nước`;
    return `**${phaseLabel}.** ${scoreLabel}.`;
  }

  // 1b. Ưu thế vật chất / vị trí từ layer2
  const { assessment } = layer2;
  const seed = hashStr(result.fen);

  if (!assessment.leader) {
    const balanced: string[] = [
      `**${phaseLabel}.** Cục diện cân bằng, hai bên ngang sức.`,
      `**${phaseLabel}.** Thế cờ đang thăng bằng, không bên nào chiếm ưu thế rõ rệt.`,
      `**${phaseLabel}.** Hai bên cân sức, ai chớp cơ hội trước sẽ chiếm tiên.`,
    ];
    return pickVariant(balanced, seed);
  }

  const leaderSide = assessment.leader;
  const leaderScore = leaderSide === "r" ? assessment.evalCp : -assessment.evalCp;
  const absCp = Math.abs(assessment.evalCp);
  const advLevel =
    absCp >= 400
      ? "ưu thế quyết định"
      : absCp >= 200
        ? "ưu thế lớn"
        : "hơi ưu thế";

  const scoreStr = formatPawnAdvantage(leaderScore); // "hơn ≈ 2,8 Tốt"

  // Top factor
  const topFactor = layer2.factors[0];
  const secondFactor = layer2.factors[1];

  let reasonStr = "";
  if (topFactor) {
    reasonStr = ` — chủ yếu nhờ **${topFactor.text}**`;
    if (secondFactor) {
      reasonStr += ` và **${secondFactor.text}**`;
    }
    reasonStr += ".";
  }

  // dynamic: engine thấy ưu thế nhưng yếu tố tĩnh chưa giải thích được
  if (assessment.dynamic && assessment.summary) {
    return `**${phaseLabel}.** ${sideName(leaderSide)} ${advLevel} (${scoreStr}), nhưng ưu thế đến từ **tính toán chiến thuật**: ${assessment.summary}.`;
  }

  return `**${phaseLabel}.** ${sideName(leaderSide)} ${advLevel}, ${scoreStr}${reasonStr}`;
}

// ---------------------------------------------------------------------------
// Khối 2: Đối phương muốn gì
// ---------------------------------------------------------------------------

function buildOpponentIntent(result: PositionAnalysisResult): string | null {
  const { layer3 } = result;
  const opp = result.turn === "r" ? "b" : "r";
  const oppName = sideName(opp);

  if (layer3.inCheck) {
    return `⚠️ **Đang bị chiếu tướng** — cần giải chiếu ngay.`;
  }

  if (!layer3.hasThreat) return null;

  // Có đòn dọa
  const desc = layer3.description;
  if (layer3.isMateThreat) {
    return `⚠️ **${oppName} đang dọa sát**: ${desc}`;
  }

  // Dọa ăn quân
  const threatNote = layer3.threatNotation
    ? ` (${layer3.threatNotation})`
    : "";
  const variants = [
    `**${oppName} đang muốn**${threatNote}: ${desc}`,
    `**${oppName} có kế hoạch**${threatNote}: ${desc}`,
    `**Đòn đe dọa của ${oppName}**${threatNote}: ${desc}`,
  ];
  return pickVariant(variants, hashStr(result.fen + (layer3.threatNotation ?? "")));
}

// ---------------------------------------------------------------------------
// Khối 3: Kế hoạch
// ---------------------------------------------------------------------------

function buildPlan(result: PositionAnalysisResult): string {
  const { layer1, layer4, layer6, layer3 } = result;
  const best = layer1.candidates[0];

  if (!best) {
    return "Engine chưa cung cấp nước đi — không thể đưa ra kế hoạch.";
  }

  const moverName = sideName(result.turn);
  const phase = layer6.phase;
  const openingGuide = layer6.openingGuide;

  // Khai cuộc: nhấn vào tên trận và nước sách
  if (phase === "khaiCuoc" && openingGuide) {
    const openingName = openingGuide.name;
    const intentForSide = openingGuide.intent?.[result.turn];
    const intentStr = intentForSide ? ` — **ý đồ**: ${intentForSide}` : "";
    const nextBookLabels = layer6.nextBookMoves
      .slice(0, 2)
      .map((m) => m.notation)
      .join(", ");
    const bookHint = nextBookLabels ? ` Nước sách tiếp theo: **${nextBookLabels}**.` : "";

    return `**Kế hoạch (${openingName})**${intentStr}.${bookHint} Nước tốt nhất: **${best.notation}** (${best.scoreText}).`;
  }

  // Tàn cuộc: nhấn vào kỹ thuật
  if (phase === "tanCuoc") {
    const endgameHints: string[] = [
      "Tướng lên giúp sức, Tốt qua sông áp sát.",
      "Khai thác điểm yếu Sĩ Tượng và đưa Tốt vào cuộc.",
      "Đơn giản hóa quân và nhắm vào chỗ khuyết Sĩ Tượng.",
    ];
    const hint = pickVariant(endgameHints, hashStr(result.fen));
    return `**Kế hoạch (Tàn cuộc):** ${hint} Nước tốt nhất: **${best.notation}** (${best.scoreText})${best.narrative ? ` — ${best.narrative}` : ""}.`;
  }

  // Trung cuộc: dùng intent + narrative
  const intentLabel = layer4.candidates[0]?.purposeLabel ?? best.purposeLabel;

  // Nếu nước tốt nhất cũng hóa giải đòn dọa → nói rõ "vừa … vừa chặn …"
  let planDesc = `**${best.notation}**`;

  const hasThreat = layer3.hasThreat && !layer3.inCheck;
  const bestPurposes = layer1.candidates[0]?.intent?.purposes ?? [];
  const parries = bestPurposes.includes("hoaGiai");

  if (hasThreat && parries) {
    planDesc += ` vừa **${intentLabel.toLowerCase()}** vừa chặn đòn của đối phương`;
  } else {
    planDesc += ` (${intentLabel})`;
  }

  const pvSummary = best.narrative ? `: ${best.narrative}` : "";

  const scoreStr = best.scoreText;
  return `**Kế hoạch:** ${planDesc}${pvSummary} — **${scoreStr}**.`;
}

// ---------------------------------------------------------------------------
// Khối 4: Nước so sánh (chỉ từ multiPV, không gọi engine thêm)
// ---------------------------------------------------------------------------

function buildComparison(result: PositionAnalysisResult): string | null {
  const { layer1 } = result;
  if (layer1.candidates.length < 2) return null;

  const best = layer1.candidates[0];
  const alt = layer1.candidates[1];
  if (!best || !alt) return null;

  // Chỉ bình nếu chênh đáng kể (>= 0,8 Tốt = 80 cp) và cả hai không phải sát cục
  const diff = best.scoreCp - alt.scoreCp;
  if (diff < 80 || best.isMate || alt.isMate) return null;

  const diffStr = formatPawnAdvantage(diff); // "hơn ≈ 1,2 Tốt"
  const altPv = alt.narrative ? `sau đó ${alt.narrative}` : "";

  const templates = [
    `**Nếu đi ${alt.notation}?** ${altPv ? altPv + ", " : ""}kết quả kém nước tốt nhất ${diffStr}.`,
    `**Còn nếu ${alt.notation}?** Có vẻ tự nhiên, nhưng ${altPv ? altPv + " và " : ""}chỉ đạt ${alt.scoreText} — kém **${diffStr}** so với nước tốt nhất.`,
    `**Nếu chọn ${alt.notation}?** ${altPv ? altPv + ". " : ""}Đây là nước bình thường nhưng bỏ lỡ ưu thế ${diffStr}.`,
  ];

  return pickVariant(templates, hashStr(result.fen + alt.notation));
}

// ---------------------------------------------------------------------------
// Khối 5: Bài học (bản nền — rule-based từ yếu tố số 1)
// ---------------------------------------------------------------------------

/**
 * Kho bài học ngắn (GĐ 5 sẽ mở rộng thành lessons.ts với ~30–40 mục).
 * Mỗi mục: điều kiện kích hoạt (FactorId hoặc trạng thái đặc biệt) → câu bài học.
 */
type LessonKey =
  | "quanKem"
  | "sangKien"
  | "khuyetSiTuong"
  | "vatChat"
  | "anToanTuong"
  | "hoatDongXe"
  | "hoatDongMa"
  | "phao"
  | "totQuaHa"
  | "mateThreat"
  | "inCheck";

const LESSON_VARIANTS: Record<LessonKey, string[]> = {
  quanKem: [
    "💡 **Bài học:** Khi đối phương có quân không căn, đánh ngay trước khi họ kịp bảo vệ — tiên chỉ có giá trị khi dùng ngay.",
    "💡 **Bài học:** Quân không căn là mục tiêu sống: đánh trước khi đối phương kịp thoát hoặc bảo vệ.",
    "💡 **Bài học:** Quân treo không căn luôn là ưu tiên tấn công — bỏ qua là để đối phương chữa lành điểm yếu.",
  ],
  sangKien: [
    "💡 **Bài học:** Quyền chủ động (tiên thủ) là tài sản quý — giữ tiên bằng cách liên tục chiếu hoặc dọa sát, không cho đối phương thở.",
    "💡 **Bài học:** Tiên thủ là vũ khí vô hình: ai cầm tiên, người đó định luật trận. Mất tiên là mất thế chủ động.",
    "💡 **Bài học:** Cầm tiên — ép liên tục — không cho đối phương phản công. Đây là nguyên tắc vàng của tấn công.",
  ],
  khuyetSiTuong: [
    "💡 **Bài học:** Khuyết Sĩ kỵ Mã, khuyết Tượng kỵ Pháo — khi đối phương thiếu quân bảo vệ, đưa đúng quân công vào là then chốt.",
    "💡 **Bài học:** Sĩ Tượng là hàng rào cuối của cung Tướng — đối phương thiếu một trong hai là có kẽ hở để khai thác.",
  ],
  vatChat: [
    "💡 **Bài học:** Hơn quân thì đổi quân — mỗi lần đổi cân bằng đều tăng ưu thế tương đối. Tránh phức tạp hóa khi đang hơn.",
    "💡 **Bài học:** Đang hơn quân: chơi đơn giản, đổi quân, tránh mạo hiểm. Phức tạp hóa chỉ giúp bên thua.",
  ],
  anToanTuong: [
    "💡 **Bài học:** Cung tướng vững là nền tảng tấn công — không thể tấn công bền vững khi cung nhà đang yếu.",
    "💡 **Bài học:** Giữ Sĩ Tượng đủ đôi là điều kiện để tự tin tiến quân. Cung vững mới nói chuyện tấn công.",
  ],
  hoatDongXe: [
    "💡 **Bài học:** Xe phải chiếm lộ thông — một con Xe hoạt động rộng bằng nhiều quân khác cộng lại.",
    "💡 **Bài học:** Xe trên lộ thông là Xe mạnh nhất; Xe bị bó trong góc gần như vô dụng. Luôn ưu tiên mở đường cho Xe.",
  ],
  hoatDongMa: [
    "💡 **Bài học:** Mã mạnh khi chân thoáng — Mã ở điểm then chốt (hà khẩu, ngọa tào, quải giác) có sức tấn công như Xe.",
    "💡 **Bài học:** Mã chân thoáng là Mã mạnh; Mã bị chặn chân gần như vô dụng. Luôn nhớ: ai bằng lòng có Mã chết?",
  ],
  phao: [
    "💡 **Bài học:** Pháo mạnh nhất khi có đúng một quân làm mồi — đặt Pháo đầu uy hiếp trung lộ là nguyên tắc khai cuộc.",
    "💡 **Bài học:** Pháo cần mồi để bắn — luôn tính xem có bao nhiêu quân giữa Pháo và mục tiêu.",
  ],
  totQuaHa: [
    "💡 **Bài học:** Tốt qua sông là Tốt mạnh — áp sát cung tướng đối phương để tạo đòn đe dọa lâu dài.",
    "💡 **Bài học:** Tốt qua sông giá trị gấp đôi — vừa tạo đòn đe dọa, vừa chiếm không gian. Đừng bỏ quên những con Tốt đã vượt hà.",
  ],
  mateThreat: [
    "💡 **Bài học:** Khi có nguy cơ bị sát cục, ưu tiên số một là hóa giải — mọi chiến lược khác chờ sau.",
    "💡 **Bài học:** Sát cục là mối đe dọa cấp bách nhất — xử lý nó trước khi tính kế hoạch dài hạn.",
  ],
  inCheck: [
    "💡 **Bài học:** Đang bị chiếu: chỉ có ba cách thoát — đi Tướng, cản chiếu, ăn quân chiếu. Tính toán kỹ trước khi chọn.",
    "💡 **Bài học:** Chiếu tướng bắt buộc phải giải — không thể bỏ qua. Hãy tìm nước giải chiếu vừa an toàn vừa giữ thế.",
  ],
};

function buildLesson(result: PositionAnalysisResult): string | null {
  const { layer2, layer3 } = result;
  const seed = hashStr(result.fen);

  // Ưu tiên trạng thái cấp bách
  if (layer3.inCheck) return pickVariant(LESSON_VARIANTS.inCheck, seed);
  if (layer3.isMateThreat) return pickVariant(LESSON_VARIANTS.mateThreat, seed);

  // Bài học theo yếu tố số 1
  const topFactor = layer2.factors[0];
  if (!topFactor) return null;

  const key = topFactor.id as LessonKey;
  const variants = LESSON_VARIANTS[key];
  if (!variants) return null;

  return pickVariant(variants, seed);
}

// ---------------------------------------------------------------------------
// Hàm chính
// ---------------------------------------------------------------------------

/**
 * Tổng hợp bình luận "kiểu đại sư" từ kết quả phân tích 6 tầng.
 *
 * @param result Kết quả từ `analyzePosition`.
 * @returns `MasterCommentary` gồm các khối rời và đoạn văn xuôi liên tục.
 */
export function buildCommentary(result: PositionAnalysisResult): MasterCommentary {
  const assessment = buildAssessment(result);
  const opponentIntent = buildOpponentIntent(result);
  const plan = buildPlan(result);
  const comparison = buildComparison(result);
  const lesson = buildLesson(result);

  const blocks: CommentaryBlock = {
    assessment,
    opponentIntent,
    plan,
    comparison,
    lesson,
  };

  // Nối thành văn xuôi
  const parts = [assessment, opponentIntent, plan, comparison, lesson].filter(
    (s): s is string => s != null && s.length > 0,
  );
  const prose = parts.join("\n");

  return { blocks, prose };
}
