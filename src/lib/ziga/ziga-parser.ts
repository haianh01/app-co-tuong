import { sq, type Board, type Move, type PieceType, type Side, ROWS, COLS } from "@/lib/xiangqi/engine";

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
  /** Quân đang được chọn trên Ziga và các ô Ziga chấm nước (đọc từ engine Cocos, chỉ phía người dẫn). */
  selection?: ZigaSelection;
  /** 0x2c: một ghế đổi trạng thái (sẵn sàng / chưa). Ghế là vị trí ngồi 0 | 1 của bàn Ziga. */
  playerStatus?: { seat: number; ready: boolean; code: number };
  /** 0x1a: ván bắt đầu; ghế đi trước cầm Đỏ. */
  gameStart?: { redSeat: number; blackSeat: number };
  /** 0x1d: sự kiện trong ván (chiếu, chiếu hết, hết giờ, đầu hàng...) của một ghế. */
  gameEvent?: { reason: ZigaGameEventReason; code: number; seat: number };
  /** 0x24: ván kết thúc; winnerSeat = null là hoà. */
  gameEnd?: { winnerSeat: number | null };
  /** 0x1c: giây còn lại (tổng) của bên vừa đi, theo đồng hồ server Ziga. */
  moverRemainingSec?: number;
  /** 0x05: đăng nhập xong — tên tài khoản của người dẫn. */
  login?: { userName: string };
  /** 0x1b (cả bàn, replace = true) / 0xc6 (người mới vào): danh sách người chơi. */
  roster?: { replace: boolean; list: ZigaPlayer[] };
  /** 0x27: một ghế rời bàn. */
  playerLeave?: { seat: number };
  /** 0xfd: elo mới của một ghế sau ván. */
  eloUpdate?: { seat: number; elo: number };
  /** 0x33: thể thức thời gian của bàn. */
  timeControl?: { totalSec: number; perMoveSec: number };
  /** 0x33 khi vào bàn giữa ván: toàn bộ thế cờ, lượt đi, giờ còn lại hai bên. */
  tableSnapshot?: ZigaTableSnapshot;
  summary: string;
}

export interface ZigaTableSnapshot {
  redSeat: number;
  blackSeat: number;
  board: Board;
  turn: Side;
  redRemainingSec: number;
  blackRemainingSec: number;
}

export interface ZigaPlayer {
  seat: number;
  name: string;
  elo: number;
}

