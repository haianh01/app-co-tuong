import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatVnd } from "@/lib/products";
import { adminStats, listReports } from "@/server/admin";
import { getDb } from "@/server/db";
import { AdminGate, AdminNav } from "./AdminGate";
import styles from "./admin.module.css";

export const metadata: Metadata = { title: "Quản trị" };

export default function AdminPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Quản trị</h1>
      <AdminNav current="home" />
      <Suspense fallback={<p className="muted">Đang tải…</p>}>
        <AdminGate>{() => <Overview />}</AdminGate>
      </Suspense>
    </main>
  );
}

async function Overview() {
  await connection();
  const db = await getDb();
  const [stats, reports] = await Promise.all([adminStats(db), listReports(db, "open", 5)]);
  const cards = [
    ["Tài khoản", stats.users.toLocaleString("vi-VN")],
    ["Tổng số ván", stats.games.toLocaleString("vi-VN")],
    ["Ván 24 giờ qua", stats.games24h.toLocaleString("vi-VN")],
    ["Báo cáo chờ xử lý", stats.openReports.toLocaleString("vi-VN")],
    ["Doanh thu", formatVnd(stats.revenue)],
  ];
  return (
    <>
      <div className={styles.stats}>
        {cards.map(([label, value]) => (
          <div key={label} className={`card ${styles.stat}`}>
            <span className="muted">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className={`card ${styles.section}`}>
        <h2>Báo cáo mới</h2>
        {reports.length === 0 && <p className="muted">Không có báo cáo nào đang chờ.</p>}
        <ul className={styles.list}>
          {reports.map((r) => (
            <li key={r.id}>
              <strong>{r.target.displayName}</strong> (@{r.target.username}) bị báo cáo bởi {r.reporter.displayName}
              {r.gameId && <> · <Link href={`/game/${r.gameId}`} className={styles.link}>xem ván</Link></>}
            </li>
          ))}
        </ul>
        <Link href="/admin/reports" className="btn">Xử lý báo cáo</Link>
      </section>
    </>
  );
}
