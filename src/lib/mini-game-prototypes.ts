export type MiniGameId = "doodle" | "flappy" | "knife" | "square-jump" | "fall-down";
export type MiniGameLevelKind = "advanced" | "base";
export type MiniGameDifficulty = "基础" | "简单" | "普通" | "困难" | "最终";
export type MiniGameParams = Record<string, number | string | boolean | null>;

export type MiniGameLevelConfig = {
  gameId: MiniGameId;
  levelId: string;
  order: number;
  kind: MiniGameLevelKind;
  code: string;
  title: string;
  difficulty: MiniGameDifficulty;
  variant: string;
  description: string;
  goalText: string;
  params: MiniGameParams;
};

export type MiniGameDefinition = {
  id: MiniGameId;
  title: string;
  shortTitle: string;
  summary: string;
  instruction: string;
  levels: MiniGameLevelConfig[];
};

export type AngleArc = {
  start: number;
  end: number;
};

export function normalizeDegrees(deg: number) {
  return ((deg % 360) + 360) % 360;
}

export function getShortestAngleDistance(a: number, b: number) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(diff, 360 - diff);
}

export function getSineAngularVelocity(elapsedTime: number, phaseDuration: number, sweepPerPhase = 405) {
  if (!Number.isFinite(phaseDuration) || phaseDuration <= 0) return 0;
  const fullCycle = phaseDuration * 2;
  const phase = elapsedTime % fullCycle;
  const omegaMax = (sweepPerPhase * Math.PI) / (phaseDuration * 2);
  return omegaMax * Math.sin((2 * Math.PI * phase) / fullCycle);
}

export function getLocalHitAngle(fireAngle: number, discAngle: number) {
  return normalizeDegrees(fireAngle - discAngle);
}

export function isAngleWithinArc(angle: number, arc: AngleArc) {
  const target = normalizeDegrees(angle);
  const start = normalizeDegrees(arc.start);
  const end = normalizeDegrees(arc.end);
  if (start <= end) return target >= start && target <= end;
  return target >= start || target <= end;
}

export type DoodleMovementPattern = "static" | "horizontal" | "vertical" | "patrolDiagonal" | "orbitSmall" | "pulse" | "slowCross";

