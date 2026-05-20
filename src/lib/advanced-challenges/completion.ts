import type { TrialEvent } from "../scoring";

import type { AdvancedCompletionEvaluation, AdvancedStageConfig } from "./types.ts";

function numberParam(config: AdvancedStageConfig, key: string, fallback: number) {
  const value = Number(config.params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function reactionMs(trial: TrialEvent) {
  if (trial.responseAt === null) return null;
  return Math.max(0, Math.round(trial.responseAt - trial.shownAt));
}

function greenTrials(trials: TrialEvent[]) {
  return trials.filter((trial) => trial.value?.signalColor === "green" || trial.value?.cellColor === "green");
}

function isRedSignalTrial(trial: TrialEvent) {
  return trial.value?.signalColor === "red" || trial.value?.cellColor === "red";
}

function hasUserResponse(trial: TrialEvent) {
  return trial.responseAt !== null || trial.correct === false;
}

function toScore(correctCount: number, requiredCorrect: number) {
  return Math.max(0, Math.min(99, Math.round((correctCount / Math.max(1, requiredCorrect)) * 100)));
}

function baseEvaluation(config: AdvancedStageConfig, requiredCorrect: number): AdvancedCompletionEvaluation {
  return {
    level: config.level,
    score: 0,
    minScore: 100,
    passed: false,
    correctCount: 0,
    requiredCorrect,
    reason: "失败：未全部完成",
  };
}

function pass(config: AdvancedStageConfig, correctCount: number, requiredCorrect: number): AdvancedCompletionEvaluation {
  return {
    level: config.level,
    score: 100,
    minScore: 100,
    passed: true,
    correctCount,
    requiredCorrect,
    reason: "通过",
  };
}

function fail(
  config: AdvancedStageConfig,
  correctCount: number,
  requiredCorrect: number,
  reason: string,
): AdvancedCompletionEvaluation {
  return {
    level: config.level,
    score: toScore(correctCount, requiredCorrect),
    minScore: 100,
    passed: false,
    correctCount,
    requiredCorrect,
    reason,
  };
}

function evaluateReaction(config: AdvancedStageConfig, trials: TrialEvent[]) {
  const requiredGreenClicks = numberParam(config, "requiredGreenClicks", 1);
  const threshold = numberParam(config, "avgMsThreshold", 350);
  const green = greenTrials(trials);
  const successfulGreen = green.filter((trial) => trial.correct === true && trial.responseAt !== null);
  const average =
    successfulGreen.length > 0
      ? Math.round(successfulGreen.reduce((sum, trial) => sum + (reactionMs(trial) ?? 0), 0) / successfulGreen.length)
      : null;

  const hasRedTrap = config.variant.includes("trap") || config.variant.includes("boss");
  const hasRedClick = trials.some(
    (trial) => isRedSignalTrial(trial) && (hasUserResponse(trial) || trial.errorType === "false_alarm"),
  );
  const hasEarlyClick = trials.some((trial) => {
    const signalColor = trial.value?.signalColor ?? trial.value?.cellColor;
    if (signalColor === "red") return false;
    return (
      trial.errorType === "early" ||
      trial.errorType === "wrong" ||
      signalColor === "idle" ||
      (trial.correct === false && trial.responseAt !== null && trial.errorType !== "timeout" && trial.errorType !== "miss")
    );
  });
  const hasMissedGreen = green.some(
    (trial) =>
      trial.responseAt === null ||
      trial.errorType === "timeout" ||
      trial.errorType === "miss" ||
      trial.correct === false,
  );

  const noEarlyOrMiss = !hasEarlyClick && !hasMissedGreen && successfulGreen.length >= requiredGreenClicks;
  const noRedClick = hasRedTrap ? !hasRedClick : true;
  const avgPass = average !== null && average <= threshold;
  const goalChecks = hasRedTrap ? [noEarlyOrMiss, noRedClick, avgPass] : [noEarlyOrMiss, avgPass];

  const passed = goalChecks.every(Boolean);
  const correctCount = goalChecks.filter(Boolean).length;
  const requiredCorrect = goalChecks.length;

  let reason = "通过";
  if (!passed) {
    if (!noRedClick) {
      reason = "失败：点到了红灯";
    } else if (!noEarlyOrMiss) {
      reason = "失败：提前点击或漏点";
    } else {
      reason = `失败：平均反应 ${average ?? "--"}ms，要求 ≤ ${threshold}ms`;
    }
  }

  return {
    level: config.level,
    score: passed ? 100 : toScore(correctCount, requiredCorrect),
    minScore: 100,
    passed,
    correctCount,
    requiredCorrect,
    reason,
    goalChecks,
    reactionAverageMs: average,
    reactionThresholdMs: threshold,
  };
}

function evaluateAim(config: AdvancedStageConfig, trials: TrialEvent[]) {
  const required = numberParam(config, "targetCount", numberParam(config, "arrowCount", 8));
  const interference = trials.find((trial) => trial.errorType === "collision" || trial.value?.hitDecoy === true);
  if (interference) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：箭撞到了干扰靶");
  const flyOut = trials.find((trial) => trial.errorType === "timeout" || trial.value?.flyOut === true);
  if (flyOut) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：目标飞出场景");
  const hits = trials.filter((trial) => trial.correct === true || trial.value?.shotHit === true).length;
  if (hits < required) return fail(config, hits, required, `失败：少命中 ${required - hits} 个目标`);
  return pass(config, hits, required);
}

function isMiniGameConfig(config: AdvancedStageConfig) {
  return typeof config.params.miniGameId === "string" && typeof config.params.miniLevelId === "string";
}

function miniGameFailureReason(trial: TrialEvent | undefined) {
  const rawReason = String(trial?.value?.reason ?? trial?.errorType ?? "未完成挑战");
  return rawReason.startsWith("失败：") ? rawReason : `失败：${rawReason}`;
}

function evaluateMiniGameChallenge(config: AdvancedStageConfig, trials: TrialEvent[]) {
  const item = trials.find(
    (trial) =>
      (trial.value?.miniGameId === config.params.miniGameId || trial.value?.gameId === config.params.miniGameId) &&
      trial.value?.miniLevelId === config.params.miniLevelId,
  );
  if (!item) return fail(config, 0, 1, "失败：未完成挑战");
  if (item.correct === true && item.value?.passed !== false) return pass(config, 1, 1);
  return fail(config, 0, 1, miniGameFailureReason(item));
}

function evaluateSearch(config: AdvancedStageConfig, trials: TrialEvent[]) {
  if (isMiniGameConfig(config)) return evaluateMiniGameChallenge(config, trials);
  const required = numberParam(config, "roundCount", 3);
  for (const item of trials) {
    const target = Number(item.value?.targetCount);
    const selected = Number(item.value?.selectedCount);
    if (Number.isFinite(target) && Number.isFinite(selected) && target !== selected) {
      const delta = Math.abs(target - selected);
      return fail(config, trials.filter((trial) => trial.correct === true).length, required, `失败：${selected < target ? "少" : "多"}数了 ${delta} 个目标`);
    }
    if (item.correct === false) {
      return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：计数错误");
    }
  }
  const correct = trials.filter((trial) => trial.correct === true).length;
  if (correct < required) return fail(config, correct, required, `失败：少完成 ${required - correct} 轮`);
  return pass(config, correct, required);
}

function evaluateStroop(config: AdvancedStageConfig, trials: TrialEvent[]) {
  if (isMiniGameConfig(config)) return evaluateMiniGameChallenge(config, trials);
  return fail(config, 0, 1, "failed: replaced mini-game config required");
}

function evaluateRhythm(config: AdvancedStageConfig, trials: TrialEvent[]) {
  if (isMiniGameConfig(config)) return evaluateMiniGameChallenge(config, trials);
  return fail(config, 0, 1, "failed: replaced mini-game config required");
}

function evaluateMemory(config: AdvancedStageConfig, trials: TrialEvent[]) {
  if (isMiniGameConfig(config)) return evaluateMiniGameChallenge(config, trials);
  const required = numberParam(config, "roundCount", 3);
  const correct = trials.filter((trial) => trial.correct === true).length;
  if (trials.some((trial) => trial.correct === false)) return fail(config, correct, required, "失败：选错颜色");
  if (correct < required) return fail(config, correct, required, `失败：少完成 ${required - correct} 轮`);
  return pass(config, correct, required);
}

function evaluateBraking(config: AdvancedStageConfig, trials: TrialEvent[]) {
  const required = numberParam(config, "hazardCount", 2);
  const collision = trials.find((trial) => trial.errorType === "collision" || trial.value?.collision === true);
  if (collision) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：撞上危险");
  const early = trials.find((trial) => trial.errorType === "early_stop" || trial.value?.earlyStop === true);
  if (early) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：等待中断");
  const falseStop = trials.find((trial) => trial.errorType === "false_alarm" || trial.value?.fakeStop === true);
  if (falseStop) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：假危险松手");
  const exited = trials.some((trial) => trial.value?.exited === true);
  if (config.params.exitRequired === true && !exited) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：未走出屏幕");
  return pass(config, Math.max(required, trials.filter((trial) => trial.correct === true).length), required);
}

function evaluatePatience(config: AdvancedStageConfig, trials: TrialEvent[]) {
  if (isMiniGameConfig(config)) return evaluateMiniGameChallenge(config, trials);
  const requiredWaitMs = numberParam(config, "waitMs", 6000);
  const item = trials[0];
  if (!item) return baseEvaluation(config, 1);
  const waitMs = Number(item.value?.waitMs);
  if (item.errorType === "skip" || item.value?.skipped === true || item.correct === false || waitMs < requiredWaitMs) {
    return fail(config, 0, 1, "失败：等待中断");
  }
  return pass(config, 1, 1);
}

export function evaluateAdvancedChallengeCompletion(
  config: AdvancedStageConfig,
  trials: TrialEvent[],
): AdvancedCompletionEvaluation {
  const relevantTrials = trials.filter((trial) => trial.roundId === config.dimension);
  switch (config.dimension) {
    case "reaction":
      return evaluateReaction(config, relevantTrials);
    case "aim":
      return evaluateAim(config, relevantTrials);
    case "search":
      return evaluateSearch(config, relevantTrials);
    case "stroop":
      return evaluateStroop(config, relevantTrials);
    case "rhythm":
      return evaluateRhythm(config, relevantTrials);
    case "memory":
      return evaluateMemory(config, relevantTrials);
    case "braking":
      return evaluateBraking(config, relevantTrials);
    case "patience":
      return evaluatePatience(config, relevantTrials);
  }
}
