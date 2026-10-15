// Nhận diện khai cuộc theo nước đầu tiên của mỗi bên (ký hiệu Việt Nam, mỗi bên tự đánh số cột từ phải sang trái).

export interface Opening {
  id: string;
  name: string;
}

const OPENINGS = {
  center: { id: "center", name: "Pháo đầu (Trung pháo)" },
  corner: { id: "corner", name: "Sĩ giác pháo" },
  cross: { id: "cross", name: "Quá cung pháo" },
  cannon: { id: "cannon", name: "Pháo khác" },
  horse: { id: "horse", name: "Khởi mã" },
  elephant: { id: "elephant", name: "Phi tượng" },
  pawn: { id: "pawn", name: "Tiên nhân chỉ lộ (tiến tốt)" },
  centerPawn: { id: "centerPawn", name: "Trung binh (tiến tốt giữa)" },
  other: { id: "other", name: "Khai cuộc khác" },
} satisfies Record<string, Opening>;

/** Khai cuộc ứng với nước đầu của một bên, ví dụ "P2-5" → Pháo đầu, "M8.7" → Khởi mã. */
export function openingOf(notation: string): Opening {
  const m = /^(P|M|T|B)(\d)([.\-/])(\d)$/.exec(notation);
  if (!m) return OPENINGS.other;
  const [, piece, file, dir, to] = m;
  switch (piece) {
    case "P":
      if (dir !== "-") return OPENINGS.cannon;
      if (to === "5") return OPENINGS.center;
      // Pháo cột 2 sang cột 4 (hay cột 8 sang 6) là đứng góc sĩ cùng bên; sang hẳn bên kia cung là quá cung.
      if ((file === "2" && to === "4") || (file === "8" && to === "6")) return OPENINGS.corner;
      if ((file === "2" && to === "6") || (file === "8" && to === "4")) return OPENINGS.cross;
      return OPENINGS.cannon;
    case "M":
      return OPENINGS.horse;
    case "T":
      return dir === "." && to === "5" ? OPENINGS.elephant : OPENINGS.other;
    case "B":
      if (file === "5") return OPENINGS.centerPawn;
      return file === "3" || file === "7" ? OPENINGS.pawn : OPENINGS.other;
  }
  return OPENINGS.other;
}