export type GeneratedDoodlePlatform = {
  id: number;
  x: number;
  y: number;
  width: number;
  start: boolean;
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

export type MiniGameLowPowerHints = {
  maxWidth768?: boolean;
  hardwareConcurrency?: number;
};

export type DoodleVisibleOptions = {
  buffer: number;
  cameraY: number;
  stageHeight: number;
};

export type FlappyVisibleOptions = {
  buffer: number;
  gateWidth: number;
  progress: number;
  reverseDirection: boolean;
  stageWidth: number;
};

export type KnifePoint = {
  x: number;
  y: number;
};

export type KnifeShotOutcomeKind = "hit" | "collision" | "forbidden";

export type KnifeShotOutcome = {
  impactAngle: number;
  kind: KnifeShotOutcomeKind;
};

export function createSeededRandom(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMiniGameRunSeed(levelId: string, runKey: string | number = Date.now()) {
  const entropy = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${levelId}:${runKey}:${entropy}`;
}

function numberParam(params: MiniGameParams, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanParam(params: MiniGameParams, key: string, fallback = false) {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringParam(params: MiniGameParams, key: string, fallback: string) {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

export function getSquareJumpGravityMultiplier(gravity: NonNullable<SquareJumpBasePlatform["gravity"]>) {
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

function getSquareJumpPlatformGravity(level: MiniGameLevelConfig, index: number): NonNullable<SquareJumpBasePlatform["gravity"]> {
  const pattern = stringParam(level.params, "gravityPattern", "normal")
    .split("|")
    .filter((item): item is NonNullable<SquareJumpBasePlatform["gravity"]> => item === "normal" || item === "light" || item === "heavy");
  return pattern[index % Math.max(1, pattern.length)] ?? "normal";
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
  let activeGravity: NonNullable<SquareJumpBasePlatform["gravity"]> = "normal";

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
      localMinDistance = Math.max(96, minDistance * 0.72);
      localMaxDistance = Math.max(localMinDistance, minDistance * 0.98);
    } else if (gravityChallenge && activeGravity === "heavy") {
      localMinDistance = Math.max(minDistance, maxDistance * 0.82);
      localMaxDistance = maxDistance;
    }
    const reachableMinDistance = Math.min(localMinDistance, farthestCenterDistance);
    const reachableMaxDistance = Math.max(reachableMinDistance, Math.min(localMaxDistance, farthestCenterDistance));
    const randomDistance = localMinDistance + rand() * Math.max(0, localMaxDistance - localMinDistance);
    const distance = clamp(randomDistance, reachableMinDistance, reachableMaxDistance);
    const targetGravity = getSquareJumpPlatformGravity(level, Math.max(0, index - 1));

    platforms.push({
      finish: index === numberParam(level.params, "jumpsRequired", 5),
      gravity: targetGravity,
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
    activeGravity = resolveSquareJumpActiveGravity(activeGravity, targetGravity);
  }

  return platforms;
}

export function advanceFallDownCamera({
  cameraY,
  delta,
  speed,
}: {
  cameraY: number;
  delta: number;
  speed: number;
}) {
  return cameraY + speed * delta;
}

export function resolveFallDownCameraBounds({
  bottomFailLine,
  cameraY,
  playerWorldY,
  squareSize,
  topFailLine,
}: {
  bottomFailLine?: number;
  cameraY: number;
  playerWorldY: number;
  squareSize: number;
  stageHeight: number;
  topFailLine?: number;
}) {
  const screenY = playerWorldY - cameraY;
  if (screenY < (topFailLine ?? -squareSize)) {
    return { status: "failed" as const, reason: "too-slow" };
  }
  if (bottomFailLine !== undefined && screenY > bottomFailLine) {
    return { status: "failed" as const, reason: "too-deep" };
  }
  return { status: "playing" as const, reason: "" };
}

export function expireFallDownFragilePlatform({
  fragileTime,
  kind,
  now,
  steppedAt,
}: {
  fragileTime: number;
  kind: string;
  now: number;
  steppedAt: number | null;
}) {
  return {
    broken: kind === "fragile" && steppedAt !== null && now - steppedAt >= fragileTime,
    directFailure: false,
  };
}

export function getMiniGameLowPowerMode({
  hardwareConcurrency,
  maxWidth768 = false,
}: MiniGameLowPowerHints = {}) {
  return maxWidth768 || (typeof hardwareConcurrency === "number" && hardwareConcurrency <= 4);
}

export function isLowPowerMiniGameDevice() {
  const maxWidth768 =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches;
  const hardwareConcurrency =
    typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : undefined;

  return getMiniGameLowPowerMode({ hardwareConcurrency, maxWidth768 });
}

export function selectVisibleDoodlePlatforms<T extends { y: number; used?: boolean }>(
  platforms: readonly T[],
  { buffer, cameraY, stageHeight }: DoodleVisibleOptions,
) {
  const minY = cameraY - buffer;
  const maxY = cameraY + stageHeight + buffer;
  return platforms.filter((platform) => !platform.used && platform.y >= minY && platform.y <= maxY);
}

export function selectVisibleDoodleHazards<T extends { y: number; size: number; used?: boolean }>(
  hazards: readonly T[],
  { buffer, cameraY, stageHeight }: DoodleVisibleOptions,
) {
  const minY = cameraY - buffer;
  const maxY = cameraY + stageHeight + buffer;
  return hazards.filter((hazard) => !hazard.used && hazard.y + hazard.size >= minY && hazard.y - hazard.size <= maxY);
}

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
  const riskWidth = numberParam(level.params, "riskPlatformWidth", 86);
  const platformGap = numberParam(level.params, "platformGap", 104);
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:doodle-world`);
  const startPlatformY = 54;
  const startPlayerY = startPlatformY + playerSize / 2;
  const platformCount = Math.ceil((targetHeight - startPlatformY) / platformGap) + 4;
  const allMotions: DoodleMovementPattern[] = ["horizontal", "vertical", "patrolDiagonal", "orbitSmall", "pulse", "slowCross"];
  const movementPatterns = stringParam(level.params, "movementPattern", "")
    .split("|")
    .filter((motion): motion is DoodleMovementPattern => allMotions.includes(motion as DoodleMovementPattern));
  const patterns = movementPatterns.length > 0 ? movementPatterns : allMotions.slice(0, 1);
  const riskIndexes = new Set<number>();

  for (let index = 1; index <= requiredRiskPlatforms; index += 1) {
    riskIndexes.add(clamp(Math.round((index / (requiredRiskPlatforms + 1)) * (platformCount - 3)) + 1, 2, platformCount - 2));
  }

  const platforms: GeneratedDoodlePlatform[] = [];
  let previousX = stageWidth / 2;
  let previousY = startPlatformY;
  let sameSideRun = 0;
  let previousSide = 0;

  for (let index = 0; index < platformCount; index += 1) {
    const risk = riskIndexes.has(index);
    const hardLayout = targetScreens >= 8 || level.levelId === "doodle-10";
    const baseWidth = hardLayout ? 72 : 86;
    const width = index === 0 ? 112 : risk ? clamp(riskWidth + (rand() - 0.5) * 10, 52, 94) : clamp(baseWidth + (rand() - 0.5) * 18, 62, 98);
    const minGap = clamp(platformGap - (hardLayout ? 14 : 20), 80, 116);
    const maxGap = clamp(platformGap + (hardLayout ? 18 : 22), minGap + 10, 130);
    const gap = index === 0 ? 0 : minGap + rand() * (maxGap - minGap);
    const maxDeltaX = targetScreens <= 5 ? 112 : targetScreens <= 7 ? 150 : 182;
    const forceSideChange = sameSideRun >= 2;
    const largeOffset = rand() < (hardLayout ? 0.34 : 0.24);
    let side = rand() < 0.5 ? -1 : 1;
    if (forceSideChange) side = -previousSide || side;
    const magnitude = maxDeltaX * (largeOffset ? 0.62 + rand() * 0.38 : 0.22 + rand() * 0.5);
    const offset = index === 0 ? 0 : side * magnitude;
    const centerJitter = (rand() - 0.5) * 20;
    const x = index === 0 ? stageWidth / 2 : clamp(previousX + offset + centerJitter, width / 2 + 20, stageWidth - width / 2 - 20);
    const y = index === 0 ? startPlatformY : previousY + gap;
    const moving = index > 0 && movingRatio > 0 && rand() < movingRatio;

    if (side === previousSide) sameSideRun += 1;
    else sameSideRun = 1;
    previousSide = side;
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
    const routePlatform = platforms.reduce((nearest, platform) => Math.abs(platform.y - y) < Math.abs(nearest.y - y) ? platform : nearest, platforms[0]);
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

  return { hazards, platforms, startPlayerY, targetHeight };
}

export function getFlappyInitialPlacement(level: MiniGameLevelConfig): FlappyInitialPlacement {
  return booleanParam(level.params, "reversedGravity") ? "belowPlatform" : "abovePlatform";
}

export function generateFlappyGateLayout(
  level: MiniGameLevelConfig,
  runSeed: string,
  options: { backgroundRefCount?: number; stageHeight?: number } = {},
) {
  const stageHeight = options.stageHeight ?? 640;
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
    x: backgroundSeed() * 360,
    y: 72 + backgroundSeed() * (stageHeight - 150),
    kind: backgroundSeed() < 0.34 ? "square" : "dash",
  }));

  return { backgroundRefs, gates, initialPlacement: getFlappyInitialPlacement(level) };
}

export function getKnifeShotGeometry(firePoint: KnifePoint, discCenter: KnifePoint, discRadius: number) {
  const dx = discCenter.x - firePoint.x;
  const dy = discCenter.y - firePoint.y;
  const length = Math.hypot(dx, dy) || 1;
  const travelAngle = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  const impactAngle = normalizeDegrees(travelAngle + 180);
  return {
    impactAngle,
    impactPoint: {
      x: discCenter.x - (dx / length) * discRadius,
      y: discCenter.y - (dy / length) * discRadius,
    },
    travelAngle,
  };
}

