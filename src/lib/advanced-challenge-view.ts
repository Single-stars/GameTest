import type { AdvancedStageConfig } from "./advanced-challenges.ts";
import { getAdvancedLevelState, type AdvancedLevelState } from "./advanced-progress.ts";
import { getMiniGameLevel, type MiniGameId } from "./mini-games/index.ts";

const ADVANCED_LEVEL_MIN = 1;
const ADVANCED_LEVEL_MAX = 10;

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

export function getAdvancedLobbyUnlockedLevel(currentLevel: number) {
  return defaultSelectableLevel(currentLevel);
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
  const avgMsThreshold = numberParam(config, "avgMsThreshold");
  const hasRedTrap = config.variant.includes("trap") || config.variant.includes("boss");

  return compactGoals([
    { icon: "target", text: "不可提前点击或漏点" },
    hasRedTrap ? { icon: "ban", text: "红灯不可点击" } : null,
    avgMsThreshold !== null ? { icon: "bolt", text: `平均反应 ≤ ${avgMsThreshold}ms` } : null,
  ]);
}

function getAimGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const group = resolveColumnGroup(config.level);
  return compactGoals([
    { icon: "target", text: "箭矢不能射空" },
    group === "258" || group === "10" ? { icon: "flag", text: "在靶子飞出场景前击中" } : null,
    group === "369" || group === "10" ? { icon: "ban", text: "箭矢不能射中干扰靶" } : null,
  ]);
}

function getBrakingGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const group = resolveColumnGroup(config.level);
  if (group === "147") {
    return [
      { icon: "ban", text: "不能提前松手" },
      { icon: "ban", text: "不能撞到危险上" },
      { icon: "flag", text: "走到终点" },
    ];
  }
  if (group === "258") {
    return [
      { icon: "ban", text: "不能提前松手" },
      { icon: "ban", text: "不能撞到危险上" },
      { icon: "ban", text: "遇到假危险不能松手" },
      { icon: "flag", text: "走到终点" },
    ];
  }
  return [
    { icon: "ban", text: "不能提前松手" },
    { icon: "bolt", text: "遵守规则" },
    { icon: "flag", text: "走到终点" },
  ];
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

function toPositiveCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : null;
}

function riskPlatformGoalText(count: number | null) {
  if (count === null) return "踩中所有平台";
  return `踩中 ${count}/${count} 个高能平台`;
}

function collectibleGoalText(count: number | null) {
  if (count === null) return "收集所有道具";
  return `收集 ${count}/${count} 个道具`;
}

function getMiniGameGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const miniGameId = config.params.miniGameId;
  const miniLevelId = config.params.miniLevelId;
  if (!isMiniGameId(miniGameId) || typeof miniLevelId !== "string") return [];

  const level = getMiniGameLevel(miniGameId, miniLevelId);
  const group = resolveBandGroup(config.level);
  if (config.dimension === "search") {
    const requiredRiskPlatforms = toPositiveCount(level.params.requiredRiskPlatforms);
    return compactGoals([
      { icon: "flag", text: "到达终点平台" },
      { icon: "flag", text: "不能掉出场景外" },
      { icon: "ban", text: "不能触碰到危险红点" },
      group === "258" || group === "10" ? { icon: "target", text: riskPlatformGoalText(requiredRiskPlatforms) } : null,
    ]);
  }
  if (config.dimension === "stroop") {
    return compactGoals([
      { icon: "flag", text: "到达终点平台" },
      { icon: "flag", text: "不能掉出场景外" },
      group === "258" || group === "369" || group === "10" ? { icon: "ban", text: "不能触碰到危险红点" } : null,
      group === "369" || group === "10" ? { icon: "ban", text: "不能踩到危险平台" } : null,
    ]);
  }
  if (config.dimension === "rhythm") {
    return [
      { icon: "flag", text: "不能掉出场景外" },
      { icon: "flag", text: "到达终点平台" },
    ];
  }
  if (config.dimension === "memory") {
    const collectibleCount = toPositiveCount(level.params.collectibleCount);
    return compactGoals([
      { icon: "ban", text: "不能撞到柱子" },
      { icon: "flag", text: "不能掉出场景外" },
      group === "258" || group === "10" ? { icon: "target", text: collectibleGoalText(collectibleCount) } : null,
    ]);
  }
  if (config.dimension === "patience") {
    return compactGoals([
      { icon: "ban", text: "转盘上的飞刀不能重叠" },
      { icon: "target", text: "丢出所有飞刀" },
      group === "147" || group === "10" ? { icon: "bolt", text: "在倒计时结束前丢出飞刀" } : null,
      group === "369" || group === "10" ? { icon: "ban", text: "飞刀不能丢进危险区域" } : null,
    ]);
  }
  if (miniGameId === "square-jump") {
    return [
      { icon: "flag", text: "不能掉出场景外" },
      { icon: "flag", text: "到达终点平台" },
    ];
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

export function resolveAdvancedLobbySliderLevel({
  currentLevel,
  requestedLevel,
}: {
  currentLevel: number;
  requestedLevel: number;
}) {
  return clampInteger(requestedLevel, ADVANCED_LEVEL_MIN, getAdvancedLobbyUnlockedLevel(currentLevel));
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
