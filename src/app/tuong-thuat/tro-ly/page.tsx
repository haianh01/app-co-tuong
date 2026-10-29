"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./tro-ly.module.css";

interface BotStatus {
  provider: "gemini" | "claude";
  model: string;
  hasKey: boolean;
  lessons: string[];
  maxPerMinute: number;
  session: {
    aiReplies: number;
    costUsd: number;
  };
  settings: {
    inGame: boolean;
    style: "coach" | "humorous" | "zhaoXinxin";
  };
  tiktok: string | null;
  kydai: string | null;
  stage: string | null;
  game: {
    live: boolean;
    summary: string;
  } | null;
}

interface LogEntry {
  id: string;
  user: string;
  question: string;
  reply: string | null;
  source: "ai" | "template" | "skipped";
  origin: "panel" | "tiktok" | "game";
  reason?: string;
  latencyMs: number;
  costUsd: number;
  timestamp: string;
}

const SAMPLE_COMMENTS = [
  "Thầy ơi em hay bị mất Mã đầu ván thì xử lý sao ạ?",
  "Bên Đỏ đi Pháo 2 bình 5 là khai cuộc gì vậy bot?",
  "Nước vừa rồi sao anh chủ kênh không ăn Xe?",
  "Chào cả nhà nha!",
  "Chúc anh chủ kênh hôm nay bất bại!",
  "Có mẹo nào đánh trung cuộc kiểu Triệu Hâm Hâm không ạ?",
];

