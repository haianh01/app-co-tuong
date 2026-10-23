// Nguyên lý tàn cuộc: chấm từng nước đi khi ván đã vào tàn cuộc (bảng endgame.ts chỉ nhận diện thế cờ lý thuyết).
//  - Đổi quân: về tàn cuộc thắng lý thuyết / giải hòa khi kém / đổi sai làm mất thắng
//  - Tốt: Tốt cao áp cung / Tốt già (xuống đáy mất sức) / Tốt đổi Sĩ Tượng
//  - Tướng và khống chế: Tướng trợ công (lộ mặt Tướng) / bó Tướng / đợi nước
//  - Phòng thủ: Sĩ Tượng liên hoàn khi kém quân
// Thuần hàm, tất định, không gọi engine. Nguyên lý cần điểm engine mà không có thì không kết luận.

import {
  type Board, type Move, type Piece, type Side,
  attackersOf, isDefended, colOf, findKing, inCheck, legalMoves, legalMovesFrom, opponent, play, rowOf, sideOf, typeOf, crossedRiver, PIECE_VALUES,
} from "./engine";
import { detectTheoreticalEndgame, type TheoreticalEndgame } from "./endgame";
import { exchangeGain } from "./explain";
import { soundMove, type ZhaoTacticsOptions } from "./middlegame";
import { moveNotation, PIECE_NAME } from "./notation";
import { countMajorPieces } from "./phases";
import { minorValues, screenCount } from "./piece-value";
import { advance, linkedGuards, palacePressure } from "./strategy";
import { ZHAO_ENDGAME_LESSONS } from "./zhao48-endgame-lessons";

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
  // 48 Kỳ lý tàn cuộc Triệu Hâm Hâm (Zhao Xinxin)
  | "taiSaoHocTanCuoc"  // Bài 1: Tại sao cần học tàn cuộc - Phát huy 100% công năng quân cờ
  | "phanLoaiTanCuoc"   // Bài 2: Phân loại tàn cục - Chuyển tàn cuộc thực chiến về thực dụng
  | "diemToiHanBinhLuc" // Bài 3: Điểm tới hạn của binh lực - Đơn quân + 2 Chốt
  | "binhTanSiTuong"    // Bài 4: Binh và tàn Sĩ Tượng - Tốt/Mã khoét sâu khuyết Sĩ Tượng
  | "muuBinhCoXe"       // Bài 5: Mưu đoạt Chốt có Xe - Xe quét tốt, khống chế tuyến sông
  | "muuBinhKhongXe"    // Bài 6: Mưu đoạt Chốt không Xe - Mã Pháo mưu Binh đại sự hàng đầu
  | "phaSiTuongCoXe"       // Bài 7: Tuyệt kỹ phá Sĩ Tượng - Tàn cuộc có Xe
  | "phaSiTuongKhongXe"    // Bài 8: Tuyệt kỹ phá Sĩ Tượng - Tàn cuộc không có Xe
  | "nguyenTacChiemTrung"  // Bài 9: Nguyên tắc chiếm trung - Chìa khóa sống còn
  | "loSuonApDay"          // Bài 10: Lộ sườn và tuyến sinh mệnh - Tuyến áp đáy
  | "maHoatChienThang"     // Bài 11: Mã hoạt đem lại chiến thắng - Mã Ngọa Tào
  | "bangXepHangBinhChung" // Bài 12: Bảng xếp hạng phối hợp binh chủng mạnh nhất
  | "binhChungHuuLoi"      // Bài 13: Binh chủng hữu lợi - Mã Pháo mạnh hơn Song Pháo
  | "binhQuyThanToc"       // Bài 14: Bí quyết chọn thời điểm tấn Tốt - Binh quý thần tốc
  | "siTuongPhongAn"       // Bài 15: Tuyệt kỹ dùng Sĩ Tượng phong ấn Song Mã
  | "tuongLinhHoat"        // Bài 16: Giữ vị trí Tướng linh hoạt - Thượng Tướng lầu hai
  | "laoBinhKhongChet"     // Bài 17: Chốt lụt vĩnh viễn không chết - Giá trị Lão Binh
  | "khuyetSiKyGi"        // Bài 18: Khuyết Sĩ kỵ gì - Tiểu tốt quá hà đính đại xe
  | "khuyetTuongKyPhao"    // Bài 19: Khuyết Tượng sợ Pháo - Môn cung sát cục
  | "coTanPhaoHoan"        // Bài 20: Cờ tàn Pháo hoàn - Pháo quy gia mượn Sĩ Tượng làm ngòi
  | "donTotKhongCheTuyen"  // Bài 21: Dọn Tốt khống chế tuyến - Thủ pháp phòng thủ đỉnh cao
  | "maThangPhao"          // Bài 22: Mã vs Pháo trong tàn cuộc - Sức mạnh định vị & kiểm soát không gian
  | "chienThuatKiemChe"    // Bài 23: Chiến thuật cờ tàn - Phép kiềm chế khóa chặt đối thủ
  | "chienThuatNuocCho"    // Bài 24: Chiến thuật cờ tàn - Nước chờ đợi thời cơ
  | "chienThuatVayKhon"    // Bài 25: Chiến thuật cờ tàn - Vây khốn bắt chết quân lớn
  | "kyThuatDonToa"        // Bài 26: Kỹ thuật đốn tỏa - Nghệ thuật điều quân khiến đối thủ tắt thở
  | "kyThuatDanhChan"      // Bài 27: Kỹ thuật đánh chặn - Tầm quan trọng của tư duy đại cục
  | "chienThuatCauHoa"     // Bài 28: Chiến thuật cầu hòa - Bài học xương máu về sự khắc nghiệt của cờ tàn
  | "chienThuatSamSet"     // Bài 29: Chiến thuật sấm sét - Lấy nhanh đánh chậm sát cục bất ngờ
  | "xePhaoHopCong"        // Bài 30: Tuyệt đỉnh tàn cuộc Xe Pháo - Xe Pháo hợp công sát cục
  | "xeMaLanhChieu"           // Bài 31: Xe Mã lãnh chiêu - Từ cổ phổ đến thực chiến đỉnh cao
  | "xeChotPhaSiTuong"        // Bài 32: Kỹ thuật Xe Chốt phá Sĩ Tượng - Đòn diệu thủ của Hồ Vinh Hoa
  | "songMaSongPhao"          // Bài 33: Tàn cuộc Song Mã Song Pháo - Đại binh đoàn tác chiến
  | "songMaPhaoDoiMaSongPhao" // Bài 34: Tàn cuộc Song Mã Pháo đối Mã Song Pháo - Xoay chuyển càn khôn
  | "maPhaoDoiMaPhao"         // Bài 35: Lý thuyết cốt lõi của tàn cuộc Mã Pháo đối Mã Pháo
  | "songPhaoDoiSongMa"       // Bài 36: Tàn cuộc Song Pháo đối Song Mã - Pháo khống chế Mã
  | "maTotDoiPhaoTot"         // Bài 37: Tàn cuộc Mã Tốt đối Pháo Tốt - Mã khống chế tuyến phá Pháo Tốt
  | "tamAnhChienLuBo"         // Bài 38: Tam Anh Chiến Lữ Bố - Đơn Xe phá tan quần hùng Mã Pháo
  | "maTotDayThangDonSiTuong" // Bài 39: Mã Tốt đáy thắng Đơn Sĩ Tượng - Nghệ thuật ép cung sát cục
  | "haiDeLaoNguyet"          // Bài 40: Xe Pháo khuyết Sĩ thắng Xe Pháo - Tuyệt kỹ Hải Để Lao Nguyệt
  | "canKhonDaiNaDi"          // Bài 41: Xe Pháo đơn Sĩ đối Xe Song Tượng - Sát pháp Càn Khôn Đại Nã Di
  | "xeMaDoiXeSongTuong"      // Bài 42: Xe Mã đối Xe Song Tượng - Giải mã bài toán thế kỷ
  | "thatTinhTuHoi"           // Bài 43: Cạm bẫy giăng kín trong cờ thế Thất Tinh Tụ Hội
  | "khauDanHangLong"         // Bài 44: Giải mã Tứ đại danh cuộc - Khâu Dẫn Hàng Long Bầy Tốt trói chặt Song Xe
  | "daMaThaoDien"            // Bài 45: Cờ thế giang hồ Dã Mã Thao Điền - Sức mạnh đáng sợ của Xe Mã lãnh chiêu
  | "thienLyDocHanh"          // Bài 46: Thiên Lý Độc Hành - Bí ẩn ván cờ tuyệt kỹ tàn cuộc Đơn Mã
  | "chienThuatVaTamLy"       // Bài 47: Bài học xương máu về chiến thuật và tâm lý trong tàn cuộc thực chiến
  | "banChatTanCuoc";         // Bài 48: Bản chất cốt lõi của tàn cuộc - Đỉnh cao triết lý cờ tàn

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

function countPieces(board: Board, side: Side, types: string): number {
  let count = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p && sideOf(p) === side && types.includes(typeOf(p))) count++;
  }
  return count;
}

function countAllPieces(board: Board, types: string): number {
  let count = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p && types.includes(typeOf(p))) count++;
  }
  return count;
}

