"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { useHydrated } from "@/hooks/useHydrated";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { STAGE_ROOM_RE, stageSocketUrl, type StageRelayMessage, type StageVoiceEvent } from "@/lib/stage-protocol";
import { formatClock } from "@/lib/vision/zigavn-panels";
import { PIECE_CHAR } from "@/lib/xiangqi/notation";
import { applyMove, inCheck, initialPosition, outcome, type Board, type PieceType, type Side } from "@/lib/xiangqi/engine";
import { MatchCommentaryDrawer } from "./MatchCommentaryDrawer";
import { playStageVoiceEvent, unlockAudio } from "@/lib/stage-voice";
import { DEFAULT_STAGE_VOICE_LINES, formatEvalScore, liveClocks, zigaEloRank, type BigMoment, type StageClocks, type StageCommentaryDetail, type StageMoveItem, type StagePlayer, type StageState, type StageZhaoLesson, type ZigaRankTier } from "../stage-sync";
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
// Vòng đếm giờ nước đi bao quanh logo người chơi (logo 160px, vòng 184px)
const RING_SIZE = 184;
const RING_R = 82;
const RING_C = 2 * Math.PI * RING_R;

// Cành nguyệt quế bên trái vòng (bên phải lật gương): cuống cung tròn từ dưới vòng lên ngang tâm,
// mỗi đốt mọc một cặp lá chĩa ra ngoài và vào trong.
const LAUREL_R = RING_R + 13;
const LEAF_PATH = "M 0 0 Q 7 -7.5 19 0 Q 7 7.5 0 0 Z";
const LAUREL_ANGLES = [110, 122, 134, 146, 158, 170, 182];
const laurelPoint = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: RING_SIZE / 2 + LAUREL_R * Math.cos(a), y: RING_SIZE / 2 + LAUREL_R * Math.sin(a) };
};
const LAUREL_STEM = (() => {
  const p0 = laurelPoint(104);
  const p1 = laurelPoint(188);
  return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${LAUREL_R} ${LAUREL_R} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
})();
const LAUREL_LEAVES = LAUREL_ANGLES.flatMap((deg) => {
  const p = laurelPoint(deg);
  // Hướng tiếp tuyến khi đi ngược lên theo cuống là deg + 90
  return [
    { x: p.x, y: p.y, rot: deg + 90 + 34 },
    { x: p.x, y: p.y, rot: deg + 90 - 34 },
  ];
});

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

// Huy hiệu danh hiệu chuẩn Ziga theo 5 bậc (Tập sự, Phong trào, Kỳ thủ, Kỳ sĩ, Kỳ vương):
// dải băng cong viền vàng có đuôi gấp, 3 ngôi sao cắt múi nằm đè lên mép dưới.
function rankTierOf(title: string): ZigaRankTier {
  const s = title.toLowerCase();
  if (s.includes("vương") || s.includes("kiện tướng")) return "kyvuong";
  if (s.includes("sĩ") || s.includes("sỹ")) return "kysi";
  if (s.includes("thủ") || s.includes("đối")) return "kythu";
  if (s.includes("phong")) return "phongtrao";
  if (s.includes("tập")) return "tapsu";
  return "kysi";
}

