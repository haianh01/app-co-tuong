// Đánh giá thế cờ toàn diện: giải thích vì sao một bên chiếm ưu thế dựa trên dữ kiện kỳ lý tĩnh.
// Kết hợp 9 yếu tố cốt lõi, trích xuất top 3 lý do quan trọng nhất, kèm cờ dynamic khi ưu thế đến từ biến sâu.
// Hoạt động thuần hàm, tất định (deterministic), không gọi engine bên trong.

import {
  sideOf, typeOf, opponent,
  type Board, type Move, type PieceType, type Side,
} from "./engine";
import { ref, type PieceRef } from "./explain";
import { extractFeatures, type SideFeatures } from "./features";
import { narratePv } from "./narrate";
import { palacePressure, advance } from "./strategy";
import { analyzeForcingPlies } from "./middlegame";

export type FactorId =
  | "vatChat"
  | "anToanTuong"
  | "hoatDongXe"
  | "hoatDongMa"
  | "phao"
  | "totQuaHa"
  | "quanKem"
  | "sangKien"
  | "khuyetSiTuong";

export interface FactorAssessment {
  id: FactorId;
  side: Side;
  /** Điểm đóng góp của yếu tố này (dương, càng cao càng quan trọng). */
  weight: number;
  /** Danh sách quân cờ tiêu biểu liên quan tới yếu tố này. */
  pieces: PieceRef[];
}

export interface PositionAssessment {
  kind: "assessment";
  leader: Side | null;
  evalCp: number;
  winPct: number;
  /** Top 3 yếu tố quan trọng nhất giải thích ưu thế. */
  factors: FactorAssessment[];
  /** True khi engine đánh giá điểm cao nhưng các yếu tố tĩnh giải thích chưa tới 40% (ưu thế đến từ chuỗi biến chiến thuật). */
  dynamic: boolean;
  /** Lời tóm tắt lý do ưu thế (đặc biệt khi dynamic = true). */
  summary?: string;
}

export interface AssessOptions {
  /** Điểm centipawn của engine (dương = Đỏ hơn, âm = Đen hơn). */
  evalCp?: number;
  /** Xác suất thắng (0 - 100). */
  winPct?: number;
  /** Chuỗi biến chính (Principal Variation) từ engine. */
  pv?: Move[];
  /** Lượt đi hiện tại. */
  turn?: Side;
}

/** Tên tiếng Việt hiển thị của từng yếu tố kỳ lý. */
export const FACTOR_NAMES: Record<FactorId, string> = {
  vatChat: "ưu thế hơn quân (vật chất)",
  anToanTuong: "cung Tướng an toàn, vững chắc",
  hoatDongXe: "Xe cơ động, chiếm lộ thông",
  hoatDongMa: "Mã linh hoạt, chiếm điểm cao",
  phao: "sức ép Pháo đầu / Pháo cắm đáy",
  totQuaHa: "uy lực Tốt qua sông",
  quanKem: "có quân đối phương treo, sơ hở",
  sangKien: "nắm quyền chủ động, ép liên tục",
  khuyetSiTuong: "khai thác đối phương khuyết Sĩ Tượng",
};

/** Bảng trọng số mặc định cho từng yếu tố (tương ứng với thang điểm centipawn). */
export const DEFAULT_FACTOR_WEIGHTS: Record<FactorId, number> = {
  vatChat: 1.0,
  anToanTuong: 1.2,
  hoatDongXe: 0.9,
  hoatDongMa: 0.8,
  phao: 0.85,
  totQuaHa: 0.75,
  quanKem: 1.1,
  sangKien: 0.9,
  khuyetSiTuong: 1.0,
};

const PIECE_VALUES: Record<PieceType, number> = {
  k: 0,
  r: 900,
  c: 450,
  n: 400,
  b: 200,
  a: 200,
  p: 100,
};

/** Tính tổng giá trị vật chất của một bên (đã tính Tốt qua sông = 200). */
function computeMaterial(board: Board, s: Side): { total: number; pieces: PieceRef[] } {
  let total = 0;
  const pieceRefs: PieceRef[] = [];
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && sideOf(p) === s) {
      const t = typeOf(p);
      let val = PIECE_VALUES[t];
      if (t === "p") {
        const adv = advance(i, s);
        if (adv >= 5) val = 200;
      }
      total += val;
      if (t !== "k") pieceRefs.push(ref(board, i));
    }
  }
  return { total, pieces: pieceRefs };
}

/** 1. Đánh giá yếu tố Vật chất (vatChat). */
function evaluateMaterial(board: Board): { delta: number; pieces: PieceRef[] } {
  const red = computeMaterial(board, "r");
  const black = computeMaterial(board, "b");
  const delta = red.total - black.total;
  const favoredPieces = delta > 0 ? red.pieces.slice(0, 3) : black.pieces.slice(0, 3);
  return { delta, pieces: favoredPieces };
}

