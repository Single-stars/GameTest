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

import { PlayerAvatar, type PlayerAvatarGravity, type PlayerAvatarState } from "@/features/player-avatar/player-avatar";
import {
  BASE_FAILURE_LIMIT,
  DEBUG_MINI_GAME_FPS,
  MINI_GAME_UI_SYNC_MS,
  MiniGameFpsBadge,
  MiniGamePerfPanel,
  PLAYER_SIZE,
  PrototypeEndOverlay,
  booleanParam,
  clamp,
  numberParam,
  transformPoint3d,
  useMiniGameFpsCounter,
  useMiniGameStageSize,
  useMiniGamePerfMonitor,
  type MiniGameCompletion,
  type MiniGameRunMode,
  type MiniGameStageSize,
  type PrototypeStatus,
} from "@/features/mini-games/common";
import {
  createSquareJumpBaseAdvancePlan,
  createSquareJumpBaseJumpPlan,
  fitSquareJumpBaseCamera,
  generateSquareJumpPlatformSequence,
  getSquareJumpBasePlatformHeight,
  getSquareJumpBasePlatformX,
  getSquareJumpBasePlayerXOnPlatform,
  getSquareJumpChargeAt,
  resolveSquareJumpActiveGravity,
  resolveSquareJumpBaseFlyAwayLanding,
  sampleSquareJumpBaseAdvanceCamera,
  sampleSquareJumpBaseFlyAway,
  sampleSquareJumpBaseJump,
  sampleSquareJumpBaseRiseIn,
  selectSquareJumpVisiblePlatforms,
  shouldSquareJumpDeferLandingResolution,
  type MiniGameLevelConfig,
  type SquareJumpBaseAdvancePlan,
  type SquareJumpBaseJumpPlan,
  type SquareJumpBasePlatform,
} from "@/lib/mini-games";

const DEBUG_MINI_GAME_HITBOX = false;
type SquareJumpBaseCamera = ReturnType<typeof fitSquareJumpBaseCamera>;
type SquareGravityState = PlayerAvatarGravity & NonNullable<SquareJumpBasePlatform["gravity"]>;

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

function fitSquareBaseCamera(currentPlatform: SquareJumpBasePlatform, nextPlatform: SquareJumpBasePlatform, playerX: number, stageSize: MiniGameStageSize) {
  return fitSquareJumpBaseCamera({
    currentPlatform,
    nextPlatform,
    playerX,
    stageBottom: stageSize.height,
    stageHeight: stageSize.height,
    stageWidth: stageSize.width,
  });
}

