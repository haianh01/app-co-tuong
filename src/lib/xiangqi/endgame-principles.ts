// Nguyên lý tàn cuộc: chấm từng nước đi khi ván đã vào tàn cuộc (bảng endgame.ts chỉ nhận diện thế cờ lý thuyết).
//  - Đổi quân: về tàn cuộc thắng lý thuyết / giải hòa khi kém / đổi sai làm mất thắng
//  - Tốt: Tốt cao áp cung / Tốt già (xuống đáy mất sức) / Tốt đổi Sĩ Tượng
//  - Tướng và khống chế: Tướng trợ công (lộ mặt Tướng) / bó Tướng / đợi nước
//  - Phòng thủ: Sĩ Tượng liên hoàn khi kém quân
//  - 48 bài kỳ lý tàn cuộc Triệu Hâm Hâm (zhao48-endgame-lessons.ts), chia ba loại:
//    · bài gắn theo nước: chỉ gắn khi biến engine (PV) cho thấy đúng điều bài giảng nói — ăn Tốt mà giữ được,
//      phá Sĩ Tượng mà có lời, vây quân mà bắt được, công sát mà chiếu bí được... Lời bình kể lại chuỗi nước trong biến.
//      Nguyên lý gốc nào trùng ý một bài (vd. đợi nước — bài 24) thì gắn thẻ bài đó.
//    · bài về một loại tàn cuộc (Mã Pháo đối Mã Pháo, một Xe đối ba quân...): ghi chú một lần khi ván bước vào thế đó.
//    · bài tổng quát và cờ thế (Tại sao học tàn cuộc, Bản chất tàn cuộc, Tứ đại danh cục...): không gắn vào nước nào.
// Thuần hàm, tất định, không gọi engine. Nguyên lý cần điểm hoặc biến engine mà không có thì không kết luận.

import {
  type Board, type Move, type Piece, type PieceType, type Side,
  attackersOf, colOf, findKing, inCheck, isLegal, legalMoves, legalMovesFrom, opponent, play, pseudoMoves,
  rowOf, sideOf, typeOf, crossedRiver, PIECE_VALUES,
} from "./engine";
import { detectTheoreticalEndgame, type TheoreticalEndgame } from "./endgame";
import { exchangeGain } from "./explain";
import { soundMove, type ZhaoTacticsOptions } from "./middlegame";
import { engineLine, mateEnd, mateText, moverCaptureAt, narrate, pieceRole, pvAfterMove, tally } from "./engine-line";
import { moveNotation, PIECE_NAME, SIDE_NAME } from "./notation";
import { countMajorPieces } from "./phases";
import { minorValues, screenCount } from "./piece-value";
import { advance, linkedGuards, palacePressure } from "./strategy";
import { ZHAO_ENDGAME_LESSONS, type ZhaoEndgameLessonCard } from "./zhao48-endgame-lessons";

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
  | "doiMaLayPhao"      // Bàn thưa ngòi: đổi Mã lấy Pháo là thiệt
  // Kỳ lý tàn cuộc Triệu Hâm Hâm gắn theo nước — biến engine phải xác nhận
  | "binhTanSiTuong"      // Bài 4: Tốt ăn Sĩ / Tượng của bên đã khuyết Sĩ Tượng
  | "muuBinhCoXe"         // Bài 5: Xe ăn Tốt (chưa qua sông) và giữ được
  | "muuBinhKhongXe"      // Bài 6: Mã / Pháo ăn Tốt khi bàn không còn Xe
  | "phaSiTuongCoXe"      // Bài 7: phá Sĩ Tượng có lời, bên đi còn Xe
  | "phaSiTuongKhongXe"   // Bài 8: phá Sĩ Tượng có lời, bên đi không có Xe
  | "nguyenTacChiemTrung" // Bài 9: chiếm trung lộ, đẩy Tướng đối phương ra lộ sườn
  | "loSuonApDay"         // Bài 10: khống chế tuyến áp đáy, giam Tướng ở hàng đáy
  | "maHoatChienThang"    // Bài 11: Mã nhảy vào điểm huyệt / ngọa tào và góp sức sát hoặc bắt quân
  | "siTuongPhongAn"      // Bài 15: Sĩ / Tượng chặn chân Mã, Mã mất nước chiếu / ăn quân
  | "laoBinhKhongChet"    // Bài 17: Tốt đáy vẫn khóa cung, góp sức chiếu bí
  | "khuyetSiKyGi"        // Bài 18: đánh vào bên khuyết Sĩ bằng Xe / Pháo / Tốt
  | "khuyetTuongKyPhao"   // Bài 19: Pháo đánh vào bên khuyết Tượng
  | "coTanPhaoHoan"       // Bài 20: Pháo lui về nhà, mượn Sĩ Tượng làm ngòi
  | "donTotKhongCheTuyen" // Bài 21: Xe ăn Tốt quá hà / chặn Tốt qua sông
  | "chienThuatKiemChe"   // Bài 23: ghim chặt quân lớn đối phương
  | "chienThuatVayKhon"   // Bài 25: cắt hết đường chạy của quân lớn rồi bắt
  | "kyThuatDonToa"       // Bài 26: chiếu trung gian ép đối phương lệch vị rồi bắt quân
  | "kyThuatDanhChan"     // Bài 27: chắn đường Xe / Pháo đối phương
  | "chienThuatSamSet"    // Bài 29: sát nhanh, không so đo binh lực
  | "xePhaoHopCong"       // Bài 30: Xe Pháo cùng chiếu dẫn tới sát
  | "xeMaLanhChieu"       // Bài 31: Xe Mã cùng chiếu dẫn tới sát
  | "xeChotPhaSiTuong"    // Bài 32: Xe Tốt phá Sĩ Tượng
  | "haiDeLaoNguyet"      // Bài 40: Pháo xuống đáy luồn sau Tướng trong tàn cuộc Xe Pháo
  // Ghi chú loại tàn cuộc (một lần, khi ván bước vào thế đó)
  | "diemToiHanBinhLuc"       // Bài 3: một quân mạnh hai Tốt đối Sĩ Tượng toàn
  | "binhChungHuuLoi"         // Bài 13: Mã Pháo đối Song Pháo / Song Mã
  | "maThangPhao"             // Bài 22: Mã đối Pháo
  | "songMaSongPhao"          // Bài 33: Song Mã Song Pháo hai bên, không Xe
  | "songMaPhaoDoiMaSongPhao" // Bài 34
  | "maPhaoDoiMaPhao"         // Bài 35
  | "songPhaoDoiSongMa"       // Bài 36
  | "maTotDoiPhaoTot"         // Bài 37
  | "tamAnhChienLuBo"         // Bài 38: một Xe đối ba quân
  | "maTotDayThangDonSiTuong" // Bài 39
  | "canKhonDaiNaDi"          // Bài 41: Xe Pháo đối Xe Song Tượng
  | "xeMaDoiXeSongTuong";     // Bài 42

