// Kết quả bắt buộc trong biến engine để một kỳ lý Triệu Hâm Hâm được gắn vào nước đi.
// Bộ nhận diện (zhao-principles.ts) chỉ thấy hình thế; ở đây kiểm chứng điều bài giảng nói có thật sự xảy ra.
// Kỳ lý không có trong bảng (thuần thế trận, engine không kiểm chứng được) thì KHÔNG gắn vào từng nước.

import { opponent, type Side } from "./engine";
import { countCaptured, moverCaptured, type MoveOutcome } from "./move-outcome";

type Rule = (o: MoveOutcome, mover: Side) => boolean;

/**
 * Đòn tấn công có kết quả: chiếu bí, thắng vật chất, hoặc phế mà được bù.
 * Nước tự nó ăn quân thì mục đích cụ thể là ăn quân, không gắn kỳ lý tấn công.
 */
const attackPaysOff: Rule = (o) => o.materialNow <= 0 && (o.kind === "mate" || o.kind === "winsMaterial" || o.kind === "sacrifice");
/** Đổi một Xe của mình lấy ít nhất `n` quân (không tính Tốt) của đối phương, không lỗ vật chất đáng kể. */
const rookFor = (n: number): Rule => (o, mover) =>
  countCaptured(o, opponent(mover), "r") >= 1 && countCaptured(o, mover, "nbac") >= n && o.materialSettled > -250;
/** Bắt được đúng loại quân đối phương và lời vật chất. */
const traps = (types: string, minGain: number): Rule => (o, mover) =>
  (o.kind === "winsMaterial" || o.kind === "cleanCapture" || o.kind === "mate") && moverCaptured(o, mover, types) && o.materialSettled >= minGain;
/** Phế thật: mất quân ngay rồi được bù. */
const realSacrifice: Rule = (o) => o.kind === "sacrifice" || (o.kind === "mate" && o.materialAfterReply < 0);

