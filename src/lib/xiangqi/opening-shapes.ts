// Nhận diện thế trận khai cuộc theo hình cờ trên bàn (không cần lịch sử nước đi):
// cách ra Xe, thế Pháo, thế Mã, thế Tốt, và một số hình khai cuộc kém.
// Lộ (cột) đánh số theo ký hiệu Việt Nam: mỗi bên tự đếm 1–9 từ phải sang trái.

import { Board, Side, colOf, isDefended, opponent, sideOf, typeOf } from "./engine";
import { advance } from "./strategy";

export type ShapeId =
  // Xe
  | "xeHoanh" | "xeTruc" | "xeSuon" | "xeTuanHa" | "xeTamThat" | "daiXuatXe" | "tieuXuatXe"
  | "xeDeMa" | "xeApMa"
  | "phaoPhongXe" | "songPhaoPhongXe" | "maPhongXe"
  // Pháo
  | "nguLucPhao" | "nguThatPhao" | "nguBatPhao" | "nguCuuPhao"
  | "tuanHaPhao" | "siGiacPhao" | "uyenUongPhao" | "songPhaoQuaHa" | "loiCongPhao" | "quyBoiPhao" | "songBienPhao"
  // Mã
  | "maBanHa" | "songBienMa" | "caiMaTamChuy" | "maQuaiCuoc"
  // Tốt
  | "luongDauXa" | "tamBoHo"
  // Hình kém
  | "tuongBien"
  // Tượng
  | "phiTuongTrungBinh";

export interface Shape {
  id: ShapeId;
  side: Side;
  name: string;
  /** Ý nghĩa kỳ lý, một câu. */
  note: string;
  /** Hình xấu cho phe `side`. */
  bad?: boolean;
}

