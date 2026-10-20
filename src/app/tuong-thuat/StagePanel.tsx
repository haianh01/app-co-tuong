"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { newStageRoom, stageSocketUrl, type StageRelayMessage, type StageServerMessage } from "@/lib/stage-protocol";
import styles from "./broadcast.module.css";
import type { StageResult } from "./stage-round";
import { formatClock } from "@/lib/vision/zigavn-panels";
import { DEFAULT_STAGE_SETTINGS, liveClocks, type StageClocks, type StagePlayer, type StageSettings } from "./stage-sync";

const ROOM_KEY = "tuong-thuat:stage-room";
const SETTINGS_KEY = "tuong-thuat:stage-settings";

const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD theo giờ máy

// Thông tin sân khấu người dẫn đã nhập, nhớ giữa các lần mở trang (như cài đặt âm thanh ở lib/sound.ts: giữ ở cấp
// module, đọc localStorage một lần). Sang ngày mới thì thành tích và số ván về 0. Đây chỉ là tiện ích trên máy người
// dẫn; sân khấu nhận mọi thứ qua /ws/stage.
let settingsCache: StageSettings | null = null;
const settingsListeners = new Set<() => void>();

function loadSettings(): StageSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { date?: string; settings?: Partial<StageSettings> };
      const s = { ...DEFAULT_STAGE_SETTINGS, ...saved.settings };
      return saved.date === today() ? s : { ...s, round: 1, today: DEFAULT_STAGE_SETTINGS.today };
    }
  } catch {}
  return DEFAULT_STAGE_SETTINGS;
}

const getSettings = () => (settingsCache ??= loadSettings());

function updateSettings(update: (s: StageSettings) => StageSettings) {
  const next = update(getSettings());
  if (next === settingsCache) return;
  settingsCache = next;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ date: today(), settings: settingsCache }));
  } catch {}
  for (const fn of settingsListeners) fn();
}

function subscribeSettings(fn: () => void) {
  settingsListeners.add(fn);
  return () => {
    settingsListeners.delete(fn);
  };
}

export function useStageSettings() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, () => DEFAULT_STAGE_SETTINGS);
  return [settings, updateSettings] as const;
}

/** Mã phòng sinh một lần và nhớ lại, để đường dẫn sân khấu đã dán vào OBS dùng được mãi. */
let roomCache: string | null = null;
function getRoom(): string {
  if (roomCache) return roomCache;
  try {
    roomCache = localStorage.getItem(ROOM_KEY);
  } catch {}
  if (!roomCache) {
    roomCache = newStageRoom();
    try {
      localStorage.setItem(ROOM_KEY, roomCache);
    } catch {}
  }
  return roomCache;
}
const noSubscribe = () => () => {};

/**
 * Kết nối điều khiển tới /ws/stage. Tin "state" gần nhất được gửi lại mỗi lần nối lại (server khởi động lại thì mất
 * trạng thái cũ).
 */