const RULES: Record<string, Rule> = {
  // Bắt quân
  vayPhao: traps("c", 250),
  vayXe: traps("r", 500),
  vayMaGiac: traps("n", 250),
  maPhungBienTatVong: traps("n", 250),
  // Phế quân
  pheQuanPhaSiTuong: (o, mover) => realSacrifice(o, mover) && moverCaptured(o, mover, "ab"),
  khiTuTranhTien: realSacrifice,
  danDu: (o, mover) => realSacrifice(o, mover) || (o.kind === "winsMaterial" && o.materialNow <= 0),
  nhatMaHoanLuongTuong: (o, mover) => countCaptured(o, opponent(mover), "n") >= 1 && countCaptured(o, mover, "b") >= 2,
  motXeDoiHai: rookFor(2),
  motXeDoiBa: (o, mover) =>
    countCaptured(o, opponent(mover), "r") >= 1 &&
    countCaptured(o, mover, "rncabp") >= 3 &&
    countCaptured(o, mover, "nc") >= 2 &&
    o.materialSettled > -200,
  pheTotPhanCong: (o) => (o.kind === "sacrifice" || o.kind === "mate" || o.kind === "winsMaterial") && o.materialSettled >= -100,
  // Phá Sĩ Tượng
  tramSiPhaTuong: (o, mover) => moverCaptured(o, mover, "ab") && o.materialSettled >= 0 && o.kind !== "exchange",
  kheoPhaSiTuong: (o, mover) => moverCaptured(o, mover, "ab") && o.materialAfterReply >= 0 && o.materialSettled >= 150,
  // Ăn Tốt sạch
  chienThuatMuuBinh: (o, mover) => o.kind === "cleanCapture" && moverCaptured(o, mover, "p", 0),
  doatTrungBinh: (o, mover) => (o.kind === "cleanCapture" || o.kind === "winsMaterial" || o.kind === "mate") && moverCaptured(o, mover, "p", 0) && o.materialSettled >= 100,
  // Đổi quân có chủ đích
  chuyenHoaTanCuoc: (o) => o.kind === "exchange",
  doiQuanGianhTien: (o) => o.kind === "exchange",
  // Đuổi quân được tiên / chặn đường: đối phương phải lo chạy, hoặc quân bị cắt căn thì mất
  chanDuong: (o) => o.kind === "winsMaterial" || o.kind === "mate" || o.materialSettled >= 150,
  // Đòn tấn công: phải có kết quả trong biến
  // Bộ nhận diện đã tự kiểm cơ chế (checkSmotheredCannonMate, checkDeepCannonBottom); ở đây chỉ chặn biến không sát hoặc lỗ vật chất
  muonCungSat: (o) => o.kind === "mate" || o.materialSettled >= 150,
  ngoaTaoMa: attackPaysOff,
  khongTamPhao: attackPaysOff,
  thienDiaPhao: attackPaysOff,
  khuyetSiSongXe: attackPaysOff,
  phaoTramDay: (o) => o.kind === "mate" || o.materialSettled >= 150,
  phaoDayKhoaXe: attackPaysOff,
  manhCongTuyenApDay: attackPaysOff,
  oanhTacLoSuon: attackPaysOff,
  songXePhoiHop: attackPaysOff,
  xeMaPhaoTamTu: attackPaysOff,
  xeSongMa: attackPaysOff,
  xeSongPhao: attackPaysOff,
  // Nước chém Sĩ tự nó ăn quân nên attackPaysOff không bao giờ qua; bài giảng là dứt điểm: sát, hoặc lời Sĩ cộng một quân nhẹ
  xeMaLanhChieu: (o) => o.kind === "mate" || o.materialSettled >= 600,
  giaPhao: attackPaysOff,
  tranhNuoc: (o) => o.kind === "mate" || o.kind === "winsMaterial" || o.materialSettled >= 200,
  diCongViThu: attackPaysOff,
  tuBinhDotKich: attackPaysOff,
  tranhDoatLo3Lo7: attackPaysOff,
  // Thế trận đã có bộ kiểm 4 tầng (checkMayUiTrungLo, checkTotBienDaiNao, checkMaVanNhuLong, checkChiemTuyenTot)
  mayUiTrungLo: (o) => o.kind === "mate" || o.materialSettled >= 150,
  totBienDaiNao: (o) => o.kind === "mate" || o.materialSettled >= 150,
  maVanNhuLong: (o) => o.kind === "mate" || o.materialSettled >= 150,
  chiemTuyenTot: (o) => o.kind === "mate" || (o.kind !== "losesMaterial" && o.materialSettled >= 0),
  // Kiềm chế / giữ tuyến (checkKiemCheDinhCung, checkKhongCheKyHa, checkPhongToaLoXe): chỉ chặn biến lỗ vật chất
  kiemCheDinhCung: (o) => o.kind === "mate" || (o.kind !== "losesMaterial" && o.materialSettled >= 0),
  khongCheKyHa: (o) => o.kind === "mate" || (o.kind !== "losesMaterial" && o.materialSettled >= 0),
  phongToaLoXe: (o) => o.kind === "mate" || (o.kind !== "losesMaterial" && o.materialSettled >= 0),
  // Cố ý KHÔNG có trong bảng (để tắt), vì một biến engine không đo được điều bài giảng nói:
  //  - voSuTienTotBien (bài 7): giá trị của nước là chờ đối phương tự phá thế giằng co, không hiện ra trong vài nửa nước.
  //  - phaoGanh (bài 26), lienHoanMa (bài 27): kỳ lý phòng thủ — muốn biết nước có dập được đe dọa không phải chấm thêm
  //    thế "bỏ lượt" (null-move); chỉ dựa vào "đối phương không thắng quân trong biến" thì nước nào cũng qua.
  // Phê bình: nước sai thật sự dẫn tới mất quân hoặc bị chiếu bí
  khongThamAn: (o) => o.kind === "losesMaterial",
  oaTamMa: (o) => o.kind === "losesMaterial",
};

/** Biến engine có xác nhận kỳ lý `tactic` cho nước đi của `mover` không. */
export function zhaoOutcomeAllows(tactic: string, outcome: MoveOutcome, mover: Side): boolean {
  const rule = RULES[tactic];
  return rule ? rule(outcome, mover) : false;
}
