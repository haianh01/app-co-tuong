/**
 * compare-expert-commentary.ts
 * ----------------------------
 * Đối sánh bình luận chuyên gia (Thăng Long Kỳ Đạo) với hệ thống AI 5 khối
 * (analyzePosition + buildCommentary + Pikafish).
 *
 * SỬA ĐỔI TOÀN DIỆN THEO NGUYÊN TẮC ADVERSARIAL & ĐO LƯỜNG CHUẨN XÁC:
 * 1. Đánh giá cán cân: So sánh ở thế cờ SAU nước đi (post-move) bằng `postAnalysis.layer2.assessment.leader`
 *    (được chuẩn hóa độc lập về góc nhìn Đỏ/Đen trong assessPosition). Tuyệt đối không lẫn góc nhìn.
 * 2. Từ khóa đánh giá: Trích xuất dựa trên cấu trúc Chủ ngữ (Bên Đỏ/Tiên vs Bên Đen/Hậu) + Vị ngữ (ưu/kém/hòa).
 *    Gỡ bỏ hoàn toàn các từ khóa gắn cứng, tên kỳ thủ hoặc cụm từ một chiều.
 * 3. Nước thay thế: Chỉ trích xuất từ các mẫu khuyến nghị rõ ràng, fail-closed khi không chuẩn định dạng.
 *    Đo kèm Mốc ngẫu nhiên (Random Baseline null-hypothesis: 3 / số nước hợp lệ) để tính chỉ số Lift.
 * 4. Mục đích chiến thuật: Đo ý đồ của NƯỚC ĐÃ ĐI (`detectIntent` trên chính playedMove) với chủ đề đại sư bình luận.
 * 5. Xác thực tính hợp lệ (Legality): Kiểm tra 100% nước đi trong ván bằng `legalMoves()`.
 * 6. Báo cáo minh bạch: Trình bày cả các ca đồng thuận LẪN các ca bất đồng (divergent cases), kèm khoảng tin cậy Wilson 95%.
 *
 * Sử dụng:
 *   npx tsx scripts/compare-expert-commentary.ts [--limit 20] [--nodes 60000]
 */

import fs from "node:fs";
import path from "node:path";
import {
  parseFen,
  toFen,
  play,
  inCheck,
  START_FEN,
  opponent,
  legalMoves,
  type Side,
  type Board,
  type Move,
} from "../src/lib/xiangqi/engine";
import { moveNotation } from "../src/lib/xiangqi/notation";
import {
  analyzePosition,
  type PositionAnalysisResult,
  type EngineCandidateInput,
  PURPOSE_SHORT_LABELS,
} from "../src/lib/xiangqi/position-analysis";
import { buildCommentary, type MasterCommentary } from "../src/lib/xiangqi/commentary";
import { detectIntent, PURPOSE_NAMES, type Purpose } from "../src/lib/xiangqi/intent";
import { getEnginePool, type UciProcess, type EngineResult } from "../src/server/engine/uci";
import { engineScore, uciToMove, moveToUci } from "../src/lib/xiangqi/uci";
import { classifyWinDrop, winChance } from "../src/lib/xiangqi/analysis";

const dataDir = path.join(process.cwd(), ".data", "expert-commentary");
const files = fs.readdirSync(dataDir).filter((f) => f.startsWith("tlkd_") && f.endsWith(".json"));

const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const nodesIdx = args.indexOf("--nodes");
const maxGames = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : files.length;
const EVAL_NODES = nodesIdx !== -1 ? parseInt(args[nodesIdx + 1], 10) : 50_000;

interface RawMoveCoord {
  from: number;
  to: number;
  raw: string;
}

interface CrawledGame {
  id: string;
  title: string;
  red: string;
  black: string;
  event: string;
  date: string;
  result: string;
  opening: string;
  totalPlies: number;
  movesCoords: RawMoveCoord[];
  comments: Record<string, string>;
  commentCount: number;
}

interface PlyComparison {
  gameId: string;
  gameTitle: string;
  ply: number;
  turn: Side;
  playedNotation: string;
  expertComment: string;
  // Cán cân thế trận (đo trên thế cờ sau nước đi)
  evalAgreement: {
    expertEval: "r" | "b" | "draw" | "unclear";
    aiLeader: "r" | "b" | null;
    status: "agree" | "disagree" | "neutral";
    postFen: string;
    aiEvalText: string;
  };
  // Nước biến gợi ý (đo trên thế cờ trước nước đi)
  suggestedMoveMatch: {
    extractedFromExpert: string | null;
    matchedInTopCandidates: boolean;
    rank: number | null;
    totalLegalMoves: number;
    randomBaselineProb: number;
    aiTopCandidates: string[];
  } | null;
  // Ý đồ chiến thuật của nước đã đi
  tacticalThemeMatch: {
    expertThemes: string[];
    playedMovePurposes: string[];
    isMatched: boolean;
  };
  aiCommentary: MasterCommentary;
}

interface MetricWithCI {
  sampleCount: number;
  hitCount: number;
  ratePct: number;
  ciLowerPct: number;
  ciUpperPct: number;
}

interface BenchmarkReport {
  timestamp: string;
  gamesAnalyzed: number;
  totalPliesVerifiedLegal: number;
  illegalMovesCount: number;
  totalAnnotatedPlies: number;
  evaluation: MetricWithCI & { disagreeCount: number };
  moveSuggestion: MetricWithCI & {
    avgRandomBaselinePct: number;
    liftFactor: number;
  };
  tacticalTheme: MetricWithCI;
  agreedSamples: PlyComparison[];
  divergentSamples: PlyComparison[];
}

/**
 * Tính khoảng tin cậy Wilson Score 95% cho tỷ lệ mẫu nhị thức.
 */
function wilsonScoreCI(successes: number, total: number): [number, number] {
  if (total <= 0) return [0, 0];
  const z = 1.96; // 95% confidence
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const spread = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  const lower = Math.max(0, Math.round((center - spread) * 1000) / 10);
  const upper = Math.min(100, Math.round((center + spread) * 1000) / 10);
  return [lower, upper];
}

