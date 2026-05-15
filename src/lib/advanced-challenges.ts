import type { RoundId, TrialEvent } from "./scoring";

type MiniGameId = "doodle" | "flappy" | "knife" | "square-jump" | "fall-down";

export type AdvancedDifficulty = "easy" | "medium" | "hard" | "boss";

export type AdvancedStageConfig = {
  dimension: RoundId;
  level: number;
  variant: string;
  variantIndex: 1 | 2 | 3 | 10;
  difficulty: AdvancedDifficulty;
  passText: string;
  params: Record<string, number | string | boolean | null>;
};

export type AdvancedCompletionEvaluation = {
  level: number;
  score: number;
  minScore: number;
  passed: boolean;
  correctCount: number;
  requiredCorrect: number;
  reason: string;
};

export type AdvancedBrakeDanger = "red" | "gray";
export type AdvancedBrakeAction = "release" | "hold";
export type AdvancedBrakeEvent = {
  top: AdvancedBrakeDanger | null;
  bottom: AdvancedBrakeDanger | null;
  correctAction?: AdvancedBrakeAction;
};
export type AdvancedBrakeReleaseOutcome =
  | { outcome: "pause" }
  | { outcome: "success" }
  | { outcome: "failure"; errorType: "false_alarm" | "early_stop" };

type ConfigInput = Omit<AdvancedStageConfig, "dimension">;

const difficultyByBand = ["easy", "medium", "hard"] as const;
const reactionThresholds = [350, 300, 250] as const;
const reactionCounts = [5, 6, 7] as const;
const miniVariantSlug: Record<MiniGameId, Record<string, string>> = {
  doodle: {
    移动平台: "moving-platform",
    必踩高风险平台: "risk-platform",
    移动障碍: "moving-obstacle",
    综合最终关: "final",
  },
  flappy: {
    移动门: "moving-gate",
    收集路径道具: "collectible-path",
    反重力反向: "reverse-gravity",
    综合最终关: "final",
  },
  knife: {
    发射倒计时: "countdown",
    转速正弦波动: "sine-rotation",
    不可插区域: "forbidden-zone",
    综合最终关: "final",
  },
  "square-jump": {
    移动落点: "moving-landing",
    二段跳跃: "double-jump",
    重力平台: "gravity-platform",
    综合最终关: "final",
  },
  "fall-down": {
    移动层板: "moving-layer",
    脆弱层板: "fragile-layer",
    危险层板: "danger-layer",
    综合最终关: "final",
  },
};
type MiniAdvancedLevelInput = {
  order: number;
  levelId?: string;
  variant: string;
  goalText: string;
  description: string;
  params: AdvancedStageConfig["params"];
};
const miniProgressionOrder = [1, 4, 7, 2, 5, 8, 3, 6, 9, 10] as const;

function createDimensionConfigs(roundId: RoundId, configs: ConfigInput[]): AdvancedStageConfig[] {
  return configs.map((config) => ({ ...config, dimension: roundId }));
}

function bandIndex(level: number) {
  if (level >= 7) return 2;
  if (level >= 4) return 1;
  return 0;
}

function diff(level: number): AdvancedDifficulty {
  return level === 10 ? "boss" : difficultyByBand[bandIndex(level)];
}

function variantIndex(level: number): 1 | 2 | 3 | 10 {
  if (level === 10) return 10;
  return (((level - 1) % 3) + 1) as 1 | 2 | 3;
}

function config(
  level: number,
  variant: string,
  passText: string,
  params: AdvancedStageConfig["params"],
): ConfigInput {
  return {
    level,
    variant,
    variantIndex: variantIndex(level),
    difficulty: diff(level),
    passText,
    params,
  };
}

