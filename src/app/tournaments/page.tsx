import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { tcLabel } from "@/lib/online/protocol";
import { getDb } from "@/server/db";
import { ARENA_SCHEDULE, listTournaments, type Tournament } from "@/server/tournaments";
import styles from "./tournaments.module.css";

export const metadata: Metadata = { title: "Giải đấu" };

const time = (d: Date) => d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const date = (d: Date) => d.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

export default function TournamentsPage() {
  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <span className={styles.kicker}>GIẢI ĐẤU ARENA</span>
        <h1 className={styles.title}>Đấu liên tục, cộng điểm, nhận xu</h1>
        <p className="muted">
          Trong thời gian diễn ra giải, xong ván là được ghép ván mới ngay. Thắng 2 điểm, hòa 1 điểm; thắng liền 2 ván thì
          ván thắng tiếp theo được 4 điểm. Hết giờ, những người điểm cao nhất nhận xu, quán quân nhận khung avatar “Quán quân”.
        </p>
        <p className="muted">
          Lịch cố định: {ARENA_SCHEDULE.map((t) => `${t.name} lúc ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}${t.weekday === 0 ? " (Chủ nhật)" : ""}`).join(" · ")}.
        </p>
      </header>
      <Suspense fallback={<p className="muted">Đang tải giải đấu…</p>}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  await connection();
  const { live, upcoming, finished } = await listTournaments(await getDb());
  return (
    <>
      <Section title="Đang diễn ra" items={live} empty="Hiện không có giải nào đang diễn ra." live />
      <Section title="Sắp diễn ra" items={upcoming} empty="Chưa có lịch giải sắp tới." />
      {finished.length > 0 && <Section title="Vừa kết thúc" items={finished} empty="" />}
    </>
  );
}

function Section({ title, items, empty, live }: { title: string; items: Tournament[]; empty: string; live?: boolean }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.h2}>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((t) => (
            <li key={t.id}>
              <Link href={`/tournaments/${t.id}`} className={`card ${styles.item}`} data-live={live || undefined}>
                <span className={`seal ${styles.seal}`} aria-hidden="true">比賽</span>
                <span className={styles.itemText}>
                  <strong>{t.name}</strong>
                  <span className="muted">
                    {date(t.startsAt)} · {time(t.startsAt)}–{time(t.endsAt)} · {tcLabel(t.minutes, t.increment)}
                  </span>
                </span>
                <span className={styles.prize}>{t.prizes[0].toLocaleString("vi-VN")} xu</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