export interface OpeningStat extends Opening {
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

/** Gộp kết quả theo khai cuộc, xếp theo số ván giảm dần. */
export function tallyOpenings(rows: { notation: string; result: "win" | "draw" | "loss" }[]): OpeningStat[] {
  const map = new Map<string, OpeningStat>();
  for (const r of rows) {
    const o = openingOf(r.notation);
    const s = map.get(o.id) ?? { ...o, games: 0, wins: 0, draws: 0, losses: 0 };
    s.games++;
    if (r.result === "win") s.wins++;
    else if (r.result === "draw") s.draws++;
    else s.losses++;
    map.set(o.id, s);
  }
  return [...map.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

export type OpeningCategory =
  | "trungPhao"
  | "thuanPhao"
  | "nghichPhao"
  | "binhPhongMa"
  | "phanCungMa"
  | "donDeMa"
  | "tamBoHo"
  | "quyBoiPhao"
  | "tienNhanChiLo"
  | "phiTuong"
  | "khoiMa"
  | "siGiacPhao"
  | "quaCungPhao"
  | "kimCauPhao"
  | "khac";

export interface OpeningBookLine {
  id?: string;
  name: string;
  category?: OpeningCategory;
  moves: string[];
  intent?: {
    r: string;
    b: string;
  };
}

/** Cây khai cuộc các biến kinh điển chuẩn của Cờ Tướng (mở rộng B7). */
export const OPENING_BOOK_LINES: OpeningBookLine[] = [
  // 1. Trung pháo đối Bình Phong Mã
  {
    id: "bpm_truc_xa_chot_7_doi_xe",
    name: "Pháo đầu đối Bình Phong Mã (Trực xa tiến chốt 7 - Bình pháo đổi xe)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "X2.6", "P8-9"],
    intent: { r: "Đè áp cánh phải đối phương bằng Xe quá hà", b: "Bình pháo đổi xe giải tỏa áp lực cánh yếu" },
  },
  {
    id: "bpm_truc_xa_chot_7_tuan_ha",
    name: "Pháo đầu đối Bình Phong Mã (Tuần hà xa)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "X2.4", "S4.5"],
    intent: { r: "Xe tuần hà khống chế đường ngang bờ sông", b: "Củng cố trung lộ vững chắc bằng Sĩ" },
  },
  {
    id: "bpm_truc_xa_chot_3",
    name: "Pháo đầu đối Bình Phong Mã (Tiến chốt 3)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B3.1", "B3.1", "M8.7", "P8-9"],
    intent: { r: "Tiến chốt 3 phong tỏa Mã Đen khai thông lộ Mã Đỏ", b: "Bình pháo đổi xe tranh tiên phản kích" },
  },
  {
    id: "bpm_ta_ma_ban_ha",
    name: "Pháo đầu đối Bình Phong Mã (Tả mã bàn hà)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "M8.7", "T3.5", "M7.6"],
    intent: { r: "Mã trái bàn hà tranh điểm cao giữa bàn", b: "Phi Tượng giữ vững trung lộ" },
  },
  {
    id: "bpm_ngu_that_phao_chot_7",
    name: "Pháo đầu đối Bình Phong Mã (Ngũ thất pháo tiến chốt 7)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "M2.3", "X1-2", "X9-8", "P8-7", "B7.1"],
    intent: { r: "Pháo 7 nhắm vào Tượng đáy và kiềm chế cánh trái Đen", b: "Tiến chốt 7 mở đường thông thoáng cho Mã" },
  },
  {
    id: "bpm_ngu_that_phao_chot_3",
    name: "Pháo đầu đối Bình Phong Mã (Ngũ thất pháo tiến chốt 3)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "M2.3", "X1-2", "X9-8", "P8-7", "B3.1"],
    intent: { r: "Điều động pháo 7 kiểm soát sườn trái", b: "Tiến chốt 3 hạn chế sức ép của Pháo Đỏ" },
  },
  {
    id: "bpm_ngu_that_phao",
    name: "Pháo đầu đối Bình Phong Mã (Ngũ thất pháo)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "M2.3", "X1-2", "X9-8", "P8-7"],
    intent: { r: "Pháo nhị và pháo thất phối hợp công kích sườn", b: "Bình phong mã vững như thành đồng" },
  },
  {
    id: "bpm_ngu_luc_phao",
    name: "Pháo đầu đối Bình Phong Mã (Ngũ lục pháo)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "P8-6", "S4.5"],
    intent: { r: "Pháo phụ trợ trung tâm và bảo vệ mạn sườn", b: "Bổ Sĩ phòng thủ kiên cố chờ cơ hội phản công" },
  },
  {
    id: "bpm_ngu_bat_phao",
    name: "Pháo đầu đối Bình Phong Mã (Ngũ bát pháo)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "P8.4"],
    intent: { r: "Chuẩn bị xuất Xe cánh trái hỗ trợ Xe quá hà", b: "Điều chỉnh vị trí quân chuẩn bị phòng thủ" },
  },
  {
    id: "bpm_ngu_cuu_phao",
    name: "Pháo đầu đối Bình Phong Mã (Ngũ cửu pháo)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "P8-9"],
    intent: { r: "Pháo biên giải tỏa lộ 2 cho Xe trái xuất chiến", b: "Giữ vững thế trận trung tâm" },
  },
  {
    id: "bpm_cap_tan_trung_binh",
    name: "Pháo đầu đối Bình Phong Mã (Cấp tấn trung binh)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "B5.1"],
    intent: { r: "Đẩy mạnh tiến công trực diện vào trung lộ đối phương", b: "Tập trung lực lượng nghênh chiến đòn đánh vỗ mặt" },
  },
  {
    id: "bpm_hoanh_xa",
    name: "Pháo đầu đối Bình Phong Mã (Hoành xa)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1.1", "M2.3", "X1-6", "B7.1"],
    intent: { r: "Khởi hoành xa chiếm sườn lộ 6 cơ động", b: "Tiến chốt mở đường cho Mã phản đòn" },
  },
  {
    id: "bpm_huu_phao_qua_ha",
    name: "Pháo đầu đối Bình Phong Mã (Hữu pháo quá hà)",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3", "B7.1", "B7.1", "X2.6", "P2.4"],
    intent: { r: "Xe cắm sâu đe dọa tuyến đáy", b: "Đưa Pháo sang sông phong tỏa Xe Đỏ" },
  },
  {
    id: "bpm_co_ban",
    name: "Pháo đầu đối Bình Phong Mã",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"],
    intent: { r: "Xuất Xe nhanh kiểm soát lộ huyết mạch", b: "Hai Mã giữ chốt đầu cân bằng phòng thủ" },
  },

  // 2. Trung pháo đối Thuận Pháo
  {
    id: "tp_truc_xa_doi_hoanh_xa",
    name: "Thuận Pháo (Trực xa đối Hoành xa)",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1-2", "X9.1", "X2.6", "M2.3"],
    intent: { r: "Trực xa thâm nhập trận địa đối phương", b: "Hoành xa cơ động linh hoạt chống trả" },
  },
  {
    id: "tp_truc_xa_doi_truc_xa",
    name: "Thuận Pháo (Trực xa đối Trực xa)",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1-2", "X9-8", "X2.6", "M2.3"],
    intent: { r: "Hai bên cùng xuất trực xa đọ sức đối công", b: "Phản pháo nhanh sẵn sàng đôi công quyết liệt" },
  },
  {
    id: "tp_hoanh_xa_doi_truc_xa",
    name: "Thuận Pháo (Hoành xa đối Trực xa)",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1.1", "M2.3", "X1-6", "X9-8"],
    intent: { r: "Khởi hoành xa đánh sườn", b: "Trực xa xuất quân thần tốc kiểm soát lộ dọc" },
  },
  {
    id: "tp_hoan_khai_xa",
    name: "Thuận Pháo (Hoãn khai xa)",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "B7.1", "B7.1"],
    intent: { r: "Chậm xuất Xe để củng cố bộ khung quân", b: "Cùng tiến chốt tạo thế trận giằng co" },
  },
  {
    id: "tp_truc_xa_chot_7",
    name: "Thuận Pháo (Trực xa tiến chốt 7)",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1-2", "X9-8", "B7.1", "B7.1"],
    intent: { r: "Mở thông lộ Mã cánh trái", b: "Đối chốt giữ cân bằng cánh phải" },
  },
  {
    id: "tp_co_ban",
    name: "Thuận Pháo",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5"],
    intent: { r: "Trung pháo công thẳng trung lộ", b: "Nghênh pháo cùng chiều sẵn sàng đôi công" },
  },