function reactionConfigs() {
  const levels: ConfigInput[] = [];
  for (const level of [1, 4, 7]) {
    const index = bandIndex(level);
    levels.push(
      config(level, "reaction-red-trap", `过关要求：完成 ${reactionCounts[index]} 个红绿信号，红灯不能点，平均反应 ≤ ${reactionThresholds[index]}ms。`, {
        signalCount: reactionCounts[index],
        avgMsThreshold: reactionThresholds[index],
        requiredGreenClicks: 1,
        lanes: 1,
      }),
    );
  }
  for (const level of [2, 5, 8]) {
    const index = bandIndex(level);
    levels.push(
      config(level, "reaction-dual-green", `过关要求：完成 ${reactionCounts[index]} 次绿灯点击，平均反应 ≤ ${reactionThresholds[index]}ms。`, {
        requiredGreenClicks: reactionCounts[index],
        avgMsThreshold: reactionThresholds[index],
        lanes: 2,
      }),
    );
  }
  for (const level of [3, 6, 9]) {
    const index = bandIndex(level);
    levels.push(
      config(level, "reaction-dual-trap", `过关要求：完成 ${reactionCounts[index]} 个红绿信号，红灯不能点，平均反应 ≤ ${reactionThresholds[index]}ms。`, {
        signalCount: reactionCounts[index],
        avgMsThreshold: reactionThresholds[index],
        requiredGreenClicks: 1,
        lanes: 2,
      }),
    );
  }
  levels.push(
    config(10, "reaction-grid-boss", "过关要求：累计 8 次绿格点击，红格不能点，平均反应 ≤ 250ms。", {
      requiredGreenClicks: 8,
      avgMsThreshold: 250,
      lanes: 4,
      maxLitCells: 2,
    }),
  );
  return levels.sort((a, b) => a.level - b.level);
}

function aimConfigs() {
  return [
    config(1, "aim-track", "过关要求：8 箭全中圆形轨迹靶。", {
      aimMode: "track",
      arrowCount: 8,
      targetCount: 8,
      route: "circle",
      failOnFlyOut: false,
      decoyCount: 0,
      targetSize: 58,
      targetSpeed: 0.0016,
    }),
    config(2, "aim-incoming", "过关要求：连续命中所有飞入靶，靶子飞出算失败。", {
      aimMode: "incoming",
      arrowCount: 8,
      targetCount: 8,
      route: "incoming",
      failOnFlyOut: true,
      spawnIntervalMs: 900,
      targetSize: 56,
      targetSpeed: 0.09,
    }),
    config(3, "aim-decoy", "过关要求：只打高亮目标，不碰 1 个干扰靶。", {
      aimMode: "decoy",
      arrowCount: 8,
      targetCount: 8,
      route: "diagonal",
      failOnFlyOut: false,
      decoyCount: 1,
      targetSize: 56,
      targetSpeed: 0.0018,
    }),
    config(4, "aim-track", "过关要求：8 箭全中椭圆变速轨迹靶。", {
      aimMode: "track",
      arrowCount: 8,
      targetCount: 8,
      route: "ellipse",
      failOnFlyOut: false,
      decoyCount: 0,
      targetSize: 50,
      targetSpeed: 0.002,
    }),
    config(5, "aim-incoming", "过关要求：连续命中所有飞入靶，靶子飞出算失败。", {
      aimMode: "incoming",
      arrowCount: 8,
      targetCount: 8,
      route: "incoming",
      failOnFlyOut: true,
      spawnIntervalMs: 760,
      targetSize: 48,
      targetSpeed: 0.12,
    }),
    config(6, "aim-decoy", "过关要求：只打高亮目标，不碰 2 个干扰靶。", {
      aimMode: "decoy",
      arrowCount: 8,
      targetCount: 8,
      route: "diagonal",
      failOnFlyOut: false,
      decoyCount: 2,
      targetSize: 48,
      targetSpeed: 0.0022,
    }),
    config(7, "aim-track", "过关要求：8 箭全中 8 字轨迹靶。", {
      aimMode: "track",
      arrowCount: 8,
      targetCount: 8,
      route: "figure-eight",
      failOnFlyOut: false,
      decoyCount: 0,
      targetSize: 44,
      targetSpeed: 0.0025,
    }),
    config(8, "aim-incoming", "过关要求：连续命中所有飞入靶，靶子飞出算失败。", {
      aimMode: "incoming",
      arrowCount: 8,
      targetCount: 8,
      route: "incoming",
      failOnFlyOut: true,
      spawnIntervalMs: 620,
      targetSize: 42,
      targetSpeed: 0.15,
    }),
    config(9, "aim-decoy", "过关要求：只打高亮目标，不碰 3 个干扰靶。", {
      aimMode: "decoy",
      arrowCount: 8,
      targetCount: 8,
      route: "diagonal",
      failOnFlyOut: false,
      decoyCount: 3,
      targetSize: 42,
      targetSpeed: 0.0026,
    }),
    config(10, "aim-boss", "过关要求：组合靶场全中，不能射中干扰靶，目标飞出算失败。", {
      aimMode: "boss",
      arrowCount: 10,
      targetCount: 10,
      route: "mixed",
      failOnFlyOut: true,
      decoyCount: 3,
      spawnIntervalMs: 680,
      targetSize: 42,
      targetSpeed: 0.15,
    }),
  ];
}

