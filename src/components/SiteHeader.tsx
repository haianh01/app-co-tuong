import Link from "next/link";
import { Suspense } from "react";
import { NavLinks, NavList } from "./NavLinks";
import { UserMenu } from "./UserMenu";
import styles from "./SiteHeader.module.css";

// Header hoàn toàn tĩnh (prerender được); phần tài khoản do client tự tải qua /api/me.
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={`seal ${styles.logo}`} aria-hidden="true">帥</span>
          <span className={styles.name}>Kỳ Đài</span>
        </Link>
        <Suspense fallback={<NavList pathname={null} />}>
          <NavLinks />
        </Suspense>
        <div className={styles.account}>
          <Suspense fallback={<span className={styles.placeholder} />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
