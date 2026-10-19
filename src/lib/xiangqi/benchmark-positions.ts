// Bộ 30+ thế cờ mẫu chuẩn (Benchmark positions) cho Cờ Tướng.
// Phục vụ kiểm thử hồi quy (regression test), kiểm tra kỳ lý, và hiệu chuẩn bảng WEIGHTS.

import type { Plan } from "./strategy";
import type { EndgameOutcome } from "./endgame";

export type BenchmarkCategory = "opening" | "tactics" | "strategy" | "endgame";

export interface BenchmarkPosition {
  id: string;
  name: string;
  fen: string;
  category: BenchmarkCategory;
  description: string;
  /** Nước đi đang xét (nếu có, tọa độ UCI) */
  move?: string;
  /** Nước phản đòn/trừng phạt của đối phương (nếu có, tọa độ UCI) */
  reply?: string;
  /** Chuỗi nước cờ đã đi trước thế này (ký hiệu Việt Nam hoặc Move) */
  moves?: string[];
  expected: {
    plan?: Plan;
    openingName?: string;
    openingFault?: import("./strategy").OpeningFaultType;
    tacticalKind?: string;
    facts?: string[];
    intent?: string[];
    assessmentTop?: string[];
    endgameOutcome?: EndgameOutcome;
    endgameWinner?: "r" | "b";
    endgameId?: string;
  };
}

