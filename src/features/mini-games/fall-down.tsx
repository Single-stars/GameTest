"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { PlayerAvatar, type PlayerAvatarDirection, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";
import { DifficultyWaveBackdrop } from "@/features/visuals/difficulty-wave-backdrop";
import { RemoteInterpolator } from "@/features/multiplayer/remote-interpolator";
import { RemoteVisualSmoother, applyRemoteAvatarVisual } from "@/features/multiplayer/remote-visual-smoother";
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
  type EndlessMiniGameRuntime,
  type MiniGameRunMode,
  type MiniGameStageSize,
  type PrototypeStatus,
} from "@/features/mini-games/common";
import {
  advanceFallDownCamera,
  constrainFallDownRecoveryRuns,
  createSeededRandom,
  expireFallDownFragilePlatform,
  resolveFallDownCameraBounds,
  restoreFallDownFragilePlatformsForRespawn,
  type MiniGameLevelConfig,
} from "@/lib/mini-games";
import { getEndlessMiniGameStageConfig } from "@/lib/endless-mode";
import type { SelfGameState } from "@/features/game-sync/types";
import {
  MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
  MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
  MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
  MULTIPLAYER_FAST_STATE_SYNC_MS,
} from "@/lib/multiplayer/protocol";
const ENDLESS_FALL_DOWN_ENERGY_DISTANCE = 5;
const ENDLESS_FALL_DOWN_FAST_DROP_DISTANCE = 6;
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
  lastSafePlatformId: number;
  failures: number;
  respawnUntil: number;
  respawnCameraStartY: number;
  respawnCameraEndY: number;
  respawnCameraStartedAt: number;
  respawnCameraUntil: number;
  status: PrototypeStatus;
  reason: string;
  platforms: FallDownPlatform[];
  fallingHazards: FallDownFallingHazard[];
};

const FALL_DOWN_LEDGE_WIDTH = 14;
const FALL_DOWN_LEDGE_HEIGHT = 52;
const FALL_DOWN_FALLING_HAZARD_HITBOX_SCALE = 0.72;
const FALL_DOWN_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_FAST_STATE_SYNC_MS;

