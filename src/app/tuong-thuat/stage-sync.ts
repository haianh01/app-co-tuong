// Trạng thái trang sân khấu livestream (1080×1920), dựng từ trang điều khiển tường thuật và gửi qua /ws/stage.
// Người dẫn live cũng là người đang chơi (ô trái của trang cờ nguồn, phe ngồi dưới), nên sân khấu gọi hai bên là
// "Bạn" / "Đối thủ" chứ không phải Đỏ / Đen, và KHÔNG hiện đánh giá của engine: thấy điểm máy trong lúc đang đánh
// là được máy trợ giúp.

import type { BoardArrow, BoardHighlight } from "@/components/board/XiangqiBoard";
import { type Board, type Move, type PieceType, type Side, inCheck, outcome, sideOf, typeOf } from "@/lib/xiangqi/engine";
import { PIECE_NAME } from "@/lib/xiangqi/notation";
import { detectOpeningFromMoves } from "@/lib/xiangqi/openings";

export interface StagePlayer {
  name: string;
  /** Điểm/hạng như trang cờ nguồn hiển thị (zigavn: "1020"). */
  points?: string;
  /** Cấp, ví dụ "Tập Sự". */
  title?: string;
  /** Số sao của cấp (0–3). */
  stars?: number;
  /** Đường dẫn ảnh đại diện kì thủ (URL hoặc đường dẫn cục bộ). */
  avatarUrl?: string;
}

export interface StageRecord {
  win: number;
  draw: number;
  loss: number;
}

export interface StageGoal {
  label: string;
  current: number;
  target: number;
  reward?: string;
}

export interface StageVoiceLines {
  /** Câu khi bị chiếu (mặc định: "Người đâu Cứu trẫm") */
  check: string;
  /** Câu khi thắng (mặc định: "Bạn sắp đạt đến mục tiêu 2000 elo rồi") */
  win: string;
  /** Câu khi thua (mặc định: "Đừng buồn bạn chỉ thiếu chút may mắn thôi") */
  loss: string;
  /** Bật/tắt giọng nói */
  enabled: boolean;
}

export const DEFAULT_STAGE_VOICE_LINES: StageVoiceLines = {
  check: "Người đâu Cứu trẫm",
  win: "Bạn sắp đạt đến mục tiêu 2000 elo rồi",
  loss: "Đừng buồn bạn chỉ thiếu chút may mắn thôi",
  enabled: true,
};

/** Phần người dẫn tự nhập ở trang điều khiển (lưu lại giữa các lần mở trang). */
export interface StageSettings {
  me: StagePlayer;
  opponent: StagePlayer;
  /** Tên trên bảng tên dưới khung camera. */
  host: string;
  /** Trang cờ đang chơi, hiện ở thanh trên cùng. */
  site: string;
  round: number;
  today: StageRecord;
  goal: StageGoal | null;
  /** Lời mời trong thẻ luân phiên, ví dụ "Follow để xem ván tiếp theo". */
  cta: string;
  /** Thể thức thời gian của trang nguồn: tổng phút mỗi bên, giây tối đa cho một nước. */
  timeControl: { totalMin: number; perMoveSec: number };
  /** Câu nói phát âm thanh trên sân khấu khi có sự kiện */
  voiceLines: StageVoiceLines;
}

export interface StageReady {
  me: boolean;
  opponent: boolean;
}

export interface StageCapturedPieces {
  /** Quân Đỏ đã mất (bị Đen ăn), mạnh trước. */
  redLost: PieceType[];
  /** Quân Đen đã mất (bị Đỏ ăn). */
  blackLost: PieceType[];
}

export interface MaterialBalance {
  advantageSide: Side | null;
  text: string;
}

export type MomentType = "mate" | "check" | "bigCapture";

export interface BigMoment {
  id: string;
  type: MomentType;
  title: string;
  subtitle?: string;
  badge: string;
}

export interface StageCommentary {
  /** "Bạn" / "Đối thủ" (bên vừa đi). */
  who: string;
  notation: string;
  /** "Chiếu tướng!", "Ăn Xe!"… */
  note?: string;
  isCheck?: boolean;
  isCapture?: boolean;
}

