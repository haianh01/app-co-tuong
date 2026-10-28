// Âm thanh tổng hợp bằng Web Audio (không cần file âm thanh). Chỉ dùng phía trình duyệt.

export type SoundName = "move" | "capture" | "check" | "start" | "win" | "lose" | "draw" | "notify";

/** Bộ tiếng đặt quân / ăn quân / chiếu, chọn ở trang Cài đặt và dùng chung cho mọi màn chơi trên thiết bị này. */
export type SoundPack =
  | "gothat"
  | "bango"
  | "su"
  | "thuytinh"
  | "kimloai"
  | "dong"
  | "da"
  | "nhua"
  | "ni"
  | "go"
  | "dap"
  | "mo"
  | "trong"
  | "pop"
  | "retro"
  | "dientu";

/** `recorded`: tiếng thu âm thật (public/sounds/pieces, CC0 của Kenney); còn lại tổng hợp bằng Web Audio. */
export const SOUND_PACKS: { id: SoundPack; name: string; desc: string; recorded?: boolean }[] = [
  { id: "gothat", name: "Gỗ thật", desc: "Quân gỗ đặt xuống bàn gỗ, thu âm thật", recorded: true },
  { id: "bango", name: "Ván gỗ dày", desc: "Tiếng gỗ dày vang, chắc như bàn cờ công viên", recorded: true },
  { id: "su", name: "Sứ men", desc: "Tiếng quân sứ chạm đĩa, trong và ngân nhẹ", recorded: true },
  { id: "thuytinh", name: "Thủy tinh", desc: "Tiếng keng của quân thủy tinh", recorded: true },
  { id: "kimloai", name: "Kim loại", desc: "Tiếng cạch kim loại gọn, sắc", recorded: true },
  { id: "dong", name: "Chuông đồng", desc: "Mỗi nước là một tiếng chuông đồng ngân dài", recorded: true },
  { id: "da", name: "Đá núi", desc: "Tiếng đá đập đá, thô và mạnh", recorded: true },
  { id: "nhua", name: "Quân nhựa", desc: "Tiếng tách khô của bộ cờ nhựa", recorded: true },
  { id: "ni", name: "Bàn nỉ", desc: "Đặt quân lên tấm nỉ, êm và trầm", recorded: true },
  { id: "go", name: "Gỗ cổ điển", desc: "Tiếng gõ gỗ quen thuộc của Kỳ Đài" },
  { id: "dap", name: "Đập quân", desc: "Đặt quân mạnh tay, có tiếng thịch của mặt bàn" },
  { id: "mo", name: "Mõ chùa", desc: "Tiếng cốc cốc của mõ gỗ, trầm và tròn" },
  { id: "trong", name: "Trống trận", desc: "Mỗi nước như một tiếng trống, ăn quân thì dồn hai tiếng" },
  { id: "pop", name: "Bong bóng", desc: "Tiếng bụp vui tai, hợp cho trẻ em" },
  { id: "retro", name: "Game 8-bit", desc: "Tiếng máy điện tử băng cổ điển" },
  { id: "dientu", name: "Điện tử", desc: "Tiếng bíp gọn gàng kiểu game" },
];

const DEFAULT_PACK: SoundPack = "go";
const KEY = "kd:sound";
const PACK_KEY = "kd:sound-pack";
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

let pack: SoundPack | null = null;
const packListeners = new Set<() => void>();

const isPack = (v: unknown): v is SoundPack => SOUND_PACKS.some((p) => p.id === v);

export function getSoundPack(): SoundPack {
  if (pack === null) {
    try {
      const v = localStorage.getItem(PACK_KEY);
      pack = isPack(v) ? v : DEFAULT_PACK;
    } catch {
      pack = DEFAULT_PACK;
    }
  }
  return pack;
}

export function setSoundPack(value: SoundPack) {
  pack = value;
  if (ctx) loadPack(ctx, value);
  try {
    localStorage.setItem(PACK_KEY, value);
  } catch {}
  for (const fn of packListeners) fn();
}

/** Theo dõi bộ âm thanh, kể cả khi đổi ở tab khác (vd. đổi trong Cài đặt khi trang Tường thuật đang mở). */
export function subscribeSoundPack(fn: () => void) {
  packListeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PACK_KEY) return;
    pack = null;
    fn();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    packListeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    void loadPack(ctx, getSoundPack());
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Tiếng thu âm: tải và giải mã một lần mỗi file; chưa tải xong thì tạm phát tiếng gỗ tổng hợp.
const samples = new Map<string, AudioBuffer | Promise<AudioBuffer | null> | null>();
const isRecorded = (p: SoundPack) => SOUND_PACKS.some((x) => x.id === p && x.recorded);