function brakingConfigs() {
  return [
    config(1, "braking-single-red", "过关要求：长按前进，红色危险出现时松手，到终点。", {
      hazardCount: 3,
      eventCountMin: 3,
      eventCountMax: 4,
      allowGray: false,
      lanes: 1,
      exitRequired: true,
      speedPerSecond: 14,
      reactionWindowMs: 650,
      eventDurationMs: 550,
      minEventDelayMs: 1400,
      maxEventDelayMs: 2100,
      finishSafeDistance: 12,
    }),
    config(2, "braking-red-gray", "过关要求：红色松手，灰色继续按住，到终点。", {
      hazardCount: 5,
      eventCountMin: 5,
      eventCountMax: 6,
      allowGray: true,
      lanes: 1,
      exitRequired: true,
      speedPerSecond: 12.5,
      reactionWindowMs: 580,
      grayHoldMs: 550,
      eventDurationMs: 550,
      minEventDelayMs: 1200,
      maxEventDelayMs: 1900,
      finishSafeDistance: 12,
    }),
    config(3, "braking-dual-red-rule", "过关要求：单个红色松手，两个红色继续按住，到终点。", {
      hazardCount: 4,
      eventCountMin: 4,
      eventCountMax: 5,
      allowGray: false,
      lanes: 2,
      exitRequired: true,
      speedPerSecond: 11,
      reactionWindowMs: 600,
      eventDurationMs: 600,
      minEventDelayMs: 1200,
      maxEventDelayMs: 1800,
      finishSafeDistance: 12,
      dualRule: "single-red-stop",
    }),
    config(4, "braking-single-red", "过关要求：长按前进，连续处理红色危险，到终点。", {
      hazardCount: 5,
      eventCountMin: 5,
      eventCountMax: 6,
      allowGray: false,
      lanes: 1,
      exitRequired: true,
      speedPerSecond: 11.5,
      reactionWindowMs: 500,
      eventDurationMs: 600,
      minEventDelayMs: 1000,
      maxEventDelayMs: 1700,
      finishSafeDistance: 12,
    }),
    config(5, "braking-red-gray", "过关要求：红色松手，灰色继续按住，随机混合到终点。", {
      hazardCount: 7,
      eventCountMin: 7,
      eventCountMax: 8,
      allowGray: true,
      lanes: 1,
      exitRequired: true,
      speedPerSecond: 10.5,
      reactionWindowMs: 480,
      grayHoldMs: 500,
      eventDurationMs: 600,
      minEventDelayMs: 900,
      maxEventDelayMs: 1500,
      finishSafeDistance: 12,
    }),
    config(6, "braking-dual-red-rule", "过关要求：两个红色松手，单个红色继续按住，到终点。", {
      hazardCount: 6,
      eventCountMin: 6,
      eventCountMax: 7,
      allowGray: false,
      lanes: 2,
      exitRequired: true,
      speedPerSecond: 9.5,
      reactionWindowMs: 520,
      eventDurationMs: 600,
      minEventDelayMs: 900,
      maxEventDelayMs: 1500,
      finishSafeDistance: 12,
      dualRule: "double-red-stop",
    }),
    config(7, "braking-single-red", "过关要求：长按前进，高压处理红色危险，到终点。", {
      hazardCount: 7,
      eventCountMin: 7,
      eventCountMax: 8,
      allowGray: false,
      lanes: 1,
      exitRequired: true,
      speedPerSecond: 9,
      reactionWindowMs: 420,
      eventDurationMs: 650,
      minEventDelayMs: 750,
      maxEventDelayMs: 1350,
      finishSafeDistance: 12,
    }),
    config(8, "braking-red-gray", "过关要求：红色松手，灰色继续按住，高压混合到终点。", {
      hazardCount: 9,
      eventCountMin: 9,
      eventCountMax: 10,
      allowGray: true,
      lanes: 1,
      exitRequired: true,
      speedPerSecond: 8.8,
      reactionWindowMs: 400,
      grayHoldMs: 450,
      eventDurationMs: 650,
      minEventDelayMs: 650,
      maxEventDelayMs: 1250,
      finishSafeDistance: 12,
    }),
    config(9, "braking-dual-red-rule", "过关要求：单个红色松手，两个红色继续按住，高压到终点。", {
      hazardCount: 8,
      eventCountMin: 8,
      eventCountMax: 9,
      allowGray: false,
      lanes: 2,
      exitRequired: true,
      speedPerSecond: 8.3,
      reactionWindowMs: 450,
      eventDurationMs: 650,
      minEventDelayMs: 650,
      maxEventDelayMs: 1250,
      finishSafeDistance: 12,
      dualRule: "single-red-stop",
    }),
    config(10, "braking-final-red-gray", "过关要求：单红松手，双红和灰色继续按住，到终点。", {
      hazardCount: 10,
      eventCountMin: 10,
      eventCountMax: 12,
      allowGray: true,
      lanes: 2,
      exitRequired: true,
      speedPerSecond: 7.5,
      reactionWindowMs: 420,
      grayHoldMs: 500,
      eventDurationMs: 650,
      minEventDelayMs: 550,
      maxEventDelayMs: 1100,
      finishSafeDistance: 12,
    }),
  ];
}

