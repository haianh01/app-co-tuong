import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { computeBadges } from "@/lib/badges";
import { rankTitle } from "@/lib/online/rank";
import type { OpeningStat } from "@/lib/xiangqi/openings";
import { PUZZLES } from "@/lib/xiangqi/puzzles";
import { REASON_TEXT, type EndReason } from "@/lib/xiangqi/game";
import { getDb } from "@/server/db";
import { getProfile, getProfileExtras, getRecentGames } from "@/server/queries";
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
  const [games, extras] = await Promise.all([getRecentGames(db, profile.id, 30), getProfileExtras(db, profile.id)]);
  const badges = computeBadges({ ...profile, ...extras, puzzlesTotal: PUZZLES.length });
  const title = rankTitle(profile.rating);
  const winRate = profile.gamesPlayed ? Math.round((profile.wins * 100) / profile.gamesPlayed) : 0;

  return (
    <>
      <section className={`card ${styles.header}`}>
        <Avatar avatar={profile.avatar} frame={profile.frame} size={88} />
        <div className={styles.who}>
          <h1 className={styles.name}>
            {profile.displayName}
            {extras.vip && <span className={styles.vip}>VIP</span>}
          </h1>
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

      <section className={`card ${styles.games}`} aria-labelledby="badges">
        <h2 id="badges" className={styles.h2}>
          Huy hiệu <span className="muted">{badges.filter((b) => b.earned).length}/{badges.length}</span>
        </h2>
        <ul className={styles.badges}>
          {badges.map((b) => (
            <li key={b.id} className={styles.badge} data-earned={b.earned || undefined} title={b.desc}>
              <span className={`seal ${styles.badgeSeal}`} aria-hidden="true">{b.seal}</span>
              <span>
                <strong>{b.name}</strong>
                <span className="muted">{b.earned ? b.desc : `Chưa đạt · ${b.desc}`}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {(extras.openingsRed.length > 0 || extras.openingsBlack.length > 0) && (
        <section className={`card ${styles.games}`} aria-labelledby="openings">
          <h2 id="openings" className={styles.h2}>Khai cuộc ưa dùng</h2>
          <div className={styles.openingCols}>
            <OpeningTable caption="Khi cầm Đỏ (nước đầu)" rows={extras.openingsRed} />
            <OpeningTable caption="Khi cầm Đen (nước đáp)" rows={extras.openingsBlack} />
          </div>
        </section>
      )}

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

function OpeningTable({ caption, rows }: { caption: string; rows: OpeningStat[] }) {
  if (!rows.length) return null;
  return (
    <table className={styles.openings}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Khai cuộc</th>
          <th scope="col">Số ván</th>
          <th scope="col">Thắng · Hòa · Thua</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 6).map((o) => (
          <tr key={o.id}>
            <td>{o.name}</td>
            <td>{o.games}</td>
            <td>{o.wins} · {o.draws} · {o.losses} <span className="muted">({Math.round((o.wins * 100) / o.games)}%)</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
