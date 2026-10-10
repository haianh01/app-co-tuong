"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "@/components/session/SessionProvider";
import { useAiWorker } from "@/hooks/useAiWorker";
import { CLASS_NAME, reviewGame, type PositionEval } from "@/lib/xiangqi/analysis";
import { toFen, type Side } from "@/lib/xiangqi/engine";
import type { GameState } from "@/lib/xiangqi/game";
import play from "@/app/play/play.module.css";
import styles from "./game.module.css";

/** Người không phải VIP được phân tích bấy nhiêu ván mỗi ngày (AI chạy trên máy người xem). */
const FREE_PER_DAY = 3;

function quotaKey() {
  return `kd:analysis:${new Date().toISOString().slice(0, 10)}`;
}

function usedToday(): number {
  try {
    return Number(localStorage.getItem(quotaKey()) ?? 0);
  } catch {
    return 0;
  }
}

export function AnalysisPanel({
  state, ply, onSelect, viewer,
}: { state: GameState; ply: number; onSelect: (ply: number) => void; viewer: Side | null }) {
  const think = useAiWorker();
  const { user } = useSession();
  const [evals, setEvals] = useState<(PositionEval | null)[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vip = !!user?.vipUntil;

  const review = useMemo(() => (evals ? reviewGame(state, evals) : null), [state, evals]);

  const run = async () => {
    setError(null);
    if (!vip) {
      const used = usedToday();
      if (used >= FREE_PER_DAY) {
        setError(`Bạn đã dùng hết ${FREE_PER_DAY} lượt phân tích miễn phí hôm nay.`);
        return;
      }
      try {
        localStorage.setItem(quotaKey(), String(used + 1));
      } catch {}
    }
    const out: (PositionEval | null)[] = [];
    setProgress(0);
    try {
      for (let i = 0; i < state.history.length; i++) {
        const terminal = i === state.history.length - 1 && state.result;
        if (terminal) out.push(null);
        else {
          const res = await think(toFen(state.history[i]), 3, { depth: 3, timeMs: 300, noise: 0 });
          out.push({ score: res.score, best: res.move });
        }
        setProgress((i + 1) / state.history.length);
      }
      setEvals(out);
    } catch {
      setError("Không chạy được AI phân tích, vui lòng thử lại.");
    } finally {
      setProgress(null);
    }
  };

  const sideName = (s: Side) => (s === "r" ? "Đỏ" : "Đen");

  return (
    <div className={`card ${play.panel} ${play.setup}`}>
      <h2 className={play.panelTitle}>AI phân tích ván</h2>
      {!review && progress === null && (
        <>
          <p className="muted">
            AI chấm từng nước, chỉ ra nước hớ và nước nên đi.{" "}
            {vip ? "Bạn là VIP: phân tích không giới hạn." : `Miễn phí ${FREE_PER_DAY} ván mỗi ngày. `}
            {!vip && <Link href="/shop#vip">VIP không giới hạn</Link>}
          </p>
          <button type="button" className="btn btn-primary" onClick={run} disabled={state.moves.length === 0}>
            Phân tích ván
          </button>
        </>
      )}
      {progress !== null && (
        <div className={styles.progress} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress * 100}%` }} />
          <em>Đang phân tích… {Math.round(progress * 100)}%</em>
        </div>
      )}
      {error && <p className={styles.warn} role="alert">{error}</p>}
      {review && (
        <>
          <div className={styles.accuracy}>
            {(["r", "b"] as Side[]).map((s) => (
              <div key={s} data-me={s === viewer || undefined}>
                <span className="muted">Độ chính xác {sideName(s)}</span>
                <strong>{review.accuracy[s] ?? "—"}%</strong>
              </div>
            ))}
          </div>
          {review.moves.every((m) => !m.cls) ? (
            <p className="muted">Không có nước hớ nào đáng kể.</p>
          ) : (
            <ul className={styles.reviewList}>
              {review.moves.filter((m) => m.cls).map((m) => (
                <li key={m.ply}>
                  <button type="button" className={styles.reviewItem} aria-current={m.ply === ply ? "step" : undefined} onClick={() => onSelect(m.ply)}>
                    <span className={styles.reviewTag} data-cls={m.cls}>{CLASS_NAME[m.cls!]}</span>
                    <span>
                      {Math.ceil(m.ply / 2)}. {sideName(m.side)} {m.notation}
                      {m.better && <span className="muted"> · nên đi {m.better}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
