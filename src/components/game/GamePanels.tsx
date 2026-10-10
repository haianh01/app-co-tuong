"use client";

import { ReactNode, useEffect, useRef } from "react";
import { Avatar } from "@/components/Avatar";
import type { Piece } from "@/lib/xiangqi/engine";
import type { PlayedMove } from "@/lib/xiangqi/game";
import { PIECE_CHAR } from "@/lib/xiangqi/notation";
import styles from "./GamePanels.module.css";

export function PlayerCard({
  name, subtitle, avatar, avatarHan = false, avatarId, frameId, clock, clockActive, clockLow, captured, highlight = false, className = "",
}: {
  name: string;
  subtitle: string;
  /** Chữ hiển thị khi không có avatar thật (vd. "機" cho máy). */
  avatar: string;
  avatarHan?: boolean;
  /** Avatar và khung của người chơi thật (xem lib/skins). */
  avatarId?: string;
  frameId?: string;
  clock: string | null;
  clockActive: boolean;
  clockLow: boolean;
  captured: Piece[];
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`card ${styles.player} ${className}`}>
      <div className={styles.who}>
        {avatarId ? (
          <Avatar avatar={avatarId} frame={frameId} size={48} />
        ) : (
          <span className={`${styles.avatar} ${highlight ? styles.avatarMe : ""} ${avatarHan ? styles.han : ""}`}>{avatar}</span>
        )}
        <span className={styles.names}>
          <strong>{name}</strong>
          <span className={highlight ? styles.goldText : "muted"}>{subtitle}</span>
        </span>
      </div>
      {clock !== null && (
        <div className={styles.clock} data-active={clockActive || undefined} data-low={clockLow || undefined}>
          <span>Thời gian</span>
          <strong>{clock}</strong>
        </div>
      )}
      <div className={styles.captured}>
        <span className="muted">Quân đã ăn</span>
        <div className={styles.capturedRow}>
          {captured.map((p, i) => (
            <span key={i} className={styles.mini} data-red={p === p.toUpperCase() || undefined}>
              {PIECE_CHAR[p]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

interface MoveCell {
  text: string;
  /** Số nửa nước tính tới hết nước này (vị trí sau nước đi). */
  ply: number;
}

/**
 * Biên bản ván đấu. Có `onSelect` thì từng nước bấm được (xem lại ván), `current` là nửa nước đang xem.
 * Chỉ cuộn trong khung biên bản, không kéo cả trang (quan trọng trên điện thoại).
 */
export function MoveList({ moves, current, onSelect }: { moves: PlayedMove[]; current?: number; onSelect?: (ply: number) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const el = current !== undefined ? box.querySelector<HTMLElement>('[aria-current="step"]') : null;
    if (!el) {
      if (current === undefined || current === moves.length) box.scrollTop = box.scrollHeight;
      return;
    }
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
    }
  }, [moves.length, current]);

  const rows: { n: number; red?: MoveCell; black?: MoveCell }[] = [];
  moves.forEach((m, i) => {
    if (m.side === "r" || rows.length === 0) rows.push({ n: rows.length + 1 });
    rows[rows.length - 1][m.side === "r" ? "red" : "black"] = { text: m.notation, ply: i + 1 };
    if (i === 0 && m.side === "b") rows[0].red = { text: "…", ply: 0 };
  });

  const cell = (c: MoveCell | undefined, red: boolean) => {
    if (!c) return <span />;
    const cls = red ? styles.redMove : undefined;
    if (!onSelect || c.ply === 0) return <span className={cls}>{c.text}</span>;
    return (
      <button
        type="button"
        className={`${styles.moveButton} ${cls ?? ""}`}
        aria-current={c.ply === current ? "step" : undefined}
        onClick={() => onSelect(c.ply)}
      >
        {c.text}
      </button>
    );
  };

  return (
    <div ref={boxRef} className={styles.moves} aria-label="Biên bản ván đấu">
      {rows.length === 0 && <p className={styles.empty}>Chưa có nước đi nào.</p>}
      {rows.map((r) => (
        <div key={r.n} className={styles.moveRow}>
          <span className="muted">{r.n}.</span>
          {cell(r.red, true)}
          {cell(r.black, false)}
        </div>
      ))}
    </div>
  );
}

export function ResultOverlay({ seal, title, detail, children }: { seal: string; title: string; detail: string; children: ReactNode }) {
  return (
    <div className={styles.overlay} role="dialog" aria-label={title}>
      <div className={styles.result}>
        <span className={styles.resultSeal}>{seal}</span>
        <strong className={styles.resultTitle}>{title}</strong>
        <span className="muted">{detail}</span>
        <div className={styles.resultActions}>{children}</div>
      </div>
    </div>
  );
}
