"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import type { SessionUser } from "@/lib/session-types";
import { playSound } from "@/lib/sound";
import styles from "../tournaments.module.css";

interface Props {
  id: string;
  status: "scheduled" | "running" | "finished";
  startsAt: number;
  endsAt: number;
  user: SessionUser | null;
  joined: boolean;
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Nút tham gia / tạm nghỉ, đồng hồ đếm ngược; tự vào ván khi được ghép, tự tải lại bảng điểm khi có thay đổi. */
export function ArenaClient({ id, status, startsAt, endsAt, user, joined }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  // Đã bấm tham gia trong phiên này: kết nối lại thì tự đăng ký lại.
  const wantReady = useRef(false);

  const { send, status: socket } = useSocket({
    onOpen: (s) => {
      s({ t: "arenaWatch", id });
      if (wantReady.current) s({ t: "arenaJoin", id });
    },
    onMessage: (msg) => {
      switch (msg.t) {
        case "arena":
          if (msg.id === id) setReady(msg.ready);
          break;
        case "arenaUpdate":
          if (msg.id === id) router.refresh();
          break;
        case "matched":
          playSound("notify");
          router.push(`/game/${msg.gameId}`);
          break;
        case "error":
          wantReady.current = false;
          setError(msg.message);
          break;
      }
    },
  });

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const phase = status === "finished" ? "finished" : now === null ? status : now < startsAt ? "scheduled" : now < endsAt ? "running" : "ending";

  // Đến giờ bắt đầu / kết thúc: tải lại để lấy trạng thái mới từ máy chủ.
  const lastPhase = useRef(phase);
  useEffect(() => {
    if (lastPhase.current !== phase) router.refresh();
    lastPhase.current = phase;
  }, [phase, router]);

  const join = () => {
    setError(null);
    wantReady.current = true;
    send({ t: "arenaJoin", id });
  };
  const leave = () => {
    wantReady.current = false;
    send({ t: "arenaLeave", id });
  };

  return (
    <div className={styles.arena}>
      <div className={styles.clock} role="timer" aria-live="off">
        {phase === "scheduled" && now !== null && <>Bắt đầu sau <strong>{countdown(startsAt - now)}</strong></>}
        {phase === "running" && now !== null && <>Còn lại <strong>{countdown(endsAt - now)}</strong></>}
        {phase === "ending" && "Đã hết giờ — đang chờ các ván cuối kết thúc"}
        {phase === "finished" && "Giải đã kết thúc"}
      </div>

      {phase === "finished" || phase === "ending" ? null : !user ? (
        <Link href={`/login?next=/tournaments/${id}`} className="btn btn-primary">Đăng nhập để tham gia</Link>
      ) : user.isGuest ? (
        <p className={styles.warn}>
          Khách chưa tham gia giải được. <Link href={`/register?next=/tournaments/${id}`}>Tạo tài khoản miễn phí</Link>.
        </p>
      ) : ready ? (
        <div className={styles.readyRow}>
          <span className={styles.ready} role="status">
            {phase === "running" ? "Đang chờ ghép đối thủ…" : "Đã sẵn sàng — ván đầu tự bắt đầu khi giải mở"}
          </span>
          <button type="button" className="btn" onClick={leave}>Tạm nghỉ</button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" disabled={socket !== "open"} onClick={join}>
          {joined ? "Vào thi đấu tiếp" : "Tham gia giải"}
        </button>
      )}
      {ready && <p className="muted">Giữ trang này mở. Được ghép cặp là tự chuyển vào ván; xong ván sẽ quay lại hàng chờ.</p>}
      {error && <p className={styles.warn} role="alert">{error}</p>}
    </div>
  );
}
