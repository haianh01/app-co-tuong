import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { toSessionUser } from "@/server/auth";
import { getCurrentUser } from "@/server/current-user";
import { GuestButton } from "./GuestButton";
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
  if (user) return <OnlineLobby user={toSessionUser(user)} />;
  return (
    <section className={`card ${styles.prompt}`}>
      <span className={`seal ${styles.promptSeal}`} aria-hidden="true">排位</span>
      <h1 className={styles.title}>Đấu xếp hạng với người thật</h1>
      <p className="muted">Tạo tài khoản miễn phí để lưu Elo và lịch sử ván đấu. Muốn thử trước? Chơi ván giao hữu ngay, không cần đăng ký.</p>
      <div className={styles.promptActions}>
        <Link href="/register?next=/online" className="btn btn-primary">Tạo tài khoản</Link>
        <Link href="/login?next=/online" className="btn">Đăng nhập</Link>
      </div>
      <GuestButton />
    </section>
  );
}
