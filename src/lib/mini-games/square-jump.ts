import {
  booleanParam,
  clamp,
  createSeededRandom,
  type MiniGameLevelConfig,
  numberParam,
  stringParam,
} from "./shared.ts";

export type SquareJumpBasePlatform = {
  finish?: boolean;
  gravity?: "normal" | "light" | "heavy";
  id: string;
  moving?: boolean;
  phase?: number;
  range?: number;
  speed?: number;
  timed?: boolean;
  x: number;
  y: number;
  width: number;
};

type SquareJumpPlatformGravity = NonNullable<SquareJumpBasePlatform["gravity"]>;

export type SquareJumpBaseLandingResult = "stay" | "advance" | "fall";

export type SquareJumpBaseJumpPlan = {
  arcHeight: number;
  durationMs: number;
  jumpEndX: number;
  jumpEndY: number;
  jumpStartX: number;
  jumpStartY: number;
  landingPlatformId: string | null;
  landingX: number;
  power: number;
  result: SquareJumpBaseLandingResult;
};

export type SquareJumpBaseAdvancePlan = {
  cameraEnd: SquareJumpBaseCameraFrame;
  cameraStart: SquareJumpBaseCameraFrame;
  durationMs: number;
  nextPlatformStartVisualOffsetY: number;
  riseDurationMs: number;
};

export type SquareJumpBaseCameraFrame = {
  cameraX: number;
  cameraY: number;
  scale: number;
};

function smoothStep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function getSquareJumpChargeAt({
  cycling,
  elapsedMs,
  maxHoldMs,
}: {
  cycling: boolean;
  elapsedMs: number;
  maxHoldMs: number;
}) {
  if (!Number.isFinite(maxHoldMs) || maxHoldMs <= 0) return 0;
  const raw = Math.max(0, elapsedMs) / maxHoldMs;
  if (!cycling) return clamp(raw, 0, 1);
  const phase = raw % 2;
  return phase <= 1 ? phase : 2 - phase;
}

export function getSquareJumpGravityMultiplier(gravity: SquareJumpPlatformGravity) {
  if (gravity === "light") return 1.55;
  if (gravity === "heavy") return 0.58;
  return 1;
}

export function resolveSquareJumpActiveGravity(
  currentGravity: NonNullable<SquareJumpBasePlatform["gravity"]>,
  landedGravity?: SquareJumpBasePlatform["gravity"],
) {
  if (landedGravity === "light" || landedGravity === "heavy") return landedGravity;
  return currentGravity;
}

export function resolveSquareJumpGravityAfterLanding({
  currentGravity,
  landedGravity,
  remainingJumps,
  jumpLimit,
}: {
  currentGravity: NonNullable<SquareJumpBasePlatform["gravity"]>;
  landedGravity?: SquareJumpBasePlatform["gravity"];
  remainingJumps: number | null;
  jumpLimit: number;
}) {
  const normalizedJumpLimit = Number.isFinite(jumpLimit) ? Math.max(0, Math.floor(jumpLimit)) : 0;
  if (normalizedJumpLimit <= 0) {
    return {
      gravity: resolveSquareJumpActiveGravity(currentGravity, landedGravity),
      remainingJumps: null,
    };
  }

  if (landedGravity === "light" || landedGravity === "heavy") {
    return {
      gravity: landedGravity,
      remainingJumps: normalizedJumpLimit,
    };
  }

  if (currentGravity === "normal") return { gravity: "normal" as const, remainingJumps: null };

  const nextRemainingJumps = Math.max(0, (remainingJumps ?? normalizedJumpLimit) - 1);
  if (nextRemainingJumps <= 0) return { gravity: "normal" as const, remainingJumps: null };

  return {
    gravity: currentGravity,
    remainingJumps: nextRemainingJumps,
  };
}

export function selectSquareJumpVisiblePlatforms(
  currentPlatform: SquareJumpBasePlatform,
  nextPlatform: SquareJumpBasePlatform,
  exitingPlatform?: SquareJumpBasePlatform | null,
) {
  const platforms = [currentPlatform];
  if (currentPlatform.id !== nextPlatform.id) platforms.push(nextPlatform);
  if (exitingPlatform && !platforms.some((platform) => platform.id === exitingPlatform.id)) platforms.push(exitingPlatform);
  return platforms;
}

export function getSquareJumpBasePlatformHeight({
  camera,
  platformY,
  stageBottom,
  stageHeight,
}: {
  camera: SquareJumpBaseCameraFrame;
  platformY: number;
  stageBottom: number;
  stageHeight: number;
}) {
  const cameraBottomWorld = camera.cameraY + stageHeight / 2 / Math.max(0.001, camera.scale);
  return Math.max(0, stageBottom - platformY, cameraBottomWorld - platformY);
}

