// Nguyên lý chiến lược, theo 3 tầng:
// 1. Thế trận: giai đoạn ván, cán cân quân, sức ép lên hai cung tướng.
// 2. Kế hoạch: từ thế trận suy ra việc chính cần làm (ra quân, tấn công, phòng thủ, đơn giản hóa, tàn cuộc).
// 3. Nguyên lý: các chỉ số đo được trên bàn cờ; kế hoạch quyết định trọng số của từng chỉ số.
// Giải thích một nước = so chỉ số của thế sau nước đã đi với thế sau nước nên đi, lấy nguyên lý chênh nhiều nhất.

import { Board, Side, colOf, isDefended, opponent, pseudoMoves, rowOf, sideOf, typeOf } from "./engine";

export type Principle =
  | "xe" // Xe thông đường (số ô Xe đi được)
  | "ma" // Mã linh hoạt (số ô Mã nhảy được, Mã bị chặn chân thì thấp)
  | "raQuan" // số quân lớn đã rời vị trí ban đầu
  | "apLuc" // số ô trong cung tướng đối phương bị quân mình khống chế
  | "anToan" // cung tướng mình ít bị khống chế, Sĩ Tượng đủ
  | "matGoc" // ít quân lớn không có gốc (không được bảo vệ)
  | "phongToa" // Xe đối phương bị bó
  | "tot"; // Tốt đã qua sông

export const PRINCIPLES: Principle[] = ["xe", "ma", "raQuan", "apLuc", "anToan", "matGoc", "phongToa", "tot"];

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
  raQuan: { xe: 1.5, ma: 0.3, raQuan: 3, apLuc: 0.5, anToan: 1, matGoc: 1, phongToa: 1, tot: 0 },
  tanCong: { xe: 0.7, ma: 0.2, raQuan: 0.5, apLuc: 3, anToan: 1, matGoc: 1, phongToa: 0.7, tot: 0.5 },
  phongThu: { xe: 0.3, ma: 0.1, raQuan: 0.3, apLuc: 0.5, anToan: 3, matGoc: 1.5, phongToa: 1, tot: 0 },
  donGianHoa: { xe: 0.5, ma: 0.2, raQuan: 0, apLuc: 0.5, anToan: 2, matGoc: 2, phongToa: 1, tot: 1 },
  tanCuoc: { xe: 0.7, ma: 0.2, raQuan: 0, apLuc: 1, anToan: 1, matGoc: 1, phongToa: 1, tot: 3 },
  canBang: { xe: 1.5, ma: 0.3, raQuan: 0.5, apLuc: 1, anToan: 1, matGoc: 1, phongToa: 1.5, tot: 0.5 },
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

export const PLAN_TEXT: Record<Plan, (opp: string) => string> = {
  raQuan: () => "Đang khai cuộc, việc chính là ra quân nhanh và cân đối.",
  tanCong: (opp) => `Cung tướng ${opp} đang yếu, nên dồn quân tấn công.`,
  phongThu: () => "Cung tướng mình đang bị uy hiếp, nên ưu tiên phòng thủ.",
  donGianHoa: () => "Đang hơn quân, nên giữ chắc và đơn giản hóa thế cờ.",
  tanCuoc: () => "Đã vào tàn cuộc, Tốt qua sông và quân linh hoạt là then chốt.",
  canBang: () => "",
};

/** Câu cho lý do nước nên đi tốt hơn. */
export const GAIN_TEXT: Record<Principle, string> = {
  xe: "Xe thông đường hơn",
  ma: "Mã có thêm chỗ nhảy",
  raQuan: "đưa thêm quân ra trận",
  apLuc: "tăng sức ép lên cung tướng đối phương",
  anToan: "cung tướng mình an toàn hơn",
  matGoc: "không để quân mất gốc",
  phongToa: "chặn đường Xe đối phương",
  tot: "có thêm Tốt qua sông",
};

/** Câu cho việc nước đã đi làm nguyên lý kém đi. */
export const LOSS_TEXT: Record<Principle, string> = {
  xe: "làm Xe bị bó",
  ma: "làm Mã bị chặn chân",
  raQuan: "chưa giúp gì cho việc ra quân",
  apLuc: "giảm sức ép lên cung tướng đối phương",
  anToan: "làm cung tướng hở ra",
  matGoc: "để quân mất gốc",
  phongToa: "mở đường cho Xe đối phương",
  tot: "chưa đưa Tốt qua sông",
};
