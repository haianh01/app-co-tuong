// Nhận diện các tàn cuộc lý thuyết thắng hoặc hòa kinh điển trong Cờ Tướng.

import { Board, Side, typeOf, sideOf, rowOf } from "./engine";

export type EndgameOutcome = "win" | "draw" | "unclear";

export interface SidePieceCount {
  k: number;
  r: number;
  n: number;
  c: number;
  p: number;
  passedP: number;
  highP: number;
  /** Tốt cao thật sự: đã qua sông, cách hàng đáy đối phương ít nhất 2 hàng (không tính Tốt thấp sát đáy). */
  upperP: number;
  lowP: number;
  a: number;
  b: number;
  majors: number;
  totalAttackers: number;
}

export interface TheoreticalEndgame {
  id: string;
  name: string;
  outcome: EndgameOutcome;
  winner?: Side;
  attacker?: Side;
  defender?: Side;
  description: string;
}

/** Đếm số lượng và đặc tính từng loại quân của một phe trên bàn cờ. */
export function countSidePieces(board: Board, s: Side): SidePieceCount {
  let k = 0, r = 0, n = 0, c = 0, p = 0, passedP = 0, highP = 0, upperP = 0, lowP = 0, a = 0, b = 0;
  board.forEach((piece, square) => {
    if (!piece || sideOf(piece) !== s) return;
    const t = typeOf(piece);
    const row = rowOf(square);
    switch (t) {
      case "k": k++; break;
      case "r": r++; break;
      case "n": n++; break;
      case "c": c++; break;
      case "a": a++; break;
      case "b": b++; break;
      case "p": {
        p++;
        const isPassed = s === "r" ? row <= 4 : row >= 5;
        if (isPassed) {
          passedP++;
          const isLow = s === "r" ? row === 0 : row === 9;
          if (isLow) lowP++;
          else highP++;
          if (s === "r" ? row >= 2 : row <= 7) upperP++;
        }
        break;
      }
    }
  });
  return {
    k, r, n, c, p, passedP, highP, upperP, lowP, a, b,
    majors: r + n + c,
    totalAttackers: r + n + c + passedP,
  };
}