export interface ZigaSelection {
  /** Ô quân đang chọn, null nếu bỏ chọn. */
  from: number | null;
  targets: number[];
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

/** Loại gói trong giao thức binary của Ziga (đối chiếu gamelogic.min.js?ver=139). */
export const ZIGA_MOVE_TYPE = 0x1c;
export const ZIGA_GAME_START_TYPE = 0x1a;
export const ZIGA_GAME_EVENT_TYPE = 0x1d;
export const ZIGA_GAME_END_TYPE = 0x24;
export const ZIGA_PLAYER_STATUS_TYPE = 0x2c;
/** Gói người dẫn gửi lên khi bấm "Sẵn sàng" (nội dung 01); server trả lại 0x2c cho đúng ghế của mình. */
export const ZIGA_READY_REQUEST_TYPE = 0x2b;

export const ZIGA_LOGIN_TYPE = 0x05;
export const ZIGA_TABLE_INFO_TYPE = 0x1b;
export const ZIGA_PLAYER_JOIN_TYPE = 0xc6;
export const ZIGA_PLAYER_LEAVE_TYPE = 0x27;
export const ZIGA_ELO_UPDATE_TYPE = 0xfd;
export const ZIGA_TABLE_SYNC_TYPE = 0x33;

/** Đọc tuần tự nội dung khung Ziga (số big-endian; chuỗi = u16 độ dài + UTF-8; byte có dấu như Int8Array). */
class ZigaReader {
  private offset = 0;
  private readonly view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get remaining() {
    return this.bytes.length - this.offset;
  }
  byte() {
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }
  int() {
    const v = this.view.getInt32(this.offset);
    this.offset += 4;
    return v;
  }
  str() {
    const n = this.view.getUint16(this.offset);
    this.offset += 2;
    if (n > this.remaining) throw new RangeError("chuỗi vượt quá khung");
    const v = new TextDecoder().decode(this.bytes.subarray(this.offset, this.offset + n));
    this.offset += n;
    return v;
  }
}

/**
 * Danh sách người chơi (Hs() trong code Ziga), mỗi người:
 * tên, ghế, trạng thái, tiền, avatar (chuỗi), level (= elo hiển thị), 3 cờ 1 byte.
 */
function readPlayers(r: ZigaReader): ZigaPlayer[] {
  const list: ZigaPlayer[] = [];
  while (r.remaining > 0) {
    const name = r.str();
    const seat = r.byte();
    r.byte(); // trạng thái
    r.int(); // tiền
    r.str(); // avatar
    const elo = r.int();
    r.byte();
    r.byte();
    r.byte();
    list.push({ seat, name, elo });
  }
  return list;
}

/** Loại quân theo chỉ số 0..15 của mỗi bên trong mảng quân của Ziga (0..15 Đỏ, 16..31 Đen cùng thứ tự). */
const ZIGA_PIECE_ORDER: PieceType[] = ["k", "a", "a", "b", "b", "r", "r", "c", "c", "n", "n", "p", "p", "p", "p", "p"];

/**
 * Phần thế cờ của 0x33 (rp() của bàn cờ tướng Ziga), chỉ có khi ván đang diễn ra:
 * [u8 ghế Đỏ][u8 ghế Đen][i32 ?][i32 giây Đỏ][i32 giây Đen][u8 lượt: 0 Đỏ / 1 Đen][32 × (u8 cột, u8 hàng, u8 đã bị ăn)].
 */
function readSnapshot(r: ZigaReader): ZigaTableSnapshot | null {
  if (r.remaining < 2 + 4 * 3 + 1 + 32 * 3) return null;
  const redSeat = r.byte();
  const blackSeat = r.byte();
  r.int();
  const redRemainingSec = r.int();
  const blackRemainingSec = r.int();
  const turn: Side = r.byte() === 1 ? "b" : "r";
  const board: Board = Array(ROWS * COLS).fill(null);
  for (let i = 0; i < 32; i++) {
    const col = r.byte();
    const row = r.byte();
    const captured = r.byte() === 1;
    if (captured) continue;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    const type = ZIGA_PIECE_ORDER[i % 16];
    board[sq(ROWS - 1 - row, col)] = i < 16 ? type.toUpperCase() : type;
  }
  return { redSeat, blackSeat, board, turn, redRemainingSec, blackRemainingSec };
}

/** PLAYER_STATE_READY trong code Ziga (2 = NOT_READY, 3 = FINISH_GAME). */
const ZIGA_PLAYER_READY = 1;

export type ZigaGameEventReason = "check" | "checkmate" | "timeout" | "resign" | "other";

const GAME_EVENT_REASONS: Record<number, ZigaGameEventReason> = { 2: "check", 3: "checkmate", 5: "timeout", 6: "resign" };
const GAME_EVENT_LABELS: Record<ZigaGameEventReason, string> = {
  check: "chiếu tướng",
  checkmate: "chiếu hết",
  timeout: "hết giờ",
  resign: "đầu hàng",
  other: "phạm luật",
};

/**
 * Giải mã một khung binary của Ziga (WebSocket binaryType=arraybuffer):
 * [u16 độ dài phần sau] [u8 loại gói] [i32 số thứ tự, -1 nếu không có] [nội dung].
 * Gói nước đi (0x1c): [u8 cột đi][u8 hàng đi][u8 cột đến][u8 hàng đến][i32 giây còn lại của bên vừa đi]?
 * Cột 0..8 tính từ trái (a..i), hàng 0..9 tính từ đáy phía Đỏ — giống UCI.
 * Trả null nếu dữ liệu không phải khung Ziga.
 */
export function parseZigaBinaryFrame(bytes: Uint8Array): ZigaParsedMessage | null {
  if (bytes.length < 7) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0) !== bytes.length - 2) return null;

  const type = bytes[2];
  const seq = view.getInt32(3);
  const body = bytes.subarray(7);
  const eventType = `ziga_0x${type.toString(16).padStart(2, "0")}`;
  const hex = Array.from(body.subarray(0, 24), (b) => b.toString(16).padStart(2, "0")).join(" ");
  const base: ZigaParsedMessage = {
    raw: hex,
    eventType,
    summary: `Gói ${eventType}${seq >= 0 ? ` #${seq}` : ""}${hex ? `: ${hex}` : ""}`,
  };

  try {
    if (type === ZIGA_LOGIN_TYPE && body.length >= 2) {
      const userName = new ZigaReader(body).str();
      if (userName) return { ...base, eventType: "login", login: { userName }, summary: `Đăng nhập: ${userName}` };
    }
    if (type === ZIGA_TABLE_INFO_TYPE || type === ZIGA_PLAYER_JOIN_TYPE) {
      const r = new ZigaReader(body);
      if (type === ZIGA_TABLE_INFO_TYPE) r.int(); // tiền cược của bàn
      const list = readPlayers(r);
      const replace = type === ZIGA_TABLE_INFO_TYPE;
      return {
        ...base,
        eventType: replace ? "table_info" : "player_join",
        roster: { replace, list },
        summary: `${replace ? "Thông tin bàn" : "Vào bàn"}: ${list.map((p) => `ghế ${p.seat} ${p.name} (${p.elo})`).join(", ")}`,
      };
    }
  } catch {
    return base;
  }
  if (type === ZIGA_PLAYER_LEAVE_TYPE && body.length >= 1) {
    const seat = body[0];
    return { ...base, eventType: "player_leave", playerLeave: { seat }, summary: `Ghế ${seat} rời bàn` };
  }
  if (type === ZIGA_ELO_UPDATE_TYPE && body.length >= 5) {
    const seat = body[0];
    const elo = view.getInt32(8);
    return { ...base, eventType: "elo_update", eloUpdate: { seat, elo }, summary: `Ghế ${seat}: elo ${elo}` };
  }
  if (type === ZIGA_TABLE_SYNC_TYPE && body.length >= 9) {
    const r = new ZigaReader(body);
    r.byte(); // trạng thái bàn
    const totalSec = r.int();
    const perMoveSec = r.int();
    if (totalSec <= 0 || perMoveSec <= 0) return base;
    let tableSnapshot: ZigaTableSnapshot | undefined;
    try {
      tableSnapshot = readSnapshot(r) ?? undefined;
    } catch {
      tableSnapshot = undefined;
    }
    return {
      ...base,
      eventType: "table_sync",
      timeControl: { totalSec, perMoveSec },
      tableSnapshot,
      summary: `Thể thức: ${totalSec / 60} phút, ${perMoveSec}s/nước${tableSnapshot ? " · đang giữa ván" : ""}`,
    };
  }
  if (type === ZIGA_PLAYER_STATUS_TYPE && body.length >= 2) {
    const [seat, code] = body;
    const ready = code === ZIGA_PLAYER_READY;
    return { ...base, eventType: "player_status", playerStatus: { seat, ready, code }, summary: `Ghế ${seat} ${ready ? "sẵn sàng" : "chưa sẵn sàng"}` };
  }
  if (type === ZIGA_READY_REQUEST_TYPE && body.length >= 1) {
    const ready = body[0] === 1;
    return { ...base, eventType: ready ? "ready_sent" : "unready_sent", summary: ready ? "Bấm sẵn sàng" : "Bỏ sẵn sàng" };
  }
  if (type === ZIGA_GAME_START_TYPE && body.length >= 2) {
    const [redSeat, blackSeat] = body;
    return { ...base, eventType: "game_start", gameStart: { redSeat, blackSeat }, summary: `Ván bắt đầu — ghế ${redSeat} cầm Đỏ` };
  }
  if (type === ZIGA_GAME_EVENT_TYPE && body.length >= 2) {
    const [code, seat] = body;
    const reason = GAME_EVENT_REASONS[code] ?? "other";
    return { ...base, eventType: "game_event", gameEvent: { reason, code, seat }, summary: `Ghế ${seat}: ${GAME_EVENT_LABELS[reason]}` };
  }
  if (type === ZIGA_GAME_END_TYPE && body.length >= 1) {
    // readByte của Ziga là số có dấu: -1 (0xff) = hoà
    const winner = view.getInt8(7);
    const winnerSeat = winner < 0 ? null : winner;
    return { ...base, eventType: "game_end", gameEnd: { winnerSeat }, summary: winnerSeat === null ? "Ván kết thúc — hoà" : `Ván kết thúc — ghế ${winnerSeat} thắng` };
  }

  if (type !== ZIGA_MOVE_TYPE || body.length < 4) return base;
  const [c1, r1, c2, r2] = body;
  if (c1 >= COLS || c2 >= COLS || r1 >= ROWS || r2 >= ROWS) return base;
  const uci = `${String.fromCharCode(97 + c1)}${r1}${String.fromCharCode(97 + c2)}${r2}`;
  const move = { from: sq(ROWS - 1 - r1, c1), to: sq(ROWS - 1 - r2, c2) };
  const moverSeconds = body.length >= 8 ? new DataView(body.buffer, body.byteOffset + 4, 4).getInt32(0) : undefined;
  return {
    ...base,
    eventType: "move",
    move,
    uciMove: uci,
    moverRemainingSec: moverSeconds,
    summary: `Nước đi ${uci}${moverSeconds !== undefined ? ` (bên vừa đi còn ${moverSeconds}s)` : ""}`,
  };
}

/** Toạ độ tuyệt đối {c: cột 0..8 từ trái, r: hàng 0..9 từ đáy phía Đỏ} → chỉ số ô. */
function absoluteToSquare(p: unknown): number | null {
  if (!p || typeof p !== "object") return null;
  const { c, r } = p as { c?: unknown; r?: unknown };
  if (!Number.isInteger(c) || !Number.isInteger(r)) return null;
  const col = c as number;
  const row = r as number;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return sq(ROWS - 1 - row, col);
}

/** Phân tích gói "ui" do script đọc từ bàn cờ Cocos của Ziga: { type: "select", from, targets }. */
export function parseZigaUiEvent(payload: unknown): ZigaParsedMessage {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (data.type !== "select") {
    return { raw: payload, eventType: "ui_unknown", summary: "Sự kiện giao diện không rõ" };
  }
  const from = absoluteToSquare(data.from);
  const targets =
    from === null || !Array.isArray(data.targets)
      ? []
      : data.targets.map(absoluteToSquare).filter((t): t is number => t !== null);
  return {
    raw: payload,
    eventType: "select",
    selection: { from, targets },
    summary: from === null ? "Bỏ chọn quân" : `Chọn quân ô ${from} (${targets.length} nước đi được)`,
  };
}
