"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { InviteLink } from "@/components/online/InviteLink";
import { useSocket } from "@/hooks/useSocket";
import { findTimeControl, tcLabel, type ChallengeInfo } from "@/lib/online/protocol";
import type { SessionUser } from "@/lib/session-types";
import { playSound } from "@/lib/sound";
import styles from "./challenge.module.css";

type State = { loading: true } | { loading: false; challenge: ChallengeInfo | null; online: boolean };

const COLOR_NAME = { r: "Đỏ (đi trước)", b: "Đen", random: "ngẫu nhiên" } as const;

export function ChallengeClient({ code, user }: { code: string; user: SessionUser }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ loading: true });
  const [error, setError] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { send, status } = useSocket({
    onOpen: (s) => s({ t: "challengeInfo", code }),
    onMessage: (msg) => {
      switch (msg.t) {
        case "hello":
          setActiveGameId(msg.activeGameId);
          break;
        case "challengeInfo":
          if (msg.code === code) setState({ loading: false, challenge: msg.challenge, online: msg.online });
          break;
        case "matched":
          playSound("notify");
          router.push(`/game/${msg.gameId}`);
          break;
        case "error":
          setPending(false);
          setError(msg.message);
          // Thông tin có thể đã đổi (hết hạn, người mời rời đi): hỏi lại.
          send({ t: "challengeInfo", code });
          break;
      }
    },
  });

  if (state.loading) return <p className="muted">{status === "open" ? "Đang tải lời mời…" : "Đang kết nối tới máy chủ…"}</p>;

  const c = state.challenge;
  if (!c) {
    return (
      <section className={`card ${styles.card}`}>
        <h1 className={styles.title}>Lời mời không còn hiệu lực</h1>
        <p className="muted">Lời mời đã hết hạn, đã có người nhận hoặc bị người mời hủy. Hãy nhờ bạn gửi link mới.</p>
        <Link href="/online" className="btn btn-primary">Về sảnh online</Link>
      </section>
    );
  }

  const tc = findTimeControl(c.tc);
  const mine = c.by.id === user.id;
  // Màu của người nhận là màu còn lại.
  const yourColor = mine ? c.color : c.color === "r" ? "b" : c.color === "b" ? "r" : "random";

  return (
    <section className={`card ${styles.card}`}>
      <span className={styles.kicker}>LỜI MỜI CHƠI CỜ</span>
      <div className={styles.host}>
        <Avatar avatar={c.by.avatar} frame={c.by.frame} size={64} />
        <span>
          <strong className={styles.hostName}>{c.by.displayName}</strong>
          <span className="muted">
            {c.by.isGuest ? "Khách" : `Elo ${c.by.rating}`} · {state.online ? "đang trực tuyến" : "hiện không trực tuyến"}
          </span>
        </span>
      </div>
      <dl className={styles.terms}>
        <div><dt>Thời gian</dt><dd>{tc ? `${tcLabel(tc.minutes, tc.increment)} (${tc.name})` : c.tc}</dd></div>
        <div><dt>Loại ván</dt><dd>{c.rated ? "Tính điểm Elo" : "Giao hữu"}</dd></div>
        <div><dt>Bạn cầm</dt><dd>{COLOR_NAME[yourColor]}</dd></div>
      </dl>

      {mine ? (
        <>
          <p className="muted">Đây là lời mời của bạn. Gửi link cho bạn bè và giữ trang này (hoặc sảnh online) mở.</p>
          <InviteLink code={c.code} />
        </>
      ) : activeGameId ? (
        <div className={styles.actions}>
          <span>Bạn đang có một ván chưa kết thúc.</span>
          <Link href={`/game/${activeGameId}`} className="btn btn-primary">Vào lại ván</Link>
        </div>
      ) : c.rated && user.isGuest ? (
        <p className={styles.warn}>
          Đây là ván tính điểm, khách không tham gia được.{" "}
          <Link href={`/register?next=/challenge/${c.code}`}>Tạo tài khoản</Link> để nhận lời.
        </p>
      ) : (
        <button
          type="button"
          className={`btn btn-primary ${styles.cta}`}
          disabled={status !== "open" || pending || !state.online || !!user.ban}
          onClick={() => {
            setError(null);
            setPending(true);
            send({ t: "challengeAccept", code: c.code });
          }}
        >
          {pending ? "Đang vào ván…" : "Nhận lời và vào ván"}
        </button>
      )}
      {!mine && !state.online && (
        <p className={styles.warn}>Người mời đang không mở trang. Hãy nhắn họ mở lại Kỳ Đài; trang này tự cập nhật khi bạn bấm lại.</p>
      )}
      {error && <p className={styles.warn} role="alert">{error}</p>}
    </section>
  );
}