export interface EndgamePrincipleFact {
  kind: "endgamePrinciple";
  side: Side;
  principle: EndgamePrinciple;
  move: string;
  summary: string;
  /** "critique" = nước vi phạm nguyên lý; "note" = ghi chú loại tàn cuộc, không khen chê nước đi; mặc định là khen. */
  tone?: "critique" | "note";
  /** Tàn cuộc lý thuyết mà nước đi dẫn tới (nếu có). */
  endgame?: string;
  lesson?: number;
  lessonTitle?: string;
  quote?: { text: string; at: string };
  videoUrl?: string;
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
const secondRow = (s: Side) => (s === "r" ? 1 : 8); // hàng thứ hai từ đáy đối phương (tuyến áp đáy, hàng ngọa tào)

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
  const reply = pvAfterMove(options, move)[0];
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

interface Material { r: number; n: number; c: number; p: number; a: number; b: number; crossed: number }

/** Số quân từng loại của phe `side` (không tính Tướng), kèm số Tốt đã qua sông. */
function material(board: Board, side: Side): Material {
  const m: Material = { r: 0, n: 0, c: 0, p: 0, a: 0, b: 0, crossed: 0 };
  for (let i = 0; i < 90; i++) {
    const q = board[i];
    if (!q || sideOf(q) !== side) continue;
    const t = typeOf(q);
    if (t === "k") continue;
    m[t]++;
    if (t === "p" && crossedRiver(rowOf(i), side)) m.crossed++;
  }
  return m;
}

/** Ô `x` nằm giữa hai ô `a`, `b` trên cùng một hàng hoặc cột. */
function between(a: number, b: number, x: number): boolean {
  if (rowOf(a) === rowOf(b) && rowOf(x) === rowOf(a)) {
    return colOf(x) > Math.min(colOf(a), colOf(b)) && colOf(x) < Math.max(colOf(a), colOf(b));
  }
  if (colOf(a) === colOf(b) && colOf(x) === colOf(a)) {
    return rowOf(x) > Math.min(rowOf(a), rowOf(b)) && rowOf(x) < Math.max(rowOf(a), rowOf(b));
  }
  return false;
}

/** Quân ở ô `from` có đánh vào ô `dest` khi Tướng đối phương từ ô `king` bước sang đó không (xét cả Pháo cần ngòi). */
function hitsKingStep(board: Board, from: number, king: number, dest: number): boolean {
  const p = board[from];
  const k = board[king];
  if (!p || !k) return false;
  const probe = board.slice();
  probe[king] = null;
  probe[dest] = k;
  return attackersOf(probe, dest, sideOf(p)).includes(from);
}

/** Chân Mã của nước Mã từ `from` tới `to`: ô sát Mã theo hướng đi dài. */
function horseLeg(from: number, to: number): number {
  const dr = rowOf(to) - rowOf(from);
  const dc = colOf(to) - colOf(from);
  return Math.abs(dr) === 2 ? from + Math.sign(dr) * 9 : from + Math.sign(dc);
}

/** Nguyên lý gốc của app trùng ý với một bài kỳ lý tàn cuộc thì gắn thẻ bài đó. */
const LESSON_OF: Partial<Record<EndgamePrinciple, number>> = {
  doiVeTanCuocThang: 2, // biết thế nào lợi thắng, thế nào lợi hòa để chủ động chuyển đổi
  doiQuanMatThang: 2,
  giaiHoa: 28,          // cầu hòa: bên kém đổi quân về hình hòa chuẩn mực
  totGia: 14,           // Tốt cao là Tốt có sức, xung vội thành Tốt thấp
  totApCung: 14,
  tuongTroCong: 16,     // Tướng trợ công
  nuocCho: 24,
  doiPhaoLayMa: 22,     // Pháo cần ngòi, Mã độc lập tác chiến
  doiMaLayPhao: 22,
};

/** Câu trích hợp ý hơn câu đầu tiên của thẻ bài (chỉ số trong `quotes`). */
const QUOTE_OF: Partial<Record<EndgamePrinciple, number>> = {
  muuBinhKhongXe: 1,      // câu đầu của bài 6 nói về Xe
  donTotKhongCheTuyen: 1, // "để Tốt đối phương qua sông thì... chưa hiểu về tàn cuộc"
  chienThuatVayKhon: 1,   // câu đầu của bài 25 nói về trung cuộc
  totGia: 1,
  totApCung: 1,
  tuongTroCong: 1,
};

function lessonCard(principle: EndgamePrinciple): ZhaoEndgameLessonCard | undefined {
  const n = LESSON_OF[principle];
  if (n !== undefined) return ZHAO_ENDGAME_LESSONS[n];
  return Object.values(ZHAO_ENDGAME_LESSONS).find((c) => c.tacticId === principle);
}

function fact(
  before: Board, move: Move, principle: EndgamePrinciple, summary: string,
  extra?: { tone?: "critique" | "note"; endgame?: string },
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

  const card = lessonCard(principle);
  if (card) {
    f.lesson = card.lesson;
    f.lessonTitle = card.title;
    const quote = card.quotes[QUOTE_OF[principle] ?? 0] ?? card.quotes[0];
    if (quote) {
      f.quote = quote;
      const [m, s] = quote.at.split(":").map((x) => parseInt(x, 10));
      f.videoUrl = `https://youtu.be/${card.video}?t=${(m || 0) * 60 + (s || 0)}`;
    }
  }
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

/**
 * Tốt ăn Sĩ hoặc Tượng trong tàn cuộc: đổi Tốt lấy quân phòng thủ, cung đối phương mỏng đi.
 * Khi có biến engine thì detectGuardBreak quyết định (kiểm có lời thật); đây là nhận xét khi chỉ có điểm mất.
 */
export function detectPawnForGuard(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  const victim = before[move.to];
  if (!piece || !victim || typeOf(piece) !== "p" || !soundMove(options)) return null;
  if (typeOf(victim) !== "a" && typeOf(victim) !== "b") return null;
  if (engineLine(before, move, options)) return null;
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

/**
 * Quân (không phải Tướng) khóa đường đi của Tướng đối phương, chỉ còn tối đa 1 nước.
 * Chỉ nói với bên đang hơn (khóa Tướng là bước của tàn cuộc thắng), với nước không chiếu (Tướng bị chiếu thì ít đường
 * đi là do nước chiếu), và ô Tướng mất phải do chính quân vừa đi khống chế.
 */
export function detectKingBoxing(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) === "k" || !soundMove(options)) return null;
  if ((options?.evalBefore?.score ?? 0) < 150) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(after, opp)) return null;
  const k = findKing(after, opp);
  if (k < 0) return null;
  const movesBefore = legalMovesFrom({ board: before, turn: opp }, k);
  const movesAfter = legalMovesFrom({ board: after, turn: opp }, k);
  if (movesAfter.length > 1 || movesAfter.length >= movesBefore.length) return null;
  const taken = movesBefore.filter((m) => !movesAfter.some((x) => x.to === m.to));
  if (!taken.some((m) => hitsKingStep(after, move.to, k, m.to))) return null;
  if (!legalMoves({ board: after, turn: opp }).length) return null; // chiếu bí / hết nước: đã là sát cục
  return fact(before, move, "boTuong",
    `Bó Tướng: ${nameOf(piece)} khống chế, Tướng đối phương chỉ còn ${movesAfter.length === 0 ? "đứng yên" : "1 đường đi"} — tàn cuộc thắng bắt đầu từ việc khóa Tướng.`);
}

