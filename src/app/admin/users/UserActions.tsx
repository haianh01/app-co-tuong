"use client";

import { useState, useTransition } from "react";
import { adminBan, adminGrantCoins, adminSetRole, adminUnban, type AdminResult } from "@/app/actions/admin";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "../admin.module.css";

export function UserActions({ userId, banned, admin }: { userId: string; banned: boolean; admin: boolean }) {
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState("");
  const [coins, setCoins] = useState(0);
  const run = (fn: () => Promise<AdminResult>) => start(async () => setResult(await fn()));
  const busy = pending || !hydrated;

  return (
    <div className={styles.actions}>
      {banned ? (
        <button type="button" className="btn" disabled={busy} onClick={() => run(() => adminUnban(userId))}>Mở khóa</button>
      ) : (
        <div className={styles.inline}>
          <select aria-label="Thời hạn khóa" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={24}>1 ngày</option>
            <option value={24 * 7}>7 ngày</option>
            <option value={24 * 30}>30 ngày</option>
            <option value={24 * 3650}>Vĩnh viễn</option>
          </select>
          <input aria-label="Lý do khóa" placeholder="Lý do" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run(() => adminBan(userId, hours, reason))}>Khóa</button>
        </div>
      )}
      <div className={styles.inline}>
        <input aria-label="Số xu cộng/trừ" type="number" value={coins} onChange={(e) => setCoins(Number(e.target.value))} />
        <button type="button" className="btn" disabled={busy || !coins} onClick={() => run(() => adminGrantCoins(userId, coins))}>Cộng xu</button>
      </div>
      <button type="button" className="btn" disabled={busy} onClick={() => run(() => adminSetRole(userId, admin ? "user" : "admin"))}>
        {admin ? "Bỏ quyền quản trị" : "Cấp quyền quản trị"}
      </button>
      {result && <span className={result.ok ? styles.ok : styles.error}>{result.message}</span>}
    </div>
  );
}
