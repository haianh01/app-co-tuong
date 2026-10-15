import {
  type Board,
  type Move,
  type Side,
  colOf,
  findKing,
  inCheck,
  legalMoves,
  opponent,
  play,
  sideOf,
  toFen,
} from "./engine";
import { assessPosition, type FactorAssessment, type PositionAssessment } from "./assess";
import { detectIntent, type IntentFact, type Purpose, PURPOSE_NAMES } from "./intent";
import { detectPatterns, type DetectedPattern } from "./patterns";
import { detectTheoreticalEndgame, type TheoreticalEndgame } from "./endgame";
import { countMajorPieces, type GamePhase } from "./phases";
import { getOpeningGuide, findNextBookMoves, isBookMove, type OpeningGuide, type NextBookMove } from "./openings";
import { detectThreat, type ThreatData, type ThreatFact } from "./threats";
import { narratePv } from "./narrate";
import { moveNotation } from "./notation";
import { moveToUci, MATE_SCORE, MATE_THRESHOLD } from "./uci";
import { winChance } from "./analysis";
import { ref, type PieceRef } from "./explain";

/** Tên rút gọn chuẩn xác cho 10 loại mục đích theo spec */
export const PURPOSE_SHORT_LABELS: Record<Purpose, string> = {
  datSat: "Đặt sát",
  lapHinh: "Lập hình",
  anQuan: "Ăn quân",
  thiQuan: "Thí quân",
  hoaGiai: "Hóa giải",
  caiThienQuan: "Cải thiện quân",
  boQuan: "Bó quân",
  doiQuan: "Đổi quân",
  giuTien: "Giữ tiên",
  kyThuatTanCuoc: "Kỹ thuật tàn cuộc",
};

/** Tên hiển thị các giai đoạn ván cờ */
export const PHASE_LABELS: Record<GamePhase, string> = {
  khaiCuoc: "Khai cuộc",
  trungCuoc: "Trung cuộc",
  tanCuoc: "Tàn cuộc",
};

export interface WdlStats {
  win: number;
  draw: number;
  loss: number;
}

export interface CandidateMoveAnalysis {
  move: Move;
  uci: string;
  notation: string;
  scoreCp: number;
  scoreText: string;
  isMate: boolean;
  mateInPlies?: number;
  depth?: number;
  pv: Move[];
  pvNotations: string[];
  wdl?: WdlStats;
  intent: IntentFact | null;
  purpose: Purpose;
  purposeLabel: string;
  narrative: string;
}

/** Tầng 1: Tính toán bằng engine (Pikafish) */
export interface Layer1Engine {
  candidates: CandidateMoveAnalysis[];
  bestMove: Move | null;
  evalCp: number;
  evalText: string;
  wdl: WdlStats | null;
  inCheck: boolean;
  isGameOver: boolean;
  gameOverReason?: string;
  engineAvailable: boolean;
  engineMessage?: string;
}

/** Tầng 2: Đánh giá cục diện theo 9 yếu tố */
export interface Layer2Assessment {
  assessment: PositionAssessment;
  displayText: string;
  factors: (FactorAssessment & { text: string })[];
  dynamic: boolean;
  summary?: string;
}

/** Tầng 3: Đòn dọa của đối phương */
export interface Layer3Threats {
  inCheck: boolean;
  hasThreat: boolean;
  threatStatus: "inCheck" | "threat" | "none";
  threatMove: Move | null;
  threatNotation: string | null;
  threatPv: Move[];
  threatPvNotations: string[];
  isMateThreat: boolean;
  dangerPieces: PieceRef[];
  description: string;
  rawFact?: ThreatFact | null;
}

/** Tầng 4: Ý đồ của các nước cờ ứng viên */
export interface Layer4Intent {
  candidates: {
    move: Move;
    notation: string;
    purpose: Purpose;
    purposeLabel: string;
    allPurposes: Purpose[];
    narrative: string;
    summary: string;
  }[];
}

