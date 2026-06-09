import { getAdvancedStageConfig, type AdvancedStageConfig } from "./advanced-challenges.ts";
import { getAdvancedDimensionLevel, type AdvancedLevelState, type AdvancedProgress } from "./advanced-progress.ts";
import type { PlayerAvatarSkin } from "../features/player-avatar/player-avatar-skin.ts";
import type { MiniGameId, MiniGameParams } from "./mini-games/shared.ts";
import type { RoundId } from "./scoring.ts";

export const ENDLESS_MODE_LEVEL = 0;
export const ENDLESS_STARTING_REVIVES = 3;
export const ENDLESS_REACTION_THRESHOLD_MS = 500;
const ENDLESS_FLAPPY_MAX_RAMP = 180;
export const ENDLESS_SUPPORTED_ROUND_IDS = [
  "reaction",
  "aim",
  "search",
  "stroop",
  "rhythm",
  "memory",
  "braking",
  "patience",
] as const satisfies readonly RoundId[];

const ADVANCED_FINAL_SKIN_ROUNDS: Partial<Record<PlayerAvatarSkin, RoundId>> = {
  blade: "patience",
  ivory: "braking",
  mint: "search",
  pine: "memory",
  sand: "rhythm",
  signal: "reaction",
  slate: "stroop",
  target: "aim",
};

export type EndlessLevelState = Extract<AdvancedLevelState, "current" | "locked">;

export type EndlessScoreInput = {
  bonusActions?: number;
  coreActions: number;
  failures?: number;
};

export type EndlessDifficultyInput = {
  maxRamp: number;
  progress: number;
};

export type EndlessTestJumpOption = {
  difficulty: number;
  label: string;
};

export type EndlessSourceConfig = {
  difficulty: number;
  sourceAdvancedLevel: number;
  sourceConfig: AdvancedStageConfig;
};

export type EndlessReactionConfig = EndlessSourceConfig & {
  lanes: number;
  redChance: number;
  simultaneousGreenChance: number;
  thresholdMs: number;
};

export type EndlessAimConfig = EndlessSourceConfig & {
  aimMode: "track" | "incoming" | "decoy" | "boss";
  decoyChance: number;
  decoyCount: number;
  failOnFlyOut: boolean;
  incomingChance: number;
  route: "circle" | "ellipse" | "figure-eight" | "diagonal" | "incoming" | "mixed";
  spawnIntervalMs: number;
  targetSize: number;
  targetSpeedMultiplier: number;
};

export type EndlessJourneyConfig = EndlessSourceConfig & {
  fakeChance: number;
  gravityChance: number;
  hazardChance: number;
  movingChance: number;
  speed: number;
};

export type EndlessFlappyConfig = {
  collectibleChance: number;
  gapSize: number;
  gravityTransition: "instant-feedback";
  movingGateChance: number;
  reverseSegmentChance: number;
  segmentWarningGates: number;
  speed: number;
};

export type EndlessBrakingConfig = {
  dualLaneChance: number;
  dualLaneTransition: "warn-then-split";
  grayFakeChance: number;
  obstacleIntervalMs: number;
  reactionWindowMs: number;
  roadSpeed: number;
  worldScrollsContinuously: boolean;
};

export type EndlessKnifeConfig = {
  countdownSeconds: number | null;
  forbiddenZoneCount: number;
  requiredHits: number;
  rotationSpeed: number;
  sineRotationChance: number;
};

export type EndlessMiniGameStageConfig = {
  difficulty: number;
  params: MiniGameParams;
  sourceAdvancedLevel: number;
};

export type EndlessDifficultyLabel = "起步" | "渐入" | "中段" | "高压" | "封顶";

export type EndlessDifficultyState = {
  difficulty: number;
  label: EndlessDifficultyLabel;
  meterPercent: number;
  nextLabel: EndlessDifficultyLabel | null;
  progressToNext: number;
  sourceAdvancedLevel: number;
  tier: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * clamp(t, 0, 1);
}

