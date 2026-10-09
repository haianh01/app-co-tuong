"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { USER_REFRESH_EVENT } from "@/lib/events";
import type { SessionUser } from "@/lib/session-types";

interface SessionValue {
  /** `undefined` = đang tải, `null` = chưa đăng nhập. */
  user: SessionUser | null | undefined;
  refresh: () => void;
  setUser: (user: SessionUser | null) => void;
}

const SessionContext = createContext<SessionValue>({ user: undefined, refresh: () => {}, setUser: () => {} });

export const useSession = () => useContext(SessionContext);

/**
 * Thông tin người dùng phía client (tên, Elo, xu, skin…), tải từ /api/me khi vào trang
 * và khi có sự kiện USER_REFRESH_EVENT (vd. vừa đánh xong ván, vừa mua đồ).
 * Không đọc đường dẫn ở đây để layout vẫn prerender được; xem SessionRefresher.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ user: SessionUser | null }>)
      .then((d) => {
        if (!cancelled) setUser(d.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    window.addEventListener(USER_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(USER_REFRESH_EVENT, refresh);
  }, [refresh]);

  return <SessionContext.Provider value={{ user, refresh, setUser }}>{children}</SessionContext.Provider>;
}

/** Tải lại thông tin người dùng mỗi lần chuyển trang (đặt trong `<Suspense>` vì đọc đường dẫn). */
export function SessionRefresher() {
  const pathname = usePathname();
  const { refresh } = useSession();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refresh();
  }, [pathname, refresh]);
  return null;
}