function miniAdvancedLevel(
  order: number,
  variant: string,
  goalText: string,
  description: string,
  params: AdvancedStageConfig["params"],
  levelId?: string,
): MiniAdvancedLevelInput {
  return { order, levelId, variant, goalText, description, params };
}

const miniAdvancedLevels: Record<MiniGameId, MiniAdvancedLevelInput[]> = {
  doodle: [
    miniAdvancedLevel(1, "移动平台", "到达 4 屏高度", "移动平台比例约 40%，少量危险障碍，速度慢。", { targetHeightScreens: 4, movingPlatformRatio: 0.4, movingPlatformSpeed: 22, hazardDensity: 0.45 }),
    miniAdvancedLevel(2, "移动平台", "到达 6 屏高度", "移动平台比例约 70%，中等危险障碍，速度中等。", { targetHeightScreens: 6, movingPlatformRatio: 0.7, movingPlatformSpeed: 34, hazardDensity: 0.8 }),
    miniAdvancedLevel(3, "移动平台", "到达 8 屏高度", "全部平台移动，危险障碍更多，速度较快。", { targetHeightScreens: 8, movingPlatformRatio: 1, movingPlatformSpeed: 46, hazardDensity: 1.2 }),
    miniAdvancedLevel(4, "必踩高风险平台", "到达 5 屏高度，必踩 3/3", "必须踩中 3 个略窄高风险平台，统一 1.6 倍弹跳。", { targetHeightScreens: 5, movingPlatformRatio: 0, requiredRiskPlatforms: 3, riskJumpMultiplier: 1.6 }),
    miniAdvancedLevel(5, "必踩高风险平台", "到达 7 屏高度，必踩 5/5", "必须踩中 5 个中等宽度高风险平台。", { targetHeightScreens: 7, movingPlatformRatio: 0, requiredRiskPlatforms: 5, riskJumpMultiplier: 1.6 }),
    miniAdvancedLevel(6, "必踩高风险平台", "到达 9 屏高度，必踩 7/7", "必须踩中 7 个更窄高风险平台，静态危险障碍更多。", { targetHeightScreens: 9, movingPlatformRatio: 0, requiredRiskPlatforms: 7, riskJumpMultiplier: 1.6 }),
    miniAdvancedLevel(7, "移动障碍", "到达 5 屏高度", "少量移动障碍在平台旁缓慢移动。", { targetHeightScreens: 5, movingObstacleCount: 5, movementPattern: "horizontal" }),
    miniAdvancedLevel(8, "移动障碍", "到达 7 屏高度", "移动障碍数量增加，部分会穿过常用跳跃路线。", { targetHeightScreens: 7, movingObstacleCount: 9, movementPattern: "horizontal|vertical|patrolDiagonal" }),
    miniAdvancedLevel(9, "移动障碍", "到达 9 屏高度", "较多移动障碍持续压迫连续平台之间的上升路线。", { targetHeightScreens: 9, movingObstacleCount: 13, movementPattern: "horizontal|vertical|patrolDiagonal|orbitSmall|pulse|slowCross" }),
    miniAdvancedLevel(10, "综合最终关", "到达 10 屏高度，必踩 8/8", "全移动平台，8 个必踩高风险平台，后段加入更多移动障碍。", { targetHeightScreens: 10, movingPlatformRatio: 1, requiredRiskPlatforms: 8, movingObstacleCount: 20, riskJumpMultiplier: 1.6 }),
  ],
  flappy: [
    miniAdvancedLevel(1, "移动门", "通过 8 个门", "8 门，30% 移动门，缝隙大，速度慢。", { gateCount: 8, movingGateRatio: 0.3, collectibleCount: 0 }),
    miniAdvancedLevel(2, "移动门", "通过 10 个门", "10 门，50% 移动门，缝隙中等。", { gateCount: 10, movingGateRatio: 0.5, collectibleCount: 0 }),
    miniAdvancedLevel(3, "移动门", "通过 12 个门", "12 门，70% 移动门，缝隙略小。", { gateCount: 12, movingGateRatio: 0.7, collectibleCount: 0 }),
    miniAdvancedLevel(4, "收集路径道具", "通过 8 门，收集 4/4", "必须收集 4 个接近安全中心线的道具。", { gateCount: 8, movingGateRatio: 0, collectibleCount: 4 }),
    miniAdvancedLevel(5, "收集路径道具", "通过 10 门，收集 6/6", "必须收集 6 个略微偏上或偏下的道具。", { gateCount: 10, movingGateRatio: 0, collectibleCount: 6 }),
    miniAdvancedLevel(6, "收集路径道具", "通过 12 门，收集 8/8", "必须收集 8 个更靠近缝隙边缘的道具。", { gateCount: 12, movingGateRatio: 0, collectibleCount: 8 }),
    miniAdvancedLevel(7, "反重力反向", "通过 6 个门", "角色从右往左移动，不点击向上漂，点击向下压。", { gateCount: 6, movingGateRatio: 0, collectibleCount: 0, reversedGravity: true, reverseDirection: true }),
    miniAdvancedLevel(8, "反重力反向", "通过 8 个门", "反向移动速度中等，缝隙中等。", { gateCount: 8, movingGateRatio: 0, collectibleCount: 0, reversedGravity: true, reverseDirection: true }),
    miniAdvancedLevel(9, "反重力反向", "通过 10 个门", "反向速度较快，门位变化更明显。", { gateCount: 10, movingGateRatio: 0, collectibleCount: 0, reversedGravity: true, reverseDirection: true }),
    miniAdvancedLevel(10, "综合最终关", "通过 13 门，收集 7/7", "反向移动和反重力，移动门与必收集道具同时出现。", { gateCount: 13, movingGateRatio: 0.45, collectibleCount: 7, reversedGravity: true, reverseDirection: true }),
  ],
  knife: [
    miniAdvancedLevel(1, "发射倒计时", "命中 7 发", "每发 3.0 秒倒计时，初始障碍 1 个。", { shotCount: 7, shotCountdown: 3, initialObstacleCount: 1 }),
    miniAdvancedLevel(2, "发射倒计时", "命中 9 发", "每发 2.5 秒倒计时，初始障碍 2 个。", { shotCount: 9, shotCountdown: 2.5, initialObstacleCount: 2 }),
    miniAdvancedLevel(3, "发射倒计时", "命中 11 发", "每发 2.0 秒倒计时，初始障碍 3 个。", { shotCount: 11, shotCountdown: 2, initialObstacleCount: 3 }),
    miniAdvancedLevel(4, "转速正弦波动", "命中 7 发", "正弦速度按 0 到正反最快循环。", { shotCount: 7, sineRotationEnabled: true, phaseDuration: 3, sweepPerPhase: 390, initialObstacleCount: 1 }),
    miniAdvancedLevel(5, "转速正弦波动", "命中 9 发", "正弦速度中等，初始障碍 2 个。", { shotCount: 9, sineRotationEnabled: true, phaseDuration: 2.8, sweepPerPhase: 405, initialObstacleCount: 2 }),
    miniAdvancedLevel(6, "转速正弦波动", "命中 11 发", "正弦速度更快，初始障碍 3 个。", { shotCount: 11, sineRotationEnabled: true, phaseDuration: 2.55, sweepPerPhase: 420, initialObstacleCount: 3 }),
    miniAdvancedLevel(7, "不可插区域", "命中 7 发，避开禁区", "1 块不可插区域，总面积约 12%。", { shotCount: 7, forbiddenZoneCount: 1, forbiddenZoneRatio: 0.12, initialObstacleCount: 1 }),
    miniAdvancedLevel(8, "不可插区域", "命中 9 发，避开禁区", "2 块不可插区域，总面积约 18%。", { shotCount: 9, forbiddenZoneCount: 2, forbiddenZoneRatio: 0.18, initialObstacleCount: 2 }),
    miniAdvancedLevel(9, "不可插区域", "命中 11 发，避开禁区", "3 块不可插区域，总面积约 24%。", { shotCount: 11, forbiddenZoneCount: 3, forbiddenZoneRatio: 0.24, initialObstacleCount: 3 }),
    miniAdvancedLevel(10, "综合最终关", "命中 13 发，避开禁区和旧刀", "倒计时、正弦转速和不可插区域同时出现。", { shotCount: 13, shotCountdown: 2.3, sineRotationEnabled: true, phaseDuration: 2.7, sweepPerPhase: 405, forbiddenZoneCount: 2, forbiddenZoneRatio: 0.2, initialObstacleCount: 3 }),
  ],
  "square-jump": [
    miniAdvancedLevel(1, "移动落点", "预判移动平台并完成 4 次跳跃", "1 个慢速移动平台，平台较宽，距离变化小。", {}, "square-jump-moving-easy"),
    miniAdvancedLevel(2, "移动落点", "预判移动平台并完成 5 次跳跃", "连续 3 个中速移动平台，宽度正常，距离略随机。", {}, "square-jump-moving-normal"),
    miniAdvancedLevel(3, "移动落点", "预判快速移动平台并完成 6 次跳跃", "多个快速窄平台会反向移动，需要提前预判落点。", {}, "square-jump-moving-hard"),
    miniAdvancedLevel(4, "二段跳跃", "用二段跳完成 4 次跳跃", "跳起后可在空中再次蓄力，悬停后释放完成二段跳。", {}, "square-jump-double-easy"),
    miniAdvancedLevel(5, "二段跳跃", "用二段跳完成 5 次跳跃", "平台距离更远，空中二段蓄力会悬停，释放后继续前进。", {}, "square-jump-double-normal"),
    miniAdvancedLevel(6, "二段跳跃", "用二段跳完成 6 次跳跃", "窄平台和远距离同时出现，需要在空中把握二段蓄力时机。", {}, "square-jump-double-hard"),
    miniAdvancedLevel(7, "重力平台", "根据重力状态完成 4 次跳跃", "只出现正常和变轻平台，变轻后会跳得更远。", {}, "square-jump-gravity-easy"),
    miniAdvancedLevel(8, "重力平台", "根据三种重力完成 5 次跳跃", "正常、变轻、加重平台都会出现，需要连续判断当前状态。", {}, "square-jump-gravity-normal"),
    miniAdvancedLevel(9, "重力平台", "根据重力反向考验完成 6 次跳跃", "反向考验更多：变轻接近平台、加重接远平台，容错更低。", {}, "square-jump-gravity-hard"),
    miniAdvancedLevel(10, "综合最终关", "连续跳到终点平台", "综合移动落点、二段跳和重力切换平台，一路跳到终点。", {}, "square-jump-final"),
  ],
  "fall-down": [
    miniAdvancedLevel(1, "移动层板", "通过慢速移动层板", "少量移动平台，宽度较大，练习预判下落位置。", {}, "fall-down-moving-easy"),
    miniAdvancedLevel(2, "移动层板", "通过连续移动层板", "移动平台数量增加，间距变大，需要提前调整左右位置。", {}, "fall-down-moving-normal"),
    miniAdvancedLevel(3, "移动层板", "通过高压移动层板", "连续移动窄平台，部分方向相反，顶部压线更快。", {}, "fall-down-moving-hard"),
    miniAdvancedLevel(4, "脆弱层板", "避开碎裂压力下降", "少量脆弱平台，踩上后约 1.8 秒碎裂。", {}, "fall-down-fragile-easy"),
    miniAdvancedLevel(5, "脆弱层板", "连续通过脆弱层板", "脆弱平台数量增加，碎裂时间更短，不能停留太久。", {}, "fall-down-fragile-normal"),
    miniAdvancedLevel(6, "脆弱层板", "在碎裂前连续下降", "连续脆弱窄平台，最后几层几乎不能停留。", {}, "fall-down-fragile-hard"),
    miniAdvancedLevel(7, "危险层板", "避开危险平台下降", "少量红色危险平台，安全路线明显。", {}, "fall-down-danger-easy"),
    miniAdvancedLevel(8, "危险层板", "选择安全层板下降", "危险平台数量增加，部分安全平台更窄。", {}, "fall-down-danger-normal"),
    miniAdvancedLevel(9, "危险层板", "连续避开危险层板", "危险平台和窄安全平台交错，需要连续选择路线。", {}, "fall-down-danger-hard"),
    miniAdvancedLevel(10, "综合最终关", "完成百层试炼", "综合移动、脆弱和危险层板，下降到终点平台。", {}, "fall-down-final"),
  ],
};