function chanceAfter(difficulty: number, start: number, max: number) {
  return clamp(((difficulty - start) / Math.max(0.001, 1 - start)) * max, 0, max);
}

const ENDLESS_AIM_OPENING_REPEAT = 3;
const ENDLESS_AIM_OPENING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const ENDLESS_AIM_MIXED_LEVELS = [1, 4, 2, 3, 5, 4, 6, 2, 3, 5, 6, 4] as const;

export function getEndlessAdvancedSourceLevel({ difficulty }: { difficulty: number }) {
  return Math.max(1, Math.min(10, 1 + Math.round(clamp(difficulty, 0, 1) * 9)));
}

export function getEndlessReusableStageConfig({
  difficulty,
  roundId,
}: {
  difficulty: number;
  roundId: RoundId;
}): EndlessSourceConfig {
  const normalizedDifficulty = clamp(difficulty, 0, 1);
  const sourceAdvancedLevel = getEndlessAdvancedSourceLevel({ difficulty: normalizedDifficulty });
  return {
    difficulty: normalizedDifficulty,
    sourceAdvancedLevel,
    sourceConfig: getAdvancedStageConfig(roundId, sourceAdvancedLevel),
  };
}

export function isEndlessModeUnlocked(progress: AdvancedProgress, roundId: RoundId) {
  return getAdvancedDimensionLevel(progress, roundId) >= 3;
}

export function getEndlessStartingRevives(progress: AdvancedProgress, roundId: RoundId, skin: PlayerAvatarSkin) {
  if (skin === "starfall" && progress.legend100SkinUnlocked === true) return ENDLESS_STARTING_REVIVES + 1;
  const matchingRoundId = ADVANCED_FINAL_SKIN_ROUNDS[skin];
  if (matchingRoundId === roundId && getAdvancedDimensionLevel(progress, matchingRoundId) >= 10) {
    return ENDLESS_STARTING_REVIVES + 1;
  }
  return ENDLESS_STARTING_REVIVES;
}

export function shouldKeepPigEndlessLife(skin: PlayerAvatarSkin, random: () => number = Math.random) {
  return skin === "pig" && random() < 0.1;
}

export function getEndlessLevelState(currentLevel: number): EndlessLevelState {
  return currentLevel >= 3 ? "current" : "locked";
}

export function getAdvancedEndlessStatusLabel(state: EndlessLevelState) {
  return state === "current" ? "无尽挑战" : "完成前三关解锁";
}

export function getEndlessScore({ bonusActions = 0, coreActions }: EndlessScoreInput) {
  return Math.max(0, Math.floor(coreActions)) + Math.max(0, Math.floor(bonusActions));
}

export function getEndlessDifficulty({ maxRamp, progress }: EndlessDifficultyInput) {
  const ramp = Number.isFinite(maxRamp) && maxRamp > 0 ? maxRamp : 1;
  return Number((clamp(progress, 0, ramp) / ramp).toFixed(4));
}

export function getEndlessDifficultyState({ difficulty }: { difficulty: number }): EndlessDifficultyState {
  const normalizedDifficulty = clamp(difficulty, 0, 1);
  const tiers: Array<{ label: EndlessDifficultyLabel; max: number; min: number }> = [
    { label: "起步", min: 0, max: 0.25 },
    { label: "渐入", min: 0.25, max: 0.5 },
    { label: "中段", min: 0.5, max: 0.75 },
    { label: "高压", min: 0.75, max: 1 },
    { label: "封顶", min: 1, max: 1 },
  ];
  const tierIndex = normalizedDifficulty >= 1
    ? tiers.length - 1
    : Math.max(0, tiers.findIndex((tier) => normalizedDifficulty >= tier.min && normalizedDifficulty < tier.max));
  const tier = tiers[tierIndex] ?? tiers[0];
  const nextTier = tiers[tierIndex + 1] ?? null;
  const span = Math.max(0.001, tier.max - tier.min);
  return {
    difficulty: Number(normalizedDifficulty.toFixed(4)),
    label: tier.label,
    meterPercent: Math.round(normalizedDifficulty * 100),
    nextLabel: nextTier?.label ?? null,
    progressToNext: nextTier ? Math.round(clamp((normalizedDifficulty - tier.min) / span, 0, 1) * 100) : 100,
    sourceAdvancedLevel: getEndlessAdvancedSourceLevel({ difficulty: normalizedDifficulty }),
    tier: tierIndex + 1,
  };
}

