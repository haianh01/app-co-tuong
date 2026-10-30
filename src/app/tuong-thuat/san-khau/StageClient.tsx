"use client";

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { useHydrated } from "@/hooks/useHydrated";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import { STAGE_ROOM_RE, stageSocketUrl, type StageCommand, type StageRelayMessage, type StageViewMessage, type StageVoiceEvent } from "@/lib/stage-protocol";
import { formatClock } from "@/lib/vision/zigavn-panels";
import { PIECE_CHAR } from "@/lib/xiangqi/notation";
import { applyMove, initialPosition, outcome, parseFen, toFen, type Board, type PieceType, type Side } from "@/lib/xiangqi/engine";
import { usePositionAnalysis } from "@/hooks/usePositionAnalysis";
import type { PositionAnalysisResult } from "@/lib/xiangqi/position-analysis";
import { MatchCommentaryDrawer } from "./MatchCommentaryDrawer";
import { playStageVoiceEvent, unlockAudio } from "@/lib/stage-voice";
import { DEFAULT_STAGE_VOICE_LINES, formatEvalScore, liveClocks, zigaEloRank, type BigMoment, type StageClocks, type StagePlayer, type StageState, type ZigaRankTier } from "../stage-sync";
import { drawingReducer, EMPTY_DRAWING } from "../drawing";
import { useTrialMoves } from "../trial";
import { useGameReview } from "../useGameReview";
import { EvalBar, HistorySheet, ReviewNav, ReviewStrip, StageActionButtons, StageToast, TrialMovesBar, saveStateOf } from "./StageControls";
import { PuzzleShow, getPreviewPuzzleState } from "./PuzzleShow";
import styles from "./stage.module.css";

/** Mũi tên 3 nước AI chọn khi phân tích trên sân khấu (xanh lá = tốt nhất). Mã màu phải nằm trong bảng đầu mũi tên của
 *  XiangqiBoard (kind "custom") thì đầu mũi tên mới cùng màu thân. */
const DEEP_ARROW_COLORS = ["#22c55e", "#3b82f6", "#f59e0b"];

const STAGE_DRAWING_COLORS = [
  { value: "#3b82f6", label: "xanh dương" },
  { value: "#22c55e", label: "xanh lá" },
  { value: "#ef4444", label: "đỏ" },
  { value: "#f59e0b", label: "vàng" },
] as const;

/** Thẻ tóm tắt cho người mới vào: chỉ hiện khi người dùng bấm hoặc nhận tin recap từ trang điều khiển. */
const RECAP_SHOW_MS = 10_000;
const MOMENT_SHOW_MS = 3_500;
/** Mở màn ván: màn VS của hai kỳ thủ, bàn cờ bung ra, quân rơi vào chỗ rồi chữ "BẮT ĐẦU!". */
const INTRO_SHOW_MS = 3_600;

/** Nhận trạng thái từ trang điều khiển qua /ws/stage; tự kết nối lại khi rớt mạng hoặc server khởi động lại. */
function useStageFeed(
  room: string | null,
  onRecap: () => void,
  onVoice: (event: StageVoiceEvent, text?: string) => void,
) {
  const [state, setState] = useState<StageState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
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
      wsRef.current = ws;
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

  /** Gửi lệnh ngược về trang điều khiển (vd. "save"); mất kết nối thì bỏ qua. */
  const sendCommand = useCallback((cmd: StageCommand) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "cmd", cmd } satisfies StageViewMessage));
  }, []);

  return { state, connected, sendCommand };
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

/**
 * Hiện khoảnh khắc lớn một lúc mỗi khi có khoảnh khắc mới (theo id), rồi tự ẩn. `silent`: chỉ ghi nhận id mà không hiện
 * (đang chiếu cờ thế: tắt cờ thế xong không bật lại hiệu ứng cũ của ván thật).
 */
function useMoment(moment: BigMoment | null | undefined, silent = false) {
  const [last, setLast] = useState<{ id: string | null; shown: BigMoment | null }>({ id: null, shown: null });
  if (moment && moment.id !== last.id) setLast({ id: moment.id, shown: silent ? null : moment });
  const shown = last.shown;
  // Mỗi lần đồng bộ là một object mới dù cùng khoảnh khắc; `shown` giữ object đầu tiên nên hẹn giờ ẩn không bị đặt lại.
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setLast((l) => (l.shown === shown ? { ...l, shown: null } : l)), MOMENT_SHOW_MS);
    return () => clearTimeout(t);
  }, [shown]);
  return shown;
}

