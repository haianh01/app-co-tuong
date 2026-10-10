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