// Nền dải băng (sáng → đậm, có vệt bóng ở giữa), đuôi, viền chữ
const RIBBON_THEME: Record<ZigaRankTier, { band: string[]; tail: string[]; ink: string; trim: string[] }> = {
  tapsu: { band: ["#c9d3dc", "#8794a3", "#5f6b79", "#38424d"], tail: ["#6b7684", "#2c343d"], ink: "#1b2128", trim: ["#ffffff", "#c8ced6", "#7c8692"] },
  phongtrao: { band: ["#7fe38c", "#33ad4c", "#1e8237", "#0c4a1d"], tail: ["#22803a", "#093816"], ink: "#062a10", trim: ["#fff6c4", "#f2c24a", "#9a5f10"] },
  kythu: { band: ["#ee7ade", "#bb33ab", "#901f85", "#4f0a49"], tail: ["#8e1d82", "#3d0638"], ink: "#33042e", trim: ["#fff6c4", "#f2c24a", "#9a5f10"] },
  kysi: { band: ["#ff7a73", "#d42a33", "#a8141f", "#5a0610"], tail: ["#a3121d", "#45040b"], ink: "#3a0309", trim: ["#fff6c4", "#f2c24a", "#9a5f10"] },
  kyvuong: { band: ["#ffd36b", "#f28a1c", "#c95410", "#6e2205"], tail: ["#c44f0e", "#561a03"], ink: "#4a1503", trim: ["#ffffff", "#ffe066", "#b86e00"] },
};

// Ngôi sao 5 cánh chia 10 múi sáng/tối xen kẽ để nổi khối như sao Ziga
function starFacets(r: number) {
  const ri = r * 0.5;
  const pt = (k: number, rad: number) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    return `${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`;
  };
  const outline: string[] = [];
  const facets: { points: string; light: boolean }[] = [];
  for (let k = 0; k < 10; k++) {
    outline.push(pt(k, k % 2 ? ri : r));
    const tip = k % 2 === 0;
    // Mỗi cánh: nửa trái sáng, nửa phải tối (k chẵn là đỉnh nhọn)
    facets.push({ points: `0,0 ${pt(k, tip ? r : ri)} ${pt(k + 1, tip ? ri : r)}`, light: tip });
  }
  return { outline: outline.join(" "), facets };
}

const BAND_PATH = "M 40 28 Q 120 56 200 28 L 200 56 Q 120 84 40 56 Z";
const TEXT_PATH = "M 30 47 Q 120 79 210 47";

function RankBadge({ title, tier, stars }: { title: string; tier?: ZigaRankTier; stars: number }) {
  const id = useId();
  const t = tier || rankTierOf(title);
  const theme = RIBBON_THEME[t];
  const on = Math.max(0, Math.min(3, stars));
  const g = (name: string) => `${id}-${name}`;
  // Chữ to nhất có thể; tên dài (Phong trào) thì ép vừa thân băng thay vì thu nhỏ cỡ chữ
  const fontSize = title.length > 8 ? 25 : 27;
  const fit = title.length > 8 ? { textLength: 148, lengthAdjust: "spacingAndGlyphs" as const } : {};

  // Sao bám theo đường cong mép dưới dải băng, sao giữa to nhất
  const starSlots = [
    { x: 86, y: 79, r: 15, lit: on >= 2 },
    { x: 154, y: 79, r: 15, lit: on >= 3 },
    { x: 120, y: 84, r: 18, lit: on >= 1 },
  ];

  return (
    <div className={styles.rankBadge}>
      <svg className={styles.rankEmblem} viewBox="0 0 240 104" role="img" aria-label={title}>
        <defs>
          <linearGradient id={g("band")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.band[0]} />
            <stop offset="42%" stopColor={theme.band[1]} />
            <stop offset="55%" stopColor={theme.band[2]} />
            <stop offset="100%" stopColor={theme.band[3]} />
          </linearGradient>
          <linearGradient id={g("tail")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.tail[0]} />
            <stop offset="100%" stopColor={theme.tail[1]} />
          </linearGradient>
          <linearGradient id={g("trim")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.trim[0]} />
            <stop offset="45%" stopColor={theme.trim[1]} />
            <stop offset="100%" stopColor={theme.trim[2]} />
          </linearGradient>
          <linearGradient id={g("text")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ffe9b0" />
          </linearGradient>
          <path id={g("arc")} d={TEXT_PATH} />
        </defs>

        {/* Đuôi dải băng xẻ chữ V ở hai đầu, nằm sau thân */}
        {[1, -1].map((dir) => (
          <g key={dir} transform={dir === 1 ? undefined : "translate(240 0) scale(-1 1)"}>
            <path
              d="M 52 38 L 10 34 L 24 50 L 10 66 L 52 66 Z"
              fill={`url(#${g("tail")})`}
              stroke={`url(#${g("trim")})`}
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            {/* Nếp gấp nối thân với đuôi */}
            <path d="M 40 56 L 52 66 L 52 54 Z" fill={theme.ink} opacity="0.85" />
          </g>
        ))}

        {/* Thân dải băng cong */}
        <path d={BAND_PATH} fill={`url(#${g("band")})`} stroke={`url(#${g("trim")})`} strokeWidth="3" strokeLinejoin="round" />
        {/* Viền chỉ sáng phía trong, tạo cảm giác dập nổi */}
        <path d="M 44 32.5 Q 120 60 196 32.5" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M 44 52 Q 120 79.5 196 52" fill="none" stroke={theme.ink} strokeOpacity="0.5" strokeWidth="1.2" />

        <text
          className={styles.rankText}
          fill={`url(#${g("text")})`}
          stroke={theme.ink}
          strokeWidth="4.5"
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ fontSize }}
        >
          <textPath href={`#${g("arc")}`} startOffset="50%" textAnchor="middle" {...fit}>
            {title}
          </textPath>
        </text>
      </svg>

      <RankStars slots={starSlots} on={on} />
    </div>
  );
}

