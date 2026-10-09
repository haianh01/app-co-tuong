import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/server/current-user";
import { OnlineLobby } from "./OnlineLobby";
import styles from "./online.module.css";

export const metadata: Metadata = { title: "Đấu online" };

export default function OnlinePage() {
  return (
    <main className={styles.main}>
      <Suspense fallback={<p className="muted">Đang tải…</p>}>
        <OnlineGate />
      </Suspense>
    </main>
  );
}

async function OnlineGate() {
  const user = await getCurrentUser();
  if (user) return <OnlineLobby user={user} />;
  return (
    <section className={`card ${styles.prompt}`}>
      <span className={`seal ${styles.promptSeal}`} aria-hidden="true">排位</span>
      <h1 className={styles.title}>Đấu xếp hạng với người thật</h1>
      <p className="muted">Cần có tài khoản để lưu Elo và lịch sử ván đấu. Đăng ký miễn phí, chỉ mất 10 giây.</p>
      <div className={styles.promptActions}>
        <Link href="/register?next=/online" className="btn btn-primary">Tạo tài khoản</Link>
        <Link href="/login?next=/online" className="btn">Đăng nhập</Link>
      </div>
    </section>
  );
}
