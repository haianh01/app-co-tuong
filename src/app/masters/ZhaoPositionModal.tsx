"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { XiangqiBoard, type BoardArrow } from "@/components/board/XiangqiBoard";
import { legalMovesFrom, sideOf, toFen, type Move } from "@/lib/xiangqi/engine";
import { uciToMove } from "@/lib/xiangqi/uci";
import { moveNotation } from "@/lib/xiangqi/notation";
import { reviewMove, type PositionEval } from "@/lib/xiangqi/analysis";
import { explainText } from "@/lib/xiangqi/explain";
import { gameReducer, newGame } from "@/lib/xiangqi/game";
import type { ZhaoMiddlegameFact } from "@/lib/xiangqi/middlegame";
import type { EndgamePrincipleFact } from "@/lib/xiangqi/endgame-principles";
import { useEngine } from "@/hooks/useEngine";
import {
  ZHAO_BENCHMARK_LESSONS,
  ZHAO_BOOK_NAME,
  practiceHref,
  type ZhaoBenchmarkItem,
  type ZhaoBook,
} from "@/lib/xiangqi/zhao-benchmark-data";
import styles from "./ZhaoPositionModal.module.css";

/** Engine JS dự phòng (khi server không có Pikafish): tính sâu hơn mức huấn luyện, không nhiễu. */
const FALLBACK = { depth: 4, timeMs: 1000, noise: 0 } as const;

/** Kỳ lý gắn được số bài: trung cuộc (zhaoMiddlegame) hoặc tàn cuộc (endgamePrinciple). */
type LessonFact = ZhaoMiddlegameFact | EndgamePrincipleFact;
const bookOf = (f: LessonFact): ZhaoBook => (f.kind === "zhaoMiddlegame" ? "middlegame" : "endgame");
const factKey = (f: LessonFact) => (f.kind === "zhaoMiddlegame" ? f.tactic : f.principle);

interface Props {
  isOpen: boolean;
  initialBook?: ZhaoBook;
  initialLesson?: number;
  onClose: () => void;
  onOpenVideo?: (video: { videoId: string; title: string; timecode?: string }) => void;
}

type Verdict = "invalid" | "pending" | "matched" | "other" | "none";