export function getSquareJumpBasePlatformX(platform: Pick<SquareJumpBasePlatform, "moving" | "phase" | "range" | "speed" | "x">, time: number) {
  const range = platform.moving ? (platform.range ?? 0) : 0;
  const speed = platform.moving ? (platform.speed ?? 0) : 0;
  if (range === 0 || speed === 0) return platform.x;
  return platform.x + Math.sin(time * speed + (platform.phase ?? 0)) * range;
}

export function getSquareJumpBasePlayerXOnPlatform({
  offset,
  platform,
  time,
}: {
  offset: number;
  platform: Pick<SquareJumpBasePlatform, "moving" | "phase" | "range" | "speed" | "x">;
  time: number;
}) {
  return getSquareJumpBasePlatformX(platform, time) + offset;
}

export function resolveSquareJumpBaseLandingByX({
  currentPlatform,
  landingX,
  nextPlatform,
  targetPadding = 0,
}: {
  currentPlatform: SquareJumpBasePlatform;
  landingX: number;
  nextPlatform: SquareJumpBasePlatform;
  targetPadding?: number;
}) {
  const insideCurrent = landingX >= currentPlatform.x - currentPlatform.width / 2 && landingX <= currentPlatform.x + currentPlatform.width / 2;
  if (insideCurrent) return { landingPlatformId: currentPlatform.id, result: "stay" as const };

  const insideNext = landingX >= nextPlatform.x - nextPlatform.width / 2 - targetPadding && landingX <= nextPlatform.x + nextPlatform.width / 2 + targetPadding;
  if (insideNext) return { landingPlatformId: nextPlatform.id, result: "advance" as const };

  return { landingPlatformId: null, result: "fall" as const };
}

export function shouldSquareJumpDeferLandingResolution({
  doubleJumpEnabled,
  doubleJumpUsed,
  result,
}: {
  doubleJumpEnabled: boolean;
  doubleJumpUsed: boolean;
  result: SquareJumpBaseLandingResult;
}) {
  return doubleJumpEnabled && !doubleJumpUsed && result === "fall";
}

export function createSquareJumpBaseJumpPlan({
  currentPlatform,
  holdMs,
  maxHoldMs,
  maxJumpDistance,
  minJumpDistance,
  nextPlatform,
  playerX,
  playerY,
  squareSize,
  targetLandingPadding = 0,
}: {
  currentPlatform: SquareJumpBasePlatform;
  holdMs: number;
  maxHoldMs: number;
  maxJumpDistance: number;
  minJumpDistance: number;
  nextPlatform: SquareJumpBasePlatform;
  playerX: number;
  playerY?: number;
  squareSize: number;
  targetLandingPadding?: number;
}): SquareJumpBaseJumpPlan {
  const rawPower = clamp(maxHoldMs > 0 ? holdMs / maxHoldMs : 0, 0, 1);
  const power = smoothStep(rawPower);
  const landingX = playerX + minJumpDistance + power * (maxJumpDistance - minJumpDistance);
  const landing = resolveSquareJumpBaseLandingByX({ currentPlatform, landingX, nextPlatform, targetPadding: targetLandingPadding });
  const landingPlatform = landing.landingPlatformId === currentPlatform.id ? currentPlatform : landing.landingPlatformId === nextPlatform.id ? nextPlatform : null;
  const startY = playerY ?? currentPlatform.y - squareSize / 2;
  const endY = (landingPlatform?.y ?? currentPlatform.y) - squareSize / 2;

  return {
    arcHeight: 42 + power * 34,
    durationMs: 360 + power * 80,
    jumpEndX: landingX,
    jumpEndY: endY,
    jumpStartX: playerX,
    jumpStartY: startY,
    landingPlatformId: landing.landingPlatformId,
    landingX,
    power,
    result: landing.result,
  };
}

export function sampleSquareJumpBaseJump(plan: SquareJumpBaseJumpPlan, progress: number) {
  const t = clamp(progress, 0, 1);
  if (t >= 1) return { x: plan.jumpEndX, y: plan.jumpEndY };
  return {
    x: plan.jumpStartX + (plan.jumpEndX - plan.jumpStartX) * t,
    y: plan.jumpStartY + (plan.jumpEndY - plan.jumpStartY) * t - plan.arcHeight * Math.sin(Math.PI * t),
  };
}

