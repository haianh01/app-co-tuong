"use client";

import { useCallback, useState } from "react";
import { inCheck, opponent, toFen, type Board, type Move, type Side } from "@/lib/xiangqi/engine";
import {
  analyzePosition,
  type PositionAnalysisResult,
} from "@/lib/xiangqi/position-analysis";
import type { ThreatData } from "@/lib/xiangqi/threats";
import type { AiResult } from "@/lib/xiangqi/ai";

export interface UsePositionAnalysisReturn {
  result: PositionAnalysisResult | null;
  loading: boolean;
  error: string | null;
  analyze: (
    board: Board,
    turn: Side,
    historyMoves?: Move[],
    historyNotations?: string[],
  ) => Promise<PositionAnalysisResult>;
  reset: () => void;
}

export function usePositionAnalysis(): UsePositionAnalysisReturn {
  const [result, setResult] = useState<PositionAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setLoading(false);
    setError(null);
  }, []);

  const analyze = useCallback(
    async (
      board: Board,
      turn: Side,
      historyMoves: Move[] = [],
      historyNotations: string[] = [],
    ): Promise<PositionAnalysisResult> => {
      setLoading(true);
      setError(null);

      const fen = toFen({ board, turn });
      const kingInCheck = inCheck(board, turn);
      const opp = opponent(turn);

      let engineResult: AiResult | null = null;
      let threatResult: ThreatData | null = null;
      let engineErrorMsg: string | null = null;

      // 1. Gọi song song: /api/engine (MultiPV 3) và /api/engine/threat (nếu không bị chiếu)
      const fetchEngine = async () => {
        try {
          const res = await fetch("/api/engine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen, purpose: "analysis" }),
          });
          if (res.ok) {
            engineResult = (await res.json()) as AiResult;
          } else {
            engineErrorMsg = res.status === 503 ? "Engine chưa cài hoặc đang quá tải (503)" : `Lỗi engine (${res.status})`;
          }
        } catch {
          engineErrorMsg = "Không thể kết nối tới server engine";
        }
      };

      const fetchThreat = async () => {
        if (kingInCheck) {
          threatResult = {
            threatMove: null,
            score: 10_000,
            pv: [],
            isMate: false,
            opponent: opp,
            inCheck: true,
          };
          return;
        }

        try {
          const res = await fetch("/api/engine/threat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fen }),
          });
          if (res.ok) {
            threatResult = (await res.json()) as ThreatData;
          }
        } catch {
          // Threat lỗi hoặc 503 thì bỏ qua, phân tích tĩnh
        }
      };

      await Promise.all([fetchEngine(), fetchThreat()]);

      // 2. Chạy hàm phân tích 6 tầng toàn diện
      const analysis = analyzePosition({
        board,
        turn,
        historyMoves,
        historyNotations,
        engineResult,
        threatResult,
        engineError: engineErrorMsg,
      });

      setResult(analysis);
      setLoading(false);
      if (engineErrorMsg) {
        setError(engineErrorMsg);
      }
      return analysis;
    },
    [],
  );

  return {
    result,
    loading,
    error,
    analyze,
    reset,
  };
}
