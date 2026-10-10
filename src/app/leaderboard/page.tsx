import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { rankTitle } from "@/lib/online/rank";
import { getDb } from "@/server/db";
import { SEASON_ELIGIBLE_GAMES, SEASON_PRIZES, currentSeason, seasonRange, seasonStandings } from "@/server/economy";
import { getLeaderboard } from "@/server/queries";
import styles from "./leaderboard.module.css";

export const metadata: Metadata = { title: "Bảng xếp hạng" };

// Phải khớp số ván tối thiểu awardSeason dùng.
const SEASON_MIN_GAMES = SEASON_ELIGIBLE_GAMES;

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <span className={styles.kicker}>BẢNG XẾP HẠNG</span>
        <h1 className={styles.title}>Kỳ thủ hàng đầu</h1>
      </header>
      <Suspense fallback={<p className="muted">Đang tải bảng xếp hạng…</p>}>
        <Board searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Board({ searchParams }: Pick<PageProps<"/leaderboard">, "searchParams">) {
  const { tab } = await searchParams;
  const season = tab === "season";
  return (
    <>
      <nav className={styles.tabs} aria-label="Loại bảng xếp hạng">
        <Link href="/leaderboard" aria-current={season ? undefined : "page"}>Elo</Link>
        <Link href="/leaderboard?tab=season" aria-current={season ? "page" : undefined}>Mùa giải tháng này</Link>
      </nav>
      {season ? <Season /> : <Ranking />}
    </>
  );
}

function Empty() {
  return (
    <div className={`card ${styles.empty}`}>
      <p>Chưa có ván xếp hạng nào.</p>
      <Link href="/online" className="btn btn-primary">Đấu ván đầu tiên</Link>
    </div>
  );
}

function Player({ p }: { p: { username: string; displayName: string; avatar: string; frame: string } }) {
  return (
    <Link href={`/u/${p.username}`} className={styles.player}>
      <Avatar avatar={p.avatar} frame={p.frame} size={36} />
      <span className={styles.playerText}>
        <strong>{p.displayName}</strong>
        <span className="muted">@{p.username}</span>
      </span>
    </Link>
  );
}

async function Ranking() {
  await connection();
  const rows = await getLeaderboard(await getDb(), 100);
  if (!rows.length) return <Empty />;
  return (
    <>
      <p className="muted">Xếp theo Elo, tính những người đã chơi ít nhất một ván xếp hạng.</p>
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
                    <td><Player p={u} /></td>
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
    </>
  );
}

async function Season() {
  await connection();
  const key = currentSeason();
  const { end } = seasonRange(key);
  const all = await seasonStandings(await getDb(), key, 200, 1);
  // Thứ hạng nhận thưởng chỉ tính người đủ số ván (giống awardSeason); người chưa đủ xếp sau, không đánh số.
  const rows = [...all.filter((u) => u.games >= SEASON_MIN_GAMES), ...all.filter((u) => u.games < SEASON_MIN_GAMES)].slice(0, 100);
  const [y, m] = key.split("-");
  const endText = end.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return (
    <>
      <div className={`card ${styles.seasonInfo}`}>
        <strong>Mùa {Number(m)}/{y}</strong>
        <span className="muted">
          Điểm mùa = tổng Elo cộng/trừ trong tháng. Kết thúc 0 giờ ngày {endText}. Top 10 (chơi ít nhất {SEASON_MIN_GAMES} ván) nhận
          xu và khung avatar “Kỳ Vương”.
        </span>
        <ol className={styles.prizes}>
          {SEASON_PRIZES.slice(0, 5).map((p, i) => (
            <li key={i}>Hạng {i + 1}: <strong>{p.toLocaleString("vi-VN")} xu</strong></li>
          ))}
          <li>Hạng 6–10: <strong>{SEASON_PRIZES[5].toLocaleString("vi-VN")} xu</strong></li>
        </ol>
      </div>
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div className={`card ${styles.tableCard}`}>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Hạng</th>
                  <th scope="col">Kỳ thủ</th>
                  <th scope="col" className={styles.num}>Điểm mùa</th>
                  <th scope="col" className={styles.num}>Số ván</th>
                  <th scope="col" className={styles.num}>Elo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u, i) => {
                  const eligible = u.games >= SEASON_MIN_GAMES;
                  return (
                    <tr key={u.id}>
                      <td>
                        {eligible ? <span className={styles.rank} data-top={i < 3 ? i + 1 : undefined}>{i + 1}</span> : <span className="muted">–</span>}
                      </td>
                      <td><Player p={u} /></td>
                      <td className={styles.num}>
                        <strong>{u.points > 0 ? "+" : ""}{u.points}</strong>
                      </td>
                      <td className={styles.num}>
                        {u.games}
                        {!eligible && <span className="muted"> (cần {SEASON_MIN_GAMES})</span>}
                      </td>
                      <td className={styles.num}>{u.rating}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