function miniGameConfigs(gameId: MiniGameId) {
  const levels = miniAdvancedLevels[gameId];
  return miniProgressionOrder.map((sourceOrder, index) => {
    const level = levels.find((item) => item.order === sourceOrder) ?? levels[index];
    return config(index + 1, `mini-${gameId}-${miniVariantSlug[gameId][level.variant] ?? level.variant}`, `过关要求：${level.goalText}。${level.description}`, {
      ...level.params,
      miniGameId: gameId,
      miniLevelId: level.levelId ?? `${gameId}-${sourceOrder}`,
    });
  });
}

function completeBrakeEvent(level: number, event: AdvancedBrakeEvent): AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction } {
  return { ...event, correctAction: getAdvancedBrakeCorrectAction(level, event) };
}

function getBrakeVariantIndex(level: number) {
  return level === 10 ? 10 : variantIndex(level);
}

export function getAdvancedBrakeCorrectAction(level: number, event: AdvancedBrakeEvent): AdvancedBrakeAction {
  const redCount = (event.top === "red" ? 1 : 0) + (event.bottom === "red" ? 1 : 0);
  const grayCount = (event.top === "gray" ? 1 : 0) + (event.bottom === "gray" ? 1 : 0);
  const brakeVariantIndex = getBrakeVariantIndex(level);

  if (brakeVariantIndex === 3) return level === 6 ? (redCount === 2 ? "release" : "hold") : redCount === 1 ? "release" : "hold";
  if (level === 10) return redCount === 1 && grayCount === 0 ? "release" : "hold";
  return event.top === "gray" || event.bottom === "gray" ? "hold" : "release";
}

