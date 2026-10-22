"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { XiangqiBoard } from "@/components/board/XiangqiBoard";
import { AnalysisPanel, type AnalysisUpdateInfo } from "@/app/game/[id]/AnalysisPanel";
import { replayMoves } from "@/lib/xiangqi/game";
import { detectOpeningFromMoves } from "@/lib/xiangqi/openings";
import type { PositionEval } from "@/lib/xiangqi/analysis";
import type { StageGame } from "@/server/db/schema";
import broadcastStyles from "../../broadcast.module.css";
import zigaStyles from "../../ziga/ziga.module.css";
import styles from "../history.module.css";

const ROOM_KEY = "tuong-thuat:stage-room";

const noSubscribe = () => () => {};

function getStoredRoom(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromStorage = localStorage.getItem(ROOM_KEY);
    if (fromStorage) return fromStorage;
  } catch {}
  return new URLSearchParams(window.location.search).get("room");
}

export function StageReplayClient({ id }: { id: string }) {
  const room = useSyncExternalStore(noSubscribe, getStoredRoom, () => null);
  const [game, setGame] = useState<StageGame | null>(null);
  const [analysis, setAnalysis] = useState<(PositionEval | null)[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ply, setPly] = useState<number>(0);
  const [analysisInfo, setAnalysisInfo] = useState<AnalysisUpdateInfo | null>(null);

  useEffect(() => {
    if (!room || !id) return;
    let cancelled = false;

    fetch(`/api/tuong-thuat/games/${id}?room=${encodeURIComponent(room)}`, {
      headers: { "X-Stage-Room": room },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Không thể tải ván cờ (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.game) {
          setGame(data.game);
          if (Array.isArray(data.analysis)) {
            setAnalysis(data.analysis);
          }
          const movesCount = Array.isArray(data.game.moves) ? data.game.moves.length : 0;
          setPly(movesCount);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải ván cờ");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, room]);

  const gameState = useMemo(() => {
    if (!game) return null;
    const moves = Array.isArray(game.moves) ? game.moves : [];
    return replayMoves(moves, game.startFen);
  }, [game]);

  const currentPos = useMemo(() => {
    if (!gameState) return null;
    return gameState.history[ply] ?? gameState.history[gameState.history.length - 1];
  }, [gameState, ply]);

  const currentLastMove = useMemo(() => {
    if (!gameState || ply <= 0) return null;
    return gameState.moves[ply - 1]?.move ?? null;
  }, [gameState, ply]);

  const totalPlies = gameState?.moves.length ?? 0;
  const analysisSource = useMemo(
    () => ({
      loadUrl: `/api/tuong-thuat/games/${id}?room=${encodeURIComponent(room ?? "")}`,
      batchBody: { stageGameId: id, room },
      headers: room ? { "X-Stage-Room": room } : undefined,
    }),
    [id, room],
  );

  // Điều hướng phím mũi tên
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        setPly((p) => Math.max(0, p - 1));
      } else if (e.key === "ArrowRight") {
        setPly((p) => Math.min(totalPlies, p + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [totalPlies]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>⏳ Đang tải thông tin ván cờ…</div>
      </div>
    );
  }

  if (error || !game || !gameState || !currentPos) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState} style={{ color: "#f87171" }}>
          ⚠️ {error ?? "Không tìm thấy ván cờ hoặc không có quyền truy cập."}
          <div style={{ marginTop: 16 }}>
            <Link href="/tuong-thuat/lich-su" className={broadcastStyles.btn}>
              ← Quay lại danh sách lịch sử
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const notations = Array.isArray(game.moves)
    ? game.moves.map((m) => (typeof m === "object" && m && "notation" in m ? String(m.notation) : "")).filter(Boolean)
    : [];
  const opening = detectOpeningFromMoves(notations) ?? "Khai cuộc tự do";

  const resultBadge =
    game.result === "win"
      ? { text: "Bạn thắng", cls: styles.badgeWin }
      : game.result === "draw"
        ? { text: "Hòa", cls: styles.badgeDraw }
        : game.result === "loss"
          ? { text: "Đối thủ thắng", cls: styles.badgeLoss }
          : { text: "Chưa rõ", cls: styles.badgeUnknown };

  return (
    <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto", padding: "16px" }}>
      {/* Subnav */}
      <nav aria-label="Chế độ tường thuật" className={zigaStyles.subnav}>
        <Link href="/tuong-thuat" className={zigaStyles.subnavLink}>
          📷 Thị giác máy tính (Chụp màn hình)
        </Link>
        <Link href="/tuong-thuat/ziga" className={zigaStyles.subnavLink}>
          ⚡ Đồng bộ WebSocket trực tiếp (Ziga Hook)
        </Link>
        <Link href="/tuong-thuat/lich-su" className={`${zigaStyles.subnavLink} ${zigaStyles.subnavActive}`}>
          📜 Lịch sử ván đấu
        </Link>
      </nav>

      {/* Replay Container */}
      <div className={styles.replayLayout}>
        {/* Cột bàn cờ */}
        <div className={styles.replayBoardCol}>
          {/* Thông tin ván */}
          <div className={styles.replayHeaderCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Link href="/tuong-thuat/lich-su" className={broadcastStyles.btn} title="Trở về danh sách">
                ← Lịch sử
              </Link>
              <span style={{ fontWeight: 600 }}>
                Ván {game.round ?? "–"} · {opening}
              </span>
            </div>
            <span className={`${styles.badge} ${resultBadge.cls}`}>{resultBadge.text}</span>
          </div>

          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px" }}>
            <span style={{ color: game.mySide === "r" ? "#ef4444" : "#94a3b8", fontWeight: 600 }}>
              {game.mySide === "r" ? "🔴 " : "⚫ "}{game.me?.name || "Bạn"} ({game.me?.points ?? "–"})
            </span>
            <span style={{ color: "var(--muted, #94a3b8)", fontSize: "0.85rem" }}>VS</span>
            <span style={{ color: game.mySide === "r" ? "#94a3b8" : "#ef4444", fontWeight: 600 }}>
              {game.opponent?.name || "Đối thủ"} ({game.opponent?.points ?? "–"}){game.mySide === "r" ? " ⚫" : " 🔴"}
            </span>
          </div>

          <XiangqiBoard
            board={analysisInfo?.previewBoard ?? currentPos.board}
            lastMove={analysisInfo?.previewMove ?? currentLastMove}
            arrows={analysisInfo?.arrows ?? []}
            highlights={analysisInfo?.highlights ?? []}
            orientation={game.mySide === "b" ? "b" : "r"}
          />

          {/* Điều khiển nước cờ */}
          <div className={styles.replayControls}>
            <button
              type="button"
              className={broadcastStyles.btn}
              onClick={() => setPly(0)}
              disabled={ply === 0}
              aria-label="Về nước đầu tiên" title="Về nước đầu tiên"
            >
              |◀
            </button>
            <button
              type="button"
              className={broadcastStyles.btn}
              onClick={() => setPly((p) => Math.max(0, p - 1))}
              disabled={ply === 0}
              aria-label="Nước trước" title="Nước trước (Mũi tên trái)"
            >
              ◀
            </button>
            <span style={{ alignSelf: "center", padding: "0 8px", fontSize: "0.9rem", color: "var(--muted, #94a3b8)" }}>
              {ply} / {totalPlies}
            </span>
            <button
              type="button"
              className={broadcastStyles.btn}
              onClick={() => setPly((p) => Math.min(totalPlies, p + 1))}
              disabled={ply >= totalPlies}
              aria-label="Nước kế" title="Nước kế (Mũi tên phải)"
            >
              ▶
            </button>
            <button
              type="button"
              className={broadcastStyles.btn}
              onClick={() => setPly(totalPlies)}
              disabled={ply >= totalPlies}
              aria-label="Về nước cuối cùng" title="Về nước cuối cùng"
            >
              ▶|
            </button>
          </div>

          <div style={{ fontSize: "0.85rem", color: "var(--muted, #94a3b8)" }}>
            {ply > 0 && game.moves[ply - 1]
              ? `Nước ${ply}: ${game.moves[ply - 1].notation ?? ""}`
              : "Thế cờ xuất phát"}
          </div>
        </div>

        {/* Cột AI phân tích */}
        <div className={styles.replayAnalysisCol}>
          <AnalysisPanel
            state={gameState}
            ply={ply}
            onSelect={(selectedPly) => setPly(selectedPly)}
            viewer={game.mySide === "b" ? "b" : "r"}
            onAnalysisUpdate={setAnalysisInfo}
            initialAnalysis={analysis}
            source={analysisSource}
          />
        </div>
      </div>
    </div>
  );
}