/** Phe `side` (giả sử đến lượt) có nước chiếu bí ngay không. */
function hasMateInOne(board: Board, side: Side): boolean {
  const victim = opponent(side);
  for (const m of legalMoves({ board, turn: side })) {
    const next = play(board, m);
    if (inCheck(next, victim) && legalMoves({ board: next, turn: victim }).length === 0) return true;
  }
  return false;
}

/** Sau nước đi, bên đi có đe dọa gì ngay không: ăn có lời một quân đối phương, hoặc chiếu bí ngay (nếu được đi tiếp). */
function threatensNow(after: Board, mover: Side): boolean {
  const opp = opponent(mover);
  for (let sq = 0; sq < 90; sq++) {
    const p = after[sq];
    if (p && sideOf(p) === opp && typeOf(p) !== "k" && (exchangeGain(after, sq, mover) ?? 0) > 0) return true;
  }
  return hasMateInOne(after, mover);
}

/**
 * Đợi nước: bên đang thắng đi một nước chờ (không ăn, không chiếu), engine xác nhận gần như tốt nhất, và
 * - Tướng / Sĩ / Tượng nhích một nước khi đối phương còn rất ít nước để đi; hoặc
 * - nước đi không đe dọa gì (không có quân nào ăn được có lời, không có nước sát ngay), vậy mà theo biến chính nước đáp
 *   của đối phương tạo ra sơ hở và bị trừng phạt ngay nước kế tiếp: bị sát, hoặc mất quân vào tay một quân khác
 *   (không phải quân vừa đi) — đúng nghĩa "ép đối phương tự đi" (欠行). Nước chuẩn bị một đòn hai ba nước thì không tính.
 */
export function detectWaitingMove(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to]) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(before, mover) || inCheck(after, opp)) return null;
  if ((options?.evalBefore?.score ?? 0) < 150 || !soundMove(options, 30)) return null;
  const replies = legalMoves({ board: after, turn: opp }).length;
  if (replies === 0) return null;
  if ("kab".includes(typeOf(piece)) && replies <= 10) {
    return fact(before, move, "nuocCho",
      `Đợi nước: ${nameOf(piece)} đi một nước chờ, giữ nguyên thế khống chế — đối phương chỉ còn ${replies} nước và buộc phải tự đi, tự làm hỏng thế phòng thủ.`);
  }
  const line = engineLine(before, move, options);
  if (!line || line.mateIn === 0 || line.plies.length < 3) return null;
  const punish = line.plies[2];
  const mates = line.moverMates && line.mateIn === 1;
  const wins = !!punish.victim && punish.origin !== move.from && line.outcome.materialSettled >= 100;
  if ((!mates && !wins) || threatensNow(after, mover)) return null;
  const r = tally(line, 2);
  return fact(before, move, "nuocCho",
    `Đợi nước: ${nameOf(piece)} (${moveNotation(before, move)}) đi một nước chờ không đe dọa gì, nhưng đối phương buộc phải tự đi và tự hở: ${narrate(line, mates ? 2 : r.upTo)} — ${mates ? "chiếu bí" : r.text}.`);
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
// 11. KỲ LÝ TÀN CUỘC TRIỆU HÂM HÂM — CÔNG SÁT VÀ BẮT QUÂN (biến engine phải xác nhận)
// ============================================================================

/**
 * Bài 40 — Hải để lao nguyệt (mò trăng đáy biển), tàn cuộc Xe Pháo đối Xe: nước đi đặt Pháo vào hàng đáy đối phương
 * ngay dưới Tướng đối phương (Tướng đã rời hàng đáy, giữa hai quân trống), lấy chính Tướng làm ngòi để đánh quân đứng
 * sau lưng Tướng — thường là Xe. Biến engine phải cho thấy được lợi: bắt được quân đó, hoặc sát, hoặc đuổi được nó
 * mà bên đi hơn rõ.
 */
export function detectHaiDeLaoNguyet(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (material(before, mover).r < 1 || material(before, mover).c < 1 || material(before, opp).r < 1) return null;
  const dir = mover === "r" ? 1 : -1; // từ hàng đáy đối phương đi về phía Tướng đối phương
  /** Ô quân bị Pháo dưới đáy đánh qua ngòi Tướng (-1 nếu không có thế này). */
  const formation = (b: Board): number => {
    const k = findKing(b, opp);
    if (k < 0 || rowOf(k) === bottomRow(mover)) return -1;
    const col = colOf(k);
    const c = b[bottomRow(mover) * 9 + col];
    if (!c || sideOf(c) !== mover || typeOf(c) !== "c") return -1;
    for (let r = bottomRow(mover) + dir; r !== rowOf(k); r += dir) if (b[r * 9 + col]) return -1;
    for (let r = rowOf(k) + dir; r >= 0 && r < 10; r += dir) {
      const t = b[r * 9 + col];
      if (t) return sideOf(t) === opp ? r * 9 + col : -1;
    }
    return -1;
  };
  const target = formation(after);
  if (target < 0 || formation(before) === target || !soundMove(options, 40) || !options?.evalAfter) return null;
  const targetName = nameOf(after[target]!);
  const line = engineLine(before, move, options);
  if (!line) {
    // Biến engine quá ngắn để kể (thế đã quyết định): hình cờ tự nói lên đòn — Pháo ăn được quân sau lưng Tướng có lời
    const score = -options.evalAfter.score;
    if (score < 300 || (exchangeGain(after, target, mover) ?? 0) <= 0) return null;
    return fact(before, move, "haiDeLaoNguyet",
      `Hải để lao nguyệt: Pháo nằm dưới đáy ngay dưới Tướng đối phương, lấy chính Tướng làm ngòi đánh ${targetName} sau lưng Tướng (${moveNotation(before, move)}); engine chấm bên đi hơn rõ (+${score}).`);
  }
  const won = line.outcome.captures.find((c) => c.by === mover && c.origin === target);
  let result: string;
  if (line.moverMates) {
    result = `${narrate(line, mateEnd(line))} — ${mateText(line)}`;
  } else if (won && line.outcome.materialSettled >= 250) {
    const r = tally(line, won.ply);
    result = `${narrate(line, r.upTo)} — ${r.text}`;
  } else if (line.scoreForMover >= 300 && line.plies[1]?.origin === target) {
    result = `${targetName} đối phương phải chạy (${line.plies[1].notation}), engine chấm bên đi hơn rõ (+${line.scoreForMover})`;
  } else {
    return null;
  }
  return fact(before, move, "haiDeLaoNguyet",
    `Hải để lao nguyệt: Pháo nằm dưới đáy ngay dưới Tướng đối phương, lấy chính Tướng làm ngòi đánh ${targetName} sau lưng Tướng (${moveNotation(before, move)}); ${result}.`);
}

/**
 * Công sát bằng tổ hợp quân — bài 30 (Xe Pháo), 31 (Xe Mã) — và Sấm sét (bài 29).
 * Engine phải báo bên đi chiếu bí được; tổ hợp xác định theo các quân THẬT SỰ chiếu trong biến.
 */
