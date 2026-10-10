import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { toSessionUser } from "@/server/auth";
import { getCurrentUser } from "@/server/current-user";
import { oauthProviders } from "@/server/oauth";
import { SettingsClient } from "./SettingsClient";
import styles from "./settings.module.css";

export const metadata: Metadata = { title: "Cài đặt tài khoản" };

export default function SettingsPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Cài đặt tài khoản</h1>
      <Suspense fallback={<p className="muted">Đang tải…</p>}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <p className="muted">
        Bạn chưa đăng nhập. <Link href="/login?next=/settings" className={styles.link}>Đăng nhập</Link>
      </p>
    );
  }
  if (user.isGuest) {
    return (
      <p className="muted">
        Bạn đang dùng tài khoản khách. <Link href="/register?next=/settings" className={styles.link}>Tạo tài khoản</Link> để lưu
        Elo, đổi tên và avatar.
      </p>
    );
  }
  return <SettingsClient user={toSessionUser(user)} providers={oauthProviders().map((p) => ({ id: p.id, name: p.name }))} />;
}
