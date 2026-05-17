import type { AdvancedStageConfig } from "./advanced-challenges.ts";
import { getAdvancedLevelState, type AdvancedLevelState } from "./advanced-progress.ts";
import { getMiniGameLevel, type MiniGameId } from "./mini-games/index.ts";

const ADVANCED_LEVEL_MIN = 1;
const ADVANCED_LEVEL_MAX = 10;
const DEFAULT_SWIPE_THRESHOLD_PX = 48;
const DEFAULT_DRAG_OVERSCROLL_PX = 24;
const DEFAULT_DRAG_OVERSCROLL_RESISTANCE = 0.12;
const DEFAULT_VELOCITY_PROJECTION_MS = 220;

export type AdvancedLobbyLevelPosition = "previous" | "selected" | "next" | "distant";
export type AdvancedGoalIcon = "target" | "ban" | "bolt" | "flag";

export type AdvancedLobbyLevelItem = {
  level: number;
  offset: number;
  position: AdvancedLobbyLevelPosition;
  state: AdvancedLevelState;
  selectable: boolean;
};

export type AdvancedChallengeGoalItem = {
  icon: AdvancedGoalIcon;
  text: string;
};

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clampCurrentLevel(currentLevel: number) {
  return clampInteger(currentLevel, 0, ADVANCED_LEVEL_MAX);
}

function clampDisplayLevel(level: number) {
  return clampInteger(level, ADVANCED_LEVEL_MIN, ADVANCED_LEVEL_MAX);
}

function defaultSelectableLevel(currentLevel: number) {
  return Math.min(ADVANCED_LEVEL_MAX, clampCurrentLevel(currentLevel) + 1);
}

function maxSelectableLevel(currentLevel: number) {
  return Math.min(ADVANCED_LEVEL_MAX, clampCurrentLevel(currentLevel) + 1);
}

function normalizeSelectableLevel(currentLevel: number, requestedLevel?: number) {
  const fallback = defaultSelectableLevel(currentLevel);
  if (requestedLevel === undefined) return fallback;

  const level = clampDisplayLevel(requestedLevel);
  return getAdvancedLevelState(currentLevel, level) === "locked" ? fallback : level;
}

function numberParam(config: AdvancedStageConfig, key: string) {
  const value = Number(config.params[key]);
  return Number.isFinite(value) ? value : null;
}

function stripPassText(passText: string) {
  return passText.replace(/^过关要求：/, "").replace(/。$/, "");
}

function fallbackGoal(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  return [{ icon: "target", text: stripPassText(config.passText) }];
}

function compactGoals(items: Array<AdvancedChallengeGoalItem | null>) {
  const goals = items.filter((item): item is AdvancedChallengeGoalItem => item !== null && item.text.trim().length > 0);
  return goals.length > 0 ? goals : [];
}

function getReactionGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const requiredGreenClicks = numberParam(config, "requiredGreenClicks");
  const signalCount = numberParam(config, "signalCount");
  const avgMsThreshold = numberParam(config, "avgMsThreshold");
  const hasRedTrap = config.variant.includes("trap") || config.variant.includes("boss");

  return compactGoals([
    requiredGreenClicks !== null && requiredGreenClicks > 1
      ? { icon: "target", text: `完成 ${requiredGreenClicks} 次有效点击` }
      : signalCount !== null
        ? { icon: "target", text: `完成 ${signalCount} 个信号判定` }
        : null,
    hasRedTrap ? { icon: "ban", text: "红灯不可点击" } : null,
    avgMsThreshold !== null ? { icon: "bolt", text: `平均反应 ≤ ${avgMsThreshold}ms` } : null,
  ]);
}

function getAimGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const targetCount = numberParam(config, "targetCount") ?? numberParam(config, "arrowCount");
  const decoyCount = numberParam(config, "decoyCount") ?? 0;

  return compactGoals([
    targetCount !== null ? { icon: "target", text: `命中 ${targetCount} 个目标` } : null,
    decoyCount > 0 ? { icon: "ban", text: "不要命中干扰靶" } : null,
    config.params.failOnFlyOut === true ? { icon: "flag", text: "目标飞出场外前命中" } : null,
  ]);
}

function getBrakingGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const hazardCount = numberParam(config, "hazardCount");
  const eventCountMin = numberParam(config, "eventCountMin");
  const eventCountMax = numberParam(config, "eventCountMax");
  const eventText =
    hazardCount !== null
      ? `完成 ${hazardCount} 次正确松手`
      : eventCountMin !== null && eventCountMax !== null
        ? `完成 ${eventCountMin}-${eventCountMax} 次危险判断`
        : null;

  return compactGoals([
    eventText ? { icon: "target", text: eventText } : null,
    config.params.allowGray === true ? { icon: "ban", text: "灰色不可松手" } : null,
    typeof config.params.dualRule === "string" ? { icon: "bolt", text: "按单双红灯规则判断" } : null,
    config.params.exitRequired === true ? { icon: "flag", text: "到达终点" } : null,
  ]);
}

function getPatienceGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const waitMs = numberParam(config, "waitMs");
  if (waitMs === null) return [];
  return [
    { icon: "target", text: `等待 ${Math.round(waitMs / 1000)} 秒` },
    { icon: "ban", text: "等待中不可中断" },
  ];
}

function isMiniGameId(value: unknown): value is MiniGameId {
  return value === "doodle" || value === "flappy" || value === "knife" || value === "square-jump" || value === "fall-down";
}

function getMiniGameGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const miniGameId = config.params.miniGameId;
  const miniLevelId = config.params.miniLevelId;
  if (!isMiniGameId(miniGameId) || typeof miniLevelId !== "string") return [];

  const level = getMiniGameLevel(miniGameId, miniLevelId);
  if (miniGameId === "square-jump") {
    const jumpsRequired = Number(level.params.jumpsRequired);
    return compactGoals([
      Number.isFinite(jumpsRequired) ? { icon: "target", text: `完成 ${jumpsRequired} 次跳跃` } : null,
      { icon: "flag", text: "站上终点平台" },
    ]);
  }
  if (miniGameId === "doodle") {
    const requiredRiskPlatforms = Number(level.params.requiredRiskPlatforms ?? 0);
    const movingObstacleCount = Number(level.params.movingObstacleCount ?? 0);
    return compactGoals([
      { icon: "flag", text: "站上最高终点平台" },
      requiredRiskPlatforms > 0 ? { icon: "target", text: `踩中 ${requiredRiskPlatforms}/${requiredRiskPlatforms} 个高风险平台` } : null,
      movingObstacleCount > 0 ? { icon: "ban", text: `躲开 ${movingObstacleCount} 个移动障碍` } : null,
    ]);
  }
  if (miniGameId === "fall-down") {
    const layersRequired = Number(level.params.layersRequired);
    return compactGoals([
      Number.isFinite(layersRequired) ? { icon: "target", text: `下降 ${layersRequired} 层` } : null,
      { icon: "flag", text: "站上终点平台" },
    ]);
  }

  return fallbackGoal(config);
}

export function getAdvancedLobbyLevelItems({
  currentLevel,
  selectedLevel,
}: {
  currentLevel: number;
  selectedLevel?: number;
}): AdvancedLobbyLevelItem[] {
  const selected = normalizeSelectableLevel(currentLevel, selectedLevel);
  return Array.from({ length: ADVANCED_LEVEL_MAX }, (_, index) => {
    const level = index + 1;
    const offset = level - selected;
    const position: AdvancedLobbyLevelPosition =
      offset === 0 ? "selected" : offset === -1 ? "previous" : offset === 1 ? "next" : "distant";
    const state = getAdvancedLevelState(currentLevel, level);
    return {
      level,
      offset,
      position,
      state,
      selectable: state !== "locked",
    };
  });
}

export function resolveAdvancedLobbyClickLevel({
  currentLevel,
  requestedLevel,
}: {
  currentLevel: number;
  requestedLevel: number;
}) {
  const level = clampDisplayLevel(requestedLevel);
  return getAdvancedLevelState(currentLevel, level) === "locked" ? null : level;
}

export function resolveAdvancedLobbySwipeLevel({
  currentLevel,
  selectedLevel,
  deltaX,
  maxStepCount,
  thresholdPx = DEFAULT_SWIPE_THRESHOLD_PX,
  velocityProjectionMs = DEFAULT_VELOCITY_PROJECTION_MS,
  velocityX = 0,
}: {
  currentLevel: number;
  selectedLevel: number;
  deltaX: number;
  maxStepCount?: number;
  thresholdPx?: number;
  velocityProjectionMs?: number;
  velocityX?: number;
}) {
  const selected = normalizeSelectableLevel(currentLevel, selectedLevel);
  const threshold = Math.max(1, thresholdPx);
  const projectedDeltaX = deltaX + velocityX * Math.max(0, velocityProjectionMs);
  if (Math.abs(projectedDeltaX) < threshold) return selected;

  const rawSteps = Math.max(1, Math.round(Math.abs(projectedDeltaX) / threshold));
  const steps =
    maxStepCount === undefined ? rawSteps : Math.min(clampInteger(maxStepCount, 1, ADVANCED_LEVEL_MAX), rawSteps);
  const requestedLevel = selected + (projectedDeltaX < 0 ? steps : -steps);
  return clampInteger(requestedLevel, ADVANCED_LEVEL_MIN, maxSelectableLevel(currentLevel));
}

export function resolveAdvancedLobbyDragOffset({
  currentLevel,
  selectedLevel,
  deltaX,
  stepPx,
  maxOverscrollPx = DEFAULT_DRAG_OVERSCROLL_PX,
  overscrollResistance = DEFAULT_DRAG_OVERSCROLL_RESISTANCE,
}: {
  currentLevel: number;
  selectedLevel: number;
  deltaX: number;
  stepPx: number;
  maxOverscrollPx?: number;
  overscrollResistance?: number;
}) {
  const selected = normalizeSelectableLevel(currentLevel, selectedLevel);
  const step = Math.max(1, stepPx);
  const maxLevel = maxSelectableLevel(currentLevel);
  const minDrag = 0 - (maxLevel - selected) * step;
  const maxDrag = (selected - ADVANCED_LEVEL_MIN) * step;
  if (deltaX >= minDrag && deltaX <= maxDrag) return deltaX;

  const maxOverscroll = Math.max(0, maxOverscrollPx);
  const resistance = Math.max(0, Math.min(1, overscrollResistance));
  if (deltaX > maxDrag) {
    return maxDrag + Math.min(maxOverscroll, (deltaX - maxDrag) * resistance);
  }
  return minDrag - Math.min(maxOverscroll, (minDrag - deltaX) * resistance);
}

export function getAdvancedChallengeGoalItems(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  if (typeof config.params.miniGameId === "string") {
    const goals = getMiniGameGoals(config);
    return goals.length > 0 ? goals : fallbackGoal(config);
  }

  const goals =
    config.dimension === "reaction"
      ? getReactionGoals(config)
      : config.dimension === "aim"
        ? getAimGoals(config)
        : config.dimension === "braking"
          ? getBrakingGoals(config)
          : config.dimension === "patience"
            ? getPatienceGoals(config)
            : [];

  return goals.length > 0 ? goals : fallbackGoal(config);
}