export function detectMatingAttack(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const line = engineLine(before, move, options);
  if (!line?.moverMates || !soundMove(options)) return null;
  const end = mateEnd(line);
  const checkers = new Set(line.plies.slice(0, end + 1).filter((e) => e.side === mover).flatMap((e) => e.checkerTypes));
  const only = (types: string) => [...checkers].every((t) => types.includes(t));
  const story = `${narrate(line, end)} — ${mateText(line)}`;
  if (checkers.has("r") && checkers.has("c") && only("rcp")) {
    return fact(before, move, "xePhaoHopCong", `Xe Pháo hợp công: ${story}.`);
  }
  if (checkers.has("r") && checkers.has("n") && only("rnp")) {
    return fact(before, move, "xeMaLanhChieu", `Xe Mã lãnh chiêu: ${story}.`);
  }
  // Sấm sét: sát nhanh khi đang kém quân, hoặc bỏ quân trong biến mà vẫn sát trước
  if (line.mateIn === null || line.mateIn > 4) return null;
  const behind = materialBalance(before, mover) <= -200;
  const gaveUp = line.outcome.captures.some((c) => c.by === opp && "rnc".includes(c.type) && c.ply <= end);
  if (!behind && !gaveUp) return null;
  return fact(before, move, "chienThuatSamSet",
    `Sấm sét — đánh nhanh thắng nhanh: ${behind ? "đang kém quân nhưng " : ""}${narrate(line, end)} — ${mateText(line)}${gaveUp ? ", bỏ quân không tiếc vì sát trước" : ""}.`);
}

/**
 * Bài 18 (khuyết Sĩ kỵ Xe, Pháo, Xe Tốt) và 19 (khuyết Tượng sợ Pháo): đối phương đã thiếu Sĩ / Tượng,
 * nước đi (không phải ăn quân lớn) mở đòn mà biến engine cho thấy sát được hoặc thắng quân trong vài nước,
 * và chính quân vừa đi chiếu Tướng trước hoặc ngay ở đòn quyết định — tức là đánh thẳng vào cung đã yếu.
 */
export function detectWeakPalaceAttack(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const t = typeOf(piece);
  if (!"rcp".includes(t)) return null;
  const mover = sideOf(piece);
  const theirs = material(before, opponent(mover));
  const noElephant = theirs.b <= 1 && t === "c";
  const noAdvisor = theirs.a <= 1;
  if (!noElephant && !noAdvisor) return null;
  const victim = before[move.to];
  if (victim && "rnc".includes(typeOf(victim))) return null; // ăn quân lớn: mục đích là ăn quân
  const line = engineLine(before, move, options);
  if (!line || !soundMove(options, 40)) return null;
  const o = line.outcome;
  const key = moverCaptureAt(line, "rnc");
  const wins = !line.moverMates && key > 0 && key <= 8 && o.materialNow <= 200 && o.materialSettled >= 300 && line.scoreForMover >= 300;
  if (!line.moverMates && !wins) return null;
  // Đánh vào cung yếu nghĩa là chính quân vừa đi phải chiếu Tướng trước (hoặc ngay khi) ra đòn quyết định
  const end = line.moverMates ? mateEnd(line) : key;
  if (pieceRole(line, move.from, end).checks === 0) return null;

  let story: string;
  if (line.moverMates) {
    story = `${narrate(line, end)} — ${mateText(line)}`;
  } else {
    const r = tally(line, key);
    story = `${narrate(line, r.upTo)} — ${r.text}`;
  }
  if (noElephant) {
    return fact(before, move, "khuyetTuongKyPhao",
      `Khuyết Tượng sợ Pháo: đối phương ${theirs.b === 0 ? "đã mất cả hai Tượng" : "chỉ còn một Tượng"}, ${story}.`);
  }
  return fact(before, move, "khuyetSiKyGi",
    `Khuyết Sĩ kỵ ${t === "c" ? "Pháo" : t === "r" ? "Xe" : "Tốt áp cung"}: đối phương ${theirs.a === 0 ? "đã mất cả hai Sĩ" : "chỉ còn một Sĩ"}, ${story}.`);
}

/**
 * Phá Sĩ Tượng: bài 32 (Xe Tốt), 7 (bên đi còn Xe), 4 (Tốt ăn Sĩ / Tượng của bên đã khuyết), 8 (không Xe).
 * Bên đi ăn Sĩ / Tượng ở nước này hoặc nước kế tiếp của chính quân vừa đi, và biến cho thấy có lời thật:
 * giữ được quân ăn mà không kém thế, hoặc đổi quân mà engine chấm thắng rõ, hoặc sát.
 */
export function detectGuardBreak(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const mover = sideOf(piece);
  const line = engineLine(before, move, options);
  if (!line || !soundMove(options, 40)) return null;
  const cap = line.outcome.captures.find((c) => c.by === mover && (c.type === "a" || c.type === "b") && c.ply <= 2);
  if (!cap || (cap.ply === 2 && line.plies[2]?.origin !== move.from)) return null;
  const o = line.outcome;
  const good = line.moverMates || (o.materialSettled >= 100 && line.scoreForMover >= 0) ||
    (o.materialSettled >= -100 && line.scoreForMover >= 300);
  if (!good) return null;

  const capturer = line.plies[cap.ply].type;
  const mine = material(before, mover);
  const theirs = material(before, opponent(mover));
  let principle: EndgamePrinciple;
  let title: string;
  if (mine.r >= 1 && mine.n + mine.c === 0 && mine.crossed >= 1 && (capturer === "r" || capturer === "p")) {
    principle = "xeChotPhaSiTuong";
    title = "Xe Tốt phá Sĩ Tượng";
  } else if (mine.r >= 1) {
    principle = "phaSiTuongCoXe";
    title = "Phá Sĩ Tượng";
  } else if (capturer === "p" && theirs.a + theirs.b < 4) {
    principle = "binhTanSiTuong";
    title = "Tốt phá khuyết Sĩ Tượng";
  } else {
    principle = "phaSiTuongKhongXe";
    title = "Phá Sĩ Tượng không cần Xe";
  }
  if (line.moverMates) return fact(before, move, principle, `${title}: ${narrate(line, mateEnd(line))} — ${mateText(line)}.`);
  const r = tally(line, cap.ply);
  const clear = o.materialSettled < 100 ? `, engine chấm bên đi hơn rõ (+${line.scoreForMover})` : "";
  return fact(before, move, principle, `${title}: ${narrate(line, r.upTo)} — ${r.text}${clear}.`);
}

/**
 * Bài 25 — vây khốn bắt quân lớn: nước đi (không ăn quân) để một Xe / Mã / Pháo đối phương không còn ô nào
 * chạy an toàn, và biến engine bắt được đúng con đó, lời vật chất.
 */