/**
 * Bật mở màn mỗi khi bàn về thế xuất phát (vừa mở sân khấu lúc ván chưa đi, hoặc trang điều khiển bắt đầu ván mới),
 * tắt khi hết giờ hay khi đã có nước đi. Trả về mã lần mở màn đang hiện (null: không hiện).
 */
function useGameIntro(ply: number, enabled: boolean) {
  const [intro, setIntro] = useState<{ ply: number | null; id: number; shown: boolean }>({ ply: null, id: 0, shown: false });
  if (intro.ply !== ply) {
    const start = enabled && ply === 0;
    setIntro({ ply, id: start ? intro.id + 1 : intro.id, shown: start });
  }
  const { id, shown } = intro;
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setIntro((i) => (i.id === id ? { ...i, shown: false } : i)), INTRO_SHOW_MS);
    return () => clearTimeout(t);
  }, [id, shown]);
  return shown ? id : null;
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

        {/* Ghế trống / chưa biết elo: không đoán cấp theo phe */}
        {(player.points || player.title) && <RankBadge title={title} tier={rankInfo.tier} stars={stars} />}
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

/** Nhân vật AI (trang avatar của trợ lý live) nhúng vào khung camera.
 *  ?ai=1 → cùng máy chủ với trang này; ?ai=<địa chỉ http(s)> → trang avatar ở chỗ khác. */
export function aiAvatarSrc(sp: URLSearchParams, origin?: string): string | null {
  const raw = sp.get("ai");
  if (!raw || raw === "0") return null;
  let url: URL;
  try {
    url = raw === "1" ? new URL("/live-bot/avatar.html", origin ?? window.location.origin) : new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.searchParams.has("voice")) url.searchParams.set("voice", "1");
  url.searchParams.set("compact", "1");
  return url.toString();
}

