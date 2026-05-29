import {
  clamp,
  createSeededRandom,
  type MiniGameLevelConfig,
  numberParam,
  stringParam,
} from "./shared.ts";

export type DoodleMovementPattern = "static" | "horizontal" | "vertical" | "patrolDiagonal" | "orbitSmall" | "pulse" | "slowCross";

export type GeneratedDoodlePlatform = {
  id: number;
  x: number;
  y: number;
  width: number;
  start: boolean;
  finish?: boolean;
  moving: boolean;
  risk: boolean;
  phase: number;
  range: number;
  speed: number;
};

export type GeneratedDoodleHazard = {
  id: number;
  x: number;
  y: number;
  size: number;
  movementEnabled: boolean;
  movementPattern: DoodleMovementPattern;
  phase: number;
  range: number;
  speed: number;
};

export type DoodleVisibleOptions = {
  buffer: number;
  cameraY: number;
  stageHeight: number;
};

export const DOODLE_GRAVITY = 1500;
export const DOODLE_JUMP_VELOCITY = 890;
export const DOODLE_HAZARD_VISIBLE_BUFFER = 320;

export function getDoodleJumpPeakHeight(velocity = DOODLE_JUMP_VELOCITY, gravity = DOODLE_GRAVITY) {
  return (velocity * velocity) / (2 * gravity);
}

export function getDoodleBounceVelocity({
  risk,
  riskJumpMultiplier,
}: {
  risk: boolean;
  riskJumpMultiplier: number;
}) {
  return DOODLE_JUMP_VELOCITY * (risk ? riskJumpMultiplier : 1);
}

export function getDoodleHazardVisibleBuffer(buffer: number) {
  return Math.max(buffer, DOODLE_HAZARD_VISIBLE_BUFFER);
}

function makeDoodleNoisePoints(rand: () => number, count: number) {
  return Array.from({ length: Math.max(2, count) }, () => rand());
}

function doodleSmoothNoise(points: number[], position: number) {
  const left = Math.floor(position);
  const t = position - left;
  const smooth = t * t * (3 - 2 * t);
  const leftIndex = ((left % points.length) + points.length) % points.length;
  const rightIndex = (leftIndex + 1) % points.length;
  return points[leftIndex] * (1 - smooth) + points[rightIndex] * smooth;
}

export function selectVisibleDoodlePlatforms<T extends { finish?: boolean; y: number; used?: boolean }>(
  platforms: readonly T[],
  { buffer, cameraY, stageHeight }: DoodleVisibleOptions,
) {
  const minY = cameraY - buffer;
  const maxY = cameraY + stageHeight + buffer;
  return platforms.filter((platform) => !(platform.used && !platform.finish) && platform.y >= minY && platform.y <= maxY);
}

export function selectVisibleDoodleHazards<T extends { y: number; size: number; used?: boolean }>(
  hazards: readonly T[],
  { buffer, cameraY, stageHeight }: DoodleVisibleOptions,
) {
  const minY = cameraY - buffer;
  const maxY = cameraY + stageHeight + buffer;
  return hazards.filter((hazard) => !hazard.used && hazard.y + hazard.size >= minY && hazard.y - hazard.size <= maxY);
}

