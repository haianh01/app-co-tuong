"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./tro-ly.module.css";
import type { BotStyle } from "@/server/bot/types";

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
    style: BotStyle;
    tips: boolean;
    remind: boolean;
    tipMinutes: number;
    remindMinutes: number;
    name: string;
    self: string;
    persona: string;
    hostProfile: string;
    ttsEngine: "piper" | "edge";
    voice: "female" | "male";
  };
  tiktok: string | null;
  tiktokState: "off" | "waiting" | "connected";
  tiktokError: string | null;
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
  origin: "panel" | "tiktok" | "game" | "tip" | "remind";
  /** Người live đã tắt giọng trên sân khấu. */
  silent?: boolean;
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

/** Gợi ý những gì nên viết về mình cho AI (chỉ hiện khi ô còn trống). */
const HOST_PROFILE_HINT = `Ví dụ:
Người xem gọi tôi là: anh ...
Nghề: ... · Quê: ...
Chơi cờ từ năm ..., trình độ khoảng ..., thích đi khai cuộc ..., kỳ thủ yêu thích: ...
Lịch live: tối ... từ ... giờ
Sở thích ngoài cờ: ...
Không muốn AI nhắc tới: ...`;

/** Hàng đợi giọng đọc dùng chung với overlay/avatar (public/live-bot/speech.js). */
type Speaker = { say: (text: string) => void };
declare global {
  interface Window {
    createSpeaker?: () => Speaker;
  }
}

