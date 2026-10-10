import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/RecoveryForms";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = { title: "Đặt mật khẩu mới" };

export default function ResetPasswordPage() {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <div className={styles.head}>
          <span className={`seal ${styles.logo}`} aria-hidden="true">帥</span>
          <h1 className={styles.title}>Đặt mật khẩu mới</h1>
          <p className="muted">Sau khi đặt lại, bạn sẽ được đăng xuất khỏi mọi thiết bị.</p>
        </div>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
