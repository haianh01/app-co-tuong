"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { detectOpeningFromMoves } from "@/lib/xiangqi/openings";
import type { StageGame } from "@/server/db/schema";
import zigaStyles from "../ziga/ziga.module.css";
import styles from "./history.module.css";

const ROOM_KEY = "tuong-thuat:stage-room";

const noSubscribe = () => () => {};

function getStoredRoom(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromStorage = localStorage.getItem(ROOM_KEY);
    if (fromStorage) return fromStorage;
  } catch {}
  return new URLSearchParams(window.location.search).get("room");
}

export function StageHistoryClient() {
  const room = useSyncExternalStore(noSubscribe, getStoredRoom, () => null);
  const [games, setGames] = useState<StageGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bộ lọc
  const [filterResult, setFilterResult] = useState<"all" | "win" | "draw" | "loss">("all");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");

  useEffect(() => {
    if (!room) return;
    let cancelled = false;

    const params = new URLSearchParams({ room });
    if (filterResult !== "all") params.set("result", filterResult);
    if (filterQuery.trim()) params.set("q", filterQuery.trim());
    if (filterDate) params.set("date", filterDate);

    fetch(`/api/tuong-thuat/games?${params.toString()}`, {
      headers: { "X-Stage-Room": room },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Không thể tải danh sách ván (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.games) {
          setGames(data.games);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [room, filterResult, filterQuery, filterDate]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    let win = 0;
    let draw = 0;
    let loss = 0;
    for (const g of games) {
      if (g.result === "win") win++;
      else if (g.result === "draw") draw++;
      else if (g.result === "loss") loss++;
    }
    return { total: games.length, win, draw, loss };
  }, [games]);

  // Gom nhóm theo ngày chơi
  const groupedByDate = useMemo(() => {
    const groups: { date: string; displayDate: string; items: StageGame[] }[] = [];
    const map = new Map<string, StageGame[]>();

    for (const g of games) {
      const d = g.playedOn || (g.startedAt ? new Date(g.startedAt).toISOString().slice(0, 10) : "");
      const list = map.get(d) ?? [];
      list.push(g);
      map.set(d, list);
    }

    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

    for (const [date, items] of map.entries()) {
      let displayDate = date;
      if (date === todayStr) {
        displayDate = `Hôm nay (${date})`;
      } else {
        const [y, m, day] = date.split("-");
        if (y && m && day) displayDate = `Ngày ${day}/${m}/${y}`;
      }
      groups.push({ date, displayDate, items });
    }

    return groups;
  }, [games]);

  return (
    <div className={styles.container}>
      {/* Subnav chế độ */}
      <nav aria-label="Chế độ tường thuật" className={zigaStyles.subnav}>
        <Link href="/tuong-thuat" className={zigaStyles.subnavLink}>
          📷 Thị giác máy tính (Chụp màn hình)
        </Link>
        <Link href="/tuong-thuat/ziga" className={zigaStyles.subnavLink}>
          ⚡ Đồng bộ WebSocket trực tiếp (Ziga Hook)
        </Link>
        <Link href="/tuong-thuat/lich-su" className={`${zigaStyles.subnavLink} ${zigaStyles.subnavActive}`}>
          📜 Lịch sử ván đấu
        </Link>
      </nav>

      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>📜 Lịch sử ván cờ sân khấu</h1>
          {room && (
            <span style={{ fontSize: "0.85rem", color: "var(--muted, #94a3b8)" }}>
              Phòng: <code>{room.slice(0, 8)}…</code>
            </span>
          )}
        </div>

        {/* Thanh thống kê */}
        <div className={styles.statsBar}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Tổng số ván</span>
            <span className={styles.statVal}>{stats.total}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Thắng</span>
            <span className={styles.statVal} style={{ color: "#4ade80" }}>{stats.win}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Hòa</span>
            <span className={styles.statVal} style={{ color: "#facc15" }}>{stats.draw}</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Thua</span>
            <span className={styles.statVal} style={{ color: "#f87171" }}>{stats.loss}</span>
          </div>
        </div>
      </header>

      {/* Thanh bộ lọc */}
      <section className={styles.filterCard} aria-label="Bộ lọc ván đấu">
        <input
          type="search"
          className={styles.searchInput}
          placeholder="🔍 Tìm theo tên kì thủ / đối thủ..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />

        <div className={styles.filterPills} role="group" aria-label="Lọc theo kết quả">
          {(["all", "win", "draw", "loss"] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={styles.pill}
              aria-pressed={filterResult === r}
              onClick={() => setFilterResult(r)}
            >
              {r === "all" ? "Tất cả" : r === "win" ? "Thắng" : r === "draw" ? "Hòa" : "Thua"}
            </button>
          ))}
        </div>

        <input
          type="date"
          className={styles.dateInput}
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          title="Lọc theo ngày"
        />

        {(filterResult !== "all" || filterQuery || filterDate) && (
          <button
            type="button"
            className={styles.pill}
            onClick={() => {
              setFilterResult("all");
              setFilterQuery("");
              setFilterDate("");
            }}
          >
            ✕ Xóa lọc
          </button>
        )}
      </section>

      {/* Nội dung danh sách */}
      {!room ? (
        <div className={styles.emptyState}>
          Chưa tìm thấy mã phòng sân khấu. Hãy mở trang <Link href="/tuong-thuat" style={{ color: "var(--gold)" }}>Tường thuật</Link> để khởi tạo phòng livestream.
        </div>
      ) : loading ? (
        <div className={styles.emptyState}>⏳ Đang tải lịch sử ván cờ…</div>
      ) : error ? (
        <div className={styles.emptyState} style={{ color: "#f87171" }}>
          ⚠️ {error}
        </div>
      ) : games.length === 0 ? (
        <div className={styles.emptyState}>
          Chưa có ván cờ nào phù hợp bộ lọc hoặc chưa có ván cờ nào được lưu trong phòng này.
        </div>
      ) : (
        groupedByDate.map((group) => (
          <section key={group.date} className={styles.dateSection}>
            <h2 className={styles.dateTitle}>📅 {group.displayDate} ({group.items.length} ván)</h2>
            <div className={styles.gamesGrid}>
              {group.items.map((game) => {
                const notations = Array.isArray(game.moves)
                  ? game.moves.map((m) => (typeof m === "object" && m && "notation" in m ? String(m.notation) : "")).filter(Boolean)
                  : [];
                const opening = detectOpeningFromMoves(notations) ?? "Khai cuộc tự do";
                const numMoves = Math.ceil(game.plies / 2);

                const resultText =
                  game.result === "win"
                    ? "Bạn thắng"
                    : game.result === "draw"
                      ? "Hòa"
                      : game.result === "loss"
                        ? "Đối thủ thắng"
                        : "Chưa rõ";

                const badgeClass =
                  game.result === "win"
                    ? styles.badgeWin
                    : game.result === "draw"
                      ? styles.badgeDraw
                      : game.result === "loss"
                        ? styles.badgeLoss
                        : styles.badgeUnknown;

                return (
                  <Link
                    key={game.id}
                    href={`/tuong-thuat/lich-su/${game.id}`}
                    className={styles.gameCard}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.roundLabel}>
                        Ván {game.round ?? "–"} · {game.site === "ziga" ? "⚡ Ziga" : "📷 Chụp bàn"}
                      </span>
                      <span className={`${styles.badge} ${badgeClass}`}>{resultText}</span>
                    </div>

                    <div className={styles.matchup}>
                      <div className={styles.playerBox}>
                        <span className={styles.playerName} style={{ color: game.mySide === "r" ? "#ef4444" : "#94a3b8" }}>
                          {game.mySide === "r" ? "🔴 " : "⚫ "}{game.me?.name || "Bạn"}
                        </span>
                        <span className={styles.playerMeta}>
                          {game.me?.points ? `Elo ${game.me.points}` : game.me?.title || "Kì thủ"}
                        </span>
                      </div>

                      <span className={styles.vsIcon}>VS</span>

                      <div className={styles.playerBox} style={{ textAlign: "right" }}>
                        <span className={styles.playerName} style={{ color: game.mySide === "r" ? "#94a3b8" : "#ef4444" }}>
                          {game.opponent?.name || "Đối thủ"}{game.mySide === "r" ? " ⚫" : " 🔴"}
                        </span>
                        <span className={styles.playerMeta}>
                          {game.opponent?.points ? `Elo ${game.opponent.points}` : game.opponent?.title || "Đối thủ"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.cardFooter}>
                      <span className={styles.openingBadge} title={opening}>
                        {opening}
                      </span>
                      <span>{numMoves} nước ({game.plies} hiệp)</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
