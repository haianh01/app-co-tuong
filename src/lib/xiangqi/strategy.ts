// Nguyên lý chiến lược, theo 3 tầng:
// 1. Thế trận: giai đoạn ván, cán cân quân, sức ép lên hai cung tướng.
// 2. Kế hoạch: từ thế trận suy ra việc chính cần làm (ra quân, tấn công, phòng thủ, đơn giản hóa, tàn cuộc).
// 3. Nguyên lý: các chỉ số đo được trên bàn cờ; kế hoạch quyết định trọng số của từng chỉ số.
// Giải thích một nước = so chỉ số của thế sau nước đã đi với thế sau nước nên đi, lấy nguyên lý chênh nhiều nhất.

import { Board, Move, Side, colOf, isDefended, opponent, pseudoMoves, rowOf, sideOf, typeOf } from "./engine";

export type Principle =
  | "xe" // Xe thông đường (số ô Xe đi được)
  | "ma" // Mã linh hoạt (số ô Mã nhảy được, Mã bị chặn chân thì thấp)
  | "raQuan" // số quân lớn đã rời vị trí ban đầu
  | "apLuc" // số ô trong cung tướng đối phương bị quân mình khống chế
  | "anToan" // cung tướng mình ít bị khống chế, Sĩ Tượng đủ
  | "matGoc" // ít quân lớn không có gốc (không được bảo vệ)
  | "phongToa" // Xe đối phương bị bó
  | "tot" // Tốt đã qua sông
  | "diemThenChot" // quân đứng ở điểm then chốt: Mã hà khẩu/ngọa tào/quải giác, Xe chiếm sườn, Pháo đầu
  | "catLienLac" // quân lớn của đối phương không có gốc (liên lạc bị cắt)
  | "khongCheTuong" // đường ra của Tướng đối phương bị khống chế
  | "khuyetSi" // tận dụng đối phương khuyết Sĩ (khuyết Sĩ kỵ Mã)
  | "khuyetTuong" // tận dụng đối phương khuyết Tượng (khuyết Tượng kỵ Pháo)
  | "totVaoCung"; // Tốt áp sát uy hiếp cung tướng đối phương

export const PRINCIPLES: Principle[] = [
  "xe", "ma", "raQuan", "apLuc", "anToan", "matGoc", "phongToa", "tot", "diemThenChot", "catLienLac", "khongCheTuong",
  "khuyetSi", "khuyetTuong", "totVaoCung",
];

export type Plan = "raQuan" | "tanCong" | "phongThu" | "donGianHoa" | "tanCuoc" | "canBang";

const VALUE: Record<string, number> = { k: 0, a: 200, b: 200, n: 400, r: 900, c: 450, p: 100 };

const inPalace = (i: number, s: Side) => {
  const r = rowOf(i);
  const c = colOf(i);
  return c >= 3 && c <= 5 && (s === "r" ? r >= 7 : r <= 2);
};

/** Ô xuất phát của Xe, Mã, Pháo mỗi bên. */
const HOME: Record<Side, number[]> = {
  r: [81, 82, 88, 89, 64, 70],
  b: [0, 1, 7, 8, 19, 25],
};

function pieces(board: Board, s: Side, types: string): number[] {
  const out: number[] = [];
  board.forEach((p, i) => {
    if (p && sideOf(p) === s && types.includes(typeOf(p))) out.push(i);
  });
  return out;
}

const mobility = (board: Board, s: Side, t: string) =>
  pieces(board, s, t).reduce((n, i) => n + pseudoMoves(board, i).length, 0);

/** Số ô trong cung tướng của `target` bị phe đối phương khống chế. */
function palacePressure(board: Board, target: Side): number {
  const by = opponent(target);
  const hit = new Set<number>();
  for (const i of pieces(board, by, "rncp")) for (const to of pseudoMoves(board, i)) if (inPalace(to, target)) hit.add(to);
  return hit.size;
}

/** Số hàng phe `s` đã tiến khỏi hàng đáy của mình (0–9). */
const advance = (i: number, s: Side) => (s === "r" ? 9 - rowOf(i) : rowOf(i));

