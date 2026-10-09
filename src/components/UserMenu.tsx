"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./session/SessionProvider";
import styles from "./SiteHeader.module.css";

export function UserMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser } = useSession();

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
