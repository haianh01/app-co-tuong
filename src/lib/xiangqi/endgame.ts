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
  let k = 0, r = 0, n = 0, c = 0, p = 0, passedP = 0, highP = 0, lowP = 0, a = 0, b = 0;
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
        }
        break;
      }
    }
  });
  return {
    k, r, n, c, p, passedP, highP, lowP, a, b,
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
    if (att.highP >= 1) {
      return {
        id: "win_horse_pawn_vs_full_guards",
        name: "Mã Chốt thắng Sĩ Tượng toàn",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Mã kết hợp cùng Chốt cao qua sông tạo thành thế gọng kìm uy lực, có thể phá tan Sĩ Tượng toàn.",
      };
    }
    if (att.highP === 0 && att.lowP >= 1 && def.a >= 2) {
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

  // TH 6: Pháo Chốt có ngòi
  if (att.c === 1 && att.p >= 1 && att.r === 0 && att.n === 0) {
    if ((att.a >= 1 || att.b >= 1) && att.highP >= 1) {
      return {
        id: "win_cannon_pawn_screen_vs_full_guards",
        name: "Pháo Chốt có ngòi thắng Sĩ Tượng toàn",
        outcome: "win",
        winner: attSide,
        attacker: attSide,
        defender: defSide,
        description: "Pháo Chốt có quân bên mình làm ngòi có thể linh hoạt chuyển hướng công kích, phá tan Sĩ Tượng toàn.",
      };
    }
  }

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

/**
 * Nhận diện hình cờ tàn lý thuyết kinh điển (thắng hoặc hòa).
 * Trả về `TheoreticalEndgame` nếu thế cờ khớp lý thuyết tàn cuộc, ngược lại trả về `null`.
 */
export function detectTheoreticalEndgame(board: Board): TheoreticalEndgame | null {
  const red = countSidePieces(board, "r");
  const black = countSidePieces(board, "b");

  // Chỉ xét khi đã vào tàn cuộc (tổng quân lớn cả 2 bên <= 4)
  if (red.majors + black.majors > 4) return null;

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
