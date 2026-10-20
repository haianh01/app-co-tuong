"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initialPosition, toFen, type Board, type Move, type Position, type Side } from "@/lib/xiangqi/engine";
import {
  GRID_H, GRID_W, MoveTracker, calibrate, extractPatches, sourceRect, toBoardOrder, type Calibration, type Patch,
} from "@/lib/vision/board-reader";
import { learnLibrary, mergeLibrary, parseLibrary, readBoard, serializeLibrary } from "@/lib/vision/piece-library";
import type { Pixels, Region } from "@/lib/vision/zigavn-panels";

/** Dưới mức này coi như chọn sai góc hoặc trang kia chưa ở thế cờ ban đầu. */
const MIN_CONFIDENCE = 0.85;
/** Tỉ lệ ngang/dọc của khung chụp lệch quá mức này so với lúc chọn góc thì bố cục trang kia đã đổi. */
const ASPECT_TOLERANCE = 0.01;
/** Nhịp chụp: đủ nhanh để thấy nước đi gần như tức thì, đủ thưa để không tốn CPU. */
const TICK_MS = 300;
/** Lệch liên tục chừng này nhịp (~2 giây) thì thử đọc lại cả thế cờ; thử xong chờ thêm chừng này nhịp mới thử lại. */
const DESYNC_FRAMES = 7;
const DESYNC_COOLDOWN = 15;

/** Các mức dịch lưới thử khi góc bấm hơi lệch (theo phần của một ô). */
const NUDGES = [
  { dx: 0.03, dy: 0 },
  { dx: -0.03, dy: 0 },
  { dx: 0, dy: 0.03 },
  { dx: 0, dy: -0.03 },
  { dx: 0.03, dy: 0.03 },
  { dx: -0.03, dy: -0.03 },
  { dx: 0.03, dy: -0.03 },
  { dx: -0.03, dy: 0.03 },
  { dx: 0.06, dy: 0 },
  { dx: -0.06, dy: 0 },
  { dx: 0, dy: 0.06 },
  { dx: 0, dy: -0.06 },
];

/** Hình từng loại quân của trang nguồn, học mỗi lần bắt đầu theo dõi thành công (xem lib/vision/piece-library). */
const LIBRARY_KEY = "tuong-thuat:piece-library";

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? parseLibrary(raw) : null;
  } catch {
    return null;
  }
}

function saveLibrary(patches: Patch[], bottom: Side, board: Board) {
  try {
    const lib = mergeLibrary(loadLibrary(), learnLibrary(toBoardOrder(patches, bottom), board));
    localStorage.setItem(LIBRARY_KEY, serializeLibrary(lib));
  } catch {}
}

/** Thế cờ giữa ván đọc được từ ảnh (chưa biết bên nào đi): chờ người dùng chọn rồi follow() thế đó. */
export interface DetectedBoard {
  board: Board;
  bottom: Side;
}

export type MirrorStatus = "idle" | "picking" | "following";

/**
 * Loại nguồn người dùng đã chọn chia sẻ. Chỉ "browser" (một tab) là trình duyệt vẫn gửi hình khi tab đó bị ẩn;
 * "window"/"monitor" chỉ chụp thứ đang hiện trên màn hình.
 */
export type CaptureSurface = "browser" | "window" | "monitor";

/** Các tùy chọn của getDisplayMedia mà thư viện kiểu DOM của TypeScript chưa có (Chrome/Edge hỗ trợ). */
interface CaptureOptions extends DisplayMediaStreamOptions {
  /** Ẩn chính tab đang gọi khỏi danh sách chọn: chia sẻ trang tường thuật thì không đọc được gì. */
  selfBrowserSurface?: "include" | "exclude";
}

/** Những gì bộ theo dõi đang thấy, hiện cho người dùng để biết vì sao chưa nhận được nước. */
export interface MirrorDiagnostics {
  frames: number;
  /** Ảnh bàn cờ còn đang thay đổi (quân trượt, hiệu ứng nhấp nháy…): chờ đứng yên mới đọc. */
  moving: boolean;
  /** Số ô trên ảnh không khớp thế cờ đang theo dõi. */
  mismatched: number;
  /** Số nhịp liên tiếp ảnh không đứng yên. */
  movingStreak: number;
  /** Khung chụp đã đổi tỉ lệ so với lúc chọn góc (cửa sổ kia bị co giãn): vị trí bàn cờ không còn như cũ. */
  resized: boolean;
  /** Số ô đang bị thứ khác đè lên (thông báo, hiệu ứng, cửa sổ khác): app tạm không đọc nước. */
  occluded: number;
}

