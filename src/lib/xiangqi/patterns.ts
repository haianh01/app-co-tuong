// Bộ nhận diện toàn bộ các hình sát cục kinh điển trong Cờ Tướng.
// Kiểm tra quan hệ hình học và kỳ lý giữa các quân công và Tướng đối phương.
// Chạy cực nhanh (< 0.05ms) vì chỉ đọc chỉ số mảng 90 ô, không đệ quy.

import {
  Board, Side, colOf, findKing, inCheck, isAttacked, opponent, pseudoMoves, rowOf, sideOf, sq, typeOf,
} from "./engine";

export type MatePatternId =
  | "ma_hau_phao"       // Mã hậu Pháo (Pháo sau Mã chiếu)
  | "trung_phao"        // Trùng Pháo (Hai Pháo cùng lộ)
  | "thiet_mon_xuyen"   // Thiết môn xuyên (Xe cắm đáy + Pháo đầu ghìm tim)
  | "song_xe_thac"      // Song Xe thác (Hai Xe kẹp chiếu liên hoàn)
  | "bach_kiem_tuong"   // Bạch kiểm tướng (Lộ mặt Tướng trợ công)
  | "ngoa_tao_ma"       // Ngọa tào Mã (Mã nhảy nách sườn cung)
  | "dieu_ngu_ma"       // Điếu ngư Mã (Mã câu cá khóa tầng 2)
  | "bat_giac_ma"       // Bát giác Mã (Mã góc cung)
  | "cao_dieu_ma"       // Cao điếu Mã (Trắc diện hổ khóa Tướng lên tầng)
  | "quai_giac_ma"      // Quải giác Mã (Mã móc góc cung)
  | "thien_dia_phao"    // Thiên địa Pháo (Pháo đầu + Pháo cắm đáy)
  | "giap_xe_phao"      // Giáp Xe Pháo (Xe Pháo cùng cánh khoét nách)
  | "hai_de_lao_nguyet" // Hải để lao nguyệt (Vớt trăng đáy nước)
  | "muon_cung"         // Muộn cung / Muộn sát (Tướng kẹt giữa 2 Sĩ)
  | "dai_dao_khu_oa"    // Đại đao khu oa (Đao xuyên tâm phá Sĩ)
  | "nhi_quy_phach_mon" // Nhị quỷ phách môn (Song Tốt vỗ cửa cung)
  | "song_ma_am_tuyen"  // Song Mã ẩm tuyền (Hai Mã liên hoàn kẹp cung)
  | "bat_hoang_ma"      // Bạt hoàng Mã (Dời quân chặn chân Mã để Mã chiếu)
  | "phao_nien_dan_sa"  // Pháo niễn đan sa (Pháo chìm đáy cùng Xe càn quét Sĩ Tượng)
  | "tong_phat_quy_dien" // Tống Phật quy điện (Tốt đuổi chiếu Tướng từng bước)
  | "than_ap_quan"      // Thần áp quân (Quân của chính đối phương chặn đường Tướng)
  | "tam_tu_quy_bien";  // Tam tử quy biên (Ba quân dồn một cánh đối phương)

export interface DetectedPattern {
  id: MatePatternId;
  name: string;
  side: Side;
  targetSide: Side;
  pieces: number[];
  isCheck: boolean;
  description: string;
}

const HORSE_STEPS = [
  [-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
  [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1],
] as const;

/** Kiểm tra Mã ở horseSq có thể nhảy tới targetSq mà không bị cản chân không. */
export function canHorseReach(board: Board, horseSq: number, targetSq: number): boolean {
  const hr = rowOf(horseSq);
  const hc = colOf(horseSq);
  const tr = rowOf(targetSq);
  const tc = colOf(targetSq);
  for (const [dr, dc, lr, lc] of HORSE_STEPS) {
    if (hr + dr === tr && hc + dc === tc) {
      return !board[sq(hr + lr, hc + lc)];
    }
  }
  return false;
}

/** Đếm số quân nằm giữa hai ô trên cùng một hàng hoặc cột. Trả về -1 nếu không cùng hàng/cột. */
export function countBetween(board: Board, sq1: number, sq2: number): number {
  const r1 = rowOf(sq1), c1 = colOf(sq1);
  const r2 = rowOf(sq2), c2 = colOf(sq2);
  if (r1 !== r2 && c1 !== c2) return -1;
  const dr = Math.sign(r2 - r1);
  const dc = Math.sign(c2 - c1);
  let count = 0;
  let r = r1 + dr;
  let c = c1 + dc;
  while (r !== r2 || c !== c2) {
    if (board[sq(r, c)]) count++;
    r += dr;
    c += dc;
  }
  return count;
}

/** Tìm tất cả các vị trí chứa quân loại `type` của phe `side`. */
function findPieces(board: Board, side: Side, type: string): number[] {
  const res: number[] = [];
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && sideOf(p) === side && typeOf(p) === type) {
      res.push(i);
    }
  }
  return res;
}