export interface StageRecap {
  roundAndPly: string;
  openingName: string;
  materialText: string;
  recordText: string;
}

/**
 * Đồng hồ trang điều khiển tự tính theo nước đi (xem game-clock.ts), chụp lúc gửi `sentAt`. Sân khấu tự trừ thời gian
 * trôi từ `sentAt` cho bên đang chạy (điều khiển và OBS chạy cùng một máy nên chung đồng hồ hệ thống).
 */
export interface StageClocks {
  /** Tổng thời gian còn lại (ms). */
  me: number;
  opponent: number;
  running: "me" | "opponent" | null;
  /** Thời gian còn cho nước hiện tại của bên đang chạy (ms). */
  perMove: number | null;
  perMoveTotal: number;
  sentAt: number;
}

export interface StageState {
  board: Board;
  turn: Side;
  /** Số nửa nước đang xem. */
  ply: number;
  lastMove: Move | null;
  checkSquare: number | null;
  arrows: BoardArrow[];
  highlights: (number | BoardHighlight)[];
  /** Quân người dẫn đang chọn trên trang nguồn và các ô đi được (không có thì không vẽ). */
  selected?: number | null;
  targets?: number[];
  /** Trạng thái sẵn sàng trước ván (null: đang đánh hoặc không biết). */
  ready?: StageReady | null;
  /** Phe của người dẫn = phe ngồi dưới trên trang cờ nguồn. */
  mySide: Side;
  openingName?: string;
  settings: StageSettings;
  captured: StageCapturedPieces;
  materialBalance: MaterialBalance;
  commentary: StageCommentary | null;
  bigMoment: BigMoment | null;
  recap: StageRecap;
  clocks: StageClocks | null;
  /** Người dẫn đang bày biến thử: bàn cờ là biến thử, không phải ván thật (null/không có = ván thật). */
  trial?: StageTrial | null;
  timestamp: number;
}

export interface StageTrial {
  /** Các nước đã đi thử, tính từ thế cờ bắt đầu thử. */
  notations: string[];
}

export const DEFAULT_STAGE_SETTINGS: StageSettings = {
  me: { name: "W43604711", title: "Tập Sự", points: "894", stars: 0, avatarUrl: "/stage/avatar_red.jpg" },
  opponent: { name: "Đối thủ", title: "Tập Sự", points: "894", stars: 0, avatarUrl: "/stage/avatar_black.jpg" },
  host: "BLV",
  site: "zigavn.com",
  round: 1,
  today: { win: 0, draw: 0, loss: 0 },
  goal: null,
  cta: "Follow để xem ván tiếp theo",
  timeControl: { totalMin: 15, perMoveSec: 60 },
  voiceLines: DEFAULT_STAGE_VOICE_LINES,
};

const STANDARD_COUNTS: Record<PieceType, number> = { k: 1, r: 2, c: 2, n: 2, b: 2, a: 2, p: 5 };
const PIECE_ORDER: PieceType[] = ["r", "c", "n", "b", "a", "p"];
const PIECE_WEIGHTS: Record<PieceType, number> = { k: 0, r: 9, c: 4.5, n: 4, b: 2, a: 2, p: 1 };

function countPieces(board: Board): Record<Side, Record<PieceType, number>> {
  const zero = (): Record<PieceType, number> => ({ k: 0, r: 0, c: 0, n: 0, b: 0, a: 0, p: 0 });
  const out = { r: zero(), b: zero() };
  for (const p of board) if (p) out[sideOf(p)][typeOf(p)]++;
  return out;
}

/** Các quân đã bị ăn của mỗi bên, so với bộ quân đủ. */
export function computeCapturedPieces(board: Board): StageCapturedPieces {
  const n = countPieces(board);
  const lost = (s: Side) => PIECE_ORDER.flatMap((t) => Array<PieceType>(Math.max(0, STANDARD_COUNTS[t] - n[s][t])).fill(t));
  return { redLost: lost("r"), blackLost: lost("b") };
}

const sideName = (s: Side, mySide: Side) => (s === mySide ? "Bạn" : "Đối thủ");

