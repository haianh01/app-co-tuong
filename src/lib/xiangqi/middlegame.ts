// Khái niệm trung cuộc cờ tướng (B5):
// 1. Tranh tiên (Initiative / Sáng kiến): đếm số nước ép buộc liên tiếp trong chuỗi PV (chiếu, ăn có lời, đe dọa >= 200).
// 2. Lộ mở (Open Files / Lộ thông): nhận diện cột mở hoàn toàn (không có Tốt) hoặc cột thông tới đáy đối phương (tag xeLoThong).
// 3. Đổi quân có chủ đích (Purposeful Exchange): phân loại 3 lý do chiến thuật/chiến lược:
//    - donGianHoa: đơn giản hóa khi đang hơn quân.
//    - truKhuQuanCong: trừ khử quân đang tấn công cung mình.
//    - phaPhongTuyen: đổi Sĩ, Tượng hoặc Mã giữ cung đối phương.
// Hoạt động thuần hàm, tất định (deterministic), không gọi engine bên trong.

import {
  type Board, type Move, type Side,
  inCheck, opponent, sideOf, typeOf, sq, rowOf, colOf, ROWS, inPalace, crossedRiver, findKing, isAttacked, isDefended, attackersOf,
  play, pseudoMoves, PIECE_VALUES,
} from "./engine";
import { attackPressure } from "./strategy";
import { exchangeGain, ref, type PieceRef } from "./explain";
import { extractFeatures } from "./features";
import { moveNotation, PIECE_NAME } from "./notation";

export interface InitiativeFact {
  kind: "initiative";
  side: Side;
  forcingPlies: number;
  checks: number;
  captures: number;
  summary: string;
}

export interface ForcingAnalysis {
  forcingPlies: number;
  checks: number;
  captures: number;
  activePieces: PieceRef[];
}

export interface OpenFileFact {
  kind: "openFile";
  side: Side;
  file: number;         // Chỉ số cột 0..8
  fileNotation: number; // Tên lộ theo cách gọi của bên đi (1..9)
  isOpen: boolean;      // true nếu hoàn toàn không có Tốt nào trên cột
  piece: PieceRef;
  summary: string;
}

export type ExchangeReason =
  | "donGianHoa"      // Đơn giản hóa khi đang hơn quân
  | "truKhuQuanCong"   // Trừ khử quân đang tấn công cung mình
  | "phaPhongTuyen";   // Phá phòng tuyến: đổi Sĩ, Tượng hoặc Mã đang giữ cung đối phương

export interface ExchangeFact {
  kind: "exchange";
  side: Side;
  move: string;
  reason: ExchangeReason;
  traded: PieceRef;
  summary: string;
}

export interface DetectExchangeOptions {
  evalBefore?: { score: number; best?: Move | null } | null;
  loss?: number;
}

const fileNumber = (col: number, s: Side) => (s === "r" ? 9 - col : col + 1);
/** Ô `target` có bị phe `by` tấn công không, xét mọi loại quân (isAttacked chỉ đúng cho ô của Tướng). */
export const underAttack = (board: Board, target: number, by: Side) => attackersOf(board, target, by).length > 0;

/** Tập ô mà quân phe `by` đi tới / ăn được (một lượt quét, dùng để lọc trước khi gọi exchangeGain tốn kém). */
export function attackedSet(board: Board, by: Side): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && sideOf(p) === by) for (const to of pseudoMoves(board, i)) out.add(to);
  }
  return out;
}

/**
 * Chênh lệch vật chất phe `side` thu được dọc chuỗi `pv` đi từ `board` (tối đa `maxPlies` nửa nước):
 * cộng quân `side` ăn được, trừ quân bị ăn. Dừng khi nước trong PV không khớp bàn cờ.
 */
export function pvMaterialSwing(board: Board, pv: Move[], side: Side, maxPlies = 10): number {
  let cur = board;
  let swing = 0;
  for (const m of pv.slice(0, maxPlies)) {
    const p = cur[m.from];
    if (!p) break;
    const victim = cur[m.to];
    if (victim) {
      const v = typeOf(victim) === "k" ? 0 : PIECE_VALUES[typeOf(victim)];
      swing += sideOf(p) === side ? v : -v;
    }
    cur = play(cur, m);
  }
  return swing;
}

// ============================================================================
// 1. TRANH TIÊN (Initiative): Đếm số nước ép buộc liên tiếp trong PV
// ============================================================================

/**
 * Phân tích chuỗi nước ép buộc liên tiếp của phe `side` trong chuỗi biến chính (`pv`).
 * Một nước đi được coi là ép buộc nếu:
 * - Chiếu tướng đối phương (`inCheck`), hoặc
 * - Ăn quân có lời (`exchangeGain > 0`) hoặc ăn quân lớn (`rnc`), hoặc
 * - Tạo đe dọa sát cục / đe dọa mất quân lớn.
 */
export function analyzeForcingPlies(
  board: Board,
  side: Side,
  pv?: Move[],
): ForcingAnalysis {
  if (!pv || pv.length === 0) {
    return { forcingPlies: 0, checks: 0, captures: 0, activePieces: [] };
  }

  let curBoard = board;
  let forcingPlies = 0;
  let checks = 0;
  let captures = 0;
  const activePieceSqs = new Set<number>();
  const activePieces: PieceRef[] = [];

  for (const m of pv) {
    if (!curBoard[m.from]) break;

    const movingSide = sideOf(curBoard[m.from]!);
    const opp = opponent(movingSide);
    const next = play(curBoard, m);

    if (movingSide === side) {
      const isCheck = inCheck(next, opp);
      const isCapture = !!curBoard[m.to];
      const isMaterialGain = (exchangeGain(curBoard, m.to, movingSide) ?? 0) > 0;
      const isMajorCapture = isCapture && "rnc".includes(typeOf(curBoard[m.to]!));

      const isForcing = isCheck || isMaterialGain || isMajorCapture;

      if (isForcing) {
        forcingPlies++;
        if (isCheck) checks++;
        if (isCapture) captures++;

        if (!activePieceSqs.has(m.to)) {
          activePieceSqs.add(m.to);
          activePieces.push(ref(next, m.to));
        }
      } else {
        // Chuỗi nước ép buộc bị ngắt quãng
        break;
      }
    }

    curBoard = next;
  }

  return { forcingPlies, checks, captures, activePieces };
}

/**
 * Nhận diện dữ kiện Tranh tiên (`InitiativeFact`) khi một bên tạo được chuỗi ép buộc từ 2 nước trở lên.
 */
