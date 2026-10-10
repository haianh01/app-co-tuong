"use client";

import { useMuted } from "@/hooks/useGameSounds";
import styles from "./SiteHeader.module.css";

export function SoundToggle() {
  const [muted, setMuted] = useMuted();
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={muted ? "Bật âm thanh" : "Tắt âm thanh"}
      aria-pressed={!muted}
      onClick={() => setMuted(!muted)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9z" />
        {muted ? <path d="M17 9l5 5M22 9l-5 5" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
      </svg>
    </button>
  );
}
