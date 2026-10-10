import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import type { Variant } from "@/lib/online/protocol";
import type { Side } from "@/lib/xiangqi/engine";
import type { EndReason } from "@/lib/xiangqi/game";
import { toPlayerInfo } from "@/server/auth";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { getGameRecord, type GameRecord } from "@/server/queries";
import { GameReplay, type ReplayData } from "./GameReplay";
import { OnlineGame } from "./OnlineGame";

export const metadata: Metadata = { title: "Ván đấu" };

export default function GamePage({ params }: PageProps<"/game/[id]">) {
  return (
    <Suspense fallback={<p className="muted" style={{ padding: 32, textAlign: "center" }}>Đang tải ván đấu…</p>}>
      <GameLoader params={params} />
    </Suspense>
  );
}

function toReplay(r: GameRecord): ReplayData {
  return {
    id: r.id,
    variant: r.variant as Variant,
    minutes: r.minutes,
    increment: r.increment,
    rated: r.rated,
    tournamentId: r.tournamentId,
    setup: r.setup,
    winner: (r.winner as Side | null) ?? null,
    reason: r.reason as EndReason,
    moves: r.moves,
    red: { ...r.red, before: r.redRatingBefore, after: r.redRatingAfter },
    black: { ...r.black, before: r.blackRatingBefore, after: r.blackRatingAfter },
    endedAt: r.endedAt.toISOString(),
  };
}

/** Ván đã kết thúc → xem lại từ DB; còn lại → theo dõi trực tiếp qua WebSocket. */
async function GameLoader({ params }: Pick<PageProps<"/game/[id]">, "params">) {
  const { id } = await params;
  await connection();
  const user = await getCurrentUser();
  const record = /^[A-Za-z0-9]{6,12}$/.test(id) ? await getGameRecord(await getDb(), id) : null;
  if (record) return <GameReplay data={toReplay(record)} viewerId={user?.id ?? null} />;
  return <OnlineGame key={id} gameId={id} me={user ? toPlayerInfo(user) : null} />;
}