export function sampleSquareJumpBaseFlyAway(plan: SquareJumpBaseJumpPlan, progress: number) {
  const t = Math.max(0, progress);
  if (t <= 1) return sampleSquareJumpBaseJump(plan, t);
  const extra = t - 1;
  const dx = plan.jumpEndX - plan.jumpStartX;
  const dy = plan.jumpEndY - plan.jumpStartY;
  const endVelocityY = dy + plan.arcHeight * Math.PI;
  return {
    x: plan.jumpEndX + dx * extra,
    y: plan.jumpEndY + endVelocityY * extra + plan.arcHeight * 0.92 * extra * extra,
  };
}

export function resolveSquareJumpBaseFlyAwayLanding({
  catchDepth = 40,
  plan,
  progress,
  squareSize,
  targetPadding = 0,
  targetPlatform,
}: {
  catchDepth?: number;
  plan: SquareJumpBaseJumpPlan;
  progress: number;
  squareSize: number;
  targetPadding?: number;
  targetPlatform: SquareJumpBasePlatform;
}): { landingPlatformId: string; result: "advance" } | null {
  const point = sampleSquareJumpBaseFlyAway(plan, progress);
  const playerBottom = point.y + squareSize / 2;
  const catchTop = targetPlatform.y;
  const catchBottom = targetPlatform.y + Math.max(0, catchDepth);
  if (playerBottom < catchTop || playerBottom > catchBottom) return null;

  const targetLeft = targetPlatform.x - targetPlatform.width / 2 - targetPadding;
  const targetRight = targetPlatform.x + targetPlatform.width / 2 + targetPadding;
  if (point.x < targetLeft || point.x > targetRight) return null;

  return { landingPlatformId: targetPlatform.id, result: "advance" };
}

export function createSquareJumpBaseAdvancePlan({
  cameraEnd,
  cameraStart,
  durationMs = 760,
  riseDurationMs = 620,
  stageHeight,
}: {
  cameraEnd: SquareJumpBaseCameraFrame;
  cameraStart: SquareJumpBaseCameraFrame;
  durationMs?: number;
  riseDurationMs?: number;
  stageHeight: number;
}): SquareJumpBaseAdvancePlan {
  return {
    cameraEnd: { ...cameraEnd },
    cameraStart: { ...cameraStart },
    durationMs,
    nextPlatformStartVisualOffsetY: stageHeight * 0.25,
    riseDurationMs,
  };
}

export function sampleSquareJumpBaseAdvanceCamera(plan: Pick<SquareJumpBaseAdvancePlan, "cameraEnd" | "cameraStart">, progress: number) {
  const t = smoothStep(progress);
  return {
    cameraX: plan.cameraStart.cameraX + (plan.cameraEnd.cameraX - plan.cameraStart.cameraX) * t,
    cameraY: plan.cameraStart.cameraY + (plan.cameraEnd.cameraY - plan.cameraStart.cameraY) * t,
    scale: plan.cameraStart.scale + (plan.cameraEnd.scale - plan.cameraStart.scale) * t,
  };
}

export function sampleSquareJumpBaseRiseIn(plan: Pick<SquareJumpBaseAdvancePlan, "nextPlatformStartVisualOffsetY">, progress: number) {
  return plan.nextPlatformStartVisualOffsetY * (1 - smoothStep(progress));
}

export function fitSquareJumpBaseCamera({
  currentPlatform,
  marginX = 44,
  marginY = 70,
  maxScale = 1.15,
  minScale = 0.34,
  nextPlatform,
  playerX,
  stageBottom,
  stageHeight,
  stageWidth,
}: {
  currentPlatform: SquareJumpBasePlatform;
  marginX?: number;
  marginY?: number;
  maxScale?: number;
  minScale?: number;
  nextPlatform: SquareJumpBasePlatform;
  playerX: number;
  stageBottom: number;
  stageHeight: number;
  stageWidth: number;
}) {
  const currentRange = currentPlatform.range ?? 0;
  const nextRange = nextPlatform.range ?? 0;
  const minX = Math.min(currentPlatform.x - currentRange - currentPlatform.width / 2, nextPlatform.x - nextRange - nextPlatform.width / 2, playerX);
  const maxX = Math.max(currentPlatform.x + currentRange + currentPlatform.width / 2, nextPlatform.x + nextRange + nextPlatform.width / 2, playerX);
  const minY = Math.min(currentPlatform.y, nextPlatform.y) - marginY;
  const maxY = stageBottom;
  const scaleX = stageWidth / Math.max(1, maxX - minX + marginX * 2);
  const scaleY = stageHeight / Math.max(1, maxY - minY + marginY * 2);
  return {
    cameraX: (minX + maxX) / 2,
    cameraY: (minY + maxY) / 2,
    scale: clamp(Math.min(scaleX, scaleY), minScale, maxScale),
  };
}