export function getEndlessRoundDifficultyState({
  debugDifficulty,
  reportedDifficulty = 0,
  roundId,
  score,
}: {
  debugDifficulty: number;
  reportedDifficulty?: number;
  roundId: RoundId;
  score: number;
}) {
  const maxRamp = roundId === "aim" ? 150 : roundId === "braking" ? 30 * 110 : 90;
  const difficulty = Math.max(
    getEndlessDifficulty({ maxRamp, progress: score }),
    clamp(debugDifficulty, 0, 1),
    clamp(reportedDifficulty, 0, 1),
  );
  return getEndlessDifficultyState({ difficulty });
}

export function getEndlessReactionConfig({ score }: { score: number }): EndlessReactionConfig {
  const difficulty = getEndlessDifficulty({ progress: score, maxRamp: 90 });
  const source = getEndlessReusableStageConfig({ difficulty, roundId: "reaction" });
  return {
    ...source,
    lanes: difficulty < 0.28 ? 1 : difficulty < 0.68 ? 2 : 4,
    redChance: chanceAfter(difficulty, 0.18, 0.48),
    simultaneousGreenChance: chanceAfter(difficulty, 0.52, 0.45),
    thresholdMs: ENDLESS_REACTION_THRESHOLD_MS,
  };
}

export function getEndlessAimConfig({ hitCount }: { hitCount: number }): EndlessAimConfig {
  const safeHitCount = Math.max(0, Math.floor(Number.isFinite(hitCount) ? hitCount : 0));
  const openingIndex = Math.floor(safeHitCount / ENDLESS_AIM_OPENING_REPEAT);
  const openingSourceLevel = ENDLESS_AIM_OPENING_LEVELS[openingIndex];
  const postOpeningHitCount = Math.max(0, safeHitCount - ENDLESS_AIM_OPENING_LEVELS.length * ENDLESS_AIM_OPENING_REPEAT);
  const difficulty = getEndlessDifficulty({ progress: postOpeningHitCount, maxRamp: 132 });
  const sourceAdvancedLevel = openingSourceLevel
    ?? (difficulty >= 1
      ? 10
      : ENDLESS_AIM_MIXED_LEVELS[postOpeningHitCount % ENDLESS_AIM_MIXED_LEVELS.length]);
  const source = {
    difficulty,
    sourceAdvancedLevel,
    sourceConfig: getAdvancedStageConfig("aim", sourceAdvancedLevel),
  };
  const sourceSize = Number(source.sourceConfig.params.targetSize);
  const sourceAimMode = String(source.sourceConfig.params.aimMode);
  const aimMode: EndlessAimConfig["aimMode"] = sourceAimMode === "incoming" || sourceAimMode === "decoy" || sourceAimMode === "boss"
    ? sourceAimMode
    : "track";
  const sourceRoute = String(source.sourceConfig.params.route);
  const route: EndlessAimConfig["route"] = aimMode === "boss"
    ? "mixed"
    : sourceRoute === "ellipse" || sourceRoute === "figure-eight" || sourceRoute === "diagonal" || sourceRoute === "incoming" || sourceRoute === "mixed"
      ? sourceRoute
      : "circle";
  const sourceSpawnIntervalMs = Number(source.sourceConfig.params.spawnIntervalMs);
  const sourceDecoyCount = Number(source.sourceConfig.params.decoyCount);
  const decoyCount = aimMode === "boss"
    ? 3
    : Math.min(2, Math.max(0, Number.isFinite(sourceDecoyCount) ? sourceDecoyCount : 0));
  const incomingWeight = aimMode === "incoming" ? 1 : aimMode === "boss" ? 0.7 : 0;
  return {
    ...source,
    aimMode,
    decoyChance: aimMode === "boss" ? 0.28 : decoyCount > 0 ? 0.18 + decoyCount * 0.04 : 0,
    decoyCount,
    failOnFlyOut: aimMode === "incoming" || aimMode === "boss",
    incomingChance: Number(Math.min(0.34, incomingWeight * lerp(0.18, 0.34, difficulty)).toFixed(2)),
    route,
    spawnIntervalMs: Number.isFinite(sourceSpawnIntervalMs) ? Math.max(760, sourceSpawnIntervalMs) : Math.round(lerp(980, 760, difficulty)),
    targetSize: Math.round(lerp(Number.isFinite(sourceSize) ? sourceSize : 58, aimMode === "boss" ? 46 : 48, difficulty)),
    targetSpeedMultiplier: Number(lerp(0.92, aimMode === "boss" ? 1.22 : 1.14, difficulty).toFixed(3)),
  };
}

