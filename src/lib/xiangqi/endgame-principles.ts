// Nguyên lý tàn cuộc: chấm từng nước đi khi ván đã vào tàn cuộc (bảng endgame.ts chỉ nhận diện thế cờ lý thuyết).
//  - Đổi quân: về tàn cuộc thắng lý thuyết / giải hòa khi kém / đổi sai làm mất thắng
//  - Tốt: Tốt cao áp cung / Tốt già (xuống đáy mất sức) / Tốt đổi Sĩ Tượng
//  - Tướng và khống chế: Tướng trợ công (lộ mặt Tướng) / bó Tướng / đợi nước
//  - Phòng thủ: Sĩ Tượng liên hoàn khi kém quân
// Thuần hàm, tất định, không gọi engine. Nguyên lý cần điểm engine mà không có thì không kết luận.

import {
  type Board, type Move, type Piece, type Side,
  colOf, findKing, inCheck, legalMoves, legalMovesFrom, opponent, play, rowOf, sideOf, typeOf, PIECE_VALUES,
} from "./engine";
import { detectTheoreticalEndgame, type TheoreticalEndgame } from "./endgame";
import { exchangeGain } from "./explain";
import { soundMove, type ZhaoTacticsOptions } from "./middlegame";
import { moveNotation, PIECE_NAME } from "./notation";
import { countMajorPieces } from "./phases";
import { minorValues, screenCount } from "./piece-value";
import { advance, linkedGuards, palacePressure } from "./strategy";

export type EndgamePrinciple =
  | "doiVeTanCuocThang" // Đổi quân về tàn cuộc thắng lý thuyết
  | "giaiHoa"           // Đang kém, đổi quân về tàn cuộc hòa lý thuyết
  | "doiQuanMatThang"   // Đang thắng lại đổi về tàn cuộc hòa / thua lý thuyết
  | "totGia"            // Tốt xuống đáy thành Tốt già, mất sức
  | "totApCung"         // Tốt cao áp sát cung
  | "totDoiSi"          // Tốt đổi Sĩ / Tượng phá phòng tuyến
  | "tuongTroCong"      // Tướng ra lộ, dùng luật lộ mặt Tướng khóa cung đối phương
  | "boTuong"           // Khống chế đường đi của Tướng đối phương
  | "nuocCho"           // Đợi nước: nước chờ buộc đối phương tự đi
  | "giuSiTuong"        // Bên kém quân giữ Sĩ Tượng liên hoàn
  | "doiPhaoLayMa"      // Bàn thưa ngòi: đổi Pháo lấy Mã là có lời
  | "doiMaLayPhao";     // Bàn thưa ngòi: đổi Mã lấy Pháo là thiệt

export interface EndgamePrincipleFact {
  kind: "endgamePrinciple";
  side: Side;
  principle: EndgamePrinciple;
  move: string;
  summary: string;
  /** "critique" = nước vi phạm nguyên lý; mặc định là khen. */
  tone?: "critique";
  /** Tàn cuộc lý thuyết mà nước đi dẫn tới (nếu có). */
  endgame?: string;
}

/** Cùng dữ liệu engine như các nguyên lý trung cuộc: `pv` của thế sau nước đi, `loss`, `evalBefore`, `evalAfter`. */
export type EndgamePrincipleOptions = ZhaoTacticsOptions;

/** Ván đã vào tàn cuộc: cả bàn còn tối đa 5 quân lớn (cùng ranh giới với phases.ts) hoặc khớp tàn cuộc lý thuyết. */
export function isEndgame(board: Board): boolean {
  return countMajorPieces(board) <= 5 || detectTheoreticalEndgame(board) !== null;
}

const nameOf = (p: Piece) => PIECE_NAME[typeOf(p)] ?? "quân";
const fileNumber = (col: number, s: Side) => (s === "r" ? 9 - col : col + 1);
const bottomRow = (s: Side) => (s === "r" ? 0 : 9); // hàng đáy của đối phương, nhìn từ phe `s`

/** Chênh lệch vật chất theo góc nhìn `side`, Mã / Pháo tính theo số ngòi còn trên bàn (piece-value.ts). */
function materialBalance(board: Board, side: Side): number {
  const minors = minorValues(board); // đếm ngòi một lần cho cả bàn
  let bal = 0;
  for (const p of board) {
    if (!p || typeOf(p) === "k") continue;
    const t = typeOf(p);
    const v = t === "n" || t === "c" ? minors[t] : PIECE_VALUES[t];
    bal += sideOf(p) === side ? v : -v;
  }
  return bal;
}

type Outcome = "win" | "draw" | "loss";