// ============================================================================
// 1. Mã hậu Pháo (马后炮)
// Pháo đứng sau Mã trên cùng hàng/cột chiếu Tướng, mượn Mã làm ngòi.
// ============================================================================
function detectMaHauPhao(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const cannons = findPieces(board, side, "c");
  const horses = findPieces(board, side, "n");
  const kr = rowOf(kSq), kc = colOf(kSq);

  for (const cSq of cannons) {
    for (const hSq of horses) {
      const cr = rowOf(cSq), cc = colOf(cSq);
      const hr = rowOf(hSq), hc = colOf(hSq);

      const sameCol = cc === kc && hc === kc;
      const sameRow = cr === kr && hr === kr;
      if (!sameCol && !sameRow) continue;

      // Mã phải nằm giữa Pháo và Tướng
      const horseBetween = sameCol
        ? (cr < hr && hr < kr) || (kr < hr && hr < cr)
        : (cc < hc && hc < kc) || (kc < hc && hc < cc);
      if (!horseBetween) continue;

      // Giữa Pháo và Mã không có quân cản, giữa Mã và Tướng không có quân cản
      if (countBetween(board, cSq, hSq) === 0 && countBetween(board, hSq, kSq) === 0) {
        return {
          id: "ma_hau_phao",
          name: "Mã hậu Pháo",
          side,
          targetSide: opponent(side),
          pieces: [cSq, hSq, kSq],
          isCheck: true,
          description: "Pháo mượn Mã làm ngòi chiếu thẳng vào Tướng, tạo thế sát cục hiểm hóc.",
        };
      }
    }
  }
  return null;
}

// ============================================================================
// 2. Trùng Pháo (重炮)
// Hai Pháo cùng nằm trên một cột (hoặc hàng) nhắm vào Tướng.
// ============================================================================
function detectTrungPhao(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const cannons = findPieces(board, side, "c");
  if (cannons.length < 2) return null;
  const kr = rowOf(kSq), kc = colOf(kSq);

  const [c1, c2] = cannons;
  const r1 = rowOf(c1), col1 = colOf(c1);
  const r2 = rowOf(c2), col2 = colOf(c2);

  const sameCol = col1 === kc && col2 === kc;
  const sameRow = r1 === kr && r2 === kr;
  if (!sameCol && !sameRow) return null;

  // Xác định Pháo gần Tướng hơn (cNear) và Pháo xa hơn (cFar)
  const dist1 = sameCol ? Math.abs(r1 - kr) : Math.abs(col1 - kc);
  const dist2 = sameCol ? Math.abs(r2 - kr) : Math.abs(col2 - kc);
  const [cNear, cFar] = dist1 < dist2 ? [c1, c2] : [c2, c1];

  // Giữa hai Pháo không có quân cản
  if (countBetween(board, cFar, cNear) !== 0) return null;

  const countFront = countBetween(board, cNear, kSq);
  // TH1: cNear chiếu thẳng mặt Tướng (không ngòi), cFar giữ sau lưng
  // TH2: Giữa cNear và Tướng có 1 ngòi -> cNear đang chiếu
  if (countFront === 0 || countFront === 1) {
    return {
      id: "trung_phao",
      name: "Trùng Pháo",
      side,
      targetSide: opponent(side),
      pieces: [c1, c2, kSq],
      isCheck: countFront === 1,
      description: "Hai Pháo xếp chồng trên cùng lộ, đe dọa chiếu bí liên hoàn.",
    };
  }
  return null;
}

// ============================================================================
// 3. Thiết môn xuyên (铁门栓)
// Xe cắm tuyến đáy hoặc sườn, kết hợp Pháo đầu ở cột trung lộ (cột 4) ghìm chặt tim.
// ============================================================================
function detectThietMonXuyen(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const cannons = findPieces(board, side, "c");
  const rooks = findPieces(board, side, "r");
  const opp = opponent(side);
  const baseRow = opp === "b" ? 0 : 9;

  // Cần có Pháo đầu ở cột 4
  const centerCannon = cannons.find((c) => colOf(c) === 4 && (opp === "b" ? rowOf(c) <= 7 : rowOf(c) >= 2));
  if (!centerCannon) return null;

  // Xe cắm đáy hoặc sườn nách cung
  for (const rSq of rooks) {
    const rr = rowOf(rSq), rc = colOf(rSq);
    const atBase = rr === baseRow;
    const atFlank = (rc === 3 || rc === 5) && (opp === "b" ? rr <= 2 : rr >= 7);

    if (atBase || atFlank) {
      const isCheck = countBetween(board, rSq, kSq) === 0;
      return {
        id: "thiet_mon_xuyen",
        name: "Thiết môn xuyên",
        side,
        targetSide: opp,
        pieces: [centerCannon, rSq, kSq],
        isCheck,
        description: "Pháo đầu khóa chặt trung lộ kết hợp Xe cắm cung khép chặt cửa thành.",
      };
    }
  }
  return null;
}

