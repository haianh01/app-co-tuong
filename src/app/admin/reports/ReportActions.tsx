"use client";

import { useState, useTransition } from "react";
import { adminResolveReport, type AdminResult } from "@/app/actions/admin";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "../admin.module.css";

export function ReportActions({ id }: { id: number }) {
  const hydrated = useHydrated();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AdminResult | null>(null);
  if (result?.ok) return <span className={styles.ok}>{result.message}</span>;
  return (
    <>
      <button type="button" className="btn btn-primary" disabled={pending || !hydrated} onClick={() => start(async () => setResult(await adminResolveReport(id, "resolved")))}>
        Đã xử lý
      </button>
      <button type="button" className="btn" disabled={pending || !hydrated} onClick={() => start(async () => setResult(await adminResolveReport(id, "dismissed")))}>
        Bỏ qua
      </button>
      {result && <span className={styles.error}>{result.message}</span>}
    </>
  );
}
