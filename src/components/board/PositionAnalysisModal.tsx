"use client";

import { useEffect, useState } from "react";
import type {
  CandidateMoveAnalysis,
  PositionAnalysisResult,
} from "@/lib/xiangqi/position-analysis";
import styles from "./PositionAnalysisModal.module.css";

export interface PositionAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: PositionAnalysisResult | null;
  loading: boolean;
  error?: string | null;
  onSelectCandidate?: (candidate: CandidateMoveAnalysis) => void;
  onSelectThreat?: () => void;
}

export function PositionAnalysisModal({
  isOpen,
  onClose,
  analysis,
  loading,
  error,
  onSelectCandidate,
  onSelectThreat,
}: PositionAnalysisModalProps) {
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setActiveIdx(0);
  }, [analysis]);

  if (!isOpen) return null;

  const handleCopyFen = () => {
    if (!analysis?.fen) return;
    navigator.clipboard.writeText(analysis.fen).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCandidateClick = (candidate: CandidateMoveAnalysis, idx: number) => {
    setActiveIdx(idx);
    onSelectCandidate?.(candidate);
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-modal-title"
    >
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="analysis-modal-title" className={styles.title}>
              <span>🔍 Phân tích hình cờ</span>
            </h2>
            {analysis && (
              <span className={styles.badge}>
                {analysis.turn === "r" ? "Lượt Đỏ" : "Lượt Đen"}
              </span>
            )}
          </div>
          <div className={styles.headerActions}>
            {analysis?.fen && (
              <button
                type="button"
                className={styles.iconBtn}
                title={copied ? "Đã sao chép FEN" : "Sao chép FEN"}
                onClick={handleCopyFen}
                aria-label="Sao chép FEN"
              >
                {copied ? "✓" : "📋"}
              </button>
            )}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onClose}
              title="Đóng"
              aria-label="Đóng bảng phân tích"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className={styles.body}>
          {loading && (
            <div className={styles.loadingBox}>
              <div className={styles.spinner} />
              <p style={{ margin: 0, color: "var(--gold-text)", fontWeight: 600 }}>
                Đang tính toán MultiPV 3, WDL và phân tích 9 yếu tố kỳ lý…
              </p>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                Pikafish engine + Trích xuất đòn dọa &amp; nhận diện hình sát
              </span>
            </div>
          )}

          {!loading && analysis && (
            <>
              {/* Cảnh báo trường hợp biên */}
              {!analysis.layer1.engineAvailable && (
                <div className={styles.alertBanner} role="alert">
                  <span>⚠️</span>
                  <span>
                    <strong>Không có dữ liệu engine:</strong> {analysis.layer1.engineMessage ?? "Chưa cài đặt engine hoặc server quá tải"}. Hệ thống đang hiển thị phân tích kỳ lý tĩnh (Tầng 2, 5, 6).
                  </span>
                </div>
              )}

              {analysis.layer1.isGameOver && (
                <div className={`${styles.alertBanner} ${styles.gameOverBanner}`} role="status">
                  <span>🏁</span>
                  <span>{analysis.layer1.gameOverReason ?? "Ván cờ đã kết thúc"}</span>
                </div>
              )}

              {/* Tầng 1: Thanh lợi thế & WDL thật từ UCI_ShowWDL */}
              {analysis.layer1.wdl && (
                <div className={styles.wdlSection}>
                  <div className={styles.wdlHeader}>
                    <span>Theo engine (máy đấu máy):</span>
                    <strong className={styles.wdlScore}>
                      {analysis.layer1.evalText}
                    </strong>
                  </div>
                  <div className={styles.wdlBar} aria-label="Thanh xác suất Thắng - Hòa - Thua">
                    <div
                      className={styles.wdlWin}
                      style={{ width: `${analysis.layer1.wdl.win}%` }}
                      title={`Thắng: ${analysis.layer1.wdl.win}%`}
                    />
                    <div
                      className={styles.wdlDraw}
                      style={{ width: `${analysis.layer1.wdl.draw}%` }}
                      title={`Hòa: ${analysis.layer1.wdl.draw}%`}
                    />
                    <div
                      className={styles.wdlLoss}
                      style={{ width: `${analysis.layer1.wdl.loss}%` }}
                      title={`Thua: ${analysis.layer1.wdl.loss}%`}
                    />
                  </div>
                  <div className={styles.wdlLegend}>
                    <span>🔴 Thắng: {analysis.layer1.wdl.win}%</span>
                    <span>⚪ Hòa: {analysis.layer1.wdl.draw}%</span>
                    <span>🔵 Thua: {analysis.layer1.wdl.loss}%</span>
                  </div>
                </div>
              )}

              {/* Tầng 2: Đánh giá cục diện theo 9 yếu tố (assess.ts) */}
              <div className={styles.sectionCard}>
                <span className={styles.sectionTitle}>⚖️ Đánh giá cục diện (9 yếu tố)</span>
                <p className={styles.assessOverview}>{analysis.layer2.displayText}</p>

                {analysis.layer2.factors.length > 0 && (
                  <div className={styles.factorGrid}>
                    {analysis.layer2.factors.map((f, i) => (
                      <div key={`factor-${i}`} className={styles.factorItem}>
                        <span className={styles.factorName}>
                          #{i + 1}. {f.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {analysis.layer2.dynamic && analysis.layer2.summary && (
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--gold-text)" }}>
                    💡 {analysis.layer2.summary}
                  </p>
                )}
              </div>

              {/* Tầng 3: Đòn dọa của đối phương (threats.ts) */}
              {analysis.layer3.hasThreat && (
                <div className={`${styles.sectionCard} ${styles.threatCard}`}>
                  <span className={styles.sectionTitle} style={{ color: "#ef4444" }}>
                    ⚠️ {analysis.layer3.inCheck ? "Đang bị chiếu tướng" : "Đòn dọa tiềm ẩn của đối phương"}
                  </span>
                  <p className={styles.threatDesc}>{analysis.layer3.description}</p>
                  {analysis.layer3.threatPvNotations.length > 0 && (
                    <span className={styles.pvPreviewLine}>
                      Biến khai thác: {analysis.layer3.threatPvNotations.join(" → ")}
                    </span>
                  )}
                  {onSelectThreat && analysis.layer3.threatMove && (
                    <button
                      type="button"
                      className={styles.threatActionBtn}
                      onClick={onSelectThreat}
                    >
                      🎯 Đánh dấu đòn dọa trên bàn cờ
                    </button>
                  )}
                </div>
              )}

              {/* Tầng 1 & 4: Top 3 nước mạnh nhất & Ý đồ nước đi (intent.ts, narrate.ts) */}
              {analysis.layer1.candidates.length > 0 && (
                <div className={styles.sectionCard}>
                  <span className={styles.sectionTitle}>🎯 Top 3 nước đi mạnh nhất</span>
                  <div className={styles.candidateList}>
                    {analysis.layer1.candidates.map((c, idx) => (
                      <div
                        key={`cand-${idx}`}
                        className={styles.candidateItem}
                        data-active={activeIdx === idx || undefined}
                        onClick={() => handleCandidateClick(c, idx)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") handleCandidateClick(c, idx);
                        }}
                      >
                        <div className={styles.candidateTop}>
                          <div className={styles.candidateMoveInfo}>
                            <span className={styles.rankBadge}>#{idx + 1}</span>
                            <span className={styles.moveNotation}>{c.notation}</span>
                            <span className={styles.intentTag}>{c.purposeLabel}</span>
                          </div>
                          <span
                            className={styles.candidateScore}
                            data-positive={c.scoreCp > 0 || undefined}
                            data-negative={c.scoreCp < 0 || undefined}
                          >
                            {c.scoreText}
                          </span>
                        </div>

                        {c.narrative && (
                          <span className={styles.candidateNarrative}>
                            {c.narrative}
                          </span>
                        )}

                        {c.pvNotations.length > 0 && (
                          <span className={styles.pvPreviewLine}>
                            Biến PV: {c.pvNotations.slice(0, 6).join(" ")}
                            {c.pvNotations.length > 6 ? " …" : ""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tầng 5: Hình sát (patterns.ts) & Tàn cuộc lý thuyết (endgame.ts) */}
              {(analysis.layer5.patterns.length > 0 || analysis.layer5.endgame !== null) && (
                <div className={styles.sectionCard}>
                  <span className={styles.sectionTitle}>⚔️ Hình sát &amp; Tàn cuộc lý thuyết</span>
                  <div className={styles.badgeRow}>
                    {analysis.layer5.patterns.map((p, pIdx) => (
                      <div key={`pat-${pIdx}`} className={styles.patternBadge}>
                        <strong>🎯 {p.name}</strong>
                        <span>{p.description}</span>
                      </div>
                    ))}
                    {analysis.layer5.endgame && (
                      <div className={styles.endgameBadge}>
                        <strong>
                          📚 {analysis.layer5.endgame.name} ({analysis.layer5.endgame.outcome === "win" ? "Thắng" : "Hòa"} lý thuyết)
                        </strong>
                        <span>{analysis.layer5.endgame.description}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tầng 6: Giai đoạn & Sách khai cuộc (phases.ts, openings.ts) */}
              <div className={styles.sectionCard}>
                <span className={styles.sectionTitle}>📖 Giai đoạn &amp; Khai cuộc</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span className={styles.badge}>
                    Giai đoạn: {analysis.layer6.phaseLabel}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    Quân lớn còn lại: {analysis.layer6.majorsCount} (Xe/Mã/Pháo)
                  </span>
                </div>

                {analysis.layer6.openingGuide && (
                  <div className={styles.openingBox}>
                    <strong style={{ fontSize: "13px", color: "var(--gold-text)" }}>
                      Trận pháp: {analysis.layer6.openingGuide.name}
                    </strong>
                    {analysis.layer6.openingGuide.intent && (
                      <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                        Ý đồ: Đỏ ({analysis.layer6.openingGuide.intent.r}) · Đen ({analysis.layer6.openingGuide.intent.b})
                      </span>
                    )}
                    {analysis.layer6.nextBookMoves.length > 0 && (
                      <div className={styles.nextMoveList}>
                        <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center" }}>
                          Nước tiếp theo theo sách:
                        </span>
                        {analysis.layer6.nextBookMoves.map((nb, nbIdx) => (
                          <span key={`nb-${nbIdx}`} className={styles.nextMoveChip}>
                            {nb.move} ({nb.lineName})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {analysis.layer6.shapes.length > 0 && (
                  <div className={styles.openingBox}>
                    <strong style={{ fontSize: "13px", color: "var(--gold-text)" }}>Thế trận theo kỳ lý</strong>
                    {analysis.layer6.shapes.map((sh) => (
                      <span key={`${sh.side}-${sh.id}`} style={{ fontSize: "12px", color: sh.bad ? "var(--red-text)" : "var(--muted)" }}>
                        {sh.side === "r" ? "Đỏ" : "Đen"} · <b>{sh.name}</b>{sh.bad ? " (hình xấu)" : ""}: {sh.note}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!loading && !analysis && error && (
            <div className={styles.alertBanner} role="alert">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Bấm vào từng nước trong Top 3 để xem mũi tên hướng đi trên bàn cờ.
          </span>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
