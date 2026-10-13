// Trích xuất đặc trưng và trạng thái chi tiết của từng quân cờ trên bàn cờ.
// Hoạt động hoàn toàn tất định (deterministic), không gọi engine, có cache theo FEN.
// Cung cấp dữ kiện tĩnh làm nền tảng cho đánh giá thế cờ (B2), nhận diện đòn dọa (B3), ý đồ (B4).

import {
  COLS, ROWS, colOf, rowOf, sq, sideOf, typeOf, opponent,
  inCheck, attackersOf, isDefended, pseudoMoves,
  play, PIECE_VALUES, inPalaceSq as inPalace,
  type Board, type PieceType, type Side,
} from "./engine";
import { exchangeGain, ref, type PieceRef } from "./explain";
import { advance } from "./strategy";

const inBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

/** Các ngưỡng cấu hình kỳ lý có tên cho trạng thái quân cờ. */
export const FEATURE_THRESHOLDS = {
  /** Xe bị kìm: số nước đi an toàn tối đa (<= 2). */
  ROOK_PINNED_MAX_SAFE_MOVES: 2,
  /** Mã chết: số nước đi an toàn tối đa (0). */
  HORSE_DEAD_MAX_SAFE_MOVES: 0,
  /** Hàng bờ sông của mình (tiến 4 hàng từ đáy, tuần hà). */
  ADVANCE_RIVER_NEAR: 4,
  /** Hàng bờ sông đối phương (tiến 5 hàng từ đáy, áp hà / qua hà). */
  ADVANCE_RIVER_FAR: 5,
  /** Mã ngọa tào: hàng tiến 7, cột 2 hoặc 6. */
  ADVANCE_HORSE_PALACE_CORNER: 7,
  /** Mã quải giác: hàng tiến 8, cột 3 hoặc 5. */
  ADVANCE_HORSE_PALACE_EAR: 8,
  /** Cắm đáy: hàng tiến 9 (hàng đáy đối phương). */
  ADVANCE_BOTTOM: 9,
  /** Xe chiếm sườn: cột sườn (col 3 hoặc 5) và tiến >= 3 hàng. */
  ROOK_FLANK_MIN_ADVANCE: 3,
} as const;

/** Nhãn trạng thái đặc trưng của từng quân cờ. */
export type PieceTag =
  | "xeBiKim" | "xeLoThong" | "xeCamDay" | "xeTuanHa" | "xeChiemSuon"
  | "maChet" | "maBien" | "maBiCanChan" | "maHaKhau" | "maNgoaTao" | "maQuaiGiac"
  | "phaoKhongNgoi" | "phaoDau" | "phaoCamDay"
  | "totQuaHa" | "totLienHoan" | "totChimDay" | "totVaoCung"
  | "tuongBiCanMat" | "tuongLenTang" | "loMatTuong"
  | "treo" | "matGoc" | "biQuanReBat";

/** Trạng thái chi tiết của một quân cờ cụ thể trên bàn cờ. */
export interface PieceStatus {
  ref: PieceRef;
  tags: PieceTag[];
  /** Tổng số nước đi giả lập (pseudo-legal) quân có thể đi tới. */
  mobility: number;
  /** Số ô đi tới an toàn (không bị đối phương ăn có lời và không để Tướng bị chiếu). */
  safeMoves: number;
}

/** Tổng hợp đặc trưng của một phe (Đỏ hoặc Đen). */
export interface SideFeatures {
  pieces: PieceStatus[];
  byTag: Partial<Record<PieceTag, PieceRef[]>>;
  mobilityTotal: number;
  safeMovesTotal: number;
}

const ORTHO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const HORSE_LEGS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/**
 * Kiểm tra xem nước đi từ `from` tới `to` của quân phe `side` có an toàn không:
 * 1. Nước đi không để Tướng mình bị chiếu.
 * 2. Ở ô `to`, đối phương không ăn lại được có lời (exchangeGain <= 0).
 */
function isMoveSafe(board: Board, from: number, to: number, side: Side): boolean {
  const next = play(board, { from, to });
  if (inCheck(next, side)) return false;
  const opp = opponent(side);
  const gain = exchangeGain(next, to, opp);
  return gain === null || gain <= 0;
}

/** Đếm số ô an toàn mà quân tại ô `square` có thể đi tới. */
function countSafeMoves(board: Board, square: number, side: Side): number {
  let count = 0;
  for (const to of pseudoMoves(board, square)) {
    if (isMoveSafe(board, square, to, side)) count++;
  }
  return count;
}