/** Chênh lệch quân lực (đếm quân, không phải đánh giá thế cờ). */
export function computeMaterialBalance(board: Board, mySide: Side): MaterialBalance {
  const n = countPieces(board);
  const score = (s: Side) => PIECE_ORDER.reduce((sum, t) => sum + n[s][t] * PIECE_WEIGHTS[t], 0);
  const diff = score("r") - score("b");
  if (Math.abs(diff) < 0.5) return { advantageSide: null, text: "Hai bên ngang quân" };
  const adv: Side = diff > 0 ? "r" : "b";
  const other: Side = adv === "r" ? "b" : "r";
  const extra = PIECE_ORDER.map((t) => [t, n[adv][t] - n[other][t]] as const)
    .filter(([, d]) => d > 0)
    .map(([t, d]) => `${d} ${PIECE_NAME[t]}`);
  return { advantageSide: adv, text: `${sideName(adv, mySide)} hơn ${extra.length ? extra.join(", ") : "quân"}` };
}

/** Chiếu bí, chiếu tướng, ăn quân lớn: những lúc sân khấu bật hiệu ứng. */
export function detectBigMoment(params: {
  board: Board;
  turn: Side;
  lastMove: Move | null;
  capturedPiece?: string | null;
  mySide: Side;
  ply: number;
}): BigMoment | null {
  const { board, turn, lastMove, capturedPiece, mySide, ply } = params;
  if (!lastMove) return null;
  const mover: Side = turn === "r" ? "b" : "r";
  const who = sideName(mover, mySide);
  const id = (kind: string) => `${kind}-${ply}`;

  const over = outcome({ board, turn });
  if (over.over) {
    const mine = over.winner === mySide;
    return {
      id: id("mate"),
      type: "mate",
      title: over.winner ? (mine ? "BẠN THẮNG!" : "ĐỐI THỦ THẮNG") : "HÒA CỜ",
      subtitle: over.winner ? `${who} chiếu bí` : undefined,
      badge: "KẾT THÚC",
    };
  }
  if (inCheck(board, turn)) {
    return { id: id("check"), type: "check", title: "將軍", subtitle: undefined, badge: "將" };
  }
  if (capturedPiece) {
    const t = typeOf(capturedPiece);
    if (t === "r" || t === "c" || t === "n") {
      const name = PIECE_NAME[t].toUpperCase();
      return { id: id(`cap-${t}`), type: "bigCapture", title: `ĂN ${name}!`, subtitle: `${who} ăn ${PIECE_NAME[t]}`, badge: `ĂN ${name}` };
    }
  }
  return null;
}

/** Dòng chữ dưới bàn cờ cho nước vừa đi. */
export function generateCommentary(params: {
  board: Board;
  turn: Side;
  lastMove: Move | null;
  lastNotation?: string;
  capturedPiece?: string | null;
  mySide: Side;
}): StageCommentary | null {
  const { board, turn, lastMove, lastNotation, capturedPiece, mySide } = params;
  if (!lastMove || !lastNotation) return null;
  const who = sideName(turn === "r" ? "b" : "r", mySide);
  const isCheck = inCheck(board, turn);
  const note = isCheck ? "Chiếu tướng!" : capturedPiece ? `Ăn ${PIECE_NAME[typeOf(capturedPiece)]}!` : undefined;
  return { who, notation: lastNotation, note, isCheck, isCapture: !!capturedPiece };
}

/** Thẻ tóm tắt cho người xem vừa vào phòng live. */
export function generateRecap(params: {
  settings: StageSettings;
  ply: number;
  openingName?: string;
  materialBalance: MaterialBalance;
}): StageRecap {
  const { settings, ply, openingName, materialBalance } = params;
  const { win, draw, loss } = settings.today;
  return {
    roundAndPly: `Ván ${settings.round} · Nước ${Math.ceil(ply / 2)}`,
    openingName: openingName ?? "Chưa rõ",
    materialText: materialBalance.text,
    recordText: `${win} thắng · ${draw} hòa · ${loss} thua`,
  };
}

