"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { USER_REFRESH_EVENT } from "@/lib/events";
import type { PublicUser } from "@/server/auth";
import styles from "./SiteHeader.module.css";

/** Menu tài khoản: tải lại thông tin (tên, Elo) mỗi lần chuyển trang. */
export function UserMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/me", { cache: "no-store" })
        .then((r) => r.json() as Promise<{ user: PublicUser | null }>)
        .then((d) => {
          if (!cancelled) setUser(d.user);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener(USER_REFRESH_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(USER_REFRESH_EVENT, load);
    };
  }, [pathname]);

  const logout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setUser(null);
    router.push("/");
    router.refresh();
  };

  if (user === undefined) return <span className={styles.placeholder} />;

  if (!user) {
    const next = pathname.startsWith("/login") || pathname.startsWith("/register") ? "/online" : pathname;
    return (
      <>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={`btn ${styles.small}`}>Đăng nhập</Link>
        <Link href={`/register?next=${encodeURIComponent(next)}`} className={`btn btn-primary ${styles.small}`}>Đăng ký</Link>
      </>
    );
  }

  return (
    <>
      <Link href={`/u/${user.username}`} className={styles.user}>
        <span className={styles.avatar} aria-hidden="true">{user.displayName.slice(0, 1).toUpperCase()}</span>
        <span className={styles.userText}>
          <strong>{user.displayName}</strong>
          <span>Elo {user.rating}</span>
        </span>
      </Link>
      <button type="button" className={`btn ${styles.small}`} onClick={logout}>Đăng xuất</button>
    </>
  );
}
