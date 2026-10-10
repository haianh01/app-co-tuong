import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CHALLENGE_CODE } from "@/lib/online/protocol";
import { toSessionUser } from "@/server/auth";
import { getCurrentUser } from "@/server/current-user";
import { GuestButton } from "../../online/GuestButton";
import { ChallengeClient } from "./ChallengeClient";
import styles from "./challenge.module.css";

export const metadata: Metadata = { title: "Lời mời chơi cờ", robots: { index: false } };

export default function ChallengePage({ params }: PageProps<"/challenge/[code]">) {
  return (
    <main className={styles.main}>
      <Suspense fallback={<p className="muted">Đang tải lời mời…</p>}>
        <Gate params={params} />
      </Suspense>
    </main>
  );
}

async function Gate({ params }: Pick<PageProps<"/challenge/[code]">, "params">) {
  const { code } = await params;
  if (!CHALLENGE_CODE.test(code)) {
    return (
      <section className={`card ${styles.card}`}>
        <h1 className={styles.title}>Link mời không hợp lệ</h1>
        <Link href="/online" className="btn btn-primary">Về sảnh online</Link>
      </section>
    );
  }
  const user = await getCurrentUser();
  if (user) return <ChallengeClient code={code} user={toSessionUser(user)} />;
  const here = `/challenge/${code}`;
  return (
    <section className={`card ${styles.card}`}>
      <span className={`seal ${styles.seal}`} aria-hidden="true">好友</span>
      <h1 className={styles.title}>Bạn được mời chơi cờ tướng</h1>
      <p className="muted">Đăng nhập để nhận lời, hoặc chơi ngay với tư cách khách (ván giao hữu, không cần đăng ký).</p>
      <div className={styles.actions}>
        <Link href={`/login?next=${encodeURIComponent(here)}`} className="btn btn-primary">Đăng nhập</Link>
        <Link href={`/register?next=${encodeURIComponent(here)}`} className="btn">Tạo tài khoản</Link>
      </div>
      <GuestButton next={here} label="Chơi ngay với tư cách khách" />
    </section>
  );
}
