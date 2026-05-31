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

function boostNoteEntry(level: MiniGameLevelConfig) {
  const metric = findMetric(level, "boost-platform-note");
  if (!metric) return null;
  return metricEntry(metric, "路线机会", { displayOnly: true });
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
  const valuePerEvent = finiteNumber(metric.valuePerEvent, 0);
  return metricEntry(metric, value, { amount: value * valuePerEvent });
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
  const knifeCollisions = wholeCount(stats.knifeCollisions);
  const knifeDangerHits = wholeCount(stats.knifeDangerHits);
  const baseScore: GameResultBreakdownEntry = {
    key: "base-score",
    label: "基础分",
    unit: "point",
    value: 0,
    amount: 0,
  };
  const adjustments = compactEntries([
    countedAdjustmentEntry(level, "knife-hit-score", knifeHits),
    countedAdjustmentEntry(level, "knife-timeout-penalty", knifeTimeouts),
    countedAdjustmentEntry(level, "knife-collision-penalty", knifeCollisions),
    countedAdjustmentEntry(level, "knife-danger-penalty", knifeDangerHits),
  ]);
  const finalScore = adjustments.reduce((total, item) => total + finiteNumber(item.amount), 0);
  const overtimeEntered = stats.knifeOvertime === true;
  const outcome: GameResultOutcome = overtimeEntered ? (stats.passed ? "overtime-win" : "overtime-loss") : stats.passed ? "completed" : "failed";
  const formulaRows = [
    formulaRow(baseScore, "base"),
    ...adjustmentRows(adjustments),
    ...(overtimeEntered
      ? [
          formulaRow(
            {
              key: "knife-overtime-entered",
              label: "加赛",
              unit: "note",
              value: "主局平分进入加赛",
              displayOnly: true,
            },
            "note",
          ),
          formulaRow(
            {
              key: "knife-overtime-result",
              label: "加赛结果",
              unit: "note",
              value: stats.passed ? "对方先失误" : "加赛先失误",
              displayOnly: true,
            },
            "note",
          ),
        ]
      : []),
  ];

  return {
    version: 1,
    gameId: level.gameId,
    levelId: level.levelId,
    kind: "score",
    title: rules.settlement.resultTitle,
    winnerText: overtimeEntered ? "主局平分后，加赛先失误者输" : rules.settlement.winnerText,
    outcome,
    overtime: overtimeEntered
      ? {
          entered: true,
          resultText: stats.passed ? "对方先失误" : "加赛先失误",
        }
      : undefined,
    base: [baseScore],
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
    boostNoteEntry(level),
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

export function compareMultiplayerResults(selfResult: GameResult, opponentResult: GameResult) {
  const selfSignal = outcomeSignal(selfResult);
  const opponentSignal = outcomeSignal(opponentResult);
  if (selfSignal !== opponentSignal) return selfSignal > opponentSignal ? -1 : 1;

  if (selfResult.passed && !opponentResult.passed) return -1;
  if (!selfResult.passed && opponentResult.passed) return 1;

  if (selfResult.passed && opponentResult.passed) {
    const selfTime = selfResult.timeMs ?? Number.POSITIVE_INFINITY;
    const opponentTime = opponentResult.timeMs ?? Number.POSITIVE_INFINITY;
    if (selfTime < opponentTime) return -1;
    if (selfTime > opponentTime) return 1;
  }

  if (selfResult.score > opponentResult.score) return -1;
  if (selfResult.score < opponentResult.score) return 1;
  return 0;
}
