"use client";

import { useId, useMemo, useRef, useState, useEffect } from "react";
import type { StageMoveItem, StageState, StageZhaoLesson } from "../stage-sync";
import styles from "./stage.module.css";

export type CommentaryPersona = "zhaoXinxin" | "xuYinchuan" | "default";

export interface MatchCommentaryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  state: StageState;
  selectedPly: number | null;
  onSelectPly: (ply: number | null) => void;
}

interface MovePair {
  round: number;
  red?: StageMoveItem;
  black?: StageMoveItem;
}

/** Chuyển mảng nước đi thành các cặp nước Đỏ - Đen theo từng hiệp thi đấu */
function groupMovePairs(moves: StageMoveItem[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const round = Math.floor(i / 2) + 1;
    pairs.push({
      round,
      red: moves[i],
      black: moves[i + 1],
    });
  }
  return pairs;
}

/** Định dạng toàn bộ danh sách nước đi thành văn bản để sao chép biên bản */
function formatMovesText(moves: StageMoveItem[], openingName?: string): string {
  const lines: string[] = [];
  if (openingName) lines.push(`Khai cuộc: ${openingName}`);
  const pairs = groupMovePairs(moves);
  for (const p of pairs) {
    const redText = p.red ? p.red.notation : "";
    const blackText = p.black ? p.black.notation : "";
    lines.push(`${p.round}. ${redText}${blackText ? `    ${blackText}` : ""}`);
  }
  return lines.join("\n");
}