export function getAdvancedBrakeEventOptions(
  level: number,
  context: { eventIndex?: number; eventCount?: number; previousEvent?: AdvancedBrakeEvent | null } = {},
): Array<AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }> {
  const eventIndex = context.eventIndex ?? 2;
  const eventCount = context.eventCount ?? Number.POSITIVE_INFINITY;
  const previousEvent = context.previousEvent ?? null;
  const previousWasGray = previousEvent?.top === "gray" || previousEvent?.bottom === "gray";
  const isFirst = eventIndex <= 0;
  const isLast = eventIndex >= eventCount - 1;
  const brakeVariantIndex = getBrakeVariantIndex(level);

  let options: AdvancedBrakeEvent[];
  if (brakeVariantIndex === 1) {
    options = [{ top: "red", bottom: null }];
  } else if (brakeVariantIndex === 2) {
    options =
      isFirst || isLast || previousWasGray
        ? [{ top: "red", bottom: null }]
        : [
            { top: "red", bottom: null },
            { top: "gray", bottom: null },
          ];
  } else if (level === 10) {
    options =
      isFirst || isLast || eventIndex < 2 || previousWasGray
        ? [
            { top: "red", bottom: null },
            { top: null, bottom: "red" },
          ]
        : [
            { top: "red", bottom: null },
            { top: null, bottom: "red" },
            { top: "red", bottom: "red" },
            { top: "gray", bottom: null },
            { top: null, bottom: "gray" },
            { top: "gray", bottom: "gray" },
          ];
  } else {
    options = [
      { top: "red", bottom: null },
      { top: null, bottom: "red" },
      { top: "red", bottom: "red" },
    ];
  }

  return options.map((event) => completeBrakeEvent(level, event));
}

