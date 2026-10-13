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
  inCheck, opponent, sideOf, typeOf, sq, rowOf, colOf, ROWS, inPalace, crossedRiver, findKing, isAttacked,
  play, PIECE_VALUES,
} from "./engine";
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