  // 3. Trung pháo đối Nghịch Pháo
  {
    id: "np_truc_xa",
    name: "Nghịch Pháo (Trực xa)",
    category: "nghichPhao",
    moves: ["P2-5", "P2-5", "M2.3", "M8.7", "X1-2", "X9-8", "B7.1", "M2.3"],
    intent: { r: "Ổn định thế trận xuất xe trực chiến", b: "Tấn công lệch cánh tạo thế cờ gay cấn" },
  },
  {
    id: "np_hoanh_xa",
    name: "Nghịch Pháo (Hoành xa)",
    category: "nghichPhao",
    moves: ["P2-5", "P2-5", "M2.3", "M8.7", "X1.1", "M2.3", "X1-6", "X9-8"],
    intent: { r: "Xe hoành lộ 6 tấn công điểm yếu", b: "Phòng thủ tích cực chờ phản kích" },
  },
  {
    id: "np_ban_do",
    name: "Bán Đồ Nghịch Pháo",
    category: "nghichPhao",
    moves: ["P2-5", "M8.7", "M2.3", "P2-5"],
    intent: { r: "Bố trí quân theo chuẩn trung pháo", b: "Chuyển pháo sang nghịch pháo bất ngờ" },
  },
  {
    id: "np_co_ban",
    name: "Nghịch Pháo",
    category: "nghichPhao",
    moves: ["P2-5", "P2-5"],
    intent: { r: "Pháo đầu tấn công chính diện", b: "Pháo nghịch hướng đối công sinh tử" },
  },

  // 4. Trung pháo đối Đơn Đề Mã
  {
    id: "ddm_huu_don_de",
    name: "Pháo đầu đối Đơn Đề Mã (Hữu đơn đề)",
    category: "donDeMa",
    moves: ["P2-5", "M8.7", "M2.3", "M2.1", "X1-2", "X9-8"],
    intent: { r: "Chiếm ưu thế không gian trung lộ", b: "Mã biên linh hoạt phòng thủ cánh" },
  },
  {
    id: "ddm_ta_don_de",
    name: "Pháo đầu đối Đơn Đề Mã (Tả đơn đề)",
    category: "donDeMa",
    moves: ["P2-5", "M2.1", "M2.3", "M8.7"],
    intent: { r: "Tập trung áp đảo từ sớm", b: "Mã trái nhảy biên phòng ngự chắc chắn" },
  },
  {
    id: "ddm_hoanh_xa",
    name: "Pháo đầu đối Đơn Đề Mã (Hoành xa)",
    category: "donDeMa",
    moves: ["P2-5", "M8.7", "M2.3", "M2.1", "X1.1", "X9.1"],
    intent: { r: "Sử dụng hoành xa bao quát sườn", b: "Đưa Xe lên tuần hà hỗ trợ phòng ngự" },
  },
  {
    id: "ddm_co_ban",
    name: "Pháo đầu đối Đơn Đề Mã",
    category: "donDeMa",
    moves: ["P2-5", "M8.7", "M2.3", "M2.1"],
    intent: { r: "Áp đặt sức ép trung lộ", b: "Hóa giải bằng lối chơi dẻo dai" },
  },