/** 2. Đánh giá yếu tố An toàn Tướng (anToanTuong). */
function evaluateKingSafety(board: Board, features: Record<Side, SideFeatures>): { delta: number; pieces: PieceRef[] } {
  const evaluateSide = (s: Side): { score: number; pieces: PieceRef[] } => {
    const pressure = palacePressure(board, s);
    const guards = features[s].pieces.filter((p) => "ab".includes(typeOf(p.ref.piece))).length;
    const isHigh = features[s].byTag.tuongLenTang?.length ?? 0;
    const kingRef = features[s].pieces.find((p) => typeOf(p.ref.piece) === "k")?.ref;

    // Cung tướng vững: nhiều sĩ tượng, ít áp lực, không lên lầu
    const score = guards * 45 - pressure * 75 - isHigh * 120;
    const keyPieces: PieceRef[] = [];
    if (kingRef) keyPieces.push(kingRef);
    const myGuards = features[s].pieces.filter((p) => "ab".includes(typeOf(p.ref.piece))).map((p) => p.ref);
    keyPieces.push(...myGuards.slice(0, 2));

    return { score, pieces: keyPieces };
  };

  const r = evaluateSide("r");
  const b = evaluateSide("b");
  const delta = r.score - b.score;
  return { delta, pieces: delta > 0 ? r.pieces : b.pieces };
}

/** 3. Đánh giá hoạt động của Xe (hoatDongXe). */
function evaluateRooks(features: Record<Side, SideFeatures>): { delta: number; pieces: PieceRef[] } {
  const evaluateSide = (s: Side): { score: number; pieces: PieceRef[] } => {
    const rooks = features[s].pieces.filter((p) => typeOf(p.ref.piece) === "r");
    let score = 0;
    const relevant: PieceRef[] = [];

    for (const rk of rooks) {
      score += rk.mobility * 15;
      score += rk.safeMoves * 20;

      if (rk.tags.includes("xeLoThong")) score += 70;
      if (rk.tags.includes("xeChiemSuon")) score += 60;
      if (rk.tags.includes("xeTuanHa")) score += 50;
      if (rk.tags.includes("xeCamDay")) score += 65;
      if (rk.tags.includes("xeBiKim")) score -= 110;

      if (
        rk.tags.includes("xeLoThong") ||
        rk.tags.includes("xeChiemSuon") ||
        rk.tags.includes("xeCamDay") ||
        rk.tags.includes("xeBiKim")
      ) {
        relevant.push(rk.ref);
      }
    }

    return { score, pieces: relevant.length ? relevant : rooks.map((r) => r.ref) };
  };

  const r = evaluateSide("r");
  const b = evaluateSide("b");
  const delta = r.score - b.score;
  return { delta, pieces: delta > 0 ? r.pieces : b.pieces };
}

/** 4. Đánh giá hoạt động của Mã (hoatDongMa). */
function evaluateHorses(features: Record<Side, SideFeatures>): { delta: number; pieces: PieceRef[] } {
  const evaluateSide = (s: Side): { score: number; pieces: PieceRef[] } => {
    const horses = features[s].pieces.filter((p) => typeOf(p.ref.piece) === "n");
    let score = 0;
    const relevant: PieceRef[] = [];

    for (const ma of horses) {
      score += ma.mobility * 15;
      score += ma.safeMoves * 25;

      if (ma.tags.includes("maHaKhau")) score += 60;
      if (ma.tags.includes("maNgoaTao")) score += 80;
      if (ma.tags.includes("maQuaiGiac")) score += 70;
      if (ma.tags.includes("maBien")) score -= 45;
      if (ma.tags.includes("maBiCanChan")) score -= 40;
      if (ma.tags.includes("maChet")) score -= 180;

      if (
        ma.tags.includes("maHaKhau") ||
        ma.tags.includes("maNgoaTao") ||
        ma.tags.includes("maQuaiGiac") ||
        ma.tags.includes("maChet")
      ) {
        relevant.push(ma.ref);
      }
    }

    return { score, pieces: relevant.length ? relevant : horses.map((h) => h.ref) };
  };

  const r = evaluateSide("r");
  const b = evaluateSide("b");
  const delta = r.score - b.score;
  return { delta, pieces: delta > 0 ? r.pieces : b.pieces };
}

