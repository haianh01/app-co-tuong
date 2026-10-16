// Nguyên lý trung cuộc mở rộng cho góc nhìn "Hứa Ngân Xuyên" ("Thái Cực Bổng" - Xu Yinchuan).
// Lối đánh trầm tĩnh, sâu sắc, kín kẽ không tì vết, tôn vinh nghệ thuật "dĩ nhu khắc cương",
// tích lũy từng ưu thế nhỏ và chuyển hóa tinh tế về tàn cuộc thắng.
// Gồm 16 nguyên lý Thái Cực (thuần hàm, tất định, không gọi engine bên trong):
//  1. Nhu hòa kiềm tỏa (Positional Clamp / Ghim kẹp trói quân)
//  2. Cố nhược kim thang (Solid Defense / Phòng thủ kiên cố)
//  3. Tích tiểu thành đại (Incremental Gain / Tích lũy ưu thế vi mô)
//  4. Ép đổi quy tàn (Transition Exchange / Ép đổi giản hóa)
//  5. Nôn nóng khinh suất (Premature Attack / Manh động khi hậu phương chưa vững) [critique]
//  6. Lỏng lẻo trận hình (Structural Weakness / Hở sườn rạn nứt cấu trúc) [critique]
//  7. Tằm ăn dâu (Gradual Constriction / Bóp nghẹt không gian)
//  8. Dĩ tĩnh chế động (Wait and See / Nước chờ thâm sâu giữ cấu trúc hoàn mỹ)
//  9. Vận quân tinh tế (Positional Repositioning / Điều chuyển quân kém vị trí)
// 10. Khoét sâu điểm yếu (Targeting Chronic Weakness / Công kích mắt xích yếu)
// 11. Hóa giải sát khí (Defusing Assault / Triệt tiêu mũi nhọn tấn công)
// 12. Chiếm lĩnh yếu đạo (Dominating Strategic Lines / Kiểm soát lộ huyết mạch)
// 13. Bảo toàn binh lực (Preserving Material / Tránh hỗn chiến rủi ro)
// 14. Phản tiên đoạt thế (Counter-Initiative from Solid Base / Phản tiên từ thế thủ)
// 15. Khống chế trung lộ (Central Control / Gia cố trục xương sống lộ 5)
// 16. Khóa đường tháo lui (Cutting off Retreat / Khóa đường rút quân địch dâng sâu)

import {
  type Board, type Move, type Piece, type Side,
  attackersOf, colOf, crossedRiver, findKing, inCheck, inPalace, isDefended, legalMoves,
  opponent, PIECE_VALUES, pseudoMoves, rowOf, ROWS, sideOf, sq, typeOf,
} from "./engine";
import { exchangeGain, hangingPieces } from "./explain";
import {
  attackedSet, detectIncrementalGain, detectPositionalClamp, detectSolidDefense,
  detectTransitionExchange, materialBalance, soundMove, underAttack,
  type XuMiddlegameFact, type XuTactics, type XuTacticsOptions,
} from "./middlegame";
import { moveNotation, PIECE_NAME } from "./notation";
import { attackPressure } from "./strategy";

type Detector = (before: Board, move: Move, after: Board, options?: XuTacticsOptions) => XuMiddlegameFact | null;

const nameOf = (p: Piece) => PIECE_NAME[typeOf(p)] ?? "quân";
const isMajor = (p: Piece | null | undefined) => !!p && "rnc".includes(typeOf(p));

function fact(
  before: Board,
  move: Move,
  tactic: XuTactics,
  summary: string,
  details: string,
  tone?: "critique",
): XuMiddlegameFact {
  const f: XuMiddlegameFact = {
    kind: "xuMiddlegame",
    side: sideOf(before[move.from]!),
    tactic,
    move: moveNotation(before, move),
    summary,
    details,
  };
  if (tone) f.tone = tone;
  return f;
}

// ============================================================================
// 5. NÔN NÓNG KHINH SUẤT [CRITIQUE]
// ============================================================================

