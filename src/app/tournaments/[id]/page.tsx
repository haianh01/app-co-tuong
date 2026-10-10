import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { TOURNAMENT_ID, tcLabel } from "@/lib/online/protocol";
import { toSessionUser } from "@/server/auth";
import { getCurrentUser } from "@/server/current-user";
import { getDb } from "@/server/db";
import { getTournament, isJoined, standings } from "@/server/tournaments";
import { ArenaClient } from "./ArenaClient";
import styles from "../tournaments.module.css";

export const metadata: Metadata = { title: "Giải đấu" };

const time = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

export default function TournamentPage({ params }: PageProps<"/tournaments/[id]">) {
  return (
    <main className={styles.main}>
      <Suspense fallback={<p className="muted">Đang tải giải đấu…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: Pick<PageProps<"/tournaments/[id]">, "params">) {
  const { id } = await params;
  await connection();
  if (!TOURNAMENT_ID.test(id)) notFound();
  const db = await getDb();
  const t = await getTournament(db, id);
  if (!t) notFound();
  const [user, rows] = await Promise.all([getCurrentUser(), standings(db, id, 100)]);
  const joined = user ? await isJoined(db, id, user.id) : false;

  return (
    <>
      <header className={`card ${styles.hero}`}>
        <span className={styles.kicker}>GIẢI ĐẤU ARENA · {tcLabel(t.minutes, t.increment)}</span>
        <h1 className={styles.title}>{t.name}</h1>
        <p className="muted">
          {t.startsAt.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })} ·{" "}
          {time(t.startsAt)}–{time(t.endsAt)} · Thắng 2, hòa 1, thắng liền từ ván thứ 3 được 4 điểm.
        </p>
        <ol className={styles.prizes} aria-label="Giải thưởng">
          {t.prizes.map((p, i) => (
            <li key={i}>
              Hạng {i + 1}: <strong>{p.toLocaleString("vi-VN")} xu</strong>
              {i === 0 && " + khung Quán quân"}
            </li>
          ))}
        </ol>
        <ArenaClient
          id={t.id}
          status={t.status as "scheduled" | "running" | "finished"}
          startsAt={t.startsAt.getTime()}
          endsAt={t.endsAt.getTime()}
          user={user ? toSessionUser(user) : null}
          joined={joined}
        />
      </header>

      <section className={`card ${styles.tableCard}`} aria-labelledby="standings">
        <h2 id="standings" className={styles.h2}>Bảng điểm {t.status === "finished" && "chung cuộc"}</h2>
        {rows.length === 0 ? (
          <p className="muted">Chưa có ai đăng ký.</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Hạng</th>
                  <th scope="col">Kỳ thủ</th>
                  <th scope="col" className={styles.num}>Điểm</th>
                  <th scope="col" className={styles.num}>Ván</th>
                  <th scope="col" className={styles.num}>Thắng · Hòa · Thua</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.userId} data-me={r.userId === user?.id || undefined}>
                    <td>{i + 1}</td>
                    <td>
                      <Link href={`/u/${r.username}`} className={styles.player}>
                        <Avatar avatar={r.avatar} frame={r.frame} size={32} />
                        <span>
                          <strong>{r.displayName}</strong> <span className="muted">{r.rating}</span>
                        </span>
                      </Link>
                    </td>
                    <td className={styles.num}><strong>{r.score}</strong></td>
                    <td className={styles.num}>{r.games}</td>
                    <td className={styles.num}>{r.wins} · {r.draws} · {r.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Link href="/tournaments" className="btn">← Tất cả giải đấu</Link>
    </>
  );
}
