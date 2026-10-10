import type { Metadata } from "next";
import { JieqiPlay } from "./JieqiPlay";

export const metadata: Metadata = {
  title: "Cờ úp – chơi với máy",
  description: "Cờ úp (揭棋): quân úp ngẫu nhiên, đi rồi mới lật. Chơi với máy ngay trên trình duyệt.",
};

export default function JieqiPage() {
  return <JieqiPlay />;
}
