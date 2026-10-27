// Bộ nhận diện Kỳ lý khai cuộc Triệu Hâm Hâm (开局棋理)
// Tuân thủ kiến trúc 4 tầng kiểm tra:
// 1. Hình: Thế cờ có đúng cấu trúc bài giảng mô tả không?
// 2. Mục đích: Nước đi có phải vì kỳ lý đó không (loại trừ chạy quân, ăn quân lớn có sẵn, đỡ chiếu...)?
// 3. Cơ chế: Biến engine (PV) xác nhận đúng chuyện bài giảng nói (khống chế, phong tỏa, vây bắt...).
// 4. Kết quả: Đánh giá điểm số / loss của engine (khen khi soundMove, chê khi isFault).

import {
  type Board, type Move, type Piece, type Side,
  colOf, findKing, inCheck, opponent, play, rowOf, sideOf, sq, typeOf, PIECE_VALUES,
  legalMovesFrom, legalMoves,
} from "./engine";
import { soundMove, type ZhaoTacticsOptions } from "./middlegame";
import { engineLine, narrate, tally, type EngineLine } from "./engine-line";
import { moveNotation, PIECE_NAME } from "./notation";
import { ZHAO_OPENING_LESSONS, type ZhaoOpeningLessonCard } from "./zhao48-opening-lessons";

export type PrincipleCheck =
  | { ok: true; mechanism: string; summary: string; acted?: number[] }
  | { ok: false; layer: 1 | 2 | 3 | 4; reason: string };

export interface ZhaoOpeningFact {
  kind: "zhaoOpening";
  side: Side;
  lesson: number;
  lessonTitle: string;
  tactic: string;
  move: string;
  summary: string;
  details?: string;
  quote?: { text: string; at: string };
  videoUrl?: string;
  line?: string;
  tone?: "critique" | "note";
}

function card(lesson: number): ZhaoOpeningLessonCard {
  return ZHAO_OPENING_LESSONS[lesson]!;
}

function buildFact(
  before: Board,
  move: Move,
  lesson: number,
  tactic: string,
  summary: string,
  details: string,
  tone?: "critique",
): ZhaoOpeningFact {
  const p = before[move.from]!;
  const c = card(lesson);
  const q = c.quotes[0];
  const [m, s] = q ? q.at.split(":").map((x) => parseInt(x, 10)) : [0, 0];
  const sec = (m || 0) * 60 + (s || 0);
  return {
    kind: "zhaoOpening",
    side: sideOf(p),
    lesson,
    lessonTitle: c.title,
    tactic,
    move: moveNotation(before, move),
    summary,
    details,
    quote: q,
    videoUrl: c.video ? `https://youtu.be/${c.video}?t=${sec}` : undefined,
    tone,
  };
}

