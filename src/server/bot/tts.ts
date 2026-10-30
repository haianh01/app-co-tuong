import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const TTS_ENGINE: "piper" | "edge" =
  process.env.TTS_ENGINE === "edge" ? "edge" : "piper";
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

let piperReady: Promise<void> | null = null;
function startPiper(): Promise<void> {
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
  const res = await fetch(`http://127.0.0.1:${PIPER_PORT}/`, {
    method: "POST",
    body: text,
    signal: AbortSignal.timeout(10_000),
  });
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

const synthesize = (text: string) => {
  if (TTS_ENGINE === "piper") {
    return synthesizePiper(text).catch((err) => {
      console.warn("[TTS] Piper không khả dụng, dùng Edge TTS thay thế:", err);
      return synthesizeEdge(text);
    });
  }
  return synthesizeEdge(text);
};

export async function synthesizeWithRetry(text: string): Promise<Buffer> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await synthesize(text);
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

export function getSpeech(clean: string): Promise<Buffer> {
  // Khóa theo cả giọng: đổi giọng giữa chừng thì câu mới không lấy nhầm audio giọng cũ.
  const key = `${ttsVoice}|${clean}`;
  let p = speechCache.get(key);
  if (!p) {
    p = synthesizeWithRetry(clean);
    speechCache.set(key, p);
    p.catch(() => speechCache.delete(key));
    setTimeout(() => speechCache.delete(key), 120_000);
  }
  return p;
}

export function prepareSpeech(text: string): void {
  for (const piece of splitSentences(text)) {
    const clean = cleanForSpeech(piece);
    if (clean) getSpeech(clean).catch(() => {});
  }
}

export async function generateSpeechAudio(
  text: string,
): Promise<{ audio: Buffer; contentType: string }> {
  const sentences = splitSentences(text).map(cleanForSpeech).filter(Boolean);
  const pieces =
    TTS_ENGINE === "piper" && sentences.length > 1
      ? [sentences.join(" ")]
      : sentences;
  if (!pieces.length) {
    throw new Error("Không có văn bản để đọc");
  }

  const results = await Promise.allSettled(pieces.map(getSpeech));
  const parts = results.flatMap((r) =>
    r.status === "fulfilled" ? [r.value] : [],
  );
  if (!parts.length) {
    const rejected = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw rejected?.reason ?? new Error("Không tạo được giọng đọc");
  }

  const audio = Buffer.concat(parts);
  const contentType = TTS_ENGINE === "piper" ? "audio/wav" : "audio/mpeg";
  return { audio, contentType };
}
