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

type GroupKey = "147" | "258" | "369" | "10";

function resolveColumnGroup(level: number): GroupKey {
  if (level === 10) return "10";
  if (level === 1 || level === 4 || level === 7) return "147";
  if (level === 2 || level === 5 || level === 8) return "258";
  return "369";
}

function resolveBandGroup(level: number): GroupKey {
  if (level === 10) return "10";
  if (level <= 3) return "147";
  if (level <= 6) return "258";
  return "369";
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function numberValue(value: TrialEvent["value"], key: string) {
  const raw = Number(value?.[key]);
  return Number.isFinite(raw) ? raw : null;
}

function isFallDownDangerPlatformChallenge(config: AdvancedStageConfig) {
  const miniLevelId = String(config.params.miniLevelId ?? "");
  return miniLevelId.includes("danger") || miniLevelId.includes("final");
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
    (trial) => trial.errorType === "false_alarm" || (isRedSignalTrial(trial) && hasUserResponse(trial)),
  );
  const hasEarlyClick = trials.some((trial) => {
    const signalColor = trial.value?.signalColor ?? trial.value?.cellColor;
    if (signalColor === "red") return false;
    if (trial.errorType === "false_alarm") return false;
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
  const hits = trials.filter((trial) => trial.correct === true || trial.value?.shotHit === true).length;
  const interference = trials.find((trial) => trial.errorType === "collision" || trial.value?.hitDecoy === true);
  const flyOut = trials.find((trial) => trial.errorType === "timeout" || trial.value?.flyOut === true);
  const miss = trials.find(
    (trial) =>
      trial.errorType === "miss" ||
      (trial.value?.shotHit === false &&
        trial.errorType !== "timeout" &&
        trial.errorType !== "collision" &&
        trial.value?.flyOut !== true &&
        trial.value?.hitDecoy !== true),
  );

  const noInterference = !interference;
  const hitBeforeFlyOut = !flyOut;
  const noMiss = !miss && (hits >= required || !noInterference || !hitBeforeFlyOut);
  const group = resolveColumnGroup(config.level);
  const goalChecks =
    group === "147"
      ? [noMiss]
      : group === "258"
        ? [noMiss, hitBeforeFlyOut]
        : group === "369"
          ? [noMiss, noInterference]
          : [noMiss, hitBeforeFlyOut, noInterference];

  let passed = false;
  let reason = "通过";
  if (interference) {
    reason = "失败：箭矢射中了干扰靶";
  } else if (flyOut) {
    reason = "失败：目标飞出场景";
  } else if (miss) {
    reason = "失败：箭矢射空";
  } else if (hits < required) {
    reason = `失败：少命中 ${required - hits} 个目标`;
  } else {
    passed = true;
  }

  const correctCount = goalChecks.filter(Boolean).length;
  const requiredCorrect = goalChecks.length;
  return {
    level: config.level,
    score: passed ? 100 : toScore(correctCount, requiredCorrect),
    minScore: 100,
    passed,
    correctCount,
    requiredCorrect,
    reason,
    goalChecks,
  };
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
  if (!item) {
    return {
      ...fail(config, 0, 1, "失败：未完成挑战"),
      goalChecks: [false],
    };
  }

  const passed = item.correct === true && item.value?.passed !== false;
  const reasonText = String(item.value?.reason ?? item.errorType ?? "");
  const bandGroup = resolveBandGroup(config.level);

  let goalChecks: boolean[] = [passed];
  if (config.dimension === "search") {
    const riskHit = numberValue(item.value, "riskHit");
    const riskTotal = numberValue(item.value, "riskTotal");
    const reachedFinish = passed || includesAny(reasonText, ["终点平台", "通过终点", "站上最高终点平台"]);
    const fellOut = includesAny(reasonText, ["掉出", "掉太深", "飞出边界"]);
    const touchedDangerRed = includesAny(reasonText, ["撞到危险", "碰到危险"]);
    const completedRiskPlatforms = riskTotal === null || riskTotal <= 0 ? true : (riskHit ?? 0) >= riskTotal;
    goalChecks = [reachedFinish, !fellOut, !touchedDangerRed];
    if (bandGroup === "258" || bandGroup === "10") goalChecks.push(completedRiskPlatforms);
  } else if (config.dimension === "stroop") {
    const reachedFinish = passed || includesAny(reasonText, ["终点平台", "成功下降", "通过终点"]);
    const fellOut = includesAny(reasonText, ["掉出", "掉太深", "太慢了", "飞出边界"]);
    const touchedDangerRed = includesAny(reasonText, ["下落危险", "危险红点"]);
    const steppedDangerPlatform = includesAny(reasonText, ["踩到危险"]);
    goalChecks = [reachedFinish, !fellOut];
    if (bandGroup === "258" || bandGroup === "369" || bandGroup === "10") goalChecks.push(!touchedDangerRed);
    if (isFallDownDangerPlatformChallenge(config)) goalChecks.push(!steppedDangerPlatform);
  } else if (config.dimension === "rhythm") {
    const fellOut = includesAny(reasonText, ["掉下", "掉出", "飞出"]);
    const reachedFinish = passed || includesAny(reasonText, ["终点平台", "通过终点"]);
    goalChecks = [!fellOut, reachedFinish];
  } else if (config.dimension === "memory") {
    const collected = numberValue(item.value, "collected");
    const collectibleCount = numberValue(item.value, "collectibleCount");
    const hitObstacle = includesAny(reasonText, ["撞到障碍", "撞到柱子"]);
    const fellOut = includesAny(reasonText, ["飞出边界", "掉出"]);
    const collectedAll = collectibleCount === null || collectibleCount <= 0 ? true : (collected ?? 0) >= collectibleCount;
    goalChecks = [!hitObstacle, !fellOut];
    if (bandGroup === "258" || bandGroup === "10") goalChecks.push(collectedAll);
  } else if (config.dimension === "patience") {
    const fired = numberValue(item.value, "fired");
    const shotCount = numberValue(item.value, "shotCount");
    const overlapped = includesAny(reasonText, ["撞到已插入长条", "飞刀重叠", "重叠"]);
    const countdownEnded = includesAny(reasonText, ["倒计时结束"]);
    const hitDangerZone = includesAny(reasonText, ["命中危险区域", "危险区域"]);
    const threwAll = shotCount === null || shotCount <= 0 ? passed : (fired ?? 0) >= shotCount;
    goalChecks = [!overlapped, threwAll];
    if (bandGroup === "147" || bandGroup === "10") goalChecks.push(!countdownEnded);
    if (bandGroup === "369" || bandGroup === "10") goalChecks.push(!hitDangerZone);
  }

  return {
    level: config.level,
    score: passed ? 100 : 0,
    minScore: 100,
    passed,
    correctCount: passed ? 1 : 0,
    requiredCorrect: 1,
    reason: passed ? "通过" : miniGameFailureReason(item),
    goalChecks,
  };
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
  const collision = trials.find((trial) => trial.errorType === "collision" || trial.value?.collision === true);
  const early = trials.find((trial) => trial.errorType === "early_stop" || trial.value?.earlyStop === true);
  const falseStop = trials.find((trial) => trial.errorType === "false_alarm" || trial.value?.fakeStop === true);
  const exited = trials.some((trial) => trial.value?.exited === true);
  const needExit = config.params.exitRequired === true;
  const reachedFinish = needExit ? exited : true;
  const noEarlyStop = !early;
  const noCollision = !collision;
  const noFalseStop = !falseStop;

  const group = resolveColumnGroup(config.level);
  const followRule = noCollision && noFalseStop;
  const goalChecks =
    group === "147"
      ? [noEarlyStop, noCollision, reachedFinish]
      : group === "258"
        ? [noEarlyStop, noCollision, noFalseStop, reachedFinish]
        : [noEarlyStop, followRule, reachedFinish];

  let passed = false;
  let reason = "通过";
  if (collision) {
    reason = "失败：撞上危险";
  } else if (early) {
    reason = "失败：等待中断";
  } else if (falseStop) {
    reason = "失败：假危险松手";
  } else if (!reachedFinish) {
    reason = "失败：未走出屏幕";
  } else {
    passed = true;
  }

  const correctCount = goalChecks.filter(Boolean).length;
  const requiredCorrect = goalChecks.length;
  return {
    level: config.level,
    score: passed ? 100 : toScore(correctCount, requiredCorrect),
    minScore: 100,
    passed,
    correctCount,
    requiredCorrect,
    reason,
    goalChecks,
  };
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
