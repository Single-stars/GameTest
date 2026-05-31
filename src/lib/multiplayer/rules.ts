import type { MiniGameId, MiniGameLevelConfig } from "../mini-games/index.ts";

export type MultiplayerSettlementKind = "finish-time" | "effective-time" | "score";

export type MultiplayerSettlementBaseKey =
  | "finish-time"
  | "effective-time"
  | "final-score"
  | "progress"
  | "revives";

export type MultiplayerSettlementAdjustmentKey =
  | "revive-count"
  | "collectible-time-bonus"
  | "boost-platform-note"
  | "aim-miss-penalty"
  | "aim-flyout-penalty"
  | "aim-decoy-penalty"
  | "knife-hit-score"
  | "knife-timeout-penalty"
  | "knife-collision-penalty"
  | "knife-danger-penalty";

export type MultiplayerSettlementUnit = "ms" | "point" | "count" | "note";

export type MultiplayerSettlementMetric = {
  key: MultiplayerSettlementBaseKey | MultiplayerSettlementAdjustmentKey;
  label: string;
  unit: MultiplayerSettlementUnit;
  description: string;
  valuePerEvent?: number;
  displayOnly?: boolean;
};

export type MultiplayerSettlementRules = {
  kind: MultiplayerSettlementKind;
  primaryMetric: string;
  resultTitle: string;
  winnerText: string;
  baseMetrics: MultiplayerSettlementMetric[];
  adjustments: MultiplayerSettlementMetric[];
  tiebreakerText?: string;
};

export type MultiplayerLevelRules = {
  gameId: MiniGameId;
  levelId: string;
  countdownLines: string[];
  settlement: MultiplayerSettlementRules;
};

export const MULTIPLAYER_VERSUS_RULE_TEXT = "按本关规则结算：跑图先到终点，收集和失误在结算面板单独计算。";

const reviveAdjustment: MultiplayerSettlementMetric = {
  key: "revive-count",
  label: "复活次数",
  unit: "count",
  description: "失误后按当前关卡规则复活，复活本身不扣分，但会损失时间。",
  displayOnly: true,
};

const boostPlatformNote: MultiplayerSettlementMetric = {
  key: "boost-platform-note",
  label: "高能平台",
  unit: "note",
  description: "高能平台只是抢时间的路线机会，没踩不判失败，也不额外加减分。",
  displayOnly: true,
};

const collectibleTimeBonus: MultiplayerSettlementMetric = {
  key: "collectible-time-bonus",
  label: "道具奖励",
  unit: "ms",
  valuePerEvent: -2000,
  description: "每个成功收集的道具让最终用时减少 2 秒，所有已收集道具都结算。",
};

const aimMissPenalty: MultiplayerSettlementMetric = {
  key: "aim-miss-penalty",
  label: "射空",
  unit: "ms",
  valuePerEvent: 1000,
  description: "每次射空让最终用时增加 1 秒。",
};

const aimFlyOutPenalty: MultiplayerSettlementMetric = {
  key: "aim-flyout-penalty",
  label: "漏靶",
  unit: "ms",
  valuePerEvent: 2000,
  description: "逃逸靶飞出屏幕算漏靶，每个让最终用时增加 2 秒。",
};

const aimDecoyPenalty: MultiplayerSettlementMetric = {
  key: "aim-decoy-penalty",
  label: "打中干扰靶",
  unit: "ms",
  valuePerEvent: 3000,
  description: "打中干扰靶让最终用时增加 3 秒。",
};

const knifeHitScore: MultiplayerSettlementMetric = {
  key: "knife-hit-score",
  label: "安全插中",
  unit: "point",
  valuePerEvent: 1,
  description: "每次安全插中加 1 分。",
};

const knifeTimeoutPenalty: MultiplayerSettlementMetric = {
  key: "knife-timeout-penalty",
  label: "倒计时超时",
  unit: "point",
  valuePerEvent: -1,
  description: "倒计时超时扣 1 分，但仍需不限时发射当前飞刀。",
};

