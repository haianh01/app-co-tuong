"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BoardArrow } from "@/components/board/XiangqiBoard";
import { useSession } from "@/components/session/SessionProvider";
import { useAnalysisWorker } from "@/hooks/useAnalysisWorker";
import { useEngine } from "@/hooks/useEngine";
import { FACTOR_NAMES } from "@/lib/xiangqi/assess";
import {
  CLASS_NAME,
  findTurningPoints,
  type MoveClass,
  type MoveReview,
  type PositionEval,
  type ReviewResult,
  type TurningPoint,
} from "@/lib/xiangqi/analysis";
import { toFen, type Board, type Move, type Side } from "@/lib/xiangqi/engine";
import { explainText, type Fact } from "@/lib/xiangqi/explain";
import type { GameState } from "@/lib/xiangqi/game";
import type { GamePhase } from "@/lib/xiangqi/phases";
import { PLAN_NAME } from "@/lib/xiangqi/strategy";
import play from "@/app/play/play.module.css";
import { ScoreChart } from "./ScoreChart";
import styles from "./game.module.css";

const PHASE_NAMES: Record<GamePhase, string> = {
  khaiCuoc: "Khai cuộc",
  trungCuoc: "Trung cuộc",
  tanCuoc: "Tàn cuộc",
};

/** Người không phải VIP được phân tích bấy nhiêu ván mỗi ngày. */
const FREE_PER_DAY = 3;

function playMove(board: Board, m: Move): Board {
  const next = board.slice();
  next[m.to] = next[m.from];
  next[m.from] = null;
  return next;
}

export interface AnalysisUpdateInfo {
  review: ReviewResult | null;
  currentMoveReview: MoveReview | null;
  previewBoard: Board | null;
  previewMove: Move | null;
  arrows: BoardArrow[];
  highlights: number[];
}

export interface AnalysisPanelProps {
  state: GameState;
  ply: number;
  onSelect: (ply: number) => void;
  viewer: Side | null;
  onAnalysisUpdate?: (info: AnalysisUpdateInfo) => void;
  gameId?: string;
  initialAnalysis?: (PositionEval | null)[] | null;
}