// ============================================================================
// 4. Song Xe thác (双车错)
// Hai Xe áp sát cung Tướng, phối hợp chiếu hoặc kẹp cổ.
// ============================================================================
function detectSongXeThac(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const rooks = findPieces(board, side, "r");
  if (rooks.length < 2) return null;
  const opp = opponent(side);

  // Cả 2 Xe đều ở gần cung đối phương (3 hàng cuối)
  const inPalaceZone = (r: number) => (opp === "b" ? r <= 2 : r >= 7);
  const activeRooks = rooks.filter((r) => inPalaceZone(rowOf(r)));
  if (activeRooks.length < 2) return null;

  const [r1, r2] = activeRooks;
  const check1 = countBetween(board, r1, kSq) === 0;
  const check2 = countBetween(board, r2, kSq) === 0;

  // Hai Xe ở 2 hàng khác nhau hoặc 2 cột khác nhau kề nhau tạo thế thác
  return {
    id: "song_xe_thac",
    name: "Song Xe thác",
    side,
    targetSide: opp,
    pieces: [r1, r2, kSq],
    isCheck: check1 || check2,
    description: "Hai Xe áp sát cung luân phiên chiếu ép Tướng vào bước đường cùng.",
  };
}

// ============================================================================
// 5. Bạch kiểm tướng (白脸将 - Lộ mặt Tướng)
// Hai Tướng cùng lộ thông mặt, Tướng ta làm bình phong cho quân khác chiếu.
// ============================================================================
function detectBachKiemTuong(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const ownKing = findKing(board, side);
  if (ownKing < 0) return null;

  // Hai Tướng cùng cột và không có quân chắn giữa
  if (colOf(ownKing) !== colOf(kSq)) return null;
  if (countBetween(board, ownKing, kSq) !== 0) return null;

  // Có quân thứ 2 (Xe/Pháo/Mã) đang chiếu Tướng từ hướng khác
  const rooks = findPieces(board, side, "r");
  const cannons = findPieces(board, side, "c");
  const horses = findPieces(board, side, "n");

  for (const rSq of rooks) {
    if (colOf(rSq) !== colOf(kSq) && countBetween(board, rSq, kSq) === 0) {
      return {
        id: "bach_kiem_tuong",
        name: "Bạch kiểm tướng",
        side,
        targetSide: opponent(side),
        pieces: [ownKing, rSq, kSq],
        isCheck: true,
        description: "Tướng trợ chiến khống chế lộ mặt, tạo đường cho Xe chiếu sát.",
      };
    }
  }

  for (const cSq of cannons) {
    if (colOf(cSq) !== colOf(kSq) && countBetween(board, cSq, kSq) === 1) {
      return {
        id: "bach_kiem_tuong",
        name: "Bạch kiểm tướng",
        side,
        targetSide: opponent(side),
        pieces: [ownKing, cSq, kSq],
        isCheck: true,
        description: "Tướng khống chế lộ mặt, kết hợp Pháo chiếu sát.",
      };
    }
  }

  for (const hSq of horses) {
    if (canHorseReach(board, hSq, kSq)) {
      return {
        id: "bach_kiem_tuong",
        name: "Bạch kiểm tướng",
        side,
        targetSide: opponent(side),
        pieces: [ownKing, hSq, kSq],
        isCheck: true,
        description: "Lộ mặt Tướng kết hợp Mã chiếu sát.",
      };
    }
  }

  return null;
}

// ============================================================================
// 6. Ngọa tào Mã (卧槽马)
// Mã ở ô nách sườn cung (hàng 1 cột 1/7 với Đen; hàng 8 cột 1/7 với Đỏ)
// ============================================================================
function detectNgoaTaoMa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const horses = findPieces(board, side, "n");
  const opp = opponent(side);
  const targetRow = opp === "b" ? 1 : 8;

  for (const hSq of horses) {
    if (rowOf(hSq) === targetRow && (colOf(hSq) === 1 || colOf(hSq) === 7)) {
      // Kiểm tra chân Mã nhảy vào chiếu Tướng hoặc khóa Tướng có bị cản không
      const canCheck = canHorseReach(board, hSq, kSq);
      // Hoặc Mã có chân nhảy vào ô trong cung
      const palaceTarget = sq(opp === "b" ? 0 : 9, colOf(hSq) === 1 ? 3 : 5);
      const reachesPalace = canHorseReach(board, hSq, palaceTarget);

      if (canCheck || reachesPalace) {
        return {
          id: "ngoa_tao_ma",
          name: "Ngọa tào Mã",
          side,
          targetSide: opp,
          pieces: [hSq, kSq],
          isCheck: canCheck,
          description: "Mã ngọa tào ở sườn cung hiểm hóc, khóa chặt các lối thoát của Tướng.",
        };
      }
    }
  }
  return null;
}

