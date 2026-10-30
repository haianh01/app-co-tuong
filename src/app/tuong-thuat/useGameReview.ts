"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardArrow } from "@/components/board/XiangqiBoard";
import { findTurningPoints, reviewGame, type PositionEval, type TurningPoint } from "@/lib/xiangqi/analysis";
import { replayMoves } from "@/lib/xiangqi/game";
import { moveNotation } from "@/lib/xiangqi/notation";
import type { StageGame } from "@/server/db/schema";
import type { StageReviewState } from "./stage-sync";

// Dùng chung cho bảng điều khiển (StageReviewControl) và chính trang sân khấu (nút Lịch sử / Phân tích):
// cả hai chỉ cần mã phòng để đọc ván đã lưu qua /api/tuong-thuat/games.

/** Danh sách ván đã lưu của phòng, mới nhất trước. Đổi `reloadKey` để tải lại (vd. vừa lưu xong một ván). */
export function useStageGames(room: string | null, reloadKey?: unknown) {
  const [games, setGames] = useState<StageGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
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
        setGames(Array.isArray(data.games) ? (data.games as StageGame[]) : []);
        setError(null);
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
  }, [room, reloadKey]);

  /** Xoá ván khỏi lịch sử; xoá được thì bỏ khỏi danh sách ngay, không phải tải lại. */
  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!room) return false;
      try {
        const res = await fetch(`/api/tuong-thuat/games/${encodeURIComponent(id)}?room=${encodeURIComponent(room)}`, {
          method: "DELETE",
          headers: { "X-Stage-Room": room },
        });
        if (!res.ok && res.status !== 404) return false;
        setGames((prev) => prev.filter((g) => g.id !== id));
        return true;
      } catch {
        return false;
      }
    },
    [room],
  );

  return { games, loading, error, remove };
}

/** Tải một ván đã lưu cùng phân tích engine, tìm bước ngoặt và dựng trạng thái chiếu phân tích cho từng nước. */
export function useGameReview(room: string | null, gameId: string | null) {
  const [game, setGame] = useState<StageGame | null>(null);
  const [analysis, setAnalysis] = useState<PositionEval[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId || !room) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
      }
    });

    fetch(`/api/tuong-thuat/games/${gameId}?room=${encodeURIComponent(room)}`, {
      headers: { "X-Stage-Room": room },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Không thể tải chi tiết ván cờ");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setGame(data.game ?? null);
        setAnalysis(Array.isArray(data.analysis) ? data.analysis : null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải chi tiết ván");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gameId, room]);

  // Ván đang giữ có thể là của lần chọn trước (đang tải ván mới): chỉ dùng khi đúng mã đang chọn.
  const activeGame = game && game.id === gameId ? game : null;
  const activeAnalysis = activeGame ? analysis : null;

  const gameState = useMemo(() => {
    if (!activeGame) return null;
    const moves = Array.isArray(activeGame.moves) ? activeGame.moves : [];
    return replayMoves(moves, activeGame.startFen);
  }, [activeGame]);

  const reviewResult = useMemo(() => {
    if (!gameState || !activeAnalysis) return null;
    try {
      return reviewGame(gameState, activeAnalysis);
    } catch {
      return null;
    }
  }, [gameState, activeAnalysis]);

  const turningPoints = useMemo<TurningPoint[]>(() => {
    if (!reviewResult) return [];
    try {
      return findTurningPoints(reviewResult.moves, 3);
    } catch {
      return [];
    }
  }, [reviewResult]);

  /** Điểm engine từng thế cờ quy về phía Đỏ (engine chấm theo phe đến lượt), để vẽ thanh và biểu đồ đánh giá. */
  const redScores = useMemo<(number | null)[] | null>(() => {
    if (!gameState || !activeAnalysis) return null;
    return gameState.history.map((pos, i) => {
      const ev = activeAnalysis[i];
      if (!ev) return null;
      return pos.turn === "r" ? ev.score : -ev.score;
    });
  }, [gameState, activeAnalysis]);

  /** Trạng thái chiếu phân tích tại nửa nước `targetPly` (tự kẹp vào 0…số nước). */
  const reviewAt = useCallback(
    (targetPly: number, tpOverride?: TurningPoint): StageReviewState | null => {
      if (!activeGame || !gameState) return null;
      const movesCount = gameState.moves.length;
      const validPly = Math.max(0, Math.min(movesCount, targetPly));
      const pos = gameState.history[validPly];
      if (!pos) return null;

      const lastM = validPly > 0 ? gameState.moves[validPly - 1].move : null;
      const ev = activeAnalysis?.[validPly] ?? null;
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

      return {
        gameId: activeGame.id,
        round: activeGame.round,
        ply: validPly,
        totalPlies: movesCount,
        board: pos.board,
        turn: pos.turn,
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
      };
    },
    [activeGame, gameState, activeAnalysis, turningPoints],
  );

  /** Ván chưa có phân tích: gọi engine cho từng thế cờ (server lưu kèm ván), cập nhật tiến độ theo dòng trả về. */
  const runAnalysis = useCallback(async () => {
    if (!activeGame || !gameState || !room) return;
    setAnalyzing(true);
    setProgress(0);
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
              setProgress(Math.round((count / accurateFens.length) * 100));
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
  }, [activeGame, gameState, room]);

  return {
    game: activeGame,
    analysis: activeAnalysis,
    loading,
    error,
    analyzing,
    progress,
    runAnalysis,
    turningPoints,
    redScores,
    totalPlies: gameState?.moves.length ?? 0,
    reviewAt,
  };
}
