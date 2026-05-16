"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  BASE_FAILURE_LIMIT,
  DEBUG_MINI_GAME_FPS,
  MINI_GAME_TIMER_SYNC_MS,
  MINI_GAME_UI_SYNC_MS,
  MiniGameFpsBadge,
  MiniGamePerfPanel,
  PLAYER_SIZE,
  PrototypeEndOverlay,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  booleanParam,
  clamp,
  numberParam,
  stagePointStyle,
  transformPoint3d,
  useMiniGameFpsCounter,
  useMiniGameLowPowerMode,
  useMiniGamePerfMonitor,
  type MiniGameCompletion,
  type MiniGameRunMode,
  type PrototypeStatus,
} from "@/features/mini-games/common";

import {
  advanceFallDownCamera,
  createSquareJumpBaseAdvancePlan,
  createSquareJumpBaseJumpPlan,
  createSeededRandom,
  expireFallDownFragilePlatform,
  fitSquareJumpBaseCamera,
  generateSquareJumpPlatformSequence,
  getSquareJumpBasePlatformHeight,
  getSquareJumpBasePlatformX,
  getSquareJumpBasePlayerXOnPlatform,
  generateDoodleWorldLayout,
  generateFlappyGateLayout,
  generateKnifeForbiddenZones,
  generateKnifeInitialAngles,
  getFlappyGateScreenX,
  getKnifeShotGeometry,
  getMiniGameLevel,
  getLocalHitAngle,
  getSquareJumpChargeAt,
  getSineAngularVelocity,
  normalizeDegrees,
  resolveFallDownCameraBounds,
  resolveSquareJumpActiveGravity,
  resolveSquareJumpBaseFlyAwayLanding,
  resolveKnifeShotOutcome,
  sampleSquareJumpBaseAdvanceCamera,
  sampleSquareJumpBaseFlyAway,
  sampleSquareJumpBaseJump,
  sampleSquareJumpBaseRiseIn,
  shouldSquareJumpDeferLandingResolution,
  selectSquareJumpVisiblePlatforms,
  selectVisibleDoodleHazards,
  selectVisibleDoodlePlatforms,
  selectVisibleFlappyGates,
  type AngleArc,
  type GeneratedDoodleHazard,
  type GeneratedDoodlePlatform,
  type GeneratedFlappyGate,
  type MiniGameId,
  type MiniGameLevelConfig,
  type MiniGameParams,
  type SquareJumpBaseAdvancePlan,
  type SquareJumpBaseJumpPlan,
  type SquareJumpBasePlatform,
} from "@/lib/mini-game-prototypes";

export type { MiniGameCompletion } from "@/features/mini-games/common";

const FLAPPY_GATE_WIDTH = 54;
const FLAPPY_START_PLATFORM_Y = STAGE_HEIGHT * 0.66;
const FLAPPY_START_PLATFORM_HEIGHT = 12;
const KNIFE_WHEEL_SIZE = 190;
const KNIFE_INSERT_RADIUS = 74;
const KNIFE_DISC_CENTER = { x: STAGE_WIDTH / 2, y: 82 + KNIFE_WHEEL_SIZE / 2 };
const KNIFE_FIRE_POINT = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT - 92 };
const KNIFE_SHOT_GEOMETRY = getKnifeShotGeometry(KNIFE_FIRE_POINT, KNIFE_DISC_CENTER, KNIFE_WHEEL_SIZE / 2);
const KNIFE_FIRE_ANGLE = KNIFE_SHOT_GEOMETRY.impactAngle;
const KNIFE_COLLISION_DEGREES = 8;
const KNIFE_FLIGHT_MS = 95;
const DOODLE_PLAYER_SPEED = 315;
const DEBUG_MINI_GAME_HITBOX = false;

type DoodlePlatform = GeneratedDoodlePlatform & { used?: boolean };
type DoodleHazard = GeneratedDoodleHazard;

type DoodleFrame = {
  started: boolean;
  time: number;
  playerX: number;
  playerY: number;
  playerVy: number;
  cameraY: number;
  platforms: DoodlePlatform[];
  hazards: DoodleHazard[];
  riskHit: number;
  playerTurns: number;
  failures: number;
  invincibleUntil: number;
  status: PrototypeStatus;
  reason: string;
};

type DoodleViewFrame = {
  cameraY: number;
  failures: number;
  invincibleUntil: number;
  playerTurns: number;
  playerX: number;
  playerY: number;
  progressPercent: number;
  reason: string;
  riskHit: number;
  started: boolean;
  status: PrototypeStatus;
  time: number;
  visibleHazards: DoodleHazard[];
  visiblePlatforms: DoodlePlatform[];
};

type FlappyGate = GeneratedFlappyGate;

type FlappyBackgroundRef = {
  id: number;
  x: number;
  y: number;
  kind: string;
};

type FlappyFrame = {
  started: boolean;
  time: number;
  progress: number;
  playerY: number;
  playerVy: number;
  gates: FlappyGate[];
  passed: number;
  collected: number;
  playerTurns: number;
  failures: number;
  invincibleUntil: number;
  status: PrototypeStatus;
  reason: string;
};

type FlappyViewFrame = {
  collected: number;
  failures: number;
  invincibleUntil: number;
  passed: number;
  playerTurns: number;
  playerY: number;
  progress: number;
  reason: string;
  started: boolean;
  status: PrototypeStatus;
  time: number;
  visibleGates: FlappyGate[];
};

type KnifeForbiddenZone = {
  id: number;
  localStart: number;
  localEnd: number;
};

type KnifeFrame = {
  time: number;
  rotation: number;
  insertedAngles: number[];
  initialAngles: number[];
  failedAngles: number[];
  failedAngle: number | null;
  shotIndex: number;
  failures: number;
  timer: number | null;
  flying: boolean;
  launcherReadyAt: number;
  status: PrototypeStatus;
  reason: string;
};

type KnifeViewFrame = KnifeFrame & {
  launcherVisible: boolean;
};