/**
 * Vi phạm nguyên lý Thái Cực: vội vàng xông quân lớn sang tấn công đơn độc khi hậu phương
 * chưa vững chắc, trận hình chưa liên kết hoặc đang bị uy hiếp nặng.
 */
export function detectPrematureAttack(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !isMajor(piece)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (options?.loss === undefined || options.loss < 100) return null;

  // Chỉ xét trong trung cuộc khi còn nhiều quân lớn
  const majorsCount = after.filter((p) => isMajor(p)).length;
  if (majorsCount < 4) return null;

  // Quân đi sang phần sân đối phương hoặc tấn công cung đối phương
  const crossed = crossedRiver(rowOf(move.to), mover);
  const attackedPalace = inPalace(rowOf(move.to), colOf(move.to), opp);
  if (!crossed && !attackedPalace) return null;

  const backUnderPressure = attackPressure(before, mover) > 0 || underAttack(before, findKing(before, mover), opp);
  const hangingBack = hangingPieces(before, mover).some((sqIdx) => !crossedRiver(rowOf(sqIdx), mover));

  if (!backUnderPressure && !hangingBack) return null;

  const pName = nameOf(piece);
  return fact(
    before, move, "nonNongKhinSuat",
    `Nôn nóng khinh suất: xông ${pName} sang tấn công khi hậu phương chưa được gia cố vững chắc, dẫn đến hở sườn. "Dục tốc bất đạt" — Thái Cực Bổng tối kỵ nóng vội khi thế trận chưa chu toàn.`,
    `Vội xông ${pName}`,
    "critique",
  );
}

// ============================================================================
// 6. LỎNG LẺO TRẬN HÌNH [CRITIQUE]
// ============================================================================

/**
 * Nước đi làm rạn nứt cấu trúc phòng thủ (tách rời Sĩ/Tượng hoặc dâng quân lớn vào ô bị ăn không),
 * vi phạm nguyên tắc "kín kẽ không tì vết".
 */
export function detectStructuralWeakness(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (options?.loss === undefined || options.loss < 120) return null;

  // Chỉ xét trong trung cuộc khi còn quân lớn
  const majorsCount = after.filter((p) => isMajor(p)).length;
  if (majorsCount < 4) return null;
  if (inCheck(before, mover)) return null;

  const mType = typeOf(piece);
  const brokeGuard = (mType === "a" || mType === "b") && !isDefended(after, move.to, mover);
  const hungMajor = isMajor(piece) && (exchangeGain(after, move.to, opp) ?? 0) >= 300;

  if (!brokeGuard && !hungMajor) return null;

  const pName = nameOf(piece);
  return fact(
    before, move, "longLeoTranHinh",
    `Lỏng lẻo trận hình: nước đi ${pName} làm rạn nứt hệ thống liên kết phòng ngự, tạo kẽ hở cho đối phương khai thác. Hứa Ngân Xuyên đề cao tính liên kết chặt chẽ và không tì vết của toàn trận hình.`,
    "Lỏng trận hình",
    "critique",
  );
}

// ============================================================================
// 7. TẰM ĂN DÂU (Gradual Constriction)
// ============================================================================

/**
 * Từng bước siết chặt không gian hoạt động của đối phương, bóp nghẹt các ô chạy nhảy.
 */
export function detectGradualConstriction(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover) || inCheck(after, opp)) return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

  const beforeLegal = legalMoves({ board: before, turn: opp }).length;
  const afterLegal = legalMoves({ board: after, turn: opp }).length;
  if (afterLegal > beforeLegal - 3) return null;

  const pName = nameOf(piece);
  return fact(
    before, move, "tamAnDau",
    `Tằm ăn dâu: ${pName} từng bước siết chặt không gian hoạt động của đối phương, bóp nghẹt các ngả đường cơ động mà không cần vội vã.`,
    "Siết chặt không gian",
  );
}

// ============================================================================
// 8. DĨ TĨNH CHẾ ĐỘNG (Wait and See)
// ============================================================================

/**
 * Nước đi trầm tĩnh bảo toàn cấu trúc hoàn mỹ, đẩy đối phương vào thế khó xử (zugzwang).
 */
