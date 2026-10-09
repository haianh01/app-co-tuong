import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.brand}>© {SITE_NAME} · Cờ tướng online</span>
        <nav aria-label="Thông tin" className={styles.links}>
          <Link href="/dieu-khoan">Điều khoản sử dụng</Link>
          <Link href="/quyen-rieng-tu">Quyền riêng tư</Link>
          {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>Liên hệ</a>}
        </nav>
      </div>
    </footer>
  );
}