const CHINESE_DIGITS: Record<string, number> = {
  "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};

const VIETNAMESE_DIGITS: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "một": 1, "hai": 2, "ba": 3, "bốn": 4, "năm": 5, "sáu": 6, "bảy": 7, "tám": 8, "chín": 9,
};

/**
 * Trích xuất hướng đánh giá cục diện từ lời bình đại sư.
 * Yêu cầu nghiêm ngặt: Phải có cặp Chủ ngữ (Đỏ/Đen) + Trạng thái đánh giá (ưu/kém/thắng/bại),
 * hoặc từ khóa cân bằng/hòa rõ ràng. Nếu mơ hồ hoặc xung đột thì fail-closed trả về 'unclear'.
 */
export function extractExpertEvaluation(text: string): "r" | "b" | "draw" | "unclear" {
  const t = text.toLowerCase();

  // 1. Kiểm tra trạng thái cân bằng / hòa (cả tiếng Việt và tiếng Trung)
  const drawPattern = /(?:cục diện|hai bên|thế cờ|thế trận)\s*(?:cân bằng|ngang nhau|ngang sức|bình ổn)|hòa cờ|双方(?:均势|平稳|不变作和)|局势平稳|局面平稳|和棋|作和|和局/i;
  const isDraw = drawPattern.test(text) || drawPattern.test(t);

  // 2. Nhận diện Đỏ chiếm ưu:
  // Tiếng Việt:
  const redAdvVN = /(?:bên đỏ|phía đỏ|đỏ|bên tiên|tiên thủ)\s*(?:chiếm ưu|hơi ưu|ưu thế|có lợi|chủ động|thắng lớn|thắng cờ|dễ đi|nắm giữ tiên thủ|ưu)/i;
  const blackDisadvVN = /(?:bên đen|phía đen|đen|bên hậu|hậu thủ)\s*(?:bất lợi|yếu thế|thất thế|thua|bị động|khó đi|kém thế)/i;
  // Tiếng Trung:
  const redAdvCN = /(?:红方|红|先手)\s*(?:占优|略优|优势|主动|易走|好走|胜势|得势|占先|胜)|红优|红略优|红胜/;
  const blackDisadvCN = /(?:黑方|黑|后手)\s*(?:不利|被动|难走|失利|劣势|下风|负)|黑劣|黑负/;

  // 3. Nhận diện Đen chiếm ưu:
  // Tiếng Việt:
  const blackAdvVN = /(?:bên đen|phía đen|đen|bên hậu|hậu thủ)\s*(?:chiếm ưu|hơi ưu|ưu thế|có lợi|chủ động|thắng lớn|thắng cờ|dễ đi|mãn ý|tốt hơn|ưu)/i;
  const redDisadvVN = /(?:bên đỏ|phía đỏ|đỏ|bên tiên|tiên thủ)\s*(?:bất lợi|yếu thế|thất thế|thua|bị động|khó đi|kém thế)/i;
  // Tiếng Trung:
  const blackAdvCN = /(?:黑方|黑|后手)\s*(?:占优|略优|优势|主动|易走|好走|胜势|得势|占先|满意|胜)|黑优|黑略优|黑胜/;
  const redDisadvCN = /(?:红方|红|先手)\s*(?:不利|被动|难走|失利|劣势|下风|负)|红劣|红负/;

  // Xử lý các cụm từ phủ định (ví dụ: "ưu thế dần mất", "mất ưu")
  const redNegation = /(?:đỏ|tiên|红).*(?:ưu thế\s+dần\s+mất|mất\s+ưu|hết\s+ưu|chịu\s+thua|bỏ\s+cuộc|失算|失去一子)/i.test(text);
  const blackNegation = /(?:đen|hậu|黑).*(?:ưu thế\s+dần\s+mất|mất\s+ưu|hết\s+ưu|chịu\s+thua|bỏ\s+cuộc|失算|失去一子)/i.test(text);

  let redIsBetter = (redAdvVN.test(text) || redAdvVN.test(t) || blackDisadvVN.test(text) || blackDisadvVN.test(t) || redAdvCN.test(text) || blackDisadvCN.test(text));
  let blackIsBetter = (blackAdvVN.test(text) || blackAdvVN.test(t) || redDisadvVN.test(text) || redDisadvVN.test(t) || blackAdvCN.test(text) || redDisadvCN.test(text));

  if (redNegation) redIsBetter = false;
  if (blackNegation) blackIsBetter = false;

  if (isDraw && !redIsBetter && !blackIsBetter) {
    return "draw";
  }

  // Nếu cả hai cùng xuất hiện hoặc không cái nào xuất hiện rõ ràng -> fail-closed: unclear
  if (redIsBetter && !blackIsBetter) return "r";
  if (blackIsBetter && !redIsBetter) return "b";

  return "unclear";
}

/**
 * Trích xuất nước cờ thay thế mà đại sư KHUYÊN ĐI (recommendation).
 * Chỉ khớp khi có tiền tố khuyến nghị rõ ràng ("như đổi thành", "ứng đi", "nên đi", "như cải tẩu...").
 * Không chấp nhận tiền tố nước đối phó / đáp trả ("tắc", "thì", "đáp...").
 * Không dùng giá trị fallback silent — nếu sai sót thì trả null.
 */
