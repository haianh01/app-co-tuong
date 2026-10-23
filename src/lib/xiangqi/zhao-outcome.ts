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
  motXeDoiBa: rookFor(3),
  pheTotPhanCong: (o) => o.kind === "sacrifice" && o.materialAfterReply >= -150,
  // Phá Sĩ Tượng
  tramSiPhaTuong: (o, mover) => moverCaptured(o, mover, "ab") && o.materialSettled >= 0 && o.kind !== "exchange",
  kheoPhaSiTuong: (o, mover) => moverCaptured(o, mover, "ab") && o.materialAfterReply >= 0 && o.materialSettled >= 150,
  // Ăn Tốt sạch
  chienThuatMuuBinh: (o, mover) => o.kind === "cleanCapture" && moverCaptured(o, mover, "p", 0),
  doatTrungBinh: (o, mover) => o.kind === "cleanCapture" && moverCaptured(o, mover, "p", 0),
  // Đổi quân có chủ đích
  chuyenHoaTanCuoc: (o) => o.kind === "exchange",
  doiQuanGianhTien: (o) => o.kind === "exchange",
  // Đuổi quân được tiên / chặn đường: đối phương phải lo chạy, hoặc quân bị cắt căn thì mất
  chanDuong: (o) => o.kind === "winsMaterial",
  // Đòn tấn công: phải có kết quả trong biến
  muonCungSat: attackPaysOff,
  ngoaTaoMa: attackPaysOff,
  khongTamPhao: attackPaysOff,
  thienDiaPhao: attackPaysOff,
  khuyetSiSongXe: attackPaysOff,
  phaoTramDay: attackPaysOff,
  phaoDayKhoaXe: attackPaysOff,
  manhCongTuyenApDay: attackPaysOff,
  oanhTacLoSuon: attackPaysOff,
  songXePhoiHop: attackPaysOff,
  xeMaPhaoTamTu: attackPaysOff,
  xeSongMa: attackPaysOff,
  xeSongPhao: attackPaysOff,
  xeMaLanhChieu: attackPaysOff,
  giaPhao: attackPaysOff,
  tranhNuoc: attackPaysOff,
  diCongViThu: attackPaysOff,
  tuBinhDotKich: attackPaysOff,
  tranhDoatLo3Lo7: attackPaysOff,
  // Phê bình: nước sai thật sự dẫn tới mất quân hoặc bị chiếu bí
  khongThamAn: (o) => o.kind === "losesMaterial",
  oaTamMa: (o) => o.kind === "losesMaterial",
};

/** Biến engine có xác nhận kỳ lý `tactic` cho nước đi của `mover` không. */
export function zhaoOutcomeAllows(tactic: string, outcome: MoveOutcome, mover: Side): boolean {
  const rule = RULES[tactic];
  return rule ? rule(outcome, mover) : false;
}