export function generateDoodleWorldLayout(
  level: MiniGameLevelConfig,
  runSeed: string,
  options: { stageWidth?: number; stageHeight?: number; playerSize?: number } = {},
) {
  const stageWidth = options.stageWidth ?? 360;
  const stageHeight = options.stageHeight ?? 640;
  const playerSize = options.playerSize ?? 32;
  const targetScreens = numberParam(level.params, "targetHeightScreens", 3);
  const targetHeight = targetScreens * stageHeight;
  const movingRatio = numberParam(level.params, "movingPlatformRatio", 0);
  const hazardDensity = numberParam(level.params, "hazardDensity", 0);
  const movingObstacleCount = numberParam(level.params, "movingObstacleCount", 0);
  const movingHazardSpeed = numberParam(level.params, "movingHazardSpeed", 0);
  const movingSpeed = numberParam(level.params, "movingPlatformSpeed", 0);
  const requiredRiskPlatforms = numberParam(level.params, "requiredRiskPlatforms", 0);
  const riskJumpMultiplier = numberParam(level.params, "riskJumpMultiplier", 1);
  const riskWidth = numberParam(level.params, "riskPlatformWidth", 86);
  const platformGap = numberParam(level.params, "platformGap", 104);
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:doodle-world`);
  const startPlatformY = clamp(stageHeight * 0.18, 54, 132);
  const startPlayerY = startPlatformY + playerSize / 2;
  const platformCount = Math.ceil((targetHeight - startPlatformY) / platformGap) + 4;
  const allMotions: DoodleMovementPattern[] = ["horizontal", "vertical", "patrolDiagonal", "orbitSmall", "pulse", "slowCross"];
  const movementPatterns = stringParam(level.params, "movementPattern", "")
    .split("|")
    .filter((motion): motion is DoodleMovementPattern => allMotions.includes(motion as DoodleMovementPattern));
  const patterns = movementPatterns.length > 0 ? movementPatterns : allMotions.slice(0, 1);
  const hardLayout = targetScreens >= 8 || level.levelId === "doodle-10";
  const minPlatformGap = clamp(platformGap - (hardLayout ? 14 : 20), 80, 116);
  const maxPlatformGap = clamp(platformGap + (hardLayout ? 18 : 22), minPlatformGap + 10, 130);
  const gapNoisePoints = makeDoodleNoisePoints(rand, platformCount + 6);
  const xNoisePoints = makeDoodleNoisePoints(rand, platformCount + 6);
  const widthNoisePoints = makeDoodleNoisePoints(rand, platformCount + 6);
  const lanePattern = hardLayout ? [0.04, 0.96, 0.5, 0.8, 0.2] : [0.04, 0.96, 0.5, 0.8, 0.2];
  const laneOffset = Math.floor(rand() * lanePattern.length);

  const riskFinishGap = getDoodleJumpPeakHeight(getDoodleBounceVelocity({ risk: true, riskJumpMultiplier })) + playerSize * 2;
  const maxRiskPlatformY = targetHeight - riskFinishGap;
  const riskJumpPeak = getDoodleJumpPeakHeight(getDoodleBounceVelocity({ risk: true, riskJumpMultiplier }));
  const minRiskGap = Math.max(platformGap * 2, riskJumpPeak - playerSize * 1.75);

  const platforms: GeneratedDoodlePlatform[] = [];
  let previousX = stageWidth / 2;
  let previousY = startPlatformY;

  for (let index = 0; index < platformCount; index += 1) {
    const risk = false;
    const baseWidth = hardLayout ? 72 : 86;
    const widthNoise = doodleSmoothNoise(widthNoisePoints, index * 0.53);
    const width = index === 0 ? 112 : risk ? clamp(riskWidth + (widthNoise - 0.5) * 10, 52, 94) : clamp(baseWidth + (widthNoise - 0.5) * 18, 62, 98);
    const minGap = minPlatformGap;
    const maxGap = maxPlatformGap;
    const gapNoise = doodleSmoothNoise(gapNoisePoints, index * 0.61);
    const gap = index === 0 ? 0 : minGap + gapNoise * (maxGap - minGap);
    const xNoise = doodleSmoothNoise(xNoisePoints, index * 0.47);
    const lane = (index + laneOffset) % lanePattern.length;
    const spreadTargetRatio = clamp(lanePattern[lane] + (xNoise - 0.5) * (hardLayout ? 0.18 : 0.22), 0.02, 0.98);
    const targetX = width / 2 + 20 + spreadTargetRatio * (stageWidth - width - 40);
    const horizontalStep = targetScreens <= 5 ? 150 : targetScreens <= 7 ? 174 : 196;
    const x = index === 0 ? stageWidth / 2 : clamp(previousX + clamp(targetX - previousX, -horizontalStep, horizontalStep), width / 2 + 20, stageWidth - width / 2 - 20);
    const y = index === 0 ? startPlatformY : previousY + gap;
    const moving = index > 0 && movingRatio > 0 && rand() < movingRatio;

    previousX = x;
    previousY = y;

    platforms.push({
      id: index,
      x,
      y,
      width,
      start: index === 0,
      moving,
      risk,
      phase: rand() * Math.PI * 2,
      range: moving ? (risk ? 38 : 52) + rand() * 24 : 0,
      speed: moving ? (movingSpeed / 18) * (0.86 + rand() * 0.28) : 0,
    });
  }

  if (requiredRiskPlatforms > 0) {
    const riskCandidates = platforms.filter((platform) => !platform.start && platform.y <= maxRiskPlatformY);
    const firstRiskY = riskCandidates[0]?.y ?? startPlatformY;
    const selectedRiskPlatforms: GeneratedDoodlePlatform[] = [];

    for (let index = 0; index < requiredRiskPlatforms; index += 1) {
      const remainingSlots = requiredRiskPlatforms - selectedRiskPlatforms.length - 1;
      const minAllowedY =
        selectedRiskPlatforms.length === 0 ? firstRiskY : selectedRiskPlatforms[selectedRiskPlatforms.length - 1].y + minRiskGap;
      const maxAllowedY = Math.max(minAllowedY, maxRiskPlatformY - remainingSlots * minRiskGap);
      const targetRatio = requiredRiskPlatforms <= 1 ? 0 : index / (requiredRiskPlatforms - 1);
      const targetY = clamp(firstRiskY + targetRatio * (maxRiskPlatformY - firstRiskY), minAllowedY, maxAllowedY);
      const candidate = riskCandidates
        .filter((platform) => !selectedRiskPlatforms.includes(platform) && platform.y >= minAllowedY && platform.y <= maxAllowedY)
        .reduce<GeneratedDoodlePlatform | null>(
          (best, platform) => (best === null || Math.abs(platform.y - targetY) < Math.abs(best.y - targetY) ? platform : best),
          null,
        );

      if (candidate) selectedRiskPlatforms.push(candidate);
    }

    for (const platform of selectedRiskPlatforms) {
      const riskPlatformWidth = clamp(riskWidth + (doodleSmoothNoise(widthNoisePoints, platform.id * 0.53) - 0.5) * 10, 52, 94);
      platform.risk = true;
      platform.width = riskPlatformWidth;
      platform.x = clamp(platform.x, riskPlatformWidth / 2 + 20, stageWidth - riskPlatformWidth / 2 - 20);
    }
  }

  const safePlatforms = platforms.filter((platform) => platform.start || platform.y < targetHeight - playerSize * 2);
  const lastPlatform = safePlatforms[safePlatforms.length - 1] ?? platforms[0];
  const finishWidth = hardLayout ? 118 : 128;
  const finishX = clamp(lastPlatform.x + clamp(stageWidth / 2 - lastPlatform.x, -150, 150), finishWidth / 2 + 18, stageWidth - finishWidth / 2 - 18);
  const finishPlatform: GeneratedDoodlePlatform = {
    id: safePlatforms.length,
    x: finishX,
    y: targetHeight,
    width: finishWidth,
    start: false,
    finish: true,
    moving: false,
    risk: false,
    phase: 0,
    range: 0,
    speed: 0,
  };
  const playablePlatforms = [...safePlatforms, finishPlatform];

  const staticHazardCount = Math.ceil(targetScreens * hazardDensity * 1.25);
  const hazardCount = Math.max(movingObstacleCount, staticHazardCount);
  const finalObstacleStartScreen = numberParam(level.params, "finalObstacleStartScreen", 0);
  const hazardMinY = finalObstacleStartScreen > 0 ? finalObstacleStartScreen * stageHeight : 250;
  const hazardMaxY = Math.max(hazardMinY + 120, targetHeight - 120);
  const hazards: GeneratedDoodleHazard[] = Array.from({ length: hazardCount }, (_, index) => {
    const movementEnabled = index < movingObstacleCount;
    const movementPattern: DoodleMovementPattern = movementEnabled ? patterns[index % patterns.length] : "static";
    const screenBand = index / Math.max(1, hazardCount);
    const y = clamp(hazardMinY + screenBand * (hazardMaxY - hazardMinY) + rand() * stageHeight * 0.62, hazardMinY, hazardMaxY);
    const routePlatform = playablePlatforms.reduce((nearest, platform) => Math.abs(platform.y - y) < Math.abs(nearest.y - y) ? platform : nearest, playablePlatforms[0]);
    const direction = index % 2 === 0 ? 1 : -1;
    const nearRoute = movementEnabled && movementPattern === "slowCross";
    const pressureOffset = nearRoute ? 54 : movementEnabled ? 76 + rand() * 42 : 64 + rand() * 62;
    const x = clamp(routePlatform.x + direction * pressureOffset + (rand() - 0.5) * 34, 34, stageWidth - 34);
    const baseRange = movementPattern === "slowCross" ? 88 : movementPattern === "orbitSmall" ? 42 : movementPattern === "pulse" ? 0 : movementPattern === "vertical" ? 42 : 62;
    return {
      id: index,
      x,
      y,
      size: targetScreens >= 8 ? 29 : 25,
      movementEnabled,
      movementPattern,
      phase: rand() * Math.PI * 2,
      range: movementEnabled ? baseRange + rand() * 18 : 0,
      speed: movementEnabled ? (movingHazardSpeed / 22) * (0.82 + rand() * 0.36) : 0,
    };
  });

  return { hazards, platforms: playablePlatforms, startPlayerY, targetHeight };
}
