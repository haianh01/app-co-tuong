import type { Metadata } from "next";
import { ZigaBroadcastClient } from "./ZigaBroadcastClient";

export const metadata: Metadata = {
  title: "Tường thuật Ziga – Đồng bộ WebSocket trực tiếp",
  description: "Bàn cờ tự động đồng bộ nước đi thời gian thực trực tiếp từ WebSocket Ziga bằng UserScript, độ trễ 0s và chuẩn xác 100%.",
};

export default function ZigaBroadcastPage() {
  return <ZigaBroadcastClient />;
}
