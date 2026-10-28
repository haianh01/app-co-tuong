"use client";

import { useState, type ReactNode } from "react";
import type { Side } from "@/lib/xiangqi/engine";
import type { StageGame } from "@/server/db/schema";
import type { StageArchiveView } from "../stage-sync";
import { useStageGames } from "../useGameReview";
import styles from "./stage.module.css";

// Điều khiển ngay trên sân khấu (thay cho việc phải sang trang Tường thuật): 3 nút Phân tích / Lưu ván / Lịch sử,
// bảng chọn ván phủ lên bàn cờ, và bộ điều hướng khi đang phân tích. Sân khấu chật nên mọi bảng đều mở đè lên vùng
// bàn cờ, còn ô góc dưới trái đổi nút theo chế độ.

/** Icon nét vẽ, màu theo `currentColor`. */
function Icon({ children, size = 44 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICON_ANALYZE = (
  <>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-5 3 3 5-7" />
  </>
);
const ICON_SAVE = (
  <>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v6h8V3" />
    <path d="M8 21v-7h8v7" />
  </>
);
const ICON_HISTORY = (
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 7.5V12l3 2" />
  </>
);

export type StageSaveState = "idle" | "saving" | "saved" | "queued" | "error";

/** Nút Lưu ván báo gì: chỉ tính là đã lưu khi đúng ván đang đánh (sang ván mới thì về chưa lưu). */
export function saveStateOf(archive: StageArchiveView | null | undefined, round: number): StageSaveState {
  if (!archive) return "idle";
  if (archive.status === "saving") return "saving";
  if (archive.status === "error") return "error";
  if (archive.status === "saved" && archive.savedRound === round) return archive.error ? "queued" : "saved";
  return "idle";
}

const SAVE_LABEL: Record<StageSaveState, string> = {
  idle: "Lưu ván đấu",
  saving: "Đang lưu ván…",
  saved: "Lưu ván đấu (đã lưu)",
  queued: "Lưu ván đấu (mất mạng, đã xếp hàng gửi lại)",
  error: "Lưu ván đấu (lần trước lỗi, bấm để thử lại)",
};

export function StageActionButtons({
  saveState,
  historyOpen,
  canAct,
  onAnalyze,
  onSave,
  onHistory,
}: {
  saveState: StageSaveState;
  historyOpen: boolean;
  /** Có mã phòng (sân khấu thật, không phải bản xem trước) thì mới làm được. */
  canAct: boolean;
  onAnalyze: () => void;
  onSave: () => void;
  onHistory: () => void;
}) {
  return (
    <div className={styles.bronzeButtonGroup}>
      <button
        type="button"
        className={styles.bronzeBtn}
        onClick={onAnalyze}
        disabled={!canAct}
        title="Phân tích ván đấu"
        aria-label="Phân tích ván đấu"
      >
        <Icon>{ICON_ANALYZE}</Icon>
      </button>
      <button
        type="button"
        className={styles.bronzeBtn}
        onClick={onSave}
        disabled={!canAct || saveState === "saving"}
        title={SAVE_LABEL[saveState]}
        aria-label={SAVE_LABEL[saveState]}
        data-save={saveState}
      >
        <Icon>{ICON_SAVE}</Icon>
        {saveState !== "idle" && (
          <span className={styles.bronzeBadge} data-save={saveState} aria-hidden="true">
            {saveState === "saved" ? "✓" : saveState === "saving" ? "…" : "!"}
          </span>
        )}
      </button>
      <button
        type="button"
        className={styles.bronzeBtn}
        onClick={onHistory}
        disabled={!canAct}
        aria-pressed={historyOpen}
        title="Lịch sử – chọn ván đấu"
        aria-label="Lịch sử – chọn ván đấu"
      >
        <Icon>{ICON_HISTORY}</Icon>
      </button>
    </div>
  );
}

/** Ô góc dưới trái khi đang phân tích: số nước và 4 nút tròn. */
export function ReviewNav({
  ply,
  total,
  hasTurningPoints,
  onPrev,
  onNext,
  onNextTurning,
  onExit,
}: {
  ply: number;
  total: number;
  hasTurningPoints: boolean;
  onPrev: () => void;
  onNext: () => void;
  onNextTurning: () => void;
  onExit: () => void;
}) {
  return (
    <div className={styles.reviewNav}>
      <span className={styles.reviewNavLabel}>
        Nước {ply} <span className={styles.reviewNavTotal}>/ {total}</span>
      </span>
      <div className={styles.bronzeButtonGroup}>
        <button type="button" className={styles.bronzeBtn} onClick={onPrev} disabled={ply <= 0} title="Nước trước (←)" aria-label="Nước trước">
          <Icon>
            <path d="M15 5l-7 7 7 7" />
          </Icon>
        </button>
        <button type="button" className={styles.bronzeBtn} onClick={onNext} disabled={ply >= total} title="Nước sau (→)" aria-label="Nước sau">
          <Icon>
            <path d="M9 5l7 7-7 7" />
          </Icon>
        </button>
        <button
          type="button"
          className={styles.bronzeBtn}
          onClick={onNextTurning}
          disabled={!hasTurningPoints}
          title="Bước ngoặt tiếp theo"
          aria-label="Bước ngoặt tiếp theo"
        >
          <Icon>
            <path d="M12 3l9 9-9 9-9-9z" />
          </Icon>
        </button>
        <button type="button" className={styles.bronzeBtn} onClick={onExit} title="Thoát phân tích, về ván trực tiếp" aria-label="Về trực tiếp">
          <Icon>
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </Icon>
        </button>
      </div>
    </div>
  );
}

/** Dải phân tích thay dải chữ chạy: lời bình / ý đồ nước AI chọn, và nước AI gợi ý. */
export function ReviewStrip({
  text,
  best,
  thinking,
}: {
  /** Lời báo đang tải / lỗi, hoặc lời bình nước đang xem. */
  text: string;
  /** Nước AI gợi ý kèm đánh giá (vd. "P2-5 · Đỏ +1.2"); không có thì ẩn. */
  best?: string | null;
  /** AI đang tính thế cờ này. */
  thinking?: boolean;
}) {
  return (
    <div className={styles.reviewStrip} role="status">
      <span className={styles.reviewStripBadge}>PHÂN TÍCH</span>
      <span className={styles.reviewStripText}>{text}</span>
      {thinking ? (
        <span className={styles.reviewStripBest} data-thinking>
          AI đang tính…
        </span>
      ) : (
        best && <span className={styles.reviewStripBest}>AI gợi ý: {best}</span>
      )}
    </div>
  );
}

/** Phần bên dưới chiếm bao nhiêu % thanh đánh giá (bên ngồi dưới = phe người dẫn). */
export function evalBarShare(redScore: number, bottom: Side): number {
  const forBottom = bottom === "r" ? redScore : -redScore;
  return 50 + 50 * Math.tanh(forBottom / 600);
}

/** Thanh đánh giá dọc bên trái bàn cờ. */
export function EvalBar({ redScore, bottom }: { redScore: number | null; bottom: Side }) {
  const share = redScore === null ? 50 : evalBarShare(redScore, bottom);
  const label = redScore === null ? "–" : `${redScore >= 0 ? "+" : "−"}${(Math.abs(redScore) / 100).toFixed(1)}`;
  return (
    <div className={styles.evalBar} role="img" aria-label={`Đánh giá phía Đỏ: ${label}`}>
      <div className={styles.evalBarFill} data-side={bottom} style={{ height: `${share}%` }} />
      <span className={styles.evalBarLabel} data-red={redScore !== null && redScore >= 0 ? true : undefined} style={{ bottom: `calc(${share}% - 20px)` }}>
        {label}
      </span>
    </div>
  );
}

type HistoryFilter = "today" | "week" | "all";
const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "week", label: "7 ngày" },
  { key: "all", label: "Tất cả" },
];

