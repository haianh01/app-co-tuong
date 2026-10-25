import type { AiLevel } from "@/lib/xiangqi/ai";
import { parseFen, type Side } from "@/lib/xiangqi/engine";

export interface PlaySettings {
  level: AiLevel;
  side: Side;
  /** Phút mỗi bên; 0 = không giới hạn. */
  minutes: number;
  fen?: string;
  lesson?: number;
}

export const TIME_OPTIONS = [
  { minutes: 0, label: "Không giới hạn" },
  { minutes: 5, label: "5 phút" },
  { minutes: 10, label: "10 phút" },
  { minutes: 20, label: "20 phút" },
];

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseSettings(params: Params): PlaySettings {
  const level = Number(first(params.level));
  const minutes = Number(first(params.time));
  const fen = first(params.fen);
  const lesson = Number(first(params.lesson)) || undefined;

  let side: Side = first(params.side) === "b" ? "b" : "r";
  if (fen && !params.side) {
    try {
      side = parseFen(fen).turn;
    } catch {}
  }

  return {
    level: (level >= 1 && level <= 5 ? Math.round(level) : 3) as AiLevel,
    side,
    minutes: TIME_OPTIONS.some((t) => t.minutes === minutes) ? minutes : 10,
    fen: fen || undefined,
    lesson,
  };
}

export function settingsHref(s: PlaySettings): string {
  const params = new URLSearchParams({
    level: String(s.level),
    side: s.side,
    time: String(s.minutes),
  });
  if (s.fen) params.set("fen", s.fen);
  if (s.lesson) params.set("lesson", String(s.lesson));
  return `/play?${params.toString()}`;
}