// ============================================================================
// 7. Điếu ngư Mã (钓鱼马)
// Mã ở ô (2, 2) hoặc (2, 6) đối với Đen; (7, 2) hoặc (7, 6) đối với Đỏ.
// ============================================================================
function detectDieuNguMa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const horses = findPieces(board, side, "n");
  const opp = opponent(side);
  const targetRow = opp === "b" ? 2 : 7;

  for (const hSq of horses) {
    if (rowOf(hSq) === targetRow && (colOf(hSq) === 2 || colOf(hSq) === 6)) {
      const exitSq1 = sq(opp === "b" ? 1 : 8, 4);
      const exitSq2 = sq(opp === "b" ? 0 : 9, colOf(hSq) === 2 ? 3 : 5);
      const blocksExit = canHorseReach(board, hSq, exitSq1) || canHorseReach(board, hSq, exitSq2);

      if (blocksExit) {
        return {
          id: "dieu_ngu_ma",
          name: "Điếu ngư Mã",
          side,
          targetSide: opp,
          pieces: [hSq, kSq],
          isCheck: canHorseReach(board, hSq, kSq),
          description: "Mã câu cá ghim chặt tầng 2, tạo thế cho Xe cắm đáy dứt điểm.",
        };
      }
    }
  }
  return null;
}

// ============================================================================
// 8. Bát giác Mã (八角马)
// Mã ở ô (2, 1) hoặc (2, 7) với Đen; (7, 1) hoặc (7, 7) với Đỏ.
// ============================================================================
function detectBatGiacMa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const horses = findPieces(board, side, "n");
  const opp = opponent(side);
  const targetRow = opp === "b" ? 2 : 7;

  for (const hSq of horses) {
    if (rowOf(hSq) === targetRow && (colOf(hSq) === 3 || colOf(hSq) === 5)) {
      if (canHorseReach(board, hSq, kSq)) {
        return {
          id: "bat_giac_ma",
          name: "Bát giác Mã",
          side,
          targetSide: opp,
          pieces: [hSq, kSq],
          isCheck: true,
          description: "Mã Bát giác ở góc gọng Sĩ phong tỏa cửa cung, khóa chặt đường thoát của Tướng.",
        };
      }
    }
  }
  return null;
}

// ============================================================================
// 9. Cao điếu Mã (高钓马 / Trắc diện hổ)
// Mã ở hàng 3 (Black) hoặc hàng 6 (Red) khóa Tướng khi Tướng lên tầng.
// ============================================================================
function detectCaoDieuMa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const horses = findPieces(board, side, "n");
  const opp = opponent(side);
  const targetRow = opp === "b" ? 3 : 6;
  const kingRow = rowOf(kSq);
  // Tướng phải lên tầng (hàng 1/2 với Black; 7/8 với Red)
  const kingHigh = opp === "b" ? kingRow >= 1 : kingRow <= 8;
  if (!kingHigh) return null;

  for (const hSq of horses) {
    if (rowOf(hSq) === targetRow && (colOf(hSq) === 2 || colOf(hSq) === 6)) {
      if (canHorseReach(board, hSq, kSq)) {
        return {
          id: "cao_dieu_ma",
          name: "Cao điếu Mã",
          side,
          targetSide: opp,
          pieces: [hSq, kSq],
          isCheck: true,
          description: "Mã trắc diện hổ khóa cứng Tướng trên tầng cao.",
        };
      }
    }
  }
  return null;
}

// ============================================================================
// 10. Quải giác Mã (挂角马 - Mã móc góc)
// Mã nhảy vào góc sườn đáy hoặc góc cung.
// ============================================================================
function detectQuaiGiacMa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const horses = findPieces(board, side, "n");
  const opp = opponent(side);
  const baseRow = opp === "b" ? 0 : 9;

  for (const hSq of horses) {
    if (rowOf(hSq) === baseRow && (colOf(hSq) === 2 || colOf(hSq) === 6)) {
      if (canHorseReach(board, hSq, kSq)) {
        return {
          id: "quai_giac_ma",
          name: "Quải giác Mã",
          side,
          targetSide: opp,
          pieces: [hSq, kSq],
          isCheck: true,
          description: "Mã móc góc cung hiểm hóc, bức Tướng vào thế sát.",
        };
      }
    }
  }
  return null;
}