function countCrossedPawns(board: Board, side: Side): number {
  let count = 0;
  for (let i = 0; i < 90; i++) {
    const p = board[i];
    if (p && sideOf(p) === side && typeOf(p) === "p" && crossedRiver(rowOf(i), side)) {
      count++;
    }
  }
  return count;
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

  const card = Object.values(ZHAO_ENDGAME_LESSONS).find((c) => c.tacticId === principle);
  if (card) {
    f.lesson = card.lesson;
    f.lessonTitle = card.title;
    if (card.quotes.length > 0) {
      f.quote = card.quotes[0];
      const [m, s] = card.quotes[0].at.split(":").map((x) => parseInt(x, 10));
      const sec = (m || 0) * 60 + (s || 0);
      f.videoUrl = `https://youtu.be/${card.video}?t=${sec}`;
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
// 11-16. 48 KỲ LÝ TÀN CUỘC TRIỆU HÂM HÂM (BÀI 1 - 6)
// ============================================================================

/**
 * Bài 1: Tại sao cần học tàn cuộc (Triệu Hâm Hâm)
 * Trong tàn cuộc ít quân, mỗi quân đều phát huy tối đa công năng (Mã uy hiếp 8 hướng, Xe mở rộng biên độ).
 * Khen khi quân lớn cơ động đến vị trí then chốt, gia tăng vượt bậc số nước đi hợp lệ.
 */
export function detectTaiSaoHocTanCuoc(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"rnc".includes(typeOf(piece)) || before[move.to] || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const type = typeOf(piece);

  if (inCheck(before, mover) || inCheck(after, opp)) return null;

  const mobBefore = legalMovesFrom({ board: before, turn: mover }, move.from).length;
  const mobAfter = legalMovesFrom({ board: after, turn: mover }, move.to).length;
  if (mobAfter < mobBefore + 2) return null;

  if (type === "n" && mobAfter >= 6) {
    return fact(before, move, "taiSaoHocTanCuoc",
      `Tại sao cần học tàn cuộc (Kỳ lý #1): ${nameOf(piece)} chuyển vị trí thông thoáng, phát huy tối đa công năng — "nước đi cụ thể chỉ giải quyết một vấn đề, còn kỳ lý giải quyết hầu hết các vấn đề".`);
  }

  if (type === "r" && mobAfter >= 10) {
    return fact(before, move, "taiSaoHocTanCuoc",
      `Tại sao cần học tàn cuộc (Kỳ lý #1): ${nameOf(piece)} chiếm cứ lộ rộng mở, kiểm soát thế trận tàn cuộc — "người chơi cờ kém chỉ nhìn thấy nước đi, người chơi cờ giỏi nhìn thấy nguyên lý".`);
  }

  return null;
}

/**
 * Bài 2: Phân loại tàn cục - Chuyển tàn cuộc thực chiến về tàn cuộc thực dụng (Triệu Hâm Hâm)
 * Trước nước đi chưa khớp định thức tàn cuộc thực dụng, sau nước đi đã đạt định thức tàn cuộc lý thuyết mẫu mực.
 */
export function detectPhanLoaiTanCuoc(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options)) return null;
  const mover = sideOf(piece);

  if (detectTheoreticalEndgame(before) !== null) return null;

  const settled = settledBoard(after, move, options);
  const res = theoreticalOutcome(settled, mover);
  if (!res) return null;
  const { outcome, eg } = res;

  if (outcome === "win" || outcome === "draw") {
    return fact(before, move, "phanLoaiTanCuoc",
      `Phân loại tàn cục (Kỳ lý #2): Chuyển hóa tàn cuộc thực chiến phức tạp về định thức tàn cuộc thực dụng "${eg.name}" (${outcome === "win" ? "thắng lý thuyết" : "hòa lý thuyết"}) — "không hiểu định thức tàn cuộc thực dụng cơ bản thì không thể đánh tốt tàn cuộc thực chiến".`,
      { endgame: eg.name });
  }

  return null;
}

/**
 * Bài 3: Điểm tới hạn của binh lực (Triệu Hâm Hâm)
 * Đơn quân mạnh (Xe/Mã/Pháo) thêm 2 Tốt là điểm tới hạn giữa thắng và hòa trước Sĩ Tượng toàn.
 * Khen khi bên công tập trung vượt qua điểm tới hạn: tiến Tốt hoặc điều quân mạnh hỗ trợ Tốt qua sông.
 */
export function detectDiemToiHanBinhLuc(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const majors = countPieces(after, mover, "rnc");
  const crossedPawns = countCrossedPawns(after, mover);
  if (majors < 1 || crossedPawns < 2) return null;

  const oppGuards = countPieces(after, opp, "ab");
  if (oppGuards < 3) return null;

  const isPawnAdvance = typeOf(piece) === "p" && crossedRiver(rowOf(move.to), mover);
  const isMajorSupport = "rnc".includes(typeOf(piece)) && (
    (mover === "r" && rowOf(move.to) <= 4) || (mover === "b" && rowOf(move.to) >= 5)
  );

  if (!isPawnAdvance && !isMajorSupport) return null;

  return fact(before, move, "diemToiHanBinhLuc",
    `Điểm tới hạn của binh lực (Kỳ lý #3): Đơn quân phối hợp 2 Tốt qua sông là điểm tới hạn mong manh giữa thắng và hòa trước Sĩ Tượng toàn — cần tập trung khoét sâu phòng tuyến.`);
}

/**
 * Bài 4: Binh và tàn Sĩ Tượng (Triệu Hâm Hâm)
 * Sĩ Tượng toàn có thể chống đỡ, nhưng nếu đối phương khuyết Sĩ hoặc Tượng thì Tốt áp sát khoét sâu,
 * hoặc Mã thoái lui khéo léo chuyển hướng đánh vào cánh khuyết (tàn cuộc Mã thoái lui đổi hướng là sát thủ).
 */
export function detectBinhTanSiTuong(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const oppGuards = countPieces(after, opp, "ab");
  if (oppGuards >= 4) return null;

  const crossedPawns = countCrossedPawns(after, mover);
  if (crossedPawns < 1) return null;

  const type = typeOf(piece);

  if (type === "p" && crossedRiver(rowOf(move.to), mover)) {
    const toRow = rowOf(move.to);
    const deepPawn = mover === "r" ? toRow <= 2 : toRow >= 7;
    if (deepPawn || before[move.to]) {
      return fact(before, move, "binhTanSiTuong",
        `Binh và tàn Sĩ Tượng (Kỳ lý #4): Đối phương khuyết Sĩ Tượng, Tốt khoét sâu vào điểm yếu phòng thủ — "bị khuyết sĩ tượng thì cơ bản là không còn đường sống".`);
    }
  }

  if (type === "n") {
    const isRetreat = mover === "r" ? rowOf(move.to) > rowOf(move.from) : rowOf(move.to) < rowOf(move.from);
    if (isRetreat) {
      return fact(before, move, "binhTanSiTuong",
        `Binh và tàn Sĩ Tượng (Kỳ lý #4): Mã thoái lui chuyển hướng độc hiểm, phối hợp cùng Tốt tấn công bên khuyết Sĩ Tượng — "tàn cuộc Mã thoái lui là đòn biến ảo khôn lường".`);
    }
  }

  return null;
}

/**
 * Bài 5: Mưu đoạt Chốt - Tàn cuộc có Xe (Triệu Hâm Hâm)
 * Uy lực của Xe là lớn nhất, quét Tốt là kỹ năng hàng đầu. Dùng Xe kiểm soát tuyến sông và quét sạch Tốt đối phương.
 */
export function detectMuuBinhCoXe(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r" || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);
  const victim = before[move.to];

  if (victim && typeOf(victim) === "p") {
    return fact(before, move, "muuBinhCoXe",
      `Mưu đoạt Chốt có Xe (Kỳ lý #5): Xe tiêu diệt Tốt đối phương — "uy lực của quân Xe là rất lớn, quét Tốt là kỹ năng hàng đầu của nó".`);
  }

  const targetRow = rowOf(move.to);
  const riverRow = mover === "r" ? 4 : 5;
  const oppPawnRow = mover === "r" ? 3 : 6;
  if (targetRow === riverRow || targetRow === oppPawnRow) {
    let threateningOppPawn = false;
    for (let i = 0; i < 90; i++) {
      const p = after[i];
      if (p && sideOf(p) === opp && typeOf(p) === "p") {
        if (attackersOf(after, i, mover).includes(move.to) || rowOf(i) === targetRow) {
          threateningOppPawn = true;
          break;
        }
      }
    }
    if (threateningOppPawn) {
      return fact(before, move, "muuBinhCoXe",
        `Mưu đoạt Chốt có Xe (Kỳ lý #5): Xe chiếm tuyến trọng yếu, phong tỏa và ngăn không cho Tốt đối phương vượt sông.`);
    }
  }

  return null;
}

/**
 * Bài 6: Mưu đoạt Chốt - Tàn cuộc không có Xe (Triệu Hâm Hâm)
 * Trong cờ tàn Mã Pháo không Xe, mưu Binh đoạt Tốt là đại sự hàng đầu quyết định kết quả ván đấu.
 */
export function detectMuuBinhKhongXe(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (countAllPieces(before, "r") > 0) return null;
  if (countPieces(before, mover, "nc") === 0) return null;

  const victim = before[move.to];
  const type = typeOf(piece);

  if (victim && typeOf(victim) === "p") {
    return fact(before, move, "muuBinhKhongXe",
      `Mưu đoạt Chốt không Xe (Kỳ lý #6): ${nameOf(piece)} ăn Tốt địch — "mưu Binh trong cờ Mã Pháo là đại sự hàng đầu, tuyệt đối đừng đánh giá thấp".`);
  }

  if ("nc".includes(type)) {
    for (let i = 0; i < 90; i++) {
      const p = after[i];
      if (p && sideOf(p) === opp && typeOf(p) === "p") {
        if (attackersOf(after, i, mover).includes(move.to) && !attackersOf(before, i, mover).includes(move.from)) {
          return fact(before, move, "muuBinhKhongXe",
            `Mưu đoạt Chốt không Xe (Kỳ lý #6): ${nameOf(piece)} cơ động truy kích tiêu diệt Tốt đối phương trong cờ tàn Mã Pháo.`);
        }
      }
    }
  }

  return null;
}


/**
 * Bài 7: Tuyệt kỹ phá Sĩ Tượng - Tàn cuộc có Xe (Triệu Hâm Hâm)
 * Trong tàn cuộc có Xe, nếu đối phương khuyết Sĩ hoặc khuyết Tượng (hoặc vị trí phòng thủ bị lệch),
 * Xe phối hợp cùng Mã/Tốt tung đòn tấn công vào điểm khuyết hoặc đi nước chờ khống chế cánh khuyết.
 */
export function detectPhaSiTuongCoXe(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const oppGuards = countPieces(before, opp, "ab");
  if (oppGuards === 0 || oppGuards >= 4) return null;

  const attackers = countPieces(after, mover, "ncp");
  if (attackers < 1) return null;

  const victim = before[move.to];
  const eatsGuard = victim && (typeOf(victim) === "a" || typeOf(victim) === "b");

  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const attacksPalace = (toCol >= 2 && toCol <= 6) && (mover === "r" ? toRow <= 2 : toRow >= 7);

  if (!eatsGuard && !attacksPalace) return null;

  return fact(before, move, "phaSiTuongCoXe",
    `Tuyệt kỹ phá Sĩ Tượng có Xe (Kỳ lý #7): Xe phối hợp khoét sâu vào cánh khuyết Sĩ Tượng — "nếu đối phương Sĩ Tượng toàn thì khó có hy vọng, nhưng khuyết Sĩ Tượng là cơ hội mở ra".`);
}

/**
 * Bài 8: Tuyệt kỹ phá Sĩ Tượng - Tàn cuộc không có Xe (Triệu Hâm Hâm)
 * Tàn cuộc không có Xe, Pháo Song Tốt hoặc Song Tốt vần phá Sĩ Tượng bằng kỹ thuật đợi nước và kiềm chế,
 * buộc đối phương phải phi Tượng hở sườn rồi thúc Tốt vây chết toàn bộ quân phòng thủ.
 */
export function detectPhaSiTuongKhongXe(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (countAllPieces(before, "r") > 0) return null;

  const oppGuards = countPieces(after, opp, "ab");
  if (oppGuards === 0) return null;

  const crossedPawns = countCrossedPawns(after, mover);
  const hasCannon = countPieces(after, mover, "c") >= 1;
  if (crossedPawns < 2 && !(crossedPawns >= 1 && hasCannon)) return null;

  const type = typeOf(piece);
  const isPawnMove = type === "p" && crossedRiver(rowOf(move.to), mover);
  const victim = before[move.to];
  const eatsGuard = victim && (typeOf(victim) === "a" || typeOf(victim) === "b");

  if (!isPawnMove && !eatsGuard) return null;

  return fact(before, move, "phaSiTuongKhongXe",
    `Tuyệt kỹ phá Sĩ Tượng không Xe (Kỳ lý #8): Song Tốt / Pháo Tốt kiềm chế Sĩ Tượng đối phương — "song tốt thắng song sĩ là cờ tàn lệ thắng tiêu chuẩn, đi nước chờ buộc địch hở sườn".`);
}

/**
 * Bài 9: Nguyên tắc chiếm trung trong cờ tàn (Triệu Hâm Hâm)
 * Ở tàn cuộc, các đường biên giảm bớt giá trị nhưng trung lộ (lộ 5) mãi mãi là trục sinh tử quan trọng nhất.
 * Khen quân lớn, Tốt hoặc Tướng chiếm giữ trung lộ, khóa chặt cửu cung đối phương.
 */
export function detectNguyenTacChiemTrung(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (colOf(move.from) === 4 || colOf(move.to) !== 4) return null;
  if (!"rkcp".includes(typeOf(piece))) return null;

  const oppKing = findKing(after, opp);
  if (oppKing < 0) return null;

  return fact(before, move, "nguyenTacChiemTrung",
    `Nguyên tắc chiếm trung (Kỳ lý #9): ${nameOf(piece)} chiếm giữ trung lộ then chốt — "trung lộ mãi mãi là đường quan trọng nhất, không chiếm được trung lộ gần như không thể thắng cờ".`);
}

/**
 * Bài 10: Lộ sườn và tuyến sinh mệnh - Tuyến áp đáy (Triệu Hâm Hâm)
 * Chiến thuật Tả Tốt Hữu Tướng: Tốt và Tướng trấn giữ hai đường sườn (lộ 4 và 6),
 * khống chế tuyến áp đáy thứ hai khóa chặt cửu cung không cho Tướng địch di chuyển.
 */
export function detectLoSuonApDay(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const toCol = colOf(move.to);
  if (toCol !== 3 && toCol !== 5) return null;

  const toRow = rowOf(move.to);
  const isSecondBottom = mover === "r" ? (toRow === 1 || toRow === 2) : (toRow === 7 || toRow === 8);
  if (!isSecondBottom) return null;

  const otherRibCol = toCol === 3 ? 5 : 3;
  let hasOtherRib = false;
  for (let i = 0; i < 90; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover && colOf(i) === otherRibCol && "kpr".includes(typeOf(p))) {
      hasOtherRib = true;
      break;
    }
  }

  if (!hasOtherRib) return null;

  return fact(before, move, "loSuonApDay",
    `Lộ sườn và tuyến áp đáy (Kỳ lý #10): Tả Tốt hữu Tướng trấn giữ hai lộ sườn, khống chế tuyến áp đáy tử huyệt — "tướng địch bị khóa chặt ở trung lộ, không thể di chuyển".`);
}

