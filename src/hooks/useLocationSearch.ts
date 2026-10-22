"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
};

/**
 * Tham số `?next=` trên URL, đọc ở client. Trên server trả về giá trị mặc định nên trang vẫn prerender
 * tĩnh được (không cần `<Suspense>` thay nội dung sau khi tải, tránh mất chữ người dùng đang gõ).
 */
export function useNextParam(fallback = "/online"): string {
  return useQueryParam("next", fallback);
}

/** Chuỗi query string `?a=b&c=d` trên URL, đọc ở client (trên server trả về rỗng). */
export function useLocationSearch(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
}

/** Tham số bất kỳ trên URL, đọc ở client (trên server trả về `fallback`). */
export function useQueryParam(name: string, fallback = ""): string {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(name) ?? fallback,
    () => fallback,
  );
}

