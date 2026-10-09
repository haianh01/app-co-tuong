import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { rankTitle } from "@/lib/online/rank";
import { REASON_TEXT, type EndReason } from "@/lib/xiangqi/game";
import { getDb } from "@/server/db";
import { getProfile, getRecentGames } from "@/server/queries";
import styles from "./profile.module.css";

export const metadata: Metadata = { title: "Hồ sơ kỳ thủ" };

const formatDate = (d: Date) =>
  d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export default function ProfilePage({ params }: PageProps<"/u/[username]">) {
  return (
    <main className={styles.main}>
      <Suspense fallback={<p className="muted">Đang tải hồ sơ…</p>}>
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: Pick<PageProps<"/u/[username]">, "params">) {
  const { username } = await params;
  await connection();
  const db = await getDb();
  const profile = await getProfile(db, decodeURIComponent(username));
  if (!profile) notFound();
  const games = await getRecentGames(db, profile.id, 30);
  const title = rankTitle(profile.rating);
  const winRate = profile.gamesPlayed ? Math.round((profile.wins * 100) / profile.gamesPlayed) : 0;

  return (
    <>
      <section className={`card ${styles.header}`}>
        <span className={styles.avatar} aria-hidden="true">{profile.displayName.slice(0, 1).toUpperCase()}</span>
        <div className={styles.who}>
          <h1 className={styles.name}>{profile.displayName}</h1>
          <span className="muted">@{profile.username} · Tham gia {profile.createdAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span>
        </div>
        <div className={styles.rank}>
          <span className={`seal ${styles.seal}`}>{title.seal}</span>
          <span>
            <strong>{title.name}</strong>
            <span className="muted">Elo {profile.rating} · cao nhất {profile.peakRating}</span>
          </span>
        </div>
      </section>

      <section className={styles.stats} aria-label="Thống kê">
        {[
          ["Số ván", profile.gamesPlayed],
          ["Thắng", profile.wins],
          ["Hòa", profile.draws],
          ["Thua", profile.losses],
          ["Tỉ lệ thắng", `${winRate}%`],
        ].map(([label, value]) => (
          <div key={label} className={`card ${styles.stat}`}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <section className={`card ${styles.games}`} aria-labelledby="recent">
        <h2 id="recent" className={styles.h2}>Ván gần đây</h2>
        {games.length === 0 && <p className="muted">Chưa chơi ván xếp hạng nào.</p>}
        <ul className={styles.list}>
          {games.map((g) => {
            const side = g.red.id === profile.id ? "r" : "b";
            const opp = side === "r" ? g.black : g.red;
            const outcome = g.winner === null ? "draw" : g.winner === side ? "win" : "loss";
            const before = side === "r" ? g.redRatingBefore : g.blackRatingBefore;
            const after = side === "r" ? g.redRatingAfter : g.blackRatingAfter;
            const delta = after - before;
            return (
              <li key={g.id} className={styles.row}>
                <span className={styles.result} data-outcome={outcome}>
                  {outcome === "win" ? "勝" : outcome === "loss" ? "負" : "和"}
                </span>
                <span className={styles.rowMain}>
                  <span>
                    vs <Link href={`/u/${opp.username}`} className={styles.opp}>{opp.displayName}</Link>
                    <span className="muted"> · cầm {side === "r" ? "Đỏ" : "Đen"}</span>
                  </span>
                  <span className="muted">
                    {REASON_TEXT[g.reason as EndReason] ?? g.reason} · {g.minutes} phút · {Math.ceil(g.plies / 2)} nước · {formatDate(g.endedAt)}
                  </span>
                </span>
                <span className={styles.delta} data-sign={delta > 0 ? "up" : delta < 0 ? "down" : "zero"}>
                  {delta > 0 ? "+" : delta < 0 ? "−" : "±"}{Math.abs(delta)}
                </span>
                <Link href={`/game/${g.id}`} className="btn">Xem lại</Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
