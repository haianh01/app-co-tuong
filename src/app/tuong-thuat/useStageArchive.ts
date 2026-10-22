"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StagePlayer } from "./stage-sync";
import type { StageResult } from "./stage-round";
import type { PositionEval } from "@/lib/xiangqi/analysis";

export const STAGE_ARCHIVE_QUEUE_KEY = "tuong-thuat:archive-queue";

/** Sinh ID ngẫu nhiên 12 ký tự cho ván sân khấu (ví dụ: "stg_9x4ab21k"). */
export function newStageGameId(): string {
  const chars = "23456789abcdefghjkmnpqrstuvwxyz";
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let id = "stg_";
  for (let i = 0; i < 8; i++) {
    id += chars[bytes[i] % chars.length];
  }
  return id;
}

export interface StageGamePayload {
  id: string;
  room: string;
  site: "manual" | "ziga";
  round?: number;
  playedOn: string;
  mySide: "r" | "b";
  me: StagePlayer;
  opponent: StagePlayer;
  result: StageResult | null;
  resultSource: "manual" | "board" | null;
  startFen: string;
  moves: { from: number; to: number; notation?: string }[];
  plies: number;
  timeControl?: string;
  startedAt: string;
  endedAt: string;
}

/** Đọc hàng đợi lưu offline từ localStorage. */
export function readOfflineQueue(): StageGamePayload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STAGE_ARCHIVE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StageGamePayload[]) : [];
  } catch {
    return [];
  }
}

/** Ghi hàng đợi lưu offline vào localStorage. */
export function writeOfflineQueue(queue: StageGamePayload[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STAGE_ARCHIVE_QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

/** Thêm hoặc cập nhật ván vào hàng đợi offline. */
export function enqueueOffline(payload: StageGamePayload): void {
  const queue = readOfflineQueue().filter((item) => item.id !== payload.id);
  queue.push(payload);
  writeOfflineQueue(queue);
}

/** Gửi một payload tới API lưu ván. */
export class ArchiveHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ArchiveHttpError";
  }
}

async function sendArchivePayload(payload: StageGamePayload): Promise<boolean> {
  const res = await fetch("/api/tuong-thuat/games", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Stage-Room": payload.room,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new ArchiveHttpError(res.status, `Lưu ván thất bại (${res.status})`);
  }
  return true;
}

/** Thử gửi lại toàn bộ hàng đợi offline khi có mạng. Bỏ qua các lỗi 4xx (không hợp lệ). */
export async function flushOfflineQueue(): Promise<void> {
  const queue = readOfflineQueue();
  if (queue.length === 0) return;

  const remaining: StageGamePayload[] = [];
  for (const item of queue) {
    try {
      await sendArchivePayload(item);
    } catch (err: unknown) {
      if (err instanceof ArchiveHttpError && err.status >= 400 && err.status < 500) {
        // Lỗi 4xx (400, 403, 429): dữ liệu không hợp lệ hoặc bị từ chối, bỏ khỏi hàng đợi
        continue;
      }
      remaining.push(item);
    }
  }
  writeOfflineQueue(remaining);
}

export interface UseStageArchiveOptions {
  room: string | null;
  site: "manual" | "ziga";
  round: number;
  mySide: "r" | "b";
  me: StagePlayer;
  opponent: StagePlayer;
  moves: { move: { from: number; to: number }; notation?: string }[];
  startFen?: string;
  roundResult: StageResult | null;
  onBoardResult?: StageResult | null;
  timeControl?: string;
  fens?: string[];
}

export type StageAnalysisStatus = "idle" | "running" | "done" | "error";

export interface StageArchive {
  gameId: string;
  status: "idle" | "saving" | "saved" | "error";
  savedRound: number | null;
  error: string | null;
  analysisStatus: StageAnalysisStatus;
  analysisProgress: number;
  analyzedRound: number | null;
  analysisEvals: (PositionEval | null)[] | null;
  /** Lưu ván ngay lập tức. Có thể truyền kết quả ghi đè nếu vừa chốt ván. */
  saveNow: (overrideResult?: StageResult | null, resultSource?: "manual" | "board" | null) => Promise<boolean>;
  /** Khởi tạo ID mới cho ván mới. */
  newGame: () => void;
}