export function detectTrap(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to]) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  // Nước chiếu thì quân đối phương "không chạy được" chỉ vì phải đỡ chiếu — đó là chiếu bắt quân (đốn tỏa), không phải vây
  if (inCheck(after, opp)) return null;
  const line = engineLine(before, move, options);
  if (!line || !soundMove(options, 40) || line.outcome.materialSettled < 250) return null;
  const cap = line.outcome.captures.find((c) => c.by === mover && "rnc".includes(c.type) && c.ply >= 2 && c.ply <= 8);
  if (!cap) return null;
  const sq = cap.origin; // quân bị bắt chưa đi trước nước này nên vẫn đứng ở ô ban đầu
  const target = after[sq];
  if (!target || sideOf(target) !== opp || typeOf(target) !== cap.type) return null;
  if ((exchangeGain(after, sq, mover) ?? 0) <= 0) return null; // chưa bị dọa ăn có lời thì chưa phải vây
  const escapes = legalMovesFrom({ board: after, turn: opp }, sq);
  if (escapes.some((m) => (exchangeGain(play(after, m), m.to, mover) ?? 0) <= 0)) return null; // còn đường chạy
  const r = tally(line, cap.ply);
  return fact(before, move, "chienThuatVayKhon",
    `Vây khốn bắt quân: ${nameOf(piece)} (${moveNotation(before, move)}) cắt hết đường chạy của ${nameOf(target)} đối phương — ${escapes.length ? "chạy đi đâu cũng bị ăn" : "không còn nước nào để đi"}; theo biến: ${narrate(line, r.upTo)} — ${r.text}.`);
}

/**
 * Bài 23 — kiềm chế: nước đi (không chiếu, không ăn quân lớn) ghim một Xe / Mã / Pháo đối phương vào Tướng —
 * quân đó có nước theo hình nhưng không đi được, trước nước đi thì vẫn đi được — và biến cho thấy cái ghim
 * mang lại quân: bắt được chính quân bị ghim, hoặc thắng thêm ít nhất 2 điểm Tốt sau nước đi.
 */
export function detectPin(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"rcn".includes(typeOf(piece))) return null;
  const victim = before[move.to];
  if (victim && "rnc".includes(typeOf(victim))) return null; // ăn quân lớn: mục đích là ăn quân
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (inCheck(after, opp)) return null; // nước chiếu: cái ghim chỉ là phụ
  const king = findKing(after, opp);
  if (king < 0) return null;
  let pinned = -1;
  for (let sq = 0; sq < 90; sq++) {
    const p = after[sq];
    if (!p || sideOf(p) !== opp || !"rnc".includes(typeOf(p))) continue;
    if (!pseudoMoves(after, sq).length || legalMovesFrom({ board: after, turn: opp }, sq).length) continue;
    if (!legalMovesFrom({ board: before, turn: opp }, sq).length) continue; // đã kẹt từ trước
    // Chính quân vừa đi là quân ghim: nhấc quân bị ghim ra thì nó chiếu Tướng
    const probe = after.slice();
    probe[sq] = null;
    if (!attackersOf(probe, king, mover).includes(move.to)) continue;
    pinned = sq;
    break;
  }
  if (pinned < 0) return null;
  const line = engineLine(before, move, options);
  if (!line || line.moverMates || !soundMove(options, 40)) return null; // sát thì câu chuyện là đòn sát
  const o = line.outcome;
  const won = o.captures.find((c) => c.by === mover && c.origin === pinned);
  const key = won ? won.ply : moverCaptureAt(line, "rnbacp");
  if (key < 1 || o.materialSettled < 100 || (!won && o.materialSettled - o.materialNow < 200)) return null;
  const r = tally(line, key);
  return fact(before, move, "chienThuatKiemChe",
    `Kiềm chế: ${nameOf(piece)} (${moveNotation(before, move)}) ghim ${nameOf(after[pinned]!)} đối phương vào Tướng, quân này không nhúc nhích được; theo biến: ${narrate(line, r.upTo)} — ${r.text}.`);
}

/**
 * Bài 26 — đốn tỏa: nước chiếu trung gian (không ăn quân, chưa phải nước sát) để giành nước, buộc đối phương
 * ứng phó và lệch vị, rồi mới ra đòn quyết định. Biến engine phải cho thấy:
 * - hoặc bắt được quân lớn trong vài nước sau;
 * - hoặc dẫn tới sát mà giữa chừng bên đi có nước yên lặng (không chiếu) — nước chiếu này chuyển vị cho đòn sau,
 *   không phải một chuỗi chiếu liên hoàn tới chết (cái đó do detectMatingAttack nói).
 */
export function detectCheckThenWin(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || before[move.to]) return null;
  const mover = sideOf(piece);
  if (!inCheck(after, opponent(mover))) return null;
  const line = engineLine(before, move, options);
  if (!line || line.mateIn === 0 || !soundMove(options, 40)) return null;
  let end: number;
  let result: string;
  if (line.moverMates) {
    end = mateEnd(line);
    if (!line.plies.slice(1, end).some((e) => e.side === mover && !e.check)) return null;
    result = mateText(line);
  } else {
    const key = moverCaptureAt(line, "rnc", 2);
    if (key < 0 || key > 6 || line.outcome.materialSettled < 250) return null;
    const r = tally(line, key);
    end = r.upTo;
    result = r.text;
  }
  return fact(before, move, "kyThuatDonToa",
    `Đốn tỏa: chiếu để giành nước, buộc đối phương lệch vị rồi mới ra đòn — ${narrate(line, end)} — ${result}.`);
}

/**
 * Bài 11 — Mã hoạt: Mã nhảy tới ô an toàn, góp sức (chiếu hoặc ăn quân) trong biến dẫn tới sát hoặc thắng quân.
 * Ô ngọa tào (hàng thứ hai từ đáy đối phương, lộ 3 / 7) được gọi đúng tên.
 */
export function detectActiveHorse(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n") return null;
  const victim = before[move.to];
  if (victim && "rnc".includes(typeOf(victim))) return null; // ăn quân lớn: mục đích là ăn quân
  const mover = sideOf(piece);
  if ((exchangeGain(after, move.to, opponent(mover)) ?? 0) > 0) return null; // Mã nhảy vào chỗ bị ăn
  const line = engineLine(before, move, options);
  if (!line || !soundMove(options, 40)) return null;
  const key = moverCaptureAt(line, "rnc");
  const wins = !line.moverMates && key > 0 && key <= 8 && line.outcome.materialSettled >= 300 && line.scoreForMover >= 300;
  if (!line.moverMates && !wins) return null;
  // Mã phải tự góp sức trước hoặc ngay ở đòn quyết định: chiếu Tướng, hoặc chính nó ăn quân
  const end = line.moverMates ? mateEnd(line) : key;
  const role = pieceRole(line, move.from, end);
  if (role.checks === 0 && role.captures.length === 0) return null;
  const ngoaTao = rowOf(move.to) === secondRow(mover) && (colOf(move.to) === 2 || colOf(move.to) === 6);
  let story: string;
  if (line.moverMates) {
    story = `${narrate(line, end)} — ${mateText(line)}`;
  } else {
    const r = tally(line, key);
    story = `${narrate(line, r.upTo)} — ${r.text}`;
  }
  return fact(before, move, "maHoatChienThang",
    `${ngoaTao ? "Mã ngọa tào" : "Mã hoạt"}: ${story}.`);
}

// ============================================================================
// 12. KỲ LÝ TÀN CUỘC TRIỆU HÂM HÂM — TỐT VÀ TUYẾN
// ============================================================================

/**
 * Mưu Binh — bài 5 (Xe), 6 (Mã / Pháo khi bàn không còn Xe), 21 (Xe dọn Tốt đã qua sông):
 * ăn Tốt ở chính nước này, hoặc nước sau của chính quân vừa đi, và giữ được đến cuối biến.
 */