export function generateKnifeForbiddenZones(level: MiniGameLevelConfig, runSeed: string): AngleArc[] {
  const count = numberParam(level.params, "forbiddenZoneCount", 0);
  const ratio = numberParam(level.params, "forbiddenZoneRatio", 0);
  if (count <= 0 || ratio <= 0) return [];
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:knife-zones`);
  const span = (ratio * 360) / count;
  const zones: AngleArc[] = [];
  let attempts = 0;
  while (zones.length < count && attempts < 240) {
    attempts += 1;
    const center = normalizeDegrees(rand() * 360);
    const tooCloseToFireLane = getShortestAngleDistance(center, 90) < span / 2 + 18 && zones.length === 0;
    const overlaps = zones.some((zone) => {
      const zoneCenter = normalizeDegrees(zone.start + span / 2);
      return getShortestAngleDistance(center, zoneCenter) < span + 22;
    });
    if (tooCloseToFireLane || overlaps) continue;
    zones.push({
      start: normalizeDegrees(center - span / 2),
      end: normalizeDegrees(center + span / 2),
    });
  }

  while (zones.length < count) {
    const center = normalizeDegrees((zones.length / count) * 360 + 32 + rand() * 42);
    zones.push({
      start: normalizeDegrees(center - span / 2),
      end: normalizeDegrees(center + span / 2),
    });
  }

  return zones;
}

export function generateKnifeInitialAngles(level: MiniGameLevelConfig, runSeed: string, forbiddenZones: AngleArc[] = []) {
  const count = numberParam(level.params, "initialObstacleCount", 1);
  if (count <= 0) return [];
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:knife-initial`);
  const angles: number[] = [];
  let attempts = 0;
  while (angles.length < count && attempts < 360) {
    attempts += 1;
    const angle = normalizeDegrees(rand() * 360);
    if (getShortestAngleDistance(angle, 90) < 24) continue;
    if (angles.some((existing) => getShortestAngleDistance(existing, angle) < 34)) continue;
    if (forbiddenZones.some((zone) => isAngleWithinArc(angle, zone))) continue;
    angles.push(angle);
  }

  while (angles.length < count) {
    angles.push(normalizeDegrees(210 + angles.length * 58 + rand() * 20));
  }

  return angles;
}

export function resolveKnifeShotOutcome({
  collisionDegrees,
  forbiddenZones,
  impactAngle,
  initialAngles,
  insertedAngles,
}: {
  collisionDegrees: number;
  forbiddenZones: AngleArc[];
  impactAngle: number;
  initialAngles: number[];
  insertedAngles: number[];
}): KnifeShotOutcome {
  const normalizedImpact = normalizeDegrees(impactAngle);
  const occupiedAngles = [...initialAngles, ...insertedAngles];
  if (occupiedAngles.some((angle) => getShortestAngleDistance(angle, normalizedImpact) < collisionDegrees)) {
    return { impactAngle: normalizedImpact, kind: "collision" };
  }
  if (forbiddenZones.some((zone) => isAngleWithinArc(normalizedImpact, zone))) {
    return { impactAngle: normalizedImpact, kind: "forbidden" };
  }
  return { impactAngle: normalizedImpact, kind: "hit" };
}

function level(
  gameId: MiniGameId,
  order: number,
  code: string,
  title: string,
  difficulty: MiniGameDifficulty,
  variant: string,
  description: string,
  goalText: string,
  params: MiniGameParams,
): MiniGameLevelConfig {
  return {
    gameId,
    levelId: `${gameId}-${order}`,
    order,
    kind: "advanced",
    code,
    title,
    difficulty,
    variant,
    description,
    goalText,
    params,
  };
}

function baseLevel(
  gameId: MiniGameId,
  code: string,
  title: string,
  description: string,
  goalText: string,
  params: MiniGameParams,
): MiniGameLevelConfig {
  return {
    gameId,
    levelId: `${gameId}-base`,
    order: 11,
    kind: "base",
    code,
    title,
    difficulty: "基础",
    variant: "基础关",
    description,
    goalText,
    params,
  };
}

function prototypeLevel(
  gameId: MiniGameId,
  levelId: string,
  order: number,
  code: string,
  title: string,
  kind: MiniGameLevelKind,
  difficulty: MiniGameDifficulty,
  variant: string,
  description: string,
  goalText: string,
  params: MiniGameParams,
): MiniGameLevelConfig {
  return {
    gameId,
    levelId,
    order,
    kind,
    code,
    title,
    difficulty,
    variant,
    description,
    goalText,
    params,
  };
}

const doodleBaseParams = {
  targetHeightScreens: 3,
  movingPlatformRatio: 0,
  movingPlatformSpeed: 0,
  hazardDensity: 0,
  movingObstacleCount: 0,
  movingHazardSpeed: 0,
  movementPattern: "",
  platformGap: 102,
  requiredRiskPlatforms: 0,
  riskJumpMultiplier: 1,
  dangerLineEnabled: false,
  dangerLineDelay: null,
  dangerLineSpeed: 0,
  riskPlatformWidth: 86,
};

const flappyBaseParams = {
  gateCount: 6,
  movingGateRatio: 0,
  collectibleCount: 0,
  reversedGravity: false,
  reverseDirection: false,
  gapSize: 190,
  speed: 118,
};

const knifeBaseParams = {
  shotCount: 6,
  shotCountdown: null,
  sineRotationEnabled: false,
  phaseDuration: null,
  sweepPerPhase: null,
  forbiddenZoneCount: 0,
  forbiddenZoneRatio: 0,
  initialObstacleCount: 1,
  baseRotationSpeed: 88,
};

