"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ZHAO_LESSONS, type ZhaoLessonCard } from "@/lib/xiangqi/zhao48-lessons";
import { ZHAO_ENDGAME_LESSONS, type ZhaoEndgameLessonCard } from "@/lib/xiangqi/zhao48-endgame-lessons";
import styles from "./masters.module.css";

type TabType = "middlegame" | "endgame";
type KindFilter = "all" | "detectable" | "evaluative" | "summary";

interface UnifiedLesson {
  id: string;
  category: "middlegame" | "endgame";
  lesson: number;
  title: string;
  principle: string;
  signals: string[];
  quotes: { text: string; at: string }[];
  kind: "detectable" | "evaluative" | "summary";
  video: string;
  tacticId?: string;
}

export function ZhaoLessonsSection() {
  const [tab, setTab] = useState<TabType>("middlegame");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [activeVideo, setActiveVideo] = useState<{ videoId: string; title: string; timecode?: string } | null>(null);

  // Gộp danh sách bài học
  const allMiddlegame: UnifiedLesson[] = useMemo(() => {
    return Object.values(ZHAO_LESSONS).map((c: ZhaoLessonCard) => ({
      id: `mg_${c.lesson}`,
      category: "middlegame",
      lesson: c.lesson,
      title: c.title,
      principle: c.principle,
      signals: c.signals,
      quotes: c.quotes,
      kind: c.kind,
      video: c.video,
      tacticId: c.tacticId,
    }));
  }, []);

  const allEndgame: UnifiedLesson[] = useMemo(() => {
    return Object.values(ZHAO_ENDGAME_LESSONS).map((c: ZhaoEndgameLessonCard) => ({
      id: `eg_${c.lesson}`,
      category: "endgame",
      lesson: c.lesson,
      title: c.title,
      principle: c.principle,
      signals: c.signals,
      quotes: c.quotes,
      kind: c.kind,
      video: c.video,
      tacticId: c.tacticId,
    }));
  }, []);

  const currentList = tab === "middlegame" ? allMiddlegame : allEndgame;

  const filtered = useMemo(() => {
    return currentList.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchPrinciple = item.principle.toLowerCase().includes(q);
        const matchSignals = item.signals.some((s) => s.toLowerCase().includes(q));
        const matchQuotes = item.quotes.some((quote) => quote.text.toLowerCase().includes(q));
        const matchNumber = String(item.lesson) === q || `bài ${item.lesson}`.includes(q);
        if (!matchTitle && !matchPrinciple && !matchSignals && !matchQuotes && !matchNumber) {
          return false;
        }
      }
      return true;
    });
  }, [currentList, kindFilter, search]);

  /** Chuyển đổi "MM:SS" sang số giây cho iframe YouTube */
  const parseSeconds = (at?: string): number => {
    if (!at) return 0;
    const parts = at.split(":").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  return (
    <div className={styles.zhaoContainer}>
      {/* Banner giới thiệu Triệu Hâm Hâm */}
      <div className={styles.zhaoBanner}>
        <div className={styles.zhaoBadge}>ĐẶC CẤP ĐẠI SƯ • TRIỆU HÂM HÂM</div>
        <h2 className={styles.zhaoHeroTitle}>
          Tượng Kỳ Kỳ Lý – Tuyển Tập 96 Bài Giảng Đỉnh Cao
        </h2>
        <p className={styles.zhaoHeroDesc}>
          Toàn bộ tinh hoa chiến thuật trung cuộc và tàn cuộc do Đặc cấp Đại sư{" "}
          <strong>Triệu Hâm Hâm (&quot;Lục Mạch Thần Kiếm&quot;)</strong> đúc kết trong bộ tác phẩm danh chấn
          kỳ đàn <em>&quot;Tượng kỳ kỳ lý tam bộ khúc&quot;</em>. Mọi nguyên lý đều kèm lời giảng nguyên văn,
          dấu hiệu nhận diện hình cờ và video phân tích chi tiết.
        </p>

        {/* Thống kê nhanh */}
        <div className={styles.zhaoStatsRow}>
          <div className={styles.zhaoStatBox}>
            <span className={styles.zhaoStatNum}>48</span>
            <span className={styles.zhaoStatText}>Kỳ lý Trung Cuộc</span>
          </div>
          <div className={styles.zhaoStatBox}>
            <span className={styles.zhaoStatNum}>48</span>
            <span className={styles.zhaoStatText}>Nguyên lý Tàn Cuộc</span>
          </div>
          <div className={styles.zhaoStatBox}>
            <span className={styles.zhaoStatNum}>100%</span>
            <span className={styles.zhaoStatText}>Phụ đề & Video chính chủ</span>
          </div>
          <div className={styles.zhaoStatBox}>
            <span className={styles.zhaoStatNum}>AI Engine</span>
            <span className={styles.zhaoStatText}>Tích hợp tự động nhận diện</span>
          </div>
        </div>
      </div>

      {/* Switcher Trung Cuộc / Tàn Cuộc */}
      <div className={styles.zhaoTabsRow}>
        <button
          type="button"
          className={`${styles.zhaoTabBtn} ${tab === "middlegame" ? styles.zhaoTabActive : ""}`}
          onClick={() => setTab("middlegame")}
        >
          ⚔️ Kỳ Lý Trung Cuộc (48 Bài)
        </button>
        <button
          type="button"
          className={`${styles.zhaoTabBtn} ${tab === "endgame" ? styles.zhaoTabActive : ""}`}
          onClick={() => setTab("endgame")}
        >
          🛡️ Nguyên Lý Tàn Cuộc (48 Bài)
        </button>
      </div>

      {/* Thanh tìm kiếm & lọc loại bài */}
      <div className={styles.zhaoFilterBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={`Tìm theo bài số, tên đòn (${tab === "middlegame" ? "Khuyết Sĩ, Không tâm pháo, Song Xe..." : "Tàn cuộc, Xe Tốt, Pháo Mã..."})`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className={styles.kindFilterGroup}>
          <button
            type="button"
            className={`${styles.kindFilterBtn} ${kindFilter === "all" ? styles.kindFilterActive : ""}`}
            onClick={() => setKindFilter("all")}
          >
            Tất cả ({currentList.length})
          </button>
          <button
            type="button"
            className={`${styles.kindFilterBtn} ${kindFilter === "detectable" ? styles.kindFilterActive : ""}`}
            onClick={() => setKindFilter("detectable")}
            title="Đòn thế AI nhận diện trực tiếp trên nước đi"
          >
            ⚡ Nhận diện thực chiến
          </button>
          <button
            type="button"
            className={`${styles.kindFilterBtn} ${kindFilter === "evaluative" ? styles.kindFilterActive : ""}`}
            onClick={() => setKindFilter("evaluative")}
            title="Nguyên lý đánh giá xu thế hình cờ"
          >
            🎯 Đánh giá hình thế
          </button>
          <button
            type="button"
            className={`${styles.kindFilterBtn} ${kindFilter === "summary" ? styles.kindFilterActive : ""}`}
            onClick={() => setKindFilter("summary")}
            title="Kỳ lý đúc kết kinh nghiệm & triết lý"
          >
            📜 Tổng kết kinh nghiệm
          </button>
        </div>
      </div>

      {/* Danh sách thẻ bài giảng */}
      <div className={styles.zhaoCardsGrid}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            Không tìm thấy bài giảng nào phù hợp với từ khóa &quot;{search}&quot;.
          </div>
        ) : (
          filtered.map((item) => {
            const kindBadge =
              item.kind === "detectable"
                ? { label: "⚡ Thực chiến", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" }
                : item.kind === "evaluative"
                ? { label: "🎯 Đánh giá", color: "#38bdf8", bg: "rgba(56, 189, 248, 0.15)" }
                : { label: "📜 Tổng kết", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" };

            const firstQuote = item.quotes[0];

            return (
              <div key={item.id} className={styles.zhaoCard}>
                <div className={styles.zhaoCardHeader}>
                  <div className={styles.zhaoLessonNumber}>Bài {item.lesson}</div>
                  <span
                    className={styles.zhaoKindPill}
                    style={{ color: kindBadge.color, backgroundColor: kindBadge.bg }}
                  >
                    {kindBadge.label}
                  </span>
                </div>

                <h3 className={styles.zhaoCardTitle}>{item.title}</h3>

                {/* Khung nguyên lý vàng */}
                <div className={styles.principleBox}>
                  <div className={styles.principleHeader}>
                    <span className={styles.principleIcon}>💡</span>
                    <strong>Nguyên lý cốt lõi:</strong>
                  </div>
                  <p className={styles.principleText}>{item.principle}</p>
                </div>

                {/* Dấu hiệu nhận diện hình cờ */}
                {item.signals && item.signals.length > 0 && (
                  <div className={styles.signalsBox}>
                    <div className={styles.signalsTitle}>🔍 Dấu hiệu nhận biết:</div>
                    <ul className={styles.signalsList}>
                      {item.signals.map((sig, idx) => (
                        <li key={idx} className={styles.signalItem}>
                          <span className={styles.signalBullet}>✓</span>
                          <span>{sig}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Trích dẫn nguyên văn Triệu Hâm Hâm */}
                {firstQuote && (
                  <div className={styles.quoteBox}>
                    <div className={styles.quoteHeader}>
                      <span>🗣️ Triệu Hâm Hâm giảng giải:</span>
                      {firstQuote.at && (
                        <span className={styles.quoteTimecode}>⏱️ [{firstQuote.at}]</span>
                      )}
                    </div>
                    <blockquote className={styles.quoteText}>
                      &ldquo;{firstQuote.text}&rdquo;
                    </blockquote>
                  </div>
                )}

                {/* Các nút hành động: Xem video & Luyện tập */}
                <div className={styles.zhaoCardActions}>
                  {item.video && (
                    <button
                      type="button"
                      className={styles.btnWatchVideo}
                      onClick={() =>
                        setActiveVideo({
                          videoId: item.video,
                          title: `Bài ${item.lesson}: ${item.title}`,
                          timecode: firstQuote?.at,
                        })
                      }
                    >
                      ▶️ Xem Video Bài Giảng
                    </button>
                  )}

                  <Link href="/play" className={styles.btnPractice}>
                    Luyện tập cờ →
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Video YouTube */}
      {activeVideo && (
        <div className={styles.videoModalBackdrop} onClick={() => setActiveVideo(null)}>
          <div className={styles.videoModalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.videoModalHeader}>
              <h4 className={styles.videoModalTitle}>
                📺 {activeVideo.title} {activeVideo.timecode ? `• [${activeVideo.timecode}]` : ""}
              </h4>
              <button
                type="button"
                className={styles.videoModalClose}
                onClick={() => setActiveVideo(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.videoIframeWrapper}>
              <iframe
                src={`https://www.youtube.com/embed/${activeVideo.videoId}?autoplay=1&start=${parseSeconds(
                  activeVideo.timecode
                )}`}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className={styles.videoIframe}
              />
            </div>

            <div className={styles.videoModalFooter}>
              <a
                href={`https://www.youtube.com/watch?v=${activeVideo.videoId}&t=${parseSeconds(
                  activeVideo.timecode
                )}s`}
                target="_blank"
                rel="noreferrer"
                className={styles.ytDirectLink}
              >
                Mở trực tiếp trên YouTube ↗
              </a>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setActiveVideo(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