/**
 * Bài 11: Mã hoạt đem lại chiến thắng (Triệu Hâm Hâm)
 * Con Mã là chủ lực tuyệt đối trong tàn cuộc, vị trí Mã sống quyết định thắng bại.
 * Mã nhảy vào các điểm huyệt hoặc Ngọa Tào tạo thế công sát liên hoàn.
 */
export function detectMaHoatChienThang(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (inCheck(before, mover)) return null;

  const toRow = rowOf(move.to);
  const toCol = colOf(move.to);

  const isNgoaTao = mover === "r"
    ? ((toRow === 1 || toRow === 2) && (toCol === 1 || toCol === 2 || toCol === 6 || toCol === 7))
    : ((toRow === 7 || toRow === 8) && (toCol === 1 || toCol === 2 || toCol === 6 || toCol === 7));

  const wasThreatened = attackersOf(before, move.from, opp).length > 0;
  const mobAfter = legalMovesFrom({ board: after, turn: mover }, move.to).length;
  const escapedAndActive = wasThreatened && attackersOf(after, move.to, opp).length === 0 && mobAfter >= 4;

  if (!isNgoaTao && !escapedAndActive) return null;

  return fact(before, move, "maHoatChienThang",
    `Mã hoạt chiến thắng (Kỳ lý #11): Mã chiếm điểm huyệt xung yếu, phát huy sức mạnh chủ lực tuyệt đối — "trong tàn cuộc càng phải nhấn mạnh đến việc Mã sống".`);
}

/**
 * Bài 12: Bảng xếp hạng phối hợp binh chủng mạnh nhất trong cờ tàn (Triệu Hâm Hâm)
 * Tổ hợp Mã Pháo phối hợp là mạnh nhất trong cờ tàn.
 * Tận dụng sự hiệp đồng giữa tính cơ động của Mã và uy lực tầm xa của Pháo để kiểm soát thế trận.
 */
export function detectBangXepHangBinhChung(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const hasHorse = countPieces(after, mover, "n") >= 1;
  const hasCannon = countPieces(after, mover, "c") >= 1;
  if (!hasHorse || !hasCannon) return null;

  const type = typeOf(piece);
  if (type !== "n" && type !== "c") return null;

  let coordinated = false;
  for (let i = 0; i < 90; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover) {
      if (type === "n" && typeOf(p) === "c") {
        if (colOf(move.to) === colOf(i) || rowOf(move.to) === rowOf(i) || isDefended(after, i, mover)) {
          coordinated = true;
          break;
        }
      } else if (type === "c" && typeOf(p) === "n") {
        if (colOf(move.to) === colOf(i) || rowOf(move.to) === rowOf(i) || isDefended(after, i, mover)) {
          coordinated = true;
          break;
        }
      }
    }
  }

  if (!coordinated) return null;

  return fact(before, move, "bangXepHangBinhChung",
    `Phối hợp binh chủng tàn cuộc (Kỳ lý #12): Mã Pháo hiệp đồng tác chiến — "ở giai đoạn tàn cuộc, việc trang bị Mã Pháo nhất định là tốt nhất".`);
}


/**
 * Bài 13: Binh chủng hữu lợi - Tại sao Mã Pháo mạnh hơn Song Pháo (Triệu Hâm Hâm)
 * Ở tàn cuộc, tổ hợp Mã Pháo nắm giữ ưu thế binh chủng hữu lợi trước Song Pháo hoặc Song Mã.
 */
export function detectBinhChungHuuLoi(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const hasHorse = countPieces(after, mover, "n") >= 1;
  const hasCannon = countPieces(after, mover, "c") >= 1;
  if (!hasHorse || !hasCannon) return null;

  const oppDoubleCannon = countPieces(after, opp, "c") >= 2 && countPieces(after, opp, "n") === 0;
  const oppDoubleHorse = countPieces(after, opp, "n") >= 2 && countPieces(after, opp, "c") === 0;
  if (!oppDoubleCannon && !oppDoubleHorse) return null;

  return fact(before, move, "binhChungHuuLoi",
    `Binh chủng hữu lợi (Kỳ lý #13): Mã Pháo chiếm ưu thế trước ${oppDoubleCannon ? "Song Pháo" : "Song Mã"} — "biết rằng phối hợp Mã Pháo là tối ưu nhất, chính là nguyên tắc binh chủng hữu lợi".`);
}

/**
 * Bài 14: Bí quyết chọn thời điểm tấn Tốt - Binh quý thần tốc (Triệu Hâm Hâm)
 * Tốt từ trên cao xung xuống dưới cần chọn đúng thời cơ khi có sự hỗ trợ của quân lớn.
 */
export function detectBinhQuyThanToc(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (!crossedRiver(rowOf(move.to), mover)) return null;
  const isAdvance = mover === "r" ? rowOf(move.to) < rowOf(move.from) : rowOf(move.to) > rowOf(move.from);
  if (!isAdvance) return null;

  const toRow = rowOf(move.to);
  const isHighPawn = mover === "r" ? (toRow === 2 || toRow === 3) : (toRow === 6 || toRow === 7);
  if (!isHighPawn) return null;

  // Có quân lớn (Xe/Mã/Pháo) yểm trợ hoặc bảo vệ Tốt
  const supported = isDefended(after, move.to, mover) || countPieces(after, mover, "rnc") >= 1;
  if (!supported) return null;

  return fact(before, move, "binhQuyThanToc",
    `Binh quý thần tốc (Kỳ lý #14): Tấn Tốt đúng thời cơ với sự yểm trợ của quân lớn — "con tốt từ trên cao xung xuống cần chọn đúng thời điểm, tránh vội vàng thành tốt thấp".`);
}