function evaluateOneSidedAttack(
  attSide: Side,
  att: SidePieceCount,
  defSide: Side,
  def: SidePieceCount
): TheoreticalEndgame | null {
  // TH 1: Đơn Pháo
  if (att.c === 1 && att.r === 0 && att.n === 0 && att.p === 0) {
    if (def.a === 0 && def.b === 0 && att.a === 0 && att.b === 0) {
      return {
        id: "draw_cannon_no_screen",
        name: "Đơn Pháo hòa Đơn Tướng (Pháo không ngòi)",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Đơn Pháo không có bất kỳ quân nào làm ngòi thì không thể chiếu tướng hay chiếu bí.",
      };
    }
    if (def.a > 0 || def.b > 0) {
      return {
        id: "draw_single_cannon_vs_guards",
        name: "Đơn Pháo hòa Sĩ Tượng",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Đơn Pháo đơn độc không thể phá vỡ thế phòng thủ của Tướng có Sĩ hoặc Tượng che chở.",
      };
    }
  }

  // TH 2: Đơn Mã
  if (att.n === 1 && att.r === 0 && att.c === 0 && att.p === 0) {
    if (def.a >= 2) {
      return {
        id: "draw_single_horse_vs_advisors",
        name: "Đơn Mã hòa Song Sĩ (Sĩ bền)",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Đơn Mã không thể phá được cặp Sĩ phòng thủ kiên cố trong cung tướng.",
      };
    }
    if (def.b >= 2) {
      return {
        id: "draw_single_horse_vs_elephants",
        name: "Đơn Mã hòa Song Tượng",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Đơn Mã không thể phá vỡ thế liên kết hỗ trợ của Song Tượng.",
      };
    }
    if (def.a >= 1 && def.b >= 1) {
      return {
        id: "draw_single_horse_vs_guard_elephant",
        name: "Đơn Mã hòa Sĩ Tượng",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Đơn Mã không thể phá vỡ thế phòng thủ có cả Sĩ lẫn Tượng phối hợp.",
      };
    }
    if (def.a === 0 && def.b === 0) {
      return {
        id: "win_single_horse_vs_bare_king",
        name: "Đơn Mã thắng Đơn Tướng",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Đơn Mã khéo léo phối hợp cùng mặt Tướng có thể ép bắt bí Đơn Tướng không có quân bảo vệ.",
      };
    }
  }

  // TH 3: Đơn Xe đối thủ chỉ còn Sĩ Tượng (không còn quân lớn)
  if (att.r === 1 && att.n === 0 && att.c === 0 && att.p === 0 && def.majors === 0) {
    if (def.a === 2 && def.b === 2) {
      return {
        id: "draw_rook_vs_full_guards",
        name: "Đơn Xe hòa Sĩ Tượng toàn",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Đơn Xe đối đầu Sĩ Tượng toàn đứng đúng vị trí phòng thủ là hình cờ hòa lý thuyết kinh điển.",
      };
    }
    if (def.a === 2 && def.b <= 1) {
      return {
        id: "win_rook_vs_advisors_no_elephants",
        name: "Đơn Xe thắng Song Sĩ (Khuyết Tượng)",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Song Sĩ không có Tượng che chắn không thể chống đỡ các đòn khống chế và chia cắt của Đơn Xe.",
      };
    }
    if (def.a <= 1 && def.b === 2) {
      return {
        id: "win_rook_vs_elephants_no_advisors",
        name: "Đơn Xe thắng Song Tượng (Khuyết Sĩ)",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Khuyết Sĩ tạo điểm yếu chí tử ở trung lộ, Đơn Xe dễ dàng khai thác để giành chiến thắng.",
      };
    }
    if (def.a <= 1 && def.b <= 1) {
      return {
        id: "win_rook_vs_weak_guards",
        name: "Đơn Xe thắng Đơn Sĩ (hoặc Tướng trần)",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Đơn Xe áp đảo hoàn toàn khi đối phương chỉ còn Đơn Sĩ, Đơn Tượng hoặc Tướng trần.",
      };
    }
  }

  // TH 4: Đơn Xe đối Đơn Pháo hoặc Đơn Mã
  if (att.r === 1 && att.n === 0 && att.c === 0 && att.p === 0 && def.r === 0 && def.p === 0) {
    if (def.c === 1 && def.n === 0 && (def.a < 2 || def.b < 2)) {
      return {
        id: "win_rook_vs_cannon",
        name: "Đơn Xe thắng Đơn Pháo",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Đơn Xe có sức cơ động tuyệt đối, chắc thắng Đơn Pháo khi đối thủ thiếu bộ phòng thủ Sĩ Tượng toàn.",
      };
    }
    if (def.n === 1 && def.c === 0 && (def.a < 2 || def.b < 2)) {
      return {
        id: "win_rook_vs_horse",
        name: "Đơn Xe thắng Đơn Mã",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Đơn Xe kiểm soát toàn bàn cờ, có thể phong tỏa và bắt chết Đơn Mã đơn độc.",
      };
    }
  }

  // TH 5: Mã Chốt
  if (att.n === 1 && att.p >= 1 && att.r === 0 && att.c === 0) {
    // (Luật cũ "Mã Chốt cao thắng Sĩ Tượng toàn" đã bỏ: Pikafish chấm hòa 29/30 thế ngẫu nhiên — xem VERIFIED_RULES.)
    // Chỉ khi bên thủ đủ Sĩ Tượng: gặp Song Sĩ khuyết Tượng thì Mã + Tốt đáy vẫn thắng (Pikafish 28/30).
    if (att.highP === 0 && att.lowP >= 1 && def.a >= 2 && def.b >= 2) {
      return {
        id: "draw_horse_low_pawn_vs_guards",
        name: "Mã Chốt đáy (Tốt già) hòa Sĩ Tượng toàn",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Chốt đã xuống hàng đáy bị hạn chế tầm hoạt động, không đủ lực phối hợp cùng Mã dứt điểm.",
      };
    }
  }

  // (TH 6 Pháo Chốt chuyển sang VERIFIED_RULES: chỉ 1-2 Sĩ làm ngòi thì Pikafish chấm hòa 20/30, phải đủ Sĩ Tượng mới thắng.)

  // TH 7: Đơn Chốt
  if (att.p === 1 && att.majors === 0) {
    if (def.a >= 1 || def.b >= 1) {
      return {
        id: "draw_single_pawn_vs_guards",
        name: "Đơn Chốt hòa Sĩ (hoặc Tượng)",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Một Chốt đơn độc không đủ lực chiếu bí Tướng có Sĩ hoặc Tượng phòng thủ.",
      };
    }
    if (att.lowP === 1) {
      return {
        id: "draw_low_pawn_bare_king",
        name: "Chốt đáy (Tốt già) hòa cờ",
        outcome: "draw",
        attacker: attSide,
        defender: defSide,
        description: "Chốt đã lọt đáy đối phương mất góc chiếu và độ linh hoạt, không thể chiếu bí.",
      };
    }
  }

  return null;
}