/** Quân phe `s` đứng ở điểm then chốt. */
function keySquares(board: Board, s: Side): number {
  let n = 0;
  for (const i of pieces(board, s, "n")) {
    const a = advance(i, s);
    const c = colOf(i);
    if ((a === 4 || a === 5) && c >= 2 && c <= 6) n++; // Mã hà khẩu / Mã qua hà
    else if (a === 7 && (c === 2 || c === 6)) n++; // Mã ngọa tào
    else if (a === 8 && (c === 3 || c === 5)) n++; // Mã quải giác
  }
  for (const i of pieces(board, s, "r")) if ((colOf(i) === 3 || colOf(i) === 5) && advance(i, s) >= 3) n++; // Xe chiếm sườn
  for (const i of pieces(board, s, "c")) if (colOf(i) === 4) n++; // Pháo đầu
  return n;
}

/** Số ô Tướng đối phương có thể bước tới nhưng bị quân phe `s` khống chế (+1 nếu Tướng hết đường đi). */
function kingControl(board: Board, s: Side): number {
  const o = opponent(s);
  const k = board.indexOf(o === "r" ? "K" : "k");
  if (k < 0) return 0;
  const steps = pseudoMoves(board, k);
  const covered = steps.filter((to) => {
    const probe = board.slice();
    probe[to] = probe[k];
    probe[k] = null;
    return pieces(probe, s, "rncpk").some((i) => pseudoMoves(probe, i).includes(to));
  }).length;
  return covered + (covered === steps.length ? 1 : 0);
}

/** Chỉ số nguyên lý của phe `s` (càng cao càng tốt cho `s`), đã quy về cùng thang. */
export function principleScores(board: Board, s: Side): Record<Principle, number> {
  const o = opponent(s);
  const guards = pieces(board, s, "ab").length;
  const loose = pieces(board, s, "rnc").filter((i) => !isDefended(board, i, s));
  const crossed = pieces(board, s, "p").filter((i) => (s === "r" ? rowOf(i) <= 4 : rowOf(i) >= 5)).length;
  return {
    xe: mobility(board, s, "r") / 3,
    ma: mobility(board, s, "n") / 2,
    raQuan: -HOME[s].filter((i) => board[i] && sideOf(board[i]!) === s && "rnc".includes(typeOf(board[i]!))).length,
    apLuc: palacePressure(board, o),
    anToan: -palacePressure(board, s) + guards / 2,
    matGoc: -loose.length,
    phongToa: -mobility(board, o, "r") / 3,
    tot: crossed,
    diemThenChot: keySquares(board, s),
    catLienLac: pieces(board, o, "rnc").filter((i) => !isDefended(board, i, o)).length,
    khongCheTuong: kingControl(board, s),
    khuyetSi: pieces(board, s, "n").length > 0 && pieces(board, o, "a").length <= 1 ? (2 - pieces(board, o, "a").length) * 1.5 : 0,
    khuyetTuong: pieces(board, s, "c").length > 0 && pieces(board, o, "b").length <= 1 ? (2 - pieces(board, o, "b").length) * 1.5 : 0,
    totVaoCung: pieces(board, s, "p").filter((i) => (s === "r" ? rowOf(i) <= 2 : rowOf(i) >= 7) && colOf(i) >= 3 && colOf(i) <= 5).length * 2,
  };
}

const material = (board: Board, s: Side) => pieces(board, s, "rncpab").reduce((n, i) => n + VALUE[typeOf(board[i]!)], 0);

/** Thế trận → kế hoạch của phe `s` (đang đến lượt đi). */
export function choosePlan(board: Board, s: Side, ply: number): Plan {
  const o = opponent(s);
  const majors = pieces(board, "r", "rnc").length + pieces(board, "b", "rnc").length;
  const undeveloped = HOME[s].filter((i) => board[i] && sideOf(board[i]!) === s && "rnc".includes(typeOf(board[i]!))).length;
  if (ply < 20 && undeveloped >= 2) return "raQuan";
  if (majors <= 5) return "tanCuoc";
  if (palacePressure(board, s) >= 3) return "phongThu";
  // Đối phương trơ Sĩ Tượng hoặc cung đang bị ép thì tấn công, kể cả khi đang hơn quân.
  if (palacePressure(board, o) >= 3 || pieces(board, o, "ab").length <= 2) return "tanCong";
  if (material(board, s) - material(board, o) >= 300) return "donGianHoa";
  return "canBang";
}

