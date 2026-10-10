import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/RecoveryForms";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <div className={styles.head}>
          <span className={`seal ${styles.logo}`} aria-hidden="true">帥</span>
          <h1 className={styles.title}>Quên mật khẩu</h1>
          <p className="muted">Nhập email đã xác nhận, chúng tôi sẽ gửi link đặt mật khẩu mới.</p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