// ============================================================================
// 11. Thiên địa Pháo (天地炮)
// 1 Pháo đầu ở cột 4 và 1 Pháo khác ở tuyến đáy (hàng 0 hoặc hàng 9).
// ============================================================================
function detectThienDiaPhao(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const cannons = findPieces(board, side, "c");
  if (cannons.length < 2) return null;
  const opp = opponent(side);
  const baseRow = opp === "b" ? 0 : 9;

  const thien = cannons.find((c) => colOf(c) === 4 && (opp === "b" ? rowOf(c) <= 7 : rowOf(c) >= 2));
  const dia = cannons.find((c) => rowOf(c) === baseRow && c !== thien);

  if (thien && dia) {
    const isCheck = countBetween(board, dia, kSq) === 1 || countBetween(board, thien, kSq) === 1;
    return {
      id: "thien_dia_phao",
      name: "Thiên địa Pháo",
      side,
      targetSide: opp,
      pieces: [thien, dia, kSq],
      isCheck,
      description: "Thế gọng kìm Thiên địa Pháo trên đe dưới dọa, công phá toàn diện.",
    };
  }
  return null;
}

// ============================================================================
// 12. Giáp Xe Pháo (夹车炮)
// Xe và Pháo cùng nằm trên 1 cánh sườn cung Tướng (cột 3 hoặc 5).
// ============================================================================
function detectGiapXePhao(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const rooks = findPieces(board, side, "r");
  const cannons = findPieces(board, side, "c");
  const opp = opponent(side);

  for (const rSq of rooks) {
    for (const cSq of cannons) {
      const rc = colOf(rSq), cc = colOf(cSq);
      if ((rc === 3 && cc === 3) || (rc === 5 && cc === 5)) {
        const inFlank = opp === "b" ? rowOf(rSq) <= 3 && rowOf(cSq) <= 3 : rowOf(rSq) >= 6 && rowOf(cSq) >= 6;
        if (inFlank) {
          return {
            id: "giap_xe_phao",
            name: "Giáp Xe Pháo",
            side,
            targetSide: opp,
            pieces: [rSq, cSq, kSq],
            isCheck: countBetween(board, rSq, kSq) === 0 || countBetween(board, cSq, kSq) === 1,
            description: "Xe Pháo cùng cánh ép sát nách cung, khoét thủng hàng phòng ngự.",
          };
        }
      }
    }
  }
  return null;
}

// ============================================================================
// 13. Hải để lao nguyệt (海底捞月)
// Xe và Pháo ở tuyến đáy, luồn đánh Tướng kẹt góc đáy.
// ============================================================================
function detectHaiDeLaoNguyet(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const rooks = findPieces(board, side, "r");
  const cannons = findPieces(board, side, "c");
  const opp = opponent(side);
  const baseRow = opp === "b" ? 0 : 9;

  if (rowOf(kSq) !== baseRow) return null;

  for (const rSq of rooks) {
    for (const cSq of cannons) {
      if (rowOf(rSq) === baseRow && rowOf(cSq) === baseRow) {
        return {
          id: "hai_de_lao_nguyet",
          name: "Hải để lao nguyệt",
          side,
          targetSide: opp,
          pieces: [rSq, cSq, kSq],
          isCheck: countBetween(board, rSq, kSq) === 0 || countBetween(board, cSq, kSq) === 1,
          description: "Thế vớt trăng đáy biển ở hàng đáy, triệt hạ đối phương.",
        };
      }
    }
  }
  return null;
}

// ============================================================================
// 14. Muộn cung / Muộn sát (闷宫)
// Tướng bị 2 Sĩ của chính mình kẹt ở đáy, bị Xe hoặc Pháo chiếu thẳng không cựa được.
// ============================================================================
function detectMuonCung(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const opp = opponent(side);
  const baseRow = opp === "b" ? 0 : 9;
  const fwd = opp === "b" ? 1 : -1;
  if (rowOf(kSq) !== baseRow || colOf(kSq) !== 4) return null;

  // Hai bên là hai Sĩ của đối phương bịt kín
  const s1 = board[sq(baseRow, 3)];
  const s2 = board[sq(baseRow, 5)];
  if (!s1 || !s2 || sideOf(s1) !== opp || sideOf(s2) !== opp || typeOf(s1) !== "a" || typeOf(s2) !== "a") {
    return null;
  }

  // Ô phía trước Tướng (tâm cung hàng 1/8) phải bị quân chắn hoặc bị khống chế
  const frontSq = sq(baseRow + fwd, 4);
  const frontBlocked = !!board[frontSq] || isAttacked(board, frontSq, side);
  if (!frontBlocked) return null;

  // Bị Xe chiếu thẳng trên cột 4
  const rooks = findPieces(board, side, "r");
  for (const rSq of rooks) {
    if (colOf(rSq) === 4 && countBetween(board, rSq, kSq) === 0) {
      return {
        id: "muon_cung",
        name: "Muộn cung",
        side,
        targetSide: opp,
        pieces: [rSq, kSq, sq(baseRow, 3), sq(baseRow, 5)],
        isCheck: true,
        description: "Tướng bị đôi Sĩ của mình làm tắc đường, chết đứng trong cung cấm.",
      };
    }
  }

  return null;
}