function getSquareJumpPlatformWidth(level: MiniGameLevelConfig, index: number, rand: () => number) {
  const fixedWidth = numberParam(level.params, "platformWidth", 0);
  if (level.levelId !== "square-jump-base" && fixedWidth > 0) {
    const finishBonus = index === numberParam(level.params, "jumpsRequired", 5) ? 12 : 0;
    const jitter = index === 0 ? 0 : (rand() - 0.5) * Math.min(14, fixedWidth * 0.12);
    return Math.max(50, fixedWidth + finishBonus + jitter);
  }
  const minWidth = numberParam(level.params, "basePlatformWidthMin", 90);
  const maxWidth = numberParam(level.params, "basePlatformWidthMax", 130);
  return minWidth + rand() * (maxWidth - minWidth);
}

function getSquareJumpGravityPattern(level: MiniGameLevelConfig): SquareJumpPlatformGravity[] {
  return stringParam(level.params, "gravityPattern", "normal")
    .split("|")
    .filter((item): item is SquareJumpPlatformGravity => item === "normal" || item === "light" || item === "heavy");
}

function getStaggeredSquareJumpGravity(
  pattern: SquareJumpPlatformGravity[],
  targetGravity: SquareJumpPlatformGravity,
  previousGravity: SquareJumpPlatformGravity,
) {
  if (targetGravity !== previousGravity) return targetGravity;
  return pattern.find((gravity) => gravity !== previousGravity) ?? targetGravity;
}

function getSquareJumpPlatformGravity({
  gravityPlatformCount,
  index,
  lastGravityPlatformIndex,
  level,
  platformIndex,
  previousGravity,
}: {
  gravityPlatformCount: number;
  index: number;
  lastGravityPlatformIndex: number;
  level: MiniGameLevelConfig;
  platformIndex: number;
  previousGravity: SquareJumpPlatformGravity;
}): SquareJumpPlatformGravity {
  const pattern = getSquareJumpGravityPattern(level);
  const gravityChallenge = booleanParam(level.params, "gravityChallenge");
  const rawGravityPlatformMaxCount = Number(level.params.gravityPlatformMaxCount);
  const rawGravityPlatformMinSpacing = Number(level.params.gravityPlatformMinSpacing);
  const hasGravityDensityLimit = Number.isFinite(rawGravityPlatformMaxCount) || Number.isFinite(rawGravityPlatformMinSpacing);
  const gravityPlatformMaxCount = Number.isFinite(rawGravityPlatformMaxCount) ? Math.max(0, Math.floor(rawGravityPlatformMaxCount)) : Number.POSITIVE_INFINITY;
  const gravityPlatformMinSpacing = Number.isFinite(rawGravityPlatformMinSpacing) ? Math.max(1, Math.floor(rawGravityPlatformMinSpacing)) : 1;
  let targetGravity = pattern[index % Math.max(1, pattern.length)] ?? "normal";

  if (hasGravityDensityLimit && targetGravity !== "normal") {
    const tooManyGravityPlatforms = gravityPlatformCount >= gravityPlatformMaxCount;
    const tooCloseToLastGravityPlatform = platformIndex - lastGravityPlatformIndex < gravityPlatformMinSpacing;
    if (tooManyGravityPlatforms || tooCloseToLastGravityPlatform) targetGravity = "normal";
  }

  if (gravityChallenge && !hasGravityDensityLimit) {
    return getStaggeredSquareJumpGravity(pattern, targetGravity, previousGravity);
  }

  return targetGravity;
}

function isGeneratedSquareJumpPlatformMoving(level: MiniGameLevelConfig, targetIndex: number) {
  const movingCount = numberParam(level.params, "movingPlatformCount", 0);
  const movingStaticEvery = numberParam(level.params, "movingStaticEvery", 0);
  const finalMix = booleanParam(level.params, "finalMix");
  if (finalMix) return targetIndex === 2 || targetIndex === 6;
  if (movingStaticEvery > 0 && targetIndex > 0 && targetIndex < numberParam(level.params, "jumpsRequired", 5) && targetIndex % movingStaticEvery === 0) return false;
  return targetIndex > 0 && targetIndex <= movingCount;
}