const INFO: Record<ShapeId, { name: string; note: string; bad?: boolean }> = {
  xeHoanh: { name: "Xe hoành", note: "Xe lên một bước rồi đi ngang, nhanh chuyển sang sườn hoặc cánh kia." },
  xeTruc: { name: "Xe trực", note: "Xe bình sang lộ 2 hoặc lộ 8 (lộ Pháo), từ đó xuất theo đường dọc." },
  xeTamThat: { name: "Xe lộ 3–7", note: "Xe ra theo lộ 3 hoặc lộ 7, phía ngoài sườn, chi viện Mã và Tốt cánh đó." },
  daiXuatXe: { name: "Đại xuất Xe", note: "Xe biên đổi Tốt biên rồi lao thẳng lên sân đối phương; mạnh nhưng hợp cờ tán thủ hơn là thế công gấp." },
  tieuXuatXe: { name: "Tiểu xuất Xe", note: "Xe biên tiến lên hàng Tốt mình, giữ một yếu đạo phòng thủ." },
  xeDeMa: { name: "Xe đè Mã tận gốc", note: "Xe tiến sâu đè chân Mã còn ở nhà, Mã không ra được: cách công Mã mạnh nhất, nhưng đối phương ít khi để xảy ra." },
  xeApMa: { name: "Xe qua hà áp Mã", note: "Xe qua sông đứng chặn chân Mã đối phương; cách công Mã phổ biến nhất của khai cuộc tấn công." },
  xeSuon: { name: "Xe chiếm sườn", note: "Xe đứng lộ 4 hoặc lộ 6, uy hiếp sườn cung tướng." },
  xeTuanHa: { name: "Xe tuần hà", note: "Xe đứng bờ sông mình, vừa công vừa thủ, khống chế đường qua sông." },
  phaoPhongXe: { name: "Pháo phong Xe", note: "Pháo đối phương qua sông chặn đường ra của Xe.", bad: true },
  songPhaoPhongXe: { name: "Song Pháo phong Xe", note: "Cả hai Xe bị Pháo đối phương chặn đường ra.", bad: true },
  maPhongXe: { name: "Ngoại Mã phong Xe", note: "Mã ngoài của đối phương đứng bờ sông chặn lộ Xe; đối phương vừa phong Xe vừa giữ Xe mình tự do, đổi lại trung lộ bên đó mỏng.", bad: true },
  nguLucPhao: { name: "Ngũ lục Pháo", note: "Pháo đầu kèm Pháo lộ 6 sát nhau, quân có căn, thế vững." },
  nguThatPhao: { name: "Ngũ thất Pháo", note: "Pháo đầu kèm Pháo lộ 7, nhắm Mã và Tốt 3 của đối phương." },
  nguBatPhao: { name: "Ngũ bát Pháo", note: "Pháo đầu kèm Pháo lộ 8 tiến lên, ép cánh Xe của đối phương." },
  nguCuuPhao: { name: "Ngũ cửu Pháo", note: "Pháo đầu kèm Pháo biên lộ 9, mở đường cho Xe ra, xuất quân cân bằng." },
  tuanHaPhao: { name: "Pháo tuần hà", note: "Pháo đứng bờ sông mình, vững chắc, dễ chuyển ngang chi viện." },
  siGiacPhao: { name: "Sĩ giác Pháo", note: "Pháo đứng góc Sĩ, thủ chắc và mở đường cho Xe." },
  songBienPhao: { name: "Song biên Pháo", note: "Hai Pháo cùng ra biên; khác với Song biên Mã, đây là cấu trúc tốt, dùng được yên tâm." },
  uyenUongPhao: {
    name: "Uyên ương Pháo",
    note: "Xe biên tiến hai bước giữ Pháo, rồi lui Pháo sang cùng cánh: dồn hai Pháo một bên, có bẫy chiến thuật nhưng trái nguyên tắc chiếm yếu đạo.",
  },
  songPhaoQuaHa: { name: "Song Pháo qua hà", note: "Hai Pháo cùng qua sông, công mạnh nhưng hậu phương mỏng." },
  loiCongPhao: {
    name: "Lôi công Pháo",
    note: "Hai Pháo cùng đặt trung lộ, một Pháo ở hàng 2: dồn sức đánh trung lộ; Pháo dưới cản Tướng Sĩ, nên dùng linh hoạt, không nhất thiết phải chồng giữa.",
  },
  quyBoiPhao: {
    name: "Quy bối Pháo",
    note: "Đáp Pháo đầu bằng lui Pháo 8 một bước rồi bình sang cánh phải (Pháo 8 bình 3); dồn quân một cánh, ra quân vòng vèo, dễ bị Pháo bình lộ sườn phong tỏa.",
  },
  caiMaTamChuy: {
    name: "Cái Mã tam chùy",
    note: "Thí Tốt 7 dụ Tượng đối phương lên cao, rồi Mã biên tiến 7, tiến 6 công Mã đối phương; là thủ đoạn chiến thuật, dùng được trong nhiều khai cuộc.",
  },
  maQuaiCuoc: {
    name: "Mã quải cước (拐脚马)",
    note: "Mã nhảy lên lộ 4/6 sát Sĩ (Mã 2 tiến 4): mở nhanh đường Xe cánh đó nhưng dễ bị công; dùng được nếu kiểm soát được rủi ro.",
  },
  maBanHa: { name: "Mã bàn hà", note: "Mã đứng bờ sông lộ 4 hoặc lộ 6, sẵn sàng nhảy qua sông tranh tiên." },
  songBienMa: { name: "Song biên Mã", note: "Cả hai Mã ra biên, ít chỗ nhảy; chỉ dùng trong thế đặc biệt.", bad: true },
  luongDauXa: { name: "Lưỡng đầu xà", note: "Tốt 3 và Tốt 7 cùng tiến, mở đường cho hai Mã." },
  tamBoHo: { name: "Tam bộ hổ", note: "Pháo ra biên, Xe ra lộ của Pháo cũ: xuất Xe nhanh trong ba nước." },
  phiTuongTrungBinh: { name: "Phi Tượng tiến Tốt giữa", note: "Cờ tán thủ vẫn tiến Tốt giữa để Mã bàn đầu lên điểm vai Tượng; chỉ nên đi khi có mục đích rõ, Tốt giữa dễ bị bắt." },
  tuongBien: { name: "Tượng biên", note: "Phi Tượng ra biên trong khai cuộc làm Tượng rời nhau, cung yếu.", bad: true },
};

/** Lộ 1–9 của phe `s` ứng với cột trên bàn. */
export const fileOf = (i: number, s: Side) => (s === "r" ? 9 - colOf(i) : colOf(i) + 1);

function own(board: Board, s: Side, type: string): number[] {
  const out: number[] = [];
  board.forEach((p, i) => {
    if (p && sideOf(p) === s && typeOf(p) === type) out.push(i);
  });
  return out;
}

/** Ô giữa hai ô cùng cột, không tính hai đầu. */
function between(board: Board, a: number, b: number): number {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  let n = 0;
  for (let i = lo + 9; i < hi; i += 9) if (board[i]) n++;
  return n;
}

