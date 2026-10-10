import type { Metadata } from "next";
import { Suspense } from "react";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LoginNotice } from "@/components/auth/RecoveryForms";
import { LoginForm } from "@/components/auth/AuthForms";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <div className={styles.head}>
          <span className={`seal ${styles.logo}`} aria-hidden="true">帥</span>
          <h1 className={styles.title}>Đăng nhập</h1>
          <p className="muted">Đăng nhập để đấu xếp hạng với người thật.</p>
        </div>
        <LoginNotice />
        <LoginForm />
        <Suspense>
          <OAuthButtons />
        </Suspense>
      </div>
    </main>
  );
}
