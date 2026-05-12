import type { RoundId, TrialEvent } from "./scoring";

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
const patienceWaitMs = [6000, 8000, 10000, 12000, 15000, 18000, 20000, 24000, 28000, 32000] as const;

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

function searchConfigs() {
  return [
    config(1, "search-dense-red", "过关要求：3 轮全部数准实心红点。", { roundCount: 3, totalDots: 20, targetPatternCount: 1, directions: 2 }),
    config(2, "search-directional-red", "过关要求：3 轮全部数准多方向飞入的实心红点。", { roundCount: 3, totalDots: 18, targetPatternCount: 1, directions: 4 }),
    config(3, "search-pattern-count", "过关要求：记住提示图案，3 轮全部数准目标数量。", { roundCount: 3, totalDots: 16, targetPatternCount: 1, directions: 2 }),
    config(4, "search-dense-red", "过关要求：3 轮全部数准更密的实心红点。", { roundCount: 3, totalDots: 28, targetPatternCount: 1, directions: 2 }),
    config(5, "search-directional-red", "过关要求：3 轮全部数准多方向交叉红点。", { roundCount: 3, totalDots: 24, targetPatternCount: 1, directions: 6 }),
    config(6, "search-pattern-count", "过关要求：记住 2 种提示图案，3 轮全部数准目标数量。", { roundCount: 3, totalDots: 22, targetPatternCount: 2, directions: 2 }),
    config(7, "search-dense-red", "过关要求：3 轮全部数准高密度实心红点。", { roundCount: 3, totalDots: 36, targetPatternCount: 1, directions: 2 }),
    config(8, "search-directional-red", "过关要求：3 轮全部数准复杂方向红点。", { roundCount: 3, totalDots: 30, targetPatternCount: 1, directions: 8 }),
    config(9, "search-pattern-count", "过关要求：记住 3 种提示图案，3 轮全部数准目标数量。", { roundCount: 3, totalDots: 28, targetPatternCount: 3, directions: 2 }),
    config(10, "search-boss", "过关要求：3 轮全部数准多方向、多图案目标数量。", { roundCount: 3, totalDots: 34, targetPatternCount: 3, directions: 8 }),
  ];
}

function stroopConfigs() {
  return [
    config(1, "stroop-flash-color", "过关要求：5 轮全选对字体颜色，每题 ≤ 2000ms。", { roundCount: 5, answerTimeLimitMs: 2000, flashMs: 620 }),
    config(2, "stroop-mismatch-card", "过关要求：5 轮全部点中唯一不一致字卡。", { roundCount: 5, cardCount: 4, mismatchCount: 1 }),
    config(3, "stroop-moving-count", "过关要求：5 轮全部数准不一致字的数量。", { roundCount: 5, movingWordCount: 3 }),
    config(4, "stroop-flash-color", "过关要求：5 轮全选对字体颜色，每题 ≤ 1500ms。", { roundCount: 5, answerTimeLimitMs: 1500, flashMs: 500 }),
    config(5, "stroop-mismatch-card", "过关要求：5 轮全部点中唯一不一致字卡。", { roundCount: 5, cardCount: 6, mismatchCount: 1 }),
    config(6, "stroop-moving-count", "过关要求：5 轮全部数准不一致字的数量。", { roundCount: 5, movingWordCount: 4 }),
    config(7, "stroop-flash-color", "过关要求：5 轮全选对字体颜色，每题 ≤ 1000ms。", { roundCount: 5, answerTimeLimitMs: 1000, flashMs: 400 }),
    config(8, "stroop-mismatch-card", "过关要求：5 轮全部点中唯一不一致字卡。", { roundCount: 5, cardCount: 8, mismatchCount: 1 }),
    config(9, "stroop-moving-count", "过关要求：5 轮全部数准不一致字的数量。", { roundCount: 5, movingWordCount: 5 }),
    config(10, "stroop-boss", "过关要求：5 轮全部数准 6 个飞行字里的不一致数量。", { roundCount: 5, movingWordCount: 6, answerTimeLimitMs: null, flicker: true }),
  ];
}

