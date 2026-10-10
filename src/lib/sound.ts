// Âm thanh tổng hợp bằng Web Audio (không cần file âm thanh). Chỉ dùng phía trình duyệt.

export type SoundName = "move" | "capture" | "check" | "start" | "win" | "lose" | "draw" | "notify";

const KEY = "kd:sound";
let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<() => void>();

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(KEY) === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem(KEY, value ? "off" : "on");
  } catch {}
  for (const fn of listeners) fn();
}

export function subscribeMuted(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Tiếng gõ gỗ: nhiễu rất ngắn qua bộ lọc dải + âm trầm tắt nhanh. */
function knock(a: AudioContext, t: number, gain: number, freq: number) {
  const len = Math.floor(a.sampleRate * 0.05);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const noise = a.createBufferSource();
  noise.buffer = buf;
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = freq;
  band.Q.value = 2.5;
  const ng = a.createGain();
  ng.gain.value = gain;
  noise.connect(band).connect(ng).connect(a.destination);
  noise.start(t);

  const osc = a.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq / 7, t);
  osc.frequency.exponentialRampToValueAtTime(freq / 12, t + 0.09);
  const og = a.createGain();
  og.gain.setValueAtTime(gain * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  osc.connect(og).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}

function tone(a: AudioContext, t: number, freq: number, dur: number, gain: number, type: OscillatorType = "triangle") {
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playSound(name: SoundName) {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (name) {
    case "move":
      knock(a, t, 0.9, 1800);
      break;
    case "capture":
      knock(a, t, 1, 1500);
      knock(a, t + 0.07, 0.7, 2300);
      break;
    case "check":
      knock(a, t, 0.8, 1800);
      tone(a, t + 0.05, 784, 0.12, 0.22);
      tone(a, t + 0.18, 1047, 0.2, 0.22);
      break;
    case "start":
      [523, 659, 784].forEach((f, i) => tone(a, t + i * 0.11, f, 0.18, 0.18));
      break;
    case "win":
      [523, 659, 784, 1047].forEach((f, i) => tone(a, t + i * 0.11, f, 0.24, 0.2));
      break;
    case "lose":
      [392, 330, 262].forEach((f, i) => tone(a, t + i * 0.16, f, 0.3, 0.18, "sine"));
      break;
    case "draw":
      tone(a, t, 587, 0.25, 0.16, "sine");
      tone(a, t + 0.22, 587, 0.3, 0.16, "sine");
      break;
    case "notify":
      tone(a, t, 880, 0.14, 0.18, "sine");
      tone(a, t + 0.14, 1320, 0.26, 0.16, "sine");
      break;
  }
}