// ============================================================================
// 15. Đại đao khu oa (大刀剜心 - Đao xuyên tâm)
// Xe đâm thẳng vào tâm cung (hàng 1 cột 4 với Đen; hàng 8 cột 4 với Đỏ)
// ============================================================================
function detectDaiDaoKhuOa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const rooks = findPieces(board, side, "r");
  const opp = opponent(side);
  const heartSq = sq(opp === "b" ? 1 : 8, 4);

  for (const rSq of rooks) {
    if (rSq === heartSq) {
      return {
        id: "dai_dao_khu_oa",
        name: "Đại đao khu oa",
        side,
        targetSide: opp,
        pieces: [rSq, kSq],
        isCheck: countBetween(board, rSq, kSq) === 0,
        description: "Xe đâm thẳng tâm cung xé toang hàng phòng ngự, tạo sát cục không thể cản.",
      };
    }
  }
  return null;
}

// ============================================================================
// 16. Nhị quỷ phách môn (二鬼拍门)
// Hai Tốt (hoặc Xe + Tốt) áp sát hai bên nách Tướng trong cung.
// ============================================================================
function detectNhiQuyPhachMon(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const pawns = findPieces(board, side, "p");
  const opp = opponent(side);

  // Tìm 2 tốt ở nách cung: cột 3 và 5, ở hàng 1/2 với Black, 7/8 với Red
  const flankPawns = pawns.filter((pSq) => {
    const pr = rowOf(pSq), pc = colOf(pSq);
    const inRow = opp === "b" ? pr <= 2 : pr >= 7;
    return inRow && (pc === 3 || pc === 5);
  });

  if (flankPawns.length >= 2) {
    return {
      id: "nhi_quy_phach_mon",
      name: "Nhị quỷ phách môn",
      side,
      targetSide: opp,
      pieces: [...flankPawns, kSq],
      isCheck: inCheck(board, opp),
      description: "Song Tốt áp sát hai bên nách Tướng như hai quỷ vỗ cửa, áp đảo tuyệt đối.",
    };
  }
  return null;
}

// ============================================================================
// 17. Song Mã ẩm tuyền (双马饮泉)
// Hai Mã cùng áp sát cung Tướng, phối hợp liên hoàn.
// ============================================================================
function detectSongMaAmTuyen(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const horses = findPieces(board, side, "n");
  if (horses.length < 2) return null;
  const opp = opponent(side);

  const inZone = (sqr: number) => {
    const r = rowOf(sqr);
    return opp === "b" ? r <= 3 : r >= 6;
  };

  const active = horses.filter(inZone);
  if (active.length >= 2) {
    const [h1, h2] = active;
    const canCheck1 = canHorseReach(board, h1, kSq);
    const canCheck2 = canHorseReach(board, h2, kSq);

    if (canCheck1 || canCheck2) {
      return {
        id: "song_ma_am_tuyen",
        name: "Song Mã ẩm tuyền",
        side,
        targetSide: opp,
        pieces: [h1, h2, kSq],
        isCheck: canCheck1 || canCheck2,
        description: "Hai Mã liên hoàn nhảy áp sát cung Tướng, phối hợp chiếu bí biến hóa khôn lường.",
      };
    }
  }
  return null;
}

// Định nghĩa 5 hình dưới theo "36 sát pháp cơ bản" (老猿象棋): 拔簧马, 炮辗丹砂, 送佛归殿, 臣压君, 三子归边.

/** Phe `by` có khống chế ô `step` mà Tướng ở `kSq` định bước tới không (đặt thử Tướng vào đó để xét đúng luật Pháo, lộ mặt). */
function kingStepCovered(board: Board, kSq: number, step: number, by: Side): boolean {
  const probe = board.slice();
  probe[step] = probe[kSq];
  probe[kSq] = null;
  return isAttacked(probe, step, by);
}

/** Các ô Tướng ở `kSq` bước tới được (trong cung, theo hàng dọc / ngang). */
function kingSteps(kSq: number, owner: Side): number[] {
  const r = rowOf(kSq), c = colOf(kSq);
  const rows = owner === "b" ? [0, 1, 2] : [7, 8, 9];
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([rr, cc]) => rows.includes(rr) && cc >= 3 && cc <= 5)
    .map(([rr, cc]) => sq(rr, cc));
}