export function AnalysisPanel({
  state,
  ply,
  onSelect,
  viewer,
  onAnalysisUpdate,
  gameId,
  initialAnalysis,
}: AnalysisPanelProps) {
  const think = useEngine();
  const { user } = useSession();
  const [evals, setEvals] = useState<(PositionEval | null)[] | null>(initialAnalysis ?? null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vip = !!user?.vipUntil;

  const runReview = useAnalysisWorker();
  const [review, setReview] = useState<ReviewResult | null>(null);

  // State đi thử biến tiếp diễn (interactive preview)
  const [previewLine, setPreviewLine] = useState<{
    basePly: number;
    moves: Move[];
    notations: string[];
    step: number;
  } | null>(null);

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

  // Nếu người dùng chọn nước khác ở ngoài, tự động thoát đi thử
  useEffect(() => {
    if (previewLine && previewLine.basePly !== ply) {
      setPreviewLine(null);
    }
  }, [ply, previewLine]);

  // Tính toán bàn cờ tạm thời khi đi thử biến tiếp diễn
  const previewData = useMemo(() => {
    if (!previewLine || !state.history[previewLine.basePly]) return null;
    let b = state.history[previewLine.basePly].board;
    for (let i = 0; i < previewLine.step; i++) {
      const m = previewLine.moves[i];
      if (m) b = playMove(b, m);
    }
    const lastM = previewLine.step > 0 ? previewLine.moves[previewLine.step - 1] : null;
    return { board: b, lastMove: lastM };
  }, [previewLine, state.history]);

  const currentReview = useMemo(() => {
    return review?.moves.find((m) => m.ply === ply) ?? null;
  }, [review, ply]);

  // Các mũi tên và highlights trên bàn cờ
  const { arrows, highlights } = useMemo(() => {
    if (previewLine && previewData?.lastMove) {
      return {
        arrows: [
          {
            from: previewData.lastMove.from,
            to: previewData.lastMove.to,
            kind: "custom" as const,
            color: "#3b82f6",
          },
        ],
        highlights: [],
      };
    }

    if (!currentReview) {
      return { arrows: [], highlights: [] };
    }

    const arrs: BoardArrow[] = [];
    if (currentReview.move) {
      arrs.push({
        from: currentReview.move.from,
        to: currentReview.move.to,
        kind: "played",
      });
    }
    if (currentReview.betterMove) {
      arrs.push({
        from: currentReview.betterMove.from,
        to: currentReview.betterMove.to,
        kind: "better",
      });
    }
    if (currentReview.replyMove) {
      arrs.push({
        from: currentReview.replyMove.from,
        to: currentReview.replyMove.to,
        kind: "reply",
      });
    }

    const hlSet = new Set<number>(currentReview.highlights ?? []);
    if (currentReview.facts) {
      for (const f of currentReview.facts) {
        if (f.kind === "pattern" && f.pieces) {
          for (const p of f.pieces) {
            hlSet.add(p.square);
          }
        }
      }
    }

    return {
      arrows: arrs,
      highlights: Array.from(hlSet),
    };
  }, [previewLine, previewData, currentReview]);

  // Gửi thông tin cập nhật lên component cha để render trên XiangqiBoard
  useEffect(() => {
    onAnalysisUpdate?.({
      review,
      currentMoveReview: currentReview,
      previewBoard: previewData?.board ?? null,
      previewMove: previewData?.lastMove ?? null,
      arrows,
      highlights,
    });
  }, [review, currentReview, previewData, arrows, highlights, onAnalysisUpdate]);

  // 3 khoảnh khắc bước ngoặt của ván cờ
  const turningPoints = useMemo<TurningPoint[]>(() => {
    if (!review?.moves || review.moves.length === 0) return [];
    return findTurningPoints(review.moves, 3);
  }, [review]);

  // Nếu có gameId và chưa có evals, tự động kiểm tra xem ván đã được phân tích trước đó chưa
  useEffect(() => {
    if (evals || !gameId) return;
    let cancelled = false;
    fetch(`/api/game/${gameId}/analysis`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.analyzed && Array.isArray(data.evals)) {
          setEvals(data.evals);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gameId, evals]);

  const run = async () => {
    setError(null);
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
          body: JSON.stringify({ fens, gameId }),
        });
        if (res.status === 429) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? `Bạn đã dùng hết ${FREE_PER_DAY} lượt phân tích miễn phí hôm nay.`);
          return true;
        }
        if (!res.ok || !res.body) return false;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const out: (PositionEval | null)[] = new Array(state.history.length).fill(null);
        const receivedIndices = new Set<number>();

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
                  wdl: data.eval.wdl,
                };
              }
              receivedIndices.add(data.index);
              setProgress(receivedIndices.size / state.history.length);
            }
          }
        }
        if (receivedIndices.size === state.history.length) {
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

  const startPreviewLine = (m: MoveReview) => {
    if (!m.pvMoves || m.pvMoves.length === 0) return;
    setPreviewLine({
      basePly: m.ply,
      moves: m.pvMoves,
      notations: m.line ?? [],
      step: 1, // bắt đầu ngay ở nước đầu tiên của biến
    });
  };

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

          {/* Biểu đồ điểm cả ván */}
          {evals && (
            <ScoreChart
              evals={evals}
              reviews={review.moves}
              currentPly={ply}
              totalMoves={state.moves.length}
              onSelect={onSelect}
            />
          )}

          {/* Tóm tắt 3 khoảnh khắc bước ngoặt */}
          {turningPoints.length > 0 && (
            <div className={styles.turningContainer}>
              <h3 className={styles.turningTitle}>⚡ 3 bước ngoặt của ván</h3>
              <div className={styles.turningGrid}>
                {turningPoints.map((tp, idx) => (
                  <button
                    key={`tp-${tp.ply}`}
                    type="button"
                    className={styles.turningCard}
                    aria-label={`Bước ngoặt #${idx + 1}: Nước thứ ${tp.ply} (${sideName(tp.side)} ${tp.notation}) - ${tp.cls ? CLASS_NAME[tp.cls] : "Nước cờ"}`}
                    aria-current={tp.ply === ply ? "step" : undefined}
                    onClick={() => onSelect(tp.ply)}
                  >
                    <div className={styles.turningTop}>
                      <span className={styles.turningIdx}>#{idx + 1}</span>
                      <span className={styles.reviewTag} data-cls={tp.cls}>
                        {tp.cls ? CLASS_NAME[tp.cls] : "Nước cờ"}
                      </span>
                    </div>
                    <strong className={styles.turningMove}>
                      {Math.ceil(tp.ply / 2)}. {sideName(tp.side)} {tp.notation}
                    </strong>
                    <span className={styles.turningDesc}>{tp.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Thẻ phân tích kỳ lý chuyên gia toàn diện cho nước đang chọn (B1 - B7) */}
          {currentReview && (
            <div className={styles.expertCard}>
              <div className={styles.expertHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {currentReview.phase && (
                    <span className={styles.expertPhaseBadge}>
                      ♟️ {PHASE_NAMES[currentReview.phase]}
                    </span>
                  )}
                  <strong>
                    Nước {Math.ceil(currentReview.ply / 2)}: {sideName(currentReview.side)} {currentReview.notation}
                  </strong>
                </div>
                {currentReview.plan && (
                  <span className={styles.expertPlanText}>
                    Kế hoạch: Đỏ ({PLAN_NAME[currentReview.plan.r]}) · Đen ({PLAN_NAME[currentReview.plan.b]})
                  </span>
                )}
              </div>

              {/* 1. Đánh giá thế cờ */}
              {currentReview.assessment && (
                <div className={styles.expertSection}>
                  <span className={`${styles.expertSectionTitle} ${styles.expertSectionAssessment}`}>
                    ⚖️ Đánh giá cục diện
                  </span>
                  <p style={{ margin: 0 }}>
                    {currentReview.assessment.leader
                      ? `${sideName(currentReview.assessment.leader)} chiếm ưu thế (${currentReview.assessment.evalCp > 0 ? "+" : ""}${currentReview.assessment.evalCp} cp, ${currentReview.assessment.winPct.toFixed(1)}% thắng)`
                      : `Cục diện giằng co cân bằng (${currentReview.assessment.winPct.toFixed(1)}% thắng)`}
                    {currentReview.assessment.summary ? ` · ${currentReview.assessment.summary}` : ""}
                  </p>
                  {currentReview.assessment.factors.length > 0 && (
                    <div className={styles.expertFactorList}>
                      {currentReview.assessment.factors.map((f, fIdx) => (
                        <span key={`f-${fIdx}`} className={styles.expertFactorTag}>
                          {FACTOR_NAMES[f.id] ?? f.id} ({sideName(f.side)})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. Ý đồ nước cờ */}
              {currentReview.intent && (
                <div className={styles.expertSection}>
                  <span className={`${styles.expertSectionTitle} ${styles.expertSectionIntent}`}>
                    🎯 Ý đồ nước đi
                  </span>
                  <p style={{ margin: 0 }}>{currentReview.intent.summary}</p>
                  {currentReview.betterIntent && (
                    <p style={{ margin: "2px 0 0", color: "var(--gold-text)", fontSize: "11px" }}>
                      💡 Nước AI gợi ý ({currentReview.better}): {currentReview.betterIntent.summary}
                    </p>
                  )}
                </div>
              )}

              {/* 3. Mối đe dọa từ đối phương */}
              {currentReview.threats && currentReview.threats.length > 0 && (
                <div className={styles.expertSection}>
                  <span className={`${styles.expertSectionTitle} ${styles.expertSectionThreat}`}>
                    ⚠️ Đối phương đang đe dọa
                  </span>
                  <p style={{ margin: 0, color: "#fca5a5" }}>{currentReview.threats[0].summary}</p>
                </div>
              )}

              {/* 4. Sách khai cuộc & Gợi ý nước tiếp theo */}
              {currentReview.openingGuide && (
                <div className={styles.expertSection}>
                  <span className={`${styles.expertSectionTitle} ${styles.expertSectionOpening}`}>
                    📖 Khai cuộc: {currentReview.openingGuide.name}
                  </span>
                  {currentReview.openingGuide.intent && (
                    <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)" }}>
                      Ý đồ: Đỏ ({currentReview.openingGuide.intent.r}) · Đen ({currentReview.openingGuide.intent.b})
                    </p>
                  )}
                  {currentReview.openingGuide.nextMoves.length > 0 && (
                    <div className={styles.expertNextMoves}>
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>Nước sách tiếp theo:</span>
                      {currentReview.openingGuide.nextMoves.slice(0, 4).map((nm, nmIdx) => (
                        <span key={`nm-${nmIdx}`} className={styles.expertNextMoveBtn} title={nm.lineName}>
                          {nm.move}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Chế độ đi thử biến tiếp diễn */}
          {previewLine && (
            <div className={styles.previewBox}>
              <div className={styles.previewHeader}>
                <span className={styles.previewTitle}>🎯 Đang đi thử biến tiếp diễn</span>
                <span className="muted">
                  Nước {previewLine.step} / {previewLine.moves.length}
                  {previewLine.notations[previewLine.step - 1] ? `: ${previewLine.notations[previewLine.step - 1]}` : ""}
                </span>
              </div>
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={previewLine.step <= 0}
                  onClick={() => setPreviewLine((pl) => (pl ? { ...pl, step: pl.step - 1 } : null))}
                >
                  ◀ Lùi
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={previewLine.step >= previewLine.moves.length}
                  onClick={() => setPreviewLine((pl) => (pl ? { ...pl, step: pl.step + 1 } : null))}
                >
                  Tiến ▶
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ color: "var(--red-text)" }}
                  onClick={() => setPreviewLine(null)}
                >
                  ✕ Thoát đi thử
                </button>
              </div>
            </div>
          )}

          {review.moves.every((m) => !m.cls) ? (
            <p className="muted">Không có nước nào đáng chú ý.</p>
          ) : (
            <>
              <p className="muted">Bấm vào từng nước để xem phân tích chi tiết.</p>
              <ul className={styles.reviewList}>
                {review.moves.filter((m) => m.cls).map((m) => (
                  <li key={m.ply}>
                    <button
                      type="button"
                      className={styles.reviewItem}
                      aria-current={m.ply === ply ? "step" : undefined}
                      onClick={() => onSelect(m.ply)}
                    >
                      <span className={styles.reviewTag} data-cls={m.cls}>
                        {CLASS_NAME[m.cls!]}
                      </span>
                      <span>
                        {Math.ceil(m.ply / 2)}. {sideName(m.side)} {m.notation}
                        {m.better && <span className="muted"> · nên đi {m.better}</span>}
                      </span>
                    </button>
                    {m.ply === ply && m.facts.length > 0 && (
                      <>
                        {m.facts.some((f) => f.kind === "pattern") && (
                          <div className={styles.patternContainer}>
                            {m.facts
                              .filter((f): f is Fact & { kind: "pattern"; patternName: string; action: string; description: string } => f.kind === "pattern")
                              .map((f, idx: number) => (
                                <span
                                  key={`pat-${idx}`}
                                  className={styles.patternBadge}
                                  title={f.description}
                                >
                                  ⚔️ {f.patternName} ({f.action === "formed" ? "Lập thế" : f.action === "allowed" ? "Để đối phương lập thế" : "Hóa giải"})
                                </span>
                              ))}
                          </div>
                        )}
                        <p className={styles.reviewNote}>{explainText(m.facts, m.side, m.ply)}</p>
                      </>
                    )}
                    {m.ply === ply && m.line && m.line.length > 1 && (
                      <div className={styles.reviewLineContainer}>
                        <p className={styles.reviewLine}>
                          <span className="muted">Biến tiếp diễn: </span>
                          <strong>{m.line.join(" ➔ ")}</strong>
                        </p>
                        {m.pvMoves && m.pvMoves.length > 0 && !previewLine && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline"
                            onClick={() => startPreviewLine(m)}
                          >
                            🎯 Đi thử biến này
                          </button>
                        )}
                      </div>
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
