"use client";

import { useCallback, useEffect, useState } from "react";
import type { TurningPoint } from "@/lib/xiangqi/analysis";
import styles from "./broadcast.module.css";
import { formatEvalScore, type StageReviewState } from "./stage-sync";
import { useGameReview, useStageGames } from "./useGameReview";

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
  // 1. Danh sách ván gần đây (tải lại khi vừa lưu ván mới)
  const { games, loading: loadingGames, error: gamesError } = useStageGames(room, lastSavedGameId);
  const [pickedGameId, setPickedGameId] = useState<string>("");
  const [isAutoTour, setIsAutoTour] = useState(false);

  // Chưa chọn tay: ưu tiên ván vừa lưu gần nhất, không có thì ván đầu danh sách.
  const selectedGameId =
    (pickedGameId && games.some((g) => g.id === pickedGameId) && pickedGameId) ||
    (lastSavedGameId && games.find((g) => g.id === lastSavedGameId)?.id) ||
    games[0]?.id ||
    "";
  const selectGame = (id: string) => {
    setPickedGameId(id);
    setIsAutoTour(false);
  };

  // 2–5. Chi tiết ván, phân tích engine, bước ngoặt
  const {
    game: activeGame,
    analysis,
    loading: loadingGameData,
    error: reviewError,
    analyzing,
    progress: analyzeProgress,
    runAnalysis: runAiAnalysis,
    turningPoints,
    totalPlies,
    reviewAt,
  } = useGameReview(room, selectedGameId || null);
  const error = reviewError ?? gamesError;

  // Phát nước đi lên sân khấu
  const broadcastPly = useCallback(
    (targetPly: number, tpOverride?: TurningPoint) => {
      const next = reviewAt(targetPly, tpOverride);
      if (next) onUpdateReview(next);
    },
    [reviewAt, onUpdateReview],
  );

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
            onChange={(e) => selectGame(e.target.value)}
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
