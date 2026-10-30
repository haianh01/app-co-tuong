import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import type { TtsEngine } from "./types";

/** Bộ đọc đang dùng; đổi trên trang Trợ lý (setTtsEngine). TTS_ENGINE trong .env chỉ là giá trị ban đầu. */
let ttsEngine: TtsEngine = process.env.TTS_ENGINE === "edge" ? "edge" : "piper";
export const ttsEngineName = (): TtsEngine => ttsEngine;
export function setTtsEngine(engine: TtsEngine): void {
  ttsEngine = engine;
  edgeDownUntil = 0;
}
/** Giọng Edge TTS đang dùng; đổi được lúc đang live (setTtsVoice), mặc định theo TTS_VOICE. */
let ttsVoice = process.env.TTS_VOICE ?? "vi-VN-HoaiMyNeural";
export const EDGE_VOICES = { female: "vi-VN-HoaiMyNeural", male: "vi-VN-NamMinhNeural" } as const;
export function setTtsVoice(name: string): void {
  ttsVoice = name;
}
export const ttsVoiceName = (): string => ttsVoice;

const PIPER_DIR = path.resolve(process.cwd(), "../live-bot-demo");
const PIPER_VOICE = path.join(
  PIPER_DIR,
  ".piper/voices",
  `${process.env.PIPER_VOICE ?? "vi_VN-vais1000-medium"}.onnx`,
);
const PIPER_SPEED = process.env.PIPER_SPEED ?? "1.1";
const PIPER_PORT = Number(process.env.PIPER_PORT ?? 5002);

export const cleanForSpeech = (t: string): string =>
  t
    .replace(/&/g, " và ")
    .replace(/[\u200d\ufe0e\ufe0f]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}\s.,!?:;()/%+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Edge TTS (dịch vụ miễn phí không chính thức) hay bị Microsoft cắt giữa chừng (WebSocket 1006, "no turn.end"):
// hỏng một lần thì đọc bằng Piper trong 5 phút tới thay vì thử lại Edge mất vài giây mỗi câu.
const EDGE_COOLDOWN_MS = 5 * 60_000;
let edgeDownUntil = 0;
const piperActive = () => ttsEngine === "piper" || Date.now() < edgeDownUntil;