function numberParam(level: MiniGameLevelConfig, key: string) {
  const value = level.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hasCountdown(level: MiniGameLevelConfig) {
  return typeof level.params.shotCountdown === "number";
}

function hasCollectibles(level: MiniGameLevelConfig) {
  return numberParam(level, "collectibleCount") > 0;
}

function hasReverseSpace(level: MiniGameLevelConfig) {
  return level.params.reversedGravity === true || level.params.reverseDirection === true;
}

function hasBoostPlatforms(level: MiniGameLevelConfig) {
  return numberParam(level, "requiredRiskPlatforms") > 0;
}

function hasMovingObstacles(level: MiniGameLevelConfig) {
  return numberParam(level, "movingObstacleCount") > 0;
}

function hasDangerPlatforms(level: MiniGameLevelConfig) {
  return numberParam(level, "dangerPlatformCount") > 0;
}

function hasFragilePlatforms(level: MiniGameLevelConfig) {
  return numberParam(level, "fragilePlatformCount") > 0;
}

function hasSineRotation(level: MiniGameLevelConfig) {
  return level.params.sineRotationEnabled === true;
}

function aimMode(level: MiniGameLevelConfig) {
  const mode = level.params.aimMode;
  return typeof mode === "string" ? mode : "";
}

function finishTimeSettlement(adjustments: MultiplayerSettlementMetric[] = []): MultiplayerSettlementRules {
  return {
    kind: "finish-time",
    primaryMetric: "finish-time",
    resultTitle: "完成时间",
    winnerText: "先到终点获胜",
    baseMetrics: [
      {
        key: "finish-time",
        label: "完成时间",
        unit: "ms",
        description: "从比赛开始到到达终点的时间。",
      },
    ],
    adjustments,
  };
}

function flappySettlement(level: MiniGameLevelConfig): MultiplayerSettlementRules {
  const adjustments = [reviveAdjustment];
  if (hasCollectibles(level)) adjustments.push(collectibleTimeBonus);
  return {
    kind: hasCollectibles(level) ? "effective-time" : "finish-time",
    primaryMetric: hasCollectibles(level) ? "effective-time" : "finish-time",
    resultTitle: hasCollectibles(level) ? "最终用时" : "完成时间",
    winnerText: hasCollectibles(level) ? "到达时间扣除道具奖励后更短者获胜" : "先到终点获胜",
    baseMetrics: [
      {
        key: "finish-time",
        label: "到达时间",
        unit: "ms",
        description: "从比赛开始到通过终点的原始时间。",
      },
      ...(hasCollectibles(level)
        ? [
            {
              key: "effective-time" as const,
              label: "最终用时",
              unit: "ms" as const,
              description: "到达时间扣除所有已收集道具奖励后的成绩。",
            },
          ]
        : []),
    ],
    adjustments,
  };
}

function knifeSettlement(level: MiniGameLevelConfig): MultiplayerSettlementRules {
  const adjustments = [knifeHitScore];
  if (hasCountdown(level)) adjustments.push(knifeTimeoutPenalty);

  return {
    kind: "score",
    primaryMetric: "final-score",
    resultTitle: "主局总分",
    winnerText: "飞刀耗尽后分数更高者获胜",
    baseMetrics: [],
    adjustments,
  };
}

function aimSettlement(level: MiniGameLevelConfig): MultiplayerSettlementRules {
  const mode = aimMode(level);
  const adjustments = [aimMissPenalty];
  if (mode === "incoming" || mode === "boss") adjustments.push(aimFlyOutPenalty);
  if (mode === "decoy" || mode === "boss") adjustments.push(aimDecoyPenalty);
  return {
    kind: "effective-time",
    primaryMetric: "effective-time",
    resultTitle: "最终用时",
    winnerText: "完成流程后最终用时更短者获胜",
    baseMetrics: [
      {
        key: "finish-time",
        label: "完成时间",
        unit: "ms",
        description: "从比赛开始到射靶流程结束的原始时间。",
      },
      {
        key: "effective-time",
        label: "最终用时",
        unit: "ms",
        description: "完成时间加上射空、漏靶和干扰靶罚时后的成绩。",
      },
    ],
    adjustments,
    tiebreakerText: mode === "incoming" ? "有效用时相同进入高速逃逸靶加赛，同命中或同漏靶继续下一轮。" : undefined,
  };
}

function compactLines(lines: Array<string | null>) {
  return lines.filter((line): line is string => typeof line === "string" && line.length > 0).slice(0, 3);
}

function doodleCountdownLines(level: MiniGameLevelConfig) {
  return compactLines([
    "先到终点获胜",
    hasBoostPlatforms(level) ? "高能平台能抢时间" : hasMovingObstacles(level) ? "碰到障碍会复活" : "掉落后复活继续",
    hasBoostPlatforms(level) && hasMovingObstacles(level) ? "碰到障碍会复活" : null,
  ]);
}

function fallDownCountdownLines(level: MiniGameLevelConfig) {
  return compactLines([
    "先到终点获胜",
    hasDangerPlatforms(level) ? "碰到危险会复活" : hasFragilePlatforms(level) ? "脆弱平台会碎裂" : "掉落后复活继续",
  ]);
}

function squareJumpCountdownLines() {
  return ["先到终点获胜", "掉落后复活继续"];
}

function flappyCountdownLines(level: MiniGameLevelConfig) {
  return compactLines([
    "先到终点获胜",
    hasCollectibles(level) ? "收集道具获得优势" : hasReverseSpace(level) ? "翻转空间保持方向" : "撞到障碍会复活",
    hasCollectibles(level) && hasReverseSpace(level) ? "翻转空间保持方向" : null,
  ]);
}

function knifeCountdownLines(level: MiniGameLevelConfig) {
  if (hasCountdown(level) && hasSineRotation(level)) {
    return ["安全插中 +1 分", "倒计时超时 -1 分", "转盘变速看时机"];
  }
  if (hasCountdown(level)) {
    return ["安全插中 +1 分", "倒计时超时 -1 分"];
  }
  if (hasSineRotation(level)) {
    return ["安全插中 +1 分", "转盘变速看时机"];
  }
  return ["安全插中 +1 分"];
}

function aimCountdownLines(level: MiniGameLevelConfig) {
  const mode = aimMode(level);
  if (mode === "incoming") {
    return ["流程结束比最终用时", "射空 +1 秒", "漏靶 +2 秒"];
  }
  if (mode === "decoy") {
    return ["清空目标比最终用时", "射空 +1 秒", "打错 +3 秒"];
  }
  if (mode === "boss") {
    return ["综合靶比最终用时", "射空 +1 秒", "漏靶 / 打错会罚时"];
  }
  return ["清空目标比最终用时", "射空 +1 秒"];
}

export function getMultiplayerLevelRules(level: MiniGameLevelConfig): MultiplayerLevelRules {
  if (level.gameId === "doodle") {
    return {
      gameId: level.gameId,
      levelId: level.levelId,
      countdownLines: doodleCountdownLines(level),
      settlement: finishTimeSettlement(hasBoostPlatforms(level) ? [reviveAdjustment, boostPlatformNote] : [reviveAdjustment]),
    };
  }

  if (level.gameId === "fall-down") {
    return {
      gameId: level.gameId,
      levelId: level.levelId,
      countdownLines: fallDownCountdownLines(level),
      settlement: finishTimeSettlement([reviveAdjustment]),
    };
  }

  if (level.gameId === "square-jump") {
    return {
      gameId: level.gameId,
      levelId: level.levelId,
      countdownLines: squareJumpCountdownLines(),
      settlement: finishTimeSettlement([reviveAdjustment]),
    };
  }

  if (level.gameId === "flappy") {
    return {
      gameId: level.gameId,
      levelId: level.levelId,
      countdownLines: flappyCountdownLines(level),
      settlement: flappySettlement(level),
    };
  }

  if (level.gameId === "aim") {
    return {
      gameId: level.gameId,
      levelId: level.levelId,
      countdownLines: aimCountdownLines(level),
      settlement: aimSettlement(level),
    };
  }

  return {
    gameId: level.gameId,
    levelId: level.levelId,
    countdownLines: knifeCountdownLines(level),
    settlement: knifeSettlement(level),
  };
}

export function getMultiplayerCountdownLine(rules: MultiplayerLevelRules, countdownSeconds: number | null) {
  if (countdownSeconds === null || countdownSeconds <= 0) return null;
  const index = rules.countdownLines.length - countdownSeconds;
  return rules.countdownLines[Math.max(0, Math.min(rules.countdownLines.length - 1, index))] ?? null;
}
