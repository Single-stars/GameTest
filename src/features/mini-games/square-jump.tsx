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

import { PlayerAvatar, type PlayerAvatarDirection, type PlayerAvatarGravity, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";
import { RemoteStateSmoother } from "@/features/game-sync/remote-state-smoother";
import type { SelfGameState } from "@/features/game-sync/types";
import {
  MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
  MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
  MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
  MULTIPLAYER_STATE_SYNC_MS,
} from "@/lib/multiplayer/protocol";
import {
  BASE_FAILURE_LIMIT,
  DEBUG_MINI_GAME_FPS,
  MINI_GAME_COMPLETION_DELAY_MS,
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
  useMiniGameScreenShake,
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
export type SquareJumpStateSnapshot = {
  cameraX: number;
  cameraY: number;
  cameraScale: number;
  charge: number;
  direction: PlayerAvatarDirection;
  elapsedMs: number;
  exitingPlatformIndex?: number;
  exitingPlatformOffsetY?: number;
  failures: number;
  gravity: SquareGravityState;
  nextPlatformIndex: number;
  nextPlatformOffsetY: number;
  phase: SquareJumpUnifiedState;
  platformIndex: number;
  progress: number;
  status: PrototypeStatus;
  turns: number;
  x: number;
  y: number;
};

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
  if (gravity === "light") return "^";
  if (gravity === "heavy") return "v";
  return ".";
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
type SquareJumpCoOpRole = "first" | "second";
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
  lockedNextVisualOffsetY: number | null;
  feedback: "Good" | "提醒" | "";
  feedbackUntil: number;
  respawnUntil: number;
  timer: number | null;
  status: PrototypeStatus;
  reason: string;
};

const SQUARE_JUMP_ADVANCE_DELAY = 0.16;
const SQUARE_JUMP_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_STATE_SYNC_MS;

function getSquareJumpPlatformY(stageHeight: number) {
  return stageHeight * 0.72;
}

function resolveSquareJumpPlayerAvatarView(view: SquareJumpUnifiedRuntime): PlayerAvatarView {
  if (view.status === "passed") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (view.time < view.respawnUntil) return { action: "idle", expression: "neutral", effect: "shield" };
  if (view.state === "charging" || view.state === "airCharging") return { action: "charge", expression: "neutral" };
  if (view.feedback === "Good") return { action: "land", expression: "neutral" };
  if (view.state === "jumping") return { action: "idle", expression: "neutral" };
  if (view.state === "falling") return { action: "idle", expression: "scared" };
  return { action: "idle", expression: "neutral" };
}

function resolveSquareJumpCoOpSkin(coOpSkinId: string | null | undefined): PlayerAvatarSkin | undefined {
  return coOpSkinId ? resolvePlayerAvatarSkin(coOpSkinId) : undefined;
}

function resolveSquareJumpRemoteSkin(remotePlayer: { skinId?: string } | null | undefined): PlayerAvatarSkin {
  return resolvePlayerAvatarSkin(remotePlayer?.skinId);
}

function resolveSquareJumpRemoteAvatarView(remoteState: SelfGameState | null | undefined): PlayerAvatarView {
  if (remoteState?.status === "finished") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (remoteState?.status === "failed") return { action: "hit", expression: "hurt" };
  return remoteState?.direction && remoteState.direction !== "none"
    ? { action: "charge", expression: "neutral" }
    : { action: "idle", expression: "neutral" };
}

function resolveSquareJumpTurnRole(turnIndex: number): SquareJumpCoOpRole {
  return turnIndex % 2 === 0 ? "first" : "second";
}

function canControlSquareJumpCoOpTurn(runtime: Pick<SquareJumpUnifiedRuntime, "playerTurns">, coOpRole: SquareJumpCoOpRole | null | undefined) {
  if (!coOpRole) return true;
  return resolveSquareJumpTurnRole(runtime.playerTurns) === coOpRole;
}

function isSquareJumpUnifiedState(value: unknown): value is SquareJumpUnifiedState {
  return value === "idle" || value === "charging" || value === "jumping" || value === "airCharging" || value === "falling" || value === "advancing" || value === "success" || value === "failed";
}

function resolveSquareJumpPlatformIndex(value: unknown, fallback: number, maxIndex: number) {
  return typeof value === "number" && Number.isFinite(value) ? clamp(Math.round(value), 0, maxIndex) : clamp(fallback, 0, maxIndex);
}

function syncSquareJumpAuthoritativePlatformWindow(runtime: SquareJumpUnifiedRuntime, authoritativeState: SelfGameState) {
  const maxIndex = Math.max(0, runtime.platforms.length - 1);
  const platformIndex = resolveSquareJumpPlatformIndex(authoritativeState.platformIndex, Math.round((authoritativeState.progress ?? 0) * maxIndex), maxIndex);
  const nextPlatformIndex = resolveSquareJumpPlatformIndex(authoritativeState.nextPlatformIndex, platformIndex + 1, maxIndex);
  runtime.currentIndex = platformIndex;
  runtime.nextIndex = nextPlatformIndex;
  runtime.currentPlatform = runtime.platforms[platformIndex] ?? runtime.currentPlatform;
  runtime.nextPlatform = runtime.platforms[nextPlatformIndex] ?? runtime.nextPlatform;
  runtime.nextVisualOffsetY = typeof authoritativeState.nextPlatformOffsetY === "number" ? authoritativeState.nextPlatformOffsetY : 0;
  runtime.lockedNextVisualOffsetY = null;
  if (typeof authoritativeState.exitingPlatformIndex === "number") {
    const exitingIndex = resolveSquareJumpPlatformIndex(authoritativeState.exitingPlatformIndex, platformIndex, maxIndex);
    runtime.exitingPlatform = runtime.platforms[exitingIndex] ?? null;
    runtime.exitingVisualOffsetY = typeof authoritativeState.exitingPlatformOffsetY === "number" ? authoritativeState.exitingPlatformOffsetY : 0;
  } else {
    runtime.exitingPlatform = null;
    runtime.exitingVisualOffsetY = 0;
  }
}

function hasSquareJumpPlatformWindowChanged(runtime: SquareJumpUnifiedRuntime, authoritativeState: SelfGameState | null | undefined) {
  if (!authoritativeState) return false;
  const maxIndex = Math.max(0, runtime.platforms.length - 1);
  const platformIndex = resolveSquareJumpPlatformIndex(authoritativeState.platformIndex, Math.round((authoritativeState.progress ?? 0) * maxIndex), maxIndex);
  const nextPlatformIndex = resolveSquareJumpPlatformIndex(authoritativeState.nextPlatformIndex, platformIndex + 1, maxIndex);
  const exitingPlatformIndex =
    typeof authoritativeState.exitingPlatformIndex === "number"
      ? resolveSquareJumpPlatformIndex(authoritativeState.exitingPlatformIndex, platformIndex, maxIndex)
      : null;
  const currentExitingPlatformIndex = runtime.exitingPlatform
    ? runtime.platforms.findIndex((platform) => platform.id === runtime.exitingPlatform?.id)
    : null;
  return (
    runtime.currentIndex !== platformIndex ||
    runtime.nextIndex !== nextPlatformIndex ||
    currentExitingPlatformIndex !== exitingPlatformIndex
  );
}

function applySquareJumpAuthoritativeState(runtime: SquareJumpUnifiedRuntime, authoritativeState: SelfGameState | null | undefined) {
  if (!authoritativeState) return false;
  if (
    typeof authoritativeState.x !== "number" ||
    typeof authoritativeState.y !== "number" ||
    typeof authoritativeState.cameraX !== "number" ||
    typeof authoritativeState.cameraY !== "number" ||
    typeof authoritativeState.cameraScale !== "number"
  ) {
    return false;
  }
  runtime.playerX = authoritativeState.x;
  runtime.playerY = authoritativeState.y;
  runtime.camera.cameraX = authoritativeState.cameraX;
  runtime.camera.cameraY = authoritativeState.cameraY;
  runtime.camera.scale = authoritativeState.cameraScale;
  syncSquareJumpAuthoritativePlatformWindow(runtime, authoritativeState);
  runtime.time = Math.max(runtime.time, (authoritativeState.elapsedMs ?? 0) / 1000);
  if (typeof authoritativeState.charge === "number") {
    runtime.charge = clamp(authoritativeState.charge, 0, 1);
    runtime.chargeElapsedMs = runtime.charge * SQUARE_BASE_MAX_HOLD_MS;
  }
  if (authoritativeState.gravity) {
    runtime.activeGravity = authoritativeState.gravity;
  }
  runtime.failures = authoritativeState.failures ?? runtime.failures;
  runtime.jumps = Math.round((authoritativeState.progress ?? 0) * Math.max(1, runtime.platforms.length - 1));
  runtime.playerTurns = authoritativeState.turns ?? runtime.playerTurns;
  runtime.status = authoritativeState.status === "finished" ? "passed" : authoritativeState.status;
  runtime.started = runtime.status === "playing";
  if (runtime.status === "playing" && isSquareJumpUnifiedState(authoritativeState.phase)) {
    runtime.state = authoritativeState.phase;
    runtime.jumpPlan = null;
    runtime.advancePlan = null;
    runtime.playerOffsetOnCurrent = runtime.playerX - getSquareJumpBasePlatformX(runtime.currentPlatform, runtime.time);
  }
  if (runtime.status !== "playing") {
    runtime.state = runtime.status === "passed" ? "success" : "failed";
    runtime.charge = 0;
    runtime.chargeElapsedMs = 0;
    runtime.jumpPlan = null;
  }
  return true;
}

function makeSquareJumpRuntimeState(runtime: SquareJumpUnifiedRuntime, chargeHeld = false): SquareJumpStateSnapshot {
  const exitingPlatformIndex = runtime.exitingPlatform
    ? runtime.platforms.findIndex((platform) => platform.id === runtime.exitingPlatform?.id)
    : -1;
  return {
    cameraX: runtime.camera.cameraX,
    cameraY: runtime.camera.cameraY,
    cameraScale: runtime.camera.scale,
    charge: runtime.charge,
    direction: chargeHeld ? "right" : "none",
    elapsedMs: Math.round(runtime.time * 1000),
    exitingPlatformIndex: exitingPlatformIndex >= 0 ? exitingPlatformIndex : undefined,
    exitingPlatformOffsetY: exitingPlatformIndex >= 0 ? runtime.exitingVisualOffsetY : undefined,
    failures: runtime.failures,
    gravity: runtime.activeGravity,
    nextPlatformIndex: runtime.nextIndex,
    nextPlatformOffsetY: runtime.nextVisualOffsetY,
    phase: runtime.state,
    platformIndex: runtime.currentIndex,
    progress: Number((runtime.jumps / Math.max(1, runtime.platforms.length - 1)).toFixed(4)),
    status: runtime.status,
    turns: runtime.playerTurns,
    x: runtime.playerX,
    y: runtime.playerY,
  };
}

function toSquareJumpAvatarVar(value: number) {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function setSquareJumpAvatarChargeVarsFromCharge(node: HTMLElement | null, charge: number) {
  if (!node) return;
  node.style.setProperty("--player-avatar-charge", toSquareJumpAvatarVar(charge));
  node.style.setProperty("--player-avatar-charge-offset", `${toSquareJumpAvatarVar(charge * 4)}px`);
  node.style.setProperty("--player-avatar-charge-scale-x", toSquareJumpAvatarVar(1 + charge * 0.18));
  node.style.setProperty("--player-avatar-charge-scale-y", toSquareJumpAvatarVar(1 - charge * 0.24));
}

function setSquareJumpAvatarChargeVars(node: HTMLElement | null, current: SquareJumpUnifiedRuntime) {
  setSquareJumpAvatarChargeVarsFromCharge(node, current.state === "charging" || current.state === "airCharging" ? current.charge : 0);
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
    lockedNextVisualOffsetY: null,
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
  current.nextVisualOffsetY = current.lockedNextVisualOffsetY ?? sampleSquareJumpBaseRiseIn(current.advancePlan, riseProgress);
  current.exitingVisualOffsetY = current.advancePlan.nextPlatformStartVisualOffsetY * 2.1 * (1 - sampleSquareJumpBaseRiseIn(current.advancePlan, riseProgress) / current.advancePlan.nextPlatformStartVisualOffsetY);

  if (advanceProgress >= 1 && riseProgress >= 1) {
    current.camera = { ...current.advancePlan.cameraEnd };
    current.nextVisualOffsetY = 0;
    current.lockedNextVisualOffsetY = null;
    current.exitingPlatform = null;
    current.exitingVisualOffsetY = 0;
    current.advancePlan = null;
    if (current.state === "advancing") current.state = "idle";
  }
}

function recoverSquareJumpBaseMiss(current: SquareJumpUnifiedRuntime, reason: string, logicStageSize: MiniGameStageSize, unlimitedRespawn = false) {
  const failures = current.failures + 1;
  current.failures = failures;
  current.reason = reason;
  current.advancePlan = null;
  current.jumpPlan = null;
  current.charge = 0;
  current.chargeElapsedMs = 0;
  current.doubleJumpUsed = false;

  if (!unlimitedRespawn && failures >= BASE_FAILURE_LIMIT) {
    current.reason = "???? 3 ???????";
    current.state = "failed";
    current.status = "failed";
    return true;
  }

  const respawnPlatform = { ...current.currentPlatform };
  const nextVisualOffsetY = current.nextVisualOffsetY;
  current.respawnUntil = current.time + 1.1;
  current.playerX = getSquareJumpBasePlatformX(respawnPlatform, current.time);
  current.playerY = respawnPlatform.y - PLAYER_SIZE / 2;
  current.playerOffsetOnCurrent = 0;
  current.currentPlatform = respawnPlatform;

  const cameraStart = { ...current.camera };
  current.timer = null;
  current.exitingPlatform = null;
  current.exitingVisualOffsetY = 0;
  current.advancePlan = createSquareJumpBaseAdvancePlan({
    cameraEnd: fitSquareBaseCamera(respawnPlatform, current.nextPlatform, current.playerX, logicStageSize),
    cameraStart,
    stageHeight: logicStageSize.height,
  });
  current.advanceStartedAt = current.time + SQUARE_JUMP_ADVANCE_DELAY;
  current.lockedNextVisualOffsetY = nextVisualOffsetY;
  current.nextVisualOffsetY = nextVisualOffsetY;
  current.state = "advancing";
  current.status = "playing";
  return true;
}

export function SquareJumpPrototype({
  level,
  logicStageSizeOverride,
  mode,
  runSeed,
  onBackToSelect,
  onComplete,
  onRuntimeState,
  onRestart,
  remotePlayer,
  remoteStateSubscription,
  remoteState,
  unlimitedRespawn = false,
  coOpInputState = null,
  coOpInputStateSubscription = null,
  coOpRole = null,
  coOpSkinId = null,
  authoritativeStateSubscription = null,
}: {
  level: MiniGameLevelConfig;
  logicStageSizeOverride?: MiniGameStageSize;
  mode: MiniGameRunMode;
  runSeed: string;
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRuntimeState?: (state: SquareJumpStateSnapshot) => void;
  onRestart: () => void;
  remotePlayer?: { skinId?: string } | null;
  remoteStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  remoteState?: SelfGameState | null;
  unlimitedRespawn?: boolean;
  coOpInputState?: SelfGameState | null;
  coOpInputStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  coOpRole?: SquareJumpCoOpRole | null;
  coOpSkinId?: string | null;
  authoritativeStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
}) {
  const { stageRef, stageSize: measuredStageSize } = useMiniGameStageSize<HTMLDivElement>();
  const logicStageSize = logicStageSizeOverride ?? measuredStageSize;
  const stageWidth = logicStageSize.width;
  const stageHeight = logicStageSize.height;
  const visualStageWidth = measuredStageSize.width;
  const visualStageHeight = measuredStageSize.height;
  const worldLayerScale = Math.min(visualStageWidth / stageWidth, visualStageHeight / stageHeight);
  const worldLayerOffsetX = (visualStageWidth - stageWidth * worldLayerScale) / 2;
  const worldLayerOffsetY = (visualStageHeight - stageHeight * worldLayerScale) / 2;
  const platformY = getSquareJumpPlatformY(stageHeight);
  const requiredJumps = numberParam(level.params, "jumpsRequired", 5);
  const doubleJumpEnabled = booleanParam(level.params, "doubleJumpEnabled");
  const cyclingCharge = doubleJumpEnabled && booleanParam(level.params, "cyclingChargeOnDoubleJump");
  const flyAwayLandingCatchDepth = numberParam(level.params, "flyAwayLandingCatchDepth", PLAYER_SIZE * 1.25);
  const targetLandingPadding = numberParam(level.params, "targetLandingPadding", 12);
  const initialRuntime = useMemo(() => createSquareJumpUnifiedRuntime(level, runSeed, logicStageSize), [level, logicStageSize, runSeed]);
  const runtimeRef = useRef<SquareJumpUnifiedRuntime>(initialRuntime);
  const worldLayerRef = useRef<HTMLDivElement | null>(null);
  const progressBackgroundRef = useRef<HTMLDivElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const remotePlayerShellRef = useRef<HTMLDivElement | null>(null);
  const playerAvatarRef = useRef<HTMLSpanElement | null>(null);
  const remotePlayerAvatarRef = useRef<HTMLSpanElement | null>(null);
  const remoteSmootherRef = useRef(
    new RemoteStateSmoother({
      interpolationDelayMs: MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
      maxExtrapolationMs: MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
      staleStopExtrapolationMs: MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
    }),
  );
  const authoritativeSmootherRef = useRef(
    new RemoteStateSmoother({
      interpolationDelayMs: MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
      maxExtrapolationMs: MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
      staleStopExtrapolationMs: MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
    }),
  );
  const coOpInputStateRef = useRef<SelfGameState | null>(coOpInputState);
  const tutorialPreviewRef = useRef<HTMLDivElement | null>(null);
  const squarePlatformRefs = useRef(new Map<string, HTMLDivElement>());
  const lastUiSyncRef = useRef(0);
  const lastRuntimeSyncRef = useRef(0);
  const localChargeHeldRef = useRef(false);
  const remoteChargeHeldRef = useRef(false);
  const completedRef = useRef(false);
  const { fps, recordFrame: recordDebugFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const perf = useMiniGamePerfMonitor("Square Jump");
  const { enabled: perfEnabled, recordFrame: recordPerfFrame, recordReactSync } = perf;
  const { screenShakeClassName, triggerScreenShake } = useMiniGameScreenShake();
  const [view, setView] = useState<SquareJumpUnifiedRuntime>(() => makeSquareJumpUnifiedView(initialRuntime));
  const onRuntimeStateRef = useRef<typeof onRuntimeState>(onRuntimeState);

  useEffect(() => {
    onRuntimeStateRef.current = onRuntimeState;
  }, [onRuntimeState]);

  const syncView = useCallback((time = performance.now()) => {
    lastUiSyncRef.current = time;
    recordReactSync();
    setView(makeSquareJumpUnifiedView(runtimeRef.current));
  }, [recordReactSync]);

  const syncRuntimeState = useCallback((time = performance.now(), force = false) => {
    if (!onRuntimeStateRef.current) return;
    if (!force && time - lastRuntimeSyncRef.current < SQUARE_JUMP_MULTIPLAYER_RUNTIME_SYNC_MS) return;
    lastRuntimeSyncRef.current = time;
    onRuntimeStateRef.current(makeSquareJumpRuntimeState(runtimeRef.current, localChargeHeldRef.current));
  }, []);
  const canRecoverSquareJumpMiss = mode === "base" || unlimitedRespawn;

  useEffect(() => {
    runtimeRef.current = initialRuntime;
    lastUiSyncRef.current = 0;
    lastRuntimeSyncRef.current = 0;
    localChargeHeldRef.current = false;
    remoteChargeHeldRef.current = false;
    completedRef.current = false;
    remoteSmootherRef.current.reset();
    authoritativeSmootherRef.current.reset();
    if (remotePlayerShellRef.current) {
      remotePlayerShellRef.current.style.display = "none";
    }
    const timer = window.setTimeout(() => {
      setView(makeSquareJumpUnifiedView(initialRuntime));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRuntime]);

  useEffect(() => {
    if (!remoteState) {
      remoteSmootherRef.current.reset();
      if (remotePlayerShellRef.current) {
        remotePlayerShellRef.current.style.display = "none";
      }
      return;
    }
    remoteSmootherRef.current.push(remoteState, performance.now());
  }, [remoteState]);

  useEffect(() => {
    if (!remoteStateSubscription) return;
    return remoteStateSubscription((nextState) => {
      remoteSmootherRef.current.push(nextState, performance.now());
    });
  }, [remoteStateSubscription]);

  useEffect(() => {
    authoritativeSmootherRef.current.reset();
    if (!authoritativeStateSubscription) return;
    return authoritativeStateSubscription((nextState) => {
      if (nextState.status !== "playing") {
        authoritativeSmootherRef.current.reset();
        if (applySquareJumpAuthoritativeState(runtimeRef.current, nextState)) {
          syncView();
          syncRuntimeState(performance.now(), true);
        }
        return;
      }
      authoritativeSmootherRef.current.push(nextState, performance.now());
    });
  }, [authoritativeStateSubscription, syncRuntimeState, syncView]);

  const updateSquareJumpDom = useCallback(
    (current: SquareJumpUnifiedRuntime) => {
      if (progressBackgroundRef.current) {
        const backgroundStyle = squareProgressBackgroundStyle(current.camera);
        progressBackgroundRef.current.style.backgroundPosition = String(backgroundStyle.backgroundPosition ?? "");
      }
      if (worldLayerRef.current) {
        worldLayerRef.current.style.transform = `${transformPoint3d(worldLayerOffsetX, worldLayerOffsetY)} scale(${worldLayerScale}) ${squareBaseWorldTransform(current.camera, logicStageSize)}`;
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
      let remoteChargeHint = 0;
      if (remotePlayerShellRef.current) {
        const sampledRemote = remoteSmootherRef.current.sample(performance.now());
        if (sampledRemote && typeof sampledRemote.x === "number" && typeof sampledRemote.y === "number") {
          remoteChargeHint = sampledRemote.direction && sampledRemote.direction !== "none" ? 0.68 : 0;
          remotePlayerShellRef.current.style.display = "";
          remotePlayerShellRef.current.style.transform = transformPoint3d(sampledRemote.x - PLAYER_SIZE / 2, sampledRemote.y - PLAYER_SIZE / 2);
        } else {
          remotePlayerShellRef.current.style.display = "none";
        }
      }
      setSquareJumpAvatarChargeVarsFromCharge(remotePlayerAvatarRef.current, remoteChargeHint);
      if (tutorialPreviewRef.current) {
        const previewPlan = level.levelId === "square-jump-base" && current.jumps < 3 && current.state === "charging" ? createSquareJumpPlan(level, current) : null;
        if (previewPlan) {
          tutorialPreviewRef.current.style.display = "";
          tutorialPreviewRef.current.style.transform = transformPoint3d(
            worldLayerOffsetX + (stageWidth / 2 + (previewPlan.landingX - current.camera.cameraX) * current.camera.scale) * worldLayerScale - 15,
            worldLayerOffsetY + (stageHeight / 2 + (platformY - current.camera.cameraY) * current.camera.scale) * worldLayerScale + 12,
          );
        } else {
          tutorialPreviewRef.current.style.display = "none";
        }
      }
    },
    [level, platformY, stageHeight, logicStageSize, stageWidth, worldLayerOffsetX, worldLayerOffsetY, worldLayerScale],
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
      const cameraEnd = fitSquareBaseCamera(landedPlatform, futurePlatform, current.playerX, logicStageSize);
      current.nextIndex = futureIndex;
      current.nextPlatform = futurePlatform;
      current.timer = null;
      current.exitingPlatform = leavingPlatform;
      current.exitingVisualOffsetY = 0;
      current.lockedNextVisualOffsetY = null;
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
    [logicStageSize, requiredJumps, stageHeight, syncView],
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

  const startSharedCharge = useCallback(
    () => {
      const current = runtimeRef.current;
      if (current.status !== "playing") return;
      if (current.state === "charging" || current.state === "airCharging") return;
      if (!current.started) {
        current.started = true;
        current.timer = null;
      }
      const canGroundCharge = current.state === "idle" || current.state === "advancing";
      const canAirCharge = doubleJumpEnabled && (current.state === "jumping" || current.state === "falling") && current.jumpPlan !== null && !current.doubleJumpUsed;
      if (!canGroundCharge && !canAirCharge) return;
      current.charge = 0;
      current.chargeElapsedMs = 0;
      current.state = canAirCharge ? "airCharging" : "charging";
      syncView();
    },
    [doubleJumpEnabled, syncView],
  );

  const releaseSharedChargeIfIdle = useCallback(() => {
    if (localChargeHeldRef.current || remoteChargeHeldRef.current) return;
    launchChargedJump();
  }, [launchChargedJump]);

  const applyRemoteChargeHeld = useCallback(
    (nextRemoteHeld: boolean) => {
      if (remoteChargeHeldRef.current === nextRemoteHeld) return;
      const remoteCanControl = coOpRole ? !canControlSquareJumpCoOpTurn(runtimeRef.current, coOpRole) : true;
      if (nextRemoteHeld && !remoteCanControl) return;
      remoteChargeHeldRef.current = nextRemoteHeld;
      if (nextRemoteHeld) {
        startSharedCharge();
        return;
      }
      releaseSharedChargeIfIdle();
    },
    [coOpRole, releaseSharedChargeIfIdle, startSharedCharge],
  );

  const beginCharge = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!canControlSquareJumpCoOpTurn(runtimeRef.current, coOpRole)) {
        localChargeHeldRef.current = false;
        syncRuntimeState(performance.now(), true);
        return;
      }
      localChargeHeldRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the pointer is already gone.
      }
      startSharedCharge();
      syncRuntimeState(performance.now(), true);
    },
    [coOpRole, startSharedCharge, syncRuntimeState],
  );

  const releaseJump = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      localChargeHeldRef.current = false;
      releaseSharedChargeIfIdle();
      syncRuntimeState(performance.now(), true);
    },
    [releaseSharedChargeIfIdle, syncRuntimeState],
  );

  const cancelCharge = useCallback(() => {
    localChargeHeldRef.current = false;
    syncRuntimeState(performance.now(), true);
    if (remoteChargeHeldRef.current) return;
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
  }, [launchChargedJump, syncRuntimeState, syncView]);

  useEffect(() => {
    coOpInputStateRef.current = coOpInputState;
    applyRemoteChargeHeld((coOpInputState?.direction ?? "none") !== "none");
  }, [applyRemoteChargeHeld, coOpInputState]);

  useEffect(() => {
    if (!coOpInputStateSubscription) return;
    return coOpInputStateSubscription((nextState) => {
      coOpInputStateRef.current = nextState;
      applyRemoteChargeHeld((nextState.direction ?? "none") !== "none");
    });
  }, [applyRemoteChargeHeld, coOpInputStateSubscription]);

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

      const sampledAuthoritativeState = authoritativeSmootherRef.current.sample(performance.now());
      const platformWindowChanged = hasSquareJumpPlatformWindowChanged(current, sampledAuthoritativeState);
      if (applySquareJumpAuthoritativeState(current, sampledAuthoritativeState)) {
        paintSquareFrame();
        syncRuntimeState(time);
        if (platformWindowChanged) {
          syncView(performance.now());
        } else if (time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS || current.status !== view.status) {
          syncView(time);
        }
        frameId = requestAnimationFrame(tick);
        return;
      }
      if (authoritativeStateSubscription) {
        paintSquareFrame();
        frameId = requestAnimationFrame(tick);
        return;
      }

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
            fail("?????????");
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
            if (canRecoverSquareJumpMiss && recoverSquareJumpBaseMiss(current, "掉下去了", logicStageSize, unlimitedRespawn)) {
              triggerScreenShake();
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
            if (canRecoverSquareJumpMiss && recoverSquareJumpBaseMiss(current, "掉下去了", logicStageSize, unlimitedRespawn)) {
              triggerScreenShake();
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
      if (current.status !== "playing" || eventChanged) {
        syncRuntimeState(time, true);
      } else {
        syncRuntimeState(time);
      }
      if (current.status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [advanceToNextPlatform, authoritativeStateSubscription, canRecoverSquareJumpMiss, cyclingCharge, doubleJumpEnabled, fail, flyAwayLandingCatchDepth, level, logicStageSize, mode, perfEnabled, recordDebugFrame, recordPerfFrame, requiredJumps, stageHeight, stageWidth, syncRuntimeState, syncView, targetLandingPadding, triggerScreenShake, unlimitedRespawn, updateSquareJumpDom, view.status]);

  useEffect(() => {
    if (!onComplete || completedRef.current) return;
    const completedStatus = view.status;
    if (completedStatus === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    const timer = window.setTimeout(() => {
      onComplete({
        gameId: "square-jump",
        levelId: level.levelId,
        status: completedStatus,
        reason: latest.reason,
        elapsedMs: Math.round(latest.time * 1000),
        stats: {
          failures: latest.failures,
          progressPercent: Math.round((latest.jumps / requiredJumps) * 100),
          jumps: latest.jumps,
          requiredJumps,
        },
      });
    }, mode === "prototype" ? MINI_GAME_COMPLETION_DELAY_MS : 0);
    return () => window.clearTimeout(timer);
  }, [level.levelId, mode, onComplete, requiredJumps, view.status]);

  const showOverlay = mode === "prototype";
  const gravity = view.activeGravity;
  const showGravityStatus = booleanParam(level.params, "gravityChallenge");
  const worldLayerStyle: CSSProperties = {
    inset: 0,
    position: "absolute",
    height: `${stageHeight}px`,
    transform: `${transformPoint3d(worldLayerOffsetX, worldLayerOffsetY)} scale(${worldLayerScale}) ${squareBaseWorldTransform(view.camera, logicStageSize)}`,
    transformOrigin: "0 0",
    width: `${stageWidth}px`,
    zIndex: 2,
  };
  const platforms = selectSquareJumpVisiblePlatforms(view.currentPlatform, view.nextPlatform, view.exitingPlatform);
  const tutorialPreviewPlan = level.levelId === "square-jump-base" && view.jumps < 3 && view.state === "charging" ? createSquareJumpPlan(level, view) : null;
  const isCharging = view.state === "charging" || view.state === "airCharging";
  const coOpTurnIsMine = canControlSquareJumpCoOpTurn(view, coOpRole);
  return (
    <div className="prototype-game-wrap">
      <div className="mini-score">
        {coOpRole ? <span className="mini-coop-hint">{coOpTurnIsMine ? "轮到你蓄力" : "等待对方蓄力"}</span> : null}
        <span>进度 {view.jumps}/{requiredJumps}</span>
        {showGravityStatus ? <span>重力 {squareGravityLabel(gravity)}</span> : null}
        {view.timer !== null ? <span>倒计�?{Math.max(0, view.timer).toFixed(1)}s</span> : null}
      </div>
      <div
        className={`prototype-stage square-jump-stage gravity-${gravity} ${screenShakeClassName} ${view.status === "failed" ? "failed" : ""}`}
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
              {...resolveSquareJumpPlayerAvatarView(view)}
              charge={view.charge}
              gravity={view.activeGravity}
              rotationTurns={view.playerTurns}
              rootRef={playerAvatarRef}
              skin={resolveSquareJumpCoOpSkin(coOpSkinId)}
              visualScale={1.18}
            />
          </div>
          {remoteState || remoteStateSubscription ? (
            <div
              className="square-jump-base-remote-player-shell"
              ref={remotePlayerShellRef}
              style={{
                left: "0px",
                top: "0px",
                width: `${PLAYER_SIZE}px`,
                height: `${PLAYER_SIZE}px`,
              }}
            >
              <PlayerAvatar
                {...resolveSquareJumpRemoteAvatarView(remoteState)}
                rootRef={remotePlayerAvatarRef}
                skin={resolveSquareJumpRemoteSkin(remotePlayer)}
                visualScale={1.18}
              />
            </div>
          ) : null}
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
                worldLayerOffsetX + (stageWidth / 2 + (tutorialPreviewPlan.landingX - view.camera.cameraX) * view.camera.scale) * worldLayerScale - 15,
                worldLayerOffsetY + (stageHeight / 2 + (platformY - view.camera.cameraY) * view.camera.scale) * worldLayerScale + 12,
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