/** Các thế trận khai cuộc của phe `s` đang có trên bàn. */
export function detectShapes(board: Board, s: Side): Shape[] {
  const o = opponent(s);
  const ids: ShapeId[] = [];
  const rooks = own(board, s, "r");
  const cannons = own(board, s, "c");
  const horses = own(board, s, "n");
  const pawns = own(board, s, "p");

  // Xe
  for (const r of rooks) {
    const a = advance(r, s);
    const f = fileOf(r, s);
    if (a === 1) ids.push("xeHoanh");
    // Xe trực: Xe bình sang lộ 2/8 (chỗ Pháo cũ) rồi xuất theo lộ đó, kiểu "Xe 1 bình 2".
    if (f === 2 || f === 8) ids.push("xeTruc");
    if (f === 3 || f === 7) ids.push("xeTamThat");
    if ((f === 4 || f === 6) && a >= 1) ids.push("xeSuon");
    if (a === 4) ids.push("xeTuanHa");
  }
  // Đại xuất Xe: Xe biên đã lên sân đối phương. Tiểu xuất Xe: Xe biên lên hàng Tốt mình.
  for (const r of rooks) {
    const f = fileOf(r, s);
    if (f !== 1 && f !== 9) continue;
    if (advance(r, s) >= 5) ids.push("daiXuatXe");
    else if (advance(r, s) === 3) ids.push("tieuXuatXe");
  }
  // Xe đứng ở ô chân Mã đối phương: chân bị chặn, lại bị Xe dọa ăn.
  for (const n of own(board, o, "n")) {
    const legs = [n - 9, n + 9, colOf(n) > 0 ? n - 1 : -1, colOf(n) < 8 ? n + 1 : -1];
    if (!rooks.some((r) => legs.includes(r))) continue;
    ids.push(advance(n, o) === 0 ? "xeDeMa" : "xeApMa");
  }

  // Xe bị phong: Pháo (hoặc Mã) đối phương có căn đứng cùng lộ bên sân mình, không quân nào chen giữa,
  // Xe không ăn được (ăn là mất Xe) và cũng không tiến qua được.
  const blocked = rooks.filter((r) => {
    if (advance(r, s) > 2) return false;
    const byCannon = own(board, o, "c").some((c) => colOf(c) === colOf(r) && advance(c, o) >= 5 && between(board, r, c) === 0 && isDefended(board, c, o));
    return byCannon;
  });
  if (blocked.length >= 2) ids.push("songPhaoPhongXe");
  else if (blocked.length === 1) ids.push("phaoPhongXe");
  if (
    rooks.some((r) =>
      own(board, o, "n").some((n) => colOf(n) === colOf(r) && advance(n, o) >= 4 && between(board, r, n) === 0 && isDefended(board, n, o) && advance(r, s) <= 2),
    )
  ) {
    ids.push("maPhongXe");
  }

  // Pháo
  const center = cannons.find((c) => fileOf(c, s) === 5);
  const other = cannons.find((c) => c !== center);
  if (center !== undefined && other !== undefined) {
    const f = fileOf(other, s);
    const a = advance(other, s);
    if (f === 6 || f === 4) ids.push("nguLucPhao");
    else if (f === 7 || f === 3) ids.push("nguThatPhao");
    else if ((f === 8 || f === 2) && a >= 3) ids.push("nguBatPhao");
    else if (f === 9 || f === 1) ids.push("nguCuuPhao");
  }
  for (const c of cannons) {
    if (advance(c, s) === 4) ids.push("tuanHaPhao");
    if (center === undefined && advance(c, s) === 2 && (fileOf(c, s) === 4 || fileOf(c, s) === 6)) ids.push("siGiacPhao");
  }
  // Lôi công Pháo: cả hai Pháo cùng trên trung lộ, một Pháo lui xuống hàng 2 (Pháo thoái 1 rồi bình 5).
  if (cannons.length === 2 && cannons.every((c) => fileOf(c, s) === 5) && cannons.some((c) => advance(c, s) === 1)) ids.push("loiCongPhao");
  // Uyên ương Pháo: Xe biên tiến hai bước (Xe 9 tiến 2) và hai Pháo dồn về cánh của Xe đó.
  const wingOf = (i: number) => (fileOf(i, s) > 5 ? "L" : fileOf(i, s) < 5 ? "R" : "C");
  const uyenUong = rooks.some(
    (r) => (fileOf(r, s) === 1 || fileOf(r, s) === 9) && advance(r, s) === 2 && cannons.length === 2 && cannons.every((c) => wingOf(c) === wingOf(r)),
  );
  if (uyenUong) ids.push("uyenUongPhao");
  // Quy bối Pháo: trước Pháo đầu đối phương, Pháo 8 lui một bước (hoặc đã bình sang lộ 3 ở hàng đó), Xe biên không lên 2.
  const oppCenter = own(board, o, "c").some((c) => fileOf(c, o) === 5);
  const retreated = cannons.some((c) => advance(c, s) === 1 && [2, 3, 7, 8].includes(fileOf(c, s)));
  if (oppCenter && retreated && !uyenUong) ids.push("quyBoiPhao");
  if (cannons.length === 2 && cannons.every((c) => advance(c, s) >= 5)) ids.push("songPhaoQuaHa");
  if (cannons.length === 2 && cannons.every((c) => fileOf(c, s) === 1 || fileOf(c, s) === 9)) ids.push("songBienPhao");

  // Mã
  if (horses.some((n) => advance(n, s) === 4 && (fileOf(n, s) === 4 || fileOf(n, s) === 6))) ids.push("maBanHa");
  // Cái Mã tam chùy: Tượng đối phương bị dụ lên cao (Tượng ở bờ sông), Mã mình đã vòng lên lộ 6/7 (Mã 9 tiến 7, tiến 6).
  const highElephant = own(board, o, "b").some((b) => advance(b, o) === 4);
  if (highElephant && horses.some((n) => (fileOf(n, s) === 6 || fileOf(n, s) === 7) && advance(n, s) >= 3 && advance(n, s) <= 5)) {
    ids.push("caiMaTamChuy");
  }
  if (horses.some((n) => (fileOf(n, s) === 4 || fileOf(n, s) === 6) && advance(n, s) === 2)) ids.push("maQuaiCuoc");
  if (horses.length === 2 && horses.every((n) => fileOf(n, s) === 1 || fileOf(n, s) === 9)) ids.push("songBienMa");

  // Tốt
  const advanced = (f: number) => pawns.some((p) => fileOf(p, s) === f && advance(p, s) === 4);
  if (advanced(3) && advanced(7)) ids.push("luongDauXa");
  // Tam bộ hổ: Pháo một cánh ra biên, Xe cánh đó sang lộ 2/8 (chỗ Pháo cũ) vẫn ở hàng đáy.
  for (const [edge, rookFile] of [[1, 2], [9, 8]] as const) {
    const cannonEdge = cannons.some((c) => fileOf(c, s) === edge && advance(c, s) === 2);
    const rookOn = rooks.some((r) => fileOf(r, s) === rookFile && advance(r, s) === 0);
    if (cannonEdge && rookOn) ids.push("tamBoHo");
  }

  // Phi Tượng cục tiến Tốt giữa: Tượng đã lên giữa (Tượng 3 tiến 5 hoặc 7 tiến 5), Tốt giữa đã tiến.
  const centerElephant = own(board, s, "b").some((b) => fileOf(b, s) === 5);
  if (centerElephant && pawns.some((p) => fileOf(p, s) === 5 && advance(p, s) >= 4)) ids.push("phiTuongTrungBinh");

  // Hình kém
  if (own(board, s, "b").some((b) => fileOf(b, s) === 1 || fileOf(b, s) === 9)) ids.push("tuongBien");

  return [...new Set(ids)].map((id) => ({ id, side: s, ...INFO[id] }));
}