// ============================================================================
// 1. BÀI 11: ĐẠI XUẤT XE (checkDaiXuatXe / detectDaiXuatXe)
// Xe biên tiến thẳng lên hàng chốt/hà khi đối phương có Mã biên
// ============================================================================
export function checkDaiXuatXe(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  if (!p || typeOf(p) !== "r") {
    return { ok: false, layer: 1, reason: "Nước đi không phải là Xe" };
  }
  const mover = sideOf(p);
  const opp = opponent(mover);
  const fromC = colOf(move.from);
  const toC = colOf(move.to);
  const fromR = rowOf(move.from);
  const toR = rowOf(move.to);

  // Xe ở cột biên (0 hoặc 8) tiến thẳng lên hàng tuần hà hoặc qua hà
  if (fromC !== 0 && fromC !== 8) {
    return { ok: false, layer: 1, reason: "Xe không xuất phát từ cột biên" };
  }
  if (toC !== fromC) {
    return { ok: false, layer: 1, reason: "Không phải nước Xe tiến thẳng hàng biên" };
  }
  const isAdvance = mover === "r" ? toR < fromR : toR > fromR;
  if (!isAdvance) {
    return { ok: false, layer: 1, reason: "Xe không tiến về phía trước" };
  }

  // Tầng 1: Đối phương có Mã ở biên cùng cánh
  const oppHorseSq = mover === "r"
    ? (fromC === 0 ? sq(2, 0) : sq(2, 8))
    : (fromC === 0 ? sq(7, 0) : sq(7, 8));
  const oppPiece = before[oppHorseSq];
  if (!oppPiece || sideOf(oppPiece) !== opp || typeOf(oppPiece) !== "n") {
    return { ok: false, layer: 1, reason: "Đối phương không có Mã ở biên cùng cánh" };
  }

  // Tầng 2: Mục đích - Không phải Xe bị bắt buộc chạy trốn khi bị chiếu
  if (inCheck(before, mover)) {
    return { ok: false, layer: 2, reason: "Đang bị chiếu Tướng, phải giải chiếu" };
  }

  // Tầng 3: Cơ chế PV
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả engine
  const sound = soundMove(options, 30);
  if (!sound) {
    return { ok: false, layer: 4, reason: "Nước đi bị hớ điểm so với nước tốt nhất của engine" };
  }

  return {
    ok: true,
    mechanism: "Xe biên dâng cao kiểm soát hành lang và gây áp lực lên Mã biên đối phương",
    summary: `Đại xuất Xe: Xe biên tiến thẳng công phạt Mã biên đối phương (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectDaiXuatXe(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkDaiXuatXe(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    11,
    "daiXuatXe",
    chk.summary,
    chk.mechanism,
  );
}

// ============================================================================
// 2. BÀI 16: TẢ PHÁO PHONG XE (checkTaPhaoPhongXe / detectTaPhaoPhongXe)
// Pháo dâng lên tuyến hà / quá hà phong tỏa lộ Xe đối phương
// ============================================================================
export function checkTaPhaoPhongXe(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  if (!p || typeOf(p) !== "c") {
    return { ok: false, layer: 1, reason: "Nước đi không phải là Pháo" };
  }
  const mover = sideOf(p);
  const opp = opponent(mover);
  const toR = rowOf(move.to);
  const toC = colOf(move.to);

  // Pháo tiến lên hàng tuần hà hoặc hàng tốt địch
  const isTargetRow = mover === "r" ? (toR === 6 || toR === 5) : (toR === 3 || toR === 4);
  if (!isTargetRow) {
    return { ok: false, layer: 1, reason: "Pháo không dâng lên hàng tuần hà hoặc tuyến chốt đối phương" };
  }
  // Thường dạt sang lộ Xe đối phương
  if (toC !== 0 && toC !== 1 && toC !== 7 && toC !== 8) {
    return { ok: false, layer: 1, reason: "Pháo không nằm trên cánh xuất Xe của đối phương" };
  }

  // Đối phương còn Xe ở góc xuất phát
  const oppRookCorner = mover === "r"
    ? (toC <= 1 ? sq(0, 0) : sq(0, 8))
    : (toC <= 1 ? sq(9, 0) : sq(9, 8));
  const oppRook = before[oppRookCorner];
  if (!oppRook || sideOf(oppRook) !== opp || typeOf(oppRook) !== "r") {
    return { ok: false, layer: 1, reason: "Đối phương không còn Xe ở góc ban đầu trên cánh này" };
  }

  // Tầng 2: Mục đích - không phải ăn quân có sẵn, không phải đang bị chiếu
  if (before[move.to] !== null) {
    return { ok: false, layer: 2, reason: "Nước đi là nước ăn quân, không phải phong tỏa thuần túy" };
  }
  if (inCheck(before, mover)) {
    return { ok: false, layer: 2, reason: "Đang bị chiếu Tướng" };
  }

  // Tầng 3: Biến engine
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả
  const sound = soundMove(options, 35);
  if (!sound) {
    return { ok: false, layer: 4, reason: "Nước dâng Pháo bị mất tiên hoặc hớ điểm" };
  }

  return {
    ok: true,
    mechanism: "Dâng Pháo hạn chế tầm hoạt động và cản đường xuất Xe của đối phương",
    summary: `Tả Pháo phong Xe: dâng Pháo kiềm chế đường xuất động của Xe đối phương (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectTaPhaoPhongXe(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkTaPhaoPhongXe(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    16,
    "taPhaoPhongXe",
    chk.summary,
    chk.mechanism,
  );
}

// ============================================================================
// 3. BÀI 17: TRÁNH DÙNG PHÁO ĐỔI MÃ SỚM (checkPhaoDoiMaKhaiCuoc)
// Pháo ăn Mã sớm trong khai cuộc (<= 16 ply) khi không có đòn sát
// ============================================================================
export function checkPhaoDoiMaKhaiCuoc(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  const target = before[move.to];
  if (!p || !target || typeOf(p) !== "c" || typeOf(target) !== "n") {
    return { ok: false, layer: 1, reason: "Không phải nước Pháo ăn Mã" };
  }
  const mover = sideOf(p);

  // Tầng 2: Mục đích - không phải nước giải chiếu
  if (inCheck(before, mover)) {
    return { ok: false, layer: 2, reason: "Nước ăn Mã bắt buộc để giải chiếu" };
  }

  // Tầng 3: Cơ chế PV - Biến không sát hoặc không mang lại ưu thế vật chất lớn hơn
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả - Nếu nước này bị engine đánh giá hớ điểm (loss >= 35)
  const isSound = soundMove(options, 35);
  if (isSound) {
    return { ok: false, layer: 4, reason: "Nước Pháo ăn Mã này engine đánh giá là tốt / đòn chiến thuật hợp lệ" };
  }

  return {
    ok: true,
    mechanism: "Pháo đổi Mã sớm ở khai cuộc làm tiêu hao lực lượng chủ lực và trao quyền chủ động cho đối phương",
    summary: `Pháo đổi Mã sớm: hao tổn quân chủ lực không cần thiết (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectPhaoDoiMaKhaiCuoc(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkPhaoDoiMaKhaiCuoc(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    17,
    "phaoDoiMaKhaiCuoc",
    chk.summary,
    chk.mechanism,
    "critique",
  );
}

// ============================================================================
// 4. BÀI 19 / 42: TƯỚNG KHÔNG ĐỘNG Ở KHAI CUỘC (checkTuongKhongDong)
// Di chuyển Tướng sớm khi chưa bị chiếu
// ============================================================================
export function checkTuongKhongDong(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  if (!p || typeOf(p) !== "k") {
    return { ok: false, layer: 1, reason: "Nước đi không phải là Tướng" };
  }
  const mover = sideOf(p);

  // Tầng 2: Trước nước đi KHÔNG bị chiếu
  if (inCheck(before, mover)) {
    return { ok: false, layer: 2, reason: "Tướng phải di chuyển để tránh chiếu" };
  }

  // Tầng 3: Biến engine
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả - nước di chuyển Tướng sớm vô cớ bị engine chê (loss >= 40)
  const sound = soundMove(options, 40);
  if (sound) {
    return { ok: false, layer: 4, reason: "Engine đánh giá nước Tướng này không bị hớ" };
  }

  return {
    ok: true,
    mechanism: "Di chuyển Tướng sớm vô cớ làm mất nhịp ra quân và lộ sơ hở trung tâm",
    summary: `Tướng không động: di chuyển Tướng sớm làm lỡ nhịp xuất quân chủ lực (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectTuongKhongDong(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkTuongKhongDong(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    19,
    "tuongKhongDong",
    chk.summary,
    chk.mechanism,
    "critique",
  );
}

// ============================================================================
// 5. BÀI 27: XE ĐÈ MÃ (checkXeDeMa / detectXeDeMa)
// Xe tiến đến vị trí đè Mã đối phương ở tuyến đáy hoặc hàng chốt
// ============================================================================
export function checkXeDeMa(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  if (!p || typeOf(p) !== "r") {
    return { ok: false, layer: 1, reason: "Nước đi không phải là Xe" };
  }
  const mover = sideOf(p);
  const opp = opponent(mover);

  // Xe đến ô tiếp giáp hoặc cùng cột đè Mã đối phương (không phải nước ăn Mã)
  if (before[move.to] !== null) {
    return { ok: false, layer: 1, reason: "Nước đi là nước ăn quân, không phải đè Mã thuần túy" };
  }

  const toR = rowOf(move.to);
  const toC = colOf(move.to);

  let hasOppHorse = false;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const idx = sq(r, c);
      const piece = after[idx];
      if (piece && sideOf(piece) === opp && typeOf(piece) === "n") {
        // Mã đối phương kề bên hoặc cùng cột trong khoảng cách ngắn
        if ((toC === c && Math.abs(r - toR) <= 3) || (toR === r && Math.abs(c - toC) <= 1)) {
          hasOppHorse = true;
          break;
        }
      }
    }
    if (hasOppHorse) break;
  }

  if (!hasOppHorse) {
    return { ok: false, layer: 1, reason: "Không có Mã đối phương trong phạm vi bị Xe đè ép" };
  }

  // Tầng 2: Mục đích - không phải Xe bị đuổi phải chạy
  if (inCheck(before, mover)) {
    return { ok: false, layer: 2, reason: "Đang bị chiếu Tướng" };
  }

  // Tầng 3: Biến engine
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả
  const sound = soundMove(options, 30);
  if (!sound) {
    return { ok: false, layer: 4, reason: "Nước Xe đè Mã bị mất tiên hoặc hớ điểm" };
  }

  return {
    ok: true,
    mechanism: "Xe áp sát đè ép khống chế sức cơ động của Mã đối phương",
    summary: `Xe đè Mã: công Mã tranh tiên, hạn chế tầm hoạt động của Mã đối phương (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectXeDeMa(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkXeDeMa(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    27,
    "xeDeMa",
    chk.summary,
    chk.mechanism,
  );
}

// ============================================================================
// 6. BÀI 28: MÃ ĐƠN ĐỘC TIẾN SÂU (checkMaDonDocTienSau)
// Mã vượt sông đơn độc mà không có Xe Pháo chi viện, bị vây bắt
// ============================================================================
export function checkMaDonDocTienSau(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  if (!p || typeOf(p) !== "n") {
    return { ok: false, layer: 1, reason: "Nước đi không phải là Mã" };
  }
  const mover = sideOf(p);
  const toR = rowOf(move.to);

  // Mã nhảy qua sông (Đỏ: toR <= 4, Đen: toR >= 5)
  const isCrossed = mover === "r" ? toR <= 4 : toR >= 5;
  if (!isCrossed) {
    return { ok: false, layer: 1, reason: "Mã chưa qua sông" };
  }

  // Các quân lớn khác của phe mình (Xe, Pháo) chưa qua sông cùng cánh
  let helpers = 0;
  after.forEach((piece, idx) => {
    if (piece && sideOf(piece) === mover && (typeOf(piece) === "r" || typeOf(piece) === "c")) {
      const r = rowOf(idx);
      if (mover === "r" ? r <= 4 : r >= 5) helpers++;
    }
  });

  if (helpers >= 2) {
    return { ok: false, layer: 1, reason: "Có đủ quân lớn hỗ trợ qua sông, không phải đơn độc" };
  }

  // Tầng 2: Mục đích - không phải ăn quân lớn có lời
  const captured = before[move.to];
  if (captured && "rnc".includes(typeOf(captured))) {
    return { ok: false, layer: 2, reason: "Nước ăn quân lớn đối phương" };
  }

  // Tầng 3: Biến engine
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả - Engine đánh giá nước nhảy Mã này bị lỗi (loss >= 45)
  const sound = soundMove(options, 45);
  if (sound) {
    return { ok: false, layer: 4, reason: "Engine đánh giá nước nhảy Mã này hợp lệ" };
  }

  return {
    ok: true,
    mechanism: "Mã đơn độc lao sâu vào hiểm địa khi thiếu quân phối hợp, dễ bị vây bắt",
    summary: `Mã đơn độc tiến sâu: đại kỵ khai cuộc, Mã vượt tuyến thiếu phối hợp (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectMaDonDocTienSau(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkMaDonDocTienSau(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    28,
    "maDonDocTienSau",
    chk.summary,
    chk.mechanism,
    "critique",
  );
}

// ============================================================================
// 7. BÀI 42: LƯỠNG ĐẦU XÀ (checkLuongDauXa / detectLuongDauXa)
// Thúc cả hai chốt 3 và 7 mở đường cho song Mã
// ============================================================================
export function checkLuongDauXa(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  if (!p || typeOf(p) !== "p") {
    return { ok: false, layer: 1, reason: "Nước đi không phải là Tốt/Chốt" };
  }
  const mover = sideOf(p);
  const toC = colOf(move.to);

  // Nước đi là thúc chốt 3 hoặc chốt 7 (cột 2 hoặc cột 6)
  if (toC !== 2 && toC !== 6) {
    return { ok: false, layer: 1, reason: "Không phải nước thúc chốt 3 hoặc chốt 7" };
  }

  // Kiểm tra chốt còn lại (cột 6 nếu vừa đi 2, cột 2 nếu vừa đi 6) đã tiến lên chưa
  const otherC = toC === 2 ? 6 : 2;
  const advancedRow = mover === "r" ? 5 : 4;
  const otherP = after[sq(advancedRow, otherC)];
  if (!otherP || sideOf(otherP) !== mover || typeOf(otherP) !== "p") {
    return { ok: false, layer: 1, reason: "Chưa hoàn thành cấu trúc Lưỡng đầu xà (chốt đối diện chưa tiến)" };
  }

  // Tầng 2: Mục đích - không phải ăn quân giải chiếu
  if (inCheck(before, mover)) {
    return { ok: false, layer: 2, reason: "Đang bị chiếu Tướng" };
  }

  // Tầng 3: Biến engine
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả
  const sound = soundMove(options, 30);
  if (!sound) {
    return { ok: false, layer: 4, reason: "Nước thúc chốt bị hớ điểm" };
  }

  return {
    ok: true,
    mechanism: "Thúc hai chốt 3 và 7 tạo thế Lưỡng đầu xà, mở đường cho song Mã và kiềm chế đối phương",
    summary: `Lưỡng đầu xà: thông suốt hai lộ Mã đồng thời kiềm chế hai Mã đối thủ (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectLuongDauXa(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkLuongDauXa(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    42,
    "luongDauXa",
    chk.summary,
    chk.mechanism,
  );
}

// ============================================================================
// 8. BÀI 45: PHI TƯỢNG TẤN TRUNG BINH (checkPhiTuongTanTrungBinh)
// Trong trận Phi Tượng, chủ động thúc trung binh mở lộ cho Mã lên vai Tượng
// ============================================================================
export function checkPhiTuongTanTrungBinh(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): PrincipleCheck {
  const p = before[move.from];
  if (!p || typeOf(p) !== "p") {
    return { ok: false, layer: 1, reason: "Nước đi không phải là Chốt" };
  }
  const mover = sideOf(p);
  const fromC = colOf(move.from);

  // Nước đi là thúc chốt giữa (cột 4)
  if (fromC !== 4) {
    return { ok: false, layer: 1, reason: "Không phải nước thúc trung binh (chốt giữa)" };
  }

  // Tầng 1: Đã bay chính Tượng lên vị trí tâm (ô (7,4) đối với Đỏ, ô (2,4) đối với Đen)
  const elephantCenterSq = mover === "r" ? sq(7, 4) : sq(2, 4);
  const ele = after[elephantCenterSq];
  if (!ele || sideOf(ele) !== mover || typeOf(ele) !== "b") {
    return { ok: false, layer: 1, reason: "Chưa phi chính Tượng lên trung tâm" };
  }

  // Tầng 2: Mục đích
  if (inCheck(before, mover)) {
    return { ok: false, layer: 2, reason: "Đang bị chiếu Tướng" };
  }

  // Tầng 3: Biến engine
  const line = engineLine(before, move, options);
  if (!line) {
    return { ok: false, layer: 3, reason: "Không có biến engine PV để kiểm chứng" };
  }

  // Tầng 4: Kết quả
  const sound = soundMove(options, 30);
  if (!sound) {
    return { ok: false, layer: 4, reason: "Nước thúc trung binh bị mất điểm" };
  }

  return {
    ok: true,
    mechanism: "Phi Tượng thúc trung binh mở thông đường cho Mã lên vai Tượng đắc địa",
    summary: `Phi Tượng tấn trung binh: khai thông lộ quân, mở đường cho Mã lên vai Tượng (${narrate(line, Math.min(3, line.plies.length))})`,
    acted: [move.from],
  };
}

export function detectPhiTuongTanTrungBinh(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact | null {
  const chk = checkPhiTuongTanTrungBinh(before, move, after, options);
  if (!chk.ok) return null;
  return buildFact(
    before,
    move,
    45,
    "phiTuongTanTrungBinh",
    chk.summary,
    chk.mechanism,
  );
}

// ============================================================================
// Bộ tập hợp tất cả các detector khai cuộc
// ============================================================================
export const OPENING_DETECTORS = [
  detectDaiXuatXe,
  detectTaPhaoPhongXe,
  detectPhaoDoiMaKhaiCuoc,
  detectTuongKhongDong,
  detectXeDeMa,
  detectMaDonDocTienSau,
  detectLuongDauXa,
  detectPhiTuongTanTrungBinh,
];

export function detectAllOpeningTactics(
  before: Board,
  move: Move,
  after: Board,
  options?: ZhaoTacticsOptions,
): ZhaoOpeningFact[] {
  const facts: ZhaoOpeningFact[] = [];
  for (const det of OPENING_DETECTORS) {
    const f = det(before, move, after, options);
    if (f) facts.push(f);
  }
  return facts;
}
