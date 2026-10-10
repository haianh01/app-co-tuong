"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./SiteHeader.module.css";

const LINKS = [
  { href: "/", label: "Sảnh" },
  { href: "/online", label: "Đấu online", also: ["/game", "/challenge"] },
  { href: "/tournaments", label: "Giải đấu" },
  { href: "/play", label: "Chơi với máy" },
  { href: "/puzzle", label: "Cờ thế" },
  { href: "/leaderboard", label: "Xếp hạng", also: ["/u/"] },
];

/** Menu chính; `pathname = null` khi chưa biết đường dẫn (bản prerender của route động). */
export function NavList({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Điều hướng chính" className={styles.nav}>
      {LINKS.map((l) => {
        const active = pathname !== null && (l.href === "/"
          ? pathname === "/"
          : [l.href, ...(l.also ?? [])].some((p) => pathname.startsWith(p)));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={active ? `${styles.link} ${styles.active}` : styles.link}
            aria-current={active ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavLinks() {
  return <NavList pathname={usePathname()} />;
}
