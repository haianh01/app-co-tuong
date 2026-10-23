/**
 * 48 Bài Giảng Nguyên Lý Tàn Cuộc của Triệu Hâm Hâm (Zhao Xinxin)
 * Bộ ba sách "Tượng kỳ kỳ lý tam bộ khúc" (残局棋理48讲).
 *
 * Mọi trích dẫn (quote) đều được trích NGUYÊN VĂN từ phụ đề bài giảng
 * kèm mốc thời gian [MM:SS] và ID video YouTube tương ứng.
 */

export interface ZhaoEndgameQuote {
  text: string;
  at: string;
}

export interface ZhaoEndgameLessonCard {
  lesson: number;
  title: string;
  principle: string;
  signals: string[];
  quotes: ZhaoEndgameQuote[];
  kind: "detectable" | "evaluative" | "summary";
  video: string;
  tacticId: string;
}

export const ZHAO_ENDGAME_LESSONS: Record<number, ZhaoEndgameLessonCard> = {
  1: {
    lesson: 1,
    title: "Tại Sao Cần Học Tàn Cuộc",
    principle: "Tầm quan trọng của tàn cuộc: Nước đi cụ thể chỉ giải quyết một vấn đề, còn kỳ lý giải quyết hầu hết các vấn đề. Người chơi cờ kém chỉ nhìn thấy nước đi, còn người chơi cờ giỏi nhìn thấy nguyên lý. Tàn cuộc là đích đến định hướng cho toàn bộ chiến lược khai trung cuộc.",
    signals: [
      "Tính toán chuẩn xác từng bước trong tàn cuộc không có sai số",
      "Định hướng chiến lược từ trung cuộc chuyển hóa về tàn cuộc thắng",
      "Vận dụng nguyên lý tàn cuộc để giải quyết hình cờ thực chiến",
    ],
    quotes: [
      { text: "nhưng nước đi chỉ có thể giải quyết một vấn đề còn kỳ lý thì có thể giải quyết hầu hết", at: "01:20" },
      { text: "người chơi cờ kém chỉ nhìn thấy nước đi còn người chơi cờ giỏi thì nhìn thấy nguyên lý", at: "01:43" },
    ],
    kind: "evaluative",
    video: "-M048nOYU0I",
    tacticId: "taiSaoHocTanCuoc",
  },
  2: {
    lesson: 2,
    title: "Phân Loại Tàn Cục - 4 Loại Hình Tàn Cuộc Cơ Bản",
    principle: "Mối liên hệ giữa tàn cuộc thực dụng và tàn cuộc thực chiến: Không hiểu những định thức tàn cuộc thực dụng cơ bản nhất (thắng/hòa mẫu mực) thì chắc chắn không đánh tốt được tàn cuộc thực chiến. Phải biết rõ đích đến lợi hòa hay lợi thắng để chủ động chuyển đổi hình cờ.",
    signals: [
      "Chuyển đổi hình cờ thực chiến phức tạp về định thức tàn cuộc thực dụng",
      "Biết rõ thế cờ nào là lợi thắng, thế cờ nào là lợi hòa",
      "Chủ động đổi quân đưa ván đấu vào thế tàn cuộc sách giáo khoa",
    ],
    quotes: [
      { text: "Thậm chí có thể nói không hiểu những định thức tàn cuộc thực dụng cơ bản nhất thì chắc chắn cũng không đánh tốt được tàn cuộc thực chiến.", at: "00:26" },
      { text: "tàn cuộc thực dụng là thứ chúng ta bắt buộc phải học. Trong thực tế, mỗi kỳ thủ chuyên nghiệp chúng tôi hầu như ai cũng có một cuốn Toàn tập tàn cuộc thực dụng.", at: "01:27" },
    ],
    kind: "detectable",
    video: "s8wOya9HGVM",
    tacticId: "phanLoaiTanCuoc",
  },
  3: {
    lesson: 3,
    title: "Điểm Tới Hạn Của Binh Lực - Hơn 2 Chốt Có Chắc Thắng?",
    principle: "Điểm tới hạn của binh lực: Đơn quân mạnh (Xe/Mã/Pháo) thêm 2 Tốt là điểm tới hạn mong manh giữa thắng và hòa trước đối phương đủ Sĩ Tượng toàn. Bên công phải tập trung vượt qua điểm tới hạn hoặc phá vỡ cấu trúc phòng thủ của địch để giành thắng lợi tất thắng.",
    signals: [
      "Bên công sở hữu 2 Tốt qua sông áp sát trận địa địch",
      "Điểm tới hạn giữa thắng và hòa khi đối đầu Sĩ Tượng toàn",
      "Tập trung binh lực tạo đột phá vượt qua ngưỡng phòng thủ",
    ],
    quotes: [
      { text: "Vậy hai tốt chính là điểm tới hạn của binh lực. mà đã là điểm tới hạn, nó chắc chắn sẽ có ván thắng ván hòa.", at: "01:01" },
      { text: "Trường hợp thứ nhất là đơn cung mạnh, xe, pháo hoặc mã, thêm hai tốt thì không đủ để dành chiến thắng.", at: "01:24" },
    ],
    kind: "detectable",
    video: "HriX5ETJ52A",
    tacticId: "diemToiHanBinhLuc",
  },
  4: {
    lesson: 4,
    title: "Binh Và Tàn Sĩ Tượng - Tốt Phá Khuyết Sĩ Tượng",
    principle: "Binh tàn phá khuyết Sĩ Tượng: Sĩ Tượng toàn có thể đỡ hòa Mã Tốt, nhưng nếu khuyết Sĩ Tượng thì cơ bản không còn đường sống. Đơn khuyết Sĩ thì chỉ cần có Tốt qua sông là chắc chắn thắng cờ; Mã thoái lui khéo léo chuyển hướng kết hợp Tốt áp sát đoạt mạng.",
    signals: [
      "Đối phương khuyết Sĩ hoặc khuyết Tượng trong tàn cuộc",
      "Tốt thọc sâu khoét vào cánh khuyết Sĩ Tượng",
      "Mã phối hợp thoái lui đổi hướng ép chặt cung Tướng",
    ],
    quotes: [
      { text: "Tuy nhiên, nếu bên đen lúc này bị khuyết sĩ tượng thì cơ bản là không còn đường sống.", at: "00:47" },
      { text: "Trong tàn cuộc có một điểm thú vị, khác với khai cuộc và trung cuộc. Khai trung cuộc chúng ta thường nói là sẽ không cho Mã thoái lui đúng không?", at: "01:36" },
    ],
    kind: "detectable",
    video: "tepNEiE7FJU",
    tacticId: "binhTanSiTuong",
  },
  5: {
    lesson: 5,
    title: "Mưu Đoạt Chốt - Tàn Cuộc Có Xe",
    principle: "Tuyệt kỹ mưu Binh trong tàn cuộc có Xe: Uy lực của quân Xe là lớn nhất, quét Tốt là kỹ năng số một. Dùng Xe kiểm soát tuyến sông và tuyến tốt, vừa tiêu diệt Tốt địch sạch sẽ vừa ngăn cản triệt để không cho Tốt đối phương qua sông.",
    signals: [
      "Tàn cuộc có Xe hai bên",
      "Xe kiểm soát tuyến sông và quét sạch Tốt đối phương",
      "Ngăn chặn triệt để không cho Tốt địch vượt sông lập công",
    ],
    quotes: [
      { text: "Bởi vì có xe hay không có xe trong việc mưu binh này là hoàn toàn khác nhau.", at: "00:42" },
      { text: "Và quan trọng hơn nữa là làm sao không cho tốt đối phương qua sông, cái này cũng cần kỹ thuật tàn cuộc rất tinh tế.", at: "21:14" },
    ],
    kind: "detectable",
    video: "wBOQuix_tpc",
    tacticId: "muuBinhCoXe",
  },
  6: {
    lesson: 6,
    title: "Mưu Đoạt Chốt - Tàn Cuộc Không Có Xe",
    principle: "Mưu Binh trong cờ Mã Pháo không có Xe: Pháo quét Tốt nhanh hơn nhưng cần ngòi, Mã chậm hơn nhưng ổn định chắc chắn. Mưu Binh trong cờ Mã Pháo là đại sự hàng đầu quyết định kết quả thắng hòa của ván đấu tàn cuộc.",
    signals: [
      "Tàn cuộc không có Xe (Mã Pháo, Tốt đối kháng)",
      "Vận dụng Pháo từ xa bắn phá hoặc Mã cơ động diệt Tốt đối phương",
      "Bảo vệ Tốt phe mình và triệt hạ Tốt đối phương để chiếm ưu thế vật chất",
    ],
    quotes: [
      { text: "Quy luực của quân xe là rất lớn. Quét tốt là kỹ năng hàng đầu của nó.", at: "00:04" },
      { text: "Nhưng các bạn trước tiên phải xây dựng khái niệm mưu binh trong cờ mã pháo có thể là đại sự hàng đầu, tuyệt đối đừng đánh giá thấp tầm quan trọng của nó.", at: "13:15" },
    ],
    kind: "detectable",
    video: "XXpTFNBdJrM",
    tacticId: "muuBinhKhongXe",
  },
  7: {
    lesson: 7,
    title: "Tuyệt Kỹ Phá Sĩ Tượng - Tàn Cuộc Có Xe",
    principle: "Phá Sĩ Tượng trong tàn cuộc có Xe: Nếu đối phương Sĩ Tượng toàn thì khó lòng thắng, nhưng khi đối phương đơn khuyết Tượng hoặc vị trí Tướng lệch lộ thì Xe Mã / Xe Tốt phối hợp dùng nước chờ và công sát cánh khuyết để giành thắng lợi tất thắng.",
    signals: [
      "Tàn cuộc có Xe hai bên",
      "Đối phương khuyết Sĩ hoặc khuyết Tượng",
      "Xe phối hợp Mã hoặc Tốt khoét sâu sườn khuyết",
    ],
    quotes: [
      { text: "nếu bên đen sĩ tượng toàn thì cơ bản chúng ta không cần nuôi bất kỳ hy vọng", at: "00:28" },
      { text: "thủ vị trí không chuẩn thì vẫn dễ lộ ra cơ hội", at: "01:14" },
    ],
    kind: "detectable",
    video: "hFaP9upTB-w",
    tacticId: "phaSiTuongCoXe",
  },
  8: {
    lesson: 8,
    title: "Tuyệt Kỹ Phá Sĩ Tượng - Tàn Cuộc Không Có Xe",
    principle: "Phá Sĩ Tượng trong cờ tàn không Xe: Song Tốt hoặc Pháo Song Tốt vần phá Sĩ Tượng bằng kỹ thuật đợi nước và kiềm chế; buộc đối phương phải phi Tượng hở sườn rồi thúc Tốt phong tỏa vây chết toàn bộ quân phòng thủ.",
    signals: [
      "Tàn cuộc không có Xe (Song Tốt, Pháo Tốt)",
      "Đối phương bị kiềm chế Sĩ Tượng",
      "Đi nước chờ hoặc tiến Tốt khóa chặt đường di chuyển",
    ],
    quotes: [
      { text: "Bình thường thì song tốt chắc chắn không thể thắng đôi sĩ tượng", at: "00:25" },
      { text: "Đầu tiên bên đỏ cần đi nước chờ một nhịp.", at: "00:50" },
    ],
    kind: "detectable",
    video: "1wpanrf2XUc",
    tacticId: "phaSiTuongKhongXe",
  },
  9: {
    lesson: 9,
    title: "Nguyên Tắc Chiếm Trung - Chìa Khóa Sống Còn Trong Cờ Tàn",
    principle: "Nguyên tắc chiếm trung trong cờ tàn: Ở tàn cuộc, các đường biên giảm bớt giá trị nhưng trung lộ mãi mãi là trục sinh tử quan trọng nhất. Không biết chiếm giữ trung lộ thì gần như không thể thắng cờ; chiếm trung khóa chặt Tướng địch là chìa khóa mở ra sát cục.",
    signals: [
      "Quân lớn hoặc Tốt chiếm giữ lộ 5 trung tâm trong tàn cuộc",
      "Khóa chặt Tướng đối phương ở trung lộ hoặc trục dọc",
      "Kiểm soát trung tâm phục vụ các sát pháp tàn cuộc",
    ],
    quotes: [
      { text: "Vì vậy, trung lộ mãi mãi là đường quan trọng nhất.", at: "01:26" },
      { text: "Nếu chúng ta không biết cách chiếm giữ Trung Lộ gần như đồng nghĩa với việc không thể thắng cờ", at: "01:26" },
    ],
    kind: "detectable",
    video: "w-0PzwsDpEM",
    tacticId: "nguyenTacChiemTrung",
  },
  10: {
    lesson: 10,
    title: "Lộ Sườn Và Tuyến Sinh Mệnh - Tuyến Áp Đáy",
    principle: "Chiến thuật Tả Tốt Hữu Tướng và Tuyến áp đáy: Tốt và Tướng chia nhau trấn giữ hai lộ sườn 4 và 6, khống chế tuyến áp đáy thứ hai khiến Tướng địch bị khóa chặt không thể di chuyển lên xuống hay sang ngang, buộc đối phương tự phá vỡ phòng thủ.",
    signals: [
      "Tả Tốt hữu Tướng trấn giữ lộ 4 và 6",
      "Khống chế tuyến áp đáy thứ hai của đối phương",
      "Khóa chặt Tướng địch trong cửu cung",
    ],
    quotes: [
      { text: "đó gọi là tả tốt hữu tướng.", at: "00:04" },
      { text: "Trong tàn cuộc, ngoại trừ trung lộ, vốn dĩ là quan trọng nhất không cần bàn cãi", at: "01:23" },
    ],
    kind: "detectable",
    video: "HVun2kG58LE",
    tacticId: "loSuonApDay",
  },
  11: {
    lesson: 11,
    title: "Mã Hoạt Đem Lại Chiến Thắng - Mã Ngọa Tào Và Điểm Huyệt",
    principle: "Mã hoạt trong cờ tàn: Con Mã là chủ lực tuyệt đối trong tàn cuộc, Mã sống tham gia chiến đấu là chìa khóa định đoạt ván cờ. Mã ở vị trí linh hoạt nhảy vào các điểm huyệt hoặc Ngọa Tào tạo sức ép liên hoàn làm tê liệt phòng thủ đối phương.",
    signals: [
      "Mã cơ động chiếm điểm huyệt hoặc Ngọa Tào trong tàn cuộc",
      "Mã sống mở rộng tối đa tầm kiểm soát và không bị vây bắt",
      "Mã phối hợp Tướng và Tốt tạo đòn công sát chí mạng",
    ],
    quotes: [
      { text: "Thực tế là tàn cuộc càng phải nhấn mạnh đến việc mã sống.", at: "02:54" },
      { text: "nếu như nó nhảy đến Ngọa Tào Mã, các bạn nghĩ xem đây là trí mạng rồi đúng không?", at: "01:31" },
    ],
    kind: "detectable",
    video: "tQkFXamj6s4",
    tacticId: "maHoatChienThang",
  },
  12: {
    lesson: 12,
    title: "Bảng Xếp Hạng Phối Hợp Binh Chủng Mạnh Nhất Trong Cờ Tàn",
    principle: "Xếp hạng binh chủng cờ tàn: Mã Pháo phối hợp là tổ hợp trang bị mạnh nhất trong cờ tàn, linh hoạt hơn Song Mã và biến hóa hơn Song Pháo. Tận dụng tối đa sự bổ trợ giữa tính cơ động của Mã và uy lực tầm xa của Pháo để kiểm soát cục diện.",
    signals: [
      "Mã Pháo phối hợp hiệp đồng tác chiến trong tàn cuộc",
      "Pháo làm ngòi từ xa phối hợp Mã điểm huyệt áp sát",
      "Ưu tiên chuyển đổi hình cờ về tổ hợp Mã Pháo mạnh nhất",
    ],
    quotes: [
      { text: "ở giai đoạn tàn cuộc, việc trang bị mã pháo cũng nhất định là tốt nhất.", at: "01:07" },
      { text: "Bởi vì vị trí mã không tốt, không những không phát huy được sức chiến đấu của nó", at: "00:28" },
    ],
    kind: "detectable",
    video: "20HzC6oMzNw",
    tacticId: "bangXepHangBinhChung",
  },
  13: {
    lesson: 13,
    title: "Binh Chủng Hữu Lợi - Tại Sao Mã Pháo Mạnh Hơn Song Pháo",
    principle: "Nguyên tắc binh chủng hữu lợi: Ở tàn cuộc, việc trang bị tổ hợp Mã Pháo là tối ưu nhất vì vừa có khả năng kiềm chế tầm xa của Pháo vừa có sức đột kích cận chiến của Mã. Khi đối đầu với Song Pháo hoặc Song Mã, chủ động đưa về hình thế binh chủng hữu lợi để chiếm ưu thế thắng cuộc.",
    signals: [
      "Tàn cuộc Mã Pháo đối Song Pháo hoặc Song Mã",
      "Chủ động đổi quân đưa về tổ hợp binh chủng hữu lợi",
      "Phát huy tính bù trừ hoàn hảo giữa Mã và Pháo",
    ],
    quotes: [
      { text: "Biết rằng phối hợp mã pháo là tối ưu nhất", at: "00:05" },
      { text: "chính là nguyên tắc binh chủng hữu lợi", at: "01:13" },
    ],
    kind: "detectable",
    video: "Mt7cOJyVw6w",
    tacticId: "binhChungHuuLoi",
  },
  14: {
    lesson: 14,
    title: "Bí Quyết Chọn Thời Điểm Tấn Tốt - Binh Quý Thần Tốc",
    principle: "Binh quý thần tốc và bí quyết chọn thời điểm tấn Tốt: Tốt từ trên cao xung xuống dưới cần chọn đúng thời cơ; Tốt cao là Tốt có sức, nếu xung quá nhanh thành Tốt thấp thì mất sức công kích. Chỉ xung Tốt khi đã có quân lớn yểm trợ áp sát hoặc tạo thế sát cục không thể chống đỡ.",
    signals: [
      "Cân nhắc giữa giữ Tốt cao hay thúc Tốt xuống sâu",
      "Chọn thời điểm chính xác khi Tốt có sự hỗ trợ của quân lớn",
      "Tránh thúc Tốt vội vàng biến thành Tốt thấp mất ưu thế",
    ],
    quotes: [
      { text: "Bài này chúng ta sẽ cùng thảo luận về binh quý thần tốc.", at: "00:04" },
      { text: "con tốt từ trên cao xung xuống dưới thì nên xung nhanh hay xung chậm?", at: "01:05" },
    ],
    kind: "detectable",
    video: "ko40Hq7h9v4",
    tacticId: "binhQuyThanToc",
  },
  15: {
    lesson: 15,
    title: "Tuyệt Kỹ Dùng Sĩ Tượng Phong Ấn Song Mã",
    principle: "Tuyệt kỹ dùng Sĩ Tượng phòng ngự và phong ấn: Sĩ Tượng không chỉ là quân phòng thủ đơn thuần mà trong nhiều tàn cuộc còn dùng để phong ấn đường đi của Mã đối phương, hoặc làm ngòi cho Pháo và tạo thế che chắn cho Xe Tốt công sát.",
    signals: [
      "Sĩ Tượng cản chân Mã hoặc phong ấn quân cơ động của địch",
      "Dùng Tượng làm ngòi hoặc điều chỉnh Sĩ Tượng hỗ trợ công thủ",
      "Biến thủ thành công nhờ sự liên hoàn của Sĩ Tượng",
    ],
    quotes: [
      { text: "Chúng ta đều biết sĩ tượng là các quân phòng thủ.", at: "00:05" },
      { text: "Tôi cho rằng đây là ví dụ kinh điển về việc bên tấn công dùng tượng.", at: "00:27" },
    ],
    kind: "detectable",
    video: "P43P3lsCS-U",
    tacticId: "siTuongPhongAn",
  },
  16: {
    lesson: 16,
    title: "Giữ Vị Trí Tướng Linh Hoạt Trong Cờ Tàn",
    principle: "Giữ vị trí Tướng linh hoạt trong tàn cuộc: Thượng Tướng (lên lầu hai) là động tác chuẩn bị chiến lược kinh điển của bên công trong tàn cuộc; Tướng lên cao mở rộng đường ra, hỗ trợ quân tiến công và tránh bị kiềm chế ở hàng đáy.",
    signals: [
      "Tướng thượng lầu hai mở rộng đường ra trong tàn cuộc",
      "Không vội thúc Tốt mà ưu tiên điều chỉnh vị trí Tướng tối ưu",
      "Tướng trợ công linh hoạt làm tê liệt phản kháng của địch",
    ],
    quotes: [
      { text: "Bài học này chúng ta sẽ nói về phương pháp sử dụng tướng trong tàn cuộc.", at: "00:04" },
      { text: "nước thượng tướng này cơ bản là động tác tiêu chuẩn", at: "00:46" },
    ],
    kind: "detectable",
    video: "Ko55ZmZPuVI",
    tacticId: "tuongLinhHoat",
  },
  17: {
    lesson: 17,
    title: "Chốt Lụt Vĩnh Viễn Không Chết - Lão Binh",
    principle: "Giá trị của Lão Binh (Tốt đáy): Tuy Tốt đáy bị xem là mất sức nhất, nhưng trong phối hợp chiến thuật, Tốt đáy khống chế tuyến đáy cửu cung, khóa chân Tướng và Sĩ đối phương, là chìa khóa then chốt tạo nên các đòn sát pháp ngoạn mục.",
    signals: [
      "Tốt ở hàng đáy phối hợp cùng quân lớn khóa chặt cửu cung",
      "Khống chế tuyến đáy không cho Tướng hoặc Sĩ địch xoay sở",
      "Khai thác tối đa sức ép của Lão Binh thay vì xem thường",
    ],
    quotes: [
      { text: "Khi binh chủng tốt tiến xuống tận đấy, chúng ta gọi đó là lão binh, tốt đáy hay tốt lục.", at: "00:04" },
      { text: "tốt đáy ít nhất có tác dụng khống chế tuyến đáy của đối phương", at: "01:31" },
    ],
    kind: "detectable",
    video: "RoGgqcs7Tho",
    tacticId: "laoBinhKhongChet",
  },
  18: {
    lesson: 18,
    title: "Khuyết Sĩ Kỵ Gì - Khuyết Sĩ Kỵ Song Xe Song Pháo",
    principle: "Khuyết Sĩ kỵ Song Xe, Pháo và Xe Tốt: Khi đối phương khuyết Sĩ, uy lực của Xe Tốt và Pháo gia tăng đột biến; Tốt qua sông áp sát cung đóng vai trò như một cỗ Xe thứ hai khoét sâu vào điểm yếu mất Sĩ.",
    signals: [
      "Đối phương khuyết Sĩ trong tàn cuộc",
      "Xe Tốt hoặc Pháo khoét sâu vào bên khuyết Sĩ",
      "Tốt qua sông phối hợp như một đại Xe tạo đòn sát cục",
    ],
    quotes: [
      { text: "Khuyết sĩ kỵ song xe, đúng không?", at: "00:22" },
      { text: "Tiểu tốt quá hà đính đại xe.", at: "00:56" },
    ],
    kind: "detectable",
    video: "DaPsULPGIuU",
    tacticId: "khuyetSiKyGi",
  },
  19: {
    lesson: 19,
    title: "Khuyết Tượng Sợ Pháo - Tuyệt Kỹ Môn Cung Sát Cục Đỉnh Cao",
    principle: "Khuyết Tượng sợ Pháo: Trong tàn cuộc, bên phòng thủ khuyết Tượng thì tuyến sườn và hàng đáy trở nên cực kỳ mong manh trước uy lực của Pháo đối phương; Pháo dễ dàng phối hợp cùng Tướng, Xe ép vào thế Môn Cung sát cục hoặc phong tỏa toàn diện.",
    signals: [
      "Bên phòng thủ khuyết Tượng hoặc gãy Tượng trong tàn cuộc",
      "Pháo đối phương tấn công lộ sườn hoặc hàng đáy không có Tượng che chắn",
      "Tạo thế ép Môn Cung sát cục hoặc ghim bắt quân",
    ],
    quotes: [
      { text: "tượng linh hoạt hơn sĩ rất nhiều", at: "02:26" },
      { text: "khi cờ tàn khuyết tượng còn sợ pháo kinh khủng hơn nữa.", at: "03:10" },
    ],
    kind: "detectable",
    video: "jUUsLOiP1uA",
    tacticId: "khuyetTuongKyPhao",
  },
  20: {
    lesson: 20,
    title: "Cờ Tàn Pháo Hoàn - Nguyên Tắc Sống Còn Của Quân Pháo",
    principle: "Cờ tàn Pháo hoàn: Khi bước vào tàn cuộc lực lượng giảm bớt, Pháo ở tuyến trên thiếu ngòi nổ sẽ cô đơn và mất tác dụng; Pháo cần kịp thời quy gia thoái về trận địa nhà, mượn Sĩ Tượng phe mình làm ngòi để công thủ toàn diện.",
    signals: [
      "Pháo thoái lui về trận địa nhà mượn Sĩ Tượng làm ngòi nổ",
      "Chuyển Pháo về thế trận công thủ toàn diện trong cờ tàn",
      "Tránh để Pháo cô lập ở tuyến trên không có quân phối hợp",
    ],
    quotes: [
      { text: "Lúc này pháo tự nhiên cần phải quay về nhà, mượn sĩ tượng của phe mình làm ngòi", at: "01:23" },
      { text: "Nếu pháo ở nhà, nó sẽ công thủ toàn diện", at: "02:00" },
    ],
    kind: "detectable",
    video: "Q6jMjsM3HRQ",
    tacticId: "coTanPhaoHoan",
  },
  21: {
    lesson: 21,
    title: "Dọn Tốt Khống Chế Tuyến - Thủ Pháp Phòng Thủ Đỉnh Cao",
    principle: "Dọn Tốt khống chế tuyến: Trong tàn cuộc, Xe kiểm soát các lộ và bám chặt tuyến tuần hà hoặc tuyến chốt để ngăn chặn không cho Tốt đối phương vượt sông, hoặc tiêu diệt các Tốt qua sông để vô hiệu hóa sức công của đối thủ.",
    signals: [
      "Xe thoái giữ tuyến tuần hà phong tỏa không cho Tốt địch qua sông",
      "Tiêu diệt Tốt quá hà của địch để giải tỏa mối đe dọa",
      "Kiểm soát tuyến lộ huyết mạch làm tê liệt khả năng đột phá của đối phương",
    ],
    quotes: [
      { text: "Xe năm thoái ba bám chặt lấy tuyến tuần hà này.", at: "01:11" },
      { text: "dàng để tốt đối phương qua sông thì gần như có thể coi là chưa hiểu về tàn cuộc.", at: "02:50" },
    ],
    kind: "detectable",
    video: "amVASIEKTlg",
    tacticId: "donTotKhongCheTuyen",
  },
  22: {
    lesson: 22,
    title: "Mã vs Pháo Trong Tàn Cuộc - Sức Mạnh Định Vị Và Kiểm Soát Không Gian",
    principle: "Mã vs Pháo trong tàn cuộc: Mã kiểm soát khu vực hình tròn và có năng lực định vị, tạo hình vượt trội khi tàn cuộc ít quân; Pháo cần ngòi nổ còn Mã thì độc lập tác chiến khống chế các điểm huyệt như Ngọa Tào, Điếu Ngư, Quải Giác.",
    signals: [
      "Mã chiếm lĩnh các điểm huyệt trọng yếu (ngọa tào, quải giác, điếu ngư) trong tàn cuộc",
      "Mã phát huy khả năng định vị và kiểm soát không gian khu vực",
      "Phối hợp Mã với Xe hoặc Tốt khóa chặt đường di chuyển của đối phương",
    ],
    quotes: [
      { text: "mã là bát diện uy phong, nên phạm vi khống chế của nó là một vòng tròn.", at: "12:41" },
      { text: "tác dụng của mã là khống trường, định vị, tạo hình.", at: "14:38" },
    ],
    kind: "detectable",
    video: "jM43iVKLiP8",
    tacticId: "maThangPhao",
  },
  23: {
    lesson: 23,
    title: "Chiến Thuật Cờ Tàn Chủ Yếu - Phép Kiềm Chế Khóa Chặt Đối Thủ",
    principle: "Phép kiềm chế trong cờ tàn: Dùng quân cơ động (Xe, Pháo) ghim chặt các quân chủ lực của đối thủ vào các vị trí bất động hoặc cản trở lẫn nhau, khiến đối phương tê liệt hoàn toàn không thể di chuyển mà không mất quân.",
    signals: [
      "Xe hoặc Pháo ghim chặt quân chủ lực (Xe, Mã, Pháo) của đối thủ",
      "Đối phương bị tê liệt không thể di chuyển quân bị kiềm chế",
      "Tạo thế bắt đôi hoặc dọa sát trong khi đối phương bị khóa cứng",
    ],
    quotes: [
      { text: "Đây chính là chiến thuật kìm chế một ứng dụng kinh điển trong tàn cuộc", at: "02:51" },
      { text: "Chiến thuật kìm chế theo tôi là một trong những chiến thuật quan trọng nhất của tàn cuộc", at: "12:40" },
    ],
    kind: "detectable",
    video: "eIo0wo1GCGc",
    tacticId: "chienThuatKiemChe",
  },
  24: {
    lesson: 24,
    title: "Chiến Thuật Cờ Tàn Chủ Yếu - Nước Chờ Đợi Thời Cơ",
    principle: "Chiến thuật Nước Chờ (Đãi trước): Thủ đoạn giành chiến thắng chủ lực trong cờ tàn; khi đã vây khốn hoặc khống chế đối phương, đi một nước chờ tinh tế ép đối phương phải tự đi và làm tan vỡ đội hình phòng thủ ('cho bạn đi, ép bạn đi, làm bạn thấy đi còn không bằng không đi').",
    signals: [
      "Đi nước cờ chờ (nhích Tướng, lách Sĩ/Tượng, thoái Xe nhẹ) trong thế đã khống chế",
      "Ép đối phương rơi vào thế cạn nước đi (zugzwang) tự phá vỡ hàng phòng thủ",
      "Đỉnh cao của nước chờ: nhường quyền đi cho đối phương tự mắc sai lầm",
    ],
    quotes: [
      { text: "Nó gần như là thủ đoạn giành chiến thắng chủ lực.", at: "01:15" },
      { text: "Đó chính là cảnh giới cao nhất của nước chờ.", at: "08:32" },
    ],
    kind: "detectable",
    video: "yX31jXr2Tuo",
    tacticId: "chienThuatNuocCho",
  },
  25: {
    lesson: 25,
    title: "Chiến Thuật Cờ Tàn Chủ Yếu - Vây Khốn Bắt Chết Quân Lớn",
    principle: "Chiến thuật Vây Khốn: Trong tàn cuộc, bao vây và bắt chết quân lớn (Xe, Mã) là vũ khí cực kỳ sắc bén; Mã là quân có chân nên dễ bị cản chân và cắt đường tháo chạy nhất; khi vây bắt được quân lớn thì thế cờ chuyển thành tất thắng.",
    signals: [
      "Cản chân Mã hoặc cắt đứt đường tháo chạy của quân lớn địch",
      "Tập trung binh lực khép góc bao vây không cho quân địch thoát ra",
      "Vây bắt quân chủ lực đối phương trong tàn cuộc",
    ],
    quotes: [
      { text: "Chiến thuật vây khốn trong giai đoạn trung cuộc là một thủ pháp rất điển hình", at: "00:05" },
      { text: "do đặc tính di chuyển của nó quyết định, bởi vì mã có chân, chỉ cần bị cản chân là con mã này khó mà di chuyển.", at: "02:10" },
    ],
    kind: "detectable",
    video: "WoAbngtSdTM",
    tacticId: "chienThuatVayKhon",
  },
  26: {
    lesson: 26,
    title: "Kỹ Thuật Đốn Tỏa - Nghệ Thuật Điều Quân Khiến Đối Thủ Tắt Thở",
    principle: "Kỹ thuật Đốn Tỏa (ngắt nhịp, chuyển vị): Dùng nước chiếu trung gian hoặc đe dọa bắt quân để giành nước tiên, ép Tướng hoặc quân đối phương phải di chuyển vào vị trí xấu hoặc có lợi cho ta, sau đó mới tung đòn quyết định bắt chết quân hoặc tạo sát cục.",
    signals: [
      "Chiếu tướng hoặc dọa bắt quân tranh tiên điều chỉnh vị trí đối thủ",
      "Ép Tướng hoặc quân địch rơi vào vị trí bất lợi trước khi ra đòn chính",
      "Ngắt nhịp đốn tỏa chuyển vị khai thác triệt để sơ hở của địch",
    ],
    quotes: [
      { text: "Chính là thông qua việc chiếu tướng, bắt quân để giành nước tiên, buộc đối phương phải điều chỉnh vị trí thành những vị trí có lợi cho chúng ta.", at: "01:34" },
      { text: "Đó chính là sức mạnh của đốn tỏa.", at: "01:51" },
    ],
    kind: "detectable",
    video: "b7SZnVTtLkM",
    tacticId: "kyThuatDonToa",
  },
  27: {
    lesson: 27,
    title: "Kỹ Thuật Đánh Chặn - Tầm Quan Trọng Của Tư Duy Đại Cục",
    principle: "Kỹ thuật Đánh Chặn (chắn tuyến, cản trở): Dùng Pháo (Pháo gánh/Đạn tử pháo), Mã hoặc Xe chắn ngang các tuyến đường trọng yếu, ngăn chặn không cho Xe hoặc Pháo đối phương cắm đáy hoặc tràn sang cánh công kích; lấy phòng thủ chủ động bẻ gãy đòn phối hợp của đối phương từ xa.",
    signals: [
      "Pháo hoặc quân cơ động chắn ngang đường cắm đáy của Xe Pháo địch",
      "Dùng thế Pháo gánh hoặc đạn tử pháo phong tỏa các lộ trọng yếu",
      "Đánh chặn từ xa bẻ gãy ý đồ tập trung hỏa lực của đối phương",
    ],
    quotes: [
      { text: "Nói đến đánh chặn, chiến thuật mà chúng ta dễ nghĩ tới nhất đương nhiên vẫn là đạn tử pháo, pháo gánh.", at: "00:05" },
      { text: "chiến thuật đánh chặn không chỉ dùng riêng cho phòng ngự", at: "01:36" },
    ],
    kind: "detectable",
    video: "PRy4jSbJRPo",
    tacticId: "kyThuatDanhChan",
  },
  28: {
    lesson: 28,
    title: "Chiến Thuật Cầu Hòa - Bài Học Xương Máu Về Sự Khắc Nghiệt Của Cờ Tàn",
    principle: "Chiến thuật Cầu Hòa: Khi ở thế yếu hoặc kém quân, bên phòng thủ phải khéo léo tìm đường sống trong chỗ chết; đổi bớt quân chủ lực hoặc tiêu diệt Tốt đối phương để quy về các hình cờ tàn thực dụng thủ hòa chuẩn mực (như Đơn Xe hòa Mã Tốt / Pháo Tốt, Xe Khuyết Sĩ hòa Xe Tốt).",
    signals: [
      "Bên kém quân đổi quân khéo léo để đưa về tàn cuộc hòa chuẩn mực",
      "Tiêu diệt Tốt biên hoặc chốt sát thương của địch để bảo đảm cửa hòa",
      "Nghệ thuật thủ hòa cứu vãn ván cờ tưởng chừng đã thua",
    ],
    quotes: [
      { text: "Trong tình huống binh lực bất lợi, việc lợi dụng những kỹ xảo cầu hòa khéo léo để giành được kết quả hòa, tránh việc bị thua cờ", at: "00:39" },
      { text: "Đây là một hình cờ hòa rất chuẩn mực. Điểm này các bạn cần lưu ý nhé.", at: "02:49" },
    ],
    kind: "detectable",
    video: "RbhN1vumxek",
    tacticId: "chienThuatCauHoa",
  },
  29: {
    lesson: 29,
    title: "Chiến Thuật Sấm Sét - Lấy Nhanh Đánh Chậm Sát Cục Bất Ngờ",
    principle: "Chiến thuật Sấm Sét (thiểm kích, đánh nhanh thắng nhanh): Bỏ qua việc so đo binh lực vụn vặt; khi phát hiện quân chủ lực địch phân tán xa hoặc không kịp lui về cứu viện, dốc toàn lực đột kích cục bộ thần tốc (phế Tốt, lao Ngọa Tào Mã, chiếu dồn dập) lấy nhanh đánh chậm sát cục bất ngờ.",
    signals: [
      "Đột kích cục bộ chớp nhoáng bỏ qua việc bảo toàn binh lực",
      "Khai thác sự phân tán chậm chạp của quân chủ lực đối phương",
      "Tạo sát cục bất ngờ chớp nhoáng trước khi đối thủ kịp lui về phòng thủ",
    ],
    quotes: [
      { text: "gọi là chiến thuật sấm sét, đánh nhanh thắng nhanh.", at: "00:05" },
      { text: "bất kể quân số hiện tại ra sao, chỉ cần tôi tạo được đột phá ở cục bộ", at: "00:22" },
    ],
    kind: "detectable",
    video: "akTcbzh1MaM",
    tacticId: "chienThuatSamSet",
  },
  30: {
    lesson: 30,
    title: "Tuyệt Đỉnh Tàn Cuộc Xe Pháo - Xe Pháo Hợp Công Sát Cục",
    principle: "Tuyệt đỉnh tàn cuộc Xe Pháo: Trong giai đoạn chuyển tiếp tàn cuộc, Xe Pháo là tổ hợp công kích cực kỳ sắc bén; Xe khống chế tuyến lộ và dồn ép, còn Pháo mượn Sĩ Tượng hoặc Tướng làm ngòi nổ tạo ra các thế sát như Thiết Môn Thuyên, Trùng Pháo hoặc ép Tướng vào chân tường.",
    signals: [
      "Xe Pháo cùng dồn hỏa lực công kích cửu cung",
      "Pháo mượn quân hoặc Sĩ Tượng làm ngòi nổ hiểm hóc phối hợp cùng Xe",
      "Xe Pháo kết hợp tạo đòn sát cục hoặc bắt chết quân phòng thủ",
    ],
    quotes: [
      { text: "mở ra đòn xe pháo thiểm kích kết liễu cao thủ Trình Minh", at: "00:04" },
      { text: "đúng lúc đỏ cần phát huy năng lực thì tung ngay đòn thiểm kích pháo 4 bình 9, trực tiếp vỗ mặt trầm để pháo", at: "24:16" },
    ],
    kind: "detectable",
    video: "DvaUWgJFvJk",
    tacticId: "xePhaoHopCong",
  },
  31: {
    lesson: 31,
    title: "Xe Mã Lãnh Chiêu - Từ Cổ Phổ Đến Thực Chiến Đỉnh Cao",
    principle: "Xe Mã Lãnh Chiêu (đòn nguội hiểm hóc): Xe Mã phối hợp tác chiến với uy lực sát phạt cực lớn và biến hóa khôn lường; Xe Mã tung các đòn đánh độc hiểm bất ngờ (như chém Sĩ/Tượng dọn đường, Mã nhảy Điếu Ngư, Ngọa Tào, Lục Mạch Thần Kiếm) kết liễu đối thủ trước khi đối phương kịp trở tay.",
    signals: [
      "Xe Mã phối hợp tấn công chém Sĩ/Tượng hoặc dọa sát bất ngờ",
      "Mã chiếm các điểm huyệt trọng yếu (Điếu Ngư, Ngọa Tào) kết hợp Xe đâm đáy",
      "Đòn nguội hiểm hóc kết liễu đối thủ trong tàn cuộc Xe Mã",
    ],
    quotes: [
      { text: "Đó chính là xe mã lãnh chiêu, đòn nguội", at: "00:06" },
      { text: "chiến thuật xe mã lãnh chiêu và cuối cùng giành được thắng lợi.", at: "01:31" },
    ],
    kind: "detectable",
    video: "ViC0z9if74M",
    tacticId: "xeMaLanhChieu",
  },
  32: {
    lesson: 32,
    title: "Kỹ Thuật Xe Chốt Phá Sĩ Tượng - Đòn Diệu Thủ Của Hồ Vinh Hoa",
    principle: "Kỹ thuật Xe Chốt phá Sĩ Tượng: Xe Tốt phối hợp mưu đoạt hoặc dùng đòn diệu thủ phế quân phá tan hàng phòng thủ Sĩ Tượng của đối phương; Tốt áp sát cửu cung hỗ trợ Xe đâm đáy hoặc cắt đứt liên hoàn Sĩ Tượng.",
    signals: [
      "Xe Tốt phối hợp phá vỡ hệ thống Sĩ Tượng đối phương",
      "Thí quân tranh tiên mưu đoạt Sĩ Tượng trong tàn cuộc",
      "Tốt áp sát cung tạo thế liên hoàn trợ công cho Xe đoạt sát",
    ],
    quotes: [
      { text: "thứ hai là chủ động thí quân. Việc này cũng khá thường gặp.", at: "01:46" },
      { text: "trong thực chiến có những thủ đoạn nào kinh điển để mưu đoạt sĩ tượng.", at: "02:43" },
    ],
    kind: "detectable",
    video: "dx9Kmpo_yho",
    tacticId: "xeChotPhaSiTuong",
  },
  33: {
    lesson: 33,
    title: "Tàn Cuộc Song Mã Song Pháo - Đại Binh Đoàn Tác Chiến",
    principle: "Tàn cuộc Song Mã Song Pháo (đại binh đoàn không Xe): Nhịp độ tấn công chậm hơn tàn cuộc có Xe nhưng tính chiến lược cực cao; thiếu Tốt là yếu tố then chốt ('thiếu một con tốt thôi, bạn cũng sẽ thấy cực kỳ áp lực'); sự phối hợp giữa đôi Mã và đôi Pháo phải có ngòi và phong tỏa cánh.",
    signals: [
      "Tàn cuộc đại binh đoàn Song Mã Song Pháo không có Xe",
      "Bảo toàn và tranh đoạt từng con Tốt then chốt",
      "Điều động Mã Pháo tạo ngòi và phong tỏa cánh đối phương",
    ],
    quotes: [
      { text: "chúng ta sẽ bước vào giai đoạn mà có lẽ đa số kỳ hữu quan tâm nhất, đó chính là tàn cuộc mã pháo", at: "00:04" },
      { text: "Cho nên khi vào tàn mã pháo mà thiếu tốt, dù chỉ thiếu một con tốt thôi, bạn cũng sẽ thấy cực kỳ áp lực.", at: "01:06" },
    ],
    kind: "detectable",
    video: "zCWkJ5v8aTw",
    tacticId: "songMaSongPhao",
  },
  34: {
    lesson: 34,
    title: "Tàn Cuộc Song Mã Pháo Đối Mã Song Pháo - Xoay Chuyển Càn Khôn",
    principle: "Tàn cuộc Song Mã Pháo đối Mã Song Pháo: Cuộc chiến so tài giữa 2 Mã 1 Pháo và 1 Mã 2 Pháo; bên Song Pháo có tốc độ ra quân và khống chế diện rộng, trong khi bên Song Mã có sức đột kích cục bộ và bám dai dẳng; cần phân tích cụ thể cấu trúc Tốt và Sĩ Tượng để xoay chuyển cục diện.",
    signals: [
      "Đối đầu giữa tổ hợp Song Mã Pháo và Mã Song Pháo trong cờ tàn",
      "Phát huy sở trường kiểm soát diện rộng của Song Pháo hoặc đột kích của Song Mã",
      "Khai thác nhược điểm cấu trúc Tốt và Sĩ Tượng đối phương",
    ],
    quotes: [
      { text: "Trong bài này chúng ta sẽ cùng thảo luận về tàn cuộc song mã pháo và mã sông pháo.", at: "00:04" },
      { text: "Phải đặt vào thế trận cụ thể mới phán đoán chính xác được.", at: "01:40" },
    ],
    kind: "detectable",
    video: "mO3mG0KZRcQ",
    tacticId: "songMaPhaoDoiMaSongPhao",
  },
  35: {
    lesson: 35,
    title: "Lý Thuyết Cốt Lõi Của Tàn Cuộc Mã Pháo Đối Mã Pháo",
    principle: "Lý thuyết cốt lõi tàn cuộc Đơn Mã Pháo đối Đơn Mã Pháo: Về lý thuyết thường là cờ hòa nếu đủ Sĩ Tượng, nhưng trong thực chiến bên có Tốt quá hà hoặc chiếm vị trí Mã Pháo linh hoạt hơn có thể ép chết đối phương từng bước; bên thủ phải tỉnh táo đưa về thế hòa chuẩn mực.",
    signals: [
      "Tàn cuộc Đơn Mã Pháo đối Đơn Mã Pháo giằng co",
      "Tấn Tốt quá hà chiếm ưu thế không gian và phong tỏa đối thủ",
      "Bên yếu tìm mọi cách đổi quân hoặc diệt Tốt để thủ hòa",
    ],
    quotes: [
      { text: "Một ván cờ theo lý thuyết là hòa, nhưng đối thủ lại nhất quyết nói không.", at: "00:04" },
      { text: "Hình cờ này phải tìm mọi cách để cầu hòa.", at: "02:59" },
    ],
    kind: "detectable",
    video: "Au7TR2QgniY",
    tacticId: "maPhaoDoiMaPhao",
  },
  36: {
    lesson: 36,
    title: "Tàn Cuộc Song Pháo Đối Song Mã - Pháo Khống Chế Mã",
    principle: "Tàn cuộc Song Pháo đối Song Mã: Song Pháo có tầm hoạt động rộng và tấn công hai cánh cực kỳ hiệu quả; Mã chậm hơn và dễ bị Pháo kiềm chế ở biên; bên Song Pháo dựa vào Sĩ Tượng làm ngòi nổ để hạn chế đường đi của Song Mã và ép Tướng đối phương.",
    signals: [
      "Tàn cuộc Song Pháo đối đầu với Song Mã không có Xe",
      "Song Pháo tập trung hỏa lực đánh vào hai cánh của đối phương",
      "Kiềm chế và phong tỏa tầm hoạt động của Song Mã đối thủ",
    ],
    quotes: [
      { text: "Bài này chúng ta cùng trò chuyện về sông pháo và song mã.", at: "00:05" },
      { text: "Lý do tấn công cánh là vì đôi mã của bên đen lùi về phòng thủ khá là khó khăn.", at: "02:30" },
    ],
    kind: "detectable",
    video: "kF1lZytRkNg",
    tacticId: "songPhaoDoiSongMa",
  },
  37: {
    lesson: 37,
    title: "Tàn Cuộc Mã Tốt Đối Pháo Tốt - Mã Khống Chế Tuyến Phá Pháo Tốt",
    principle: "Tàn cuộc Mã Tốt đối Pháo Tốt: Mã có khả năng cơ động và khống chế không gian tốt hơn Pháo khi bàn cờ vắng quân; bên có Mã cần tận dụng Tốt thông khống chế lộ sườn, tuyệt đối không đổi quân đơn giản nếu đang chiếm ưu thế, chủ động phát động đòn công kích chớp nhoáng.",
    signals: [
      "Đối đầu giữa cánh Mã Tốt và Pháo Tốt trong cờ tàn không Xe",
      "Mã phối hợp Tốt khống chế yếu đạo và phong tỏa Pháo đối phương",
      "Tránh đổi quân đơn giản, phát động chiến tranh chớp nhoáng",
    ],
    quotes: [
      { text: "đối không được đổi quân một cách đơn giản.", at: "02:11" },
      { text: "Trực tiếp phát động chiến tranh chớp nhoáng, đánh nhanh thắng nhanh.", at: "04:47" },
    ],
    kind: "detectable",
    video: "_TxJNNeHi7A",
    tacticId: "maTotDoiPhaoTot",
  },
  38: {
    lesson: 38,
    title: "Tam Anh Chiến Lữ Bố - Đơn Xe Phá Tan Quần Hùng Mã Pháo Tốt",
    principle: "Tam Anh Chiến Lữ Bố: Thế cờ kinh điển giữa một bên có Xe (Lữ Bố - cơ động, dọn Tốt và khống chế diện rộng cực mạnh) và một bên có ba quân nhẹ (Tam Anh - Mã, Pháo, Tốt hoặc Song Mã, Song Pháo); bên Xe tận dụng sơ hở Sĩ Tượng để chia cắt, bên Tam Quân phải liên kết chặt chẽ lấy công làm thủ.",
    signals: [
      "Cục diện một Xe đối đầu tổ hợp ba quân nhẹ (Mã Pháo Tốt)",
      "Xe phát huy uy lực dọn dẹp Tốt và khống chế các tuyến",
      "Tam quân phối hợp liên hoàn chống lại sức công kích của Đơn Xe",
    ],
    quotes: [
      { text: "uy lực của xe quả thực là vô cùng lớn. Đặc biệt là ở giai đoạn tàn cuộc.", at: "00:49" },
      { text: "Đây là một ván cờ điển hình của cục diện tam anh chiến Lã Bố.", at: "01:26" },
    ],
    kind: "detectable",
    video: "QaUMyl-30g4",
    tacticId: "tamAnhChienLuBo",
  },
  39: {
    lesson: 39,
    title: "Mã Tốt Đáy Thắng Đơn Sĩ Tượng - Nghệ Thuật Ép Cung Sát Cục",
    principle: "Mã Tốt đáy (Tốt lụt) thắng Đơn Sĩ Tượng: Bên công dùng Mã chiếm vị trí đắc địa, khai thác yếu điểm chí mạng khi Tướng và Tượng bên phòng thủ nằm cùng một cánh (đại kỵ); phối hợp Tướng trợ lực và nước chờ để ép chết Sĩ Tượng hoặc khóa chặt Tướng địch.",
    signals: [
      "Tàn cuộc Mã Tốt lụt (ở hàng đáy) đối Đơn Sĩ Tượng",
      "Khai thác điểm yếu khi Tướng và Tượng đối phương nằm cùng cánh (đại kỵ)",
      "Mã chiếm vị trí đắc địa, dùng nước chờ và trợ lực của Tướng ép cung",
    ],
    quotes: [
      { text: "tướng và tượng nằm cùng bên là đại kỵ.", at: "01:01" },
      { text: "đây là một hình cờ dứt điểm quá kinh điển. Chiêu này mọi người bắt buộc phải thuộc nằm lòng.", at: "10:31" },
    ],
    kind: "detectable",
    video: "DTlMu7DsQdU",
    tacticId: "maTotDayThangDonSiTuong",
  },
  40: {
    lesson: 40,
    title: "Xe Pháo Khuyết Sĩ Thắng Xe Pháo - Tuyệt Kỹ Hải Để Lao Nguyệt",
    principle: "Xe Pháo khuyết Sĩ thắng Xe Pháo: Tuyệt kỹ 'Hải Để Lao Nguyệt' (Mò Trăng Đáy Biển) là sát pháp đỉnh cao của tổ hợp Xe Pháo; khi Xe Tướng đối phương bị dồn vào góc đáy, bên công đưa Pháo xuống đáy luồn sau lưng mượn Xe làm ngòi bắt chết Xe hoặc tạo sát cục nghẹt thở.",
    signals: [
      "Tàn cuộc Xe Pháo đối Xe Pháo",
      "Pháo lặn xuống đáy luồn sau lưng Tướng đối phương (Hải Để Lao Nguyệt)",
      "Xe Pháo phối hợp mượn ngòi bắt chết Xe hoặc chiếu bí dưới đáy",
    ],
    quotes: [
      { text: "Cách thắng này gọi là hải để lao nguyệt.", at: "07:21" },
      { text: "Đỏ lập tức tung ra đòn hải để lao nguyệt.", at: "07:48" },
    ],
    kind: "detectable",
    video: "lIpw6oiD9EM",
    tacticId: "haiDeLaoNguyet",
  },
  41: {
    lesson: 41,
    title: "Xe Pháo Đơn Sĩ Đối Xe Song Tượng - Sát Pháp Càn Khôn Đại Nã Di",
    principle: "Xe Pháo đơn Sĩ đối Xe Song Tượng: Định thức tàn cuộc đỉnh cao 'trùm cuối' của Xe Pháo; bên công vận dụng sát pháp 'Càn Khôn Đại Nã Di' điều phối Pháo thăng giáng, mượn sức Tướng và Sĩ ép Tượng đối phương lùi xuống đáy, tạo thời cơ cho Xe càn quét tiêu diệt Song Tượng.",
    signals: [
      "Tàn cuộc Xe Pháo đơn Sĩ đối đầu Xe Song Tượng",
      "Vận dụng sát pháp Càn Khôn Đại Nã Di chuyển dịch đội hình",
      "Ép Song Tượng đối phương xuống đáy và chia cắt để tiêu diệt",
    ],
    quotes: [
      { text: "nội dung bài giảng này cực kỳ chuyên sâu. Nếu các bạn thực sự muốn học cho hiểu rõ ngọn ngành thì nên chuẩn bị sẵn chút lương khô", at: "00:22" },
      { text: "Lúc này phải dùng càn khôn đại nã di để giải quyết các vấn đề trên.", at: "23:58" },
    ],
    kind: "detectable",
    video: "PCukWSQ4sQE",
    tacticId: "canKhonDaiNaDi",
  },
  42: {
    lesson: 42,
    title: "Xe Mã Đối Xe Song Tượng - Giải Mã Bài Toán Thế Kỷ",
    principle: "Xe Mã đối Xe Song Tượng: 'Bài toán thế kỷ' và là đỉnh cao tàn cuộc kinh điển; bên Xe Mã chủ động dùng Mã chèn mắt Tượng ('tằm ăn dâu'), ngăn cản Song Tượng liên kết, ép đối phương tự làm nghẽn chân phòng thủ rồi phối hợp Xe Mã bắt Tượng kết liễu trận đấu.",
    signals: [
      "Tàn cuộc Xe Mã đối đầu Xe Song Tượng",
      "Mã cơ động chèn mắt Tượng của đối phương (thủ pháp tằm ăn dâu)",
      "Xe Mã phối hợp cô lập và bắt chết Song Tượng",
    ],
    quotes: [
      { text: "Thiên Cổ Nghi Nan tàn cuộc xe mã phá xe sông Tượng. Tác giả là danh thủ Tứ Xuyên. Lư Kiến Thanh và Lưu Kiện.", at: "01:11" },
      { text: "tổng thể chắc chắn là thông qua việc chèn mắt tượng để tầm ăn dâu.", at: "20:26" },
    ],
    kind: "detectable",
    video: "U80kaWbbXAk",
    tacticId: "xeMaDoiXeSongTuong",
  },
  43: {
    lesson: 43,
    title: "Cạm Bẫy Giăng Kín Trong Cờ Thế Thất Tinh Tụ Hội",
    principle: "Đứng đầu Tứ đại danh cục: Thất Tinh Tụ Hội (Xe Pháo 3 Tốt đối Xe Pháo 3 Tốt) ẩn chứa cạm bẫy liên hoàn và kỳ tư diệu tưởng; đòi hỏi tính toán chuẩn xác từng nhịp độ, tránh bẫy phản phế và vận dụng đòn điều Xe cản Pháo đưa về cân bằng.",
    signals: [
      "Thế trận danh cục Xe Pháo nhiều Tốt đối đầu Xe Pháo nhiều Tốt",
      "Tính toán tốc độ tranh tiên từng nhịp tránh cạm bẫy liên hoàn",
      "Điều phối Xe Pháo hóa giải nguy nan và phản sát",
    ],
    quotes: [
      { text: "chúng ta sẽ cùng đàm đạo về tứ đại danh cuộc.", at: "00:05" },
      { text: "vừa phải am hiểu những ý tưởng kỳ lạ ở phần đầu, vượt qua vô vàng cạm bẫy, không được sai sót một nước nào", at: "01:40" },
    ],
    kind: "detectable",
    video: "Uj1voqULEp4",
    tacticId: "thatTinhTuHoi",
  },
  44: {
    lesson: 44,
    title: "Giải Mã Tứ Đại Danh Cuộc - Khâu Dẫn Hàng Long Bầy Tốt Trói Chặt Song Xe",
    principle: "Khâu Dẫn Hàng Long: Bầy Tốt liên kết tuy bước chậm nhưng ở tiền tuyến có thể trói chặt, giam hãm Song Xe dũng mãnh; bên Xe phải kiên nhẫn điều quân chờ thời, tính toán số nước dọa sát, tránh hấp tấp ăn quân rơi vào cạm bẫy.",
    signals: [
      "Bầy Tốt qua sông liên kết trói chặt và cô lập Song Xe đối phương",
      "Đi nước chờ thời cơ khi Tốt đối phương không thể cử động",
      "Tính toán số nước dọa sát và điều chỉnh đội hình phòng ngự",
    ],
    quotes: [
      { text: "Chúng ta tiếp tục đến với một trong tứ đại danh cuộc khâu dẫn hàng long.", at: "00:05" },
      { text: "Vì vậy phải chờ thời. Xe bốn thoái một. Mấu chốt của nước chờ này là tốt của đen hiện tại không thể di chuyển.", at: "04:45" },
    ],
    kind: "detectable",
    video: "Q-KyLnoNcEs",
    tacticId: "khauDanHangLong",
  },
  45: {
    lesson: 45,
    title: "Cờ Thế Giang Hồ Dã Mã Thao Điền - Sức Mạnh Đáng Sợ Của Xe Mã Lãnh Chiêu",
    principle: "Dã Mã Thao Điền: Đỉnh cao cờ thế giang hồ Xe Mã; phô diễn sức mạnh biến ảo của Mã phối hợp Xe tạo nên đòn Xe Mã lãnh chiêu hiểm hóc; tuyệt đối không tham lam tiếc Mã nhỏ mà phải kiên định giữ vững thế trận và chớp thời cơ sát cục.",
    signals: [
      "Xe Mã phối hợp tấn công chớp nhoáng theo đồ hình Dã Mã Thao Điền",
      "Sẵn sàng bỏ Mã tranh tiên hoặc né đòn sát cục kiểu muộn sát",
      "Đòn nguội Xe Mã lãnh chiêu kết liễu đối thủ",
    ],
    quotes: [
      { text: "chúng ta bàn về ván thứ ba trong tứ đại danh cục, đó chính là giả mã thao điền", at: "00:05" },
      { text: "Cho nên lúc này bạn tuyệt đối đừng tham lam tiếc con mã làm gì.", at: "03:49" },
    ],
    kind: "detectable",
    video: "naUZGByE95w",
    tacticId: "daMaThaoDien",
  },
  46: {
    lesson: 46,
    title: "Thiên Lý Độc Hành - Bí Ẩn Ván Cờ Tuyệt Kỹ Tàn Cuộc Đơn Mã",
    principle: "Thiên Lý Độc Hành: Đơn Mã độc hành vượt trùng vây đối mặt Song Xe Binh Tốt; thử thách ngay từ nước đầu tiên — không được ham ăn Sĩ mà phải đi nước điều Xe cản phá Tốt liên hoàn, nhảy Mã đúng điểm huyệt để thoát hiểm và phản sát.",
    signals: [
      "Đơn Mã đối đầu trùng trùng vây bọc của Xe Tốt đối phương",
      "Tránh bẫy sát ngược ngay từ nước đi đầu tiên",
      "Điều Xe phong tỏa Tốt liên kết và mở đường cho Mã phản công",
    ],
    quotes: [
      { text: "chúng ta sẽ đến với ván cuối cùng trong tứ đại danh cuộc thiên lý độc hành.", at: "00:05" },
      { text: "bên đen sẽ có nước mã 7 tấn năm nhảy vào, bạn đương nhiên không thể ăn được.", at: "00:47" },
    ],
    kind: "detectable",
    video: "EuSeQTFCa_M",
    tacticId: "thienLyDocHanh",
  },
  47: {
    lesson: 47,
    title: "Bài Học Xương Máu Về Chiến Thuật Và Tâm Lý Trong Tàn Cuộc Thực Chiến",
    principle: "Chiến thuật và tâm lý cờ tàn: Khác biệt giữa lý thuyết và thực chiến nằm ở tâm lý thi đấu; khi chiếm ưu thế tuyệt đối tránh dao động do dự giữa muốn thắng và sợ hòa; phải kiên định chiếm giữ các lộ quan trọng và dùng Mã linh hoạt dứt điểm.",
    signals: [
      "Đối đầu Xe Mã Tốt và Xe Pháo Sĩ Tượng toàn trong tàn cuộc thực chiến",
      "Tránh tâm lý do dự thiếu quyết đoán dẫn đến đánh mất quyền chủ động",
      "Mã chiếm vị trí mắt Tượng đắc địa khống chế toàn diện trận địa",
    ],
    quotes: [
      { text: "xe mã tốt sông tượng đấu với xe pháo sĩ tượng toàn được coi là binh lực cân bằng", at: "04:09" },
      { text: "Thực tế khi đánh tàn cuộc, sợ nhất là kiểu tâm lý này do dự thiếu quyết đoán", at: "07:27" },
    ],
    kind: "detectable",
    video: "M16GyhAmi_Q",
    tacticId: "chienThuatVaTamLy",
  },
  48: {
    lesson: 48,
    title: "Bản Chất Cốt Lõi Của Tàn Cuộc - Đỉnh Cao Triết Lý Cờ Tàn",
    principle: "Bản chất cốt lõi của cờ tàn đúc kết trong 4 chữ: KIỂM SOÁT THẾ TRẬN. Mọi chiến thuật cờ tàn (kiềm chế, nước chờ, chiếm trung, xuất Tướng) đều hướng đến mục tiêu tối thượng là tước đoạt sự linh hoạt của quân địch, biến quân đối phương thành vật cản và kết liễu trận đấu.",
    signals: [
      "Xuất Tướng hoặc vận quân tối ưu hóa khả năng kiểm soát thế trận",
      "Phong tỏa và kiềm chế triệt để mọi quân lực của đối phương",
      "Dùng nước chờ ép đối phương phải tự đi vào chỗ chết",
    ],
    quotes: [
      { text: "tôi cho rằng dùng từ kiểm soát thế trận để sâu chuỗi mọi lý thuyết tàn cuộc", at: "03:05" },
      { text: "không có ý thức kiềm chế thì chắc chắn sẽ không thể đánh tốt cờ tàng.", at: "03:44" },
    ],
    kind: "detectable",
    video: "NzESbWX8YKo",
    tacticId: "banChatTanCuoc",
  },
};

