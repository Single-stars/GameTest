import {
  booleanParam,
  clamp,
  createSeededRandom,
  type MiniGameLevelConfig,
  numberParam,
} from "./shared.ts";

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

export function getFlappyGateScreenX(
  gate: { distance: number },
  { progress, reverseDirection, stageWidth }: Pick<FlappyVisibleOptions, "progress" | "reverseDirection" | "stageWidth">,
) {
  return reverseDirection ? -gate.distance + progress : stageWidth + gate.distance - progress;
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
  const gates = Array.from({ length: gateCount }, (_, index): GeneratedFlappyGate => {
    const maxStep = gateCount <= 8 ? 86 : gateCount <= 10 ? 104 : 116;
    const centerY = clamp(previousCenter + (rand() * 2 - 1) * maxStep, 132, stageHeight - 132);
    previousCenter = centerY;
    return {
      id: index,
      distance: 170 + index * (178 + rand() * 24),
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