export function extractExpertSuggestedMove(text: string): string | null {
  // 1. Dạng ký hiệu viết tắt: "Ứng đi C9.1", "Đổi thành V3.5", "Nên đi M8.7"
  const m1 = text.match(/(?:như đổi thành|ứng đi|nên đi|có thể đi|sửa đi|đổi đi|thay vì đi|không bằng đi|có khả năng đi)\s*([VXMPCSTBvxmpcstb][0-9tsh][.\-\/][0-9])/i);
  if (m1 && m1[1]) {
    return normalizeNotation(m1[1]);
  }

  // 2. Dạng tiếng Trung chuẩn: "如改走车二进六", "不如改走马四进六"
  const m2 = text.match(/(?:如改走|不如改走|改走|应走|可改走)\s*([车車炮砲马馬相象士仕兵卒])([一二三四五六七八九1-9])([进進退平])([一二三四五六七八九1-9])/);
  if (m2 && m2[1] && m2[2] && m2[3] && m2[4]) {
    const pMap: Record<string, string> = {
      "车": "X", "車": "X", "炮": "P", "砲": "P", "马": "M", "馬": "M",
      "相": "T", "象": "T", "士": "S", "仕": "S", "兵": "B", "卒": "B",
    };
    const aMap: Record<string, string> = { "进": ".", "進": ".", "退": "/", "平": "-" };
    const p = pMap[m2[1]];
    const d1 = CHINESE_DIGITS[m2[2]];
    const a = aMap[m2[3]];
    const d2 = CHINESE_DIGITS[m2[4]];
    if (p && d1 !== undefined && a && d2 !== undefined) {
      return normalizeNotation(`${p}${d1}${a}${d2}`);
    }
  }

  // 3. Dạng tiếng Việt bằng chữ: "nếu sửa đi xe chín bình hai", "nên đi pháo 2 tiến 5"
  const m3 = text.match(/(?:sửa đi|ứng đi|đổi đi|nếu đi|thay vì đi|không bằng đi|nên đi|khuyên đi)\s*(xe|pháo|mã|tượng|voi|sĩ|tốt|binh|chốt)\s*([1-9]|một|hai|ba|bốn|năm|sáu|bảy|tám|chín)\s*(tiến|thoái|bình|\.|\/|\-)\s*([1-9]|một|hai|ba|bốn|năm|sáu|bảy|tám|chín)/i);
  if (m3 && m3[1] && m3[2] && m3[3] && m3[4]) {
    const pMap: Record<string, string> = {
      "xe": "X", "pháo": "P", "mã": "M", "tượng": "T", "voi": "T",
      "sĩ": "S", "tốt": "B", "binh": "B", "chốt": "B",
    };
    const aMap: Record<string, string> = { "tiến": ".", "thoái": "/", "bình": "-", ".": ".", "/": "/", "-": "-" };
    const p = pMap[m3[1].toLowerCase()];
    const d1 = VIETNAMESE_DIGITS[m3[2].toLowerCase()];
    const a = aMap[m3[3].toLowerCase()];
    const d2 = VIETNAMESE_DIGITS[m3[4].toLowerCase()];
    if (p && d1 !== undefined && a && d2 !== undefined) {
      return normalizeNotation(`${p}${d1}${a}${d2}`);
    }
  }

  return null;
}

function normalizeNotation(not: string): string {
  let s = not.toUpperCase().trim();
  if (s.startsWith("C")) s = "B" + s.slice(1);
  if (s.startsWith("V")) s = "T" + s.slice(1);
  return s;
}

/**
 * Tách và cô lập phần bình luận về chính nước cờ thực chiến vừa đi,
 * loại bỏ các mệnh đề biến phụ giả định ("như sửa đi...", "nếucải...", "ngoài ra...", "thay vì đi...").
 */
export function isolatePlayedMoveComment(text: string): string {
  // 1. Loại bỏ các câu mở đầu mang tính phủ định / giả định không thực hiện
  if (/^nếu\s*như\s*không\s*(?:chịu\s*)?(?:thí|phế|bỏ)/i.test(text.trim())) {
    return "";
  }

  // 2. Cắt từ điểm rẽ nhánh sang phân tích biến phụ / nước đi khác
  const splitPattern = /(?:[\.\n\;\!\,]\s*|\s+)(?:như\s+sửa\s+đi|nếu\s*cải|nếu\s*đổi|sửa\s+đi|đổi\s+đi|thay\s+vì\s+đi|không\s+bằng\s+đi|không\s+bằng|ngoài\s+ra|đen\s+có\s+thể|đỏ\s+có\s+thể|đen\s+như|đỏ\s+như|như:\s*|如改走|不如改走|可改走|改走|如走|若走|赛后研究.*应|另有一变|不如)[\s\S]*$/i;

  const m = text.match(splitPattern);
  if (m && m.index !== undefined && m.index >= 5) {
    return text.slice(0, m.index);
  }
  return text;
}

/**
 * Trích xuất các chủ đề chiến thuật trong lời bình của đại sư về nước cờ vừa đi.
 */
export function extractExpertTacticalThemes(text: string): string[] {
  const fullTextLower = text.toLowerCase();
  const mainText = isolatePlayedMoveComment(text);
  const t = mainText.toLowerCase();
  const themes: string[] = [];

  const isNegatedThi = /không\s*(?:chịu\s*)?(?:thí|phế|bỏ)\s*quân/i.test(t);
  if (!isNegatedThi && (t.includes("khí tử") || t.includes("khí tốt") || t.includes("thí quân") || t.includes("thí tốt") || t.includes("phế quân") || t.includes("phế mã") || t.includes("phế xa") || mainText.includes("弃车") || mainText.includes("弃子") || mainText.includes("弃兵"))) {
    themes.push("Thí quân");
  }
  if (t.includes("đặt sát") || t.includes("chiếu tướng") || t.includes("công sát") || t.includes("sát cục") || t.includes("chiếu bí") || mainText.includes("绝杀") || mainText.includes("杀局")) {
    themes.push("Đặt sát");
  }
  if (t.includes("tróc") || t.includes("bắt quân") || t.includes("ăn quân") || t.includes("ăn tượng") || t.includes("ăn tốt") || t.includes("ăn mã") || t.includes("đoạt quân") || mainText.includes("捉") || mainText.includes("吃去") || mainText.includes("吃子")) {
    themes.push("Ăn quân");
  }
  if (t.includes("đổi xe") || t.includes("đổi pháo") || t.includes("đổi mã") || t.includes("đổi quân") || t.includes("mời đổi") || t.includes("diệu đoái") || mainText.includes("兑车") || mainText.includes("兑兵") || mainText.includes("交换")) {
    themes.push("Đổi quân");
  }
  if (t.includes("gác sĩ") || t.includes("bay tượng") || t.includes("bảo toàn") || t.includes("phòng thủ") || t.includes("hóa giải") || mainText.includes("上士") || mainText.includes("补士") || mainText.includes("退象") || mainText.includes("固守")) {
    themes.push("Hóa giải");
  }
  if (t.includes("kiềm chế") || t.includes("khóa") || t.includes("bó quân") || t.includes("thụ chế") || t.includes("trói buộc") || mainText.includes("牵制") || mainText.includes("封锁") || mainText.includes("制住")) {
    themes.push("Bó quân");
  }
  if (t.includes("tiên thủ") || t.includes("tranh tiên") || t.includes("đoạt thế") || mainText.includes("先手") || mainText.includes("抢先")) {
    themes.push("Giữ tiên");
  }

  // Dò "Nước kém" trên toàn văn (kể cả câu có chứa "không bằng", "不如" chỉ ra biến phụ khuyên đi)
  if (
    /nước kém|sai lầm|nước hớ|quá gấp|không bằng|失着|败着|缓着|软着|劣着|欠妥|不如|不好/.test(fullTextLower) ||
    /失着|败着|缓着|软着|劣着|欠妥|不如|不好/.test(text)
  ) {
    themes.push("Nước kém");
  }

  return themes;
}

