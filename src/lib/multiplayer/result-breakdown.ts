import type {
  GameResult,
  GameResultBreakdown,
  GameResultBreakdownEntry,
  GameResultBreakdownFormulaRow,
  GameResultOutcome,
  SelfGameState,
} from "@/features/game-sync/types";
import type { MiniGameLevelConfig } from "@/lib/mini-games";

import { getMultiplayerLevelRules, type MultiplayerSettlementMetric } from "./rules.ts";

const MULTIPLAYER_TIME_COMPARE_PRECISION_MS = 100;

export type MultiplayerResultBreakdownStats = {
  elapsedMs: number;
  failures?: number;
  passed: boolean;
  progress?: number;
  collected?: number;
  collectibleCount?: number;
  aimHits?: number;
  aimMisses?: number;
  aimFlyOuts?: number;
  aimDecoyHits?: number;
  aimTargetCount?: number;
  knifeHits?: number;
  knifeTimeouts?: number;
  knifeCollisions?: number;
  knifeDangerHits?: number;
  knifeOvertime?: boolean;
};

export type ForfeitResultOptions = {
  didForfeit: boolean;
  matchId: string;
  state: SelfGameState | null;
};

function finiteNumber(value: number | null | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function wholeCount(value: number | null | undefined) {
  return Math.max(0, Math.round(finiteNumber(value)));
}

function clampProgress(value: number | null | undefined) {
  return Math.max(0, Math.min(1, finiteNumber(value)));
}

function metricEntry(
  metric: MultiplayerSettlementMetric,
  value: number | string,
  options: Pick<GameResultBreakdownEntry, "amount" | "displayOnly"> = {},
): GameResultBreakdownEntry {
  return {
    key: metric.key,
    label: metric.label,
    unit: metric.unit,
    value,
    amount: options.amount,
    displayOnly: options.displayOnly || metric.displayOnly || undefined,
  };
}

function formulaRow(
  entry: GameResultBreakdownEntry,
  operation: GameResultBreakdownFormulaRow["operation"],
): GameResultBreakdownFormulaRow {
  return {
    ...entry,
    operation,
  };
}

function findMetric(level: MiniGameLevelConfig, key: string) {
  const rules = getMultiplayerLevelRules(level);
  return [...rules.settlement.baseMetrics, ...rules.settlement.adjustments].find((item) => item.key === key);
}

function finishTimeEntry(level: MiniGameLevelConfig, elapsedMs: number) {
  const metric = findMetric(level, "finish-time");
  return metric
    ? metricEntry(metric, elapsedMs, { amount: elapsedMs })
    : {
        key: "finish-time",
        label: "完成时间",
        unit: "ms" as const,
        value: elapsedMs,
        amount: elapsedMs,
      };
}

function reviveEntry(level: MiniGameLevelConfig, failures: number) {
  const metric = findMetric(level, "revive-count");
  if (!metric) return null;
  return metricEntry(metric, failures, { displayOnly: true });
}

function collectibleEntry(level: MiniGameLevelConfig, collected: number) {
  const metric = findMetric(level, "collectible-time-bonus");
  if (!metric) return null;
  const valuePerEvent = finiteNumber(metric.valuePerEvent, -2000);
  return metricEntry(metric, collected, { amount: collected * valuePerEvent });
}

function countedAdjustmentEntry(level: MiniGameLevelConfig, key: string, value: number) {
  const metric = findMetric(level, key);
  if (!metric) return null;
  if (metric.displayOnly || typeof metric.valuePerEvent !== "number") {
    return metricEntry(metric, value, { displayOnly: metric.displayOnly });
  }
  const valuePerEvent = finiteNumber(metric.valuePerEvent, 0);
  return metricEntry(metric, value, { amount: value * valuePerEvent });
}

function aimHitEntry(level: MiniGameLevelConfig, hits: number) {
  const metric = findMetric(level, "aim-hit-score") ?? findMetric(level, "aim-hit-count");
  if (!metric) return null;
  const valuePerEvent = finiteNumber(metric.valuePerEvent, 1);
  return metricEntry(metric, hits, { amount: hits * valuePerEvent });
}

function aimTargetCountEntry(targetCount: number): GameResultBreakdownEntry | null {
  if (targetCount <= 0) return null;
  return {
    key: "aim-target-count",
    label: "进靶总数",
    unit: "count",
    value: targetCount,
    displayOnly: true,
  };
}

function compactEntries(entries: Array<GameResultBreakdownEntry | null>) {
  return entries.filter((item): item is GameResultBreakdownEntry => item !== null);
}

function operationForAmount(amount: number | undefined): GameResultBreakdownFormulaRow["operation"] {
  if (typeof amount !== "number") return "note";
  if (amount < 0) return "subtract";
  if (amount > 0) return "add";
  return "base";
}

function adjustmentRows(adjustments: GameResultBreakdownEntry[]) {
  return adjustments.map((entry) => formulaRow(entry, entry.displayOnly ? "note" : operationForAmount(entry.amount)));
}

function buildKnifeBreakdown(level: MiniGameLevelConfig, stats: MultiplayerResultBreakdownStats): GameResultBreakdown {
  const rules = getMultiplayerLevelRules(level);
  const knifeHits = wholeCount(stats.knifeHits);
  const knifeTimeouts = wholeCount(stats.knifeTimeouts);
  const adjustments = compactEntries([
    countedAdjustmentEntry(level, "knife-hit-score", knifeHits),
    countedAdjustmentEntry(level, "knife-timeout-penalty", knifeTimeouts),
  ]);
  const finalScore = adjustments.reduce((total, item) => total + finiteNumber(item.amount), 0);
  const outcome: GameResultOutcome = stats.passed ? "completed" : "failed";
  const formulaRows = adjustmentRows(adjustments);

  return {
    version: 1,
    gameId: level.gameId,
    levelId: level.levelId,
    kind: "score",
    title: rules.settlement.resultTitle,
    winnerText: rules.settlement.winnerText,
    outcome,
    base: [],
    adjustments,
    formulaRows,
    final: {
      label: "主局总分",
      lowerIsBetter: false,
      unit: "point",
      value: finalScore,
    },
    tiebreakerText: rules.settlement.tiebreakerText,
  };
}

function buildAimScoreBreakdown(level: MiniGameLevelConfig, stats: MultiplayerResultBreakdownStats): GameResultBreakdown {
  const rules = getMultiplayerLevelRules(level);
  const aimHits = wholeCount(stats.aimHits);
  const aimMisses = wholeCount(stats.aimMisses);
  const aimFlyOuts = wholeCount(stats.aimFlyOuts);
  const aimDecoyHits = wholeCount(stats.aimDecoyHits);
  const aimTargetCount = wholeCount(stats.aimTargetCount);
  const hitEntry = aimHitEntry(level, aimHits);
  const targetCountEntry = aimTargetCountEntry(aimTargetCount);
  const adjustments = compactEntries([
    countedAdjustmentEntry(level, "aim-miss-penalty", aimMisses),
    countedAdjustmentEntry(level, "aim-flyout-penalty", aimFlyOuts),
    countedAdjustmentEntry(level, "aim-decoy-penalty", aimDecoyHits),
  ]);
  const baseRows = compactEntries([hitEntry]).map((entry) => formulaRow(entry, operationForAmount(entry.amount)));
  const finalScore = [...compactEntries([hitEntry]), ...adjustments].reduce(
    (total, item) => total + (item.displayOnly ? 0 : finiteNumber(item.amount)),
    0,
  );

  return {
    version: 1,
    gameId: level.gameId,
    levelId: level.levelId,
    kind: "score",
    title: rules.settlement.resultTitle,
    winnerText: rules.settlement.winnerText,
    outcome: stats.passed ? "completed" : "failed",
    base: compactEntries([hitEntry]),
    adjustments,
    formulaRows: [...baseRows, ...adjustmentRows(adjustments), ...compactEntries([targetCountEntry]).map((entry) => formulaRow(entry, "note"))],
    final: {
      label: "移动靶总分",
      lowerIsBetter: false,
      unit: "point",
      value: finalScore,
    },
    tiebreakerText: rules.settlement.tiebreakerText,
  };
}

function buildTimeBreakdown(level: MiniGameLevelConfig, stats: MultiplayerResultBreakdownStats): GameResultBreakdown {
  const rules = getMultiplayerLevelRules(level);
  const elapsedMs = Math.max(0, Math.round(finiteNumber(stats.elapsedMs)));
  const failures = wholeCount(stats.failures);
  const collected = wholeCount(stats.collected);
  const collectibleCount = wholeCount(stats.collectibleCount);
  const aimMisses = wholeCount(stats.aimMisses);
  const aimFlyOuts = wholeCount(stats.aimFlyOuts);
  const aimDecoyHits = wholeCount(stats.aimDecoyHits);
  const finishEntry = finishTimeEntry(level, elapsedMs);
  const adjustments = compactEntries([
    reviveEntry(level, failures),
    collectibleCount > 0 ? collectibleEntry(level, collected) : null,
    countedAdjustmentEntry(level, "aim-miss-penalty", aimMisses),
    countedAdjustmentEntry(level, "aim-flyout-penalty", aimFlyOuts),
    countedAdjustmentEntry(level, "aim-decoy-penalty", aimDecoyHits),
  ]);
  const adjustmentTotalMs = adjustments.reduce((total, item) => total + (item.displayOnly ? 0 : finiteNumber(item.amount)), 0);
  const finalTimeMs = Math.max(0, elapsedMs + adjustmentTotalMs);
  const finalLabel = rules.settlement.kind === "effective-time" ? "最终用时" : "完成时间";

  return {
    version: 1,
    gameId: level.gameId,
    levelId: level.levelId,
    kind: rules.settlement.kind,
    title: rules.settlement.resultTitle,
    winnerText: rules.settlement.winnerText,
    outcome: stats.passed ? "completed" : "failed",
    base: [finishEntry],
    adjustments,
    formulaRows: [formulaRow(finishEntry, "base"), ...adjustmentRows(adjustments)],
    final: {
      label: finalLabel,
      lowerIsBetter: true,
      unit: "ms",
      value: finalTimeMs,
    },
    tiebreakerText: rules.settlement.tiebreakerText,
  };
}

export function buildMultiplayerResultBreakdown(
  level: MiniGameLevelConfig,
  stats: MultiplayerResultBreakdownStats,
): GameResultBreakdown {
  const rules = getMultiplayerLevelRules(level);
  if (rules.settlement.kind === "score" && level.gameId === "aim") return buildAimScoreBreakdown(level, stats);
  if (rules.settlement.kind === "score") return buildKnifeBreakdown(level, stats);
  return buildTimeBreakdown(level, stats);
}

export function buildForfeitResult(level: MiniGameLevelConfig, options: ForfeitResultOptions): GameResult {
  const progress = clampProgress(options.state?.progress);
  const score = Math.round(finiteNumber(options.state?.score, progress * 1000));
  const elapsedMs = Math.max(0, Math.round(finiteNumber(options.state?.elapsedMs)));
  const outcome: GameResultOutcome = options.didForfeit ? "forfeit" : "opponent-forfeit";
  const winnerText = options.didForfeit ? "你认输了" : "对方认输，你赢了";
  const progressEntry: GameResultBreakdownEntry = {
    key: "current-progress",
    label: "当前进度",
    unit: "note",
    value: `${Math.round(progress * 100)}%`,
    displayOnly: true,
  };
  const scoreEntry: GameResultBreakdownEntry = {
    key: "current-score",
    label: "当前分数",
    unit: "point",
    value: score,
    displayOnly: true,
  };
  const elapsedEntry: GameResultBreakdownEntry = {
    key: "current-time",
    label: "当前用时",
    unit: "ms",
    value: elapsedMs,
    displayOnly: true,
  };
  const forfeitEntry: GameResultBreakdownEntry = {
    key: "forfeit-result",
    label: "认输结果",
    unit: "note",
    value: options.didForfeit ? "本方认输" : "对方认输",
    displayOnly: true,
  };

  return {
    matchId: options.matchId,
    passed: false,
    score,
    timeMs: elapsedMs,
    breakdown: {
      version: 1,
      gameId: level.gameId,
      levelId: level.levelId,
      kind: "score",
      title: "认输结算",
      winnerText,
      outcome,
      forfeitBy: options.didForfeit ? "self" : "opponent",
      base: [progressEntry, scoreEntry, elapsedEntry],
      adjustments: [forfeitEntry],
      formulaRows: [
        formulaRow(progressEntry, "note"),
        formulaRow(scoreEntry, "note"),
        formulaRow(elapsedEntry, "note"),
        formulaRow(forfeitEntry, "note"),
      ],
      final: {
        label: "当前分数",
        lowerIsBetter: false,
        unit: "point",
        value: score,
      },
    },
  };
}

function outcomeSignal(result: GameResult) {
  const outcome = result.breakdown?.outcome;
  if (outcome === "opponent-forfeit" || outcome === "overtime-win") return 1;
  if (outcome === "forfeit" || outcome === "overtime-loss") return -1;
  return 0;
}

function compareNumberValues(selfValue: number, opponentValue: number, lowerIsBetter: boolean) {
  if (selfValue === opponentValue) return 0;
  if (lowerIsBetter) return selfValue < opponentValue ? -1 : 1;
  return selfValue > opponentValue ? -1 : 1;
}

function roundMultiplayerTimeForComparison(value: number) {
  return Math.round(value / MULTIPLAYER_TIME_COMPARE_PRECISION_MS) * MULTIPLAYER_TIME_COMPARE_PRECISION_MS;
}

function breakdownRows(result: GameResult) {
  const breakdown = result.breakdown;
  if (!breakdown) return [];
  return breakdown.formulaRows ?? [...breakdown.base, ...breakdown.adjustments];
}

function numericBreakdownValue(result: GameResult, key: string) {
  const value = breakdownRows(result).find((item) => item.key === key)?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function aimMistakeCount(result: GameResult) {
  return ["aim-miss-penalty", "aim-flyout-penalty", "aim-decoy-penalty"].reduce((total, key) => {
    return total + (numericBreakdownValue(result, key) ?? 0);
  }, 0);
}

function compareAimScoreBreakdown(selfResult: GameResult, opponentResult: GameResult) {
  if (selfResult.breakdown?.gameId !== "aim" || opponentResult.breakdown?.gameId !== "aim") return null;
  if (selfResult.breakdown.kind !== "score" || opponentResult.breakdown.kind !== "score") return null;
  const scoreComparison = compareNumberValues(selfResult.breakdown.final.value, opponentResult.breakdown.final.value, false);
  if (scoreComparison !== 0) return scoreComparison;
  const selfHits = numericBreakdownValue(selfResult, "aim-hit-score") ?? numericBreakdownValue(selfResult, "aim-hit-count") ?? 0;
  const opponentHits = numericBreakdownValue(opponentResult, "aim-hit-score") ?? numericBreakdownValue(opponentResult, "aim-hit-count") ?? 0;
  const hitComparison = compareNumberValues(selfHits, opponentHits, false);
  if (hitComparison !== 0) return hitComparison;
  return compareNumberValues(aimMistakeCount(selfResult), aimMistakeCount(opponentResult), true);
}

function compareBreakdownFinal(selfResult: GameResult, opponentResult: GameResult) {
  if (!selfResult.breakdown || !opponentResult.breakdown) return null;
  const aimComparison = compareAimScoreBreakdown(selfResult, opponentResult);
  if (aimComparison !== null) return aimComparison;
  const selfFinalValue =
    selfResult.breakdown.final.unit === "ms"
      ? roundMultiplayerTimeForComparison(selfResult.breakdown.final.value)
      : selfResult.breakdown.final.value;
  const opponentFinalValue =
    opponentResult.breakdown.final.unit === "ms"
      ? roundMultiplayerTimeForComparison(opponentResult.breakdown.final.value)
      : opponentResult.breakdown.final.value;
  return compareNumberValues(
    selfFinalValue,
    opponentFinalValue,
    selfResult.breakdown.final.lowerIsBetter,
  );
}

function isNormalPointScoreResult(result: GameResult) {
  const breakdown = result.breakdown;
  if (!breakdown) return false;
  if (breakdown.kind !== "score" || breakdown.final.unit !== "point") return false;
  if (breakdown.outcome === "forfeit" || breakdown.outcome === "opponent-forfeit") return false;
  if (breakdown.outcome === "overtime-win" || breakdown.outcome === "overtime-loss") return false;
  return true;
}

export function getMultiplayerScoreLead(selfResult: GameResult, opponentResult: GameResult) {
  if (!isNormalPointScoreResult(selfResult) || !isNormalPointScoreResult(opponentResult)) return 0;
  return Math.max(0, selfResult.breakdown!.final.value - opponentResult.breakdown!.final.value);
}

export function compareMultiplayerResults(selfResult: GameResult, opponentResult: GameResult) {
  const selfSignal = outcomeSignal(selfResult);
  const opponentSignal = outcomeSignal(opponentResult);
  if (selfSignal !== opponentSignal) return selfSignal > opponentSignal ? -1 : 1;

  if (selfResult.passed && !opponentResult.passed) return -1;
  if (!selfResult.passed && opponentResult.passed) return 1;

  const breakdownComparison = compareBreakdownFinal(selfResult, opponentResult);
  if (breakdownComparison !== null) return breakdownComparison;

  const scoreSettlement = selfResult.breakdown?.kind === "score" || opponentResult.breakdown?.kind === "score";
  if (scoreSettlement) {
    if (selfResult.score > opponentResult.score) return -1;
    if (selfResult.score < opponentResult.score) return 1;
  }

  if (selfResult.passed && opponentResult.passed) {
    const selfTime = roundMultiplayerTimeForComparison(selfResult.timeMs ?? Number.POSITIVE_INFINITY);
    const opponentTime = roundMultiplayerTimeForComparison(opponentResult.timeMs ?? Number.POSITIVE_INFINITY);
    if (selfTime < opponentTime) return -1;
    if (selfTime > opponentTime) return 1;
  }

  if (!scoreSettlement) {
    if (selfResult.score > opponentResult.score) return -1;
    if (selfResult.score < opponentResult.score) return 1;
  }
  return 0;
}

export function shouldStartMultiplayerTiebreaker(
  level: MiniGameLevelConfig,
  selfResult: GameResult | null,
  opponentResult: GameResult | null,
  playMode: "versus" | "co-op" = "versus",
) {
  if (playMode !== "versus") return false;
  if (!selfResult || !opponentResult) return false;
  if (level.gameId === "knife") return false;
  if (!getMultiplayerLevelRules(level).settlement.tiebreakerText) return false;
  return compareMultiplayerResults(selfResult, opponentResult) === 0;
}