export function MiniGameEmbeddedStage({
  gameId,
  levelId,
  mode = "prototype",
  onBackToSelect = () => undefined,
  onComplete,
  onRestart = () => undefined,
  runSeed,
}: {
  gameId: MiniGameId;
  levelId: string;
  mode?: MiniGameRunMode;
  onBackToSelect?: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart?: () => void;
  runSeed: string;
}) {
  const level = getMiniGameLevel(gameId, levelId);
  const stageKey = `${gameId}-${levelId}-${runSeed}`;
  if (gameId === "doodle") {
    return <DoodleJumpPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  if (gameId === "flappy") {
    return <FlappyPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  if (gameId === "square-jump") {
    return <SquareJumpPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  if (gameId === "fall-down") {
    return <FallDownPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  return <KnifeHitPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
}

type FallDownPlatformKind = "normal" | "moving" | "fragile" | "danger" | "finish";
type FallDownPlatformShape = "flat" | "l-left" | "l-right";
type FallDownPlatform = {
  id: number;
  x: number;
  y: number;
  width: number;
  kind: FallDownPlatformKind;
  shape: FallDownPlatformShape;
  range: number;
  speed: number;
  phase: number;
  steppedAt: number | null;
  broken: boolean;
};
type FallDownFallingHazard = {
  id: number;
  x: number;
  delay: number;
  drift: number;
  phase: number;
  size: number;
  speed: number;
};
type FallDownRuntime = {
  started: boolean;
  time: number;
  cameraY: number;
  pressureWorldY: number;
  playerX: number;
  playerY: number;
  vx: number;
  vy: number;
  inputDirection: -1 | 0 | 1;
  layersReached: number;
  currentPlatformId: number;
  failures: number;
  respawnUntil: number;
  status: PrototypeStatus;
  reason: string;
  platforms: FallDownPlatform[];
  fallingHazards: FallDownFallingHazard[];
};

type SquareJumpBaseCamera = ReturnType<typeof fitSquareJumpBaseCamera>;
type SquareGravityState = NonNullable<SquareJumpBasePlatform["gravity"]>;

const SQUARE_BASE_STAGE_BOTTOM = 640;
const SQUARE_BASE_MAX_HOLD_MS = 900;

function squareGravityMultiplier(gravity: SquareGravityState) {
  if (gravity === "light") return 1.55;
  if (gravity === "heavy") return 0.58;
  return 1;
}

function squareGravityLabel(gravity: SquareGravityState) {
  if (gravity === "light") return "变轻";
  if (gravity === "heavy") return "加重";
  return "正常";
}

function squareGravityMark(gravity: SquareGravityState) {
  if (gravity === "light") return "↑";
  if (gravity === "heavy") return "↓";
  return "•";
}

function squarePlatformMark(platform: SquareJumpBasePlatform): string | null {
  if (platform.gravity === "light") return squareGravityMark("light");
  if (platform.gravity === "heavy") return squareGravityMark("heavy");
  return null;
}

function fitSquareBaseCamera(currentPlatform: SquareJumpBasePlatform, nextPlatform: SquareJumpBasePlatform, playerX: number) {
  return fitSquareJumpBaseCamera({
    currentPlatform,
    nextPlatform,
    playerX,
    stageBottom: SQUARE_BASE_STAGE_BOTTOM,
    stageHeight: STAGE_HEIGHT,
    stageWidth: STAGE_WIDTH,
  });
}

function squareBaseWorldTransform(camera: SquareJumpBaseCamera) {
  return `translate3d(${STAGE_WIDTH / 2}px, ${STAGE_HEIGHT / 2}px, 0) scale(${camera.scale}) translate3d(${-camera.cameraX}px, ${-camera.cameraY}px, 0)`;
}

function squareProgressBackgroundStyle(camera: SquareJumpBaseCamera): CSSProperties {
  const parallaxX = -camera.cameraX;
  return {
    backgroundPosition: `${parallaxX * 0.06}px 0, ${parallaxX * 0.14}px 0, ${parallaxX * 0.22}px 0`,
    willChange: "background-position",
  };
}

type SquareJumpUnifiedState = "idle" | "charging" | "jumping" | "airCharging" | "falling" | "advancing" | "success" | "failed";
type SquareJumpUnifiedRuntime = {
  started: boolean;
  time: number;
  jumps: number;
  failures: number;
  charge: number;
  chargeElapsedMs: number;
  state: SquareJumpUnifiedState;
  activeGravity: SquareGravityState;
  currentIndex: number;
  nextIndex: number;
  platforms: SquareJumpBasePlatform[];
  currentPlatform: SquareJumpBasePlatform;
  nextPlatform: SquareJumpBasePlatform;
  camera: SquareJumpBaseCamera;
  playerX: number;
  playerY: number;
  playerOffsetOnCurrent: number;
  playerTurns: number;
  doubleJumpUsed: boolean;
  jumpPlan: SquareJumpBaseJumpPlan | null;
  jumpStartedAt: number;
  advancePlan: SquareJumpBaseAdvancePlan | null;
  advanceStartedAt: number;
  exitingPlatform: SquareJumpBasePlatform | null;
  exitingVisualOffsetY: number;
  nextVisualOffsetY: number;
  feedback: "Good" | "提醒" | "";
  feedbackUntil: number;
  respawnUntil: number;
  timer: number | null;
  status: PrototypeStatus;
  reason: string;
};

const SQUARE_JUMP_PLATFORM_Y = STAGE_HEIGHT * 0.72;
const SQUARE_JUMP_ADVANCE_DELAY = 0.16;

function createSquareJumpPlan(level: MiniGameLevelConfig, runtime: SquareJumpUnifiedRuntime) {
  const gravity = runtime.activeGravity;
  const isSecondJump = runtime.state === "airCharging";
  const minDistanceKey = isSecondJump ? "secondPowerDistanceMin" : "powerDistanceMin";
  const maxDistanceKey = isSecondJump ? "secondPowerDistanceMax" : "powerDistanceMax";
  const minJumpDistance = numberParam(level.params, minDistanceKey, numberParam(level.params, "minJumpDistance", 28)) * squareGravityMultiplier(gravity);
  const maxJumpDistance = numberParam(level.params, maxDistanceKey, numberParam(level.params, "maxJumpDistance", 360)) * squareGravityMultiplier(gravity);
  const targetLandingPadding = numberParam(level.params, "targetLandingPadding", 12);
  const playerY = runtime.state === "airCharging" ? runtime.playerY : undefined;
  const platformAtRelease = (platform: SquareJumpBasePlatform) => ({
    ...platform,
    x: getSquareJumpBasePlatformX(platform, runtime.time),
  });
  const firstPlan = createSquareJumpBaseJumpPlan({
    currentPlatform: platformAtRelease(runtime.currentPlatform),
    holdMs: runtime.charge * SQUARE_BASE_MAX_HOLD_MS,
    maxHoldMs: SQUARE_BASE_MAX_HOLD_MS,
    maxJumpDistance,
    minJumpDistance,
    nextPlatform: platformAtRelease(runtime.nextPlatform),
    playerX: runtime.playerX,
    playerY,
    squareSize: PLAYER_SIZE,
    targetLandingPadding,
  });
  const landingTime = runtime.time + firstPlan.durationMs / 1000;
  const platformAtLanding = (platform: SquareJumpBasePlatform) => ({
    ...platform,
    x: getSquareJumpBasePlatformX(platform, landingTime),
  });
  return createSquareJumpBaseJumpPlan({
    currentPlatform: platformAtLanding(runtime.currentPlatform),
    holdMs: runtime.charge * SQUARE_BASE_MAX_HOLD_MS,
    maxHoldMs: SQUARE_BASE_MAX_HOLD_MS,
    maxJumpDistance,
    minJumpDistance,
    nextPlatform: platformAtLanding(runtime.nextPlatform),
    playerX: runtime.playerX,
    playerY,
    squareSize: PLAYER_SIZE,
    targetLandingPadding,
  });
}

function createSquareJumpUnifiedRuntime(level: MiniGameLevelConfig, runSeed: string): SquareJumpUnifiedRuntime {
  const platforms = generateSquareJumpPlatformSequence(level, runSeed, {
    count: numberParam(level.params, "jumpsRequired", 5) + 1,
    platformY: SQUARE_JUMP_PLATFORM_Y,
    startX: 120,
    startWidth: 128,
  });
  const currentPlatform = platforms[0];
  const nextPlatform = platforms[1];
  return {
    activeGravity: "normal",
    advancePlan: null,
    advanceStartedAt: 0,
    camera: fitSquareBaseCamera(currentPlatform, nextPlatform, currentPlatform.x),
    charge: 0,
    chargeElapsedMs: 0,
    currentIndex: 0,
    currentPlatform,
    doubleJumpUsed: false,
    exitingPlatform: null,
    exitingVisualOffsetY: 0,
    feedback: "",
    feedbackUntil: 0,
    failures: 0,
    jumpPlan: null,
    jumpStartedAt: 0,
    jumps: 0,
    nextIndex: 1,
    nextPlatform,
    nextVisualOffsetY: 0,
    platforms,
    playerOffsetOnCurrent: 0,
    playerTurns: 0,
    playerX: currentPlatform.x,
    playerY: currentPlatform.y - PLAYER_SIZE / 2,
    reason: "",
    respawnUntil: 0,
    started: false,
    state: "idle",
    status: "playing",
    timer: null,
    time: 0,
  };
}

function makeSquareJumpUnifiedView(runtime: SquareJumpUnifiedRuntime): SquareJumpUnifiedRuntime {
  return {
    ...runtime,
    advancePlan: runtime.advancePlan ? { ...runtime.advancePlan } : null,
    camera: { ...runtime.camera },
    currentPlatform: { ...runtime.currentPlatform },
    exitingPlatform: runtime.exitingPlatform ? { ...runtime.exitingPlatform } : null,
    jumpPlan: runtime.jumpPlan ? { ...runtime.jumpPlan } : null,
    nextPlatform: { ...runtime.nextPlatform },
    platforms: runtime.platforms.map((platform) => ({ ...platform })),
  };
}

function updateSquareJumpAdvanceAnimation(current: SquareJumpUnifiedRuntime) {
  if (!current.advancePlan) return;
  const advanceProgress = clamp((current.time - current.advanceStartedAt) / (current.advancePlan.durationMs / 1000), 0, 1);
  const riseProgress = clamp((current.time - current.advanceStartedAt) / (current.advancePlan.riseDurationMs / 1000), 0, 1);
  current.camera = sampleSquareJumpBaseAdvanceCamera(current.advancePlan, advanceProgress);
  current.nextVisualOffsetY = sampleSquareJumpBaseRiseIn(current.advancePlan, riseProgress);
  current.exitingVisualOffsetY = current.advancePlan.nextPlatformStartVisualOffsetY * 2.1 * (1 - sampleSquareJumpBaseRiseIn(current.advancePlan, riseProgress) / current.advancePlan.nextPlatformStartVisualOffsetY);

  if (advanceProgress >= 1 && riseProgress >= 1) {
    current.camera = { ...current.advancePlan.cameraEnd };
    current.nextVisualOffsetY = 0;
    current.exitingPlatform = null;
    current.exitingVisualOffsetY = 0;
    current.advancePlan = null;
    if (current.state === "advancing") current.state = "idle";
  }
}

function recoverSquareJumpBaseMiss(current: SquareJumpUnifiedRuntime, reason: string) {
  const failures = current.failures + 1;
  current.failures = failures;
  current.reason = reason;
  current.advancePlan = null;
  current.jumpPlan = null;
  current.charge = 0;
  current.chargeElapsedMs = 0;
  current.doubleJumpUsed = false;

  if (failures >= BASE_FAILURE_LIMIT) {
    current.reason = "失败达到 3 次，进入下一关";
    current.state = "failed";
    current.status = "failed";
    return true;
  }

  const nextJumps = current.jumps + 1;
  const requiredJumps = current.platforms.length - 1;
  const leavingPlatform = { ...current.currentPlatform };
  const landedPlatform = { ...current.nextPlatform };
  const landedPlatformX = getSquareJumpBasePlatformX(landedPlatform, current.time);
  current.feedback = "提醒";
  current.feedbackUntil = current.time + 0.75;
  current.respawnUntil = current.time + 1.1;
  current.jumps = nextJumps;
  current.playerX = getSquareJumpBasePlatformX(landedPlatform, current.time);
  current.playerY = landedPlatform.y - PLAYER_SIZE / 2;
  current.playerOffsetOnCurrent = current.playerX - landedPlatformX;
  current.currentIndex = current.nextIndex;
  current.currentPlatform = landedPlatform;
  current.activeGravity = resolveSquareJumpActiveGravity(current.activeGravity, landedPlatform.gravity);

  if (nextJumps >= requiredJumps) {
    current.reason = `到达终点平台，失误 ${failures} 次`;
    current.state = "success";
    current.status = "passed";
    return true;
  }

  const cameraStart = { ...current.camera };
  const futureIndex = current.nextIndex + 1;
  const futurePlatform = current.platforms[futureIndex] ?? current.platforms[current.platforms.length - 1];
  const cameraEnd = fitSquareBaseCamera(landedPlatform, futurePlatform, current.playerX);
  current.nextIndex = futureIndex;
  current.nextPlatform = futurePlatform;
  current.timer = null;
  current.exitingPlatform = leavingPlatform;
  current.exitingVisualOffsetY = 0;
  current.advancePlan = createSquareJumpBaseAdvancePlan({
    cameraEnd,
    cameraStart,
    stageHeight: STAGE_HEIGHT,
  });
  current.advanceStartedAt = current.time + SQUARE_JUMP_ADVANCE_DELAY;
  current.nextVisualOffsetY = current.advancePlan.nextPlatformStartVisualOffsetY;
  current.state = "advancing";
  current.status = "playing";
  return true;
}

function SquareJumpPrototype({
  level,
  mode,
  runSeed,
  onBackToSelect,
  onComplete,
  onRestart,
}: {
  level: MiniGameLevelConfig;
  mode: MiniGameRunMode;
  runSeed: string;
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart: () => void;
}) {
  const requiredJumps = numberParam(level.params, "jumpsRequired", 5);
  const doubleJumpEnabled = booleanParam(level.params, "doubleJumpEnabled");
  const cyclingCharge = doubleJumpEnabled && booleanParam(level.params, "cyclingChargeOnDoubleJump");
  const flyAwayLandingCatchDepth = numberParam(level.params, "flyAwayLandingCatchDepth", PLAYER_SIZE * 1.25);
  const targetLandingPadding = numberParam(level.params, "targetLandingPadding", 12);
  const initialRuntime = useMemo(() => createSquareJumpUnifiedRuntime(level, runSeed), [level, runSeed]);
  const runtimeRef = useRef<SquareJumpUnifiedRuntime>(initialRuntime);
  const worldLayerRef = useRef<HTMLDivElement | null>(null);
  const progressBackgroundRef = useRef<HTMLDivElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const tutorialPreviewRef = useRef<HTMLDivElement | null>(null);
  const squarePlatformRefs = useRef(new Map<string, HTMLDivElement>());
  const lastUiSyncRef = useRef(0);
  const completedRef = useRef(false);
  const { fps, recordFrame: recordDebugFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const perf = useMiniGamePerfMonitor("Square Jump");
  const { enabled: perfEnabled, recordFrame: recordPerfFrame, recordReactSync } = perf;
  const [view, setView] = useState<SquareJumpUnifiedRuntime>(() => makeSquareJumpUnifiedView(initialRuntime));

  const syncView = useCallback((time = performance.now()) => {
    lastUiSyncRef.current = time;
    recordReactSync();
    setView(makeSquareJumpUnifiedView(runtimeRef.current));
  }, [recordReactSync]);

  const updateSquareJumpDom = useCallback(
    (current: SquareJumpUnifiedRuntime) => {
      if (progressBackgroundRef.current) {
        const backgroundStyle = squareProgressBackgroundStyle(current.camera);
        progressBackgroundRef.current.style.backgroundPosition = String(backgroundStyle.backgroundPosition ?? "");
      }
      if (worldLayerRef.current) {
        worldLayerRef.current.style.transform = squareBaseWorldTransform(current.camera);
      }

      const visiblePlatforms = selectSquareJumpVisiblePlatforms(current.currentPlatform, current.nextPlatform, current.exitingPlatform);
      const visibleIds = new Set(visiblePlatforms.map((platform) => platform.id));
      for (const [id, node] of squarePlatformRefs.current) {
        if (!visibleIds.has(id)) node.style.display = "none";
      }
      for (const platform of visiblePlatforms) {
        const node = squarePlatformRefs.current.get(platform.id);
        if (!node) continue;
        const isCurrent = platform.id === current.currentPlatform.id;
        const isNext = platform.id === current.nextPlatform.id && !isCurrent;
        const isExiting = current.exitingPlatform?.id === platform.id;
        const visualOffsetY = isNext ? current.nextVisualOffsetY : isExiting ? current.exitingVisualOffsetY : 0;
        const platformX = getSquareJumpBasePlatformX(platform, current.time);
        const platformHeight = getSquareJumpBasePlatformHeight({
          camera: current.camera,
          platformY: platform.y + visualOffsetY,
          stageBottom: SQUARE_BASE_STAGE_BOTTOM,
          stageHeight: STAGE_HEIGHT,
        });
        node.style.display = "";
        node.style.transform = transformPoint3d(platformX - platform.width / 2, platform.y + visualOffsetY);
        node.style.height = `${platformHeight}px`;
        node.style.width = `${platform.width}px`;
      }

      if (playerShellRef.current) {
        playerShellRef.current.style.transform = transformPoint3d(current.playerX - PLAYER_SIZE / 2, current.playerY - PLAYER_SIZE / 2);
      }
      if (playerBoxRef.current) {
        const isRuntimeCharging = current.state === "charging" || current.state === "airCharging";
        const scaleX = isRuntimeCharging ? 1 + current.charge * 0.18 : 1;
        const scaleY = isRuntimeCharging ? 1 - current.charge * 0.24 : 1;
        const offsetY = isRuntimeCharging ? (PLAYER_SIZE * current.charge * 0.24) / 2 : 0;
        playerBoxRef.current.style.transform = `translateY(${offsetY}px) scaleX(${scaleX}) scaleY(${scaleY}) rotate(${current.playerTurns * 90}deg)`;
      }
      if (tutorialPreviewRef.current) {
        const previewPlan = level.levelId === "square-jump-base" && current.jumps < 3 && current.state === "charging" ? createSquareJumpPlan(level, current) : null;
        if (previewPlan) {
          tutorialPreviewRef.current.style.display = "";
          tutorialPreviewRef.current.style.transform = transformPoint3d(
            STAGE_WIDTH / 2 + (previewPlan.landingX - current.camera.cameraX) * current.camera.scale - 15,
            STAGE_HEIGHT / 2 + (SQUARE_JUMP_PLATFORM_Y - current.camera.cameraY) * current.camera.scale + 12,
          );
        } else {
          tutorialPreviewRef.current.style.display = "none";
        }
      }
    },
    [level],
  );

  const fail = useCallback(
    (reason: string) => {
      const current = runtimeRef.current;
      current.advancePlan = null;
      current.jumpPlan = null;
      current.reason = reason;
      current.state = "failed";
      current.status = "failed";
      syncView();
    },
    [syncView],
  );

  const advanceToNextPlatform = useCallback(
    (current: SquareJumpUnifiedRuntime) => {
      const nextJumps = current.jumps + 1;
      const leavingPlatform = { ...current.currentPlatform };
      const landedPlatform = { ...current.nextPlatform };
      current.feedback = "Good";
      current.feedbackUntil = current.time + 0.55;
      current.jumps = nextJumps;
      current.playerY = landedPlatform.y - PLAYER_SIZE / 2;
      current.playerOffsetOnCurrent = current.playerX - getSquareJumpBasePlatformX(landedPlatform, current.time);
      current.currentIndex = current.nextIndex;
      current.currentPlatform = landedPlatform;
      current.activeGravity = resolveSquareJumpActiveGravity(current.activeGravity, landedPlatform.gravity);
      current.doubleJumpUsed = false;
      current.jumpPlan = null;

      if (nextJumps >= requiredJumps) {
        current.reason = `连续成功 ${requiredJumps} 次，到达终点平台`;
        current.state = "success";
        current.status = "passed";
        syncView();
        return true;
      }

      const cameraStart = { ...current.camera };
      const futureIndex = current.nextIndex + 1;
      const futurePlatform = current.platforms[futureIndex] ?? current.platforms[current.platforms.length - 1];
      const cameraEnd = fitSquareBaseCamera(landedPlatform, futurePlatform, current.playerX);
      current.nextIndex = futureIndex;
      current.nextPlatform = futurePlatform;
      current.timer = null;
      current.exitingPlatform = leavingPlatform;
      current.exitingVisualOffsetY = 0;
      current.advancePlan = createSquareJumpBaseAdvancePlan({
        cameraEnd,
        cameraStart,
        stageHeight: STAGE_HEIGHT,
      });
      current.advanceStartedAt = current.time + SQUARE_JUMP_ADVANCE_DELAY;
      current.nextVisualOffsetY = current.advancePlan.nextPlatformStartVisualOffsetY;
      current.state = "advancing";
      return false;
    },
    [requiredJumps, syncView],
  );

  const launchChargedJump = useCallback(() => {
    const current = runtimeRef.current;
    if (!current.started || current.status !== "playing" || (current.state !== "charging" && current.state !== "airCharging")) return;
    const wasAirCharging = current.state === "airCharging";
    current.jumpPlan = createSquareJumpPlan(level, current);
    current.jumpStartedAt = current.time;
    current.charge = 0;
    current.chargeElapsedMs = 0;
    current.doubleJumpUsed = wasAirCharging;
    current.playerTurns += 1;
    current.state = "jumping";
    syncView();
  }, [level, syncView]);

  const beginCharge = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const current = runtimeRef.current;
      if (current.status !== "playing") return;
      if (!current.started) {
        current.started = true;
        current.timer = null;
      }
      const canGroundCharge = current.state === "idle" || current.state === "advancing";
      const canAirCharge = doubleJumpEnabled && (current.state === "jumping" || current.state === "falling") && current.jumpPlan !== null && !current.doubleJumpUsed;
      if (!canGroundCharge && !canAirCharge) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the pointer is already gone.
      }
      current.charge = 0;
      current.chargeElapsedMs = 0;
      current.state = canAirCharge ? "airCharging" : "charging";
      syncView();
    },
    [doubleJumpEnabled, syncView],
  );

  const releaseJump = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      launchChargedJump();
    },
    [launchChargedJump],
  );

  const cancelCharge = useCallback(() => {
    const current = runtimeRef.current;
    if (current.status !== "playing" || (current.state !== "charging" && current.state !== "airCharging")) return;
    if (current.state === "airCharging") {
      launchChargedJump();
      return;
    }
    current.charge = 0;
    current.chargeElapsedMs = 0;
    current.state = "idle";
    syncView();
  }, [launchChargedJump, syncView]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const tick = (time: number) => {
      recordDebugFrame(time);
      const updateStartedAt = perfEnabled ? performance.now() : 0;
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;
      const current = runtimeRef.current;
      let eventChanged = false;
      const paintSquareFrame = () => {
        const updateMs = perfEnabled ? performance.now() - updateStartedAt : 0;
        const renderStartedAt = perfEnabled ? performance.now() : 0;
        updateSquareJumpDom(current);
        if (perfEnabled) recordPerfFrame(time, updateMs, performance.now() - renderStartedAt);
      };

      if (current.status === "playing") {
        current.time += delta;
        if (current.feedback && current.time >= current.feedbackUntil) current.feedback = "";
        if (current.state === "idle" || current.state === "charging" || current.state === "advancing") {
          current.playerX = getSquareJumpBasePlayerXOnPlatform({
            offset: current.playerOffsetOnCurrent,
            platform: current.currentPlatform,
            time: current.time,
          });
        }
        if (current.state === "charging" || current.state === "airCharging") {
          current.chargeElapsedMs += delta * 1000;
          current.charge = getSquareJumpChargeAt({
            cycling: current.state === "airCharging" && cyclingCharge,
            elapsedMs: current.chargeElapsedMs,
            maxHoldMs: SQUARE_BASE_MAX_HOLD_MS,
          });
        }
        if (current.advancePlan) updateSquareJumpAdvanceAnimation(current);
        if (current.started && (current.state === "idle" || current.state === "charging") && current.timer !== null) {
          current.timer -= delta;
          if (current.timer <= 0) {
            fail("时间耗尽，平台碎裂");
            return;
          }
        }

        if (current.state === "jumping" && current.jumpPlan) {
          const jumpProgress = (current.time - current.jumpStartedAt) / (current.jumpPlan.durationMs / 1000);
          const point = sampleSquareJumpBaseJump(current.jumpPlan, jumpProgress);
          current.playerX = point.x;
          current.playerY = point.y;

          if (jumpProgress >= 1) {
            current.playerX = current.jumpPlan.jumpEndX;
            current.playerY = current.jumpPlan.jumpEndY;

            if (shouldSquareJumpDeferLandingResolution({
              doubleJumpEnabled,
              doubleJumpUsed: current.doubleJumpUsed,
              result: current.jumpPlan.result,
            })) {
              current.state = "falling";
            } else if (current.jumpPlan.result === "fall") {
              current.state = "falling";
            } else if (current.jumpPlan.result === "stay") {
              current.playerY = current.currentPlatform.y - PLAYER_SIZE / 2;
              current.playerOffsetOnCurrent = current.playerX - getSquareJumpBasePlatformX(current.currentPlatform, current.time);
              current.doubleJumpUsed = false;
              current.jumpPlan = null;
              current.state = "idle";
              eventChanged = true;
            } else {
              eventChanged = true;
              if (advanceToNextPlatform(current)) {
                paintSquareFrame();
                return;
              }
            }
          }
        } else if (current.state === "falling") {
          if (!current.jumpPlan) {
            if (mode === "base" && recoverSquareJumpBaseMiss(current, "掉下去了")) {
              paintSquareFrame();
              syncView(time);
              if (current.status === "playing") frameId = requestAnimationFrame(tick);
              return;
            }
            fail("掉下去了");
            return;
          }
          const jumpProgress = (current.time - current.jumpStartedAt) / (current.jumpPlan.durationMs / 1000);
          const point = sampleSquareJumpBaseFlyAway(current.jumpPlan, jumpProgress);
          current.playerX = point.x;
          current.playerY = point.y;
          const flyAwayLanding = (!doubleJumpEnabled || current.doubleJumpUsed) ? resolveSquareJumpBaseFlyAwayLanding({
            catchDepth: flyAwayLandingCatchDepth,
            plan: current.jumpPlan,
            progress: jumpProgress,
            squareSize: PLAYER_SIZE,
            targetPadding: targetLandingPadding,
            targetPlatform: {
              ...current.nextPlatform,
              x: getSquareJumpBasePlatformX(current.nextPlatform, current.time),
            },
          }) : null;
          if (flyAwayLanding) {
            current.playerY = current.nextPlatform.y - PLAYER_SIZE / 2;
            eventChanged = true;
            if (advanceToNextPlatform(current)) {
              paintSquareFrame();
              return;
            }
          }
          const screenX = STAGE_WIDTH / 2 + (current.playerX - current.camera.cameraX) * current.camera.scale;
          const screenY = STAGE_HEIGHT / 2 + (current.playerY - current.camera.cameraY) * current.camera.scale;
          if (screenX > STAGE_WIDTH + PLAYER_SIZE || screenX < -PLAYER_SIZE * 2 || screenY > STAGE_HEIGHT + PLAYER_SIZE) {
            if (mode === "base" && recoverSquareJumpBaseMiss(current, "掉下去了")) {
              paintSquareFrame();
              syncView(time);
              if (current.status === "playing") frameId = requestAnimationFrame(tick);
              return;
            }
            fail("掉下去了");
            return;
          }
        }
      }

      paintSquareFrame();
      if (current.status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [advanceToNextPlatform, cyclingCharge, doubleJumpEnabled, fail, flyAwayLandingCatchDepth, level, mode, perfEnabled, recordDebugFrame, recordPerfFrame, requiredJumps, syncView, targetLandingPadding, updateSquareJumpDom]);

  useEffect(() => {
    if (!onComplete || completedRef.current || view.status === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    onComplete({
      gameId: "square-jump",
      levelId: level.levelId,
      status: view.status,
      reason: latest.reason,
      elapsedMs: Math.round(latest.time * 1000),
      stats: {
        failures: latest.failures,
        progressPercent: Math.round((latest.jumps / requiredJumps) * 100),
        jumps: latest.jumps,
        requiredJumps,
      },
    });
  }, [level.levelId, onComplete, requiredJumps, view.status]);

  const showOverlay = mode === "prototype";
  const gravity = view.activeGravity;
  const worldLayerStyle: CSSProperties = {
    inset: 0,
    position: "absolute",
    transform: squareBaseWorldTransform(view.camera),
    transformOrigin: "0 0",
    zIndex: 2,
  };
  const platforms = selectSquareJumpVisiblePlatforms(view.currentPlatform, view.nextPlatform, view.exitingPlatform);
  const tutorialPreviewPlan = level.levelId === "square-jump-base" && view.jumps < 3 && view.state === "charging" ? createSquareJumpPlan(level, view) : null;
  const isCharging = view.state === "charging" || view.state === "airCharging";
  const chargingSquash = {
    scaleX: isCharging ? 1 + view.charge * 0.18 : 1,
    scaleY: isCharging ? 1 - view.charge * 0.24 : 1,
    offsetY: isCharging ? (PLAYER_SIZE * view.charge * 0.24) / 2 : 0,
  };

  return (
    <div className="prototype-game-wrap">
      <div className="mini-score">
        <span>进度 {view.jumps}/{requiredJumps}</span>
        <span>重力 {squareGravityLabel(gravity)}</span>
        {mode === "base" ? <span>失败 {Math.min(view.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
        {view.timer !== null ? <span>倒计时 {Math.max(0, view.timer).toFixed(1)}s</span> : null}
      </div>
      <div
        className={`prototype-stage square-jump-stage gravity-${gravity} ${view.status === "failed" ? "failed" : ""}`}
        role="application"
        aria-label="方块跃迁，长按蓄力，松手跳跃"
        onPointerCancel={cancelCharge}
        onPointerDown={beginCharge}
        onPointerLeave={cancelCharge}
        onPointerUp={releaseJump}
      >
        <MiniGameFpsBadge fps={fps} />
        <MiniGamePerfPanel snapshot={perf.snapshot} />
        <div className="square-progress-background" ref={progressBackgroundRef} style={squareProgressBackgroundStyle(view.camera)} aria-hidden="true" />
        <div ref={worldLayerRef} style={worldLayerStyle} aria-hidden="true">
          {platforms.map((platform) => {
            const isCurrent = platform.id === view.currentPlatform.id;
            const isNext = platform.id === view.nextPlatform.id && !isCurrent;
            const isExiting = view.exitingPlatform?.id === platform.id;
            const platformX = getSquareJumpBasePlatformX(platform, view.time);
            const visualOffsetY = isNext ? view.nextVisualOffsetY : isExiting ? view.exitingVisualOffsetY : 0;
            const platformMark = squarePlatformMark(platform);
            const platformHeight = getSquareJumpBasePlatformHeight({
              camera: view.camera,
              platformY: platform.y + visualOffsetY,
              stageBottom: SQUARE_BASE_STAGE_BOTTOM,
              stageHeight: STAGE_HEIGHT,
            });
            return (
              <div
                className={`square-jump-base-platform ${isCurrent ? "current" : ""} ${isNext ? "preview" : ""} ${isExiting ? "exiting" : ""} ${platform.moving ? "moving" : ""} ${platform.timed ? "timed" : ""} gravity-${platform.gravity ?? "normal"} ${platform.finish ? "finish" : ""}`}
                key={platform.id}
                ref={(node) => {
                  if (node) squarePlatformRefs.current.set(platform.id, node);
                  else squarePlatformRefs.current.delete(platform.id);
                }}
                style={{
                  left: "0px",
                  top: "0px",
                  transform: transformPoint3d(platformX - platform.width / 2, platform.y + visualOffsetY),
                  height: `${platformHeight}px`,
                  width: `${platform.width}px`,
                }}
              >
                <div className="square-jump-base-platform-top" />
                <div className="square-jump-base-platform-body" />
                {platformMark ? <span>{platformMark}</span> : null}
              </div>
            );
          })}
          <div
            className={`square-jump-base-player-shell ${view.state === "jumping" ? "jumping" : ""} ${isCharging ? "charging" : ""} ${view.feedback ? "landed" : ""} ${view.time < view.respawnUntil ? "respawn-warning" : ""}`}
            ref={playerShellRef}
            style={{
              left: "0px",
              top: "0px",
              transform: transformPoint3d(view.playerX - PLAYER_SIZE / 2, view.playerY - PLAYER_SIZE / 2),
              width: `${PLAYER_SIZE}px`,
              height: `${PLAYER_SIZE}px`,
            }}
          >
            <div
              className="prototype-player-box square-jump-base-player-visual"
              ref={playerBoxRef}
              style={{ transform: `translateY(${chargingSquash.offsetY}px) scaleX(${chargingSquash.scaleX}) scaleY(${chargingSquash.scaleY}) rotate(${view.playerTurns * 90}deg)` }}
            />
          </div>
          {DEBUG_MINI_GAME_HITBOX ? (
            <>
              {platforms.map((platform) => {
                const isCurrent = platform.id === view.currentPlatform.id;
                const isNext = platform.id === view.nextPlatform.id && !isCurrent;
                const isExiting = view.exitingPlatform?.id === platform.id;
                const visualOffsetY = isNext ? view.nextVisualOffsetY : isExiting ? view.exitingVisualOffsetY : 0;
                return (
                  <div
                    aria-hidden="true"
                    className="square-jump-base-debug-platform-line"
                    key={`debug-platform-${platform.id}`}
                    style={{
                      left: `${getSquareJumpBasePlatformX(platform, view.time) - platform.width / 2}px`,
                      top: `${platform.y + visualOffsetY}px`,
                      width: `${platform.width}px`,
                    }}
                  />
                );
              })}
              <div
                aria-hidden="true"
                className="square-jump-base-debug-player-line"
                style={{
                  left: `${view.playerX - PLAYER_SIZE / 2}px`,
                  top: `${view.playerY + PLAYER_SIZE / 2}px`,
                  width: `${PLAYER_SIZE}px`,
                }}
              />
            </>
          ) : null}
        </div>
        {tutorialPreviewPlan ? (
          <div
            className="square-tutorial-landing-preview"
            ref={tutorialPreviewRef}
            style={{
              transform: transformPoint3d(
                STAGE_WIDTH / 2 + (tutorialPreviewPlan.landingX - view.camera.cameraX) * view.camera.scale - 15,
                STAGE_HEIGHT / 2 + (SQUARE_JUMP_PLATFORM_Y - view.camera.cameraY) * view.camera.scale + 12,
              ),
            }}
            aria-hidden="true"
          />
        ) : null}
        {view.feedback ? <div className="prototype-feedback good">{view.feedback}</div> : null}
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}

const FALL_DOWN_LEDGE_WIDTH = 14;
const FALL_DOWN_LEDGE_HEIGHT = 52;

function makeFallDownNoisePoints(rand: () => number, count: number) {
  return Array.from({ length: Math.max(2, count) }, () => rand());
}

function fallDownSmoothNoise(points: number[], position: number) {
  const left = Math.floor(position);
  const t = position - left;
  const smooth = t * t * (3 - 2 * t);
  const leftIndex = ((left % points.length) + points.length) % points.length;
  const rightIndex = (leftIndex + 1) % points.length;
  return points[leftIndex] * (1 - smooth) + points[rightIndex] * smooth;
}

function constrainFallDownDangerRuns(kinds: FallDownPlatformKind[], rand: () => number) {
  let dangerRun = 0;
  for (let index = 0; index < kinds.length; index += 1) {
    dangerRun = kinds[index] === "danger" ? dangerRun + 1 : 0;
    if (dangerRun >= 3) {
      const swapCandidates = kinds
        .map((kind, candidateIndex) => ({ kind, candidateIndex }))
        .filter((item) => item.candidateIndex > index && item.kind !== "danger");
      const swap = swapCandidates[Math.floor(rand() * swapCandidates.length)];
      if (swap) {
        [kinds[index], kinds[swap.candidateIndex]] = [kinds[swap.candidateIndex], kinds[index]];
      } else {
        kinds[index] = "normal";
      }
      dangerRun = 0;
    }
  }
  return kinds;
}

function fallDownPlatformKindBag(level: MiniGameLevelConfig, layersRequired: number, rand: () => number): FallDownPlatformKind[] {
  const slots = Math.max(0, layersRequired - 1);
  const kindBag: FallDownPlatformKind[] = [];
  const movingCount = numberParam(level.params, "movingPlatformCount", 0);
  const fragileCount = numberParam(level.params, "fragilePlatformCount", 0);
  const dangerCount = numberParam(level.params, "dangerPlatformCount", 0);

  const addKind = (kind: FallDownPlatformKind, count: number) => {
    for (let index = 0; index < count && kindBag.length < slots; index += 1) {
      kindBag.push(kind);
    }
  };

  if (booleanParam(level.params, "finalMix")) {
    addKind("moving", movingCount);
    addKind("fragile", fragileCount);
    addKind("danger", dangerCount);
  } else if (movingCount > 0) {
    addKind("moving", movingCount);
  } else if (fragileCount > 0) {
    addKind("fragile", fragileCount);
  } else if (dangerCount > 0) {
    addKind("danger", dangerCount);
  }

  while (kindBag.length < slots) {
    kindBag.push("normal");
  }

  for (let index = kindBag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [kindBag[index], kindBag[swapIndex]] = [kindBag[swapIndex], kindBag[index]];
  }

  return constrainFallDownDangerRuns(kindBag, rand);
}

function makeFallDownLedgeBag(layersRequired: number, ledgeCount: number, rand: () => number) {
  const slots = Math.max(0, layersRequired - 1);
  const ledges = Array.from({ length: slots }, (_, index) => index < ledgeCount);
  for (let index = ledges.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [ledges[index], ledges[swapIndex]] = [ledges[swapIndex], ledges[index]];
  }
  return ledges;
}

function makeFallDownFallingHazards(level: MiniGameLevelConfig, runSeed: string): FallDownFallingHazard[] {
  const count = numberParam(level.params, "fallingHazardCount", 0);
  if (count <= 0) return [];
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:fall-down-falling-hazards`);
  const baseSpeed = numberParam(level.params, "fallingHazardSpeed", 132);
  const baseSize = numberParam(level.params, "fallingHazardSize", 22);
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: 28 + rand() * (STAGE_WIDTH - 56),
    delay: rand() * (STAGE_HEIGHT + 180),
    drift: 10 + rand() * 22,
    phase: rand() * Math.PI * 2,
    size: baseSize + (rand() - 0.5) * 6,
    speed: baseSpeed * (0.86 + rand() * 0.34),
  }));
}

function fallDownFallingHazardScreenY(hazard: FallDownFallingHazard, time: number) {
  const travel = STAGE_HEIGHT + hazard.size + 120;
  return ((time * hazard.speed + hazard.delay) % travel) - hazard.size - 76;
}

function fallDownFallingHazardX(hazard: FallDownFallingHazard, time: number) {
  return clamp(hazard.x + Math.sin(time * 1.35 + hazard.phase) * hazard.drift, hazard.size / 2 + 8, STAGE_WIDTH - hazard.size / 2 - 8);
}

function fallDownPlatformLandingBounds(platform: FallDownPlatform, platformX: number) {
  return {
    left: platformX - platform.width / 2,
    right: platformX + platform.width / 2,
  };
}

function resolveFallDownLedgeCollision(platform: FallDownPlatform, platformX: number, playerX: number, previousPlayerX: number, playerY: number) {
  if (platform.shape === "flat" || platform.broken) return playerX;
  const isStandingOnPlatform = Math.abs(playerY + PLAYER_SIZE / 2 - platform.y) <= 0.75;
  if (!isStandingOnPlatform) return playerX;
  const wallLeft = platform.shape === "l-left" ? platformX - platform.width / 2 - (FALL_DOWN_LEDGE_WIDTH - 2) : platformX + platform.width / 2 - 2;
  const wallRight = wallLeft + FALL_DOWN_LEDGE_WIDTH;
  const playerLeft = playerX - PLAYER_SIZE / 2;
  const playerRight = playerX + PLAYER_SIZE / 2;
  if (platform.shape === "l-left" && playerX < previousPlayerX && playerLeft <= wallRight) return wallRight + PLAYER_SIZE / 2 + 1;
  if (platform.shape === "l-right" && playerX > previousPlayerX && playerRight >= wallLeft) return wallLeft - PLAYER_SIZE / 2 - 1;
  return playerX;
}

function makeFallDownPlatforms(level: MiniGameLevelConfig, runSeed: string): FallDownPlatform[] {
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:fall-down-platforms`);
  const layersRequired = numberParam(level.params, "layersRequired", 12);
  const baseWidth = numberParam(level.params, "platformWidth", 104);
  const minGap = numberParam(level.params, "platformGapMin", 96);
  const maxGap = numberParam(level.params, "platformGapMax", 132);
  const kindBag = fallDownPlatformKindBag(level, layersRequired, rand);
  const ledgeBag = makeFallDownLedgeBag(layersRequired, numberParam(level.params, "ledgePlatformCount", 0), rand);
  const gapNoisePoints = makeFallDownNoisePoints(rand, layersRequired + 6);
  const xNoisePoints = makeFallDownNoisePoints(rand, layersRequired + 6);
  const widthNoisePoints = makeFallDownNoisePoints(rand, layersRequired + 6);
  const lanePattern = [0.16, 0.84, 0.5];
  const laneOffset = Math.floor(rand() * lanePattern.length);
  let y = 172;
  let previousX = STAGE_WIDTH / 2;
  return Array.from({ length: layersRequired + 1 }, (_, index) => {
    if (index > 0) {
      const gapNoise = fallDownSmoothNoise(gapNoisePoints, index * 0.61);
      y += minGap + (maxGap - minGap) * gapNoise;
    }
    const kind = index === layersRequired ? "finish" : index === 0 ? "normal" : kindBag.splice(Math.floor(rand() * kindBag.length), 1)[0] ?? "normal";
    const widthNoise = fallDownSmoothNoise(widthNoisePoints, index * 0.53);
    const kindWidth = kind === "finish" ? baseWidth + 42 : kind === "danger" ? Math.max(58, baseWidth - 16) : baseWidth;
    const width = clamp(kindWidth + (widthNoise - 0.5) * 18, kind === "danger" ? 58 : 62, STAGE_WIDTH - 58);
    const xNoise = fallDownSmoothNoise(xNoisePoints, index * 0.47);
    const lane = (index + laneOffset) % lanePattern.length;
    const spreadTargetRatio = clamp(lanePattern[lane] + (xNoise - 0.5) * 0.3, 0.1, 0.9);
    const horizontalStep = kind === "moving" ? 226 : kind === "danger" ? 210 : 196;
    const targetX = width / 2 + 14 + spreadTargetRatio * (STAGE_WIDTH - width - 28);
    const x = index === 0 ? STAGE_WIDTH / 2 : clamp(previousX + clamp(targetX - previousX, -horizontalStep, horizontalStep), width / 2 + 14, STAGE_WIDTH - width / 2 - 14);
    const shape = index > 0 && index < layersRequired && (ledgeBag.splice(Math.floor(rand() * ledgeBag.length), 1)[0] ?? false) ? (rand() < 0.5 ? "l-left" : "l-right") : "flat";
    previousX = x;
    const moving = kind === "moving";
    const reverse = booleanParam(level.params, "reverseMoving") && index % 2 === 0 ? -1 : 1;
    return {
      id: index,
      x,
      y,
      width,
      kind,
      shape,
      range: moving ? numberParam(level.params, "movingRange", 0) : 0,
      speed: moving ? numberParam(level.params, "movingSpeed", 0) * reverse : 0,
      phase: rand() * Math.PI * 2,
      steppedAt: null,
      broken: false,
    };
  });
}

function fallPlatformX(platform: FallDownPlatform, time: number) {
  if (platform.kind !== "moving") return platform.x;
  return clamp(platform.x + Math.sin(time * platform.speed + platform.phase) * platform.range, platform.width / 2 + 14, STAGE_WIDTH - platform.width / 2 - 14);
}

function recoverFallDownBaseFailure(current: FallDownRuntime, reason: string) {
  const failures = current.failures + 1;
  current.failures = failures;
  current.reason = reason;
  current.inputDirection = 0;
  current.started = false;
  current.vx = 0;
  current.vy = 0;

  if (failures >= BASE_FAILURE_LIMIT) {
    current.reason = "失败达到 3 次，进入下一关";
    current.status = "failed";
    return false;
  }

  const platformY = current.cameraY + STAGE_HEIGHT * 0.5;
  const platformWidth = 132;
  const platformX = clamp(current.playerX, platformWidth / 2 + 14, STAGE_WIDTH - platformWidth / 2 - 14);
  const respawnPlatform: FallDownPlatform = {
    id: -2000 - failures,
    x: platformX,
    y: platformY,
    width: platformWidth,
    kind: "normal",
    shape: "flat",
    range: 0,
    speed: 0,
    phase: 0,
    steppedAt: null,
    broken: false,
  };
  current.platforms.unshift(respawnPlatform);
  current.currentPlatformId = respawnPlatform.id;
  current.playerX = respawnPlatform.x;
  current.playerY = respawnPlatform.y - PLAYER_SIZE / 2;
  current.respawnUntil = current.time + 1.1;
  current.status = "playing";
  return true;
}

function createFallDownRuntime(level: MiniGameLevelConfig, runSeed: string): FallDownRuntime {
  const platforms = makeFallDownPlatforms(level, runSeed);
  const startPlatform = platforms[0];
  return {
    started: false,
    time: 0,
    cameraY: 0,
    pressureWorldY: -PLAYER_SIZE,
    playerX: startPlatform.x,
    playerY: startPlatform.y - PLAYER_SIZE / 2,
    vx: 0,
    vy: 0,
    inputDirection: 0,
    layersReached: 0,
    currentPlatformId: 0,
    failures: 0,
    respawnUntil: 0,
    status: "playing",
    reason: "",
    platforms,
    fallingHazards: makeFallDownFallingHazards(level, runSeed),
  };
}

function makeFallDownView(runtime: FallDownRuntime): FallDownRuntime {
  return {
    ...runtime,
    platforms: runtime.platforms.map((platform) => ({ ...platform })),
    fallingHazards: runtime.fallingHazards.map((hazard) => ({ ...hazard })),
  };
}

function FallDownPrototype({
  level,
  mode,
  onBackToSelect,
  onComplete,
  onRestart,
  runSeed,
}: {
  level: MiniGameLevelConfig;
  mode: MiniGameRunMode;
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart: () => void;
  runSeed: string;
}) {
  const requiredLayers = numberParam(level.params, "layersRequired", 12);
  const fallDownPlayerSpeed = numberParam(level.params, "playerSpeed", 230);
  const fragileTime = numberParam(level.params, "fragileTime", 1.2);
  const topPressureSpeed = numberParam(level.params, "topPressureSpeed", 18);
  const initialRuntime = useMemo(() => createFallDownRuntime(level, runSeed), [level, runSeed]);
  const runtimeRef = useRef<FallDownRuntime>(initialRuntime);
  const dangerLineRef = useRef<HTMLDivElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const fallPlatformRefs = useRef(new Map<number, HTMLDivElement>());
  const fallHazardRefs = useRef(new Map<number, HTMLDivElement>());
  const fallDownInputDirectionRef = useRef<FallDownRuntime["inputDirection"]>(0);
  const fallDownPointerIdRef = useRef<number | null>(null);
  const lastUiSyncRef = useRef(0);
  const completedRef = useRef(false);
  const { fps, recordFrame: recordDebugFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const perf = useMiniGamePerfMonitor("Fall Down");
  const { enabled: perfEnabled, recordFrame: recordPerfFrame, recordReactSync } = perf;
  const [view, setView] = useState<FallDownRuntime>(() => makeFallDownView(initialRuntime));

  const syncView = useCallback((time = performance.now()) => {
    lastUiSyncRef.current = time;
    recordReactSync();
    setView(makeFallDownView(runtimeRef.current));
  }, [recordReactSync]);

  const updateFallDownDom = useCallback(
    (current: FallDownRuntime) => {
      const pressureScreenY = current.pressureWorldY - current.cameraY;
      if (dangerLineRef.current) {
        dangerLineRef.current.style.transform = transformPoint3d(0, pressureScreenY);
      }
      const platformById = new Map(current.platforms.map((platform) => [platform.id, platform]));
      const hazardById = new Map(current.fallingHazards.map((hazard) => [hazard.id, hazard]));

      for (const [id, node] of fallPlatformRefs.current) {
        const platform = platformById.get(id);
        if (!platform || platform.broken) {
          node.style.display = "none";
          continue;
        }
        const platformX = fallPlatformX(platform, current.time);
        const screenY = platform.y - current.cameraY;
        if (screenY < -80 || screenY > STAGE_HEIGHT + 80) {
          node.style.display = "none";
          continue;
        }
        const fragileWarning = platform.kind === "fragile" && platform.steppedAt !== null && current.time - platform.steppedAt >= Math.max(0, fragileTime - 0.45);
        node.style.display = "";
        node.className = `fall-platform kind-${platform.kind} ${platform.id === current.currentPlatformId ? "current" : ""} ${fragileWarning ? "fragile-warning" : ""}`;
        node.style.transform = transformPoint3d(platformX - platform.width / 2, screenY);
        node.style.width = `${platform.width}px`;
      }

      for (const [id, node] of fallHazardRefs.current) {
        const hazard = hazardById.get(id);
        if (!hazard) {
          node.style.display = "none";
          continue;
        }
        const hazardX = fallDownFallingHazardX(hazard, current.time);
        const hazardY = fallDownFallingHazardScreenY(hazard, current.time);
        if (hazardY < -80 || hazardY > STAGE_HEIGHT + 80) {
          node.style.display = "none";
          continue;
        }
        node.style.display = "";
        node.style.transform = `${transformPoint3d(hazardX - hazard.size / 2, hazardY - hazard.size / 2)} rotate(45deg)`;
      }

      if (playerShellRef.current) {
        playerShellRef.current.style.transform = transformPoint3d(current.playerX - PLAYER_SIZE / 2, current.playerY - current.cameraY - PLAYER_SIZE / 2);
      }
    },
    [fragileTime],
  );

  const resumeFallDownInput = useCallback(
    (current: FallDownRuntime, direction: FallDownRuntime["inputDirection"]) => {
      current.started = true;
      current.respawnUntil = 0;
      current.inputDirection = direction;
      current.vx = direction * fallDownPlayerSpeed;
    },
    [fallDownPlayerSpeed],
  );

  const fail = useCallback(
    (reason: string): boolean => {
      const current = runtimeRef.current;
      if (mode === "base" && recoverFallDownBaseFailure(current, reason)) {
        if (fallDownInputDirectionRef.current !== 0) {
          resumeFallDownInput(current, fallDownInputDirectionRef.current);
        }
        syncView();
        return true;
      }
      if (mode === "base") {
        syncView();
        return false;
      }
      current.status = "failed";
      current.reason = reason;
      current.inputDirection = 0;
      current.vx = 0;
      syncView();
      return false;
    },
    [mode, resumeFallDownInput, syncView],
  );

  function chooseFallDownDirection(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? -1 : 1;
  }

  const updateFallDownDirection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (fallDownPointerIdRef.current !== event.pointerId) return;
    const current = runtimeRef.current;
    if (current.status !== "playing") return;
    const direction = chooseFallDownDirection(event);
    fallDownInputDirectionRef.current = direction;
    resumeFallDownInput(current, direction);
  }, [resumeFallDownInput]);

  const beginFallDownDirection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    fallDownPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFallDownDirection(event);
    syncView();
  }, [syncView, updateFallDownDirection]);

  const stopDirection = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    event?.preventDefault();
    if (event && fallDownPointerIdRef.current !== null && fallDownPointerIdRef.current !== event.pointerId) return;
    fallDownInputDirectionRef.current = 0;
    fallDownPointerIdRef.current = null;
    const current = runtimeRef.current;
    current.inputDirection = 0;
    current.vx = 0;
    syncView();
  }, [syncView]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const tick = (time: number) => {
      recordDebugFrame(time);
      const updateStartedAt = perfEnabled ? performance.now() : 0;
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;
      const current = runtimeRef.current;
      let eventChanged = false;
      const paintFallDownFrame = (frame: FallDownRuntime) => {
        const updateMs = perfEnabled ? performance.now() - updateStartedAt : 0;
        const renderStartedAt = perfEnabled ? performance.now() : 0;
        updateFallDownDom(frame);
        if (perfEnabled) recordPerfFrame(time, updateMs, performance.now() - renderStartedAt);
      };
      const continueAfterRecoverableFailure = (reason: string) => {
        if (fail(reason)) {
          paintFallDownFrame(runtimeRef.current);
          frameId = requestAnimationFrame(tick);
        }
      };

      if (current.status === "playing") {
        const previousTime = current.time;
        current.time += delta;

        if (current.started) {
          let platformCarryX = 0;
          const platformById = new Map(current.platforms.map((platform) => [platform.id, platform]));
          const carriedPlatform = platformById.get(current.currentPlatformId);
          if (carriedPlatform && carriedPlatform.kind === "moving" && !carriedPlatform.broken) {
            const previousPlatformX = fallPlatformX(carriedPlatform, previousTime);
            const isOnCarriedPlatform =
              Math.abs(current.playerY + PLAYER_SIZE / 2 - carriedPlatform.y) <= 0.5 &&
              current.playerX + PLAYER_SIZE / 2 >= previousPlatformX - carriedPlatform.width / 2 &&
              current.playerX - PLAYER_SIZE / 2 <= previousPlatformX + carriedPlatform.width / 2;
            if (isOnCarriedPlatform) {
              platformCarryX = fallPlatformX(carriedPlatform, current.time) - previousPlatformX;
            }
          }
          const previousY = current.playerY;
          const previousBottom = previousY + PLAYER_SIZE / 2;
          const previousPlayerX = current.playerX;
          current.cameraY = advanceFallDownCamera({
            cameraY: current.cameraY,
            delta,
            speed: topPressureSpeed,
          });
          current.pressureWorldY = current.cameraY - PLAYER_SIZE;
          current.vx = current.inputDirection * fallDownPlayerSpeed;
          current.vy = clamp(current.vy + 980 * delta, -220, 520);
          current.playerX = clamp(current.playerX + current.inputDirection * fallDownPlayerSpeed * delta + platformCarryX, PLAYER_SIZE / 2 + 4, STAGE_WIDTH - PLAYER_SIZE / 2 - 4);
          current.playerY += current.vy * delta;

          for (const platform of current.platforms) {
            const platformX = fallPlatformX(platform, current.time);
            current.playerX = clamp(resolveFallDownLedgeCollision(platform, platformX, current.playerX, previousPlayerX, current.playerY), PLAYER_SIZE / 2 + 4, STAGE_WIDTH - PLAYER_SIZE / 2 - 4);
          }

          for (const hazard of current.fallingHazards) {
            const hazardX = fallDownFallingHazardX(hazard, current.time);
            const hazardY = fallDownFallingHazardScreenY(hazard, current.time);
            const playerScreenY = current.playerY - current.cameraY;
            const overlapsX = Math.abs(current.playerX - hazardX) <= PLAYER_SIZE / 2 + hazard.size / 2 - 2;
            const overlapsY = Math.abs(playerScreenY - hazardY) <= PLAYER_SIZE / 2 + hazard.size / 2 - 2;
            if (overlapsX && overlapsY) {
              continueAfterRecoverableFailure("躲开下落危险");
              return;
            }
          }

          for (const platform of current.platforms) {
            if (platform.broken) continue;
            const platformX = fallPlatformX(platform, current.time);
            const platformTop = platform.y;
            const nextBottom = current.playerY + PLAYER_SIZE / 2;
            const crossedPlatform = current.vy > 0 && previousBottom <= platformTop && nextBottom >= platformTop;
            const landingBounds = fallDownPlatformLandingBounds(platform, platformX);
            const horizontalOverlap = current.playerX + PLAYER_SIZE / 2 >= landingBounds.left && current.playerX - PLAYER_SIZE / 2 <= landingBounds.right;
            if (!crossedPlatform || !horizontalOverlap) continue;
            if (platform.kind === "danger") {
              continueAfterRecoverableFailure("踩到危险");
              return;
            }
            current.playerY = platformTop - PLAYER_SIZE / 2;
            current.vy = 0;
            current.currentPlatformId = platform.id;
            current.layersReached = Math.max(current.layersReached, platform.id);
            if (platform.kind === "fragile" && platform.steppedAt === null) platform.steppedAt = current.time;
            eventChanged = true;
            if (platform.kind === "finish") {
              current.status = "passed";
              current.reason = `成功下降 ${requiredLayers} 层，到达终点平台`;
              paintFallDownFrame(current);
              syncView(time);
              return;
            }
            break;
          }

          for (const platform of current.platforms) {
            const fragileState = expireFallDownFragilePlatform({
              fragileTime: fragileTime,
              kind: platform.kind,
              now: current.time,
              steppedAt: platform.steppedAt,
            });
            if (fragileState.broken && !platform.broken) {
              platform.broken = true;
              eventChanged = true;
              if (platform.id === current.currentPlatformId) {
                current.currentPlatformId = -1;
                current.vy = Math.max(current.vy, 90);
              }
            }
          }

          const bounds = resolveFallDownCameraBounds({
            bottomFailLine: STAGE_HEIGHT + PLAYER_SIZE,
            cameraY: current.cameraY,
            playerWorldY: current.playerY,
            squareSize: PLAYER_SIZE,
            stageHeight: STAGE_HEIGHT,
          });
          if (bounds.status === "failed") {
            continueAfterRecoverableFailure(bounds.reason === "too-slow" ? "太慢了" : "掉太深");
            return;
          }
        }
      }

      paintFallDownFrame(current);
      if (current.status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [fail, fallDownPlayerSpeed, fragileTime, perfEnabled, recordDebugFrame, recordPerfFrame, requiredLayers, syncView, topPressureSpeed, updateFallDownDom]);

  useEffect(() => {
    if (!onComplete || completedRef.current || view.status === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    onComplete({
      gameId: "fall-down",
      levelId: level.levelId,
      status: view.status,
      reason: latest.reason,
      elapsedMs: Math.round(latest.time * 1000),
      stats: {
        failures: latest.failures,
        progressPercent: Math.round((latest.layersReached / Math.max(1, requiredLayers)) * 100),
        layersReached: latest.layersReached,
        requiredLayers,
        forcedAdvance: mode === "base" && view.status === "failed",
      },
    });
  }, [level.levelId, mode, onComplete, requiredLayers, view.status]);

  const showOverlay = mode === "prototype";
  const pressureScreenY = view.pressureWorldY - view.cameraY;

  return (
    <div className="prototype-game-wrap">
      <div className="mini-score">
        <span>进度 {view.layersReached}/{requiredLayers}</span>
        <span>压线 {Math.max(0, pressureScreenY).toFixed(0)}px</span>
        {mode === "base" ? <span>失败 {Math.min(view.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
      </div>
      <div
        className={`prototype-stage fall-down-stage ${view.status === "failed" ? "failed" : ""}`}
        role="application"
        aria-label="一路向下"
        onLostPointerCapture={stopDirection}
        onPointerCancel={stopDirection}
        onPointerDown={beginFallDownDirection}
        onPointerMove={updateFallDownDirection}
        onPointerUp={stopDirection}
      >
        <MiniGameFpsBadge fps={fps} />
        <MiniGamePerfPanel snapshot={perf.snapshot} />
        <div className="fall-danger-line" ref={dangerLineRef} style={{ transform: transformPoint3d(0, pressureScreenY) }} aria-hidden="true" />
        {view.platforms.map((platform) => {
          const platformX = fallPlatformX(platform, view.time);
          const screenY = platform.y - view.cameraY;
          if (screenY < -80 || screenY > STAGE_HEIGHT + 80 || platform.broken) return null;
          const fragileWarning = platform.kind === "fragile" && platform.steppedAt !== null && view.time - platform.steppedAt >= Math.max(0, fragileTime - 0.45);
          return (
            <div
              className={`fall-platform kind-${platform.kind} ${platform.id === view.currentPlatformId ? "current" : ""} ${fragileWarning ? "fragile-warning" : ""}`}
              key={platform.id}
              ref={(node) => {
                if (node) fallPlatformRefs.current.set(platform.id, node);
                else fallPlatformRefs.current.delete(platform.id);
              }}
              style={{
                transform: transformPoint3d(platformX - platform.width / 2, screenY),
                width: `${platform.width}px`,
              }}
            >
              {platform.kind === "moving" ? <span className="fall-platform-track" /> : null}
              <span className="fall-platform-top" />
              {platform.shape !== "flat" && platform.id === view.currentPlatformId ? (
                <span
                  className="fall-platform-leg"
                  style={{
                    background: platform.kind === "danger" ? "var(--red)" : platform.kind === "moving" ? "var(--blue)" : platform.kind === "fragile" ? "#b6d6c3" : "var(--green)",
                    border: "1px solid rgba(24, 24, 24, 0.12)",
                    borderRadius: "7px 7px 3px 3px",
                    height: `${FALL_DOWN_LEDGE_HEIGHT}px`,
                    left: platform.shape === "l-left" ? `-${FALL_DOWN_LEDGE_WIDTH - 2}px` : undefined,
                    position: "absolute",
                    right: platform.shape === "l-right" ? `-${FALL_DOWN_LEDGE_WIDTH - 2}px` : undefined,
                    top: `-${FALL_DOWN_LEDGE_HEIGHT - 2}px`,
                    width: `${FALL_DOWN_LEDGE_WIDTH}px`,
                    zIndex: 3,
                  }}
                />
              ) : null}
              {platform.kind === "finish" ? <span className="fall-finish-flag">终</span> : null}
            </div>
          );
        })}
        {view.fallingHazards.map((hazard) => {
          const hazardX = fallDownFallingHazardX(hazard, view.time);
          const hazardY = fallDownFallingHazardScreenY(hazard, view.time);
          if (hazardY < -80 || hazardY > STAGE_HEIGHT + 80) return null;
          return (
            <div
              aria-hidden="true"
              className="fall-down-falling-hazard"
              key={hazard.id}
              ref={(node) => {
                if (node) fallHazardRefs.current.set(hazard.id, node);
                else fallHazardRefs.current.delete(hazard.id);
              }}
              style={{
                background: "var(--red)",
                borderRadius: "5px",
                boxShadow: "0 0 0 5px rgba(230, 83, 73, 0.14)",
                height: `${hazard.size}px`,
                position: "absolute",
                transform: `${transformPoint3d(hazardX - hazard.size / 2, hazardY - hazard.size / 2)} rotate(45deg)`,
                width: `${hazard.size}px`,
                zIndex: 9,
              }}
            />
          );
        })}
        <div className={`fall-down-player-shell ${view.time < view.respawnUntil ? "respawn-warning" : ""}`} ref={playerShellRef} style={{ transform: transformPoint3d(view.playerX - PLAYER_SIZE / 2, view.playerY - view.cameraY - PLAYER_SIZE / 2) }}>
          <div className="prototype-player-box fall-down-player" />
        </div>
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}

function makeDoodleWorld(level: MiniGameLevelConfig, runSeed: string) {
  return generateDoodleWorldLayout(level, runSeed, {
    playerSize: PLAYER_SIZE,
    stageHeight: STAGE_HEIGHT,
    stageWidth: STAGE_WIDTH,
  });
}
function movingPlatformX(platform: DoodlePlatform, time: number) {
  return platform.moving ? clamp(platform.x + Math.sin(time * platform.speed + platform.phase) * platform.range, platform.width / 2 + 12, STAGE_WIDTH - platform.width / 2 - 12) : platform.x;
}

function movingHazardPosition(hazard: DoodleHazard, time: number) {
  if (!hazard.movementEnabled) return { x: hazard.x, y: hazard.y, size: hazard.size };
  const phase = time * hazard.speed + hazard.phase;
  const offset = Math.sin(phase) * hazard.range;
  if (hazard.movementPattern === "vertical") return { x: hazard.x, y: hazard.y + offset, size: hazard.size };
  if (hazard.movementPattern === "patrolDiagonal") {
    return {
      x: clamp(hazard.x + offset * 0.82, hazard.size / 2 + 18, STAGE_WIDTH - hazard.size / 2 - 18),
      y: hazard.y + offset * 0.42,
      size: hazard.size,
    };
  }
  if (hazard.movementPattern === "orbitSmall") {
    return {
      x: clamp(hazard.x + Math.cos(phase) * hazard.range * 0.78, hazard.size / 2 + 18, STAGE_WIDTH - hazard.size / 2 - 18),
      y: hazard.y + Math.sin(phase) * hazard.range * 0.58,
      size: hazard.size,
    };
  }
  if (hazard.movementPattern === "pulse") {
    return { x: hazard.x, y: hazard.y, size: hazard.size * (1 + Math.max(0, Math.sin(phase)) * 0.16) };
  }
  if (hazard.movementPattern === "slowCross") {
    return {
      x: clamp(hazard.x + offset, hazard.size / 2 + 18, STAGE_WIDTH - hazard.size / 2 - 18),
      y: hazard.y + Math.sin(phase * 0.55) * 12,
      size: hazard.size,
    };
  }
  return {
    x: clamp(hazard.x + offset, hazard.size / 2 + 18, STAGE_WIDTH - hazard.size / 2 - 18),
    y: hazard.y,
    size: hazard.size,
  };
}

function createDoodleRuntime(world: ReturnType<typeof makeDoodleWorld>): DoodleFrame {
  return {
    started: false,
    time: 0,
    playerX: STAGE_WIDTH / 2,
    playerY: world.startPlayerY,
    playerVy: 0,
    cameraY: 0,
    platforms: world.platforms.map((platform) => ({ ...platform, used: false })),
    hazards: world.hazards,
    riskHit: 0,
    playerTurns: 0,
    failures: 0,
    invincibleUntil: 0,
    status: "playing",
    reason: "",
  };
}

function makeDoodleView(frame: DoodleFrame, targetHeight: number, buffer: number): DoodleViewFrame {
  return {
    cameraY: frame.cameraY,
    failures: frame.failures,
    invincibleUntil: frame.invincibleUntil,
    playerTurns: frame.playerTurns,
    playerX: frame.playerX,
    playerY: frame.playerY,
    progressPercent: clamp((frame.playerY / targetHeight) * 100, 0, 100),
    reason: frame.reason,
    riskHit: frame.riskHit,
    started: frame.started,
    status: frame.status,
    time: frame.time,
    visibleHazards: selectVisibleDoodleHazards(frame.hazards, {
      buffer,
      cameraY: frame.cameraY,
      stageHeight: STAGE_HEIGHT,
    }),
    visiblePlatforms: selectVisibleDoodlePlatforms(frame.platforms, {
      buffer,
      cameraY: frame.cameraY,
      stageHeight: STAGE_HEIGHT,
    }),
  };
}

function DoodleJumpPrototype({
  level,
  mode,
  runSeed,
  onBackToSelect,
  onComplete,
  onRestart,
}: {
  level: MiniGameLevelConfig;
  mode: MiniGameRunMode;
  runSeed: string;
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart: () => void;
}) {
  const world = useMemo(() => makeDoodleWorld(level, runSeed), [level, runSeed]);
  const riskTotal = numberParam(level.params, "requiredRiskPlatforms", 0);
  const riskJumpMultiplier = numberParam(level.params, "riskJumpMultiplier", 1);
  const isLowPowerDevice = useMiniGameLowPowerMode();
  const visibleBuffer = isLowPowerDevice ? 96 : 160;
  const initialRuntime = useMemo(() => createDoodleRuntime(world), [world]);
  const inputDirectionRef = useRef(0);
  const inputPointerIdRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const progressLineRef = useRef<HTMLDivElement | null>(null);
  const platformRefs = useRef(new Map<number, HTMLDivElement>());
  const hazardRefs = useRef(new Map<number, HTMLDivElement>());
  const runtimeRef = useRef<DoodleFrame>(initialRuntime);
  const lastUiSyncRef = useRef(0);
  const completedRef = useRef(false);
  const { fps, recordFrame: recordDebugFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const perf = useMiniGamePerfMonitor("Doodle");
  const { enabled: perfEnabled, recordFrame: recordPerfFrame, recordReactSync } = perf;
  const [view, setView] = useState<DoodleViewFrame>(() => makeDoodleView(initialRuntime, world.targetHeight, visibleBuffer));

  const syncDoodleView = useCallback(
    (time = performance.now()) => {
      lastUiSyncRef.current = time;
      recordReactSync();
      setView(makeDoodleView(runtimeRef.current, world.targetHeight, visibleBuffer));
    },
    [recordReactSync, visibleBuffer, world.targetHeight],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => syncDoodleView(), 0);
    return () => window.clearTimeout(timer);
  }, [syncDoodleView]);

  const startDoodle = useCallback(() => {
    const current = runtimeRef.current;
    if (current.started || current.status !== "playing") return;
    current.started = true;
    current.playerVy = 760;
    syncDoodleView();
  }, [syncDoodleView]);

  function chooseDoodleDirection(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
  }

  const updateDoodleDirection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (inputPointerIdRef.current !== event.pointerId) return;
    inputDirectionRef.current = chooseDoodleDirection(event);
  }, []);

  const beginDoodleDirection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    inputPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    inputDirectionRef.current = chooseDoodleDirection(event);
    startDoodle();
  }, [startDoodle]);

  const stopDoodleDirection = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    event?.preventDefault();
    if (event && inputPointerIdRef.current !== null && inputPointerIdRef.current !== event.pointerId) return;
    inputPointerIdRef.current = null;
    inputDirectionRef.current = 0;
  }, []);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const updateDom = (current: DoodleFrame) => {
      const platformById = new Map(current.platforms.map((platform) => [platform.id, platform]));
      const hazardById = new Map(current.hazards.map((hazard) => [hazard.id, hazard]));
      if (playerShellRef.current) {
        playerShellRef.current.style.transform = transformPoint3d(
          current.playerX - PLAYER_SIZE / 2,
          STAGE_HEIGHT - (current.playerY - current.cameraY) - PLAYER_SIZE / 2,
        );
      }
      if (playerBoxRef.current) {
        playerBoxRef.current.style.transform = `rotate(${current.playerTurns * 90}deg)`;
      }
      if (progressLineRef.current) {
        const targetY = clamp(STAGE_HEIGHT - (world.targetHeight - current.cameraY), 0, STAGE_HEIGHT);
        progressLineRef.current.style.transform = transformPoint3d(0, targetY);
      }

      for (const [id, node] of platformRefs.current) {
        const platform = platformById.get(id);
        if (!platform || platform.used) {
          node.style.display = "none";
          continue;
        }
        node.style.display = "";
        const x = movingPlatformX(platform, current.time);
        const y = STAGE_HEIGHT - (platform.y - current.cameraY);
        node.style.transform = transformPoint3d(x - platform.width / 2, y);
      }

      for (const [id, node] of hazardRefs.current) {
        const hazard = hazardById.get(id);
        if (!hazard) continue;
        const position = movingHazardPosition(hazard, current.time);
        const y = STAGE_HEIGHT - (position.y - current.cameraY) - hazard.size / 2;
        const rotate = hazard.movementPattern === "vertical" ? 0 : hazard.movementPattern === "patrolDiagonal" ? 28 : hazard.movementPattern === "slowCross" ? -12 : 45;
        const scale = position.size / hazard.size;
        node.style.transform = `${transformPoint3d(position.x - hazard.size / 2, y)} rotate(${rotate}deg) scale(${scale})`;
      }
    };

    const tick = (time: number) => {
      recordDebugFrame(time);
      const updateStartedAt = perfEnabled ? performance.now() : 0;
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;
      const paintDoodleFrame = (frame: DoodleFrame) => {
        const updateMs = perfEnabled ? performance.now() - updateStartedAt : 0;
        const renderStartedAt = perfEnabled ? performance.now() : 0;
        updateDom(frame);
        if (perfEnabled) recordPerfFrame(time, updateMs, performance.now() - renderStartedAt);
      };

      const current = runtimeRef.current;
      if (current.status !== "playing") {
        paintDoodleFrame(current);
        return;
      }
      if (!current.started) {
        paintDoodleFrame(current);
        frameId = requestAnimationFrame(tick);
        return;
      }

      const nextTime = current.time + delta;
      current.playerX = clamp(current.playerX + inputDirectionRef.current * DOODLE_PLAYER_SPEED * delta, PLAYER_SIZE / 2, STAGE_WIDTH - PLAYER_SIZE / 2);
      const nextX = current.playerX;
      const previousY = current.playerY;
      let nextVy = current.playerVy - 1500 * delta;
      let nextY = current.playerY + nextVy * delta;
      let riskHit = current.riskHit;
      let playerTurns = current.playerTurns;
      let eventChanged = false;
      let reason = "";
      let status: PrototypeStatus = "playing";

      if (nextVy < 0) {
        const minY = Math.min(previousY, nextY) - PLAYER_SIZE;
        const maxY = Math.max(previousY, nextY) + PLAYER_SIZE;
        for (const platform of current.platforms) {
          if (platform.used || platform.y < minY || platform.y > maxY) continue;
          const platformX = movingPlatformX(platform, nextTime);
          const crossed = previousY - PLAYER_SIZE / 2 >= platform.y && nextY - PLAYER_SIZE / 2 <= platform.y;
          const insideX = Math.abs(nextX - platformX) <= platform.width / 2 + PLAYER_SIZE / 2;
          if (crossed && insideX) {
            nextY = platform.y + PLAYER_SIZE / 2;
            nextVy = 760 * (platform.risk ? riskJumpMultiplier : 1);
            platform.used = true;
            if (platform.risk) riskHit += 1;
            playerTurns += 1;
            eventChanged = true;
            break;
          }
        }
      }

      const cameraY = Math.max(current.cameraY, nextY - STAGE_HEIGHT * 0.45);
      if (status === "playing" && riskHit < riskTotal) {
        let missedRisk = false;
        for (const platform of current.platforms) {
          if (!platform.used && platform.risk && cameraY > platform.y + STAGE_HEIGHT * 0.34) {
            missedRisk = true;
            break;
          }
        }
        if (missedRisk) {
          status = "failed";
          reason = "漏踩高风险平台";
        }
      }

      if (status === "playing" && nextTime >= current.invincibleUntil) {
        for (const hazard of current.hazards) {
          const movementRange = hazard.movementEnabled ? hazard.range + 18 : 0;
          if (hazard.y + hazard.size + movementRange < cameraY - 70 || hazard.y - hazard.size - movementRange > cameraY + STAGE_HEIGHT + 70) continue;
          const position = movingHazardPosition(hazard, nextTime);
          const hitRadius = position.size / 2 + PLAYER_SIZE / 2 - 3;
          const dx = nextX - position.x;
          const dy = nextY - position.y;
          if (Math.abs(dx) > hitRadius || Math.abs(dy) > hitRadius) continue;
          if (dx * dx + dy * dy <= hitRadius * hitRadius) {
            status = "failed";
            reason = "撞到危险";
            break;
          }
        }
      }

      if (status === "playing" && nextY < cameraY - 80) {
        status = "failed";
        reason = "掉出屏幕底部";
      }

      if (status === "playing" && nextY >= world.targetHeight) {
        if (riskHit >= riskTotal) {
          status = "passed";
          reason = `高度达成，必踩平台 ${riskHit}/${riskTotal}`;
        } else {
          status = "failed";
          reason = `漏踩高风险平台 ${riskHit}/${riskTotal}`;
        }
      }

      current.time = nextTime;
      current.playerX = nextX;
      current.playerY = nextY;
      current.playerVy = nextVy;
      current.cameraY = cameraY;
      current.riskHit = riskHit;
      current.playerTurns = playerTurns;

      if (mode === "base" && status === "failed") {
        const failures = current.failures + 1;
        if (failures <= BASE_FAILURE_LIMIT) {
          const respawnY = cameraY + STAGE_HEIGHT * 0.34;
          const respawnX = clamp(nextX, 70, STAGE_WIDTH - 70);
          const respawnPlatform: DoodlePlatform = {
            id: -1000 - failures,
            x: respawnX,
            y: respawnY - PLAYER_SIZE / 2,
            width: 116,
            start: false,
            moving: false,
            risk: false,
            phase: 0,
            range: 0,
            speed: 0,
            used: false,
          };
          current.playerX = respawnX;
          current.playerY = respawnY;
          current.playerVy = 760;
          current.platforms.unshift(respawnPlatform);
          current.failures = failures;
          current.invincibleUntil = nextTime + 1.1;
          current.status = "playing";
          current.reason = reason;
          paintDoodleFrame(current);
          syncDoodleView(time);
          frameId = requestAnimationFrame(tick);
          return;
        }
        current.failures = failures;
        reason = "失败超过 3 次，进入下一关";
      }

      current.status = status;
      current.reason = reason;
      paintDoodleFrame(current);

      if (status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncDoodleView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [mode, perfEnabled, recordDebugFrame, recordPerfFrame, riskJumpMultiplier, riskTotal, syncDoodleView, world.targetHeight]);

  const showOverlay = mode === "prototype";

  useEffect(() => {
    if (!onComplete || completedRef.current || view.status === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    const progress = clamp((latest.playerY / world.targetHeight) * 100, 0, 100);
    onComplete({
      gameId: "doodle",
      levelId: level.levelId,
      status: view.status,
      reason: latest.reason,
      elapsedMs: Math.round(latest.time * 1000),
      stats: {
        failures: latest.failures,
        progressPercent: Math.round(progress),
        riskHit: latest.riskHit,
        riskTotal,
        forcedAdvance: mode === "base" && view.status === "failed",
      },
    });
  }, [level.levelId, mode, onComplete, riskTotal, view.status, world.targetHeight]);

  return (
    <div className="prototype-game-wrap">
      <div className="mini-score">
        <span>进度 {Math.round(view.progressPercent)}%</span>
        <span>高风险 {view.riskHit}/{riskTotal}</span>
        {mode === "base" ? <span>失败 {Math.min(view.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
      </div>
      <div
        className={`prototype-stage doodle-stage ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        ref={stageRef}
        role="application"
        aria-label="Doodle Jump 型小游戏"
        onLostPointerCapture={stopDoodleDirection}
        onPointerCancel={stopDoodleDirection}
        onPointerDown={beginDoodleDirection}
        onPointerMove={updateDoodleDirection}
        onPointerUp={stopDoodleDirection}
      >
        <MiniGameFpsBadge fps={fps} />
        <MiniGamePerfPanel snapshot={perf.snapshot} />
        <div
          className="doodle-progress-line"
          ref={progressLineRef}
          style={{ transform: transformPoint3d(0, clamp(STAGE_HEIGHT - (world.targetHeight - view.cameraY), 0, STAGE_HEIGHT)) }}
        />
        {view.visiblePlatforms.map((platform) => {
          const x = movingPlatformX(platform, view.time);
          const y = STAGE_HEIGHT - (platform.y - view.cameraY);
          return (
            <div
              className={`doodle-platform ${platform.start ? "start" : ""} ${platform.moving ? "moving" : ""} ${platform.risk ? "risk" : ""}`}
              key={platform.id}
              ref={(node) => {
                if (node) platformRefs.current.set(platform.id, node);
                else platformRefs.current.delete(platform.id);
              }}
              style={{
                transform: transformPoint3d(x - platform.width / 2, y),
                width: `${platform.width}px`,
              }}
            />
          );
        })}
        {view.visibleHazards.map((hazard) => {
          const position = movingHazardPosition(hazard, view.time);
          const y = STAGE_HEIGHT - (position.y - view.cameraY) - hazard.size / 2;
          const rotate = hazard.movementPattern === "vertical" ? 0 : hazard.movementPattern === "patrolDiagonal" ? 28 : hazard.movementPattern === "slowCross" ? -12 : 45;
          const scale = position.size / hazard.size;
          return (
            <div
              className={`doodle-hazard motion-${hazard.movementPattern} ${hazard.movementEnabled ? "moving" : ""}`}
              key={hazard.id}
              ref={(node) => {
                if (node) hazardRefs.current.set(hazard.id, node);
                else hazardRefs.current.delete(hazard.id);
              }}
              style={{
                height: `${hazard.size}px`,
                transform: `${transformPoint3d(position.x - hazard.size / 2, y)} rotate(${rotate}deg) scale(${scale})`,
                width: `${hazard.size}px`,
              }}
            />
          );
        })}
        <div
          className={`doodle-player-shell ${view.time < view.invincibleUntil ? "invincible" : ""}`}
          ref={playerShellRef}
          style={stagePointStyle(view.playerX, view.playerY, view.cameraY)}
        >
          <div className="prototype-player-box doodle-player" ref={playerBoxRef} style={{ transform: `rotate(${view.playerTurns * 90}deg)` }} />
        </div>
        {!view.started ? <div className="prototype-start-hint">按住开始</div> : null}
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}

function makeFlappyLayout(level: MiniGameLevelConfig, runSeed: string) {
  return generateFlappyGateLayout(level, runSeed, { stageHeight: STAGE_HEIGHT });
}

function flappyGateCenterY(gate: FlappyGate, time: number, params: MiniGameParams) {
  if (!gate.moving) return gate.baseCenterY;
  const movingSpeed = numberParam(params, "movingGateSpeed", 1);
  return clamp(gate.baseCenterY + Math.sin(time * movingSpeed + gate.phase) * 42, 116, STAGE_HEIGHT - 116);
}

function createFlappyRuntime(gates: FlappyGate[], initialPlayerY: number): FlappyFrame {
  return {
    started: false,
    time: 0,
    progress: 0,
    playerY: initialPlayerY,
    playerVy: 0,
    gates: gates.map((gate) => ({ ...gate })),
    passed: 0,
    collected: 0,
    playerTurns: 0,
    failures: 0,
    invincibleUntil: 0,
    status: "playing",
    reason: "",
  };
}

function makeFlappyView(frame: FlappyFrame, reverseDirection: boolean, buffer: number): FlappyViewFrame {
  return {
    collected: frame.collected,
    failures: frame.failures,
    invincibleUntil: frame.invincibleUntil,
    passed: frame.passed,
    playerTurns: frame.playerTurns,
    playerY: frame.playerY,
    progress: frame.progress,
    reason: frame.reason,
    started: frame.started,
    status: frame.status,
    time: frame.time,
    visibleGates: selectVisibleFlappyGates(frame.gates, {
      buffer,
      gateWidth: FLAPPY_GATE_WIDTH,
      progress: frame.progress,
      reverseDirection,
      stageWidth: STAGE_WIDTH,
    }),
  };
}

function FlappyPrototype({
  level,
  mode,
  runSeed,
  onBackToSelect,
  onComplete,
  onRestart,
}: {
  level: MiniGameLevelConfig;
  mode: MiniGameRunMode;
  runSeed: string;
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart: () => void;
}) {
  const layout = useMemo(() => makeFlappyLayout(level, runSeed), [level, runSeed]);
  const gates = layout.gates;
  const reversedGravity = booleanParam(level.params, "reversedGravity");
  const reverseDirection = booleanParam(level.params, "reverseDirection");
  const gateCount = numberParam(level.params, "gateCount", 6);
  const collectibleCount = numberParam(level.params, "collectibleCount", 0);
  const gapSize = numberParam(level.params, "gapSize", 180);
  const speed = numberParam(level.params, "speed", 118);
  const playerX = reverseDirection ? STAGE_WIDTH - 92 : 92;
  const isLowPowerDevice = useMiniGameLowPowerMode();
  const visibleBuffer = isLowPowerDevice ? 88 : 130;
  const backgroundRefs: FlappyBackgroundRef[] = useMemo(
    () => (isLowPowerDevice ? layout.backgroundRefs.slice(0, 12) : layout.backgroundRefs),
    [isLowPowerDevice, layout.backgroundRefs],
  );
  const initialPlayerY = layout.initialPlacement === "belowPlatform"
    ? FLAPPY_START_PLATFORM_Y + FLAPPY_START_PLATFORM_HEIGHT + PLAYER_SIZE / 2
    : FLAPPY_START_PLATFORM_Y - PLAYER_SIZE / 2;
  const initialRuntime = useMemo(() => createFlappyRuntime(gates, initialPlayerY), [gates, initialPlayerY]);
  const runtimeRef = useRef<FlappyFrame>(initialRuntime);
  const completedRef = useRef(false);
  const lastUiSyncRef = useRef(0);
  const backgroundNodeRefs = useRef(new Map<number, HTMLSpanElement>());
  const gateTopRefs = useRef(new Map<number, HTMLDivElement>());
  const gateBottomRefs = useRef(new Map<number, HTMLDivElement>());
  const collectibleRefs = useRef(new Map<number, HTMLDivElement>());
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const { fps, recordFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const [view, setView] = useState<FlappyViewFrame>(() => makeFlappyView(initialRuntime, reverseDirection, visibleBuffer));

  const syncFlappyView = useCallback(
    (time = performance.now()) => {
      lastUiSyncRef.current = time;
      setView(makeFlappyView(runtimeRef.current, reverseDirection, visibleBuffer));
    },
    [reverseDirection, visibleBuffer],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => syncFlappyView(), 0);
    return () => window.clearTimeout(timer);
  }, [syncFlappyView]);

  const pulse = useCallback(() => {
    const current = runtimeRef.current;
    if (current.status !== "playing") return;
    current.started = true;
    current.playerTurns += 1;
    current.playerVy = reversedGravity ? 335 : -335;
    syncFlappyView();
  }, [reversedGravity, syncFlappyView]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const updateDom = (current: FlappyFrame) => {
      for (const ref of backgroundRefs) {
        const node = backgroundNodeRefs.current.get(ref.id);
        if (!node) continue;
        const spacing = 82;
        const drift = reverseDirection ? current.progress : -current.progress;
        const cycle = STAGE_WIDTH + spacing;
        const x = (((ref.x + drift * 0.55) % cycle) + cycle) % cycle - spacing;
        node.style.transform = transformPoint3d(x, ref.y);
      }

      for (const [id, topNode] of gateTopRefs.current) {
        const gate = current.gates.find((item) => item.id === id);
        const bottomNode = gateBottomRefs.current.get(id);
        if (!gate || !bottomNode) continue;
        const screenX = getFlappyGateScreenX(gate, {
          progress: current.progress,
          reverseDirection,
          stageWidth: STAGE_WIDTH,
        });
        const centerY = flappyGateCenterY(gate, current.time, level.params);
        const topHeight = centerY - gapSize / 2;
        const bottomY = centerY + gapSize / 2;
        topNode.style.transform = transformPoint3d(screenX, topHeight - STAGE_HEIGHT);
        bottomNode.style.transform = transformPoint3d(screenX, bottomY);

        const collectibleNode = collectibleRefs.current.get(id);
        if (collectibleNode) {
          if (gate.collected) {
            collectibleNode.style.display = "none";
          } else {
            const collectibleY = clamp(centerY + gate.collectibleOffset * gapSize, centerY - gapSize / 2 + 22, centerY + gapSize / 2 - 22);
            collectibleNode.style.display = "";
            collectibleNode.style.transform = transformPoint3d(screenX + FLAPPY_GATE_WIDTH / 2 - 9, collectibleY - 9);
          }
        }
      }

      if (playerShellRef.current) {
        playerShellRef.current.style.transform = transformPoint3d(playerX - PLAYER_SIZE / 2, current.playerY - PLAYER_SIZE / 2);
      }
      if (playerBoxRef.current) {
        playerBoxRef.current.style.transform = `rotate(${current.playerTurns * 90}deg)`;
      }
    };

    const tick = (time: number) => {
      recordFrame(time);
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;

      const current = runtimeRef.current;
      if (current.status !== "playing") {
        updateDom(current);
        return;
      }
      if (!current.started) {
        updateDom(current);
        frameId = requestAnimationFrame(tick);
        return;
      }

      const nextTime = current.time + delta;
      const gravityDirection = reversedGravity ? -1 : 1;
      const gravityMagnitude = reversedGravity ? 850 : 900;
      const nextVy = current.playerVy + gravityDirection * gravityMagnitude * delta;
      const nextY = current.playerY + nextVy * delta;
      const nextProgress = current.progress + speed * delta;
      let status: PrototypeStatus = "playing";
      let reason = "";
      let passed = current.passed;
      let collected = current.collected;
      let eventChanged = false;

      for (const gate of current.gates) {
        const screenX = getFlappyGateScreenX(gate, {
          progress: nextProgress,
          reverseDirection,
          stageWidth: STAGE_WIDTH,
        });
        const centerY = flappyGateCenterY(gate, nextTime, level.params);
        const gatePassed = reverseDirection ? screenX > playerX + PLAYER_SIZE : screenX + FLAPPY_GATE_WIDTH < playerX - PLAYER_SIZE;

        if (!gate.passed && gatePassed) {
          gate.passed = true;
          passed += 1;
          eventChanged = true;
        }

        if (gate.collectible && !gate.collected) {
          const collectibleY = clamp(centerY + gate.collectibleOffset * gapSize, centerY - gapSize / 2 + 22, centerY + gapSize / 2 - 22);
          const collectibleX = screenX + FLAPPY_GATE_WIDTH / 2;
          const dx = playerX - collectibleX;
          const dy = nextY - collectibleY;
          if (dx * dx + dy * dy <= 24 * 24) {
            gate.collected = true;
            collected += 1;
            eventChanged = true;
          }
        }

        const overlapsX = playerX + PLAYER_SIZE / 2 > screenX && playerX - PLAYER_SIZE / 2 < screenX + FLAPPY_GATE_WIDTH;
        if (overlapsX && nextTime >= current.invincibleUntil) {
          const blockedY = nextY - PLAYER_SIZE / 2 < centerY - gapSize / 2 || nextY + PLAYER_SIZE / 2 > centerY + gapSize / 2;
          if (blockedY) {
            status = "failed";
            reason = "撞到障碍";
          }
        }
      }

      if ((nextY < PLAYER_SIZE / 2 || nextY > STAGE_HEIGHT - PLAYER_SIZE / 2) && nextTime >= current.invincibleUntil) {
        status = "failed";
        reason = "飞出边界";
      }

      if (status === "playing" && passed >= gateCount) {
        if (collected >= collectibleCount) {
          status = "passed";
          reason = collectibleCount > 0 ? `通过终点，收集 ${collected}/${collectibleCount}` : `通过 ${passed}/${gateCount} 个门`;
        } else {
          status = "failed";
          reason = `漏收集道具 ${collected}/${collectibleCount}`;
        }
        for (const gate of current.gates) gate.passed = true;
        eventChanged = true;
      }

      current.time = nextTime;
      current.progress = nextProgress;
      current.playerY = nextY;
      current.playerVy = nextVy;
      current.passed = passed;
      current.collected = collected;

      if (mode === "base" && status === "failed") {
        const failures = current.failures + 1;
        if (failures <= BASE_FAILURE_LIMIT) {
          current.progress = Math.max(0, nextProgress - 92);
          current.playerY = initialPlayerY;
          current.playerVy = 0;
          current.failures = failures;
          current.invincibleUntil = nextTime + 1.15;
          current.status = "playing";
          current.reason = reason;
          updateDom(current);
          syncFlappyView(time);
          frameId = requestAnimationFrame(tick);
          return;
        }
        current.failures = failures;
        reason = "失败超过 3 次，进入下一关";
      }

      current.status = status;
      current.reason = reason;
      updateDom(current);

      if (status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncFlappyView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [backgroundRefs, collectibleCount, gapSize, gateCount, initialPlayerY, level.params, mode, playerX, recordFrame, reverseDirection, reversedGravity, speed, syncFlappyView]);

  const progressPercent = clamp((view.passed / gateCount) * 100, 0, 100);
  const showOverlay = mode === "prototype";

  useEffect(() => {
    if (!onComplete || completedRef.current || view.status === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    onComplete({
      gameId: "flappy",
      levelId: level.levelId,
      status: view.status,
      reason: latest.reason,
      elapsedMs: Math.round(latest.time * 1000),
      stats: {
        failures: latest.failures,
        progressPercent: Math.round(progressPercent),
        passedGates: latest.passed,
        gateCount,
        collected: latest.collected,
        collectibleCount,
        forcedAdvance: mode === "base" && view.status === "failed",
      },
    });
  }, [collectibleCount, gateCount, level.levelId, mode, onComplete, progressPercent, view.status]);

  return (
    <div className="prototype-game-wrap">
      <div className="mini-score">
        <span>进度 {view.passed}/{gateCount}</span>
        <span>收集 {view.collected}/{collectibleCount}</span>
        {mode === "base" ? <span>失败 {Math.min(view.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
      </div>
      <div
        className={`prototype-stage flappy-stage ${reverseDirection ? "reverse" : ""} ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        role="application"
        aria-label="Flappy Bird 型小游戏"
        onPointerDown={(event) => {
          event.preventDefault();
          pulse();
        }}
      >
        <MiniGameFpsBadge fps={fps} />
        <div className="flappy-background" aria-hidden="true">
          {backgroundRefs.map((ref) => {
            const spacing = 82;
            const drift = reverseDirection ? view.progress : -view.progress;
            const cycle = STAGE_WIDTH + spacing;
            const x = (((ref.x + drift * 0.55) % cycle) + cycle) % cycle - spacing;
            return (
              <span
                className={ref.kind}
                key={ref.id}
                ref={(node) => {
                  if (node) backgroundNodeRefs.current.set(ref.id, node);
                  else backgroundNodeRefs.current.delete(ref.id);
                }}
                style={{ transform: transformPoint3d(x, ref.y) }}
              />
            );
          })}
        </div>
        <div
          className={`flappy-start-platform ${view.started ? "started" : ""}`}
          style={{ transform: transformPoint3d(playerX - 50, FLAPPY_START_PLATFORM_Y) }}
        />
        {view.visibleGates.map((gate) => {
          const screenX = getFlappyGateScreenX(gate, {
            progress: view.progress,
            reverseDirection,
            stageWidth: STAGE_WIDTH,
          });
          const centerY = flappyGateCenterY(gate, view.time, level.params);
          const topHeight = centerY - gapSize / 2;
          const bottomY = centerY + gapSize / 2;
          const collectibleY = clamp(centerY + gate.collectibleOffset * gapSize, centerY - gapSize / 2 + 22, centerY + gapSize / 2 - 22);
          return (
            <div className={`flappy-gate-layer ${gate.moving ? "moving" : ""}`} key={gate.id}>
              <div
                className="flappy-gate top"
                ref={(node) => {
                  if (node) gateTopRefs.current.set(gate.id, node);
                  else gateTopRefs.current.delete(gate.id);
                }}
                style={{ height: `${STAGE_HEIGHT}px`, transform: transformPoint3d(screenX, topHeight - STAGE_HEIGHT), width: `${FLAPPY_GATE_WIDTH}px` }}
              />
              <div
                className="flappy-gate bottom"
                ref={(node) => {
                  if (node) gateBottomRefs.current.set(gate.id, node);
                  else gateBottomRefs.current.delete(gate.id);
                }}
                style={{
                  height: `${STAGE_HEIGHT}px`,
                  transform: transformPoint3d(screenX, bottomY),
                  width: `${FLAPPY_GATE_WIDTH}px`,
                }}
              />
              {gate.collectible && !gate.collected ? (
                <div
                  className="flappy-collectible"
                  ref={(node) => {
                    if (node) collectibleRefs.current.set(gate.id, node);
                    else collectibleRefs.current.delete(gate.id);
                  }}
                  style={{ transform: transformPoint3d(screenX + FLAPPY_GATE_WIDTH / 2 - 9, collectibleY - 9) }}
                />
              ) : null}
            </div>
          );
        })}
        <div
          className={`flappy-player-shell ${view.time < view.invincibleUntil ? "invincible" : ""}`}
          ref={playerShellRef}
          style={{ transform: transformPoint3d(playerX - PLAYER_SIZE / 2, view.playerY - PLAYER_SIZE / 2) }}
        >
          <div className={`prototype-player-box flappy-player ${reversedGravity ? "reversed" : ""}`} ref={playerBoxRef} style={{ transform: `rotate(${view.playerTurns * 90}deg)` }} />
        </div>
        {!view.started ? <div className="prototype-start-hint flappy-start-hint">点击开始</div> : null}
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}

function knifeSectorPath(zone: KnifeForbiddenZone) {
  const radius = KNIFE_WHEEL_SIZE / 2;
  const center = radius;
  const startDeg = zone.localStart;
  const endDeg = zone.localEnd < zone.localStart ? zone.localEnd + 360 : zone.localEnd;
  const span = endDeg - startDeg;
  const start = (startDeg * Math.PI) / 180;
  const end = (endDeg * Math.PI) / 180;
  const x1 = center + Math.cos(start) * radius;
  const y1 = center + Math.sin(start) * radius;
  const x2 = center + Math.cos(end) * radius;
  const y2 = center + Math.sin(end) * radius;
  const largeArc = span > 180 ? 1 : 0;
  return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function createKnifeRuntime(initialAngles: number[], hasCountdown: boolean, countdown: number): KnifeFrame {
  return {
    time: 0,
    rotation: 0,
    insertedAngles: [],
    initialAngles,
    failedAngles: [],
    failedAngle: null,
    shotIndex: 0,
    failures: 0,
    timer: hasCountdown ? countdown : null,
    flying: false,
    launcherReadyAt: 0,
    status: "playing",
    reason: "",
  };
}

function makeKnifeView(frame: KnifeFrame, launcherVisible: boolean): KnifeViewFrame {
  return {
    ...frame,
    failedAngles: [...frame.failedAngles],
    initialAngles: [...frame.initialAngles],
    insertedAngles: [...frame.insertedAngles],
    launcherVisible,
  };
}

function KnifeHitPrototype({
  level,
  mode,
  runSeed,
  onBackToSelect,
  onComplete,
  onRestart,
}: {
  level: MiniGameLevelConfig;
  mode: MiniGameRunMode;
  runSeed: string;
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart: () => void;
}) {
  const shotCount = numberParam(level.params, "shotCount", 6);
  const countdown = numberParam(level.params, "shotCountdown", 0);
  const hasCountdown = typeof level.params.shotCountdown === "number";
  const sineRotationEnabled = booleanParam(level.params, "sineRotationEnabled");
  const phaseDuration = numberParam(level.params, "phaseDuration", 2.8);
  const sweepPerPhase = numberParam(level.params, "sweepPerPhase", 405);
  const baseRotationSpeed = numberParam(level.params, "baseRotationSpeed", 92);
  const forbiddenArcs = useMemo<AngleArc[]>(() => generateKnifeForbiddenZones(level, runSeed), [level, runSeed]);
  const forbiddenZones = useMemo<KnifeForbiddenZone[]>(
    () => forbiddenArcs.map((zone, index) => ({ id: index, localStart: zone.start, localEnd: zone.end })),
    [forbiddenArcs],
  );
  const initialAngles = useMemo(() => generateKnifeInitialAngles(level, runSeed, forbiddenArcs), [forbiddenArcs, level, runSeed]);
  const timeoutRef = useRef<number | null>(null);
  const launcherReadyTimeoutRef = useRef<number | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const initialRuntime = useMemo(() => createKnifeRuntime(initialAngles, hasCountdown, countdown), [countdown, hasCountdown, initialAngles]);
  const runtimeRef = useRef<KnifeFrame>(initialRuntime);
  const launcherVisibleRef = useRef(true);
  const lastTimerSyncRef = useRef(0);
  const completedRef = useRef(false);
  const isLowPowerDevice = useMiniGameLowPowerMode();
  const { fps, recordFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const [view, setView] = useState<KnifeViewFrame>(() => makeKnifeView(initialRuntime, true));

  const syncKnifeView = useCallback(() => {
    setView(makeKnifeView(runtimeRef.current, launcherVisibleRef.current));
  }, []);

  const scheduleLauncherReady = useCallback(() => {
    if (launcherReadyTimeoutRef.current !== null) window.clearTimeout(launcherReadyTimeoutRef.current);
    launcherVisibleRef.current = false;
    launcherReadyTimeoutRef.current = window.setTimeout(() => {
      const current = runtimeRef.current;
      if (current.status === "playing" && !current.flying) {
        launcherVisibleRef.current = true;
        syncKnifeView();
      }
      launcherReadyTimeoutRef.current = null;
    }, 60);
  }, [syncKnifeView]);

  const resolveShot = useCallback(() => {
    const current = runtimeRef.current;
    if (current.status !== "playing") return;
    const impactAngle = getLocalHitAngle(KNIFE_FIRE_ANGLE, current.rotation);
    const outcome = resolveKnifeShotOutcome({
      collisionDegrees: KNIFE_COLLISION_DEGREES,
      forbiddenZones: forbiddenArcs,
      impactAngle,
      initialAngles: current.initialAngles,
      insertedAngles: [...current.insertedAngles, ...current.failedAngles],
    });

    if (outcome.kind === "collision") {
      if (mode === "base") {
        const nextShotIndex = current.shotIndex + 1;
        const nextFailures = current.failures + 1;
        current.failedAngles.push(outcome.impactAngle);
        current.failedAngle = outcome.impactAngle;
        current.failures = nextFailures;
        current.flying = false;
        current.launcherReadyAt = current.time + 0.06;
        current.reason = "撞到已插入长条";
        current.shotIndex = nextShotIndex;
        current.status = nextShotIndex >= shotCount ? "failed" : "playing";
        current.timer = hasCountdown ? countdown : null;
        if (current.status === "playing") scheduleLauncherReady();
        else launcherVisibleRef.current = false;
        syncKnifeView();
        return;
      }
      current.failedAngle = outcome.impactAngle;
      current.flying = false;
      current.status = "failed";
      current.reason = "撞到已插入长条";
      launcherVisibleRef.current = false;
      syncKnifeView();
      return;
    }
    if (outcome.kind === "forbidden") {
      if (mode === "base") {
        const nextShotIndex = current.shotIndex + 1;
        const nextFailures = current.failures + 1;
        current.failedAngles.push(outcome.impactAngle);
        current.failedAngle = outcome.impactAngle;
        current.failures = nextFailures;
        current.flying = false;
        current.launcherReadyAt = current.time + 0.06;
        current.reason = "命中危险区域";
        current.shotIndex = nextShotIndex;
        current.status = nextShotIndex >= shotCount ? "failed" : "playing";
        current.timer = hasCountdown ? countdown : null;
        if (current.status === "playing") scheduleLauncherReady();
        else launcherVisibleRef.current = false;
        syncKnifeView();
        return;
      }
      current.failedAngle = outcome.impactAngle;
      current.flying = false;
      current.status = "failed";
      current.reason = "命中危险区域";
      launcherVisibleRef.current = false;
      syncKnifeView();
      return;
    }

    const nextShotIndex = current.shotIndex + 1;
    current.insertedAngles.push(outcome.impactAngle);
    current.flying = false;
    current.shotIndex = nextShotIndex;
    if (nextShotIndex >= shotCount) {
      current.status = current.failures > 0 && mode === "base" ? "failed" : "passed";
      current.reason = `全部 ${shotCount} 发命中`;
      launcherVisibleRef.current = false;
      syncKnifeView();
      return;
    }

    current.launcherReadyAt = current.time + 0.06;
    current.timer = hasCountdown ? countdown : null;
    scheduleLauncherReady();
    syncKnifeView();
  }, [countdown, forbiddenArcs, hasCountdown, mode, scheduleLauncherReady, shotCount, syncKnifeView]);

  const launch = useCallback(() => {
    const current = runtimeRef.current;
    if (current.status !== "playing" || current.flying) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (launcherReadyTimeoutRef.current !== null) window.clearTimeout(launcherReadyTimeoutRef.current);
    launcherReadyTimeoutRef.current = null;
    current.flying = true;
    launcherVisibleRef.current = true;
    syncKnifeView();
    timeoutRef.current = window.setTimeout(() => {
      resolveShot();
      timeoutRef.current = null;
    }, KNIFE_FLIGHT_MS);
  }, [resolveShot, syncKnifeView]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();
    const tick = (time: number) => {
      recordFrame(time);
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;

      const current = runtimeRef.current;
      if (current.status !== "playing") {
        if (wheelRef.current) wheelRef.current.style.transform = `rotate(${current.rotation}deg)`;
        return;
      }

      const rotationSpeed = sineRotationEnabled ? getSineAngularVelocity(current.time, phaseDuration, sweepPerPhase) : baseRotationSpeed;
      const nextTime = current.time + delta;
      current.time = nextTime;
      current.rotation = normalizeDegrees(current.rotation + rotationSpeed * delta);
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${current.rotation}deg)`;

      let shouldSync = false;
      if (current.timer !== null && !current.flying) {
        current.timer -= delta;
        if (current.timer <= 0) {
          if (mode === "base") {
            const nextShotIndex = current.shotIndex + 1;
            current.failures += 1;
            current.launcherReadyAt = nextTime + 0.06;
            current.reason = "倒计时结束";
            current.shotIndex = nextShotIndex;
            current.status = nextShotIndex >= shotCount ? "failed" : "playing";
            current.timer = hasCountdown ? countdown : null;
            if (current.status === "playing") scheduleLauncherReady();
            else launcherVisibleRef.current = false;
          } else {
            current.status = "failed";
            current.reason = "倒计时结束";
            current.timer = 0;
            launcherVisibleRef.current = false;
          }
          shouldSync = true;
        }
      }

      if (hasCountdown && time - lastTimerSyncRef.current >= MINI_GAME_TIMER_SYNC_MS) {
        lastTimerSyncRef.current = time;
        shouldSync = true;
      }

      if (shouldSync) syncKnifeView();
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (launcherReadyTimeoutRef.current !== null) window.clearTimeout(launcherReadyTimeoutRef.current);
    };
  }, [baseRotationSpeed, countdown, hasCountdown, mode, phaseDuration, recordFrame, scheduleLauncherReady, shotCount, sineRotationEnabled, sweepPerPhase, syncKnifeView]);

  const remaining = shotCount - view.shotIndex;
  const wheelRotation = `rotate(${view.rotation}deg)`;
  const showLauncher = view.status === "playing" && (view.flying || view.launcherVisible);
  const showOverlay = mode === "prototype";

  useEffect(() => {
    if (!onComplete || completedRef.current || view.status === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    onComplete({
      gameId: "knife",
      levelId: level.levelId,
      status: view.status,
      reason: latest.reason,
      elapsedMs: Math.round(latest.time * 1000),
      stats: {
        failures: latest.failures,
        hits: latest.insertedAngles.length,
        shotCount,
        fired: latest.shotIndex,
        forcedAdvance: mode === "base" && view.status === "failed",
      },
    });
  }, [level.levelId, mode, onComplete, shotCount, view.status]);

  return (
    <div className="prototype-game-wrap">
      <div className="mini-score">
        <span>已发射 {view.shotIndex}/{shotCount}</span>
        {mode === "base" ? <span>命中 {view.insertedAngles.length}/{shotCount}</span> : null}
        {hasCountdown ? <span>倒计时 {(view.timer ?? 0).toFixed(1)}s</span> : null}
        {sineRotationEnabled ? <span>正弦转速</span> : null}
      </div>
      <div
        className={`prototype-stage knife-stage ${view.flying ? "firing" : ""} ${remaining === 1 ? "final-shot-ready" : ""} ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Knife Hit 型小游戏，点击发射"
        onPointerDown={(event) => {
          event.preventDefault();
          launch();
        }}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            launch();
          }
        }}
      >
        <MiniGameFpsBadge fps={fps} />
        <div className="knife-wheel-wrap">
          <div className="knife-wheel" ref={wheelRef} style={{ transform: wheelRotation }}>
            <svg className="knife-wheel-svg" viewBox={`0 0 ${KNIFE_WHEEL_SIZE} ${KNIFE_WHEEL_SIZE}`} aria-hidden="true">
              <circle cx={KNIFE_WHEEL_SIZE / 2} cy={KNIFE_WHEEL_SIZE / 2} r={KNIFE_WHEEL_SIZE / 2 - 3} />
              {forbiddenZones.map((zone) => (
                <path d={knifeSectorPath(zone)} key={zone.id} />
              ))}
            </svg>
            {view.initialAngles.map((angle) => (
              <span className="knife-arrow knife-stuck initial" key={`initial-${angle}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
            ))}
            {view.insertedAngles.map((angle, index) => (
              <span className="knife-arrow knife-stuck" key={`${angle}-${index}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
            ))}
            {view.failedAngles.map((angle, index) => (
              <span className="knife-arrow knife-stuck failed" key={`failed-${angle}-${index}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
            ))}
            {view.failedAngle !== null ? (
              mode === "prototype" ? <span className="knife-arrow knife-stuck failed" style={{ transform: `rotate(${view.failedAngle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} /> : null
            ) : null}
          </div>
        </div>
        {showLauncher ? <div className={`knife-arrow knife-launcher ${view.flying ? "flying" : ""}`} /> : null}
        <div className="knife-shot-stack" aria-hidden="true">
          {Array.from({ length: remaining }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}