/** Kết quả lý thuyết của thế cờ theo góc nhìn `side` (null khi không khớp tàn cuộc lý thuyết nào). */
function theoreticalOutcome(board: Board, side: Side): { outcome: Outcome; eg: TheoreticalEndgame } | null {
  const eg = detectTheoreticalEndgame(board);
  if (!eg || eg.outcome === "unclear") return null;
  if (eg.outcome === "draw") return { outcome: "draw", eg };
  return { outcome: eg.winner === side ? "win" : "loss", eg };
}

/** Thế cờ sau khi đổi quân xong: nếu PV bắt đầu bằng nước ăn lại ở ô vừa ăn thì đi nốt nước đó. */
function settledBoard(after: Board, move: Move, options?: EndgamePrincipleOptions): Board {
  const pv = options?.pv ?? [];
  const reply = pv[0]?.from === move.from && pv[0]?.to === move.to ? pv[1] : pv[0];
  if (reply && reply.to === move.to && after[reply.from] && sideOf(after[reply.from]!) !== sideOf(after[move.to]!)) {
    return play(after, reply);
  }
  return after;
}

/** Số nước đi hợp lệ của Tướng phe `s` (giả sử đến lượt phe đó). */
function kingMobility(board: Board, s: Side): number {
  const k = findKing(board, s);
  return k < 0 ? 0 : legalMovesFrom({ board, turn: s }, k).length;
}

/** Số ô trong cung của phe `target` mà Tướng phe kia khóa bằng luật lộ mặt Tướng (cùng cột, không quân chắn). */
function facedPalaceSquares(board: Board, target: Side): number {
  const own = findKing(board, opponent(target));
  if (own < 0) return 0;
  const col = colOf(own);
  const rows = target === "b" ? [0, 1, 2] : [7, 8, 9];
  let n = 0;
  for (const r of rows) {
    if (col < 3 || col > 5) continue;
    const lo = Math.min(r, rowOf(own));
    const hi = Math.max(r, rowOf(own));
    let blocked = false;
    for (let rr = lo + 1; rr < hi; rr++) if (board[rr * 9 + col]) blocked = true;
    const occupant = board[r * 9 + col];
    if (!blocked && (!occupant || typeOf(occupant) === "k")) n++;
  }
  return n;
}

function fact(
  before: Board, move: Move, principle: EndgamePrinciple, summary: string,
  extra?: { tone?: "critique"; endgame?: string },
): EndgamePrincipleFact {
  const f: EndgamePrincipleFact = {
    kind: "endgamePrinciple",
    side: sideOf(before[move.from]!),
    principle,
    move: moveNotation(before, move),
    summary,
  };
  if (extra?.tone) f.tone = extra.tone;
  if (extra?.endgame) f.endgame = extra.endgame;
  return f;
}

// ============================================================================
// 1-3. ĐỔI QUÂN TRONG TÀN CUỘC: thắng lý thuyết / giải hòa / đổi sai mất thắng
// ============================================================================

/** Nước đi (thường là đổi quân) dẫn tới tàn cuộc lý thuyết: khen khi về thắng hoặc giải hòa lúc kém, chê khi thắng thành hòa. */
export function detectEndgameTrade(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !before[move.to]) return null; // chỉ xét nước ăn quân (đổi quân); Tốt xuống đáy... có nguyên lý riêng
  const mover = sideOf(piece);
  const settled = settledBoard(after, move, options);
  const res = theoreticalOutcome(settled, mover);
  if (!res) return null;
  const prev = theoreticalOutcome(before, mover);
  if (prev?.outcome === res.outcome) return null; // không đổi kết quả lý thuyết: nước này không quyết định gì
  const { outcome, eg } = res;
  const score = options?.evalBefore?.score;

  if (outcome === "win" && soundMove(options)) {
    return fact(before, move, "doiVeTanCuocThang",
      `Đưa ván cờ về tàn cuộc thắng lý thuyết "${eg.name}": ${eg.description}`,
      { endgame: eg.name });
  }
  if (outcome !== "win" && score !== undefined && score >= 200 && options?.loss !== undefined && options.loss >= 100) {
    return fact(before, move, "doiQuanMatThang",
      `Đổi quân sai thời điểm: đang thắng thế lại đưa ván về "${eg.name}" — tàn cuộc ${outcome === "draw" ? "hòa" : "thua"} lý thuyết. Hơn quân phải giữ lại quân tấn công cần thiết rồi mới đổi.`,
      { tone: "critique", endgame: eg.name });
  }
  const behind = (score !== undefined && score <= -150) || materialBalance(before, mover) <= -200;
  if (outcome === "draw" && behind && soundMove(options)) {
    return fact(before, move, "giaiHoa",
      `Giải hòa: đang kém thế, chủ động đưa ván về "${eg.name}" — tàn cuộc hòa lý thuyết. ${eg.description}`,
      { endgame: eg.name });
  }
  return null;
}