export function ZhaoPositionModal({
  isOpen,
  initialBook = "middlegame",
  initialLesson = 1,
  onClose,
  onOpenVideo,
}: Props) {
  // Vị trí trong danh sách thế (một bài có thể có vài thế từ các ván khác nhau)
  const [currentIndex, setCurrentIndex] = useState<number>(() =>
    Math.max(0, ZHAO_BENCHMARK_LESSONS.findIndex((item) => item.book === initialBook && item.lesson === initialLesson)),
  );
  const [hasPlayedMove, setHasPlayedMove] = useState<boolean>(false);
  const [customMove, setCustomMove] = useState<Move | null>(null);
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  // Điểm engine theo FEN (theo bên đến lượt), giữ qua các lần đổi bài / đi thử
  const [evals, setEvals] = useState<Record<string, PositionEval>>({});
  const think = useEngine();

  const benchmarkItem: ZhaoBenchmarkItem = ZHAO_BENCHMARK_LESSONS[currentIndex];
  // Thứ tự của thế này trong các thế cùng bài, vd. "ví dụ 2/3"
  const sameLesson = ZHAO_BENCHMARK_LESSONS.filter(
    (item) => item.book === benchmarkItem.book && item.lesson === benchmarkItem.lesson,
  );
  const lessonLabel = `Bài ${benchmarkItem.lesson} ${ZHAO_BOOK_NAME[benchmarkItem.book].toLowerCase()}`;
  const exampleNo = sameLesson.indexOf(benchmarkItem) + 1;

  const startState = useMemo(() => newGame(benchmarkItem.fen), [benchmarkItem.fen]);
  const initialPos = startState.history[0];

  const zhaoMove: Move | null = useMemo(() => uciToMove(benchmarkItem.move), [benchmarkItem.move]);

  const zhaoLegal = !!zhaoMove && legalMovesFrom(initialPos, zhaoMove.from).some((m) => m.to === zhaoMove.to);

  // Nước đang xét: nước tự thử hoặc nước của Triệu Hâm Hâm
  const activeMove: Move | null = customMove ?? zhaoMove;

  // Ván một nước (thế bài học → nước đang xét); gameReducer tự ghi kết quả khi chiếu bí / hết nước
  const moveState = useMemo(() => {
    if (!activeMove) return null;
    const s = gameReducer(startState, { type: "move", move: activeMove });
    return s.moves.length === 1 ? s : null;
  }, [startState, activeMove]);

  const currentBoard = hasPlayedMove && moveState ? moveState.history[1].board : initialPos.board;

  const fenBefore = useMemo(() => toFen(initialPos), [initialPos]);
  const fenAfter = useMemo(() => (moveState ? toFen(moveState.history[1]) : null), [moveState]);
  const terminal = !!moveState?.result;

  // Cần chấm: thế trước nước đi và thế sau nước đi (trừ khi nước đi kết thúc ván)
  const pendingFen = !isOpen
    ? null
    : !evals[fenBefore]
    ? fenBefore
    : fenAfter && !terminal && !evals[fenAfter]
    ? fenAfter
    : null;

  useEffect(() => {
    if (!pendingFen) return;
    let cancelled = false;
    think(pendingFen, 3, FALLBACK, "analysis")
      .then((res) => {
        if (!cancelled) setEvals((c) => ({ ...c, [pendingFen]: { score: res.score, best: res.move, pv: res.pvMoves } }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pendingFen, think]);

  // Kỳ lý chỉ được gắn khi biến engine xác nhận — cùng đường với màn phân tích ván (reviewMove)
  const { verdict, zhaoFacts, commentary, scoreAfter } = useMemo(() => {
    const beforeEval = evals[fenBefore] ?? null;
    const afterEval = fenAfter ? evals[fenAfter] ?? null : null;
    if (!moveState) {
      return { verdict: "invalid" as Verdict, zhaoFacts: [] as LessonFact[], commentary: "", scoreAfter: null };
    }
    if (!beforeEval || (!afterEval && !terminal)) {
      return { verdict: "pending" as Verdict, zhaoFacts: [] as LessonFact[], commentary: "", scoreAfter: null };
    }
    const { review } = reviewMove(moveState.moves[0], 0, moveState, beforeEval, afterEval, undefined, [], []);
    const facts = review.facts.filter(
      (f): f is LessonFact => (f.kind === "zhaoMiddlegame" || f.kind === "endgamePrinciple") && !!f.lesson,
    );
    const matched = facts.some(
      (f) => bookOf(f) === benchmarkItem.book && (f.lesson === benchmarkItem.lesson || factKey(f) === benchmarkItem.tacticId),
    );
    return {
      verdict: (matched ? "matched" : facts.length > 0 ? "other" : "none") as Verdict,
      zhaoFacts: facts,
      commentary: facts.length > 0 ? explainText(facts, initialPos.turn, 1, "zhaoXinxin") : "",
      // Điểm sau nước đi theo bên vừa đi
      scoreAfter: afterEval ? -afterEval.score : null,
    };
  }, [evals, fenBefore, fenAfter, moveState, terminal, benchmarkItem, initialPos.turn]);

  const scoreBefore = evals[fenBefore]?.score ?? null;

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

  // Chuyển thế cờ
  const goTo = (i: number) => {
    if (i < 0 || i >= ZHAO_BENCHMARK_LESSONS.length) return;
    setCurrentIndex(i);
    handleResetBoard();
  };

  const fmtScore = (v: number) => {
    const label = Math.abs(v) > 300 ? "ưu thế lớn" : Math.abs(v) > 100 ? "ưu thế nhẹ" : "cân bằng";
    return `${v > 0 ? "+" : ""}${v} (${label})`;
  };
  const scoreText = !moveState
    ? "—"
    : terminal
    ? moveState?.result?.reason === "checkmate"
      ? "Chiếu bí — kết thúc ván"
      : "Kết thúc ván"
    : scoreAfter !== null
    ? fmtScore(scoreAfter)
    : "Đang tính…";

  // Bài tàn cuộc loại "đánh giá" chỉ ghi chú khi ván bước vào loại tàn cuộc đó, không khen chê nước đi
  const matchedNote = zhaoFacts.some(
    (f) => f.kind === "endgamePrinciple" && f.tone === "note" && f.lesson === benchmarkItem.lesson && benchmarkItem.book === "endgame",
  );
  const verdictText =
    verdict === "invalid"
      ? `Nước ${benchmarkItem.moveNotation} không hợp lệ trong thế cờ này — dữ liệu cần sửa`
      : verdict === "pending"
      ? "Đang chờ engine chấm thế cờ…"
      : verdict === "matched"
      ? matchedNote
        ? `AI ghi chú: nước này đưa ván vào loại tàn cuộc của ${lessonLabel}`
        : `Engine xác nhận kỳ lý của ${lessonLabel}`
      : verdict === "other"
      ? `AI gắn kỳ lý khác, không phải ${lessonLabel}`
      : "AI không gắn kỳ lý nào cho nước này (biến engine không xác nhận)";

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.modalBadge}>🧪 ĐỐI CHIẾU AI &amp; TRIỆU HÂM HÂM</span>
            <select
              className={styles.lessonSelect}
              value={currentIndex}
              onChange={(e) => goTo(Number(e.target.value))}
              aria-label="Chọn thế cờ đối chiếu"
            >
              {(["middlegame", "endgame"] as const).map((book) => (
                <optgroup key={book} label={ZHAO_BOOK_NAME[book]}>
                  {ZHAO_BENCHMARK_LESSONS.map((item, i) =>
                    item.book === book ? (
                      <option key={`${item.book}-${item.lesson}-${item.game.id}-${item.game.ply}`} value={i}>
                        Bài {item.lesson}: {item.title} ({item.moveNotation})
                      </option>
                    ) : null,
                  )}
                </optgroup>
              ))}
            </select>
          </div>

          <div className={styles.headerNav}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => goTo(currentIndex - 1)}
              disabled={currentIndex <= 0}
              title="Thế trước"
            >
              ◀ Trước
            </button>
            <span style={{ fontSize: "12px", color: "var(--muted)", minWidth: "48px", textAlign: "center" }}>
              {currentIndex + 1} / {ZHAO_BENCHMARK_LESSONS.length}
            </span>
            <button
              type="button"
              className={styles.navBtn}
              onClick={() => goTo(currentIndex + 1)}
              disabled={currentIndex >= ZHAO_BENCHMARK_LESSONS.length - 1}
              title="Thế tiếp theo"
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
                disabled={!zhaoLegal || (hasPlayedMove && !customMove)}
              >
                <span>▶️</span>
                <span>
                  {hasPlayedMove && !customMove
                    ? `Đã đi: ${benchmarkItem.moveNotation}`
                    : `Đi nước trong ván (${benchmarkItem.moveNotation})`}
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
                  Nước trong ván: {benchmarkItem.moveNotation}
                </span>
              </div>

              <div>
                <strong style={{ fontSize: "14px", color: "var(--accent, #d9a441)" }}>
                  {ZHAO_BOOK_NAME[benchmarkItem.book]} · Bài {benchmarkItem.lesson}: {benchmarkItem.title}
                </strong>
                <p className={styles.principleText}>{benchmarkItem.principle}</p>
              </div>

              {benchmarkItem.quote && (
                <blockquote className={styles.masterQuote}>
                  &ldquo;{benchmarkItem.quote.text}&rdquo; <small>[{benchmarkItem.quote.at}]</small>
                </blockquote>
              )}

              <p className={styles.sourceNote}>
                Thế cờ trong ván {benchmarkItem.game.red} – {benchmarkItem.game.black}
                {benchmarkItem.game.tournament ? `, ${benchmarkItem.game.tournament}` : ""}, nửa nước{" "}
                {benchmarkItem.game.ply}
                {sameLesson.length > 1 ? ` (ví dụ ${exampleNo}/${sameLesson.length} của bài)` : ""}. Thế này không có
                trong video; video chỉ để nghe lời giảng về kỳ lý.
              </p>

              {benchmarkItem.video && onOpenVideo && (
                <button
                  type="button"
                  className={styles.btnWatchClip}
                  onClick={() =>
                    onOpenVideo({
                      videoId: benchmarkItem.video,
                      title: `${ZHAO_BOOK_NAME[benchmarkItem.book]} · Bài ${benchmarkItem.lesson}: ${benchmarkItem.title}`,
                      timecode: benchmarkItem.quote?.at,
                    })
                  }
                >
                  ▶️ Xem video bài giảng{benchmarkItem.quote ? ` (từ ${benchmarkItem.quote.at})` : ""}
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
                  verdict === "matched" ? styles.matchSuccess : styles.matchWarning
                }`}
              >
                <span>{verdict === "matched" ? "✅" : verdict === "pending" ? "⏳" : "💡"}</span>
                <span>{verdictText}</span>
              </div>

              {/* Huy hiệu kỳ lý nhận diện */}
              {zhaoFacts.map((f) => (
                <div key={factKey(f)} className={styles.aiTacticBadge}>
                  <span>📖</span>
                  <span>
                    Kỳ lý nhận diện: {ZHAO_BOOK_NAME[bookOf(f)]} · Bài {f.lesson} • {f.lessonTitle ?? factKey(f)}
                  </span>
                </div>
              ))}

              {/* Lời bình luận phân tích */}
              {commentary && <p className={styles.aiCommentary}>{commentary}</p>}

              {/* Điểm số từ Engine Pikafish */}
              <div className={styles.engineEvalRow}>
                <span title="Pikafish trên server; nếu server không có engine thì dùng AI JavaScript trong trình duyệt">
                  Điểm engine (theo bên đi):
                </span>
                <span className={styles.scoreVal}>
                  {scoreBefore !== null ? `${fmtScore(scoreBefore)} → ` : ""}
                  {scoreText}
                </span>
              </div>
            </div>

            {/* Thẻ hành động */}
            <div className={styles.modalActions}>
              <span className={styles.posStatusText}>
                FEN: <code style={{ fontSize: "11px", opacity: 0.8 }}>{benchmarkItem.fen}</code>
              </span>

              <Link
                href={practiceHref(benchmarkItem)}
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