/** 5. Đánh giá sức ép của Pháo (phao). */
function evaluateCannons(features: Record<Side, SideFeatures>): { delta: number; pieces: PieceRef[] } {
  const evaluateSide = (s: Side): { score: number; pieces: PieceRef[] } => {
    const cannons = features[s].pieces.filter((p) => typeOf(p.ref.piece) === "c");
    let score = 0;
    const relevant: PieceRef[] = [];

    for (const p of cannons) {
      score += p.mobility * 10;
      if (p.tags.includes("phaoDau")) score += 85;
      if (p.tags.includes("phaoCamDay")) score += 70;
      if (p.tags.includes("phaoKhongNgoi")) score -= 65;

      if (p.tags.includes("phaoDau") || p.tags.includes("phaoCamDay") || p.tags.includes("phaoKhongNgoi")) {
        relevant.push(p.ref);
      }
    }

    return { score, pieces: relevant.length ? relevant : cannons.map((c) => c.ref) };
  };

  const r = evaluateSide("r");
  const b = evaluateSide("b");
  const delta = r.score - b.score;
  return { delta, pieces: delta > 0 ? r.pieces : b.pieces };
}

/** 6. Đánh giá sức mạnh của Tốt qua sông (totQuaHa). */
function evaluatePawns(features: Record<Side, SideFeatures>): { delta: number; pieces: PieceRef[] } {
  const evaluateSide = (s: Side): { score: number; pieces: PieceRef[] } => {
    const pawns = features[s].pieces.filter((p) => typeOf(p.ref.piece) === "p");
    let score = 0;
    const relevant: PieceRef[] = [];

    for (const p of pawns) {
      if (p.tags.includes("totQuaHa")) score += 70;
      if (p.tags.includes("totLienHoan")) score += 50;
      if (p.tags.includes("totVaoCung")) score += 130;
      if (p.tags.includes("totChimDay")) score -= 40;

      if (p.tags.includes("totQuaHa") || p.tags.includes("totVaoCung") || p.tags.includes("totLienHoan")) {
        relevant.push(p.ref);
      }
    }

    return { score, pieces: relevant };
  };

  const r = evaluateSide("r");
  const b = evaluateSide("b");
  const delta = r.score - b.score;
  return { delta, pieces: delta > 0 ? r.pieces : b.pieces };
}

/** 7. Đánh giá quân sơ hở / mất gốc / bị đe dọa (quanKem). */
function evaluateFlaws(features: Record<Side, SideFeatures>): { delta: number; pieces: PieceRef[] } {
  const evaluateSide = (s: Side): { penalty: number; pieces: PieceRef[] } => {
    let penalty = 0;
    const flaws: PieceRef[] = [];

    const hanging = features[s].byTag.treo ?? [];
    penalty += hanging.length * 110;
    flaws.push(...hanging);

    const loose = features[s].byTag.matGoc ?? [];
    penalty += loose.length * 70;
    flaws.push(...loose);

    const chased = features[s].byTag.biQuanReBat ?? [];
    penalty += chased.length * 60;
    flaws.push(...chased);

    return { penalty, pieces: flaws };
  };

  const r = evaluateSide("r");
  const b = evaluateSide("b");
  // Ít khuyết điểm hơn = ưu thế hơn (delta dương là Đỏ tốt hơn)
  const delta = b.penalty - r.penalty;
  return { delta, pieces: delta > 0 ? b.pieces : r.pieces };
}

/** 8. Đánh giá sáng kiến / quyền chủ động (sangKien). */
function evaluateInitiative(
  board: Board,
  features: Record<Side, SideFeatures>,
  pv?: Move[],
  turn?: Side,
): { delta: number; pieces: PieceRef[] } {
  if (pv && pv.length >= 2 && turn) {
    const analysis = analyzeForcingPlies(board, turn, pv);
    const initScore = analysis.forcingPlies * 80;
    const delta = turn === "r" ? initScore : -initScore;
    return { delta, pieces: analysis.activePieces.slice(0, 3) };
  }

  // Fallback khi không có PV: tính theo chênh lệch cơ động và sức ép
  const redPres = palacePressure(board, "b") * 40 + features.r.mobilityTotal * 2;
  const blackPres = palacePressure(board, "r") * 40 + features.b.mobilityTotal * 2;
  const delta = redPres - blackPres;
  return { delta, pieces: [] };
}

