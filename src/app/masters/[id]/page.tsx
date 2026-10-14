import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MASTER_GAMES } from "@/lib/xiangqi/master-games.generated";
import { MasterGameViewer } from "./MasterGameViewer";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const game = MASTER_GAMES.find((g) => g.id.toString() === id);
  if (!game) return { title: "Không tìm thấy ván cờ" };
  return {
    title: `${game.red} vs ${game.black} – Kỳ Phổ Đại Sư #${game.id}`,
    description: `Ván đấu ${game.red} đối ${game.black}, khai cuộc ${game.eccoName} (${game.eccoCode}). Xem lại và phân tích thế cờ bằng AI.`,
  };
}

export default async function MasterGameDetailPage({ params }: Props) {
  const { id } = await params;
  const game = MASTER_GAMES.find((g) => g.id.toString() === id);
  if (!game) notFound();

  return <MasterGameViewer game={game} />;
}
