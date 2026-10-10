import type { Metadata } from "next";
import { MockPay } from "./MockPay";
import styles from "../payment.module.css";

export const metadata: Metadata = { title: "Thanh toán giả lập" };

/** Cổng thanh toán giả lập (chỉ khi PAYMENT_PROVIDER=mock) để thử luồng mua hàng khi phát triển. */
export default function MockPaymentPage() {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <span className={styles.seal}>試</span>
        <h1>Cổng thanh toán giả lập</h1>
        <p className="muted">Chỉ dùng khi phát triển. Không có tiền thật nào bị trừ.</p>
        <MockPay />
      </div>
    </main>
  );
}