  // 5. Trung pháo đối Phản Cung Mã
  {
    id: "pcm_chot_7",
    name: "Pháo đầu đối Phản Cung Mã (Tiến chốt 7)",
    category: "phanCungMa",
    moves: ["P2-5", "M2.3", "M2.3", "P8-6", "X1-2", "M8.7", "B7.1", "S4.5"],
    intent: { r: "Tiến chốt khai thông đường tấn công", b: "Sĩ lên che chở trung lộ, pháo giữ eo" },
  },
  {
    id: "pcm_chot_3",
    name: "Pháo đầu đối Phản Cung Mã (Tiến chốt 3)",
    category: "phanCungMa",
    moves: ["P2-5", "M2.3", "M2.3", "P8-6", "X1-2", "M8.7", "B3.1", "B3.1"],
    intent: { r: "Khống chế hướng di chuyển của Mã Đen", b: "Đối chốt 3 bảo toàn tính cơ động" },
  },
  {
    id: "pcm_hoanh_xa",
    name: "Pháo đầu đối Phản Cung Mã (Hoành xa)",
    category: "phanCungMa",
    moves: ["P2-5", "M2.3", "M2.3", "P8-6", "X1.1", "M8.7", "X1-6", "X9-8"],
    intent: { r: "Hoành xa đánh vào cánh sườn", b: "Phản cung mã chuyển quân nhịp nhàng" },
  },
  {
    id: "pcm_co_ban",
    name: "Pháo đầu đối Phản Cung Mã",
    category: "phanCungMa",
    moves: ["P2-5", "M2.3", "M2.3", "P8-6"],
    intent: { r: "Tấn công áp đặt trung lộ", b: "Pháo kẹp nách giữ Mã trung tâm cực kỳ bền vững" },
  },

