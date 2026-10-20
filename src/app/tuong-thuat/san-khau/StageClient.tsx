"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { useHydrated } from "@/hooks/useHydrated";
import { useQueryParam } from "@/hooks/useLocationSearch";
import { STAGE_ROOM_RE, stageSocketUrl, type StageRelayMessage } from "@/lib/stage-protocol";
import { formatClock } from "@/lib/vision/zigavn-panels";
import { PIECE_CHAR, PIECE_NAME } from "@/lib/xiangqi/notation";
import type { PieceType, Side } from "@/lib/xiangqi/engine";
import { liveClocks, type BigMoment, type StageClocks, type StagePlayer, type StageState } from "../stage-sync";
import styles from "./stage.module.css";

/** Thẻ tóm tắt cho người mới vào: tự hiện mỗi chừng này, và mỗi lần người dẫn bấm. */
const RECAP_EVERY_MS = 60_000;
const RECAP_SHOW_MS = 8_000;
const MOMENT_SHOW_MS = 3_500;
/** Thẻ luân phiên ở góc dưới (mục tiêu, thành tích, lời mời). */
const ROTATE_MS = 12_000;

/** Nhận trạng thái từ trang điều khiển qua /ws/stage; tự kết nối lại khi rớt mạng hoặc server khởi động lại. */
function useStageFeed(room: string | null, onRecap: () => void) {
  const [state, setState] = useState<StageState | null>(null);
  const [connected, setConnected] = useState(false);
  const onRecapRef = useRef(onRecap);
  useEffect(() => {
    onRecapRef.current = onRecap;
  }, [onRecap]);

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

/** Thẻ tóm tắt: hiện khi gọi show(), và tự hiện định kỳ khi ván đã đi được vài nước. */
function useRecap(ply: number) {
  const [shown, setShown] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback(() => {
    setShown(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setShown(false), RECAP_SHOW_MS);
  }, []);
  const midGame = ply >= 4;
  useEffect(() => {
    if (!midGame) return;
    const every = setInterval(show, RECAP_EVERY_MS);
    return () => clearInterval(every);
  }, [midGame, show]);
  useEffect(() => () => clearTimeout(hide.current), []);
  return [shown, show] as const;
}

function useRotation(count: number) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => setI((x) => x + 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [count]);
  return count ? i % count : 0;
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
  /** Thời gian còn cho nước này (chỉ bên đang chạy), và phần còn lại (0..1) để vẽ thanh. */
  perMove?: { text: string; left: number };
}

/** Giờ hiển thị của một bên lúc `now` (sân khấu tự đếm lùi giữa hai lần trang điều khiển gửi). */
function clockView(clocks: StageClocks | null, who: "me" | "opponent", now: number): ClockView | null {
  if (!clocks) return null;
  const v = liveClocks(clocks, now);
  const view: ClockView = { total: formatClock(Math.ceil(v[who] / 1000)) };
  if (clocks.running === who && v.perMove !== null) {
    view.perMove = { text: formatClock(Math.ceil(v.perMove / 1000)), left: v.perMove / clocks.perMoveTotal };
  }
  return view;
}

const pieceChar = (side: Side, t: PieceType) => PIECE_CHAR[side === "r" ? t.toUpperCase() : t];

