import type { AiLevel } from "@/lib/xiangqi/ai";
import type { Side } from "@/lib/xiangqi/engine";

export interface PlaySettings {
  level: AiLevel;
  side: Side;
  /** Phút mỗi bên; 0 = không giới hạn. */
  minutes: number;
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
  return {
    level: (level >= 1 && level <= 5 ? Math.round(level) : 3) as AiLevel,
    side: first(params.side) === "b" ? "b" : "r",
    minutes: TIME_OPTIONS.some((t) => t.minutes === minutes) ? minutes : 10,
  };
}

export function settingsHref(s: PlaySettings): string {
  return `/play?level=${s.level}&side=${s.side}&time=${s.minutes}`;
}
