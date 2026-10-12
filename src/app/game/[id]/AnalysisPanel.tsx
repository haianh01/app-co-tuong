"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/components/session/SessionProvider";
import { useAnalysisWorker } from "@/hooks/useAnalysisWorker";
import { useEngine } from "@/hooks/useEngine";
import { CLASS_NAME, type PositionEval, type ReviewResult } from "@/lib/xiangqi/analysis";
import { toFen, type Side } from "@/lib/xiangqi/engine";
import { explainText } from "@/lib/xiangqi/explain";
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
  const think = useEngine();
  const { user } = useSession();
  const [evals, setEvals] = useState<(PositionEval | null)[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vip = !!user?.vipUntil;

  const runReview = useAnalysisWorker();
  const [review, setReview] = useState<ReviewResult | null>(null);

  useEffect(() => {
    if (!evals) {
      setReview(null);
      return;
    }
    let cancelled = false;
    runReview(state, evals).then((res) => {
      if (!cancelled) setReview(res);
    });
    return () => {
      cancelled = true;
    };
  }, [state, evals, runReview]);

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
    setProgress(0);

    const runFallback = async () => {
      const out: (PositionEval | null)[] = [];
      for (let i = 0; i < state.history.length; i++) {
        const terminal = i === state.history.length - 1 && state.result;
        if (terminal) out.push(null);
        else {
          const res = await think(toFen(state.history[i]), 3, { depth: 3, timeMs: 300, noise: 0 }, "analysis");
          out.push({ score: res.score, best: res.move, pv: res.pvMoves });
        }
        setProgress((i + 1) / state.history.length);
      }
      setEvals(out);
    };

    const tryBatch = async (): Promise<boolean> => {
      try {
        const fens = state.history.map((p) => toFen(p));
        const res = await fetch("/api/engine/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fens }),
        });
        if (!res.ok || !res.body) return false;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const out: (PositionEval | null)[] = new Array(state.history.length).fill(null);
        let count = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const data = JSON.parse(line);
            if (data.error) {
              await reader.cancel().catch(() => {});
              return false;
            }
            if (typeof data.index === "number" && data.index < out.length) {
              const terminal = data.index === state.history.length - 1 && state.result;
              if (terminal) {
                out[data.index] = null;
              } else if (data.eval) {
                out[data.index] = {
                  score: data.eval.score,
                  best: data.eval.best,
                  pv: data.eval.pv,
                  lines: data.eval.lines,
                };
              }
              count++;
              setProgress(count / state.history.length);
            }
          }
        }
        if (count === state.history.length) {
          setEvals(out);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    };

    try {
      const ok = await tryBatch();
      if (!ok) {
        await runFallback();
      }
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
            <p className="muted">Không có nước nào đáng chú ý.</p>
          ) : (
            <>
              <p className="muted">Bấm vào từng nước để xem vì sao.</p>
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
                    {m.ply === ply && m.facts.length > 0 && <p className={styles.reviewNote}>{explainText(m.facts, m.side)}</p>}
                    {m.ply === ply && m.line && m.line.length > 1 && (
                      <p className={styles.reviewLine}>
                        <span className="muted">Biến tiếp diễn: </span>
                        <strong>{m.line.join(" ➔ ")}</strong>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
