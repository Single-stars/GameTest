import type { GameResult } from "./types.ts";
import type { MultiplayerPlayMode } from "./level-select.ts";
import { compareMultiplayerResults } from "./result-breakdown.ts";

export function resolveMultiplayerWinnerText(
  selfResult: GameResult | null,
  opponentResult: GameResult | null,
  playMode: MultiplayerPlayMode = "versus",
) {
  if (!selfResult || !opponentResult) return "等待结果";

  if (playMode === "co-op") {
    return selfResult.passed && opponentResult.passed ? "合作成功" : "合作失败";
  }

  if (selfResult.breakdown?.outcome === "forfeit" || opponentResult.breakdown?.outcome === "opponent-forfeit") {
    return "你认输了";
  }
  if (opponentResult.breakdown?.outcome === "forfeit" || selfResult.breakdown?.outcome === "opponent-forfeit") {
    return "对方认输，你赢了";
  }

  const comparison = compareMultiplayerResults(selfResult, opponentResult);
  if (comparison < 0) return "你赢了";
  if (comparison > 0) return "你输了";
  return "平局";
}