function rhythmConfigs() {
  return [
    config(1, "rhythm-dual-speed", "过关要求：命中 10 次真拍，每次偏差 ≤ 100ms。", { hitCount: 10, offsetThresholdMs: 100, lanes: 2, fakeBeats: false }),
    config(2, "rhythm-four-circle", "过关要求：命中 10 次四圈节拍，每次偏差 ≤ 100ms。", { hitCount: 10, offsetThresholdMs: 100, lanes: 4, fakeBeats: false }),
    config(3, "rhythm-fake-beat", "过关要求：命中 10 次真拍，假拍不能点，偏差 ≤ 100ms。", { hitCount: 10, offsetThresholdMs: 100, lanes: 2, fakeBeats: true }),
    config(4, "rhythm-dual-speed", "过关要求：命中 12 次真拍，每次偏差 ≤ 80ms。", { hitCount: 12, offsetThresholdMs: 80, lanes: 2, fakeBeats: false }),
    config(5, "rhythm-four-circle", "过关要求：命中 12 次四圈节拍，每次偏差 ≤ 80ms。", { hitCount: 12, offsetThresholdMs: 80, lanes: 4, fakeBeats: false }),
    config(6, "rhythm-fake-beat", "过关要求：命中 12 次真拍，假拍不能点，偏差 ≤ 80ms。", { hitCount: 12, offsetThresholdMs: 80, lanes: 2, fakeBeats: true }),
    config(7, "rhythm-dual-speed", "过关要求：命中 18 次真拍，每次偏差 ≤ 60ms。", { hitCount: 18, offsetThresholdMs: 60, lanes: 2, fakeBeats: false, overlap: true }),
    config(8, "rhythm-four-circle", "过关要求：命中 18 次四圈节拍，每次偏差 ≤ 60ms。", { hitCount: 18, offsetThresholdMs: 60, lanes: 4, fakeBeats: false, overlap: true }),
    config(9, "rhythm-fake-beat", "过关要求：命中 18 次真拍，假拍不能点，偏差 ≤ 60ms。", { hitCount: 18, offsetThresholdMs: 60, lanes: 2, fakeBeats: true, overlap: true }),
    config(10, "rhythm-boss", "过关要求：命中 20 次真拍，假拍不能点，每次偏差 ≤ 50ms。", { hitCount: 20, offsetThresholdMs: 50, lanes: 4, fakeBeats: true, overlap: true }),
  ];
}