function loadSample(a: AudioContext, name: string): Promise<AudioBuffer | null> {
  const got = samples.get(name);
  if (got === null) return Promise.resolve(null);
  if (got) return got instanceof Promise ? got : Promise.resolve(got);
  const pending = fetch(`/sounds/pieces/${name}.mp3`)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
    .then((data) => a.decodeAudioData(data))
    .then((buf) => {
      samples.set(name, buf);
      return buf;
    })
    .catch(() => {
      samples.set(name, null);
      return null;
    });
  samples.set(name, pending);
  return pending;
}

function loadPack(a: AudioContext, p: SoundPack) {
  if (!isRecorded(p)) return Promise.resolve();
  return Promise.all([loadSample(a, `${p}-move`), loadSample(a, `${p}-capture`)]).then(() => undefined);
}

/** Phát tiếng thu âm nếu đã tải xong; trả về false để bên gọi phát tiếng thay thế. */
function playSample(a: AudioContext, t: number, name: string, gain = 1): boolean {
  const buf = samples.get(name);
  if (!buf || buf instanceof Promise) return false;
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(g).connect(a.destination);
  src.start(t);
  return true;
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

/** Tiếng thịch trầm của mặt bàn khi quân bị đập mạnh. */
function thud(a: AudioContext, t: number, gain: number) {
  const osc = a.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.2);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + 0.28);
}

/** Một nốt có độ cao trượt từ `f1` xuống `f2`, tắt nhanh: nền cho mõ, trống, bong bóng. */
function sweep(a: AudioContext, t: number, f1: number, f2: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, t);
  osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Tiếng đặt quân (`capture`: ăn quân) theo bộ âm thanh. */
function piece(a: AudioContext, t: number, p: SoundPack, capture: boolean) {
  if (isRecorded(p)) {
    if (!playSample(a, t, `${p}-${capture ? "capture" : "move"}`)) {
      void loadPack(a, p);
      piece(a, t, "go", capture);
    }
    return;
  }
  switch (p) {
    case "go":
      knock(a, t, capture ? 1 : 0.9, capture ? 1500 : 1800);
      if (capture) knock(a, t + 0.07, 0.7, 2300);
      break;
    case "dap":
      thud(a, t, capture ? 0.95 : 0.75);
      knock(a, t, 1, capture ? 1000 : 1200);
      if (capture) knock(a, t + 0.08, 0.8, 1800);
      break;
    case "mo":
      sweep(a, t, 900, 760, 0.16, 0.45);
      knock(a, t, 0.45, 1400);
      if (capture) {
        sweep(a, t + 0.14, 1050, 900, 0.16, 0.4);
        knock(a, t + 0.14, 0.4, 1600);
      }
      break;
    case "trong":
      sweep(a, t, 160, 70, 0.3, 0.9);
      knock(a, t, 0.5, 700);
      if (capture) {
        sweep(a, t + 0.13, 180, 75, 0.3, 0.9);
        knock(a, t + 0.13, 0.6, 900);
      }
      break;
    case "pop":
      sweep(a, t, 380, 1100, 0.07, 0.35);
      if (capture) sweep(a, t + 0.08, 500, 1500, 0.07, 0.3);
      break;
    case "retro":
      sweep(a, t, capture ? 330 : 520, capture ? 160 : 260, 0.08, 0.12, "square");
      if (capture) sweep(a, t + 0.08, 880, 1320, 0.08, 0.1, "square");
      break;
    case "dientu":
      tone(a, t, capture ? 660 : 880, 0.07, 0.16, "square");
      if (capture) tone(a, t + 0.07, 990, 0.09, 0.14, "square");
      break;
  }
}

/** Nghe thử một bộ âm thanh: đi quân rồi ăn quân (vẫn phát khi đang tắt tiếng, vì người dùng chủ động bấm). */
export function previewSoundPack(p: SoundPack) {
  const a = audio();
  if (!a) return;
  void loadPack(a, p).then(() => {
    const t = a.currentTime + 0.01;
    piece(a, t, p, false);
    piece(a, t + (p === "dong" ? 0.9 : 0.45), p, true);
  });
}

export function playSound(name: SoundName) {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.01;
  switch (name) {
    case "move":
      piece(a, t, getSoundPack(), false);
      break;
    case "capture":
      piece(a, t, getSoundPack(), true);
      break;
    case "check":
      piece(a, t, getSoundPack(), false);
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
