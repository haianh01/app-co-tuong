"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WS_PATH, type ClientMessage, type ServerMessage } from "@/lib/online/protocol";

export type SocketStatus = "connecting" | "open" | "closed";

interface Handlers {
  /** Gọi mỗi lần (kể cả kết nối lại): nơi gửi lại các đăng ký như `watch`. */
  onOpen?: (send: (msg: ClientMessage) => void) => void;
  /** `receivedAt`: thời điểm nhận tin theo `performance.now()`, dùng để chạy đồng hồ cục bộ. */
  onMessage: (msg: ServerMessage, receivedAt: number) => void;
}

/** Kết nối WebSocket tới server game, tự kết nối lại (chờ 0.5s → 10s) khi rớt mạng. */
export function useSocket(handlers: Handlers) {
  const handlersRef = useRef(handlers);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<SocketStatus>("connecting");

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${WS_PATH}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
        handlersRef.current.onOpen?.(send);
      };
      ws.onmessage = (e) => {
        const receivedAt = performance.now();
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(e.data)) as ServerMessage;
        } catch {
          return;
        }
        handlersRef.current.onMessage(msg, receivedAt);
      };
      ws.onclose = () => {
        if (stopped) return;
        setStatus("closed");
        timer = setTimeout(() => {
          setStatus("connecting");
          connect();
        }, Math.min(10_000, 500 * 2 ** attempt++));
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [send]);

  return { send, status };
}