function PlayerCard({
  player,
  side,
  lost,
  isMe,
  toMove,
  clock,
}: {
  player: StagePlayer;
  side: Side;
  /** Quân của bên KIA mà người này đã ăn. */
  lost: PieceType[];
  isMe: boolean;
  toMove: boolean;
  clock: ClockView | null;
}) {
  const other: Side = side === "r" ? "b" : "r";
  const stars = player.stars ?? 0;
  return (
    <div className={styles.playerCard} data-active={toMove || undefined}>
      <div className={styles.avatar} data-side={side}>
        {pieceChar(side, "k")}
      </div>
      <div className={styles.playerInfo}>
        <div className={styles.playerNameRow}>
          <span className={styles.playerName}>{player.name}</span>
          {player.points && <span className={styles.points}>{player.points} điểm</span>}
          {isMe && <span className={styles.meBadge}>BẠN</span>}
        </div>
        {(player.title || stars > 0) && (
          <div className={styles.playerTitle}>
            {player.title}
            {stars > 0 && (
              <span className={styles.stars} aria-label={`${stars} sao`}>
                {"★".repeat(Math.min(3, stars))}
                <span className={styles.starOff}>{"★".repeat(Math.max(0, 3 - stars))}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.captured} aria-label={`Đã ăn: ${lost.map((t) => PIECE_NAME[t]).join(", ") || "chưa có"}`}>
        {lost.map((t, i) => (
          <span key={i} className={styles.miniPiece} data-side={other}>
            {pieceChar(other, t)}
          </span>
        ))}
      </div>
      <div className={styles.turnPill} data-active={toMove || undefined} data-clock={clock ? true : undefined}>
        <span className={styles.turnLabel}>{toMove ? (isMe ? "ĐẾN LƯỢT" : "ĐANG NGHĨ") : side === "r" ? "ĐỎ" : "ĐEN"}</span>
        {clock && <span className={styles.clock}>{clock.total}</span>}
        {clock?.perMove && (
          <span className={styles.perMove} data-low={clock.perMove.left <= 1 / 6 || undefined}>
            <span className={styles.perMoveText}>Nước này {clock.perMove.text}</span>
            <span className={styles.perMoveTrack}>
              <span className={styles.perMoveFill} style={{ width: `${clock.perMove.left * 100}%` }} />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function InfoCard({ state }: { state: StageState }) {
  const { goal, today, cta } = state.settings;
  const slides: React.ReactNode[] = [];
  if (goal && goal.target > 0) {
    const pct = Math.min(100, Math.round((goal.current / goal.target) * 100));
    slides.push(
      <>
        <span className={styles.infoKicker}>MỤC TIÊU BUỔI LIVE</span>
        <span className={styles.infoBig}>
          {goal.current.toLocaleString("vi-VN")} / {goal.target.toLocaleString("vi-VN")} {goal.label}
        </span>
        <span className={styles.goalTrack}>
          <span className={styles.goalFill} style={{ width: `${pct}%` }} />
        </span>
        {goal.reward && <span className={styles.infoSmall}>{goal.reward}</span>}
      </>,
    );
  }
  slides.push(
    <>
      <span className={styles.infoKicker}>THÀNH TÍCH HÔM NAY</span>
      <span className={styles.infoBig}>
        {today.win} thắng · {today.draw} hòa · {today.loss} thua
      </span>
    </>,
  );
  if (cta) {
    slides.push(
      <>
        <span className={styles.infoKicker}>CỜ TƯỚNG TRỰC TIẾP</span>
        <span className={styles.infoBig}>{cta}</span>
      </>,
    );
  }
  const i = useRotation(slides.length);
  return (
    <section className={styles.infoCard} aria-live="polite">
      <div key={i} className={styles.infoSlide}>
        {slides[i]}
      </div>
      {slides.length > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {slides.map((_, k) => (
            <span key={k} className={styles.dot} data-on={k === i || undefined} />
          ))}
        </div>
      )}
    </section>
  );
}

export function StageClient() {
  const hydrated = useHydrated();
  const param = useQueryParam("room");
  const room = STAGE_ROOM_RE.test(param) ? param : null;

  const [ply, setPly] = useState(0);
  const [recap, showRecap] = useRecap(ply);
  const { state, connected } = useStageFeed(room, showRecap);
  if (state && state.ply !== ply) setPly(state.ply);
  const scale = useFitScale();
  const moment = useMoment(state?.bigMoment);

  return (
    <div className={styles.viewport}>
      <div className={styles.canvas} style={{ transform: `scale(${scale})` }}>
        {!state ? (
          <div className={styles.waiting}>
            {hydrated && !room
              ? "Mở trang này bằng nút “Mở sân khấu” trên trang Tường thuật (đường dẫn cần có mã phòng)."
              : connected
                ? "Đã kết nối. Đang chờ trang Tường thuật gửi bàn cờ…"
                : "Đang kết nối tới trang Tường thuật…"}
          </div>
        ) : (
          <Stage state={state} connected={connected} moment={moment} recap={recap} />
        )}
      </div>
    </div>
  );
}

function Stage({ state, connected, moment, recap }: { state: StageState; connected: boolean; moment: BigMoment | null; recap: boolean }) {
  const { settings, mySide, turn, captured, commentary } = state;
  const oppSide: Side = mySide === "r" ? "b" : "r";
  // Quân bên kia đã mất = quân bên này đã ăn.
  const lostOf = (s: Side) => (s === "r" ? captured.redLost : captured.blackLost);
  const shaking = moment?.type === "bigCapture" || moment?.type === "check";
  const now = useNow(250, !!state.clocks);

  return (
    <>
      {!connected && <div className={styles.offline}>Mất kết nối, đang nối lại…</div>}

      <section className={styles.matchBar}>
        <div className={styles.matchRow}>
          <span className={styles.roundBadge}>VÁN {settings.round}</span>
          <span className={styles.muted}>Khai cuộc:</span>
          <span className={styles.opening}>{state.openingName ?? "chưa rõ"}</span>
          {settings.site && <span className={styles.site}>Đang chơi trên {settings.site}</span>}
        </div>
        <div className={styles.matchRow}>
          <span className={styles.muted}>Hôm nay</span>
          <span className={styles.chip}>{settings.today.win} thắng</span>
          <span className={styles.chip}>{settings.today.draw} hòa</span>
          <span className={styles.chip}>{settings.today.loss} thua</span>
          <span className={styles.material}>{state.materialBalance.text}</span>
        </div>
      </section>

      <PlayerCard player={settings.opponent} side={oppSide} lost={lostOf(mySide)} isMe={false} toMove={turn === oppSide} clock={clockView(state.clocks, "opponent", now)} />

      <div className={styles.boardWrap} data-shake={shaking || undefined}>
        <XiangqiBoard
          board={state.board}
          orientation={mySide}
          lastMove={state.lastMove}
          checkSquare={state.checkSquare}
          arrows={state.arrows}
          highlights={state.highlights}
          arrowWidthScale={1.8}
          animateArrows
          className={styles.boardRim}
          disabled
        />
        {moment && (
          <div className={styles.momentOverlay}>
            <div className={styles.momentCard} data-type={moment.type}>
              <span className={styles.momentBadge}>{moment.badge}</span>
              <span className={styles.momentTitle}>{moment.title}</span>
              {moment.subtitle && <span className={styles.momentSubtitle}>{moment.subtitle}</span>}
            </div>
          </div>
        )}
        {recap && (
          <aside className={styles.recapCard} aria-label="Tóm tắt cho người mới vào">
            <span className={styles.infoKicker}>MỚI VÀO XEM? TÓM TẮT VÁN</span>
            <span className={styles.recapLine}>{state.recap.roundAndPly}</span>
            <span className={styles.recapLine}>Khai cuộc: {state.recap.openingName}</span>
            <span className={styles.recapLine}>{state.recap.materialText}</span>
            <span className={styles.recapLine}>Hôm nay: {state.recap.recordText}</span>
          </aside>
        )}
      </div>

      <PlayerCard player={settings.me} side={mySide} lost={lostOf(oppSide)} isMe toMove={turn === mySide} clock={clockView(state.clocks, "me", now)} />

      <section className={styles.ribbon} data-check={commentary?.isCheck || undefined}>
        <span className={styles.ribbonTag}>NƯỚC {Math.ceil(state.ply / 2)}</span>
        {commentary ? (
          <>
            <span className={styles.ribbonWho}>{commentary.who}</span>
            <span className={styles.ribbonMove}>{commentary.notation}</span>
            {commentary.note && <span className={styles.ribbonNote}>{commentary.note}</span>}
          </>
        ) : (
          <span className={styles.ribbonMove}>Ván mới bắt đầu</span>
        )}
        <span className={styles.ribbonTurn}>{turn === mySide ? "Đến lượt bạn" : "Đối thủ đang nghĩ…"}</span>
      </section>

      <InfoCard state={state} />

      {/* Khung camera: OBS đặt nguồn camera đè đúng lên khung này (x 770, y 1450, 286×262). */}
      <div className={styles.camFrame}>
        <span className={styles.camHint}>Camera</span>
      </div>
      <div className={styles.hostTag}>
        <span className={styles.liveDot} />
        <span>{settings.host}</span>
      </div>
    </>
  );
}