export function useStageLink() {
  const room = useSyncExternalStore(noSubscribe, getRoom, () => null);
  const [viewers, setViewers] = useState(0);
  const [online, setOnline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const lastState = useRef<string | null>(null);

  useEffect(() => {
    if (!room) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    let closed = false;
    const open = () => {
      const ws = new WebSocket(stageSocketUrl(window.location, room, "control"));
      wsRef.current = ws;
      ws.onopen = () => {
        delay = 1000;
        setOnline(true);
        if (lastState.current) ws.send(lastState.current);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data)) as StageServerMessage;
          if (msg.t === "viewers") setViewers(msg.n);
        } catch {}
      };
      ws.onclose = () => {
        setOnline(false);
        setViewers(0);
        if (wsRef.current === ws) wsRef.current = null;
        if (closed) return;
        retry = setTimeout(open, delay);
        delay = Math.min(delay * 2, 5000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [room]);

  const send = useCallback((msg: StageRelayMessage) => {
    const text = JSON.stringify(msg);
    if (msg.t === "state") lastState.current = text;
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(text);
  }, []);

  return { room, viewers, online, send };
}

/** Đồng hồ đang chạy (xem trên trang điều khiển, để so với trang nguồn). */
function ClockPreview({ clocks }: { clocks: StageClocks }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const v = liveClocks(clocks, now);
  return (
    <p className={styles.muted}>
      Đồng hồ (app tự tính): bạn {formatClock(v.me / 1000)} · đối thủ {formatClock(v.opponent / 1000)}
      {v.perMove !== null && ` · nước này còn ${formatClock(v.perMove / 1000)}`}
    </p>
  );
}

function PlayerFields({ label, player, onChange }: { label: string; player: StagePlayer; onChange: (p: StagePlayer) => void }) {
  const id = label.replace(/\s+/g, "-");
  return (
    <fieldset className={styles.stageFieldset}>
      <legend className={styles.stageLabel}>{label}</legend>
      <label className={styles.stageFieldFull}>
        <span className={styles.stageLabel}>Nick</span>
        <input className={styles.stageInput} value={player.name} onChange={(e) => onChange({ ...player, name: e.target.value })} />
      </label>
      <label className={styles.stageField}>
        <span className={styles.stageLabel}>Điểm</span>
        <input className={styles.stageInput} inputMode="numeric" value={player.points ?? ""} onChange={(e) => onChange({ ...player, points: e.target.value || undefined })} />
      </label>
      <label className={styles.stageField}>
        <span className={styles.stageLabel}>Cấp</span>
        <input className={styles.stageInput} placeholder="Tập Sự" value={player.title ?? ""} onChange={(e) => onChange({ ...player, title: e.target.value || undefined })} />
      </label>
      <label className={styles.stageField} htmlFor={`${id}-stars`}>
        <span className={styles.stageLabel}>Sao (0–3)</span>
        <input
          id={`${id}-stars`}
          className={styles.stageInput}
          type="number"
          min={0}
          max={3}
          value={player.stars ?? 0}
          onChange={(e) => onChange({ ...player, stars: Math.max(0, Math.min(3, Number(e.target.value) || 0)) })}
        />
      </label>
    </fieldset>
  );
}

export function StagePanel({
  settings,
  setSettings,
  link,
  result,
  onResult,
  autoRead,
  onAutoRead,
  clocks,
}: {
  settings: StageSettings;
  setSettings: (update: (s: StageSettings) => StageSettings) => void;
  link: ReturnType<typeof useStageLink>;
  /** Kết quả đã bấm cho ván hiện tại. */
  result: StageResult | null;
  onResult: (r: StageResult | null) => void;
  autoRead: boolean;
  onAutoRead: (on: boolean) => void;
  clocks: StageClocks | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const stageUrl = link.room ? `${typeof window === "undefined" ? "" : window.location.origin}/tuong-thuat/san-khau?room=${link.room}` : "";
  const goal = settings.goal ?? { label: "tim", current: 0, target: 0 };
  const setGoal = (g: Partial<typeof goal>) => setSettings((s) => ({ ...s, goal: { ...goal, ...g } }));

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(stageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const results: [StageResult, string][] = [
    ["win", "Thắng"],
    ["draw", "Hòa"],
    ["loss", "Thua"],
  ];

  return (
    <section className={styles.stageCard}>
      <div className={styles.stageHeader}>
        <h2 className={styles.stageTitle}>
          <span className={styles.stagePulseDot} data-off={!link.viewers || undefined} />
          <span>Sân khấu livestream</span>
        </h2>
        <span className={styles.muted}>
          {!link.online ? "Mất kết nối server" : link.viewers ? `${link.viewers} sân khấu đang mở` : "Chưa mở sân khấu"}
        </span>
      </div>

      <div className={styles.row}>
        <button type="button" className={styles.btnGold} disabled={!stageUrl} onClick={() => window.open(stageUrl, "_blank", "width=450,height=800")}>
          Mở sân khấu ↗
        </button>
        <button type="button" className={styles.btn} disabled={!stageUrl} onClick={copyUrl} title="Dán vào Browser Source của OBS, kích thước 1080×1920">
          {copied ? "✓ Đã chép" : "Chép link cho OBS"}
        </button>
        <button type="button" className={styles.btn} onClick={() => link.send({ t: "recap" })} title="Hiện thẻ tóm tắt ván cho người vừa vào xem">
          Tóm tắt cho người mới
        </button>
      </div>

      <div className={styles.row}>
        <span className={styles.muted}>Ván {settings.round} · kết quả:</span>
        {results.map(([r, text]) => (
          <button key={r} type="button" className={styles.btn} aria-pressed={result === r} onClick={() => onResult(result === r ? null : r)}>
            {text}
          </button>
        ))}
        <span className={styles.muted}>
          Hôm nay: {settings.today.win} thắng · {settings.today.draw} hòa · {settings.today.loss} thua
        </span>
      </div>

      <label className={styles.check}>
        <input type="checkbox" checked={autoRead} onChange={(e) => onAutoRead(e.target.checked)} />
        Tự đọc nick, điểm từ zigavn (và giờ còn lại một lần khi bắt đầu theo dõi giữa ván)
      </label>
      {clocks && <ClockPreview clocks={clocks} />}

      <PlayerFields label="Đối thủ (ô phải)" player={settings.opponent} onChange={(opponent) => setSettings((s) => ({ ...s, opponent }))} />

      <button type="button" className={styles.btn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Ẩn cài đặt" : "Cài đặt: thông tin của bạn, mục tiêu…"}
      </button>
      {open && (
        <div className={styles.stageSettingsForm}>
          <PlayerFields label="Bạn (ô trái)" player={settings.me} onChange={(me) => setSettings((s) => ({ ...s, me }))} />
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Tên dưới camera</span>
            <input className={styles.stageInput} value={settings.host} onChange={(e) => setSettings((s) => ({ ...s, host: e.target.value }))} />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Trang cờ</span>
            <input className={styles.stageInput} value={settings.site} onChange={(e) => setSettings((s) => ({ ...s, site: e.target.value }))} />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Số ván hiện tại</span>
            <input
              className={styles.stageInput}
              type="number"
              min={1}
              value={settings.round}
              onChange={(e) => setSettings((s) => ({ ...s, round: Math.max(1, Number(e.target.value) || 1) }))}
            />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Phút mỗi bên</span>
            <input
              className={styles.stageInput}
              type="number"
              min={1}
              value={settings.timeControl.totalMin}
              onChange={(e) => setSettings((s) => ({ ...s, timeControl: { ...s.timeControl, totalMin: Math.max(1, Number(e.target.value) || 1) } }))}
            />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Giây tối đa mỗi nước</span>
            <input
              className={styles.stageInput}
              type="number"
              min={5}
              value={settings.timeControl.perMoveSec}
              onChange={(e) => setSettings((s) => ({ ...s, timeControl: { ...s.timeControl, perMoveSec: Math.max(5, Number(e.target.value) || 5) } }))}
            />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Lời mời</span>
            <input className={styles.stageInput} value={settings.cta} onChange={(e) => setSettings((s) => ({ ...s, cta: e.target.value }))} />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Mục tiêu: đã có</span>
            <input className={styles.stageInput} type="number" min={0} value={goal.current} onChange={(e) => setGoal({ current: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Mục tiêu: cần (0 = ẩn)</span>
            <input className={styles.stageInput} type="number" min={0} value={goal.target} onChange={(e) => setGoal({ target: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Đơn vị mục tiêu</span>
            <input className={styles.stageInput} placeholder="tim" value={goal.label} onChange={(e) => setGoal({ label: e.target.value })} />
          </label>
          <label className={styles.stageField}>
            <span className={styles.stageLabel}>Phần thưởng</span>
            <input className={styles.stageInput} placeholder="Đủ mục tiêu: phân tích ván hay nhất" value={goal.reward ?? ""} onChange={(e) => setGoal({ reward: e.target.value || undefined })} />
          </label>
        </div>
      )}
    </section>
  );
}