/**
 * Bài 15: Tuyệt kỹ dùng Sĩ Tượng phong ấn Song Mã (Triệu Hâm Hâm)
 * Sĩ Tượng cản chân Mã hoặc làm ngòi cho Pháo công thủ toàn diện.
 */
export function detectSiTuongPhongAn(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"ab".includes(typeOf(piece)) || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Đối phương có Mã
  const oppHasHorse = countPieces(after, opp, "n") >= 1;
  const ownHasCannon = countPieces(after, mover, "c") >= 1;

  // Tượng bay lên làm ngòi cho Pháo hoặc cản đường Mã đối phương
  let restrictsHorse = false;
  for (let i = 0; i < 90; i++) {
    const p = after[i];
    if (p && sideOf(p) === opp && typeOf(p) === "n") {
      const mobBefore = legalMovesFrom({ board: before, turn: opp }, i).length;
      const mobAfter = legalMovesFrom({ board: after, turn: opp }, i).length;
      if (mobAfter < mobBefore) {
        restrictsHorse = true;
        break;
      }
    }
  }

  const servesAsMount = ownHasCannon && (colOf(move.to) === 4 || rowOf(move.to) === 2 || rowOf(move.to) === 7);
  if (!restrictsHorse && !servesAsMount) return null;

  return fact(before, move, "siTuongPhongAn",
    `Sĩ Tượng phong ấn (Kỳ lý #15): ${nameOf(piece)} điều động phong tỏa quân địch hoặc hỗ trợ thế trận — "Sĩ Tượng không chỉ phòng thủ đơn thuần mà còn là vũ khí lợi hại trong cờ tàn".`);
}

/**
 * Bài 16: Giữ vị trí Tướng linh hoạt trong cờ tàn (Triệu Hâm Hâm)
 * Thượng Tướng (lên lầu hai) là động tác chuẩn bị chiến lược kinh điển của bên công.
 */
export function detectTuongLinhHoat(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "k" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (inCheck(before, mover)) return null;

  const isStepUp = mover === "r"
    ? (rowOf(move.from) === 9 && rowOf(move.to) === 8)
    : (rowOf(move.from) === 0 && rowOf(move.to) === 1);

  if (!isStepUp) return null;

  return fact(before, move, "tuongLinhHoat",
    `Tướng linh hoạt lầu hai (Kỳ lý #16): Thượng Tướng mở rộng tầm hoạt động — "nước thượng tướng là động tác tiêu chuẩn, giúp đường ra của Tướng rộng mở hơn".`);
}

/**
 * Bài 17: Chốt lụt vĩnh viễn không chết - Lão Binh (Triệu Hâm Hâm)
 * Tốt đáy khống chế tuyến đáy cửu cung, khóa chân Tướng và Sĩ đối phương.
 */
export function detectLaoBinhKhongChet(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "p" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const botRow = bottomRow(mover);
  if (rowOf(move.from) !== botRow || rowOf(move.to) !== botRow) return null;

  const toCol = colOf(move.to);
  if (toCol < 2 || toCol > 6) return null;

  return fact(before, move, "laoBinhKhongChet",
    `Giá trị Lão Binh (Kỳ lý #17): Tốt đáy khống chế tuyến đáy cửu cung đối phương — "tốt đáy ít nhất có tác dụng khống chế tuyến đáy, là chìa khóa định đoạt ván cờ".`);
}

/**
 * Bài 18: Khuyết Sĩ kỵ gì - Khuyết Sĩ kỵ Song Xe Song Pháo (Triệu Hâm Hâm)
 * Đối phương khuyết Sĩ, Xe Tốt và Pháo khoét sâu vào điểm yếu mất Sĩ.
 */
export function detectKhuyetSiKyGi(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const oppAdvisors = countPieces(after, opp, "a");
  if (oppAdvisors >= 2) return null;

  const hasHeavy = countPieces(after, mover, "rc") >= 1;
  const crossedPawns = countCrossedPawns(after, mover);
  if (!hasHeavy || crossedPawns < 1) return null;

  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const targetsPalace = (toCol >= 2 && toCol <= 6) && (mover === "r" ? toRow <= 3 : toRow >= 6);
  if (!targetsPalace) return null;

  return fact(before, move, "khuyetSiKyGi",
    `Khuyết Sĩ kỵ Xe Tốt (Kỳ lý #18): Đối phương khuyết Sĩ, Xe Tốt khoét sâu vào cửu cung — "khuyết sĩ kỵ song xe, tiểu tốt quá hà đính đại xe".`);
}


/**
 * Bài 19: Khuyết Tượng sợ Pháo - Tuyệt kỹ Môn Cung sát cục (Triệu Hâm Hâm)
 * Trong tàn cuộc, đối phương khuyết Tượng, bên có Pháo phát huy uy lực tấn công sườn/đáy.
 */
export function detectKhuyetTuongKyPhao(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const oppElephants = countPieces(after, opp, "b");
  if (oppElephants >= 2) return null;

  const hasCannon = countPieces(after, mover, "c") >= 1;
  if (!hasCannon) return null;

  const captured = before[move.to];
  const isCapturingElephant = captured && typeOf(captured) === "b";

  const isCannonMove = typeOf(piece) === "c";
  const checksOpp = inCheck(after, opp);
  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const attacksPalaceFlank = (toCol === 2 || toCol === 6 || toCol === 4) && (mover === "r" ? toRow <= 4 : toRow >= 5);

  if (!isCapturingElephant && !isCannonMove && !attacksPalaceFlank && !checksOpp) return null;

  return fact(before, move, "khuyetTuongKyPhao",
    "Khuyết Tượng sợ Pháo (Kỳ lý #19): Khai thác điểm yếu khuyết Tượng của đối phương — \"khi cờ tàn khuyết tượng còn sợ pháo kinh khủng hơn nữa\".");
}

/**
 * Bài 20: Cờ tàn Pháo hoàn - Nguyên tắc sống còn của quân Pháo (Triệu Hâm Hâm)
 * Tàn cuộc Pháo thoái lui về trận địa nhà, mượn Sĩ Tượng phe mình làm ngòi nổ công thủ toàn diện.
 */
export function detectCoTanPhaoHoan(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "c" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);

  // Pháo thoái lui về hướng sân nhà
  const isRetreat = mover === "r"
    ? rowOf(move.to) > rowOf(move.from)
    : rowOf(move.to) < rowOf(move.from);
  if (!isRetreat) return null;

  // Điểm đến nằm trên sân nhà (chưa qua sông)
  if (crossedRiver(rowOf(move.to), mover)) return null;

  // Có Sĩ hoặc Tượng phe mình làm ngòi nổ, hoặc điểm đến là cung/tuyến phòng ngự sâu
  const hasMounts = countPieces(after, mover, "ab") >= 1;
  const toRow = rowOf(move.to);
  const isDefensiveBaseline = mover === "r" ? toRow >= 7 : toRow <= 2;
  if (!hasMounts && !isDefensiveBaseline) return null;

  return fact(before, move, "coTanPhaoHoan",
    "Cờ tàn Pháo hoàn (Kỳ lý #20): Pháo thoái về trận địa nhà công thủ toàn diện — \"lúc này pháo tự nhiên cần phải quay về nhà, mượn sĩ tượng của phe mình làm ngòi thì mới có thể phát huy uy lực lớn nhất\".");
}

/**
 * Bài 21: Dọn Tốt khống chế tuyến - Thủ pháp phòng thủ đỉnh cao (Triệu Hâm Hâm)
 * Dùng Xe kiểm soát tuyến tuần hà / tuyến chốt, ngăn hoặc tiêu diệt Tốt đối phương qua sông.
 */
export function detectDonTotKhongCheTuyen(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "r" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const captured = before[move.to];
  const eatsOppPawn = captured && typeOf(captured) === "p";

  // Hoặc Xe tuần hà / giữ tuyến khống chế Tốt địch
  const patrolRow = mover === "r" ? 5 : 4;
  const enemyPawnRow = mover === "r" ? 6 : 3;
  const toRow = rowOf(move.to);
  const controlsPatrol = toRow === patrolRow || toRow === enemyPawnRow;

  const oppHasPawn = countPieces(after, opp, "p") >= 1;
  if (!eatsOppPawn && (!controlsPatrol || !oppHasPawn)) return null;

  return fact(before, move, "donTotKhongCheTuyen",
    "Dọn Tốt khống chế tuyến (Kỳ lý #21): Xe khống chế tuyến tuần hà, tiêu trừ Tốt địch — \"xe bám chặt lấy tuyến tuần hà, ngăn không để tốt đối phương qua sông\".");
}

/**
 * Bài 22: Mã vs Pháo trong tàn cuộc - Sức mạnh định vị & kiểm soát không gian (Triệu Hâm Hâm)
 * Mã khống trường, định vị, tạo hình vượt trội trong cờ tàn, chiếm lĩnh điểm huyệt.
 */
export function detectMaThangPhao(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || typeOf(piece) !== "n" || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Mã qua sông vào vị trí tiến công
  if (!crossedRiver(rowOf(move.to), mover)) return null;

  const toRow = rowOf(move.to);
  const toCol = colOf(move.to);

  // Điểm huyệt tấn công hoặc áp sát cung đối phương
  const isAttackingPoint = (toCol >= 1 && toCol <= 7) && (mover === "r" ? toRow <= 3 : toRow >= 6);
  const checksOpp = inCheck(after, opp);

  if (!isAttackingPoint && !checksOpp) return null;

  return fact(before, move, "maThangPhao",
    "Mã khống chế không gian (Kỳ lý #22): Mã chiếm điểm huyệt định vị — \"mã là bát diện uy phong, nên phạm vi khống chế của nó là một vòng tròn, phát huy năng lực định vị trong tàn cuộc\".");
}

/**
 * Bài 23: Chiến thuật cờ tàn chủ yếu - Phép kiềm chế khóa chặt đối thủ (Triệu Hâm Hâm)
 * Ghim chặt quân chủ lực (Xe, Mã, Pháo) của đối thủ vào thế bất động, không nhúc nhích được.
 */