/** Điểm trên khung chụp, tính theo tỉ lệ (0..1) chiều rộng/cao: giữ đúng khi trình duyệt đổi độ phân giải chụp. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Chụp cửa sổ/tab của một trang cờ khác (getDisplayMedia) và báo các nước đi đọc được.
 * Trình tự: start() → người dùng bấm 2 góc lưới (addCorner) → follow() → onMoves được gọi mỗi khi có nước mới.
 * onRestart được gọi khi trang kia bày lại thế ban đầu giữa chừng (sang ván mới); bộ theo dõi đã tự về thế ban đầu.
 */
export function useScreenMirror(
  onMoves: (moves: Move[]) => void,
  onRestart?: () => void,
  onDesync?: (board: Board) => void,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<MoveTracker | null>(null);
  // Nhịp chụp chạy trong Web Worker: khi tab này bị ẩn (người dùng chuyển sang tab trang cờ kia), setInterval ở
  // trang bị trình duyệt hãm còn 1 lần/giây rồi 1 lần/phút; timer trong worker thì không.
  const timerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onMovesRef = useRef(onMoves);
  const onRestartRef = useRef(onRestart);
  const onDesyncRef = useRef(onDesync);
  useEffect(() => {
    onMovesRef.current = onMoves;
    onRestartRef.current = onRestart;
    onDesyncRef.current = onDesync;
  }, [onMoves, onRestart, onDesync]);

  const [status, setStatus] = useState<MirrorStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [bottom, setBottom] = useState<Side | null>(null);
  const [diag, setDiag] = useState<MirrorDiagnostics | null>(null);
  const [surface, setSurface] = useState<CaptureSurface | null>(null);
  const [detected, setDetected] = useState<DetectedBoard | null>(null);

  const stop = useCallback(() => {
    timerRef.current?.terminate();
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
    setCorners([]);
    setSurface(null);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Trình duyệt này không hỗ trợ chụp màn hình. Hãy dùng Chrome, Edge hoặc Firefox trên máy tính.");
      return;
    }
    try {
      // Mở sẵn mục "Tab" trong hộp chọn: chia sẻ cả cửa sổ thì khi người dùng chuyển sang tab này, hình chụp chỉ còn
      // là chính trang này và app lỡ các nước đi trong lúc đó.
      const options: CaptureOptions = {
        video: { frameRate: 10, displaySurface: "browser" },
        audio: false,
        selfBrowserSurface: "exclude",
      };
      const stream = await navigator.mediaDevices.getDisplayMedia(options);
      streamRef.current = stream;
      const chosen = stream.getVideoTracks()[0]?.getSettings().displaySurface;
      setSurface(chosen === "browser" || chosen === "window" || chosen === "monitor" ? chosen : null);
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
    const p = { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height };
    setCorners((cs) => (cs.length >= 2 ? [p] : [...cs, p]));
  }, []);

  /** Chụp 90 mẫu tại hai góc `a`, `b` (theo tỉ lệ khung hình, thứ tự bất kỳ). */
  const grab = useCallback(([a, b]: Point[]) => {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const cal: Calibration = {
      x0: Math.min(a.x, b.x) * w,
      y0: Math.min(a.y, b.y) * h,
      x1: Math.max(a.x, b.x) * w,
      y1: Math.max(a.y, b.y) * h,
    };
    const canvas = (canvasRef.current ??= document.createElement("canvas"));
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const { sx, sy, sw, sh } = sourceRect(cal);
    // Thu nhỏ chất lượng cao: mặc định trình duyệt thu nhỏ kiểu lấy điểm, nét chữ trên quân vỡ vụn và bộ đọc thế cờ
    // giữa ván (cần phân biệt loại quân) nhầm loạn.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, GRID_W, GRID_H);
    return extractPatches(ctx.getImageData(0, 0, GRID_W, GRID_H).data);
  }, []);

  /**
   * Học hình quân từ ảnh trang kia, khi trang kia đang ở đúng thế `start` (thế ban đầu, hoặc thế người dùng đã tự đi
   * tới cho khớp), rồi bắt đầu theo dõi từ đó. Trả về false nếu ảnh không khớp (lỗi ở `error`).
   */
  const follow = useCallback(
    (start: Position, forceBottom?: Side): boolean => {
      const video = videoRef.current;
      if (corners.length < 2 || !video) return false;
      const aspect = video.videoWidth / video.videoHeight;
      let bestCorners = corners;
      let patches = grab(bestCorners);
      if (!patches) return false;
      let result = calibrate(patches, start.board, forceBottom);
      const [p1, p2] = corners;
      const cw = Math.abs(p1.x - p2.x) / 8;
      const ch = Math.abs(p1.y - p2.y) / 9;
      const shifted = (s: { dx: number; dy: number }): Point[] => [
        { x: p1.x + s.dx, y: p1.y + s.dy },
        { x: p2.x + s.dx, y: p2.y + s.dy },
      ];

      // Nếu người dùng bấm hơi lệch góc, tự động dò tìm vi sai (micro-nudge)
      // để tự căn chỉnh lưới chuẩn xác vào tâm các giao điểm
      if (result.confidence < MIN_CONFIDENCE || result.misplaced > 0) {
        const shifts = NUDGES.map((n) => ({ dx: n.dx * cw, dy: n.dy * ch }));

        for (const s of shifts) {
          const cand = shifted(s);
          const candPatches = grab(cand);
          if (!candPatches) continue;
          const candRes = calibrate(candPatches, start.board, forceBottom);
          if (
            candRes.misplaced < result.misplaced ||
            (candRes.misplaced === result.misplaced && candRes.confidence > result.confidence)
          ) {
            result = candRes;
            patches = candPatches;
            bestCorners = cand;
            if (result.confidence >= MIN_CONFIDENCE && result.misplaced === 0) {
              setCorners(cand);
              break;
            }
          }
        }
      }

      // Chỉ giữ góc đã dịch khi nó thật sự khớp thế cờ: trang kia đang giữa ván thì dịch lưới để "khớp" thế ban đầu
      // chỉ ra một lưới lệch.
      if (bestCorners !== corners && result.confidence >= MIN_CONFIDENCE && result.misplaced === 0) {
        setCorners(bestCorners);
      }

      const fromStart = toFen(start) === toFen(initialPosition());
      setDetected(null);
      if (result.confidence < MIN_CONFIDENCE || result.misplaced > 0) {
        // Trang kia đang giữa ván: đọc cả thế cờ bằng hình quân đã học ở các lần trước, khỏi phải bày lại từng nước.
        // Thử lại các mức dịch lưới (góc người dùng bấm có thể lệch), lấy mức đọc khớp nhất mà thế cờ hợp lệ.
        const lib = loadLibrary();
        let found: { read: NonNullable<ReturnType<typeof readBoard>>; corners: Point[] } | null = null;
        for (const s of lib ? [{ dx: 0, dy: 0 }, ...NUDGES.map((n) => ({ dx: n.dx * cw, dy: n.dy * ch }))] : []) {
          const cand = shifted(s);
          const candPatches = grab(cand);
          const read = candPatches && readBoard(candPatches, lib!, forceBottom);
          if (!read || (found && found.read.cost <= read.cost)) continue;
          const check = calibrate(candPatches, read.board, read.bottom);
          if (check.confidence >= MIN_CONFIDENCE && check.misplaced === 0) found = { read, corners: cand };
        }
        if (found && toFen({ board: found.read.board, turn: "r" }) !== toFen({ board: start.board, turn: "r" })) {
          setCorners(found.corners);
          setError(null);
          setDetected({ board: found.read.board, bottom: found.read.bottom });
          return false;
        }
      }
      const noLibrary = " (App chưa học hình quân của trang này: hãy theo dõi từ đầu một ván một lần, từ lần sau app tự đọc được thế cờ giữa ván.)";
      const libraryHint = loadLibrary() ? "" : noLibrary;
      if (result.confidence < MIN_CONFIDENCE) {
        if (!fromStart) {
          const initRes = calibrate(patches, initialPosition().board, forceBottom);
          if (initRes.confidence >= MIN_CONFIDENCE && initRes.misplaced === 0) {
            setError(
              "Ảnh chụp bên kia đang ở thế cờ ban đầu (ván mới), nhưng bàn cờ bên trái của app đang có nước đi dở dang. Hãy bấm nút “Đặt lại ván mới về đầu” bên dưới để đồng bộ.",
            );
            return false;
          }
        }

        setError(
          fromStart
            ? "Không nhận ra thế cờ ban đầu. Kiểm tra lại: hai góc phải bấm đúng tâm của 2 con Xe ở góc ngoài cùng của lưới. Nếu ván bên kia đã đi vài nước, hãy tắt chế độ Vẽ và tự đi lại các nước đó trên bàn cờ ở đây cho giống, rồi bấm lại “Bắt đầu theo dõi”." + libraryHint
            : "Ảnh không khớp thế cờ trên bàn cờ ở đây. Kiểm tra lại: hai góc phải bấm đúng tâm của 2 con Xe góc ngoài cùng, và các quân trên bàn cờ ở đây phải đứng giống hệt trang kia." + libraryHint,
        );
        return false;
      }
      if (result.misplaced > 0) {
        setError(
          `Trang kia khác thế cờ trên bàn cờ ở đây ở ${result.misplaced} ô. Hãy tắt chế độ Vẽ và tự đi các nước trên bàn cờ ở đây cho giống hệt trang kia, rồi bấm lại “Bắt đầu theo dõi”.` + libraryHint,
        );
        return false;
      }
      setError(null);
      setBottom(result.bottom);
      saveLibrary(patches, result.bottom, start.board);
      const tracker = new MoveTracker(result.templates, result.bottom, start);
      trackerRef.current = tracker;
      timerRef.current?.terminate();
      const ticker = new Worker(
        URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${TICK_MS});`], { type: "text/javascript" })),
      );
      timerRef.current = ticker;
      let frames = 0;
      let movingStreak = 0;
      // Ảnh đứng yên mà vẫn lệch thế đang theo dõi (thường do đã nhận nhầm một nước): đủ lâu thì đọc lại cả thế cờ.
      let desyncStreak = 0;
      ticker.onmessage = () => {
        const v = videoRef.current;
        if (!v?.videoWidth || trackerRef.current !== tracker) return;
        // Cùng tỉ lệ (trình duyệt chỉ đổi độ phân giải chụp) thì góc theo tỉ lệ vẫn đúng; khác tỉ lệ thì bố cục đã đổi.
        if (Math.abs(v.videoWidth / v.videoHeight - aspect) > ASPECT_TOLERANCE * aspect) {
          frames++;
          setDiag({ frames, moving: false, mismatched: 0, movingStreak: 0, resized: true, occluded: 0 });
          return false;
        }
        const ps = grab(corners);
        if (!ps) return;
        const moves = tracker.feed(ps);
        if (moves.length) onMovesRef.current(moves);
        else if (tracker.last.restarted) onRestartRef.current?.();
        desyncStreak = !tracker.last.moving && tracker.last.mismatched.length > 0 ? desyncStreak + 1 : 0;
        if (desyncStreak >= DESYNC_FRAMES) {
          desyncStreak = -DESYNC_COOLDOWN;
          const lib = loadLibrary();
          const read = lib && readBoard(ps, lib, tracker.bottomSide);
          if (read && read.board.some((p, i) => p !== tracker.position.board[i])) {
            const check = calibrate(ps, read.board, read.bottom);
            if (check.confidence >= MIN_CONFIDENCE && check.misplaced === 0) onDesyncRef.current?.(read.board);
          }
        }
        frames++;
        movingStreak = tracker.last.moving ? movingStreak + 1 : 0;
        setDiag({
          frames,
          moving: tracker.last.moving,
          mismatched: tracker.last.mismatched.length,
          movingStreak,
          resized: false,
          occluded: tracker.last.occluded ?? 0,
        });
      };
      setDiag(null);
      setStatus("following");
      return true;
    },
    [corners, grab],
  );

  /**
   * Cắt một vùng của khung chụp theo tọa độ lưới bàn cờ ((0,0) giao điểm góc trên-trái, (1,1) góc dưới-phải), ở độ
   * phân giải gốc của khung chụp. Dùng để đọc các ô quanh bàn cờ (nick, đồng hồ…). null khi chưa có 2 góc.
   */
  const regionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const grabRegion = useCallback(
    (r: Region): Pixels | null => {
      const video = videoRef.current;
      if (corners.length < 2 || !video?.videoWidth) return null;
      const [a, b] = corners;
      const w = video.videoWidth;
      const h = video.videoHeight;
      const gx0 = Math.min(a.x, b.x) * w;
      const gy0 = Math.min(a.y, b.y) * h;
      const gw = Math.abs(a.x - b.x) * w;
      const gh = Math.abs(a.y - b.y) * h;
      const sx = Math.max(0, Math.round(gx0 + r.x0 * gw));
      const sy = Math.max(0, Math.round(gy0 + r.y0 * gh));
      const sw = Math.min(w, Math.round(gx0 + r.x1 * gw)) - sx;
      const sh = Math.min(h, Math.round(gy0 + r.y1 * gh)) - sy;
      if (sw < 2 || sh < 2) return null;
      const canvas = (regionCanvasRef.current ??= document.createElement("canvas"));
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      return ctx.getImageData(0, 0, sw, sh);
    },
    [corners],
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

  const clearDetected = useCallback(() => setDetected(null), []);

  return { videoRef, status, error, corners, bottom, diag, surface, start, stop, addCorner, follow, resync, repick, grabRegion, detected, clearDetected };
}
