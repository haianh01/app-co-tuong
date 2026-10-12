// Nhận diện khai cuộc theo nước đầu tiên của mỗi bên (ký hiệu Việt Nam, mỗi bên tự đánh số cột từ phải sang trái).

export interface Opening {
  id: string;
  name: string;
}

const OPENINGS = {
  center: { id: "center", name: "Pháo đầu (Trung pháo)" },
  corner: { id: "corner", name: "Sĩ giác pháo" },
  cross: { id: "cross", name: "Quá cung pháo" },
  cannon: { id: "cannon", name: "Pháo khác" },
  horse: { id: "horse", name: "Khởi mã" },
  elephant: { id: "elephant", name: "Phi tượng" },
  pawn: { id: "pawn", name: "Tiên nhân chỉ lộ (tiến tốt)" },
  centerPawn: { id: "centerPawn", name: "Trung binh (tiến tốt giữa)" },
  other: { id: "other", name: "Khai cuộc khác" },
} satisfies Record<string, Opening>;

/** Khai cuộc ứng với nước đầu của một bên, ví dụ "P2-5" → Pháo đầu, "M8.7" → Khởi mã. */
export function openingOf(notation: string): Opening {
  const m = /^(P|M|T|B)(\d)([.\-/])(\d)$/.exec(notation);
  if (!m) return OPENINGS.other;
  const [, piece, file, dir, to] = m;
  switch (piece) {
    case "P":
      if (dir !== "-") return OPENINGS.cannon;
      if (to === "5") return OPENINGS.center;
      // Pháo cột 2 sang cột 4 (hay cột 8 sang 6) là đứng góc sĩ cùng bên; sang hẳn bên kia cung là quá cung.
      if ((file === "2" && to === "4") || (file === "8" && to === "6")) return OPENINGS.corner;
      if ((file === "2" && to === "6") || (file === "8" && to === "4")) return OPENINGS.cross;
      return OPENINGS.cannon;
    case "M":
      return OPENINGS.horse;
    case "T":
      return dir === "." && to === "5" ? OPENINGS.elephant : OPENINGS.other;
    case "B":
      if (file === "5") return OPENINGS.centerPawn;
      return file === "3" || file === "7" ? OPENINGS.pawn : OPENINGS.other;
  }
  return OPENINGS.other;
}