export function detectInitiative(
  board: Board,
  side: Side,
  pv?: Move[],
): InitiativeFact | null {
  const analysis = analyzeForcingPlies(board, side, pv);
  if (analysis.forcingPlies < 2) return null;

  const sideLabel = side === "r" ? "Đỏ" : "Đen";
  let details = "";
  if (analysis.checks > 0 && analysis.captures > 0) {
    details = `với ${analysis.checks} đòn chiếu và ${analysis.captures} pha bắt quân`;
  } else if (analysis.checks > 0) {
    details = `với ${analysis.checks} đòn chiếu ép liên tục`;
  } else {
    details = `với ${analysis.captures} pha bắt quân áp đảo`;
  }

  const summary = `${sideLabel} nắm quyền chủ động, tạo chuỗi ${analysis.forcingPlies} nước ép liên tiếp ${details}.`;

  return {
    kind: "initiative",
    side,
    forcingPlies: analysis.forcingPlies,
    checks: analysis.checks,
    captures: analysis.captures,
    summary,
  };
}

// ============================================================================
// 2. LỘ MỞ (Open Files): Nhận diện cột mở hoàn toàn và chiếm lộ thông
// ============================================================================

/**
 * Kiểm tra xem cột `col` có phải là cột mở hoàn toàn (không có bất kỳ con Tốt nào của cả 2 bên) không.
 */
export function isOpenFile(board: Board, col: number): boolean {
  for (let r = 0; r < ROWS; r++) {
    const p = board[sq(r, col)];
    if (p && typeOf(p) === "p") return false;
  }
  return true;
}

/**
 * Kiểm tra xem cột `col` có phải là cột bán mở của phe `side` (phe `side` không có Tốt nào trên cột) không.
 */
export function isSemiOpenFile(board: Board, col: number, side: Side): boolean {
  for (let r = 0; r < ROWS; r++) {
    const p = board[sq(r, col)];
    if (p && sideOf(p) === side && typeOf(p) === "p") return false;
  }
  return true;
}

/**
 * Kiểm tra xem từ vị trí Xe tới đáy đối phương có thông thoáng không (tag `xeLoThong`).
 */
export function isRookOpenPath(board: Board, square: number, side: Side): boolean {
  const r = rowOf(square);
  const c = colOf(square);
  const step = side === "r" ? -1 : 1;
  const limit = side === "r" ? 0 : ROWS - 1;

  let curR = r + step;
  while (side === "r" ? curR >= limit : curR <= limit) {
    if (board[sq(curR, c)]) return false;
    curR += step;
  }
  return true;
}

/**
 * Nhận diện nước cờ chiếm lộ mở hoặc chiếm lộ thông (`OpenFileFact`).
 */
export function detectOpenFile(
  before: Board,
  move: Move,
  after: Board,
): OpenFileFact | null {
  const piece = before[move.from];
  if (!piece) return null;

  const mover = sideOf(piece);
  const pType = typeOf(piece);
  if (pType !== "r" && pType !== "c") return null;

  const fromCol = colOf(move.from);
  const toCol = colOf(move.to);
  if (fromCol === toCol) return null; // Nước đi dọc trên cùng một cột không tính là chuyển chiếm cột mới

  const isFullOpen = isOpenFile(after, toCol);
  const isSemiOpen = isSemiOpenFile(after, toCol, mover);
  const isOpenPath = pType === "r" && isRookOpenPath(after, move.to, mover);

  if (!isFullOpen && !isSemiOpen && !isOpenPath) return null;

  const pName = PIECE_NAME[pType] ?? "Quân";
  const fileNotat = fileNumber(toCol, mover);
  let summary = "";

  if (isFullOpen) {
    summary = `${pName} chiếm lộ mở cột ${fileNotat}, kiểm soát toàn bộ tuyến dọc trận địa.`;
  } else if (isOpenPath) {
    summary = `${pName} chiếm lộ thông cột ${fileNotat}, thông suốt áp sát hàng đáy đối phương.`;
  } else {
    summary = `${pName} chuyển vào cột bán mở ${fileNotat}, tăng cường uy lực tấn công.`;
  }

  return {
    kind: "openFile",
    side: mover,
    file: toCol,
    fileNotation: fileNotat,
    isOpen: isFullOpen,
    piece: ref(after, move.to),
    summary,
  };
}

// ============================================================================
// 3. ĐỔI QUÂN CÓ CHỦ ĐÍCH (Purposeful Exchange): 3 lý do trung cuộc
// ============================================================================

/**
 * Tính chênh lệch vật chất trên bàn cờ theo góc nhìn của phe `side`.
 */
function getMaterialBalance(board: Board, side: Side): number {
  let myScore = 0;
  let oppScore = 0;
  const opp = opponent(side);

  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (!p) continue;
    const s = sideOf(p);
    const t = typeOf(p);
    const val = PIECE_VALUES[t] ?? 0;
    if (s === side) myScore += val;
    else if (s === opp) oppScore += val;
  }
  return myScore - oppScore;
}

/**
 * Nhận diện nước đổi quân có chủ đích (`ExchangeFact`) và phân loại theo 3 lý do:
 * - `donGianHoa`: bên đi đang hơn quân đáng kể (>200 điểm), đổi quân để đưa về tàn cuộc thắng chắc.
 * - `truKhuQuanCong`: quân đối phương đang xâm nhập nửa bàn cờ của mình hoặc đe dọa trực tiếp cung tướng.
 * - `phaPhongTuyen`: đổi lấy Sĩ, Tượng hoặc Mã giữ cung đối phương để phá vỡ hệ thống bảo vệ Tướng.
 */
