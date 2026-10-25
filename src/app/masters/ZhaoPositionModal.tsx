"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { XiangqiBoard, type BoardArrow } from "@/components/board/XiangqiBoard";
import {
  parseFen,
  play,
  sideOf,
  legalMovesFrom,
  type Board,
  type Move,
  type Position,
} from "@/lib/xiangqi/engine";
import { uciToMove } from "@/lib/xiangqi/uci";
import { moveNotation } from "@/lib/xiangqi/notation";
import { detectAllZhaoTactics } from "@/lib/xiangqi/zhao-principles";
import { explainText } from "@/lib/xiangqi/explain";
import { useEngine } from "@/hooks/useEngine";
import {
  ZHAO_BENCHMARK_LESSONS,
  ZHAO_BENCHMARK_MAP,
  type ZhaoBenchmarkItem,
} from "@/lib/xiangqi/zhao-benchmark-data";
import styles from "./ZhaoPositionModal.module.css";

interface Props {
  isOpen: boolean;
  initialLesson?: number;
  onClose: () => void;
  onOpenVideo?: (video: { videoId: string; title: string; timecode?: string }) => void;
}

export function ZhaoPositionModal({
  isOpen,
  initialLesson = 1,
  onClose,
  onOpenVideo,
}: Props) {
  const [currentLessonNum, setCurrentLessonNum] = useState<number>(initialLesson);
  const [hasPlayedMove, setHasPlayedMove] = useState<boolean>(false);
  const [customMove, setCustomMove] = useState<Move | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [engineScore, setEngineScore] = useState<number | null>(null);
  const think = useEngine();

  // Đồng bộ bài học khi initialLesson thay đổi từ bên ngoài
  useEffect(() => {
    if (initialLesson && ZHAO_BENCHMARK_MAP[initialLesson]) {
      setCurrentLessonNum(initialLesson);
      setHasPlayedMove(false);
      setCustomMove(null);
      setSelectedSquare(null);
      setEngineScore(null);
    }
  }, [initialLesson]);

  // Đổi bài học thì reset trạng thái bàn cờ
  const benchmarkItem: ZhaoBenchmarkItem = useMemo(() => {
    return ZHAO_BENCHMARK_MAP[currentLessonNum] ?? ZHAO_BENCHMARK_LESSONS[0];
  }, [currentLessonNum]);

  const initialPos: Position = useMemo(() => {
    try {
      return parseFen(benchmarkItem.fen);
    } catch {
      return parseFen("4k4/9/9/9/9/9/9/9/9/4K4 w");
    }
  }, [benchmarkItem.fen]);

  const zhaoMove: Move | null = useMemo(() => {
    return uciToMove(benchmarkItem.move);
  }, [benchmarkItem.move]);

  // Nước đang thực thi: hoặc nước của Triệu Hâm Hâm hoặc nước tự đi
  const activeMove: Move | null = customMove ?? zhaoMove;

  const currentBoard: Board = useMemo(() => {
    if (!hasPlayedMove || !activeMove) {
      return initialPos.board;
    }
    try {
      return play(initialPos.board, activeMove);
    } catch {
      return initialPos.board;
    }
  }, [initialPos.board, hasPlayedMove, activeMove]);

  // Phân tích kỳ lý bằng AI (detectAllZhaoTactics + explainText)
  const { facts, commentary, isMatched, detectedTacticTitle } = useMemo(() => {
    if (!activeMove) {
      return { facts: [], commentary: "", isMatched: false, detectedTacticTitle: "" };
    }
    const after = play(initialPos.board, activeMove);
    const zhaoFacts = detectAllZhaoTactics(initialPos.board, activeMove, after);
    const text = explainText(zhaoFacts, initialPos.turn, 1, "zhaoXinxin");
    const matched = zhaoFacts.some(
      (f) => f.lesson === benchmarkItem.lesson || f.tactic === benchmarkItem.tacticId
    );
    const firstFactTitle = zhaoFacts[0]?.lessonTitle ?? zhaoFacts[0]?.tactic;

    return {
      facts: zhaoFacts,
      commentary: text,
      isMatched: matched,
      detectedTacticTitle: firstFactTitle,
    };
  }, [initialPos, activeMove, benchmarkItem]);

  // Chạy engine đánh giá điểm số
  useEffect(() => {
    let cancelled = false;
    setEngineScore(null);
    if (!isOpen) return;

    think(benchmarkItem.fen, 3, undefined, "analysis")
      .then((res) => {
        if (!cancelled && res.score !== undefined) {
          setEngineScore(res.score);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [benchmarkItem.fen, isOpen, think]);

  if (!isOpen) return null;

  // Xử lý click quân để tự thử nghiệm nước cờ khác
  const targets =
    selectedSquare !== null ? legalMovesFrom(initialPos, selectedSquare).map((m) => m.to) : [];

  const handleSquareClick = (sq: number) => {
    const piece = initialPos.board[sq];
    if (piece && sideOf(piece) === initialPos.turn) {
      setSelectedSquare(selectedSquare === sq ? null : sq);
      return;
    }
    if (selectedSquare !== null && targets.includes(sq)) {
      setCustomMove({ from: selectedSquare, to: sq });
      setHasPlayedMove(true);
      setSelectedSquare(null);
    }
  };

  const handlePlayZhaoMove = () => {
    setCustomMove(null);
    setHasPlayedMove(true);
    setSelectedSquare(null);
  };

  const handleResetBoard = () => {
    setHasPlayedMove(false);
    setCustomMove(null);
    setSelectedSquare(null);
  };

  // Mũi tên chỉ nước đi
  const boardArrows: BoardArrow[] = [];
  if (!hasPlayedMove && zhaoMove) {
    boardArrows.push({
      from: zhaoMove.from,
      to: zhaoMove.to,
      kind: "better",
    });
  } else if (hasPlayedMove && activeMove) {
    boardArrows.push({
      from: activeMove.from,
      to: activeMove.to,
      kind: "played",
    });
  }

  // Chuyển bài học
  const currentIndex = ZHAO_BENCHMARK_LESSONS.findIndex(
    (item) => item.lesson === currentLessonNum
  );
  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentLessonNum(ZHAO_BENCHMARK_LESSONS[currentIndex - 1].lesson);
      handleResetBoard();
    }
  };
  const handleNext = () => {
    if (currentIndex < ZHAO_BENCHMARK_LESSONS.length - 1) {
      setCurrentLessonNum(ZHAO_BENCHMARK_LESSONS[currentIndex + 1].lesson);
      handleResetBoard();
    }
  };

  const formattedScore =
    engineScore !== null
      ? `${engineScore > 0 ? "+" : ""}${engineScore} cp (${
          Math.abs(engineScore) > 300
            ? "Ưu thế lớn"
            : Math.abs(engineScore) > 100
            ? "Ưu thế nhẹ"
            : "Cân bằng"
        })`
      : "Đang tính…";

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.modalBadge}>🧪 ĐỐI CHIẾU AI &amp; TRIỆU HÂM HÂM</span>
            <select
              className={styles.lessonSelect}
              value={currentLessonNum}
              onChange={(e) => {
                setCurrentLessonNum(Number(e.target.value));
                handleResetBoard();
              }}
              aria-label="Chọn bài giảng Triệu Hâm Hâm"
            >
              {ZHAO_BENCHMARK_LESSONS.map((item) => (
                <option key={item.lesson} value={item.lesson}>
                  Bài {item.lesson}: {item.title} ({item.moveNotation})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.headerNav}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={handlePrev}
              disabled={currentIndex <= 0}
              title="Bài trước (◀)"
            >
              ◀ Trước
            </button>
            <span style={{ fontSize: "12px", color: "var(--muted)", minWidth: "48px", textAlign: "center" }}>
              {currentIndex + 1} / {ZHAO_BENCHMARK_LESSONS.length}
            </span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={handleNext}
              disabled={currentIndex >= ZHAO_BENCHMARK_LESSONS.length - 1}
              title="Bài tiếp theo (▶)"
            >
              Tiếp ▶
            </button>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              title="Đóng (Esc)"
              aria-label="Đóng bảng đối chiếu"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body Layout */}
        <div className={styles.body}>
          {/* Cột trái: Bàn cờ */}
          <div className={styles.boardCol}>
            <div className={styles.boardWrapper}>
              <XiangqiBoard
                board={currentBoard}
                orientation={initialPos.turn}
                selected={selectedSquare}
                targets={targets}
                lastMove={hasPlayedMove ? activeMove : null}
                arrows={boardArrows}
                onSquareClick={handleSquareClick}
              />
            </div>

            <div className={styles.boardActions}>
              <button
                type="button"
                className={styles.btnPlayMove}
                onClick={handlePlayZhaoMove}
                disabled={hasPlayedMove && !customMove}
              >
                <span>▶️</span>
                <span>
                  {hasPlayedMove && !customMove
                    ? `Đã đi: ${benchmarkItem.moveNotation}`
                    : `Đi nước Triệu Hâm Hâm (${benchmarkItem.moveNotation})`}
                </span>
              </button>

              <button
                type="button"
                className={styles.btnReset}
                onClick={handleResetBoard}
                title="Khôi phục lại thế cờ ban đầu"
              >
                ↺ Đặt lại thế cờ
              </button>
            </div>

            <div className={styles.boardHint}>
              <span>Lượt đi: </span>
              <strong style={{ color: initialPos.turn === "r" ? "#ef4444" : "#60a5fa" }}>
                {initialPos.turn === "r" ? "Bên Đỏ" : "Bên Đen"}
              </strong>
              <span> • Bạn có thể click quân trên bàn cờ để đi thử nước khác.</span>
            </div>
          </div>

          {/* Cột phải: Đối chiếu 2 bên */}
          <div className={styles.infoCol}>
            {/* Thẻ 1: Triệu Hâm Hâm giảng giải */}
            <div className={styles.masterCard}>
              <div className={styles.sectionHeader}>
                <span className={`${styles.sectionTitle} ${styles.titleRed}`}>
                  <span>🗣️</span>
                  <span>Triệu Hâm Hâm Giảng Giải</span>
                </span>
                <span className={styles.keyMoveBadge}>
                  Nước cờ: {benchmarkItem.moveNotation}
                </span>
              </div>

              <div>
                <strong style={{ fontSize: "14px", color: "var(--accent, #d9a441)" }}>
                  Bài {benchmarkItem.lesson}: {benchmarkItem.title}
                </strong>
                <p className={styles.principleText}>{benchmarkItem.principle}</p>
              </div>

              <blockquote className={styles.masterQuote}>
                &ldquo;{benchmarkItem.description}&rdquo;
              </blockquote>

              {benchmarkItem.video && onOpenVideo && (
                <button
                  type="button"
                  className={styles.btnWatchClip}
                  onClick={() =>
                    onOpenVideo({
                      videoId: benchmarkItem.video,
                      title: `Bài ${benchmarkItem.lesson}: ${benchmarkItem.title}`,
                    })
                  }
                >
                  ▶️ Xem đoạn video bài giảng trên YouTube
                </button>
              )}
            </div>

            {/* Thẻ 2: AI phân tích thực tế */}
            <div className={styles.aiCard}>
              <div className={styles.sectionHeader}>
                <span className={`${styles.sectionTitle} ${styles.titleBlue}`}>
                  <span>🤖</span>
                  <span>AI Ứng Dụng Đánh Giá</span>
                </span>
                {customMove && (
                  <span style={{ fontSize: "12px", color: "#60a5fa", fontWeight: 600 }}>
                    Nước tự thử: {moveNotation(initialPos.board, customMove)}
                  </span>
                )}
              </div>

              {/* Trạng thái so sánh */}
              <div
                className={`${styles.matchVerdict} ${
                  isMatched ? styles.matchSuccess : styles.matchWarning
                }`}
              >
                <span>{isMatched ? "✅" : "💡"}</span>
                <span>
                  {isMatched
                    ? `TRÙNG KHỚP 100% VỚI BÀI GIẢNG TRIỆU HÂM HÂM!`
                    : customMove
                    ? "AI đánh giá nước đi thử nghiệm của bạn"
                    : "AI nhận diện thế trận theo kỳ lý phối hợp"}
                </span>
              </div>

              {/* Huy hiệu kỳ lý nhận diện */}
              <div className={styles.aiTacticBadge}>
                <span>📖</span>
                <span>
                  Kỳ lý nhận diện:{" "}
                  {detectedTacticTitle
                    ? `Bài ${benchmarkItem.lesson} • ${detectedTacticTitle}`
                    : `Bài ${benchmarkItem.lesson}: ${benchmarkItem.title}`}
                </span>
              </div>

              {/* Lời bình luận phân tích */}
              <p className={styles.aiCommentary}>
                {commentary ||
                  (facts.length > 0
                    ? facts[0].summary
                    : "[Triệu Hâm Hâm - Công sát]: Nước đi khai thông lộ tấn công, ép đối phương vào thế bị động phòng ngự.")}
              </p>

              {/* Điểm số từ Engine Pikafish */}
              <div className={styles.engineEvalRow}>
                <span>Đánh giá từ Engine Pikafish:</span>
                <span className={styles.scoreVal}>{formattedScore}</span>
              </div>
            </div>

            {/* Thẻ hành động */}
            <div className={styles.modalActions}>
              <span className={styles.posStatusText}>
                FEN: <code style={{ fontSize: "11px", opacity: 0.8 }}>{benchmarkItem.fen}</code>
              </span>

              <Link
                href={`/play?fen=${encodeURIComponent(benchmarkItem.fen)}&lesson=${benchmarkItem.lesson}`}
                className={styles.btnPracticeHere}
                onClick={onClose}
              >
                <span>⚔️</span>
                <span>Chơi tiếp với máy từ thế này →</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
