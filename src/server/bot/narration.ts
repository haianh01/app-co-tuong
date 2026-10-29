const PIECE: Record<string, string> = {
  Tg: "Tướng",
  S: "Sĩ",
  T: "Tượng",
  M: "Mã",
  X: "Xe",
  P: "Pháo",
  B: "Tốt",
};

const DIR: Record<string, string> = {
  ".": "tiến",
  "-": "bình",
  "/": "thoái",
};

/** "P2-5" → "Pháo 2 bình 5", "Xt.3" → "Xe trước tiến 3". */
export function speakNotation(notation: string): string {
  const m = /^(Tg|S|T|M|X|P|B)([1-9ts])([.\-/])(\d)$/.exec(notation);
  if (!m) return notation;
  const [, piece, file, dir, to] = m;
  const fileText = file === "t" ? "trước" : file === "s" ? "sau" : file;
  return `${PIECE[piece] ?? piece} ${fileText} ${DIR[dir] ?? dir} ${to}`;
}

export function parseStageRoom(input: string): string | null {
  const text = input.trim();
  let room = text;
  try {
    room = new URL(text).searchParams.get("room") ?? "";
  } catch {
    // Không phải URL: coi như mã phòng trực tiếp.
  }
  return /^[A-Za-z0-9_-]{16,64}$/.test(room) ? room : null;
}
