"use client";

import { useEffect, useState } from "react";
import type { Side } from "@/lib/xiangqi/engine";

/**
 * Đồng hồ hai bên. Đồng hồ của phe `turn` chạy khi chưa `stopped` và chưa ai hết giờ.
 * `initialMs = 0` nghĩa là không giới hạn thời gian.
 */
export function useClock(initialMs: number, turn: Side, stopped: boolean) {
  const [time, setTime] = useState({ r: initialMs, b: initialMs });
  const limited = initialMs > 0;
  const flagged: Side | null = !limited ? null : time.r <= 0 ? "r" : time.b <= 0 ? "b" : null;
  const running: Side | null = limited && !stopped && !flagged ? turn : null;

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      setTime((t) => ({ ...t, [running]: Math.max(0, t[running] - elapsed) }));
    }, 200);
    return () => clearInterval(id);
  }, [running]);

  return { time, flagged, running, limited };
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