/** Khung Camera Streamer / OBS góc trên phải: kích thước 590×340 (tỉ lệ chuẩn 16:9 của webcam) */
function ZigaLiveCard({
  state,
  recap,
  onTestVoice,
  aiSrc,
}: {
  state: StageState;
  recap: { shown: boolean; toggle: () => void };
  onTestVoice?: () => void;
  /** Có thì tạm bỏ cả khung camera: chỉ còn nhân vật AI nền trong suốt ở góc trên phải. */
  aiSrc?: string | null;
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

  if (aiSrc) {
    return (
      <div className={styles.aiOnlyCard}>
        <iframe src={aiSrc} title="Nhân vật AI" className={styles.aiAvatarFrame} allow="autoplay" />
      </div>
    );
  }

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

/** Một bên của màn VS: ảnh, tên và danh hiệu kỳ thủ trượt vào từ mép màn hình. */
function IntroPlate({ player, side, from }: { player: StagePlayer; side: Side; from: "left" | "right" }) {
  const rank = zigaEloRank(player.points, player.title, player.stars, side);
  return (
    <div className={styles.introPlate} data-from={from} data-side={side}>
      <div className={styles.introAvatar} data-side={side}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={player.avatarUrl || rank.avatarUrl} alt="" />
      </div>
      <div className={styles.introWho}>
        <span className={styles.introName}>{player.name}</span>
        <span className={styles.introRank}>
          {player.title || rank.title}
          {player.points ? ` · ${player.points}` : ""}
        </span>
        <span className={styles.introSide} data-side={side}>
          {side === "r" ? "CẦM ĐỎ · ĐI TRƯỚC" : "CẦM ĐEN"}
        </span>
      </div>
    </div>
  );
}

function GameIntro({ state, oppSide }: { state: StageState; oppSide: Side }) {
  return (
    <div className={styles.introOverlay} aria-hidden="true">
      <div className={styles.introBackdrop} />
      <div className={styles.introBand}>
        <IntroPlate player={state.settings.opponent} side={oppSide} from="left" />
        <div className={styles.introVs}>
          <span>VS</span>
        </div>
        <IntroPlate player={state.settings.me} side={state.mySide} from="right" />
      </div>
      <div className={styles.introGo}>
        <span className={styles.introGoRound}>VÁN {state.settings.round}</span>
        <span className={styles.introGoText}>BẮT ĐẦU!</span>
      </div>
    </div>
  );
}

const CONFETTI_COLORS = ["#ffd54f", "#ff5a3c", "#4ade80", "#60a5fa", "#f472b6", "#fff1e8"];

/** Chiếu bí: tia sáng xoay sau thẻ kết quả, thắng thì thêm pháo giấy rơi. */
function MateBurst({ win }: { win: boolean }) {
  return (
    <>
      <div className={styles.mateRays} data-win={win || undefined} aria-hidden="true" />
      {win && (
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              style={
                {
                  "--x": `${(i * 37) % 100}%`,
                  "--d": `${(i * 53) % 900}ms`,
                  "--r": `${(i * 71) % 360}deg`,
                  "--c": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Hàng dưới chuẩn Ziga: 3 nút đồng bên trái (Menu, Chat, Thả tim) và thông tin kỳ thủ bạn bên phải */
/** Dải phân tích khi đi thử: chuỗi nước đã có ở thanh Biến thử, nên ở đây nói AI thấy gì ở thế đang thử. */
function trialText(notations: string[], best: { notation: string; purposeLabel: string; narrative: string } | null): string {
  if (notations.length === 0) return "Đi thử: bấm quân để bày biến từ thế này";
  if (!best) return `Sau ${notations.length} nước thử, AI đang xem thế cờ…`;
  return `${best.notation} (${best.purposeLabel})${best.narrative ? `: ${best.narrative}` : ""}`;
}

function ZigaBottomBar({ state, controls }: { state: StageState; controls: React.ReactNode }) {
  const { settings, mySide, turn } = state;
  const now = useNow(250, !!state.clocks);
  const meClock = clockView(state.clocks, "me", now);

  return (
    <section className={styles.zigaBottomBar}>
      {controls}

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

/** Dải chữ chạy lớn trên cùng: hiển thị ván đấu, tên kênh, khai cuộc, thành tích, lời kêu gọi. */
/** Dòng giới thiệu AI trên dải chữ chạy khi bật nhân vật AI (?ai=); đổi bằng ?aitext=... */
export const DEFAULT_AI_TICKER = "🤖 Hôm nay thử nghiệm AI trợ lý: comment câu hỏi về cờ tướng, AI sẽ trả lời bằng giọng nói!";

function Ticker({ state, aiText }: { state: StageState; aiText?: string | null }) {
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
      {aiText && (
        <>
          <span className={styles.tickerAi}>{aiText}</span>
          <span className={styles.tickerDot}>✦</span>
        </>
      )}
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
      host: "Anh IT DZ",
      today: { win: 5, draw: 1, loss: 2 },
      goal: { label: "người theo dõi", current: 8500, target: 10000, reward: "Quà tặng fan cứng" },
      timeControl: { totalMin: 15, perMoveSec: 60 },
      me: { name: "Anh IT DZ", title: "Kỳ Sĩ", stars: 1 },
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
  const isPuzzlePreview = sp.get("preview") === "puzzle" || sp.get("puzzle") === "1";
  const aiSrc = useMemo(() => aiAvatarSrc(sp), [sp]);
  const aiTicker = aiSrc ? sp.get("aitext")?.trim() || DEFAULT_AI_TICKER : null;

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

  const { state: socketState, connected: socketConnected, sendCommand } = useStageFeed(room, recap.show, onVoice);
  const preview = useMemo(
    () => (isPuzzlePreview ? getPreviewPuzzleState(getPreviewZigaState()) : isPreview ? getPreviewZigaState() : null),
    [isPreview, isPuzzlePreview],
  );
  const state = socketState ?? preview;
  const connected = socketConnected || isPreview || isPuzzlePreview;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  if (state && state.ply !== ply) setPly(state.ply);
  const scale = useFitScale();
  // Sân khấu không hiện thẻ "ĂN XE!/ĂN PHÁO!…" — chỉ giữ chiếu tướng và kết thúc ván. Đang chiếu cờ thế thì chỉ ghi nhận.
  const moment = useMoment(state?.bigMoment?.type === "bigCapture" ? null : state?.bigMoment, !!state?.puzzle);

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
        ) : state.puzzle ? (
          <PuzzleShow state={state} puzzle={state.puzzle} transparent={isTransparent} />
        ) : (
          <Stage
            state={state}
            room={socketState ? room : null}
            sendCommand={sendCommand}
            connected={connected}
            moment={moment}
            recap={recap}
            speechBubble={speechBubble}
            aiSrc={aiSrc}
            aiTicker={aiTicker}
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
  room,
  sendCommand,
  connected,
  moment,
  recap,
  speechBubble,
  onTestVoice,
  aiSrc,
  aiTicker,
}: {
  state: StageState;
  /** Mã phòng khi đang nối trang điều khiển thật (bản xem trước: null, các nút hành động bị tắt). */
  room: string | null;
  sendCommand: (cmd: StageCommand) => void;
  connected: boolean;
  moment: BigMoment | null;
  recap: { shown: boolean; toggle: () => void; close: () => void };
  speechBubble: { text: string; type: StageVoiceEvent } | null;
  onTestVoice?: () => void;
  aiSrc?: string | null;
  /** Dòng giới thiệu AI trên dải chữ chạy (chỉ có khi bật nhân vật AI). */
  aiTicker?: string | null;
}) {
  const { settings, mySide, turn } = state;
  const oppSide: Side = mySide === "r" ? "b" : "r";
  const shaking = moment?.type === "check";
  const introId = useGameIntro(state.ply, !state.trial && !state.review);
  const now = useNow(250, !!state.clocks);
  const trial = state.trial ?? null;

  // Phân tích / xem lại ván đã lưu ngay trên sân khấu (bấm nút Phân tích hoặc chọn từ Lịch sử).
  // Trang điều khiển cũng chiếu phân tích được (state.review); sân khấu tự mở thì ưu tiên cái của sân khấu.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reviewGameId, setReviewGameId] = useState<string | null>(null);
  const [reviewPly, setReviewPly] = useState(0);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const gameReview = useGameReview(room, reviewGameId);
  const { reviewAt } = gameReview;
  const localReview = useMemo(() => (reviewGameId ? reviewAt(reviewPly) : null), [reviewGameId, reviewPly, reviewAt]);
  const review = localReview ?? state.review ?? null;
  const reviewing = reviewGameId !== null;

  const openReview = useCallback((gameId: string, analyze: boolean) => {
    setHistoryOpen(false);
    setReviewGameId(gameId);
    setReviewPly(0);
    setAutoAnalyze(analyze);
  }, []);
  const exitReview = useCallback(() => setReviewGameId(null), []);

  // Ván chưa có phân tích AI: chạy một lần khi người dẫn chọn "Phân tích" (Xem lại thì không).
  const { game: reviewGame, analysis: reviewAnalysis, loading: reviewLoading, analyzing, error: reviewError, runAnalysis } = gameReview;
  useEffect(() => {
    if (!autoAnalyze || !reviewGame || reviewAnalysis || reviewLoading || analyzing || reviewError) return;
    queueMicrotask(() => setAutoAnalyze(false));
    void runAnalysis();
  }, [autoAnalyze, reviewGame, reviewAnalysis, reviewLoading, analyzing, reviewError, runAnalysis]);

  const reviewTotal = gameReview.totalPlies;
  const seekReview = useCallback((ply: number) => setReviewPly(Math.max(0, Math.min(reviewTotal, ply))), [reviewTotal]);
  const nextTurning = useCallback(() => {
    const tps = [...gameReview.turningPoints].sort((a, b) => a.ply - b.ply);
    const next = tps.find((tp) => tp.ply > reviewPly) ?? tps[0];
    if (next) setReviewPly(next.ply);
  }, [gameReview.turningPoints, reviewPly]);

  const [reviewTrialing, setReviewTrialing] = useState(false);
  useEffect(() => {
    if (!reviewing || reviewTrialing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") setReviewPly((p) => Math.max(0, p - 1));
      else if (e.key === "ArrowRight") setReviewPly((p) => Math.min(reviewTotal, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewing, reviewTrialing, reviewTotal]);

  const reviewStatus = !reviewing
    ? null
    : reviewError
      ? `⚠️ ${reviewError}`
      : reviewLoading || !reviewGame
        ? "Đang tải ván…"
        : analyzing
          ? `AI đang phân tích ván… ${gameReview.progress}%`
          : null;

  // Lưu ván: trang điều khiển giữ mã ván và hàng đợi offline, sân khấu chỉ gửi lệnh và báo kết quả nó gửi về.
  const saveState = saveStateOf(state.archive, settings.round);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" | "error" } | null>(null);
  const showToast = useCallback((text: string, tone: "ok" | "warn" | "error") => setToast({ text, tone }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3_500);
    return () => clearTimeout(t);
  }, [toast]);
  // Trang điều khiển báo lưu xong / xếp hàng / lỗi: báo một lần lúc trạng thái đổi.
  const [seenSaveState, setSeenSaveState] = useState(saveState);
  if (seenSaveState !== saveState) {
    setSeenSaveState(saveState);
    const round = state.archive?.savedRound ?? settings.round;
    if (saveState === "saved") setToast({ text: `✓ Đã lưu Ván ${round}`, tone: "ok" });
    else if (saveState === "queued") setToast({ text: `Mất mạng: Ván ${round} đã xếp hàng, sẽ tự gửi lại`, tone: "warn" });
    else if (saveState === "error") setToast({ text: `⚠️ ${state.archive?.error ?? "Lưu ván thất bại"}`, tone: "error" });
  }

  const onSave = useCallback(() => {
    if (!connected) {
      showToast("Mất kết nối với trang Tường thuật, chưa lưu được", "error");
      return;
    }
    sendCommand("save");
  }, [connected, sendCommand, showToast]);

  // Phân tích: ván vừa lưu của buổi này; chưa lưu ván nào thì mở Lịch sử để chọn.
  const onAnalyze = useCallback(() => {
    const archive = state.archive;
    if (archive?.gameId && archive.status === "saved") openReview(archive.gameId, true);
    else {
      setHistoryOpen(true);
      showToast("Chọn một ván đã lưu để phân tích", "warn");
    }
  }, [state.archive, openReview, showToast]);

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

  // Vẽ nét trên bàn cờ trực tiếp trên sân khấu
  const [sketch, draw] = useReducer(drawingReducer, EMPTY_DRAWING);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState<string>(STAGE_DRAWING_COLORS[0].value);
  const clearDrawings = useCallback(() => draw({ type: "clear" }), []);

  // Đi thử nước biến trực tiếp trên sân khấu
  const liveNotations = useMemo(() => (state.moves || []).map((m) => m.notation), [state.moves]);
  const trialControls = useTrialMoves(liveNotations);
  const isTrialActive = Boolean(trialControls.trial);
  const isTrialMode = Boolean(trial || isTrialActive);
  const drawingBeforeTrial = useRef(false);

  const toggleTrial = useCallback(() => {
    if (trialControls.trial) {
      trialControls.exit();
      setDrawing(drawingBeforeTrial.current);
      return;
    }
    drawingBeforeTrial.current = drawing;
    // Đang xem một nước của ván cũ thì bên đi là bên đến lượt ở nước đó, không phải ván đang đánh.
    trialControls.start({ board: displayBoard, turn: (selectedPly === null ? review?.turn : undefined) ?? state.turn });
    setDrawing(false);
  }, [trialControls, displayBoard, selectedPly, review?.turn, state.turn, drawing]);
  if (reviewTrialing !== (reviewing && isTrialActive)) setReviewTrialing(reviewing && isTrialActive);

  /** Rời biến thử (khi chuyển nước hay thoát phân tích): bàn cờ phải về đúng nước đang xem. */
  const leaveTrial = () => {
    if (!trialControls.trial) return;
    trialControls.exit();
    setDrawing(drawingBeforeTrial.current);
  };

  // AI sâu (Pikafish ~1,5M nodes, MultiPV 3) cho thế đang hiện khi phân tích trên sân khấu: nước của ván, hoặc biến
  // người dẫn đang đi thử. Đợi người dẫn ngừng bấm một chút rồi mới gọi. Bấm nhanh qua nhiều nước thì kết quả về lộn
  // thứ tự, nên giữ kết quả theo từng thế cờ (quay lại nước đã xem thì có ngay) thay vì kết quả mới nhất của hook.
  const { analyze: analyzeDeep } = usePositionAnalysis("deep");
  const [deepByFen, setDeepByFen] = useState<Record<string, PositionAnalysisResult | "error">>({});
  const deepPending = useRef(new Set<string>());
  const analysisFen = !reviewing
    ? null
    : isTrialActive && trialControls.position
      ? toFen(trialControls.position)
      : localReview?.turn
        ? toFen({ board: localReview.board, turn: localReview.turn })
        : null;
  useEffect(() => {
    if (!analysisFen) return;
    const pos = parseFen(analysisFen);
    if (deepByFen[analysisFen]) return;
    const t = setTimeout(() => {
      const pending = deepPending.current;
      if (pending.has(analysisFen)) return;
      pending.add(analysisFen);
      analyzeDeep(pos.board, pos.turn)
        .then((r) => setDeepByFen((m) => ({ ...m, [analysisFen]: r.layer1.engineAvailable ? r : "error" })))
        .catch(() => setDeepByFen((m) => ({ ...m, [analysisFen]: "error" })))
        .finally(() => pending.delete(analysisFen));
    }, 350);
    return () => clearTimeout(t);
  }, [analysisFen, analyzeDeep, deepByFen]);
  const deepEntry = analysisFen ? deepByFen[analysisFen] : undefined;
  const deepResult = deepEntry && deepEntry !== "error" ? deepEntry : null;
  const deepBest = deepResult?.layer1.candidates[0] ?? null;
  const deepThinking = !!analysisFen && !deepEntry;
  const deepRedScore = deepResult ? (deepResult.turn === "r" ? deepResult.layer1.evalCp : -deepResult.layer1.evalCp) : null;

  // Phím tắt bàn phím
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) draw({ type: "redo" });
        else draw({ type: "undo" });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        draw({ type: "redo" });
        return;
      }
      if (e.altKey) return;
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setDrawing((d) => !d);
        return;
      }
      if (["1", "2", "3", "4"].includes(e.key) && !e.ctrlKey && !e.metaKey) {
        const idx = Number(e.key) - 1;
        if (STAGE_DRAWING_COLORS[idx]) setColor(STAGE_DRAWING_COLORS[idx].value);
        return;
      }
      if (e.key === "Escape" || key === "c") {
        clearDrawings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearDrawings]);

  // Tổng hợp mũi tên và khoanh ô (từ phòng điều khiển + nét vẽ trực tiếp)
  const combinedArrows = useMemo(() => {
    if (reviewing) {
      // Mũi tên đỏ của trang phân tích ván = nước sai ở bước ngoặt; chỉ đúng khi đang xem nước của ván, không phải biến thử.
      const mistake = isTrialActive ? [] : (review?.arrows ?? []).filter((a) => a.color?.startsWith("rgba(239"));
      const ai = (deepResult?.layer1.candidates ?? []).slice(0, 3).map((c, i) => ({ from: c.move.from, to: c.move.to, color: DEEP_ARROW_COLORS[i], kind: "custom" as const }));
      return [...ai, ...mistake, ...sketch.present.arrows];
    }
    const baseArrows = review?.arrows?.length
      ? review.arrows
      : review?.bestMove
        ? [{ from: review.bestMove.from, to: review.bestMove.to, color: "rgba(34, 197, 94, 0.9)" }]
        : (state.arrows || []);
    return [...baseArrows, ...sketch.present.arrows];
  }, [reviewing, isTrialActive, deepResult, review, state.arrows, sketch.present.arrows]);

  const combinedHighlights = useMemo(() => {
    const baseMarks = state.highlights || [];
    return [...baseMarks, ...sketch.present.marks];
  }, [state.highlights, sketch.present.marks]);

  const liveFxOn = !isTrialMode && !review && selectedPly === null;
  const mateOutcome = moment?.type === "mate" ? outcome({ board: state.board, turn: state.turn }) : null;
  const mateWin = !!mateOutcome?.over && mateOutcome.winner === mySide;

  const meClock = clockView(state.clocks, "me", now);
  const oppClock = clockView(state.clocks, "opponent", now);
  return (
    <>
      {!connected && <div className={styles.offline}>Mất kết nối, đang nối lại…</div>}
      {/* Đi thử: làm tối cả sân khấu, chỉ bàn cờ biến thử nổi lên, để người xem biết đây không phải ván thật. */}
      {isTrialMode && <div className={styles.trialDim} aria-hidden="true" />}
      {/* Chiếu tướng: viền đỏ quanh cả sân khấu đập theo nhịp, như còi báo động. */}
      {liveFxOn && moment && moment.type !== "bigCapture" && (
        <div key={moment.id} className={styles.checkVignette} data-type={moment.type} aria-hidden="true" />
      )}
      {introId !== null && liveFxOn && <GameIntro key={introId} state={state} oppSide={oppSide} />}

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
          aiSrc={aiSrc}
        />
      </section>

      {/* Dải chữ chạy lớn nối phần đầu với bàn cờ */}
      {review ? (
        <ReviewStrip
          text={
            reviewStatus ??
            (isTrialActive
              ? trialText(trialControls.stage?.trial.notations ?? [], deepBest)
              : (review.turningPoint?.description ??
                (deepBest?.narrative ? `${deepBest.notation} (${deepBest.purposeLabel}): ${deepBest.narrative}` : null) ??
                review.commentary ??
                formatEvalScore(review.evalScore)))
          }
          best={reviewing ? (deepBest ? `${deepBest.notation} · ${deepResult?.layer1.evalText}` : null) : review.bestNotation}
          thinking={reviewing && !reviewStatus && deepThinking}
        />
      ) : (
        <Ticker state={state} aiText={aiTicker} />
      )}

      {/* Bàn cờ Ziga chính giữa tràn viền 1080px */}
      <div className={styles.boardWrap} data-shake={shaking || undefined} data-trial={isTrialMode ? true : undefined} data-review={review ? true : undefined}>
        {review ? (
          <div className={styles.reviewBadge} role="status">
            AI PHÂN TÍCH · VÁN {review.round ?? settings.round}
          </div>
        ) : isTrialMode ? (
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
        {reviewing && (deepRedScore !== null || gameReview.redScores) && (
          <EvalBar redScore={deepRedScore ?? (isTrialActive ? null : (gameReview.redScores?.[localReview?.ply ?? 0] ?? null))} bottom={mySide} />
        )}
        <XiangqiBoard
          board={isTrialActive && trialControls.stage ? trialControls.stage.board : displayBoard}
          orientation={mySide}
          lastMove={isTrialActive && trialControls.stage ? trialControls.stage.lastMove : displayLastMove}
          checkSquare={
            isTrialActive && trialControls.stage
              ? trialControls.stage.checkSquare
              : selectedPly === null
                ? state.checkSquare
                : null
          }
          arrows={combinedArrows}
          highlights={combinedHighlights}
          selected={
            isTrialActive && trialControls.stage
              ? trialControls.stage.selected
              : selectedPly === null
                ? (state.selected ?? null)
                : null
          }
          targets={
            isTrialActive && trialControls.stage
              ? trialControls.stage.targets
              : selectedPly === null
                ? (state.targets ?? [])
                : []
          }
          arrowWidthScale={1.1}
          animateArrows
          className={styles.boardRim}
          skin={{ board: "jade", piece: "gold" }}
          riverWatermark="Cờ Ziga"
          intro={introId !== null && liveFxOn}
          sketchColor={color}
          onSquareClick={isTrialActive && trialControls.stage ? trialControls.onSquareClick : undefined}
          onAnnotate={drawing ? (from, to) => draw({ type: "annotate", from, to, color }) : undefined}
          disabled={!drawing && !isTrialActive}
        />
        {moment && (
          <div className={styles.momentOverlay}>
            {moment.type === "mate" && <MateBurst win={mateWin} />}
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
        {historyOpen && room && (
          <HistorySheet room={room} reloadKey={state.archive?.savedRound} onClose={() => setHistoryOpen(false)} onOpen={openReview} />
        )}
        {toast && <StageToast text={toast.text} tone={toast.tone} />}
      </div>

      {/* Thanh công cụ Vẽ & Đi thử (cả khi đang phân tích ván: bày biến từ nước đang xem) */}
      <div className={styles.liveToolbar} role="toolbar" aria-label="Thanh công cụ vẽ và đi thử">
        <button
          type="button"
          className={styles.toolbarBtn}
          aria-pressed={drawing}
          title={drawing ? "Tắt vẽ để đi quân bằng tay (Phím Space)" : "Bật chế độ vẽ mũi tên & khoanh ô (Phím Space)"}
          onClick={() => setDrawing((d) => !d)}
        >
          ✏️ {drawing ? "Đang vẽ" : "Vẽ"}
        </button>
        <button
          type="button"
          className={styles.toolbarBtn}
          aria-pressed={isTrialActive}
          title={isTrialActive ? "Thoát đi thử, quay về ván thật" : "Bày biến trên bàn cờ tạm để giải thích"}
          onClick={toggleTrial}
        >
          🧪 {isTrialActive ? "Thoát đi thử" : "Đi thử"}
        </button>

        <div className={styles.swatchGroup} role="radiogroup" aria-label="Chọn màu vẽ">
          {STAGE_DRAWING_COLORS.map((c, idx) => (
            <button
              key={c.value}
              type="button"
              className={styles.colorSwatch}
              style={{ backgroundColor: c.value }}
              aria-label={`Màu ${c.label}`}
              title={`Màu ${c.label} (Phím ${idx + 1})`}
              aria-pressed={color === c.value}
              onClick={() => setColor(c.value)}
            />
          ))}
        </div>

        <button
          type="button"
          className={`${styles.toolbarBtn} ${styles.iconBtn}`}
          onClick={() => draw({ type: "undo" })}
          disabled={sketch.past.length === 0}
          title="Hoàn tác nét vẽ (Ctrl+Z)"
          aria-label="Hoàn tác nét vẽ"
        >
          ↶
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${styles.iconBtn}`}
          onClick={() => draw({ type: "redo" })}
          disabled={sketch.future.length === 0}
          title="Làm lại nét vẽ (Ctrl+Y)"
          aria-label="Làm lại nét vẽ"
        >
          ↷
        </button>
        <button
          type="button"
          className={styles.toolbarBtn}
          onClick={clearDrawings}
          title="Xóa tất cả nét vẽ (Phím C hoặc Esc)"
        >
          Xóa nét vẽ
        </button>
        <button
          type="button"
          className={`${styles.toolbarBtn} ${styles.iconBtn}`}
          onClick={() => setDrawerOpen(true)}
          title="Trận cờ & Lời bình"
          aria-label="Biên bản trận cờ và lời bình chuyên gia"
        >
          📜
        </button>
      </div>

      {isTrialActive && trialControls.trial && (
        <TrialMovesBar
          notations={trialControls.stage?.trial.notations ?? []}
          firstSide={trialControls.trial.base.turn}
          onBack={trialControls.back}
          onExit={toggleTrial}
        />
      )}

      {/* Hàng dưới: ô điều khiển bên trái (Phân tích · Lưu ván · Lịch sử, hoặc điều hướng khi đang phân tích), kỳ thủ bạn bên phải */}
      <ZigaBottomBar
        state={state}
        controls={
          reviewing ? (
            <ReviewNav
              ply={localReview?.ply ?? 0}
              total={reviewTotal}
              hasTurningPoints={gameReview.turningPoints.length > 0}
              onPrev={() => {
                leaveTrial();
                seekReview(reviewPly - 1);
              }}
              onNext={() => {
                leaveTrial();
                seekReview(reviewPly + 1);
              }}
              onNextTurning={() => {
                leaveTrial();
                nextTurning();
              }}
              onExit={() => {
                leaveTrial();
                exitReview();
              }}
            />
          ) : (
            <StageActionButtons
              saveState={saveState}
              historyOpen={historyOpen}
              canAct={room !== null}
              onAnalyze={onAnalyze}
              onSave={onSave}
              onHistory={() => setHistoryOpen((o) => !o)}
              aiVoice={!!aiSrc}
            />
          )
        }
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