function RankStars({ slots, on }: { slots: { x: number; y: number; r: number; lit: boolean }[]; on: number }) {
  return (
    <svg className={styles.stars} viewBox="0 0 240 104" role="img" aria-label={`${on} sao`}>
      {slots.map((s, i) => {
        const { outline, facets } = starFacets(s.r);
        return (
          <g key={i} transform={`translate(${s.x} ${s.y})`}>
            {/* Viền đậm bao ngoài */}
            <polygon points={outline} fill="none" stroke="#3b1a02" strokeWidth="5" strokeLinejoin="round" />
            {facets.map((f, j) => (
              <polygon
                key={j}
                points={f.points}
                fill={s.lit ? (f.light ? "#fff1a3" : "#f5a90f") : f.light ? "#8c847c" : "#5a524b"}
              />
            ))}
            <polygon points={outline} fill="none" stroke={s.lit ? "#a85a00" : "#3a332d"} strokeWidth="1.2" strokeLinejoin="round" />
            {s.lit && <circle cx={-s.r * 0.22} cy={-s.r * 0.42} r={s.r * 0.12} fill="#ffffff" opacity="0.9" />}
          </g>
        );
      })}
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
  const perMove = clock?.perMove;
  const low = !!perMove && perMove.left <= 1 / 6;
  // Tự động xác định cấp bậc, số sao và avatar tương ứng theo điểm Elo của Ziga
  const rankInfo = zigaEloRank(player.points, player.title, player.stars, side);
  const title = player.title || rankInfo.title;
  const stars = Math.min(Math.max(player.stars ?? rankInfo.stars, 1), 3);
  const defaultAvatar = rankInfo.avatarUrl;
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
              {/* Kim loại vàng nhiều dải sáng tối để vòng có độ bóng */}
              <linearGradient id={`goldRingTrack-${side}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fff7c9" />
                <stop offset="18%" stopColor="#f7cd4f" />
                <stop offset="40%" stopColor="#b9771a" />
                <stop offset="55%" stopColor="#ffe68c" />
                <stop offset="75%" stopColor="#a5650f" />
                <stop offset="100%" stopColor="#ffe9a3" />
              </linearGradient>
              <linearGradient id={`laurel-${side}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff0a6" />
                <stop offset="55%" stopColor="#efb534" />
                <stop offset="100%" stopColor="#9a5d0c" />
              </linearGradient>
            </defs>

            {/* Cành nguyệt quế vàng ôm hai bên vòng */}
            {[false, true].map((mirror) => (
              <g key={String(mirror)} transform={mirror ? `translate(${RING_SIZE} 0) scale(-1 1)` : undefined}>
                <path d={LAUREL_STEM} fill="none" stroke="#7a4a10" strokeWidth="2" strokeLinecap="round" />
                {LAUREL_LEAVES.map((l, i) => (
                  <path
                    key={i}
                    d={LEAF_PATH}
                    transform={`translate(${l.x} ${l.y}) rotate(${l.rot})`}
                    fill={`url(#laurel-${side})`}
                    stroke="#5a3008"
                    strokeWidth="0.9"
                  />
                ))}
              </g>
            ))}

            {/* Vành vàng kim dập nổi: mép tối ngoài, dải vàng bóng, chỉ sáng và mép tối trong */}
            <circle cx={cx} cy={cy} r={RING_R + 7} stroke="#3a1d05" strokeWidth="3" fill="none" />
            <circle
              className={styles.ringTrack}
              cx={cx}
              cy={cy}
              r={RING_R}
              stroke={`url(#goldRingTrack-${side})`}
              strokeWidth="12"
              fill="none"
            />
            <circle cx={cx} cy={cy} r={RING_R + 5.4} stroke="#fff4c2" strokeOpacity="0.75" strokeWidth="0.9" fill="none" />
            <circle cx={cx} cy={cy} r={RING_R - 5.2} stroke="#fff0a8" strokeOpacity="0.8" strokeWidth="1" fill="none" />
            <circle cx={cx} cy={cy} r={RING_R - 6.6} stroke="#3a1d05" strokeWidth="1.8" fill="none" />

            {/* Lớp phủ màu xanh trong lòng avatar cho khu vực thời gian còn lại (chuẩn Ziga) */}
            {isCounting && (
              progressLeft >= 0.98 ? (
                <circle cx={cx} cy={cy} r={RING_R - 6} fill="rgba(0, 230, 38, 0.16)" />
              ) : (
                <path
                  d={`M ${cx} ${cy} L ${flareX} ${flareY} A ${RING_R - 6} ${RING_R - 6} 0 ${largeArc} 1 ${topX} ${cy - (RING_R - 6)} Z`}
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
                  strokeWidth="11"
                  fill="none"
                  filter={`url(#ringGlow-${side})`}
                />
              ) : (
                <path
                  className={styles.ringFill}
                  d={`M ${flareX} ${flareY} A ${RING_R} ${RING_R} 0 ${largeArc} 1 ${topX} ${topY}`}
                  stroke={strokeColor}
                  strokeWidth="11"
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

        <RankBadge title={title} tier={rankInfo.tier} stars={stars} />
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

/** Khung Camera Streamer / OBS góc trên phải: kích thước 590×340 (tỉ lệ chuẩn 16:9 của webcam) */
function ZigaLiveCard({
  state,
  recap,
  onTestVoice,
}: {
  state: StageState;
  recap: { shown: boolean; toggle: () => void };
  onTestVoice?: () => void;
}) {
  const [webcamActive, setWebcamActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const toggleWebcam = useCallback(async () => {
    if (webcamActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setWebcamActive(false);
    } else {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          alert("Trình duyệt không hỗ trợ truy cập camera.");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setWebcamActive(true);
      } catch (err) {
        console.warn("Không thể mở camera trình duyệt:", err);
        alert("Không thể mở camera. Vui lòng cấp quyền truy cập camera trên trình duyệt hoặc sử dụng OBS overlay.");
      }
    }
  }, [webcamActive]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div className={styles.zigaLiveCard}>
      {/* Thanh trạng thái Live phía trên */}
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

      {/* Vùng Camera chính: hiển thị video webcam hoặc khung ngắm OBS */}
      <div className={styles.liveCamArea}>
        {webcamActive ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.cameraVideo}
          />
        ) : (
          <div className={styles.camPlaceholder}>
            {/* 4 góc ngắm camera chuẩn chuyên nghiệp */}
            <div className={styles.camCornerTL} aria-hidden="true" />
            <div className={styles.camCornerTR} aria-hidden="true" />
            <div className={styles.camCornerBL} aria-hidden="true" />
            <div className={styles.camCornerBR} aria-hidden="true" />

            <div className={styles.camCenterBadge}>
              <div className={styles.camIconGlow}>
                <span className={styles.camBigIcon}>🎥</span>
              </div>
              <span className={styles.camTitle}>KHUNG CAMERA STREAMER</span>
              <span className={styles.camSubtitle}>Vị trí đặt nguồn Camera OBS (590 × 340)</span>
            </div>
          </div>
        )}
      </div>

      {/* Thanh công cụ chân khung camera */}
      <div className={styles.liveFooterBar}>
        <div className={styles.camFooterLeft}>
          <button
            type="button"
            className={`${styles.miniToolBtn} ${webcamActive ? styles.camActiveBtn : ""}`}
            onClick={toggleWebcam}
            title={webcamActive ? "Tắt camera trình duyệt" : "Bật camera từ trình duyệt"}
          >
            {webcamActive ? "✕ Tắt Cam" : "📷 Bật Camera"}
          </button>
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
  onOpenDrawer,
  onTestVoice,
}: {
  state: StageState;
  recap: { shown: boolean; toggle: () => void };
  onOpenDrawer?: () => void;
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
          onClick={onOpenDrawer ?? recap.toggle}
          title="Trận cờ & Lời bình"
          aria-label="Biên bản trận cờ và lời bình chuyên gia"
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
  const board: Board = Array(90).fill(null);
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
    board,
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
    materialBalance: { text: "Cân bằng quân lực", advantageSide: null },
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
    captured: { redLost: [], blackLost: [] },
    moves: [
      { ply: 1, notation: "Pháo 2 bình 5", side: "r", from: 7 * 9 + 7, to: 7 * 9 + 4 },
      { ply: 2, notation: "Mã 8 tiến 7", side: "b", from: 0 * 9 + 7, to: 2 * 9 + 6 },
      { ply: 3, notation: "Mã 2 tiến 3", side: "r", from: 9 * 9 + 7, to: 7 * 9 + 6 },
      { ply: 4, notation: "Xe 9 bình 8", side: "b", from: 0 * 9 + 8, to: 0 * 9 + 7 },
      { ply: 5, notation: "Xe 1 bình 2", side: "r", from: 9 * 9 + 0, to: 9 * 9 + 1 },
      { ply: 6, notation: "Mã 2 tiến 3", side: "b", from: 0 * 9 + 1, to: 2 * 9 + 2 },
      { ply: 7, notation: "Binh 7 tiến 1", side: "r", from: 6 * 9 + 2, to: 5 * 9 + 2 },
      { ply: 8, notation: "Binh 7 tiến 1", side: "b", from: 3 * 9 + 2, to: 4 * 9 + 2 },
      { ply: 9, notation: "Pháo 8 bình 7", side: "r", from: 7 * 9 + 1, to: 7 * 9 + 2 },
      { ply: 10, notation: "Tượng 7 tiến 5", side: "b", from: 0 * 9 + 2, to: 2 * 9 + 4 },
      { ply: 11, notation: "Xe 2 tiến 6", side: "r", from: 9 * 9 + 1, to: 3 * 9 + 1 },
      { ply: 12, notation: "Sĩ 6 tiến 5", side: "b", from: 0 * 9 + 5, to: 1 * 9 + 4 },
      { ply: 13, notation: "Mã 8 tiến 7", side: "r", from: 9 * 9 + 1, to: 7 * 9 + 2 },
      { ply: 14, notation: "Pháo 8 tiến 2", side: "b", from: 2 * 9 + 7, to: 4 * 9 + 7 },
      { ply: 15, notation: "Binh 5 tiến 1", side: "r", from: 6 * 9 + 4, to: 5 * 9 + 4 },
      { ply: 16, notation: "Pháo 8 bình 3", side: "b", from: 4 * 9 + 7, to: 4 * 9 + 2 },
      { ply: 17, notation: "Xe 2 bình 3", side: "r", from: 3 * 9 + 1, to: 3 * 9 + 2 },
      { ply: 18, notation: "Tượng 5 thoái 7", side: "b", from: 2 * 9 + 4, to: 0 * 9 + 2 },
      { ply: 19, notation: "Mã 7 tiến 6", side: "r", from: 7 * 9 + 2, to: 5 * 9 + 3 },
      { ply: 20, notation: "Pháo 3 tiến 4", side: "b", from: 4 * 9 + 2, to: 8 * 9 + 2 },
      { ply: 21, notation: "Pháo 7 bình 8", side: "r", from: 7 * 9 + 2, to: 7 * 9 + 1 },
      { ply: 22, notation: "Xe 8 tiến 6", side: "b", from: 0 * 9 + 7, to: 6 * 9 + 7 },
      { ply: 23, notation: "Mã 6 tiến 5", side: "r", from: 5 * 9 + 3, to: 4 * 9 + 4 },
      { ply: 24, notation: "Pháo 3 bình 5", side: "b", from: 8 * 9 + 2, to: 8 * 9 + 4 },
      { ply: 25, notation: "Tướng 5 bình 4", side: "r", from: 9 * 9 + 4, to: 9 * 9 + 3 },
      { ply: 26, notation: "Xe 8 bình 7", side: "b", from: 6 * 9 + 7, to: 6 * 9 + 6 },
      {
        ply: 27,
        notation: "Mã 8 tiến 7",
        side: "r",
        from: 6 * 9 + 2,
        to: 7 * 9 + 7,
        commentary: "Nhảy Mã tranh tiên khống chế lộ trung, vận dụng kỳ lý Triệu Hâm Hâm",
        tag: "good",
        zhaoLesson: {
          lesson: 18,
          title: "Mã Hoạt Chiến Thắng",
          kind: "endgame",
          quote: "người có mã hoạt sẽ có ưu thế rất lớn trong tàn cuộc",
          videoUrl: "https://www.youtube.com/watch?v=FqGq8Oqj1_4",
        },
      },
    ],
    activeCommentary: {
      ply: 27,
      notation: "Mã 8 tiến 7",
      side: "r",
      summary: "Bạn đi Mã 8 tiến 7 · Nhảy mã chiếm cứ điểm, kiểm soát trung lộ",
      assessment: "⚖ Cân bằng (0.0) · Hai bên giằng co",
      intent: "Chiếm cứ điểm cao ráo, tạo thế liên hoàn và mở đường cho xe pháo",
      zhaoLesson: {
        lesson: 18,
        title: "Mã Hoạt Chiến Thắng",
        kind: "endgame",
        quote: "người có mã hoạt sẽ có ưu thế rất lớn trong tàn cuộc",
        videoUrl: "https://www.youtube.com/watch?v=FqGq8Oqj1_4",
      },
    },
    timestamp: Date.now(),
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

const MOVE_TAG_LABEL: Record<NonNullable<StageMoveItem["tag"]>, string> = {
  brilliant: "!! Xuất sắc",
  good: "! Nước tốt",
  inaccuracy: "?! Thiếu chính xác",
  mistake: "? Sai lầm",
  blunder: "?? Sai nghiêm trọng",
};

/**
 * Lời bình của nước `ply`: lời bình chi tiết (activeCommentary) chỉ thuộc nước mới nhất, nên khi lùi xem
 * nước cũ thì lấy lời bình ngắn, điểm và bài học Triệu Hâm Hâm đã lưu trong danh sách nước.
 */
export function moveAnalysis(moves: StageMoveItem[], detail: StageCommentaryDetail | null, ply: number) {
  const move = moves.find((m) => m.ply === ply);
  const d = detail && detail.ply === ply ? detail : null;
  const summary = d?.summary || move?.commentary || "";
  const assessment = d?.assessment || (move?.evalCp != null ? formatEvalScore(move.evalCp) : "");
  const intent = d?.intent || "";
  const betterMove = d?.betterMove || "";
  const zhao: StageZhaoLesson | null = move?.zhaoLesson ?? d?.zhaoLesson ?? null;
  return {
    summary,
    assessment,
    intent,
    betterMove,
    zhao,
    tag: move?.tag ?? null,
    empty: !summary && !assessment && !intent && !betterMove && !zhao,
  };
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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);

  // Tính toán bàn cờ khi xem lại nước cũ
  const displayBoard = useMemo(() => {
    if (selectedPly === null || selectedPly === state.ply) {
      return review ? review.board : state.board;
    }
    let pos = initialPosition();
    const targetMoves = (state.moves || []).slice(0, selectedPly);
    for (const m of targetMoves) {
      if (m.from !== undefined && m.to !== undefined) {
        pos = applyMove(pos, { from: m.from, to: m.to });
      }
    }
    return pos.board;
  }, [selectedPly, state.ply, state.moves, state.board, review]);

  const displayLastMove = useMemo(() => {
    if (selectedPly === null || selectedPly === state.ply) {
      return review ? review.lastMove : state.lastMove;
    }
    const m = (state.moves || []).find((x) => x.ply === selectedPly);
    if (m && m.from !== undefined && m.to !== undefined) {
      return { from: m.from, to: m.to };
    }
    return null;
  }, [selectedPly, state.ply, state.moves, state.lastMove, review]);

  const recentMoves = useMemo(() => {
    const allMoves = state.moves || [];
    const current = selectedPly ?? state.ply;
    const idx = allMoves.findIndex((m) => m.ply === current);
    if (idx < 0) return allMoves.slice(-2);
    return allMoves.slice(Math.max(0, idx - 1), idx + 1);
  }, [state.moves, selectedPly, state.ply]);

  const analysis = useMemo(
    () => moveAnalysis(state.moves || [], state.activeCommentary ?? null, selectedPly ?? state.ply),
    [state.moves, state.activeCommentary, selectedPly, state.ply],
  );
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
        {selectedPly !== null && selectedPly !== state.ply && (
          <div className={styles.inspectFloatBanner}>
            <span className={styles.inspectFloatText}>
              👁️ Đang xem lại nước {selectedPly} / {state.moves.length}
            </span>
            <button
              type="button"
              className={styles.inspectReturnBtn}
              onClick={() => setSelectedPly(null)}
              title="Quay về nước mới nhất đang trực tiếp"
            >
              🔴 Về trực tiếp
            </button>
          </div>
        )}
        <XiangqiBoard
          board={displayBoard}
          orientation={mySide}
          lastMove={displayLastMove}
          checkSquare={selectedPly === null ? state.checkSquare : null}
          arrows={review?.arrows?.length ? review.arrows : review?.bestMove ? [{ from: review.bestMove.from, to: review.bestMove.to, color: "rgba(34, 197, 94, 0.9)" }] : state.arrows}
          highlights={state.highlights}
          selected={selectedPly === null ? (state.selected ?? null) : null}
          targets={selectedPly === null ? (state.targets ?? []) : []}
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

      {/* Bảng phân tích dưới bàn cờ (ván trực tiếp); phân tích ván / biến thử dùng dải một dòng vì đã có khung trên. */}
      {review || trial ? (
      <section
        className={styles.ribbon}
        data-check={commentary?.isCheck || undefined}
        data-trial={trial ? true : undefined}
        data-review={review ? true : undefined}
        onClick={() => setDrawerOpen(true)}
        role="button"
        tabIndex={0}
        aria-label="Xem biên bản trận cờ và lời bình"
        title="Bấm để mở bảng trận cờ và lời bình chuyên gia"
      >
        <span className={styles.ribbonTag}>
          {review ? "AI PHÂN TÍCH" : trial ? "BIẾN THỬ" : `NƯỚC ${Math.ceil((selectedPly ?? state.ply) / 2)}`}
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
        ) : null}
        <span className={styles.ribbonTurn}>
          {review ? (formatEvalScore(review.evalScore) || "Đang phân tích") : turnText}
        </span>
      </section>
      ) : (
      <section
        className={styles.analysisPanel}
        data-check={commentary?.isCheck || undefined}
        onClick={() => setDrawerOpen(true)}
        role="button"
        tabIndex={0}
        aria-label="Xem biên bản trận cờ và lời bình"
        title="Bấm để mở bảng trận cờ và lời bình chuyên gia"
      >
        <div className={styles.apHead}>
          <span className={styles.ribbonTag}>NƯỚC {Math.ceil((selectedPly ?? state.ply) / 2)}</span>
          {recentMoves.length > 0 ? (
            <div className={styles.ribbonMovesRecent}>
              {recentMoves.map((rm) => (
                <span
                  key={rm.ply}
                  className={`${styles.recentMoveBadge} ${rm.ply === (selectedPly ?? state.ply) ? styles.recentMoveActive : ""}`}
                >
                  <span className={styles.recentMoveDot} data-side={rm.side} aria-hidden="true" />
                  {rm.notation}
                </span>
              ))}
            </div>
          ) : (
            <span className={styles.ribbonMove}>Ván mới bắt đầu</span>
          )}
          {analysis.tag && (
            <span className={styles.apTag} data-tag={analysis.tag}>
              {MOVE_TAG_LABEL[analysis.tag]}
            </span>
          )}
          {commentary?.isCheck && commentary.note && <span className={styles.ribbonNote}>{commentary.note}</span>}
          <span className={styles.apTurn}>{turnText}</span>
        </div>
        {analysis.empty ? (
          <p className={styles.apSummary} data-muted>
            Lời bình sẽ hiện ở đây sau mỗi nước đi.
          </p>
        ) : (
          <div className={styles.apBody}>
            {(analysis.assessment || analysis.summary) && (
              <p className={styles.apSummary}>
                {analysis.assessment && <span className={styles.apEval}>{analysis.assessment}</span>}
                {analysis.summary}
              </p>
            )}
            {(analysis.intent || analysis.betterMove) && (
              <p className={styles.apIntent}>
                {analysis.intent && (
                  <>
                    <b>🎯 Ý đồ:</b> {analysis.intent}
                  </>
                )}
                {analysis.intent && analysis.betterMove && <span className={styles.apSep}>·</span>}
                {analysis.betterMove && (
                  <>
                    <b>💡 Nên đi:</b> <span className={styles.apBetter}>{analysis.betterMove}</span>
                  </>
                )}
              </p>
            )}
            {analysis.zhao && (
              <p className={styles.apZhao} title={analysis.zhao.quote}>
                <b>
                  📖 Triệu Hâm Hâm #{analysis.zhao.lesson} · {analysis.zhao.title}
                </b>
                {analysis.zhao.quote && <span className={styles.apQuote}> — “{analysis.zhao.quote}”</span>}
              </p>
            )}
          </div>
        )}
      </section>
      )}

      {/* Hàng dưới chuẩn Ziga: 3 nút đồng bên trái (Menu, Chat, Thả tim) và thông tin kỳ thủ bạn bên phải */}
      <ZigaBottomBar
        state={state}
        recap={recap}
        onOpenDrawer={() => setDrawerOpen(true)}
        onTestVoice={onTestVoice}
      />

      {/* Bảng Drawer Trận cờ & Lời bình Chuyên gia */}
      <MatchCommentaryDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        state={state}
        selectedPly={selectedPly}
        onSelectPly={setSelectedPly}
      />
    </>
  );
}
