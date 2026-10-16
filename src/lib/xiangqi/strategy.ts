// Nguyên lý chiến lược, theo 3 tầng:
// 1. Thế trận: giai đoạn ván, cán cân quân, sức ép lên hai cung tướng.
// 2. Kế hoạch: từ thế trận suy ra việc chính cần làm (ra quân, tấn công, phòng thủ, đơn giản hóa, tàn cuộc).
// 3. Nguyên lý: các chỉ số đo được trên bàn cờ; kế hoạch quyết định trọng số của từng chỉ số.
// Giải thích một nước = so chỉ số của thế sau nước đã đi với thế sau nước nên đi, lấy nguyên lý chênh nhiều nhất.

import { Board, Move, Side, attackersOf, colOf, isDefended, opponent, pseudoMoves, rowOf, sideOf, typeOf, inPalaceSq as inPalace, inCheck, initialPosition, play } from "./engine";
import { extractFeatures } from "./features";
import { moveNotation } from "./notation";
import { isBookMove } from "./openings";

export type Principle =
  | "xe" // Xe thông đường (số ô Xe đi được)
  | "ma" // Mã linh hoạt (số ô Mã nhảy được, Mã bị chặn chân thì thấp)
  | "raQuan" // số quân lớn đã rời vị trí ban đầu
  | "apLuc" // số ô trong cung tướng đối phương bị quân mình khống chế
  | "anToan" // cung tướng mình ít bị khống chế, Sĩ Tượng đủ
  | "matGoc" // ít quân lớn không có căn (không được bảo vệ)
  | "phongToa" // Xe đối phương bị bó
  | "tot" // Tốt đã qua sông
  | "diemThenChot" // quân đứng ở điểm then chốt: Mã hà khẩu/ngọa tào/quải giác, Xe chiếm sườn, Pháo đầu
  | "catLienLac" // quân lớn của đối phương không có căn (liên lạc bị cắt)
  | "khongCheTuong" // đường ra của Tướng đối phương bị khống chế
  | "khuyetSi" // tận dụng đối phương khuyết Sĩ (khuyết Sĩ kỵ Mã)
  | "khuyetTuong" // tận dụng đối phương khuyết Tượng (khuyết Tượng kỵ Pháo)
  | "totVaoCung" // Tốt áp sát uy hiếp cung tướng đối phương
  | "maBien" // "Mã đi biên là Mã chết": Mã đứng cột biên ít chỗ nhảy
  | "lienHoan" // Sĩ liên hoàn, Tượng liên hoàn: phòng tuyến tự bảo vệ nhau
  | "loThong" // Xe chiếm lộ thông (cột không còn Tốt mình chắn)
  | "phoiHop" // hợp đồng tác chiến: nhiều loại quân cùng ép cung, không đánh một mình
  | "totLienHoan" // Tốt qua sông phải nối nhau mới có sức
  | "yeuDao"; // ba nguyên tắc khai cuộc (3): chiếm yếu đạo (lộ 2/8 cho Xe, hàng Tốt đối phương, lộ 3/7 cho Pháo)

export const PRINCIPLES: Principle[] = [
  "xe", "ma", "raQuan", "apLuc", "anToan", "matGoc", "phongToa", "tot", "diemThenChot", "catLienLac", "khongCheTuong",
  "khuyetSi", "khuyetTuong", "totVaoCung", "maBien", "lienHoan", "loThong", "phoiHop", "totLienHoan",
  "yeuDao",
];

export type Plan = "raQuan" | "tanCong" | "phongThu" | "donGianHoa" | "tanCuoc" | "canBang";

const VALUE: Record<string, number> = { k: 0, a: 200, b: 200, n: 400, r: 900, c: 450, p: 100 };

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

/** Số ô trong cung tướng của `target` bị phe đối phương khống chế. */
export function palacePressure(board: Board, target: Side): number {
  const by = opponent(target);
  const hit = new Set<number>();
  for (const i of pieces(board, by, "rncp")) for (const to of pseudoMoves(board, i)) if (inPalace(to, target)) hit.add(to);
  return hit.size;
}

