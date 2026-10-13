// Ý đồ nước đi, giải thích cả nước tốt (B4):
// - Trích xuất các mục đích kỳ lý của nước cờ: datSat, lapHinh, anQuan, thiQuan, hoaGiai, caiThienQuan, boQuan, doiQuan, giuTien, kyThuatTanCuoc.
// - Tận dụng chuỗi biến chính (PV) của engine, hình sát cục (patterns.ts), đòn đe dọa (threats.ts), và chuyển biến đặc trưng quân (features.ts).
// Hoạt động thuần hàm, tất định (deterministic), không gọi engine bên trong.

import {
  type Board, type Move, type Side,
  inCheck, legalMoves, opponent, sideOf, typeOf, findKing,
  PIECE_VALUES,
} from "./engine";
import { exchangeGain, ref, type PieceRef } from "./explain";
import { extractFeatures } from "./features";
import { detectPatterns } from "./patterns";
import { detectTheoreticalEndgame } from "./endgame";
import { narratePv } from "./narrate";
import { moveNotation, PIECE_NAME } from "./notation";
import { detectThreatMoveFacts, type ThreatData } from "./threats";
import { detectExchange } from "./middlegame";

export type Purpose =
  | "datSat"          // Đe dọa hoặc thực hiện sát cục (chiếu bí)
  | "lapHinh"         // Lập hình sát cục kinh điển
  | "anQuan"          // Ăn quân đối phương có lời
  | "thiQuan"         // Thí quân: mất quân ngay nhưng cuối biến không thua vật chất hoặc chiếu bí
  | "hoaGiai"         // Hóa giải: triệt tiêu đòn dọa, giải chiếu, cứu quân treo
  | "caiThienQuan"    // Cải thiện vị trí quân: tăng tầm hoạt động, kiểm soát điểm cao
  | "boQuan"          // Bó quân / kìm hãm đối phương: ghim, cản chân Mã, phong tỏa Xe
  | "doiQuan"         // Đổi quân có chủ đích: đơn giản hóa, trừ khử quân công, phá phòng tuyến
  | "giuTien"         // Giữ tiên / tranh tiên: ép buộc liên tục bằng đòn chiếu hoặc dọa sát
  | "kyThuatTanCuoc";  // Vận dụng định thức / kỹ thuật tàn cuộc chuẩn xác

export interface IntentFact {
  kind: "intent";
  move: string;
  side: Side;
  purposes: Purpose[];
  line: string[];
  summary: string;
  pieces: PieceRef[];
}

export interface DetectIntentOptions {
  /** Chuỗi biến chính từ engine (nếu có) */
  pv?: Move[];
  /** Điểm đánh giá trước nước đi (theo bên đi) */
  evalBefore?: { score: number; best?: Move | null } | null;
  /** Điểm đánh giá sau nước đi (theo đối phương) */
  evalAfter?: { score: number; best?: Move | null } | null;
  /** Mức mất điểm so với nước tốt nhất (centipawn) */
  loss?: number;
  /** Số nửa nước đã đi trước nước này */
  ply?: number;
  /** Đòn đe dọa trước nước đi của đối phương */
  threatBefore?: ThreatData | null;
  /** Đòn đe dọa sau nước đi của bên đi */
  threatAfter?: ThreatData | null;
}

/** Tên tiếng Việt hiển thị của từng mục đích nước cờ. */
export const PURPOSE_NAMES: Record<Purpose, string> = {
  datSat: "Đạt sát / Đe dọa sát cục",
  lapHinh: "Lập hình sát cục kinh điển",
  anQuan: "Ăn quân chiếm ưu thế",
  thiQuan: "Thí quân tranh tiên / đoạt thế",
  hoaGiai: "Hóa giải đòn đe dọa",
  caiThienQuan: "Cải thiện vị trí quân",
  boQuan: "Kìm kẹp, bó quân đối phương",
  doiQuan: "Đổi quân có chủ đích",
  giuTien: "Chiếu ép / Giữ quyền chủ động",
  kyThuatTanCuoc: "Vận dụng kỹ thuật tàn cuộc",
};

