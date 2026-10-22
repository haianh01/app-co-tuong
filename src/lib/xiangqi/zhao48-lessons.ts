// Thẻ bài 48 Kỳ lý trung cuộc Triệu Hâm Hâm rút trích từ video bài giảng
// Mỗi thẻ bài gồm:
// - lesson: số thứ tự bài (1..48)
// - title: tiêu đề bài giảng
// - principle: nguyên lý cốt lõi viết lại cô đọng bằng lời mình (1-2 câu)
// - signals: dấu hiệu hình thế nhận biết trên bàn cờ
// - quotes: các câu trích nguyên văn từ phụ đề kèm mốc thời gian [MM:SS]
// - kind: "detectable" (nhận diện luật code) | "evaluative" (cần engine) | "summary" (tổng kết)
// - video: mã YouTube video

export type ZhaoLessonKind = "detectable" | "evaluative" | "summary";

export interface ZhaoQuote {
  text: string;
  at: string;
}

export interface ZhaoLessonCard {
  lesson: number;
  title: string;
  principle: string;
  signals: string[];
  quotes: ZhaoQuote[];
  kind: ZhaoLessonKind;
  video: string;
  tacticId?: string;
}

export const ZHAO_LESSONS: Record<number, ZhaoLessonCard> = {
  1: {
    lesson: 1,
    title: "Khuyết Sĩ Kỵ Song Xe",
    principle: "Cung Tướng mất Sĩ thì sức chống đỡ hai Xe đối phương suy giảm nghiêm trọng. Bên công dùng Song Xe liên thủ, phối hợp thêm quân trợ chiến (Mã/Pháo) để tạo thế tuyệt sát.",
    signals: [
      "Bên phòng thủ mất ít nhất 1 Sĩ",
      "Bên công có Song Xe đã qua sông hoặc chiếm lộ thông",
      "Xe cắm đáy hoặc chiếm sườn cung khống chế Tướng",
    ],
    quotes: [
      { text: "khi đối phương thiếu sĩ song xe sẽ phát huy uy lực lớn", at: "10:55" },
      { text: "trong cờ tướng có câu khuyết sĩ kỵ song", at: "01:48" },
    ],
    kind: "detectable",
    video: "n3SbgwL1GAI",
    tacticId: "khuyetSiSongXe",
  },
  2: {
    lesson: 2,
    title: "Khuyết Tượng Sợ Pháo",
    principle: "Tuyến phòng thủ mất Tượng che chắn thì trung lộ và tuyến đáy dễ dàng bị Pháo xuyên thủng, đặc biệt là nguy cơ tiềm ẩn đòn Muộn cung sát một quân thành cục.",
    signals: [
      "Bên phòng thủ mất ít nhất 1 Tượng",
      "Pháo đối phương cắm đáy hoặc kiểm soát trung lộ",
      "Sĩ chèn kẹt Tướng tạo nguy cơ muộn cung sát",
    ],
    quotes: [
      { text: "Quân pháo nó có nước chiếu bí là Muộn cung sát", at: "01:35" },
      { text: "nhưng pháo muộn cung chỉ cần một quân pháo là có thể làm được", at: "02:01" },
    ],
    kind: "detectable",
    video: "R_A3Osmn42M",
    tacticId: "muonCungSat",
  },
  3: {
    lesson: 3,
    title: "Thuật Dùng Mã Mạnh Nhất - Ngọa Tào Mã",
    principle: "Mã Ngọa Tào là thuật dùng Mã tấn công mạnh nhất: Mã chiếm lĩnh hàng 2 lộ 3 hoặc lộ 7 khống chế Tướng trong cung, phối hợp với Xe cắm đáy hoặc Pháo tạo đòn Tiền Mã Hậu Pháo tuyệt sát.",
    signals: [
      "Mã nhảy vào hàng 2 lộ 3 hoặc lộ 7 đối phương",
      "Khống chế ô thoát của Tướng (bắt Tướng lên lầu)",
      "Có Xe hoặc Pháo yểm trợ phối hợp sát chiêu",
    ],
    quotes: [
      { text: "con mã Ngoạ Tào khi mà người ta nhảy chiếu thì tướng Thượng lên", at: "02:07" },
      { text: "kết hợp với xe pháo là có thể sắt chiêu", at: "02:53" },
    ],
    kind: "detectable",
    video: "cZPFcW_y0_U",
    tacticId: "ngoaTaoMa",
  },
  4: {
    lesson: 4,
    title: "Mã Xấu Nhất - Oa Tâm Mã",
    principle: "Oa Tâm Mã là vị trí xấu nhất của Mã: Mã thoái về hoa tim trung cung chèn kẹt đường đi của Tướng và cắt đứt liên lạc Song Sĩ, biến cung thành thế bế tắc dễ bị đối phương khóa chặt tạo đòn sát.",
    signals: [
      "Mã ở giữa cung (ô 76 của Đỏ hoặc ô 13 của Đen)",
      "Tướng mất ô di chuyển trung tâm",
      "Hai Sĩ bị chia cắt mất liên lạc",
    ],
    quotes: [
      { text: "mã cũng chặn lộ của tướng", at: "01:25" },
      { text: "do có Oa tâm Mã (窝心马), nên ngay cả khi đỏ muốn phòng thủ cũng không thể thoải mái", at: "02:26" },
    ],
    kind: "detectable",
    video: "vQWgmZHhrvM",
    tacticId: "oaTamMa",
  },
  5: {
    lesson: 5,
    title: "Hơn Quân Cần Giản Hóa",
    principle: "Khi đang hơn quân, mục tiêu then chốt là chủ động đổi quân để giản hóa cục diện. Dù đối phương có vị trí đẹp đến đâu, sau khi bị đổi quân thì ưu thế vị trí đó cũng tan biến, đưa ván cờ về thế tàn cuộc tất thắng.",
    signals: [
      "Bên đi đang hơn ưu thế vật chất (hơn quân nhẹ hoặc hơn Tốt sâu)",
      "Chủ động đề xuất đổi quân lớn (Xe/Pháo/Mã)",
      "Giảm bớt áp lực tấn công của đối phương",
    ],
    quotes: [
      { text: "đổi quân giản hóa sẽ có thể làm suy yếu lợi thế vị trí của đối phương rất nhiều", at: "09:01" },
      { text: "trong thế hơn quân, quan trọng nhất phải tìm kiếm giản hóa", at: "15:39" },
    ],
    kind: "evaluative",
    video: "uCcMcMlEF7k",
    tacticId: "chuyenHoaTanCuoc",
  },
  6: {
    lesson: 6,
    title: "Rút Đao Chém Nước Nước Không Chảy",
    principle: "Chiến thuật Chặn đường (Can thiệp / Cắt liên lạc): Chen quân vào tuyến giao liên của đối phương như nhát đao chém cắt dòng nước, làm tê liệt đường tiếp ứng, tước đoạt căn cứ của quân địch hoặc giải tỏa thế phong tỏa của phe mình.",
    signals: [
      "Quân chen vào giữa đường thẳng của Xe hoặc Pháo",
      "Làm mất căn của quân đối phương hoặc cắt đứt đường phối hợp công/thủ",
      "Giải phóng quân bị kiềm kẹp",
    ],
    quotes: [
      { text: "rút đaau chém nước nước không chảy trực tiếp chặn", at: "01:22" },
      { text: "thủ đoạn Giải Phong tỏa", at: "09:45" },
      { text: "rút đao chém nước khiến nước của đen không chảy được nữa", at: "22:13" },
    ],
    kind: "detectable",
    video: "34P8w1WNK1U",
    tacticId: "chanDuong",
  },
  7: {
    lesson: 7,
    title: "Đột Phá Đơn Điểm Trong Thế Trận Giằng Co",
    principle: "Trong thế trận giằng co đôi bên kìm giữ lẫn nhau không có nước đột phá trực diện, chiến thuật 'vô sự tiến tốt biên' (thúc Tốt biên khi nhàn rỗi) giúp mở rộng không gian, tạo thêm hướng uy hiếp và kiên nhẫn đợi đối phương tự phá vỡ thế quân bình.",
    signals: [
      "Thế cờ giằng co cân bằng, đôi bên chưa có đòn giao chiến trực diện",
      "Tốt biên (lộ 1 hoặc lộ 9) tiến lên mở đường hoặc qua sông",
      "Không có nước chiếu hay bắt quân gấp gáp",
    ],
    quotes: [
      { text: "Trong thế trận giàng co nhiều khi chính là vô sự tiến tốt biên", at: "03:28" },
      { text: "Trong thế giằng co thì vô sự tiến tốt biên, thực sự rất hiệu quả.", at: "18:38" },
      { text: "Ngay từ đầu chúng ta đã nói, vô sự tiến tốt biên, đỏ đầy tốt biên này", at: "19:12" },
    ],
    kind: "detectable",
    video: "a7P03VIBIIM",
    tacticId: "voSuTienTotBien",
  },
  8: {
    lesson: 8,
    title: "Binh Quý Thần Tốc",
    principle: "Trong cục diện đối công mỗi bên công phá một cánh, mấu chốt sinh tử là tốc độ ra đòn. Bên nào nhanh hơn một nước hoặc tung đòn 'giải sát hoàn sát' sẽ định đoạt ván cờ; từng nhịp đi, kể cả thí quân hay xuất tướng trợ chiến, đều phải tối ưu hóa từng nhịp sát.",
    signals: [
      "Đôi bên đối công gay gắt, mỗi bên uy hiếp một cánh",
      "Một bên bị dọa sát nhưng chủ động chiếu trước giành nước",
      "Đòn phản kích giải sát hoàn sát nhanh hơn đối phương một nhịp",
    ],
    quotes: [
      { text: "Dù sao khi hai bên đối công, chỉ xem ai có thể nhanh hơn một bước. Binh quý thần tốc", at: "06:30" },
      { text: "Binh quý thần tốc, mọi người đừng coi thường hai nước cờ", at: "26:47" },
    ],
    kind: "detectable",
    video: "rFsWmjfosfI",
    tacticId: "tranhNuoc",
  },
  9: {
    lesson: 9,
    title: "Máy Ủi Trung Lộ Chiến Thuật Nghiền Ép",
    principle: "Tướng ngự ở trung lộ nên tiến công trung lộ luôn là con đường ngắn nhất và đạt hiệu suất cao nhất. Phối hợp Pháo đầu, thúc Tốt giữa liên tục cùng Mã và Xe tạo thành mũi dùi trực diện húc thủng trung tâm phòng ngự đối phương như một máy ủi nghiền nát trận hình.",
    signals: [
      "Có Pháo đầu kiểm soát lộ 5",
      "Tốt giữa (Tốt 5) dâng cao xông thẳng vào trận địa đối phương",
      "Xe và Mã phối hợp húc vỡ tuyến phòng thủ trung tâm",
    ],
    quotes: [
      { text: "bước đầu ta đặt trùng pháo là trực tiếp nhắm vào mục tiêu cốt lõi. Đây là con đường tấn công tiện lợi nhất gọi là tối đa hóa hiệu suất tấn công.", at: "02:48" },
      { text: "hướng tấn công của đỏ là trung lộ, trực tiếp xuyên thùng", at: "12:52" },
      { text: "Chúng ta chủ yếu xem lực và sự to lớn của đòn tấn công ở trùng lộ", at: "15:45" },
    ],
    kind: "detectable",
    video: "6iA-ro90dus",
    tacticId: "mayUiTrungLo",
  },
  10: {
    lesson: 10,
    title: "Phế Quân Tấn Công Mạnh Trung Lộ",
    principle: "Cổ ngữ có câu 'Nhất Mã hoán Song Tượng, kỵ sĩ tất anh hùng'. Khi thế cờ đang cân bằng, chủ động phế một Mã đổi lấy đôi Tượng đối phương để xé toạc tấm khiên bảo vệ trung tâm, giải phóng trung lộ cho Pháo đầu và Song Xe thâm nhập đánh sập tuyến phòng thủ.",
    signals: [
      "Mã ăn Tượng đối phương (đặc biệt khi đối phương còn 2 tượng hoặc tượng trung tâm)",
      "Chủ động thí Mã để phá nát cặp Tượng bảo vệ cung Tướng",
      "Mở toang trung lộ cho Pháo đầu và Xe phối hợp công sát",
    ],
    quotes: [
      { text: "Cổ ngữ có câu nhất mã hoàn lưỡng tượng kỵ sĩ tất anh hùng.", at: "01:37" },
      { text: "Nhất Mã Hoàn Lưỡng Tượng, kỵ sĩ Tất Anh hùng.", at: "03:44" },
      { text: "nhất mã hoàn lưỡng tượng thật sự trong nhiều lúc là thủ pháp rất lợi hại.", at: "19:45" },
    ],
    kind: "detectable",
    video: "Pb8j35bP298",
    tacticId: "nhatMaHoanLuongTuong",
  },
  11: {
    lesson: 11,
    title: "Chiến Thuật Đoạt Trung Binh",
    principle: "Trung binh là trái tim của hệ thống phòng ngự. Đoạt trung binh không chỉ để phát động tấn công mãnh liệt trực diện ngay lập tức, mà còn là thủ pháp chiến lược tích lũy ưu thế vật chất từng bước và cô lập đôi Tượng, mở đường chuyển hóa thắng lợi về tàn cuộc.",
    signals: [
      "Ăn Tốt giữa (Tốt 5) của đối phương bằng Mã, Pháo hoặc Xe",
      "Làm mất quân bảo vệ mắt Tượng và trung tâm bàn cờ",
      "Tích lũy ưu thế quân lực kiểm soát trung lộ",
    ],
    quotes: [
      { text: "Chủ đề của chúng ta hôm nay có tên là Chiến thuật đoạt trung binh.", at: "02:47" },
      { text: "Một khi trung binh bị tiêu diệt, tuyến phòng thủ của đen sụp đổ", at: "12:07" },
      { text: "Chiến thuật đoạt trung binh nó là một thủ đoạn tấn công.", at: "22:38" },
    ],
    kind: "detectable",
    video: "DWGGNkDgyfY",
    tacticId: "doatTrungBinh",
  },
  12: {
    lesson: 12,
    title: "Khi Nào Mới Có Thể Thí Không Đầu Pháo",
    principle: "Không Tâm Pháo (Pháo trống) là thế công trực diện nguy hiểm bậc nhất trong cờ tướng. Tuy nhiên, bên bị pháo trống nếu đảm bảo trong thời gian ngắn có thể đánh đuổi Pháo hoặc khai thác điểm yếu của đối thủ thì có thể chủ động thí pháo trống để phản tiên.",
    signals: [
      "Pháo chiếm ngự lộ 5 chiếu hoặc ngắm thẳng mặt Tướng không có quân che chắn",
      "Không có Sĩ Tượng che chắn ở trung lộ",
      "Thế công Không Tâm Pháo trực diện hoặc bên thủ truy đuổi hóa giải",
    ],
    quotes: [
      { text: "chúng ta sẽ bàn về một kỳ lý mà tôi cho rằng là nổi tiếng nhất trong lý luận cờ tướng, đó chính là pháo trống. Thế cờ pháo trống còn có một tên gọi khác là không tâm pháo.", at: "00:06" },
      { text: "Một tiền đề rất quan trọng chính là bạn bắt buộc phải đảm bảo rằng trong một thời gian ngắn có thể đuổi được quân pháo trống này", at: "19:39" },
      { text: "phải nắm chắc được rằng trong một khoảng thời gian ngắn phải phát huy được quy luực của quân pháo trống đó.", at: "23:19" },
    ],
    kind: "detectable",
    video: "jfLmuyrvMrI",
    tacticId: "khongTamPhao",
  },
};