export function getAdvancedBrakeDangerLeft({
  runnerLeftPercent,
  runnerWidthPercent,
  hazardWidthPercent,
  speedPerSecond,
  reactionWindowMs,
}: {
  runnerLeftPercent: number;
  runnerWidthPercent: number;
  hazardWidthPercent: number;
  speedPerSecond: number;
  reactionWindowMs: number;
}) {
  const reactionDistance = (speedPerSecond * reactionWindowMs) / 1000;
  const hazardLeft = runnerLeftPercent + runnerWidthPercent + reactionDistance;
  const maxHazardLeft = 100 - hazardWidthPercent;
  if (hazardLeft > maxHazardLeft) return null;
  return Number(hazardLeft.toFixed(4));
}

export function getAdvancedBrakeHasReachedFinish({
  runnerLeftPercent,
  runnerWidthPercent,
}: {
  runnerLeftPercent: number;
  runnerWidthPercent: number;
}) {
  return runnerLeftPercent + runnerWidthPercent >= 100;
}

export function getAdvancedBrakeSchedulerStep({
  holding,
  activeEvent,
  eventTimerMs,
  deltaMs,
  eventCountUsed,
  eventCountTarget,
  nearFinish,
}: {
  holding: boolean;
  activeEvent: boolean;
  eventTimerMs: number;
  deltaMs: number;
  eventCountUsed: number;
  eventCountTarget: number;
  nearFinish: boolean;
}) {
  if (!holding || activeEvent || eventCountUsed >= eventCountTarget || nearFinish) {
    return { eventTimerMs, shouldSpawn: false };
  }

  const nextTimer = Math.max(0, eventTimerMs - deltaMs);
  return { eventTimerMs: nextTimer, shouldSpawn: nextTimer <= 0 };
}