/**
 * Trích xuất ý đồ chiến thuật và chiến lược của một nước cờ (`move`).
 *
 * @param before Bàn cờ trước nước đi
 * @param move Nước cờ đang xét
 * @param after Bàn cờ sau nước đi
 * @param options Các tham số bổ trợ từ engine và ngữ cảnh ván đấu
 */
export function detectIntent(
  before: Board,
  move: Move,
  after: Board,
  options?: DetectIntentOptions,
): IntentFact | null {
  const movingPiece = before[move.from];
  if (!movingPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  const moveType = typeOf(movingPiece);
  const movePieceRef = ref(before, move.from);
  const moveNotat = moveNotation(before, move);

  const loss = options?.loss ?? 0;
  const isSound = loss <= 60; // Nước đi không phải blunder lớn

  const purposes: Purpose[] = [];
  const involvedPieces: PieceRef[] = [movePieceRef];
  const pieceSqSet = new Set<number>([move.from, move.to]);

  const addPiece = (p: PieceRef) => {
    if (!pieceSqSet.has(p.square)) {
      pieceSqSet.add(p.square);
      involvedPieces.push(p);
    }
  };

  // 1. Phân tích chuỗi PV nếu có
  const fullPv = options?.pv && options.pv.length > 0 ? options.pv : [move];
  const pvToRun = fullPv[0]?.from === move.from && fullPv[0]?.to === move.to ? fullPv : [move, ...fullPv];
  const narration = narratePv(before, mover, pvToRun, { skipThreats: true });

  // ==========================================================
  // KIỂM TRA 1: THÍ QUÂN (thiQuan)
  // Nước làm mất quân ngay, nhưng cuối PV không thua vật chất hoặc có chiếu bí
  // ==========================================================
  const capturedAtDest = before[move.to];
  const destGainByOpp = exchangeGain(after, move.to, opp) ?? 0;
  const pieceLostValue = PIECE_VALUES[moveType];
  const pieceGainedValue = capturedAtDest ? PIECE_VALUES[typeOf(capturedAtDest)] : 0;
  const immediateMaterialLoss = pieceLostValue - pieceGainedValue;

  const immediateSacrifice =
    destGainByOpp > 0 &&
    (immediateMaterialLoss >= 200 || (immediateMaterialLoss > 0 && "rn".includes(moveType)));

  if (immediateSacrifice && isSound) {
    const finalAdvantage = narration.delta.advantageSide === mover && narration.delta.scoreDiff >= 200;
    const leadsToMate = narration.isMate || (options?.evalAfter && options.evalAfter.score <= -99000);
    const scoreFavorable = options?.evalAfter && options.evalAfter.score <= -150;

    if (finalAdvantage || leadsToMate || scoreFavorable) {
      purposes.push("thiQuan");
    }
  }

  // ==========================================================
  // KIỂM TRA 2: ĐẠT SÁT (datSat)
  // Chiếu bí ngay lập tức, hoặc đe dọa sát cục tất thắng trong PV
  // ==========================================================
  const oppInCheckAfter = inCheck(after, opp);
  const isCheckmateNow = oppInCheckAfter && legalMoves({ board: after, turn: opp }).length === 0;
  const leadsToMateInPv = narration.isMate || (options?.evalAfter && options.evalAfter.score <= -99000);

  let createsMateThreat = false;
  if (!isCheckmateNow && isSound && options?.threatAfter) {
    if (options.threatAfter.isMate) {
      createsMateThreat = true;
    }
  }

  if (isCheckmateNow || leadsToMateInPv || createsMateThreat) {
    purposes.push("datSat");
    const oppKing = findKing(after, opp);
    if (oppKing >= 0) addPiece(ref(after, oppKing));
  }

  // ==========================================================
  // KIỂM TRA 3: LẬP HÌNH SÁT CỤC (lapHinh)
  // Lập một hình sát cục kinh điển mới (từ patterns.ts)
  // ==========================================================
  let formedPatternName: string | null = null;
  if (isSound) {
    const patternsAfter = detectPatterns(after, mover);
    if (patternsAfter.length > 0) {
      const patternsBefore = detectPatterns(before, mover);
      const formed = patternsAfter.find((pa) => !patternsBefore.some((pb) => pb.id === pa.id));
      if (formed) {
        purposes.push("lapHinh");
        formedPatternName = formed.name;
        for (const sqIndex of formed.pieces) {
          if (after[sqIndex]) addPiece(ref(after, sqIndex));
        }
      }
    }
  }

  // ==========================================================
  // KIỂM TRA 4: ĂN QUÂN (anQuan)
  // Ăn quân có lời ngay hoặc chuỗi PV thu về lợi thế vật chất >= 200 điểm
  // ==========================================================
  if (capturedAtDest && sideOf(capturedAtDest) === opp) {
    const netGain = exchangeGain(before, move.to, mover) ?? 0;
    if (netGain > 0) {
      if (!purposes.includes("thiQuan")) {
        purposes.push("anQuan");
        addPiece(ref(before, move.to));
      }
    }
  } else if (narration.delta.advantageSide === mover && narration.delta.scoreDiff >= 200 && isSound) {
    if (!purposes.includes("thiQuan")) {
      purposes.push("anQuan");
    }
  }

  // Lazy cache features để chỉ tính khi thực sự cần cho boQuan hoặc caiThienQuan
  let fBeforeCache: ReturnType<typeof extractFeatures> | null = null;
  let fAfterCache: ReturnType<typeof extractFeatures> | null = null;
  const getFBefore = () => {
    if (!fBeforeCache) fBeforeCache = extractFeatures(before);
    return fBeforeCache;
  };
  const getFAfter = () => {
    if (!fAfterCache) fAfterCache = extractFeatures(after);
    return fAfterCache;
  };

  // ==========================================================
  // KIỂM TRA 5: HÓA GIẢI (hoaGiai)
  // Kịp thời hóa giải đòn đe dọa, thoát chiếu, hoặc cứu quân treo
  // ==========================================================
  const wasInCheckBefore = inCheck(before, mover);
  let parriedThreatStr: string | null = null;

  if (options?.threatBefore) {
    const parried = detectThreatMoveFacts({
      before,
      move,
      after,
      loss,
      threatBefore: options.threatBefore,
      threatAfter: options.threatAfter,
    });
    const pFact = parried.find((f) => f.kind === "parried");
    if (pFact && pFact.kind === "parried") {
      purposes.push("hoaGiai");
      parriedThreatStr = pFact.threat;
    }
  } else if (wasInCheckBefore && isSound) {
    purposes.push("hoaGiai");
  } else if (isSound) {
    // Kiểm tra cứu quân treo đang bị bắt: quân ở ô đi có exchangeGain > 0 (bị treo)
    const hangingBefore = (exchangeGain(before, move.from, opp) ?? 0) > 0;
    if (hangingBefore) {
      const destHanging = (exchangeGain(after, move.to, opp) ?? 0) > 0;
      if (!destHanging) {
        purposes.push("hoaGiai");
      }
    }
  }

  // ==========================================================
  // KIỂM TRA 6: BÓ QUÂN / KÌM HÃM (boQuan)
  // Phong tỏa Xe, cản chân Mã, hoặc ghim quân đối phương
  // ==========================================================
  if (isSound) {
    const fBefore = getFBefore();
    const fAfter = getFAfter();

    const blockedBefore = (fBefore[opp].byTag.maBiCanChan ?? []).map((p) => p.square);
    const blockedAfter = (fAfter[opp].byTag.maBiCanChan ?? []).map((p) => p.square);
    const newBlockedHorse = blockedAfter.some((sqIdx) => !blockedBefore.includes(sqIdx));

    const kimBefore = (fBefore[opp].byTag.xeBiKim ?? []).map((p) => p.square);
    const kimAfter = (fAfter[opp].byTag.xeBiKim ?? []).map((p) => p.square);
    const newKimRook = kimAfter.some((sqIdx) => !kimBefore.includes(sqIdx));

    if (newBlockedHorse || newKimRook) {
      purposes.push("boQuan");
    }
  }

  // ==========================================================
  // KIỂM TRA 7: ĐỔI QUÂN CÓ CHỦ ĐÍCH (doiQuan)
  // Đổi quân tương đương (Xe đổi Xe, Mã đổi Mã) để:
  // - Đơn giản hóa khi hơn quân
  // - Trừ khử quân đang công cung mình
  // - Phá phòng tuyến Sĩ Tượng của đối phương
  // ==========================================================
  if (capturedAtDest && sideOf(capturedAtDest) === opp && isSound) {
    const capType = typeOf(capturedAtDest);
    const isEquivalentTrade = PIECE_VALUES[moveType] >= 400 && PIECE_VALUES[capType] >= 400;

    if (isEquivalentTrade) {
      purposes.push("doiQuan");
      addPiece(ref(before, move.to));
    } else if ("ab".includes(capType)) {
      // Phá phòng tuyến Sĩ/Tượng của đối phương
      purposes.push("doiQuan");
      addPiece(ref(before, move.to));
    }
  }

  // ==========================================================
  // KIỂM TRA 8: CẢI THIỆN VỊ TRÍ QUÂN (caiThienQuan)
  // Tăng tính cơ động, chiếm lộ thông, hà khẩu, hoặc áp sát cung
  // ==========================================================
  if (isSound) {
    const fBefore = getFBefore();
    const fAfter = getFAfter();

    const tagsBefore = fBefore[mover].pieces.find((p) => p.ref.square === move.from)?.tags ?? [];
    const tagsAfter = fAfter[mover].pieces.find((p) => p.ref.square === move.to)?.tags ?? [];

    const gainedActiveTag =
      (!tagsBefore.includes("maHaKhau") && tagsAfter.includes("maHaKhau")) ||
      (!tagsBefore.includes("maNgoaTao") && tagsAfter.includes("maNgoaTao")) ||
      (!tagsBefore.includes("xeLoThong") && tagsAfter.includes("xeLoThong")) ||
      (!tagsBefore.includes("xeCamDay") && tagsAfter.includes("xeCamDay")) ||
      (!tagsBefore.includes("totQuaHa") && tagsAfter.includes("totQuaHa")) ||
      (!tagsBefore.includes("totVaoCung") && tagsAfter.includes("totVaoCung")) ||
      (!tagsBefore.includes("phaoDau") && tagsAfter.includes("phaoDau")) ||
      (!tagsBefore.includes("phaoCamDay") && tagsAfter.includes("phaoCamDay"));

    const resolvedPassiveTag =
      tagsBefore.includes("maBiCanChan") && !tagsAfter.includes("maBiCanChan");

    if (gainedActiveTag || resolvedPassiveTag) {
      purposes.push("caiThienQuan");
    }
  }

  // ==========================================================
  // KIỂM TRA 9: GIỮ TIÊN / TRANH TIÊN (giuTien)
  // Chiếu tướng ép buộc hoặc đe dọa tạo đòn liên tục
  // ==========================================================
  if (oppInCheckAfter && isSound && !purposes.includes("datSat")) {
    purposes.push("giuTien");
  }

  // ==========================================================
  // KIỂM TRA 10: KỸ THUẬT TÀN CUỘC (kyThuatTanCuoc)
  // Vận dụng định thức hoặc nguyên lý tàn cuộc lý thuyết
  // ==========================================================
  const eg = detectTheoreticalEndgame(after);
  const totalMajorAfter = after.filter((p) => p && "rncp".includes(typeOf(p))).length;
  if ((eg !== null || totalMajorAfter <= 5) && isSound) {
    if (moveType === "k" || moveType === "p") {
      purposes.push("kyThuatTanCuoc");
    }
  }

  // Nếu không nhận diện được mục đích cụ thể nào, gán caiThienQuan làm mặc định cho nước tốt
  if (purposes.length === 0) {
    if (isSound) {
      purposes.push("caiThienQuan");
    } else {
      return null;
    }
  }

  // Sắp xếp thứ tự ưu tiên của purposes
  const PRIORITY_ORDER: Purpose[] = [
    "thiQuan",
    "datSat",
    "lapHinh",
    "anQuan",
    "hoaGiai",
    "boQuan",
    "doiQuan",
    "caiThienQuan",
    "giuTien",
    "kyThuatTanCuoc",
  ];
  purposes.sort((a, b) => PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b));

  // ==========================================================
  // SINH CÂU TÓM TẮT Ý ĐỒ (summary)
  // ==========================================================
  const pieceName = PIECE_NAME[moveType] ?? "Quân";
  const primary = purposes[0];
  let summary = "";

  if (purposes.includes("thiQuan")) {
    if (purposes.includes("datSat")) {
      summary = `Thí ${pieceName} mở đường sát cục quyết định`;
    } else if (purposes.includes("anQuan")) {
      summary = `Thí ${pieceName} đoạt quân lớn, giành ưu thế vật chất`;
    } else {
      summary = `Thí ${pieceName} giành quyền chủ động tấn công`;
    }
  } else if (primary === "datSat") {
    summary = isCheckmateNow
      ? `Đi ${moveNotat} chiếu bí kết thúc ván cờ`
      : `Đe dọa đòn sát cục kết liễu đối phương`;
  } else if (primary === "lapHinh") {
    summary = formedPatternName
      ? `Lập thế sát cục ${formedPatternName}`
      : `Lập hình sát cục uy hiếp cung tướng`;
  } else if (primary === "anQuan") {
    const victim = capturedAtDest ? PIECE_NAME[typeOf(capturedAtDest)] : "quân";
    summary = `Ăn ${victim} của đối phương, gia tăng ưu thế vật chất`;
  } else if (primary === "hoaGiai") {
    summary = parriedThreatStr
      ? `Kịp thời hóa giải đòn đe dọa ${parriedThreatStr} của đối phương`
      : wasInCheckBefore
        ? `Giải chiếu tướng an toàn`
        : `Hóa giải đòn đe dọa, đưa quân vào vị trí an toàn`;
  } else if (primary === "boQuan") {
    summary = `Kìm kẹp, bó chặt quân đối phương`;
  } else if (primary === "doiQuan") {
    const exchange = detectExchange(before, move, after, { evalBefore: options?.evalBefore, loss });
    summary = exchange ? exchange.summary : `Đổi quân có chủ đích nhằm đơn giản hóa thế trận`;
  } else if (primary === "caiThienQuan") {
    summary = `Cải thiện vị trí ${pieceName}, gia tăng tầm khống chế`;
  } else if (primary === "giuTien") {
    summary = `Chiếu tướng giữ quyền chủ động (tranh tiên)`;
  } else if (primary === "kyThuatTanCuoc") {
    summary = `Vận dụng kỹ thuật chuẩn xác trong tàn cuộc`;
  } else {
    summary = `Nước cờ củng cố thế trận vững chắc`;
  }

  // Chuỗi nước đi biểu diễn
  const lineNotation: string[] = narration.moves.map((m) => m.notation);
  if (lineNotation.length === 0) {
    lineNotation.push(moveNotat);
  }

  return {
    kind: "intent",
    move: moveNotat,
    side: mover,
    purposes,
    line: lineNotation,
    summary,
    pieces: involvedPieces,
  };
}