/** Trọng số nguyên lý theo kế hoạch. Đây là bảng cần người hiểu cờ (và lời bình cao thủ) để chỉnh. */
export const WEIGHTS: Record<Plan, Record<Principle, number>> = {
  raQuan: { xe: 1.5, ma: 0.3, raQuan: 3, apLuc: 0.5, anToan: 1, matGoc: 1, phongToa: 1, tot: 0, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 0, khuyetTuong: 0, totVaoCung: 0 },
  tanCong: { xe: 0.7, ma: 0.2, raQuan: 0.5, apLuc: 3, anToan: 1, matGoc: 1, phongToa: 0.7, tot: 0.5, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 1.5, khuyetTuong: 1.5, totVaoCung: 2 },
  phongThu: { xe: 0.3, ma: 0.1, raQuan: 0.3, apLuc: 0.5, anToan: 3, matGoc: 1.5, phongToa: 1, tot: 0, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 0.5, khuyetTuong: 0.5, totVaoCung: 0 },
  donGianHoa: { xe: 0.5, ma: 0.2, raQuan: 0, apLuc: 0.5, anToan: 2, matGoc: 2, phongToa: 1, tot: 1, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 1, khuyetTuong: 1, totVaoCung: 1 },
  tanCuoc: { xe: 0.7, ma: 0.2, raQuan: 0, apLuc: 1, anToan: 1, matGoc: 1, phongToa: 1, tot: 3, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 3, khuyetTuong: 3, totVaoCung: 3.5 },
  canBang: { xe: 1.5, ma: 0.3, raQuan: 0.5, apLuc: 1, anToan: 1, matGoc: 1, phongToa: 1.5, tot: 0.5, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 1, khuyetTuong: 1, totVaoCung: 1 },
};

/** Điểm chiến lược tổng của phe `s` trên một thế cờ, theo kế hoạch `plan`. */
export function strategicScore(board: Board, s: Side, plan: Plan): number {
  const sc = principleScores(board, s);
  return PRINCIPLES.reduce((n, p) => n + WEIGHTS[plan][p] * sc[p], 0);
}

export interface PrincipleGap {
  principle: Principle;
  /** Chênh lệch có trọng số: dương = nước nên đi tốt hơn ở nguyên lý này. */
  gain: number;
  /** Nước đã đi làm nguyên lý này kém đi so với trước khi đi. */
  worsened: boolean;
}

/** So thế sau nước đã đi (`played`) với thế sau nước nên đi (`better`), theo kế hoạch. */
export function comparePrinciples(before: Board, played: Board, better: Board, s: Side, plan: Plan): PrincipleGap[] {
  const b0 = principleScores(before, s);
  const a = principleScores(played, s);
  const b = principleScores(better, s);
  return PRINCIPLES
    .map((p) => ({ principle: p, gain: WEIGHTS[plan][p] * (b[p] - a[p]), worsened: a[p] < b0[p] }))
    .filter((g) => g.gain >= 1)
    .sort((x, y) => y.gain - x.gain);
}

/** Tên ngắn của kế hoạch. */
export const PLAN_NAME: Record<Plan, string> = {
  raQuan: "ra quân",
  tanCong: "tấn công cung tướng",
  phongThu: "phòng thủ",
  donGianHoa: "giữ chắc, đơn giản hóa",
  tanCuoc: "tàn cuộc",
  canBang: "giữ thế, tăng hoạt động quân",
};

// Các bảng câu dưới đây có nhiều cách diễn đạt cho cùng một ý; phần tử đầu là câu chuẩn,
// explain.ts chọn cách diễn đạt theo nước đi để cả ván đọc không lặp (xem pickVariant).