export function detectChienThuatKiemChe(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !"rcn".includes(typeOf(piece)) || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Phép kiềm chế tàn cuộc: phải có quân địch (Xe, Mã, Pháo) để kiềm chế
  const oppMajors = countPieces(after, opp, "rnc");
  if (oppMajors === 0) return null;

  // Kiểm tra xem sau nước đi, có quân chủ lực (r, n, c) của đối phương bị ghim cứng (0 nước hợp lệ) không
  let immobilizesOppMajor = false;
  for (let i = 0; i < 90; i++) {
    const oppP = after[i];
    if (oppP && sideOf(oppP) === opp && "rcn".includes(typeOf(oppP))) {
      const oppMob = legalMovesFrom({ board: after, turn: opp }, i).length;
      if (oppMob === 0) {
        immobilizesOppMajor = true;
        break;
      }
    }
  }

  // Hoặc tổng số nước đi của đối phương bị hạn chế gắt gao (<= 8 nước) và giảm so với trước
  const mobBefore = legalMoves({ board: before, turn: opp }).length;
  const mobAfter = legalMoves({ board: after, turn: opp }).length;
  const severelyRestricts = mobAfter < mobBefore && mobAfter <= 8;

  if (!immobilizesOppMajor && !severelyRestricts) return null;

  return fact(before, move, "chienThuatKiemChe",
    "Chiến thuật kiềm chế (Kỳ lý #23): Khóa chặt quân địch vào thế bất động — \"khiến đối phương hoàn toàn không con nào nhúc nhích được, là chiến thuật kinh điển trong tàn cuộc\".");
}

/**
 * Bài 24: Chiến thuật cờ tàn chủ yếu - Nước chờ đợi thời cơ (Triệu Hâm Hâm)
 * Đi một nước chờ tinh tế ép đối phương phải tự đi và làm tan vỡ hàng phòng thủ (zugzwang).
 */
export function detectChienThuatNuocCho(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  if (before[move.to]) return null; // Không phải nước ăn quân
  const mover = sideOf(piece);
  const opp = opponent(mover);

  if (inCheck(before, mover) || inCheck(after, opp)) return null;

  // Nước đi của Tướng, Sĩ, Tượng hoặc nước nhích ngang nhẹ của Xe/Tốt
  const pType = typeOf(piece);
  const isQuietType = "kab".includes(pType) || (pType === "r" && rowOf(move.from) === rowOf(move.to));
  if (!isQuietType) return null;

  // Đối phương bị hạn chế nước đi và buộc phải tự làm vỡ trận
  const oppReplies = legalMoves({ board: after, turn: opp }).length;
  if (oppReplies === 0 || oppReplies > 10) return null;

  return fact(before, move, "chienThuatNuocCho",
    "Chiến thuật nước chờ (Kỳ lý #24): Nước đợi ép đối thủ tự làm vỡ trận — \"đạt tới cảnh giới: cho bạn đi, ép bạn đi, làm bạn thấy đi còn không bằng không đi\".");
}


/**
 * Bài 25: Chiến thuật cờ tàn chủ yếu - Vây khốn bắt chết quân lớn (Triệu Hâm Hâm)
 * Cản chân, bao vây bắt chết quân lớn (Mã, Xe) của đối thủ trong tàn cuộc.
 */
export function detectChienThuatVayKhon(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const captured = before[move.to];
  const eatsMajor = captured && "nr".includes(typeOf(captured));

  // Kiểm tra xem sau nước đi, có Mã hoặc Xe của đối phương bị cản chân / bao vây (0 nước hợp lệ) không
  let trapsMajor = false;
  for (let i = 0; i < 90; i++) {
    const oppP = after[i];
    if (oppP && sideOf(oppP) === opp && "nr".includes(typeOf(oppP))) {
      const oppMob = legalMovesFrom({ board: after, turn: opp }, i).length;
      if (oppMob === 0) {
        trapsMajor = true;
        break;
      }
    }
  }

  if (!eatsMajor && !trapsMajor) return null;

  return fact(before, move, "chienThuatVayKhon",
    "Chiến thuật vây khốn (Kỳ lý #25): Cản chân, bao vây bắt chết quân lớn của đối thủ — \"do đặc tính di chuyển của nó quyết định, bởi vì mã có chân, chỉ cần bị cản chân là con mã này khó mà di chuyển\".");
}

/**
 * Bài 26: Kỹ thuật đốn tỏa - Nghệ thuật điều quân khiến đối thủ tắt thở (Triệu Hâm Hâm)
 * Chiếu tướng hoặc dọa bắt quân tranh tiên ép đối phương phải điều chỉnh vị trí lệch vị.
 */
export function detectKyThuatDonToa(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Phải là nước chiếu tướng tranh tiên
  if (!inCheck(after, opp)) return null;

  // Ép đối phương chỉ có tối đa 2 nước chống đỡ (buộc phải điều chỉnh vị trí)
  const oppReplies = legalMoves({ board: after, turn: opp }).length;
  if (oppReplies === 0 || oppReplies > 2) return null;

  return fact(before, move, "kyThuatDonToa",
    "Kỹ thuật đốn tỏa (Kỳ lý #26): Chiếu tướng tranh tiên ép đối phương lệch vị — \"thông qua việc chiếu tướng, bắt quân để giành nước tiên, buộc đối phương phải điều chỉnh vị trí thành những vị trí có lợi cho chúng ta\".");
}

/**
 * Bài 27: Kỹ thuật đánh chặn - Tầm quan trọng của tư duy đại cục (Triệu Hâm Hâm)
 * Dùng Pháo (Pháo gánh/Đạn tử pháo) hoặc Xe/Mã chắn ngang phong tỏa hỏa lực đối phương từ xa.
 */
export function detectKyThuatDanhChan(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Đối phương có Xe hoặc Pháo đang nhắm tới
  const oppHeavy = countPieces(after, opp, "rc");
  if (oppHeavy === 0) return null;

  // Di chuyển Pháo tạo thế Pháo gánh (2 Pháo bảo vệ nhau hoặc cùng kiểm soát lộ trọng yếu)
  const isCannonMove = typeOf(piece) === "c";
  const ownCannons = countPieces(after, mover, "c");
  const linkedCannons = isCannonMove && ownCannons >= 2 && (rowOf(move.to) === 2 || rowOf(move.to) === 7 || colOf(move.to) === 4);

  // Hoặc quân di chuyển chắn ngang lộ 4/5/6 chặn đường cắm đáy của Xe/Pháo địch
  const toCol = colOf(move.to);
  const interceptsKeyFile = (toCol === 3 || toCol === 4 || toCol === 5) && !crossedRiver(rowOf(move.to), mover);

  if (!linkedCannons && !interceptsKeyFile) return null;

  return fact(before, move, "kyThuatDanhChan",
    "Kỹ thuật đánh chặn (Kỳ lý #27): Chắn tuyến phong tỏa hỏa lực từ xa — \"chiến thuật đánh chặn không chỉ dùng riêng cho phòng ngự, mà ở khâu tấn công nó cũng có những màn thể hiện rất xuất sắc\".");
}

/**
 * Bài 28: Chiến thuật cầu hòa - Bài học xương máu về sự khắc nghiệt của cờ tàn (Triệu Hâm Hâm)
 * Khi ở thế yếu hoặc kém quân, đổi quân khéo léo hoặc diệt Tốt địch để quy về thế hòa chuẩn mực.
 */
export function detectChienThuatCauHoa(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Đang ở thế kém quân hoặc điểm đánh giá thấp/cân bằng
  const evalScore = options?.evalBefore?.score ?? 0;
  const moverScore = mover === "r" ? evalScore : -evalScore;
  if (moverScore > 100) return null;

  const captured = before[move.to];
  const eatsPawn = captured && typeOf(captured) === "p";
  const theoretical = detectTheoreticalEndgame(after);
  const leadsToDraw = theoretical !== null && theoretical.outcome === "draw";

  if (!eatsPawn && !leadsToDraw) return null;

  return fact(before, move, "chienThuatCauHoa",
    "Chiến thuật cầu hòa (Kỳ lý #28): Nghệ thuật thủ hòa trong nghịch cảnh — \"trong tình huống binh lực bất lợi, việc lợi dụng những kỹ xảo cầu hòa khéo léo để giành được kết quả hòa, tránh việc bị thua cờ\".");
}

/**
 * Bài 29: Chiến thuật sấm sét - Lấy nhanh đánh chậm sát cục bất ngờ (Triệu Hâm Hâm)
 * Đột kích cục bộ chớp nhoáng, lấy nhanh đánh chậm tạo sát cục bất ngờ trước khi địch kịp trở tay.
 */
export function detectChienThuatSamSet(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Nước đi tấn công nhanh: chiếu tướng hoặc tạo thế sát cục áp sát cửu cung
  const checksOpp = inCheck(after, opp);
  const pressure = palacePressure(after, mover);
  if (!checksOpp && pressure < 2) return null;

  // Quân đi là Mã, Xe, Pháo hoặc Tốt áp sát
  const pType = typeOf(piece);
  if (!"nrcp".includes(pType)) return null;

  // Điểm đến áp sát cửu cung
  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const targetsPalace = (toCol >= 1 && toCol <= 7) && (mover === "r" ? toRow <= 3 : toRow >= 6);
  if (!targetsPalace) return null;

  return fact(before, move, "chienThuatSamSet",
    "Chiến thuật sấm sét (Kỳ lý #29): Đột kích cục bộ chớp nhoáng — \"bất kể quân số hiện tại ra sao, chỉ cần tôi tạo được đột phá ở cục bộ, tôi hoàn toàn có thể đánh thẳng vào điểm yếu để giành chiến thắng ngay\".");
}

/**
 * Bài 30: Tuyệt đỉnh tàn cuộc Xe Pháo - Xe Pháo hợp công sát cục (Triệu Hâm Hâm)
 * Xe Pháo hiệp đồng tác chiến đỉnh cao trong tàn cuộc, kết hợp tạo đòn thiểm kích kết liễu.
 */
