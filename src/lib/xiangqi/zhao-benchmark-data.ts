// Dữ liệu 20 thế cờ kinh điển từ 48 bài giảng Tượng Kỳ Kỳ Lý của Triệu Hâm Hâm
// Dùng để đối chiếu và kiểm tra AI phân tích trực tiếp trên giao diện

export interface ZhaoBenchmarkItem {
  lesson: number;
  title: string;
  tacticId: string;
  fen: string;
  move: string; // uci: "c3c9"
  moveNotation: string; // "X2.6"
  video: string;
  videoUrl: string;
  description: string;
  principle: string;
}

export const ZHAO_BENCHMARK_LESSONS: ZhaoBenchmarkItem[] = [
  {
    lesson: 1,
    title: "Khuyết Sĩ Kỵ Song Xe",
    tacticId: "khuyetSiSongXe",
    fen: "1rbak4/4a4/2n1b4/p3p3p/4R4/2P1P4/P1R5P/1C1AB1N2/4A4/2B1K4 w - - 0 1",
    move: "c3c9",
    moveNotation: "X2.6",
    video: "n3SbgwL1GAI",
    videoUrl: "https://www.youtube.com/watch?v=n3SbgwL1GAI&t=10m55s",
    description: "Cung Tướng Đen mất 1 Sĩ. Đỏ dùng Song Xe phối hợp thọc sâu tuyến đáy và sườn ép sát Tướng Đen.",
    principle: "Cung Tướng mất Sĩ thì sức chống đỡ hai Xe đối phương suy giảm nghiêm trọng. Bên công dùng Song Xe liên thủ, phối hợp thêm quân trợ chiến để tạo thế tuyệt sát."
  },
  {
    lesson: 2,
    title: "Khuyết Tượng Sợ Pháo (Muộn cung sát)",
    tacticId: "muonCungSat",
    fen: "3aka3/4n4/8C/9/9/9/9/9/9/4K4 w - - 0 1",
    move: "i7i9",
    moveNotation: "P1.2",
    video: "R_A3Osmn42M",
    videoUrl: "https://www.youtube.com/watch?v=R_A3Osmn42M&t=01m35s",
    description: "Đen khuyết Tượng, Tướng Đen bị Song Sĩ và Mã hoa tim chèn kẹt. Đỏ cắm Pháo đáy chiếu tuyệt sát một quân thành cục.",
    principle: "Tuyến phòng thủ mất Tượng che chắn thì trung lộ và tuyến đáy dễ dàng bị Pháo xuyên thủng, đặc biệt là nguy cơ đòn Muộn cung sát một quân thành cục."
  },
  {
    lesson: 3,
    title: "Thuật Dùng Mã Mạnh Nhất - Ngọa Tào Mã",
    tacticId: "ngoaTaoMa",
    fen: "3ak4/4a4/9/4N4/9/9/9/9/9/4K4 w - - 0 1",
    move: "e6c7",
    moveNotation: "M5.7",
    video: "cZPFcW_y0_U",
    videoUrl: "https://www.youtube.com/watch?v=cZPFcW_y0_U&t=01m14s",
    description: "Mã đỏ nhảy vào góc tuyến 2 (Ngọa Tào lộ 7 hàng 2) khống chế cửu cung, khóa Tướng đối phương mở đường sát cục.",
    principle: "Ngọa tào Mã là vị trí Mã công kích uy lực nhất, chiếm lĩnh yếu huyệt hàng 2 của đối phương, khống chế góc cung và tạo thế uy hiếp sát cục tàn khốc."
  },
  {
    lesson: 4,
    title: "Mã Xấu Nhất - Oa Tâm Mã",
    tacticId: "oaTamMa",
    fen: "3aka3/9/2n5C/9/4P4/9/9/9/9/4K4 b - - 0 1",
    move: "c7e8",
    moveNotation: "M7/5",
    video: "vQWgmZHhrvM",
    videoUrl: "https://www.youtube.com/watch?v=vQWgmZHhrvM&t=01m06s",
    description: "Đen thoái Mã về hoa tim trung cung tự chèn kẹt Tướng và cản trở Song Sĩ, lập tức bị Đỏ khai thác sát cục.",
    principle: "Mã nhập Oa Tâm, bất tử dã thương. Về hoa tim chắn đường Tướng, làm ngòi cho Pháo đối phương và nghẽn lối di chuyển của toàn bộ phòng tuyến."
  },
  {
    lesson: 6,
    title: "Chặn Đường (Cắt Liên Lạc Đoạt Quân)",
    tacticId: "chanDuong",
    fen: "3aka3/9/r5c2/4p4/1N7/9/6R2/9/9/4K4 w - - 0 1",
    move: "b5c7",
    moveNotation: "M8.7",
    video: "34P8w1WNK1U",
    videoUrl: "https://www.youtube.com/watch?v=34P8w1WNK1U&t=00m50s",
    description: "Mã đỏ chen vào hàng 2 cắt đứt tuyến liên lạc bảo vệ của Xe đen với Pháo đen, khiến Pháo đen mất căn bị bắt chết.",
    principle: "Chặn đường là chêm quân vào tuyến liên lạc của đối phương khiến quân bảo hộ không thể che chở cho quân yếu, mở đường đoạt quân thắng thế."
  },
  {
    lesson: 8,
    title: "Binh Quý Thần Tốc (Đua Tốc Độ Sát Cục)",
    tacticId: "binhQuyThanToc",
    fen: "3aka3/9/9/9/9/5R3/9/3n5/9/4K4 w - - 0 1",
    move: "f4f9",
    moveNotation: "X4.5",
    video: "rFsWmjfosfI",
    videoUrl: "https://www.youtube.com/watch?v=rFsWmjfosfI&t=00m45s",
    description: "Đôi bên đều có đòn sát. Đỏ không phòng thủ mà ra đòn chiếu liên hoàn thần tốc để giành chiến thắng trước một nhịp.",
    principle: "Khi hai bên cùng đối công quyết liệt, tốc độ là yếu tố sinh tử. Ra tay trước một nhịp là sống, chậm một nhịp là chết."
  },
  {
    lesson: 10,
    title: "Nhất Mã Hoán Lưỡng Tượng",
    tacticId: "nhatMaHoanLuongTuong",
    fen: "2b1k1b2/9/9/9/3N5/9/9/9/9/4K4 w - - 0 1",
    move: "d5c7",
    moveNotation: "M6.7",
    video: "Pb8j35bP298",
    videoUrl: "https://www.youtube.com/watch?v=Pb8j35bP298&t=01m10s",
    description: "Mã đỏ chủ động đổi lấy đôi Tượng Đen, xé toang tấm lá chắn phòng thủ của đối phương.",
    principle: "Dùng 1 Mã đổi lấy 2 Tượng phá tan hệ thống phòng ngự từ xa, mở toang trung lộ và hai cánh cho Xe Pháo tràn vào đánh sát."
  },
  {
    lesson: 11,
    title: "Chiến Thuật Đoạt Trung Binh",
    tacticId: "doatTrungBinh",
    fen: "r1bakab1r/9/1cn2cn2/p1p1p1p1p/9/9/P1P1P1P1P/1C2C1N2/9/RNBAKAB1R w - - 0 1",
    move: "e2e6",
    moveNotation: "P5.4",
    video: "DWGGNkDgyfY",
    videoUrl: "https://www.youtube.com/watch?v=DWGGNkDgyfY&t=01m04s",
    description: "Pháo đầu bắn Trung binh đoạt chốt tim, khống chế cột 5 và trực tiếp uy hiếp cung Tướng.",
    principle: "Trung binh là yết hầu của trận thế. Đoạt được Trung binh sạch sẽ là chiếm được quyền chủ động tối cao ở trung lộ."
  },
  {
    lesson: 13,
    title: "Pháo Chìm Đáy (Nghệ Thuật Phá Trận & Lật Kèo)",
    tacticId: "phaoTramDay",
    fen: "2bakab2/9/9/4p4/1n7/9/9/1R5C1/9/3AKA3 w - - 0 1",
    move: "h2h9",
    moveNotation: "P2.7",
    video: "k61L-23ui9E",
    videoUrl: "https://www.youtube.com/watch?v=k61L-23ui9E&t=00m52s",
    description: "Pháo đỏ cắm đáy kiềm chế Song Xe hoặc phá tan hệ thống Sĩ Tượng đối phương từ dưới đáy.",
    principle: "Pháo trầm đáy uy lực vô cùng, từ tuyến đáy khống chế lưng Tướng, gián tiếp phong tỏa quân lực và tạo cơ hội phá thành đoạt thế."
  },
  {
    lesson: 32,
    title: "Khéo Phá Sĩ Tượng",
    tacticId: "kheoPhaSiTuong",
    fen: "1r2kab2/1R2a4/4b4/p3n4/5n2p/P1R6/6c2/N3C1N2/9/2BAKAB2 b - - 0 1",
    move: "g3e3",
    moveNotation: "p3-5",
    video: "bWElCPYqAr0",
    videoUrl: "https://www.youtube.com/watch?v=bWElCPYqAr0&t=02m30s",
    description: "Dùng đòn chiến thuật tinh tế phá tan Sĩ Tượng đối phương mà bên mình không phải trả giá bằng vật chất lớn.",
    principle: "Phá Sĩ Tượng bằng đòn phối hợp khéo léo, bẻ gãy phòng thủ kiên cố mà vẫn bảo toàn binh lực ưu thế."
  },
  {
    lesson: 33,
    title: "Trảm Sĩ Phá Tượng",
    tacticId: "tramSiPhaTuong",
    fen: "2bakr3/4a4/4b1n2/p3n3p/4C4/4P4/P1R2cp1P/1C2B1N2/4A4/4KA3 w - - 0 1",
    move: "e5e8",
    moveNotation: "P5.3",
    video: "BYSx99YJn2g",
    videoUrl: "https://www.youtube.com/watch?v=BYSx99YJn2g&t=03m15s",
    description: "Pháo đỏ chém Tượng chiếu Tướng, ép đối phương chống đỡ rồi phối hợp Xe bẻ sạch hệ thống phòng thủ.",
    principle: "Quyết đoán ra tay trảm Sĩ phá Tượng để mở toang cửu cung, dồn ép Tướng đối phương vào thế không có nơi ẩn nấp."
  },
  {
    lesson: 40,
    title: "Một Xe Đổi Hai",
    tacticId: "motXeDoiHai",
    fen: "1Rn2k3/9/4c4/9/3N5/9/2r6/9/9/3K5 w - - 0 1",
    move: "b9c9",
    moveNotation: "X8-7",
    video: "fH1tN7R2V3c",
    videoUrl: "https://www.youtube.com/watch?v=fH1tN7R2V3c&t=02m05s",
    description: "Đỏ chủ động hy sinh 1 Xe để ăn 2 quân nhẹ (Mã và Pháo) của Đen, chuyển hóa thành ưu thế thế trận.",
    principle: "Một Xe đổi lấy hai quân nhẹ (Mã, Pháo) là phép tính chiến thuật cơ bản. Đổi xong bên giữ hai quân nhẹ linh hoạt sẽ chiếm thế áp đảo."
  },
  {
    lesson: 41,
    title: "Một Xe Đổi Ba",
    tacticId: "motXeDoiBa",
    fen: "1Rn2k3/9/4c4/4p4/3NP4/9/2r6/9/9/3K5 w - - 0 1",
    move: "b9c9",
    moveNotation: "X8-7",
    video: "6BfGoFdJkFE",
    videoUrl: "https://www.youtube.com/watch?v=6BfGoFdJkFE&t=00m43s",
    description: "Đỏ hy sinh 1 Xe ăn sạch 3 quân đối phương (Mã, Pháo, Tốt), tạo chênh lệch vật chất quyết định.",
    principle: "Hy sinh Xe lấy ba quân đối phương mang lại ưu thế vật chất áp đảo, khiến đối phương tổn thất nặng nề không thể gượng dậy."
  },
  {
    lesson: 42,
    title: "Mã Vận Như Long (Hồi Mã Kim Thương)",
    tacticId: "maVanNhuLong",
    fen: "3akab2/4a4/9/9/9/2N6/9/9/9/4K4 w - - 0 1",
    move: "c4e3",
    moveNotation: "M7/5",
    video: "4Dv7Z8hGBwE",
    videoUrl: "https://www.youtube.com/watch?v=4Dv7Z8hGBwE&t=12m17s",
    description: "Mã thoái lui về vị trí hiểm yếu (Hồi mã kim thương), vừa nén chặt không gian vừa chuẩn bị đòn phản kích bùng nổ.",
    principle: "Mã vận chuyển biến hóa khôn lường kiểm soát trung tâm và các lộ trọng yếu, lùi một bước để tiến mười bước xé toang trận hình địch."
  },
  {
    lesson: 43,
    title: "Nhất Xe Thập Tự (Tung Hoành Ngang Dọc)",
    tacticId: "nhatXeThapTu",
    fen: "3akab2/4a4/9/9/9/2R6/9/9/9/4K4 w - - 0 1",
    move: "c4d4",
    moveNotation: "X7-6",
    video: "oLr-I_nSAFc",
    videoUrl: "https://www.youtube.com/watch?v=oLr-I_nSAFc&t=00m53s",
    description: "Xe chiếm lĩnh ngã tư huyết mạch, kiểm soát cả lộ dọc trọng yếu lẫn tuyến ngang khống chế toàn trận.",
    principle: "Nhất Xe thập tự: Quân Xe kiểm soát cả đường dọc và đường ngang, uy lực tỏa ra 4 phương khống chế toàn diện trận cờ."
  },
  {
    lesson: 44,
    title: "5 Nguyên Tắc Vàng Nghệ Thuật Vận Pháo",
    tacticId: "ngheThuatVanPhao",
    fen: "3akab2/4a4/9/9/9/2C6/9/9/9/4K4 w - - 0 1",
    move: "c4e4",
    moveNotation: "P7-5",
    video: "P9e5aGjepDY",
    videoUrl: "https://www.youtube.com/watch?v=P9e5aGjepDY&t=00m45s",
    description: "Điều động Pháo chiếm lĩnh tuyến đường trọng yếu (Tuần hà, Sĩ giác), cung cấp hỏa lực bảo đảm từ xa.",
    principle: "Vận Pháo cần ngòi, cơ động viễn trình, phối hợp đạn tử pháo công thủ toàn diện và bảo đảm hỏa lực chi viện từ sân nhà."
  },
  {
    lesson: 45,
    title: "Tiểu Binh Lập Đại Công",
    tacticId: "tieuBinhLapDaiCong",
    fen: "3akab2/4a4/9/9/9/2P6/9/9/9/4K4 w - - 0 1",
    move: "c4c5",
    moveNotation: "B7.1",
    video: "VLKh7DCmxoM",
    videoUrl: "https://www.youtube.com/watch?v=VLKh7DCmxoM&t=00m06s",
    description: "Binh qua sông uy hiếp Mã, khóa chặt tuyến phòng thủ đối phương với uy lực tương đương nửa con Xe.",
    principle: "Binh qua sông uy lực như nửa Xe. Dùng Tốt khéo léo chèn ép quân lớn, phá vỡ phòng tuyến và chuyển hóa thành thế thắng tàn cuộc."
  },
  {
    lesson: 46,
    title: "Phế Tốt Phản Công - Tranh Đoạt Quyền Chủ Động",
    tacticId: "pheTotPhanCong",
    fen: "5k3/4a4/2r6/9/9/2P6/2R6/9/9/3K5 w - - 0 1",
    move: "c4c5",
    moveNotation: "B7.1",
    video: "Fta7FlPnBXg",
    videoUrl: "https://www.youtube.com/watch?v=Fta7FlPnBXg&t=00m05s",
    description: "Đỏ chủ động đưa Tốt vào miệng Xe đen phế bỏ, giải phóng lộ xuất quân cho Xe đỏ phản công sấm sét.",
    principle: "Chủ động phế Tốt tranh thế: Thí tiểu binh để tranh tiên đoạt thế, khai thông lộ xe mã pháo phát động phản kích chuyển bại thành thắng."
  },
  {
    lesson: 47,
    title: "Chiến Thuật Mưu Binh - Binh Bất Huyết Nhẫn",
    tacticId: "chienThuatMuuBinh",
    fen: "5k3/4a4/9/2p6/9/9/9/9/9/2R1K4 w - - 0 1",
    move: "c0c6",
    moveNotation: "X7.6",
    video: "bvT-dKCB-xU",
    videoUrl: "https://www.youtube.com/watch?v=bvT-dKCB-xU&t=02m11s",
    description: "Xe đỏ ăn sạch Tốt đen vỏ bọc chưa qua sông một cách an toàn không mất căn, tích lũy ưu thế vật chất.",
    principle: "Chiến thuật mưu Binh: Không tham ăn mồi độc mà đoạt Tốt sạch sẽ không đổ máu, vừa xé toang vỏ bọc đối phương vừa tích lũy ưu thế tất thắng."
  },
  {
    lesson: 48,
    title: "Cục Bộ Dĩ Đa Kích Thiểu (Lấy Nhiều Đánh Ít)",
    tacticId: "cucBoDiDaKichThieu",
    fen: "2bakab2/9/9/4p4/1n7/9/9/1R5C1/9/3AKA3 w - - 0 1",
    move: "h2h9",
    moveNotation: "P2.7",
    video: "P1vUbC9nw24",
    videoUrl: "https://www.youtube.com/watch?v=P1vUbC9nw24&t=04m53s",
    description: "Tập trung ưu thế binh lực áp đảo tại một cánh yếu của đối phương để dồn trọng binh kết liễu trận đấu.",
    principle: "Nguyên tắc cốt lõi của tấn công: Tại khu vực cục bộ quan trọng hình thành ưu thế binh lực áp đảo dĩ đa kích thiểu, không phân tán lực lượng."
  }
];

export const ZHAO_BENCHMARK_MAP: Record<number, ZhaoBenchmarkItem> = Object.fromEntries(
  ZHAO_BENCHMARK_LESSONS.map((item) => [item.lesson, item])
);