/** Thế trận của cả hai bên. */
export function detectAllShapes(board: Board): Shape[] {
  return [...detectShapes(board, "r"), ...detectShapes(board, "b")];
}

export type OpeningType = "capCong" | "hoanCong" | "linhHoat" | "tanThu";

/** Bốn loại khai cuộc: cấp công và hoãn công (thế tấn công), linh hoạt và tán thủ (thế vững). */
export const OPENING_TYPE_INFO: Record<OpeningType, { name: string; note: string }> = {
  capCong: { name: "Cấp công", note: "Tấn công gấp ở trung lộ, Xe sớm qua sông; tranh từng nước, ít thời gian làm việc khác." },
  hoanCong: { name: "Hoãn công", note: "Tấn công chậm, đẩy dần từng bước, công thủ cân bằng; loại khai cuộc coi trọng nguyên tắc nhất." },
  linhHoat: { name: "Linh hoạt", note: "Nước đầu chưa lộ hướng (như Tiên nhân chỉ lộ), sau đó có thể chuyển sang công hoặc thủ." },
  tanThu: { name: "Tán thủ", note: "Thế không theo Pháo đầu (Phi Tượng, Sĩ giác Pháo, Khởi Mã…); logic khác hẳn, đi vững rồi tìm chỗ phản công." },
};

/**
 * Phân loại khai cuộc theo nước đầu của Đỏ (ký hiệu Việt Nam) và hình cờ hiện tại.
 * Pháo đầu: Xe đã qua sông là cấp công, chưa thì hoãn công.
 */
export function classifyOpeningType(firstMove: string | undefined, board: Board): OpeningType | null {
  if (!firstMove) return null;
  // Trung binh (B5.1) là khai cuộc riêng (xem openings.ts), không xếp vào Pháo đầu.
  if (/^P[28]-5$/.test(firstMove)) {
    return own(board, "r", "r").some((r) => advance(r, "r") >= 5) ? "capCong" : "hoanCong";
  }
  if (/^B[37]\.1$/.test(firstMove)) return "linhHoat";
  return "tanThu";
}