export function detectXePhaoHopCong(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);

  // Mover phải có cả Xe lẫn Pháo trong tàn cuộc
  const hasRook = countPieces(after, mover, "r") >= 1;
  const hasCannon = countPieces(after, mover, "c") >= 1;
  if (!hasRook || !hasCannon) return null;

  // Quân đi là Xe hoặc Pháo
  const pType = typeOf(piece);
  if (pType !== "r" && pType !== "c") return null;

  // Nước đi tiến công qua sông áp sát hoặc phối hợp công kích
  if (!crossedRiver(rowOf(move.to), mover)) return null;

  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const attacksPalace = (toCol >= 1 && toCol <= 7) && (mover === "r" ? toRow <= 4 : toRow >= 5);
  if (!attacksPalace) return null;

  return fact(before, move, "xePhaoHopCong",
    "Xe Pháo hợp công (Kỳ lý #30): Xe Pháo phối hợp công sát đỉnh cao — \"tung ngay đòn thiểm kích, trực tiếp vỗ mặt trầm để pháo, phát huy tối đa uy lực của tổ hợp Xe Pháo trong tàn cuộc\".");
}


/**
 * Bài 31: Xe Mã lãnh chiêu - Từ cổ phổ đến thực chiến đỉnh cao (Triệu Hâm Hâm)
 * Xe Mã phối hợp tung đòn nguội hiểm hóc, chém Sĩ/Tượng hoặc đột kích kết liễu đối thủ.
 */
export function detectXeMaLanhChieu(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Phe đi phải có cả Xe lẫn Mã trong tàn cuộc
  const hasRook = countPieces(after, mover, "r") >= 1;
  const hasHorse = countPieces(after, mover, "n") >= 1;
  if (!hasRook || !hasHorse) return null;

  const pType = typeOf(piece);
  if (pType !== "r" && pType !== "n") return null;

  const captured = before[move.to];
  const eatsGuard = captured && "ab".includes(typeOf(captured));
  const checksOpp = inCheck(after, opp);
  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const attacksPalace = (toCol >= 1 && toCol <= 7) && (mover === "r" ? toRow <= 3 : toRow >= 6);

  if (!eatsGuard && !checksOpp && !attacksPalace) return null;

  return fact(before, move, "xeMaLanhChieu",
    "Xe Mã lãnh chiêu (Kỳ lý #31): Đòn nguội độc hiểm kết liễu đối thủ — \"đó chính là xe mã lãnh chiêu, đòn nguội xe mã, phối hợp tác chiến với uy lực sát phạt cực mạnh\".");
}

/**
 * Bài 32: Kỹ thuật Xe Chốt phá Sĩ Tượng - Đòn diệu thủ của Hồ Vinh Hoa (Triệu Hâm Hâm)
 * Xe Tốt phối hợp mưu đoạt hoặc dùng đòn diệu thủ phế quân phá tan hàng phòng thủ Sĩ Tượng.
 */
export function detectXeChotPhaSiTuong(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const hasRook = countPieces(after, mover, "r") >= 1;
  const hasCrossedPawn = countCrossedPawns(after, mover) >= 1;
  if (!hasRook || !hasCrossedPawn) return null;

  const pType = typeOf(piece);
  if (pType !== "r" && pType !== "p") return null;

  const captured = before[move.to];
  const eatsGuard = captured && "ab".includes(typeOf(captured));
  const toCol = colOf(move.to);
  const toRow = rowOf(move.to);
  const penetratesPalace = (toCol >= 2 && toCol <= 6) && (mover === "r" ? toRow <= 2 : toRow >= 7);

  const oppGuards = countPieces(after, opp, "ab");
  if (oppGuards >= 4 && !eatsGuard) return null;

  if (!eatsGuard && !penetratesPalace) return null;

  return fact(before, move, "xeChotPhaSiTuong",
    "Xe Tốt phá Sĩ Tượng (Kỳ lý #32): Xe Tốt hiệp đồng phá vỡ phòng tuyến — \"thí quân tranh tiên mưu đoạt Sĩ Tượng, mở toang cửu cung để Xe Tốt đột kích dứt điểm\".");
}

/**
 * Bài 33: Tàn cuộc Song Mã Song Pháo - Đại binh đoàn tác chiến (Triệu Hâm Hâm)
 * Tác chiến tàn cuộc đại binh đoàn không Xe, tranh chấp và bảo toàn từng con Tốt then chốt.
 */
export function detectSongMaSongPhao(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);

  // Bàn cờ không còn Xe
  if (countPieces(after, "r", "r") > 0 || countPieces(after, "b", "r") > 0) return null;

  // Phe đi có đại binh đoàn Mã Pháo (tổng cộng ít nhất 3 quân Mã/Pháo)
  const ownHeavy = countPieces(after, mover, "nc");
  if (ownHeavy < 3) return null;

  return fact(before, move, "songMaSongPhao",
    "Đại binh đoàn Mã Pháo (Kỳ lý #33): Tác chiến tàn cuộc không Xe — \"vào tàn mã pháo mà thiếu tốt, dù chỉ thiếu một con tốt thôi, bạn cũng sẽ thấy cực kỳ áp lực\".");
}

/**
 * Bài 34: Tàn cuộc Song Mã Pháo đối Mã Song Pháo - Xoay chuyển càn khôn (Triệu Hâm Hâm)
 * Cuộc chiến so tài giữa tổ hợp 2 Mã 1 Pháo và 1 Mã 2 Pháo trong cờ tàn không Xe.
 */
export function detectSongMaPhaoDoiMaSongPhao(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Bàn cờ không còn Xe
  if (countPieces(after, "r", "r") > 0 || countPieces(after, "b", "r") > 0) return null;

  const moverHorses = countPieces(after, mover, "n");
  const moverCannons = countPieces(after, mover, "c");
  const oppHorses = countPieces(after, opp, "n");
  const oppCannons = countPieces(after, opp, "c");

  const isMover2H1C = moverHorses >= 2 && moverCannons >= 1 && oppHorses >= 1 && oppCannons >= 2;
  const isMover1H2C = moverHorses >= 1 && moverCannons >= 2 && oppHorses >= 2 && oppCannons >= 1;

  if (!isMover2H1C && !isMover1H2C) return null;

  return fact(before, move, "songMaPhaoDoiMaSongPhao",
    "Song Mã Pháo đối Mã Song Pháo (Kỳ lý #34): So tài binh chủng bất đối xứng — \"phải đặt vào thế trận cụ thể mới phán đoán chính xác được bên nào chiếm ưu thế\".");
}

/**
 * Bài 35: Lý thuyết cốt lõi của tàn cuộc Mã Pháo đối Mã Pháo (Triệu Hâm Hâm)
 * Tàn cuộc Đơn Mã Pháo đối Đơn Mã Pháo không Xe, tinh vi từng bước tranh đoạt ưu thế và thủ hòa.
 */
export function detectMaPhaoDoiMaPhao(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Bàn cờ không còn Xe
  if (countPieces(after, "r", "r") > 0 || countPieces(after, "b", "r") > 0) return null;

  // Cả hai bên đều có đúng 1 Mã và 1 Pháo
  const moverHorses = countPieces(after, mover, "n");
  const moverCannons = countPieces(after, mover, "c");
  const oppHorses = countPieces(after, opp, "n");
  const oppCannons = countPieces(after, opp, "c");

  if (moverHorses !== 1 || moverCannons !== 1 || oppHorses !== 1 || oppCannons !== 1) return null;

  return fact(before, move, "maPhaoDoiMaPhao",
    "Tàn cuộc Mã Pháo đối Mã Pháo (Kỳ lý #35): Tinh vi từng bước tranh đoạt ưu thế — \"một ván cờ theo lý thuyết là hòa, nhưng thực chiến đòi hỏi công phu cực kỳ sâu sắc mới thủ hòa thành công\".");
}

/**
 * Bài 36: Tàn cuộc Song Pháo đối Song Mã - Pháo khống chế Mã (Triệu Hâm Hâm)
 * Song Pháo kiểm soát hai bên cánh, kiềm chế và phong tỏa tầm hoạt động của Song Mã đối thủ.
 */
export function detectSongPhaoDoiSongMa(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Bàn cờ không còn Xe
  if (countPieces(after, "r", "r") > 0 || countPieces(after, "b", "r") > 0) return null;

  // Phe đi có Song Pháo (không có Mã), đối phương có Song Mã (không có Pháo)
  const moverCannons = countPieces(after, mover, "c");
  const moverHorses = countPieces(after, mover, "n");
  const oppCannons = countPieces(after, opp, "c");
  const oppHorses = countPieces(after, opp, "n");

  if (moverCannons < 2 || moverHorses > 0 || oppHorses < 2 || oppCannons > 0) return null;

  return fact(before, move, "songPhaoDoiSongMa",
    "Song Pháo đối Song Mã (Kỳ lý #36): Pháo khống chế hai cánh — \"lý do tấn công cánh là vì đôi mã của bên đối phương lùi về phòng thủ khá là khó khăn\".");
}

// ============================================================================
// TỔNG HỢP
// ============================================================================

type Detector = (before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions) => EndgamePrincipleFact | null;

/**
 * Bài 37: Tàn cuộc Mã Tốt đối Pháo Tốt - Mã khống chế tuyến phá Pháo Tốt (Triệu Hâm Hâm)
 * Tàn cuộc không Xe: Mã Tốt so tài cùng Pháo Tốt; Mã linh hoạt khống chế tuyến, tránh đổi quân đơn giản, phát động công kích chớp nhoáng.
 */