export default function BotAssistantPage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [user, setUser] = useState("minhcotuong");
  const [commentText, setCommentText] = useState("");
  const [inGame, setInGame] = useState(false);
  const [style, setStyle] = useState<"coach" | "humorous" | "zhaoXinxin">("coach");
  const [speakVoice, setSpeakVoice] = useState(true);
  const [stageInput, setStageInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [latestPreview, setLatestPreview] = useState<{
    who: string;
    question: string;
    reply: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Lấy trạng thái hiện tại
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/bot/status");
      if (res.ok) {
        const data = (await res.json()) as BotStatus;
        setStatus(data);
        setInGame(data.settings.inGame);
        setStyle(data.settings.style);
        if (data.stage) setStageInput(data.stage);
      }
    } catch (e) {
      console.warn("Không tải được trạng thái bot:", e);
    }
  };

  useEffect(() => {
    void fetchStatus();

    // Lắng nghe SSE từ server
    const sse = new EventSource("/api/bot/events");
    sse.onmessage = (e) => {
      try {
        const item = JSON.parse(e.data) as LogEntry;
        const entry: LogEntry = {
          ...item,
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toLocaleTimeString("vi-VN"),
        };

        if (entry.reply) {
          setLatestPreview({
            who: entry.origin === "game" ? "♟ Diễn biến ván" : `@${entry.user}`,
            question: entry.question,
            reply: entry.reply,
          });

          // Phát âm thanh nếu bật tự đọc trên máy
          if (speakVoice) {
            const audioUrl = `/api/bot/tts?text=${encodeURIComponent(entry.reply)}`;
            const audio = new Audio(audioUrl);
            audio.play().catch(() => {});
          }
        }

        setLogs((prev) => [entry, ...prev.slice(0, 49)]);
        void fetchStatus();
      } catch (err) {
        console.warn("Lỗi phân tích SSE:", err);
      }
    };

    return () => {
      sse.close();
    };
  }, [speakVoice]);

  const handleUpdateSettings = async (nextInGame: boolean, nextStyle: "coach" | "humorous" | "zhaoXinxin") => {
    setInGame(nextInGame);
    setStyle(nextStyle);
    try {
      await fetch("/api/bot/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inGame: nextInGame, style: nextStyle }),
      });
    } catch {}
  };

  const handleSendEvent = async (kind: "comment" | "gift" | "join", textToSend?: string, giftName?: string) => {
    const text = textToSend ?? commentText;
    if (kind === "comment" && !text.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/bot/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: user.trim() || "khán giả",
          kind,
          text: kind === "comment" ? text : undefined,
          gift: kind === "gift" ? (giftName ?? "quà") : undefined,
          inGame,
          style,
        }),
      });
      if (res.ok) {
        if (!textToSend && kind === "comment") setCommentText("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleJoinStage = async () => {
    if (!stageInput.trim()) return;
    try {
      const res = await fetch("/api/bot/stage", {
        method: "POST",
        body: stageInput.trim(),
      });
      if (res.ok) {
        alert("Đã kết nối trợ lý vào phòng Sân khấu thành công!");
        void fetchStatus();
      } else {
        alert("Không tìm thấy phòng hợp lệ từ link/mã phòng đã nhập.");
      }
    } catch {
      alert("Lỗi khi kết nối sân khấu.");
    }
  };

  const copyObsUrl = (path: string, label: string) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}${path}`;
    void navigator.clipboard.writeText(url);
    setCopiedLink(label);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>
            <span>🤖 Trợ Lý Livestream Cờ Tướng</span>
          </h1>
          <Link href="/tuong-thuat" className={styles.btnSecondary}>
            ← Quay lại Bàn Tường Thuật
          </Link>
        </div>

        <div className={styles.statsBar}>
          <span className={styles.statBadge}>
            AI: <strong>{status?.provider ?? "..."} ({status?.model ?? "..."})</strong>
          </span>
          <span className={styles.statBadge}>
            API Key:{" "}
            <strong style={{ color: status?.hasKey ? "#10b981" : "#ef4444" }}>
              {status?.hasKey ? "✓ Đã sẵn sàng" : "⚠ Chưa cấu hình"}
            </strong>
          </span>
          <span className={styles.statBadge}>
            Bài giảng kỳ lý: <strong>{status?.lessons.length ?? 0} bài</strong>
          </span>
          <span className={styles.statBadge}>
            Đã trả lời: <strong>{status?.session.aiReplies ?? 0} câu</strong>
          </span>
          <span className={styles.statBadge}>
            Ước tính: <strong>${(status?.session.costUsd ?? 0).toFixed(4)}</strong>
          </span>
          {status?.tiktok && (
            <span className={styles.statBadge}>
              TikTok: <strong>@{status.tiktok}</strong>
            </span>
          )}
          {status?.stage && (
            <span className={styles.statBadge}>
              Sân khấu: <strong>{status.stage.slice(0, 8)}...</strong>
            </span>
          )}
        </div>
      </header>

      {/* OBS Overlay & Live2D Banner */}
      <section className={styles.obsBanner}>
        <div className={styles.obsCard}>
          <div>
            <div className={styles.obsHeader}>
              <span>💬 Khung Chữ Trợ Lý (Overlay)</span>
            </div>
            <p className={styles.obsDesc}>
              Khung chữ phụ đề trong suốt hiển thị câu trả lời và diễn biến trận đấu. Thêm vào OBS dạng Browser Source (Width 700, Height 250).
            </p>
          </div>
          <div className={styles.obsAction}>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => copyObsUrl("/live-bot/overlay.html?voice=1", "overlay")}
            >
              {copiedLink === "overlay" ? "✓ Đã chép link!" : "📋 Sao chép URL OBS"}
            </button>
            <a href="/live-bot/overlay.html?voice=1" target="_blank" rel="noreferrer" className={styles.openLink}>
              Mở thử ↗
            </a>
          </div>
        </div>

        <div className={styles.obsCard}>
          <div>
            <div className={styles.obsHeader}>
              <span>🎭 Nhân Vật Ảo Live2D (Avatar)</span>
            </div>
            <p className={styles.obsDesc}>
              Nhân vật Haru cử động, thở, nhép miệng theo giọng AI trả lời. Thêm vào OBS dạng Browser Source (Width 600, Height 800).
            </p>
          </div>
          <div className={styles.obsAction}>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => copyObsUrl("/live-bot/avatar.html?voice=1", "avatar")}
            >
              {copiedLink === "avatar" ? "✓ Đã chép link!" : "📋 Sao chép URL OBS"}
            </button>
            <a href="/live-bot/avatar.html?voice=1" target="_blank" rel="noreferrer" className={styles.openLink}>
              Mở thử ↗
            </a>
          </div>
        </div>
      </section>

      <main className={styles.mainGrid}>
        {/* Cột 1: Bảng điều khiển giả lập & cấu hình */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>⚙️ Điều Khiển Trợ Lý</h2>

          <div className={styles.field}>
            <label className={styles.label}>Tên người xem (giả lập)</label>
            <input
              type="text"
              className={styles.input}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="VD: minhcotuong"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Bình luận của người xem</label>
            <textarea
              className={styles.textarea}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Nhập câu hỏi kỳ lý hoặc câu chat..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSendEvent("comment");
                }
              }}
            />
          </div>

          <div className={styles.btnGroup}>
            <button
              type="button"
              disabled={loading}
              className={styles.btnPrimary}
              onClick={() => handleSendEvent("comment")}
            >
              {loading ? "Đang gửi..." : "Gửi Bình Luận"}
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => handleSendEvent("gift", undefined, "Hoa Hồng")}
            >
              🎁 Tặng Quà
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => handleSendEvent("join")}
            >
              👋 Vào Phòng
            </button>
          </div>

          <hr style={{ margin: "16px 0", borderColor: "var(--border-color, #e2e8f0)", borderStyle: "solid" }} />

          <div className={styles.field}>
            <label className={styles.label}>Giọng điệu AI</label>
            <select
              className={styles.select}
              value={style}
              onChange={(e) =>
                handleUpdateSettings(inGame, e.target.value as "coach" | "humorous" | "zhaoXinxin")
              }
            >
              <option value="coach">Thầy giáo ân cần, dễ hiểu</option>
              <option value="humorous">Bình luận viên hóm hỉnh, vui vẻ</option>
              <option value="zhaoXinxin">Sắc bén kiểu Triệu Hâm Hâm</option>
            </select>
          </div>

          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={inGame}
              onChange={(e) => handleUpdateSettings(e.target.checked, style)}
            />
            <span>
              <strong>Đang đánh ván thật</strong> (Bật Fair-play, từ chối gợi ý nước đi)
            </span>
          </label>

          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={speakVoice}
              onChange={(e) => setSpeakVoice(e.target.checked)}
            />
            <span>Đọc to giọng nói trực tiếp trên trình duyệt này</span>
          </label>

          <div className={styles.field} style={{ marginTop: 12 }}>
            <label className={styles.label}>Link hoặc mã phòng Sân khấu tường thuật</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                className={styles.input}
                value={stageInput}
                onChange={(e) => setStageInput(e.target.value)}
                placeholder="/tuong-thuat/san-khau?room=..."
              />
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleJoinStage}
                style={{ whiteSpace: "nowrap" }}
              >
                Kết Nối
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Câu hỏi mẫu (bấm để thử ngay):</label>
            <div className={styles.chips}>
              {SAMPLE_COMMENTS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={styles.chipBtn}
                  onClick={() => handleSendEvent("comment", s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Cột 2: Preview thời gian thực & Lịch sử trả lời */}
        <section>
          {latestPreview && (
            <div className={styles.livePreview}>
              <div className={styles.previewWho}>{latestPreview.who}</div>
              {latestPreview.question && (
                <div className={styles.previewQ}>{latestPreview.question}</div>
              )}
              <div className={styles.previewA}>{latestPreview.reply}</div>
            </div>
          )}

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>📜 Lịch Sử Phản Hồi Thời Gian Thực</h2>
            {logs.length === 0 ? (
              <p style={{ color: "var(--text-secondary, #64748b)", fontSize: 14 }}>
                Chưa có phản hồi nào. Hãy gõ bình luận thử hoặc liên kết với phòng Sân khấu để AI tự tường thuật!
              </p>
            ) : (
              <div className={styles.logList}>
                {logs.map((log) => (
                  <div key={log.id} className={styles.logItem}>
                    <div className={styles.logUser}>
                      {log.origin === "game" ? "♟ Ván cờ" : `@${log.user}`}
                      {log.question ? `: ${log.question}` : ""}
                    </div>
                    <div className={styles.logReply}>
                      {log.reply ?? `(Bỏ qua: ${log.reason ?? "không có câu trả lời"})`}
                    </div>
                    <div className={styles.logMeta}>
                      <span
                        className={`${styles.tag} ${
                          log.origin === "game"
                            ? styles.tagGame
                            : log.source === "ai"
                              ? styles.tagAi
                              : log.source === "template"
                                ? styles.tagTemplate
                                : styles.tagSkipped
                        }`}
                      >
                        {log.origin === "game"
                          ? "Ván cờ"
                          : log.source === "ai"
                            ? "AI Gemini/Claude"
                            : log.source === "template"
                              ? "Mẫu có sẵn"
                              : "Bỏ qua"}
                      </span>
                      <span>{log.latencyMs}ms</span>
                      {log.costUsd > 0 && <span>${log.costUsd.toFixed(5)}</span>}
                      <span>{log.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
