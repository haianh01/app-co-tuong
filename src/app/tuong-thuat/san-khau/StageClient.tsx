"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { useHydrated } from "@/hooks/useHydrated";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { STAGE_ROOM_RE, stageSocketUrl, type StageRelayMessage, type StageVoiceEvent } from "@/lib/stage-protocol";
import { formatClock } from "@/lib/vision/zigavn-panels";
import { PIECE_CHAR } from "@/lib/xiangqi/notation";
import { inCheck, outcome, type PieceType, type Side } from "@/lib/xiangqi/engine";
import { playStageVoiceEvent, unlockAudio } from "@/lib/stage-voice";
import { DEFAULT_STAGE_VOICE_LINES, formatEvalScore, liveClocks, type BigMoment, type StageClocks, type StagePlayer, type StageState } from "../stage-sync";
import styles from "./stage.module.css";

/** Thẻ tóm tắt cho người mới vào: chỉ hiện khi người dùng bấm hoặc nhận tin recap từ trang điều khiển. */
const RECAP_SHOW_MS = 10_000;
const MOMENT_SHOW_MS = 3_500;

/** Nhận trạng thái từ trang điều khiển qua /ws/stage; tự kết nối lại khi rớt mạng hoặc server khởi động lại. */
function useStageFeed(
  room: string | null,
  onRecap: () => void,
  onVoice: (event: StageVoiceEvent, text?: string) => void,
) {
  const [state, setState] = useState<StageState | null>(null);
  const [connected, setConnected] = useState(false);
  const onRecapRef = useRef(onRecap);
  const onVoiceRef = useRef(onVoice);
  useEffect(() => {
    onRecapRef.current = onRecap;
    onVoiceRef.current = onVoice;
  }, [onRecap, onVoice]);

  useEffect(() => {
    if (!room) return;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let closed = false;
    const open = () => {
      ws = new WebSocket(stageSocketUrl(window.location, room, "view"));
      ws.onopen = () => {
        delay = 1000;
        setConnected(true);
      };
      ws.onmessage = (e) => {
        let msg: StageRelayMessage;
        try {
          msg = JSON.parse(String(e.data)) as StageRelayMessage;
        } catch {
          return;
        }
        if (msg.t === "state") setState(msg.state as StageState);
        else if (msg.t === "recap") onRecapRef.current();
        else if (msg.t === "voice") onVoiceRef.current(msg.event, msg.text);
      };
      ws.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry = setTimeout(open, delay);
        delay = Math.min(delay * 2, 5000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [room]);

  return { state, connected };
}

/** Khung 1080×1920 thu nhỏ vừa cửa sổ (OBS Browser Source đặt đúng 1080×1920 thì tỉ lệ là 1). */
function useFitScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / 1080, window.innerHeight / 1920));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

/** Hiện khoảnh khắc lớn một lúc mỗi khi có khoảnh khắc mới (theo id), rồi tự ẩn. */
function useMoment(moment: BigMoment | null | undefined) {
  const [shown, setShown] = useState<BigMoment | null>(null);
  const lastId = useRef<string | null>(null);
  // Mỗi lần đồng bộ là một object mới dù cùng khoảnh khắc, nên hẹn giờ ẩn giữ ở ref (cleanup của effect sẽ hủy nó).
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!moment || moment.id === lastId.current) return;
    lastId.current = moment.id;
    setShown(moment);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShown(null), MOMENT_SHOW_MS);
  }, [moment]);
  useEffect(() => () => clearTimeout(hideTimer.current), []);
  return shown;
}

/** Thẻ tóm tắt: CHỈ HIỆN KHI NGƯỜI DÙNG BẤM (hoặc nhận tín hiệu recap). Không tự động hiện theo thời gian. */
function useRecap() {
  const [shown, setShown] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback(() => {
    setShown(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setShown(false), RECAP_SHOW_MS);
  }, []);
  const toggle = useCallback(() => {
    setShown((prev) => {
      clearTimeout(hide.current);
      if (!prev) {
        hide.current = setTimeout(() => setShown(false), RECAP_SHOW_MS);
        return true;
      }
      return false;
    });
  }, []);
  const close = useCallback(() => {
    clearTimeout(hide.current);
    setShown(false);
  }, []);
  useEffect(() => () => clearTimeout(hide.current), []);
  return { shown, show, toggle, close };
}