export function MatchCommentaryDrawer({
  isOpen,
  onClose,
  state,
  selectedPly,
  onSelectPly,
}: MatchCommentaryDrawerProps) {
  const [activeTab, setActiveTab] = useState<"moves" | "commentary">("moves");
  const [persona, setPersona] = useState<CommentaryPersona>("zhaoXinxin");
  const [copied, setCopied] = useState(false);

  const activeMoveRef = useRef<HTMLButtonElement | null>(null);
  const movesContainerRef = useRef<HTMLDivElement | null>(null);

  const moves = state.moves || [];
  const currentPly = selectedPly ?? state.ply;
  const currentMove = useMemo(() => {
    return moves.find((m) => m.ply === currentPly) ?? null;
  }, [moves, currentPly]);

  // Tìm bài học kỳ lý Triệu Hâm Hâm cho nước đang chọn (nếu có)
  const zhaoLesson: StageZhaoLesson | null = useMemo(() => {
    if (currentMove?.zhaoLesson) return currentMove.zhaoLesson;
    if (state.activeCommentary?.zhaoLesson && (!selectedPly || selectedPly === state.ply)) {
      return state.activeCommentary.zhaoLesson;
    }
    // Tìm bài học gần nhất đã kích hoạt trong các nước đi trước đó
    for (let i = (currentMove?.ply ?? moves.length) - 1; i >= 0; i--) {
      if (moves[i]?.zhaoLesson) return moves[i].zhaoLesson ?? null;
    }
    return null;
  }, [currentMove, state.activeCommentary, selectedPly, state.ply, moves]);

  // Cuộn tới nước đang chọn khi mở drawer hoặc đổi nước
  useEffect(() => {
    if (isOpen && activeTab === "moves" && activeMoveRef.current) {
      activeMoveRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isOpen, activeTab, currentPly]);

  if (!isOpen) return null;

  const pairs = groupMovePairs(moves);
  const isViewingHistory = selectedPly !== null && selectedPly !== state.ply;

  const handleCopy = async () => {
    try {
      const text = formatMovesText(moves, state.openingName);
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Bỏ qua nếu trình duyệt chặn clipboard
    }
  };

  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Biên bản trận cờ và Lời bình">
      <div className={styles.drawerSheet} onClick={(e) => e.stopPropagation()}>
        {/* Thanh tiêu đề Drawer */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitleGroup}>
            <div className={styles.drawerMainTitle}>
              <span className={styles.drawerIcon}>📜</span>
              <span>TRẬN CỜ & LỜI BÌNH CHUYÊN GIA</span>
            </div>
            <span className={styles.drawerSubtitle}>
              Ván {state.settings.round} · {state.openingName || "Chưa rõ khai cuộc"} · Nước {Math.ceil(state.ply / 2)}
            </span>
          </div>
          <button
            type="button"
            className={styles.drawerCloseBtn}
            onClick={onClose}
            aria-label="Đóng bảng"
            title="Đóng bảng"
          >
            ✕
          </button>
        </div>

        {/* Thanh chuyển đổi Tab */}
        <div className={styles.drawerTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "moves"}
            className={`${styles.drawerTabBtn} ${activeTab === "moves" ? styles.drawerTabBtnActive : ""}`}
            onClick={() => setActiveTab("moves")}
          >
            📜 Biên Bản Trận Cờ ({moves.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "commentary"}
            className={`${styles.drawerTabBtn} ${activeTab === "commentary" ? styles.drawerTabBtnActive : ""}`}
            onClick={() => setActiveTab("commentary")}
          >
            🎙️ Lời Bình & Kỳ Lý
            {zhaoLesson && <span className={styles.zhaoBadgeDot} title="Có kỳ lý Triệu Hâm Hâm" />}
          </button>
        </div>

        {/* Nội dung Tab 1: Biên Bản Trận Cờ */}
        {activeTab === "moves" && (
          <div className={styles.drawerContentMoves}>
            <div className={styles.moveTableHeader}>
              <span className={styles.colRound}>#</span>
              <span className={styles.colRed}>🔴 ĐỎ (Bạn)</span>
              <span className={styles.colBlack}>⚫ ĐEN (Đối thủ)</span>
            </div>

            <div ref={movesContainerRef} className={styles.moveTableBody}>
              {pairs.length === 0 ? (
                <div className={styles.emptyMovesHint}>Ván cờ mới bắt đầu, chưa có nước đi.</div>
              ) : (
                pairs.map((p) => (
                  <div key={p.round} className={styles.moveTableRow}>
                    <span className={styles.moveRoundNum}>{p.round}.</span>
                    {/* Ô nước Đỏ */}
                    <div className={styles.moveCellContainer}>
                      {p.red ? (
                        <button
                          type="button"
                          ref={p.red.ply === currentPly ? activeMoveRef : undefined}
                          className={`${styles.moveBtn} ${p.red.ply === currentPly ? styles.moveBtnActive : ""}`}
                          onClick={() => onSelectPly(p.red!.ply)}
                          title={`Xem lại nước ${p.red.ply}: ${p.red.notation}`}
                        >
                          <span className={styles.moveNotation}>{p.red.notation}</span>
                          {p.red.zhaoLesson && (
                            <span className={styles.moveLessonIcon} title={`Kỳ lý #${p.red.zhaoLesson.lesson}: ${p.red.zhaoLesson.title}`}>
                              📖
                            </span>
                          )}
                          {p.red.tag === "brilliant" && <span className={styles.tagBrilliant}>!!</span>}
                          {p.red.tag === "good" && <span className={styles.tagGood}>!</span>}
                        </button>
                      ) : (
                        <span className={styles.moveCellEmpty}>—</span>
                      )}
                    </div>

                    {/* Ô nước Đen */}
                    <div className={styles.moveCellContainer}>
                      {p.black ? (
                        <button
                          type="button"
                          ref={p.black.ply === currentPly ? activeMoveRef : undefined}
                          className={`${styles.moveBtn} ${p.black.ply === currentPly ? styles.moveBtnActive : ""}`}
                          onClick={() => onSelectPly(p.black!.ply)}
                          title={`Xem lại nước ${p.black.ply}: ${p.black.notation}`}
                        >
                          <span className={styles.moveNotation}>{p.black.notation}</span>
                          {p.black.zhaoLesson && (
                            <span className={styles.moveLessonIcon} title={`Kỳ lý #${p.black.zhaoLesson.lesson}: ${p.black.zhaoLesson.title}`}>
                              📖
                            </span>
                          )}
                          {p.black.tag === "brilliant" && <span className={styles.tagBrilliant}>!!</span>}
                          {p.black.tag === "good" && <span className={styles.tagGood}>!</span>}
                        </button>
                      ) : (
                        <span className={styles.moveCellEmpty}>—</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Thanh công cụ chân bảng nước đi */}
            <div className={styles.moveTableFooter}>
              {isViewingHistory && (
                <button
                  type="button"
                  className={styles.returnLiveBtn}
                  onClick={() => onSelectPly(null)}
                >
                  <span className={styles.livePulseDot} />
                  <span>Quay về trực tiếp (Nước {state.ply})</span>
                </button>
              )}
              <button
                type="button"
                className={styles.copyMovesBtn}
                onClick={handleCopy}
              >
                {copied ? "✓ Đã chép biên bản" : "📋 Sao chép biên bản"}
              </button>
            </div>
          </div>
        )}

        {/* Nội dung Tab 2: Lời Bình & Kỳ Lý Chuyên Sâu */}
        {activeTab === "commentary" && (
          <div className={styles.drawerContentCommentary}>
            {/* Bộ chọn phong cách bình luận */}
            <div className={styles.personaBar}>
              <span className={styles.personaLabel}>Góc nhìn:</span>
              <div className={styles.personaGroup}>
                <button
                  type="button"
                  className={`${styles.personaPill} ${persona === "zhaoXinxin" ? styles.personaPillActiveZhao : ""}`}
                  onClick={() => setPersona("zhaoXinxin")}
                  title="Triệu Hâm Hâm: Công sát dũng mãnh, phá thành chém tướng, vận dụng 48 kỳ lý"
                >
                  ⚔️ Triệu Hâm Hâm
                </button>
                <button
                  type="button"
                  className={`${styles.personaPill} ${persona === "xuYinchuan" ? styles.personaPillActiveXu : ""}`}
                  onClick={() => setPersona("xuYinchuan")}
                  title="Hứa Ngân Xuyên: Dĩ nhu khắc cương, công thủ toàn diện, tích lũy ưu thế"
                >
                  🛡️ Hứa Ngân Xuyên
                </button>
                <button
                  type="button"
                  className={`${styles.personaPill} ${persona === "default" ? styles.personaPillActive : ""}`}
                  onClick={() => setPersona("default")}
                  title="Bình luận trung tính, khách quan"
                >
                  ⚖️ Chuyên Gia
                </button>
              </div>
            </div>

            {/* Thông tin nước cờ đang xem */}
            <div className={styles.currentMoveBanner}>
              <span className={styles.currentMoveTag}>
                {isViewingHistory ? `ĐANG XEM NƯỚC ${currentPly}` : `NƯỚC MỚI NHẤT ${state.ply}`}
              </span>
              <span className={styles.currentMoveNotation}>
                {currentMove ? `${currentMove.side === "r" ? "🔴 Đỏ" : "⚫ Đen"}: ${currentMove.notation}` : "Ván cờ xuất phát"}
              </span>
              {isViewingHistory && (
                <button
                  type="button"
                  className={styles.miniReturnBtn}
                  onClick={() => onSelectPly(null)}
                >
                  🔴 Về Live
                </button>
              )}
            </div>

            {/* Thẻ Kỳ Lý Triệu Hâm Hâm đặc sắc */}
            {zhaoLesson ? (
              <div className={styles.zhaoLessonCard}>
                <div className={styles.zhaoCardHeader}>
                  <div className={styles.zhaoBadge}>
                    <span>👑 KỲ LÝ TRIỆU HÂM HÂM #{zhaoLesson.lesson}</span>
                  </div>
                  <span className={styles.zhaoKindTag}>
                    {zhaoLesson.kind === "endgame" ? "♟️ Tàn Cuộc" : "⚔️ Trung Cuộc"}
                  </span>
                </div>

                <h4 className={styles.zhaoLessonTitle}>{zhaoLesson.title}</h4>

                {zhaoLesson.quote && (
                  <blockquote className={styles.zhaoQuoteBox}>
                    <span className={styles.quoteMark}>&ldquo;</span>
                    <p className={styles.quoteText}>{zhaoLesson.quote}</p>
                    <span className={styles.quoteAuthor}>— Đặc Cấp Đại Sư Triệu Hâm Hâm</span>
                  </blockquote>
                )}

                {zhaoLesson.videoUrl && (
                  <div className={styles.zhaoVideoRow}>
                    <a
                      href={zhaoLesson.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.zhaoVideoBtn}
                      title="Mở bài giảng Triệu Hâm Hâm trên YouTube"
                    >
                      ▶️ Xem Video Bài Giảng Chi Tiết
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.noLessonCard}>
                <span className={styles.noLessonIcon}>💡</span>
                <span>Nước cờ chuyển hóa thế trận theo quy chuẩn khai trung cuộc.</span>
              </div>
            )}

            {/* Thẻ Nhận định Chiến thuật & Ý đồ */}
            <div className={styles.tacticsCard}>
              <h5 className={styles.sectionHeader}>🎯 Ý ĐỒ CHIẾN LƯỢC & THẾ TRẬN</h5>
              <p className={styles.commentarySummary}>
                {state.activeCommentary?.summary ||
                  (state.commentary ? `${state.commentary.who} vừa đi ${state.commentary.notation}` : "Đang phân tích thế trận...")}
              </p>

              {state.activeCommentary?.intent && (
                <div className={styles.intentBox}>
                  <span className={styles.intentLabel}>Kế sách:</span>
                  <span className={styles.intentText}>{state.activeCommentary.intent}</span>
                </div>
              )}

              {state.activeCommentary?.assessment && (
                <div className={styles.assessmentBox}>
                  <span className={styles.assessmentLabel}>Cục diện:</span>
                  <span className={styles.assessmentText}>{state.activeCommentary.assessment}</span>
                </div>
              )}

              {state.activeCommentary?.betterMove && (
                <div className={styles.betterMoveBox}>
                  <span className={styles.betterMoveLabel}>💡 Nước tối ưu gợi ý:</span>
                  <span className={styles.betterMoveText}>{state.activeCommentary.betterMove}</span>
                </div>
              )}
            </div>

            {/* Tóm tắt quân lực và kết quả hôm nay */}
            <div className={styles.matchMetaFooter}>
              <span className={styles.metaItem}>⚖️ {state.materialBalance.text}</span>
              <span className={styles.metaItem}>🏆 Hôm nay: {state.recap.recordText}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