export function useStageArchive({
  room,
  site,
  round,
  mySide,
  me,
  opponent,
  moves,
  startFen = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w",
  roundResult,
  onBoardResult,
  timeControl,
  fens,
}: UseStageArchiveOptions): StageArchive {
  const [gameId, setGameId] = useState<string>(() => newStageGameId());
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedRound, setSavedRound] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [analysisStatus, setAnalysisStatus] = useState<StageAnalysisStatus>("idle");
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analyzedRound, setAnalyzedRound] = useState<number | null>(null);
  const [analysisEvals, setAnalysisEvals] = useState<(PositionEval | null)[] | null>(null);

  const startedAtRef = useRef<Date>(new Date());
  const lastSavedSignatureRef = useRef<string>("");
  const savingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Huỷ phân tích nếu component unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const startBackgroundAnalysis = useCallback(
    async (targetGameId: string, targetFens: string[], targetRound: number) => {
      if (!room || targetFens.length < 7) return;

      abortControllerRef.current?.abort();
      const ac = new AbortController();
      abortControllerRef.current = ac;

      setAnalysisStatus("running");
      setAnalysisProgress(0);
      setAnalyzedRound(targetRound);

      try {
        const res = await fetch("/api/engine/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Stage-Room": room,
          },
          body: JSON.stringify({
            fens: targetFens,
            stageGameId: targetGameId,
            room,
          }),
          signal: ac.signal,
        });

        if (!res.ok || !res.body) {
          setAnalysisStatus("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const collected: (PositionEval | null)[] = new Array(targetFens.length).fill(null);

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
              if (typeof data.index === "number" && typeof data.total === "number") {
                if (data.eval) {
                  collected[data.index] = data.eval;
                }
                setAnalysisProgress(Math.round(((data.index + 1) / data.total) * 100));
              }
            } catch {}
          }
        }

        setAnalysisEvals(collected);
        setAnalysisStatus("done");
        setAnalysisProgress(100);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setAnalysisStatus("error");
      }
    },
    [room],
  );

  // Thử gửi lại hàng đợi offline khi mount hoặc khi mạng hồi phục
  useEffect(() => {
    void flushOfflineQueue();
    const handleOnline = () => void flushOfflineQueue();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const newGame = useCallback(() => {
    setGameId(newStageGameId());
    setStatus("idle");
    setError(null);
    startedAtRef.current = new Date();
    lastSavedSignatureRef.current = "";
  }, []);

  const saveNow = useCallback(
    async (
      overrideResult?: StageResult | null,
      overrideResultSource?: "manual" | "board" | null,
    ): Promise<boolean> => {
      if (savingRef.current) return false;
      if (!room) {
        setError("Chưa có mã phòng sân khấu");
        setStatus("error");
        return false;
      }
      if (moves.length < 6) {
        setError("Ván dưới 6 nước không cần lưu");
        setStatus("error");
        return false;
      }

      const finalResult = overrideResult !== undefined ? overrideResult : (roundResult ?? onBoardResult ?? null);
      // Nếu không có kết quả thì finalSource luôn là null
      const finalSource = !finalResult
        ? null
        : overrideResultSource !== undefined
          ? overrideResultSource
          : overrideResult !== undefined
            ? "manual"
            : roundResult
              ? "manual"
              : onBoardResult
                ? "board"
                : null;

      const formattedMoves = moves.map((m) => ({
        from: m.move.from,
        to: m.move.to,
        notation: m.notation,
      }));

      // Chữ ký để tránh lưu lặp lại cùng một trạng thái
      const signature = `${gameId}:${finalResult}:${moves.length}`;
      if (lastSavedSignatureRef.current === signature) {
        return true;
      }

      // Đánh dấu ngay chữ ký và trạng thái đang lưu để chặn re-entrant / duplicate POST
      lastSavedSignatureRef.current = signature;
      savingRef.current = true;

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const payload: StageGamePayload = {
        id: gameId,
        room,
        site,
        round,
        playedOn: today,
        mySide,
        me,
        opponent,
        result: finalResult,
        resultSource: finalSource,
        startFen,
        moves: formattedMoves,
        plies: moves.length,
        timeControl,
        startedAt: startedAtRef.current.toISOString(),
        endedAt: new Date().toISOString(),
      };

      setStatus("saving");
      setError(null);

      try {
        await sendArchivePayload(payload);
        setStatus("saved");
        setSavedRound(round);
        void flushOfflineQueue();
        // Chỉ chạy AI phân tích ở nền khi ván ĐÃ KẾT THÚC
        if (finalResult && fens && fens.length >= 7) {
          void startBackgroundAnalysis(gameId, fens, round);
        }
        return true;
      } catch (err: unknown) {
        if (err instanceof ArchiveHttpError && err.status >= 400 && err.status < 500) {
          // Lỗi 4xx (400, 403, 429): không đẩy vào hàng chờ vì gửi lại cũng sẽ thất bại.
          // Xoá chữ ký để bấm lưu lại vẫn gửi thật (vd. sau khi hết 429).
          lastSavedSignatureRef.current = "";
          setError(err.message);
          setStatus("error");
          return false;
        }

        // Mất mạng (fetch error) hoặc lỗi 5xx máy chủ: đẩy vào hàng đợi offline trong localStorage để gửi lại sau
        enqueueOffline(payload);
        setStatus("saved"); // Đã lưu vào hàng đợi an toàn
        setSavedRound(round);
        setError(err instanceof Error ? err.message : "Đã lưu vào hàng chờ offline");
        return true;
      } finally {
        savingRef.current = false;
      }
    },
    [room, moves, roundResult, onBoardResult, gameId, site, round, mySide, me, opponent, startFen, timeControl, fens, startBackgroundAnalysis],
  );

  // Tự động lưu khi bàn cờ phát hiện hết ván (resultOnBoard)
  useEffect(() => {
    let active = true;
    if (onBoardResult && moves.length >= 6) {
      queueMicrotask(() => {
        if (active) void saveNow(onBoardResult, "board");
      });
    }
    return () => {
      active = false;
    };
  }, [onBoardResult, moves.length, saveNow]);

  return {
    gameId,
    status,
    savedRound,
    error,
    analysisStatus,
    analysisProgress,
    analyzedRound,
    analysisEvals,
    saveNow,
    newGame,
  };
}
