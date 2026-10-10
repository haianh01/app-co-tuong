// Đồng hồ ván chơi với máy. Dùng đồng hồ giả (fake timers) nên không phải chờ thật.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Side } from "@/lib/xiangqi/engine";
import { formatClock, useClock } from "./useClock";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance", "Date"] });
});

const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

function setup(initialMs: number, turn: Side = "r", stopped = false) {
  return renderHook((p: { turn: Side; stopped: boolean }) => useClock(initialMs, p.turn, p.stopped), {
    initialProps: { turn, stopped },
  });
}

describe("useClock", () => {
  it("bắt đầu với đủ thời gian, đồng hồ của bên đến lượt chạy", () => {
    const { result } = setup(60_000);
    expect(result.current).toEqual({ time: { r: 60_000, b: 60_000 }, flagged: null, running: "r", limited: true });
  });

  it("chỉ trừ giờ của bên đang đi", () => {
    const { result } = setup(60_000);
    tick(3_000);
    expect(result.current.time.r).toBeCloseTo(57_000, -2);
    expect(result.current.time.b).toBe(60_000);
  });

  it("đổi lượt thì đồng hồ bên kia chạy, bên này dừng", () => {
    const { result, rerender } = setup(60_000);
    tick(2_000);
    rerender({ turn: "b", stopped: false });
    tick(5_000);
    expect(result.current.running).toBe("b");
    expect(result.current.time.r).toBeCloseTo(58_000, -2);
    expect(result.current.time.b).toBeCloseTo(55_000, -2);
  });

  it("ván kết thúc (stopped) thì cả hai đồng hồ đứng yên", () => {
    const { result, rerender } = setup(60_000);
    tick(1_000);
    rerender({ turn: "r", stopped: true });
    const frozen = result.current.time.r;
    tick(10_000);
    expect(result.current.running).toBeNull();
    expect(result.current.time.r).toBe(frozen);
  });

  it("hết giờ: dừng ở 0 (không âm), báo bên bị hết giờ", () => {
    const { result } = setup(1_000, "b");
    tick(5_000);
    expect(result.current.time.b).toBe(0);
    expect(result.current.flagged).toBe("b");
    expect(result.current.running).toBeNull();
    expect(result.current.time.r).toBe(1_000);
  });

  it("0 phút = không giới hạn: không chạy, không bao giờ hết giờ", () => {
    const { result } = setup(0);
    tick(60_000);
    expect(result.current).toMatchObject({ limited: false, running: null, flagged: null, time: { r: 0, b: 0 } });
  });

  it("gỡ component thì dừng hẹn giờ", () => {
    const { unmount } = setup(60_000);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "00:00"],
    [1, "00:01"],
    [999, "00:01"],
    [1_000, "00:01"],
    [1_001, "00:02"],
    [59_000, "00:59"],
    [59_001, "01:00"],
    [60_000, "01:00"],
    [600_000, "10:00"],
    [20 * 60_000, "20:00"],
    [100 * 60_000, "100:00"],
  ])("%i ms → %s (làm tròn lên: còn 0,4 giây vẫn hiện 00:01)", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});