/**
 * Đổi Mã / Pháo khi bàn đã thưa ngòi (ít Sĩ Tượng Tốt): Pháo thiếu ngòi yếu hẳn, Mã thì không cần ngòi.
 * Khen đổi Pháo lấy Mã; chê đổi Mã lấy Pháo khi engine chấm lỗi. Phải là đổi thật (PV có nước ăn lại).
 */
export function detectMinorTrade(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  const victim = before[move.to];
  if (!piece || !victim) return null;
  const pair = typeOf(piece) + typeOf(victim);
  if (pair !== "cn" && pair !== "nc") return null;
  const settled = settledBoard(after, move, options);
  if (settled === after) return null; // không bị ăn lại: là ăn quân, không phải đổi
  const { n, c } = minorValues(settled);
  if (n <= c) return null; // bàn còn đủ ngòi: Pháo không thiệt, không có nguyên lý để nói
  const screens = screenCount(settled);
  if (pair === "cn" && soundMove(options)) {
    return fact(before, move, "doiPhaoLayMa",
      `Đổi Pháo lấy Mã đúng lúc: bàn chỉ còn ${screens} quân làm ngòi, Pháo thiếu ngòi yếu hẳn trong khi Mã không cần ngòi — tàn cuộc thưa quân thì Mã mạnh hơn Pháo.`);
  }
  if (pair === "nc" && options?.loss !== undefined && options.loss >= 60) {
    return fact(before, move, "doiMaLayPhao",
      `Đổi Mã lấy Pháo khi bàn đã thưa ngòi (còn ${screens} quân làm ngòi): giữ lại Pháo thiếu ngòi, bỏ Mã linh hoạt — tàn cuộc kiểu này Mã đáng giá hơn Pháo.`,
      { tone: "critique" });
  }
  return null;
}

// ============================================================================
// 4-6. TỐT TRONG TÀN CUỘC
// ============================================================================

/** Tốt xuống hàng đáy đối phương mà không chiếu: thành Tốt già chỉ đi ngang, bị engine chấm lỗi hoặc làm thế thắng thành hòa. */
export function detectOldPawn(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p") return null;
  const mover = sideOf(piece);
  if (rowOf(move.to) !== bottomRow(mover) || rowOf(move.from) === bottomRow(mover)) return null;
  if (inCheck(after, opponent(mover))) return null; // Tốt xuống đáy chiếu / dứt điểm là chuyện khác
  const res = theoreticalOutcome(after, mover);
  const lostWin = res?.outcome === "draw" && (options?.evalBefore?.score ?? 0) >= 150;
  const faulty = options?.loss !== undefined && options.loss >= 60;
  if (!lostWin && !faulty) return null;
  return fact(before, move, "totGia",
    `Tốt xuống đáy thành Tốt già: từ nay chỉ đi ngang, không còn khống chế được đường lên của Tướng. Tàn cuộc Tốt cao mới là Tốt có sức${lostWin ? ` — ở đây thế thắng đã thành "${res!.eg.name}"` : ""}.`,
    { tone: "critique", endgame: lostWin ? res!.eg.name : undefined });
}

/** Tốt tiến hoặc bình vào hàng sát cung đối phương (chưa xuống đáy), an toàn, tăng sức ép lên cung. */
export function detectHighPawn(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p" || before[move.to] || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const a = advance(move.to, mover);
  if (a !== 7 && a !== 8) return null; // hàng cung tuyến / hàng giữa cung, chưa xuống đáy
  if (colOf(move.to) < 2 || colOf(move.to) > 6) return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;
  if (palacePressure(after, opp) <= palacePressure(before, opp)) return null;
  return fact(before, move, "totApCung",
    `Tốt cao áp cung: Tốt tiến sát cung nhưng chưa xuống đáy, khống chế đường đi của Tướng đối phương — trong tàn cuộc, Tốt cao là Tốt có sức nhất.`);
}

/** Tốt ăn Sĩ hoặc Tượng trong tàn cuộc: đổi Tốt lấy quân phòng thủ, cung đối phương mỏng đi. */
export function detectPawnForGuard(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  const victim = before[move.to];
  if (!piece || !victim || typeOf(piece) !== "p" || !soundMove(options)) return null;
  if (typeOf(victim) !== "a" && typeOf(victim) !== "b") return null;
  const recaptured = (exchangeGain(after, move.to, opponent(sideOf(piece))) ?? 0) > 0;
  return fact(before, move, "totDoiSi",
    `Tốt ${recaptured ? "đổi" : "ăn"} ${nameOf(victim)}: phá quân phòng thủ cung đối phương — trong tàn cuộc, một Tốt đổi một ${nameOf(victim)} thường là có lời vì quân tấn công còn lại dễ chiếu bí hơn.`);
}