export function detectPawnHunt(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece) return null;
  const t = typeOf(piece);
  if (!"rnc".includes(t)) return null;
  const victim = before[move.to];
  if (victim && typeOf(victim) !== "p") return null; // nước ăn quân khác: Tốt ăn sau chỉ là phụ
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (t !== "r" && (material(before, mover).r > 0 || material(before, opp).r > 0)) return null; // bài 6 là tàn cuộc không Xe
  const line = engineLine(before, move, options);
  if (!line || !soundMove(options, 40)) return null;
  const cap = line.outcome.captures.find((c) => c.by === mover && c.type === "p" &&
    (c.ply === 0 || (c.ply === 2 && line.plies[2]?.origin === move.from)));
  if (!cap || line.outcome.materialSettled < 50) return null; // Tốt bị lấy lại, hoặc mất thứ khác
  const sq = line.plies[cap.ply].move.to;
  const crossed = crossedRiver(rowOf(sq), opp);
  const principle: EndgamePrinciple = t !== "r" ? "muuBinhKhongXe" : crossed ? "donTotKhongCheTuyen" : "muuBinhCoXe";
  const title = principle === "donTotKhongCheTuyen" ? "Dọn Tốt quá hà" : t === "r" ? "Mưu Binh bằng Xe" : `Mưu Binh bằng ${nameOf(piece)}`;
  const how = cap.ply === 0
    ? `${nameOf(piece)} ăn Tốt${crossed ? " đã qua sông" : ""} (${line.plies[0].notation}), đối phương không lấy lại được`
    : `${narrate(line, 2)} — thắng Tốt${crossed ? " đã qua sông" : ""}`;
  return fact(before, move, principle, `${title}: ${how}.`);
}

/**
 * Bài 21 — Xe khống chế tuyến sông: sau nước Xe (không ăn quân), một Tốt đối phương đang đứng bờ sông
 * trước đó qua sông được an toàn, nay qua là bị Xe ăn có lời.
 */
export function detectRiverBlock(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r" || before[move.to]) return null;
  if (!options?.evalAfter || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const step = opp === "b" ? 9 : -9;
  for (let sq = 0; sq < 90; sq++) {
    const p = after[sq];
    if (!p || sideOf(p) !== opp || typeOf(p) !== "p" || crossedRiver(rowOf(sq), opp)) continue;
    const to = sq + step;
    if (to < 0 || to >= 90 || !crossedRiver(rowOf(to), opp) || after[to] || before[to] || before[sq] !== p) continue;
    const cross = { from: sq, to };
    const safeBefore = (exchangeGain(play(before, cross), to, mover) ?? 0) <= 0;
    const crossedAfter = play(after, cross);
    if (!safeBefore || (exchangeGain(crossedAfter, to, mover) ?? 0) <= 0) continue;
    if (!attackersOf(crossedAfter, to, mover).includes(move.to)) continue;
    return fact(before, move, "donTotKhongCheTuyen",
      `Khống chế tuyến sông: Xe (${moveNotation(before, move)}) giữ tuyến, Tốt lộ ${fileNumber(colOf(sq), opp)} của đối phương tiến qua sông là bị Xe ăn.`);
  }
  return null;
}

/**
 * Bài 17 — Lão binh: Tốt đã ở hàng đáy đối phương vẫn có sức — nước đi của nó góp vào đòn sát
 * hoặc khóa Tướng (Tướng đối phương còn tối đa 1 đường đi) khi bên đi đang hơn rõ.
 */
export function detectOldPawnAttack(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p") return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (rowOf(move.from) !== bottomRow(mover)) return null;
  const line = engineLine(before, move, options);
  if (!line || !soundMove(options, 30)) return null;
  const mobBefore = kingMobility(before, opp);
  const mobAfter = kingMobility(after, opp);
  const boxes = mobAfter < mobBefore && mobAfter <= 1 && line.scoreForMover >= 200;
  if (!line.moverMates && !boxes) return null;
  const what = line.moverMates
    ? `${narrate(line, mateEnd(line))} — ${mateText(line)}`
    : `Tướng đối phương chỉ còn ${mobAfter === 0 ? "đứng yên" : "1 đường đi"}`;
  return fact(before, move, "laoBinhKhongChet",
    `Lão binh vẫn có sức: Tốt đáy (${moveNotation(before, move)}) tuy chỉ đi ngang vẫn khóa tuyến đáy — ${what}.`);
}

// ============================================================================
// 13. KỲ LÝ TÀN CUỘC TRIỆU HÂM HÂM — KHỐNG CHẾ TƯỚNG VÀ ĐƯỜNG ĐI
// ============================================================================

/**
 * Bài 9 — chiếm trung: Xe / Tướng / Tốt chiếm trung lộ khiến Tướng đối phương đang ở lộ sườn
 * không về được trung lộ nữa (trước nước đi thì về được). Bên đi không kém thế, engine xác nhận.
 */
export function detectCenterFile(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"rkp".includes(typeOf(piece))) return null;
  if (colOf(move.from) === 4 || colOf(move.to) !== 4) return null;
  if ((options?.evalBefore?.score ?? -1) < 0 || !soundMove(options, 30)) return null;
  const opp = opponent(sideOf(piece));
  const k = findKing(after, opp);
  if (k < 0 || colOf(k) === 4) return null;
  const toCenter = (b: Board) => legalMovesFrom({ board: b, turn: opp }, k).some((m) => colOf(m.to) === 4);
  if (!toCenter(before) || toCenter(after)) return null;
  return fact(before, move, "nguyenTacChiemTrung",
    `Chiếm trung: ${nameOf(piece)} (${moveNotation(before, move)}) chiếm trung lộ, Tướng đối phương bị đẩy ra lộ ${fileNumber(colOf(k), opp)} và không về được trung lộ.`);
}

/**
 * Bài 10 — tuyến áp đáy: Tốt hoặc Tướng khóa hàng thứ hai, Tướng đối phương ở hàng đáy không lên được nữa
 * (trước nước đi thì lên được). "Tả Tốt hữu Tướng" khi Tốt và Tướng bên đi chia nhau hai lộ sườn.
 */
export function detectBackRankLock(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"pk".includes(typeOf(piece))) return null;
  if ((options?.evalBefore?.score ?? 0) < 100 || !soundMove(options, 30)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const k = findKing(after, opp);
  if (k < 0 || rowOf(k) !== bottomRow(mover)) return null;
  const up = (b: Board) => legalMovesFrom({ board: b, turn: opp }, k).filter((m) => rowOf(m.to) !== rowOf(k)).length;
  if (up(before) === 0 || up(after) > 0) return null;
  const own = findKing(after, mover);
  const pawnRib = after.findIndex((p, i) => !!p && sideOf(p) === mover && typeOf(p) === "p" && rowOf(i) === secondRow(mover) && (colOf(i) === 3 || colOf(i) === 5));
  const leftPawnRightKing = pawnRib >= 0 && own >= 0 && (colOf(own) === 3 || colOf(own) === 5) && colOf(own) !== colOf(pawnRib);
  return fact(before, move, "loSuonApDay",
    `Khống chế tuyến áp đáy${leftPawnRightKing ? " (Tả Tốt hữu Tướng)" : ""}: ${nameOf(piece)} (${moveNotation(before, move)}) khóa hàng thứ hai, Tướng đối phương bị giam ở hàng đáy, không lên được nữa.`);
}

