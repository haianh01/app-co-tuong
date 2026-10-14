import type { Metadata } from "next";
import { MASTER_GAMES } from "@/lib/xiangqi/master-games.generated";
import { MastersListClient } from "./MastersListClient";

export const metadata: Metadata = {
  title: "Kho Ván Đại Sư – Cờ Tướng Thực Chiến",
  description: "Tuyển tập ván cờ các đại sư hàng đầu thế giới (Hứa Ngân Xuyên, Lữ Khâm, Hồ Vinh Hoa...), đối chiếu mã khai cuộc ECCO và phân tích bằng AI.",
};

export default function MastersPage() {
  // Trang danh sách chỉ cần thông tin tóm tắt; bỏ nước đi để không gửi cả kho ván xuống trình duyệt
  const summaries = MASTER_GAMES.map(({ movesVN: _vn, movesCN: _cn, ...rest }) => rest);
  return <MastersListClient games={summaries} />;
}
