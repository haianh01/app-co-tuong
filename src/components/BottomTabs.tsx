"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./BottomTabs.module.css";

const TABS = [
  { href: "/", label: "Sảnh", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", match: ["/"] },
  { href: "/online", label: "Online", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18", match: ["/online", "/game", "/tournaments", "/challenge"] },
  { href: "/play", label: "Chơi máy", icon: "M5 7h14v10H5zM9 21h6M12 17v4M9 11h.01M15 11h.01", match: ["/play"] },
  { href: "/puzzle", label: "Cờ thế", icon: "M4 4h16v16H4zM4 12h16M12 4v16", match: ["/puzzle"] },
  { href: "/leaderboard", label: "Xếp hạng", icon: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4", match: ["/leaderboard", "/u/"] },
];

/** Thanh tab dưới đáy màn hình (chỉ hiện trên điện thoại), giống các app cờ. */
export function BottomTabs({ pathname }: { pathname: string | null }) {
  return (
    <nav className={styles.tabs} aria-label="Điều hướng nhanh">
      {TABS.map((t) => {
        const active = pathname !== null && (t.href === "/" ? pathname === "/" : t.match.some((m) => pathname.startsWith(m)));
        return (
          <Link key={t.href} href={t.href} className={styles.tab} aria-current={active ? "page" : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomTabsLive() {
  return <BottomTabs pathname={usePathname()} />;
}