export function detectMaTotDoiPhaoTot(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Không còn Xe trên bàn cờ
  if (countPieces(after, "r", "r") > 0 || countPieces(after, "b", "r") > 0) return null;

  const moverHorses = countPieces(after, mover, "n");
  const moverCannons = countPieces(after, mover, "c");
  const moverPawns = countPieces(after, mover, "p");
  const oppHorses = countPieces(after, opp, "n");
  const oppCannons = countPieces(after, opp, "c");
  const oppPawns = countPieces(after, opp, "p");

  // Một bên có Mã + Tốt (không Pháo), bên kia có Pháo + Tốt (không Mã)
  const isHorseVsCannon =
    (moverHorses >= 1 && moverCannons === 0 && moverPawns >= 1 && oppCannons >= 1 && oppHorses === 0 && oppPawns >= 1) ||
    (moverCannons >= 1 && moverHorses === 0 && moverPawns >= 1 && oppHorses >= 1 && oppCannons === 0 && oppPawns >= 1);

  if (!isHorseVsCannon) return null;

  return fact(before, move, "maTotDoiPhaoTot",
    "Mã Tốt đối Pháo Tốt (Kỳ lý #37): Mã khống chế tuyến phá Pháo Tốt — \"đối không được đổi quân một cách đơn giản, trực tiếp phát động chiến tranh chớp nhoáng, đánh nhanh thắng nhanh\".");
}

/**
 * Bài 38: Tam Anh Chiến Lữ Bố - Đơn Xe phá tan quần hùng Mã Pháo Tốt (Triệu Hâm Hâm)
 * Cục diện một Xe (Lữ Bố) đối đầu tổ hợp ba quân nhẹ (Tam Anh - Mã Pháo Tốt hoặc Song Mã, Song Pháo).
 */
export function detectTamAnhChienLuBo(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  const moverRooks = countPieces(after, mover, "r");
  const moverMinors = countPieces(after, mover, "nc");
  const oppRooks = countPieces(after, opp, "r");
  const oppMinors = countPieces(after, opp, "nc");

  // Một bên có đúng 1 Xe và 0 quân nhẹ (Mã, Pháo)
  // Bên kia có 0 Xe và ít nhất 2 quân nhẹ (Mã, Pháo)
  const isRookVsMinors =
    (moverRooks === 1 && moverMinors === 0 && oppRooks === 0 && oppMinors >= 2) ||
    (moverRooks === 0 && moverMinors >= 2 && oppRooks === 1 && oppMinors === 0);

  if (!isRookVsMinors) return null;

  return fact(before, move, "tamAnhChienLuBo",
    "Tam Anh Chiến Lữ Bố (Kỳ lý #38): Đơn Xe đấu quần hùng Mã Pháo — \"uy lực của xe quả thực là vô cùng lớn, đặc biệt là ở giai đoạn tàn cuộc... đây là một ván cờ điển hình của cục diện tam anh chiến Lã Bố\".");
}

/**
 * Bài 39: Mã Tốt đáy thắng Đơn Sĩ Tượng - Nghệ thuật ép cung sát cục (Triệu Hâm Hâm)
 * Mã Tốt lụt (ở hàng đáy) phối hợp Tướng ép cung phá Đơn Sĩ Tượng, khai thác đại kỵ Tướng Tượng cùng cánh.
 */
export function detectMaTotDayThangDonSiTuong(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Không có Xe, không có Pháo
  if (countPieces(after, "r", "rc") > 0 || countPieces(after, "b", "rc") > 0) return null;

  // Bên công có Mã và Tốt
  const moverHorses = countPieces(after, mover, "n");
  const moverPawns = countPieces(after, mover, "p");
  if (moverHorses < 1 || moverPawns < 1) return null;

  // Kiểm tra có ít nhất 1 Tốt của bên công ở hàng đáy hoặc cận đáy
  const botRow = bottomRow(mover);
  let hasBottomPawn = false;
  for (let i = 0; i < 90; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover && typeOf(p) === "p") {
      const r = rowOf(i);
      if (r === botRow || Math.abs(r - botRow) <= 1) {
        hasBottomPawn = true;
        break;
      }
    }
  }
  if (!hasBottomPawn) return null;

  // Bên thủ có Đơn Sĩ Tượng hoặc tàn khuyết (tổng số Sĩ + Tượng <= 2)
  const oppGuards = countPieces(after, opp, "ab");
  if (oppGuards > 2) return null;

  return fact(before, move, "maTotDayThangDonSiTuong",
    "Mã Tốt đáy thắng Đơn Sĩ Tượng (Kỳ lý #39): Nghệ thuật ép cung sát cục — \"tướng và tượng nằm cùng bên là đại kỵ... đây là một hình cờ dứt điểm quá kinh điển, chiêu này mọi người bắt buộc phải thuộc nằm lòng\".");
}

/**
 * Bài 40: Xe Pháo khuyết Sĩ thắng Xe Pháo - Tuyệt kỹ Hải Để Lao Nguyệt (Triệu Hâm Hâm)
 * Sát pháp Mò Trăng Đáy Biển: Pháo lặn xuống đáy luồn sau lưng Tướng địch, mượn Xe/Tướng làm ngòi kết liễu.
 */
export function detectHaiDeLaoNguyet(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Cả hai bên đều có Xe và Pháo
  if (countPieces(after, mover, "r") < 1 || countPieces(after, mover, "c") < 1) return null;
  if (countPieces(after, opp, "r") < 1 || countPieces(after, opp, "c") < 1) return null;

  // Quân đi là Pháo hoặc Xe
  const pType = typeOf(piece);
  if (pType !== "c" && pType !== "r") return null;

  // Pháo nằm hoặc di chuyển ở tuyến đáy của đối phương
  const botRow = bottomRow(mover);
  let cannonAtBottom = false;
  for (let i = 0; i < 90; i++) {
    const p = after[i];
    if (p && sideOf(p) === mover && typeOf(p) === "c" && rowOf(i) === botRow) {
      cannonAtBottom = true;
      break;
    }
  }
  if (!cannonAtBottom && rowOf(move.to) !== botRow) return null;

  return fact(before, move, "haiDeLaoNguyet",
    "Hải Để Lao Nguyệt (Kỳ lý #40): Tuyệt kỹ Xe Pháo mò trăng đáy biển — \"cách thắng này gọi là hải để lao nguyệt... đỏ lập tức tung ra đòn hải để lao nguyệt\".");
}

/**
 * Bài 41: Xe Pháo đơn Sĩ đối Xe Song Tượng - Sát pháp Càn Khôn Đại Nã Di (Triệu Hâm Hâm)
 * Xe Pháo đơn Sĩ đối Xe Song Tượng: Sát pháp thăng giáng Pháo và chuyển Xe ép Song Tượng đối phương lùi đáy tiêu diệt.
 */
export function detectCanKhonDaiNaDi(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Bên công có 1 Xe + 1 Pháo (0 Mã)
  if (countPieces(after, mover, "r") !== 1 || countPieces(after, mover, "c") !== 1 || countPieces(after, mover, "n") > 0) return null;

  // Bên thủ có 1 Xe + 2 Tượng (0 Mã, 0 Pháo, 0 Sĩ)
  if (
    countPieces(after, opp, "r") !== 1 ||
    countPieces(after, opp, "b") !== 2 ||
    countPieces(after, opp, "a") > 0 ||
    countPieces(after, opp, "nc") > 0
  ) return null;

  return fact(before, move, "canKhonDaiNaDi",
    "Càn Khôn Đại Nã Di (Kỳ lý #41): Sát pháp Xe Pháo đơn Sĩ đối Xe Song Tượng — \"nội dung bài giảng này cực kỳ chuyên sâu... lúc này phải dùng càn khôn đại nã di để giải quyết các vấn đề trên\".");
}

/**
 * Bài 42: Xe Mã đối Xe Song Tượng - Giải mã bài toán thế kỷ (Triệu Hâm Hâm)
 * Bài toán thiên cổ nghi nan: Xe Mã phối hợp chèn mắt Tượng (\"tằm ăn dâu\") phá tan cặp Tượng đối phương.
 */
export function detectXeMaDoiXeSongTuong(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Bên công có 1 Xe + 1 Mã (0 Pháo)
  if (countPieces(after, mover, "r") !== 1 || countPieces(after, mover, "n") !== 1 || countPieces(after, mover, "c") > 0) return null;

  // Bên thủ có 1 Xe + 2 Tượng (0 Mã, 0 Pháo, 0 Sĩ)
  if (
    countPieces(after, opp, "r") !== 1 ||
    countPieces(after, opp, "b") !== 2 ||
    countPieces(after, opp, "a") > 0 ||
    countPieces(after, opp, "nc") > 0
  ) return null;

  return fact(before, move, "xeMaDoiXeSongTuong",
    "Xe Mã đối Xe Song Tượng (Kỳ lý #42): Giải mã bài toán thế kỷ — \"thiên cổ nghi nan tàn cuộc xe mã phá xe song tượng... tổng thể chắc chắn là thông qua việc chèn mắt tượng để tằm ăn dâu\".");
}

/**
 * Bài 43: Cạm bẫy giăng kín trong cờ thế Thất Tinh Tụ Hội (Triệu Hâm Hâm)
 * Tứ đại danh cục: Xe Pháo nhiều Tốt đối Xe Pháo nhiều Tốt; tính toán tốc độ tranh tiên từng nhịp, tránh cạm bẫy liên hoàn.
 */
export function detectThatTinhTuHoi(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Cả hai bên đều có Xe, Pháo, và Tốt (không Mã)
  if (
    countPieces(after, mover, "r") < 1 || countPieces(after, mover, "c") < 1 || countPieces(after, mover, "p") < 1 ||
    countPieces(after, opp, "r") < 1 || countPieces(after, opp, "c") < 1 || countPieces(after, opp, "p") < 1
  ) return null;

  if (countPieces(after, "r", "n") > 0 || countPieces(after, "b", "n") > 0) return null;

  // Quân đi là Xe, Pháo hoặc Tốt
  const pType = typeOf(piece);
  if (pType !== "r" && pType !== "c" && pType !== "p") return null;

  const toRow = rowOf(move.to);
  const toCol = colOf(move.to);
  const attacksPalace = (toCol >= 1 && toCol <= 7) && (mover === "r" ? toRow <= 4 : toRow >= 5);
  const checksOpp = inCheck(after, opp);

  if (!attacksPalace && !checksOpp) return null;

  return fact(before, move, "thatTinhTuHoi",
    "Thất Tinh Tụ Hội (Kỳ lý #43): Đỉnh cao cờ thế giang hồ — \"chúng ta sẽ cùng đàm đạo về tứ đại danh cuộc... vừa phải am hiểu những ý tưởng kỳ lạ ở phần đầu, vượt qua vô vàng cạm bẫy, không được sai sót một nước nào\".");
}