const doodleLevels: MiniGameLevelConfig[] = [
  level("doodle", 1, "1-1", "移动平台", "简单", "移动平台", "移动平台比例约 40%，少量危险障碍，速度慢。", "到达 4 屏高度", {
    ...doodleBaseParams,
    targetHeightScreens: 4,
    movingPlatformRatio: 0.4,
    movingPlatformSpeed: 22,
    hazardDensity: 0.45,
    platformGap: 100,
  }),
  level("doodle", 2, "1-2", "移动平台", "普通", "移动平台", "移动平台比例约 70%，中等危险障碍，速度中等。", "到达 6 屏高度", {
    ...doodleBaseParams,
    targetHeightScreens: 6,
    movingPlatformRatio: 0.7,
    movingPlatformSpeed: 34,
    hazardDensity: 0.8,
    platformGap: 104,
  }),
  level("doodle", 3, "1-3", "移动平台", "困难", "移动平台", "全部平台移动，危险障碍更多，速度较快。", "到达 8 屏高度", {
    ...doodleBaseParams,
    targetHeightScreens: 8,
    movingPlatformRatio: 1,
    movingPlatformSpeed: 46,
    hazardDensity: 1.2,
    platformGap: 108,
  }),
  level("doodle", 4, "1-4", "必踩高风险平台", "简单", "必踩高风险平台", "必须踩中 3 个略窄高风险平台，统一 1.6 倍弹跳。", "到达 5 屏高度，必踩 3/3", {
    ...doodleBaseParams,
    targetHeightScreens: 5,
    hazardDensity: 0.45,
    requiredRiskPlatforms: 3,
    riskJumpMultiplier: 1.6,
    riskPlatformWidth: 88,
    platformGap: 100,
  }),
  level("doodle", 5, "1-5", "必踩高风险平台", "普通", "必踩高风险平台", "必须踩中 5 个中等宽度高风险平台，部分位置更偏且会移动。", "到达 7 屏高度，必踩 5/5", {
    ...doodleBaseParams,
    targetHeightScreens: 7,
    hazardDensity: 0.8,
    movingPlatformRatio: 0,
    movingPlatformSpeed: 0,
    requiredRiskPlatforms: 5,
    riskJumpMultiplier: 1.6,
    riskPlatformWidth: 76,
    platformGap: 104,
  }),
  level("doodle", 6, "1-6", "必踩高风险平台", "困难", "必踩高风险平台", "必须踩中 7 个更窄高风险平台，更多平台移动并带移动障碍压力。", "到达 9 屏高度，必踩 7/7", {
    ...doodleBaseParams,
    targetHeightScreens: 9,
    movingPlatformRatio: 0,
    movingPlatformSpeed: 0,
    hazardDensity: 1.15,
    movingObstacleCount: 0,
    movingHazardSpeed: 0,
    movementPattern: "",
    requiredRiskPlatforms: 7,
    riskJumpMultiplier: 1.6,
    riskPlatformWidth: 64,
    platformGap: 108,
  }),
  level("doodle", 7, "1-7", "移动障碍", "简单", "移动障碍", "少量移动障碍在平台旁缓慢移动，主要练习躲避节奏。", "到达 5 屏高度", {
    ...doodleBaseParams,
    targetHeightScreens: 5,
    hazardDensity: 0.45,
    movingObstacleCount: 5,
    movingHazardSpeed: 24,
    movementPattern: "horizontal",
    platformGap: 100,
  }),
  level("doodle", 8, "1-8", "移动障碍", "普通", "移动障碍", "移动障碍数量增加，部分会穿过常用跳跃路线。", "到达 7 屏高度", {
    ...doodleBaseParams,
    targetHeightScreens: 7,
    hazardDensity: 0.85,
    movingObstacleCount: 9,
    movingHazardSpeed: 34,
    movementPattern: "horizontal|vertical|patrolDiagonal",
    platformGap: 104,
  }),
  level("doodle", 9, "1-9", "移动障碍", "困难", "移动障碍", "较多移动障碍持续压迫连续平台之间的上升路线。", "到达 9 屏高度", {
    ...doodleBaseParams,
    targetHeightScreens: 9,
    hazardDensity: 1.2,
    movingObstacleCount: 13,
    movingHazardSpeed: 44,
    movementPattern: "horizontal|vertical|patrolDiagonal|orbitSmall|pulse|slowCross",
    platformGap: 108,
  }),
  level("doodle", 10, "1-10", "最终关", "最终", "综合最终关", "全移动平台，8 个必踩高风险平台，后段加入更多移动障碍。", "到达 10 屏高度，必踩 8/8", {
    ...doodleBaseParams,
    targetHeightScreens: 10,
    movingPlatformRatio: 1,
    movingPlatformSpeed: 42,
    hazardDensity: 1.3,
    movingObstacleCount: 20,
    movingHazardSpeed: 46,
    movementPattern: "horizontal|vertical|patrolDiagonal|orbitSmall|pulse|slowCross",
    finalObstacleStartScreen: 1,
    requiredRiskPlatforms: 8,
    riskJumpMultiplier: 1.6,
    dangerLineEnabled: false,
    riskPlatformWidth: 68,
    platformGap: 108,
  }),
  baseLevel("doodle", "基础关", "Doodle Jump 基础关", "少量静态平台，无移动障碍，无必踩高风险平台。", "到达 3 屏高度", doodleBaseParams),
];

