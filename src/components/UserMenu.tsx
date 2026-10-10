"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "./Avatar";
import { SoundToggle } from "./SoundToggle";
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
        <SoundToggle />
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={`btn ${styles.small}`}>Đăng nhập</Link>
        <Link href={`/register?next=${encodeURIComponent(next)}`} className={`btn btn-primary ${styles.small}`}>Đăng ký</Link>
      </>
    );
  }

  return (
    <>
      <SoundToggle />
      {!user.isGuest && (
        <Link href="/shop" className={styles.coins} aria-label={`${user.coins} xu, mở cửa hàng`}>
          <span aria-hidden="true">◎</span> {user.coins.toLocaleString("vi-VN")}
        </Link>
      )}
      <Link href={user.isGuest ? "/register?next=/online" : "/settings"} className={styles.user}>
        <Avatar avatar={user.avatar} frame={user.frame} size={36} />
        <span className={styles.userText}>
          <strong>{user.displayName}</strong>
          <span>{user.isGuest ? "Khách · Lưu tài khoản" : `Elo ${user.rating}${user.vipUntil ? " · VIP" : ""}`}</span>
        </span>
      </Link>
      {user.isAdmin && <Link href="/admin" className={`btn ${styles.small}`}>Quản trị</Link>}
      <button type="button" className={`btn ${styles.small}`} onClick={logout}>Đăng xuất</button>
    </>
  );
}