/** Tầng 5: Hình sát và tàn cuộc lý thuyết */
export interface Layer5PatternsAndEndgame {
  patterns: DetectedPattern[];
  endgame: TheoreticalEndgame | null;
}

/** Tầng 6: Giai đoạn và khai cuộc */
export interface Layer6PhaseAndOpening {
  phase: GamePhase;
  phaseLabel: string;
  majorsCount: number;
  openingGuide: OpeningGuide | null;
  nextBookMoves: NextBookMove[];
}

/** Kết quả toàn diện của tính năng Phân tích hình cờ (6 tầng) */
export interface PositionAnalysisResult {
  fen: string;
  turn: Side;
  layer1: Layer1Engine;
  layer2: Layer2Assessment;
  layer3: Layer3Threats;
  layer4: Layer4Intent;
  layer5: Layer5PatternsAndEndgame;
  layer6: Layer6PhaseAndOpening;
}

export interface EngineCandidateInput {
  move: Move | null;
  score: number;
  depth?: number;
  pv?: string[];
  pvMoves?: Move[];
  wdl?: [number, number, number];
}

export interface PositionAnalysisInput {
  board: Board;
  turn: Side;
  historyMoves?: Move[];
  historyNotations?: string[];
  engineResult?: {
    score: number;
    depth?: number;
    pv?: string[];
    pvMoves?: Move[];
    lines?: EngineCandidateInput[];
    wdl?: [number, number, number];
  } | null;
  threatResult?: ThreatData | null;
  engineError?: string | null;
}

function parseWdl(raw?: [number, number, number]): WdlStats | null {
  if (!raw || raw.length < 3) return null;
  const total = raw[0] + raw[1] + raw[2];
  if (total <= 0) return null;
  return {
    win: Math.round((raw[0] / total) * 100),
    draw: Math.round((raw[1] / total) * 100),
    loss: Math.round((raw[2] / total) * 100),
  };
}

export function formatScoreText(score: number): { text: string; isMate: boolean; mateInPlies?: number } {
  if (Math.abs(score) >= MATE_THRESHOLD) {
    const matePlies = MATE_SCORE - Math.abs(score);
    const mateMoves = Math.max(1, Math.ceil(matePlies / 2));
    if (score > 0) {
      return { text: `Sát sau ${mateMoves} nước`, isMate: true, mateInPlies: matePlies };
    }
    return { text: `Bị sát sau ${mateMoves} nước`, isMate: true, mateInPlies: matePlies };
  }
  return { text: formatPawnAdvantage(score), isMate: false };
}

/** Quy đổi điểm engine sang "hơn/kém N Tốt" cho người chơi dễ hiểu (100 điểm ≈ 1 Tốt). */
export function formatPawnAdvantage(score: number): string {
  const pawns = Math.abs(score) / 100;
  if (pawns < 0.2) return "ngang nhau";
  const amount = pawns.toFixed(1).replace(".", ",");
  return `${score > 0 ? "hơn" : "kém"} ≈ ${amount} Tốt`;
}

/** Tên quân kèm số lộ theo góc nhìn bên cầm quân, ví dụ "Mã 3", "Xe 2". */
function pieceLabel(p: PieceRef): string {
  if (p.name.includes(" ")) return p.name;
  const col = colOf(p.square);
  const file = sideOf(p.piece) === "r" ? 9 - col : col + 1;
  return `${p.name} ${file}`;
}

function pieceList(pieces: PieceRef[], max = 2): string {
  return pieces.slice(0, max).map(pieceLabel).join(", ");
}