/** Câu mở đầu nêu kế hoạch hiện tại (`opp`: tên phe đối phương). */
export const PLAN_TEXT: Record<Plan, ((opp: string, opening?: string) => string)[]> = {
  raQuan: [
    (_opp, opening) =>
      opening
        ? `Đang trong thế trận ${opening}, việc chính là ra quân nhanh và cân đối.`
        : "Đang khai cuộc, việc chính là ra quân nhanh và cân đối.",
    (_opp, opening) =>
      opening
        ? `Thế trận ${opening} vừa định hình, cần xuất nhanh Xe Mã Pháo cho cân đối.`
        : "Còn ở khai cuộc, cần đưa nhanh các quân lớn ra trận.",
    (_opp, opening) =>
      opening
        ? `Với ${opening}, ưu tiên lúc này là ra đủ quân lớn.`
        : "Giai đoạn khai cuộc: ưu tiên ra quân nhanh, tránh đi một quân nhiều lần.",
  ],
  tanCong: [
    (opp) => `Cung tướng ${opp} đang yếu, nên dồn quân tấn công.`,
    (opp) => `Cung ${opp} có điểm yếu, đây là lúc tập trung quân công sát.`,
    (opp) => `Nên tận dụng cung tướng ${opp} đang lỏng để tổ chức tấn công.`,
  ],
  phongThu: [
    () => "Cung tướng mình đang bị uy hiếp, nên ưu tiên phòng thủ.",
    () => "Cung tướng mình đang chịu sức ép, cần củng cố phòng tuyến trước.",
    () => "Đối phương đang uy hiếp cung tướng, trước hết phải giữ nhà.",
  ],
  donGianHoa: [
    () => "Đang hơn quân, nên giữ chắc và đơn giản hóa thế cờ.",
    () => "Đã hơn quân, cách thắng chắc nhất là đổi bớt quân và hạn chế rủi ro.",
    () => "Đang ưu thế về quân, nên chơi chắc tay, không cho đối phương cơ hội phản công.",
  ],
  tanCuoc: [
    () => "Đã vào tàn cuộc, Tốt qua sông và khai thác điểm yếu Sĩ Tượng là then chốt.",
    () => "Ván cờ đã sang tàn cuộc, mỗi con Tốt qua sông đều quý và Sĩ Tượng thiếu là điểm yếu chết người.",
    () => "Ở tàn cuộc, cần đưa Tốt qua sông và nhắm vào chỗ khuyết Sĩ Tượng của đối phương.",
  ],
  canBang: [() => ""],
};

/** Câu cho lý do nước nên đi tốt hơn (đứng được sau "giúp", "vì" hoặc dấu hai chấm). */
export const GAIN_TEXT: Record<Principle, string[]> = {
  xe: ["Xe thông đường hơn", "Xe hoạt động rộng hơn", "Xe chiếm được đường thông thoáng hơn"],
  ma: ["Mã có thêm chỗ nhảy", "Mã linh hoạt hơn", "Mã có thêm điểm nhảy"],
  raQuan: ["đưa thêm quân ra trận", "ra quân nhanh hơn", "thêm một quân lớn tham chiến"],
  apLuc: [
    "tăng sức ép lên cung tướng đối phương",
    "siết chặt cung tướng đối phương hơn",
    "gia tăng áp lực lên cung đối phương",
  ],
  anToan: ["cung tướng mình an toàn hơn", "cung tướng mình vững hơn", "củng cố cung tướng"],
  matGoc: ["không để quân mất gốc", "giữ các quân đều có gốc", "quân nào cũng có gốc"],
  phongToa: ["chặn đường Xe đối phương", "bó Xe đối phương", "hạn chế đường đi của Xe đối phương"],
  tot: ["có thêm Tốt qua sông", "đưa thêm Tốt qua sông", "tăng số Tốt qua sông"],
  diemThenChot: ["đưa quân vào điểm then chốt", "chiếm được điểm then chốt", "đặt quân vào vị trí đắc địa"],
  catLienLac: [
    "cắt liên lạc giữa các quân đối phương",
    "chia cắt quân đối phương",
    "làm quân đối phương mất gốc",
  ],
  khongCheTuong: [
    "khống chế đường ra của Tướng đối phương",
    "khóa đường chạy của Tướng đối phương",
    "bó hẹp chỗ đứng của Tướng đối phương",
  ],
  khuyetSi: [
    "tận dụng điểm yếu đối phương khuyết Sĩ (khuyết Sĩ kỵ Mã)",
    "đánh vào chỗ khuyết Sĩ của đối phương (khuyết Sĩ kỵ Mã)",
  ],
  khuyetTuong: [
    "khoét sâu vào thế đối phương khuyết Tượng (khuyết Tượng kỵ Pháo)",
    "khai thác chỗ khuyết Tượng của đối phương (khuyết Tượng kỵ Pháo)",
  ],
  totVaoCung: [
    "đưa Tốt áp sát uy hiếp cung tướng",
    "đưa Tốt tiến sát cung tướng đối phương",
    "dùng Tốt uy hiếp sát cung",
  ],
};

