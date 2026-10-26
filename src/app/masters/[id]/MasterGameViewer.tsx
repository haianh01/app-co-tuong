"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { PositionAnalysisModal } from "@/components/board/PositionAnalysisModal";
import { usePositionAnalysis } from "@/hooks/usePositionAnalysis";
import { convertChineseGame } from "@/lib/xiangqi/chinese-notation";
import type { MasterGameRecord } from "@/lib/xiangqi/master-games.generated";
import type { Move, Position } from "@/lib/xiangqi/engine";
import { translatePlayer, translateEccoName, getMasterDisplayName } from "@/lib/xiangqi/master-translator";
import styles from "../masters.module.css";

interface Props {
  game: MasterGameRecord;
}

export function MasterGameViewer({ game }: Props) {
  const gameData = useMemo(() => {
    return convertChineseGame(game.movesCN);
  }, [game.movesCN]);

  const totalPlies = gameData.moves.length;
  const [currentPly, setCurrentPly] = useState(0);

  const [showAnalysisModal, setShowAnalysisModal] = useState(false);
  const {
    result: posResult,
    loading: posLoading,
    error: posError,
    analyze: runAnalyze,
  } = usePositionAnalysis();

  const currentPos: Position = gameData.positions[currentPly] ?? gameData.positions[0];
  const lastMove: Move | null = currentPly > 0 ? gameData.moves[currentPly - 1] : null;

  const goToPly = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(totalPlies, target));
      setCurrentPly(next);
    },
    [totalPlies]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        goToPly(currentPly - 1);
      } else if (e.key === "ArrowRight") {
        goToPly(currentPly + 1);
      } else if (e.key === "Home") {
        goToPly(0);
      } else if (e.key === "End") {
        goToPly(totalPlies);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPly, goToPly, totalPlies]);

  const handleOpenAnalysis = () => {
    setShowAnalysisModal(true);
    const historyMoves = gameData.moves.slice(0, currentPly);
    const historyNotations = gameData.notations.slice(0, currentPly);
    runAnalyze(currentPos.board, currentPos.turn, historyMoves, historyNotations);
  };

  const movePairs = useMemo(() => {
    const pairs: { round: number; red?: { ply: number; text: string }; black?: { ply: number; text: string } }[] = [];
    for (let i = 0; i < gameData.notations.length; i += 2) {
      const round = Math.floor(i / 2) + 1;
      const red = { ply: i + 1, text: gameData.notations[i] };
      const black = i + 1 < gameData.notations.length ? { ply: i + 2, text: gameData.notations[i + 1] } : undefined;
      pairs.push({ round, red, black });
    }
    return pairs;
  }, [gameData.notations]);

  const resultLabel =
    game.result === "red_wins"
      ? "Đỏ thắng"
      : game.result === "black_wins"
      ? "Đen thắng"
      : game.result === "draw"
      ? "Hòa cờ"
      : "Chưa rõ kết quả";

  return (
    <div className={styles.container}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/masters" style={{ color: "var(--accent, #d9a441)", textDecoration: "none", fontSize: 14 }}>
          ← Quay lại danh sách ván đại sư
        </Link>
      </div>

      <div className={styles.viewerLayout}>
        {/* Cột bàn cờ */}
        <div className={styles.boardCol}>
          <XiangqiBoard
            board={currentPos.board}
            orientation="r"
            lastMove={lastMove}
          />

          <div className={styles.controlsRow}>
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={() => goToPly(0)}
              disabled={currentPly === 0}
              title="Về đầu ván (Home)"
            >
              |◀
            </button>
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={() => goToPly(currentPly - 1)}
              disabled={currentPly === 0}
              title="Lùi 1 nước (Mũi tên trái)"
            >
              ◀
            </button>
            <button
              type="button"
              className={styles.analyzeBtn}
              onClick={handleOpenAnalysis}
              title="Phân tích thế cờ hiện tại bằng AI"
            >
              🔍 Phân tích thế cờ này
            </button>
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={() => goToPly(currentPly + 1)}
              disabled={currentPly >= totalPlies}
              title="Tiến 1 nước (Mũi tên phải)"
            >
              ▶
            </button>
            <button
              type="button"
              className={styles.ctrlBtn}
              onClick={() => goToPly(totalPlies)}
              disabled={currentPly >= totalPlies}
              title="Đến cuối ván (End)"
            >
              ▶|
            </button>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            Nước thứ {Math.ceil(currentPly / 2)} / {Math.ceil(totalPlies / 2)} • Dùng phím mũi tên ◀ ▶ để di chuyển
          </div>
        </div>

        {/* Panel bên cạnh */}
        <div className={styles.sidePanel}>
          <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Ván #{game.id}</span>
              <span className={styles.badge} style={{ background: "rgba(217, 164, 65, 0.2)", color: "var(--accent)" }}>
                {game.eccoCode || "ECCO"}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
              <div>
                <strong style={{ color: "#ef4444" }}>Đỏ:</strong>{" "}
                <span>{translatePlayer(game.red).fullName}</span>{" "}
                {game.masterRed && (
                  <span style={{ color: "var(--accent)", fontSize: 12 }}>
                    ⭐ {getMasterDisplayName(game.masterRed)}
                  </span>
                )}
              </div>
              <div>
                <strong style={{ color: "#60a5fa" }}>Đen:</strong>{" "}
                <span>{translatePlayer(game.black).fullName}</span>{" "}
                {game.masterBlack && (
                  <span style={{ color: "var(--accent)", fontSize: 12 }}>
                    ⭐ {getMasterDisplayName(game.masterBlack)}
                  </span>
                )}
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              <div>
                <strong>Khai cuộc:</strong>{" "}
                <span style={{ color: "var(--text)" }}>
                  {translateEccoName(game.eccoName, game.eccoCode)}
                </span>
              </div>
              {game.tournament && <div><strong>Giải đấu:</strong> {game.tournament}</div>}
              <div><strong>Kết quả:</strong> {resultLabel}</div>
            </div>
          </div>

          {/* Danh sách nước đi */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--text)" }}>
              Biên bản nước đi ({totalPlies} nửa nước)
            </div>
            <div className={styles.movesContainer}>
              {movePairs.map((pair) => (
                <div key={pair.round} className={styles.moveRow}>
                  <span className={styles.moveNum}>{pair.round}.</span>
                  {pair.red ? (
                    <span
                      className={`${styles.moveCell} ${currentPly === pair.red.ply ? styles.active : ""}`}
                      onClick={() => pair.red && goToPly(pair.red.ply)}
                    >
                      {pair.red.text}
                    </span>
                  ) : null}
                  {pair.black ? (
                    <span
                      className={`${styles.moveCell} ${currentPly === pair.black.ply ? styles.active : ""}`}
                      onClick={() => pair.black && goToPly(pair.black.ply)}
                    >
                      {pair.black.text}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal phân tích thế cờ */}
      <PositionAnalysisModal
        isOpen={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
        analysis={posResult}
        loading={posLoading}
        error={posError}
      />
    </div>
  );
}
