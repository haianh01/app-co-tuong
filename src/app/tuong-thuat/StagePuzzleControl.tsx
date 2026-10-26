"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyMove, parseFen } from "@/lib/xiangqi/engine";
import { moveNotation } from "@/lib/xiangqi/notation";
import { PUZZLES, findPuzzle, type Puzzle } from "@/lib/xiangqi/puzzles";
import styles from "./broadcast.module.css";
import { buildPuzzleStage, puzzleSolutionLine, type StagePuzzlePhase, type StagePuzzleState } from "./stage-puzzle";

export interface StagePuzzleControlProps {
  currentPuzzle: StagePuzzleState | null;
  onUpdatePuzzle: (puzzle: StagePuzzleState | null) => void;
  canOperate: boolean;
  /** Khóa vào một thế (trang Cờ thế: thế người dẫn đang xem), ẩn bộ lọc và ô chọn thế. */
  fixedPuzzleId?: string;
}

export function StagePuzzleControl({
  currentPuzzle,
  onUpdatePuzzle,
  canOperate,
  fixedPuzzleId,
}: StagePuzzleControlProps) {
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<string>(
    currentPuzzle?.puzzleId ?? PUZZLES[0].id,
  );
  const [countdownSec, setCountdownSec] = useState<number>(60);
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [customCaptions, setCustomCaptions] = useState<Record<string, string>>({});
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  // Danh sách các chương
  const chapters = useMemo(() => {
    return Array.from(new Set(PUZZLES.map((p) => p.chapter)));
  }, []);

  // Lọc thế cờ
  const filteredPuzzles = useMemo(() => {
    return PUZZLES.filter((p) => {
      if (filterChapter !== "all" && p.chapter !== filterChapter) return false;
      if (searchQuery.trim() && !p.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [filterChapter, searchQuery]);

  // Thế cờ đang chọn. Thế đã chọn bị bộ lọc ẩn đi thì lấy thế đầu danh sách: luôn khớp với ô chọn đang hiện,
  // tránh gửi lên sân khấu một thế người dẫn không nhìn thấy.
  const selectedPuzzle: Puzzle | null = useMemo(() => {
    if (fixedPuzzleId) return findPuzzle(fixedPuzzleId) ?? null;
    const visible = filteredPuzzles.find((p) => p.id === selectedPuzzleId) ?? filteredPuzzles[0];
    return visible ? (findPuzzle(visible.id) ?? null) : null;
  }, [filteredPuzzles, selectedPuzzleId, fixedPuzzleId]);

  const captionInput = selectedPuzzle ? (customCaptions[selectedPuzzle.id] ?? (selectedPuzzle.hint || "")) : "";
  const caption = captionInput.trim() || null;

  // Biến lời giải đầy đủ (chỉ người dẫn thấy)
  const fullLine = useMemo(() => {
    return selectedPuzzle ? puzzleSolutionLine(selectedPuzzle) : [];
  }, [selectedPuzzle]);

  const solutionNotations = useMemo(() => {
    if (!selectedPuzzle) return [];
    let pos = parseFen(selectedPuzzle.fen);
    const notes: string[] = [];
    for (const m of fullLine) {
      notes.push(moveNotation(pos.board, m));
      pos = applyMove(pos, m);
    }
    return notes;
  }, [selectedPuzzle, fullLine]);

  // Kiểm tra xem thế cờ trên sân khấu có phải thế đang chọn không
  const isCurrentOnStage = !!selectedPuzzle && currentPuzzle?.puzzleId === selectedPuzzle.id;
  const currentPly = isCurrentOnStage ? currentPuzzle.revealPly : 0;
  const currentPhase = isCurrentOnStage ? currentPuzzle.phase : null;

  // Dựng trạng thái của thế đang chọn với biến lời giải đã tính sẵn (không tìm lại nước sát mỗi lần bấm).
  const stageOf = useCallback(
    (phase: StagePuzzlePhase, ply: number, opts?: { caption?: string | null; countdown?: { startedAt: number; durationMs: number } }) =>
      selectedPuzzle ? buildPuzzleStage(selectedPuzzle, phase, ply, { ...opts, line: fullLine }) : null,
    [selectedPuzzle, fullLine],
  );

  // Gửi trạng thái nửa nước thứ `ply` của đáp án (0 = về thế đầu).
  const revealTo = useCallback(
    (ply: number) => {
      const phase: StagePuzzlePhase = ply === 0 ? "intro" : ply >= fullLine.length ? "solved" : "reveal";
      const next = stageOf(phase, ply, { caption: ply === 0 ? null : caption });
      if (next) onUpdatePuzzle(next);
    },
    [caption, fullLine.length, onUpdatePuzzle, stageOf],
  );

  const sendPhase = (phase: StagePuzzlePhase, opts?: Parameters<typeof stageOf>[2]) => {
    if (!canOperate) return;
    setIsAutoPlaying(false);
    const next = stageOf(phase, 0, opts);
    if (next) onUpdatePuzzle(next);
  };

  // Lên sân khấu (Intro), đếm ngược (Thinking), gợi ý (Hint)
  const handleIntro = () => sendPhase("intro");
  const handleThinking = () => sendPhase("thinking", { countdown: { startedAt: Date.now(), durationMs: countdownSec * 1000 } });
  const handleHint = () => sendPhase("hint");

  // Lật nước tiếp theo / lùi một nước
  const handleNextPly = () => {
    if (canOperate) revealTo(currentPly + 1);
  };
  const handlePrevPly = () => {
    if (canOperate) revealTo(Math.max(0, currentPly - 1));
  };

  // Tự lật hết. Trang cha render lại liên tục (gói tin bàn cờ, đồng hồ) và người dẫn có thể gõ lời kể trong lúc chạy,
  // nên hẹn giờ chỉ phụ thuộc vào nửa nước đang hiện; hàm gửi đọc qua ref để không bị hủy và đặt lại mãi.
  const revealToRef = useRef(revealTo);
  useEffect(() => {
    revealToRef.current = revealTo;
  }, [revealTo]);
  const autoPlaying = isAutoPlaying && canOperate && isCurrentOnStage;
  useEffect(() => {
    if (!autoPlaying || currentPly >= fullLine.length) return;
    const t = setTimeout(() => {
      revealToRef.current(currentPly + 1);
      if (currentPly + 1 >= fullLine.length) setIsAutoPlaying(false);
    }, 2500);
    return () => clearTimeout(t);
  }, [autoPlaying, currentPly, fullLine.length]);

  const toggleAutoPlay = () => {
    if (!canOperate) return;
    if (isAutoPlaying) {
      setIsAutoPlaying(false);
      return;
    }
    // Đã giải xong thì chạy lại từ nước 1.
    revealTo(currentPly >= fullLine.length ? 1 : currentPly + 1);
    setIsAutoPlaying(true);
  };

  // Tắt chiếu cờ thế
  const handleClose = useCallback(() => {
    setIsAutoPlaying(false);
    onUpdatePuzzle(null);
  }, [onUpdatePuzzle]);

  return (
    <div className={styles.stagePuzzleBox}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>
          🧩 Chiếu cờ thế lên sân khấu OBS
        </h3>
        {currentPuzzle && (
          <button
            type="button"
            className={styles.btn}
            style={{ fontSize: 12, padding: "2px 8px", color: "#f87171", borderColor: "#f87171" }}
            onClick={handleClose}
          >
            ✕ Tắt chiếu
          </button>
        )}
      </div>

      {!canOperate && (
        <div style={{ padding: 8, background: "rgba(239, 68, 68, 0.15)", borderRadius: 6, color: "#fca5a5", fontSize: 12 }}>
          ⚠️ Ván đấu đang diễn ra. Chế độ cờ thế tạm thời bị khóa theo quy tắc chống gian lận (Anti-cheat).
        </div>
      )}

      {/* Bộ lọc và chọn thế */}
      {!fixedPuzzleId && (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={filterChapter}
            onChange={(e) => setFilterChapter(e.target.value)}
            className={styles.btn}
            style={{ fontSize: 12 }}
          >
            <option value="all">Tất cả chương ({PUZZLES.length} thế)</option>
            {chapters.map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Tìm theo tên thế cờ…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.btn}
            style={{ fontSize: 12, flex: 1, minWidth: 140 }}
          />
        </div>

        <select
          value={selectedPuzzle?.id ?? ""}
          onChange={(e) => {
            setSelectedPuzzleId(e.target.value);
            setIsAutoPlaying(false);
          }}
          className={styles.btn}
          style={{ width: "100%", fontSize: 13, fontWeight: 600 }}
        >
          {filteredPuzzles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.vip ? "⭐ [VIP] " : ""}
              {p.title} · {p.chapter} ({p.depth} nước)
            </option>
          ))}
        </select>
      </div>
      )}

      {!selectedPuzzle ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Không có thế cờ nào khớp bộ lọc.</div>
      ) : (
      <>
      {/* Thông tin tóm tắt thế cờ */}
      <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", flexDirection: "column", gap: 3 }}>
        <div>
          <strong>Mục tiêu:</strong> {selectedPuzzle.goal}
        </div>
        {selectedPuzzle.source && (
          <div>
            <strong>Nguồn:</strong> {selectedPuzzle.source}
          </div>
        )}
      </div>

      {/* Ô xem trước riêng cho người dẫn (toàn bộ lời giải - chỉ người dẫn thấy) */}
      <div className={styles.puzzleSecretBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontWeight: 700, color: "#fbbf24", fontSize: 12 }}>
            🔒 Toàn bộ lời giải (Chỉ bạn thấy · KHÔNG gửi lên sân khấu)
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{fullLine.length} nửa nước</span>
        </div>
        <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.5, fontFamily: "monospace" }}>
          {solutionNotations.map((note, idx) => (
            <span
              key={idx}
              style={{
                marginRight: 8,
                padding: "1px 4px",
                borderRadius: 4,
                background: isCurrentOnStage && idx < currentPly ? "rgba(34, 197, 94, 0.25)" : "transparent",
                color: isCurrentOnStage && idx < currentPly ? "#4ade80" : "inherit",
                fontWeight: isCurrentOnStage && idx < currentPly ? 700 : 400,
              }}
            >
              {idx % 2 === 0 ? `${Math.floor(idx / 2) + 1}. ` : ""}
              {note}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          {isCurrentOnStage
            ? `Sân khấu đang hiện: ${currentPly}/${fullLine.length} nửa nước (Phase: ${currentPhase})`
            : "Chưa đưa lên sân khấu."}
        </div>
      </div>

      {/* Ô chỉnh sửa lời kể (caption) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>Lời kể / bình luận nước đi:</label>
        <input
          type="text"
          value={captionInput}
          onChange={(e) => setCustomCaptions((prev) => ({ ...prev, [selectedPuzzle.id]: e.target.value }))}
          placeholder="Nhập lời kể (ví dụ: Xe thí quân mở đường cho Mã)…"
          className={styles.btn}
          style={{ fontSize: 12 }}
        />
      </div>

      {/* Các nút bấm điều khiển tiết mục */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.btnGold}
            onClick={handleIntro}
            disabled={!canOperate}
            title="Đưa thế cờ lên sân khấu (Giai đoạn giới thiệu thế)"
          >
            🎪 Lên sân khấu
          </button>

          <button
            type="button"
            className={styles.btn}
            onClick={handleThinking}
            disabled={!canOperate || !isCurrentOnStage}
            title="Bật đếm ngược để khán giả suy nghĩ và bình luận đáp án trên chat"
          >
            ⏱️ Đếm ngược ({countdownSec}s)
          </button>

          <select
            value={countdownSec}
            onChange={(e) => setCountdownSec(Number(e.target.value))}
            className={styles.btn}
            style={{ fontSize: 12 }}
          >
            <option value={30}>30s</option>
            <option value={60}>60s</option>
            <option value={90}>90s</option>
          </select>

          <button
            type="button"
            className={styles.btn}
            onClick={handleHint}
            disabled={!canOperate || !isCurrentOnStage}
            title="Chiếu gợi ý quân đi đầu tiên lên sân khấu"
          >
            💡 Gợi ý
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.btn}
            onClick={handlePrevPly}
            disabled={!canOperate || !isCurrentOnStage || currentPly === 0}
            title="Lùi một nửa nước"
          >
            ◀ Lùi 1 nước
          </button>

          <button
            type="button"
            className={styles.btnGold}
            onClick={handleNextPly}
            disabled={!canOperate || !isCurrentOnStage || currentPly >= fullLine.length}
            title="Lật nước tiếp theo lên sân khấu"
          >
            ▶ Lật nước tiếp ({currentPly}/{fullLine.length})
          </button>

          <button
            type="button"
            className={styles.btn}
            onClick={toggleAutoPlay}
            disabled={!canOperate || !isCurrentOnStage}
            title="Tự động lật các nước lời giải theo nhịp ~2,5s"
          >
            {isAutoPlaying ? "⏸️ Dừng tự lật" : "⚡ Tự lật hết"}
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
