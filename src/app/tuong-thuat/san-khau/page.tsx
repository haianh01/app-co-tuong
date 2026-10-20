import type { Metadata } from "next";
import { StageClient } from "./StageClient";

export const metadata: Metadata = {
  title: "Sân khấu Livestream – Tường thuật Cờ Tướng (1080×1920)",
  description: "Trang sân khấu chuyên dụng độ phân giải dọc 1080×1920 dành cho OBS Studio và TikTok LIVE Studio.",
};

export default function StagePage() {
  return <StageClient />;
}