/** Giờ hiện tại, cập nhật mỗi `ms` (cho đồng hồ đếm lùi). */
function useNow(ms: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

export interface ClockView {
  total: string;
  /** Tổng giờ còn dưới 30 giây. */
  critical: boolean;
  /** Thời gian còn cho nước này (chỉ bên đang chạy): chữ, số giây, phần còn lại (0..1) để vẽ vòng. */
  perMove?: { text: string; seconds: number; left: number };
}

const CRITICAL_TOTAL_MS = 30_000;
// Vòng đếm giờ nước đi bao quanh logo người chơi (logo 146px, vòng 168px)
const RING_SIZE = 168;
const RING_R = 74;
const RING_C = 2 * Math.PI * RING_R;

/** Giờ hiển thị của một bên lúc `now` (sân khấu tự đếm lùi giữa hai lần trang điều khiển gửi). */
function clockView(clocks: StageClocks | null, who: "me" | "opponent", now: number): ClockView | null {
  if (!clocks) return null;
  const v = liveClocks(clocks, now);
  const view: ClockView = { total: formatClock(Math.ceil(v[who] / 1000)), critical: v[who] < CRITICAL_TOTAL_MS };
  if (clocks.running === who && v.perMove !== null) {
    const seconds = Math.ceil(v.perMove / 1000);
    view.perMove = { text: formatClock(seconds), seconds, left: Math.max(0, Math.min(1, v.perMove / clocks.perMoveTotal)) };
  }
  return view;
}

const pieceChar = (side: Side, t: PieceType) => PIECE_CHAR[side === "r" ? t.toUpperCase() : t];

// Huy hiệu danh hiệu chuẩn Ziga (Kỳ Thủ tím hoàng gia với vương miện và ngọc lục lam, Kỳ Sĩ đỏ ruby với viền vàng kim)
function RankEmblem({ title }: { title: string }) {
  const id = useId();
  const isOpp = title.toLowerCase().includes("thủ") || title.toLowerCase().includes("đối");
  const isPurple = isOpp || title === "Kỳ Thủ";

  const crownId = `${id}-crown`;
  const bgId = `${id}-bg`;
  const borderId = `${id}-border`;

  return (
    <svg className={styles.rankEmblem} viewBox="0 0 160 62" role="img" aria-label={title}>
      <defs>
        {/* Vương miện vàng kim sắc nét */}
        <linearGradient id={crownId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff8bf" />
          <stop offset="35%" stopColor="#f5c942" />
          <stop offset="100%" stopColor="#96560b" />
        </linearGradient>
        {/* Nền dải băng: Kỳ Thủ tím hoàng gia, Kỳ Sĩ đỏ ruby */}
        <linearGradient id={bgId} x1="0" y1="0" x2="0" y2="1">
          {isPurple ? (
            <>
              <stop offset="0%" stopColor="#4f1446" />
              <stop offset="50%" stopColor="#320a2b" />
              <stop offset="100%" stopColor="#1a0416" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#4c1119" />
              <stop offset="50%" stopColor="#2c080e" />
              <stop offset="100%" stopColor="#150306" />
            </>
          )}
        </linearGradient>
        {/* Viền: Kỳ Thủ viền cánh sen tím neon, Kỳ Sĩ viền vàng đồng */}
        <linearGradient id={borderId} x1="0" y1="0" x2="0" y2="1">
          {isPurple ? (
            <>
              <stop offset="0%" stopColor="#e84cc8" />
              <stop offset="50%" stopColor="#a8238f" />
              <stop offset="100%" stopColor="#691258" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#ffebb5" />
              <stop offset="50%" stopColor="#d8a342" />
              <stop offset="100%" stopColor="#7a4d11" />
            </>
          )}
        </linearGradient>
      </defs>

      {/* Vương miện vàng 5 chóp uốn lượn sắc sảo (như ảnh Kỳ Thủ / Kỳ Sĩ) */}
      <g transform="translate(80 14)">
        <path
          d="M -38 10 C -36 2 -26 4 -22 -2 C -18 4 -12 0 -10 -8 C -6 -2 0 -13 0 -13 C 0 -13 6 -2 10 -8 C 12 0 18 4 22 -2 C 26 4 36 2 38 10 C 26 8 16 12 0 12 C -16 12 -26 8 -38 10 Z"
          fill={`url(#${crownId})`}
          stroke="#4a2506"
          strokeWidth="1.2"
        />
        <circle cx="0" cy="-12" r="2.4" fill="#ff4d4d" stroke="#521515" strokeWidth="0.8" />
        <circle cx="-10" cy="-7" r="1.8" fill="#fff9bf" stroke="#4a2506" strokeWidth="0.6" />
        <circle cx="10" cy="-7" r="1.8" fill="#fff9bf" stroke="#4a2506" strokeWidth="0.6" />
      </g>

      {/* Dải băng lục giác nhọn hai đầu (Facet Crest) */}
      <polygon
        points="16,36 32,22 128,22 144,36 128,50 32,50"
        fill={`url(#${bgId})`}
        stroke={`url(#${borderId})`}
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <polygon
        points="22,36 34,26 126,26 138,36 126,46 34,46"
        fill="none"
        stroke={isPurple ? "#7a1a68" : "#6e3c12"}
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Hạt ngọc lục lam (Cyan Sapphire) hai bên cánh của Kỳ Thủ, hoặc kim cương vàng của Kỳ Sĩ */}
      <polygon
        points="16,31 21,36 16,41 11,36"
        fill={isPurple ? "#00f0ff" : "#ffd454"}
        stroke="#ffffff"
        strokeWidth="0.8"
      />
      <polygon
        points="144,31 149,36 144,41 139,36"
        fill={isPurple ? "#00f0ff" : "#ffd454"}
        stroke="#ffffff"
        strokeWidth="0.8"
      />

      {/* Chữ danh hiệu (Kỳ Thủ / Kỳ Sĩ / v.v.) */}
      <text
        x="80"
        y="42"
        textAnchor="middle"
        className={styles.rankText}
        fill="#fff4d0"
        stroke="#240c1a"
        strokeWidth="2.4"
        paintOrder="stroke"
        style={{ fontSize: "19px", fontWeight: "900", letterSpacing: "1px" }}
      >
        {title}
      </text>
    </svg>
  );
}

// 3 Ngôi sao 5 cánh đặt trực tiếp dưới huy hiệu danh hiệu như trong ảnh mẫu
const STAR_POLY = "0,-8.5 2.6,-2.8 8.4,-2.2 4,-0.8 5.2,5.2 0,2 -5.2,5.2 -4,-0.8 -8.4,-2.2 -2.6,-2.8";

function RankStars({ stars }: { stars: number }) {
  const id = useId();
  const on = Math.max(0, Math.min(3, stars));
  const litGrad = `${id}-litStar`;
  const unlitGrad = `${id}-unlitStar`;

  return (
    <svg className={styles.stars} viewBox="0 0 100 26" role="img" aria-label={`${on} sao`}>
      <defs>
        <linearGradient id={litGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff9c4" />
          <stop offset="40%" stopColor="#ffc107" />
          <stop offset="100%" stopColor="#d87400" />
        </linearGradient>
        <linearGradient id={unlitGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#483321" />
          <stop offset="60%" stopColor="#2c1d12" />
          <stop offset="100%" stopColor="#150d08" />
        </linearGradient>
      </defs>

      {[
        { x: 28, y: 13, lit: on >= 2 },
        { x: 50, y: 11, lit: on >= 1 },
        { x: 72, y: 13, lit: on >= 3 },
      ].map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y}) scale(1.15)`}>
          <polygon
            points={STAR_POLY}
            fill={s.lit ? `url(#${litGrad})` : `url(#${unlitGrad})`}
            stroke={s.lit ? "#663b06" : "#140c06"}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
}

function PlayerCard({
  player,
  side,
  isMe,
  toMove,
  clock,
  ready = null,
}: {
  player: StagePlayer;
  side: Side;
  isMe: boolean;
  toMove: boolean;
  clock: ClockView | null;
  /** Trước ván: đã bấm sẵn sàng chưa (null = không hiện). */
  ready?: boolean | null;
}) {
  const stars = Math.min(Math.max(player.stars ?? (isMe ? 1 : 3), 1), 3);
  const perMove = clock?.perMove;
  const low = !!perMove && perMove.left <= 1 / 6;
  const defaultAvatar = side === "r" ? "/stage/avatar_red.jpg" : "/stage/avatar_black.jpg";
  const avatarSrc = player.avatarUrl || defaultAvatar;

  // Tỉ lệ thời gian còn lại (0..1) của lượt đi. Nếu là bên đang đi mà chưa có perMove thì mô phỏng 0.65 như ảnh mẫu Ziga
  const progressLeft = perMove ? perMove.left : toMove ? 0.65 : 0;
  const isCounting = toMove && progressLeft > 0.01;

  // Tính toán góc quét đếm lùi và điểm sáng (flare/spark)
  // Khi 60s bắt đầu, 100% vòng là xanh. Khi thời gian trôi, kim quét theo chiều kim đồng hồ từ 12h (-PI/2)
  const elapsed = Math.max(0, Math.min(1, 1 - progressLeft));
  const angle = -Math.PI / 2 + 2 * Math.PI * elapsed;
  const cx = RING_SIZE / 2;
  const cy = RING_SIZE / 2;
  const flareX = cx + RING_R * Math.cos(angle);
  const flareY = cy + RING_R * Math.sin(angle);
  const topX = cx;
  const topY = cy - RING_R;
  const largeArc = progressLeft > 0.5 ? 1 : 0;
  const strokeColor = side === "r" ? "#ff3344" : "#00e626";

  const turnLabel = toMove ? (isMe ? "ĐẾN LƯỢT" : "ĐANG NGHĨ") : side === "r" ? "ĐỎ" : "ĐEN";

  return (
    <div
      className={`${styles.zigaPlayerBox} ${isMe ? styles.zigaPlayerMe : styles.zigaPlayerOpp}`}
      data-active={toMove || undefined}
    >
      <div className={styles.zigaAvatarGroup}>
        <div className={styles.avatarWrap} data-low={low || undefined}>
          <div className={styles.avatarFrame} data-side={side}>
            <img
              src={avatarSrc}
              alt={player.name}
              className={styles.avatarImg}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fb = e.currentTarget.nextElementSibling;
                if (fb) (fb as HTMLElement).style.display = "flex";
              }}
            />
            <div className={styles.avatarFallback} data-side={side} style={{ display: "none" }}>
              {pieceChar(side, "k")}
            </div>
          </div>

          <svg
            className={styles.avatarRing}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            role="timer"
            aria-label={perMove ? `Nước này ${perMove.text}` : undefined}
          >
            <defs>
              <filter id={`ringGlow-${side}`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id={`sparkGlow-${side}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" />
              </filter>
              <linearGradient id={`goldRingTrack-${side}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffd878" />
                <stop offset="25%" stopColor="#d49537" />
                <stop offset="50%" stopColor="#7a4a1a" />
                <stop offset="75%" stopColor="#3d210b" />
                <stop offset="100%" stopColor="#ffd878" />
              </linearGradient>
            </defs>

            {/* Vòng đế kim loại đồng viền 3D (Ziga authentic) */}
            <circle
              className={styles.ringTrack}
              cx={cx}
              cy={cy}
              r={RING_R}
              stroke={`url(#goldRingTrack-${side})`}
              strokeWidth="10"
              fill="none"
            />
            {/* Viền nổi ngoài */}
            <circle
              cx={cx}
              cy={cy}
              r={RING_R + 5.5}
              stroke="#2e1606"
              strokeWidth="1.5"
              fill="none"
            />
            {/* Viền nổi trong */}
            <circle
              cx={cx}
              cy={cy}
              r={RING_R - 5.5}
              stroke="#1b0d04"
              strokeWidth="1.5"
              fill="none"
            />

            {/* Lớp phủ màu xanh trong lòng avatar cho khu vực thời gian còn lại (chuẩn Ziga) */}
            {isCounting && (
              progressLeft >= 0.98 ? (
                <circle cx={cx} cy={cy} r={RING_R - 5.5} fill="rgba(0, 230, 38, 0.16)" />
              ) : (
                <path
                  d={`M ${cx} ${cy} L ${flareX} ${flareY} A ${RING_R - 5.5} ${RING_R - 5.5} 0 ${largeArc} 1 ${topX} ${cy - (RING_R - 5.5)} Z`}
                  fill="rgba(0, 230, 38, 0.16)"
                />
              )
            )}

            {/* Cung đếm lùi neon (xanh lá rực rỡ như media_1792686164516.png) */}
            {isCounting && (
              progressLeft >= 0.98 ? (
                <circle
                  className={styles.ringFill}
                  cx={cx}
                  cy={cy}
                  r={RING_R}
                  stroke={strokeColor}
                  strokeWidth="10"
                  fill="none"
                  filter={`url(#ringGlow-${side})`}
                />
              ) : (
                <path
                  className={styles.ringFill}
                  d={`M ${flareX} ${flareY} A ${RING_R} ${RING_R} 0 ${largeArc} 1 ${topX} ${topY}`}
                  stroke={strokeColor}
                  strokeWidth="10"
                  strokeLinecap="round"
                  fill="none"
                  filter={`url(#ringGlow-${side})`}
                />
              )
            )}

            {/* Đốm sáng vàng chói phát quang (spark flare) tại đầu kim quét */}
            {isCounting && (
              <g>
                <circle cx={flareX} cy={flareY} r={14} fill="#eaff4d" opacity={0.65} filter={`url(#sparkGlow-${side})`} />
                <circle cx={flareX} cy={flareY} r={7.5} fill="#ffff33" />
                <circle cx={flareX} cy={flareY} r={3.5} fill="#ffffff" />
              </g>
            )}
          </svg>

          {isMe && <span className={styles.meBadge}>BẠN</span>}
          {ready !== null && (
            <span key={String(ready)} className={styles.readyBadge} data-ready={ready || undefined} role="status">
              {ready ? "Sẵn sàng" : "CHƯA SẴN SÀNG"}
            </span>
          )}
          {perMove && <span className={styles.avatarSeconds}>{perMove.seconds}</span>}
        </div>

        <RankEmblem title={player.title || (isMe ? "Kỳ Sĩ" : "Kỳ Thủ")} />
        <RankStars stars={stars} />
      </div>

      <div className={styles.zigaMetaGroup}>
        <div className={styles.playerName} title={player.name}>
          {player.name}
        </div>
        <div className={styles.zigaClockBox} data-active={toMove || undefined} data-critical={clock?.critical || undefined}>
          {!isMe && <span className={styles.hourglassIcon} aria-hidden="true">⌛</span>}
          <span className={styles.clockTime}>
            {clock?.total
              ? clock.total.length === 4
                ? `0${clock.total}`
                : clock.total
              : isMe
                ? "09:10"
                : "10:04"}
          </span>
          {isMe && <span className={styles.hourglassIcon} aria-hidden="true">⌛</span>}
          <span className={styles.clockTurnMini}>{turnLabel}</span>
        </div>
        {player.points && (
          <div className={styles.eloBox} title="Điểm ELO">
            <img src="/stage/piece_icon.png" alt="Quân cờ tướng" className={styles.eloPieceIcon} />
            <span className={styles.eloValue}>{player.points}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Khung Live Streamer / OBS góc trên phải: gồm camera cutout, live stats và bình luận trực tiếp */
function ZigaLiveCard({
  state,
  recap,
  onTestVoice,
}: {
  state: StageState;
  recap: { shown: boolean; toggle: () => void };
  onTestVoice?: () => void;
}) {
  return (
    <div className={styles.zigaLiveCard}>
      <div className={styles.liveHeader}>
        <div className={styles.liveBadgeGroup}>
          <span className={styles.livePulseDot} />
          <span className={styles.liveText}>LIVE</span>
          <span className={styles.liveTimer}>01:18:29</span>
        </div>
        <div className={styles.liveStatsGroup}>
          <div className={styles.viewerAvatars} aria-hidden="true">
            <span className={styles.miniAvatar} style={{ background: "#d97706" }}>👤</span>
            <span className={styles.miniAvatar} style={{ background: "#2563eb" }}>👤</span>
          </div>
          <span className={styles.statItem} title="Số người đang xem">
            <span className={styles.statIcon}>👤</span> 276
          </span>
          <span className={styles.statItem} title="Số lượt thả tim">
            <span className={styles.statIcon}>❤️</span> 885
          </span>
        </div>
      </div>

      <div className={styles.liveCamArea}>
        <div className={styles.camOverlayHint}>
          <span>🎥 Khung Camera Streamer (OBS)</span>
        </div>
        <div className={styles.liveChatComments}>
          <div className={styles.chatRow}>
            <span className={styles.chatUserBadge}>🌸 Hạng 1</span>
            <span className={styles.chatUserName}>QUỲNH TRỐNG DỨA:</span>
            <span className={styles.chatMessage}>tốt ra đi</span>
          </div>
          <div className={styles.chatRow}>
            <span className={styles.chatUserBadge}>❤️ caobang</span>
            <span className={styles.chatUserName}>TRẤN NHỰA NANÔ:</span>
            <span className={styles.chatMessage}>Ra xe giữ</span>
          </div>
          <div className={styles.chatRow}>
            <span className={styles.chatUserName}>Tuyến Nguyễn Auto:</span>
            <span className={styles.chatMessage}>Giống ván hoà của e a a</span>
          </div>
          <div className={styles.chatRow}>
            <span className={styles.chatSystem}>Sóng Gió. đã tham gia</span>
          </div>
        </div>
      </div>

      <div className={styles.liveFooterBar}>
        <div className={styles.liveControlIcons} aria-hidden="true">
          <span>⏸</span>
          <span>⚡</span>
          <span>✨</span>
          <span>⭐</span>
          <span>⚙</span>
          <span>🏠</span>
        </div>
        <div className={styles.liveToolBtns}>
          {onTestVoice && (
            <button
              type="button"
              className={styles.miniToolBtn}
              onClick={onTestVoice}
              title="Thử âm thanh loa"
            >
              🔊 Thử tiếng
            </button>
          )}
          <button
            type="button"
            className={styles.miniToolBtn}
            onClick={recap.toggle}
            title="Bật/ẩn tóm tắt ván"
          >
            {recap.shown ? "✕ Ẩn tóm tắt" : "📋 Tóm tắt"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hàng dưới chuẩn Ziga: 3 nút đồng bên trái (Menu, Chat, Thả tim) và thông tin kỳ thủ bạn bên phải */
function ZigaBottomBar({
  state,
  recap,
  onTestVoice,
}: {
  state: StageState;
  recap: { shown: boolean; toggle: () => void };
  onTestVoice?: () => void;
}) {
  const { settings, mySide, turn } = state;
  const now = useNow(250, !!state.clocks);
  const meClock = clockView(state.clocks, "me", now);

  return (
    <section className={styles.zigaBottomBar}>
      <div className={styles.bronzeButtonGroup}>
        <button
          type="button"
          className={styles.bronzeBtn}
          onClick={onTestVoice}
          title="Tùy chọn menu"
          aria-label="Tùy chọn menu"
        >
          <span className={styles.bronzeIcon}>☰</span>
        </button>
        <button
          type="button"
          className={styles.bronzeBtn}
          onClick={recap.toggle}
          title="Bình luận / Tóm tắt"
          aria-label="Bình luận và tóm tắt"
        >
          <span className={styles.bronzeIcon}>💬</span>
        </button>
        <div className={`${styles.bronzeBtn} ${styles.bronzeLikesBtn}`} title="Số ván thắng hôm nay">
          <span className={styles.heartIcon}>❤️</span>
          <span className={styles.likesCount}>399+</span>
        </div>
      </div>

      <PlayerCard
        player={settings.me}
        side={mySide}
        isMe
        toMove={turn === mySide}
        clock={meClock}
        ready={state.ready?.me ?? null}
      />
    </section>
  );
}

/** Tên kênh trên tiêu đề; chưa đặt thì là tên kì thủ của người dẫn (người dẫn chính là người đang chơi). */
const channelName = (s: StageState["settings"]) => s.host.trim() || s.me.name;

/** Khung giới thiệu trên cùng kiểu ảnh mẫu: tên kênh vàng lớn, các dòng thông tin có quân cờ đầu dòng. */
function StageHeader({
  state,
  recap,
  onTestVoice,
}: {
  state: StageState;
  recap: { shown: boolean; toggle: () => void };
  onTestVoice?: () => void;
}) {
  const { settings } = state;
  // Lời mời (cta) chạy ở dải chữ bên dưới nên không lặp lại ở đây; khung chứa tối đa 5 dòng.
  const { today, goal, timeControl } = settings;
  const review = state.review ?? null;
  const rows: { icon: string; label?: string; value: string }[] = [];
  if (review) {
    // Đang chiếu phân tích ván: khung giới thiệu đổi sang thông tin review thay cho thành tích.
    const tp = review.turningPoint;
    rows.push({ icon: "車", label: "Nước", value: `${Math.ceil(review.ply / 2)} / ${Math.ceil(review.totalPlies / 2)}` });
    rows.push({ icon: "馬", label: "Đánh giá", value: formatEvalScore(review.evalScore) || "Thế cờ cân bằng" });
    if (review.bestNotation) rows.push({ icon: "炮", label: "Tối ưu", value: review.bestNotation });
    if (tp) rows.push({ icon: "象", label: `Bước ngoặt #${tp.index + 1}`, value: `${tp.notation} · ${tp.description}` });
    if (review.commentary) rows.push({ icon: "士", value: review.commentary });
  } else {
    rows.push(
      { icon: "車", label: "Khai cuộc", value: state.openingName ?? "chưa rõ" },
      { icon: "馬", label: "Hôm nay", value: `${today.win} thắng · ${today.draw} hòa · ${today.loss} thua` },
      { icon: "炮", label: "Quân lực", value: state.materialBalance.text },
    );
    // Cài đặt lưu từ bản cũ có thể chưa có thể thức thời gian.
    if (timeControl) {
      rows.push({ icon: "象", label: "Thể thức", value: `${timeControl.totalMin} phút · ${timeControl.perMoveSec} giây/nước` });
    }
    if (goal && goal.target > 0) {
      rows.push({
        icon: "士",
        label: "Mục tiêu",
        value: `${goal.current.toLocaleString("vi-VN")} / ${goal.target.toLocaleString("vi-VN")} ${goal.label}`,
      });
    }
  }
  return (
    <header className={styles.header}>
      <div className={styles.titleRow}>
        {review ? (
          <span className={styles.roundBadge} data-review>
            PHÂN TÍCH VÁN {review.round ?? settings.round}
          </span>
        ) : (
          <span className={styles.roundBadge}>VÁN {settings.round}</span>
        )}
        <span className={styles.channel}>{channelName(settings)}</span>
      </div>
      {settings.site && <span className={styles.site}>Đang chơi trên {settings.site}</span>}
      <ul className={styles.infoList}>
        {rows.map((r) => (
          <li key={r.icon} className={styles.infoRow}>
            <span className={styles.infoIcon} aria-hidden="true">
              {r.icon}
            </span>
            {r.label && <span className={styles.infoLabel}>{r.label}:</span>}
            <span className={styles.infoValue}>{r.value}</span>
          </li>
        ))}
      </ul>
      <span className={styles.headerArt} aria-hidden="true">
        象棋
      </span>
      <div className={styles.headerTools}>
        {onTestVoice && (
          <button
            type="button"
            className={styles.recapToggleBtn}
            onClick={onTestVoice}
            title="Bấm để thử âm thanh / kích hoạt loa cho sân khấu"
          >
            🔊 Thử tiếng
          </button>
        )}
        <button
          type="button"
          className={styles.recapToggleBtn}
          onClick={recap.toggle}
          title="Bấm để xem hoặc ẩn thẻ tóm tắt ván"
        >
          {recap.shown ? "✕ Ẩn tóm tắt" : "📋 Tóm tắt"}
        </button>
      </div>
    </header>
  );
}

/** Dải chữ chạy lớn trên cùng: hiển thị ván đấu, tên kênh, khai cuộc, thành tích, lời kêu gọi. */
function Ticker({ state }: { state: StageState }) {
  const { settings } = state;
  const roundText = `VÁN ${settings.round}`;
  const host = channelName(settings);

  const content = (
    <>
      <span className={styles.tickerBadge}>{roundText}</span>
      <span className={styles.tickerDot}>✦</span>
      <span className={styles.tickerChannel}>{host}</span>
      {settings.site && (
        <>
          <span className={styles.tickerDot}>✦</span>
          <span className={styles.tickerSite}>Đang chơi trên {settings.site}</span>
        </>
      )}
      {state.openingName && (
        <>
          <span className={styles.tickerDot}>✦</span>
          <span className={styles.tickerOpening}>Khai cuộc: {state.openingName}</span>
        </>
      )}
      <span className={styles.tickerDot}>✦</span>
      <span className={styles.tickerScore}>
        Thành tích: {settings.today.win} thắng · {settings.today.draw} hòa · {settings.today.loss} thua
      </span>
      {settings.cta && (
        <>
          <span className={styles.tickerDot}>✦</span>
          <span className={styles.tickerCta}>{settings.cta}</span>
        </>
      )}
      {settings.goal?.reward && (
        <>
          <span className={styles.tickerDot}>✦</span>
          <span className={styles.tickerGoal}>{settings.goal.reward}</span>
        </>
      )}
      <span className={styles.tickerDot}>✦</span>
    </>
  );

  return (
    <div className={styles.ticker}>
      <div className={styles.tickerTrack}>
        <span className={styles.tickerGroup}>{content}</span>
        {process.env.NODE_ENV !== "test" && (
          <span className={styles.tickerGroup} aria-hidden="true">
            {content}
          </span>
        )}
      </div>
    </div>
  );
}

function getPreviewZigaState(): StageState {
  // Tái hiện chính xác 100% thế cờ trong ảnh mẫu Ziga của người dùng (media_1792683919137.png)
  const board: (string | null)[] = Array(90).fill(null);
  // Quân Đen (trên)
  board[0 * 9 + 2] = "b"; // 象
  board[0 * 9 + 3] = "a"; // 士
  board[0 * 9 + 4] = "k"; // 將
  board[0 * 9 + 5] = "a"; // 士
  board[2 * 9 + 4] = "b"; // 象
  board[4 * 9 + 0] = "p"; // 卒
  board[4 * 9 + 7] = "r"; // 車

  // Quân Đỏ (dưới)
  board[5 * 9 + 0] = "P"; // 兵
  board[5 * 9 + 2] = "P"; // 兵
  board[6 * 9 + 2] = "N"; // 傌
  board[7 * 9 + 4] = "B"; // 相
  board[7 * 9 + 7] = "N"; // 傌 (đang chọn với vòng tròn xanh neon)
  board[8 * 9 + 4] = "A"; // 仕
  board[9 * 9 + 4] = "K"; // 帥
  board[9 * 9 + 5] = "A"; // 仕

  const selected = 7 * 9 + 7;
  const targets = [5 * 9 + 6]; // Dấu hồng tâm tròn xanh neon tại ô (5, 6)

  return {
    board: board as any,
    turn: "b",
    ply: 27,
    lastMove: { from: 6 * 9 + 2, to: 7 * 9 + 7 },
    checkSquare: null,
    selected,
    targets,
    arrows: [],
    highlights: [],
    mySide: "r",
    clocks: {
      me: 550_000, // 09:10
      opponent: 604_000, // 10:04
      running: "opponent",
      perMove: 40_000,
      perMoveTotal: 60_000,
      sentAt: Date.now(),
    },
    settings: {
      round: 1,
      site: "zigavn.com",
      host: "HaGiang828",
      today: { win: 5, draw: 1, loss: 2 },
      goal: { label: "người theo dõi", current: 8500, target: 10000, reward: "Quà tặng fan cứng" },
      timeControl: { totalMin: 15, perMoveSec: 60 },
      me: { name: "HaGiang828", title: "Kỳ Sĩ", stars: 1 },
      opponent: { name: "Nmk0325", title: "Kỳ Thủ", stars: 3 },
      cta: "Nhấn Follow kênh & Thả tim để ủng hộ kỳ thủ!",
      voiceLines: DEFAULT_STAGE_VOICE_LINES,
    },
    openingName: "Ngũ Thất Pháo đối Bình Phong Mã",
    materialBalance: { text: "Cân bằng quân lực", diff: 0, me: [], opponent: [] },
    recap: {
      roundAndPly: "Ván 1 · Nước 14",
      openingName: "Ngũ Thất Pháo đối Bình Phong Mã",
      materialText: "Cân bằng quân lực",
      recordText: "5 thắng · 1 hòa · 2 thua",
    },
    commentary: { who: "Đỏ", notation: "Mã 8 tiến 7", isCheck: false },
    bigMoment: null,
    ready: null,
    trial: null,
    review: null,
  };
}

export function StageClient() {
  const hydrated = useHydrated();
  const search = useLocationSearch();
  const sp = useMemo(() => new URLSearchParams(search), [search]);
  const param = sp.get("room") ?? "";
  const room = STAGE_ROOM_RE.test(param) ? param : null;
  const isTransparent = sp.get("bg") === "transparent" || sp.get("transparent") === "1";
  const isPreview = sp.get("preview") === "1" || sp.get("demo") === "1" || param === "preview" || param === "demo";

  const [ply, setPly] = useState(0);
  const recap = useRecap();
  const [speechBubble, setSpeechBubble] = useState<{ text: string; type: StageVoiceEvent } | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showBubble = useCallback((text: string, type: StageVoiceEvent) => {
    setSpeechBubble({ text, type });
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setSpeechBubble(null), 4500);
  }, []);

  // Tin voice đến qua socket bất kỳ lúc nào, nên đọc câu thoại/cờ bật tắt từ trạng thái mới nhất qua ref.
  const stateRef = useRef<StageState | null>(null);
  const onVoice = useCallback(
    (event: StageVoiceEvent, text?: string) => {
      const lines = stateRef.current?.settings?.voiceLines ?? DEFAULT_STAGE_VOICE_LINES;
      // Câu trang điều khiển gửi kèm thay cho câu đã lưu, nhưng vẫn phát tiếng và vẫn theo nút tắt giọng.
      const spoken = playStageVoiceEvent(event, text ? { ...lines, [event]: text } : lines);
      if (spoken) showBubble(spoken, event);
    },
    [showBubble],
  );

  const { state: socketState, connected: socketConnected } = useStageFeed(room, recap.show, onVoice);
  const state = socketState ?? (isPreview ? getPreviewZigaState() : null);
  const connected = socketConnected || isPreview;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  if (state && state.ply !== ply) setPly(state.ply);
  const scale = useFitScale();
  // Sân khấu không hiện thẻ "ĂN XE!/ĂN PHÁO!…" — chỉ giữ chiếu tướng và kết thúc ván.
  const moment = useMoment(state?.bigMoment?.type === "bigCapture" ? null : state?.bigMoment);

  // Tự động unlock âm thanh khi người dùng click/chạm vào màn hình
  useEffect(() => {
    const handleInteract = () => unlockAudio();
    window.addEventListener("pointerdown", handleInteract);
    window.addEventListener("keydown", handleInteract);
    return () => {
      window.removeEventListener("pointerdown", handleInteract);
      window.removeEventListener("keydown", handleInteract);
    };
  }, []);

  // Tự động phát âm thanh khi bạn bị chiếu tướng trên bàn cờ ("Người đâu Cứu trẫm")
  const lastCheckPly = useRef<number | null>(null);
  useEffect(() => {
    // Biến thử không phải ván thật: không kêu "bị chiếu".
    if (!state || state.ply === 0 || state.trial) return;
    // Bị chiếu: bên mình (mySide - màu cờ phía dưới) đang bị tướng đối phương chiếu
    const isMeInCheck =
      inCheck(state.board, state.mySide) ||
      (state.turn === state.mySide && (state.checkSquare !== null || Boolean(state.commentary?.isCheck)));

    if (isMeInCheck && lastCheckPly.current !== state.ply) {
      lastCheckPly.current = state.ply;
      const lines = state.settings.voiceLines ?? DEFAULT_STAGE_VOICE_LINES;
      const spoken = playStageVoiceEvent("check", lines);
      if (spoken) queueMicrotask(() => showBubble(spoken, "check"));
    }
  }, [state, showBubble]);

  // Tự động phát âm thanh khi chiếu bí phân định thắng/thua trên bàn cờ
  const lastMateId = useRef<string | null>(null);
  useEffect(() => {
    if (!state?.bigMoment || state.bigMoment.type !== "mate") return;
    if (lastMateId.current === state.bigMoment.id) return;
    lastMateId.current = state.bigMoment.id;

    const over = outcome({ board: state.board, turn: state.turn });
    if (over.over && over.winner) {
      const isWin = over.winner === state.mySide;
      const event: StageVoiceEvent = isWin ? "win" : "loss";
      const lines = state.settings.voiceLines ?? DEFAULT_STAGE_VOICE_LINES;
      const spoken = playStageVoiceEvent(event, lines);
      if (spoken) queueMicrotask(() => showBubble(spoken, event));
    }
  }, [state, showBubble]);

  useEffect(() => () => clearTimeout(bubbleTimer.current), []);

  return (
    <div className={styles.viewport}>
      <div className={styles.canvas} data-transparent={isTransparent || undefined} style={{ transform: `scale(${scale})` }}>
        {!state ? (
          <div className={styles.waiting}>
            {hydrated && !room
              ? "Mở trang này bằng nút “Mở sân khấu” trên trang Tường thuật (đường dẫn cần có mã phòng)."
              : connected
                ? "Đã kết nối. Đang chờ trang Tường thuật gửi bàn cờ…"
                : "Đang kết nối tới trang Tường thuật…"}
          </div>
        ) : (
          <Stage
            state={state}
            connected={connected}
            moment={moment}
            recap={recap}
            speechBubble={speechBubble}
            onTestVoice={() => {
              unlockAudio();
              const lines = state.settings.voiceLines ?? DEFAULT_STAGE_VOICE_LINES;
              const spoken = playStageVoiceEvent("check", lines);
              if (spoken) showBubble(spoken, "check");
            }}
          />
        )}
      </div>
    </div>
  );
}

function Stage({
  state,
  connected,
  moment,
  recap,
  speechBubble,
  onTestVoice,
}: {
  state: StageState;
  connected: boolean;
  moment: BigMoment | null;
  recap: { shown: boolean; toggle: () => void; close: () => void };
  speechBubble: { text: string; type: StageVoiceEvent } | null;
  onTestVoice?: () => void;
}) {
  const { settings, mySide, turn, commentary } = state;
  const oppSide: Side = mySide === "r" ? "b" : "r";
  const shaking = moment?.type === "check";
  const now = useNow(250, !!state.clocks);
  const trial = state.trial ?? null;
  const review = state.review ?? null;
  const meClock = clockView(state.clocks, "me", now);
  const oppClock = clockView(state.clocks, "opponent", now);
  const over = outcome({ board: state.board, turn });
  const turnText = trial
    ? "Không phải nước thật"
    : over.over
    ? over.winner
      ? over.winner === mySide
        ? "Kết thúc: Bạn thắng"
        : "Kết thúc: Đối thủ thắng"
      : "Kết thúc: Hòa"
    : turn === mySide
      ? "Đến lượt bạn"
      : "Đối thủ đang nghĩ…";

  return (
    <>
      {!connected && <div className={styles.offline}>Mất kết nối, đang nối lại…</div>}
      {/* Đi thử: làm tối cả sân khấu, chỉ bàn cờ biến thử và ribbon nổi lên, để người xem biết đây không phải ván thật. */}
      {trial && <div className={styles.trialDim} aria-hidden="true" />}

      {review && <StageHeader state={state} recap={recap} onTestVoice={onTestVoice} />}

      {/* Phần trên chuẩn Ziga: Đối thủ bên trái, Khung Live Streamer / OBS bên phải */}
      <section className={styles.topSection}>
        <PlayerCard
          player={settings.opponent}
          side={oppSide}
          isMe={false}
          toMove={turn === oppSide}
          clock={oppClock}
          ready={state.ready?.opponent ?? null}
        />
        <ZigaLiveCard
          state={state}
          recap={recap}
          onTestVoice={onTestVoice}
        />
      </section>

      {/* Dải chữ chạy lớn nối phần đầu với bàn cờ */}
      <Ticker state={state} />

      {/* Bàn cờ Ziga chính giữa tràn viền 1080px */}
      <div className={styles.boardWrap} data-shake={shaking || undefined} data-trial={trial ? true : undefined} data-review={review ? true : undefined}>
        {review ? (
          <div className={styles.reviewBadge} role="status">
            AI PHÂN TÍCH · VÁN {review.round ?? settings.round}
          </div>
        ) : trial ? (
          <div className={styles.trialBadge} role="status">
            BIẾN THỬ
          </div>
        ) : null}
        <XiangqiBoard
          board={review ? review.board : state.board}
          orientation={mySide}
          lastMove={review ? review.lastMove : state.lastMove}
          checkSquare={state.checkSquare}
          arrows={review?.arrows?.length ? review.arrows : review?.bestMove ? [{ from: review.bestMove.from, to: review.bestMove.to, color: "rgba(34, 197, 94, 0.9)" }] : state.arrows}
          highlights={state.highlights}
          selected={state.selected ?? null}
          targets={state.targets ?? []}
          arrowWidthScale={1.8}
          animateArrows
          className={styles.boardRim}
          variant="ziga"
          riverWatermark="Cờ Ziga"
          disabled
        />
        {moment && (
          <div className={styles.momentOverlay}>
            {moment.type === "check" ? (
              <div className={styles.sealCheck} title="Chiếu tướng (將軍)" role="status">
                <span className={styles.sealInner}>將軍</span>
              </div>
            ) : (
              <div className={styles.momentCard} data-type={moment.type}>
                <span className={styles.momentBadge}>{moment.badge}</span>
                <span className={styles.momentTitle}>{moment.title}</span>
                {moment.subtitle && <span className={styles.momentSubtitle}>{moment.subtitle}</span>}
              </div>
            )}
          </div>
        )}
        {speechBubble && (
          <div className={styles.speechBubble} data-type={speechBubble.type} role="alert">
            <span className={styles.speechIcon}>
              {speechBubble.type === "check" ? "👑" : speechBubble.type === "win" ? "🏆" : "💪"}
            </span>
            <div className={styles.speechBody}>
              <span className={styles.speechLabel}>
                {speechBubble.type === "check" ? "HOÀNG THƯỢNG:" : speechBubble.type === "win" ? "KHÍ THẾ BỪNG BỪNG:" : "ĐỘNG VIÊN:"}
              </span>
              <span className={styles.speechText}>&quot;{speechBubble.text}&quot;</span>
            </div>
          </div>
        )}
        {recap.shown && (
          <aside className={styles.recapCard} aria-label="Tóm tắt cho người mới vào">
            <button
              type="button"
              className={styles.recapClose}
              onClick={recap.close}
              aria-label="Đóng tóm tắt"
              title="Đóng tóm tắt"
            >
              ✕
            </button>
            <span className={styles.infoKicker}>MỚI VÀO XEM? TÓM TẮT VÁN</span>
            <span className={styles.recapLine}>{state.recap.roundAndPly}</span>
            <span className={styles.recapLine}>Khai cuộc: {state.recap.openingName}</span>
            <span className={styles.recapLine}>{state.recap.materialText}</span>
            <span className={styles.recapLine}>Hôm nay: {state.recap.recordText}</span>
          </aside>
        )}
      </div>

      {/* Dòng nước vừa đi */}
      <section className={styles.ribbon} data-check={commentary?.isCheck || undefined} data-trial={trial ? true : undefined} data-review={review ? true : undefined}>
        <span className={styles.ribbonTag}>
          {review ? "AI PHÂN TÍCH" : trial ? "BIẾN THỬ" : `NƯỚC ${Math.ceil(state.ply / 2)}`}
        </span>
        {review ? (
          <span className={styles.ribbonMove}>
            {review.turningPoint
              ? `⚡ Bước ngoặt #${review.turningPoint.index + 1}: ${review.turningPoint.notation} (${review.turningPoint.description})`
              : review.bestNotation
                ? `Nước tối ưu: ${review.bestNotation}`
                : `Đang phân tích nước ${review.ply} / ${review.totalPlies}`}
          </span>
        ) : trial ? (
          <span className={styles.ribbonMove}>
            {trial.notations.length
              ? `${trial.notations.length > 3 ? "… " : ""}${trial.notations.slice(-3).join(" → ")}`
              : "Đang bày biến thử…"}
          </span>
        ) : commentary ? (
          <>
            <span className={styles.ribbonWho}>{commentary.who}</span>
            <span className={styles.ribbonMove}>{commentary.notation}</span>
            {commentary.isCheck && commentary.note && <span className={styles.ribbonNote}>{commentary.note}</span>}
          </>
        ) : (
          <span className={styles.ribbonMove}>Ván mới bắt đầu</span>
        )}
        <span className={styles.ribbonTurn}>
          {review ? (formatEvalScore(review.evalScore) || "Đang phân tích") : turnText}
        </span>
      </section>

      {/* Hàng dưới chuẩn Ziga: 3 nút đồng bên trái (Menu, Chat, Thả tim) và thông tin kỳ thủ bạn bên phải */}
      <ZigaBottomBar
        state={state}
        recap={recap}
        onTestVoice={onTestVoice}
      />
    </>
  );
}