export function detectExchange(
  before: Board,
  move: Move,
  after: Board,
  options?: DetectExchangeOptions,
): ExchangeFact | null {
  const movingPiece = before[move.from];
  const capturedPiece = before[move.to];
  if (!movingPiece || !capturedPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  if (sideOf(capturedPiece) !== opp) return null;

  const loss = options?.loss ?? 0;
  if (loss > 60) return null; // Không xét nước blunder

  const moveType = typeOf(movingPiece);
  const capType = typeOf(capturedPiece);

  // Điều kiện để được coi là đổi quân trung cuộc:
  // 1. Hai quân tương đương (Xe đổi Xe, Mã đổi Mã, Pháo đổi Pháo, Mã đổi Pháo)
  // 2. Quân lớn đổi lấy quân thủ phòng tuyến (Xe/Mã/Pháo đổi Sĩ/Tượng đối phương)
  const isEquivalent =
    (moveType === capType && "rnc".includes(moveType)) ||
    (PIECE_VALUES[moveType] >= 400 && PIECE_VALUES[capType] >= 400);

  const isPalaceDefense = "ab".includes(capType);

  if (!isEquivalent && !isPalaceDefense) return null;

  const moveNotat = moveNotation(before, move);
  const victimName = PIECE_NAME[capType] ?? "quân";
  const moverPieceName = PIECE_NAME[moveType] ?? "quân";

  // --- LÝ DO 1: PHÁ PHÒNG TUYẾN (phaPhongTuyen) ---
  const isDefender =
    isPalaceDefense ||
    (inPalace(rowOf(move.to), colOf(move.to), opp) && "nc".includes(capType));

  if (isDefender) {
    const summary = `Đổi ${moverPieceName} lấy ${victimName} đối phương nhằm phá vỡ phòng tuyến bảo vệ Tướng.`;
    return {
      kind: "exchange",
      side: mover,
      move: moveNotat,
      reason: "phaPhongTuyen",
      traded: ref(before, move.to),
      summary,
    };
  }

  // --- LÝ DO 2: ĐƠN GIẢN HÓA KHI HƠN QUÂN (donGianHoa) ---
  const materialAdvantage = getMaterialBalance(before, mover);
  const evalScore = options?.evalBefore?.score ?? 0;
  const isAhead = materialAdvantage >= 200 || evalScore >= 180;

  if (isAhead) {
    const summary = `Đổi quân có chủ đích nhằm đơn giản hóa thế trận khi đang chiếm ưu thế vật chất.`;
    return {
      kind: "exchange",
      side: mover,
      move: moveNotat,
      reason: "donGianHoa",
      traded: ref(before, move.to),
      summary,
    };
  }

  // --- LÝ DO 3: TRỪ KHỬ QUÂN CÔNG (truKhuQuanCong) ---
  // Quân đối phương nằm trên nửa bàn cờ của bên đi
  const isInvader = !crossedRiver(rowOf(move.to), mover);
  // Quân đối phương đe dọa cung tướng của bên đi
  const myKingSq = findKing(before, mover);
  const isThreateningMyKing = myKingSq >= 0 && isAttacked(before, myKingSq, opp);

  const fBefore = extractFeatures(before);
  const oppFeatures = fBefore[opp].pieces.find((p) => p.ref.square === move.to)?.tags ?? [];
  const hasAttackingTag = oppFeatures.some((tag) =>
    ["xeCamDay", "xeChiemSuon", "maNgoaTao", "phaoDau", "phaoCamDay"].includes(tag),
  );

  if (isInvader || isThreateningMyKing || hasAttackingTag) {
    const summary = `Đổi quân trừ khử ${victimName} đối phương đang uy hiếp nguy hiểm lên trận địa mình.`;
    return {
      kind: "exchange",
      side: mover,
      move: moveNotat,
      reason: "truKhuQuanCong",
      traded: ref(before, move.to),
      summary,
    };
  }

  // Mặc định cho trường hợp đổi quân cân bằng bình thường
  return {
    kind: "exchange",
    side: mover,
    move: moveNotat,
    reason: "donGianHoa",
    traded: ref(before, move.to),
    summary: `Đổi quân có chủ đích nhằm đơn giản hóa thế trận.`,
  };
}

// ============================================================================
// 4. KỲ LÝ TRUNG CUỘC TRIỆU HÂM HÂM ("Lục Mạch Thần Kiếm" - Zhao Xinxin)
// ============================================================================

export type ZhaoTactics =
  | "khiTuTranhTien"   // Khí tử tranh tiên (Thí quân đoạt thế)
  | "tramSiPhaTuong"   // Trảm Sĩ phá Tượng (Công phá tuyến phòng thủ cung tướng)
  | "tuBinhDotKich"    // Tụ binh đột kích (Tập trung hỏa lực áp đảo một cánh)
  | "diCongViThu"      // Dĩ công vi thủ (Phản kích thay vì phòng thủ thụ động)
  // Các nguyên lý bổ sung, nhận diện trong zhao-principles.ts
  | "ninhThatNhatTu"   // Ninh thất nhất tử, bất thất nhất tiên (giữ tiên hơn ăn quân)
  | "khongThamAn"      // Tham ăn mắc mồi: ăn quân rồi bị đối phương phản đòn
  | "tranhNuoc"        // Tranh nước đối công: bị dọa sát vẫn chiếu trước giành nước
  | "duoiQuanDuocTien" // Đuổi quân được tiên
  | "danDu"            // Dẫn dụ: thí quân kéo quân giữ của đối phương rời vị trí
  | "chanDuong"        // Chặn đường: chen quân cắt căn quân đối phương
  | "giaPhao"          // Giá Pháo: tạo ngòi cho Pháo chiếu / dọa ăn
  | "doiQuanGianhTien" // Đổi quân giành tiên / đổi quân trừ quân hoạt
  | "caiThienQuanKem"  // Cải thiện quân kém nhất trước khi công
  | "thanhDongKichTay" // Thanh đông kích tây: ép một cánh, đánh cánh kia
  | "phongNgua"        // Phòng ngừa: chặn trước đường quân đối phương vào điểm then chốt
  | "chuyenHoaTanCuoc"; // Biết dừng công, đổi quân về tàn cuộc hơn quân

export interface ZhaoMiddlegameFact {
  kind: "zhaoMiddlegame";
  side: Side;
  tactic: ZhaoTactics;
  move: string;
  summary: string;
  details?: string;
  /** "critique" = nguyên lý bị vi phạm (nước lỗi); mặc định là khen. */
  tone?: "praise" | "critique";
}

export interface ZhaoTacticsOptions {
  /** PV của engine cho thế SAU nước đi (bắt đầu bằng nước đáp của đối phương). */
  pv?: Move[];
  loss?: number;
  /** Điểm thế TRƯỚC nước đi theo bên đi, kèm nước tốt nhất và PV của nó. */
  evalBefore?: { score: number; best?: Move | null; pv?: Move[] } | null;
  /** Điểm thế SAU nước đi theo đối phương (dương = đối phương hơn). */
  evalAfter?: { score: number } | null;
  /** Các nước đã đi trước nước này theo thứ tự thời gian (nước cuối là nước vừa rồi của đối phương). */
  recentMoves?: Move[];
}

/** Nước đi trong thế `before` có được coi là chắc chắn (không hớ) không. Không có dữ liệu engine thì không khen. */
export function soundMove(options: ZhaoTacticsOptions | undefined, maxLoss = 60): boolean {
  if (options?.loss !== undefined) return options.loss <= maxLoss;
  if (options?.evalAfter) return options.evalAfter.score <= maxLoss;
  return false;
}

/**
 * 1. Trảm Sĩ phá Tượng (Palace Breaker):
 * Dùng quân lớn (Xe, Pháo, Mã) hoặc Tốt áp sát chém thẳng vào Sĩ hoặc Tượng đối phương
 * nhằm phá vỡ cấu trúc phòng thủ cung Tướng.
 */
export function detectPalaceBreaker(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const movingPiece = before[move.from];
  const capturedPiece = before[move.to];
  if (!movingPiece || !capturedPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  if (sideOf(capturedPiece) !== opp) return null;

  if (!soundMove(options)) return null; // Không xét nước đi hớ

  const capType = typeOf(capturedPiece);
  if (capType !== "a" && capType !== "b") return null;
  // Ăn Sĩ/Tượng chỉ là "phá thành" khi sau đó còn lực công thật sự: ít nhất 2 ô trong cung bị quân đã qua sông khống chế.
  // Xe đơn độc nhặt Sĩ lúc đối phương không bị tấn công chỉ là ăn quân thường.
  if (attackPressure(after, opp) < 2) return null;

  const moveType = typeOf(movingPiece);
  const moveVal = PIECE_VALUES[moveType] ?? 0;
  const capVal = PIECE_VALUES[capType] ?? 0;

  // Triệu Hâm Hâm: Dùng quân lớn (Xe/Pháo/Mã) đổi lấy Sĩ/Tượng đối phương (chấp nhận lỗ điểm vật chất >= 200)
  // hoặc Tốt qua sông áp thành phá tan Sĩ/Tượng.
  const isHeavySacrifice = moveVal >= 400 && capVal <= 250;
  const isPawnBreaker = moveType === "p" && crossedRiver(rowOf(move.to), mover);

  if (!isHeavySacrifice && !isPawnBreaker) return null;

  // Xét sau khi ăn: quân bắt đã rời move.from nên không còn làm ngòi Pháo hay chặn đường của đối phương.
  const defended = underAttack(after, move.to, opp);
  const victimName = PIECE_NAME[capType] ?? "quân thủ";
  const moverPieceName = PIECE_NAME[moveType] ?? "quân";
  const moveNotat = moveNotation(before, move);

  const summary = defended
    ? `Trảm ${victimName} phá thành theo phong cách Triệu Hâm Hâm: phế đổi ${moverPieceName} xé toang phòng tuyến cung Tướng, đưa Tướng đối phương vào thế hiểm nghèo.`
    : `Công phá phòng tuyến: diệt gọn ${victimName} yểm trợ cung cấm, làm suy yếu nghiêm trọng khả năng che chắn của đối phương.`;

  return {
    kind: "zhaoMiddlegame",
    side: mover,
    tactic: "tramSiPhaTuong",
    move: moveNotat,
    summary,
    details: `${moverPieceName} trảm ${victimName}`,
  };
}

/**
 * 2. Khí tử tranh tiên (Sacrifice for Initiative):
 * Táo bạo phế quân lớn (chấp nhận âm điểm vật chất >= 200) nhưng đoạt được thế chủ động
 * (chiếu tướng trực tiếp, chuỗi nước ép buộc liên tục, hoặc thế công áp đảo).
 */
export function detectSacrificeForInitiative(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const movingPiece = before[move.from];
  if (!movingPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  // Nước phế phải được engine xác nhận là chắc (loss/evalAfter); không có dữ liệu thì không khen phế quân.
  if (!soundMove(options)) return null;

  const moveType = typeOf(movingPiece);
  const moveVal = PIECE_VALUES[moveType] ?? 0;
  if (moveVal < 400) return null; // Chỉ xét quân lớn (Mã, Pháo, Xe)

  const capturedPiece = before[move.to];
  const capVal = capturedPiece ? (PIECE_VALUES[typeOf(capturedPiece)] ?? 0) : 0;
  const immediateMaterialLoss = moveVal - capVal;
  if (immediateMaterialLoss < 200) return null;

  // Đối phương ăn lại thật sự có lời (đã tính đổi quân), không chỉ là ô bị tấn công
  if ((exchangeGain(after, move.to, opp) ?? 0) < 200) return null;

  // Đổi lại phải đoạt thế chủ động: chiếu tướng hoặc chuỗi ép buộc trong PV.
  // PV có thể bắt đầu bằng chính nước vừa đi (tính từ thế trước) — bỏ nó đi để chạy tiếp từ `after`.
  const check = inCheck(after, opp);
  const pv = options?.pv;
  const pvAfter = pv && pv[0]?.from === move.from && pv[0]?.to === move.to ? pv.slice(1) : pv;
  const forcing = pvAfter ? analyzeForcingPlies(after, mover, pvAfter) : null;
  const hasInitiative = check || (forcing !== null && forcing.forcingPlies >= 2);

  if (!hasInitiative) return null;

  const moverPieceName = PIECE_NAME[moveType] ?? "quân";
  const moveNotat = moveNotation(before, move);
  // Cuối biến đã thu hồi vật chất (hoặc hơn) thì là thí quân có tính toán, không phải bỏ quân lấy thế.
  // (PV bắt đầu bằng nước ăn lại quân phế, nên chỉ cần cộng phần quân vừa ăn được ở nước này.)
  const recovered = pvAfter && pvAfter.length > 0 ? capVal + pvMaterialSwing(after, pvAfter, mover) >= 0 : false;
  const summary = recovered
    ? `Khí tử tranh tiên: thí ${moverPieceName} giành tiên, chuỗi ép liên tục sau đó thu hồi lại vật chất.`
    : `Khí tử tranh tiên đậm chất Lục Mạch Thần Kiếm: táo bạo phế ${moverPieceName} để đoạt tiên cơ áp đảo và phát động đợt công sát vũ bão.`;

  return {
    kind: "zhaoMiddlegame",
    side: mover,
    tactic: "khiTuTranhTien",
    move: moveNotat,
    summary,
    details: `Phế ${moverPieceName} đoạt tiên`,
  };
}

/**
 * 3. Dĩ công vi thủ (Counter-Threat as Defense):
 * Khi bản thân đang chịu áp lực nặng nề (bị chiếu hoặc bị đối phương đe dọa quân lớn không căn),
 * thay vì co cụm rút quân phòng thủ, lập tức tung đòn phản công quyết liệt ép đối thủ phải lùi về đối phó.
 */
export function detectCounterThreat(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const movingPiece = before[move.from];
  if (!movingPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  if (!soundMove(options)) return null;

  // Đang bị chiếu thì nước nào cũng là giải chiếu; "dĩ công vi thủ" ở đây là giải chiếu bằng một nước chiếu lại.
  const wasInCheck = inCheck(before, mover);
  const counterCheck = inCheck(after, opp);
  if (wasInCheck) {
    if (!counterCheck) return null;
    return {
      kind: "zhaoMiddlegame",
      side: mover,
      tactic: "diCongViThu",
      move: moveNotation(before, move),
      summary: "Dĩ công vi thủ: giải chiếu bằng chính một nước chiếu lại, giành lại quyền chủ động ngay lập tức.",
      details: "Phản chiếu giành tiên",
    };
  }

  // Lọc rẻ nhất trước: phải có quân lớn của mình đang bị nhắm (chưa cần biết có lời hay không).
  const oppHitsBefore = attackedSet(before, opp);
  const attackedMajors: number[] = [];
  for (let i = 0; i < before.length; i++) {
    const p = before[i];
    if (p && sideOf(p) === mover && "rnc".includes(typeOf(p)) && oppHitsBefore.has(i)) attackedMajors.push(i);
  }
  if (attackedMajors.length === 0) return null;

  // Nước này phải chiếu hoặc nhắm vào một quân lớn đối phương mà trước đó chưa bị nhắm.
  const myHitsBefore = attackedSet(before, mover);
  const myHitsAfter = attackedSet(after, mover);
  const newTargets: number[] = [];
  for (let i = 0; i < after.length; i++) {
    const p = after[i];
    if (p && sideOf(p) === opp && "rnc".includes(typeOf(p)) && myHitsAfter.has(i) && !(before[i] === p && myHitsBefore.has(i))) newTargets.push(i);
  }
  if (!counterCheck && newTargets.length === 0) return null;

  // Quân lớn đang bị dọa ăn có lời trước nước đi.
  const threatened = attackedMajors.filter((i) => (exchangeGain(before, i, opp) ?? 0) > 0);
  if (threatened.length === 0) return null;
  // Chạy chính quân bị dọa (dù có dọa lại) là phòng thủ thường, không phải bỏ mặc đòn dọa để phản công.
  if (threatened.includes(move.from)) return null;
  // Đòn dọa phải vẫn còn nguyên sau nước đi (không chặn, không thêm căn) — tức là thật sự lấy công thay thủ.
  const stillHanging = threatened.filter((i) => after[i] === before[i] && (exchangeGain(after, i, opp) ?? 0) > 0);
  if (stillHanging.length === 0) return null;
  // Quân vừa đi không được tự treo: phản công bằng một quân cho không thì chỉ là hớ thêm.
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

  // Đòn phản kích do chính nước này tạo ra: chiếu, hoặc dọa ăn có lời một quân lớn ít nhất ngang quân mình đang bị dọa.
  const atStake = Math.max(...stillHanging.map((i) => PIECE_VALUES[typeOf(before[i]!)]));
  let counterTarget = -1;
  for (const i of newTargets) {
    const p = after[i]!;
    const gain = exchangeGain(after, i, mover) ?? 0;
    if (gain > 0 && gain >= Math.min(atStake, PIECE_VALUES[typeOf(p)])) {
      counterTarget = i;
      break;
    }
  }
  if (!counterCheck && counterTarget < 0) return null;

  const hangingName = PIECE_NAME[typeOf(before[stillHanging[0]]!)];
  const summary = counterCheck
    ? `Dĩ công vi thủ: ${hangingName} đang bị dọa nhưng không chạy, chiếu thẳng vào Tướng buộc đối phương phải đối phó trước.`
    : `Dĩ công vi thủ: bỏ mặc ${hangingName} đang bị dọa, phản đòn dọa ăn ${PIECE_NAME[typeOf(after[counterTarget]!)]} — đối phương ăn quân thì cũng mất quân, phải co về đối phó.`;

  return {
    kind: "zhaoMiddlegame",
    side: mover,
    tactic: "diCongViThu",
    move: moveNotation(before, move),
    summary,
    details: counterCheck ? "Phản chiếu giành tiên" : "Phản công đoạt thế",
  };
}

/**
 * 4. Tụ binh đột kích sườn (Flank Overload):
 * Dồn từ 3 quân tấn công trở lên (Xe, Pháo, Mã, Tốt qua sông) sang cùng một cánh,
 * áp đảo hoàn toàn lực lượng phòng thủ cục bộ của đối phương.
 */
export function detectFlankOverload(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  const movingPiece = before[move.from];
  if (!movingPiece) return null;

  const mover = sideOf(movingPiece);
  if (!soundMove(options)) return null;

  const toCol = colOf(move.to);
  let flankCols: number[];
  let flankName: string;
  if (toCol <= 2) {
    flankCols = [0, 1, 2];
    flankName = mover === "r" ? "cánh phải (lộ 7-8-9)" : "cánh trái (lộ 1-2-3)";
  } else if (toCol >= 6) {
    flankCols = [6, 7, 8];
    flankName = mover === "r" ? "cánh trái (lộ 1-2-3)" : "cánh phải (lộ 7-8-9)";
  } else {
    flankCols = [3, 4, 5];
    flankName = "trung lộ (lộ 4-5-6)";
  }

  let myAttackers = 0;
  let enemyDefenders = 0;
  const attackerTypes: string[] = [];
  const attackerSqs: number[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (const c of flankCols) {
      const p = after[sq(r, c)];
      if (!p) continue;
      const t = typeOf(p);

      if (sideOf(p) === mover) {
        // Chỉ tính quân đã dâng lên (tới bờ sông mình trở đi); quân còn nằm nhà chưa tham gia tấn công
        const isAdvanced = crossedRiver(r, mover) || (mover === "r" ? r <= 5 : r >= 4);
        if (isAdvanced && "rncp".includes(t) && (t !== "p" || crossedRiver(r, mover))) {
          myAttackers++;
          attackerTypes.push(PIECE_NAME[t] ?? "quân");
          attackerSqs.push(sq(r, c));
        }
      } else if ("rnc".includes(t) || t === "a" || t === "b") {
        // Lực lượng phòng thủ cục bộ của đối phương trên cánh này (nửa sân của họ)
        if (!crossedRiver(r, sideOf(p))) enemyDefenders++;
      }
    }
  }

  if (myAttackers < 3 || myAttackers <= enemyDefenders) return null;

  // Đứng chung một cánh chưa đủ: các quân phải cùng nhắm một điểm bên sân đối phương (quân hay ô trong cung),
  // ít nhất 2 quân tấn công cùng khống chế một ô thì mới là "tụ binh".
  const opp = opponent(mover);
  const hits = new Map<number, number>();
  for (const a of attackerSqs) {
    for (const to of new Set(pseudoMoves(after, a))) {
      const target = after[to];
      const inEnemyCamp = !crossedRiver(rowOf(to), opp) && (flankCols.includes(colOf(to)) || inPalace(rowOf(to), colOf(to), opp));
      if (!inEnemyCamp) continue;
      if (!(inPalace(rowOf(to), colOf(to), opp) || (target && sideOf(target) === opp))) continue;
      hits.set(to, (hits.get(to) ?? 0) + 1);
    }
  }
  if (![...hits.values()].some((n) => n >= 2)) return null;

  const fromCol = colOf(move.from);
  const enteredFlank = !flankCols.includes(fromCol) || crossedRiver(rowOf(move.to), mover);
  if (!enteredFlank) return null;

  const moveNotat = moveNotation(before, move);
  const uniqueNames = Array.from(new Set(attackerTypes)).join(", ");
  const summary = `Tụ binh đột kích ${flankName}: tập trung hỏa lực áp đảo với sự phối hợp của các quân ${uniqueNames}, tạo thế lấy đông hiếp yếu khoét sâu điểm yếu đối phương.`;

  return {
    kind: "zhaoMiddlegame",
    side: mover,
    tactic: "tuBinhDotKich",
    move: moveNotat,
    summary,
    details: `Tụ binh ${flankName}`,
  };
}

/**
 * Bộ nhận diện tổng hợp các đòn kỳ lý trung cuộc Triệu Hâm Hâm.
 * Ưu tiên: Trảm Sĩ Phá Tượng > Khí Tử Tranh Tiên > Dĩ Công Vi Thủ > Tụ Binh Đột Kích.
 */
export function detectZhaoTactics(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoMiddlegameFact | null {
  return (
    detectPalaceBreaker(before, move, after, options) ??
    detectSacrificeForInitiative(before, move, after, options) ??
    detectCounterThreat(before, move, after, options) ??
    detectFlankOverload(before, move, after, options)
  );
}

// ============================================================================
// 5. KỲ LÝ TRUNG CUỘC HỨA NGÂN XUYÊN ("Thái Cực Bổng" - Xu Yinchuan)
// ============================================================================

export type XuTactics =
  | "nhuHoaKiemToa"    // 1. Nhu hòa kiềm tỏa (Dĩ nhu khắc cương, ghim kẹp bó quân)
  | "phongThuKienCo"   // 2. Phòng thủ kiên cố (Cố nhược kim thang, củng cố Sĩ Tượng)
  | "tichLuyUuThe"    // 3. Tích lũy ưu thế (Tích tiểu thành đại, Tốt qua sông đè Mã)
  | "epDoiGianHoa"     // 4. Ép đổi quy tàn (Chuyển hóa ưu thế về tàn cuộc tất thắng)
  | "nonNongKhinSuat"  // 5. Nôn nóng khinh suất (Manh động khi hậu phương chưa vững) [critique]
  | "longLeoTranHinh"  // 6. Lỏng lẻo trận hình (Hở sườn, rạn nứt cấu trúc phòng ngự) [critique]
  | "tamAnDau"         // 7. Tằm ăn dâu (Siết chặt không gian hoạt động của đối phương)
  | "diTinhCheDong"    // 8. Dĩ tĩnh chế động (Nước chờ thâm sâu giữ cấu trúc hoàn hảo)
  | "dieuChinhQuanKem" // 9. Vận quân tinh tế (Điều chuyển quân kém sang cứ điểm đắc địa)
  | "khoetSauDiemYeu"  // 10. Khoét sâu điểm yếu (Tập trung áp lực vào nhược điểm cố hữu của địch)
  | "hoaGiaiSatKhi"    // 11. Hóa giải sát khí (Tháo ngòi hỏa lực đợt tấn công của đối phương)
  | "chiemLinhYeuDao"  // 12. Chiếm lĩnh yếu đạo (Chốt giữ tuyến lộ huyết mạch)
  | "baoToanBinhLuc"   // 13. Bảo toàn binh lực (Tỉnh táo giữ quân, từ chối hỗn chiến rủi ro)
  | "phanTienDoatThe"  // 14. Phản tiên đoạt thế (Chớp thời cơ từ thế thủ chuyển sang phản công)
  | "khongCheTrungLo"  // 15. Khống chế trung lộ (Gia cố trục xương sống lộ 5)
  | "khoaDuongThaoLui"; // 16. Khóa đường tháo lui (Chặn đường rút của quân địch dâng sâu)

export interface XuMiddlegameFact {
  kind: "xuMiddlegame";
  side: Side;
  tactic: XuTactics;
  move: string;
  summary: string;
  details?: string;
  tone?: "critique";
}

export interface XuTacticsOptions {
  pv?: Move[];
  loss?: number;
  evalBefore?: { score: number; best?: Move | null; pv?: Move[] } | null;
  evalAfter?: { score: number; pv?: Move[] } | null;
  recentMoves?: Move[];
}

const isMajorPiece = (p: string | null | undefined) => !!p && "rnc".includes(typeOf(p));

/** Chênh lệch vật chất (không tính Tướng) theo góc nhìn `side`. */
export function materialBalance(board: Board, side: Side): number {
  let bal = 0;
  for (const p of board) {
    if (p) {
      const v = typeOf(p) === "k" ? 0 : PIECE_VALUES[typeOf(p)];
      bal += sideOf(p) === side ? v : -v;
    }
  }
  return bal;
}

/**
 * Kiểm tra xem quân địch tại `firstEnemySq` có bị quân tại `attackerSq` ghim vào mục tiêu phía sau không.
 */
function findPinnedTarget(board: Board, attackerSq: number, side: Side): { pinnedSq: number; targetBehindSq: number } | null {
  const attacker = board[attackerSq];
  if (!attacker) return null;
  const opp = opponent(side);
  const aType = typeOf(attacker);

  if (aType === "r") {
    const r0 = rowOf(attackerSq);
    const c0 = colOf(attackerSq);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dr, dc] of dirs) {
      let r = r0 + dr;
      let c = c0 + dc;
      let firstEnemySq: number | null = null;

      while (r >= 0 && r < ROWS && c >= 0 && c < 9) {
        const curSq = sq(r, c);
        const p = board[curSq];
        if (p) {
          if (firstEnemySq === null) {
            if (sideOf(p) === opp) {
              firstEnemySq = curSq;
            } else {
              break;
            }
          } else {
            if (sideOf(p) === opp) {
              const targetType = typeOf(p);
              const pinnedP = board[firstEnemySq]!;
              const pinnedType = typeOf(pinnedP);
              // Quân bị ghim phải là quân lớn (Xe, Pháo, Mã) hoặc Sĩ/Tượng giữ cung
              if ("rcnab".includes(pinnedType)) {
                if (targetType === "k" || targetType === "r" || (isMajorPiece(pinnedP) && isMajorPiece(p))) {
                  return { pinnedSq: firstEnemySq, targetBehindSq: curSq };
                }
              }
            }
            break;
          }
        }
        r += dr;
        c += dc;
      }
    }
  }

  if (aType === "c") {
    const r0 = rowOf(attackerSq);
    const c0 = colOf(attackerSq);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dr, dc] of dirs) {
      let r = r0 + dr;
      let c = c0 + dc;
      let piece1Sq: number | null = null;
      let piece2Sq: number | null = null;

      while (r >= 0 && r < ROWS && c >= 0 && c < 9) {
        const curSq = sq(r, c);
        const p = board[curSq];
        if (p) {
          if (piece1Sq === null) {
            piece1Sq = curSq;
          } else if (piece2Sq === null) {
            piece2Sq = curSq;
          } else {
            // curSq là quân thứ 3 (Tướng đối phương)
            // piece1Sq là ngòi (screen), piece2Sq là quân bị ghim
            const p2 = board[piece2Sq]!;
            if (sideOf(p2) === opp && sideOf(p) === opp && typeOf(p) === "k") {
              const p2Type = typeOf(p2);
              if ("rcnab".includes(p2Type)) {
                return { pinnedSq: piece2Sq, targetBehindSq: curSq };
              }
            }
            break;
          }
        }
        r += dr;
        c += dc;
      }
    }
  }

  return null;
}

/**
 * Kiểm tra xem nước đi có đè ép, kiềm tỏa trực tiếp quân lớn đối phương trên cùng tuyến không.
 */
function findClampedPiece(
  before: Board,
  move: Move,
  after: Board,
  mover: Side,
): number | null {
  const opp = opponent(mover);
  const mPiece = after[move.to];
  if (!mPiece) return null;
  const mType = typeOf(mPiece);

  if (mType === "r" || mType === "c") {
    const toRow = rowOf(move.to);
    const toCol = colOf(move.to);

    for (let i = 0; i < after.length; i++) {
      const p = after[i];
      if (!p || sideOf(p) !== opp || !isMajorPiece(p)) continue;

      const r = rowOf(i);
      const c = colOf(i);
      const sameLine = r === toRow || c === toCol;
      if (!sameLine) continue;

      const attackedNow = underAttack(after, i, mover);
      const wasAttacked = underAttack(before, i, mover);
      const beforeMobility = pseudoMoves(before, i).length;
      const afterMobility = pseudoMoves(after, i).length;

      if ((attackedNow && !wasAttacked) || (afterMobility < beforeMobility && attackedNow)) {
        return i;
      }
    }
  }

  if (mType === "n") {
    for (let i = 0; i < after.length; i++) {
      const p = after[i];
      if (!p || sideOf(p) !== opp || typeOf(p) !== "n") continue;
      const beforeMobility = pseudoMoves(before, i).length;
      const afterMobility = pseudoMoves(after, i).length;
      if (afterMobility < beforeMobility && underAttack(after, i, mover)) {
        return i;
      }
    }
  }

  return null;
}

/**
 * 1. Nhu hòa kiềm tỏa (Positional Clamp / Ghim kẹp trói quân):
 * Dùng quân (Xe, Pháo, Mã) ghim kẹp trực tiếp hoặc khống chế làm tê liệt một quân lớn đối phương:
 * - Ghim quân (Pin): Xe/Pháo ghim quân đối phương đối diện Tướng hoặc quân lớn.
 * - Khống chế lộ / tuyến (Clamp): Xe/Pháo đè ép trực tiếp quân lớn đối phương, bóp nghẹt đường cơ động.
 */
export function detectPositionalClamp(
  before: Board,
  move: Move,
  after: Board,
  options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const movingPiece = before[move.from];
  if (!movingPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  const loss = options?.loss ?? 0;
  if (loss > 60) return null;

  const mType = typeOf(movingPiece);
  if (!"rcn".includes(mType)) return null;

  // Quân đi tới không được tự treo hớ
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

  // 1. Kiểm tra thế Ghim (Pin)
  const pin = findPinnedTarget(after, move.to, mover);
  if (pin) {
    const pinnedPiece = after[pin.pinnedSq]!;
    const targetBehind = after[pin.targetBehindSq]!;
    const pinnedName = PIECE_NAME[typeOf(pinnedPiece)] ?? "quân";
    const behindName = PIECE_NAME[typeOf(targetBehind)] ?? "mục tiêu";
    const pName = PIECE_NAME[mType] ?? "quân";
    const moveNotat = moveNotation(before, move);
    const isAbsolute = typeOf(targetBehind) === "k";

    const summary = isAbsolute
      ? `Nhu hòa kiềm tỏa đậm chất Thái Cực: ${pName} ghim chặt ${pinnedName} đối phương vào Tướng, làm tê liệt hoàn toàn khả năng di chuyển.`
      : `Nhu hòa kiềm tỏa: ${pName} ghim ${pinnedName} đối phương trước ${behindName}, tạo thế trói quân dĩ nhu khắc cương.`;

    return {
      kind: "xuMiddlegame",
      side: mover,
      tactic: "nhuHoaKiemToa",
      move: moveNotat,
      summary,
      details: `${pName} ghim ${pinnedName}`,
    };
  }

  // 2. Kiểm tra thế Đè / Kiềm tỏa tuyến (Clamp)
  const clampedSq = findClampedPiece(before, move, after, mover);
  if (clampedSq !== null) {
    const clampedPiece = after[clampedSq]!;
    const clampedName = PIECE_NAME[typeOf(clampedPiece)] ?? "quân";
    const pName = PIECE_NAME[mType] ?? "quân";
    const moveNotat = moveNotation(before, move);

    const summary = `Nhu hòa kiềm tỏa đậm chất Thái Cực: ${pName} chiếm tuyến trọng yếu, đè ép chặt chẽ ${clampedName} đối phương, bóp nghẹt đường cơ động.`;
    return {
      kind: "xuMiddlegame",
      side: mover,
      tactic: "nhuHoaKiemToa",
      move: moveNotat,
      summary,
      details: `${pName} kiềm tỏa ${clampedName}`,
    };
  }

  return null;
}

/**
 * 2. Cố nhược kim thang (Solid Defense / Phòng thủ kiên cố):
 * Củng cố Sĩ/Tượng hoặc đưa Tướng/quân chủ lực về vị trí phòng thủ vững chắc,
 * triệt tiêu mầm mống công kích của đối phương.
 */
export function detectSolidDefense(
  before: Board,
  move: Move,
  after: Board,
  options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const movingPiece = before[move.from];
  if (!movingPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  const loss = options?.loss ?? 0;
  if (loss > 60) return null;

  const mType = typeOf(movingPiece);
  const isAdvisorOrBishop = mType === "a" || mType === "b";
  const moveNotat = moveNotation(before, move);
  const pName = PIECE_NAME[mType] ?? "quân";

  if (isAdvisorOrBishop) {
    const defendedAtDest = isDefended(after, move.to, mover);
    if (!defendedAtDest || (exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

    // Phải có bối cảnh phòng ngự: đối phương có quân qua sông, hoặc cung Tướng bị đe dọa / chiếu
    const enemyInvaded = after.some((p, sqIdx) => p && sideOf(p) === opp && "rncp".includes(typeOf(p)) && crossedRiver(rowOf(sqIdx), opp));
    const kSq = findKing(before, mover);
    const palaceThreatened = kSq >= 0 && (underAttack(before, kSq, opp) || attackPressure(before, mover) > 0);
    const wasChecked = inCheck(before, mover);

    if (enemyInvaded || palaceThreatened || wasChecked) {
      const summary = `Phòng thủ kiên cố theo phong cách Thái Cực Bổng Hứa Ngân Xuyên: củng cố ${pName} tạo thế trận vững như bàn thạch, triệt tiêu mầm mống công kích của đối phương.`;
      return {
        kind: "xuMiddlegame",
        side: mover,
        tactic: "phongThuKienCo",
        move: moveNotat,
        summary,
        details: `Củng cố ${pName}`,
      };
    }
  }

  const wasThreatened = underAttack(before, move.from, opp);
  const isSafeNow = !underAttack(after, move.to, opp);
  const retreated = mover === "r" ? rowOf(move.to) > rowOf(move.from) : rowOf(move.to) < rowOf(move.from);

  if (wasThreatened && isSafeNow && retreated && "rnc".includes(mType)) {
    if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;
    const summary = `Dĩ nhu khắc cương: thoái ${pName} hóa giải nguy cơ trong gang tấc, giữ nguyên binh lực chờ thời cơ phản kích.`;
    return {
      kind: "xuMiddlegame",
      side: mover,
      tactic: "phongThuKienCo",
      move: moveNotat,
      summary,
      details: `Thoái ${pName} thủ`,
    };
  }

  return null;
}

/**
 * 3. Tích lũy ưu thế vi mô (Incremental Advantage / Tích tiểu thành đại):
 * Tiến Tốt qua sông đè đầu Mã hoặc mở rộng không gian khống chế,
 * kiên nhẫn gia tăng áp lực từng chút một đúng chất "Thiếu niên Khương Thái Công".
 */
export function detectIncrementalGain(
  before: Board,
  move: Move,
  after: Board,
  options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const movingPiece = before[move.from];
  if (!movingPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  const loss = options?.loss ?? 0;
  if (loss > 60) return null;

  const mType = typeOf(movingPiece);
  const moveNotat = moveNotation(before, move);

  if (mType === "p") {
    if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;

    const crossedNow = !crossedRiver(rowOf(move.from), mover) && crossedRiver(rowOf(move.to), mover);
    const advancedOverRiver = crossedRiver(rowOf(move.from), mover) && crossedRiver(rowOf(move.to), mover);

    if (crossedNow || advancedOverRiver) {
      const enemyHorses = after
        .map((p, idx) => (p && sideOf(p) === opp && typeOf(p) === "n" ? idx : -1))
        .filter((x) => x >= 0);
      const suppressesHorse = enemyHorses.some(
        (hSq) => Math.abs(colOf(hSq) - colOf(move.to)) <= 1 && Math.abs(rowOf(hSq) - rowOf(move.to)) <= 2,
      );
      const capturesPiece = !!before[move.to];
      const isSecure = isDefended(after, move.to, mover);

      if (suppressesHorse || capturesPiece || isSecure) {
        const summary = suppressesHorse
          ? `Tích tiểu thành đại theo phong cách Hứa Ngân Xuyên: tiến Tốt đè nghẽn Mã đối phương, từng bước bóp nghẹt không gian hoạt động của đối thủ.`
          : `Tích lũy ưu thế vi mô: vững bước tiến Tốt qua sông chiếm lĩnh trận địa, gia tăng áp lực trường kỳ lên phòng tuyến đối phương.`;

        return {
          kind: "xuMiddlegame",
          side: mover,
          tactic: "tichLuyUuThe",
          move: moveNotat,
          summary,
          details: suppressesHorse ? "Tiến Tốt đè Mã" : "Tiến Tốt tích lũy",
        };
      }
    }
  }

  return null;
}

/**
 * 4. Ép đổi quy tàn (Transition Exchange / Ép đổi giản hóa):
 * Khi đang chiếm ưu thế, chủ động ép đổi quân chủ lực đưa ván cờ về cờ tàn nghệ thuật.
 */
export function detectTransitionExchange(
  before: Board,
  move: Move,
  after: Board,
  options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  const movingPiece = before[move.from];
  const capturedPiece = before[move.to];
  if (!movingPiece || !capturedPiece) return null;

  const mover = sideOf(movingPiece);
  const opp = opponent(mover);
  if (sideOf(capturedPiece) !== opp) return null;

  const loss = options?.loss ?? 0;
  if (loss > 60) return null;

  const mType = typeOf(movingPiece);
  const cType = typeOf(capturedPiece);

  const isMajorTrade =
    "rnc".includes(mType) && "rnc".includes(cType) && (PIECE_VALUES[cType] >= PIECE_VALUES[mType] - 50);

  if (isMajorTrade) {
    const evalScore = options?.evalBefore?.score ?? 0;
    const balance = materialBalance(before, mover);
    if (evalScore >= 80 || balance >= 100) {
      const moveNotat = moveNotation(before, move);
      const mName = PIECE_NAME[mType] ?? "quân";
      const cName = PIECE_NAME[cType] ?? "quân";
      const summary = `Ép đổi quy tàn tuyệt đỉnh kiểu Hứa Ngân Xuyên: chủ động đổi ${mName} lấy ${cName} khi đang chiếm ưu thế, đưa ván cờ về tàn cuộc ắt thắng mà đối phương không thể quấy rối.`;
      return {
        kind: "xuMiddlegame",
        side: mover,
        tactic: "epDoiGianHoa",
        move: moveNotat,
        summary,
        details: `Đổi ${mName} quy tàn`,
      };
    }
  }

  return null;
}

/**
 * Bộ nhận diện tổng hợp các đòn kỳ lý trung cuộc Hứa Ngân Xuyên cơ bản.
 * Ưu tiên: Ép Đổi Quy Tàn > Nhu Hòa Kiềm Tỏa > Phòng Thủ Kiên Cố > Tích Lũy Ưu Thế.
 */
export function detectXuTactics(
  before: Board,
  move: Move,
  after: Board,
  options?: XuTacticsOptions,
): XuMiddlegameFact | null {
  return (
    detectTransitionExchange(before, move, after, options) ??
    detectPositionalClamp(before, move, after, options) ??
    detectSolidDefense(before, move, after, options) ??
    detectIncrementalGain(before, move, after, options)
  );
}



