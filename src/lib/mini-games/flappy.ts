import {
  booleanParam,
  clamp,
  createSeededRandom,
  type MiniGameLevelConfig,
  numberParam,
} from "./shared.ts";

const FLAPPY_INVINCIBLE_SAFE_APPROACH_BUFFER = 24;

export type GeneratedFlappyGate = {
  id: number;
  distance: number;
  baseCenterY: number;
  moving: boolean;
  phase: number;
  collectible: boolean;
  collectibleOffset: number;
  collected: boolean;
  passed: boolean;
};

export type FlappyInitialPlacement = "abovePlatform" | "belowPlatform";

export type FlappyVisibleOptions = {
  buffer: number;
  gateWidth: number;
  progress: number;
  reverseDirection: boolean;
  stageWidth: number;
};

export type FlappySafeRespawnOptions<T extends { distance: number; passed?: boolean }> = {
  fallbackBacktrack?: number;
  gates: readonly T[];
  gateWidth: number;
  invincibleForwardTravelDistance?: number;
  nextProgress: number;
  playerSize: number;
  playerX: number;
  reverseDirection: boolean;
  safeApproachDistance?: number;
  stageWidth: number;
};

export function getFlappyGateScreenX(
  gate: { distance: number },
  { progress, reverseDirection, stageWidth }: Pick<FlappyVisibleOptions, "progress" | "reverseDirection" | "stageWidth">,
) {
  return reverseDirection ? -gate.distance + progress : stageWidth + gate.distance - progress;
}

export function getFlappySignedProgress(progress: number, reverseDirection: boolean) {
  return reverseDirection ? -progress : progress;
}

export function getFlappyPlayerScreenX({
  displayProgress,
  playerX,
  progress,
  reverseDirection,
}: {
  displayProgress: number;
  playerX: number;
  progress: number;
  reverseDirection: boolean;
}) {
  void displayProgress;
  void progress;
  void reverseDirection;
  return playerX;
}

export function resolveFlappySafeRespawnProgress<T extends { distance: number; passed?: boolean }>({
  fallbackBacktrack = 28,
  gates,
  gateWidth,
  invincibleForwardTravelDistance = 0,
  nextProgress,
  playerSize,
  playerX,
  reverseDirection,
  safeApproachDistance = 44,
  stageWidth,
}: FlappySafeRespawnOptions<T>) {
  let respawnProgress = Math.max(0, nextProgress - fallbackBacktrack);
  const playerHalfSize = playerSize / 2;
  const effectiveSafeApproachDistance =
    safeApproachDistance + Math.min(FLAPPY_INVINCIBLE_SAFE_APPROACH_BUFFER, Math.max(0, invincibleForwardTravelDistance));
  const safeForwardGateX = playerX + playerHalfSize + effectiveSafeApproachDistance;
  const safeReverseGateRight = playerX - playerHalfSize - effectiveSafeApproachDistance;

  for (const gate of gates) {
    if (gate.passed) continue;
    const screenX = getFlappyGateScreenX(gate, {
      progress: respawnProgress,
      reverseDirection,
      stageWidth,
    });

    if (reverseDirection) {
      const gateRight = screenX + gateWidth;
      const playerRight = playerX + playerHalfSize;
      if (gateRight > safeReverseGateRight && screenX < playerRight) {
        respawnProgress = Math.min(respawnProgress, gate.distance + safeReverseGateRight - gateWidth);
      }
    } else {
      const playerLeft = playerX - playerHalfSize;
      if (screenX < safeForwardGateX && screenX + gateWidth > playerLeft) {
        respawnProgress = Math.min(respawnProgress, stageWidth + gate.distance - safeForwardGateX);
      }
    }
  }

  return Math.max(0, respawnProgress);
}

export function selectVisibleFlappyGates<T extends { distance: number }>(
  gates: readonly T[],
  options: FlappyVisibleOptions,
) {
  return gates.filter((gate) => {
    const screenX = getFlappyGateScreenX(gate, options);
    return screenX > -options.gateWidth - options.buffer && screenX < options.stageWidth + options.buffer;
  });
}

export function getFlappyInitialPlacement(level: MiniGameLevelConfig): FlappyInitialPlacement {
  return booleanParam(level.params, "reversedGravity") ? "belowPlatform" : "abovePlatform";
}

export function generateFlappyGateLayout(
  level: MiniGameLevelConfig,
  runSeed: string,
  options: { backgroundRefCount?: number; stageHeight?: number; stageWidth?: number } = {},
) {
  const stageHeight = options.stageHeight ?? 640;
  const stageWidth = options.stageWidth ?? 360;
  const gateCount = numberParam(level.params, "gateCount", 6);
  const movingRatio = numberParam(level.params, "movingGateRatio", 0);
  const collectibleCount = numberParam(level.params, "collectibleCount", 0);
  const collectibleOffset = numberParam(level.params, "collectibleOffset", 0.18);
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:flappy-gates`);
  const collectibleIndexes = new Set<number>();

  for (let index = 1; index <= collectibleCount; index += 1) {
    collectibleIndexes.add(clamp(Math.round((index / (collectibleCount + 1)) * (gateCount - 1)), 0, gateCount - 1));
  }

  let previousCenter = stageHeight / 2 + (rand() - 0.5) * 56;
  let distance = 170 + rand() * 18;
  const lanePattern = [0.34, 0.66, 0.46, 0.74, 0.26, 0.54];
  const laneOffset = Math.floor(rand() * lanePattern.length);
  const gates = Array.from({ length: gateCount }, (_, index): GeneratedFlappyGate => {
    const maxStep = gateCount <= 8 ? 86 : gateCount <= 10 ? 104 : 116;
    const lane = lanePattern[(index + laneOffset) % lanePattern.length];
    const laneCenter = 132 + lane * (stageHeight - 264);
    const targetCenter = laneCenter + (rand() - 0.5) * Math.min(72, maxStep);
    const centerY = clamp(index === 0 ? targetCenter : clamp(targetCenter, previousCenter - maxStep, previousCenter + maxStep), 132, stageHeight - 132);
    previousCenter = centerY;
    if (index > 0) {
      const minSpacing = gateCount <= 8 ? 168 : gateCount <= 10 ? 174 : 180;
      distance += minSpacing + rand() * 46;
    }
    return {
      id: index,
      distance,
      baseCenterY: centerY,
      moving: rand() < movingRatio,
      phase: rand() * Math.PI * 2,
      collectible: collectibleIndexes.has(index),
      collectibleOffset: (rand() < 0.5 ? -1 : 1) * collectibleOffset * (0.62 + rand() * 0.38),
      collected: false,
      passed: false,
    };
  });

  const backgroundSeed = createSeededRandom(`${level.levelId}:${runSeed}:flappy-background`);
  const backgroundRefCount = Math.max(0, Math.floor(options.backgroundRefCount ?? 14));
  const backgroundRefs = Array.from({ length: backgroundRefCount }, (_, index) => ({
    id: index,
    x: backgroundSeed() * stageWidth,
    y: 72 + backgroundSeed() * (stageHeight - 150),
    kind: backgroundSeed() < 0.34 ? "square" : "dash",
  }));

  return { backgroundRefs, gates, initialPlacement: getFlappyInitialPlacement(level) };
}