/**
 * Nước `m` của đối phương (đi từ thế `before`) có bắt được quân lớn của phe `mover` không:
 * chiếu mà bắt luôn quân lớn, hoặc ăn quân lớn có lời. Chặn một nước chiếu thường thì không tính —
 * tàn cuộc ít quân, nước chiếu nào cũng chỉ còn vài nước đỡ, chặn chiếu là việc thường ngày.
 */
function dangerousThreat(before: Board, m: Move, mover: Side): string | null {
  const opp = opponent(mover);
  const next = play(before, m);
  if (inCheck(next, mover)) {
    for (let sq = 0; sq < 90; sq++) {
      const q = next[sq];
      if (q && sideOf(q) === mover && "rnc".includes(typeOf(q)) && (exchangeGain(next, sq, opp) ?? 0) > 0) {
        return `chiếu bắt ${nameOf(q)}`;
      }
    }
    return null;
  }
  const target = before[m.to];
  if (target && "rnc".includes(typeOf(target)) && (exchangeGain(before, m.to, opp) ?? 0) > 0) return `ăn ${nameOf(target)}`;
  return null;
}

/**
 * Bài 27 — đánh chặn: Xe / Mã / Pháo chắn ngang đường đi của Xe / Pháo đối phương, chặn một đòn bắt quân có sẵn
 * (dangerousThreat), và quân chắn không bị ăn có lời.
 */
export function detectInterception(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"rnc".includes(typeOf(piece)) || before[move.to]) return null;
  if (!options?.evalAfter || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!before.some((p) => !!p && sideOf(p) === opp && "rc".includes(typeOf(p)))) return null;
  if ((exchangeGain(after, move.to, opp) ?? 0) > 0) return null;
  if (inCheck(after, opp)) return null; // nước chiếu: đối phương buộc phải đỡ chiếu, chặn đường không phải ý chính
  const posAfter = { board: after, turn: opp };
  for (const m of legalMoves({ board: before, turn: opp })) {
    const p = before[m.from]!;
    if (!"rc".includes(typeOf(p)) || !between(m.from, m.to, move.to) || isLegal(posAfter, m)) continue;
    const threat = dangerousThreat(before, m, mover);
    if (!threat) continue;
    return fact(before, move, "kyThuatDanhChan",
      `Đánh chặn: ${nameOf(piece)} (${moveNotation(before, move)}) chắn ngang đường ${nameOf(p)} đối phương, chặn nước ${threat} (${moveNotation(before, m)}).`);
  }
  return null;
}

/**
 * Bài 15 — Sĩ Tượng phong ấn Mã: Sĩ / Tượng đứng vào chân Mã đối phương, làm Mã mất một nước chiếu
 * hoặc ăn quân có lời mà trước đó nó có.
 */
export function detectGuardBlocksHorse(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"ab".includes(typeOf(piece))) return null;
  if (!options?.evalAfter || !soundMove(options, 40)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  for (let h = 0; h < 90; h++) {
    const p = after[h];
    if (!p || sideOf(p) !== opp || typeOf(p) !== "n") continue;
    if (Math.abs(rowOf(h) - rowOf(move.to)) + Math.abs(colOf(h) - colOf(move.to)) !== 1) continue; // không đứng sát Mã
    const still = legalMovesFrom({ board: after, turn: opp }, h);
    for (const m of legalMovesFrom({ board: before, turn: opp }, h)) {
      if (horseLeg(h, m.to) !== move.to || still.some((x) => x.to === m.to)) continue;
      const check = inCheck(play(before, m), mover);
      const target = before[m.to];
      const wins = !!target && (exchangeGain(before, m.to, opp) ?? 0) > 0;
      if (!check && !wins) continue;
      return fact(before, move, "siTuongPhongAn",
        `Sĩ Tượng phong ấn Mã: ${nameOf(piece)} (${moveNotation(before, move)}) chặn chân Mã đối phương, Mã mất nước ${check ? "chiếu" : `ăn ${nameOf(target!)}`} (${moveNotation(before, m)}).`);
    }
  }
  return null;
}

/**
 * Bài 20 — Pháo hoàn: Pháo từ phần sân đối phương lui về phần sân mình, mượn Sĩ / Tượng phe mình làm ngòi
 * để nhắm ăn có lời một quân đối phương hoặc bảo vệ một quân mình đang bị dọa.
 */
export function detectCannonHome(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "c" || before[move.to]) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  if (!crossedRiver(rowOf(move.from), mover) || crossedRiver(rowOf(move.to), mover)) return null;
  if (!options?.evalAfter || !soundMove(options, 40)) return null;
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let r = rowOf(move.to) + dr;
    let c = colOf(move.to) + dc;
    let screen = -1;
    while (r >= 0 && r < 10 && c >= 0 && c < 9) {
      const i = r * 9 + c;
      const q = after[i];
      if (q) {
        if (screen < 0) {
          if (sideOf(q) !== mover || !"ab".includes(typeOf(q))) break; // ngòi phải là Sĩ / Tượng phe mình
          screen = i;
        } else {
          const aims = sideOf(q) === opp && typeOf(q) !== "k" &&
            (exchangeGain(after, i, mover) ?? 0) > 0 && (exchangeGain(before, i, mover) ?? 0) <= 0;
          const guards = sideOf(q) === mover && typeOf(q) !== "k" &&
            (exchangeGain(before, i, opp) ?? 0) > 0 && (exchangeGain(after, i, opp) ?? 0) <= 0;
          if (!aims && !guards) break;
          return fact(before, move, "coTanPhaoHoan",
            `Pháo hoàn: Pháo lui về (${moveNotation(before, move)}), mượn ${nameOf(after[screen]!)} phe mình làm ngòi để ${aims ? "nhắm" : "bảo vệ"} ${nameOf(q)}${aims ? " đối phương" : " đang bị dọa"}.`);
        }
      }
      r += dr;
      c += dc;
    }
  }
  return null;
}

// ============================================================================
// 14. GHI CHÚ LOẠI TÀN CUỘC (bài về một thế tàn cuộc cụ thể, không khen chê nước đi)
// ============================================================================

interface EndgameType {
  principle: EndgamePrinciple;
  /** Tên thế cờ khi phe `att` là bên có cấu hình thứ nhất. */
  name: (att: Material, def: Material) => string;
  matches: (att: Material, def: Material, board: Board, attSide: Side) => boolean;
}

const noRook = (m: Material) => m.r === 0;
const pieceCount = (m: Material) => m.r + m.n + m.c;
const onBottom = (board: Board, side: Side, type: PieceType) =>
  board.some((p, i) => !!p && sideOf(p) === side && typeOf(p) === type && rowOf(i) === bottomRow(side));

