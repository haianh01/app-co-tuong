import type { Metadata } from "next";
import { StageReplayClient } from "./StageReplayClient";

export const metadata: Metadata = {
  title: "Xem lại & Phân tích ván cờ sân khấu – Tường thuật Cờ Tướng",
  description: "Xem lại chi tiết từng nước đi, mũi tên phân tích và diễn biến trận đấu của ván cờ sân khấu.",
};

export default async function StageReplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StageReplayClient id={id} />;
}