export function detectWaitingMove(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to] || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover) || inCheck(after, opp)) return null;

  const mType = typeOf(piece);
  const isQuiet = (mType === "k" || mType === "a" || mType === "b") ||
    (mType === "r" && !crossedRiver(rowOf(move.to), mover) && Math.abs(rowOf(move.to) - rowOf(move.from)) + Math.abs(colOf(move.to) - colOf(move.from)) === 1);
  if (!isQuiet) return null;

  if (hangingPieces(after, mover).length > 0) return null;
  if (attackPressure(after, mover) > 0) return null;

  const pName = nameOf(piece);
  return fact(
    before, move, "diTinhCheDong",
    `Dĩ tĩnh chế động: nước ${pName} nhàn nhã giữ thế tuyệt luân, duy trì cấu trúc phòng thủ hoàn hảo và đẩy đối phương vào thế khó xử.`,
    "Dĩ tĩnh chế động",
  );
}

// ============================================================================
// 9. VẬN QUÂN TINH TẾ (Positional Repositioning)
// ============================================================================

/**
 * Điều chuyển một quân đang ở vị trí xấu sang cứ điểm đắc địa hơn.
 */
export function detectPieceRepositioning(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to] || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!isMajor(piece)) return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

  const fromCol = colOf(move.from);
  const toCol = colOf(move.to);
  const wasEdge = fromCol === 0 || fromCol === 8 || rowOf(move.from) === 0 || rowOf(move.from) === 9;
  const isCentral = toCol >= 2 && toCol <= 6;
  const mobBefore = pseudoMoves(before, move.from).length;
  const mobAfter = pseudoMoves(after, move.to).length;

  if (wasEdge && isCentral && mobAfter >= mobBefore + 2) {
    const pName = nameOf(piece);
    return fact(
      before, move, "dieuChinhQuanKem",
      `Vận quân tinh tế: điều chuyển ${pName} từ biên vào trung lộ đắc địa, gia tăng đáng kể tầm hoạt động và sự phối hợp.`,
      `Vận ${pName} vào trung`,
    );
  }
  return null;
}

// ============================================================================
// 10. KHOÉT SÂU ĐIỂM YẾU (Targeting Chronic Weakness)
// ============================================================================

/**
 * Tập trung áp lực vào quân yếu, Tốt cô lập hoặc điểm hở sườn của đối phương.
 */
export function detectTargetingWeakness(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover)) return null;

  const hitsBefore = attackedSet(before, mover);
  const hitsAfter = attackedSet(after, mover);

  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (!p || sideOf(p) !== opp || typeOf(p) === "k") continue;
    if (hitsAfter.has(i) && !hitsBefore.has(i)) {
      // Bỏ qua Tốt chưa qua sông ở vị trí ban đầu (không phải điểm yếu chiến thuật trung cuộc)
      if (typeOf(p) === "p" && !crossedRiver(rowOf(i), opp) && rowOf(i) === (opp === "r" ? 6 : 3) && colOf(i) % 2 === 0) {
        continue;
      }
      const defenders = attackersOf(after, i, opp).length;
      const attackers = attackersOf(after, i, mover).length;
      if (defenders === 0 || attackers > defenders) {
        const targetName = nameOf(p);
        return fact(
          before, move, "khoetSauDiemYeu",
          `Khoét sâu điểm yếu: kiên trì dồn áp lực vào ${targetName} của đối phương, khai thác triệt để mắt xích phòng thủ yếu nhất.`,
          `Nhắm ${targetName} yếu`,
        );
      }
    }
  }
  return null;
}

// ============================================================================
// 11. HÓA GIẢI SÁT KHÍ (Defusing the Assault)
// ============================================================================

/**
 * Khi đối phương đang dồn lực tấn công, chủ động triệt tiêu mũi nhọn hoặc hóa giải đòn dọa.
 */