const flappyLevels: MiniGameLevelConfig[] = [
  level("flappy", 1, "2-1", "移动门", "简单", "移动门", "8 门，30% 移动门，缝隙大，速度慢。", "通过 8 个门", {
    ...flappyBaseParams,
    gateCount: 8,
    movingGateRatio: 0.3,
    gapSize: 190,
    speed: 116,
    movingGateSpeed: 1,
  }),
  level("flappy", 2, "2-2", "移动门", "普通", "移动门", "10 门，50% 移动门，缝隙中等。", "通过 10 个门", {
    ...flappyBaseParams,
    gateCount: 10,
    movingGateRatio: 0.5,
    gapSize: 168,
    speed: 128,
    movingGateSpeed: 1.35,
  }),
  level("flappy", 3, "2-3", "移动门", "困难", "移动门", "12 门，70% 移动门，缝隙略小。", "通过 12 个门", {
    ...flappyBaseParams,
    gateCount: 12,
    movingGateRatio: 0.7,
    gapSize: 152,
    speed: 140,
    movingGateSpeed: 1.7,
  }),
  level("flappy", 4, "2-4", "收集路径道具", "简单", "收集路径道具", "8 门，必须收集 4 个接近安全中心线的道具。", "通过 8 门，收集 4/4", {
    ...flappyBaseParams,
    gateCount: 8,
    collectibleCount: 4,
    gapSize: 190,
    speed: 116,
    collectibleOffset: 0.18,
  }),
  level("flappy", 5, "2-5", "收集路径道具", "普通", "收集路径道具", "10 门，必须收集 6 个略微偏上或偏下的道具。", "通过 10 门，收集 6/6", {
    ...flappyBaseParams,
    gateCount: 10,
    collectibleCount: 6,
    gapSize: 168,
    speed: 128,
    collectibleOffset: 0.28,
  }),
  level("flappy", 6, "2-6", "收集路径道具", "困难", "收集路径道具", "12 门，必须收集 8 个更靠近缝隙边缘的道具。", "通过 12 门，收集 8/8", {
    ...flappyBaseParams,
    gateCount: 12,
    collectibleCount: 8,
    gapSize: 152,
    speed: 138,
    collectibleOffset: 0.36,
  }),
  level("flappy", 7, "2-7", "重力反转 + 反向移动", "简单", "反重力反向", "6 门，角色从右往左移动，不点击向上漂，点击向下压。", "通过 6 个门", {
    ...flappyBaseParams,
    gateCount: 6,
    reversedGravity: true,
    reverseDirection: true,
    gapSize: 196,
    speed: 106,
  }),
  level("flappy", 8, "2-8", "重力反转 + 反向移动", "普通", "反重力反向", "8 门，反向移动速度中等，缝隙中等。", "通过 8 个门", {
    ...flappyBaseParams,
    gateCount: 8,
    reversedGravity: true,
    reverseDirection: true,
    gapSize: 172,
    speed: 122,
  }),
  level("flappy", 9, "2-9", "重力反转 + 反向移动", "困难", "反重力反向", "10 门，少量移动门，反向速度较快。", "通过 10 个门", {
    ...flappyBaseParams,
    gateCount: 10,
    movingGateRatio: 0,
    reversedGravity: true,
    reverseDirection: true,
    gapSize: 154,
    speed: 136,
    movingGateSpeed: 1.2,
  }),
  level("flappy", 10, "2-10", "最终关", "最终", "综合最终关", "反向移动和反重力，13 门，移动门与必收集道具同时出现。", "通过 13 门，收集 7/7", {
    ...flappyBaseParams,
    gateCount: 13,
    movingGateRatio: 0.45,
    collectibleCount: 7,
    reversedGravity: true,
    reverseDirection: true,
    gapSize: 162,
    speed: 132,
    movingGateSpeed: 1.35,
    collectibleOffset: 0.3,
  }),
  baseLevel("flappy", "基础关", "Flappy Bird 基础关", "普通固定门，通过 6 个门即可。", "通过 6 个门", flappyBaseParams),
];

const knifeLevels: MiniGameLevelConfig[] = [
  level("knife", 1, "3-1", "发射倒计时", "简单", "发射倒计时", "7 发，每发 3.0 秒倒计时，初始障碍 1 个。", "命中 7 发", {
    ...knifeBaseParams,
    shotCount: 7,
    shotCountdown: 3,
    initialObstacleCount: 1,
    baseRotationSpeed: 82,
  }),
  level("knife", 2, "3-2", "发射倒计时", "普通", "发射倒计时", "9 发，每发 2.5 秒倒计时，初始障碍 2 个。", "命中 9 发", {
    ...knifeBaseParams,
    shotCount: 9,
    shotCountdown: 2.5,
    initialObstacleCount: 2,
    baseRotationSpeed: 96,
  }),
  level("knife", 3, "3-3", "发射倒计时", "困难", "发射倒计时", "11 发，每发 2.0 秒倒计时，初始障碍 3 个。", "命中 11 发", {
    ...knifeBaseParams,
    shotCount: 11,
    shotCountdown: 2,
    initialObstacleCount: 3,
    baseRotationSpeed: 106,
  }),
  level("knife", 4, "3-4", "转速正弦波动", "简单", "转速正弦波动", "7 发，正弦周期 4.0 秒，速度按 0 到正反最快循环。", "命中 7 发", {
    ...knifeBaseParams,
    shotCount: 7,
    sineRotationEnabled: true,
    phaseDuration: 3,
    sweepPerPhase: 390,
    initialObstacleCount: 1,
    baseRotationSpeed: 138,
  }),
  level("knife", 5, "3-5", "转速正弦波动", "普通", "转速正弦波动", "9 发，正弦周期 3.0 秒，初始障碍 2 个。", "命中 9 发", {
    ...knifeBaseParams,
    shotCount: 9,
    sineRotationEnabled: true,
    phaseDuration: 2.8,
    sweepPerPhase: 405,
    initialObstacleCount: 2,
    baseRotationSpeed: 154,
  }),
  level("knife", 6, "3-6", "转速正弦波动", "困难", "转速正弦波动", "11 发，正弦周期 2.5 秒，初始障碍 3 个。", "命中 11 发", {
    ...knifeBaseParams,
    shotCount: 11,
    sineRotationEnabled: true,
    phaseDuration: 2.55,
    sweepPerPhase: 420,
    initialObstacleCount: 3,
    baseRotationSpeed: 166,
  }),
  level("knife", 7, "3-7", "不可插区域", "简单", "不可插区域", "7 发，1 块不可插区域，总面积约 12%。", "命中 7 发，避开禁区", {
    ...knifeBaseParams,
    shotCount: 7,
    forbiddenZoneCount: 1,
    forbiddenZoneRatio: 0.12,
    initialObstacleCount: 1,
    baseRotationSpeed: 90,
  }),
  level("knife", 8, "3-8", "不可插区域", "普通", "不可插区域", "9 发，2 块不可插区域，总面积约 18%。", "命中 9 发，避开禁区", {
    ...knifeBaseParams,
    shotCount: 9,
    forbiddenZoneCount: 2,
    forbiddenZoneRatio: 0.18,
    initialObstacleCount: 2,
    baseRotationSpeed: 98,
  }),
  level("knife", 9, "3-9", "不可插区域", "困难", "不可插区域", "11 发，3 块不可插区域，总面积约 24%。", "命中 11 发，避开禁区", {
    ...knifeBaseParams,
    shotCount: 11,
    forbiddenZoneCount: 3,
    forbiddenZoneRatio: 0.24,
    initialObstacleCount: 3,
    baseRotationSpeed: 106,
  }),
  level("knife", 10, "3-10", "最终关", "最终", "综合最终关", "13 发，倒计时、正弦转速和不可插区域同时出现。", "命中 13 发，避开禁区和旧刀", {
    ...knifeBaseParams,
    shotCount: 13,
    shotCountdown: 2.3,
    sineRotationEnabled: true,
    phaseDuration: 2.7,
    sweepPerPhase: 405,
    forbiddenZoneCount: 2,
    forbiddenZoneRatio: 0.2,
    initialObstacleCount: 3,
    baseRotationSpeed: 152,
  }),
  baseLevel("knife", "基础关", "Knife Hit 基础关", "普通匀速转盘，发射 6 个，初始障碍 1 个。", "命中 6 发", knifeBaseParams),
];

