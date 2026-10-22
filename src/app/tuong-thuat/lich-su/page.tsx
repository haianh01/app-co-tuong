import type { Metadata } from "next";
import { StageHistoryClient } from "./StageHistoryClient";

export const metadata: Metadata = {
  title: "Lịch sử ván cờ sân khấu – Tường thuật Cờ Tướng",
  description: "Xem lại danh sách các ván cờ đã lưu trong các buổi livestream tường thuật, hỗ trợ AI phân tích và xem lại chi tiết.",
};

export default function StageHistoryPage() {
  return <StageHistoryClient />;
}
