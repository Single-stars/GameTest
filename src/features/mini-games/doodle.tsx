"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  PlayerAvatar,
  type PlayerAvatarDirection,
  type PlayerAvatarEffect,
  type PlayerAvatarSkin,
  type PlayerAvatarView,
} from "@/features/player-avatar/player-avatar";
import { resolvePlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";
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
  clamp,
  numberParam,
  transformPoint3d,
  useMiniGameFpsCounter,
  useMiniGameStageSize,
  useMiniGameLowPowerMode,
  useMiniGamePerfMonitor,
  useMiniGameScreenShake,
  type MiniGameCompletion,
  type EndlessMiniGameRuntime,
  type MiniGameRunMode,
  type MiniGameStageSize,
  type PrototypeStatus,
} from "@/features/mini-games/common";
import {
  DOODLE_GRAVITY,
  DOODLE_JUMP_VELOCITY,
  generateDoodleWorldLayout,
  getDoodleBounceVelocity,
  getDoodleHazardVisibleBuffer,
  selectVisibleDoodleHazards,
  selectVisibleDoodlePlatforms,
  type GeneratedDoodleHazard,
  type GeneratedDoodlePlatform,
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

const DOODLE_PLAYER_SPEED = 315;
const DOODLE_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_FAST_STATE_SYNC_MS;
const ENDLESS_DOODLE_ENERGY_DISTANCE = 5;
const ENDLESS_DOODLE_MAX_NORMAL_PLATFORM_WIDTH = 104;
const ENDLESS_FULL_ENERGY_PICKUP_CHANCE_PER_SECOND = 1 / 60;
const ENDLESS_DOODLE_CLOSE_CALL_COOLDOWN_MS = 1200;
const ENDLESS_DOODLE_HAZARD_CLOSE_CALL_MARGIN = 20;
const DEBUG_MINI_GAME_HITBOX = false;
type DoodlePlatform = GeneratedDoodlePlatform & { used?: boolean };
type DoodleHazard = GeneratedDoodleHazard;

type DoodleEnergyPickup = {
  id: number;
  x: number;
  y: number;
  collected: boolean;
};

type DoodleFrame = {
  started: boolean;
  time: number;
  playerX: number;
  playerY: number;
  playerVy: number;
  cameraY: number;
  platforms: DoodlePlatform[];
  hazards: DoodleHazard[];
  energyPickups: DoodleEnergyPickup[];
  riskHit: number;
  highEnergyStreak: number;
  playerTurns: number;
  playerDirection: PlayerAvatarDirection;
  jumpTurnAvailable: boolean;
  lastSafePlatformId: number | null;
  failures: number;
  invincibleUntil: number;
  respawnAwaitingInput: boolean;
  respawnCameraStartY: number;
  respawnCameraEndY: number;
  respawnCameraStartedAt: number;
  respawnCameraUntil: number;
  status: PrototypeStatus;
  reason: string;
};

type DoodleViewFrame = {
  cameraY: number;
  failures: number;
  invincibleUntil: number;
  playerTurns: number;
  playerDirection: PlayerAvatarDirection;
  playerVy: number;
  playerX: number;
  playerY: number;
  progressPercent: number;
  reason: string;
  riskHit: number;
  started: boolean;
  status: PrototypeStatus;
  time: number;
  visibleHazards: DoodleHazard[];
  visibleEnergyPickups: DoodleEnergyPickup[];
  visiblePlatforms: DoodlePlatform[];
};

export type DoodleRuntimeState = {
  cameraY: number;
  direction: PlayerAvatarDirection;
  elapsedMs: number;
  failures: number;
  playerDirection: PlayerAvatarDirection;
  progress: number;
  status: PrototypeStatus;
  usedPlatformIds: number[];
  vx: number;
  vy: number;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
};

export type DoodleRemotePlayer = {
  customAvatar?: {
    imageDataUrl: string;
    outlineColor?: string;
  };
  skinId?: string;
};

export type DoodleRemoteState = SelfGameState;

function makeDoodleWorld(level: MiniGameLevelConfig, runSeed: string, stageSize: MiniGameStageSize) {
  return generateDoodleWorldLayout(level, runSeed, {
    playerSize: PLAYER_SIZE,
    stageHeight: stageSize.height,
    stageWidth: stageSize.width,
  });
}

function normalizeEndlessDoodlePlatforms(platforms: DoodlePlatform[]): DoodlePlatform[] {
  return platforms.map((platform) => {
    const playablePlatform = platform.finish ? { ...platform, finish: false } : platform;
    return {
      ...playablePlatform,
      width: Math.min(platform.width, ENDLESS_DOODLE_MAX_NORMAL_PLATFORM_WIDTH),
    };
  });
}

function makeEndlessDoodleSegmentLevel(
  level: MiniGameLevelConfig,
  progress: number,
  debugDifficulty: number,
): MiniGameLevelConfig {
  const config = getEndlessMiniGameStageConfig({ debugDifficulty, miniGameId: "doodle", progress });
  return {
    ...level,
    levelId: `${level.levelId}-endless-${config.sourceAdvancedLevel}-${Math.floor(progress)}`,
    params: {
      ...level.params,
      ...config.params,
    },
  };
}

function extendEndlessDoodleWorld(
  current: DoodleFrame,
  level: MiniGameLevelConfig,
  runSeed: string,
  stageSize: MiniGameStageSize,
  progress: number,
  debugDifficulty: number,
) {
  const futureTargetY = Math.max(current.cameraY + stageSize.height * 2.35, current.playerY + stageSize.height * 1.85);
  let highestPlatformY = current.platforms.reduce((highest, platform) => Math.max(highest, platform.y), 0);
  if (highestPlatformY >= futureTargetY) return false;

  const segmentLevel = makeEndlessDoodleSegmentLevel(level, progress, debugDifficulty);
  const segment = generateDoodleWorldLayout(segmentLevel, `${runSeed}:endless:${Math.floor(highestPlatformY)}`, {
    playerSize: PLAYER_SIZE,
    stageHeight: stageSize.height,
    stageWidth: stageSize.width,
  });
  const playablePlatforms = normalizeEndlessDoodlePlatforms(segment.platforms).filter((platform) => !platform.start);
  const firstSegmentY = playablePlatforms[0]?.y;
  if (firstSegmentY === undefined) return false;

  let nextPlatformId = current.platforms.reduce((next, platform) => Math.max(next, platform.id + 1), 0);
  let nextHazardId = current.hazards.reduce((next, hazard) => Math.max(next, hazard.id + 1), 0);
  const platformGap = numberParam(segmentLevel.params, "platformGap", 104);
  const offsetY = highestPlatformY + platformGap - firstSegmentY;
  for (const platform of playablePlatforms) {
    current.platforms.push({
      ...platform,
      finish: false,
      id: nextPlatformId,
      start: false,
      used: false,
      y: platform.y + offsetY,
    });
    nextPlatformId += 1;
  }
  for (const hazard of segment.hazards) {
    current.hazards.push({
      ...hazard,
      id: nextHazardId,
      y: hazard.y + offsetY,
    });
    nextHazardId += 1;
  }

  highestPlatformY = current.platforms.reduce((highest, platform) => Math.max(highest, platform.y), highestPlatformY);
  const pruneBeforeY = current.cameraY - stageSize.height * 1.45;
  current.platforms = current.platforms.filter((platform) => platform.id === current.lastSafePlatformId || platform.y >= pruneBeforeY);
  current.hazards = current.hazards.filter((hazard) => hazard.y + hazard.size >= pruneBeforeY);
  return highestPlatformY >= futureTargetY;
}

function movingPlatformX(platform: DoodlePlatform, time: number, stageWidth: number) {
  return platform.moving ? clamp(platform.x + Math.sin(time * platform.speed + platform.phase) * platform.range, platform.width / 2 + 12, stageWidth - platform.width / 2 - 12) : platform.x;
}

function resolveDoodlePlayerDirection(direction: number): PlayerAvatarDirection {
  if (direction < 0) return "left";
  if (direction > 0) return "right";
  return "none";
}

function movingHazardPosition(hazard: DoodleHazard, time: number, stageWidth: number) {
  if (!hazard.movementEnabled) return { x: hazard.x, y: hazard.y, size: hazard.size };
  const phase = time * hazard.speed + hazard.phase;
  const offset = Math.sin(phase) * hazard.range;
  if (hazard.movementPattern === "vertical") return { x: hazard.x, y: hazard.y + offset, size: hazard.size };
  if (hazard.movementPattern === "patrolDiagonal") {
    return {
      x: clamp(hazard.x + offset * 0.82, hazard.size / 2 + 18, stageWidth - hazard.size / 2 - 18),
      y: hazard.y + offset * 0.42,
      size: hazard.size,
    };
  }
  if (hazard.movementPattern === "orbitSmall") {
    return {
      x: clamp(hazard.x + Math.cos(phase) * hazard.range * 0.78, hazard.size / 2 + 18, stageWidth - hazard.size / 2 - 18),
      y: hazard.y + Math.sin(phase) * hazard.range * 0.58,
      size: hazard.size,
    };
  }
  if (hazard.movementPattern === "pulse") {
    return { x: hazard.x, y: hazard.y, size: hazard.size * (1 + Math.max(0, Math.sin(phase)) * 0.16) };
  }
  if (hazard.movementPattern === "slowCross") {
    return {
      x: clamp(hazard.x + offset, hazard.size / 2 + 18, stageWidth - hazard.size / 2 - 18),
      y: hazard.y + Math.sin(phase * 0.55) * 12,
      size: hazard.size,
    };
  }
  return {
    x: clamp(hazard.x + offset, hazard.size / 2 + 18, stageWidth - hazard.size / 2 - 18),
    y: hazard.y,
    size: hazard.size,
  };
}

function createDoodleRuntime(world: ReturnType<typeof makeDoodleWorld>, stageWidth: number): DoodleFrame {
  return {
    started: false,
    time: 0,
    playerX: stageWidth / 2,
    playerY: world.startPlayerY,
    playerVy: 0,
    cameraY: 0,
    platforms: world.platforms.map((platform) => ({ ...platform, used: false })),
    hazards: world.hazards,
    energyPickups: [],
    riskHit: 0,
    highEnergyStreak: 0,
    playerTurns: 0,
    playerDirection: "none",
    jumpTurnAvailable: false,
    lastSafePlatformId: world.platforms[0]?.id ?? null,
    failures: 0,
    invincibleUntil: 0,
    respawnAwaitingInput: false,
    respawnCameraStartY: 0,
    respawnCameraEndY: 0,
    respawnCameraStartedAt: 0,
    respawnCameraUntil: 0,
    status: "playing",
    reason: "",
  };
}

function smoothDoodleRespawnCamera(startY: number, endY: number, progress: number) {
  const t = clamp(progress, 0, 1);
  const eased = t * t * (3 - 2 * t);
  return startY + (endY - startY) * eased;
}

function resolveDoodleLastSafePlatform(frame: DoodleFrame) {
  return frame.platforms.find((platform) => platform.id === frame.lastSafePlatformId && !platform.risk && !platform.finish) ?? frame.platforms.find((platform) => platform.start) ?? frame.platforms[0];
}

function syncDoodleRespawnPlayerWithPlatform(frame: DoodleFrame, time: number, stageWidth: number) {
  if (!frame.respawnAwaitingInput) return;
  const safePlatform = resolveDoodleLastSafePlatform(frame);
  if (!safePlatform) return;
  frame.playerX = movingPlatformX(safePlatform, time, stageWidth);
  frame.playerY = safePlatform.y + PLAYER_SIZE / 2;
}

function recoverEndlessDoodleFailure(current: DoodleFrame, reason: string, time: number, stageWidth: number, stageHeight: number) {
  const safeRespawnPlatform = resolveDoodleLastSafePlatform(current);
  current.failures += 1;
  current.highEnergyStreak = 0;
  current.status = "playing";
  current.reason = reason;
  safeRespawnPlatform.used = false;
  current.playerVy = 0;
  current.started = false;
  current.jumpTurnAvailable = false;
  current.respawnAwaitingInput = true;
  syncDoodleRespawnPlayerWithPlatform(current, time, stageWidth);
  const respawnCameraY = Math.max(0, current.playerY - stageHeight * 0.45);
  current.respawnCameraStartY = current.cameraY;
  current.respawnCameraEndY = respawnCameraY;
  current.respawnCameraStartedAt = time;
  current.respawnCameraUntil = time + 0.38;
  current.cameraY = smoothDoodleRespawnCamera(current.respawnCameraStartY, current.respawnCameraEndY, 0);
  current.invincibleUntil = time + 0.5;
}

function resolveDoodleCoOpInputDirection(localDirection: number, coOpRole: "left" | "right" | null | undefined, coOpInputState: DoodleRemoteState | null | undefined) {
  const localCoOpDirection = !coOpRole ? clamp(localDirection, -1, 1) : localDirection === 0 ? 0 : coOpRole === "left" ? -1 : 1;
  const remoteCoOpDirection = coOpInputState?.direction === "left" ? -1 : coOpInputState?.direction === "right" ? 1 : 0;
  return clamp(localCoOpDirection + remoteCoOpDirection, -1, 1);
}

function applyDoodleAuthoritativeState(frame: DoodleFrame, authoritativeState: SelfGameState | null | undefined, targetHeight: number) {
  if (!authoritativeState) return false;
  if (typeof authoritativeState.x !== "number" || typeof authoritativeState.y !== "number" || typeof authoritativeState.cameraY !== "number") {
    return false;
  }
  frame.playerX = authoritativeState.x;
  frame.playerY = authoritativeState.y;
  frame.cameraY = authoritativeState.cameraY;
  const usedPlatformIds = new Set(authoritativeState.usedPlatformIds ?? []);
  for (const platform of frame.platforms) {
    platform.used = usedPlatformIds.has(platform.id);
  }
  frame.time = Math.max(frame.time, (authoritativeState.elapsedMs ?? 0) / 1000);
  frame.failures = authoritativeState.failures ?? frame.failures;
  frame.playerVy = authoritativeState.vy ?? frame.playerVy;
  void targetHeight;
  frame.status = authoritativeState.status === "finished" ? "passed" : authoritativeState.status;
  frame.started = frame.status === "playing";
  if (frame.status !== "playing") {
    frame.playerDirection = "none";
    frame.playerVy = 0;
  }
  return true;
}

function makeDoodleView(frame: DoodleFrame, targetHeight: number, buffer: number, stageHeight: number): DoodleViewFrame {
  return {
    cameraY: frame.cameraY,
    failures: frame.failures,
    invincibleUntil: frame.invincibleUntil,
    playerTurns: frame.playerTurns,
    playerDirection: frame.playerDirection,
    playerVy: frame.playerVy,
    playerX: frame.playerX,
    playerY: frame.playerY,
    progressPercent: clamp((frame.playerY / targetHeight) * 100, 0, 100),
    reason: frame.reason,
    riskHit: frame.riskHit,
    started: frame.started,
    status: frame.status,
    time: frame.time,
    visibleHazards: selectVisibleDoodleHazards(frame.hazards, {
      buffer: getDoodleHazardVisibleBuffer(buffer),
      cameraY: frame.cameraY,
      stageHeight,
    }),
    visibleEnergyPickups: selectVisibleDoodleEnergyPickups(frame, buffer, stageHeight),
    visiblePlatforms: resolveDoodleSpectatorPlatforms(frame, buffer, stageHeight),
  };
}

function selectVisibleDoodleEnergyPickups(frame: DoodleFrame, buffer: number, stageHeight: number) {
  return frame.energyPickups.filter((pickup) => {
    if (pickup.collected) return false;
    const screenY = stageHeight - (pickup.y - frame.cameraY);
    return screenY >= -buffer && screenY <= stageHeight + buffer;
  });
}

function resolveDoodleSpectatorPlatforms(frame: DoodleFrame, buffer: number, stageHeight: number) {
  return {
    visiblePlatforms: selectVisibleDoodlePlatforms(frame.platforms, {
      buffer,
      cameraY: frame.cameraY,
      stageHeight,
    }),
  }.visiblePlatforms;
}

function hasDoodleSpectatorPlatforms(frame: DoodleFrame, cameraY: number, buffer: number, stageHeight: number) {
  return selectVisibleDoodlePlatforms(frame.platforms, {
    buffer,
    cameraY,
    stageHeight,
  }).length > 0;
}

function restoreDoodleSpectatorWorld(
  frame: DoodleFrame,
  level: MiniGameLevelConfig,
  runSeed: string,
  stageSize: MiniGameStageSize,
  cameraY: number,
  buffer: number,
) {
  if (hasDoodleSpectatorPlatforms(frame, cameraY, buffer, stageSize.height)) return false;
  const restored = makeDoodleWorld(level, runSeed, stageSize);
  const minY = cameraY - buffer;
  const maxY = cameraY + stageSize.height + buffer;
  const restoredLocalPlatformCount = frame.platforms.filter((platform) => platform.used && platform.y >= minY && platform.y <= maxY).length;
  frame.platforms = frame.platforms.map((platform) =>
    platform.y >= minY && platform.y <= maxY ? { ...platform, used: false } : platform,
  );
  const platformIds = new Set(frame.platforms.map((platform) => platform.id));
  const hazardIds = new Set(frame.hazards.map((hazard) => hazard.id));
  const restoredPlatforms = restored.platforms.filter(
    (platform) => !platformIds.has(platform.id) && platform.y >= minY && platform.y <= maxY,
  );
  const restoredHazards = restored.hazards.filter(
    (hazard) => !hazardIds.has(hazard.id) && hazard.y + hazard.size >= minY && hazard.y - hazard.size <= maxY,
  );
  if (restoredPlatforms.length === 0 && restoredHazards.length === 0) return restoredLocalPlatformCount > 0;
  frame.platforms = [...frame.platforms, ...restoredPlatforms.map((platform) => ({ ...platform, used: false }))].sort((left, right) => left.y - right.y);
  frame.hazards = [...frame.hazards, ...restoredHazards.map((hazard) => ({ ...hazard }))].sort((left, right) => left.y - right.y);
  return true;
}

function syncDoodleSpectatorPlatformUsage(frame: DoodleFrame, spectatorState: SelfGameState) {
  const usedPlatformIds = new Set(spectatorState.usedPlatformIds ?? []);
  let changed = false;
  for (const platform of frame.platforms) {
    const wasUsed = platform.used === true;
    platform.used = usedPlatformIds.has(platform.id);
    if (platform.used !== wasUsed) changed = true;
  }
  return changed;
}

function makeDoodleRuntimeState(frame: DoodleFrame, targetHeight: number, inputDirection = frame.playerDirection === "left" ? -1 : frame.playerDirection === "right" ? 1 : 0): DoodleRuntimeState {
  const progressPercent = clamp((frame.playerY / targetHeight) * 100, 0, 100);
  const inputPlayerDirection = resolveDoodlePlayerDirection(inputDirection);
  const vx =
    inputPlayerDirection === "left"
      ? -DOODLE_PLAYER_SPEED
      : inputPlayerDirection === "right"
        ? DOODLE_PLAYER_SPEED
        : 0;
  return {
    cameraY: frame.cameraY,
    direction: inputPlayerDirection,
    elapsedMs: Math.round(frame.time * 1000),
    failures: frame.failures,
    playerDirection: frame.playerDirection,
    progress: Number((progressPercent / 100).toFixed(4)),
    status: frame.status,
    usedPlatformIds: frame.platforms.filter((platform) => platform.used).map((platform) => platform.id),
    vx,
    vy: frame.playerVy,
    x: frame.playerX,
    y: frame.playerY,
    screenX: frame.playerX,
    screenY: targetHeight - (frame.playerY - frame.cameraY),
  };
}

function resolveDoodlePlayerAvatarView(view: DoodleViewFrame): PlayerAvatarView {
  if (view.status === "failed") return { action: "hit", expression: "hurt" };
  if (view.status === "passed") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (view.time < view.invincibleUntil) return { action: "idle", expression: "neutral", effect: "shield" };
  return { action: "idle", expression: "neutral" };
}

function resolveDoodleRemoteSkin(remotePlayer: DoodleRemotePlayer | null | undefined): PlayerAvatarSkin {
  return resolvePlayerAvatarSkin(remotePlayer?.skinId);
}

function resolveDoodleCoOpSkin(coOpSkinId: string | null | undefined): PlayerAvatarSkin | undefined {
  return coOpSkinId ? resolvePlayerAvatarSkin(coOpSkinId) : undefined;
}

function resolveDoodleRemoteAvatarView(remoteState: DoodleRemoteState): PlayerAvatarView {
  if (remoteState.status === "failed") return { action: "hit", expression: "hurt" };
  if (remoteState.status === "finished") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  return { action: "idle", expression: "neutral" };
}

function smoothSpectatorCamera(current: number, target: number, delta: number) {
  const blend = 1 - Math.exp(-Math.max(0, delta) * 7);
  return current + (target - current) * blend;
}

function syncDoodleWaveParallax(stage: HTMLDivElement | null, playerX: number, playerY: number, cameraY: number, stageWidth: number) {
  if (!stage) return;
  const horizontalOffset = playerX - stageWidth * 0.5;
  const verticalOffset = playerY - cameraY;
  stage.style.setProperty("--difficulty-wave-parallax-x", (cameraY * 0.1 + horizontalOffset * 0.22).toFixed(2));
  stage.style.setProperty("--difficulty-wave-parallax-y", (cameraY * 0.86 + verticalOffset * 0.05).toFixed(2));
}

export function DoodleJumpPrototype({
  autoStart = false,
  baseRevives,
  endless,
  level,
  mode,
  onRuntimeState,
  remotePlayer,
  remoteStateSubscription,
  remoteState,
  spectateRemoteState = null,
  runSeed,
  damageInvincible = false,
  shielded = false,
  logicStageSizeOverride,
  unlimitedRespawn = false,
  coOpInputState = null,
  coOpInputStateSubscription = null,
  coOpRole = null,
  coOpSkinId = null,
  coOpCustomAvatar = null,
  avatarEffect = "none",
  authoritativeStateSubscription = null,
  onBackToSelect,
  onBaseReviveUsed,
  onComplete,
  onRestart,
  paused = false,
}: {
  autoStart?: boolean;
  avatarEffect?: PlayerAvatarEffect;
  baseRevives?: number;
  endless?: EndlessMiniGameRuntime;
  level: MiniGameLevelConfig;
  mode: MiniGameRunMode | "endless";
  onRuntimeState?: (state: DoodleRuntimeState) => void;
  remotePlayer?: DoodleRemotePlayer | null;
  remoteStateSubscription?: ((listener: (state: DoodleRemoteState) => void) => (() => void)) | null;
  remoteState?: DoodleRemoteState | null;
  spectateRemoteState?: SelfGameState | null;
  runSeed: string;
  damageInvincible?: boolean;
  shielded?: boolean;
  logicStageSizeOverride?: MiniGameStageSize;
  unlimitedRespawn?: boolean;
  coOpInputState?: DoodleRemoteState | null;
  coOpInputStateSubscription?: ((listener: (state: DoodleRemoteState) => void) => (() => void)) | null;
  coOpRole?: "left" | "right" | null;
  coOpSkinId?: string | null;
  coOpCustomAvatar?: DoodleRemotePlayer["customAvatar"] | null;
  authoritativeStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  onBackToSelect: () => void;
  onBaseReviveUsed?: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart: () => void;
  paused?: boolean;
}) {
  const { stageRef, stageSize: measuredStageSize } = useMiniGameStageSize<HTMLDivElement>();
  const logicStageSize = logicStageSizeOverride ?? measuredStageSize;
  const logicStageWidth = logicStageSize.width;
  const logicStageHeight = logicStageSize.height;
  const visualStageWidth = measuredStageSize.width;
  const visualStageHeight = measuredStageSize.height;
  const worldLayerScale = Math.min(visualStageWidth / logicStageWidth, visualStageHeight / logicStageHeight);
  const worldLayerOffsetX = (visualStageWidth - logicStageWidth * worldLayerScale) / 2;
  const worldLayerOffsetY = (visualStageHeight - logicStageHeight * worldLayerScale) / 2;
  const world = useMemo(() => makeDoodleWorld(level, runSeed, logicStageSize), [logicStageSize, level, runSeed]);
  const riskTotal = numberParam(level.params, "requiredRiskPlatforms", 0);
  const riskJumpMultiplier = numberParam(level.params, "riskJumpMultiplier", 1);
  const isLowPowerDevice = useMiniGameLowPowerMode();
  const visibleBuffer = isLowPowerDevice ? 96 : 160;
  const isEndlessRun = Boolean(endless);
  const initialRuntime = useMemo(() => {
    const runtime = createDoodleRuntime(world, logicStageWidth);
    if (isEndlessRun) {
      runtime.platforms = normalizeEndlessDoodlePlatforms(world.platforms);
    }
    return runtime;
  }, [isEndlessRun, logicStageWidth, world]);
  const inputDirectionRef = useRef(0);
  const inputPointerIdRef = useRef<number | null>(null);
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
  const coOpInputStateRef = useRef<DoodleRemoteState | null>(coOpInputState);
  const spectateRemoteStateRef = useRef<SelfGameState | null>(spectateRemoteState);
  const spectatorSceneTimeRef = useRef(0);
  const authoritativePlayback = Boolean(authoritativeStateSubscription);
  const platformRefs = useRef(new Map<number, HTMLDivElement>());
  const hazardRefs = useRef(new Map<number, HTMLDivElement>());
  const energyPickupRefs = useRef(new Map<number, HTMLDivElement>());
  const energyPickupIdRef = useRef(0);
  const runtimeRef = useRef<DoodleFrame>(initialRuntime);
  const lastUiSyncRef = useRef(0);
  const lastRuntimeSyncRef = useRef(0);
  const completedRef = useRef(false);
  const { fps, recordFrame: recordDebugFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const perf = useMiniGamePerfMonitor("Doodle");
  const { enabled: perfEnabled, recordFrame: recordPerfFrame, recordReactSync } = perf;
  const { screenShakeClassName, triggerScreenShake } = useMiniGameScreenShake();
  const [view, setView] = useState<DoodleViewFrame>(() => makeDoodleView(initialRuntime, world.targetHeight, visibleBuffer, logicStageHeight));
  const remotePlayerSkin = resolveDoodleRemoteSkin(remotePlayer);
  const coOpPlayerSkin = resolveDoodleCoOpSkin(coOpSkinId);
  const onRuntimeStateRef = useRef<typeof onRuntimeState>(onRuntimeState);
  const endlessRef = useRef(endless);
  const endlessEnergyDistanceRef = useRef(0);
  const lastCloseCallBonusAtRef = useRef(-Infinity);
  const pausedRef = useRef(paused);

  useEffect(() => {
    onRuntimeStateRef.current = onRuntimeState;
  }, [onRuntimeState]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  useEffect(() => {
    spectateRemoteStateRef.current = spectateRemoteState;
  }, [spectateRemoteState]);

  const syncDoodleView = useCallback(
    (time = performance.now()) => {
      lastUiSyncRef.current = time;
      recordReactSync();
      const nextView = makeDoodleView(runtimeRef.current, world.targetHeight, visibleBuffer, logicStageHeight);
      setView(nextView);
    },
    [logicStageHeight, recordReactSync, visibleBuffer, world.targetHeight],
  );

  const syncDoodleRuntimeState = useCallback(
    (time = performance.now(), force = false) => {
      if (!onRuntimeStateRef.current) return;
      if (!force && time - lastRuntimeSyncRef.current < DOODLE_MULTIPLAYER_RUNTIME_SYNC_MS) return;
      lastRuntimeSyncRef.current = time;
      onRuntimeStateRef.current(makeDoodleRuntimeState(runtimeRef.current, world.targetHeight, inputDirectionRef.current));
    },
    [world.targetHeight],
  );

  const awardDoodleCloseCallBonus = useCallback((timeMs: number) => {
    if (!isEndlessRun) return;
    if (timeMs - lastCloseCallBonusAtRef.current < ENDLESS_DOODLE_CLOSE_CALL_COOLDOWN_MS) return;
    lastCloseCallBonusAtRef.current = timeMs;
    endlessRef.current?.incrementMetric("nearMissEscapes");
    endlessRef.current?.awardSpecialBonus("死里逃生！");
  }, [isEndlessRun]);

  useEffect(() => {
    runtimeRef.current = initialRuntime;
    spectatorSceneTimeRef.current = initialRuntime.time;
    lastUiSyncRef.current = 0;
    lastRuntimeSyncRef.current = 0;
    completedRef.current = false;
    energyPickupIdRef.current = 0;
    lastCloseCallBonusAtRef.current = -Infinity;
    authoritativeSmootherRef.current.reset();
    const timer = window.setTimeout(() => {
      setView(makeDoodleView(initialRuntime, world.targetHeight, visibleBuffer, logicStageHeight));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRuntime, logicStageHeight, visibleBuffer, world.targetHeight]);

  useEffect(() => {
    remoteSmootherRef.current.reset();
    remoteVisualSmootherRef.current.reset();
    if (remotePlayerShellRef.current) {
      remotePlayerShellRef.current.style.display = "none";
    }
  }, [runSeed]);

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
    const timer = window.setTimeout(() => syncDoodleView(), 0);
    return () => window.clearTimeout(timer);
  }, [syncDoodleView]);

  useEffect(() => {
    if (!autoStart) return;
    const timer = window.setTimeout(() => {
      const current = runtimeRef.current;
      if (current.started || current.status !== "playing") return;
      if (current.respawnAwaitingInput) return;
      current.started = true;
      current.playerVy = DOODLE_JUMP_VELOCITY;
      current.jumpTurnAvailable = true;
      syncDoodleView();
      syncDoodleRuntimeState(performance.now(), true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, syncDoodleRuntimeState, syncDoodleView]);

  const startDoodle = useCallback(() => {
    const current = runtimeRef.current;
    if (authoritativePlayback) return;
    if (current.started || current.status !== "playing") return;
    if (current.respawnAwaitingInput && current.time < current.respawnCameraUntil) return;
    current.respawnAwaitingInput = false;
    current.started = true;
    current.playerVy = DOODLE_JUMP_VELOCITY;
    current.jumpTurnAvailable = true;
    syncDoodleView();
    syncDoodleRuntimeState(performance.now(), true);
  }, [authoritativePlayback, syncDoodleRuntimeState, syncDoodleView]);

  useEffect(() => {
    coOpInputStateRef.current = coOpInputState;
    if ((coOpInputState?.direction ?? "none") !== "none") startDoodle();
  }, [coOpInputState, startDoodle]);

  function chooseDoodleDirection(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
  }

  const updateDoodleDirection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (inputPointerIdRef.current !== event.pointerId) return;
    const direction = coOpRole ? (coOpRole === "left" ? -1 : 1) : chooseDoodleDirection(event);
    inputDirectionRef.current = direction;
    if (authoritativePlayback) syncDoodleRuntimeState(performance.now(), true);
  }, [authoritativePlayback, coOpRole, syncDoodleRuntimeState]);

  const beginDoodleDirection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    inputPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    const direction = coOpRole ? (coOpRole === "left" ? -1 : 1) : chooseDoodleDirection(event);
    inputDirectionRef.current = direction;
    if (authoritativePlayback) {
      syncDoodleRuntimeState(performance.now(), true);
      return;
    }
    startDoodle();
  }, [authoritativePlayback, coOpRole, startDoodle, syncDoodleRuntimeState]);

  const stopDoodleDirection = useCallback((event?: ReactPointerEvent<HTMLDivElement>) => {
    event?.preventDefault();
    if (event && inputPointerIdRef.current !== null && inputPointerIdRef.current !== event.pointerId) return;
    inputPointerIdRef.current = null;
    inputDirectionRef.current = 0;
    syncDoodleRuntimeState(performance.now(), true);
  }, [syncDoodleRuntimeState]);

  useEffect(() => {
    if (!coOpInputStateSubscription) return;
    return coOpInputStateSubscription((nextState) => {
      coOpInputStateRef.current = nextState;
      if ((nextState.direction ?? "none") !== "none") startDoodle();
    });
  }, [coOpInputStateSubscription, startDoodle]);

  useEffect(() => {
    authoritativeSmootherRef.current.reset();
    if (!authoritativeStateSubscription) return;
    return authoritativeStateSubscription((nextState) => {
      if (nextState.status !== "playing") {
        authoritativeSmootherRef.current.reset();
        if (applyDoodleAuthoritativeState(runtimeRef.current, nextState, world.targetHeight)) {
          syncDoodleView();
          syncDoodleRuntimeState(performance.now(), true);
        }
        return;
      }
      authoritativeSmootherRef.current.push(nextState, performance.now());
    });
  }, [authoritativeStateSubscription, syncDoodleRuntimeState, syncDoodleView, world.targetHeight]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const updateDom = (current: DoodleFrame, frameTime: number, spectatingRemote = false, sceneTime = current.time) => {
      syncDoodleWaveParallax(stageRef.current, current.playerX, current.playerY, current.cameraY, logicStageWidth);
      const platformById = new Map(current.platforms.map((platform) => [platform.id, platform]));
      const hazardById = new Map(current.hazards.map((hazard) => [hazard.id, hazard]));
      const energyPickupById = new Map(current.energyPickups.map((pickup) => [pickup.id, pickup]));
      if (playerShellRef.current) {
        playerShellRef.current.style.display = "";
        if (!spectatingRemote) {
          playerShellRef.current.style.transform = transformPoint3d(
            current.playerX - PLAYER_SIZE / 2,
            logicStageHeight - (current.playerY - current.cameraY) - PLAYER_SIZE / 2,
          );
        }
      }
      if (remotePlayerShellRef.current) {
        const sampledRemote = remoteSmootherRef.current.sample(frameTime);
        const visualRemote = remoteVisualSmootherRef.current.update(sampledRemote, frameTime);
        if (visualRemote && typeof visualRemote.x === "number" && typeof visualRemote.y === "number") {
          remotePlayerShellRef.current.style.display = "";
          const remoteX = clamp(visualRemote.x, PLAYER_SIZE / 2, logicStageWidth - PLAYER_SIZE / 2) - PLAYER_SIZE / 2;
          const remoteY = logicStageHeight - (visualRemote.y - current.cameraY) - PLAYER_SIZE / 2;
          remotePlayerShellRef.current.style.transform = `${transformPoint3d(remoteX, remoteY)} rotate(${visualRemote.angle}deg)`;
          applyRemoteAvatarVisual(remotePlayerAvatarRef.current, visualRemote);
        } else {
          remotePlayerShellRef.current.style.display = "none";
        }
      }

      for (const [id, node] of platformRefs.current) {
        const platform = platformById.get(id);
        if (!platform || (platform.used && !platform.finish)) {
          node.style.display = "none";
          continue;
        }
        node.style.display = "";
        const x = movingPlatformX(platform, sceneTime, logicStageWidth);
        const y = logicStageHeight - (platform.y - current.cameraY);
        node.style.transform = transformPoint3d(x - platform.width / 2, y);
      }

      for (const [id, node] of hazardRefs.current) {
        const hazard = hazardById.get(id);
        if (!hazard) continue;
        const position = movingHazardPosition(hazard, sceneTime, logicStageWidth);
        const y = logicStageHeight - (position.y - current.cameraY) - hazard.size / 2;
        const rotate = hazard.movementPattern === "vertical" ? 0 : hazard.movementPattern === "patrolDiagonal" ? 28 : hazard.movementPattern === "slowCross" ? -12 : 45;
        const scale = position.size / hazard.size;
        node.style.transform = `${transformPoint3d(position.x - hazard.size / 2, y)} rotate(${rotate}deg) scale(${scale})`;
      }

      for (const [id, node] of energyPickupRefs.current) {
        const pickup = energyPickupById.get(id);
        if (!pickup || pickup.collected) {
          node.style.display = "none";
          continue;
        }
        node.style.display = "";
        node.style.transform = transformPoint3d(pickup.x - 16, logicStageHeight - (pickup.y - current.cameraY) - 16);
      }
    };

    const tick = (time: number) => {
      recordDebugFrame(time);
      const updateStartedAt = perfEnabled ? performance.now() : 0;
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;
      if (pausedRef.current) {
        frameId = requestAnimationFrame(tick);
        return;
      }
      const paintDoodleFrame = (frame: DoodleFrame, spectatingRemote = false, sceneTime = frame.time) => {
        const updateMs = perfEnabled ? performance.now() - updateStartedAt : 0;
        const renderStartedAt = perfEnabled ? performance.now() : 0;
        updateDom(frame, time, spectatingRemote, sceneTime);
        if (perfEnabled) recordPerfFrame(time, updateMs, performance.now() - renderStartedAt);
      };

      const current = runtimeRef.current;
      const sampledAuthoritativeState = authoritativeSmootherRef.current.sample(performance.now());
      if (applyDoodleAuthoritativeState(current, sampledAuthoritativeState, world.targetHeight)) {
        paintDoodleFrame(current);
        syncDoodleRuntimeState(time);
        if (time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS || current.status !== view.status) {
          syncDoodleView(time);
        }
        frameId = requestAnimationFrame(tick);
        return;
      }
      if (authoritativeStateSubscription) {
        paintDoodleFrame(current);
        frameId = requestAnimationFrame(tick);
        return;
      }

      if (current.status !== "playing") {
        const spectatorState = remoteSmootherRef.current.sample(time) ?? spectateRemoteStateRef.current;
        const spectatingRemote = spectatorState?.status === "playing";
        spectatorSceneTimeRef.current = Math.max(spectatorSceneTimeRef.current, current.time);
        if (spectatingRemote) spectatorSceneTimeRef.current += delta;
        let spectatorViewChanged = false;
        if (spectatingRemote && spectatorState) {
          spectatorViewChanged = syncDoodleSpectatorPlatformUsage(current, spectatorState) || spectatorViewChanged;
        }
        if (spectatingRemote && typeof spectatorState?.cameraY === "number") {
          current.cameraY = smoothSpectatorCamera(current.cameraY, spectatorState.cameraY, delta);
          spectatorViewChanged = restoreDoodleSpectatorWorld(current, level, runSeed, logicStageSize, spectatorState.cameraY, visibleBuffer) || spectatorViewChanged;
          spectatorViewChanged = syncDoodleSpectatorPlatformUsage(current, spectatorState) || spectatorViewChanged;
        }
        paintDoodleFrame(current, spectatingRemote, spectatorSceneTimeRef.current);
        if (spectatorViewChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) syncDoodleView(time);
        syncDoodleRuntimeState(time);
        const keepRemoteRenderingAfterSettled = mode === "advanced" && Boolean(onRuntimeStateRef.current);
        if (keepRemoteRenderingAfterSettled) {
          syncDoodleRuntimeState(time, true);
          frameId = requestAnimationFrame(tick);
        } else {
          syncDoodleRuntimeState(time, true);
        }
        return;
      }
      if (!current.started) {
        current.time += delta;
        syncDoodleRespawnPlayerWithPlatform(current, current.time, logicStageWidth);
        if (current.respawnAwaitingInput && current.time < current.respawnCameraUntil) {
          current.cameraY = smoothDoodleRespawnCamera(
            current.respawnCameraStartY,
            current.respawnCameraEndY,
            (current.time - current.respawnCameraStartedAt) / Math.max(0.001, current.respawnCameraUntil - current.respawnCameraStartedAt),
          );
          if (current.time >= current.respawnCameraUntil) current.cameraY = current.respawnCameraEndY;
        }
        paintDoodleFrame(current);
        syncDoodleRuntimeState(time);
        frameId = requestAnimationFrame(tick);
        return;
      }

      const nextTime = current.time + delta;
      const endlessDistanceScore = Math.floor(Math.max(0, current.playerY) / 100);
      if (isEndlessRun) {
        extendEndlessDoodleWorld(
          current,
          level,
          runSeed,
          logicStageSize,
          Math.max(endlessRef.current?.score ?? 0, endlessDistanceScore),
          endlessRef.current?.debugDifficulty ?? 0,
        );
      }
      const inputDirection = resolveDoodleCoOpInputDirection(inputDirectionRef.current, coOpRole, coOpInputStateRef.current);
      current.playerDirection = resolveDoodlePlayerDirection(inputDirection);
      current.playerX = clamp(current.playerX + inputDirection * DOODLE_PLAYER_SPEED * delta, PLAYER_SIZE / 2, logicStageWidth - PLAYER_SIZE / 2);
      const nextX = current.playerX;
      const previousY = current.playerY;
      let nextVy = current.playerVy - DOODLE_GRAVITY * delta;
      let nextY = current.playerY + nextVy * delta;
      let riskHit = current.riskHit;
      let highEnergyStreak = current.highEnergyStreak;
      let playerTurns = current.playerTurns;
      let jumpTurnAvailable = current.jumpTurnAvailable;
      let eventChanged = false;
      let landedFinishPlatform = false;
      let reason = "";
      let status: PrototypeStatus = "playing";

      if (inputDirection !== 0 && jumpTurnAvailable) {
        const turnDirection = inputDirection < 0 ? -1 : 1;
        playerTurns += turnDirection;
        jumpTurnAvailable = false;
        eventChanged = true;
      }

      if (nextVy < 0) {
        const minY = Math.min(previousY, nextY) - PLAYER_SIZE;
        const maxY = Math.max(previousY, nextY) + PLAYER_SIZE;
        for (const platform of current.platforms) {
          if (platform.used || platform.y < minY || platform.y > maxY) continue;
          const platformX = movingPlatformX(platform, nextTime, logicStageWidth);
          const crossed = previousY - PLAYER_SIZE / 2 >= platform.y && nextY - PLAYER_SIZE / 2 <= platform.y;
          const insideX = Math.abs(nextX - platformX) <= platform.width / 2 + PLAYER_SIZE / 2;
          if (crossed && insideX) {
            const landedBelowScreenPlatform = isEndlessRun && platform.y < current.cameraY && platform.y >= current.cameraY - 80;
            const powerReleaseActive = endlessRef.current?.getActiveSkill()?.kind === "power-release";
            const highEnergyJump = platform.risk || powerReleaseActive;
            nextY = platform.y + PLAYER_SIZE / 2;
            nextVy = getDoodleBounceVelocity({ risk: highEnergyJump, riskJumpMultiplier });
            platform.used = true;
            landedFinishPlatform = platform.finish === true;
            if (!platform.risk && !platform.finish) current.lastSafePlatformId = platform.id;
            if (platform.risk) riskHit += 1;
            highEnergyStreak = highEnergyJump ? highEnergyStreak + 1 : 0;
            if (isEndlessRun && highEnergyStreak >= 3) {
              endlessRef.current?.incrementMetric("crazyTriggers");
              endlessRef.current?.awardSpecialBonus({ label: `彻底疯狂${highEnergyStreak}！`, amount: 1 });
            }
            if (landedBelowScreenPlatform) awardDoodleCloseCallBonus(time);
            jumpTurnAvailable = true;
            eventChanged = true;
            break;
          }
        }
      }

      const naturalCameraY = Math.max(current.cameraY, nextY - logicStageHeight * 0.45);
      const cameraY =
        nextTime < current.respawnCameraUntil
          ? smoothDoodleRespawnCamera(
              current.respawnCameraStartY,
              current.respawnCameraEndY,
              (nextTime - current.respawnCameraStartedAt) / Math.max(0.001, current.respawnCameraUntil - current.respawnCameraStartedAt),
            )
          : naturalCameraY;
      if (isEndlessRun && Math.random() < delta * ENDLESS_FULL_ENERGY_PICKUP_CHANCE_PER_SECOND) {
        current.energyPickups.push({
          id: energyPickupIdRef.current,
          x: clamp(44 + Math.random() * (logicStageWidth - 88), 36, logicStageWidth - 36),
          y: cameraY + logicStageHeight * (0.68 + Math.random() * 0.82),
          collected: false,
        });
        energyPickupIdRef.current += 1;
      }

      if (isEndlessRun && current.energyPickups.length > 0) {
        for (const pickup of current.energyPickups) {
          if (pickup.collected) continue;
          const dx = nextX - pickup.x;
          const dy = nextY - pickup.y;
          if (dx * dx + dy * dy <= 30 * 30) {
            pickup.collected = true;
            endlessRef.current?.fillEnergy();
            eventChanged = true;
          }
        }
        current.energyPickups = current.energyPickups.filter((pickup) => {
          if (pickup.collected) return false;
          const screenY = logicStageHeight - (pickup.y - cameraY);
          return screenY >= -logicStageHeight * 0.65 && screenY <= logicStageHeight * 1.35;
        });
      }

      if (status === "playing" && !isEndlessRun && !unlimitedRespawn && riskHit < riskTotal) {
        let missedRisk = false;
        for (const platform of current.platforms) {
          if (!platform.used && platform.risk && cameraY > platform.y + logicStageHeight * 0.34) {
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
        let hazardCloseCall = false;
        for (const hazard of current.hazards) {
          const movementRange = hazard.movementEnabled ? hazard.range + 18 : 0;
          if (hazard.y + hazard.size + movementRange < cameraY - 70 || hazard.y - hazard.size - movementRange > cameraY + logicStageHeight + 70) continue;
          const position = movingHazardPosition(hazard, nextTime, logicStageWidth);
          const hitRadius = position.size / 2 + PLAYER_SIZE / 2 - 3;
          const dx = nextX - position.x;
          const dy = nextY - position.y;
          const closeCallRadius = hitRadius + ENDLESS_DOODLE_HAZARD_CLOSE_CALL_MARGIN;
          if (Math.abs(dx) > closeCallRadius || Math.abs(dy) > closeCallRadius) continue;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared <= hitRadius * hitRadius) {
            status = "failed";
            reason = "撞到危险";
            break;
          }
          if (isEndlessRun && distanceSquared <= closeCallRadius * closeCallRadius) hazardCloseCall = true;
        }
        if (status === "playing" && hazardCloseCall) awardDoodleCloseCallBonus(time);
      }

      if (status === "playing" && nextY < cameraY - 80) {
        status = "failed";
        reason = "掉出屏幕底部";
      }

      if (status === "playing" && landedFinishPlatform) {
        if (!isEndlessRun) {
        if (riskHit >= riskTotal || unlimitedRespawn) {
          status = "passed";
          reason = unlimitedRespawn ? "站上最高终点平台" : `站上最高终点平台，必踩平台 ${riskHit}/${riskTotal}`;
        } else {
          status = "failed";
          reason = `漏踩高风险平台 ${riskHit}/${riskTotal}`;
        }
        }
      }

      current.time = nextTime;
      current.playerX = nextX;
      current.playerY = nextY;
      current.playerVy = nextVy;
      current.cameraY = cameraY;
      current.riskHit = riskHit;
      current.highEnergyStreak = highEnergyStreak;
      current.playerTurns = playerTurns;
      current.jumpTurnAvailable = jumpTurnAvailable;
      if (isEndlessRun) {
        const endlessDistanceScore = Math.floor(Math.max(0, current.playerY) / 100);
        endlessRef.current?.setDistanceScore(endlessDistanceScore, false);
        endlessRef.current?.setMetricMax("heightReached", endlessDistanceScore);
        const nextEnergyDistance = Math.floor(endlessDistanceScore / ENDLESS_DOODLE_ENERGY_DISTANCE);
        const energyGain = nextEnergyDistance - endlessEnergyDistanceRef.current;
        if (energyGain > 0) {
          endlessEnergyDistanceRef.current = nextEnergyDistance;
          endlessRef.current?.gainEnergy(energyGain);
        }
      }

      if (isEndlessRun && status === "failed") {
        triggerScreenShake();
        if (endlessRef.current?.loseLife(reason) ?? false) {
          recoverEndlessDoodleFailure(current, reason, nextTime, logicStageWidth, logicStageHeight);
          paintDoodleFrame(current);
          syncDoodleView(time);
          syncDoodleRuntimeState(time, true);
          frameId = requestAnimationFrame(tick);
          return;
        }
        current.status = "failed";
        current.reason = reason;
        paintDoodleFrame(current);
        syncDoodleView(time);
        syncDoodleRuntimeState(time, true);
        return;
      }

      if ((mode === "base" || unlimitedRespawn) && status === "failed") {
        const failures = current.failures + 1;
        const baseFailureLimit = baseRevives ?? BASE_FAILURE_LIMIT;
        if (unlimitedRespawn || failures <= baseFailureLimit) {
          if (!unlimitedRespawn) onBaseReviveUsed?.();
          triggerScreenShake();
          const safeRespawnPlatform = resolveDoodleLastSafePlatform(current);
          safeRespawnPlatform.used = false;
          current.playerX = movingPlatformX(safeRespawnPlatform, nextTime, logicStageWidth);
          current.playerY = safeRespawnPlatform.y + PLAYER_SIZE / 2;
          current.playerVy = 0;
          current.started = false;
          current.jumpTurnAvailable = false;
          current.respawnAwaitingInput = true;
          const respawnCameraY = Math.max(0, current.playerY - logicStageHeight * 0.45);
          current.respawnCameraStartY = current.cameraY;
          current.respawnCameraEndY = respawnCameraY;
          current.respawnCameraStartedAt = nextTime;
          current.respawnCameraUntil = nextTime + 0.38;
          current.cameraY = smoothDoodleRespawnCamera(current.respawnCameraStartY, current.respawnCameraEndY, 0);
          current.failures = failures;
          current.invincibleUntil = nextTime + 1.1;
          current.status = "playing";
          current.reason = reason;
          paintDoodleFrame(current);
          syncDoodleView(time);
          syncDoodleRuntimeState(time, true);
          frameId = requestAnimationFrame(tick);
          return;
        }
        current.failures = failures;
        reason = baseRevives === undefined ? "失败超过 3 次，进入下一关" : "冒险的心用尽，进入下一关";
      }

      if (status === "failed") triggerScreenShake();
      current.status = status;
      current.reason = reason;
      paintDoodleFrame(current);
      if (status !== "playing" || eventChanged) {
        syncDoodleRuntimeState(time, true);
      } else {
        syncDoodleRuntimeState(time);
      }

      if (status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncDoodleView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [authoritativeStateSubscription, awardDoodleCloseCallBonus, baseRevives, coOpRole, isEndlessRun, level, logicStageHeight, logicStageSize, logicStageWidth, mode, onBaseReviveUsed, perfEnabled, recordDebugFrame, recordPerfFrame, riskJumpMultiplier, riskTotal, runSeed, stageRef, syncDoodleRuntimeState, syncDoodleView, triggerScreenShake, unlimitedRespawn, view.status, visibleBuffer, world.targetHeight]);

  const showOverlay = mode === "prototype";
  const worldLayerStyle = {
    height: `${logicStageHeight}px`,
    transform: `${transformPoint3d(worldLayerOffsetX, worldLayerOffsetY)} scale(${worldLayerScale})`,
    width: `${logicStageWidth}px`,
  };
  const playerShellStyle = {
    transform: transformPoint3d(
      clamp(view.playerX, PLAYER_SIZE / 2, logicStageWidth - PLAYER_SIZE / 2) - PLAYER_SIZE / 2,
      logicStageHeight - (view.playerY - view.cameraY) - PLAYER_SIZE / 2,
    ),
  };

  useEffect(() => {
    if (!onComplete || completedRef.current) return;
    const completedStatus = view.status;
    if (completedStatus === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    const progress = clamp((latest.playerY / world.targetHeight) * 100, 0, 100);
    const timer = window.setTimeout(() => {
      onComplete({
        gameId: "doodle",
        levelId: level.levelId,
        status: completedStatus,
        reason: latest.reason,
        elapsedMs: Math.round(latest.time * 1000),
        stats: {
          failures: latest.failures,
          progressPercent: Math.round(progress),
          riskHit: latest.riskHit,
          riskTotal,
          forcedAdvance: mode === "base" && completedStatus === "failed",
        },
      });
    }, mode === "prototype" ? MINI_GAME_COMPLETION_DELAY_MS : 0);
    return () => window.clearTimeout(timer);
  }, [level.levelId, mode, onComplete, riskTotal, view.status, world.targetHeight]);

  const showDoodleMiniScore = !isEndlessRun;

  return (
    <div className="prototype-game-wrap">
      {showDoodleMiniScore ? (
        <div className="mini-score">
          {coOpRole ? <span className="mini-coop-hint">你负责{coOpRole === "left" ? "左" : "右"}</span> : null}
          <span className="mini-progress">进度 {Math.round(view.progressPercent)}%</span>
          {riskTotal > 0 ? <span>高风险 {view.riskHit}/{riskTotal}</span> : null}
        </div>
      ) : null}
      <div
        className={`prototype-stage doodle-stage ${screenShakeClassName} ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        ref={stageRef}
        role="application"
        aria-label="Doodle Jump 型小游戏"
        onLostPointerCapture={stopDoodleDirection}
        onPointerCancel={stopDoodleDirection}
        onPointerDown={beginDoodleDirection}
        onPointerMove={updateDoodleDirection}
        onPointerUp={stopDoodleDirection}
      >
        <DifficultyWaveBackdrop />
        <MiniGameFpsBadge fps={fps} />
        <MiniGamePerfPanel snapshot={perf.snapshot} />
        <div className="doodle-world-layer" style={worldLayerStyle}>
          {view.visiblePlatforms.map((platform) => {
            const x = movingPlatformX(platform, view.time, logicStageWidth);
            const y = logicStageHeight - (platform.y - view.cameraY);
            return (
              <div
                className={`doodle-platform ${platform.start ? "start" : ""} ${platform.finish ? "finish" : ""} ${platform.moving ? "moving" : ""} ${platform.risk ? "risk" : ""}`}
                key={platform.id}
                ref={(node) => {
                  if (node) platformRefs.current.set(platform.id, node);
                  else platformRefs.current.delete(platform.id);
                }}
                style={{
                  transform: transformPoint3d(x - platform.width / 2, y),
                  width: `${platform.width}px`,
                }}
              >
              </div>
            );
          })}
          {view.visibleHazards.map((hazard) => {
            const position = movingHazardPosition(hazard, view.time, logicStageWidth);
            const y = logicStageHeight - (position.y - view.cameraY) - hazard.size / 2;
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
          {view.visibleEnergyPickups.map((pickup) => (
            <div
              className="doodle-energy-pickup"
              key={pickup.id}
              ref={(node) => {
                if (node) energyPickupRefs.current.set(pickup.id, node);
                else energyPickupRefs.current.delete(pickup.id);
              }}
              style={{ transform: transformPoint3d(pickup.x - 16, logicStageHeight - (pickup.y - view.cameraY) - 16) }}
            />
          ))}
          <div
            className={`doodle-player-shell ${damageInvincible ? "damage-invincible" : view.time < view.invincibleUntil ? "invincible" : ""}`}
            ref={playerShellRef}
            style={playerShellStyle}
          >
            <PlayerAvatar
              {...resolveDoodlePlayerAvatarView(view)}
              direction={view.playerDirection}
              effect={shielded ? "shield" : avatarEffect !== "none" ? avatarEffect : resolveDoodlePlayerAvatarView(view).effect}
              gravity="normal"
              rotationTurns={view.playerTurns}
              customImageUrl={coOpPlayerSkin === "custom" ? coOpCustomAvatar?.imageDataUrl : null}
              customOutlineColor={coOpPlayerSkin === "custom" ? coOpCustomAvatar?.outlineColor ?? null : null}
              skin={coOpPlayerSkin}
              visualScale={1.22}
            />
          </div>
          {remoteState || remoteStateSubscription ? (
            <div className="doodle-remote-player-shell" ref={remotePlayerShellRef}>
              <PlayerAvatar
                {...(remoteState ? resolveDoodleRemoteAvatarView(remoteState) : { action: "idle", expression: "neutral" })}
                direction={remoteState?.direction ?? "none"}
                gravity="normal"
                rootRef={remotePlayerAvatarRef}
                customImageUrl={remotePlayerSkin === "custom" ? remotePlayer?.customAvatar?.imageDataUrl : null}
                customOutlineColor={remotePlayerSkin === "custom" ? remotePlayer?.customAvatar?.outlineColor ?? null : null}
                skin={remotePlayerSkin}
                visualScale={1.22}
              />
            </div>
          ) : null}
        </div>
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}
