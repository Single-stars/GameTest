import type { GameResult } from "./types.ts";

export function resolveMultiplayerWinnerText(selfResult: GameResult | null, opponentResult: GameResult | null) {
  if (!selfResult || !opponentResult) return "等待结果";

  if (selfResult.passed && !opponentResult.passed) return "你赢了";
  if (!selfResult.passed && opponentResult.passed) return "你输了";

  if (selfResult.passed && opponentResult.passed) {
    const selfTime = selfResult.timeMs ?? Number.POSITIVE_INFINITY;
    const opponentTime = opponentResult.timeMs ?? Number.POSITIVE_INFINITY;
    if (selfTime < opponentTime) return "你赢了";
    if (selfTime > opponentTime) return "你输了";
  }

  if (selfResult.score > opponentResult.score) return "你赢了";
  if (selfResult.score < opponentResult.score) return "你输了";
  return "平局";
}