export type FallDownRuntimeState = {
  cameraY: number;
  direction: PlayerAvatarDirection;
  elapsedMs: number;
  failures: number;
  progress: number;
  status: PrototypeStatus;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type FallDownRemotePlayer = {
  customAvatar?: {
    imageDataUrl: string;
    outlineColor?: string;
  };
  skinId?: string;
};

type FallDownRemoteState = SelfGameState;

function resolveFallDownPlayerDirection(direction: FallDownRuntime["inputDirection"]): PlayerAvatarDirection {
  if (direction < 0) return "left";
  if (direction > 0) return "right";
  return "none";
}

function resolveFallDownPlayerAvatarView(view: FallDownRuntime): PlayerAvatarView {
  if (view.status === "failed") return { action: "hit", expression: "hurt" };
  if (view.status === "passed") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (view.time < view.respawnUntil) return { action: "idle", expression: "neutral", effect: "shield" };
  if (view.started && view.inputDirection !== 0) return { action: "move", expression: "neutral" };
  return { action: "idle", expression: "neutral" };
}

function resolveFallDownRemoteSkin(remotePlayer: FallDownRemotePlayer | null | undefined): PlayerAvatarSkin {
  return resolvePlayerAvatarSkin(remotePlayer?.skinId);
}

function resolveFallDownCoOpSkin(coOpSkinId: string | null | undefined): PlayerAvatarSkin | undefined {
  return coOpSkinId ? resolvePlayerAvatarSkin(coOpSkinId) : undefined;
}

function resolveFallDownRemoteAvatarView(remoteState: FallDownRemoteState): PlayerAvatarView {
  if (remoteState.status === "failed") return { action: "hit", expression: "hurt" };
  if (remoteState.status === "finished") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  return remoteState.direction && remoteState.direction !== "none"
    ? { action: "move", expression: "neutral" }
    : { action: "idle", expression: "neutral" };
}

function smoothSpectatorCamera(current: number, target: number, delta: number) {
  const blend = 1 - Math.exp(-Math.max(0, delta) * 7);
  return current + (target - current) * blend;
}

function syncFallDownWaveParallax(stage: HTMLDivElement | null, playerX: number, playerY: number, cameraY: number, stageWidth: number) {
  if (!stage) return;
  const horizontalOffset = playerX - stageWidth * 0.5;
  const verticalOffset = playerY - cameraY;
  stage.style.setProperty("--difficulty-wave-parallax-x", (cameraY * 0.1 + horizontalOffset * 0.22).toFixed(2));
  stage.style.setProperty("--difficulty-wave-parallax-y", (-cameraY * 0.86 + verticalOffset * 0.05).toFixed(2));
}

function makeFallDownRuntimeState(runtime: FallDownRuntime, requiredLayers: number, inputDirection: FallDownRuntime["inputDirection"] = runtime.inputDirection): FallDownRuntimeState {
  return {
    cameraY: runtime.cameraY,
    direction: resolveFallDownPlayerDirection(inputDirection),
    elapsedMs: Math.round(runtime.time * 1000),
    failures: runtime.failures,
    progress: Number((runtime.layersReached / Math.max(1, requiredLayers)).toFixed(4)),
    status: runtime.status,
    vx: runtime.vx,
    vy: runtime.vy,
    x: runtime.playerX,
    y: runtime.playerY,
  };
}

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

  return constrainFallDownRecoveryRuns(kindBag, rand);
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

function makeFallDownFallingHazards(level: MiniGameLevelConfig, runSeed: string, stageSize: MiniGameStageSize): FallDownFallingHazard[] {
  const count = numberParam(level.params, "fallingHazardCount", 0);
  if (count <= 0) return [];
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:fall-down-falling-hazards`);
  const baseSpeed = numberParam(level.params, "fallingHazardSpeed", 132);
  const baseSize = numberParam(level.params, "fallingHazardSize", 22);
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: 28 + rand() * (stageSize.width - 56),
    delay: rand() * (stageSize.height + 180),
    drift: 10 + rand() * 22,
    phase: rand() * Math.PI * 2,
    size: baseSize + (rand() - 0.5) * 6,
    speed: baseSpeed * (0.86 + rand() * 0.34),
  }));
}

function fallDownFallingHazardScreenY(hazard: FallDownFallingHazard, time: number, stageHeight: number) {
  const travel = stageHeight + hazard.size + 120;
  return ((time * hazard.speed + hazard.delay) % travel) - hazard.size - 76;
}

function fallDownFallingHazardX(hazard: FallDownFallingHazard, time: number, stageWidth: number) {
  return clamp(hazard.x + Math.sin(time * 1.35 + hazard.phase) * hazard.drift, hazard.size / 2 + 8, stageWidth - hazard.size / 2 - 8);
}

function fallDownFallingHazardHitboxRadius(hazard: FallDownFallingHazard) {
  return PLAYER_SIZE * 0.38 + hazard.size * FALL_DOWN_FALLING_HAZARD_HITBOX_SCALE * 0.5;
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

function resolveFallDownLedgeShape({
  baseShape,
  kind,
  stageWidth,
  x,
}: {
  baseShape: FallDownPlatformShape;
  kind: FallDownPlatformKind;
  stageWidth: number;
  x: number;
}) {
  if (baseShape === "flat") return baseShape;
  if (kind !== "moving" && x < stageWidth * 0.34) return "l-left";
  if (kind !== "moving" && x > stageWidth * 0.66) return "l-right";
  return baseShape;
}

function makeFallDownPlatforms(level: MiniGameLevelConfig, runSeed: string, stageWidth: number): FallDownPlatform[] {
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
  let previousX = stageWidth / 2;
  return Array.from({ length: layersRequired + 1 }, (_, index) => {
    if (index > 0) {
      const gapNoise = fallDownSmoothNoise(gapNoisePoints, index * 0.61);
      y += minGap + (maxGap - minGap) * gapNoise;
    }
    const kind = index === layersRequired ? "finish" : index === 0 ? "normal" : kindBag[index - 1] ?? "normal";
    const widthNoise = fallDownSmoothNoise(widthNoisePoints, index * 0.53);
    const kindWidth = kind === "finish" ? baseWidth + 42 : kind === "danger" ? Math.max(58, baseWidth - 16) : baseWidth;
    const width = clamp(kindWidth + (widthNoise - 0.5) * 18, kind === "danger" ? 58 : 62, stageWidth - 58);
    const xNoise = fallDownSmoothNoise(xNoisePoints, index * 0.47);
    const lane = (index + laneOffset) % lanePattern.length;
    const spreadTargetRatio = clamp(lanePattern[lane] + (xNoise - 0.5) * 0.3, 0.1, 0.9);
    const horizontalStep = kind === "moving" ? 226 : kind === "danger" ? 210 : 196;
    const targetX = width / 2 + 14 + spreadTargetRatio * (stageWidth - width - 28);
    const x = index === 0 ? stageWidth / 2 : clamp(previousX + clamp(targetX - previousX, -horizontalStep, horizontalStep), width / 2 + 14, stageWidth - width / 2 - 14);
    const baseShape = index > 0 && index < layersRequired && (ledgeBag.splice(Math.floor(rand() * ledgeBag.length), 1)[0] ?? false) ? (rand() < 0.5 ? "l-left" : "l-right") : "flat";
    const shape = resolveFallDownLedgeShape({
      baseShape,
      kind,
      stageWidth,
      x,
    });
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

function fallPlatformX(platform: FallDownPlatform, time: number, stageWidth: number) {
  if (platform.kind !== "moving") return platform.x;
  return clamp(platform.x + Math.sin(time * platform.speed + platform.phase) * platform.range, platform.width / 2 + 14, stageWidth - platform.width / 2 - 14);
}

function smoothFallDownRespawnCamera(startY: number, endY: number, progress: number) {
  const t = clamp(progress, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return startY + (endY - startY) * eased;
}

function resolveFallDownLastSafePlatform(current: FallDownRuntime) {
  return current.platforms.find((platform) => platform.id === current.lastSafePlatformId && platform.kind !== "danger" && platform.kind !== "finish" && platform.kind !== "fragile" && !platform.broken) ?? current.platforms[0];
}

function resolveFallDownCoOpInputDirection(localDirection: FallDownRuntime["inputDirection"], coOpRole: "left" | "right" | null | undefined, coOpInputState: FallDownRemoteState | null | undefined): FallDownRuntime["inputDirection"] {
  const localCoOpDirection = !coOpRole ? clamp(localDirection, -1, 1) : localDirection === 0 ? 0 : coOpRole === "left" ? -1 : 1;
  const remoteCoOpDirection = coOpInputState?.direction === "left" ? -1 : coOpInputState?.direction === "right" ? 1 : 0;
  return clamp(localCoOpDirection + remoteCoOpDirection, -1, 1) as FallDownRuntime["inputDirection"];
}

function recoverFallDownBaseFailure(
  current: FallDownRuntime,
  reason: string,
  stageSize: MiniGameStageSize,
  unlimitedRespawn = false,
  baseRevives?: number,
  onBaseReviveUsed?: () => void,
) {
  const failures = current.failures + 1;
  current.failures = failures;
  current.reason = reason;
  current.inputDirection = 0;
  current.started = false;
  current.vx = 0;
  current.vy = 0;

  const reviveLimitReached = baseRevives === undefined ? failures >= BASE_FAILURE_LIMIT : failures > baseRevives;
  if (!unlimitedRespawn && reviveLimitReached) {
    current.reason = baseRevives === undefined ? "失败达到 3 次，进入下一关" : "冒险的心用尽，进入下一关";
    current.status = "failed";
    return false;
  }
  if (!unlimitedRespawn) onBaseReviveUsed?.();

  restoreFallDownFragilePlatformsForRespawn(current.platforms);
  const respawnPlatform = resolveFallDownLastSafePlatform(current);
  current.currentPlatformId = respawnPlatform.id;
  current.lastSafePlatformId = respawnPlatform.id;
  current.playerX = fallPlatformX(respawnPlatform, current.time, stageSize.width);
  current.playerY = respawnPlatform.y - PLAYER_SIZE / 2;
  const respawnCameraY = Math.min(current.cameraY, current.playerY - stageSize.height * 0.5);
  current.respawnCameraStartY = current.cameraY;
  current.respawnCameraEndY = respawnCameraY;
  current.respawnCameraStartedAt = current.time;
  current.respawnCameraUntil = current.time + 0.38;
  current.cameraY = smoothFallDownRespawnCamera(current.respawnCameraStartY, current.respawnCameraEndY, 0);
  current.pressureWorldY = current.respawnCameraStartY - PLAYER_SIZE;
  current.respawnUntil = current.time + 1.1;
  current.status = "playing";
  return true;
}

function recoverEndlessFallDownFailure(current: FallDownRuntime, reason: string, stageSize: MiniGameStageSize) {
  current.failures += 1;
  current.reason = reason;
  current.status = "playing";
  current.started = true;
  current.inputDirection = 0;
  current.vx = 0;
  current.vy = Math.min(current.vy, 120);
  current.respawnCameraUntil = 0;
  current.respawnUntil = current.time + 1.1;

  if (reason === "太慢了" || reason === "掉太深") {
    restoreFallDownFragilePlatformsForRespawn(current.platforms);
    const respawnPlatform = resolveFallDownLastSafePlatform(current);
    current.currentPlatformId = respawnPlatform.id;
    current.lastSafePlatformId = respawnPlatform.id;
    current.playerX = fallPlatformX(respawnPlatform, current.time, stageSize.width);
    current.playerY = respawnPlatform.y - PLAYER_SIZE / 2;
    const visibleTop = current.cameraY + PLAYER_SIZE;
    const visibleBottom = current.cameraY + stageSize.height - PLAYER_SIZE * 1.8;
    if (current.playerY < visibleTop || current.playerY > visibleBottom) {
      current.cameraY = Math.max(0, current.playerY - stageSize.height * 0.46);
    }
  }

  current.pressureWorldY = current.cameraY - PLAYER_SIZE;
}

function carryFallDownMovingPlatformDuringRespawn(current: FallDownRuntime, previousTime: number, stageWidth: number) {
  if (current.started) return;
  const carriedPlatform = current.platforms.find((platform) => platform.id === current.currentPlatformId);
  if (!carriedPlatform || carriedPlatform.kind !== "moving" || carriedPlatform.broken) return;
  const previousPlatformX = fallPlatformX(carriedPlatform, previousTime, stageWidth);
  const playerBottomIsOnPlatform = Math.abs(current.playerY + PLAYER_SIZE / 2 - carriedPlatform.y) <= 0.75;
  const playerOverlapsPlatform =
    current.playerX + PLAYER_SIZE / 2 >= previousPlatformX - carriedPlatform.width / 2 &&
    current.playerX - PLAYER_SIZE / 2 <= previousPlatformX + carriedPlatform.width / 2;
  if (!playerBottomIsOnPlatform || !playerOverlapsPlatform) return;
  const platformDeltaX = fallPlatformX(carriedPlatform, current.time, stageWidth) - previousPlatformX;
  current.playerX = clamp(current.playerX + platformDeltaX, PLAYER_SIZE / 2 + 4, stageWidth - PLAYER_SIZE / 2 - 4);
}

function applyFallDownAuthoritativeState(
  current: FallDownRuntime,
  authoritativeState: SelfGameState | null | undefined,
  requiredLayers: number,
) {
  if (!authoritativeState) return false;
  if (typeof authoritativeState.x !== "number" || typeof authoritativeState.y !== "number" || typeof authoritativeState.cameraY !== "number") {
    return false;
  }
  current.playerX = authoritativeState.x;
  current.playerY = authoritativeState.y;
  current.cameraY = authoritativeState.cameraY;
  current.time = Math.max(current.time, (authoritativeState.elapsedMs ?? 0) / 1000);
  current.failures = authoritativeState.failures ?? current.failures;
  current.layersReached = Math.round((authoritativeState.progress ?? 0) * Math.max(1, requiredLayers));
  current.status = authoritativeState.status === "finished" ? "passed" : authoritativeState.status;
  current.started = current.status === "playing";
  if (current.status !== "playing") {
    current.inputDirection = 0;
    current.vx = 0;
    current.vy = 0;
  }
  return true;
}

function createFallDownRuntime(level: MiniGameLevelConfig, runSeed: string, stageSize: MiniGameStageSize): FallDownRuntime {
  const platforms = makeFallDownPlatforms(level, runSeed, stageSize.width);
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
    lastSafePlatformId: startPlatform.id,
    failures: 0,
    respawnUntil: 0,
    respawnCameraStartY: 0,
    respawnCameraEndY: 0,
    respawnCameraStartedAt: 0,
    respawnCameraUntil: 0,
    status: "playing",
    reason: "",
    platforms,
    fallingHazards: makeFallDownFallingHazards(level, runSeed, stageSize),
  };
}

function makeEndlessFallDownSegmentLevel(
  level: MiniGameLevelConfig,
  progress: number,
  debugDifficulty: number,
): MiniGameLevelConfig {
  const config = getEndlessMiniGameStageConfig({ debugDifficulty, miniGameId: "fall-down", progress });
  return {
    ...level,
    levelId: `${level.levelId}-endless-${config.sourceAdvancedLevel}-${Math.floor(progress)}`,
    params: {
      ...level.params,
      ...config.params,
    },
  };
}

function extendEndlessFallDownWorld(
  current: FallDownRuntime,
  level: MiniGameLevelConfig,
  runSeed: string,
  stageSize: MiniGameStageSize,
  progress: number,
  debugDifficulty: number,
) {
  const futureTargetY = current.cameraY + stageSize.height * 2.35;
  const lowestPlatformY = current.platforms.reduce((lowest, platform) => Math.max(lowest, platform.y), 0);
  if (lowestPlatformY >= futureTargetY) return false;

  const segmentLevel = makeEndlessFallDownSegmentLevel(level, progress, debugDifficulty);
  const generatedPlatforms = makeFallDownPlatforms(segmentLevel, `${runSeed}:endless:${Math.floor(lowestPlatformY)}`, stageSize.width)
    .filter((platform) => platform.kind !== "finish")
    .slice(1);
  const firstSegmentY = generatedPlatforms[0]?.y;
  if (firstSegmentY === undefined) return false;

  let nextPlatformId = current.platforms.reduce((next, platform) => Math.max(next, platform.id + 1), 0);
  const gap = numberParam(segmentLevel.params, "platformGapMin", 98);
  const offsetY = lowestPlatformY + gap - firstSegmentY;
  for (const platform of generatedPlatforms) {
    current.platforms.push({
      ...platform,
      id: nextPlatformId,
      kind: platform.kind === "finish" ? "normal" : platform.kind,
      y: platform.y + offsetY,
    });
    nextPlatformId += 1;
  }

  const targetHazards = makeFallDownFallingHazards(segmentLevel, `${runSeed}:endless:${current.fallingHazards.length}`, stageSize);
  const hazardsToAdd = Math.max(0, targetHazards.length - current.fallingHazards.length);
  let nextHazardId = current.fallingHazards.reduce((next, hazard) => Math.max(next, hazard.id + 1), 0);
  for (const hazard of targetHazards.slice(0, hazardsToAdd)) {
    current.fallingHazards.push({
      ...hazard,
      id: nextHazardId,
    });
    nextHazardId += 1;
  }

  const pruneBeforeY = current.cameraY - stageSize.height * 0.85;
  current.platforms = current.platforms.filter(
    (platform) => platform.id === current.currentPlatformId || platform.id === current.lastSafePlatformId || platform.y >= pruneBeforeY,
  );
  return true;
}

function makeFallDownView(runtime: FallDownRuntime): FallDownRuntime {
  return {
    ...runtime,
    platforms: resolveFallDownSpectatorPlatforms(runtime),
    fallingHazards: runtime.fallingHazards.map((hazard) => ({ ...hazard })),
  };
}

function resolveFallDownSpectatorPlatforms(runtime: FallDownRuntime) {
  return runtime.platforms.map((platform) => ({ ...platform }));
}

function hasFallDownSpectatorPlatforms(runtime: FallDownRuntime, cameraY: number, stageHeight: number) {
  return runtime.platforms.some((platform) => {
    const screenY = platform.y - cameraY;
    return !platform.broken && screenY >= -80 && screenY <= stageHeight + 80;
  });
}

function restoreFallDownSpectatorPlatforms(
  runtime: FallDownRuntime,
  level: MiniGameLevelConfig,
  runSeed: string,
  stageSize: MiniGameStageSize,
  cameraY: number,
) {
  if (hasFallDownSpectatorPlatforms(runtime, cameraY, stageSize.height)) return false;
  const restored = createFallDownRuntime(level, runSeed, stageSize);
  const minY = cameraY - stageSize.height * 0.75;
  const maxY = cameraY + stageSize.height * 1.35;
  const knownPlatformIds = new Set(runtime.platforms.map((platform) => platform.id));
  const restoredPlatforms = restored.platforms.filter(
    (platform) => !knownPlatformIds.has(platform.id) && platform.y >= minY && platform.y <= maxY,
  );
  if (restoredPlatforms.length === 0) return false;
  runtime.platforms = [...runtime.platforms, ...restoredPlatforms.map((platform) => ({ ...platform }))].sort((left, right) => left.y - right.y);
  return true;
}

export function FallDownPrototype({
  baseRevives,
  endless,
  level,
  logicStageSizeOverride,
  mode,
  onBackToSelect,
  onBaseReviveUsed,
  onComplete,
  onRuntimeState,
  onRestart,
  remotePlayer,
  remoteStateSubscription,
  remoteState,
  spectateRemoteState = null,
  runSeed,
  shielded = false,
  unlimitedRespawn = false,
  coOpInputState = null,
  coOpInputStateSubscription = null,
  coOpRole = null,
  coOpSkinId = null,
  coOpCustomAvatar = null,
  authoritativeStateSubscription = null,
}: {
  baseRevives?: number;
  endless?: EndlessMiniGameRuntime;
  level: MiniGameLevelConfig;
  logicStageSizeOverride?: MiniGameStageSize;
  mode: MiniGameRunMode | "endless";
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRuntimeState?: (state: FallDownRuntimeState) => void;
  onRestart: () => void;
  remotePlayer?: FallDownRemotePlayer | null;
  remoteStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  remoteState?: SelfGameState | null;
  spectateRemoteState?: SelfGameState | null;
  runSeed: string;
  shielded?: boolean;
  unlimitedRespawn?: boolean;
  coOpInputState?: SelfGameState | null;
  coOpInputStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  coOpRole?: "left" | "right" | null;
  coOpSkinId?: string | null;
  coOpCustomAvatar?: FallDownRemotePlayer["customAvatar"] | null;
  authoritativeStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  onBaseReviveUsed?: () => void;
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
  const worldLayerStyle = {
    height: `${stageHeight}px`,
    left: 0,
    position: "absolute" as const,
    top: 0,
    transform: `${transformPoint3d(worldLayerOffsetX, worldLayerOffsetY)} scale(${worldLayerScale})`,
    transformOrigin: "top left",
    width: `${stageWidth}px`,
  };
  const requiredLayers = numberParam(level.params, "layersRequired", 12);
  const fallDownPlayerSpeed = numberParam(level.params, "playerSpeed", 230);
  const fragileTime = numberParam(level.params, "fragileTime", 1.2);
  const topPressureSpeed = numberParam(level.params, "topPressureSpeed", 18);
  const isEndlessRun = Boolean(endless);
  const initialRuntime = useMemo(
    () => {
      const runtime = createFallDownRuntime(level, runSeed, logicStageSize);
      if (isEndlessRun) {
        runtime.platforms = runtime.platforms.map((platform) => (platform.kind === "finish" ? { ...platform, kind: "normal" } : platform));
      }
      return runtime;
    },
    [isEndlessRun, level, logicStageSize, runSeed],
  );
  const runtimeRef = useRef<FallDownRuntime>(initialRuntime);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const remotePlayerShellRef = useRef<HTMLDivElement | null>(null);
  const remotePlayerAvatarRef = useRef<HTMLSpanElement | null>(null);
  const remoteSmootherRef = useRef(
    new RemoteInterpolator<SelfGameState>({
      interpolationDelayMs: MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
      maxPredictionMs: MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
      staleMs: MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
    }),
  );
  const remoteVisualSmootherRef = useRef(new RemoteVisualSmoother());
  const authoritativeSmootherRef = useRef(
    new RemoteInterpolator<SelfGameState>({
      interpolationDelayMs: MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
      maxPredictionMs: MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
      staleMs: MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
    }),
  );
  const coOpInputStateRef = useRef<SelfGameState | null>(coOpInputState);
  const spectateRemoteStateRef = useRef<SelfGameState | null>(spectateRemoteState);
  const spectatorSceneTimeRef = useRef(0);
  const authoritativePlayback = Boolean(authoritativeStateSubscription);
  const fallPlatformRefs = useRef(new Map<number, HTMLDivElement>());
  const fallHazardRefs = useRef(new Map<number, HTMLDivElement>());
  const fallDownInputDirectionRef = useRef<FallDownRuntime["inputDirection"]>(0);
  const fallDownPointerIdRef = useRef<number | null>(null);
  const lastUiSyncRef = useRef(0);
  const lastRuntimeSyncRef = useRef(0);
  const completedRef = useRef(false);
  const { fps, recordFrame: recordDebugFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const perf = useMiniGamePerfMonitor("Fall Down");
  const { enabled: perfEnabled, recordFrame: recordPerfFrame, recordReactSync } = perf;
  const { screenShakeClassName, triggerScreenShake } = useMiniGameScreenShake();
  const [view, setView] = useState<FallDownRuntime>(() => makeFallDownView(initialRuntime));
  const remotePlayerSkin = resolveFallDownRemoteSkin(remotePlayer);
  const coOpPlayerSkin = resolveFallDownCoOpSkin(coOpSkinId);
  const onRuntimeStateRef = useRef<typeof onRuntimeState>(onRuntimeState);
  const endlessRef = useRef(endless);
  const endlessEnergyDistanceRef = useRef(0);

  const syncView = useCallback((time = performance.now()) => {
    lastUiSyncRef.current = time;
    recordReactSync();
    setView(makeFallDownView(runtimeRef.current));
  }, [recordReactSync]);

  useEffect(() => {
    onRuntimeStateRef.current = onRuntimeState;
  }, [onRuntimeState]);

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  useEffect(() => {
    spectateRemoteStateRef.current = spectateRemoteState;
  }, [spectateRemoteState]);

  const syncRuntimeState = useCallback(
    (time = performance.now(), force = false) => {
      if (!onRuntimeStateRef.current) return;
      if (!force && time - lastRuntimeSyncRef.current < FALL_DOWN_MULTIPLAYER_RUNTIME_SYNC_MS) return;
      lastRuntimeSyncRef.current = time;
      onRuntimeStateRef.current(makeFallDownRuntimeState(runtimeRef.current, requiredLayers, fallDownInputDirectionRef.current));
    },
    [requiredLayers],
  );

  useEffect(() => {
    runtimeRef.current = initialRuntime;
    spectatorSceneTimeRef.current = initialRuntime.time;
    lastUiSyncRef.current = 0;
    lastRuntimeSyncRef.current = 0;
    completedRef.current = false;
    remoteSmootherRef.current.reset();
    remoteVisualSmootherRef.current.reset();
    authoritativeSmootherRef.current.reset();
    if (remotePlayerShellRef.current) {
      remotePlayerShellRef.current.style.display = "none";
    }
    const timer = window.setTimeout(() => {
      setView(makeFallDownView(initialRuntime));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRuntime]);

  useEffect(() => {
    if (!remoteState) {
      remoteSmootherRef.current.reset();
      remoteVisualSmootherRef.current.reset();
      if (remotePlayerShellRef.current) {
        remotePlayerShellRef.current.style.display = "none";
      }
      return;
    }
    remoteSmootherRef.current.push(remoteState, remoteState.receivedAt ?? performance.now());
  }, [remoteState]);

  useEffect(() => {
    if (!remoteStateSubscription) return;
    return remoteStateSubscription((nextState) => {
      remoteSmootherRef.current.push(nextState, nextState.receivedAt ?? performance.now());
    });
  }, [remoteStateSubscription]);

  useEffect(() => {
    authoritativeSmootherRef.current.reset();
    if (!authoritativeStateSubscription) return;
    return authoritativeStateSubscription((nextState) => {
      if (nextState.status !== "playing") {
        authoritativeSmootherRef.current.reset();
        if (applyFallDownAuthoritativeState(runtimeRef.current, nextState, requiredLayers)) {
          syncView();
          syncRuntimeState(performance.now(), true);
        }
        return;
      }
      authoritativeSmootherRef.current.push(nextState, performance.now());
    });
  }, [authoritativeStateSubscription, requiredLayers, syncRuntimeState, syncView]);

  const updateFallDownDom = useCallback(
    (current: FallDownRuntime, spectatingRemote = false, sceneTime = current.time) => {
      syncFallDownWaveParallax(stageRef.current, current.playerX, current.playerY, current.cameraY, stageWidth);
      const platformById = new Map(current.platforms.map((platform) => [platform.id, platform]));
      const hazardById = new Map(current.fallingHazards.map((hazard) => [hazard.id, hazard]));
      const activeFallDownParams = isEndlessRun
        ? getEndlessMiniGameStageConfig({
            debugDifficulty: endlessRef.current?.debugDifficulty ?? 0,
            miniGameId: "fall-down",
            progress: Math.max(endlessRef.current?.score ?? 0, Math.floor(Math.max(0, current.playerY) / 100)),
          }).params
        : level.params;
      const activeFragileTime = numberParam(activeFallDownParams, "fragileTime", fragileTime);

      for (const [id, node] of fallPlatformRefs.current) {
        const platform = platformById.get(id);
        if (!platform || platform.broken) {
          node.style.display = "none";
          continue;
        }
        const platformX = fallPlatformX(platform, sceneTime, stageWidth);
        const screenY = platform.y - current.cameraY;
        if (screenY < -80 || screenY > stageHeight + 80) {
          node.style.display = "none";
          continue;
        }
        const fragileWarning = platform.kind === "fragile" && platform.steppedAt !== null && sceneTime - platform.steppedAt >= Math.max(0, activeFragileTime - 0.45);
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
        const hazardX = fallDownFallingHazardX(hazard, sceneTime, stageWidth);
        const hazardY = fallDownFallingHazardScreenY(hazard, sceneTime, stageHeight);
        if (hazardY < -80 || hazardY > stageHeight + 80) {
          node.style.display = "none";
          continue;
        }
        node.style.display = "";
        node.style.transform = `${transformPoint3d(hazardX - hazard.size / 2, hazardY - hazard.size / 2)} rotate(45deg)`;
      }

      if (playerShellRef.current) {
        playerShellRef.current.style.display = "";
        if (!spectatingRemote) {
          playerShellRef.current.style.transform = transformPoint3d(current.playerX - PLAYER_SIZE / 2, current.playerY - current.cameraY - PLAYER_SIZE / 2);
        }
      }
      if (remotePlayerShellRef.current) {
        const frameTime = performance.now();
        const sampledRemote = remoteSmootherRef.current.sample(frameTime);
        const visualRemote = remoteVisualSmootherRef.current.update(sampledRemote, frameTime);
        if (visualRemote && typeof visualRemote.x === "number" && typeof visualRemote.y === "number") {
          remotePlayerShellRef.current.style.display = "";
          remotePlayerShellRef.current.style.transform = `${transformPoint3d(
            visualRemote.x - PLAYER_SIZE / 2,
            visualRemote.y - current.cameraY - PLAYER_SIZE / 2,
          )} rotate(${visualRemote.angle}deg)`;
          applyRemoteAvatarVisual(remotePlayerAvatarRef.current, visualRemote);
        } else {
          remotePlayerShellRef.current.style.display = "none";
        }
      }
    },
    [fragileTime, isEndlessRun, level.params, stageHeight, stageRef, stageWidth],
  );

  const resumeFallDownInput = useCallback(
    (current: FallDownRuntime, direction: FallDownRuntime["inputDirection"]) => {
      current.started = true;
      current.inputDirection = direction;
      current.vx = direction * fallDownPlayerSpeed;
    },
    [fallDownPlayerSpeed],
  );

  useEffect(() => {
    coOpInputStateRef.current = coOpInputState;
  }, [coOpInputState]);

  useEffect(() => {
    if (!coOpInputStateSubscription) return;
    return coOpInputStateSubscription((nextState) => {
      coOpInputStateRef.current = nextState;
      if (authoritativePlayback) return;
      const direction = resolveFallDownCoOpInputDirection(fallDownInputDirectionRef.current, coOpRole, nextState);
      const current = runtimeRef.current;
      if (direction === 0 || current.status !== "playing" || current.time < current.respawnCameraUntil) return;
      resumeFallDownInput(current, direction);
    });
  }, [authoritativePlayback, coOpInputStateSubscription, coOpRole, resumeFallDownInput]);

  const fail = useCallback(
    (reason: string): boolean => {
      const current = runtimeRef.current;
      if (isEndlessRun) {
        if (!(endlessRef.current?.loseLife(reason) ?? false)) {
          current.status = "failed";
          current.reason = reason;
          current.inputDirection = 0;
          current.vx = 0;
          syncView();
          return false;
        }
        recoverEndlessFallDownFailure(current, reason, logicStageSize);
        triggerScreenShake();
        syncView();
        return true;
      }
      if ((mode === "base" || unlimitedRespawn) && recoverFallDownBaseFailure(current, reason, logicStageSize, unlimitedRespawn, baseRevives, onBaseReviveUsed)) {
        triggerScreenShake();
        syncView();
        return true;
      }
      if (mode === "base" || unlimitedRespawn) {
        triggerScreenShake();
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
    [baseRevives, isEndlessRun, logicStageSize, mode, onBaseReviveUsed, syncView, triggerScreenShake, unlimitedRespawn],
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
    const direction = coOpRole ? (coOpRole === "left" ? -1 : 1) : chooseFallDownDirection(event);
    fallDownInputDirectionRef.current = direction;
    if (authoritativePlayback) {
      syncRuntimeState(performance.now(), true);
      return;
    }
    if (current.time < current.respawnCameraUntil) {
      current.inputDirection = 0;
      current.vx = 0;
      return;
    }
    resumeFallDownInput(current, direction);
  }, [authoritativePlayback, coOpRole, resumeFallDownInput, syncRuntimeState]);

  const beginFallDownDirection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    fallDownPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFallDownDirection(event);
    if (authoritativePlayback) return;
    syncView();
  }, [authoritativePlayback, syncView, updateFallDownDirection]);

  const stopDirection = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    event?.preventDefault();
    if (event && fallDownPointerIdRef.current !== null && fallDownPointerIdRef.current !== event.pointerId) return;
    fallDownInputDirectionRef.current = 0;
    fallDownPointerIdRef.current = null;
    if (authoritativePlayback) {
      syncRuntimeState(performance.now(), true);
      return;
    }
    const current = runtimeRef.current;
    current.inputDirection = 0;
    current.vx = 0;
    syncView();
    syncRuntimeState(performance.now(), true);
  }, [authoritativePlayback, syncRuntimeState, syncView]);

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
      const paintFallDownFrame = (frame: FallDownRuntime, spectatingRemote = false, sceneTime = frame.time) => {
        const updateMs = perfEnabled ? performance.now() - updateStartedAt : 0;
        const renderStartedAt = perfEnabled ? performance.now() : 0;
        updateFallDownDom(frame, spectatingRemote, sceneTime);
        if (perfEnabled) recordPerfFrame(time, updateMs, performance.now() - renderStartedAt);
      };
      const continueAfterRecoverableFailure = (reason: string) => {
        if (fail(reason)) {
          paintFallDownFrame(runtimeRef.current);
          syncRuntimeState(time, true);
          frameId = requestAnimationFrame(tick);
          return;
        }
        paintFallDownFrame(runtimeRef.current);
        syncRuntimeState(time, true);
      };
      const keepRemoteRenderingAfterSettled = mode === "advanced" && Boolean(onRuntimeStateRef.current);

      const sampledAuthoritativeState = authoritativeSmootherRef.current.sample(performance.now());
      if (applyFallDownAuthoritativeState(current, sampledAuthoritativeState, requiredLayers)) {
        paintFallDownFrame(current);
        syncRuntimeState(time);
        if (time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS || current.status !== view.status) {
          syncView(time);
        }
        frameId = requestAnimationFrame(tick);
        return;
      }
      if (authoritativeStateSubscription) {
        paintFallDownFrame(current);
        frameId = requestAnimationFrame(tick);
        return;
      }

      if (current.status !== "playing") {
        const spectatorState = remoteSmootherRef.current.sample(time) ?? spectateRemoteStateRef.current;
        const spectatingRemote = spectatorState?.status === "playing";
        spectatorSceneTimeRef.current = Math.max(spectatorSceneTimeRef.current, current.time);
        if (spectatingRemote) spectatorSceneTimeRef.current += delta;
        let spectatorViewChanged = false;
        if (spectatingRemote && typeof spectatorState?.cameraY === "number") {
          current.cameraY = smoothSpectatorCamera(current.cameraY, spectatorState.cameraY, delta);
          spectatorViewChanged = restoreFallDownSpectatorPlatforms(current, level, runSeed, logicStageSize, spectatorState.cameraY);
        }
        paintFallDownFrame(current, spectatingRemote, spectatorSceneTimeRef.current);
        if (spectatorViewChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) syncView(time);
        syncRuntimeState(time, true);
        if (keepRemoteRenderingAfterSettled) {
          frameId = requestAnimationFrame(tick);
        }
        return;
      }

      if (current.status === "playing") {
        const previousTime = current.time;
        current.time += delta;
        carryFallDownMovingPlatformDuringRespawn(current, previousTime, stageWidth);

        if (current.time < current.respawnCameraUntil) {
          current.cameraY = smoothFallDownRespawnCamera(
            current.respawnCameraStartY,
            current.respawnCameraEndY,
            (current.time - current.respawnCameraStartedAt) / Math.max(0.001, current.respawnCameraUntil - current.respawnCameraStartedAt),
          );
          current.inputDirection = 0;
          current.vx = 0;
          current.vy = 0;
          paintFallDownFrame(current);
          syncRuntimeState(time);
          frameId = requestAnimationFrame(tick);
          return;
        }

        if (!current.started && previousTime < current.respawnCameraUntil) {
          current.cameraY = current.respawnCameraEndY;
          current.pressureWorldY = current.cameraY - PLAYER_SIZE;
          const restartDirection = resolveFallDownCoOpInputDirection(fallDownInputDirectionRef.current, coOpRole, coOpInputStateRef.current);
          if (restartDirection !== 0) {
            resumeFallDownInput(current, restartDirection);
          }
          paintFallDownFrame(current);
          syncRuntimeState(time, true);
          syncView(time);
          frameId = requestAnimationFrame(tick);
          return;
        }

        if (!current.started) {
          const startDirection = resolveFallDownCoOpInputDirection(fallDownInputDirectionRef.current, coOpRole, coOpInputStateRef.current);
          if (startDirection !== 0) {
            resumeFallDownInput(current, startDirection);
            eventChanged = true;
          }
        }

        if (current.started) {
          const endlessProgress = Math.max(endlessRef.current?.score ?? 0, Math.floor(Math.max(0, current.playerY) / 100));
          if (isEndlessRun) {
            extendEndlessFallDownWorld(
              current,
              level,
              runSeed,
              logicStageSize,
              endlessProgress,
              endlessRef.current?.debugDifficulty ?? 0,
            );
          }
          const activeFallDownParams = isEndlessRun
            ? getEndlessMiniGameStageConfig({
                debugDifficulty: endlessRef.current?.debugDifficulty ?? 0,
                miniGameId: "fall-down",
                progress: endlessProgress,
              }).params
            : level.params;
          const activeTopPressureSpeed = numberParam(activeFallDownParams, "topPressureSpeed", topPressureSpeed);
          const activeFragileTime = numberParam(activeFallDownParams, "fragileTime", fragileTime);
          let platformCarryX = 0;
          const platformById = new Map(current.platforms.map((platform) => [platform.id, platform]));
          const carriedPlatform = platformById.get(current.currentPlatformId);
          if (carriedPlatform && carriedPlatform.kind === "moving" && !carriedPlatform.broken) {
            const previousPlatformX = fallPlatformX(carriedPlatform, previousTime, stageWidth);
            const isOnCarriedPlatform =
              Math.abs(current.playerY + PLAYER_SIZE / 2 - carriedPlatform.y) <= 0.5 &&
              current.playerX + PLAYER_SIZE / 2 >= previousPlatformX - carriedPlatform.width / 2 &&
              current.playerX - PLAYER_SIZE / 2 <= previousPlatformX + carriedPlatform.width / 2;
            if (isOnCarriedPlatform) {
              platformCarryX = fallPlatformX(carriedPlatform, current.time, stageWidth) - previousPlatformX;
            }
          }
          const previousY = current.playerY;
          const previousBottom = previousY + PLAYER_SIZE / 2;
          const previousPlayerX = current.playerX;
          const pressureCameraY = advanceFallDownCamera({
            cameraY: current.cameraY,
            delta,
            speed: activeTopPressureSpeed,
          });
          current.cameraY =
            current.time < current.respawnCameraUntil
              ? smoothFallDownRespawnCamera(
                  current.respawnCameraStartY,
                  current.respawnCameraEndY,
                  (current.time - current.respawnCameraStartedAt) / Math.max(0.001, current.respawnCameraUntil - current.respawnCameraStartedAt),
                )
              : pressureCameraY;
          current.pressureWorldY = current.cameraY - PLAYER_SIZE;
          current.inputDirection = resolveFallDownCoOpInputDirection(fallDownInputDirectionRef.current, coOpRole, coOpInputStateRef.current);
          current.vx = current.inputDirection * fallDownPlayerSpeed;
          current.vy = clamp(current.vy + 980 * delta, -220, 520);
          current.playerX = clamp(current.playerX + current.inputDirection * fallDownPlayerSpeed * delta + platformCarryX, PLAYER_SIZE / 2 + 4, stageWidth - PLAYER_SIZE / 2 - 4);
          current.playerY += current.vy * delta;
          if (isEndlessRun) {
            const endlessDistanceScore = Math.floor(Math.max(0, current.playerY) / 100);
            endlessRef.current?.setDistanceScore(endlessDistanceScore, false);
            const nextEnergyDistance = Math.floor(endlessDistanceScore / ENDLESS_FALL_DOWN_ENERGY_DISTANCE);
            const energyGain = nextEnergyDistance - endlessEnergyDistanceRef.current;
            if (energyGain > 0) {
              endlessEnergyDistanceRef.current = nextEnergyDistance;
              endlessRef.current?.gainEnergy(energyGain);
            }
          }

          for (const platform of current.platforms) {
            const platformX = fallPlatformX(platform, current.time, stageWidth);
            current.playerX = clamp(resolveFallDownLedgeCollision(platform, platformX, current.playerX, previousPlayerX, current.playerY), PLAYER_SIZE / 2 + 4, stageWidth - PLAYER_SIZE / 2 - 4);
          }

          for (const hazard of current.fallingHazards) {
            const hazardX = fallDownFallingHazardX(hazard, current.time, stageWidth);
            const hazardY = fallDownFallingHazardScreenY(hazard, current.time, stageHeight);
            const playerScreenY = current.playerY - current.cameraY;
            const hazardDistance = Math.hypot(current.playerX - hazardX, playerScreenY - hazardY);
            if (hazardDistance <= fallDownFallingHazardHitboxRadius(hazard) && current.time >= current.respawnUntil) {
              continueAfterRecoverableFailure("躲开下落危险");
              return;
            }
          }

          for (const platform of current.platforms) {
            if (platform.broken) continue;
            const platformX = fallPlatformX(platform, current.time, stageWidth);
            const platformTop = platform.y;
            const nextBottom = current.playerY + PLAYER_SIZE / 2;
            const crossedPlatform = current.vy > 0 && previousBottom <= platformTop && nextBottom >= platformTop;
            const landingBounds = fallDownPlatformLandingBounds(platform, platformX);
            const horizontalOverlap = current.playerX + PLAYER_SIZE / 2 >= landingBounds.left && current.playerX - PLAYER_SIZE / 2 <= landingBounds.right;
            if (!crossedPlatform || !horizontalOverlap) continue;
            if (platform.kind === "danger" && current.time >= current.respawnUntil) {
              continueAfterRecoverableFailure("踩到危险");
              return;
            }
            const previousPlatform = platformById.get(current.currentPlatformId);
            const fastDropDistance = previousPlatform ? Math.floor(Math.max(0, platformTop - previousPlatform.y) / 100) : 0;
            current.playerY = platformTop - PLAYER_SIZE / 2;
            current.vy = 0;
            current.currentPlatformId = platform.id;
            current.layersReached = Math.max(current.layersReached, platform.id);
            if (platform.kind !== "danger" && platform.kind !== "finish" && platform.kind !== "fragile") current.lastSafePlatformId = platform.id;
            if (platform.kind === "fragile" && platform.steppedAt === null) platform.steppedAt = current.time;
            if (isEndlessRun && fastDropDistance >= ENDLESS_FALL_DOWN_FAST_DROP_DISTANCE) endlessRef.current?.gainEnergy(1, "极速下降！");
            eventChanged = true;
            if (platform.kind === "finish" && !isEndlessRun) {
              current.status = "passed";
              current.reason = `成功下降 ${requiredLayers} 层，到达终点平台`;
              paintFallDownFrame(current);
              syncView(time);
              syncRuntimeState(time, true);
              if (keepRemoteRenderingAfterSettled) {
                frameId = requestAnimationFrame(tick);
              }
              return;
            }
            break;
          }

          for (const platform of current.platforms) {
            const fragileState = expireFallDownFragilePlatform({
              fragileTime: activeFragileTime,
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
            bottomFailLine: stageHeight - PLAYER_SIZE / 2,
            cameraY: current.cameraY,
            playerWorldY: current.playerY,
            squareSize: PLAYER_SIZE,
            stageHeight,
          });
          if (bounds.status === "failed") {
            continueAfterRecoverableFailure(bounds.reason === "too-slow" ? "太慢了" : "掉太深");
            return;
          }
        }
      }

      paintFallDownFrame(current);
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
  }, [authoritativeStateSubscription, coOpRole, fail, fallDownPlayerSpeed, fragileTime, isEndlessRun, level, logicStageSize, mode, perfEnabled, recordDebugFrame, recordPerfFrame, requiredLayers, resumeFallDownInput, runSeed, stageHeight, stageWidth, syncRuntimeState, syncView, topPressureSpeed, updateFallDownDom, view.status]);

  useEffect(() => {
    if (!onComplete || completedRef.current) return;
    const completedStatus = view.status;
    if (completedStatus === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    const timer = window.setTimeout(() => {
      onComplete({
        gameId: "fall-down",
        levelId: level.levelId,
        status: completedStatus,
        reason: latest.reason,
        elapsedMs: Math.round(latest.time * 1000),
        stats: {
          failures: latest.failures,
          progressPercent: Math.round((latest.layersReached / Math.max(1, requiredLayers)) * 100),
          layersReached: latest.layersReached,
          requiredLayers,
          forcedAdvance: mode === "base" && completedStatus === "failed",
        },
      });
    }, mode === "prototype" ? MINI_GAME_COMPLETION_DELAY_MS : 0);
    return () => window.clearTimeout(timer);
  }, [level.levelId, mode, onComplete, requiredLayers, view.status]);

  const showOverlay = mode === "prototype";
  const viewFallDownParams = isEndlessRun
    ? getEndlessMiniGameStageConfig({
        debugDifficulty: endless?.debugDifficulty ?? 0,
        miniGameId: "fall-down",
        progress: Math.max(endless?.score ?? 0, Math.floor(Math.max(0, view.playerY) / 100)),
      }).params
    : level.params;
  const viewFragileTime = numberParam(viewFallDownParams, "fragileTime", fragileTime);
  const showFallDownMiniScore = !isEndlessRun;
  return (
    <div className="prototype-game-wrap">
      {showFallDownMiniScore ? (
        <div className="mini-score">
          {coOpRole ? <span className="mini-coop-hint">你负责{coOpRole === "left" ? "左" : "右"}</span> : null}
          <span>进度 {view.layersReached}/{requiredLayers}</span>
        </div>
      ) : null}
      <div
        className={`prototype-stage fall-down-stage ${screenShakeClassName} ${view.status === "failed" ? "failed" : ""}`}
        ref={stageRef}
        role="application"
        aria-label="一路向下"
        onLostPointerCapture={stopDirection}
        onPointerCancel={stopDirection}
        onPointerDown={beginFallDownDirection}
        onPointerMove={updateFallDownDirection}
        onPointerUp={stopDirection}
      >
        <DifficultyWaveBackdrop />
        <MiniGameFpsBadge fps={fps} />
        <MiniGamePerfPanel snapshot={perf.snapshot} />
        <div style={worldLayerStyle}>
        {view.platforms.map((platform) => {
          const platformX = fallPlatformX(platform, view.time, stageWidth);
          const screenY = platform.y - view.cameraY;
          if (screenY < -80 || screenY > stageHeight + 80 || platform.broken) return null;
          const fragileWarning = platform.kind === "fragile" && platform.steppedAt !== null && view.time - platform.steppedAt >= Math.max(0, viewFragileTime - 0.45);
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
              {platform.kind === "finish" ? <span className="fall-finish-flag" aria-hidden="true" /> : null}
            </div>
          );
        })}
        {view.fallingHazards.map((hazard) => {
          const hazardX = fallDownFallingHazardX(hazard, view.time, stageWidth);
          const hazardY = fallDownFallingHazardScreenY(hazard, view.time, stageHeight);
          if (hazardY < -80 || hazardY > stageHeight + 80) return null;
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
          <PlayerAvatar
            {...resolveFallDownPlayerAvatarView(view)}
            direction={resolveFallDownPlayerDirection(view.inputDirection)}
            effect={shielded ? "shield" : resolveFallDownPlayerAvatarView(view).effect}
            customImageUrl={coOpPlayerSkin === "custom" ? coOpCustomAvatar?.imageDataUrl : null}
            customOutlineColor={coOpPlayerSkin === "custom" ? coOpCustomAvatar?.outlineColor ?? null : null}
            skin={coOpPlayerSkin}
            visualScale={1.18}
          />
        </div>
        {remoteState || remoteStateSubscription ? (
          <div className="fall-down-remote-player-shell" ref={remotePlayerShellRef}>
            <PlayerAvatar
              {...(remoteState ? resolveFallDownRemoteAvatarView(remoteState) : { action: "idle", expression: "neutral" })}
              direction={remoteState?.direction ?? "none"}
              rootRef={remotePlayerAvatarRef}
              customImageUrl={remotePlayerSkin === "custom" ? remotePlayer?.customAvatar?.imageDataUrl : null}
              customOutlineColor={remotePlayerSkin === "custom" ? remotePlayer?.customAvatar?.outlineColor ?? null : null}
              skin={remotePlayerSkin}
              visualScale={1.18}
            />
          </div>
        ) : null}
        </div>
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}