const squareJumpBaseParams = {
  prototype: "square-jump",
  jumpsRequired: 8,
  platformWidth: 110,
  basePlatformWidthMin: 92,
  basePlatformWidthMax: 124,
  distanceMin: 136,
  distanceMax: 226,
  minJumpDistance: 28,
  maxJumpDistance: 220,
  precomputedJumpAnimation: true,
  powerDistanceMin: 34,
  powerDistanceMax: 220,
  secondPowerDistanceMin: 30,
  secondPowerDistanceMax: 180,
  targetLandingPadding: 9,
  flyAwayLandingCatchDepth: 40,
  keepNextPlatformVisible: true,
  landingKeepsActualX: true,
  useCameraScale: true,
  sweptLandingCollision: false,
  doubleJumpEnabled: false,
  cyclingChargeOnDoubleJump: false,
  currentAnchorRatio: 0.28,
  nextMinRatio: 0.62,
  nextMaxRatio: 0.84,
  movingPlatformCount: 0,
  movingSpeed: 0,
  movingRange: 0,
  timedWindow: null,
  timedFinalWindow: null,
  gravityPattern: "normal",
  gravityChallenge: false,
  finalMix: false,
};

const squareJumpVariantParams = {
  ...squareJumpBaseParams,
  precomputedJumpAnimation: true,
  sweptLandingCollision: false,
};

const squareJumpLevels: MiniGameLevelConfig[] = [
  prototypeLevel("square-jump", "square-jump-base", 0, "基础关", "基础关", "base", "基础", "基础关", "长按蓄力，松手让小方块跳到下一个平台，连续成功 5 次通关。", "连续跳到 5 个平台", squareJumpBaseParams),
  prototypeLevel("square-jump", "square-jump-moving-easy", 1, "1-1", "移动落点", "advanced", "简单", "移动落点", "1 个慢速移动平台，平台较宽，距离变化小。", "预判移动平台并完成 4 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 7,
    platformWidth: 100,
    distanceMin: 142,
    distanceMax: 218,
    movingPlatformCount: 1,
    movingSpeed: 1.35,
    movingRange: 34,
  }),
  prototypeLevel("square-jump", "square-jump-moving-normal", 2, "1-2", "移动落点", "advanced", "普通", "移动落点", "连续 3 个中速移动平台，宽度正常，距离略随机。", "预判移动平台并完成 5 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 8,
    platformWidth: 82,
    distanceMin: 156,
    distanceMax: 218,
    movingPlatformCount: 3,
    movingSpeed: 1.9,
    movingRange: 48,
  }),
  prototypeLevel("square-jump", "square-jump-moving-hard", 3, "1-3", "移动落点", "advanced", "困难", "移动落点", "多个快速窄平台会反向移动，需要提前预判落点。", "预判快速移动平台并完成 6 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 9,
    platformWidth: 68,
    distanceMin: 164,
    distanceMax: 204,
    movingPlatformCount: 9,
    movingStaticEvery: 4,
    movingSpeed: 2.6,
    movingRange: 58,
    reverseMoving: true,
  }),
  prototypeLevel("square-jump", "square-jump-double-easy", 4, "2-1", "二段跳跃", "advanced", "简单", "二段跳跃", "跳起后可在空中再次蓄力，悬停后释放完成二段跳。", "用二段跳完成 4 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 5,
    platformWidth: 96,
    distanceMin: 296,
    distanceMax: 350,
    powerDistanceMax: 220,
    secondPowerDistanceMax: 180,
    doubleJumpEnabled: true,
    cyclingChargeOnDoubleJump: true,
    timedWindow: null,
    timedFinalWindow: null,
  }),
  prototypeLevel("square-jump", "square-jump-double-normal", 5, "2-2", "二段跳跃", "advanced", "普通", "二段跳跃", "平台距离更远，空中二段蓄力会悬停，释放后继续前进。", "用二段跳完成 5 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 6,
    platformWidth: 82,
    distanceMin: 320,
    distanceMax: 385,
    powerDistanceMax: 220,
    secondPowerDistanceMax: 180,
    doubleJumpEnabled: true,
    cyclingChargeOnDoubleJump: true,
    timedWindow: null,
    timedFinalWindow: null,
  }),
  prototypeLevel("square-jump", "square-jump-double-hard", 6, "2-3", "二段跳跃", "advanced", "困难", "二段跳跃", "窄平台和远距离同时出现，需要在空中把握二段蓄力时机。", "用二段跳完成 6 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 7,
    platformWidth: 70,
    distanceMin: 350,
    distanceMax: 415,
    powerDistanceMax: 220,
    secondPowerDistanceMax: 180,
    doubleJumpEnabled: true,
    cyclingChargeOnDoubleJump: true,
    timedWindow: null,
    timedFinalWindow: null,
  }),
  prototypeLevel("square-jump", "square-jump-gravity-easy", 7, "3-1", "重力平台", "advanced", "简单", "重力平台", "只出现正常和变轻平台，变轻后会跳得更远。", "根据重力状态完成 4 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 7,
    platformWidth: 96,
    distanceMin: 132,
    distanceMax: 220,
    gravityPattern: "normal|light|normal|light",
    gravityChallenge: true,
  }),
  prototypeLevel("square-jump", "square-jump-gravity-normal", 8, "3-2", "重力平台", "advanced", "普通", "重力平台", "正常、变轻、加重平台都会出现，需要连续判断当前状态。", "根据三种重力完成 5 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 8,
    platformWidth: 82,
    distanceMin: 138,
    distanceMax: 220,
    gravityPattern: "normal|light|heavy|normal|light",
    gravityChallenge: true,
  }),
  prototypeLevel("square-jump", "square-jump-gravity-hard", 9, "3-3", "重力平台", "advanced", "困难", "重力平台", "反向考验更多：变轻接近平台、加重接远平台，容错更低。", "根据重力反向考验完成 6 次跳跃", {
    ...squareJumpVariantParams,
    jumpsRequired: 12,
    platformWidth: 68,
    distanceMin: 142,
    distanceMax: 214,
    gravityPattern: "light|normal|heavy|light|heavy|normal",
    gravityChallenge: true,
  }),
  prototypeLevel("square-jump", "square-jump-final", 10, "最终关", "方块终跃", "advanced", "最终", "综合最终关", "综合移动落点、二段跳和重力切换平台，一路跳到终点。", "连续跳到终点平台", {
    ...squareJumpVariantParams,
    jumpsRequired: 15,
    platformWidth: 70,
    distanceMin: 330,
    distanceMax: 410,
    movingPlatformCount: 3,
    movingSpeed: 2.1,
    movingRange: 54,
    powerDistanceMax: 220,
    secondPowerDistanceMax: 180,
    doubleJumpEnabled: true,
    cyclingChargeOnDoubleJump: true,
    timedWindow: null,
    timedFinalWindow: null,
    gravityPattern: "normal|normal|light|normal|heavy|light|normal|normal",
    gravityChallenge: true,
    finalMix: true,
    reverseMoving: true,
  }),
].map((level) => ({
  ...level,
  description:
    level.levelId === "square-jump-base"
      ? `长按蓄力，松手让小方块跳到下一个平台，连续成功 ${level.params.jumpsRequired} 次通关。`
      : level.description,
  goalText:
    level.levelId === "square-jump-final"
      ? `连续完成 ${level.params.jumpsRequired} 次跳跃到终点平台`
      : `连续完成 ${level.params.jumpsRequired} 次跳跃`,
}));

