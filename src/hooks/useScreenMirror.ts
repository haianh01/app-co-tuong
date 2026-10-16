"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initialPosition, type Move, type Position, type Side } from "@/lib/xiangqi/engine";
import {
  GRID_H, GRID_W, MoveTracker, calibrate, extractPatches, sourceRect, type Calibration,
} from "@/lib/vision/board-reader";

/** Dưới mức này coi như chọn sai góc hoặc trang kia chưa ở thế cờ ban đầu. */
const MIN_CONFIDENCE = 0.85;
/** Nhịp chụp: đủ nhanh để thấy nước đi gần như tức thì, đủ thưa để không tốn CPU. */
const TICK_MS = 300;

export type MirrorStatus = "idle" | "picking" | "following";

/** Những gì bộ theo dõi đang thấy, hiện cho người dùng để biết vì sao chưa nhận được nước. */
export interface MirrorDiagnostics {
  frames: number;
  /** Ảnh bàn cờ còn đang thay đổi (quân trượt, hiệu ứng nhấp nháy…): chờ đứng yên mới đọc. */
  moving: boolean;
  /** Số ô trên ảnh không khớp thế cờ đang theo dõi. */
  mismatched: number;
  /** Số nhịp liên tiếp ảnh không đứng yên. */
  movingStreak: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Chụp cửa sổ/tab của một trang cờ khác (getDisplayMedia) và báo các nước đi đọc được.
 * Trình tự: start() → người dùng bấm 2 góc lưới (addCorner) → follow() → onMoves được gọi mỗi khi có nước mới.
 */
export function useScreenMirror(onMoves: (moves: Move[]) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<MoveTracker | null>(null);
  // Nhịp chụp chạy trong Web Worker: khi tab này bị ẩn (người dùng chuyển sang tab trang cờ kia), setInterval ở
  // trang bị trình duyệt hãm còn 1 lần/giây rồi 1 lần/phút; timer trong worker thì không.
  const timerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onMovesRef = useRef(onMoves);
  useEffect(() => {
    onMovesRef.current = onMoves;
  }, [onMoves]);

  const [status, setStatus] = useState<MirrorStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [bottom, setBottom] = useState<Side | null>(null);
  const [diag, setDiag] = useState<MirrorDiagnostics | null>(null);

  const stop = useCallback(() => {
    timerRef.current?.terminate();
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    setCorners([]);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Trình duyệt này không hỗ trợ chụp màn hình. Hãy dùng Chrome, Edge hoặc Firefox trên máy tính.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
      streamRef.current = stream;
      // Người dùng bấm "Dừng chia sẻ" của trình duyệt.
      stream.getVideoTracks()[0]?.addEventListener("ended", stop);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      setCorners([]);
      setStatus("picking");
    } catch {
      setError("Chưa chọn cửa sổ nào để chia sẻ.");
    }
  }, [stop]);

  /** Thêm một góc từ cú bấm trên khung video (tọa độ màn hình); quá 2 góc thì chọn lại từ đầu. */
  const addCorner = useCallback((clientX: number, clientY: number) => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const rect = video.getBoundingClientRect();
    const p = {
      x: ((clientX - rect.left) / rect.width) * video.videoWidth,
      y: ((clientY - rect.top) / rect.height) * video.videoHeight,
    };
    setCorners((cs) => (cs.length >= 2 ? [p] : [...cs, p]));
  }, []);

  const grab = useCallback((cal: Calibration) => {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const { sx, sy, sw, sh } = sourceRect(cal);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, GRID_W, GRID_H);
    return extractPatches(ctx.getImageData(0, 0, GRID_W, GRID_H).data);
  }, []);

  /** Học hình quân từ thế cờ ban đầu đang hiện trên trang kia rồi bắt đầu theo dõi. */
  const follow = useCallback(
    (forceBottom?: Side) => {
      if (corners.length < 2) return;
      const [a, b] = corners;
      // Chấp nhận bấm hai góc theo thứ tự bất kỳ.
      const cal: Calibration = { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
      const patches = grab(cal);
      if (!patches) return;
      const result = calibrate(patches, initialPosition().board, forceBottom);
      if (result.confidence < MIN_CONFIDENCE) {
        setError(
          "Không nhận ra thế cờ ban đầu. Kiểm tra lại: trang kia phải đang ở thế cờ ban đầu (chưa ai đi) và hai góc phải bấm đúng giao điểm ngoài cùng của lưới.",
        );
        return;
      }
      setError(null);
      setBottom(result.bottom);
      const tracker = new MoveTracker(result.templates, result.bottom, initialPosition());
      trackerRef.current = tracker;
      timerRef.current?.terminate();
      const ticker = new Worker(
        URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${TICK_MS});`], { type: "text/javascript" })),
      );
      timerRef.current = ticker;
      let frames = 0;
      let movingStreak = 0;
      ticker.onmessage = () => {
        const ps = grab(cal);
        if (!ps || trackerRef.current !== tracker) return;
        const moves = tracker.feed(ps);
        if (moves.length) onMovesRef.current(moves);
        frames++;
        movingStreak = tracker.last.moving ? movingStreak + 1 : 0;
        setDiag({ frames, moving: tracker.last.moving, mismatched: tracker.last.mismatched.length, movingStreak });
      };
      setDiag(null);
      setStatus("following");
    },
    [corners, grab],
  );

  /** Báo cho bộ theo dõi thế cờ đúng hiện tại (sau khi lùi nước nhận sai hoặc bắt đầu ván mới). */
  const resync = useCallback((pos: Position) => {
    trackerRef.current?.setPosition(pos);
  }, []);

  /** Chọn lại góc (giữ nguyên cửa sổ đang chia sẻ). */
  const repick = useCallback(() => {
    timerRef.current?.terminate();
    timerRef.current = null;
    trackerRef.current = null;
    setCorners([]);
    setStatus(streamRef.current ? "picking" : "idle");
  }, []);

  return { videoRef, status, error, corners, bottom, diag, start, stop, addCorner, follow, resync, repick };
}
