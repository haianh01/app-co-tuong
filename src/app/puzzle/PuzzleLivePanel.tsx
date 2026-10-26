"use client";

// Chiếu cờ thế lên sân khấu livestream ngay từ trang Cờ thế. Dùng chung phòng sân khấu với trang Tường thuật (mã phòng
// nhớ trong máy), nên link đã dán vào OBS vẫn dùng được. Chỉ kết nối khi người dẫn bật chế độ live, để người chơi
// thường không mở kết nối tới /ws/stage.

import { useCallback, useEffect, useRef, useState } from "react";
import type { StageRelayMessage } from "@/lib/stage-protocol";
import { initialPosition } from "@/lib/xiangqi/engine";
import { PUZZLES } from "@/lib/xiangqi/puzzles";
import { buildStageState, type StageSettings } from "@/app/tuong-thuat/stage-sync";
import { buildPuzzleStage, type StagePuzzleLive, type StagePuzzleSession, type StagePuzzleState } from "@/app/tuong-thuat/stage-puzzle";
import type { Puzzle } from "@/lib/xiangqi/puzzles";
import { StagePuzzleControl } from "@/app/tuong-thuat/StagePuzzleControl";
import { useStageLink, useStageSettings } from "@/app/tuong-thuat/StagePanel";
import styles from "./puzzle.module.css";

function stageMessage(settings: StageSettings, puzzle: StagePuzzleState | null): StageRelayMessage {
  const start = initialPosition();
  return {
    t: "state",
    state: buildStageState({
      board: start.board,
      turn: start.turn,
      ply: 0,
      lastMove: null,
      checkSquare: null,
      notations: [],
      arrows: [],
      highlights: [],
      mySide: "r",
      settings,
      puzzle,
    }),
  };
}

/** Kết nối sân khấu và thế đang chiếu. Giữ ở PuzzleClient để đổi thế (PuzzleBoard dựng lại) không mất trạng thái. */
export function usePuzzleLive(enabled: boolean, activePuzzle?: Puzzle | null) {
  const link = useStageLink(enabled);
  const { send } = link;
  const [settings] = useStageSettings();
  const [puzzle, setPuzzle] = useState<StagePuzzleState | null>(null);
  const [board, setBoard] = useState<StagePuzzleLive | null>(null);
  const [session, setSession] = useState<StagePuzzleSession>({ shown: 0, solved: 0 });
  const puzzleRef = useRef(puzzle);
  const boardRef = useRef(board);

  // Tự động đưa thế cờ người dẫn đang xem lên sân khấu ngay khi bật live hoặc khi chuyển sang thế khác.
  useEffect(() => {
    if (!enabled || !activePuzzle) return;
    if (!puzzleRef.current || puzzleRef.current.puzzleId !== activePuzzle.id) {
      const next = buildPuzzleStage(activePuzzle, "intro");
      puzzleRef.current = next;
      setPuzzle(next);
      setSession((s) => ({ ...s, shown: s.shown + 1 }));
    }
  }, [enabled, activePuzzle]);

  // Tắt live: sân khấu về bàn cờ đầu ván với thông tin kênh của người dẫn.
  const prevEnabled = useRef(enabled);
  useEffect(() => {
    if (prevEnabled.current && !enabled) {
      puzzleRef.current = null;
      setPuzzle(null);
      send(stageMessage(settings, null));
    }
    prevEnabled.current = enabled;
  }, [enabled, send, settings]);

  // Bàn giải của trang Cờ thế báo lên mỗi khi người dẫn thao tác. Giải xong thế đang chiếu thì cộng thành tích.
  const report = useCallback((next: StagePuzzleLive) => {
    const prev = boardRef.current;
    boardRef.current = next;
    setBoard(next);
    const solvedNow = next.status === "solved" && !(prev?.status === "solved" && prev.puzzleId === next.puzzleId);
    if (solvedNow && puzzleRef.current?.puzzleId === next.puzzleId) setSession((s) => ({ ...s, solved: s.solved + 1 }));
  }, []);

  // Gửi gói tin trạng thái cờ thế kèm phản chiếu bàn giải thời gian thực lên sân khấu.
  useEffect(() => {
    if (!enabled || !puzzle) return;
    const index = PUZZLES.findIndex((p) => p.id === puzzle.puzzleId);
    send(
      stageMessage(settings, {
        ...puzzle,
        number: index >= 0 ? index + 1 : undefined,
        total: PUZZLES.length,
        live: board?.puzzleId === puzzle.puzzleId ? board : null,
        session,
      }),
    );
  }, [enabled, puzzle, board, session, settings, send]);

  // Điều khiển thủ công từ thanh điều khiển (lên sân khấu, đếm ngược, gợi ý, lật đáp án).
  const update = (next: StagePuzzleState | null) => {
    if (next && next.puzzleId !== puzzleRef.current?.puzzleId) setSession((s) => ({ ...s, shown: s.shown + 1 }));
    puzzleRef.current = next;
    setPuzzle(next);
    if (!next) send(stageMessage(settings, null));
  };

  return { link, puzzle, update, report };
}

export function PuzzleLivePanel({ puzzleId, stage }: { puzzleId: string; stage: ReturnType<typeof usePuzzleLive> }) {
  const { link, puzzle, update } = stage;
  const [copied, setCopied] = useState(false);
  const stageUrl = link.room ? `${window.location.origin}/tuong-thuat/san-khau?room=${link.room}` : "";

  const copyUrl = () => {
    void navigator.clipboard?.writeText(stageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <section className={`card ${styles.live}`} aria-label="Chiếu cờ thế lên livestream">
      <div className={styles.liveHeader}>
        <span className={styles.liveDot} data-on={link.viewers > 0 || undefined} />
        <strong>Sân khấu livestream</strong>
        <span className="muted">
          {!link.online ? "Mất kết nối server" : link.viewers ? `${link.viewers} sân khấu đang mở` : "Chưa mở sân khấu"}
        </span>
      </div>
      <div className={styles.liveLinks}>
        <button type="button" className="btn btn-primary" disabled={!stageUrl} onClick={() => window.open(stageUrl, "_blank", "width=450,height=800")}>
          Mở sân khấu ↗
        </button>
        <button type="button" className="btn" disabled={!stageUrl} onClick={copyUrl} title="Dán vào Browser Source của OBS, kích thước 1080×1920">
          {copied ? "✓ Đã chép" : "Chép link cho OBS"}
        </button>
      </div>
      <StagePuzzleControl currentPuzzle={puzzle} onUpdatePuzzle={update} canOperate fixedPuzzleId={puzzleId} />
    </section>
  );
}