/**
 * Bài 44: Giải mã Tứ đại danh cuộc - Khâu Dẫn Hàng Long Bầy Tốt trói chặt Song Xe (Triệu Hâm Hâm)
 * Bầy Tốt liên kết trói chặt Song Xe đối phương; bên Xe kiên nhẫn đi nước chờ thời cơ khi Tốt địch bị giam hãm.
 */
export function detectKhauDanHangLong(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Một bên có 2 Xe (Song Xe), bên kia có nhiều Tốt qua sông (ít nhất 2 Tốt qua sông)
  const moverRooks = countPieces(after, mover, "r");
  const oppRooks = countPieces(after, opp, "r");

  let moverCrossedPawns = 0;
  let oppCrossedPawns = 0;
  for (let i = 0; i < 90; i++) {
    const p = after[i];
    if (p && typeOf(p) === "p") {
      if (sideOf(p) === mover && crossedRiver(rowOf(i), mover)) moverCrossedPawns++;
      if (sideOf(p) === opp && crossedRiver(rowOf(i), opp)) oppCrossedPawns++;
    }
  }

  const isRooksVsPawns =
    (moverRooks >= 2 && oppCrossedPawns >= 2) ||
    (oppRooks >= 2 && moverCrossedPawns >= 2);

  if (!isRooksVsPawns) return null;

  return fact(before, move, "khauDanHangLong",
    "Khâu Dẫn Hàng Long (Kỳ lý #44): Bầy Tốt trói chặt Song Xe — \"chúng ta tiếp tục đến với một trong tứ đại danh cuộc khâu dẫn hàng long... mấu chốt của nước chờ này là tốt của đen hiện tại không thể di chuyển\".");
}

/**
 * Bài 45: Cờ thế giang hồ Dã Mã Thao Điền - Sức mạnh đáng sợ của Xe Mã lãnh chiêu (Triệu Hâm Hâm)
 * Xe Mã giang hồ phối hợp tác chiến, phô diễn đòn lãnh chiêu, không tham tiếc Mã mà kiên định thế công.
 */
export function detectDaMaThaoDien(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Phe đi có Xe và Mã trong tàn cuộc
  if (countPieces(after, mover, "r") < 1 || countPieces(after, mover, "n") < 1) return null;

  // Quân đi là Mã hoặc Xe
  const pType = typeOf(piece);
  if (pType !== "n" && pType !== "r") return null;

  // Nước đi uy hiếp, chiếu tướng hoặc chiếm cứ điểm hiểm yếu
  const checksOpp = inCheck(after, opp);
  const toRow = rowOf(move.to);
  const toCol = colOf(move.to);
  const attacksPalace = (toCol >= 1 && toCol <= 7) && (mover === "r" ? toRow <= 3 : toRow >= 6);

  if (!checksOpp && !attacksPalace) return null;

  return fact(before, move, "daMaThaoDien",
    "Dã Mã Thao Điền (Kỳ lý #45): Xe Mã lãnh chiêu cờ thế giang hồ — \"chúng ta bàn về ván thứ ba trong tứ đại danh cục, đó chính là giả mã thao điền... cho nên lúc này bạn tuyệt đối đừng tham lam tiếc con mã làm gì\".");
}

/**
 * Bài 46: Thiên Lý Độc Hành - Bí ẩn ván cờ tuyệt kỹ tàn cuộc Đơn Mã (Triệu Hâm Hâm)
 * Đơn Mã độc hành đối mặt trùng vây; không ham ăn Sĩ trúng bẫy, nhảy Mã đúng điểm huyệt và điều Xe giải vây.
 */
export function detectThienLyDocHanh(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Phe đi chỉ có 1 Mã duy nhất (0 Xe, 0 Pháo)
  if (countPieces(after, mover, "n") !== 1 || countPieces(after, mover, "r") > 0 || countPieces(after, mover, "c") > 0) return null;

  // Đối phương có ít nhất 1 Xe
  if (countPieces(after, opp, "r") < 1) return null;

  // Quân đi là Mã hoặc Tướng
  const pType = typeOf(piece);
  if (pType !== "n" && pType !== "k") return null;

  return fact(before, move, "thienLyDocHanh",
    "Thiên Lý Độc Hành (Kỳ lý #46): Đơn Mã độc hành phá trùng vây — \"chúng ta sẽ đến với ván cuối cùng trong tứ đại danh cuộc thiên lý độc hành... bên đen sẽ có nước mã 7 tấn năm nhảy vào, bạn đương nhiên không thể ăn được\".");
}

/**
 * Bài 47: Bài học xương máu về chiến thuật và tâm lý trong tàn cuộc thực chiến (Triệu Hâm Hâm)
 * Đối đầu Xe Mã Tốt và Xe Pháo Sĩ Tượng toàn; tránh tâm lý do dự mất thăng bằng, kiên định chiếm yếu đạo dứt điểm.
 */
export function detectChienThuatVaTamLy(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);
  const opp = opponent(mover);

  // Một bên có Xe + Mã + Tốt (không Pháo)
  // Bên kia có Xe + Pháo (không Mã)
  const moverHasRNP = countPieces(after, mover, "r") >= 1 && countPieces(after, mover, "n") >= 1 && countPieces(after, mover, "c") === 0 && countPieces(after, mover, "p") >= 1;
  const oppHasRC = countPieces(after, opp, "r") >= 1 && countPieces(after, opp, "c") >= 1 && countPieces(after, opp, "n") === 0;

  const oppHasRNP = countPieces(after, opp, "r") >= 1 && countPieces(after, opp, "n") >= 1 && countPieces(after, opp, "c") === 0 && countPieces(after, opp, "p") >= 1;
  const moverHasRC = countPieces(after, mover, "r") >= 1 && countPieces(after, mover, "c") >= 1 && countPieces(after, mover, "n") === 0;

  if (!(moverHasRNP && oppHasRC) && !(moverHasRC && oppHasRNP)) return null;

  return fact(before, move, "chienThuatVaTamLy",
    "Chiến thuật và tâm lý cờ tàn (Kỳ lý #47): Tránh do dự mất cân bằng tâm lý — \"xe mã tốt sông tượng đấu với xe pháo sĩ tượng toàn được coi là binh lực cân bằng... sợ nhất là kiểu tâm lý này do dự thiếu quyết đoán\".");
}

/**
 * Bài 48: Bản chất cốt lõi của tàn cuộc - Đỉnh cao triết lý cờ tàn (Triệu Hâm Hâm)
 * Kiểm soát thế trận và phong tỏa khống chế: xuất Tướng hoặc điều quân tước đoạt toàn bộ sự linh hoạt của địch.
 */
export function detectBanChatTanCuoc(
  before: Board, move: Move, after: Board, options?: EndgamePrincipleOptions,
): EndgamePrincipleFact | null {
  const piece = before[move.from];
  if (!piece || !soundMove(options, 20)) return null;
  const mover = sideOf(piece);

  // Quân đi là Tướng xuất lộ (lộ 4 hoặc 6) để kiểm soát thế trận
  if (typeOf(piece) !== "k") return null;

  const toCol = colOf(move.to);
  const fromCol = colOf(move.from);

  // Tướng từ trung lộ (col 4) xuất sang lộ sườn (col 3 hoặc 5)
  if (fromCol === 4 && (toCol === 3 || toCol === 5)) {
    return fact(before, move, "banChatTanCuoc",
      "Bản chất cốt lõi của tàn cuộc (Kỳ lý #48): Kiểm soát thế trận và phong tỏa khống chế — \"tôi cho rằng dùng từ kiểm soát thế trận để sâu chuỗi mọi lý thuyết tàn cuộc... không có ý thức kiềm chế thì chắc chắn sẽ không thể đánh tốt cờ tàn\".");
  }

  return null;
}

const PRIORITY: Detector[] = [
  detectEndgameTrade,
  detectPhanLoaiTanCuoc,
  detectMinorTrade,
  detectOldPawn,
  detectPawnForGuard,
  detectBinhTanSiTuong,
  detectKhuyetSiKyGi,
  detectKhuyetTuongKyPhao,
  detectPhaSiTuongCoXe,
  detectPhaSiTuongKhongXe,
  detectDiemToiHanBinhLuc,
  detectBinhChungHuuLoi,
  detectBinhQuyThanToc,
  detectMuuBinhCoXe,
  detectMuuBinhKhongXe,
  detectNguyenTacChiemTrung,
  detectLoSuonApDay,
  detectMaHoatChienThang,
  detectBangXepHangBinhChung,
  detectSiTuongPhongAn,
  detectTuongLinhHoat,
  detectLaoBinhKhongChet,
  detectCoTanPhaoHoan,
  detectDonTotKhongCheTuyen,
  detectMaTotDayThangDonSiTuong,
  detectMaTotDoiPhaoTot,
  detectMaThangPhao,
  detectChienThuatKiemChe,
  detectChienThuatNuocCho,
  detectChienThuatVayKhon,
  detectKyThuatDonToa,
  detectKyThuatDanhChan,
  detectChienThuatCauHoa,
  detectChienThuatSamSet,
  detectCanKhonDaiNaDi,
  detectXeMaDoiXeSongTuong,
  detectHaiDeLaoNguyet,
  detectThatTinhTuHoi,
  detectKhauDanHangLong,
  detectDaMaThaoDien,
  detectThienLyDocHanh,
  detectChienThuatVaTamLy,
  detectTamAnhChienLuBo,
  detectXePhaoHopCong,
  detectXeMaLanhChieu,
  detectXeChotPhaSiTuong,
  detectSongMaPhaoDoiMaSongPhao,
  detectSongPhaoDoiSongMa,
  detectMaPhaoDoiMaPhao,
  detectSongMaSongPhao,
  detectBanChatTanCuoc,
  detectKingBoxing,
  detectKingActivity,
  detectHighPawn,
  detectWaitingMove,
  detectGuardFormation,
  detectTaiSaoHocTanCuoc,
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