/** 9. Khai thác khuyết Sĩ Tượng của đối phương (khuyetSiTuong). */
function evaluateGuardsWeakness(board: Board, features: Record<Side, SideFeatures>): { delta: number; pieces: PieceRef[] } {
  const evaluateSide = (s: Side): { score: number; pieces: PieceRef[] } => {
    const opp = opponent(s);
    const oppAdvisors = features[opp].pieces.filter((p) => typeOf(p.ref.piece) === "a").length;
    const oppElephants = features[opp].pieces.filter((p) => typeOf(p.ref.piece) === "b").length;

    let score = 0;
    const attackers: PieceRef[] = [];

    const myHorses = features[s].pieces.filter((p) => typeOf(p.ref.piece) === "n");
    if (oppAdvisors <= 1 && myHorses.length > 0) {
      score += (2 - oppAdvisors) * 90;
      attackers.push(...myHorses.map((h) => h.ref));
    }

    const myCannons = features[s].pieces.filter((p) => typeOf(p.ref.piece) === "c");
    if (oppElephants <= 1 && myCannons.length > 0) {
      score += (2 - oppElephants) * 85;
      attackers.push(...myCannons.map((c) => c.ref));
    }

    return { score, pieces: attackers };
  };

  const r = evaluateSide("r");
  const b = evaluateSide("b");
  const delta = r.score - b.score;
  return { delta, pieces: delta > 0 ? r.pieces : b.pieces };
}

/**
 * Đánh giá thế cờ toàn diện, xếp hạng top 3 lý do giải thích ưu thế.
 *
 * @param board Bàn cờ hiện tại
 * @param options Các thông số từ engine (evalCp, winPct, pv, turn)
 */
export function assessPosition(board: Board, options?: AssessOptions): PositionAssessment {
  const features = extractFeatures(board);

  // 1. Tính toán giá trị thô và danh sách quân cờ cho cả 9 yếu tố
  const results: Record<FactorId, { delta: number; pieces: PieceRef[] }> = {
    vatChat: evaluateMaterial(board),
    anToanTuong: evaluateKingSafety(board, features),
    hoatDongXe: evaluateRooks(features),
    hoatDongMa: evaluateHorses(features),
    phao: evaluateCannons(features),
    totQuaHa: evaluatePawns(features),
    quanKem: evaluateFlaws(features),
    sangKien: evaluateInitiative(board, features, options?.pv, options?.turn),
    khuyetSiTuong: evaluateGuardsWeakness(board, features),
  };

  // 2. Xác định điểm tổng và bên đang dẫn điểm (leader)
  const factorKeys = Object.keys(results) as FactorId[];
  const weightedSum = factorKeys.reduce((sum, key) => {
    return sum + results[key].delta * DEFAULT_FACTOR_WEIGHTS[key];
  }, 0);

  // Điểm engine: nếu truyền vào thì ưu tiên, không thì lấy điểm tĩnh quy đổi
  const evalCp = options?.evalCp !== undefined ? options.evalCp : Math.round(weightedSum);
  const winPct = options?.winPct !== undefined ? options.winPct : Math.round(50 + 50 * (2 / (1 + Math.exp(-0.004 * evalCp)) - 1));

  const leader: Side | null = evalCp > 35 ? "r" : evalCp < -35 ? "b" : null;

  // 3. Tính điểm đóng góp của từng yếu tố theo chiều của leader
  const factorAssessments: FactorAssessment[] = factorKeys.map((id) => {
    const rawDelta = results[id].delta;
    let weight = 0;

    if (leader === "r") {
      weight = Math.max(0, rawDelta * DEFAULT_FACTOR_WEIGHTS[id]);
    } else if (leader === "b") {
      weight = Math.max(0, -rawDelta * DEFAULT_FACTOR_WEIGHTS[id]);
    } else {
      weight = Math.abs(rawDelta * DEFAULT_FACTOR_WEIGHTS[id]);
    }

    return {
      id,
      side: rawDelta >= 0 ? "r" : "b",
      weight: Math.round(weight),
      pieces: results[id].pieces,
    };
  });

  // Sắp xếp các yếu tố đóng góp nhiều nhất lên đầu
  factorAssessments.sort((a, b) => b.weight - a.weight);
  const topFactors = factorAssessments.filter((f) => f.weight > 0).slice(0, 3);

  // 4. Kiểm tra điều kiện "dynamic" (Không bịa lý do)
  // Khi engine cho điểm lớn (|evalCp| > 150) mà các yếu tố tĩnh giải thích chưa tới 40% số điểm đó
  const totalStaticExplained = topFactors.reduce((acc, f) => acc + f.weight, 0);
  const absEval = Math.abs(evalCp);
  let isDynamic = false;
  let summaryText: string | undefined;

  if (absEval > 150 && totalStaticExplained / absEval < 0.4) {
    isDynamic = true;
    if (options?.pv && options.pv.length > 0 && options.turn) {
      const nar = narratePv(board, options.turn, options.pv);
      summaryText = `Ưu thế đến từ chuỗi biến: ${nar.summary}`;
    } else {
      summaryText = "Ưu thế đến từ biến sâu chiến thuật của engine.";
    }
  }

  return {
    kind: "assessment",
    leader,
    evalCp,
    winPct,
    factors: topFactors,
    dynamic: isDynamic,
    summary: summaryText,
  };
}