/** Dựng trạng thái sân khấu từ ván đang theo dõi trên trang điều khiển. */
export function buildStageState(params: {
  board: Board;
  turn: Side;
  ply: number;
  lastMove: Move | null;
  checkSquare: number | null;
  /** Ký hiệu các nước đã đi tới `ply`. */
  notations: string[];
  arrows: BoardArrow[];
  highlights: (number | BoardHighlight)[];
  selected?: number | null;
  targets?: number[];
  ready?: StageReady | null;
  mySide: Side;
  settings: StageSettings;
  capturedPiece?: string | null;
  clocks?: StageClocks | null;
  /** Có thì `board`/`lastMove`/`checkSquare` là của biến thử; `turn`, `ply`, `notations` vẫn của ván thật. */
  trial?: StageTrial | null;
}): StageState {
  const { board, turn, ply, lastMove, mySide, settings, capturedPiece } = params;
  const trial = params.trial ?? null;
  const notations = params.notations ?? [];
  const openingName = detectOpeningFromMoves(notations.slice(0, ply));
  const materialBalance = computeMaterialBalance(board, mySide);
  return {
    board,
    turn,
    ply,
    lastMove,
    checkSquare: params.checkSquare ?? null,
    arrows: params.arrows ?? [],
    highlights: params.highlights ?? [],
    selected: params.selected ?? null,
    targets: params.targets ?? [],
    ready: params.ready ?? null,
    mySide,
    openingName,
    settings,
    captured: computeCapturedPieces(board),
    materialBalance,
    // Biến thử không phải nước thật: không bình luận, không bật khoảnh khắc chiếu/thắng.
    commentary: trial ? null : generateCommentary({ board, turn, lastMove, lastNotation: notations[ply - 1], capturedPiece, mySide }),
    bigMoment: trial ? null : detectBigMoment({ board, turn, lastMove, capturedPiece, mySide, ply }),
    recap: generateRecap({ settings, ply, openingName, materialBalance }),
    clocks: params.clocks ?? null,
    trial,
    timestamp: Date.now(),
  };
}

/** Kết quả đọc ô người chơi trên trang nguồn (xem hooks/usePanelReader). */
export interface PanelInfo {
  name: string | null;
  points: string | null;
  stars: number | null;
}

/**
 * Gộp những gì đọc được từ màn hình vào thông tin người chơi. Đối thủ đổi nick là người mới: bỏ điểm/cấp cũ. Không
 * có gì đổi thì trả lại đúng object cũ (khỏi gửi lại sân khấu).
 */
export function mergePanelReading(settings: StageSettings, me: PanelInfo, opponent: PanelInfo): StageSettings {
  const merge = (p: StagePlayer, r: PanelInfo, fresh: boolean): StagePlayer => {
    const base: StagePlayer = fresh ? { name: r.name! } : p;
    const next: StagePlayer = {
      ...base,
      ...(r.points ? { points: r.points } : {}),
      ...(r.stars !== null ? { stars: r.stars } : {}),
      ...(r.name && !fresh ? { name: r.name } : {}),
    };
    const same = (Object.keys({ ...p, ...next }) as (keyof StagePlayer)[]).every((k) => p[k] === next[k]);
    return same ? p : next;
  };
  const nextMe = merge(settings.me, me, false);
  const nextOpp = merge(settings.opponent, opponent, !!opponent.name && opponent.name !== settings.opponent.name);
  return nextMe === settings.me && nextOpp === settings.opponent ? settings : { ...settings, me: nextMe, opponent: nextOpp };
}

/** Giờ hiển thị lúc `now` từ ảnh chụp đồng hồ `clocks` (bên đang chạy bị trừ thời gian trôi từ lúc chụp). */
export function liveClocks(clocks: StageClocks, now: number): { me: number; opponent: number; perMove: number | null } {
  const elapsed = Math.max(0, now - clocks.sentAt);
  const run = (side: "me" | "opponent") => Math.max(0, clocks[side] - (clocks.running === side ? elapsed : 0));
  return {
    me: run("me"),
    opponent: run("opponent"),
    perMove: clocks.perMove === null ? null : Math.max(0, clocks.perMove - elapsed),
  };
}