/** Ngày "YYYY-MM-DD" theo giờ VN, cùng cách trang điều khiển ghi `playedOn`. */
const vnDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

function inFilter(g: StageGame, filter: HistoryFilter, now: Date): boolean {
  if (filter === "all") return true;
  if (filter === "today") return g.playedOn === vnDate(now);
  return g.playedOn >= vnDate(new Date(now.getTime() - 6 * 86_400_000));
}

const RESULT_TEXT: Record<string, string> = { win: "THẮNG", loss: "THUA", draw: "HÒA" };

const endTime = (g: StageGame) => {
  const d = new Date(g.endedAt);
  return Number.isNaN(d.getTime())
    ? g.playedOn
    : d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
};

/** Bảng lịch sử phủ lên bàn cờ: lọc theo ngày, bấm một ván để mở Phân tích / Xem lại. */
export function HistorySheet({
  room,
  reloadKey,
  onClose,
  onOpen,
}: {
  room: string;
  reloadKey?: unknown;
  onClose: () => void;
  /** `analyze`: chạy AI nếu ván chưa có phân tích; false = chỉ xem lại nước đi. */
  onOpen: (gameId: string, analyze: boolean) => void;
}) {
  const { games, loading, error } = useStageGames(room, reloadKey);
  const [filter, setFilter] = useState<HistoryFilter>("today");
  const [openId, setOpenId] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const shown = games.filter((g) => inFilter(g, filter, now));
  const tally = shown.reduce(
    (t, g) => ({ ...t, [g.result ?? "none"]: (t[g.result ?? "none"] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <section className={styles.historySheet} aria-label="Lịch sử ván đấu">
      <div className={styles.historyHead}>
        <span className={styles.historyIcon}>
          <Icon size={38}>{ICON_HISTORY}</Icon>
        </span>
        <h2 className={styles.historyTitle}>LỊCH SỬ VÁN ĐẤU</h2>
        <button type="button" className={styles.historyClose} onClick={onClose} aria-label="Đóng lịch sử" title="Đóng lịch sử">
          ✕
        </button>
      </div>

      <div className={styles.historyFilters}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={styles.historyChip}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span className={styles.historyTally}>
          {tally.win ?? 0} thắng · {tally.draw ?? 0} hòa · {tally.loss ?? 0} thua
        </span>
      </div>

      <ul className={styles.historyList}>
        {loading && games.length === 0 && <li className={styles.historyEmpty}>Đang tải danh sách ván…</li>}
        {error && <li className={styles.historyEmpty}>⚠️ {error}</li>}
        {!loading && !error && shown.length === 0 && (
          <li className={styles.historyEmpty}>
            {games.length === 0 ? "Chưa có ván nào được lưu." : "Không có ván nào trong khoảng này."}
          </li>
        )}
        {shown.map((g) => {
          const open = openId === g.id;
          return (
            <li key={g.id} className={styles.historyRow} data-open={open || undefined}>
              <button type="button" className={styles.historyRowMain} aria-expanded={open} onClick={() => setOpenId(open ? null : g.id)}>
                <span className={styles.historyResult} data-result={g.result ?? "none"}>
                  {RESULT_TEXT[g.result ?? ""] ?? "—"}
                </span>
                <span className={styles.historyInfo}>
                  <span className={styles.historyName}>
                    Ván {g.round ?? "–"} · vs {g.opponent?.name || "Đối thủ"}
                  </span>
                  <span className={styles.historyMeta}>
                    {Math.ceil(g.plies / 2)} nước · {g.playedOn.split("-").reverse().join("/")}
                  </span>
                </span>
                <span className={styles.historyTime}>{endTime(g)}</span>
              </button>
              {open && (
                <div className={styles.historyActions}>
                  <button type="button" className={styles.historyPrimary} onClick={() => onOpen(g.id, true)}>
                    Phân tích ván này
                  </button>
                  <button type="button" className={styles.historySecondary} onClick={() => onOpen(g.id, false)}>
                    Xem lại
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Số nước thử gần nhất hiện thành chip; cũ hơn thu vào "…" để thanh luôn nằm trên 1 dòng. */
const TRIAL_CHIPS = 6;

/** Thanh biến thử nổi dưới hàng công cụ: tổng số nước, vài nước cuối (nước vừa đi tô nổi), Lùi / Thoát. */
export function TrialMovesBar({
  notations,
  firstSide,
  onBack,
  onExit,
}: {
  notations: string[];
  /** Bên đi nước thử đầu tiên, để tô chip theo màu quân. */
  firstSide: Side;
  onBack: () => void;
  onExit: () => void;
}) {
  const start = Math.max(0, notations.length - TRIAL_CHIPS);
  const shown = notations.slice(start);
  return (
    <div className={styles.trialInfoBar} role="status" aria-label={`Biến thử ${notations.length} nước`}>
      <span className={styles.trialInfoLabel}>
        NƯỚC THỬ
        {notations.length > 0 && <span className={styles.trialInfoCount}>{notations.length} nước</span>}
      </span>
      {notations.length === 0 ? (
        <span className={styles.trialInfoHint}>Bấm quân để bày biến</span>
      ) : (
        <ol className={styles.trialChips} start={start + 1}>
          {start > 0 && (
            <li className={styles.trialMore} aria-hidden="true">
              …
            </li>
          )}
          {shown.map((n, i) => {
            const idx = start + i;
            const side: Side = idx % 2 === 0 ? firstSide : firstSide === "r" ? "b" : "r";
            return (
              <li key={idx} className={styles.trialChip} data-side={side} data-last={idx === notations.length - 1 || undefined}>
                <span className={styles.trialChipNo}>{idx + 1}</span>
                {n}
              </li>
            );
          })}
        </ol>
      )}
      <span className={styles.trialActions}>
        {notations.length > 0 && (
          <button type="button" className={styles.trialMiniBtn} onClick={onBack} title="Lùi 1 nước thử" aria-label="Lùi 1 nước thử">
            ↶
          </button>
        )}
        <button type="button" className={styles.trialMiniExitBtn} onClick={onExit} title="Thoát biến thử" aria-label="Thoát biến thử">
          ✕
        </button>
      </span>
    </div>
  );
}

/** Thông báo ngắn nổi trên đáy bàn cờ (đã lưu ván, lỗi…). */
export function StageToast({ text, tone }: { text: string; tone: "ok" | "warn" | "error" }) {
  return (
    <div className={styles.stageToast} data-tone={tone} role="status">
      {text}
    </div>
  );
}
