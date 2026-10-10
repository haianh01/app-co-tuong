"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { InviteLink } from "@/components/online/InviteLink";
import { useSocket } from "@/hooks/useSocket";
import { playSound } from "@/lib/sound";
import {
  TIME_CONTROLS, findTimeControl, tcLabel, type ChallengeColor, type ChallengeInfo, type LobbyStats, type QueueKey,
} from "@/lib/online/protocol";
import type { SessionUser } from "@/lib/session-types";
import styles from "./online.module.css";

function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function OnlineLobby({ user }: { user: SessionUser }) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedTc = findTimeControl(params.get("tc") ?? "")?.id;
  const requestedRated = params.get("rated") !== "0";
  const [tc, setTc] = useState(requestedTc ?? "10+0");
  const [rated, setRated] = useState(!user.isGuest && requestedRated);
  const [queue, setQueue] = useState<{ key: QueueKey; since: number } | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [stats, setStats] = useState<LobbyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const [now, setNow] = useState(0);
  const [challenge, setChallenge] = useState<ChallengeInfo | null>(null);
  const [color, setColor] = useState<ChallengeColor>("random");
  const autoQueued = useRef(false);

  const { send, status } = useSocket({
    onMessage: (msg, receivedAt) => {
      switch (msg.t) {
        case "hello":
          setStats(msg.stats);
          setActiveGameId(msg.activeGameId);
          setSessionLost(!msg.user);
          // "Ván mới" từ trang kết quả: tự vào hàng đợi với thể thức cũ.
          if (msg.user && !msg.activeGameId && requestedTc && !autoQueued.current && !user.ban) {
            autoQueued.current = true;
            send({ t: "queue", tc: requestedTc, rated: !user.isGuest && requestedRated, variant: "xiangqi" });
          }
          break;
        case "queue":
          setQueue(msg.key ? { key: msg.key, since: receivedAt } : null);
          if (msg.key) setError(null);
          break;
        case "matched":
          playSound("notify");
          router.push(`/game/${msg.gameId}`);
          break;
        case "stats":
          setStats(msg.stats);
          break;
        case "challenge":
          setChallenge(msg.challenge);
          if (msg.challenge) setError(null);
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
  const banned = user.ban;
  const queuedTc = queue ? findTimeControl(queue.key.tc) : null;

  return (
    <div className={styles.lobby}>
      <section className={`card ${styles.hero}`} aria-labelledby="ranked-title">
        <span className={styles.watermark} aria-hidden="true">排位</span>
        <div className={styles.heroText}>
          <span className={styles.kicker}>ĐẤU ONLINE</span>
          <h1 id="ranked-title" className={styles.title}>Tìm đối thủ thật</h1>
          <p className="muted">
            Ván tính điểm: thắng được cộng Elo, thua bị trừ, hệ thống ưu tiên ghép người cùng trình độ. Ván không tính điểm
            để chơi vui, không ảnh hưởng Elo. Nếu một bên không đi nước đầu trong 30 giây, ván bị hủy.
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
          {banned && (
            <p className={styles.warn} role="alert">
              Tài khoản đang bị khóa chơi online đến{" "}
              {new Date(banned.until).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" })}
              {banned.reason ? ` (${banned.reason})` : ""}.
            </p>
          )}
          {user.isGuest && (
            <p className={styles.note}>
              Bạn đang chơi với tư cách khách, chỉ chơi được ván không tính điểm.{" "}
              <Link href="/register?next=/online">Tạo tài khoản</Link> để đấu xếp hạng — lịch sử ván được giữ lại.
            </p>
          )}
          {activeGameId && (
            <div className={styles.resume}>
              <span>Bạn đang có một ván chưa kết thúc.</span>
              <Link href={`/game/${activeGameId}`} className="btn btn-primary">Vào lại ván</Link>
            </div>
          )}

          <div className={styles.group} role="group" aria-label="Loại ván">
            <span className={styles.groupLabel}>Loại ván</span>
            <div className={styles.segments}>
              <button type="button" className={styles.segment} aria-pressed={rated} disabled={!!queue || user.isGuest} onClick={() => setRated(true)}>
                Tính điểm
              </button>
              <button type="button" className={styles.segment} aria-pressed={!rated} disabled={!!queue} onClick={() => setRated(false)}>
                Không tính điểm
              </button>
            </div>
          </div>

          <div className={styles.group} role="group" aria-label="Thể thức thời gian">
            <span className={styles.groupLabel}>Thời gian (phút + giây cộng mỗi nước)</span>
            <div className={styles.chips}>
              {TIME_CONTROLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={styles.chip}
                  aria-pressed={tc === t.id}
                  disabled={!!queue}
                  onClick={() => setTc(t.id)}
                >
                  <strong>{t.id}</strong>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {queue ? (
            <div className={styles.searching} role="status">
              <span className={styles.spinner} aria-hidden="true">帥</span>
              <span className={styles.searchText}>
                <strong>
                  Đang tìm đối thủ · {queuedTc ? tcLabel(queuedTc.minutes, queuedTc.increment) : queue.key.tc} ·{" "}
                  {queue.key.rated ? "tính điểm" : "không tính điểm"}
                </strong>
                <span className="muted">Đã chờ {formatWait(waited)}</span>
              </span>
              <button type="button" className="btn" onClick={() => send({ t: "cancelQueue" })}>Hủy</button>
            </div>
          ) : (
            <button
              type="button"
              className={`btn btn-primary ${styles.cta}`}
              disabled={!connected || !!activeGameId || sessionLost || !!banned}
              onClick={() => send({ t: "queue", tc, rated: rated && !user.isGuest, variant: "xiangqi" })}
            >
              Tìm đối thủ · {tc}
            </button>
          )}

          {!connected && <p className="muted">Đang kết nối tới máy chủ…</p>}
          {error && <p className={styles.warn} role="alert">{error}</p>}
        </div>
      </section>

      <section className={`card ${styles.friends}`} aria-labelledby="friends-title">
        <h2 id="friends-title" className={styles.h2}>Mời bạn bè</h2>
        {challenge ? (
          <>
            <p className="muted">
              Gửi link này cho bạn bè. Khi bạn ấy mở link và nhận lời, ván cờ bắt đầu ngay (giữ trang này mở). Lời mời hết hạn sau 30 phút.
            </p>
            <InviteLink code={challenge.code} />
            <div className={styles.friendFoot}>
              <span className="muted">
                {tcLabel(findTimeControl(challenge.tc)?.minutes ?? 0, findTimeControl(challenge.tc)?.increment ?? 0)} ·{" "}
                {challenge.rated ? "tính điểm" : "giao hữu"} · bạn cầm {challenge.color === "r" ? "Đỏ" : challenge.color === "b" ? "Đen" : "màu ngẫu nhiên"}
              </span>
              <button type="button" className="btn" onClick={() => send({ t: "challengeCancel" })}>Hủy lời mời</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Tạo phòng riêng với thể thức đang chọn ở trên, rồi gửi link cho bạn bè qua Zalo, Messenger…</p>
            <div className={styles.group} role="group" aria-label="Màu quân của bạn">
              <span className={styles.groupLabel}>Bạn cầm quân</span>
              <div className={styles.segments}>
                {([["random", "Ngẫu nhiên"], ["r", "Đỏ (đi trước)"], ["b", "Đen"]] as const).map(([id, label]) => (
                  <button key={id} type="button" className={styles.segment} aria-pressed={color === id} onClick={() => setColor(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn"
              disabled={!connected || !!activeGameId || sessionLost || !!banned}
              onClick={() => send({ t: "challengeCreate", tc, rated: rated && !user.isGuest, variant: "xiangqi", color })}
            >
              Tạo link mời · {tc} · {rated && !user.isGuest ? "tính điểm" : "giao hữu"}
            </button>
          </>
        )}
      </section>

      <section className={`card ${styles.live}`} aria-labelledby="live-title">
        <div className={styles.liveHead}>
          <h2 id="live-title" className={styles.h2}>Đang thi đấu</h2>
          <span className={styles.liveDot}>Trực tiếp</span>
        </div>
        {!stats?.games.length ? (
          <p className="muted">Chưa có ván nào đang diễn ra.</p>
        ) : (
          <ul className={styles.liveList}>
            {stats.games.map((g) => (
              <li key={g.id} className={styles.liveRow}>
                <span className={styles.livePlayers}>
                  <span><span className={styles.dotRed} aria-hidden="true" />{g.red.displayName} <span className="muted">({g.red.rating})</span></span>
                  <span><span className={styles.dotBlack} aria-hidden="true" />{g.black.displayName} <span className="muted">({g.black.rating})</span></span>
                </span>
                <span className="muted">{tcLabel(g.minutes, g.increment)} · {g.rated ? "tính điểm" : "giao hữu"} · nước {g.plies}</span>
                <Link href={`/game/${g.id}`} className="btn">Xem</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.cards}>
        <Link href={`/u/${user.username}`} className={`card ${styles.cardLink}`}>
          <span className={`seal ${styles.cardSeal}`} style={{ background: "#3d4f7a" }}>我</span>
          <span>
            <strong>{user.displayName}</strong>
            <span className="muted">{user.isGuest ? "Tài khoản khách" : `Elo ${user.rating}`} · Xem hồ sơ và lịch sử ván</span>
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
