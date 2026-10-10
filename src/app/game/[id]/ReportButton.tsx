"use client";

import { useState, useTransition } from "react";
import { reportPlayer } from "@/app/actions/reports";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";
import { useSession } from "@/components/session/SessionProvider";
import styles from "./game.module.css";

export function ReportButton({ targetId, targetName, gameId }: { targetId: string; targetName: string; gameId: string }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("cheating");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  if (!user) return null;
  if (result?.ok) return <p className={styles.offer}>{result.message}</p>;
  if (!open) {
    return (
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
        Báo cáo {targetName}
      </button>
    );
  }
  return (
    <form
      className={styles.report}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await reportPlayer({ targetId, gameId, reason, note })));
      }}
    >
      <label htmlFor="report-reason">Lý do báo cáo {targetName}</label>
      <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
        {REPORT_REASONS.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <label htmlFor="report-note">Ghi chú (không bắt buộc)</label>
      <textarea id="report-note" maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      {result && !result.ok && <p className={styles.warn} role="alert">{result.message}</p>}
      <div className={styles.reportActions}>
        <button type="submit" className="btn btn-danger" disabled={pending}>{pending ? "Đang gửi…" : "Gửi báo cáo"}</button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>Hủy</button>
      </div>
    </form>
  );
}