const fallDownBaseParams = {
  prototype: "fall-down",
  layersRequired: 10,
  platformWidth: 112,
  platformGapMin: 96,
  platformGapMax: 132,
  playerSpeed: 230,
  topPressureSpeed: 42,
  movingPlatformCount: 0,
  movingSpeed: 0,
  movingRange: 0,
  fragilePlatformCount: 0,
  fragileTime: 0,
  dangerPlatformCount: 0,
  fallingHazardCount: 0,
  fallingHazardSpeed: 132,
  fallingHazardSize: 22,
  ledgePlatformCount: 0,
  finalMix: false,
};

const fallDownLevels: MiniGameLevelConfig[] = [
  prototypeLevel("fall-down", "fall-down-base", 0, "基础关", "一路向下基础关", "base", "基础", "基础关", "左右半屏控制小方块横向移动，落到更低的平台并下降到终点层。", "下降 10 层到终点", fallDownBaseParams),
  prototypeLevel("fall-down", "fall-down-moving-easy", 1, "1-1", "移动层板", "advanced", "简单", "移动层板", "少量移动平台，宽度较大，练习预判下落位置。", "通过慢速移动层板", {
    ...fallDownBaseParams,
    layersRequired: 14,
    platformWidth: 104,
    platformGapMin: 98,
    platformGapMax: 136,
    movingPlatformCount: 7,
    movingSpeed: 0.75,
    movingRange: 52,
    topPressureSpeed: 44,
  }),
  prototypeLevel("fall-down", "fall-down-moving-normal", 2, "1-2", "移动层板", "advanced", "普通", "移动层板", "移动平台数量增加，间距变大，需要提前调整左右位置。", "通过连续移动层板", {
    ...fallDownBaseParams,
    layersRequired: 18,
    platformWidth: 84,
    platformGapMin: 112,
    platformGapMax: 154,
    topPressureSpeed: 54,
    movingPlatformCount: 11,
    movingSpeed: 1,
    movingRange: 68,
    fallingHazardCount: 2,
    fallingHazardSpeed: 132,
    fallingHazardSize: 22,
  }),
  prototypeLevel("fall-down", "fall-down-moving-hard", 3, "1-3", "移动层板", "advanced", "困难", "移动层板", "连续移动窄平台，部分方向相反，顶部压线更快。", "通过高压移动层板", {
    ...fallDownBaseParams,
    layersRequired: 22,
    platformWidth: 68,
    platformGapMin: 124,
    platformGapMax: 172,
    topPressureSpeed: 66,
    movingPlatformCount: 16,
    movingSpeed: 1.35,
    movingRange: 88,
    fallingHazardCount: 2,
    fallingHazardSpeed: 158,
    fallingHazardSize: 23,
    ledgePlatformCount: 5,
    reverseMoving: true,
  }),
  prototypeLevel("fall-down", "fall-down-fragile-easy", 4, "2-1", "脆弱层板", "advanced", "简单", "脆弱层板", "少量脆弱平台，踩上后约 1.8 秒碎裂。", "避开碎裂压力下降", {
    ...fallDownBaseParams,
    layersRequired: 14,
    platformWidth: 104,
    topPressureSpeed: 44,
    fragilePlatformCount: 7,
    fragileTime: 1.8,
  }),
  prototypeLevel("fall-down", "fall-down-fragile-normal", 5, "2-2", "脆弱层板", "advanced", "普通", "脆弱层板", "脆弱平台数量增加，碎裂时间更短，不能停留太久。", "连续通过脆弱层板", {
    ...fallDownBaseParams,
    layersRequired: 18,
    platformWidth: 84,
    platformGapMin: 110,
    platformGapMax: 152,
    topPressureSpeed: 54,
    fragilePlatformCount: 11,
    fragileTime: 1.35,
    fallingHazardCount: 2,
    fallingHazardSpeed: 132,
    fallingHazardSize: 22,
  }),
  prototypeLevel("fall-down", "fall-down-fragile-hard", 6, "2-3", "脆弱层板", "advanced", "困难", "脆弱层板", "连续脆弱窄平台，最后几层几乎不能停留。", "在碎裂前连续下降", {
    ...fallDownBaseParams,
    layersRequired: 22,
    platformWidth: 66,
    platformGapMin: 124,
    platformGapMax: 172,
    topPressureSpeed: 68,
    fragilePlatformCount: 16,
    fragileTime: 0.95,
    fallingHazardCount: 2,
    fallingHazardSpeed: 160,
    fallingHazardSize: 23,
    ledgePlatformCount: 5,
  }),
  prototypeLevel("fall-down", "fall-down-danger-easy", 7, "3-1", "危险层板", "advanced", "简单", "危险层板", "少量红色危险平台，安全路线明显。", "避开危险平台下降", {
    ...fallDownBaseParams,
    layersRequired: 14,
    platformWidth: 104,
    topPressureSpeed: 46,
    dangerPlatformCount: 5,
  }),
  prototypeLevel("fall-down", "fall-down-danger-normal", 8, "3-2", "危险层板", "advanced", "普通", "危险层板", "危险平台数量增加，部分安全平台更窄。", "选择安全层板下降", {
    ...fallDownBaseParams,
    layersRequired: 18,
    platformWidth: 82,
    platformGapMin: 112,
    platformGapMax: 156,
    topPressureSpeed: 58,
    dangerPlatformCount: 8,
    fallingHazardCount: 2,
    fallingHazardSpeed: 146,
    fallingHazardSize: 22,
  }),
  prototypeLevel("fall-down", "fall-down-danger-hard", 9, "3-3", "危险层板", "advanced", "困难", "危险层板", "危险平台和窄安全平台交错，需要连续选择路线。", "连续避开危险层板", {
    ...fallDownBaseParams,
    layersRequired: 22,
    platformWidth: 66,
    platformGapMin: 124,
    platformGapMax: 174,
    topPressureSpeed: 72,
    dangerPlatformCount: 11,
    fallingHazardCount: 2,
    fallingHazardSpeed: 180,
    fallingHazardSize: 24,
    ledgePlatformCount: 5,
  }),
  prototypeLevel("fall-down", "fall-down-final", 10, "最终关", "百层试炼", "advanced", "最终", "综合最终关", "综合移动、脆弱和危险层板，下降到终点平台。", "完成百层试炼", {
    ...fallDownBaseParams,
    layersRequired: 30,
    platformWidth: 72,
    platformGapMin: 118,
    platformGapMax: 170,
    topPressureSpeed: 74,
    movingPlatformCount: 12,
    movingSpeed: 1.15,
    movingRange: 86,
    fragilePlatformCount: 10,
    fragileTime: 1,
    dangerPlatformCount: 10,
    fallingHazardCount: 4,
    fallingHazardSpeed: 178,
    fallingHazardSize: 24,
    ledgePlatformCount: 8,
    finalMix: true,
    reverseMoving: true,
  }),
];