  // 6. Quy Bối Pháo & Tam Bộ Hổ
  {
    id: "qbp_thoi_phao",
    name: "Quy Bối Pháo (Thoái pháo)",
    category: "quyBoiPhao",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "P8/1"],
    intent: { r: "Triển khai thế trận bài bản", b: "Thoái pháo lưng rùa bí hiểm chuyển cánh linh hoạt" },
  },
  {
    id: "tbh_trung_phao",
    name: "Tam Bộ Hổ",
    category: "tamBoHo",
    moves: ["P2-5", "M8.7", "M2.3", "P8-9", "X1-2", "X9-8"],
    intent: { r: "Trung pháo ra quân chuẩn tắc", b: "Ba bước điều quân thành thế hổ phục phản công" },
  },

  // 7. Tiên Nhân Chỉ Lộ
  {
    id: "tncl_tot_day",
    name: "Tiên Nhân Chỉ Lộ đối Tốt Đáy",
    category: "tienNhanChiLo",
    moves: ["B7.1", "P2-3", "P2-5", "T3.5"],
    intent: { r: "Dò đường bằng chốt rồi chuyển trung pháo", b: "Đáp trả bằng chốt đáy rồi vào pháo đầu cân bằng" },
  },
  {
    id: "tncl_doi_binh",
    name: "Tiên Nhân Chỉ Lộ đối Đối Binh",
    category: "tienNhanChiLo",
    moves: ["B7.1", "B7.1", "M8.7", "M8.7", "P2-5", "P2-5"],
    intent: { r: "Thăm dò phản ứng của đối thủ", b: "Tiến chốt đối ứng tranh giành thế chủ động" },
  },
  {
    id: "tncl_chuyen_trung_phao",
    name: "Tiên Nhân Chỉ Lộ chuyển Pháo đầu",
    category: "tienNhanChiLo",
    moves: ["B7.1", "P2-5", "P2-5", "M8.7", "M2.3", "X9-8"],
    intent: { r: "Từ tiến chốt linh hoạt chuyển pháo đầu", b: "Chủ động vào pháo phản công sớm" },
  },
  {
    id: "tncl_khoi_ma",
    name: "Tiên Nhân Chỉ Lộ đối Khởi Mã",
    category: "tienNhanChiLo",
    moves: ["B7.1", "M8.7", "P2-5", "P2-5", "M2.3", "M2.3"],
    intent: { r: "Tận dụng ưu thế chốt thông", b: "Khởi mã chắc chắn hóa giải mũi nhọn" },
  },
  {
    id: "tncl_kim_cau_phao",
    name: "Tiên Nhân Chỉ Lộ đối Kim Câu Pháo",
    category: "tienNhanChiLo",
    moves: ["B7.1", "P8-3", "M2.3", "M8.7"],
    intent: { r: "Giữ vững quyền chủ động trung tâm", b: "Bình pháo đáy móc câu tấn công cánh" },
  },

  // 8. Phi Tượng Cuộc
  {
    id: "pt_si_giac_phao",
    name: "Phi Tượng đối Tả sĩ giác pháo",
    category: "phiTuong",
    moves: ["T7.5", "M8.7", "M2.3", "P2-5", "P8-6", "X9-8"],
    intent: { r: "Bổ tượng vững vàng trận địa", b: "Vào pháo đầu kết hợp sĩ giác pháo tranh tiên" },
  },
  {
    id: "pt_trung_phao",
    name: "Phi Tượng đối Trung pháo",
    category: "phiTuong",
    moves: ["T7.5", "P2-5", "M2.3", "M8.7", "B7.1", "X9-8"],
    intent: { r: "Phòng thủ chắc chắn chờ đối phương sơ hở", b: "Pháo đầu áp đảo ép thế trận ngay từ đầu" },
  },
  {
    id: "pt_khoi_ma",
    name: "Phi Tượng đối Khởi Mã",
    category: "phiTuong",
    moves: ["T3.5", "M2.3", "M8.7", "P8-5", "P2-4", "X1-2"],
    intent: { r: "Phi tượng lộ 3 bảo toàn thế trận", b: "Khởi mã xuất chiến tranh tiên" },
  },
  {
    id: "pt_qua_cung_phao",
    name: "Phi Tượng đối Quá Cung Pháo",
    category: "phiTuong",
    moves: ["T7.5", "P2-6", "M2.3", "M8.7"],
    intent: { r: "Trận địa vững như bàn thạch", b: "Quá cung pháo tập trung hỏa lực một bên sườn" },
  },
  {
    id: "pt_tien_tot",
    name: "Phi Tượng đối Tiến Tốt",
    category: "phiTuong",
    moves: ["T7.5", "B7.1", "M2.3", "M8.7"],
    intent: { r: "Củng cố trung lộ vững chắc", b: "Tiến chốt tranh đoạt lộ thông thoáng" },
  },

  // 9. Khởi Mã Cuộc
  {
    id: "km_trung_phao",
    name: "Khởi Mã đối Trung pháo",
    category: "khoiMa",
    moves: ["M2.3", "P2-5", "M8.7", "M8.7", "B7.1", "B7.1"],
    intent: { r: "Khởi mã kiềm tỏa sức mạnh pháo đầu", b: "Trung pháo mạnh mẽ khai cuộc tấn công" },
  },
  {
    id: "km_khoi_ma",
    name: "Khởi Mã đối Khởi Mã",
    category: "khoiMa",
    moves: ["M2.3", "M8.7", "P8-5", "P2-5", "X1-2", "X9-8"],
    intent: { r: "Hai bên cùng xuất mã thăm dò", b: "Duy trì thế cờ giằng co cân bằng" },
  },
  {
    id: "km_tien_tot",
    name: "Khởi Mã đối Tiến Tốt",
    category: "khoiMa",
    moves: ["M8.7", "B7.1", "P2-5", "M8.7", "M2.3", "X9-8"],
    intent: { r: "Khởi mã đón đầu nước tiến chốt", b: "Tiến chốt mở đường cho chiến xa và mã" },
  },
  {
    id: "km_diep_phao",
    name: "Khởi Mã chuyển Điệp Pháo",
    category: "khoiMa",
    moves: ["M2.3", "M8.7", "P8-4", "P2-4"],
    intent: { r: "Từ khởi mã đưa pháo vào góc sĩ phục kích", b: "Đối xứng trận hình bảo vệ trung tâm" },
  },

  // 10. Sĩ Giác Pháo & Quá Cung Pháo
  {
    id: "sgp_trung_phao",
    name: "Sĩ Giác Pháo đối Trung pháo",
    category: "siGiacPhao",
    moves: ["P2-4", "P2-5", "M2.3", "M8.7", "X1-2", "X9-8"],
    intent: { r: "Sĩ giác pháo phòng thủ sườn và bảo vệ chốt", b: "Trung pháo đánh thẳng tâm điểm" },
  },
  {
    id: "sgp_khoi_ma",
    name: "Sĩ Giác Pháo",
    category: "siGiacPhao",
    moves: ["P2-4", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"],
    intent: { r: "Điều pháo vào góc sĩ ngắm nghía sườn đối thủ", b: "Bình phong mã vững vàng đối trận" },
  },
  {
    id: "qcp_trung_phao",
    name: "Quá Cung Pháo đối Trung pháo",
    category: "quaCungPhao",
    moves: ["P2-6", "P2-5", "M2.3", "M8.7", "X1-2", "X9-8"],
    intent: { r: "Dồn pháo sang sườn đối diện tập trung binh lực", b: "Chiếm trung lộ đánh đòn phủ đầu" },
  },
  {
    id: "qcp_khoi_ma",
    name: "Quá Cung Pháo",
    category: "quaCungPhao",
    moves: ["P2-6", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"],
    intent: { r: "Quá cung pháo chuẩn bị xuất kích cánh yếu đối phương", b: "Khởi mã xuất quân theo bài bản" },
  },

  // 11. Khai cuộc đặc sắc khác
  {
    id: "kcp_co_ban",
    name: "Kim Câu Pháo",
    category: "kimCauPhao",
    moves: ["P2-7", "M8.7", "M2.3", "X9-8"],
    intent: { r: "Pháo đáy móc câu nhắm vào Tượng sườn đối phương", b: "Xuất mã xe phòng thủ cẩn mật" },
  },
  // 12. Biến bổ sung từ ván đại sư (xqbase, theo mã ECCO)
  {
    id: "ecco_c23",
    name: "Pháo đầu Xe quá hà Mã 7 đối Bình Phong Mã Lưỡng đầu xà [C23]",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "B7.1", "X2.6", "M2.3", "M8.7", "B3.1"],
    intent: { r: "Xe quá hà đè cánh, Mã 7 tiếp ứng trung lộ", b: "Tiến cả hai Tốt (Lưỡng đầu xà) mở đường cho đôi Mã" },
  },
  {
    id: "ecco_c12",
    name: "Pháo đầu Hoành Xe phải đối Bình Phong Mã (Pháo tuần hà) [C12]",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "B7.1", "B7.1", "M8.7", "M2.3", "X1.1", "T3.5"],
    intent: { r: "Hoành Xe sang sườn, sau đó Pháo tuần hà", b: "Phi Tượng giữ vững, chờ phản kích" },
  },
  {
    id: "ecco_c13",
    name: "Pháo đầu Hoành Xe phải đối Bình Phong Mã (Pháo biên) [C13]",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "M8.7", "M2.3", "B7.1", "B7.1", "X1.1", "T3.5"],
    intent: { r: "Hoành Xe, chuẩn bị bình Pháo biên mở lộ Xe", b: "Bình Phong Mã vững chắc, phi Tượng củng cố" },
  },
  {
    id: "ecco_c02",
    name: "Pháo đầu Mã 7 đối Bình Phong Mã (Mã trái bàn hà) [C02]",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "B7.1", "B7.1", "M8.7", "M2.3", "M7.6"],
    intent: { r: "Mã trái bàn hà, tranh điểm cao giữa bàn", b: "Giữ thế Bình Phong Mã, chờ đổi quân" },
  },
  {
    id: "ecco_c98",
    name: "Ngũ Bát Pháo hai bên tiến Tốt 3 đối Bình Phong Mã [C98]",
    category: "binhPhongMa",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "B3.1", "B3.1", "P8.4", "M2.3", "P8-7", "X1-2"],
    intent: { r: "Pháo 8 tuần hà rồi bình ép Mã", b: "Ra Xe nhanh, giữ Mã không bị ép" },
  },
  {
    id: "ecco_d05",
    name: "Thuận Pháo Hoành Xe đối Trực Xe tuần hà [D05]",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1.1", "X9-8", "X1-6", "X8.4", "M8.7", "M2.3"],
    intent: { r: "Hoành Xe sang lộ 6 tranh lộ thông", b: "Trực Xe tuần hà, giữ đường ngang" },
  },
  {
    id: "ecco_d23",
    name: "Thuận Pháo Trực Xe đối Hoành Xe (Xe tuần hà) [D23]",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1-2", "X9.1", "M8.7", "X9-4", "B7.1", "M2.3"],
    intent: { r: "Trực Xe đè lộ 2, sau đó Xe tuần hà", b: "Hoành Xe sang lộ 4 phản kích sườn" },
  },
  {
    id: "ecco_d29",
    name: "Thuận Pháo Trực Xe đối Hoành Xe (Lưỡng đầu xà đối song Hoành Xe) [D29]",
    category: "thuanPhao",
    moves: ["P2-5", "P8-5", "M2.3", "M8.7", "X1-2", "X9.1", "M8.7", "X9-4", "B3.1", "M2.3"],
    intent: { r: "Tiến hai Tốt (Lưỡng đầu xà) khai thông đôi Mã", b: "Ra cả hai Xe ngang để phản công" },
  },
  {
    id: "ecco_e01",
    name: "Tiên Nhân Chỉ Lộ đối Phi Tượng [E01]",
    category: "tienNhanChiLo",
    moves: ["B7.1", "T3.5", "P8-6", "B7.1", "M8.7", "M2.3"],
    intent: { r: "Thăm dò, chuyển Pháo sĩ giác linh hoạt", b: "Phi Tượng vững vàng, chơi chắc" },
  },
  {
    id: "ecco_e09",
    name: "Lưỡng đầu xà đối Mã phải chuyển Tốt để Pháo [E09]",
    category: "tienNhanChiLo",
    moves: ["B7.1", "M8.7", "B3.1", "P2-3", "M8.9", "M2.1", "X9-8", "P8-9"],
    intent: { r: "Tiến hai Tốt, Mã biên ra nhanh", b: "Tốt để Pháo ép Tốt 3 của Đỏ" },
  },
  {
    id: "ecco_e16",
    name: "Tiên Nhân Chỉ Lộ chuyển Pháo đầu trái đối Tốt để Pháo (Phi Tượng phải, hai bên Mã biên) [E16]",
    category: "tienNhanChiLo",
    moves: ["B7.1", "P2-3", "P2-5", "T7.5", "M8.9", "M2.1", "X9-8", "B1.1"],
    intent: { r: "Chuyển sang Pháo đầu trái, Mã biên ra Xe", b: "Tốt để Pháo kiềm Tốt, phi Tượng giữ trung lộ" },
  },
  {
    id: "ecco_e21",
    name: "Tiên Nhân Chỉ Lộ chuyển Pháo đầu trái đối Tốt để Pháo (Đỏ lên Sĩ trước) [E21]",
    category: "tienNhanChiLo",
    moves: ["B3.1", "P8-7", "P8-5", "T7.5", "S4.5", "B3.1", "M8.7", "M2.3"],
    intent: { r: "Lên Sĩ trước, củng cố rồi mới ra quân", b: "Tốt để Pháo, phi Tượng, tiến Tốt đối công" },
  },
  {
    id: "ecco_e36",
    name: "Tiên Nhân Chỉ Lộ chuyển Pháo đầu trái đối Tốt để Pháo (Song Trực Xe, Mã biên phải) [E36]",
    category: "tienNhanChiLo",
    moves: ["B7.1", "P2-3", "P2-5", "T3.5", "M2.3", "B3.1", "M8.9", "B3.1"],
    intent: { r: "Ra đôi Xe thẳng, Mã biên tiếp ứng", b: "Liên tiến Tốt 7, Hoành Xe phải phản kích" },
  },
  {
    id: "ecco_e37",
    name: "Tiên Nhân Chỉ Lộ chuyển Pháo đầu trái đối Tốt để Pháo (Mã biên phải) [E37]",
    category: "tienNhanChiLo",
    moves: ["B7.1", "P2-3", "P2-5", "T3.5", "M8.9", "B7.1", "M2.3", "M8.7"],
    intent: { r: "Mã biên phải, giữ Pháo đầu", b: "Tiến Tốt 7 tranh không gian" },
  },
  {
    id: "ecco_e47",
    name: "Đối Binh chuyển Pháo để Tốt đối Pháo đầu phải [E47]",
    category: "tienNhanChiLo",
    moves: ["B7.1", "B7.1", "P2-3", "P8-5", "M8.7", "M8.7", "T7.5", "M7.6"],
    intent: { r: "Pháo để Tốt ép Tốt đối phương", b: "Chuyển sang Pháo đầu phải, Mã lên bàn hà" },
  },
  {
    id: "ecco_a15",
    name: "Phi Tượng tiến Tốt 3 đối Mã phải [A15]",
    category: "phiTuong",
    moves: ["T3.5", "M2.3", "B3.1", "B3.1", "M2.3", "M3.4"],
    intent: { r: "Phi Tượng chơi chắc, tiến Tốt 3 mở Mã", b: "Mã phải lên nhanh, tranh điểm Tốt 3" },
  },
  {
    id: "ecco_a30",
    name: "Phi Tượng đối Quá Cung Pháo trái [A30]",
    category: "phiTuong",
    moves: ["T3.5", "P8-4", "B7.1", "M8.7", "M8.7", "X9-8"],
    intent: { r: "Phi Tượng, tiến Tốt 7 ra Mã", b: "Quá Cung Pháo, chuẩn bị Trực Xe" },
  },
  {
    id: "ecco_a37",
    name: "Phi Tượng Mã trái đối tiến Tốt 7 [A37]",
    category: "phiTuong",
    moves: ["T3.5", "B7.1", "M8.7", "M2.1", "P8-9", "X1-2"],
    intent: { r: "Mã trái lên, Pháo biên mở lộ Xe", b: "Tiến Tốt 7, Mã biên linh hoạt" },
  },
  {
    id: "ecco_a45",
    name: "Khởi Mã hai bên tiến Tốt 7 [A45]",
    category: "khoiMa",
    moves: ["M8.7", "B3.1", "B3.1", "M2.3", "M2.3", "X1.1"],
    intent: { r: "Khởi Mã, thăm dò ý đồ đối phương", b: "Tiến Tốt đối, Hoành Xe sớm" },
  },
  {
    id: "ecco_a61",
    name: "Quá Cung Pháo đối Mã trái [A61]",
    category: "quaCungPhao",
    moves: ["P8-4", "M2.3", "B7.1", "X1-2", "M8.7", "P2-1"],
    intent: { r: "Quá Cung Pháo, ra quân cân đối hai cánh", b: "Mã trái, Xe nhanh, Pháo biên" },
  },
];