export function getAdvancedBrakeReleaseOutcome(event: (AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }) | null): AdvancedBrakeReleaseOutcome {
  if (!event) return { outcome: "pause" as const };
  if (event.correctAction === "release") return { outcome: "success" as const };
  const hasGray = event.top === "gray" || event.bottom === "gray";
  return { outcome: "failure" as const, errorType: hasGray ? "false_alarm" : "early_stop" };
}

export const ADVANCED_STAGE_CONFIGS: Record<RoundId, AdvancedStageConfig[]> = {
  reaction: createDimensionConfigs("reaction", reactionConfigs()),
  aim: createDimensionConfigs("aim", aimConfigs()),
  search: createDimensionConfigs("search", miniGameConfigs("doodle")),
  stroop: createDimensionConfigs("stroop", miniGameConfigs("fall-down")),
  rhythm: createDimensionConfigs("rhythm", miniGameConfigs("square-jump")),
  memory: createDimensionConfigs("memory", miniGameConfigs("flappy")),
  braking: createDimensionConfigs("braking", brakingConfigs()),
  patience: createDimensionConfigs("patience", miniGameConfigs("knife")),
};

function clampLevel(level: number) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(10, Math.floor(level)));
}

export function getAdvancedStageConfig(roundId: RoundId, level: number): AdvancedStageConfig {
  const normalizedLevel = clampLevel(level);
  return ADVANCED_STAGE_CONFIGS[roundId]?.[normalizedLevel - 1] ?? ADVANCED_STAGE_CONFIGS.reaction[0];
}

export function getDebugToolsVisibility({
  nodeEnv,
  search,
}: {
  nodeEnv?: string;
  search?: string;
}) {
  if (nodeEnv === "development") return true;
  return new URLSearchParams((search ?? "").replace(/^\?/, "")).get("debug") === "1";
}

export function shouldShowPerfectClearShortcut({ debugToolsVisible }: { debugToolsVisible: boolean }) {
  void debugToolsVisible;
  return true;
}

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
    score: Math.max(0, Math.min(99, Math.round((correctCount / Math.max(1, requiredCorrect)) * 100))),
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
  const redClick = trials.find(
    (trial) =>
      (trial.value?.signalColor === "red" || trial.value?.cellColor === "red") &&
      (trial.responseAt !== null || trial.correct === false || trial.errorType === "false_alarm"),
  );
  if (redClick) return fail(config, 0, requiredGreenClicks, "失败：点到了红灯");

  const green = greenTrials(trials);
  const missedGreen = green.find((trial) => trial.responseAt === null || trial.errorType === "timeout" || trial.errorType === "miss");
  if (missedGreen) return fail(config, green.filter((trial) => trial.correct === true && trial.responseAt !== null).length, requiredGreenClicks, "失败：漏点");

  const successfulGreen = green.filter((trial) => trial.correct === true && trial.responseAt !== null);
  if (successfulGreen.length < requiredGreenClicks) {
    return fail(config, successfulGreen.length, requiredGreenClicks, `失败：少点了 ${requiredGreenClicks - successfulGreen.length} 次绿灯`);
  }

  const average = Math.round(
    successfulGreen.reduce((sum, trial) => sum + (reactionMs(trial) ?? threshold + 1), 0) / successfulGreen.length,
  );
  if (average > threshold) {
    return fail(config, successfulGreen.length, requiredGreenClicks, `失败：平均反应 ${average}ms，要求 ≤ ${threshold}ms`);
  }
  return pass(config, successfulGreen.length, requiredGreenClicks);
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