export function detectDefuseAttack(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const pressureBefore = attackPressure(before, mover);
  const enemyCaptured = before[move.to] && sideOf(before[move.to]!) === opp && isMajor(before[move.to]) && crossedRiver(rowOf(move.to), opp);
  if (pressureBefore < 1 && !enemyCaptured) return null;

  const pressureAfter = attackPressure(after, mover);
  if (pressureAfter < pressureBefore || enemyCaptured) {
    const pName = nameOf(piece);
    return fact(
      before, move, "hoaGiaiSatKhi",
      `Hóa giải sát khí: ${pName} chủ động tháo ngòi đòn tấn công nguy hiểm của đối phương, đưa thế cờ trở lại trạng thái an toàn.`,
      "Tháo ngòi áp lực",
    );
  }
  return null;
}

// ============================================================================
// 12. CHIẾM LĨNH YẾU ĐẠO (Dominating Strategic Lines)
// ============================================================================

/**
 * Đưa Xe/Pháo chiếm các lộ then chốt (lộ sườn 4, 6, lộ 2, 8, hoặc tuyến tuần hà).
 */
export function detectStrategicLine(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const mType = typeOf(piece);
  if (mType !== "r" && mType !== "c") return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const isRib = toCol === 3 || toCol === 5;
  const isRiver = toRow === 4 || toRow === 5;
  const isOpen = pseudoMoves(after, move.to).length >= 4;

  if ((isRib || isRiver) && isOpen) {
    const pName = nameOf(piece);
    const lineDesc = isRib
      ? `lộ sườn ${mover === "r" ? (toCol === 3 ? "6" : "4") : (toCol === 3 ? "4" : "6")}`
      : "tuyến tuần hà";
    return fact(
      before, move, "chiemLinhYeuDao",
      `Chiếm lĩnh yếu đạo: ${pName} kiểm soát ${lineDesc} huyết mạch, làm chủ không gian và điều tiết nhịp độ trận đấu.`,
      `Chiếm ${lineDesc}`,
    );
  }
  return null;
}

// ============================================================================
// 13. BẢO TOÀN BINH LỰC (Preserving Material)
// ============================================================================

/**
 * Quân bị đe dọa nhưng tỉnh táo thoái về ô an toàn có căn, không sa vào bẫy hỗn chiến.
 */
export function detectPreserveMaterial(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !isMajor(piece) || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const wasAttacked = underAttack(before, move.from, opp);
  if (!wasAttacked) return null;

  const isSafeNow = !underAttack(after, move.to, opp);
  const isDefendedNow = isDefended(after, move.to, mover);
  if (!isSafeNow && !isDefendedNow) return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

  const pName = nameOf(piece);
  return fact(
    before, move, "baoToanBinhLuc",
    `Bảo toàn binh lực: tỉnh táo lui ${pName} về vị trí an toàn có căn, từ chối hỗn chiến rủi ro và bảo vệ trọn vẹn lực lượng.`,
    `Bảo toàn ${pName}`,
  );
}

// ============================================================================
// 14. PHẢN TIÊN ĐOẠT THẾ (Counter-Initiative from Solid Base)
// ============================================================================

/**
 * Từ phòng tuyến kiên cố, chớp lấy sơ hở nhỏ của đối phương để tung nước phản kích sắc bén.
 */
export function detectCounterFromDefense(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (inCheck(before, mover) || hangingPieces(before, mover).length > 0) return null;

  const isCheck = inCheck(after, opp);
  const hitAfter = attackedSet(after, mover);
  const hitBefore = attackedSet(before, mover);
  let threatenedMajor = false;

  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === opp && isMajor(p) && hitAfter.has(i) && !hitBefore.has(i)) {
      if ((exchangeGain(after, i, mover) ?? 0) >= 0) {
        threatenedMajor = true;
        break;
      }
    }
  }

  if (!isCheck && !threatenedMajor) return null;

  const pName = nameOf(piece);
  return fact(
    before, move, "phanTienDoatThe",
    `Phản tiên đoạt thế: từ bệ phóng phòng thủ vững chắc, ${pName} tung đòn phản kích chuẩn xác, giành lại quyền chủ động.`,
    "Phản tiên đoạt thế",
  );
}

// ============================================================================
// 15. KHỐNG CHẾ TRUNG LỘ (Central Control)
// ============================================================================

