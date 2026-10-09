"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** `false` khi render trên server và trong lúc hydrate, `true` khi trang đã chạy JavaScript. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
