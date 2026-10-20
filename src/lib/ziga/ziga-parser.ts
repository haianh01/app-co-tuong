import { sq, type Move, ROWS, COLS } from "@/lib/xiangqi/engine";

export interface ZigaParsedMessage {
  raw: unknown;
  normalizedJson?: unknown;
  eventType: string;
  move?: Move;
  uciMove?: string;
  fen?: string;
  players?: {
    red?: { name?: string; points?: string };
    black?: { name?: string; points?: string };
  };
  clocks?: {
    redMs?: number;
    blackMs?: number;
  };
  result?: "red_win" | "black_win" | "draw" | null;
  summary: string;
}

/** Chuyển tọa độ UCI (ví dụ "b2b4", "h2e2", "a0a1") sang Move {from, to}. */
export function uciToMove(uci: string): Move | null {
  const m = uci.trim().toLowerCase().match(/^([a-i])([0-9])([a-i])([0-9])$/);
  if (!m) return null;
  const col1 = m[1].charCodeAt(0) - 97; // a=0..i=8
  const row1 = 9 - Number(m[2]); // Trong chuẩn UCI cờ tướng, rank 0 là đáy (Đỏ), rank 9 là đỉnh (Đen)
  const col2 = m[3].charCodeAt(0) - 97;
  const row2 = 9 - Number(m[4]);
  if (row1 < 0 || row1 >= ROWS || col1 < 0 || col1 >= COLS) return null;
  if (row2 < 0 || row2 >= ROWS || col2 < 0 || col2 >= COLS) return null;
  return { from: sq(row1, col1), to: sq(row2, col2) };
}

/** Chuyển chuỗi hoặc đối tượng thô thành JSON chuẩn nếu có thể (xử lý tiền tố Socket.io 42[...]). */
export function extractJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const str = raw.trim();
  // Socket.io packet dạng 42["event", {...}] hoặc 42{...}
  const matchSocketIo = str.match(/^\d+(\[[\s\S]*\]|\{[\s\S]*\})$/);
  if (matchSocketIo) {
    try {
      return JSON.parse(matchSocketIo[1]);
    } catch {}
  }
  if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
    try {
      return JSON.parse(str);
    } catch {}
  }
  return raw;
}

/** Trích xuất nước cờ từ các trường thông dụng. */
function extractMove(data: Record<string, unknown>): { move?: Move; uci?: string } {
  // 1. Nếu có move dạng chuỗi UCI hoặc "from-to"
  const rawMove = data.move ?? data.step ?? data.lastMove;
  if (typeof rawMove === "string") {
    const uci = uciToMove(rawMove);
    if (uci) return { move: uci, uci: rawMove };
    // Dạng "c3-c4" hoặc "77-47"
    const dashMatch = rawMove.match(/^(\d{1,2})[-:,](\d{1,2})$/);
    if (dashMatch) {
      const from = Number(dashMatch[1]);
      const to = Number(dashMatch[2]);
      if (from >= 0 && from < 90 && to >= 0 && to < 90) {
        return { move: { from, to } };
      }
    }
  }

  // 2. Nếu có trường from / to dạng số nguyên 0..89
  const fromNum = data.from ?? data.src ?? data.fromSq;
  const toNum = data.to ?? data.dst ?? data.destSq;
  if (typeof fromNum === "number" && typeof toNum === "number") {
    if (fromNum >= 0 && fromNum < 90 && toNum >= 0 && toNum < 90) {
      return { move: { from: fromNum, to: toNum } };
    }
  }

  // 3. Nếu có x1, y1, x2, y2 (hoặc col/row)
  const x1 = data.x1 ?? data.col1 ?? data.srcX;
  const y1 = data.y1 ?? data.row1 ?? data.srcY;
  const x2 = data.x2 ?? data.col2 ?? data.dstX;
  const y2 = data.y2 ?? data.row2 ?? data.dstY;
  if (typeof x1 === "number" && typeof y1 === "number" && typeof x2 === "number" && typeof y2 === "number") {
    if (x1 >= 0 && x1 < COLS && x2 >= 0 && x2 < COLS && y1 >= 0 && y1 < ROWS && y2 >= 0 && y2 < ROWS) {
      return { move: { from: sq(y1, x1), to: sq(y2, x2) } };
    }
  }

  return {};
}

/** Phân tích gói tin thô Ziga gửi về để bóc tách nước cờ, đồng hồ hoặc trạng thái bàn đấu. */
export function parseZigaPacket(raw: unknown): ZigaParsedMessage {
  const json = extractJson(raw);
  if (!json || typeof json !== "object") {
    return {
      raw,
      eventType: "raw_text",
      summary: typeof raw === "string" ? raw.slice(0, 100) : "Dữ liệu không phải JSON",
    };
  }

  // Trường hợp Socket.io dạng mảng: ["eventName", payload]
  if (Array.isArray(json)) {
    const eventName = typeof json[0] === "string" ? json[0] : "array_event";
    const payload = json[1] && typeof json[1] === "object" ? (json[1] as Record<string, unknown>) : {};
    const { move, uci } = extractMove(payload);
    return {
      raw,
      normalizedJson: json,
      eventType: eventName,
      move,
      uciMove: uci,
      summary: `Sự kiện Socket.IO [${eventName}]${move ? ` (Nước đi: ${move.from} → ${move.to})` : ""}`,
    };
  }

  const obj = json as Record<string, unknown>;
  const eventName = String(obj.event ?? obj.action ?? obj.type ?? obj.cmd ?? "message");
  const { move, uci } = extractMove(obj);

  // Trích xuất đồng hồ nếu có
  let clocks: { redMs?: number; blackMs?: number } | undefined;
  const redTime = obj.redTime ?? obj.timeRed ?? obj.red_time ?? (obj.clocks as Record<string, number> | undefined)?.red;
  const blackTime = obj.blackTime ?? obj.timeBlack ?? obj.black_time ?? (obj.clocks as Record<string, number> | undefined)?.black;
  if (typeof redTime === "number" || typeof blackTime === "number") {
    clocks = {
      redMs: typeof redTime === "number" ? (redTime > 10_000 ? redTime : redTime * 1000) : undefined,
      blackMs: typeof blackTime === "number" ? (blackTime > 10_000 ? blackTime : blackTime * 1000) : undefined,
    };
  }

  // Trích xuất người chơi nếu có
  let players: ZigaParsedMessage["players"];
  const redUser = obj.redUser ?? obj.playerRed ?? obj.red;
  const blackUser = obj.blackUser ?? obj.playerBlack ?? obj.black;
  if (redUser || blackUser) {
    players = {
      red: typeof redUser === "string" ? { name: redUser } : typeof redUser === "object" && redUser ? { name: String((redUser as any).name ?? (redUser as any).nick ?? "") } : undefined,
      black: typeof blackUser === "string" ? { name: blackUser } : typeof blackUser === "object" && blackUser ? { name: String((blackUser as any).name ?? (blackUser as any).nick ?? "") } : undefined,
    };
  }

  return {
    raw,
    normalizedJson: obj,
    eventType: eventName,
    move,
    uciMove: uci,
    fen: typeof obj.fen === "string" ? obj.fen : undefined,
    clocks,
    players,
    summary: `${eventName}${move ? ` (Nước: ${move.from} → ${move.to})` : ""}`,
  };
}