export const BENCHMARK_POSITIONS: BenchmarkPosition[] = [
  // --- NHÓM 1: KHAI CUỘC (OPENINGS) ---
  {
    id: "open_01_start",
    name: "Khai cuộc: Bàn cờ ban đầu",
    fen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1",
    category: "opening",
    description: "Thế cờ đầu ván, cả 2 bên cần ưu tiên ra quân nhanh và cân đối.",
    expected: { plan: "raQuan" },
  },
  {
    id: "open_02_central_cannon",
    name: "Khai cuộc: Pháo đầu nước 1",
    fen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1C1P1P/7C1/9/RNBAKABNR b - - 0 1",
    category: "opening",
    description: "Đỏ vừa đi P2-5, kế hoạch vẫn là ra quân.",
    moves: ["P2-5"],
    expected: { openingName: "Pháo đầu (Trung pháo)", plan: "raQuan" },
  },
  {
    id: "open_03_thuan_phao",
    name: "Khai cuộc: Thuận Pháo",
    fen: "rnbakabnr/9/7c1/p1p1c1p1p/9/9/P1P1C1P1P/7C1/9/RNBAKABNR w - - 0 2",
    category: "opening",
    description: "Hai bên cùng vào pháo đầu cùng phía.",
    moves: ["P2-5", "P8-5"],
    expected: { openingName: "Thuận Pháo", plan: "raQuan" },
  },
  {
    id: "open_04_nghich_phao",
    name: "Khai cuộc: Nghịch Pháo",
    fen: "rnbakabnr/9/1c7/p1p1c1p1p/9/9/P1P1C1P1P/7C1/9/RNBAKABNR w - - 0 2",
    category: "opening",
    description: "Hai bên vào pháo đầu ngược phía nhau.",
    moves: ["P2-5", "P2-5"],
    expected: { openingName: "Nghịch Pháo", plan: "raQuan" },
  },
  {
    id: "open_05_binh_phong_ma",
    name: "Khai cuộc: Pháo đầu đối Bình Phong Mã",
    fen: "r1bakab1r/9/1cn2cn2/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R w - - 0 4",
    category: "opening",
    description: "Đen thủ thế Bình Phong Mã vững chắc.",
    moves: ["P2-5", "M8.7", "M2.3", "X9-8", "X1-2", "M2.3"],
    expected: { openingName: "Pháo đầu đối Bình Phong Mã", plan: "raQuan" },
  },
  {
    id: "open_06_phan_cung_ma",
    name: "Khai cuộc: Pháo đầu đối Phản Cung Mã",
    fen: "rnbakab1r/9/2n1c1p2/p1p1p1c1p/9/9/P1P1C1P1P/1C2N4/9/RNBAKAB1R w - - 0 3",
    category: "opening",
    description: "Đen dàn thế Phản Cung Mã kẹp giữa pháo và mã.",
    moves: ["P2-5", "M2.3", "M2.3", "P8-6"],
    expected: { openingName: "Pháo đầu đối Phản Cung Mã", plan: "raQuan" },
  },
  {
    id: "open_07_don_de_ma",
    name: "Khai cuộc: Pháo đầu đối Đơn Đề Mã",
    fen: "r1bakabnr/9/1cn6/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R w - - 0 3",
    category: "opening",
    description: "Đen phát triển một mã cánh biên (Đơn Đề Mã).",
    moves: ["P2-5", "M8.7", "M2.3", "M2.1"],
    expected: { openingName: "Pháo đầu đối Đơn Đề Mã", plan: "raQuan" },
  },
  {
    id: "open_fault_01_repeat_piece",
    name: "Lỗi khai cuộc: Đi một quân nhiều lần (repeatPiece)",
    fen: "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1C1P1P/7C1/9/RNBAKABNR w - - 0 3",
    category: "opening",
    description: "Đỏ đã đi P2-5 rồi lại tiếp tục nhảy Pháo đó lần nữa khi 5 quân lớn chưa xuất.",
    move: "e3e4",
    moves: ["P2-5", "M8.7"],
    expected: { openingFault: "repeatPiece", plan: "raQuan" },
  },
  {
    id: "open_fault_02_late_rook",
    name: "Lỗi khai cuộc: Chậm ra Xe sau 8 nước (lateRook)",
    fen: "r1bakab1r/9/1cn2cn2/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R w - - 0 5",
    category: "opening",
    description: "Đã qua 8 nước cờ mà cả 2 Xe đỏ vẫn nằm nguyên ở góc sân, lại đi Tốt.",
    move: "e3e4",
    expected: { openingFault: "lateRook", plan: "raQuan" },
  },

  // --- NHÓM 2: CHIẾN THUẬT (TACTICS) ---
  {
    id: "tactics_08_double_check",
    name: "Chiến thuật: Chiếu kép (doubleCheck)",
    fen: "4k4/9/9/p8/4N4/9/9/4R4/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Đen đi Tốt sơ hở a6-a5, Đỏ nhảy Mã d7 vừa chiếu Tướng vừa mở đường Xe chiếu kép.",
    move: "a6a5",
    reply: "e5d7",
    expected: { tacticalKind: "doubleCheck" },
  },
  {
    id: "tactics_09_discovered_check",
    name: "Chiến thuật: Chiếu rút (discoveredCheck)",
    fen: "4k4/1r7/9/p8/4C4/9/9/4R4/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Đen đi Tốt sơ hở, Pháo đỏ rút sang a5 chiếu rút Tướng e9 và nhắm bắt Xe b8.",
    move: "a6a5",
    reply: "e5a5",
    expected: { tacticalKind: "discoveredCheck" },
  },
  {
    id: "tactics_10_absolute_pin",
    name: "Chiến thuật: Ghim tuyệt đối (pin to king)",
    fen: "4k4/4n4/9/p8/9/9/R8/9/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Xe đỏ bình sang e3 ghim chặt Mã đen trước mặt Tướng đối phương.",
    move: "a6a5",
    reply: "a3e3",
    expected: { tacticalKind: "pin" },
  },
  {
    id: "tactics_11_relative_pin",
    name: "Chiến thuật: Ghim tương đối (pin to rook)",
    fen: "3k5/4r4/4n4/p8/9/9/R8/9/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Xe đỏ bình sang e3 ghim Mã đen trước mặt Xe đối phương.",
    move: "a6a5",
    reply: "a3e3",
    expected: { tacticalKind: "pin" },
  },
  {
    id: "tactics_12_fork",
    name: "Chiến thuật: Bắt đôi hai quân lớn",
    fen: "4k4/9/2r1r4/p8/9/9/3N5/9/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Mã đỏ nhảy vào vị trí d5 bắt đôi cả 2 Xe c7 và e7 đối phương.",
    move: "a6a5",
    reply: "d3d5",
    expected: { tacticalKind: "threatens" },
  },
  {
    id: "tactics_13_horse_block",
    name: "Chiến thuật: Cản chân Mã đối phương",
    fen: "3k5/9/R3n4/p8/4P4/9/9/9/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Tốt đỏ tiến e6 ngáng chân Mã đen e7 khiến Mã bị Xe đỏ ở a7 ăn có lời.",
    move: "a6a5",
    reply: "e5e6",
    expected: { tacticalKind: "horseBlock" },
  },
  {
    id: "tactics_14_trapped_piece",
    name: "Chiến thuật: Quân bị vây khốn bắt chết",
    fen: "1p1k5/p8/2n6/9/9/c8/9/9/R8/4K4 w - - 0 1",
    category: "tactics",
    description: "Xe đỏ phi lên a9 bị vây khốn bởi Tốt và Pháo đen, không còn ô an toàn.",
    move: "a1a9",
    expected: { tacticalKind: "trappedPiece" },
  },
  {
    id: "tactics_15_hanging_piece",
    name: "Chiến thuật: Quân bị treo mất căn",
    fen: "4k4/9/4r4/p8/9/9/4R4/9/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Xe đen đứng chơ vơ không có bảo vệ bị Xe đỏ ăn trực tiếp.",
    move: "a6a5",
    reply: "e3e7",
    expected: { tacticalKind: "losesPiece" },
  },
  {
    id: "tactics_16_mate_in_1",
    name: "Chiến thuật: Chiếu bí trong 1 nước",
    fen: "4k4/9/9/p8/9/9/9/4R4/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Xe đỏ tiến thẳng e9 chiếu bí ngay lập tức.",
    move: "a6a5",
    reply: "e2e9",
    expected: { tacticalKind: "allowsMate" },
  },
  {
    id: "tactics_17_ignored_threat",
    name: "Chiến thuật: Bỏ qua đòn đe dọa (ignoredThreat)",
    fen: "4k4/9/4n4/p8/9/9/4R4/9/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Đỏ có Xe ở e3 đang đe dọa ăn Mã e7; Đen đi a6a5 bỏ mặc Mã e7 bị ăn mất căn.",
    move: "a6a5",
    reply: "e3e7",
    expected: { tacticalKind: "ignoredThreat" },
  },
  {
    id: "tactics_18_parried_threat",
    name: "Chiến thuật: Kịp thời hóa giải đòn đe dọa (parried)",
    fen: "4k4/9/4n4/9/9/9/4R4/9/9/4K4 b - - 0 1",
    category: "tactics",
    description: "Đỏ có Xe ở e3 đe dọa ăn Mã e7; Đen kịp thời nhảy Mã e7c6 thoát thân an toàn.",
    move: "e7c6",
    reply: "e3e7",
    expected: { tacticalKind: "parried" },
  },
  {
    id: "tactics_19_sacrifice_mate",
    name: "Ý đồ: Thí Xe đâm đáy mở đường sát cục (thiQuan + datSat)",
    fen: "3k5/4a4/9/9/4P4/9/9/4R4/9/4K4 w - - 0 1",
    category: "tactics",
    description: "Đỏ thí Xe đâm đáy e2e9 chém Sĩ, Tướng đen phải ăn lại để dẫn tới sát cục.",
    move: "e2e9",
    expected: { intent: ["thiQuan", "datSat"] },
  },
  {
    id: "tactics_20_trade_rooks",
    name: "Ý đồ: Đổi quân có chủ đích (Xe đổi Xe)",
    fen: "3k5/3r5/9/9/9/9/9/3R5/9/4K4 w - - 0 1",
    category: "tactics",
    description: "Đỏ dùng Xe d2 đổi Xe d8 của Đen đang được Tướng bảo vệ nhằm đơn giản hóa thế trận.",
    move: "d2d8",
    expected: { intent: ["doiQuan"] },
  },

  // --- NHÓM 3: CHIẾN LƯỢC & TRỌNG SỐ WEIGHTS (STRATEGY CALIBRATION) ---
  {
    id: "strat_17_tan_cong_cung_yeu",
    name: "Chiến lược: Cung tướng đối phương khuyết Sĩ Tượng bị ép",
    fen: "r3k1n2/9/9/9/2R1R4/9/4N4/4C4/4A4/4K4 w - - 0 30",
    category: "strategy",
    description: "Đối phương trơ trọi không có Sĩ Tượng, 2 Xe đỏ ép cung -> Kế hoạch tanCong.",
    expected: { plan: "tanCong", assessmentTop: ["anToanTuong"] },
  },
  {
    id: "strat_18_phong_thu_cung_nguy",
    name: "Chiến lược: Cung tướng mình đang bị 3 quân uy hiếp nặng",
    fen: "4k4/9/9/9/9/9/4c4/3r1r3/4A4/R1N1K2R1 w - - 0 30",
    category: "strategy",
    description: "Cung tướng Đỏ bị ép nghẹt thở bởi 2 Xe 1 Pháo đối phương -> Kế hoạch phongThu.",
    expected: { plan: "phongThu", assessmentTop: ["anToanTuong"] },
  },
  {
    id: "strat_19_don_gian_hoa_hon_quan",
    name: "Chiến lược: Hơn hẳn một Xe lớn (>300 điểm)",
    fen: "r1bakab2/9/1c4c2/p1p1p1p1p/9/9/P1P1P1P1P/1C4C2/9/RNBAKABNR w - - 0 25",
    category: "strategy",
    description: "Đỏ hơn hẳn 1 Xe nguyên vẹn -> Kế hoạch donGianHoa.",
    expected: { plan: "donGianHoa", assessmentTop: ["vatChat"] },
  },
  {
    id: "strat_20_tan_cuoc_quan_it",
    name: "Chiến lược: Tổng quân lớn <= 5 đã vào tàn cuộc",
    fen: "4k4/4a4/4b4/9/9/9/9/4B4/4A4/R1N1K4 w - - 0 45",
    category: "strategy",
    description: "Toàn bàn cờ chỉ còn 2 quân lớn của Đỏ -> Kế hoạch tanCuoc.",
    expected: { plan: "tanCuoc" },
  },
  {
    id: "strat_21_can_bang_giu_the",
    name: "Chiến lược: Thế trận giằng co cân bằng",
    fen: "r1bakab1r/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/R1BAKAB1R w - - 0 22",
    category: "strategy",
    description: "Hai bên quân số ngang ngửa, cung tướng an toàn -> Kế hoạch canBang.",
    expected: { plan: "canBang" },
  },

  // --- NHÓM 4: TÀN CUỘC LÝ THUYẾT (THEORETICAL ENDGAMES) ---
  {
    id: "endgame_22_can_quan_hoa",
    name: "Tàn cuộc: Cạn quân tấn công hòa",
    fen: "4k4/4a4/4b4/9/9/9/9/4B4/4A4/4K4 w - - 0 1",
    category: "endgame",
    description: "Hai bên chỉ còn Tướng Sĩ Tượng, hòa lý thuyết.",
    expected: { endgameOutcome: "draw", endgameId: "draw_bare_kings" },
  },
  {
    id: "endgame_23_don_xe_hoa_don_xe",
    name: "Tàn cuộc: Đơn Xe hòa Đơn Xe",
    fen: "4k4/4a4/4b4/9/9/4R4/4r4/4B4/4A4/4K4 w - - 0 1",
    category: "endgame",
    description: "Mỗi bên 1 Xe, hòa lý thuyết.",
    expected: { endgameOutcome: "draw", endgameId: "draw_single_rook_each" },
  },
  {
    id: "endgame_24_don_phao_hoa_don_tuong",
    name: "Tàn cuộc: Đơn Pháo không ngòi hòa Đơn Tướng",
    fen: "4k4/9/9/9/9/4C4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Pháo không có quân làm ngòi, hòa lý thuyết.",
    expected: { endgameOutcome: "draw", endgameId: "draw_cannon_no_screen" },
  },
  {
    id: "endgame_25_don_phao_hoa_si_tuong",
    name: "Tàn cuộc: Đơn Pháo hòa Sĩ Tượng",
    fen: "3ak4/9/4b4/9/9/4C4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Đơn Pháo không thể thắng Tướng có Sĩ Tượng.",
    expected: { endgameOutcome: "draw", endgameId: "draw_single_cannon_vs_guards" },
  },
  {
    id: "endgame_26_don_ma_thang_don_tuong",
    name: "Tàn cuộc: Đơn Mã thắng Đơn Tướng trần",
    fen: "4k4/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Đơn Mã khéo léo dùng mặt Tướng thắng Đơn Tướng.",
    expected: { endgameOutcome: "win", endgameWinner: "r", endgameId: "win_single_horse_vs_bare_king" },
  },
  {
    id: "endgame_27_don_ma_hoa_song_si",
    name: "Tàn cuộc: Đơn Mã hòa Song Sĩ (Sĩ bền)",
    fen: "3aka3/9/9/9/9/4N4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Đơn Mã không phá được cặp Sĩ phòng thủ.",
    expected: { endgameOutcome: "draw", endgameId: "draw_single_horse_vs_advisors" },
  },
  {
    id: "endgame_28_don_ma_hoa_song_tuong",
    name: "Tàn cuộc: Đơn Mã hòa Song Tượng",
    fen: "4k4/9/2b1b4/9/9/4N4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Đơn Mã không phá được Song Tượng liên hoàn.",
    expected: { endgameOutcome: "draw", endgameId: "draw_single_horse_vs_elephants" },
  },
  {
    id: "endgame_29_don_xe_hoa_si_tuong_toan",
    name: "Tàn cuộc: Đơn Xe hòa Sĩ Tượng toàn",
    fen: "2bakab2/9/9/9/9/4R4/9/9/4A4/4K4 w - - 0 1",
    category: "endgame",
    description: "Đơn Xe đối đầu Sĩ Tượng toàn thủ vững là hòa.",
    expected: { endgameOutcome: "draw", endgameId: "draw_rook_vs_full_guards" },
  },
  {
    id: "endgame_30_don_xe_thang_song_si",
    name: "Tàn cuộc: Đơn Xe thắng Song Sĩ khuyết Tượng",
    fen: "3aka3/9/9/9/9/4R4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Song Sĩ không có Tượng che chắn không chống nổi Đơn Xe.",
    expected: { endgameOutcome: "win", endgameWinner: "r", endgameId: "win_rook_vs_advisors_no_elephants" },
  },
  {
    id: "endgame_31_don_xe_thang_don_phao",
    name: "Tàn cuộc: Đơn Xe thắng Đơn Pháo",
    fen: "4k4/9/9/9/4c4/4R4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Đơn Xe cơ động tuyệt đối, chắc thắng Đơn Pháo.",
    expected: { endgameOutcome: "win", endgameWinner: "r", endgameId: "win_rook_vs_cannon" },
  },
  {
    id: "endgame_32_don_xe_thang_don_ma",
    name: "Tàn cuộc: Đơn Xe thắng Đơn Mã",
    fen: "4k4/9/9/9/4n4/4R4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Đơn Xe bẫy và bắt chết Đơn Mã đơn độc.",
    expected: { endgameOutcome: "win", endgameWinner: "r", endgameId: "win_rook_vs_horse" },
  },
  {
    id: "endgame_33_ma_chot_cao_hoa_si_tuong_toan",
    name: "Tàn cuộc: Mã Tốt cao hòa Sĩ Tượng toàn",
    fen: "2bakab2/9/9/4P4/9/4N4/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Mã Tốt không đủ lực phá Sĩ Tượng toàn (Pikafish hòa 29/30 thế ngẫu nhiên; bảng cũ ghi nhầm là thắng).",
    expected: { endgameOutcome: "draw", endgameId: "draw_horse_pawn_vs_full_guards" },
  },
  {
    id: "endgame_34_phao_chot_ngoi_thang_si_tuong_toan",
    name: "Tàn cuộc: Pháo Tốt cao có Sĩ Tượng toàn thắng Sĩ Tượng toàn",
    fen: "2bakab2/9/9/4P4/9/4C4/9/9/9/2BAKAB2 w - - 0 1",
    category: "endgame",
    description: "Pháo Tốt cao cần đủ Sĩ Tượng nhà làm ngòi mới phá được Sĩ Tượng toàn (Pikafish thắng 27/30; chỉ có Sĩ làm ngòi thì hòa 20/30).",
    expected: { endgameOutcome: "win", endgameWinner: "r", endgameId: "win_cannon_pawn_full_guards" },
  },
  {
    id: "endgame_35_don_chot_hoa_don_si",
    name: "Tàn cuộc: Đơn Chốt hòa Đơn Sĩ",
    fen: "3ak4/9/9/4P4/9/9/9/9/9/4K4 w - - 0 1",
    category: "endgame",
    description: "Một Chốt không đủ lực thắng Đơn Sĩ.",
    expected: { endgameOutcome: "draw", endgameId: "draw_single_pawn_vs_guards" },
  },
];