/**
 * Kiểm tra xem chuỗi nước đi có khớp với một nhánh trong cây khai cuộc chuẩn không.
 * - Nước đầu tiên: mọi nước mở màn chính quy (khác 'other').
 * - Các nước tiếp theo: phải là tiền tố của một biến trong OPENING_BOOK_LINES.
 */
export function isBookMove(playedNotations: string[]): boolean {
  if (playedNotations.length === 0 || playedNotations.length > 20) return false;
  if (playedNotations.length === 1) {
    const o = openingOf(playedNotations[0]);
    return o.id !== "other";
  }
  return OPENING_BOOK_LINES.some((line) => {
    if (line.moves.length < playedNotations.length) return false;
    for (let i = 0; i < playedNotations.length; i++) {
      if (line.moves[i] !== playedNotations[i]) return false;
    }
    return true;
  });
}

/**
 * Nhận diện tên thế trận khai cuộc từ chuỗi các nước đi trong ván cờ (tiếng Việt).
 * So khớp từ biến sâu nhất trong OPENING_BOOK_LINES (Thuận Pháo, Nghịch Pháo, Bình Phong Mã, Phản Cung Mã...),
 * nếu không khớp chuỗi sâu thì fallback về nước đầu tiên.
 */
export function detectOpeningFromMoves(playedNotations: string[]): string | undefined {
  if (playedNotations.length === 0) return undefined;

  let bestCompleted: { name: string; matchLen: number } | null = null;
  let bestPrefix: { name: string; matchLen: number } | null = null;

  for (const line of OPENING_BOOK_LINES) {
    const checkLen = Math.min(line.moves.length, playedNotations.length);
    let matched = true;
    for (let i = 0; i < checkLen; i++) {
      if (line.moves[i] !== playedNotations[i]) {
        matched = false;
        break;
      }
    }
    if (matched && checkLen >= 2) {
      if (playedNotations.length >= line.moves.length) {
        if (!bestCompleted || line.moves.length > bestCompleted.matchLen) {
          bestCompleted = { name: line.name, matchLen: line.moves.length };
        }
      } else {
        if (!bestPrefix || checkLen > bestPrefix.matchLen) {
          bestPrefix = { name: line.name, matchLen: checkLen };
        }
      }
    }
  }

  if (bestCompleted) return bestCompleted.name;
  if (bestPrefix && bestPrefix.matchLen >= 2) return bestPrefix.name;

  const first = openingOf(playedNotations[0]);
  return first && first.id !== "other" ? first.name : undefined;
}