/** Số hàng phe `s` đã tiến khỏi hàng đáy của mình (0–9). */
export const advance = (i: number, s: Side) => (s === "r" ? 9 - rowOf(i) : rowOf(i));

/**
 * Như `palacePressure` nhưng chỉ tính quân ĐÃ QUA SÔNG. Dùng để chọn kế hoạch: Xe ở hàng đáy hay Pháo
 * bên phần sân mình nhìn dọc lộ mở vào cung chỉ là lộ thông, chưa phải đang tấn công.
 */
export function attackPressure(board: Board, target: Side): number {
  const by = opponent(target);
  const hit = new Set<number>();
  for (const i of pieces(board, by, "rncp")) {
    if (advance(i, by) < 5) continue;
    for (const to of pseudoMoves(board, i)) if (inPalace(to, target)) hit.add(to);
  }
  return hit.size;
}

/** Quân phe `s` đứng ở điểm then chốt. */
export function keySquares(board: Board, s: Side): number {
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
export function kingControl(board: Board, s: Side): number {
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

/** Số cặp Sĩ liên hoàn và Tượng liên hoàn (che nhau được) của phe `s`. */
export function linkedGuards(board: Board, s: Side): number {
  let n = 0;
  const [a1, a2] = pieces(board, s, "a");
  if (a2 !== undefined && Math.abs(rowOf(a1) - rowOf(a2)) === 1 && Math.abs(colOf(a1) - colOf(a2)) === 1) n++;
  const [b1, b2] = pieces(board, s, "b");
  if (b2 !== undefined && Math.abs(rowOf(b1) - rowOf(b2)) === 2 && Math.abs(colOf(b1) - colOf(b2)) === 2) {
    const eye = ((rowOf(b1) + rowOf(b2)) / 2) * 9 + (colOf(b1) + colOf(b2)) / 2;
    if (!board[eye]) n++; // mắt Tượng bị chèn thì không che nhau được
  }
  return n;
}

/** Ô nhà của Xe, Mã, Pháo phe `s` mà quân đúng loại vẫn còn đứng (Xe bình sang ô Mã không tính là chưa ra). */
function homePieces(board: Board, s: Side): number[] {
  const homeType = (i: number) => (colOf(i) === 0 || colOf(i) === 8 ? "r" : rowOf(i) === 0 || rowOf(i) === 9 ? "n" : "c");
  return HOME[s].filter((i) => board[i] && sideOf(board[i]!) === s && typeOf(board[i]!) === homeType(i));
}

/** Chênh lệch số quân lớn còn nằm nhà giữa cánh trái và cánh phải (0 = cân bằng, 3 = một cánh ra hết, cánh kia chưa động). */
export function wingImbalance(board: Board, s: Side): number {
  const home = homePieces(board, s);
  const left = home.filter((i) => colOf(i) < 4).length;
  return Math.abs(left - (home.length - left));
}

/** Số quân lớn phe `s` đang chiếm yếu đạo khai cuộc (không tính Pháo đầu, đã có ở điểm then chốt). */
export function keyRoutes(board: Board, s: Side): number {
  let n = 0;
  for (const i of pieces(board, s, "r")) {
    const c = colOf(i);
    if (c === 1 || c === 7) n++; // lộ 2/8: đường của Xe trực
    if (advance(i, s) === 6) n++; // hàng Tốt đối phương: Xe ép Tốt, áp Mã
  }
  for (const i of pieces(board, s, "c")) if ((colOf(i) === 2 || colOf(i) === 6) && advance(i, s) >= 2) n++; // lộ 3/7: nhắm Mã
  return n;
}

/** Số loại quân lớn (Xe, Mã, Pháo) của phe `s` cùng khống chế cung tướng đối phương. */
export function coordination(board: Board, s: Side): number {
  const o = opponent(s);
  const types = new Set<string>();
  for (const i of pieces(board, s, "rnc")) if (pseudoMoves(board, i).some((to) => inPalace(to, o))) types.add(typeOf(board[i]!));
  return types.size >= 2 ? types.size : 0; // một quân đơn độc chưa phải phối hợp
}

/** Chỉ số nguyên lý của phe `s` (càng cao càng tốt cho `s`), đã quy về cùng thang. */
export function principleScores(board: Board, s: Side): Record<Principle, number> {
  const o = opponent(s);
  const feat = extractFeatures(board);
  const myFeat = feat[s];
  const oppFeat = feat[o];

  const guards = pieces(board, s, "ab").length;
  const xeMobility = myFeat.pieces.filter((p) => typeOf(p.ref.piece) === "r").reduce((n, p) => n + p.mobility, 0);
  const maMobility = myFeat.pieces.filter((p) => typeOf(p.ref.piece) === "n").reduce((n, p) => n + p.mobility, 0);
  const oppXeMobility = oppFeat.pieces.filter((p) => typeOf(p.ref.piece) === "r").reduce((n, p) => n + p.mobility, 0);

  return {
    xe: xeMobility / 3,
    ma: maMobility / 2,
    raQuan: -HOME[s].filter((i) => board[i] && sideOf(board[i]!) === s && "rnc".includes(typeOf(board[i]!))).length,
    apLuc: palacePressure(board, o),
    anToan: -palacePressure(board, s) + guards / 2,
    matGoc: -(myFeat.byTag.matGoc?.length ?? 0),
    phongToa: -oppXeMobility / 3,
    tot: myFeat.byTag.totQuaHa?.length ?? 0,
    diemThenChot: keySquares(board, s),
    catLienLac: oppFeat.byTag.matGoc?.length ?? 0,
    khongCheTuong: kingControl(board, s),
    khuyetSi: pieces(board, s, "n").length > 0 && pieces(board, o, "a").length <= 1 ? (2 - pieces(board, o, "a").length) * 1.5 : 0,
    khuyetTuong: pieces(board, s, "c").length > 0 && pieces(board, o, "b").length <= 1 ? (2 - pieces(board, o, "b").length) * 1.5 : 0,
    totVaoCung: (myFeat.byTag.totVaoCung?.length ?? 0) * 2,
    maBien: -(myFeat.byTag.maBien?.length ?? 0),
    lienHoan: linkedGuards(board, s),
    loThong: myFeat.byTag.xeLoThong?.length ?? 0,
    phoiHop: coordination(board, s),
    totLienHoan: myFeat.pieces.filter((p) => p.tags.includes("totQuaHa") && p.tags.includes("totLienHoan")).length,
    yeuDao: keyRoutes(board, s),
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
  if (attackPressure(board, s) >= 3) return "phongThu";
  // Đối phương trơ Sĩ Tượng hoặc cung đang bị quân qua sông ép thì tấn công, kể cả khi đang hơn quân.
  if (attackPressure(board, o) >= 3 || pieces(board, o, "ab").length <= 2) return "tanCong";
  if (material(board, s) - material(board, o) >= 300) return "donGianHoa";
  return "canBang";
}

/** Trọng số nguyên lý theo kế hoạch. Đây là bảng cần người hiểu cờ (và lời bình cao thủ) để chỉnh. */
export const WEIGHTS: Record<Plan, Record<Principle, number>> = {
  raQuan: { xe: 1.5, ma: 0.3, raQuan: 3, apLuc: 0.5, anToan: 1, matGoc: 1, phongToa: 1, tot: 0, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 0, khuyetTuong: 0, totVaoCung: 0, maBien: 1, lienHoan: 0.5, loThong: 1, phoiHop: 0.3, totLienHoan: 0, yeuDao: 1 },
  tanCong: { xe: 0.7, ma: 0.2, raQuan: 0.5, apLuc: 3, anToan: 1, matGoc: 1, phongToa: 0.7, tot: 0.5, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 1.5, khuyetTuong: 1.5, totVaoCung: 2, maBien: 0.7, lienHoan: 0.3, loThong: 1, phoiHop: 1.5, totLienHoan: 0.5, yeuDao: 0.5 },
  phongThu: { xe: 0.3, ma: 0.1, raQuan: 0.3, apLuc: 0.5, anToan: 3, matGoc: 1.5, phongToa: 1, tot: 0, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 0.5, khuyetTuong: 0.5, totVaoCung: 0, maBien: 0.3, lienHoan: 1.5, loThong: 0.3, phoiHop: 0.3, totLienHoan: 0, yeuDao: 0.3 },
  donGianHoa: { xe: 0.5, ma: 0.2, raQuan: 0, apLuc: 0.5, anToan: 2, matGoc: 2, phongToa: 1, tot: 1, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 1, khuyetTuong: 1, totVaoCung: 1, maBien: 0.5, lienHoan: 1, loThong: 0.5, phoiHop: 0.5, totLienHoan: 1, yeuDao: 0.3 },
  tanCuoc: { xe: 0.7, ma: 0.2, raQuan: 0, apLuc: 1, anToan: 1, matGoc: 1, phongToa: 1, tot: 3, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 3, khuyetTuong: 3, totVaoCung: 3.5, maBien: 0.7, lienHoan: 1, loThong: 0.5, phoiHop: 1, totLienHoan: 1.5, yeuDao: 0 },
  canBang: { xe: 1.5, ma: 0.3, raQuan: 0.5, apLuc: 1, anToan: 1, matGoc: 1, phongToa: 1.5, tot: 0.5, diemThenChot: 1, catLienLac: 1, khongCheTuong: 1, khuyetSi: 1, khuyetTuong: 1, totVaoCung: 1, maBien: 1, lienHoan: 0.5, loThong: 1, phoiHop: 1, totLienHoan: 0.5, yeuDao: 1 },
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
  matGoc: ["không để quân mất căn", "giữ các quân đều có căn", "quân nào cũng có căn"],
  phongToa: ["chặn đường Xe đối phương", "bó Xe đối phương", "hạn chế đường đi của Xe đối phương"],
  tot: ["có thêm Tốt qua sông", "đưa thêm Tốt qua sông", "tăng số Tốt qua sông"],
  diemThenChot: ["đưa quân vào điểm then chốt", "chiếm được điểm then chốt", "đặt quân vào vị trí đắc địa"],
  catLienLac: [
    "cắt liên lạc giữa các quân đối phương",
    "chia cắt quân đối phương",
    "làm quân đối phương mất căn",
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
  maBien: ["kéo Mã khỏi biên (Mã đi biên là Mã chết)", "đưa Mã vào trung tâm, tránh Mã biên"],
  lienHoan: ["giữ Sĩ Tượng liên hoàn", "nối liên hoàn Sĩ Tượng cho phòng tuyến vững", "để Sĩ Tượng che nhau được"],
  loThong: ["đưa Xe chiếm lộ thông", "cho Xe chiếm cột mở", "đặt Xe lên lộ thông"],
  phoiHop: [
    "phối hợp nhiều quân cùng ép cung (hợp đồng tác chiến)",
    "để các quân hỗ trợ nhau tấn công thay vì đánh đơn độc",
  ],
  totLienHoan: ["giữ Tốt qua sông nối liên hoàn", "nối các Tốt qua sông với nhau"],
  yeuDao: ["chiếm yếu đạo", "đưa quân lớn lên yếu đạo", "giành đường then chốt cho quân lớn"],
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
  matGoc: ["để quân mất căn", "để quân không có căn", "bỏ quân không căn"],
  phongToa: ["mở đường cho Xe đối phương", "thả Xe đối phương ra", "để Xe đối phương hoạt động tự do hơn"],
  tot: ["chưa đưa Tốt qua sông", "chưa tận dụng được Tốt", "để Tốt dậm chân tại chỗ"],
  diemThenChot: ["rời điểm then chốt", "bỏ vị trí then chốt", "rời khỏi chỗ đứng quan trọng"],
  catLienLac: [
    "để quân đối phương nối lại liên lạc",
    "giúp quân đối phương liên kết lại",
    "để quân đối phương có căn trở lại",
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
  maBien: ["đưa Mã ra biên (Mã đi biên là Mã chết)", "để Mã lạc ra biên"],
  lienHoan: ["phá thế liên hoàn của Sĩ Tượng", "làm Sĩ Tượng mất liên hoàn", "để Sĩ Tượng không che được nhau"],
  loThong: ["để Xe rời lộ thông", "bỏ cột mở cho Xe", "đưa Xe khỏi lộ thông"],
  phoiHop: ["để quân tấn công đơn độc, thiếu phối hợp", "làm rời rạc thế phối hợp tấn công"],
  totLienHoan: ["làm Tốt qua sông rời nhau", "để Tốt qua sông đơn độc"],
  yeuDao: ["bỏ yếu đạo", "rời đường then chốt", "để mất yếu đạo"],
};

export type OpeningFaultType =
  | "repeatPiece" | "lateRook" | "edgeElephant" | "doubleEdgeHorse" | "earlyAdvisor" | "advisorBlocksRook" | "oneWing"
  | "ignoreCenter" | "earlyCannon" | "edgeHorse";

export interface OpeningFault {
  fault: OpeningFaultType;
  pieceSquare: number;
}

/**
 * Lịch sử + nước `move` có nằm trong sách khai cuộc không. Chỉ xét được khi ván bắt đầu từ thế chuẩn:
 * đi lại lịch sử từ thế đầu phải ra đúng `board`, nếu không coi như ngoài sách.
 */
function inOpeningBook(board: Board, move: Move, historyMoves: Move[]): boolean {
  let cur = initialPosition().board;
  const notations: string[] = [];
  for (const m of historyMoves) {
    if (!cur[m.from]) return false;
    notations.push(moveNotation(cur, m));
    cur = play(cur, m);
  }
  if (cur.some((p, i) => p !== board[i])) return false;
  notations.push(moveNotation(board, move));
  return isBookMove(notations);
}

/** Các ô quân đang ở `square` đã đứng trước đó (lần ngược theo các nước của phe `mover`), gần nhất trước. */
function pieceTrail(square: number, mover: Side, historyMoves: Move[]): number[] {
  const trail: number[] = [];
  let cur = square;
  for (let j = historyMoves.length - 1; j >= 0; j--) {
    if ((j % 2 === 0 ? "r" : "b") !== mover) continue;
    if (historyMoves[j].to === cur) {
      cur = historyMoves[j].from;
      trail.push(cur);
    }
  }
  return trail;
}

/**
 * "Khai cuộc kỵ đi một quân nhiều lần" — chỉ tính khi thật sự lãng phí nước:
 * - đi tới lui (quay lại ô đã đứng);
 * - Mã / Pháo đi lần thứ ba, Xe đi lần thứ tư (Xe ra hai ba bước là cách ra Xe bình thường);
 * - Mã / Pháo đi lần thứ hai khi cả hai Mã còn nằm nhà (vd. Pháo đầu rồi đi tiếp Pháo, chưa ra quân nào khác).
 * Không tính: ăn quân, chạy quân đang bị dọa, nước tạo đòn dọa mới (nhắm quân, không tính chiếu suông), nước theo sách.
 * Chiếu suông vẫn tính: Pháo đầu tiến chiếu chỉ ép đối phương bổ Sĩ / Tượng — họ ra quân, mình mất nước.
 * `board` có thể là thế trước hoặc sau nước đi (`square` là ô quân đang đứng trên `board`).
 */
function isRepeatPieceFault(
  board: Board, move: Move, square: number, mover: Side, pType: string, historyMoves: Move[],
): boolean {
  const trail = pieceTrail(move.from, mover, historyMoves);
  if (trail.length === 0) return false;
  const backAndForth = trail.includes(move.to);
  const horsesHome = HORSE_HOME[mover].filter((i) => board[i] && sideOf(board[i]!) === mover && typeOf(board[i]!) === "n").length;
  const tooMany = pType === "r" ? trail.length >= 3 : trail.length >= 2 || horsesHome === 2;
  if (!backAndForth && !tooMany) return false;

  // Các miễn trừ chiến thuật chỉ xét được khi có thế trước nước đi.
  if (square === move.from && (purposefulMove(board, move, mover) || inOpeningBook(board, move, historyMoves))) return false;
  return true;
}

/**
 * Nước có mục đích chiến thuật nên không thể coi là lãng phí / sai hình khai cuộc:
 * ăn quân, chạy quân đang bị dọa (bị ăn có lời hoặc bị quân nhẹ hơn nhắm), hoặc tạo đòn dọa mới
 * (nhắm quân đối phương không có căn hay quân lớn hơn mình; chiếu suông không tính). `board` là thế trước nước đi.
 */
function purposefulMove(board: Board, move: Move, mover: Side, countThreats = true): boolean {
  const piece = board[move.from];
  if (!piece) return false;
  if (board[move.to]) return true;
  const opp = opponent(mover);
  const pType = typeOf(piece);
  const attackers = attackersOf(board, move.from, opp);
  const cheaperAttacker = attackers.some((i) => VALUE[typeOf(board[i]!)] < VALUE[pType]);
  if (attackers.length > 0 && (cheaperAttacker || !isDefended(board, move.from, mover))) return true;
  if (!countThreats) return false;
  const after = play(board, move);
  return pseudoMoves(after, move.to).some((t) => {
    const v = after[t];
    return !!v && sideOf(v) === opp && typeOf(v) !== "k" && (VALUE[typeOf(v)] > VALUE[pType] || !isDefended(after, t, opp));
  });
}

/** Ô nhà của hai Mã mỗi bên. */
const HORSE_HOME: Record<Side, number[]> = { r: [82, 88], b: [1, 7] };

/** Bỏ trung lộ, Pháo xuất kích sớm, Mã ra biên khi chưa có Mã chính (chưa xét sách khai cuộc). */
function shapeFault(
  board: Board, move: Move, mover: Side, pType: string, edge: (i: number) => boolean,
): "ignoreCenter" | "earlyCannon" | "edgeHorse" | null {
  const victim = board[move.to];
  const opp = opponent(mover);
  if (!inCheck(board, mover) && !victim) {
    // Bỏ trung lộ: Pháo đầu đối phương nhắm Tốt đầu mình (Tốt chưa qua sông) mà Tốt không có căn.
    // Không tính khi: mình cũng đặt Pháo đầu đối lại (Thuận / Nghịch Pháo) — giữ trung lộ bằng phản kích;
    // hoặc đã phi Tượng về giữa — Pháo ăn Tốt đầu thì chiếu qua ngòi Tượng, bị bổ Sĩ là Pháo kẹt (đại sư hay để như vậy).
    const after = play(board, move);
    const centerPawn = pieces(after, mover, "p").find((i) => colOf(i) === 4 && advance(i, mover) <= 4);
    if (centerPawn !== undefined) {
      const cannonAims = attackersOf(after, centerPawn, opp).some((i) => typeOf(after[i]!) === "c" && colOf(i) === 4);
      const counterCannon = pieces(after, mover, "c").some((i) => colOf(i) === 4);
      const centralElephant = pieces(after, mover, "b").some((i) => colOf(i) === 4);
      if (cannonAims && !counterCannon && !centralElephant && !isDefended(after, centerPawn, mover)) return "ignoreCenter";
    }
  }
  // Pháo xuất kích sang sông khi cả hai Mã còn nằm nhà (ăn được quân lớn là chiến thuật, không tính).
  if (pType === "c" && advance(move.to, mover) >= 5 && !(victim && "rnc".includes(typeOf(victim)))) {
    const horsesHome = HORSE_HOME[mover].filter((i) => board[i] && sideOf(board[i]!) === mover && typeOf(board[i]!) === "n").length;
    if (horsesHome === 2) return "earlyCannon";
  }
  // Mã ra biên khi chưa có Mã chính nào giữ trung lộ mà vẫn còn đường ra Chính Mã (ô không ở biên, không lùi, còn trống).
  // Đã có một Mã chính thì Mã kia ra biên là thế Mã chính + Mã biên bình thường.
  if (pType === "n" && edge(move.to) && !edge(move.from)) {
    const hasCentralHorse = pieces(board, mover, "n").some((i) => i !== move.from && !edge(i) && !HORSE_HOME[mover].includes(i));
    const centralRoute = pseudoMoves(board, move.from).some(
      (to) => !edge(to) && !board[to] && advance(to, mover) >= advance(move.to, mover),
    );
    if (!hasCentralHorse && centralRoute) return "edgeHorse";
  }
  return null;
}

/**
 * Nhận diện các lỗi khai cuộc căn bản: đi một quân nhiều lần, ra Xe chậm trễ, lệch cánh, bổ Sĩ sớm / chặn Xe,
 * phi Tượng ra biên, Mã ra biên (một hay cả hai), bỏ trung lộ trước Pháo đầu, Pháo xuất kích khi chưa ra Mã.
 */
export function detectOpeningFault(
  board: Board,
  move: Move,
  ply: number,
  mover: Side,
  historyMoves?: Move[],
): OpeningFault | null {
  if (ply > 16) return null;

  // Quân lớn còn nằm nhà, xét đúng loại quân (Xe trực đã bình sang ô Mã là đã ra).
  const undeveloped = homePieces(board, mover).length;

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
  if (historyMoves && historyMoves.length >= 2 && undeveloped >= 2 && "rnc".includes(pType)) {
    if (isRepeatPieceFault(board, move, square, mover, pType, historyMoves)) {
      return { fault: "repeatPiece", pieceSquare: square };
    }
  }

  // 2. Ra Xe chậm: sau 8 nửa nước (ply >= 8), cả 2 Xe vẫn nằm nguyên ở ô ban đầu mà nước này lại đi quân khác.
  // Không tính nước ra Mã / Pháo lần đầu từ ô nhà (vẫn đang ra quân), phi Tượng / bổ Sĩ lần đầu (dựng thế thủ trước
  // rồi ra Xe là lối chơi đại sư hay dùng), nước có mục đích chiến thuật, nước theo sách.
  const fromStart = square === move.from && initialPosition().board[move.from] === board[move.from];
  const developing = fromStart && ("nc".includes(pType) ? homePieces(board, mover).includes(move.from) : "ab".includes(pType));
  // Chỉ tra sách khi lịch sử khớp số nửa nước (lịch sử rỗng ở ply 8 không phải ván thật từ thế đầu).
  const bookMove = !!historyMoves && historyMoves.length === ply && inOpeningBook(board, move, historyMoves);
  const purposeful = square === move.from && (purposefulMove(board, move, mover) || bookMove);
  if (ply >= 8 && !developing && !purposeful) {
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

  // Các lỗi hình cờ chỉ xét được khi biết ô đến (bàn cờ trước nước đi).
  // Lệch cánh: một cánh đã ra đủ Xe Mã Pháo, cánh kia còn nguyên mà nước này vẫn không ra quân cánh đó.
  // Không tính: Xe bình sang hỗ trợ cánh chưa ra, Tốt bên cánh chưa ra (mở đường cho Mã), nước chiến thuật / theo sách.
  // (Dọa quân không tính: Pháo ở ô nhà vốn không có căn, Xe nhắm vào nó chưa phải lý do bỏ mặc cánh kia.)
  if (
    square === move.from && wingImbalance(board, mover) === 3 && !homePieces(board, mover).includes(move.from) &&
    !purposefulMove(board, move, mover, false) && !bookMove
  ) {
    const home = homePieces(board, mover);
    const idleLeft = home.filter((i) => colOf(i) < 4).length > home.filter((i) => colOf(i) > 4).length;
    const towardIdle = (i: number) => (idleLeft ? colOf(i) < 4 : colOf(i) > 4);
    const rookSwitch = pType === "r" && rowOf(move.to) === rowOf(move.from) && towardIdle(move.to);
    const pawnPrep = pType === "p" && towardIdle(move.from);
    const guardSetup = "ab".includes(pType); // dựng Sĩ Tượng không phải đánh lệch cánh
    if (!rookSwitch && !pawnPrep && !guardSetup) return { fault: "oneWing", pieceSquare: square };
  }
  // Bổ Sĩ để đỡ chiếu, để phòng thủ khi quân đối phương đã qua sông áp cung, hoặc theo đúng sách khai cuộc thì không phải lỗi.
  if (
    square === move.from && pType === "a" && ply <= 12 &&
    !inCheck(board, mover) && attackPressure(board, mover) === 0 && !purposefulMove(board, move, mover, false) &&
    !(historyMoves && inOpeningBook(board, move, historyMoves))
  ) {
    // Sĩ lên giữa cung chặn hàng 2, trong khi Xe cần hàng 2 để ra quân: Xe đã tiến 1 bước để hoành,
    // hoặc Xe còn ở góc mà Mã cạnh nó chưa ra (chưa có đường ra Xe trực, chỉ còn đường lên 1 rồi hoành).
    const center = mover === "r" ? 76 : 13;
    const horseBeside = (rook: number) => {
      const sq = (mover === "r" ? 81 : 0) + (colOf(rook) === 0 ? 1 : 7);
      return board[sq] !== null && board[sq] === (mover === "r" ? "N" : "n");
    };
    const rookNeedsRank = pieces(board, mover, "r").some((i) => {
      if (colOf(i) !== 0 && colOf(i) !== 8) return false;
      const a = advance(i, mover);
      return a === 1 || (a === 0 && horseBeside(i));
    });
    if (move.to === center && rookNeedsRank) return { fault: "advisorBlocksRook", pieceSquare: square };
    // Bổ Sĩ khi quân lớn còn nằm nhà: chậm ra quân, lộ thế trận sớm.
    if (undeveloped >= 3) return { fault: "earlyAdvisor", pieceSquare: square };
  }
  if (square === move.from) {
    const edge = (i: number) => colOf(i) === 0 || colOf(i) === 8;
    // 3. Phi Tượng ra biên: Tượng rời nhau, mất liên hoàn ("phi Tượng loạn là cờ kém").
    if (pType === "b" && edge(move.to)) return { fault: "edgeElephant", pieceSquare: square };
    // 4. Mã thứ hai cũng ra biên: cả hai Mã ít chỗ nhảy ("Mã đi biên là Mã chết").
    if (pType === "n" && edge(move.to) && !edge(move.from)) {
      const otherOnEdge = pieces(board, mover, "n").some((i) => i !== move.from && edge(i));
      if (otherOnEdge) return { fault: "doubleEdgeHorse", pieceSquare: square };
    }

    // Ba lỗi dưới đây đều có biến sách hợp lệ (Thuận Pháo, Biên Mã, Pháo đầu nước 1...), nên nước theo sách được miễn.
    // Tra sách tốn công (đi lại cả lịch sử) nên chỉ tra khi đã khớp một lỗi.
    const candidate = shapeFault(board, move, mover, pType, edge);
    if (candidate && !(historyMoves && inOpeningBook(board, move, historyMoves))) return { fault: candidate, pieceSquare: square };
  }

  return null;
}
