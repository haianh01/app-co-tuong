"use client";

import { useState, useSyncExternalStore } from "react";
import styles from "./invite.module.css";

const noop = () => () => {};

/** Link mời kèm nút sao chép / chia sẻ (Zalo, Messenger… qua menu chia sẻ của điện thoại). */
export function InviteLink({ code }: { code: string }) {
  const origin = useSyncExternalStore(noop, () => location.origin, () => "");
  const url = `${origin}/challenge/${code}`;
  const [copied, setCopied] = useState(false);
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Trình duyệt chặn clipboard: người dùng tự bôi đen ô link.
    }
  };

  return (
    <div className={styles.link}>
      <input readOnly value={url} aria-label="Link mời" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn" onClick={copy}>{copied ? "Đã chép" : "Sao chép"}</button>
      {canShare && (
        <button type="button" className="btn" onClick={() => navigator.share({ title: "Mời chơi cờ tướng", url }).catch(() => {})}>
          Chia sẻ
        </button>
      )}
    </div>
  );
}