/** Thứ tự từ cụ thể đến chung: thế nào khớp trước thì lấy thế đó. */
const ENDGAME_TYPES: EndgameType[] = [
  {
    principle: "canKhonDaiNaDi",
    name: () => "Xe Pháo đối Xe Song Tượng",
    matches: (a, d) => a.r === 1 && a.c === 1 && a.n === 0 && a.p === 0 &&
      d.r === 1 && d.n + d.c + d.p === 0 && d.b === 2 && d.a === 0,
  },
  {
    principle: "xeMaDoiXeSongTuong",
    name: () => "Xe Mã đối Xe Song Tượng",
    matches: (a, d) => a.r === 1 && a.n === 1 && a.c === 0 && a.p === 0 &&
      d.r === 1 && d.n + d.c + d.p === 0 && d.b === 2 && d.a === 0,
  },
  {
    principle: "tamAnhChienLuBo",
    name: () => "một Xe đối ba quân (Tam Anh chiến Lữ Bố)",
    matches: (a, d) => a.r === 1 && a.n + a.c === 0 && d.r === 0 && d.n + d.c >= 2 && d.n + d.c + d.p >= 3,
  },
  {
    principle: "songPhaoDoiSongMa",
    name: () => "Song Pháo đối Song Mã",
    matches: (a, d) => noRook(a) && noRook(d) && a.c === 2 && a.n === 0 && d.n === 2 && d.c === 0,
  },
  {
    principle: "songMaPhaoDoiMaSongPhao",
    name: () => "Song Mã Pháo đối Mã Song Pháo",
    matches: (a, d) => noRook(a) && noRook(d) && a.n === 2 && a.c === 1 && d.n === 1 && d.c === 2,
  },
  {
    principle: "songMaSongPhao",
    name: () => "Song Mã Song Pháo đối Song Mã Song Pháo, không còn Xe",
    matches: (a, d) => noRook(a) && noRook(d) && a.n === 2 && a.c === 2 && d.n === 2 && d.c === 2,
  },
  {
    principle: "binhChungHuuLoi",
    name: (_a, d) => `Mã Pháo đối ${d.c === 2 ? "Song Pháo" : "Song Mã"}`,
    matches: (a, d) => noRook(a) && noRook(d) && a.n === 1 && a.c === 1 &&
      ((d.c === 2 && d.n === 0) || (d.n === 2 && d.c === 0)),
  },
  {
    principle: "maPhaoDoiMaPhao",
    name: () => "Mã Pháo đối Mã Pháo",
    matches: (a, d) => noRook(a) && noRook(d) && a.n === 1 && a.c === 1 && d.n === 1 && d.c === 1,
  },
  {
    principle: "maTotDayThangDonSiTuong",
    name: () => "Mã Tốt đáy đối Đơn Sĩ Tượng",
    matches: (a, d, board, attSide) => pieceCount(a) === 1 && a.n === 1 && a.p === 1 && onBottom(board, attSide, "p") &&
      pieceCount(d) === 0 && d.p === 0 && d.a === 1 && d.b === 1,
  },
  {
    principle: "maTotDoiPhaoTot",
    name: () => "Mã Tốt đối Pháo Tốt",
    matches: (a, d) => pieceCount(a) === 1 && a.n === 1 && a.p >= 1 && pieceCount(d) === 1 && d.c === 1 && d.p >= 1,
  },
  {
    principle: "maThangPhao",
    name: () => "Mã đối Pháo",
    matches: (a, d) => pieceCount(a) === 1 && a.n === 1 && pieceCount(d) === 1 && d.c === 1,
  },
  {
    principle: "diemToiHanBinhLuc",
    name: (a) => `${a.r ? "Xe" : a.n ? "Mã" : "Pháo"} hai Tốt qua sông đối Sĩ Tượng toàn`,
    matches: (a, d) => pieceCount(a) === 1 && a.p === 2 && a.crossed === 2 && pieceCount(d) === 0 && d.a === 2 && d.b === 2,
  },
];

function endgameTypeOf(board: Board): { type: EndgameType; attacker: Side; name: string } | null {
  const red = material(board, "r");
  const black = material(board, "b");
  for (const type of ENDGAME_TYPES) {
    if (type.matches(red, black, board, "r")) return { type, attacker: "r", name: type.name(red, black) };
    if (type.matches(black, red, board, "b")) return { type, attacker: "b", name: type.name(black, red) };
  }
  return null;
}

/**
 * Ghi chú khi ván vừa bước vào một loại tàn cuộc có bài giảng riêng: thế SAU nước đi khớp, thế trước thì không.
 * Xét đúng thế cờ trên bàn (không đi thử PV) nên mỗi lần vào thế chỉ ghi một lần — ở nước hoàn tất việc đổi quân.
 */
export function endgameTypeNote(before: Board, move: Move, after: Board): EndgamePrincipleFact | null {
  if (!before[move.from]) return null;
  const now = endgameTypeOf(after);
  if (!now) return null;
  const prev = endgameTypeOf(before);
  if (prev?.type === now.type && prev.attacker === now.attacker) return null;
  const card = lessonCard(now.type.principle);
  const theory = card ? card.principle.slice(card.principle.indexOf(":") + 1).trim() : "";
  const who = now.type.principle === "maPhaoDoiMaPhao" || now.type.principle === "songMaSongPhao"
    ? "" : ` (${SIDE_NAME[now.attacker]} là bên có ${now.name.split(" đối ")[0]})`;
  return fact(before, move, now.type.principle,
    `Ván cờ bước vào tàn cuộc ${now.name}${who}. ${theory}`, { tone: "note" });
}

// ============================================================================
// TỔNG HỢP
// ============================================================================

type Detector = (before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions) => EndgamePrincipleFact | null;

/** Thứ tự ưu tiên: đổi quân quyết định, rồi đòn có kết quả lớn (sát, bắt quân), rồi kỹ thuật khống chế, cuối cùng là thế thủ. */
const PRIORITY: Detector[] = [
  detectEndgameTrade,
  detectMinorTrade,
  detectOldPawn,
  detectHaiDeLaoNguyet,
  detectMatingAttack,
  detectCheckThenWin,
  detectWeakPalaceAttack,
  detectGuardBreak,
  detectTrap,
  detectPin,
  detectActiveHorse,
  detectPawnHunt,
  detectRiverBlock,
  detectInterception,
  detectCenterFile,
  detectBackRankLock,
  detectOldPawnAttack,
  detectPawnForGuard,
  detectKingBoxing,
  detectKingActivity,
  detectHighPawn,
  detectWaitingMove,
  detectGuardBlocksHorse,
  detectCannonHome,
  detectGuardFormation,
];

/**
 * Nguyên lý tàn cuộc khớp với nước đi (tối đa 1, theo thứ tự ưu tiên), kèm ghi chú loại tàn cuộc nếu ván vừa
 * bước vào thế đó. Chỉ xét khi thế trước hoặc sau nước đi đã là tàn cuộc.
 */
export function endgamePrincipleFacts(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact[] {
  if (!before[move.from] || (!isEndgame(before) && !isEndgame(after))) return [];
  const out: EndgamePrincipleFact[] = [];
  for (const detect of PRIORITY) {
    const f = detect(before, move, after, options);
    if (f) {
      out.push(f);
      break;
    }
  }
  const note = endgameTypeNote(before, move, after);
  if (note) out.push(note);
  return out;
}