export function getEndlessJourneyConfig({ roundId, score }: { roundId: RoundId; score: number }): EndlessJourneyConfig {
  const difficulty = getEndlessDifficulty({ progress: score, maxRamp: 90 });
  const source = getEndlessReusableStageConfig({ difficulty, roundId });
  return {
    ...source,
    fakeChance: roundId === "stroop" ? chanceAfter(difficulty, 0.25, 0.35) : 0,
    gravityChance: roundId === "rhythm" ? chanceAfter(difficulty, 0.32, 0.46) : 0,
    hazardChance: roundId === "search" || roundId === "stroop" ? chanceAfter(difficulty, 0.18, 0.46) : chanceAfter(difficulty, 0.54, 0.18),
    movingChance: chanceAfter(difficulty, 0.08, roundId === "rhythm" ? 0.5 : 0.62),
    speed: lerp(1, 1.82, difficulty),
  };
}

export function getEndlessFlappyConfig({ gateIndex }: { gateIndex: number }): EndlessFlappyConfig {
  const difficulty = getEndlessDifficulty({ progress: gateIndex, maxRamp: ENDLESS_FLAPPY_MAX_RAMP });
  return {
    collectibleChance: chanceAfter(difficulty, 0.2, 0.55),
    gapSize: Math.round(lerp(190, 152, difficulty)),
    gravityTransition: "instant-feedback",
    movingGateChance: lerp(0.15, 0.75, difficulty),
    reverseSegmentChance: chanceAfter(difficulty, 0.55, 0.28),
    segmentWarningGates: 1,
    speed: lerp(116, 140, difficulty),
  };
}

