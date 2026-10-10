import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { reportReasonName } from "@/lib/reports";
import { listReports } from "@/server/admin";
import { getDb } from "@/server/db";
import { AdminGate, AdminNav } from "../AdminGate";
import { ReportActions } from "./ReportActions";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Quản trị · Báo cáo" };

export default function AdminReportsPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Báo cáo vi phạm</h1>
      <AdminNav current="reports" />
      <Suspense fallback={<p className="muted">Đang tải…</p>}>
        <AdminGate>{() => <Reports />}</AdminGate>
      </Suspense>
    </main>
  );
}

async function Reports() {
  await connection();
  const rows = await listReports(await getDb(), "open", 100);
  if (!rows.length) return <p className="muted">Không có báo cáo nào đang chờ xử lý.</p>;
  return (
    <ul className={styles.cards}>
      {rows.map((r) => (
        <li key={r.id} className={`card ${styles.reportCard}`}>
          <div>
            <strong>{reportReasonName(r.reason)}</strong>
            <span className="muted"> · {r.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</span>
          </div>
          <div>
            Bị báo cáo: <Link href={`/u/${r.target.username}`} className={styles.link}>{r.target.displayName}</Link> · Người báo cáo:{" "}
            <Link href={`/u/${r.reporter.username}`} className={styles.link}>{r.reporter.displayName}</Link>
            {r.gameId && <> · <Link href={`/game/${r.gameId}`} className={styles.link}>Xem ván (có AI phân tích độ chính xác)</Link></>}
          </div>
          {r.note && <p className={styles.note}>“{r.note}”</p>}
          <div className={styles.inline}>
            <Link href={`/admin/users?q=${encodeURIComponent(r.target.username)}`} className="btn">Khóa / xem người chơi</Link>
            <ReportActions id={r.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}
