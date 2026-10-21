"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { useHydrated } from "@/hooks/useHydrated";
import { useQueryParam } from "@/hooks/useLocationSearch";
import { STAGE_ROOM_RE, stageSocketUrl, type StageRelayMessage, type StageVoiceEvent } from "@/lib/stage-protocol";
import { formatClock } from "@/lib/vision/zigavn-panels";
import { PIECE_CHAR } from "@/lib/xiangqi/notation";
import { inCheck, outcome, type PieceType, type Side } from "@/lib/xiangqi/engine";
import { playStageVoiceEvent, unlockAudio } from "@/lib/stage-voice";
import { DEFAULT_STAGE_VOICE_LINES, liveClocks, type BigMoment, type StageClocks, type StagePlayer, type StageState } from "../stage-sync";
import styles from "./stage.module.css";

/** Thẻ tóm tắt cho người mới vào: chỉ hiện khi người dùng bấm hoặc nhận tin recap từ trang điều khiển. */
const RECAP_SHOW_MS = 10_000;
const MOMENT_SHOW_MS = 3_500;
/** Thẻ luân phiên ở góc dưới (mục tiêu, thành tích, lời mời). */
const ROTATE_MS = 12_000;

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
  /** Tổng giờ còn dưới 30 giây. */
  critical: boolean;
  /** Thời gian còn cho nước này (chỉ bên đang chạy): chữ, số giây, phần còn lại (0..1) để vẽ vòng. */
  perMove?: { text: string; seconds: number; left: number };
}

const CRITICAL_TOTAL_MS = 30_000;
// Vòng đếm giờ nước đi bao quanh logo người chơi (logo 60px, vòng 76px)
const RING_SIZE = 76;
const RING_R = 35;
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
  const stars = player.stars ?? 0;
  const turnLabel = toMove ? (isMe ? "ĐẾN LƯỢT" : "ĐANG NGHĨ") : side === "r" ? "ĐỎ" : "ĐEN";
  const perMove = clock?.perMove;
  const low = !!perMove && perMove.left <= 1 / 6;
  return (
    <div className={styles.playerCard} data-active={toMove || undefined}>
      <div className={styles.avatarWrap} data-low={low || undefined}>
        {perMove && (
          <svg
            className={styles.avatarRing}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            role="timer"
            aria-label={`Nước này ${perMove.text}`}
          >
            <circle className={styles.ringTrack} cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} />
            <circle
              className={styles.ringFill}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_R}
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - perMove.left)}
            />
          </svg>
        )}
        <div className={styles.avatar} data-side={side}>
          {pieceChar(side, "k")}
        </div>
        {perMove && <span className={styles.avatarSeconds}>{perMove.seconds}</span>}
      </div>
      <div className={styles.playerInfo}>
        <div className={styles.playerNameRow}>
          <span className={styles.playerName}>{player.name}</span>
          {player.points && <span className={styles.points}>{player.points} điểm</span>}
          {isMe && <span className={styles.meBadge}>BẠN</span>}
          {ready !== null && (
            <span key={String(ready)} className={styles.readyBadge} data-ready={ready || undefined} role="status">
              {ready ? "✓ SẴN SÀNG" : "CHƯA SẴN SÀNG"}
            </span>
          )}
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
      {clock ? (
        <div
          className={styles.clockBox}
          data-active={toMove || undefined}
          data-critical={clock.critical || undefined}
          data-low={low || undefined}
        >
          <span className={styles.clockLabel}>{turnLabel}</span>
          <span className={styles.clockTime}>{clock.total}</span>
        </div>
      ) : (
        <div className={styles.turnPill} data-active={toMove || undefined}>
          <span className={styles.turnLabel}>{turnLabel}</span>
        </div>
      )}
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

  const { state, connected } = useStageFeed(room, recap.show, onVoice);
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
      if (spoken) showBubble(spoken, "check");
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
      if (spoken) showBubble(spoken, event);
    }
  }, [state, showBubble]);

  useEffect(() => () => clearTimeout(bubbleTimer.current), []);

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

      <section className={styles.matchBar}>
        <div className={styles.matchRow}>
          <span className={styles.roundBadge}>VÁN {settings.round}</span>
          <span className={styles.muted}>Khai cuộc:</span>
          <span className={styles.opening}>{state.openingName ?? "chưa rõ"}</span>
          {settings.site && <span className={styles.site}>Đang chơi trên {settings.site}</span>}
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
        <div className={styles.matchRow}>
          <span className={styles.muted}>Hôm nay</span>
          <span className={styles.chip}>{settings.today.win} thắng</span>
          <span className={styles.chip}>{settings.today.draw} hòa</span>
          <span className={styles.chip}>{settings.today.loss} thua</span>
          <span className={styles.material}>{state.materialBalance.text}</span>
        </div>
      </section>

      <PlayerCard player={settings.opponent} side={oppSide} isMe={false} toMove={turn === oppSide} clock={clockView(state.clocks, "opponent", now)} ready={state.ready?.opponent ?? null} />

      <div className={styles.boardWrap} data-shake={shaking || undefined} data-trial={trial ? true : undefined}>
        {trial && (
          <div className={styles.trialBadge} role="status">
            BIẾN THỬ
          </div>
        )}
        <XiangqiBoard
          board={state.board}
          orientation={mySide}
          lastMove={state.lastMove}
          checkSquare={state.checkSquare}
          arrows={state.arrows}
          highlights={state.highlights}
          selected={state.selected ?? null}
          targets={state.targets ?? []}
          arrowWidthScale={1.8}
          animateArrows
          className={styles.boardRim}
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
              <span className={styles.speechText}>"{speechBubble.text}"</span>
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

      <PlayerCard player={settings.me} side={mySide} isMe toMove={turn === mySide} clock={clockView(state.clocks, "me", now)} ready={state.ready?.me ?? null} />

      <section className={styles.ribbon} data-check={commentary?.isCheck || undefined} data-trial={trial ? true : undefined}>
        <span className={styles.ribbonTag}>{trial ? "BIẾN THỬ" : `NƯỚC ${Math.ceil(state.ply / 2)}`}</span>
        {trial ? (
          <span className={styles.ribbonMove}>
            {/* Chuỗi dài thì giữ mấy nước cuối cho vừa ribbon. */}
            {trial.notations.length
              ? `${trial.notations.length > 3 ? "… " : ""}${trial.notations.slice(-3).join(" → ")}`
              : "BLV đang bày biến…"}
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
        <span className={styles.ribbonTurn}>{turnText}</span>
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
