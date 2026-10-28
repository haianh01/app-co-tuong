// Trạng thái trang sân khấu livestream (1080×1920), dựng từ trang điều khiển tường thuật và gửi qua /ws/stage.
// Người dẫn live cũng là người đang chơi (ô trái của trang cờ nguồn, phe ngồi dưới), nên sân khấu gọi hai bên là
// "Bạn" / "Đối thủ" chứ không phải Đỏ / Đen, và KHÔNG hiện đánh giá của engine: thấy điểm máy trong lúc đang đánh
// là được máy trợ giúp.

import type { BoardArrow, BoardHighlight } from "@/components/board/XiangqiBoard";
import { type Board, type Move, type PieceType, type Side, inCheck, outcome, sideOf, typeOf } from "@/lib/xiangqi/engine";
import { PIECE_NAME } from "@/lib/xiangqi/notation";
import { detectOpeningFromMoves } from "@/lib/xiangqi/openings";
import type { StagePuzzlePhase, StagePuzzleState } from "./stage-puzzle";

export type { StagePuzzlePhase, StagePuzzleState };

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
  /** Tên kênh, hiện làm tiêu đề lớn trên cùng sân khấu; để trống thì dùng tên kì thủ của bạn (`me.name`). */
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


export interface StageReviewTurningPoint {
  index: number;
  ply: number;
  notation: string;
  side: Side;
  cls: string | null;
  winDrop: number;
  description: string;
}


/**
 * Quy tắc an toàn chống gian lận (Anti-cheat):
 * - Chỉ cho phép chiếu phân tích khi:
 *   1) Ván đấu ĐÃ KẾT THÚC (gameOver === true), cho phép streamer chiếu lại và bình luận ván vừa đánh.
 *   2) Hoặc khi CHƯA BẮT ĐẦU ván (plies === 0), cho phép chiếu ván cũ bất kỳ trước giờ thi đấu.
 * - Tuyệt đối CHẶN khi ván đang diễn ra (gameOver === false && plies > 0), kể cả khi streamer
 *   đang lùi xem lại nước cũ.
 */
export function canReview(gameOver: boolean, plies: number): boolean {
  if (plies === 0) return true;
  return gameOver;
}

export interface StageReviewState {
  gameId: string;
  round: number | null;
  ply: number;
  totalPlies: number;
  board: Board;
  /** Bên đến lượt ở thế đang chiếu (bản cũ không gửi). */
  turn?: Side;
  lastMove: Move | null;
  evalScore: number | null;
  bestMove?: Move | null;
  bestNotation?: string | null;
  arrows?: BoardArrow[];
  turningPoint?: StageReviewTurningPoint | null;
  commentary?: string | null;
}

/** Định dạng điểm đánh giá thế cờ (centipawns) sang văn bản tiếng Việt dễ hiểu trên livestream. */
export function formatEvalScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "";
  const pts = (Math.abs(score) / 100).toFixed(1);
  if (Math.abs(score) < 30) return "⚖ Cân bằng (0.0)";
  if (score > 600) return `🔴 Đỏ thắng thế (+${pts})`;
  if (score > 0) return `🔴 Đỏ ưu (+${pts})`;
  if (score < -600) return `⚫ Đen thắng thế (-${pts})`;
  return `⚫ Đen ưu (-${pts})`;
}


export interface StageZhaoLesson {
  lesson: number;
  title: string;
  kind: "middlegame" | "endgame";
  quote?: string;
  videoUrl?: string;
}

export interface StageMoveItem {
  ply: number;
  notation: string;
  side: Side;
  from?: number;
  to?: number;
  commentary?: string | null;
  evalCp?: number | null;
  tag?: "brilliant" | "good" | "inaccuracy" | "mistake" | "blunder" | null;
  zhaoLesson?: StageZhaoLesson | null;
}

export interface StageCommentaryDetail {
  ply: number;
  notation: string;
  side: Side;
  summary: string;
  assessment?: string;
  intent?: string;
  betterMove?: string;
  zhaoLesson?: StageZhaoLesson | null;
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
  /** Trạng thái chiếu phân tích / xem lại ván trên màn sân khấu (null: ván trực tiếp). */
  review?: StageReviewState | null;
  /** Trạng thái chiếu cờ thế lên sân khấu (null: không chiếu cờ thế). Loại trừ với review. */
  puzzle?: StagePuzzleState | null;
  /** Tình trạng lưu ván trên trang điều khiển, để nút "Lưu ván" trên sân khấu báo đã lưu hay chưa. */
  archive?: StageArchiveView | null;
  moves: StageMoveItem[];
  activeCommentary?: StageCommentaryDetail | null;
  timestamp: number;
}