// ============================================================================
// LUẬT ĐÃ KIỂM CHỨNG BẰNG PIKAFISH
// Mỗi cấu hình: 30 thế ngẫu nhiên hợp lệ (Tướng trong cung, không lộ mặt, không ai bị chiếu, không quân nào treo,
// Sĩ Tượng đúng ô, Tốt cao ở hàng Tốt / sông / đỉnh cung đối phương), mỗi thế Pikafish tính 1,5 giây có WDL.
// Chỉ nhận cấu hình mà >= 90% thế mẫu cùng kết quả. Suy rộng một chiều: thắng khi bên thủ đủ Sĩ Tượng thì cũng
// thắng khi bên thủ ít hơn; hòa khi bên công có Sĩ Tượng thì bên công ít hơn cũng không thắng được — nhưng chỉ kết luận
// "hòa" khi bên thủ không còn quân tấn công; bên thủ còn Xe / Mã / Pháo thì chỉ áp đúng cấu hình đã kiểm.
// Kết quả lấy mẫu (ngày 2026-10-16) ghi trong ngoặc ở từng luật.
// ============================================================================

interface PieceSpec { r?: number; n?: number; c?: number; p?: number }

/** Bên `s` có đúng số Xe / Mã / Pháo / Tốt như `spec` (không ghi = 0). */
function exactly(s: SidePieceCount, spec: PieceSpec): boolean {
  return s.r === (spec.r ?? 0) && s.n === (spec.n ?? 0) && s.c === (spec.c ?? 0) && s.p === (spec.p ?? 0);
}
const fullGuards = (s: SidePieceCount) => s.a === 2 && s.b === 2;
const noGuards = (s: SidePieceCount) => s.a === 0 && s.b === 0;

interface VerifiedRule {
  id: string;
  name: string;
  outcome: "win" | "draw";
  description: string;
  when: (att: SidePieceCount, def: SidePieceCount) => boolean;
}

