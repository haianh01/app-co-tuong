import { playSound } from "./sound";
import { DEFAULT_STAGE_VOICE_LINES, type StageVoiceLines } from "@/app/tuong-thuat/stage-sync";
import type { StageVoiceEvent } from "./stage-protocol";

/** Đường dẫn các file âm thanh thu sẵn chất lượng cao trong /public/sounds/ */
export const STAGE_AUDIO_FILES: Record<StageVoiceEvent, string> = {
  check: "/sounds/cuu-tram.mp3",
  win: "/sounds/thang.mp3",
  loss: "/sounds/thua.mp3",
};

let audioUnlocked = false;

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

/**
 * Mở khóa âm thanh trình duyệt khi người dùng tương tác lần đầu (click/tap).
 */
export function unlockAudio() {
  if (typeof window === "undefined" || audioUnlocked) return;
  audioUnlocked = true;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      const dummy = new AC();
      if (dummy.state === "suspended") void dummy.resume();
    }
  } catch {}
}

/**
 * Phát file âm thanh audio mp3 từ /public/sounds/
 */
export function playAudioFile(url: string, volume = 1.0): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  try {
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    const p = audio.play();
    if (p !== undefined) {
      return p
        .then(() => true)
        .catch((err) => {
          console.warn("Audio play blocked or unavailable:", err);
          return false;
        });
    }
    return Promise.resolve(true);
  } catch (e) {
    console.warn("Audio constructor error:", e);
    return Promise.resolve(false);
  }
}

/**
 * Phát câu nói bằng Web Speech API (SpeechSynthesis) với ngôn ngữ tiếng Việt (vi-VN).
 * Dùng cho các câu nói tùy chỉnh mà người dùng tự gõ vào.
 */
export function speakStageVoice(text: string, options?: { rate?: number; pitch?: number; volume?: number }): boolean {
  if (typeof window === "undefined" || !text.trim()) return false;
  if (!("speechSynthesis" in window)) return false;

  try {
    // Dừng câu nói trước đó để tránh xếp hàng dồn
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "vi-VN";
    utterance.rate = options?.rate ?? 1.05;
    utterance.pitch = options?.pitch ?? 1.0;
    utterance.volume = options?.volume ?? 1.0;

    // Ưu tiên chọn giọng đọc tiếng Việt nếu trình duyệt có
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find((v) => v.lang.toLowerCase().replace(/_/g, "-").startsWith("vi"));
    if (viVoice) {
      utterance.voice = viVoice;
    }

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    console.warn("Lỗi phát giọng nói stage-voice:", err);
    return false;
  }
}

/** Lấy nội dung câu thoại theo sự kiện */
export function getVoiceLineText(event: StageVoiceEvent, lines?: Partial<StageVoiceLines>): string {
  const merged: StageVoiceLines = { ...DEFAULT_STAGE_VOICE_LINES, ...lines };
  return merged[event] || DEFAULT_STAGE_VOICE_LINES[event];
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[.,!?:;""'']/g, "");
}

/**
 * Phát âm thanh sự kiện sân khấu:
 * 1. Nếu là câu mặc định (hoặc tương tự): phát file audio mp3 thực tế chất lượng cao.
 * 2. Nếu là câu tùy chỉnh: gọi Web Speech API (SpeechSynthesis).
 * 3. Đi kèm âm thanh Web Audio (tiếng gõ chiếu / kèn thắng / chuông buồn).
 * Trả về nội dung câu nói nếu được kích hoạt.
 */
export function playStageVoiceEvent(
  event: StageVoiceEvent,
  lines?: Partial<StageVoiceLines>,
): string | null {
  const merged: StageVoiceLines = { ...DEFAULT_STAGE_VOICE_LINES, ...lines };
  if (!merged.enabled) return null;

  const text = merged[event]?.trim();
  if (!text) return null;

  unlockAudio();

  // Phát hiệu ứng âm thanh cờ
  if (event === "check") {
    playSound("check");
  } else if (event === "win") {
    playSound("win");
  } else if (event === "loss") {
    playSound("lose");
  }

  const defaultText = DEFAULT_STAGE_VOICE_LINES[event];
  const isDefault = normalize(text) === normalize(defaultText);

  // Nếu câu nói là câu mặc định, ưu tiên phát file mp3 chuẩn thu sẵn (100% không bị câm/lỗi thiếu voice)
  if (isDefault) {
    const soundUrl = STAGE_AUDIO_FILES[event];
    if (soundUrl) {
      setTimeout(() => {
        void playAudioFile(soundUrl);
      }, event === "check" ? 80 : 180);
    }
  } else {
    // Câu tùy chỉnh người dùng gõ vào: phát bằng SpeechSynthesis
    setTimeout(() => {
      const ok = speakStageVoice(text, { pitch: 1.05, rate: 1.05 });
      // Nếu browser không có speech synthesis, vẫn thử phát file âm thanh nếu có từ khóa khớp
      if (!ok && STAGE_AUDIO_FILES[event]) {
        void playAudioFile(STAGE_AUDIO_FILES[event]);
      }
    }, event === "check" ? 80 : 180);
  }

  return text;
}
