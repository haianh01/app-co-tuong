import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/AuthForms";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = { title: "Đăng ký" };

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <div className={styles.head}>
          <span className={`seal ${styles.logo}`} aria-hidden="true">帥</span>
          <h1 className={styles.title}>Tạo tài khoản</h1>
          <p className="muted">Miễn phí. Bắt đầu với 1.500 điểm Elo.</p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