export interface OpeningStat extends Opening {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

/** Gộp kết quả theo khai cuộc, xếp theo số ván giảm dần. */
export function tallyOpenings(rows: { notation: string; result: "win" | "draw" | "loss" }[]): OpeningStat[] {
  const map = new Map<string, OpeningStat>();
  for (const r of rows) {
    const o = openingOf(r.notation);
    const s = map.get(o.id) ?? { ...o, games: 0, wins: 0, draws: 0, losses: 0 };
    s.games++;
    if (r.result === "win") s.wins++;
    else if (r.result === "draw") s.draws++;
    else s.losses++;
    map.set(o.id, s);
  }
  return [...map.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

export interface OpeningBookLine {
  name: string;
  moves: string[];
}

/** Cây khai cuộc các biến kinh điển chuẩn của Cờ Tướng. */
export const OPENING_BOOK_LINES: OpeningBookLine[] = [
  // Trung pháo đối Bình Phong Mã
  { name: "Pháo đầu đối Bình Phong Mã (Trực xa tiến chốt 7)", moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "X2.6", "P8-9"] },
  { name: "Pháo đầu đối Bình Phong Mã (Tuần hà xa)", moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "X2.4", "S4.5"] },
  { name: "Pháo đầu đối Bình Phong Mã (Tiến chốt 3)", moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B3.1", "B3.1", "M8.7", "P8-9"] },
  { name: "Pháo đầu đối Bình Phong Mã (Tả mã bàn hà)", moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "M7.6"] },
  { name: "Pháo đầu đối Bình Phong Mã (Ngũ thất pháo)", moves: ["P2-5", "M8.7", "M2.3", "M2.3", "X1-2", "X9-8", "P8-7", "B7.1"] },
  { name: "Pháo đầu đối Bình Phong Mã (Hoành xa)", moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1.1", "M2.3", "X1-6", "B7.1"] },
  { name: "Pháo đầu đối Bình Phong Mã", moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"] },

  // Trung pháo đối Thuận Pháo
  { name: "Thuận Pháo (Trực xa đối Hoành xa)", moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1-2", "X9.1", "X2.6", "M2.3"] },
  { name: "Thuận Pháo (Trực xa đối Trực xa)", moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1-2", "X9-8", "X2.6", "M2.3"] },
  { name: "Thuận Pháo (Hoành xa đối Trực xa)", moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1.1", "M2.3", "X1-6", "X9-8"] },
  { name: "Thuận Pháo (Hoãn khai xa)", moves: ["P2-5", "P8-5", "M2.3", "M8.7", "B7.1", "B7.1"] },
  { name: "Thuận Pháo", moves: ["P2-5", "P8-5"] },

  // Trung pháo đối Nghịch Pháo
  { name: "Nghịch Pháo (Trực xa)", moves: ["P2-5", "P2-5", "M2.3", "M8.7", "X1-2", "X9-8", "B7.1", "M2.3"] },
  { name: "Nghịch Pháo (Hoành xa)", moves: ["P2-5", "P2-5", "M2.3", "M8.7", "X1.1", "M2.3", "X1-6", "X9-8"] },
  { name: "Nghịch Pháo", moves: ["P2-5", "P2-5"] },

  // Trung pháo đối Đơn Đề Mã
  { name: "Pháo đầu đối Đơn Đề Mã (Hữu đơn đề)", moves: ["P2-5", "M8.7", "M2.3", "M2.1", "X1-2", "X9-8"] },
  { name: "Pháo đầu đối Đơn Đề Mã (Tả đơn đề)", moves: ["P2-5", "M2.1", "M2.3", "M8.7"] },
  { name: "Pháo đầu đối Đơn Đề Mã", moves: ["P2-5", "M8.7", "M2.3", "M2.1"] },

  // Trung pháo đối Phản Cung Mã
  { name: "Pháo đầu đối Phản Cung Mã (Tiến chốt 7)", moves: ["P2-5", "M2.3", "M2.3", "P8-6", "X1-2", "M8.7", "B7.1", "S4.5"] },
  { name: "Pháo đầu đối Phản Cung Mã (Tiến chốt 3)", moves: ["P2-5", "M2.3", "M2.3", "P8-6", "X1-2", "M8.7", "B3.1", "B3.1"] },
  { name: "Pháo đầu đối Phản Cung Mã", moves: ["P2-5", "M2.3", "M2.3", "P8-6"] },

  // Quy Bối Pháo & Tam Bộ Hổ
  { name: "Quy Bối Pháo", moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "P8/1"] },
  { name: "Tam Bộ Hổ", moves: ["P2-5", "M8.7", "M2.3", "P8-6", "X1-2", "M2.3"] },

  // Tiên Nhân Chỉ Lộ
  { name: "Tiên Nhân Chỉ Lộ đối Tốt Đáy", moves: ["B7.1", "B3.1", "M2.3", "M8.7", "P2-5", "P8-5"] },
  { name: "Tiên Nhân Chỉ Lộ đối Đối Binh", moves: ["B3.1", "B7.1", "M8.7", "M2.3", "P8-5", "P2-5"] },
  { name: "Tiên Nhân Chỉ Lộ chuyển Pháo đầu", moves: ["B7.1", "P2-5", "P2-5", "M8.7", "M2.3", "X9-8"] },
  { name: "Tiên Nhân Chỉ Lộ đối Khởi Mã", moves: ["B7.1", "M8.7", "P2-5", "P2-5", "M2.3", "M2.3"] },

  // Phi Tượng Cuộc
  { name: "Phi Tượng đối Tả sĩ giác pháo", moves: ["T7.5", "M8.7", "M2.3", "P2-5", "P2-4", "X9-8"] },
  { name: "Phi Tượng đối Trung pháo", moves: ["T7.5", "P2-5", "M2.3", "M8.7", "B7.1", "X9-8"] },
  { name: "Phi Tượng đối Khởi Mã", moves: ["T3.5", "M2.3", "M8.7", "P8-5", "P8-6", "X1-2"] },

  // Khởi Mã Cuộc
  { name: "Khởi Mã đối Trung pháo", moves: ["M2.3", "P2-5", "M8.7", "M8.7", "B7.1", "B7.1"] },
  { name: "Khởi Mã đối Khởi Mã", moves: ["M2.3", "M8.7", "P2-5", "P2-5", "X1-2", "X9-8"] },
  { name: "Khởi Mã đối Tiến Tốt", moves: ["M8.7", "B7.1", "P8-5", "M8.7", "M2.3", "X9-8"] },

  // Sĩ Giác Pháo & Quá Cung Pháo
  { name: "Sĩ Giác Pháo", moves: ["P2-4", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"] },
  { name: "Quá Cung Pháo", moves: ["P2-6", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"] },
];

/**
 * Kiểm tra xem chuỗi nước đi có khớp với một nhánh trong cây khai cuộc chuẩn không.
 * - Nước đầu tiên: mọi nước mở màn chính quy (khác 'other').
 * - Các nước tiếp theo: phải là tiền tố của một biến trong OPENING_BOOK_LINES.
 */
export function isBookMove(playedNotations: string[]): boolean {
  if (playedNotations.length === 0 || playedNotations.length > 20) return false;
  if (playedNotations.length === 1) {
    const o = openingOf(playedNotations[0]);
    return o.id !== "other";
  }
  return OPENING_BOOK_LINES.some((line) => {
    if (line.moves.length < playedNotations.length) return false;
    for (let i = 0; i < playedNotations.length; i++) {
      if (line.moves[i] !== playedNotations[i]) return false;
    }
    return true;
  });
}

/**
 * Nhận diện tên thế trận khai cuộc từ chuỗi các nước đi trong ván cờ (tiếng Việt).
 * So khớp từ biến sâu nhất trong OPENING_BOOK_LINES (Thuận Pháo, Nghịch Pháo, Bình Phong Mã, Phản Cung Mã...),
 * nếu không khớp chuỗi sâu thì fallback về nước đầu tiên.
 */
export function detectOpeningFromMoves(playedNotations: string[]): string | undefined {
  if (playedNotations.length === 0) return undefined;

  let bestCompleted: { name: string; matchLen: number } | null = null;
  let bestPrefix: { name: string; matchLen: number } | null = null;

  for (const line of OPENING_BOOK_LINES) {
    const checkLen = Math.min(line.moves.length, playedNotations.length);
    let matched = true;
    for (let i = 0; i < checkLen; i++) {
      if (line.moves[i] !== playedNotations[i]) {
        matched = false;
        break;
      }
    }
    if (matched && checkLen >= 2) {
      if (playedNotations.length >= line.moves.length) {
        if (!bestCompleted || line.moves.length > bestCompleted.matchLen) {
          bestCompleted = { name: line.name, matchLen: line.moves.length };
        }
      } else {
        if (!bestPrefix || checkLen > bestPrefix.matchLen) {
          bestPrefix = { name: line.name, matchLen: checkLen };
        }
      }
    }
  }

  if (bestCompleted) return bestCompleted.name;
  if (bestPrefix && bestPrefix.matchLen >= 2) return bestPrefix.name;

  const first = openingOf(playedNotations[0]);
  return first && first.id !== "other" ? first.name : undefined;
}