const VERIFIED_RULES: VerifiedRule[] = [
  // --- Thắng ---
  {
    id: "win_horse_cannon_vs_guards", name: "Mã Pháo thắng Sĩ Tượng toàn", outcome: "win",
    description: "Mã Pháo phối hợp (Mã làm ngòi cho Pháo, Pháo khống chế đường Tướng) đủ sức phá Sĩ Tượng toàn.",
    when: (att, def) => exactly(att, { n: 1, c: 1 }) && exactly(def, {}), // (thắng 28/30 khi Đỏ có Sĩ Tượng, 30/30 khi không)
  },
  {
    id: "win_double_horse_vs_guards", name: "Song Mã thắng Sĩ Tượng toàn", outcome: "win",
    description: "Hai Mã thay nhau khống chế và chiếu, Sĩ Tượng toàn không giữ nổi cung.",
    when: (att, def) => exactly(att, { n: 2 }) && exactly(def, {}), // (thắng 29/30 khi Đỏ có Sĩ Tượng, 30/30 khi không)
  },
  {
    id: "win_double_cannon_with_guards", name: "Song Pháo (có Song Sĩ) thắng Sĩ Tượng toàn", outcome: "win",
    description: "Song Pháo có Song Sĩ nhà làm ngòi thay nhau chiếu, phá được Sĩ Tượng toàn; không có ngòi thì khó thắng.",
    when: (att, def) => exactly(att, { c: 2 }) && att.a === 2 && exactly(def, {}), // (thắng 28/30 với Sĩ Tượng toàn, 28/30 chỉ Song Sĩ; không Sĩ Tượng chỉ 6/30)
  },
  {
    id: "win_cannon_pawn_full_guards", name: "Pháo Tốt cao (có Sĩ Tượng toàn) thắng Sĩ Tượng toàn", outcome: "win",
    description: "Pháo Tốt cao có đủ Sĩ Tượng nhà làm ngòi thì phá được Sĩ Tượng toàn; thiếu ngòi thì khó thắng.",
    when: (att, def) => exactly(att, { c: 1, p: 1 }) && att.upperP === 1 && fullGuards(att) && exactly(def, {}), // (thắng 27/30; đối AA 30/30, BB 27/30)
  },
  {
    id: "win_horse_pawn_vs_advisors", name: "Mã Tốt cao thắng Song Sĩ (khuyết Tượng)", outcome: "win",
    description: "Thiếu Tượng, Song Sĩ không che được các điểm Mã Tốt khai thác.",
    // Tốt phải đã qua sông: Tốt cao thắng cả khi bên công không có Sĩ Tượng; Tốt thấp / đáy cần bên công đủ Sĩ Tượng.
    when: (att, def) => exactly(att, { n: 1, p: 1 }) && (att.upperP === 1 || (fullGuards(att) && att.passedP === 1)) && exactly(def, {}) && def.b === 0, // (Tốt cao: thắng 29/30 không Sĩ Tượng, 30/30 có; Tốt đáy có Sĩ Tượng: 28/30)
  },
  {
    id: "win_horse_pawn_vs_two_guards", name: "Mã Tốt cao (có Sĩ Tượng) thắng Sĩ Tượng lẻ", outcome: "win",
    description: "Bên thủ chỉ còn hai quân Sĩ / Tượng, Mã Tốt có Sĩ Tượng nhà yểm trợ phá được.",
    when: (att, def) => exactly(att, { n: 1, p: 1 }) && att.upperP === 1 && fullGuards(att) && exactly(def, {}) && def.a + def.b <= 2, // (đối Sĩ Tượng 28/30, Song Tượng 27/30; ba quân thủ chỉ 24/30 nên không tính)
  },
  {
    id: "win_rook_pawn_vs_bare_rook", name: "Xe Tốt cao thắng Xe đơn (không Sĩ Tượng)", outcome: "win",
    description: "Bên thủ chỉ còn Xe trơ, không Sĩ Tượng che Tướng: Xe Tốt có Sĩ Tượng thắng được.",
    when: (att, def) => exactly(att, { r: 1, p: 1 }) && att.upperP === 1 && fullGuards(att) && exactly(def, { r: 1 }) && def.a === 0 && def.b <= 1, // (thắng 28/30; còn 1 Tượng 27/30; còn 1 Sĩ chỉ 20/30 nên không tính; Đỏ không Sĩ Tượng 24/30)
  },
  {
    id: "win_rook_horse_vs_bare_rook", name: "Xe Mã thắng Xe đơn (không Sĩ Tượng)", outcome: "win",
    description: "Xe Mã có Sĩ Tượng đối Xe trơ không Sĩ Tượng: Tướng bên thủ không có chỗ trú, Xe Mã phối hợp chiếu bí.",
    when: (att, def) => exactly(att, { r: 1, n: 1 }) && fullGuards(att) && exactly(def, { r: 1 }) && noGuards(def), // (thắng 27/30)
  },
  {
    id: "win_rook_cannon_vs_bare_rook", name: "Xe Pháo thắng Xe đơn (không Sĩ Tượng)", outcome: "win",
    description: "Xe Pháo có Sĩ Tượng làm ngòi đối Xe trơ không Sĩ Tượng: dễ dàng chiếu bí.",
    when: (att, def) => exactly(att, { r: 1, c: 1 }) && fullGuards(att) && exactly(def, { r: 1 }) && noGuards(def), // (thắng 29/30)
  },
  // --- Hòa ---
  {
    id: "draw_horse_pawn_vs_full_guards", name: "Mã Tốt khó thắng Sĩ Tượng toàn", outcome: "draw",
    description: "Một Mã một Tốt không đủ lực phá Sĩ Tượng toàn đứng đúng chỗ, thường là hòa.",
    // Chỉ khi bên công không có Sĩ Tượng (đã kiểm). Có đủ Sĩ Tượng thì bên công thắng được 5/30, chưa đủ cơ sở kết luận.
    when: (att, def) => exactly(att, { n: 1, p: 1 }) && noGuards(att) && exactly(def, {}) && fullGuards(def), // (hòa 29/30, cả Tốt cao lẫn Tốt thấp)
  },
  {
    id: "draw_cannon_pawn_no_screen", name: "Pháo Tốt không ngòi hòa Sĩ Tượng toàn", outcome: "draw",
    description: "Không có Sĩ Tượng nhà làm ngòi, Pháo Tốt không chiếu bí được Tướng có Sĩ Tượng toàn.",
    when: (att, def) => exactly(att, { c: 1, p: 1 }) && noGuards(att) && exactly(def, {}) && fullGuards(def), // (hòa 30/30)
  },
  {
    id: "draw_cannon_bottom_pawn_vs_full_guards", name: "Pháo Tốt đáy hòa Sĩ Tượng toàn", outcome: "draw",
    description: "Tốt đã xuống đáy (Tốt già) chỉ đi ngang, Pháo Tốt dù có Sĩ Tượng làm ngòi cũng không phá được Sĩ Tượng toàn.",
    when: (att, def) => exactly(att, { c: 1, p: 1 }) && att.lowP === 1 && exactly(def, {}) && fullGuards(def), // (hòa 29/30, trong khi Tốt cao có Sĩ Tượng thắng 27/30)
  },
  {
    id: "draw_pawn_pair_vs_full_guards", name: "Song Tốt hòa Sĩ Tượng toàn", outcome: "draw",
    description: "Hai Tốt không có quân lớn hỗ trợ không phá được Sĩ Tượng toàn.",
    when: (att, def) => exactly(att, { p: 2 }) && exactly(def, {}) && fullGuards(def), // (hòa 30/30)
  },
  {
    id: "draw_rook_pawn_vs_rook_guards", name: "Xe Tốt hòa Xe Sĩ Tượng toàn", outcome: "draw",
    description: "Xe Sĩ Tượng toàn giữ được trước Xe Tốt: Xe bên thủ quấy rối, Sĩ Tượng che Tướng.",
    when: (att, def) => exactly(att, { r: 1, p: 1 }) && fullGuards(att) && exactly(def, { r: 1 }) && fullGuards(def), // (hòa 29/30, hai bên đủ Sĩ Tượng)
  },
  {
    id: "draw_horse_pawn_vs_horse_guards", name: "Mã Tốt hòa Mã Sĩ Tượng toàn", outcome: "draw",
    description: "Hơn một Tốt nhưng bên thủ còn Mã và Sĩ Tượng toàn, không phá được thế thủ.",
    when: (att, def) => exactly(att, { n: 1, p: 1 }) && fullGuards(att) && exactly(def, { n: 1 }) && fullGuards(def), // (hòa 30/30, hai bên đủ Sĩ Tượng)
  },
  {
    id: "draw_cannon_pawn_vs_cannon_guards", name: "Pháo Tốt hòa Pháo Sĩ Tượng toàn", outcome: "draw",
    description: "Hơn một Tốt nhưng bên thủ còn Pháo và Sĩ Tượng toàn, không phá được thế thủ.",
    when: (att, def) => exactly(att, { c: 1, p: 1 }) && fullGuards(att) && exactly(def, { c: 1 }) && fullGuards(def), // (hòa 29/30, hai bên đủ Sĩ Tượng)
  },
];

