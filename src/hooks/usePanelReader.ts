"use client";

import { useEffect, useRef } from "react";
import type { Worker as OcrWorker } from "tesseract.js";
import {
  Stable, ZIGAVN_PANELS, isGoldStar, parseClock, parseNick, parsePoints, textInk, textMask, valueKind,
  type PanelSide, type Pixels, type Region,
} from "@/lib/vision/zigavn-panels";

export interface PanelReading {
  /** Nick đã đọc ổn định (giống nhau 2 lần liên tiếp). */
  name: string | null;
  /** Điểm: trang nguồn chỉ hiện lúc chưa vào ván (trong ván ô đó là đồng hồ), nên thường là null. */
  points: string | null;
  /** Đồng hồ "mm:ss" ở lần đọc gần nhất; null khi ô đang hiện điểm (ngoài ván). */
  clock: string | null;
  stars: number | null;
}

export interface PanelsReading {
  me: PanelReading;
  opponent: PanelReading;
  /** Lúc chụp khung vừa đọc (Date.now()), để sân khấu tự đếm lùi giữa hai lần đọc. */
  at: number;
}

/** Đọc đồng hồ mỗi nhịp; nick (chậm hơn, ít đổi) mỗi NAME_EVERY nhịp. */
const TICK_MS = 1500;
const NAME_EVERY = 3;
const SIDES: PanelSide[] = ["me", "opponent"];

/** Phóng to mượt ảnh và thêm lề trắng: Tesseract đọc chữ nhỏ sát mép rất kém. */
function toCanvas(p: Pixels, scale: number, smooth: boolean): HTMLCanvasElement {
  const src = document.createElement("canvas");
  src.width = p.width;
  src.height = p.height;
  src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  const pad = 20;
  const out = document.createElement("canvas");
  out.width = p.width * scale + 2 * pad;
  out.height = p.height * scale + 2 * pad;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, pad, pad, p.width * scale, p.height * scale);
  return out;
}

/**
 * Đọc ô người chơi hai bên bàn cờ zigavn (nick, điểm/đồng hồ, sao) trong lúc đang theo dõi, gọi `onReading` sau mỗi
 * lượt đọc. Chạy Tesseract.js (tải ~ vài MB lần đầu) trong worker riêng; nhịp đọc do một Web Worker đếm giờ, như
 * useScreenMirror, để vẫn chạy khi tab này bị ẩn sau tab zigavn.
 */
export function usePanelReader(
  grabRegion: (r: Region) => Pixels | null,
  enabled: boolean,
  onReading: (r: PanelsReading) => void,
) {
  const grabRef = useRef(grabRegion);
  const onReadingRef = useRef(onReading);
  useEffect(() => {
    grabRef.current = grabRegion;
    onReadingRef.current = onReading;
  }, [grabRegion, onReading]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let busy = false;
    let tick = 0;
    let ocr: OcrWorker | null = null;
    const names = { me: new Stable<string>(), opponent: new Stable<string>() };

    const read = async (img: Pixels | null, kind: "name" | "gold" | "white"): Promise<string> => {
      if (!img || !ocr) return "";
      const canvas =
        kind === "name" ? toCanvas(textInk(img), 4, true) : toCanvas(textMask(img, kind, 1).pixels, 4, false);
      await ocr.setParameters({
        tessedit_char_whitelist: kind === "name" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_." : "0123456789:",
      });
      return (await ocr.recognize(canvas)).data.text;
    };

    // Sao đạt màu vàng; lấy cả một vùng nhỏ quanh tâm sao (tâm đo trên một ảnh chụp, lệch vài px là thường).
    const stars = (side: PanelSide): number | null => {
      let n = 0;
      for (const s of ZIGAVN_PANELS[side].stars) {
        const px = grabRef.current({ x0: s.x - 0.012, y0: s.y - 0.012, x1: s.x + 0.012, y1: s.y + 0.012 });
        if (!px) return null;
        let gold = 0;
        for (let i = 0; i < px.data.length; i += 4) if (isGoldStar(px.data[i], px.data[i + 1], px.data[i + 2])) gold++;
        if (gold >= 0.25 * px.width * px.height) n++;
      }
      return n;
    };

    const step = async () => {
      if (busy || !ocr || cancelled) return;
      busy = true;
      try {
        const at = Date.now();
        const withNames = tick++ % NAME_EVERY === 0;
        const out = {} as Record<PanelSide, PanelReading>;
        for (const side of SIDES) {
          const P = ZIGAVN_PANELS[side];
          if (withNames) names[side].push(parseNick(await read(grabRef.current(P.name), "name")));
          const value = grabRef.current(P.value);
          const kind = value ? valueKind(value) : null;
          const text = kind ? await read(value, kind) : "";
          // Đồng hồ thường là chữ vàng, nhưng trang nguồn có lúc hiện giờ bằng chữ trắng: chuỗi dạng giờ là đồng hồ.
          const clock = kind ? parseClock(text) : null;
          const points = kind === "white" ? parsePoints(text) : null;
          out[side] = { name: names[side].value, points, clock, stars: stars(side) };
        }
        if (!cancelled) onReadingRef.current({ ...out, at });
      } catch {
        // Một lượt đọc hỏng (khung chưa có, worker bận) thì bỏ qua, lượt sau đọc lại.
      } finally {
        busy = false;
      }
    };

    const ticker = new Worker(
      URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${TICK_MS});`], { type: "text/javascript" })),
    );
    ticker.onmessage = () => void step();
    void (async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      const w = await createWorker("eng");
      if (cancelled) {
        void w.terminate();
        return;
      }
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
      ocr = w;
    })();

    return () => {
      cancelled = true;
      ticker.terminate();
      void ocr?.terminate();
    };
  }, [enabled]);
}
