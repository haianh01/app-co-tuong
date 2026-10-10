import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { confirmEmail } from "@/server/account";
import { getDb } from "@/server/db";
import styles from "@/components/auth/auth.module.css";

export const metadata: Metadata = { title: "Xác nhận email" };

export default function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return (
    <main className={styles.page}>
      <div className={`card ${styles.card}`}>
        <div className={styles.head}>
          <span className={`seal ${styles.logo}`} aria-hidden="true">帥</span>
          <h1 className={styles.title}>Xác nhận email</h1>
          <Suspense fallback={<p className="muted">Đang xác nhận…</p>}>
            <Verify searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function Verify({ searchParams }: Pick<PageProps<"/verify-email">, "searchParams">) {
  const { token } = await searchParams;
  await connection();
  const result = typeof token === "string" ? await confirmEmail(await getDb(), token) : "invalid";
  const message = {
    ok: "Email đã được xác nhận. Từ giờ bạn có thể dùng email này để khôi phục mật khẩu.",
    invalid: "Link xác nhận không hợp lệ hoặc đã hết hạn. Hãy gửi lại từ trang Cài đặt.",
    taken: "Email này vừa được một tài khoản khác xác nhận.",
  }[result];
  return (
    <>
      <p className={result === "ok" ? styles.formOk : styles.formError}>{message}</p>
      <Link href="/settings" className="btn">Về trang Cài đặt</Link>
    </>
  );
}