/** Đã có Piper nghe sẵn ở cổng (ví dụ của live-bot-demo đang chạy) thì dùng chung, khỏi bật thêm rồi đụng cổng. */
async function piperAlreadyRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${PIPER_PORT}/`, {
      method: "POST",
      body: "a",
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let piperReady: Promise<void> | null = null;
async function startPiper(): Promise<void> {
  if (await piperAlreadyRunning()) return;
  return spawnPiper();
}

function spawnPiper(): Promise<void> {
  const python = path.join(PIPER_DIR, ".piper/bin/python");
  const piperServerPy = path.join(PIPER_DIR, "piper_server.py");
  if (!existsSync(python) || !existsSync(PIPER_VOICE) || !existsSync(piperServerPy)) {
    return Promise.reject(
      new Error(
        `Chưa cài Piper hoặc thiếu giọng tại ${PIPER_VOICE}. Đang chuyển sang Edge TTS nếu cần.`,
      ),
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [
        piperServerPy,
        "--voice",
        PIPER_VOICE,
        "--port",
        String(PIPER_PORT),
        "--speed",
        PIPER_SPEED,
      ],
      {
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    child.stdout.on("data", (d: Buffer) => {
      if (d.toString().includes("ready")) resolve();
    });
    child.on("exit", (code) => {
      piperReady = null;
      reject(new Error(`Piper dừng (mã ${code})`));
    });
    process.on("exit", () => child.kill());
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.once(sig, () => {
        child.kill();
        process.exit(0);
      });
    }
  });
}

async function synthesizePiper(text: string): Promise<Buffer> {
  piperReady ??= startPiper();
  await piperReady;
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${PIPER_PORT}/`, {
      method: "POST",
      body: text,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Piper dùng chung (của demo) đã tắt: lần sau tự bật lại.
    piperReady = null;
    throw err;
  }
  if (!res.ok) throw new Error(`Piper lỗi ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function synthesizeEdge(text: string, voice = ttsVoice): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tts = new MsEdgeTTS();
    const timer = setTimeout(() => {
      tts.close();
      reject(new Error("Edge TTS timeout sau 10 giây"));
    }, 10_000);

    void (async () => {
      try {
        await tts.setMetadata(
          voice,
          OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
        );
        const { audioStream } = tts.toStream(text);
        const chunks: Buffer[] = [];
        audioStream.on("data", (c: Buffer) => chunks.push(c));
        audioStream.on("end", () => {
          clearTimeout(timer);
          tts.close();
          const audio = Buffer.concat(chunks);
          audio.length
            ? resolve(audio)
            : reject(new Error("Edge TTS trả về rỗng"));
        });
        audioStream.on("error", (err) => {
          clearTimeout(timer);
          tts.close();
          reject(err);
        });
      } catch (err) {
        clearTimeout(timer);
        tts.close();
        reject(err);
      }
    })();
  });
}

const synthesize = (text: string, piper: boolean) => {
  if (piper) {
    return synthesizePiper(text).catch((err) => {
      console.warn("[TTS] Piper không khả dụng, dùng Edge TTS thay thế:", err);
      return synthesizeEdge(text);
    });
  }
  return synthesizeEdge(text);
};

export async function synthesizeWithRetry(text: string, piper = piperActive()): Promise<Buffer> {
  let lastErr: unknown;
  // Edge chỉ thử một lần: hỏng thì generateSpeechAudio chuyển sang Piper ngay, đỡ để người xem chờ.
  const attempts = piper ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await synthesize(text, piper);
    } catch (err) {
      lastErr = err;
      console.error(
        `[TTS] Lần ${attempt} lỗi (${text.length} ký tự): ${String(err)}`,
      );
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  throw lastErr;
}

export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?;]+[.!?;]*/g) ?? [text];
  const out: string[] = [];
  for (const p of parts
    .map((x) => x.trim())
    .filter((x) => /[\p{L}\p{N}]/u.test(x))) {
    if (out.length && out[out.length - 1].length + p.length < 60) {
      out[out.length - 1] += " " + p;
    } else {
      out.push(p);
    }
  }
  return out;
}

const speechCache = new Map<string, Promise<Buffer>>();

export function getSpeech(clean: string, piper = piperActive()): Promise<Buffer> {
  // Khóa theo cả bộ đọc và giọng: đổi giọng giữa chừng thì câu mới không lấy nhầm audio giọng cũ.
  const key = `${piper ? "piper" : ttsVoice}|${clean}`;
  let p = speechCache.get(key);
  if (!p) {
    p = synthesizeWithRetry(clean, piper);
    speechCache.set(key, p);
    p.catch(() => speechCache.delete(key));
    setTimeout(() => speechCache.delete(key), 120_000);
  }
  return p;
}

/** Piper đọc cả đoạn một lần (file wav không nối được như mp3); Edge đọc từng câu cho nhanh. */
const speechPieces = (sentences: string[], piper: boolean) =>
  piper && sentences.length > 1 ? [sentences.join(" ")] : sentences;

/** speech.js xin audio từng câu (tách như splitSentences), nên chuẩn bị đúng từng câu đó để lúc xin là có ngay. */
export function prepareSpeech(text: string): void {
  const piper = piperActive();
  for (const sentence of splitSentences(text).map(cleanForSpeech).filter(Boolean)) getSpeech(sentence, piper).catch(() => {});
}

export async function generateSpeechAudio(
  text: string,
): Promise<{ audio: Buffer; contentType: string }> {
  const sentences = splitSentences(text).map(cleanForSpeech).filter(Boolean);
  if (!sentences.length) {
    throw new Error("Không có văn bản để đọc");
  }

  if (!piperActive()) {
    const results = await Promise.allSettled(sentences.map((s) => getSpeech(s, false)));
    const parts = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (parts.length === results.length) {
      return { audio: Buffer.concat(parts), contentType: "audio/mpeg" };
    }
    // Thiếu câu nào là mất ý: đọc lại cả đoạn bằng Piper.
    edgeDownUntil = Date.now() + EDGE_COOLDOWN_MS;
    console.warn("[TTS] Edge TTS lỗi, chuyển sang Piper trong 5 phút tới");
  }

  const [piece] = speechPieces(sentences, true);
  return { audio: await getSpeech(piece, true), contentType: "audio/wav" };
}