function formatFactorReason(f: FactorAssessment): string {
  const side = f.side === "r" ? "Đỏ" : "Đen";
  const oppSide = f.side === "r" ? "Đen" : "Đỏ";
  const names = pieceList(f.pieces);
  const withPieces = (text: string) => (names ? `${text} (${names})` : text);
  switch (f.id) {
    case "vatChat":
      return `${side} hơn quân`;
    case "anToanTuong":
      return `cung Tướng ${side} vững hơn`;
    case "hoatDongXe":
      return withPieces(`Xe ${side} chiếm lộ thông, cơ động`);
    case "hoatDongMa":
      return withPieces(`Mã ${side} thoáng chân, chiếm điểm tốt`);
    case "phao":
      return withPieces(`Pháo ${side} gây sức ép lên cung`);
    case "totQuaHa":
      return withPieces(`Tốt ${side} qua sông áp sát`);
    case "quanKem":
      return names ? `${oppSide} có quân không căn (${names})` : `${oppSide} có quân không căn, sơ hở`;
    case "sangKien":
      return names
        ? `${side} cầm tiên: ${names} liên tục chiếu, bắt quân, ${oppSide} phải chống đỡ`
        : `${side} cầm tiên, ép ${oppSide} phải chống đỡ`;
    case "khuyetSiTuong":
      return withPieces(`${oppSide} khuyết Sĩ Tượng, quân công ${side} dễ thâm nhập`);
  }
}

/**
 * Phân loại giai đoạn cho thế cờ hiện tại:
 * - Khai cuộc: từ đầu đến khi rời sách khai cuộc hoặc ra đủ quân lớn, muộn nhất nửa nước thứ 24.
 * - Tàn cuộc: khi tổng số Xe Mã Pháo còn <= 5, hoặc thế cờ khớp một tàn cuộc lý thuyết.
 * - Trung cuộc: giai đoạn nằm giữa hai mốc trên.
 */
export function classifyPhase(
  board: Board,
  ply: number,
  playedNotations: string[],
  endgame: TheoreticalEndgame | null,
): GamePhase {
  const majors = countMajorPieces(board);
  if (majors <= 5 || endgame !== null) {
    return "tanCuoc";
  }
  if (ply <= 24) {
    if (playedNotations.length > 0 && isBookMove(playedNotations)) {
      return "khaiCuoc";
    }
    if (ply <= 12) {
      return "khaiCuoc";
    }
  }
  return "trungCuoc";
}

/**
 * Phân tích thế cờ theo 6 tầng tiêu chuẩn.
 */