async function runBenchmark() {
  console.log(`\n=================================================================`);
  console.log(`BẮT ĐẦU ĐỐI SÁNH BÌNH LUẬN ĐẠI SƯ VỚI HỆ THỐNG AI 5 KHỐI (V2 - CHUẨN HÓA)`);
  console.log(`Số ván phân tích: ${Math.min(maxGames, files.length)} / ${files.length}`);
  console.log(`Engine: Pikafish (${EVAL_NODES} nodes, MultiPV 3)`);
  console.log(`=================================================================\n`);

  const pool = getEnginePool();
  if (!pool) {
    console.error("LỖI: Không khởi tạo được Engine Pool Pikafish.");
    return;
  }

  const allComparisons: PlyComparison[] = [];
  const selectedFiles = files.slice(0, maxGames);

  let totalPliesVerifiedLegal = 0;
  let illegalMovesCount = 0;

  let evalAgreementCount = 0;
  let evalDisagreementCount = 0;
  let evalOpinionCount = 0;

  let suggestionMatchCount = 0;
  let totalSuggestionsFound = 0;
  let sumRandomBaseline = 0;

  let tacticalMatchCount = 0;
  let tacticalThemeCount = 0;
  let tacticalMatchAnyCount = 0;
  // Mỗi chủ đề: đại sư nhắc / AI trúng (đa nhãn) / AI trúng (ý chính) / AI gán (đa nhãn) / AI gán (ý chính)
  const perTheme: Record<string, { expert: number; hitAny: number; hitPrimary: number; aiAny: number; aiPrimary: number }> = {};
  const themeRow = (k: string) => (perTheme[k] ??= { expert: 0, hitAny: 0, hitPrimary: 0, aiAny: 0, aiPrimary: 0 });
  const sameTheme = (a: string, b: string) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());

  await pool.withProcess(async (proc: UciProcess) => {
    // Warmup
    await proc.search(START_FEN, { nodes: 15_000 }, undefined, { newGame: false });

    for (let fIdx = 0; fIdx < selectedFiles.length; fIdx++) {
      const filename = selectedFiles[fIdx];
      const filePath = path.join(dataDir, filename);
      const rawJson = fs.readFileSync(filePath, "utf-8");
      const game: CrawledGame = JSON.parse(rawJson);

      console.log(`\n[${fIdx + 1}/${selectedFiles.length}] Đang phân tích: ${game.title}`);
      console.log(`  Đấu thủ: ${game.red} (Đỏ) vs ${game.black} (Đen) | ${game.totalPlies} nước | ${game.commentCount} lời bình`);

      // Khởi tạo bàn cờ
      const pos = parseFen(START_FEN);
      let curBoard: Board = pos.board;
      let curTurn: Side = pos.turn;

      const historyMoves: Move[] = [];
      const historyNotations: string[] = [];

      for (let ply = 1; ply <= game.movesCoords.length; ply++) {
        const moveCoord = game.movesCoords[ply - 1];

        // 1. Kiểm tra tính hợp lệ của nước đi (Proof of Legality)
        const validMoves = legalMoves({ board: curBoard, turn: curTurn });
        const isValid = validMoves.some((m) => m.from === moveCoord.from && m.to === moveCoord.to);
        if (!isValid) {
          illegalMovesCount++;
          console.error(`  [!] CẢNH BÁO: Nước cờ bất hợp lệ tại ply ${ply} trong ván ${game.id}! Bỏ qua ván này.`);
          break;
        }
        totalPliesVerifiedLegal++;

        const notation = moveNotation(curBoard, moveCoord);
        const expertComment = game.comments[ply.toString()];

        // Tính bàn cờ sau nước đi
        const nextBoard = play(curBoard, moveCoord);
        const nextTurn = opponent(curTurn);

        if (expertComment && expertComment.length > 10) {
          try {
            // A. PHÂN TÍCH THẾ CỜ TRƯỚC NƯỚC ĐI (để đo Nước Biến Gợi Ý & Baseline)
            const fenBefore = toFen({ board: curBoard, turn: curTurn });
            const searchBefore: EngineResult = await proc.search(
              fenBefore,
              { nodes: EVAL_NODES, multipv: 3 },
              undefined,
              { newGame: false }
            );

            let threatRes = null;
            if (!inCheck(curBoard, curTurn)) {
              try {
                threatRes = await pool.threat(fenBefore);
              } catch {}
            }

            const candidateLinesBefore: EngineCandidateInput[] = (searchBefore.lines && searchBefore.lines.length > 0)
              ? searchBefore.lines.map((l) => ({
                  move: l.bestmove ? uciToMove(l.bestmove) : null,
                  score: engineScore(l.cp, l.mate),
                  depth: l.depth,
                  pv: l.pv,
                  pvMoves: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
                  wdl: l.wdl,
                }))
              : [];

            const analysisBefore: PositionAnalysisResult = analyzePosition({
              board: curBoard,
              turn: curTurn,
              historyMoves: [...historyMoves],
              historyNotations: [...historyNotations],
              engineResult: {
                score: engineScore(searchBefore.cp, searchBefore.mate),
                depth: searchBefore.depth,
                pvMoves: searchBefore.pv ? searchBefore.pv.map(uciToMove).filter((m): m is Move => m !== null) : undefined,
                wdl: searchBefore.wdl,
                lines: candidateLinesBefore,
              },
              threatResult: threatRes,
            });

            const commentaryBefore: MasterCommentary = buildCommentary(analysisBefore);

            // B. PHÂN TÍCH THẾ CỜ SAU NƯỚC ĐI (để đo Cán Cân Thế Trận Post-Move)
            const fenAfter = toFen({ board: nextBoard, turn: nextTurn });
            const searchAfter: EngineResult = await proc.search(
              fenAfter,
              { nodes: Math.min(EVAL_NODES, 30_000), multipv: 1 },
              undefined,
              { newGame: false }
            );

            const postCandidateLines: EngineCandidateInput[] = (searchAfter.lines && searchAfter.lines.length > 0)
              ? searchAfter.lines.map((l) => ({
                  move: l.bestmove ? uciToMove(l.bestmove) : null,
                  score: engineScore(l.cp, l.mate),
                  depth: l.depth,
                  pv: l.pv,
                  pvMoves: l.pv.map(uciToMove).filter((m): m is Move => m !== null),
                  wdl: l.wdl,
                }))
              : [];

            const analysisAfter: PositionAnalysisResult = analyzePosition({
              board: nextBoard,
              turn: nextTurn,
              historyMoves: [...historyMoves, moveCoord],
              historyNotations: [...historyNotations, notation],
              engineResult: {
                score: engineScore(searchAfter.cp, searchAfter.mate),
                depth: searchAfter.depth,
                pvMoves: searchAfter.pv ? searchAfter.pv.map(uciToMove).filter((m): m is Move => m !== null) : undefined,
                wdl: searchAfter.wdl,
                lines: postCandidateLines,
              },
            });

            // 1. Đối sánh cán cân thế trận (Evaluation Alignment)
            // Dùng postAnalysis.layer2.assessment.leader: chuẩn hóa độc lập 'r' | 'b' | null
            const expertEval = extractExpertEvaluation(expertComment);
            const aiLeader = analysisAfter.layer2.assessment.leader;
            let evalStatus: "agree" | "disagree" | "neutral" = "neutral";

            if (expertEval !== "unclear") {
              evalOpinionCount++;
              if (expertEval === "draw" && aiLeader === null) {
                evalStatus = "agree";
                evalAgreementCount++;
              } else if (expertEval === "r" && aiLeader === "r") {
                evalStatus = "agree";
                evalAgreementCount++;
              } else if (expertEval === "b" && aiLeader === "b") {
                evalStatus = "agree";
                evalAgreementCount++;
              } else {
                evalStatus = "disagree";
                evalDisagreementCount++;
              }
            }

            // 2. Đối sánh nước cờ gợi ý + Mốc ngẫu nhiên (Move Suggestion & Random Baseline)
            const suggested = extractExpertSuggestedMove(expertComment);
            let suggestedMatch: PlyComparison["suggestedMoveMatch"] = null;
            if (suggested) {
              totalSuggestionsFound++;
              const numLegal = validMoves.length;
              const randProb = Math.min(1.0, 3 / Math.max(1, numLegal));
              sumRandomBaseline += randProb;

              const topCandNotations = analysisBefore.layer1.candidates.map((c) => normalizeNotation(c.notation));
              const matchIdx = topCandNotations.findIndex(
                (not) => not === suggested || not.replace("-", ".") === suggested.replace("-", ".")
              );
              const matched = matchIdx !== -1;
              if (matched) suggestionMatchCount++;

              suggestedMatch = {
                extractedFromExpert: suggested,
                matchedInTopCandidates: matched,
                rank: matched ? matchIdx + 1 : null,
                totalLegalMoves: numLegal,
                randomBaselineProb: randProb,
                aiTopCandidates: analysisBefore.layer1.candidates.map((c) => c.notation),
              };
            }

            // 3. Đối sánh ý đồ chiến thuật của NƯỚC ĐÃ ĐI
            // PV của CHÍNH nước đã đi = nước đó + biến chính engine từ thế cờ sau nước đi
            const bestScoreBefore = engineScore(searchBefore.cp, searchBefore.mate);
            const scoreAfterOpp = engineScore(searchAfter.cp, searchAfter.mate);
            const playedLoss = Math.max(0, bestScoreBefore - -scoreAfterOpp);
            const afterPv = searchAfter.pv ? searchAfter.pv.map(uciToMove).filter((m): m is Move => m !== null) : [];
            // Đòn mà bên vừa đi đe dọa ở nước tiếp theo (null-move từ thế cờ sau nước đi)
            let threatAfterRes = null;
            if (!inCheck(nextBoard, nextTurn)) {
              try {
                const t = await pool.threat(fenAfter);
                threatAfterRes = { ...t, baseScore: -scoreAfterOpp };
              } catch {}
            }
            const playedIntent = detectIntent(curBoard, moveCoord, nextBoard, {
              pv: [moveCoord, ...afterPv],
              evalBefore: { score: bestScoreBefore },
              evalAfter: { score: scoreAfterOpp },
              loss: playedLoss,
              threatBefore: threatRes ? { ...threatRes, baseScore: -bestScoreBefore } : null,
              threatAfter: threatAfterRes,
            });
            // Nước kém: cùng ngưỡng với màn Review ván (classifyWinDrop)
            const winDrop = winChance(bestScoreBefore) - winChance(-scoreAfterOpp);
            const quality = classifyWinDrop(winDrop, undefined, playedLoss);

            // BƯỚC 1: CHỌN ĐÚNG 1 Ý CHÍNH DUY NHẤT (Primary Intent)
            // - Nếu nước đi là sai lầm rõ rệt (mistake/blunder), nhãn chính là "Nước kém"
            // - Ngược lại, lấy nhãn chính duy nhất từ `playedIntent.primaryPurpose`
            let dominantTheme: string | null = null;
            if (quality === "mistake" || quality === "blunder") {
              dominantTheme = "Nước kém";
            } else if (playedIntent?.primaryPurpose) {
              dominantTheme = PURPOSE_SHORT_LABELS[playedIntent.primaryPurpose] ?? PURPOSE_NAMES[playedIntent.primaryPurpose];
            }

            // Đa nhãn (recall): mọi purposes + "Nước kém". Ý chính (precision): đúng 1 nhãn dominantTheme.
            const playedPurposes: string[] = (playedIntent?.purposes ?? []).map(
              (p: Purpose) => PURPOSE_SHORT_LABELS[p] ?? PURPOSE_NAMES[p]
            );
            if (quality === "mistake" || quality === "blunder") playedPurposes.push("Nước kém");
            const primaryLabels: string[] = dominantTheme ? [dominantTheme] : [];

            const expertThemes = extractExpertTacticalThemes(expertComment);
            let themeMatched = false;
            if (expertThemes.length > 0) {
              tacticalThemeCount++;
              themeMatched = expertThemes.some((t) => primaryLabels.some((p) => sameTheme(p, t)));
              if (themeMatched) tacticalMatchCount++;
              if (expertThemes.some((t) => playedPurposes.some((p) => sameTheme(p, t)))) tacticalMatchAnyCount++;
              for (const t of expertThemes) {
                const row = themeRow(t);
                row.expert++;
                if (playedPurposes.some((p) => sameTheme(p, t))) row.hitAny++;
                if (primaryLabels.some((p) => sameTheme(p, t))) row.hitPrimary++;
              }
            }
            for (const p of playedPurposes) themeRow(p).aiAny++;
            for (const p of primaryLabels) themeRow(p).aiPrimary++;

            const comp: PlyComparison = {
              gameId: game.id,
              gameTitle: game.title,
              ply,
              turn: curTurn,
              playedNotation: notation,
              expertComment,
              evalAgreement: {
                expertEval,
                aiLeader,
                status: evalStatus,
                postFen: fenAfter,
                aiEvalText: analysisAfter.layer1.evalText,
              },
              suggestedMoveMatch: suggestedMatch,
              tacticalThemeMatch: {
                expertThemes,
                playedMovePurposes: playedPurposes,
                isMatched: themeMatched,
              },
              aiCommentary: commentaryBefore,
            };

            allComparisons.push(comp);

            // Log tiến độ
            const sideStr = curTurn === "r" ? "Đỏ" : "Đen";
            console.log(`  -> Ply ${ply} (${sideStr}: ${notation}):`);
            console.log(`     [Đại sư]: "${expertComment.slice(0, 60).replace(/\n/g, " ")}..."`);
            if (expertEval !== "unclear") {
              console.log(`     [Cán cân Post-Move]: Đại sư=${expertEval.toUpperCase()} | AI=${aiLeader ? aiLeader.toUpperCase() : "HÒA"} => ${evalStatus.toUpperCase()}`);
            }
            if (suggestedMatch) {
              console.log(`     [Nước gợi ý]: Đại sư="${suggestedMatch.extractedFromExpert}" => AI Top-3: ${suggestedMatch.matchedInTopCandidates ? `TRÙNG KHỚP (Top ${suggestedMatch.rank}) ✓` : "Khác biệt"} (Cơ hội ngẫu nhiên: ${(suggestedMatch.randomBaselineProb * 100).toFixed(1)}%)`);
            }
            if (expertThemes.length > 0) {
              console.log(`     [Chiến thuật nước đi]: Đại sư=[${expertThemes.join(", ")}] | AI=[${playedPurposes.join(", ")}] (chính: ${dominantTheme ?? "—"}) => ${themeMatched ? "KHỚP ✓" : "Khác"}`);
            }
          } catch (err) {
            console.error(`Lỗi phân tích tại ply ${ply}:`, err);
          }
        }

        // Tiến bước trên bàn cờ
        curBoard = nextBoard;
        curTurn = nextTurn;
        historyMoves.push(moveCoord);
        historyNotations.push(notation);
      }
    }
  });

  // Tính toán các chỉ số và khoảng tin cậy Wilson 95%
  const evalRate = evalOpinionCount > 0 ? (evalAgreementCount / evalOpinionCount) * 100 : 0;
  const evalCI = wilsonScoreCI(evalAgreementCount, evalOpinionCount);

  const moveRate = totalSuggestionsFound > 0 ? (suggestionMatchCount / totalSuggestionsFound) * 100 : 0;
  const moveCI = wilsonScoreCI(suggestionMatchCount, totalSuggestionsFound);
  const avgRandomBaseline = totalSuggestionsFound > 0 ? (sumRandomBaseline / totalSuggestionsFound) * 100 : 0;
  const liftFactor = avgRandomBaseline > 0 ? Math.round((moveRate / avgRandomBaseline) * 10) / 10 : 0;

  const themeRate = tacticalThemeCount > 0 ? (tacticalMatchCount / tacticalThemeCount) * 100 : 0;
  const themeCI = wilsonScoreCI(tacticalMatchCount, tacticalThemeCount);

  // Đếm phân phối ground-truth để tính mốc Majority Class Baseline (ZeroR)
  let redGt = 0;
  let blackGt = 0;
  let drawGt = 0;
  for (const c of allComparisons) {
    if (c.evalAgreement.expertEval === "r") redGt++;
    else if (c.evalAgreement.expertEval === "b") blackGt++;
    else if (c.evalAgreement.expertEval === "draw") drawGt++;
  }
  const majorityCount = Math.max(redGt, blackGt, drawGt);
  const majorityBaselinePct = evalOpinionCount > 0 ? Math.round((majorityCount / evalOpinionCount) * 1000) / 10 : 0;

  // Lọc các ca đồng thuận và bất đồng để trình bày minh bạch
  const agreedSamples = allComparisons.filter(
    (c) => c.evalAgreement.status === "agree" || c.suggestedMoveMatch?.matchedInTopCandidates
  ).slice(0, 6);

  const divergentSamples = allComparisons.filter(
    (c) => c.evalAgreement.status === "disagree" || (c.suggestedMoveMatch && !c.suggestedMoveMatch.matchedInTopCandidates)
  ).slice(0, 6);

  const report = {
    timestamp: new Date().toISOString(),
    gamesAnalyzed: selectedFiles.length,
    totalPliesVerifiedLegal,
    illegalMovesCount,
    totalAnnotatedPlies: allComparisons.length,
    evaluation: {
      sampleCount: evalOpinionCount,
      hitCount: evalAgreementCount,
      disagreeCount: evalDisagreementCount,
      ratePct: Math.round(evalRate * 10) / 10,
      ciLowerPct: evalCI[0],
      ciUpperPct: evalCI[1],
      majorityBaselinePct,
      distribution: { red: redGt, black: blackGt, draw: drawGt },
    },
    moveSuggestion: {
      sampleCount: totalSuggestionsFound,
      hitCount: suggestionMatchCount,
      ratePct: Math.round(moveRate * 10) / 10,
      ciLowerPct: moveCI[0],
      ciUpperPct: moveCI[1],
      avgRandomBaselinePct: Math.round(avgRandomBaseline * 10) / 10,
      liftFactor,
    },
    tacticalTheme: {
      sampleCount: tacticalThemeCount,
      hitCount: tacticalMatchCount,
      ratePct: Math.round(themeRate * 10) / 10,
      ciLowerPct: themeCI[0],
      ciUpperPct: themeCI[1],
      perTheme,
    },
    agreedSamples,
    divergentSamples,
  };

  // Xuất file JSON
  const outJsonPath = path.join(dataDir, "comparison_report.json");
  fs.writeFileSync(outJsonPath, JSON.stringify(report, null, 2), "utf-8");

  // Tạo báo cáo Markdown chi tiết
  const outMdPath = path.join(dataDir, "COMPARISON_REPORT.md");
  let md = `# Báo Cáo Đối Sánh Bình Luận Đại Sư vs Hệ Thống AI (Bản Chuẩn Hóa V2.1)\n\n`;
  md += `*Thời gian thực hiện: ${report.timestamp}*\n`;
  md += `*Số ván phân tích: ${report.gamesAnalyzed} ván danh thủ Thăng Long Kỳ Đạo*\n`;
  md += `*Xác thực tính hợp lệ luật cờ: ${report.totalPliesVerifiedLegal} nửa nước được kiểm tra bằng \`legalMoves()\` (Số nước phạm quy: ${report.illegalMovesCount})*\n`;
  md += `*Tổng số nước cờ có lời bình chuyên gia được đối chiếu: ${report.totalAnnotatedPlies} nước*\n\n`;

  md += `## 1. Kết Quả Đo Lường Khách Quan & Khoảng Tin Cậy 95%\n\n`;
  md += `| Tiêu chí đo lường | Số mẫu ($N$) | Trùng khớp | Tỷ lệ (%) | KTC 95% (Wilson) | Mốc cơ sở (Baseline) | Phạm vi & Giới hạn đo lường |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: | :--- |\n`;
  md += `| **Cán cân thế trận (Post-Move)** | ${report.evaluation.sampleCount} | ${report.evaluation.hitCount} | **${report.evaluation.ratePct}%** | [${report.evaluation.ciLowerPct}% – ${report.evaluation.ciUpperPct}%] | Lớp đa số (ZeroR): **${report.evaluation.majorityBaselinePct}%** (Đỏ: ${redGt}, Đen: ${blackGt}, Hòa: ${drawGt}) | Đo sau nước đi, chuẩn hóa độc lập 'r'/'b'/null. Không thể kết luận vượt trội nếu KTC bao trùm mốc cơ sở. |\n`;
  md += `| **Nước cờ gợi ý (Top-3 Pick)** | ${report.moveSuggestion.sampleCount} | ${report.moveSuggestion.hitCount} | **${report.moveSuggestion.ratePct}%** | [${report.moveSuggestion.ciLowerPct}% – ${report.moveSuggestion.ciUpperPct}%] | Ngẫu nhiên: **${report.moveSuggestion.avgRandomBaselinePct}%** (Lift: ${report.moveSuggestion.liftFactor}x) | **Chỉ đo năng lực tìm nước của Pikafish**, KHÔNG đo chất lượng hành văn của 5 khối bình luận. |\n`;
  md += `| **Ý đồ chiến thuật nước đã đi** | ${report.tacticalTheme.sampleCount} | ${report.tacticalTheme.hitCount} | **${report.tacticalTheme.ratePct}%** | [${report.tacticalTheme.ciLowerPct}% – ${report.tacticalTheme.ciUpperPct}%] | — | Đo \`detectIntent\` trên chính nước cờ được đại sư nhận xét. Mỗi nước giữ đúng 1 ý chính (Dominant Intent). |\n\n`;

  md += `Khớp đa nhãn (bất kỳ nhãn nào của AI trùng đại sư): **${tacticalMatchAnyCount}/${tacticalThemeCount}** · Khớp ý chính (1 nhãn): **${tacticalMatchCount}/${tacticalThemeCount}**\n\n`;
  md += `### Phân Bố Theo Từng Chủ Đề Chiến Thuật\n\n`;
  md += `| Chủ đề | Đại sư nhắc | Trúng (đa nhãn) | Trúng (ý chính) | AI gán (đa nhãn) | AI gán (ý chính) |\n`;
  md += `| :--- | :---: | :---: | :---: | :---: | :---: |\n`;
  for (const [k, v] of Object.entries(perTheme).sort((a, b) => b[1].expert - a[1].expert)) {
    md += `| **${k}** | ${v.expert} | ${v.hitAny} | ${v.hitPrimary} | ${v.aiAny} | ${v.aiPrimary} |\n`;
  }
  md += `\n`;

  md += `> **Ghi chú phương pháp luận:**\n`;
  md += `> - Mốc ngẫu nhiên của nước gợi ý là null-hypothesis tối thiểu; trong thực tế nhiều nước hợp lệ là vô lý nên mốc này mang tính tham chiếu thô.\n`;
  md += `> - Để đánh giá thực chất chất lượng bình luận tự nhiên (5 khối: Nhận định, Ý đồ, Kế hoạch, So sánh, Bài học), phương pháp chuẩn là gắn nhãn tay theo rubric đánh giá nội dung thay vì dùng regex.\n\n`;

  md += `## 2. Các Ca Đồng Thuận Tiêu Biểu (Agreed Cases)\n\n`;
  for (const s of report.agreedSamples) {
    md += `### [${s.gameTitle}] – Nước ${s.ply} (${s.turn === "r" ? "Đỏ" : "Đen"}: ${s.playedNotation})\n\n`;
    md += `> **Lời bình của Đại sư / Chuyên gia:**\n`;
    md += `> "${s.expertComment.replace(/\n/g, "\n> ")}"\n\n`;
    md += `- **Cán cân:** Đại sư = \`${s.evalAgreement.expertEval.toUpperCase()}\` ↔ AI Leader = \`${s.evalAgreement.aiLeader ? s.evalAgreement.aiLeader.toUpperCase() : "HÒA"}\` (${s.evalAgreement.status === "agree" ? "Đồng thuận ✓" : "Khác biệt"})\n`;
    if (s.suggestedMoveMatch) {
      md += `- **Nước gợi ý:** Đại sư đề xuất \`${s.suggestedMoveMatch.extractedFromExpert}\` → **${s.suggestedMoveMatch.matchedInTopCandidates ? `TRÙNG KHỚP (Top ${s.suggestedMoveMatch.rank} AI)` : "Khác biệt"}** (AI Top-3: ${s.suggestedMoveMatch.aiTopCandidates.join(", ")})\n`;
    }
    if (s.tacticalThemeMatch.expertThemes.length > 0) {
      md += `- **Chiến thuật nước đã đi:** Đại sư nhận định [${s.tacticalThemeMatch.expertThemes.join(", ")}] ↔ AI detectIntent gán [${s.tacticalThemeMatch.playedMovePurposes.join(", ")}]\n`;
    }
    md += `\n**Đoạn bình luận AI 5 khối tương ứng:**\n`;
    md += `- *Nhận định:* ${s.aiCommentary.blocks.assessment}\n`;
    md += `- *Kế hoạch:* ${s.aiCommentary.blocks.plan}\n`;
    if (s.aiCommentary.blocks.lesson) md += `- *Bài học:* ${s.aiCommentary.blocks.lesson}\n`;
    md += `\n---\n\n`;
  }

  md += `## 3. Các Ca Bất Đồng Tiêu Biểu (Divergent Cases)\n\n`;
  for (const s of report.divergentSamples) {
    md += `### [${s.gameTitle}] – Nước ${s.ply} (${s.turn === "r" ? "Đỏ" : "Đen"}: ${s.playedNotation})\n\n`;
    md += `> **Lời bình của Đại sư / Chuyên gia:**\n`;
    md += `> "${s.expertComment.replace(/\n/g, "\n> ")}"\n\n`;
    md += `- **Dữ liệu so sánh:**\n`;
    if (s.evalAgreement.status === "disagree") {
      md += `  - *Cán cân cục diện:* Đại sư nhận định \`${s.evalAgreement.expertEval.toUpperCase()}\`, trong khi Pikafish đánh giá sau nước đi là \`${s.evalAgreement.aiLeader ? s.evalAgreement.aiLeader.toUpperCase() : "HÒA"}\` (${s.evalAgreement.aiEvalText}).\n`;
    }
    if (s.suggestedMoveMatch && !s.suggestedMoveMatch.matchedInTopCandidates) {
      md += `  - *Nước cờ thay thế:* Đại sư gợi ý \`${s.suggestedMoveMatch.extractedFromExpert}\`, trong khi Pikafish Top-3 đề xuất [${s.suggestedMoveMatch.aiTopCandidates.join(", ")}].\n`;
    }
    md += `\n---\n\n`;
  }

  fs.writeFileSync(outMdPath, md, "utf-8");

  console.log(`\n=================================================================`);
  console.log(`KẾT QUẢ ĐỐI SÁNH HOÀN TẤT`);
  console.log(`- Nước cờ hợp lệ 100%: ${report.totalPliesVerifiedLegal} nước (${report.illegalMovesCount} lỗi)`);
  console.log(`- Cán cân thế trận (Post-Move): ${report.evaluation.ratePct}% [${report.evaluation.ciLowerPct}% - ${report.evaluation.ciUpperPct}%] (Khớp ${report.evaluation.hitCount}/${report.evaluation.sampleCount})`);
  console.log(`- Nước biến gợi ý: ${report.moveSuggestion.ratePct}% [${report.moveSuggestion.ciLowerPct}% - ${report.moveSuggestion.ciUpperPct}%] (Khớp ${report.moveSuggestion.hitCount}/${report.moveSuggestion.sampleCount})`);
  console.log(`  -> Mốc ngẫu nhiên (Random Baseline): ${report.moveSuggestion.avgRandomBaselinePct}% | Lift Factor: ${report.moveSuggestion.liftFactor}x`);
  console.log(`- Chiến thuật nước đã đi: ${report.tacticalTheme.ratePct}% [${report.tacticalTheme.ciLowerPct}% - ${report.tacticalTheme.ciUpperPct}%] (Khớp ${report.tacticalTheme.hitCount}/${report.tacticalTheme.sampleCount})`);
  console.log(`  -> Đa nhãn: ${tacticalMatchAnyCount}/${tacticalThemeCount} | Ý chính: ${tacticalMatchCount}/${tacticalThemeCount}`);
  console.log(`\nTheo chủ đề: đại sư | trúng đa nhãn | trúng ý chính | AI gán đa nhãn | AI gán ý chính`);
  for (const [k, v] of Object.entries(perTheme).sort((a, b) => b[1].expert - a[1].expert)) {
    console.log(`  ${k.padEnd(16)} ${[v.expert, v.hitAny, v.hitPrimary, v.aiAny, v.aiPrimary].map((n) => String(n).padStart(5)).join("")}`);
  }
  console.log(`- Đã xuất báo cáo JSON: ${outJsonPath}`);
  console.log(`- Đã xuất báo cáo Markdown: ${outMdPath}`);
  console.log(`=================================================================\n`);
}

if (process.argv[1]?.includes("compare-expert-commentary")) {
  // Engine pool giữ tiến trình Pikafish sống, phải thoát tường minh để lệnh kết thúc
  runBenchmark()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("Lỗi thực thi benchmark:", e);
      process.exit(1);
    });
}