function matchVerified(board: Board): TheoreticalEndgame | null {
  const sides: [Side, Side][] = [["r", "b"], ["b", "r"]];
  for (const [attSide, defSide] of sides) {
    const att = countSidePieces(board, attSide);
    const def = countSidePieces(board, defSide);
    for (const rule of VERIFIED_RULES) {
      if (!rule.when(att, def)) continue;
      return {
        id: rule.id,
        name: rule.name,
        outcome: rule.outcome,
        ...(rule.outcome === "win" ? { winner: attSide } : {}),
        attacker: attSide,
        defender: defSide,
        description: rule.description,
      };
    }
  }
  return null;
}

/**
 * Nhận diện hình cờ tàn lý thuyết kinh điển (thắng hoặc hòa).
 * Trả về `TheoreticalEndgame` nếu thế cờ khớp lý thuyết tàn cuộc, ngược lại trả về `null`.
 */
export function detectTheoreticalEndgame(board: Board): TheoreticalEndgame | null {
  const red = countSidePieces(board, "r");
  const black = countSidePieces(board, "b");

  // Chỉ xét khi đã vào tàn cuộc (tổng quân lớn cả 2 bên <= 4)
  if (red.majors + black.majors > 4) return null;

  const verified = matchVerified(board);
  if (verified) return verified;

  // 1. Cạn quân tấn công cả 2 bên
  if (red.majors === 0 && black.majors === 0 && red.p === 0 && black.p === 0) {
    return {
      id: "draw_bare_kings",
      name: "Cạn quân tấn công",
      outcome: "draw",
      description: "Cả hai bên chỉ còn Tướng và Sĩ Tượng, không còn quân có thể tấn công chiếu bí.",
    };
  }

  // 2. Đơn Xe hòa Đơn Xe
  if (
    red.r === 1 && red.n === 0 && red.c === 0 && red.p === 0 &&
    black.r === 1 && black.n === 0 && black.c === 0 && black.p === 0
  ) {
    return {
      id: "draw_single_rook_each",
      name: "Đơn Xe hòa Đơn Xe",
      outcome: "draw",
      description: "Mỗi bên còn một Xe đơn độc, không còn lực phối hợp tấn công, hình cờ hòa lý thuyết.",
    };
  }

  // 3. Đỏ tấn công, Đen chỉ phòng thủ hoặc yếu thế
  if (black.majors === 0 && black.p === 0) {
    const res = evaluateOneSidedAttack("r", red, "b", black);
    if (res) return res;
  } else if (black.r === 0 && black.p === 0 && (black.c === 1 || black.n === 1) && red.r === 1 && red.n === 0 && red.c === 0 && red.p === 0) {
    const res = evaluateOneSidedAttack("r", red, "b", black);
    if (res) return res;
  }

  // 4. Đen tấn công, Đỏ chỉ phòng thủ hoặc yếu thế
  if (red.majors === 0 && red.p === 0) {
    const res = evaluateOneSidedAttack("b", black, "r", red);
    if (res) return res;
  } else if (red.r === 0 && red.p === 0 && (red.c === 1 || red.n === 1) && black.r === 1 && black.n === 0 && black.c === 0 && black.p === 0) {
    const res = evaluateOneSidedAttack("b", black, "r", red);
    if (res) return res;
  }

  // 5. Cân bằng Đơn Pháo hoặc Đơn Mã mỗi bên có đủ Sĩ Tượng
  if (
    red.c === 1 && red.r === 0 && red.n === 0 && red.p === 0 && red.a >= 1 &&
    black.c === 1 && black.r === 0 && black.n === 0 && black.p === 0 && black.a >= 1
  ) {
    return {
      id: "draw_single_cannon_each",
      name: "Đơn Pháo đối Đơn Pháo hòa cờ",
      outcome: "draw",
      description: "Mỗi bên còn Đơn Pháo có Sĩ phòng thủ, lực lượng cân bằng và không thể tạo đột biến.",
    };
  }

  if (
    red.n === 1 && red.r === 0 && red.c === 0 && red.p === 0 && red.a >= 1 &&
    black.n === 1 && black.r === 0 && black.c === 0 && black.p === 0 && black.a >= 1
  ) {
    return {
      id: "draw_single_horse_each",
      name: "Đơn Mã đối Đơn Mã hòa cờ",
      outcome: "draw",
      description: "Mỗi bên còn Đơn Mã có Sĩ giữ cung, thế cờ cân bằng hòa lý thuyết.",
    };
  }

  return null;
}