/** Xe có lộ thông không: từ vị trí Xe tiến thẳng về đáy đối phương không có quân cản. */
function isRookOpenPath(board: Board, square: number, side: Side): boolean {
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

/** Mã có bị cản chân ở ít nhất 1 hướng không. */
function isHorseBlocked(board: Board, square: number): boolean {
  const r = rowOf(square);
  const c = colOf(square);
  for (const [dr, dc] of HORSE_LEGS) {
    const legR = r + dr;
    const legC = c + dc;
    if (inBoard(legR, legC) && board[sq(legR, legC)]) {
      return true;
    }
  }
  return false;
}

/** Pháo có ngòi không: có ít nhất 1 hướng trên hàng/cột có quân làm ngòi. */
function hasCannonScreen(board: Board, square: number): boolean {
  const r = rowOf(square);
  const c = colOf(square);
  for (const [dr, dc] of ORTHO_DIRS) {
    let rr = r + dr;
    let cc = c + dc;
    let foundPieces = 0;
    while (inBoard(rr, cc)) {
      if (board[sq(rr, cc)]) {
        foundPieces++;
        if (foundPieces >= 1) return true; // có ít nhất 1 quân làm ngòi trên hướng này
      }
      rr += dr;
      cc += dc;
    }
  }
  return false;
}

/** Tốt có liên hoàn không: Tốt đã qua sông và có Tốt cùng phe kề cạnh trên cùng hàng cũng qua sông. */
function isPawnLinked(board: Board, square: number, side: Side): boolean {
  const r = rowOf(square);
  const c = colOf(square);
  if (advance(square, side) < FEATURE_THRESHOLDS.ADVANCE_RIVER_FAR) return false;

  for (const dc of [-1, 1]) {
    const adjC = c + dc;
    if (inBoard(r, adjC)) {
      const neighbor = board[sq(r, adjC)];
      if (
        neighbor &&
        sideOf(neighbor) === side &&
        typeOf(neighbor) === "p" &&
        advance(sq(r, adjC), side) >= FEATURE_THRESHOLDS.ADVANCE_RIVER_FAR
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Kiểm tra mặt Tướng có bị quân cản che chắn không (tính từ Tướng nhìn về phía đối phương trên cùng cột). */
function isKingFaceBlocked(board: Board, square: number, side: Side): { blocked: boolean; openFace: boolean } {
  const r = rowOf(square);
  const c = colOf(square);
  const step = side === "r" ? -1 : 1;
  const oppKingType = side === "r" ? "k" : "K";

  let curR = r + step;
  let piecesBetween = 0;
  let sawOppKing = false;

  while (inBoard(curR, c)) {
    const p = board[sq(curR, c)];
    if (p) {
      if (p === oppKingType) {
        sawOppKing = true;
        break;
      }
      piecesBetween++;
    }
    curR += step;
  }

  return {
    blocked: piecesBetween > 0,
    openFace: piecesBetween === 0 && (sawOppKing || curR < 0 || curR >= ROWS),
  };
}

/** Quân có bị quân rẻ hơn của đối phương tấn công không. */
function isThreatenedByCheaper(board: Board, square: number, side: Side): boolean {
  const piece = board[square];
  if (!piece) return false;
  const myType = typeOf(piece);
  if (myType === "k") return false; // Tướng tính riêng qua chiếu
  const myVal = PIECE_VALUES[myType];
  const opp = opponent(side);

  const attackers = attackersOf(board, square, opp);
  return attackers.some((atkSq) => {
    const atkPiece = board[atkSq];
    if (!atkPiece) return false;
    const atkType = typeOf(atkPiece);
    const atkVal = PIECE_VALUES[atkType];
    return atkVal < myVal;
  });
}

/** Rút danh sách tags cho một quân cờ cụ thể tại `square`. */
function computePieceTags(
  board: Board,
  square: number,
  side: Side,
  type: PieceType,
  safeMoves: number,
): PieceTag[] {
  const tags: PieceTag[] = [];
  const opp = opponent(side);
  const adv = advance(square, side);
  const col = colOf(square);

  // 1. Phân loại theo loại quân
  switch (type) {
    case "r": {
      if (safeMoves <= FEATURE_THRESHOLDS.ROOK_PINNED_MAX_SAFE_MOVES) {
        tags.push("xeBiKim");
      }
      if (isRookOpenPath(board, square, side)) {
        tags.push("xeLoThong");
      }
      if (adv === FEATURE_THRESHOLDS.ADVANCE_BOTTOM) {
        tags.push("xeCamDay");
      }
      if (adv === FEATURE_THRESHOLDS.ADVANCE_RIVER_NEAR) {
        tags.push("xeTuanHa");
      }
      if ((col === 3 || col === 5) && adv >= FEATURE_THRESHOLDS.ROOK_FLANK_MIN_ADVANCE) {
        tags.push("xeChiemSuon");
      }
      break;
    }
    case "n": {
      if (safeMoves <= FEATURE_THRESHOLDS.HORSE_DEAD_MAX_SAFE_MOVES) {
        tags.push("maChet");
      }
      if (col === 0 || col === 8) {
        tags.push("maBien");
      }
      if (isHorseBlocked(board, square)) {
        tags.push("maBiCanChan");
      }
      if ((adv === 4 || adv === 5) && col >= 2 && col <= 6) {
        tags.push("maHaKhau");
      }
      if (adv === FEATURE_THRESHOLDS.ADVANCE_HORSE_PALACE_CORNER && (col === 2 || col === 6)) {
        tags.push("maNgoaTao");
      }
      if (adv === FEATURE_THRESHOLDS.ADVANCE_HORSE_PALACE_EAR && (col === 3 || col === 5)) {
        tags.push("maQuaiGiac");
      }
      break;
    }
    case "c": {
      if (!hasCannonScreen(board, square)) {
        tags.push("phaoKhongNgoi");
      }
      if (col === 4) {
        tags.push("phaoDau");
      }
      if (adv === FEATURE_THRESHOLDS.ADVANCE_BOTTOM) {
        tags.push("phaoCamDay");
      }
      break;
    }
    case "p": {
      if (adv >= FEATURE_THRESHOLDS.ADVANCE_RIVER_FAR) {
        tags.push("totQuaHa");
      }
      if (isPawnLinked(board, square, side)) {
        tags.push("totLienHoan");
      }
      if (adv === FEATURE_THRESHOLDS.ADVANCE_BOTTOM) {
        tags.push("totChimDay");
      }
      if (inPalace(square, opp)) {
        tags.push("totVaoCung");
      }
      break;
    }
    case "k": {
      const face = isKingFaceBlocked(board, square, side);
      if (face.blocked) {
        tags.push("tuongBiCanMat");
      }
      if (face.openFace) {
        tags.push("loMatTuong");
      }
      if (adv >= 1) {
        tags.push("tuongLenTang");
      }
      break;
    }
  }

  // 2. An toàn chung (áp dụng cho mọi quân trừ Tướng)
  if (type !== "k") {
    const gain = exchangeGain(board, square, opp);
    if (gain !== null && gain > 0) {
      tags.push("treo");
    }
  }

  // Quân lớn mất gốc
  if ("rnc".includes(type) && !isDefended(board, square, side)) {
    tags.push("matGoc");
  }

  // Bị quân rẻ hơn tấn công
  if (isThreatenedByCheaper(board, square, side)) {
    tags.push("biQuanReBat");
  }

  return tags;
}

/** Khởi tạo bộ gom nhóm rỗng cho một phe. */
function createSideFeatures(): SideFeatures {
  return {
    pieces: [],
    byTag: {},
    mobilityTotal: 0,
    safeMovesTotal: 0,
  };
}

// Bộ nhớ đệm FEN -> Features để tái sử dụng nhanh trong cùng một ván cờ (< 2ms)
const FEATURES_CACHE = new Map<string, Record<Side, SideFeatures>>();
const MAX_CACHE_SIZE = 512;

/**
 * Trích xuất toàn bộ đặc trưng và trạng thái quân cờ của cả hai bên trên bàn cờ.
 * Kết quả là thuần JSON và được cache theo FEN.
 */
export function extractFeatures(board: Board): Record<Side, SideFeatures> {
  const cacheKey = board.map((p) => p ?? ".").join("");
  const cached = FEATURES_CACHE.get(cacheKey);
  if (cached) return cached;

  const result: Record<Side, SideFeatures> = {
    r: createSideFeatures(),
    b: createSideFeatures(),
  };

  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (!piece) continue;

    const s = sideOf(piece);
    const t = typeOf(piece);
    const pieceRef = ref(board, i);
    const mobility = pseudoMoves(board, i).length;
    const safeMoves = countSafeMoves(board, i, s);
    const tags = computePieceTags(board, i, s, t, safeMoves);

    const status: PieceStatus = {
      ref: pieceRef,
      tags,
      mobility,
      safeMoves,
    };

    const sideData = result[s];
    sideData.pieces.push(status);
    sideData.mobilityTotal += mobility;
    sideData.safeMovesTotal += safeMoves;

    for (const tag of tags) {
      if (!sideData.byTag[tag]) {
        sideData.byTag[tag] = [];
      }
      sideData.byTag[tag]!.push(pieceRef);
    }
  }

  if (FEATURES_CACHE.size >= MAX_CACHE_SIZE) {
    // Xóa bớt mục đầu tiên khi đầy cache
    const firstKey = FEATURES_CACHE.keys().next().value;
    if (firstKey !== undefined) FEATURES_CACHE.delete(firstKey);
  }
  FEATURES_CACHE.set(cacheKey, result);

  return result;
}

/** Xóa sạch bộ nhớ đệm đặc trưng (phục vụ test). */
export function clearFeaturesCache(): void {
  FEATURES_CACHE.clear();
}
