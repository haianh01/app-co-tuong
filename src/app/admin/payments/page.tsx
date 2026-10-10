import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { findProduct, formatVnd } from "@/lib/products";
import { getDb } from "@/server/db";
import { listPayments } from "@/server/payments";
import { AdminGate, AdminNav } from "../AdminGate";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Quản trị · Thanh toán" };

const STATUS = { pending: "Chờ thanh toán", paid: "Đã thanh toán", failed: "Thất bại" } as Record<string, string>;

export default function AdminPaymentsPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Thanh toán</h1>
      <AdminNav current="payments" />
      <Suspense fallback={<p className="muted">Đang tải…</p>}>
        <AdminGate>{() => <Payments />}</AdminGate>
      </Suspense>
    </main>
  );
}

async function Payments() {
  await connection();
  const rows = await listPayments(await getDb(), 100);
  return (
    <div className={`card ${styles.tableCard}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Mã</th>
            <th scope="col">Người mua</th>
            <th scope="col">Sản phẩm</th>
            <th scope="col">Số tiền</th>
            <th scope="col">Trạng thái</th>
            <th scope="col">Thời gian</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><code>{p.id}</code></td>
              <td>@{p.username}</td>
              <td>{findProduct(p.product)?.name ?? p.product}</td>
              <td>{formatVnd(p.amount)}</td>
              <td>{STATUS[p.status] ?? p.status} · {p.provider}</td>
              <td>{p.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">Chưa có giao dịch nào.</p>}
    </div>
  );
}