export default function BotAssistantPage() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [user, setUser] = useState("minhcotuong");
  const [commentText, setCommentText] = useState("");
  const [inGame, setInGame] = useState(false);
  const [style, setStyle] = useState<BotStyle>("coach");
  const [speakVoice, setSpeakVoice] = useState(true);
  const [tips, setTips] = useState(true);
  const [remind, setRemind] = useState(true);
  // Nhân vật: sửa trong ô rồi bấm Lưu (không gửi theo từng phím gõ).
  const [character, setCharacter] = useState({ name: "", self: "", persona: "", hostProfile: "" });
  const [characterSaved, setCharacterSaved] = useState(false);
  // null: chưa nạp từ server; sau đó giữ nguyên chữ đang gõ.
  const [tiktokInput, setTiktokInput] = useState<string | null>(null);
  const [stageInput, setStageInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [latestPreview, setLatestPreview] = useState<{
    who: string;
    question: string;
    reply: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Đọc xong câu trả lời này mới đọc câu sau, không chồng tiếng.
  const speakerRef = useRef<Speaker | null>(null);
  useEffect(() => {
    if (window.createSpeaker) {
      speakerRef.current = window.createSpeaker();
      return;
    }
    const script = document.createElement("script");
    script.src = "/live-bot/speech.js";
    script.onload = () => {
      speakerRef.current = window.createSpeaker?.() ?? null;
    };
    document.body.appendChild(script);
  }, []);

  // Lấy trạng thái hiện tại
  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/bot/status");
      if (res.ok) {
        const data = (await res.json()) as BotStatus;
        setStatus(data);
        setInGame(data.settings.inGame);
        setStyle(data.settings.style);
        setTips(data.settings.tips);
        setRemind(data.settings.remind);
        // Chỉ nạp nhân vật lần đầu, để lần làm mới trạng thái sau không xóa chữ đang gõ dở.
        setCharacter((c) => (c.name ? c : { name: data.settings.name, self: data.settings.self, persona: data.settings.persona, hostProfile: data.settings.hostProfile }));
        setTiktokInput((v) => v ?? data.tiktok ?? "");
        if (data.stage) setStageInput(data.stage);
      }
    } catch (e) {
      console.warn("Không tải được trạng thái bot:", e);
    }
  };

  // Trạng thái TikTok đổi ngầm phía server (lúc Go LIVE, lúc rớt mạng) nên làm mới định kỳ.
  useEffect(() => {
    const t = setInterval(() => void fetchStatus(), 5_000);
    return () => clearInterval(t);
  }, []);

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
            who: entry.origin === "game" ? "♟ Diễn biến ván" : entry.origin === "tip" ? "💡 Mẹo kỳ lý" : entry.origin === "remind" ? "🧭 Nhắc anh chủ kênh" : `@${entry.user}`,
            question: entry.question,
            reply: entry.reply,
          });

          // Phát âm thanh nếu bật tự đọc trên máy
          if (speakVoice && !entry.silent) speakerRef.current?.say(entry.reply);
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

  const handleUpdateSettings = async (nextInGame: boolean, nextStyle: BotStyle) => {
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

  const handleToggleTips = async (next: boolean) => {
    setTips(next);
    try {
      await fetch("/api/bot/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tips: next }),
      });
    } catch {}
  };

  /** Gửi một phần cài đặt lên server (server lưu lại, khởi động lại vẫn giữ). */
  const saveSettings = async (patch: Partial<BotStatus["settings"]>) => {
    setStatus((s) => (s ? { ...s, settings: { ...s.settings, ...patch } } : s));
    try {
      await fetch("/api/bot/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch {}
  };

  const handleSaveCharacter = async () => {
    await saveSettings(character);
    setCharacterSaved(true);
    setTimeout(() => setCharacterSaved(false), 2500);
  };

  const handleSaveTikTok = async () => {
    await fetch("/api/bot/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tiktokUsername: tiktokInput ?? "" }),
    }).catch(() => {});
    void fetchStatus();
  };

  const handleToggleRemind = async (next: boolean) => {
    setRemind(next);
    try {
      await fetch("/api/bot/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ remind: next }),
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
              Tiểu Tốt (cô phù thủy tí hon) cử động, thở, nhép miệng theo giọng AI trả lời. Thêm vào OBS dạng Browser Source (Width 600, Height 800).
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

        <div className={styles.obsCard}>
          <div>
            <div className={styles.obsHeader}>
              <span>🧙 Ngồi Trên Vai (Webcam OBS)</span>
            </div>
            <p className={styles.obsDesc}>
              Nhân vật nhỏ ngồi trên vai bạn. Thêm Browser Source cùng cỡ với nguồn webcam, đặt ngay trên webcam. Kéo nhân vật lên đúng vai, lăn chuột để đổi cỡ (Interact trong OBS). Khi đó mở Sân khấu với ?ai=0 để không bị hai giọng.
            </p>
          </div>
          <div className={styles.obsAction}>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={() => copyObsUrl("/live-bot/avatar.html?voice=1&perch=right", "perch")}
            >
              {copiedLink === "perch" ? "✓ Đã chép link!" : "📋 Sao chép URL OBS"}
            </button>
            <a href="/live-bot/avatar.html?voice=1&perch=right" target="_blank" rel="noreferrer" className={styles.openLink}>
              Mở thử ↗
            </a>
          </div>
        </div>
      </section>

      <section className={styles.card} style={{ marginBottom: 20 }}>
        <h2 className={styles.cardTitle}>📡 Kênh TikTok Live</h2>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="bot-tiktok">
            Kênh để AI đọc bình luận (@tenkenh hoặc link kênh). Lưu trước khi Go LIVE cũng được: app tự thử vào phòng mỗi 30 giây.
          </label>
          <input
            id="bot-tiktok"
            className={styles.input}
            placeholder="@tenkenh"
            value={tiktokInput ?? ""}
            onChange={(e) => setTiktokInput(e.target.value)}
          />
        </div>
        <button type="button" className={styles.btnPrimary} onClick={handleSaveTikTok}>
          💾 Lưu kênh
        </button>
        <p className={styles.obsDesc} role="status" style={{ marginTop: 10 }}>
          {status?.tiktokState === "connected"
            ? `✅ Đang nhận bình luận từ phòng live của @${status.tiktok}`
            : status?.tiktokState === "waiting"
              ? `⏳ Đang chờ @${status.tiktok} lên live${status.tiktokError ? ` (lần thử gần nhất: ${status.tiktokError})` : ""}`
              : "⚠️ Chưa đặt kênh: AI sẽ không thấy bình luận TikTok."}
        </p>
      </section>

      <section className={styles.card} style={{ marginBottom: 20 }}>
        <h2 className={styles.cardTitle}>🧙 Nhân Vật AI &amp; Giọng Đọc</h2>
        <div className={styles.characterGrid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bot-name">Tên nhân vật (hiện trên phụ đề)</label>
            <input
              id="bot-name"
              className={styles.input}
              maxLength={40}
              value={character.name}
              onChange={(e) => setCharacter({ ...character, name: e.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bot-self">Tự xưng là</label>
            <input
              id="bot-self"
              className={styles.input}
              maxLength={20}
              placeholder="tớ, mình, tôi…"
              value={character.self}
              onChange={(e) => setCharacter({ ...character, self: e.target.value })}
            />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="bot-persona">Lý lịch và tính cách (AI đọc để nói đúng vai)</label>
          <textarea
            id="bot-persona"
            className={`${styles.textarea} ${styles.personaInput}`}
            rows={4}
            maxLength={1200}
            value={character.persona}
            onChange={(e) => setCharacter({ ...character, persona: e.target.value })}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="bot-host">
            Về anh chủ kênh (AI chỉ kể về bạn theo đúng phần này; không ghi thì nó trả lời là chưa biết)
          </label>
          <textarea
            id="bot-host"
            className={`${styles.textarea} ${styles.personaInput}`}
            rows={5}
            maxLength={2000}
            placeholder={HOST_PROFILE_HINT}
            value={character.hostProfile}
            onChange={(e) => setCharacter({ ...character, hostProfile: e.target.value })}
          />
        </div>
        <button type="button" className={styles.btnPrimary} onClick={handleSaveCharacter}>
          {characterSaved ? "✓ Đã lưu nhân vật" : "💾 Lưu nhân vật"}
        </button>

        <div className={styles.characterGrid} style={{ marginTop: 16 }}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bot-tts">Bộ đọc giọng</label>
            <select
              id="bot-tts"
              className={styles.select}
              value={status?.settings.ttsEngine ?? "piper"}
              onChange={(e) => saveSettings({ ttsEngine: e.target.value as "piper" | "edge" })}
            >
              <option value="piper">Piper: chạy trên máy, ổn định</option>
              <option value="edge">Edge (Microsoft): giọng tự nhiên hơn, hay bị cắt</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bot-voice">Giọng Edge</label>
            <select
              id="bot-voice"
              className={styles.select}
              value={status?.settings.voice ?? "female"}
              disabled={status?.settings.ttsEngine !== "edge"}
              onChange={(e) => saveSettings({ voice: e.target.value as "female" | "male" })}
            >
              <option value="female">Nữ (Hoài My)</option>
              <option value="male">Nam (Nam Minh)</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bot-tip-minutes">Mẹo kỳ lý: im lặng bao lâu thì đọc (phút)</label>
            <input
              id="bot-tip-minutes"
              type="number"
              min={1}
              max={30}
              className={styles.input}
              value={status?.settings.tipMinutes ?? 4}
              onChange={(e) => e.target.value && saveSettings({ tipMinutes: Number(e.target.value) })}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="bot-remind-minutes">Nhắc anh chủ kênh: cách nhau (phút)</label>
            <input
              id="bot-remind-minutes"
              type="number"
              min={1}
              max={30}
              className={styles.input}
              value={status?.settings.remindMinutes ?? 3}
              onChange={(e) => e.target.value && saveSettings({ remindMinutes: Number(e.target.value) })}
            />
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
                handleUpdateSettings(inGame, e.target.value as BotStyle)
              }
            >
              <option value="coach">Thầy giáo ân cần, dễ hiểu</option>
              <option value="humorous">Bình luận viên hóm hỉnh, vui vẻ</option>
              <option value="zhaoXinxin">Sắc bén kiểu Triệu Hâm Hâm</option>
              <option value="playful">Tinh nghịch, lém lỉnh</option>
              <option value="teaseHost">Hay trêu anh chủ kênh</option>
              <option value="serious">Nghiêm túc, chuyên môn</option>
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

          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={tips}
              onChange={(e) => handleToggleTips(e.target.checked)}
            />
            <span>
              <strong>Mẹo kỳ lý</strong> (live im lặng vài phút thì AI tự đọc một nguyên tắc của Triệu Hâm Hâm)
            </span>
          </label>

          <label className={styles.switchRow}>
            <input
              type="checkbox"
              checked={remind}
              onChange={(e) => handleToggleRemind(e.target.checked)}
            />
            <span>
              <strong>Nhắc anh chủ kênh</strong> (trong ván, vài phút nhắc nhẹ một nguyên tắc theo khai/trung/tàn cuộc, chỉ khi anh vừa đi xong; không nhìn thế cờ)
            </span>
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
                      {log.origin === "game" ? "♟ Ván cờ" : log.origin === "tip" ? "💡 Mẹo kỳ lý" : log.origin === "remind" ? "🧭 Nhắc anh chủ kênh" : `@${log.user}`}
                      {log.question ? `: ${log.question}` : ""}
                    </div>
                    <div className={styles.logReply}>
                      {log.reply ?? `(Bỏ qua: ${log.reason ?? "không có câu trả lời"})`}
                    </div>
                    <div className={styles.logMeta}>
                      <span
                        className={`${styles.tag} ${
                          log.origin === "game" || log.origin === "tip" || log.origin === "remind"
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
                          : log.origin === "tip" || log.origin === "remind"
                            ? "Mẹo có sẵn"
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
