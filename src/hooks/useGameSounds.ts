"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { Side } from "@/lib/xiangqi/engine";
import type { GameResult, PlayedMove } from "@/lib/xiangqi/game";
import { isMuted, playSound, setMuted, subscribeMuted } from "@/lib/sound";

/** Phát tiếng đặt quân / ăn quân / chiếu khi có nước mới (không phát khi lùi nước hay tải lại ván). */
export function useMoveSounds(moves: PlayedMove[]) {
  const count = moves.length;
  const last = moves[count - 1];
  const prev = useRef(count);
  useEffect(() => {
    if (count === prev.current + 1 && last) playSound(last.check ? "check" : last.captured ? "capture" : "move");
    prev.current = count;
  }, [count, last]);
}

/** Phát nhạc thắng/thua/hòa một lần khi ván vừa kết thúc. */
export function useResultSound(result: GameResult | null, viewer: Side | null) {
  const played = useRef(result !== null);
  useEffect(() => {
    if (!result) {
      played.current = false;
      return;
    }
    if (played.current) return;
    played.current = true;
    if (!result.winner) playSound("draw");
    else if (viewer === null || result.winner === viewer) playSound("win");
    else playSound("lose");
  }, [result, viewer]);
}

export function useMuted(): [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return [muted, setMuted];
}