export interface StageArchiveView {
  /** Mã ván đang ghi ("" khi chưa lưu lần nào). */
  gameId: string;
  status: "idle" | "saving" | "saved" | "error";
  /** Ván số mấy vừa lưu xong; khác `settings.round` nghĩa là ván đang đánh chưa lưu. */
  savedRound: number | null;
  error: string | null;
}

export interface StageTrial {
  /** Các nước đã đi thử, tính từ thế cờ bắt đầu thử. */
  notations: string[];
}

export const DEFAULT_STAGE_SETTINGS: StageSettings = {
  me: { name: "W43604711", title: "Tập Sự", points: "894", stars: 0, avatarUrl: "/stage/avatar_red.jpg" },
  opponent: { name: "Đối thủ", title: "Tập Sự", points: "894", stars: 0, avatarUrl: "/stage/avatar_black.jpg" },
  host: "",
  site: "zigavn.com",
  round: 1,
  today: { win: 0, draw: 0, loss: 0 },
  goal: null,
  cta: "Anh IT đang build app cờ riêng · Anh em có ý tưởng gì cứ comment để mình sửa nhé! · Follow ủng hộ kênh",
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


/** Lời bình chi tiết thế trận và ý đồ nước đi cho trận cờ sân khấu. */
export function generateCommentaryDetail(params: {
  board: Board;
  turn: Side;
  ply: number;
  lastMove: Move | null;
  lastNotation?: string;
  capturedPiece?: string | null;
  mySide: Side;
  review?: StageReviewState | null;
  openingName?: string;
}): StageCommentaryDetail | null {
  const { board, turn, ply, lastMove, lastNotation, capturedPiece, mySide, review, openingName } = params;
  if (ply <= 0 || !lastNotation) return null;
  const mover: Side = turn === "r" ? "b" : "r";
  const who = sideName(mover, mySide);
  const isCheck = inCheck(board, turn);

  let summary = `${who} đi ${lastNotation}`;
  if (isCheck) summary += " · Chiếu tướng!";
  else if (capturedPiece) summary += ` · Ăn ${PIECE_NAME[typeOf(capturedPiece)]}!`;

  let assessment: string | undefined;
  if (review?.evalScore !== undefined && review?.evalScore !== null) {
    assessment = formatEvalScore(review.evalScore);
  }

  let betterMove: string | undefined;
  if (review?.bestNotation) {
    betterMove = review.bestNotation;
  }

  let intent: string | undefined;
  if (review?.turningPoint) {
    intent = `Bước ngoặt #${review.turningPoint.index + 1}: ${review.turningPoint.description}`;
  } else if (ply <= 6 && openingName) {
    intent = `Triển khai thế trận khai cuộc ${openingName}`;
  } else if (isCheck) {
    intent = "Công kích tướng đối phương, đoạt tiên cơ";
  } else if (capturedPiece) {
    intent = `Ăn quân ${PIECE_NAME[typeOf(capturedPiece)]}, tích lũy ưu thế quân lực`;
  }

  return {
    ply,
    notation: lastNotation,
    side: mover,
    summary,
    assessment,
    intent,
    betterMove,
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
  /** Chiếu phân tích ván cũ lên sân khấu. */
  review?: StageReviewState | null;
  /** Chiếu cờ thế lên sân khấu. Loại trừ với review. */
  puzzle?: StagePuzzleState | null;
  archive?: StageArchiveView | null;
  /** Danh sách toàn bộ nước đi của ván cờ (nếu không có sẽ tự dựng từ `notations`). */
  moves?: StageMoveItem[];
  activeCommentary?: StageCommentaryDetail | null;
}): StageState {
  const { board, turn, ply, lastMove, mySide, settings, capturedPiece } = params;
  const puzzle = params.puzzle ?? null;
  // Cờ thế chiếm cả sân khấu: bật cờ thế thì tắt review và biến thử (không thì sân khấu phủ lớp mờ "biến thử" lên bàn cờ thế).
  const review = puzzle ? null : (params.review ?? null);
  const trial = puzzle ? null : (params.trial ?? null);
  const notations = params.notations ?? [];
  const openingName = detectOpeningFromMoves(notations.slice(0, ply));
  const materialBalance = computeMaterialBalance(board, mySide);
  const moves: StageMoveItem[] = params.moves ?? notations.map((notation, idx) => {
    const movePly = idx + 1;
    const moveSide: Side = movePly % 2 === 1 ? "r" : "b";
    return {
      ply: movePly,
      notation,
      side: moveSide,
    };
  });
  const activeCommentary: StageCommentaryDetail | null = params.activeCommentary ?? generateCommentaryDetail({
    board,
    turn,
    ply,
    lastMove,
    lastNotation: notations[ply - 1],
    capturedPiece,
    mySide,
    review,
    openingName,
  });
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
    review,
    puzzle,
    archive: params.archive ?? null,
    moves,
    activeCommentary,
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

export type ZigaRankTier = "tapsu" | "phongtrao" | "kythu" | "kysi" | "kyvuong";

export interface ZigaRankInfo {
  tier: ZigaRankTier;
  title: string;
  stars: number;
  avatarUrl: string;
}

/**
 * Tự động xác định cấp bậc, danh hiệu, số sao và ảnh đại diện tương ứng theo mức điểm Elo Ziga.
 * - < 1200: Tập sự (1-3 sao)
 * - 1200-1599: Phong trào (1-3 sao)
 * - 1600-1999: Kỳ thủ (1-3 sao)
 * - 2000-2399: Kỳ sĩ (1-3 sao)
 * - >= 2400: Kỳ vương (1-3 sao)
 */
export function zigaEloRank(
  points?: string | number | null,
  currentTitle?: string | null,
  currentStars?: number | null,
  fallbackSide: "r" | "b" = "r"
): ZigaRankInfo {
  const p = typeof points === "string" ? parseInt(points.replace(/\D/g, ""), 10) : typeof points === "number" ? points : NaN;
  const normTitle = (currentTitle || "").trim().toLowerCase();

  // 1. Phân cấp theo điểm Elo cụ thể nếu có
  if (!isNaN(p) && p > 0) {
    if (p < 1200) {
      const stars = currentStars ?? (p < 950 ? 1 : p < 1080 ? 2 : 3);
      return { tier: "tapsu", title: currentTitle || "Tập sự", stars, avatarUrl: "/stage/avatar_tapsu.jpg" };
    }
    if (p < 1600) {
      const stars = currentStars ?? (p < 1330 ? 1 : p < 1470 ? 2 : 3);
      return { tier: "phongtrao", title: currentTitle || "Phong trào", stars, avatarUrl: "/stage/avatar_phongtrao.jpg" };
    }
    if (p < 2000) {
      const stars = currentStars ?? (p < 1730 ? 1 : p < 1870 ? 2 : 3);
      return { tier: "kythu", title: currentTitle || "Kỳ thủ", stars, avatarUrl: "/stage/avatar_black.jpg" };
    }
    if (p < 2400) {
      const stars = currentStars ?? (p < 2130 ? 1 : p < 2270 ? 2 : 3);
      return { tier: "kysi", title: currentTitle || "Kỳ sĩ", stars, avatarUrl: "/stage/avatar_red.jpg" };
    }
    const stars = currentStars ?? (p < 2550 ? 1 : p < 2700 ? 2 : 3);
    return { tier: "kyvuong", title: currentTitle || "Kỳ vương", stars, avatarUrl: "/stage/avatar_kyvuong.jpg" };
  }

  // 2. Nếu không có điểm Elo số, xét theo chữ trong title
  if (normTitle.includes("tập sự") || normTitle.includes("tập")) {
    return { tier: "tapsu", title: currentTitle || "Tập sự", stars: currentStars ?? 1, avatarUrl: "/stage/avatar_tapsu.jpg" };
  }
  if (normTitle.includes("phong trào") || normTitle.includes("phong")) {
    return { tier: "phongtrao", title: currentTitle || "Phong trào", stars: currentStars ?? 2, avatarUrl: "/stage/avatar_phongtrao.jpg" };
  }
  if (normTitle.includes("vương") || normTitle.includes("đại sư") || normTitle.includes("kiện tướng")) {
    return { tier: "kyvuong", title: currentTitle || "Kỳ vương", stars: currentStars ?? 3, avatarUrl: "/stage/avatar_kyvuong.jpg" };
  }
  if (normTitle.includes("sĩ") || normTitle.includes("sỹ")) {
    return { tier: "kysi", title: currentTitle || "Kỳ sĩ", stars: currentStars ?? 1, avatarUrl: "/stage/avatar_red.jpg" };
  }
  if (normTitle.includes("thủ") || normTitle.includes("đối")) {
    return { tier: "kythu", title: currentTitle || "Kỳ thủ", stars: currentStars ?? 3, avatarUrl: "/stage/avatar_black.jpg" };
  }

  // 3. Fallback: Đỏ mặc định Kỳ sĩ (Lưu Bị), Đen mặc định Kỳ thủ (Quan Vũ)
  if (fallbackSide === "r") {
    return { tier: "kysi", title: currentTitle || "Kỳ sĩ", stars: currentStars ?? 1, avatarUrl: "/stage/avatar_red.jpg" };
  }
  return { tier: "kythu", title: currentTitle || "Kỳ thủ", stars: currentStars ?? 3, avatarUrl: "/stage/avatar_black.jpg" };
}
