import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { findProduct, formatVnd } from "@/lib/products";
import { getDb } from "@/server/db";
import { completePayment, getPayment, vnpayConfig, vnpayVerify } from "@/server/payments";
import styles from "../payment.module.css";

export const metadata: Metadata = { title: "Kết quả thanh toán" };

export default function PaymentReturnPage({ searchParams }: PageProps<"/payment/return">) {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <Suspense fallback={<p className="muted">Đang kiểm tra giao dịch…</p>}>
          <Result searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/** VNPay chuyển người dùng về đây. Kết quả chỉ tin khi chữ ký hợp lệ; IPN mới là nguồn chính để cấp hàng. */
async function Result({ searchParams }: Pick<PageProps<"/payment/return">, "searchParams">) {
  const raw = await searchParams;
  await connection();
  const params = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  const valid = vnpayVerify(params, vnpayConfig().hashSecret);
  const db = await getDb();
  const payment = valid ? await getPayment(db, params.vnp_TxnRef) : null;
  const success = valid && params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00";
  if (payment && success && payment.status === "pending" && Number(params.vnp_Amount) === payment.amount * 100) {
    // Phòng khi IPN đến chậm: cấp hàng ngay (an toàn vì completePayment chỉ cấp một lần).
    await completePayment(db, payment.id, { amount: payment.amount, providerRef: params.vnp_TransactionNo, raw: params });
  }
  const product = payment ? findProduct(payment.product) : null;
  return (
    <>
      <span className={styles.seal} data-ok={success || undefined}>{success ? "成" : "敗"}</span>
      <h1>{success ? "Thanh toán thành công" : "Thanh toán không thành công"}</h1>
      {product && <p className="muted">{product.name} · {formatVnd(product.amount)} · Mã giao dịch {payment!.id}</p>}
      {!valid && <p className="muted">Không xác minh được kết quả từ cổng thanh toán. Nếu tiền đã bị trừ, vui lòng liên hệ hỗ trợ kèm mã giao dịch.</p>}
      <Link href="/shop" className="btn btn-primary">Về cửa hàng</Link>
    </>
  );
}
