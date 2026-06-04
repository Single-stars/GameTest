import type { AdvancedStageConfig } from "./advanced-challenges.ts";
import { getAdvancedLevelState, type AdvancedLevelState } from "./advanced-progress.ts";
import { ENDLESS_MODE_LEVEL, getEndlessLevelState } from "./endless-mode.ts";
import type { MiniGameId } from "./mini-games/index.ts";

const ADVANCED_STANDARD_LEVEL_MIN = 1;
const ADVANCED_LEVEL_MIN = ADVANCED_STANDARD_LEVEL_MIN;
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

export type AdvancedResultGoalItem = AdvancedChallengeGoalItem & {
  complete: boolean;
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
  if (requestedLevel === ENDLESS_MODE_LEVEL) {
    return getEndlessLevelState(currentLevel) === "locked" ? fallback : ENDLESS_MODE_LEVEL;
  }

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

function ruleItems(...texts: string[]): AdvancedChallengeGoalItem[] {
  return texts.map((text) => ({ icon: "target", text }));
}

function stripRuleDescription(passText: string) {
  const description = passText.replace(/^过关要求：[^。]*。/, "").replace(/。$/, "").trim();
  return description.length > 0 ? description : stripPassText(passText);
}

function getMiniGameRuleItems(config: AdvancedStageConfig, miniGameId: MiniGameId) {
  const variant = config.variant;
  if (miniGameId === "doodle") {
    if (variant.includes("moving-platform")) return ruleItems(Number(config.params.movingPlatformRatio) >= 1 ? "所有平台都会随机移动" : "部分平台会随机移动");
    if (variant.includes("risk-platform")) return ruleItems("必须踩中高能平台");
    if (variant.includes("moving-obstacle")) return ruleItems("移动障碍会干扰跳跃路线");
    if (variant.includes("final")) return ruleItems("所有平台都会随机移动", "必须踩中高能平台", "移动障碍会干扰跳跃路线");
  }
  if (miniGameId === "flappy") {
    if (variant.includes("moving-gate")) return ruleItems("部分障碍门会上下移动");
    if (variant.includes("collectible-path")) return ruleItems("必须收集路径道具");
    if (variant.includes("reverse-gravity")) return ruleItems("重力会倒转");
    if (variant.includes("final")) return ruleItems("部分障碍门会上下移动", "重力会倒转", "必须收集路径道具");
  }
  if (miniGameId === "knife") {
    if (variant.includes("countdown")) return ruleItems("每发飞刀都有倒计时");
    if (variant.includes("sine-rotation")) return ruleItems("转盘速度会来回变化");
    if (variant.includes("forbidden-zone")) return ruleItems("飞刀不能插进危险区域");
    if (variant.includes("final")) return ruleItems("每发飞刀都有倒计时", "转盘速度会来回变化", "飞刀不能插进危险区域");
  }
  if (miniGameId === "square-jump") {
    if (variant.includes("moving-landing")) return ruleItems("部分平台会随机移动");
    if (variant.includes("double-jump")) return ruleItems("空中可以再次蓄力二段跳");
    if (variant.includes("gravity-platform")) return ruleItems("出现会改变重力的特殊平台");
    if (variant.includes("final")) return ruleItems("部分平台会随机移动", "空中可以再次蓄力二段跳", "出现会改变重力的特殊平台");
  }
  if (miniGameId === "fall-down") {
    if (variant.includes("moving-layer")) return ruleItems("部分平台会随机移动");
    if (variant.includes("fragile-layer")) return ruleItems("脆弱层板踩上后会碎裂");
    if (variant.includes("danger-layer")) return ruleItems("红色危险层板不能踩");
    if (variant.includes("final")) return ruleItems("部分平台会随机移动", "脆弱层板踩上后会碎裂", "红色危险层板不能踩");
  }
  return ruleItems(stripRuleDescription(config.passText));
}

function getNativeRuleItems(config: AdvancedStageConfig) {
  if (config.dimension === "reaction") {
    if (config.variant.includes("grid")) return ruleItems("多个格子会同时变化", "红灯出现时不能点击");
    if (config.variant.includes("dual-trap")) return ruleItems("双区域里会混入红灯");
    if (config.variant.includes("dual-green")) return ruleItems("两个区域都会出现绿灯");
    return ruleItems("红灯出现时不能点击");
  }
  if (config.dimension === "aim") {
    if (config.variant.includes("boss")) return ruleItems("移动靶会改变路线", "会出现干扰靶", "靶子飞出算失败");
    if (config.variant.includes("incoming")) return ruleItems("靶子会从场外飞入");
    if (config.variant.includes("decoy")) return ruleItems("会出现干扰靶");
    return ruleItems("靶子会沿轨迹移动");
  }
  if (config.dimension === "braking") {
    if (config.variant.includes("final") || typeof config.params.dualRule === "string") return ruleItems("请遵守游戏内特殊规则");
    if (config.params.allowGray === true) return ruleItems("红色松手，灰色继续按住");
    return ruleItems("红色危险出现时松手");
  }
  if (config.dimension === "patience") return ruleItems("等待期间不能中断");
  return ruleItems(stripRuleDescription(config.passText));
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

function isFallDownDangerPlatformLevel(levelId: string) {
  return levelId.includes("danger") || levelId.includes("final");
}

function isFlappyCollectibleLevel(config: AdvancedStageConfig) {
  return config.variant.includes("collectible-path") || config.variant.includes("final");
}

function riskPlatformGoalText() {
  return "必须踩中所有高能平台";
}

function collectibleGoalText() {
  return "收集所有道具";
}

function getMiniGameGoals(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const miniGameId = config.params.miniGameId;
  const miniLevelId = config.params.miniLevelId;
  if (!isMiniGameId(miniGameId) || typeof miniLevelId !== "string") return [];

  const group = resolveBandGroup(config.level);
  if (config.dimension === "search") {
    return compactGoals([
      { icon: "flag", text: "不能掉出场景外" },
      { icon: "target", text: riskPlatformGoalText() },
      { icon: "ban", text: "不能撞到危险" },
    ]);
  }
  if (config.dimension === "stroop") {
    const dangerPlatformLevel = isFallDownDangerPlatformLevel(miniLevelId);
    return compactGoals([
      { icon: "flag", text: "不能掉出场景外" },
      group === "258" || group === "369" || group === "10" ? { icon: "ban", text: "不能触碰到危险红点" } : null,
      dangerPlatformLevel ? { icon: "ban", text: "不能踩到危险平台" } : null,
    ]);
  }
  if (config.dimension === "rhythm") {
    return [
      { icon: "flag", text: "到达终点平台" },
    ];
  }
  if (config.dimension === "memory") {
    return compactGoals([
      { icon: "ban", text: "不能撞到柱子" },
      { icon: "flag", text: "不能掉出场景外" },
      isFlappyCollectibleLevel(config) ? { icon: "target", text: collectibleGoalText() } : null,
    ]);
  }
  if (config.dimension === "patience") {
    return compactGoals([
      { icon: "ban", text: "转盘上的飞刀不能重叠" },
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
  const levels = [
    ENDLESS_MODE_LEVEL,
    ...Array.from({ length: ADVANCED_LEVEL_MAX }, (_, index) => index + ADVANCED_STANDARD_LEVEL_MIN),
  ];
  return levels.map((level) => {
    const offset = level - selected;
    const position: AdvancedLobbyLevelPosition =
      offset === 0 ? "selected" : offset === -1 ? "previous" : offset === 1 ? "next" : "distant";
    const state = level === ENDLESS_MODE_LEVEL ? getEndlessLevelState(currentLevel) : getAdvancedLevelState(currentLevel, level);
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
  if (requestedLevel === ENDLESS_MODE_LEVEL) {
    return getEndlessLevelState(currentLevel) === "locked" ? null : ENDLESS_MODE_LEVEL;
  }
  if (requestedLevel < ENDLESS_MODE_LEVEL) return null;
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
  return clampInteger(requestedLevel, ADVANCED_STANDARD_LEVEL_MIN, getAdvancedLobbyUnlockedLevel(currentLevel));
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

export function getAdvancedChallengeRuleItems(config: AdvancedStageConfig): AdvancedChallengeGoalItem[] {
  const miniGameId = config.params.miniGameId;
  if (isMiniGameId(miniGameId)) return getMiniGameRuleItems(config, miniGameId);
  return getNativeRuleItems(config);
}

export function getAdvancedFailedResultGoalItems<T extends AdvancedResultGoalItem>(goalItems: T[]): T[] {
  const failedGoals = goalItems.filter((goal) => !goal.complete);
  if (failedGoals.length <= 1) return failedGoals;
  return failedGoals.filter((goal) => !(goal.icon === "bolt" && goal.text.includes("平均反应")));
}

export function getAdvancedLobbySliderOffsetRatio(selectedLevel: number) {
  return (clampDisplayLevel(selectedLevel) - ADVANCED_STANDARD_LEVEL_MIN) / (ADVANCED_LEVEL_MAX - ADVANCED_STANDARD_LEVEL_MIN);
}