/**
 * Gia cố hoặc kiểm soát lộ 5 (trung lộ) bằng Pháo đầu, Mã trung tâm hoặc Xe lộ 5.
 */
export function detectCentralControl(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const toCol = colOf(move.to);
  if (toCol !== 4) return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

  const mType = typeOf(piece);
  if (mType !== "c" && mType !== "n" && mType !== "r") return null;

  // Không xem nước đi mở màn khai cuộc (vào Pháo đầu khi còn nguyên 32 quân) là đòn kỳ lý trung cuộc
  const pieceCount = after.filter(Boolean).length;
  if (pieceCount === 32 && mType === "c" && rowOf(move.from) === (mover === "r" ? 7 : 2)) return null;

  const pName = nameOf(piece);
  return fact(
    before, move, "khongCheTrungLo",
    `Khống chế trung lộ: ${pName} gia cố trục xương sống lộ trung tâm, tạo điểm tựa chiến lược vững chắc cho toàn bộ trận hình.`,
    "Trấn thủ trung lộ",
  );
}

// ============================================================================
// 16. KHÓA ĐƯỜNG THÁO LUI (Cutting off Retreat)
// ============================================================================

/**
 * Đón đầu hoặc chặn đứng đường lui của một quân địch đã dâng sâu sang phần sân mình.
 */
export function detectCutOffRetreat(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (!p || sideOf(p) !== opp || !isMajor(p)) continue;
    if (!crossedRiver(rowOf(i), opp)) continue;

    const beforeMobility = pseudoMoves(before, i).length;
    const afterMobility = pseudoMoves(after, i).length;
    if (afterMobility <= beforeMobility - 2) {
      const enemyName = nameOf(p);
      return fact(
        before, move, "khoaDuongThaoLui",
        `Khóa đường tháo lui: cắt đứt đường rút của ${enemyName} đối phương dâng sâu, dồn quân địch vào thế bị vây hãm.`,
        `Khóa đường rút ${enemyName}`,
      );
    }
  }
  return null;
}

// ============================================================================
// TỔNG HỢP 16 NGUYÊN LÝ THÁI CỰC HỨA NGÂN XUYÊN
// ============================================================================

const PRIORITY: Detector[] = [
  detectPrematureAttack,      // 5. Nôn nóng khinh suất [critique]
  detectStructuralWeakness,    // 6. Lỏng lẻo trận hình [critique]
  detectTransitionExchange,    // 4. Ép đổi quy tàn
  detectPositionalClamp,       // 1. Nhu hòa kiềm tỏa
  detectSolidDefense,          // 2. Cố nhược kim thang
  detectIncrementalGain,       // 3. Tích tiểu thành đại
  detectDefuseAttack,          // 11. Hóa giải sát khí
  detectCutOffRetreat,         // 16. Khóa đường tháo lui
  detectTargetingWeakness,     // 10. Khoét sâu điểm yếu
  detectGradualConstriction,   // 7. Tằm ăn dâu
  detectStrategicLine,         // 12. Chiếm lĩnh yếu đạo
  detectCentralControl,        // 15. Khống chế trung lộ
  detectCounterFromDefense,    // 14. Phản tiên đoạt thế
  detectPieceRepositioning,    // 9. Vận quân tinh tế
  detectPreserveMaterial,      // 13. Bảo toàn binh lực
  detectWaitingMove,           // 8. Dĩ tĩnh chế động
];

/**
 * Mọi nguyên lý góc nhìn Hứa Ngân Xuyên khớp với nước đi, theo thứ tự ưu tiên.
 * Có lời cảnh tỉnh (nước vi phạm nguyên lý) thì chỉ trả về cảnh tỉnh.
 */
export function detectAllXuTactics(
  before: Board, move: Move, after: Board, options?: XuTacticsOptions,
): XuMiddlegameFact[] {
  const out: XuMiddlegameFact[] = [];
  for (const detect of PRIORITY) {
    const f = detect(before, move, after, options);
    if (f && !out.some((x) => x.tactic === f.tactic)) out.push(f);
  }
  const critiques = out.filter((f) => f.tone === "critique");
  return critiques.length > 0 ? critiques : out;
}