// ============================================================================
// 7-9. TƯỚNG VÀ KHỐNG CHẾ
// ============================================================================

/** Tướng ra lộ, dùng luật lộ mặt Tướng khóa thêm ô trong cung đối phương và làm Tướng đối phương ít đường đi hơn. */
export function detectKingActivity(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "k" || before[move.to] || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover)) return null; // né chiếu không phải Tướng trợ công
  const lockedBefore = facedPalaceSquares(before, opp);
  const lockedAfter = facedPalaceSquares(after, opp);
  if (lockedAfter <= lockedBefore) return null;
  if (kingMobility(after, opp) >= kingMobility(before, opp)) return null;
  return fact(before, move, "tuongTroCong",
    `Tướng trợ công: Tướng ra lộ ${fileNumber(colOf(move.to), mover)}, dùng luật lộ mặt Tướng khóa ${lockedAfter} ô trong cung đối phương — trong tàn cuộc, Tướng cũng là một quân tấn công.`);
}

/** Quân (không phải Tướng) khóa đường đi của Tướng đối phương, chỉ còn tối đa 1 nước. */
export function detectKingBoxing(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) === "k" || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const mobBefore = kingMobility(before, opp);
  const mobAfter = kingMobility(after, opp);
  if (mobAfter > 1 || mobAfter >= mobBefore) return null;
  if (!legalMoves({ board: after, turn: opp }).length) return null; // chiếu bí / hết nước: đã là sát cục
  return fact(before, move, "boTuong",
    `Bó Tướng: ${nameOf(piece)} khống chế, Tướng đối phương chỉ còn ${mobAfter === 0 ? "đứng yên" : "1 đường đi"} — tàn cuộc thắng bắt đầu từ việc khóa Tướng.`);
}

/**
 * Đợi nước: bên đang thắng đi một nước chờ bằng Tướng / Sĩ / Tượng (không ăn, không chiếu),
 * engine xác nhận gần như tốt nhất, và đối phương còn rất ít nước để đi — buộc họ tự phá thế.
 */
export function detectWaitingMove(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"kab".includes(typeOf(piece)) || before[move.to]) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover) || inCheck(after, opp)) return null;
  if ((options?.evalBefore?.score ?? 0) < 150 || !soundMove(options, 20)) return null;
  const replies = legalMoves({ board: after, turn: opp }).length;
  if (replies === 0 || replies > 10) return null;
  return fact(before, move, "nuocCho",
    `Đợi nước: ${nameOf(piece)} đi một nước chờ, giữ nguyên thế khống chế — đối phương chỉ còn ${replies} nước và buộc phải tự đi, tự làm hỏng thế phòng thủ.`);
}

// ============================================================================
// 10. PHÒNG THỦ TÀN CUỘC
// ============================================================================

/** Bên kém quân đưa Sĩ / Tượng về thế liên hoàn (che nhau được) — nền tảng của thế thủ hòa. */
export function detectGuardFormation(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"ab".includes(typeOf(piece)) || before[move.to] || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const score = options?.evalBefore?.score;
  const behind = (score !== undefined && score <= -100) || materialBalance(before, mover) <= -200;
  if (!behind) return null;
  if (linkedGuards(after, mover) <= linkedGuards(before, mover)) return null;
  return fact(before, move, "giuSiTuong",
    `Phòng thủ tàn cuộc: ${nameOf(piece)} về vị trí liên hoàn, Sĩ Tượng che nhau — bên kém quân giữ vững Sĩ Tượng là còn cơ hội cầu hòa.`);
}

// ============================================================================
// TỔNG HỢP
// ============================================================================

type Detector = (before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions) => EndgamePrincipleFact | null;

const PRIORITY: Detector[] = [
  detectEndgameTrade,
  detectMinorTrade,
  detectOldPawn,
  detectPawnForGuard,
  detectKingBoxing,
  detectKingActivity,
  detectHighPawn,
  detectWaitingMove,
  detectGuardFormation,
];

/**
 * Nguyên lý tàn cuộc khớp với nước đi (tối đa 1, theo thứ tự ưu tiên). Chỉ xét khi thế trước hoặc sau nước đi đã là tàn cuộc.
 */
export function endgamePrincipleFacts(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact[] {
  if (!before[move.from] || (!isEndgame(before) && !isEndgame(after))) return [];
  for (const detect of PRIORITY) {
    const f = detect(before, move, after, options);
    if (f) return [f];
  }
  return [];
}
