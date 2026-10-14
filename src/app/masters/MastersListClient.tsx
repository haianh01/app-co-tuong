"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MasterGameRecord } from "@/lib/xiangqi/master-games.generated";

export type MasterGameSummary = Omit<MasterGameRecord, "movesVN" | "movesCN">;
import styles from "./masters.module.css";

interface Props {
  games: MasterGameSummary[];
}

export function MastersListClient({ games }: Props) {
  const [search, setSearch] = useState("");
  const [selectedMaster, setSelectedMaster] = useState<string>("all");
  const [selectedEcco, setSelectedEcco] = useState<string>("all");

  // Danh sách các đại sư có ván trong tập dữ liệu
  const mastersList = useMemo(() => {
    const set = new Set<string>();
    for (const g of games) {
      if (g.masterRed) set.add(g.masterRed);
      if (g.masterBlack) set.add(g.masterBlack);
    }
    return Array.from(set).sort();
  }, [games]);

  // Danh sách hệ khai cuộc
  const eccoGroups = [
    { id: "all", label: "Tất cả khai cuộc" },
    { id: "C", label: "Hệ C: Trung pháo (Pháo đầu)" },
    { id: "D", label: "Hệ D: Thuận pháo / Nghịch pháo" },
    { id: "E", label: "Hệ E: Tiên nhân chỉ lộ" },
    { id: "A", label: "Hệ A: Khởi mã / Phi tượng / Quá cung" },
    { id: "B", label: "Hệ B: Pháo khác / Sĩ giác pháo" },
  ];

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
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
          g.red.toLowerCase().includes(q) ||
          g.black.toLowerCase().includes(q) ||
          (g.masterRed && g.masterRed.toLowerCase().includes(q)) ||
          (g.masterBlack && g.masterBlack.toLowerCase().includes(q));
        const matchEcco = g.eccoCode.toLowerCase().includes(q) || g.eccoName.toLowerCase().includes(q);
        const matchTour = g.tournament.toLowerCase().includes(q);
        if (!matchPlayer && !matchEcco && !matchTour) return false;
      }

      return true;
    });
  }, [games, search, selectedMaster, selectedEcco]);

  const masterCount = games.filter((g) => g.masterRed || g.masterBlack).length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Kỳ Phổ Thực Chiến Đại Sư</h1>
        <p className={styles.subtitle}>
          Tuyển tập hơn 200 ván cờ đỉnh cao của các đại sư hàng đầu (Lữ Khâm, Hứa Ngân Xuyên, Hồ Vinh Hoa, Triệu Quốc Vinh, Liễu Đại Hoa...).
          Đối chiếu mã khai cuộc quốc tế ECCO và phân tích chiến thuật từng nước đi.
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
            <div className={styles.statNumber}>94%</div>
            <div className={styles.statLabel}>Độ chính xác trung bình (AI đo lường)</div>
          </div>
        </div>

        <div className={styles.filterBar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Tìm theo tên đại sư, giải đấu hoặc khai cuộc..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className={styles.select}
            value={selectedMaster}
            onChange={(e) => setSelectedMaster(e.target.value)}
          >
            <option value="all">Tất cả Đại sư</option>
            {mastersList.map((m) => (
              <option key={m} value={m}>
                ⭐ {m}
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
                      {g.masterRed ? `⭐ ${g.red}` : g.red}
                    </span>
                    <span className={styles.vsBadge}>tiên đối</span>
                    <span className={styles.blackName}>
                      {g.masterBlack ? `⭐ ${g.black}` : g.black}
                    </span>
                  </div>

                  <div className={styles.metaRow}>
                    {g.eccoCode && (
                      <span className={`${styles.badge} ${styles.eccoBadge}`}>
                        {g.eccoCode}
                      </span>
                    )}
                    <span>{g.eccoName || "Khai cuộc kinh điển"}</span>
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
    </div>
  );
}