export interface NextBookMove {
  move: string;
  lineName: string;
  lineId?: string;
}

/**
 * Tìm các nước đi tiếp theo chuẩn trong sách khai cuộc dựa trên chuỗi nước đi đã qua.
 * Dùng để gợi ý nước khai cuộc cho người chơi hoặc phân tích kỳ lý.
 */
export function findNextBookMoves(playedNotations: string[]): NextBookMove[] {
  const currentLen = playedNotations.length;
  if (currentLen === 0 || currentLen >= 20) return [];

  const map = new Map<string, NextBookMove>();

  for (const line of OPENING_BOOK_LINES) {
    if (line.moves.length <= currentLen) continue;

    let matched = true;
    for (let i = 0; i < currentLen; i++) {
      if (line.moves[i] !== playedNotations[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      const nextMove = line.moves[currentLen];
      if (!map.has(nextMove)) {
        map.set(nextMove, {
          move: nextMove,
          lineName: line.name,
          lineId: line.id,
        });
      }
    }
  }

  return [...map.values()];
}

export interface OpeningGuide {
  line: OpeningBookLine | null;
  name: string;
  category?: OpeningCategory;
  intent?: {
    r: string;
    b: string;
  };
  pliesMatched: number;
  nextMoves: NextBookMove[];
}

/**
 * Lấy toàn bộ hướng dẫn và ý đồ kỳ lý của thế trận khai cuộc hiện tại.
 */
export function getOpeningGuide(playedNotations: string[]): OpeningGuide | null {
  if (playedNotations.length === 0) return null;

  let bestLine: OpeningBookLine | null = null;
  let bestMatchLen = 0;

  for (const line of OPENING_BOOK_LINES) {
    const checkLen = Math.min(line.moves.length, playedNotations.length);
    let matched = true;
    for (let i = 0; i < checkLen; i++) {
      if (line.moves[i] !== playedNotations[i]) {
        matched = false;
        break;
      }
    }
    if (matched && checkLen > bestMatchLen) {
      bestMatchLen = checkLen;
      bestLine = line;
    }
  }

  const name = bestLine?.name ?? detectOpeningFromMoves(playedNotations) ?? "Khai cuộc";
  const nextMoves = findNextBookMoves(playedNotations);

  return {
    line: bestLine,
    name,
    category: bestLine?.category,
    intent: bestLine?.intent,
    pliesMatched: bestMatchLen,
    nextMoves,
  };
}

