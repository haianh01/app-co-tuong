// "Mẹo kỳ lý": câu viết sẵn bot tự đọc khi live im lặng một lúc (không gọi AI, không tốn quota).
// Rút từ 144 bài Triệu Hâm Hâm (khai / trung / tàn cuộc). `text` là lời mình tóm tắt; `quote` phải là
// một đoạn NGUYÊN VĂN trong `quotes` của thẻ bài `lesson` (tips.test.ts kiểm), vì bot đọc nó như lời ông giảng.
// Mẹo chỉ nói nguyên lý chung, không nhắc thế cờ đang đánh, nên đọc được cả khi đang có ván thật (fair-play).

export type TipBook = "opening" | "middlegame" | "endgame";

export interface KyLyTip {
  book: TipBook;
  lesson: number;
  text: string;
  quote?: string;
}

export const KY_LY_TIPS: KyLyTip[] = [
  // Hiệu suất: lấy nhanh đánh chậm
  { book: "opening", lesson: 48, text: "Xe là quân mạnh nhất, khai cuộc mà để Xe nằm im trong góc là tự bó tay mình.", quote: "ba nước không ra xe ắt là cờ tồi" },
  { book: "opening", lesson: 20, text: "Mỗi nước khai cuộc, hãy tự hỏi Xe của mình đã ra chưa.", quote: "Hễ có cơ hội xuất xe, anh không xuất, khả năng cao là có vấn đề." },
  { book: "opening", lesson: 1, text: "Khai cuộc là cuộc đua lấy nhanh đánh chậm: nước nào cũng nên đưa quân chủ lực tiến thêm một bước.", quote: "Chơi cờ là cực kỳ coi trọng hiệu suất." },
  { book: "opening", lesson: 47, text: "Bổ Sĩ sớm không phải nước bắt buộc, nó làm chậm quân chủ lực; phần lớn trường hợp lên Tượng còn tốt hơn.", quote: "Chúng ta luôn phải ưu tiên đi những nước bắt buộc trước." },
  { book: "opening", lesson: 42, text: "Khai cuộc mà đi Tướng khi chưa bị dọa là mất nước oan.", quote: "tướng trong giai đoạn khai cuộc, nếu có thể không động thì tốt nhất là không nên động." },
  { book: "middlegame", lesson: 8, text: "Khi hai bên mỗi người đánh một cánh, đếm nước quan trọng hơn đếm quân.", quote: "chỉ xem ai có thể nhanh hơn một bước. Binh quý thần tốc" },

  // Đặt đúng quân vào đúng chỗ
  { book: "middlegame", lesson: 24, text: "Nhiều khi không cần vội công sát: quân nào cũng đứng đúng chỗ thì ưu thế tự đến.", quote: "Câu nói quan trọng nhất là đặt đúng quân cờ vào đúng vị trí." },
  { book: "middlegame", lesson: 43, text: "Mỗi quân mạnh theo một kiểu riêng.", quote: "Mã là kiểm soát điểm đúng không? Nhưng xe là kiểm soát đường." },
  { book: "opening", lesson: 21, text: "Mã đứng giữa thì giữ được trung lộ và che được Tốt đầu.", quote: "vị trí mã tốt nhất chính là chánh mã" },
  { book: "middlegame", lesson: 36, text: "Vì sao người ta bảo Mã phùng biên tất vong?", quote: "Vốn dĩ là mã đạp bát phương, có thể kiểm soát tám điểm, nhưng ra đến biên chỉ còn bốn điểm" },
  { book: "middlegame", lesson: 4, text: "Mã thoái về giữa cung, gọi là Oa Tâm Mã, là vị trí xấu nhất của Mã.", quote: "mã cũng chặn lộ của tướng" },
  { book: "opening", lesson: 31, text: "Pháo không nên phát động khinh suất khi quân sau chưa theo kịp, nhưng cũng đừng hiểu là cấm đưa Pháo lên.", quote: "pháo bất nghi khinh phát không phải là nói pháo không thể phát động" },
  { book: "opening", lesson: 46, text: "Tượng tốt nhất là bay chính Tượng, và nên bay Sĩ Tượng về phía mình tập trung nhiều quân.", quote: "Thuận sĩ tượng nhất định tốt hơn." },
  { book: "middlegame", lesson: 45, text: "Trước khi thúc Tốt hãy nghĩ kỹ.", quote: "Vì binh tốt một đi không trở lại, nó không thể quay về được nữa." },

  // Tranh tuyến
  { book: "opening", lesson: 19, text: "Lộ 4 và lộ 6 là đường Xe đắt giá nhất.", quote: "ai đến trước, người đó chiếm ưu thế" },
  { book: "opening", lesson: 16, text: "Dâng Pháo phong Xe đối phương thì Pháo mình cũng dễ bị ghìm lại.", quote: "phong tỏa và bị kiềm chế thực ra là hai mặt của Đồng Xu" },
  { book: "middlegame", lesson: 17, text: "Tuyến áp đáy là hàng thứ hai, ngay trước cung Tướng.", quote: "áp đáy được gọi là tuyến sinh mệnh, có thể coi là số mệnh của bên phòng thủ." },
  { book: "endgame", lesson: 9, text: "Sang tàn cuộc, đường biên bớt giá trị nhưng trung lộ thì không.", quote: "trung lộ mãi mãi là đường quan trọng nhất" },

  // Hình cờ ít điểm yếu
  { book: "opening", lesson: 37, text: "Đừng chỉ mải tính đòn, hãy nhìn cả hình cờ của mình.", quote: "Hình cờ đẹp có nghĩa là ít điểm yếu, còn hình cờ không tốt nghĩa là có nhiều điểm yếu." },
  { book: "opening", lesson: 40, text: "Dồn hết quân về một cánh thì cánh đó tắc nghẽn, Xe ra chậm.", quote: "mọi việc thái quá đều không tốt" },
  { book: "opening", lesson: 28, text: "Để một quân đơn độc tiến sâu vào lòng địch, không có quân yểm trợ, rồi bị vây bắt.", quote: "Tình huống này là điều đại kỵ trong khai cuộc." },

  // Sĩ Tượng
  { book: "middlegame", lesson: 32, text: "Đừng đổi Sĩ Tượng của mình một cách rẻ rúng.", quote: "Sĩ tượng đối với tướng mà nói, chúng giống như thị vệ bên cạnh hoàng đế." },
  { book: "endgame", lesson: 18, text: "Cung Tướng đã mất Sĩ mà đối phương còn hai Xe thì rất nguy hiểm.", quote: "Khuyết sĩ kỵ song xe" },
  { book: "endgame", lesson: 19, text: "Câu khuyết Tượng sợ Pháo còn đúng hơn ở tàn cuộc.", quote: "khi cờ tàn khuyết tượng còn sợ pháo kinh khủng hơn nữa." },
  { book: "middlegame", lesson: 12, text: "Để đối phương đặt Pháo trống giữa cung rất nguy hiểm, chỉ nên chấp nhận khi chắc đuổi được nó sớm.", quote: "bạn bắt buộc phải đảm bảo rằng trong một thời gian ngắn có thể đuổi được quân pháo trống này" },
  { book: "middlegame", lesson: 7, text: "Khi hai bên ghìm nhau mà chưa có đòn gì rõ ràng thì sao?", quote: "Trong thế giằng co thì vô sự tiến tốt biên, thực sự rất hiệu quả." },

  // Vật chất và chuyển hóa
  { book: "middlegame", lesson: 47, text: "Đừng xem nhẹ một con Tốt.", quote: "ở đẳng cấp cao thủ mất một tốt đã là chuyện tầy đình" },
  { book: "middlegame", lesson: 5, text: "Đang hơn quân thì chủ động đổi bớt, ưu thế vị trí của đối phương sẽ tan theo.", quote: "trong thế hơn quân, quan trọng nhất phải tìm kiếm giản hóa" },
  { book: "middlegame", lesson: 48, text: "Tấn công không cần hơn quân cả bàn, chỉ cần đông hơn đối phương ở đúng chỗ quyết chiến.", quote: "cục bộ lấy nhiều đánh ít mới là nguyên tắc cốt lõi của tấn công" },
  { book: "endgame", lesson: 3, text: "Tàn cuộc một quân mạnh thêm hai Tốt gặp đủ Sĩ Tượng thì có ván thắng, có ván hòa.", quote: "hai tốt chính là điểm tới hạn của binh lực" },

  // Tàn cuộc: kiểm soát
  { book: "endgame", lesson: 23, text: "Tàn cuộc thắng nhiều nhờ ghìm chặt quân đối phương hơn là nhờ ăn quân.", quote: "Chiến thuật kìm chế theo tôi là một trong những chiến thuật quan trọng nhất của tàn cuộc" },
  { book: "endgame", lesson: 24, text: "Ở tàn cuộc, nhiều khi nước hay nhất là một nước chờ, để đối phương tự đi và tự làm vỡ thế thủ của mình." },
  { book: "endgame", lesson: 16, text: "Khai cuộc thì Tướng nên đứng yên, nhưng sang tàn cuộc Tướng lại thành một quân chiến đấu.", quote: "nước thượng tướng này cơ bản là động tác tiêu chuẩn" },
  { book: "endgame", lesson: 11, text: "Bàn cờ càng ít quân, Mã càng quý.", quote: "Thực tế là tàn cuộc càng phải nhấn mạnh đến việc mã sống." },
  { book: "endgame", lesson: 20, text: "Tàn cuộc ít ngòi, Pháo đứng trên cao dễ thành vô dụng; lùi về nhà mượn Sĩ Tượng làm ngòi.", quote: "Nếu pháo ở nhà, nó sẽ công thủ toàn diện" },
  { book: "endgame", lesson: 39, text: "Phòng thủ tàn cuộc bằng Sĩ Tượng, nhớ một điều kỵ.", quote: "tướng và tượng nằm cùng bên là đại kỵ." },
  { book: "endgame", lesson: 47, text: "Đang hơn mà cứ phân vân giữa muốn thắng và sợ hòa là dễ hỏng việc.", quote: "Thực tế khi đánh tàn cuộc, sợ nhất là kiểu tâm lý này do dự thiếu quyết đoán" },

  // Nguyên lý có điều kiện
  { book: "opening", lesson: 29, text: "Không có hệ thống khai cuộc nào chỉ có ưu điểm.", quote: "Tóm lại, bất kỳ chiến thuật nào cũng đều là con dao hai lưỡi." },
  { book: "opening", lesson: 10, text: "Đôi khi phải chịu thiệt một chút ở một cánh để cả thế trận tốt hơn.", quote: "lợi ích cục bộ, bắt buộc phải phục tùng lợi ích toàn cục" },
  { book: "opening", lesson: 43, text: "Học kỹ vài hệ thống khai cuộc mình hay đi là cách học lời nhất.", quote: "trong khai cuộc bên có sự chuẩn bị sẽ chiếm ưu thế trước bên không có sự chuẩn bị" },
  { book: "endgame", lesson: 1, text: "Một nước đi chỉ giải được một thế cờ, còn một nguyên lý dùng được cho rất nhiều thế.", quote: "người chơi cờ kém chỉ nhìn thấy nước đi còn người chơi cờ giỏi thì nhìn thấy nguyên lý" },
];

/** Câu bot đọc: lời tóm tắt, rồi trích nguyên văn (nếu có). */
export function tipSpeech(tip: KyLyTip): string {
  return tip.quote ? `${tip.text} Triệu Hâm Hâm có câu: “${tip.quote}”` : tip.text;
}

/** Bốc lần lượt theo túi xáo trộn: đọc hết các mẹo rồi mới lặp, không lặp ngay câu vừa đọc. */
export function createTipPicker(tips: KyLyTip[] = KY_LY_TIPS, random: () => number = Math.random): () => string {
  let bag: KyLyTip[] = [];
  let last: KyLyTip | undefined;
  return () => {
    if (!bag.length) {
      bag = [...tips];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag.at(-1) === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop()!;
    return tipSpeech(last);
  };
}
