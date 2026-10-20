// Đồng hồ ván cờ tự tính theo nước đi đọc được (không chép từ trang nguồn): mỗi bên có tổng thời gian (vd. 15 phút)
// và mỗi nước tối đa một khoảng (vd. 1 phút). Bên đang tới lượt bị trừ giờ; phát hiện nước đi thì chốt thời gian bên
// vừa đi đã dùng và chuyển sang bên kia, đồng hồ từng nước đặt lại.

import type { Side } from "@/lib/xiangqi/engine";

export interface TimeControl {
  totalMs: number;
  perMoveMs: number;
}

export const DEFAULT_TIME_CONTROL: TimeControl = { totalMs: 15 * 60_000, perMoveMs: 60_000 };

export interface GameClock {
  control: TimeControl;
  /** Thời gian còn lại của mỗi bên, tính tới lúc `since`. */
  remaining: Record<Side, number>;
  /** Bên đang bị trừ giờ; null = đồng hồ dừng (chưa bắt đầu / hết ván). */
  running: Side | null;
  /** Lúc bên `running` bắt đầu nước hiện tại (ms). */
  since: number;
}

/**
 * Bắt đầu đồng hồ: `toMove` bắt đầu bị trừ giờ từ `now`. `remaining` cho trước khi vào giữa ván (đọc được từ màn hình
 * một lần), không thì mỗi bên đủ tổng thời gian.
 */
export function startClock(control: TimeControl, toMove: Side | null, now: number, remaining?: Partial<Record<Side, number>>): GameClock {
  return {
    control,
    remaining: { r: remaining?.r ?? control.totalMs, b: remaining?.b ?? control.totalMs },
    running: toMove,
    since: now,
  };
}

/** Bên `mover` vừa đi xong lúc `now`: trừ thời gian đã dùng, chuyển lượt. */
export function clockAfterMove(clock: GameClock, mover: Side, now: number): GameClock {
  const next: Side = mover === "r" ? "b" : "r";
  const used = clock.running === mover ? Math.max(0, now - clock.since) : 0;
  return {
    ...clock,
    remaining: { ...clock.remaining, [mover]: Math.max(0, clock.remaining[mover] - used) },
    running: next,
    since: now,
  };
}

/** Dừng đồng hồ (hết ván), chốt thời gian bên đang chạy. */
export function stopClock(clock: GameClock, now: number): GameClock {
  if (!clock.running) return clock;
  const side = clock.running;
  return {
    ...clock,
    remaining: { ...clock.remaining, [side]: Math.max(0, clock.remaining[side] - Math.max(0, now - clock.since)) },
    running: null,
    since: now,
  };
}

/** Giờ hiển thị lúc `now`: tổng còn lại của mỗi bên, và thời gian còn cho nước hiện tại của bên đang chạy. */
export function readClock(clock: GameClock, now: number): { total: Record<Side, number>; perMove: number | null } {
  const elapsed = Math.max(0, now - clock.since);
  const total = { ...clock.remaining };
  if (clock.running) total[clock.running] = Math.max(0, total[clock.running] - elapsed);
  return { total, perMove: clock.running ? Math.max(0, clock.control.perMoveMs - elapsed) : null };
}
