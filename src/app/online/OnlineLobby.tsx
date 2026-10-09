"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSocket } from "@/hooks/useSocket";
import { TIME_CONTROLS, type LobbyStats, type TimeControl } from "@/lib/online/protocol";
import type { PublicUser } from "@/server/auth";
import styles from "./online.module.css";

const isTimeControl = (n: number): n is TimeControl => (TIME_CONTROLS as readonly number[]).includes(n);

function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function OnlineLobby({ user }: { user: PublicUser }) {
  const router = useRouter();
  const requested = Number(useSearchParams().get("queue"));
  const [minutes, setMinutes] = useState<TimeControl>(isTimeControl(requested) ? requested : 10);
  const [queue, setQueue] = useState<{ minutes: TimeControl; since: number } | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [stats, setStats] = useState<LobbyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const [now, setNow] = useState(0);
  const autoQueued = useRef(false);

  const { send, status } = useSocket({
    onMessage: (msg, receivedAt) => {
      switch (msg.t) {
        case "hello":
          setStats(msg.stats);
          setActiveGameId(msg.activeGameId);
          setSessionLost(!msg.user);
          // "Ván mới" từ trang kết quả: tự vào hàng đợi với thể thức cũ.
          if (msg.user && !msg.activeGameId && isTimeControl(requested) && !autoQueued.current) {
            autoQueued.current = true;
            send({ t: "queue", minutes: requested });
          }
          break;
        case "queue":
          setQueue(msg.minutes ? { minutes: msg.minutes, since: receivedAt } : null);
          if (msg.minutes) setError(null);
          break;
        case "matched":
          router.push(`/game/${msg.gameId}`);
          break;
        case "stats":
          setStats(msg.stats);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    },
  });

  useEffect(() => {
    if (!queue) return;
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, [queue]);

  const waited = queue && now ? Math.max(0, Math.floor((now - queue.since) / 1000)) : 0;
  const connected = status === "open";

  return (
    <div className={styles.lobby}>
      <section className={`card ${styles.hero}`} aria-labelledby="ranked-title">
        <span className={styles.watermark} aria-hidden="true">排位</span>
        <div className={styles.heroText}>
          <span className={styles.kicker}>ĐẤU XẾP HẠNG</span>
          <h1 id="ranked-title" className={styles.title}>Tìm đối thủ thật</h1>
          <p className="muted">
            Thắng được cộng Elo, thua bị trừ. Mỗi bên có cùng một quỹ thời gian, hết giờ là thua. Nếu một bên không đi nước đầu
            trong 30 giây, ván sẽ bị hủy và không tính điểm.
          </p>
          <p className={styles.stats} aria-live="polite">
            {stats ? `${stats.online} người đang online · ${stats.playing} ván đang diễn ra` : " "}
          </p>
        </div>

        <div className={styles.panel}>
          {sessionLost && (
            <p className={styles.warn} role="alert">
              Phiên đăng nhập đã hết hạn. <Link href="/login?next=/online">Đăng nhập lại</Link>
            </p>
          )}
          {activeGameId && (
            <div className={styles.resume}>
              <span>Bạn đang có một ván chưa kết thúc.</span>
              <Link href={`/game/${activeGameId}`} className="btn btn-primary">Vào lại ván</Link>
            </div>
          )}

          <div className={styles.group} role="group" aria-label="Thể thức thời gian">
            <span className={styles.groupLabel}>Thời gian mỗi bên</span>
            <div className={styles.chips}>
              {TIME_CONTROLS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={styles.chip}
                  aria-pressed={minutes === m}
                  disabled={!!queue}
                  onClick={() => setMinutes(m)}
                >
                  <strong>{m} phút</strong>
                  <span>{m === 5 ? "Nhanh" : m === 10 ? "Tiêu chuẩn" : "Cổ điển"}</span>
                </button>
              ))}
            </div>
          </div>

          {queue ? (
            <div className={styles.searching} role="status">
              <span className={styles.spinner} aria-hidden="true">帥</span>
              <span className={styles.searchText}>
                <strong>Đang tìm đối thủ · {queue.minutes} phút</strong>
                <span className="muted">Đã chờ {formatWait(waited)}</span>
              </span>
              <button type="button" className="btn" onClick={() => send({ t: "cancelQueue" })}>Hủy</button>
            </div>
          ) : (
            <button
              type="button"
              className={`btn btn-primary ${styles.cta}`}
              disabled={!connected || !!activeGameId || sessionLost}
              onClick={() => send({ t: "queue", minutes })}
            >
              Tìm đối thủ · {minutes} phút
            </button>
          )}

          {!connected && <p className="muted">Đang kết nối tới máy chủ…</p>}
          {error && <p className={styles.warn} role="alert">{error}</p>}
        </div>
      </section>

      <section className={styles.cards}>
        <Link href={`/u/${user.username}`} className={`card ${styles.cardLink}`}>
          <span className={`seal ${styles.cardSeal}`} style={{ background: "#3d4f7a" }}>我</span>
          <span>
            <strong>{user.displayName}</strong>
            <span className="muted">Elo {user.rating} · Xem hồ sơ và lịch sử ván</span>
          </span>
        </Link>
        <Link href="/leaderboard" className={`card ${styles.cardLink}`}>
          <span className={`seal ${styles.cardSeal}`} style={{ background: "#8a5a12" }}>榜</span>
          <span>
            <strong>Bảng xếp hạng</strong>
            <span className="muted">Những kỳ thủ Elo cao nhất</span>
          </span>
        </Link>
        <Link href="/play" className={`card ${styles.cardLink}`}>
          <span className={`seal ${styles.cardSeal}`} style={{ background: "#6b4a2b" }}>機</span>
          <span>
            <strong>Khởi động với máy</strong>
            <span className="muted">Luyện tay trước khi vào trận</span>
          </span>
        </Link>
      </section>
    </div>
  );
}
