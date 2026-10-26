"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MasterGameRecord } from "@/lib/xiangqi/master-games.generated";
import {
  translatePlayer,
  translateEccoName,
  getMasterDisplayName,
  type TranslatedPlayer,
} from "@/lib/xiangqi/master-translator";
import { ZhaoLessonsSection } from "./ZhaoLessonsSection";
import styles from "./masters.module.css";

export type MasterGameSummary = Omit<MasterGameRecord, "movesVN" | "movesCN">;

interface Props {
  games: MasterGameSummary[];
}

type MainViewMode = "zhao" | "games";

interface EnrichedGame extends MasterGameSummary {
  redTrans: TranslatedPlayer;
  blackTrans: TranslatedPlayer;
  eccoVN: string;
}

export function MastersListClient({ games }: Props) {
  // Mặc định mở tab Triệu Hâm Hâm (96 Kỳ Lý) - người dùng có thể chuyển sang Kho ván cờ bất cứ lúc nào
  const [viewMode, setViewMode] = useState<MainViewMode>("zhao");
  const [search, setSearch] = useState("");
  const [selectedMaster, setSelectedMaster] = useState<string>("all");
  const [selectedEcco, setSelectedEcco] = useState<string>("all");

  // Dịch và làm giàu dữ liệu ván đấu sang tiếng Việt
  const enrichedGames: EnrichedGame[] = useMemo(() => {
    return games.map((g) => ({
      ...g,
      redTrans: translatePlayer(g.red),
      blackTrans: translatePlayer(g.black),
      eccoVN: translateEccoName(g.eccoName, g.eccoCode),
    }));
  }, [games]);

  // Danh sách các đại sư nổi tiếng có ván đấu trong tập dữ liệu
  const mastersList = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      if (g.masterRed) set.add(g.masterRed);
      if (g.masterBlack) set.add(g.masterBlack);
    }
    return Array.from(set).sort();
  }, [games]);

  // Danh sách hệ khai cuộc ECCO
  const eccoGroups = [
    { id: "all", label: "Tất cả khai cuộc" },
    { id: "C", label: "Hệ C: Trung pháo (Pháo đầu)" },
    { id: "D", label: "Hệ D: Thuận pháo / Nghịch pháo" },
    { id: "E", label: "Hệ E: Tiên nhân chỉ lộ" },
    { id: "A", label: "Hệ A: Khởi mã / Phi tượng / Quá cung" },
    { id: "B", label: "Hệ B: Pháo khác / Sĩ giác pháo" },
  ];

  const filteredGames = useMemo(() => {
    return enrichedGames.filter((g) => {
      if (selectedMaster !== "all") {
        if (g.masterRed !== selectedMaster && g.masterBlack !== selectedMaster) {
          return false;
        }
      }

      if (selectedEcco !== "all") {
        if (!g.eccoCode.startsWith(selectedEcco)) {
          return false;
        }
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchPlayer =
          g.redTrans.fullName.toLowerCase().includes(q) ||
          g.blackTrans.fullName.toLowerCase().includes(q) ||
          g.red.toLowerCase().includes(q) ||
          g.black.toLowerCase().includes(q) ||
          (g.masterRed && g.masterRed.toLowerCase().includes(q)) ||
          (g.masterBlack && g.masterBlack.toLowerCase().includes(q));
        const matchEcco =
          g.eccoCode.toLowerCase().includes(q) ||
          g.eccoVN.toLowerCase().includes(q) ||
          g.eccoName.toLowerCase().includes(q);
        const matchTour = g.tournament.toLowerCase().includes(q);
        if (!matchPlayer && !matchEcco && !matchTour) return false;
      }

      return true;
    });
  }, [enrichedGames, search, selectedMaster, selectedEcco]);

  const masterCount = games.filter((g) => g.masterRed || g.masterBlack).length;

  return (
    <div className={styles.container}>
      {/* THANH CHUYỂN TAB CHÍNH: KỲ LÝ TRIỆU HÂM HÂM VS KHO VÁN ĐẠI SƯ */}
      <div className={styles.viewModeTabs}>
        <button
          type="button"
          className={`${styles.viewModeBtn} ${viewMode === "zhao" ? styles.viewModeActive : ""}`}
          onClick={() => setViewMode("zhao")}
        >
          📘 96 Kỳ Lý Triệu Hâm Hâm (Trung Cuộc & Tàn Cuộc)
        </button>
        <button
          type="button"
          className={`${styles.viewModeBtn} ${viewMode === "games" ? styles.viewModeActive : ""}`}
          onClick={() => setViewMode("games")}
        >
          🏆 Kỳ Phổ Thực Chiến Đại Sư ({games.length} Ván Đã Việt Hóa)
        </button>
      </div>

      {/* CHẾ ĐỘ 1: BÀI GIẢNG KỲ LÝ CỦA TRIỆU HÂM HÂM */}
      {viewMode === "zhao" && <ZhaoLessonsSection />}

      {/* CHẾ ĐỘ 2: DANH SÁCH VÁN CỜ THỰC CHIẾN ĐẠI SƯ */}
      {viewMode === "games" && (
        <>
          <header className={styles.header}>
            <h1 className={styles.title}>Kỳ Phổ Thực Chiến Đại Sư</h1>
            <p className={styles.subtitle}>
              Tuyển tập hơn 200 ván cờ đỉnh cao của các đại sư hàng đầu thế giới (Hứa Ngân Xuyên, Lữ Khâm, Hồ Vinh Hoa, Triệu Quốc Vinh, Liễu Đại Hoa...).
              Toàn bộ tên kỳ thủ và hệ khai cuộc đã được <strong>phiên âm Hán-Việt 100%</strong>, đối chiếu mã khai cuộc quốc tế ECCO và hỗ trợ phân tích AI.
            </p>

            <div className={styles.statGrid}>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{games.length}</div>
                <div className={styles.statLabel}>Ván cờ mẫu trong cơ sở dữ liệu</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>{masterCount}</div>
                <div className={styles.statLabel}>Ván đối đầu của các Đặc cấp Đại sư</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statNumber}>100%</div>
                <div className={styles.statLabel}>Việt hóa danh tính & Khai cuộc</div>
              </div>
            </div>

            <div className={styles.filterBar}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Tìm theo tên đại sư (Hứa Ngân Xuyên, Triệu Hâm Hâm...), giải đấu hoặc khai cuộc..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <select
                className={styles.select}
                value={selectedMaster}
                onChange={(e) => setSelectedMaster(e.target.value)}
              >
                <option value="all">⭐ Tất cả Đại sư</option>
                {mastersList.map((m) => (
                  <option key={m} value={m}>
                    ⭐ {getMasterDisplayName(m)}
                  </option>
                ))}
              </select>

              <select
                className={styles.select}
                value={selectedEcco}
                onChange={(e) => setSelectedEcco(e.target.value)}
              >
                {eccoGroups.map((grp) => (
                  <option key={grp.id} value={grp.id}>
                    {grp.label}
                  </option>
                ))}
              </select>
            </div>
          </header>

          <div className={styles.gameList}>
            {filteredGames.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)" }}>
                Không tìm thấy ván cờ nào phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              filteredGames.slice(0, 100).map((g) => {
                const resultLabel =
                  g.result === "red_wins"
                    ? "Đỏ thắng"
                    : g.result === "black_wins"
                    ? "Đen thắng"
                    : g.result === "draw"
                    ? "Hòa"
                    : "Chưa rõ";
                const isWin = g.result === "red_wins" || g.result === "black_wins";

                return (
                  <Link key={g.id} href={`/masters/${g.id}`} className={styles.gameCard}>
                    <div className={styles.gameMain}>
                      <div className={styles.playersRow}>
                        <span className={styles.redName}>
                          {g.masterRed ? `⭐ ${g.redTrans.fullName}` : g.redTrans.fullName}
                          {g.redTrans.title && (
                            <span style={{ fontSize: 12, color: "var(--accent)", marginLeft: 6, opacity: 0.9 }}>
                              [{g.redTrans.title}]
                            </span>
                          )}
                        </span>
                        <span className={styles.vsBadge}>tiên đối</span>
                        <span className={styles.blackName}>
                          {g.masterBlack ? `⭐ ${g.blackTrans.fullName}` : g.blackTrans.fullName}
                          {g.blackTrans.title && (
                            <span style={{ fontSize: 12, color: "var(--accent)", marginLeft: 6, opacity: 0.9 }}>
                              [{g.blackTrans.title}]
                            </span>
                          )}
                        </span>
                      </div>

                      <div className={styles.metaRow}>
                        {g.eccoCode && (
                          <span className={`${styles.badge} ${styles.eccoBadge}`}>
                            {g.eccoCode}
                          </span>
                        )}
                        <span style={{ color: "#f3f4f6", fontWeight: 500 }}>{g.eccoVN}</span>
                        <span>•</span>
                        <span>{Math.ceil(g.moveCount / 2)} nước đi</span>
                        {g.tournament && (
                          <>
                            <span>•</span>
                            <span>{g.tournament}</span>
                          </>
                        )}
                        <span
                          className={`${styles.badge} ${
                            isWin ? styles.resultBadgeWin : styles.resultBadgeDraw
                          }`}
                        >
                          {resultLabel}
                        </span>
                      </div>
                    </div>

                    <div className={styles.viewButton}>Xem & Phân tích →</div>
                  </Link>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