function memoryConfigs() {
  return [
    config(1, "memory-static-grid", "过关要求：4 轮全部答对目标格颜色。", { roundCount: 4, gridSize: 4, coloredCount: 4, showMs: 1800, includeBlank: false }),
    config(2, "memory-sequence-flash", "过关要求：4 轮全部答对闪烁后目标格颜色。", { roundCount: 4, gridSize: 4, coloredCount: 4, flashMs: 720, flashGapMs: 160, includeBlank: false }),
    config(3, "memory-rotation", "过关要求：4 轮全部答对旋转后标记格颜色。", { roundCount: 4, gridSize: 4, coloredCount: 4, showMs: 1800, rotation: true, includeBlank: false }),
    config(4, "memory-static-grid", "过关要求：4 轮全部答对九宫格目标颜色，可选空白。", { roundCount: 4, gridSize: 9, coloredCount: 6, showMs: 2000, includeBlank: true }),
    config(5, "memory-sequence-flash", "过关要求：4 轮全部答对顺序闪烁后的目标颜色，可选空白。", { roundCount: 4, gridSize: 6, coloredCount: 5, flashMs: 560, flashGapMs: 130, includeBlank: true }),
    config(6, "memory-rotation", "过关要求：4 轮全部答对旋转后标记格颜色，可选空白。", { roundCount: 4, gridSize: 9, coloredCount: 6, showMs: 2000, rotation: true, includeBlank: true }),
    config(7, "memory-static-grid", "过关要求：4 轮全部答对九宫格目标颜色，可选空白。", { roundCount: 4, gridSize: 9, coloredCount: 7, showMs: 2200, includeBlank: true }),
    config(8, "memory-sequence-flash", "过关要求：4 轮全部答对更快闪烁后的目标颜色，可选空白。", { roundCount: 4, gridSize: 9, coloredCount: 7, flashMs: 420, flashGapMs: 100, includeBlank: true }),
    config(9, "memory-rotation", "过关要求：4 轮全部答对旋转后标记格颜色，可选空白。", { roundCount: 4, gridSize: 9, coloredCount: 7, showMs: 2200, rotation: true, includeBlank: true }),
    config(10, "memory-boss", "过关要求：4 轮全部答对九宫格闪烁、旋转后的标记格颜色。", { roundCount: 4, gridSize: 9, coloredCount: 6, rotation: true, flashMs: 420, flashGapMs: 90, includeBlank: true }),
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

function patienceConfigs() {
  return patienceWaitMs.map((waitMs, index) =>
    config(index + 1, "patience-wait", `过关要求：完整等待 ${Math.round(waitMs / 1000)} 秒，中断失败。`, {
      waitMs,
    }),
  );
}

export const ADVANCED_STAGE_CONFIGS: Record<RoundId, AdvancedStageConfig[]> = {
  reaction: createDimensionConfigs("reaction", reactionConfigs()),
  aim: createDimensionConfigs("aim", aimConfigs()),
  search: createDimensionConfigs("search", searchConfigs()),
  stroop: createDimensionConfigs("stroop", stroopConfigs()),
  rhythm: createDimensionConfigs("rhythm", rhythmConfigs()),
  memory: createDimensionConfigs("memory", memoryConfigs()),
  braking: createDimensionConfigs("braking", brakingConfigs()),
  patience: createDimensionConfigs("patience", patienceConfigs()),
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

function evaluateSearch(config: AdvancedStageConfig, trials: TrialEvent[]) {
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
  const required = numberParam(config, "roundCount", 5);
  const limit = config.params.answerTimeLimitMs === null ? null : numberParam(config, "answerTimeLimitMs", 0);
  const wrong = trials.find((trial) => trial.correct === false);
  if (wrong) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：点错字色");
  if (limit !== null && limit > 0) {
    const slow = trials.find((trial) => reactionMs(trial) !== null && (reactionMs(trial) ?? 0) > limit);
    if (slow) return fail(config, trials.filter((trial) => trial.correct === true).length, required, `失败：答题超时，要求 ≤ ${limit}ms`);
  }
  const correct = trials.filter((trial) => trial.correct === true).length;
  if (correct < required) return fail(config, correct, required, `失败：少完成 ${required - correct} 轮`);
  return pass(config, correct, required);
}

function evaluateRhythm(config: AdvancedStageConfig, trials: TrialEvent[]) {
  const required = numberParam(config, "hitCount", 10);
  const threshold = numberParam(config, "offsetThresholdMs", 100);
  const fakeTap = trials.find((trial) => trial.value?.beatType === "fake" && trial.responseAt !== null);
  if (fakeTap) return fail(config, 0, required, "失败：点到了假拍");
  const wrongLane = trials.find((trial) => trial.errorType === "wrong");
  if (wrongLane) return fail(config, 0, required, "失败：点错圈");
  const missed = trials.find((trial) => trial.errorType === "timeout" || trial.responseAt === null);
  if (missed) return fail(config, trials.filter((trial) => trial.correct === true).length, required, "失败：漏拍");
  const trueBeats = trials.filter((trial) => trial.value?.beatType !== "fake");
  for (const item of trueBeats) {
    const offset = Math.abs(Number(item.value?.offsetMs));
    if (Number.isFinite(offset) && offset > threshold) {
      return fail(config, trueBeats.filter((trial) => trial.correct === true).length, required, `失败：偏差 ${Math.round(offset)}ms，要求 ≤ ${threshold}ms`);
    }
  }
  const correct = trueBeats.filter((trial) => trial.correct === true).length;
  if (correct < required) return fail(config, correct, required, `失败：少命中 ${required - correct} 次真拍`);
  return pass(config, correct, required);
}

function evaluateMemory(config: AdvancedStageConfig, trials: TrialEvent[]) {
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