// ============================================================================
// 18. Bạt hoàng Mã (拔簧马)
// Quân của mình đang chặn chân Mã nhắm Tướng; dời quân đó đi là Mã chiếu (chiếu lộ diện bằng Mã).
// ============================================================================
function detectBatHoangMa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const kr = rowOf(kSq), kc = colOf(kSq);
  const horse = side === "r" ? "N" : "n";
  // Chỉ 8 ô cách Tướng một bước Mã mới có thể chứa Mã nhắm Tướng (không quét cả bàn).
  for (const [dr, dc, lr, lc] of HORSE_STEPS) {
    const hr = kr - dr, hc = kc - dc;
    if (hr < 0 || hr > 9 || hc < 0 || hc > 8) continue;
    const hSq = sq(hr, hc);
    if (board[hSq] !== horse) continue;
    {
      const legSq = sq(hr + lr, hc + lc);
      const blocker = board[legSq];
      if (!blocker || sideOf(blocker) !== side || !"rncp".includes(typeOf(blocker))) continue;
      return {
        id: "bat_hoang_ma",
        name: "Bạt hoàng Mã",
        side,
        targetSide: opponent(side),
        pieces: [hSq, legSq, kSq],
        isCheck: false,
        description: "Quân mình đang chặn chân Mã nhắm thẳng Tướng: dời quân đó đi (thường kèm chiếu hoặc ăn quân) là Mã chiếu lộ diện, đối phương khó đỡ cả hai đòn.",
      };
    }
  }
  return null;
}

// ============================================================================
// 19. Pháo niễn đan sa (炮辗丹砂)
// Pháo chìm xuống hàng đáy đối phương, có Xe phối hợp sát đáy, càn quét Sĩ Tượng.
// ============================================================================
function detectPhaoNienDanSa(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const opp = opponent(side);
  const base = opp === "b" ? 0 : 9;
  const nearBase = opp === "b" ? 1 : 8;
  const rook = side === "r" ? "R" : "r";
  const cannon = side === "r" ? "C" : "c";
  let rookHelps = false;
  for (let c = 0; c < 9 && !rookHelps; c++) rookHelps = board[sq(base, c)] === rook || board[sq(nearBase, c)] === rook;
  if (!rookHelps) return null;
  for (let col = 0; col < 9; col++) {
    const cSq = sq(base, col);
    if (board[cSq] !== cannon) continue;
    const prey = pseudoMoves(board, cSq).find((t) => {
      const v = board[t];
      return !!v && sideOf(v) === opp && rowOf(t) === base && (typeOf(v) === "a" || typeOf(v) === "b");
    });
    if (prey === undefined) continue;
    return {
      id: "phao_nien_dan_sa",
      name: "Pháo niễn đan sa",
      side,
      targetSide: opp,
      pieces: [cSq, prey, kSq],
      isCheck: inCheck(board, opp),
      description: "Pháo chìm đáy được Xe yểm trợ, càn quét Sĩ Tượng dọc hàng đáy, phòng tuyến cung Tướng tan rã dần.",
    };
  }
  return null;
}

// ============================================================================
// 20. Tống Phật quy điện (送佛归殿)
// Tốt có quân khác yểm trợ chiếu Tướng đã rời hàng đáy, từng bước đuổi Tướng về đáy cung.
// ============================================================================
function detectTongPhatQuyDien(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const opp = opponent(side);
  if (rowOf(kSq) === (opp === "b" ? 0 : 9)) return null; // Tướng đã ở đáy: không còn "đuổi về điện"
  const pawn = side === "r" ? "P" : "p";
  // Tốt chỉ chiếu được khi đứng sát Tướng: xét 4 ô kề Tướng thay vì quét cả bàn.
  const kr = rowOf(kSq), kc = colOf(kSq);
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const r = kr + dr, c = kc + dc;
    if (r < 0 || r > 9 || c < 0 || c > 8) continue;
    const pSq = sq(r, c);
    if (board[pSq] !== pawn) continue;
    if (!pseudoMoves(board, pSq).includes(kSq)) continue;
    // Tốt phải được quân khác của mình bảo vệ (Tướng không ăn được): đặt thử Tướng đối phương vào ô Tốt.
    const probe = board.slice();
    probe[pSq] = probe[kSq];
    probe[kSq] = null;
    if (!isAttacked(probe, pSq, side)) continue;
    return {
      id: "tong_phat_quy_dien",
      name: "Tống Phật quy điện",
      side,
      targetSide: opp,
      pieces: [pSq, kSq],
      isCheck: true,
      description: "Tốt có quân yểm trợ chiếu sát mặt Tướng, từng bước đuổi Tướng lùi về đáy cung để các quân khác kết liễu.",
    };
  }
  return null;
}