export function getEndlessMiniGameStageConfig({
  debugDifficulty = 0,
  miniGameId,
  progress,
}: {
  debugDifficulty?: number;
  miniGameId: MiniGameId | string;
  progress: number;
}): EndlessMiniGameStageConfig {
  const maxRamp = miniGameId === "flappy" ? ENDLESS_FLAPPY_MAX_RAMP : 90;
  const difficulty = Math.max(
    getEndlessDifficulty({ progress, maxRamp }),
    clamp(debugDifficulty, 0, 1),
  );
  const sourceAdvancedLevel = getEndlessAdvancedSourceLevel({ difficulty });

  if (miniGameId === "doodle") {
    return {
      difficulty,
      sourceAdvancedLevel,
      params: {
        dangerLineEnabled: false,
        finalObstacleStartScreen: difficulty >= 0.62 ? 1 : 0,
        hazardDensity: Number(lerp(0.28, 1.3, difficulty).toFixed(2)),
        movementPattern: difficulty < 0.32
          ? "horizontal"
          : difficulty < 0.62
            ? "horizontal|vertical|patrolDiagonal"
            : "horizontal|vertical|patrolDiagonal|orbitSmall|pulse|slowCross",
        movingHazardSpeed: Math.round(lerp(0, 46, difficulty)),
        movingObstacleCount: Math.round(lerp(0, 20, difficulty)),
        movingPlatformRatio: Number(lerp(0.25, 1, difficulty).toFixed(2)),
        movingPlatformSpeed: Math.round(lerp(18, 46, difficulty)),
        platformGap: Math.round(lerp(100, 108, difficulty)),
        requiredRiskPlatforms: difficulty < 0.5 ? 0 : Math.round(lerp(1, 8, (difficulty - 0.5) / 0.5)),
        riskJumpMultiplier: 1.6,
        riskPlatformWidth: Math.round(lerp(86, 68, difficulty)),
        targetHeightScreens: Math.round(lerp(4, 8, difficulty)),
      },
    };
  }

  if (miniGameId === "square-jump") {
    return {
      difficulty,
      sourceAdvancedLevel,
      params: {
        cyclingChargeOnDoubleJump: true,
        distanceMax: Math.round(lerp(218, 220, difficulty)),
        distanceMin: Math.round(lerp(142, 164, difficulty)),
        doubleJumpEnabled: false,
        finalMix: difficulty >= 0.82,
        flyAwayLandingCatchDepth: 40,
        gravityChallenge: true,
        gravityJumpLimit: 3,
        gravityPlatformMaxCount: difficulty < 0.5 ? 0 : Math.max(1, Math.round(lerp(1, 3, (difficulty - 0.5) / 0.5))),
        gravityPlatformMinSpacing: difficulty < 0.72 ? 4 : 3,
        gravityPattern: difficulty < 0.5
          ? "normal"
          : difficulty < 0.72
            ? "normal|normal|light|normal|normal|normal"
            : "normal|normal|light|normal|normal|heavy|normal|normal",
        jumpsRequired: Math.round(lerp(8, 14, difficulty)),
        movingPlatformCount: Math.round(lerp(1, 9, difficulty)),
        movingRange: Math.round(lerp(24, 64, difficulty)),
        movingSpeed: Number(lerp(0.68, 2.55, difficulty).toFixed(2)),
        movingStaticEvery: difficulty >= 0.68 ? 4 : null,
        platformWidth: Math.round(lerp(108, 70, difficulty)),
        powerDistanceMax: 220,
        powerDistanceMin: 34,
        reverseMoving: difficulty >= 0.68,
        secondPowerDistanceMax: 180,
        secondPowerDistanceMin: 30,
        targetLandingPadding: 9,
      },
    };
  }

  if (miniGameId === "fall-down") {
    return {
      difficulty,
      sourceAdvancedLevel,
      params: {
        dangerPlatformCount: difficulty < 0.42 ? 0 : Math.round(lerp(1, 10, (difficulty - 0.42) / 0.58)),
        fallingHazardCount: Math.floor(lerp(0, 4, difficulty)),
        fallingHazardSize: Math.round(lerp(22, 24, difficulty)),
        fallingHazardSpeed: Math.round(lerp(132, 178, difficulty)),
        finalMix: difficulty >= 0.74,
        fragilePlatformCount: difficulty < 0.24 ? 0 : Math.round(lerp(1, 10, (difficulty - 0.24) / 0.76)),
        fragileTime: Number(lerp(1.8, 1, difficulty).toFixed(2)),
        layersRequired: Math.round(lerp(14, 24, difficulty)),
        ledgePlatformCount: Math.round(chanceAfter(difficulty, 0.52, 8)),
        movingPlatformCount: Math.round(lerp(1, 12, difficulty)),
        movingRange: Math.round(lerp(28, 94, difficulty)),
        movingSpeed: Number(lerp(0.58, 1.35, difficulty).toFixed(2)),
        platformGapMax: Math.round(lerp(136, 170, difficulty)),
        platformGapMin: Math.round(lerp(98, 118, difficulty)),
        platformWidth: Math.round(lerp(104, 72, difficulty)),
        reverseMoving: difficulty >= 0.68,
        topPressureSpeed: Math.round(lerp(52, 88, difficulty)),
      },
    };
  }

  if (miniGameId === "flappy") {
    const flappy = getEndlessFlappyConfig({ gateIndex: Math.round(difficulty * 90) });
    const gateCount = Math.round(lerp(8, 18, difficulty));
    return {
      difficulty,
      sourceAdvancedLevel,
      params: {
        collectibleCount: difficulty >= 1 ? gateCount : Math.round(lerp(4, 14, difficulty)),
        collectibleOffset: Number(lerp(0.14, 0.28, difficulty).toFixed(2)),
        gateCount,
        gapSize: flappy.gapSize,
        movingGateRatio: Number(flappy.movingGateChance.toFixed(2)),
        movingGateSpeed: Number(lerp(1.25, 4, difficulty).toFixed(2)),
        reverseDirection: false,
        reversedGravity: false,
        speed: Number(flappy.speed.toFixed(2)),
      },
    };
  }

  return {
    difficulty,
    sourceAdvancedLevel,
    params: {},
  };
}