function squareBaseWorldTransform(camera: SquareJumpBaseCamera, stageSize: MiniGameStageSize) {
  return `translate3d(${stageSize.width / 2}px, ${stageSize.height / 2}px, 0) scale(${camera.scale}) translate3d(${-camera.cameraX}px, ${-camera.cameraY}px, 0)`;
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

const SQUARE_JUMP_ADVANCE_DELAY = 0.16;

function getSquareJumpPlatformY(stageHeight: number) {
  return stageHeight * 0.72;
}

function resolveSquareJumpPlayerAvatarState(view: SquareJumpUnifiedRuntime): PlayerAvatarState {
  if (view.status === "passed") return "success";
  if (view.time < view.respawnUntil) return "shield";
  if (view.state === "charging" || view.state === "airCharging") return "charge";
  if (view.feedback === "Good") return "land";
  if (view.state === "jumping") return "jump";
  if (view.state === "falling") return "fall";
  return "idle";
}

function toSquareJumpAvatarVar(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function setSquareJumpAvatarChargeVars(node: HTMLElement | null, current: SquareJumpUnifiedRuntime) {
  if (!node) return;
  const charge = current.state === "charging" || current.state === "airCharging" ? current.charge : 0;
  node.style.setProperty("--player-avatar-charge", toSquareJumpAvatarVar(charge));
  node.style.setProperty("--player-avatar-charge-offset", `${toSquareJumpAvatarVar(charge * 4)}px`);
  node.style.setProperty("--player-avatar-charge-scale-x", toSquareJumpAvatarVar(1 + charge * 0.18));
  node.style.setProperty("--player-avatar-charge-scale-y", toSquareJumpAvatarVar(1 - charge * 0.24));
}

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

function createSquareJumpUnifiedRuntime(level: MiniGameLevelConfig, runSeed: string, stageSize: MiniGameStageSize): SquareJumpUnifiedRuntime {
  const platformY = getSquareJumpPlatformY(stageSize.height);
  const platforms = generateSquareJumpPlatformSequence(level, runSeed, {
    count: numberParam(level.params, "jumpsRequired", 5) + 1,
    platformY,
    startX: clamp(stageSize.width * (120 / 360), 88, stageSize.width - 88),
    startWidth: 128,
  });
  const currentPlatform = platforms[0];
  const nextPlatform = platforms[1];
  return {
    activeGravity: "normal",
    advancePlan: null,
    advanceStartedAt: 0,
    camera: fitSquareBaseCamera(currentPlatform, nextPlatform, currentPlatform.x, stageSize),
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

function recoverSquareJumpBaseMiss(current: SquareJumpUnifiedRuntime, reason: string, stageSize: MiniGameStageSize) {
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
  const cameraEnd = fitSquareBaseCamera(landedPlatform, futurePlatform, current.playerX, stageSize);
  current.nextIndex = futureIndex;
  current.nextPlatform = futurePlatform;
  current.timer = null;
  current.exitingPlatform = leavingPlatform;
  current.exitingVisualOffsetY = 0;
  current.advancePlan = createSquareJumpBaseAdvancePlan({
    cameraEnd,
    cameraStart,
    stageHeight: stageSize.height,
  });
  current.advanceStartedAt = current.time + SQUARE_JUMP_ADVANCE_DELAY;
  current.nextVisualOffsetY = current.advancePlan.nextPlatformStartVisualOffsetY;
  current.state = "advancing";
  current.status = "playing";
  return true;
}

export function SquareJumpPrototype({
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
  const { stageRef, stageSize } = useMiniGameStageSize<HTMLDivElement>();
  const stageWidth = stageSize.width;
  const stageHeight = stageSize.height;
  const platformY = getSquareJumpPlatformY(stageHeight);
  const requiredJumps = numberParam(level.params, "jumpsRequired", 5);
  const doubleJumpEnabled = booleanParam(level.params, "doubleJumpEnabled");
  const cyclingCharge = doubleJumpEnabled && booleanParam(level.params, "cyclingChargeOnDoubleJump");
  const flyAwayLandingCatchDepth = numberParam(level.params, "flyAwayLandingCatchDepth", PLAYER_SIZE * 1.25);
  const targetLandingPadding = numberParam(level.params, "targetLandingPadding", 12);
  const initialRuntime = useMemo(() => createSquareJumpUnifiedRuntime(level, runSeed, stageSize), [level, runSeed, stageSize]);
  const runtimeRef = useRef<SquareJumpUnifiedRuntime>(initialRuntime);
  const worldLayerRef = useRef<HTMLDivElement | null>(null);
  const progressBackgroundRef = useRef<HTMLDivElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const playerAvatarRef = useRef<HTMLSpanElement | null>(null);
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

  useEffect(() => {
    runtimeRef.current = initialRuntime;
    lastUiSyncRef.current = 0;
    completedRef.current = false;
    const timer = window.setTimeout(() => {
      setView(makeSquareJumpUnifiedView(initialRuntime));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRuntime]);

  const updateSquareJumpDom = useCallback(
    (current: SquareJumpUnifiedRuntime) => {
      if (progressBackgroundRef.current) {
        const backgroundStyle = squareProgressBackgroundStyle(current.camera);
        progressBackgroundRef.current.style.backgroundPosition = String(backgroundStyle.backgroundPosition ?? "");
      }
      if (worldLayerRef.current) {
        worldLayerRef.current.style.transform = squareBaseWorldTransform(current.camera, stageSize);
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
          stageBottom: stageHeight,
          stageHeight,
        });
        node.style.display = "";
        node.style.transform = transformPoint3d(platformX - platform.width / 2, platform.y + visualOffsetY);
        node.style.height = `${platformHeight}px`;
        node.style.width = `${platform.width}px`;
      }

      if (playerShellRef.current) {
        playerShellRef.current.style.transform = transformPoint3d(current.playerX - PLAYER_SIZE / 2, current.playerY - PLAYER_SIZE / 2);
      }
      setSquareJumpAvatarChargeVars(playerAvatarRef.current, current);
      if (tutorialPreviewRef.current) {
        const previewPlan = level.levelId === "square-jump-base" && current.jumps < 3 && current.state === "charging" ? createSquareJumpPlan(level, current) : null;
        if (previewPlan) {
          tutorialPreviewRef.current.style.display = "";
          tutorialPreviewRef.current.style.transform = transformPoint3d(
            stageWidth / 2 + (previewPlan.landingX - current.camera.cameraX) * current.camera.scale - 15,
            stageHeight / 2 + (platformY - current.camera.cameraY) * current.camera.scale + 12,
          );
        } else {
          tutorialPreviewRef.current.style.display = "none";
        }
      }
    },
    [level, platformY, stageHeight, stageSize, stageWidth],
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
      const cameraEnd = fitSquareBaseCamera(landedPlatform, futurePlatform, current.playerX, stageSize);
      current.nextIndex = futureIndex;
      current.nextPlatform = futurePlatform;
      current.timer = null;
      current.exitingPlatform = leavingPlatform;
      current.exitingVisualOffsetY = 0;
      current.advancePlan = createSquareJumpBaseAdvancePlan({
        cameraEnd,
        cameraStart,
        stageHeight,
      });
      current.advanceStartedAt = current.time + SQUARE_JUMP_ADVANCE_DELAY;
      current.nextVisualOffsetY = current.advancePlan.nextPlatformStartVisualOffsetY;
      current.state = "advancing";
      return false;
    },
    [requiredJumps, stageHeight, stageSize, syncView],
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
            if (mode === "base" && recoverSquareJumpBaseMiss(current, "掉下去了", stageSize)) {
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
          const screenX = stageWidth / 2 + (current.playerX - current.camera.cameraX) * current.camera.scale;
          const screenY = stageHeight / 2 + (current.playerY - current.camera.cameraY) * current.camera.scale;
          if (screenX > stageWidth + PLAYER_SIZE || screenX < -PLAYER_SIZE * 2 || screenY > stageHeight + PLAYER_SIZE) {
            if (mode === "base" && recoverSquareJumpBaseMiss(current, "掉下去了", stageSize)) {
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
  }, [advanceToNextPlatform, cyclingCharge, doubleJumpEnabled, fail, flyAwayLandingCatchDepth, level, mode, perfEnabled, recordDebugFrame, recordPerfFrame, requiredJumps, stageHeight, stageSize, stageWidth, syncView, targetLandingPadding, updateSquareJumpDom]);

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
    transform: squareBaseWorldTransform(view.camera, stageSize),
    transformOrigin: "0 0",
    zIndex: 2,
  };
  const platforms = selectSquareJumpVisiblePlatforms(view.currentPlatform, view.nextPlatform, view.exitingPlatform);
  const tutorialPreviewPlan = level.levelId === "square-jump-base" && view.jumps < 3 && view.state === "charging" ? createSquareJumpPlan(level, view) : null;
  const isCharging = view.state === "charging" || view.state === "airCharging";

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
        ref={stageRef}
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
              stageBottom: stageHeight,
              stageHeight,
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
            <PlayerAvatar
              charge={view.charge}
              gravity={view.activeGravity}
              mood={isCharging ? "focused" : "normal"}
              rotationTurns={view.playerTurns}
              rootRef={playerAvatarRef}
              state={resolveSquareJumpPlayerAvatarState(view)}
              visualScale={1.18}
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
                stageWidth / 2 + (tutorialPreviewPlan.landingX - view.camera.cameraX) * view.camera.scale - 15,
                stageHeight / 2 + (platformY - view.camera.cameraY) * view.camera.scale + 12,
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