export function analyzePosition(input: PositionAnalysisInput): PositionAnalysisResult {
  const { board, turn, historyMoves = [], historyNotations = [], engineResult, threatResult, engineError } = input;
  const fen = toFen({ board, turn });
  const currentlyInCheck = inCheck(board, turn);
  const legal = legalMoves({ board, turn });
  const isGameOver = legal.length === 0;
  const opp = opponent(turn);
  const sideName = (s: Side) => (s === "r" ? "Đỏ" : "Đen");

  // Xử lý game over (Bí hoặc Hết nước đi)
  let gameOverReason: string | undefined;
  if (isGameOver) {
    if (currentlyInCheck) {
      gameOverReason = `Chiếu bí: ${sideName(opp)} thắng`;
    } else {
      gameOverReason = `Hết nước đi: ${sideName(opp)} thắng`;
    }
  }

  const engineAvailable = !engineError && engineResult !== null && engineResult !== undefined;
  const rawLines: EngineCandidateInput[] = (engineResult?.lines && engineResult.lines.length > 0)
    ? engineResult.lines
    : engineResult?.pvMoves && engineResult.pvMoves.length > 0
      ? [{ move: engineResult.pvMoves[0], score: engineResult.score, depth: engineResult.depth, pvMoves: engineResult.pvMoves, wdl: engineResult.wdl }]
      : [];

  // TẦNG 1 & TẦNG 4: Top 3 Candidate moves & Intent
  const candidates: CandidateMoveAnalysis[] = [];
  const topLines = rawLines.slice(0, 3);

  for (const line of topLines) {
    if (!line.move) continue;
    const move = line.move;
    const notation = moveNotation(board, move);
    const scoreFormatted = formatScoreText(line.score);
    const pvMoves = line.pvMoves ?? [move];
    const pvNotations: string[] = [];

    // Chuyển chuỗi PV sang ký hiệu tiếng Việt
    let curB = board;
    for (const m of pvMoves) {
      if (!curB[m.from]) break;
      pvNotations.push(moveNotation(curB, m));
      curB = play(curB, m);
    }

    // Tầng 4: Ý đồ nước đi
    const nextB = play(board, move);
    const intent = detectIntent(board, move, nextB, {
      pv: pvMoves,
      evalBefore: { score: engineResult?.score ?? line.score },
    });
    const mainPurpose: Purpose = intent?.purposes[0] ?? (scoreFormatted.isMate ? "datSat" : "caiThienQuan");
    const purposeLabel = PURPOSE_SHORT_LABELS[mainPurpose] ?? PURPOSE_NAMES[mainPurpose];

    // Thuật biến PV bằng lời
    const narration = narratePv(board, turn, pvMoves);

    candidates.push({
      move,
      uci: moveToUci(move),
      notation,
      scoreCp: line.score,
      scoreText: scoreFormatted.text,
      isMate: scoreFormatted.isMate,
      mateInPlies: scoreFormatted.mateInPlies,
      depth: line.depth,
      pv: pvMoves,
      pvNotations,
      wdl: parseWdl(line.wdl) ?? parseWdl(engineResult?.wdl) ?? undefined,
      intent,
      purpose: mainPurpose,
      purposeLabel,
      narrative: narration.summary && narration.summary !== "không có nước tiếp diễn" ? narration.summary : "",
    });
  }

  const bestLine = candidates[0];
  const overallEvalCp = bestLine ? bestLine.scoreCp : (engineResult?.score ?? 0);
  const overallScore = formatScoreText(overallEvalCp);
  // Ghi rõ bên nào hơn/kém để người chơi không phải đoán điểm theo góc nhìn bên nào
  const overallEvalText = overallScore.isMate ? `${sideName(turn)}: ${overallScore.text}` : `${sideName(turn)} ${overallScore.text}`;
  const overallWdl = parseWdl(engineResult?.wdl) ?? bestLine?.wdl ?? null;

  const layer1: Layer1Engine = {
    candidates,
    bestMove: bestLine?.move ?? null,
    evalCp: overallEvalCp,
    evalText: overallEvalText,
    wdl: overallWdl,
    inCheck: currentlyInCheck,
    isGameOver,
    gameOverReason,
    engineAvailable,
    engineMessage: engineError ?? (!engineAvailable ? "Không có dữ liệu engine" : undefined),
  };

  // TẦNG 5: Hình sát (patterns.ts) & Tàn cuộc lý thuyết (endgame.ts)
  const patterns = detectPatterns(board);
  const endgame = detectTheoreticalEndgame(board);
  const layer5: Layer5PatternsAndEndgame = {
    patterns,
    endgame,
  };

  // TẦNG 6: Giai đoạn (phases.ts) & Khai cuộc (openings.ts)
  const currentPly = historyMoves.length;
  const phase = classifyPhase(board, currentPly, historyNotations, endgame);
  const majorsCount = countMajorPieces(board);
  const openingGuide = currentPly <= 20 ? getOpeningGuide(historyNotations) : null;
  const nextBookMoves = currentPly <= 20 ? findNextBookMoves(historyNotations) : [];
  const layer6: Layer6PhaseAndOpening = {
    phase,
    phaseLabel: PHASE_LABELS[phase],
    majorsCount,
    openingGuide,
    nextBookMoves,
  };

  // TẦNG 2: Đánh giá cục diện theo 9 yếu tố (assess.ts)
  // Quy đổi điểm cp từ góc nhìn của Đỏ để assessPosition xử lý chuẩn
  const redEvalCp = turn === "r" ? overallEvalCp : -overallEvalCp;
  // % thắng cho người chơi tính theo đường cong winChance. WDL của Pikafish đo máy đấu máy nên rất dốc
  // (ví dụ +440 điểm đã ra 1000/0/0), hiển thị "100% thắng" khi mới hơn ~3 Tốt là gây hiểu lầm.
  const winPct = Math.round(winChance(redEvalCp) * 100);

  const assessment = assessPosition(board, {
    evalCp: redEvalCp,
    winPct,
    pv: bestLine?.pv,
    turn,
  });

  // Xây dựng câu tóm tắt cục diện hiển thị theo mẫu của spec:
  // "Đỏ ưu thế lớn (+350 cp, 68% thắng) nhờ: Xe chiếm lộ thông · Pháo đầu · Đen khuyết Sĩ."
  let displayText = "";
  if (assessment.leader) {
    const leaderStr = sideName(assessment.leader);
    const absCp = Math.abs(assessment.evalCp);
    const leaderScore = assessment.leader === "r" ? assessment.evalCp : -assessment.evalCp;
    const scoreFormatted = formatScoreText(leaderScore);
    const leaderWin = Math.round(winChance(leaderScore) * 100);

    const advLevel = absCp >= MATE_THRESHOLD || absCp >= 400 ? "ưu thế quyết định" : absCp >= 200 ? "ưu thế lớn" : "hơi ưu thế";
    const reasons = assessment.factors
      .slice(0, 3)
      .map(formatFactorReason);

    const reasonsStr = reasons.length > 0 ? ` nhờ: ${reasons.join(" · ")}` : "";
    displayText = `${leaderStr} ${advLevel} (${scoreFormatted.text}, ${leaderWin}% thắng)${reasonsStr}`;
  } else {
    displayText = `Cục diện cân bằng (Đỏ ${winPct}% thắng)`;
  }

  const layer2: Layer2Assessment = {
    assessment,
    displayText,
    factors: assessment.factors.slice(0, 3).map((f) => ({ ...f, text: formatFactorReason(f) })),
    dynamic: assessment.dynamic,
    summary: assessment.summary,
  };

  // TẦNG 3: Đòn dọa của đối phương (threats.ts)
  let layer3: Layer3Threats;
  if (currentlyInCheck) {
    layer3 = {
      inCheck: true,
      hasThreat: true,
      threatStatus: "inCheck",
      threatMove: null,
      threatNotation: null,
      threatPv: [],
      threatPvNotations: [],
      isMateThreat: false,
      dangerPieces: findKing(board, turn) >= 0 ? [ref(board, findKing(board, turn))] : [],
      description: "Đang bị chiếu tướng",
    };
  } else {
    // Đo đòn dọa bằng mức tăng so với điểm hiện tại, không phải điểm tuyệt đối sau null-move
    const threatData = threatResult && threatResult.baseScore === undefined && engineResult
      ? { ...threatResult, baseScore: -engineResult.score }
      : threatResult;
    const threatFact = detectThreat(board, turn, threatData);
    if (threatFact) {
      layer3 = {
        inCheck: false,
        hasThreat: true,
        threatStatus: "threat",
        threatMove: threatResult?.threatMove ?? null,
        threatNotation: threatFact.move,
        threatPv: threatResult?.pv ?? [],
        threatPvNotations: threatFact.line,
        isMateThreat: threatFact.isMate,
        dangerPieces: threatFact.targets,
        description: threatFact.summary ?? `${sideName(opp)} đang có đòn dọa nguy hiểm`,
        rawFact: threatFact,
      };
    } else {
      layer3 = {
        inCheck: false,
        hasThreat: false,
        threatStatus: "none",
        threatMove: null,
        threatNotation: null,
        threatPv: [],
        threatPvNotations: [],
        isMateThreat: false,
        dangerPieces: [],
        description: "Đối phương chưa có đòn đe dọa trực tiếp",
      };
    }
  }

  // TẦNG 4: Tổng hợp ý đồ các nước đi ứng viên
  const layer4: Layer4Intent = {
    candidates: candidates.map((c) => ({
      move: c.move,
      notation: c.notation,
      purpose: c.purpose,
      purposeLabel: c.purposeLabel,
      allPurposes: c.intent?.purposes ?? [c.purpose],
      narrative: c.narrative,
      summary: c.intent?.summary ?? c.narrative,
    })),
  };

  return {
    fen,
    turn,
    layer1,
    layer2,
    layer3,
    layer4,
    layer5,
    layer6,
  };
}
