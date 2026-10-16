import type { Metadata } from "next";
import { BroadcastClient } from "./BroadcastClient";

export const metadata: Metadata = {
  title: "Tường thuật – Bàn cờ bình luận",
  description: "Bàn cờ tự đi theo ván đang chiếu trên một trang cờ khác, có vẽ mũi tên và khoanh ô để bình luận, trình chiếu cho khán giả.",
};

export default function BroadcastPage() {
  return <BroadcastClient />;
}
