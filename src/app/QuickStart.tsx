"use client";

import Link from "next/link";
import { useState } from "react";
import { AI_LEVELS, AiLevel } from "@/lib/xiangqi/ai";
import { PlaySettings, TIME_OPTIONS, settingsHref } from "./play/settings";
import styles from "./page.module.css";

export function QuickStart() {
  const [s, setS] = useState<PlaySettings>({ level: 3, side: "r", minutes: 10 });

  return (
    <div className={styles.quick}>
      <div className={styles.quickGroup} role="group" aria-label="Thời gian mỗi bên">
        <span className={styles.quickLabel}>Thời gian</span>
        <div className={styles.chips}>
          {TIME_OPTIONS.map((t) => (
            <button key={t.minutes} type="button" className={styles.chip} aria-pressed={s.minutes === t.minutes} onClick={() => setS({ ...s, minutes: t.minutes })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.quickGroup} role="group" aria-label="Cấp độ máy">
        <span className={styles.quickLabel}>Cấp độ máy</span>
        <div className={styles.chips}>
          {(Object.keys(AI_LEVELS).map(Number) as AiLevel[]).map((l) => (
            <button key={l} type="button" className={styles.chip} aria-pressed={s.level === l} onClick={() => setS({ ...s, level: l })}>
              {AI_LEVELS[l].label}
            </button>
          ))}
        </div>
      </div>
      <Link href={settingsHref(s)} className={`btn btn-primary ${styles.cta}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l12 8-12 8z" /></svg>
        Vào trận với máy
      </Link>
    </div>
  );
}