export const MINI_GAME_PROTOTYPES: MiniGameDefinition[] = [
  {
    id: "doodle",
    title: "Doodle Jump 型",
    shortTitle: "Doodle",
    summary: "左右拖动，踩平台上升",
    instruction: "左右拖动控制角色，踩一次性平台向上，到达目标高度通关。",
    levels: doodleLevels,
  },
  {
    id: "flappy",
    title: "Flappy Bird 型",
    shortTitle: "Flappy",
    summary: "点击控制高度，穿过障碍",
    instruction: "点击屏幕调整高度，穿过门，收集关卡要求的道具。",
    levels: flappyLevels,
  },
  {
    id: "knife",
    title: "Knife Hit 型",
    shortTitle: "Knife",
    summary: "点击发射，命中转盘",
    instruction: "点击发射，避开已插入物体和不可插区域，发射完指定数量通关。",
    levels: knifeLevels,
  },
  {
    id: "square-jump",
    title: "方块跃迁",
    shortTitle: "方块跃迁",
    summary: "长按蓄力，松手跳到平台",
    instruction: "长按屏幕蓄力，松手让小方块向右跳跃。根据移动、限时和重力平台调整节奏。",
    levels: squareJumpLevels,
  },
  {
    id: "fall-down",
    title: "一路向下",
    shortTitle: "一路向下",
    summary: "横向移动，落到下方平台",
    instruction: "左右半屏控制小方块横向移动，持续落到更低的平台，避开危险层板和顶部压线。",
    levels: fallDownLevels,
  },
];

export function getMiniGame(gameId: MiniGameId): MiniGameDefinition {
  const game = MINI_GAME_PROTOTYPES.find((item) => item.id === gameId);
  if (!game) throw new Error(`Unknown mini game: ${gameId}`);
  return game;
}

export function getMiniGameLevels(gameId: MiniGameId): MiniGameLevelConfig[] {
  return getMiniGame(gameId).levels;
}

export function getMiniGameLevel(gameId: MiniGameId, levelId: string): MiniGameLevelConfig {
  const levelConfig = getMiniGameLevels(gameId).find((item) => item.levelId === levelId);
  if (!levelConfig) throw new Error(`Unknown mini game level: ${gameId}/${levelId}`);
  return levelConfig;
}
