import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/server/current-user";
import styles from "./admin.module.css";

/** Chỉ hiện nội dung cho quản trị viên (gọi trong `<Suspense>`). */
export async function AdminGate({ children }: { children: (adminId: string) => ReactNode }) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return (
      <p className="muted">
        Trang này chỉ dành cho quản trị viên. <Link href="/" className={styles.link}>Về trang chủ</Link>
      </p>
    );
  }
  return <>{children(user.id)}</>;
}

export function AdminNav({ current }: { current: "home" | "users" | "reports" | "payments" | "tournaments" }) {
  const links = [
    { id: "home", href: "/admin", label: "Tổng quan" },
    { id: "users", href: "/admin/users", label: "Người chơi" },
    { id: "reports", href: "/admin/reports", label: "Báo cáo" },
    { id: "payments", href: "/admin/payments", label: "Thanh toán" },
    { id: "tournaments", href: "/admin/tournaments", label: "Giải đấu" },
  ];
  return (
    <nav className={styles.nav} aria-label="Quản trị">
      {links.map((l) => (
        <Link key={l.id} href={l.href} aria-current={l.id === current ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
