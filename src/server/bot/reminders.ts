// "Nhắc anh chủ kênh": câu viết sẵn bot đọc nhẹ cho anh chủ kênh trong lúc đang đánh ván thật.
// Fair-play: chỉ nhắc nguyên tắc chung, bốc ngẫu nhiên theo giai đoạn ván (khai / trung / tàn cuộc).
// Không nhìn thế cờ, không gọi AI hay engine, nên không bao giờ thành gợi ý nước đi cho ván đang đánh.
// Nội dung rút từ ba mức mưu lược (an toàn → đặt quân → lập kế hoạch) và binh pháp Tôn Tử.
import type { PieceType } from "@/lib/xiangqi/engine";

export type GamePhase = "opening" | "middlegame" | "endgame";

export const HOST_REMINDERS: Record<GamePhase, string[]> = {
  opening: [
    "Nhắc nhẹ anh chủ kênh: ra Xe sớm, đừng để Xe nằm im trong góc.",
    "Khai cuộc đừng đi một quân nhiều lần, mỗi nước đưa thêm một quân ra trận nha anh.",
    "Chưa bị dọa thì khoan bổ Sĩ, khoan đi Tướng nha anh.",
    "Cân bằng hai cánh anh ơi, đừng dồn hết quân về một bên.",
    "Lộ 4, lộ 6 là đường Xe đắt giá nhất, ai tới trước người đó chủ động.",
    "Mã đứng chính Mã hay vai Tượng mới đẹp, ra biên là phí sức Mã.",
    "Pháo cần ngòi, đừng cho Pháo đi một mình khi quân sau chưa theo kịp.",
    "Tôn Tử dặn: ai chiếm chiến địa trước thì nhàn, đến sau thì mệt. Tranh tuyến trước đã anh ơi.",
  ],
  middlegame: [
    "Hết đòn thì tìm quân đang kém nhất, đưa nó tới ô tốt hơn nha anh.",
    "Anh chủ kênh ơi, ván này mình muốn làm gì? Chọn một nơi quyết chiến rồi dồn quân về đó.",
    "Tấn công không cần hơn quân cả bàn, chỉ cần đông hơn ở đúng chỗ quyết chiến.",
    "Thử đoán quân nào của đối phương muốn tới đâu, rồi chặn trước một bước.",
    "Giằng co chưa có đòn thì tiến Tốt biên, đừng manh động.",
    "Nhớ giữ Sĩ Tượng nha anh: khuyết Sĩ kỵ song Xe, khuyết Tượng sợ Pháo.",
    "Hai bên cùng đánh thì đếm nước, đừng chỉ đếm quân.",
    "Quân đi lẻ vào sâu dễ bị vây, nhớ có quân theo yểm trợ.",
    "Thắng binh tiên thắng nhi hậu cầu chiến: tạo thế trước rồi hãy đánh.",
    "Hơn quân thì đổi bớt cho gọn, kém quân thì giữ cờ phức tạp.",
  ],
  endgame: [
    "Sang tàn cuộc rồi, Tướng cũng là một quân chiến đấu đó anh.",
    "Tàn cuộc thắng nhờ ghìm quân đối phương: kiểm soát trước rồi mới ra đòn.",
    "Không vội anh ơi, ở tàn cuộc nhiều khi nước chờ là nước hay nhất.",
    "Bàn cờ càng ít quân, Mã càng quý, giữ Mã sống nha anh.",
    "Pháo tàn cuộc thiếu ngòi thì lùi về nhà, mượn Sĩ Tượng làm ngòi.",
    "Hai Tốt là điểm tới hạn, đếm Tốt trước khi quyết đổi quân.",
    "Đang hơn thì quyết đoán, đừng vừa muốn thắng vừa sợ hòa.",
    "Phòng thủ tàn cuộc nhớ: Tướng và Tượng cùng một bên là đại kỵ.",
  ],
};

/** Đọc sau khi anh chủ kênh vừa mất quân lớn: nhắc kỷ luật an toàn, không bàn thế cờ. */
export const SAFETY_REMINDERS = [
  "Bình tĩnh anh ơi. Trước mỗi nước hỏi ba câu: đối phương dọa gì, quân nào chưa có quân giữ, nước mình đi có hở quân nào không.",
  "Mất quân rồi thì chắc từng nước, đừng vội gỡ lại ngay anh ơi.",
  "Hít một hơi, nhìn kỹ nước đối phương vừa đi rồi hãy đi nha anh.",
  "Đánh chắc tiến chắc anh ơi, ván cờ còn dài.",
];

const STRONG: PieceType[] = ["r", "n", "c"];

/** Giai đoạn ván: khai cuộc 20 nửa nước đầu; tàn cuộc khi Xe Mã Pháo hai bên đã mất từ 6 quân (một nửa) trở lên. */
export function gamePhase(ply: number, lost: PieceType[]): GamePhase {
  if (lost.filter((p) => STRONG.includes(p)).length >= 6) return "endgame";
  return ply < 20 ? "opening" : "middlegame";
}

/** Bốc theo túi xáo trộn cho từng nhóm: đọc hết nhóm rồi mới lặp. */
export function createReminderPicker(random: () => number = Math.random): (group: GamePhase | "safety") => string {
  const bags = new Map<string, string[]>();
  return (group) => {
    let bag = bags.get(group);
    if (!bag?.length) {
      bag = [...(group === "safety" ? SAFETY_REMINDERS : HOST_REMINDERS[group])];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      bags.set(group, bag);
    }
    return bag.pop()!;
  };
}