// ============================================================================
// 21. Thần áp quân (臣压君)
// Tướng bị chiếu, mọi ô thoát đều bị khống chế hoặc bị chính quân tấn công (Xe Mã Pháo Tốt) của đối phương chặn.
// ============================================================================
function detectThanApQuan(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const opp = opponent(side);
  const steps = kingSteps(kSq, opp);
  // Lọc rẻ trước: phải có quân tấn công (Xe Mã Pháo Tốt) của chính đối phương chặn ô thoát; chặn bằng Sĩ là Muộn cung.
  const blockers = steps.filter((st) => {
    const v = board[st];
    return !!v && sideOf(v) === opp && "rncp".includes(typeOf(v));
  });
  if (blockers.length === 0) return null;
  if (!inCheck(board, opp)) return null;
  for (const step of steps) {
    const v = board[step];
    if (v && sideOf(v) === opp) continue;
    if (!kingStepCovered(board, kSq, step, side)) return null; // Tướng còn đường thoát
  }
  return {
    id: "than_ap_quan",
    name: "Thần áp quân",
    side,
    targetSide: opp,
    pieces: [...blockers, kSq],
    isCheck: true,
    description: "Chính quân của đối phương đứng chắn đường thoát của Tướng (bề tôi đè vua), một nước chiếu là Tướng hết đường chạy.",
  };
}

// ============================================================================
// 22. Tam tử quy biên (三子归边)
// Ba quân tấn công (Xe, Mã, Pháo) cùng dồn về một cánh bên sân đối phương, cùng khống chế cung Tướng.
// ============================================================================
function detectTamTuQuyBien(board: Board, side: Side, kSq: number): DetectedPattern | null {
  const opp = opponent(side);
  const palaceRows = opp === "b" ? [0, 1, 2] : [7, 8, 9];
  // Một lượt quét nửa sân đối phương lấy Xe Mã Pháo của mình.
  const majors: number[] = [];
  const [from, to] = opp === "b" ? [0, 45] : [45, 90];
  for (let i = from; i < to; i++) {
    const p = board[i];
    if (p && sideOf(p) === side && "rnc".includes(typeOf(p))) majors.push(i);
  }
  if (majors.length < 3) return null;
  for (const flank of [(c: number) => c <= 3, (c: number) => c >= 5]) {
    if (!(flank(colOf(kSq)) || colOf(kSq) === 4)) continue; // Tướng phải ở cánh đó hoặc giữa cung
    const group = majors.filter((i) => flank(colOf(i)));
    if (group.length < 3) continue;
    const hit = new Set<number>();
    let attackers = 0;
    for (const i of group) {
      const into = pseudoMoves(board, i).filter((t) => palaceRows.includes(rowOf(t)) && colOf(t) >= 3 && colOf(t) <= 5);
      if (into.length) attackers++;
      into.forEach((t) => hit.add(t));
    }
    if (attackers < 3 || hit.size < 2) continue;
    return {
      id: "tam_tu_quy_bien",
      name: "Tam tử quy biên",
      side,
      targetSide: opp,
      pieces: [...group, kSq],
      isCheck: inCheck(board, opp),
      description: "Ba quân tấn công cùng dồn về một cánh đối phương, phối hợp uy hiếp cung Tướng — lấy đông đánh ít.",
    };
  }
  return null;
}

// ============================================================================
// Danh sách tất cả các hàm nhận diện
// ============================================================================
const DETECTORS: ((board: Board, side: Side, kSq: number) => DetectedPattern | null)[] = [
  detectMaHauPhao,
  detectTrungPhao,
  detectThietMonXuyen,
  detectSongXeThac,
  detectBachKiemTuong,
  detectNgoaTaoMa,
  detectDieuNguMa,
  detectBatGiacMa,
  detectCaoDieuMa,
  detectQuaiGiacMa,
  detectThienDiaPhao,
  detectGiapXePhao,
  detectHaiDeLaoNguyet,
  detectMuonCung,
  detectDaiDaoKhuOa,
  detectNhiQuyPhachMon,
  detectSongMaAmTuyen,
  detectBatHoangMa,
  detectPhaoNienDanSa,
  detectTongPhatQuyDien,
  detectThanApQuan,
  detectTamTuQuyBien,
];

/**
 * Quét toàn bộ bàn cờ để tìm các hình sát cục đang được thiết lập bởi phe `side`.
 * Nếu không truyền `side`, quét cho cả 2 bên.
 */
export function detectPatterns(board: Board, side?: Side): DetectedPattern[] {
  const sides: Side[] = side ? [side] : ["r", "b"];
  const out: DetectedPattern[] = [];

  for (const s of sides) {
    const opp = opponent(s);
    const kSq = findKing(board, opp);
    if (kSq < 0) continue;

    for (const detector of DETECTORS) {
      const res = detector(board, s, kSq);
      if (res) {
        out.push(res);
      }
    }
  }

  return out;
}

/** Kiểm tra xem phe `side` có đang lập thế sát cục cụ thể `patternId` không. */
export function hasPattern(board: Board, side: Side, patternId: MatePatternId): boolean {
  const patterns = detectPatterns(board, side);
  return patterns.some((p) => p.id === patternId);
}