/** Câu cho việc nước đã đi làm nguyên lý kém đi (đứng được sau tên nước, "nhưng" hoặc dấu hai chấm). */
export const LOSS_TEXT: Record<Principle, string[]> = {
  xe: ["làm Xe bị bó", "khiến Xe kém hoạt động", "làm Xe mất đường"],
  ma: ["làm Mã bị chặn chân", "khiến Mã bị bó chân", "làm Mã khó nhảy"],
  raQuan: ["chưa giúp gì cho việc ra quân", "làm chậm việc ra quân", "chưa đưa thêm quân nào ra trận"],
  apLuc: [
    "giảm sức ép lên cung tướng đối phương",
    "nới lỏng áp lực lên cung đối phương",
    "để cung đối phương dễ thở hơn",
  ],
  anToan: ["làm cung tướng hở ra", "làm cung tướng mình yếu đi", "để lộ sơ hở ở cung tướng"],
  matGoc: ["để quân mất gốc", "để quân không có gốc", "bỏ quân không gốc"],
  phongToa: ["mở đường cho Xe đối phương", "thả Xe đối phương ra", "để Xe đối phương hoạt động tự do hơn"],
  tot: ["chưa đưa Tốt qua sông", "chưa tận dụng được Tốt", "để Tốt dậm chân tại chỗ"],
  diemThenChot: ["rời điểm then chốt", "bỏ vị trí then chốt", "rời khỏi chỗ đứng quan trọng"],
  catLienLac: [
    "để quân đối phương nối lại liên lạc",
    "giúp quân đối phương liên kết lại",
    "để quân đối phương có gốc trở lại",
  ],
  khongCheTuong: [
    "nới đường ra cho Tướng đối phương",
    "thả lỏng Tướng đối phương",
    "để Tướng đối phương có đường thoát",
  ],
  khuyetSi: [
    "bỏ lỡ cơ hội đánh vào điểm yếu khuyết Sĩ của đối phương",
    "chưa tận dụng chỗ khuyết Sĩ của đối phương",
  ],
  khuyetTuong: [
    "chưa khai thác được thế khuyết Tượng của đối phương",
    "bỏ qua chỗ khuyết Tượng của đối phương",
  ],
  totVaoCung: ["chưa đưa được Tốt áp sát cung tướng", "để Tốt đứng xa cung tướng đối phương"],
};

export type OpeningFaultType = "repeatPiece" | "lateRook";

export interface OpeningFault {
  fault: OpeningFaultType;
  pieceSquare: number;
}

/** Nhận diện các lỗi khai cuộc căn bản: đi một quân nhiều lần, ra Xe chậm trễ. */
export function detectOpeningFault(
  board: Board,
  move: Move,
  ply: number,
  mover: Side,
  historyMoves?: Move[],
): OpeningFault | null {
  if (ply > 16) return null;

  const undeveloped = HOME[mover].filter(
    (i) => board[i] && sideOf(board[i]!) === mover && "rnc".includes(typeOf(board[i]!)),
  ).length;

  // Tìm quân đang đi: ưu tiên ô move.from (trước nước đi), nếu trống thì kiểm tra ô move.to (sau nước đi)
  const square = (board[move.from] && sideOf(board[move.from]!) === mover)
    ? move.from
    : (board[move.to] && sideOf(board[move.to]!) === mover)
      ? move.to
      : null;
  if (square === null) return null;

  const movingPiece = board[square]!;
  const pType = typeOf(movingPiece);

  // 1. Đi một quân nhiều lần trong khai cuộc khi còn >= 2 quân lớn chưa xuất quân
  if (historyMoves && historyMoves.length >= 2 && undeveloped >= 2) {
    const timesMoved = historyMoves.filter((m, idx) => idx % 2 === (mover === "r" ? 0 : 1) && m.to === move.from).length;
    if (timesMoved >= 1 && "rnc".includes(pType)) {
      return { fault: "repeatPiece", pieceSquare: square };
    }
  }

  // 2. Ra Xe chậm: sau 8 nửa nước (ply >= 8), cả 2 Xe vẫn nằm nguyên ở ô ban đầu mà nước này lại đi quân khác
  if (ply >= 8) {
    const [leftRook, rightRook] = mover === "r" ? [81, 89] : [0, 8];
    const bothRooksHome =
      board[leftRook] &&
      typeOf(board[leftRook]!) === "r" &&
      sideOf(board[leftRook]!) === mover &&
      board[rightRook] &&
      typeOf(board[rightRook]!) === "r" &&
      sideOf(board[rightRook]!) === mover;

    if (bothRooksHome && pType !== "r") {
      return { fault: "lateRook", pieceSquare: square };
    }
  }

  return null;
}
