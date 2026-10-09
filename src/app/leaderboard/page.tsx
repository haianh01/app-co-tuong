import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { rankTitle } from "@/lib/online/rank";
import { getDb } from "@/server/db";
import { getLeaderboard } from "@/server/queries";
import styles from "./leaderboard.module.css";

export const metadata: Metadata = { title: "Bảng xếp hạng" };

export default function LeaderboardPage() {
  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <span className={styles.kicker}>BẢNG XẾP HẠNG</span>
        <h1 className={styles.title}>Kỳ thủ hàng đầu</h1>
        <p className="muted">Xếp theo Elo, tính những người đã chơi ít nhất một ván xếp hạng.</p>
      </header>
      <Suspense fallback={<p className="muted">Đang tải bảng xếp hạng…</p>}>
        <Ranking />
      </Suspense>
    </main>
  );
}

async function Ranking() {
  await connection();
  const rows = await getLeaderboard(await getDb(), 100);
  if (!rows.length) {
    return (
      <div className={`card ${styles.empty}`}>
        <p>Chưa có ván xếp hạng nào.</p>
        <Link href="/online" className="btn btn-primary">Đấu ván đầu tiên</Link>
      </div>
    );
  }
  return (
    <div className={`card ${styles.tableCard}`}>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Hạng</th>
              <th scope="col">Kỳ thủ</th>
              <th scope="col">Danh hiệu</th>
              <th scope="col" className={styles.num}>Elo</th>
              <th scope="col" className={styles.num}>Số ván</th>
              <th scope="col" className={styles.num}>Thắng · Hòa · Thua</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u, i) => {
              const title = rankTitle(u.rating);
              return (
                <tr key={u.id}>
                  <td>
                    <span className={styles.rank} data-top={i < 3 ? i + 1 : undefined}>{i + 1}</span>
                  </td>
                  <td>
                    <Link href={`/u/${u.username}`} className={styles.player}>
                      <strong>{u.displayName}</strong>
                      <span className="muted">@{u.username}</span>
                    </Link>
                  </td>
                  <td>
                    <span className={styles.title2}>
                      <span className={`seal ${styles.seal}`}>{title.seal}</span>
                      {title.name}
                    </span>
                  </td>
                  <td className={styles.num}><strong>{u.rating}</strong></td>
                  <td className={styles.num}>{u.gamesPlayed}</td>
                  <td className={styles.num}>{u.wins} · {u.draws} · {u.losses}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
