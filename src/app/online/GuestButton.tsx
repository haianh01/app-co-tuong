"use client";

import { useState, useTransition } from "react";
import { playAsGuest } from "@/app/actions/auth";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./online.module.css";

export function GuestButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();
  return (
    <div className={styles.guest}>
      <button
        type="button"
        className={styles.guestButton}
        disabled={pending || !hydrated}
        onClick={() =>
          start(async () => {
            const res = await playAsGuest();
            if (res?.error) setError(res.error);
          })
        }
      >
        {pending ? "Đang vào…" : "Chơi thử không cần tài khoản"}
      </button>
      {error && <p className={styles.warn} role="alert">{error}</p>}
    </div>
  );
}