export function getEndlessBrakingConfig({ distance }: { distance: number }): EndlessBrakingConfig {
  const difficulty = getEndlessDifficulty({ progress: distance, maxRamp: 30 * 110 });
  return {
    dualLaneChance: chanceAfter(difficulty, 0.48, 0.34),
    dualLaneTransition: "warn-then-split",
    grayFakeChance: chanceAfter(difficulty, 0.22, 0.38),
    obstacleIntervalMs: Math.round(lerp(1450, 620, difficulty)),
    reactionWindowMs: Math.round(lerp(650, 420, difficulty)),
    roadSpeed: lerp(14, 28, difficulty),
    worldScrollsContinuously: true,
  };
}

export function getEndlessKnifeConfig({ wheelIndex }: { wheelIndex: number }): EndlessKnifeConfig {
  const safeWheelIndex = Math.max(0, Math.floor(Number.isFinite(wheelIndex) ? wheelIndex : 0));
  const difficulty = getEndlessDifficulty({ progress: safeWheelIndex, maxRamp: 12 });
  const countdownEnabled = safeWheelIndex >= 2 && safeWheelIndex % 2 === 0;
  return {
    countdownSeconds: countdownEnabled ? Number(lerp(3.2, 2.2, difficulty).toFixed(2)) : null,
    forbiddenZoneCount: safeWheelIndex < 4 ? 0 : Math.max(1, Math.floor(lerp(1, 3, difficulty))),
    requiredHits: Math.min(16, 10 + Math.floor(safeWheelIndex / 2)),
    rotationSpeed: Math.round(lerp(92, 166, difficulty)),
    sineRotationChance: chanceAfter(difficulty, 0.25, 0.8),
  };
}

export function getEndlessKnifeEffectiveWheelIndex({
  debugDifficulty,
  wheelIndex,
}: {
  debugDifficulty: number;
  wheelIndex: number;
}) {
  const safeWheelIndex = Math.max(0, Math.floor(Number.isFinite(wheelIndex) ? wheelIndex : 0));
  const debugWheelIndex = Math.floor(clamp(debugDifficulty, 0, 1) * 12);
  return Math.max(safeWheelIndex, debugWheelIndex);
}

export function getEndlessTestJumpOptions(): EndlessTestJumpOption[] {
  return [
    { difficulty: 0, label: "起步" },
    { difficulty: 0.25, label: "渐入" },
    { difficulty: 0.5, label: "中段" },
    { difficulty: 0.75, label: "高压" },
    { difficulty: 1, label: "封顶" },
  ];
}
