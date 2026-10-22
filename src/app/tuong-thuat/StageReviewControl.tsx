"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardArrow } from "@/components/board/XiangqiBoard";
import { findTurningPoints, reviewGame, type PositionEval, type TurningPoint } from "@/lib/xiangqi/analysis";
import { replayMoves } from "@/lib/xiangqi/game";
import { moveNotation } from "@/lib/xiangqi/notation";
import type { StageGame } from "@/server/db/schema";
import styles from "./broadcast.module.css";
import { formatEvalScore, type StageReviewState } from "./stage-sync";

export interface StageReviewControlProps {
  room: string | null;
  currentReview: StageReviewState | null;
  onUpdateReview: (review: StageReviewState | null) => void;
  lastSavedRound?: number | null;
  lastSavedGameId?: string | null;
}

export function StageReviewControl({
  room,
  currentReview,
  onUpdateReview,
  lastSavedGameId,
}: StageReviewControlProps) {
  const [games, setGames] = useState<StageGame[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [activeGame, setActiveGame] = useState<StageGame | null>(null);
  const [analysis, setAnalysis] = useState<PositionEval[] | null>(null);
  const [loadingGameData, setLoadingGameData] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [isAutoTour, setIsAutoTour] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Tải danh sách ván gần đây
  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoadingGames(true);
    });
    fetch(`/api/tuong-thuat/games?room=${encodeURIComponent(room)}`, {
      headers: { "X-Stage-Room": room },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tải danh sách ván");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data.games) ? (data.games as StageGame[]) : [];
        setGames(list);
        if (list.length > 0) {
          // Ưu tiên chọn ván vừa lưu gần nhất hoặc ván đầu danh sách
          const target = (lastSavedGameId && list.find((g) => g.id === lastSavedGameId)?.id) || list[0].id;
          setSelectedGameId(target);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải ván cờ");
      })
      .finally(() => {
        if (!cancelled) setLoadingGames(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room, lastSavedGameId]);

  // 2. Tải chi tiết ván cờ được chọn
  useEffect(() => {
    if (!selectedGameId || !room) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoadingGameData(true);
        setError(null);
        setIsAutoTour(false);
      }
    });

    fetch(`/api/tuong-thuat/games/${selectedGameId}?room=${encodeURIComponent(room)}`, {
      headers: { "X-Stage-Room": room },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tải chi tiết ván cờ");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setActiveGame(data.game ?? null);
        setAnalysis(Array.isArray(data.analysis) ? data.analysis : null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải chi tiết ván");
      })
      .finally(() => {
        if (!cancelled) setLoadingGameData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGameId, room]);

  // 3. Tái hiện thế cờ và phân tích
  const gameState = useMemo(() => {
    if (!activeGame) return null;
    const moves = Array.isArray(activeGame.moves) ? activeGame.moves : [];
    return replayMoves(moves, activeGame.startFen);
  }, [activeGame]);

  const reviewResult = useMemo(() => {
    if (!gameState || !analysis) return null;
    try {
      return reviewGame(gameState, analysis);
    } catch {
      return null;
    }
  }, [gameState, analysis]);

  const turningPoints = useMemo<TurningPoint[]>(() => {
    if (!reviewResult) return [];
    try {
      return findTurningPoints(reviewResult.moves, 3);
    } catch {
      return [];
    }
  }, [reviewResult]);

  // 4. Phát nước đi lên sân khấu
  const broadcastPly = useCallback(
    (targetPly: number, tpOverride?: TurningPoint) => {
      if (!activeGame || !gameState) return;
      const movesCount = gameState.moves.length;
      const validPly = Math.max(0, Math.min(movesCount, targetPly));
      const pos = gameState.history[validPly];
      if (!pos) return;

      const lastM = validPly > 0 ? gameState.moves[validPly - 1].move : null;
      const ev = analysis?.[validPly] ?? null;
      const tp = tpOverride ?? turningPoints.find((t) => t.ply === validPly);
      const bestM = ev?.best ?? null;
      const bestNot = bestM && pos ? moveNotation(pos.board, bestM) : null;

      const arrows: BoardArrow[] = [];
      if (bestM) {
        arrows.push({ from: bestM.from, to: bestM.to, color: "rgba(34, 197, 94, 0.9)" });
      }
      if (lastM && tp && (tp.cls === "blunder" || tp.cls === "mistake")) {
        arrows.push({ from: lastM.from, to: lastM.to, color: "rgba(239, 68, 68, 0.85)" });
      }

      onUpdateReview({
        gameId: activeGame.id,
        round: activeGame.round,
        ply: validPly,
        totalPlies: movesCount,
        board: pos.board,
        lastMove: lastM,
        evalScore: ev?.score ?? null,
        bestMove: bestM,
        bestNotation: bestNot,
        arrows,
        turningPoint: tp
          ? {
              index: turningPoints.indexOf(tp),
              ply: tp.ply,
              notation: tp.notation,
              side: tp.side,
              cls: tp.cls,
              winDrop: tp.winDrop,
              description: tp.description,
            }
          : null,
        commentary:
          tp?.description ??
          (validPly > 0 ? `Nước ${validPly}: ${gameState.moves[validPly - 1].notation}` : "Thế cờ xuất phát"),
      });
    },
    [activeGame, gameState, analysis, turningPoints, onUpdateReview],
  );

  // 5. Chạy phân tích AI nếu ván chưa được phân tích
  const runAiAnalysis = async () => {
    if (!activeGame || !gameState || !room) return;
    setAnalyzing(true);
    setAnalyzeProgress(0);
    setError(null);

    try {
            const { toFen } = await import("@/lib/xiangqi/engine");
      const accurateFens = gameState.history.map((p) => toFen(p));

      const res = await fetch("/api/engine/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Stage-Room": room,
        },
        body: JSON.stringify({
          fens: accurateFens,
          stageGameId: activeGame.id,
          room,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Lỗi khi gọi batch engine");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Không thể đọc phản hồi phân tích");

      const decoder = new TextDecoder();
      let buffer = "";
      const evals: (PositionEval | null)[] = new Array(accurateFens.length).fill(null);
      let count = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (typeof data.index === "number" && data.eval) {
              evals[data.index] = data.eval;
              count++;
              setAnalyzeProgress(Math.round((count / accurateFens.length) * 100));
            }
          } catch {}
        }
      }

      setAnalysis(evals as PositionEval[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi khi phân tích ván");
    } finally {
      setAnalyzing(false);
    }
  };

  // 6. Chế độ phát tự động 3 bước ngoặt
  useEffect(() => {
    if (!isAutoTour || turningPoints.length === 0) return;
    let idx = 0;
    broadcastPly(turningPoints[0].ply, turningPoints[0]);

    const interval = setInterval(() => {
      idx = (idx + 1) % turningPoints.length;
      const tp = turningPoints[idx];
      broadcastPly(tp.ply, tp);
    }, 6000);

    return () => clearInterval(interval);
  }, [isAutoTour, turningPoints, broadcastPly]);

  const totalPlies = gameState?.moves.length ?? 0;
  const currentPly = currentReview?.ply ?? 0;

  return (
    <div className={styles.stageReviewBox}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <strong style={{ color: "#c084fc", fontSize: "0.95rem" }}>
          🎬 Chiếu phân tích ván đấu lên màn sân khấu / OBS
        </strong>
        {currentReview && (
          <button
            type="button"
            className={styles.btn}
            style={{ color: "#f87171", borderColor: "#f87171", fontSize: 13, padding: "4px 10px" }}
            onClick={() => onUpdateReview(null)}
          >
            ✕ Tắt chiếu (Về bàn cờ)
          </button>
        )}
      </div>

      {/* Chọn ván đấu */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "var(--muted)" }}>Chọn ván:</label>
        {loadingGames ? (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>⏳ Đang tải...</span>
        ) : games.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Chưa có ván cờ nào được lưu.</span>
        ) : (
          <select
            className={styles.stageInput}
            style={{ flex: 1, minWidth: 220 }}
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
          >
            {games.map((g) => {
              const resText = g.result === "win" ? "Thắng" : g.result === "loss" ? "Thua" : g.result === "draw" ? "Hòa" : "";
              return (
                <option key={g.id} value={g.id}>
                  Ván {g.round ?? "–"} ({resText ? `${resText} · ` : ""}{g.opponent?.name || "Đối thủ"} · {g.playedOn})
                </option>
              );
            })}
          </select>
        )}
      </div>

      {error && <div style={{ color: "#f87171", fontSize: 13 }}>⚠️ {error}</div>}

      {/* Khi ván đang tải dữ liệu */}
      {loadingGameData && <div style={{ fontSize: 13, color: "var(--muted)" }}>⏳ Đang tải thế cờ và phân tích…</div>}

      {/* Nếu ván chưa có phân tích engine */}
      {!loadingGameData && activeGame && !analysis && (
        <div style={{ padding: "8px 12px", background: "var(--surface)", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Ván này chưa được phân tích bằng AI.</span>
          <button
            type="button"
            className={styles.btnGold}
            style={{ fontSize: 13 }}
            onClick={runAiAnalysis}
            disabled={analyzing}
          >
            {analyzing ? `⏳ Đang phân tích (${analyzeProgress}%)` : "🚀 Phân tích ngay"}
          </button>
        </div>
      )}

      {/* Khi đã có phân tích */}
      {!loadingGameData && activeGame && analysis && (
        <>
          {/* 3 Bước ngoặt lớn */}
          {turningPoints.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gold-text)" }}>
                  ⚡ 3 bước ngoặt của ván cờ
                </span>
                <button
                  type="button"
                  className={styles.btn}
                  style={{ fontSize: 12, padding: "2px 8px" }}
                  onClick={() => setIsAutoTour((v) => !v)}
                >
                  {isAutoTour ? "⏹ Dừng tự động" : "▶ Tự động phát (6s)"}
                </button>
              </div>

              <div className={styles.tpGrid}>
                {turningPoints.map((tp, idx) => {
                  const isCurrent = currentReview?.ply === tp.ply;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={styles.tpBtn}
                      aria-pressed={isCurrent}
                      onClick={() => broadcastPly(tp.ply, tp)}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                        <span className={styles.tpBadge}>Bước ngoặt #{idx + 1}</span>
                        <span style={{ fontSize: 11, color: tp.cls === "blunder" ? "#f87171" : tp.cls === "brilliant" ? "#4ade80" : "#facc15" }}>
                          {tp.cls === "blunder" ? "Sai lầm" : tp.cls === "brilliant" ? "Xuất sắc" : "Sơ suất"}
                        </span>
                      </div>
                      <strong style={{ fontSize: 13 }}>
                        Nước {Math.ceil(tp.ply / 2)}: {tp.notation}
                      </strong>
                      <span className={styles.tpDesc}>{tp.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Điều khiển nước đi từng bước */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Điều khiển chiếu nước: {currentPly} / {totalPlies}
              </span>
              {currentReview && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#c084fc" }}>
                  {formatEvalScore(currentReview.evalScore)}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
              <button
                type="button"
                className={styles.btn}
                style={{ padding: "6px 12px" }}
                onClick={() => broadcastPly(0)}
                disabled={currentPly <= 0}
                title="Về nước đầu"
              >
                |◀
              </button>
              <button
                type="button"
                className={styles.btn}
                style={{ padding: "6px 12px" }}
                onClick={() => broadcastPly(currentPly - 1)}
                disabled={currentPly <= 0}
                title="Lùi 1 nước"
              >
                ◀
              </button>
              <button
                type="button"
                className={styles.btnGold}
                style={{ fontSize: 13, padding: "6px 16px" }}
                onClick={() => broadcastPly(currentPly)}
              >
                {currentReview ? "✓ Đang chiếu nước này" : "📺 Chiếu lên sân khấu"}
              </button>
              <button
                type="button"
                className={styles.btn}
                style={{ padding: "6px 12px" }}
                onClick={() => broadcastPly(currentPly + 1)}
                disabled={currentPly >= totalPlies}
                title="Tiến 1 nước"
              >
                ▶
              </button>
              <button
                type="button"
                className={styles.btn}
                style={{ padding: "6px 12px" }}
                onClick={() => broadcastPly(totalPlies)}
                disabled={currentPly >= totalPlies}
                title="Về nước cuối"
              >
                ▶|
              </button>
            </div>

            {currentReview?.bestNotation && (
              <div style={{ fontSize: 12, textAlign: "center", color: "#86efac" }}>
                Gợi ý nước tối ưu của AI: <strong>{currentReview.bestNotation}</strong>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