export function generateSquareJumpPlatformSequence(
  level: MiniGameLevelConfig,
  runSeed: string,
  {
    count,
    platformY = 435,
    startX = 120,
    startWidth = 128,
  }: {
    count?: number;
    platformY?: number;
    startX?: number;
    startWidth?: number;
  } = {},
) {
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:square-jump-platforms`);
  const platformCount = Math.max(2, Math.floor(count ?? numberParam(level.params, "jumpsRequired", 5) + 1));
  const minDistance = numberParam(level.params, "distanceMin", 180);
  const maxDistance = numberParam(level.params, "distanceMax", 330);
  const maxJumpDistance = numberParam(level.params, "powerDistanceMax", numberParam(level.params, "maxJumpDistance", 360));
  const secondMaxJumpDistance = numberParam(level.params, "secondPowerDistanceMax", 0);
  const targetLandingPadding = numberParam(level.params, "targetLandingPadding", 12);
  const reverseMoving = booleanParam(level.params, "reverseMoving");
  const doubleJumpEnabled = booleanParam(level.params, "doubleJumpEnabled");
  const gravityChallenge = booleanParam(level.params, "gravityChallenge");
  const gravityJumpLimit = numberParam(level.params, "gravityJumpLimit", 0);
  let activeGravity: SquareJumpPlatformGravity = "normal";
  let activeGravityRemainingJumps: number | null = null;
  let gravityPlatformCount = 0;
  let lastGravityPlatformIndex = Number.NEGATIVE_INFINITY;

  const platforms: SquareJumpBasePlatform[] = [
    {
      finish: false,
      gravity: "normal",
      id: "platform-0",
      moving: false,
      phase: rand() * Math.PI * 2,
      range: 0,
      speed: 0,
      timed: false,
      width: startWidth + (rand() - 0.5) * 12,
      x: startX + (rand() - 0.5) * 22,
      y: platformY,
    },
  ];

  for (let index = 1; index < platformCount; index += 1) {
    const current = platforms[index - 1];
    const moving = isGeneratedSquareJumpPlatformMoving(level, index);
    const reverse = reverseMoving && index % 2 === 0 ? -1 : 1;
    const width = getSquareJumpPlatformWidth(level, index, rand);
    const range = moving ? numberParam(level.params, "movingRange", 0) * (0.86 + rand() * 0.28) : 0;
    const gravityMultiplier = getSquareJumpGravityMultiplier(activeGravity);
    const totalMaxJumpDistance = (maxJumpDistance + (doubleJumpEnabled ? secondMaxJumpDistance : 0)) * gravityMultiplier;
    const farthestCenterDistance = Math.max(80, totalMaxJumpDistance + width / 2 + targetLandingPadding - range - 4);
    let localMinDistance = minDistance;
    let localMaxDistance = maxDistance;
    if (gravityChallenge && activeGravity === "light") {
      localMinDistance = Math.max(minDistance, maxDistance * 1.02);
      localMaxDistance = Math.max(localMinDistance, maxDistance * 1.24);
    } else if (gravityChallenge && activeGravity === "heavy") {
      localMinDistance = Math.max(minDistance, maxDistance * 0.82);
      localMaxDistance = maxDistance;
    }
    const reachableMinDistance = Math.min(localMinDistance, farthestCenterDistance);
    const reachableMaxDistance = Math.max(reachableMinDistance, Math.min(localMaxDistance, farthestCenterDistance));
    const randomDistance = localMinDistance + rand() * Math.max(0, localMaxDistance - localMinDistance);
    const distance = clamp(randomDistance, reachableMinDistance, reachableMaxDistance);
    const targetGravity = getSquareJumpPlatformGravity({
      gravityPlatformCount,
      index: Math.max(0, index - 1),
      lastGravityPlatformIndex,
      level,
      platformIndex: index,
      previousGravity: current.gravity ?? "normal",
    });
    const isFinish = index === numberParam(level.params, "jumpsRequired", 5);
    const platformGravity = isFinish ? "normal" : targetGravity;
    if (platformGravity !== "normal") {
      gravityPlatformCount += 1;
      lastGravityPlatformIndex = index;
    }

    platforms.push({
      finish: isFinish,
      gravity: platformGravity,
      id: `platform-${index}`,
      moving,
      phase: rand() * Math.PI * 2,
      range,
      speed: moving ? numberParam(level.params, "movingSpeed", 0) * reverse * (0.86 + rand() * 0.28) : 0,
      timed: false,
      width,
      x: current.x + distance,
      y: platformY,
    });
    const gravityState = resolveSquareJumpGravityAfterLanding({
      currentGravity: activeGravity,
      jumpLimit: gravityJumpLimit,
      landedGravity: targetGravity,
      remainingJumps: activeGravityRemainingJumps,
    });
    activeGravity = gravityState.gravity;
    activeGravityRemainingJumps = gravityState.remainingJumps;
  }

  return platforms;
}
