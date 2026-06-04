"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { PlayerAvatar, type PlayerAvatarDirection, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";
import { DifficultyWaveBackdrop } from "@/features/visuals/difficulty-wave-backdrop";
import { RemoteInterpolator } from "@/features/multiplayer/remote-interpolator";
import { RemoteVisualSmoother, applyRemoteAvatarVisual } from "@/features/multiplayer/remote-visual-smoother";
import {
  BASE_FAILURE_LIMIT,
  DEBUG_MINI_GAME_FPS,
  MINI_GAME_UI_SYNC_MS,
  MiniGameFpsBadge,
  PLAYER_SIZE,
  PrototypeEndOverlay,
  booleanParam,
  clamp,
  numberParam,
  transformPoint3d,
  useMiniGameFpsCounter,
  useMiniGameLowPowerMode,
  useMiniGameScreenShake,
  useMiniGameStageSize,
  type MiniGameCompletion,
  type EndlessMiniGameRuntime,
  type MiniGameRunMode,
  type MiniGameStageSize,
  type PrototypeStatus,
} from "@/features/mini-games/common";
import {
  generateFlappyGateLayout,
  getFlappyGateScreenX,
  getFlappyPlayerScreenX,
  getFlappySignedProgress,
  resolveFlappySafeRespawnProgress,
  selectVisibleFlappyGates,
  type GeneratedFlappyGate,
  type MiniGameLevelConfig,
  type MiniGameParams,
} from "@/lib/mini-games";
import { getEndlessMiniGameStageConfig } from "@/lib/endless-mode";
import type { SelfGameState } from "@/features/game-sync/types";
import {
  MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
  MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
  MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
  MULTIPLAYER_FAST_STATE_SYNC_MS,
} from "@/lib/multiplayer/protocol";

const FLAPPY_GATE_WIDTH = 54;
const FLAPPY_START_PLATFORM_HEIGHT = 12;
const FLAPPY_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_FAST_STATE_SYNC_MS;
const FLAPPY_RESPAWN_INVINCIBLE_SECONDS = 1.55;
const FLAPPY_RESPAWN_CAMERA_SECONDS = 0.45;
const FLAPPY_RESPAWN_FORWARD_TRAVEL_BUFFER_SECONDS = 0.28;
const FLAPPY_GRAVITY_FLIP_TRANSITION_SECONDS = 0.72;
const FLAPPY_GRAVITY_FLIP_INVINCIBLE_SECONDS = 1.2;
const DEBUG_MINI_GAME_HITBOX = false;
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
  displayProgress: number;
  respawnProgressStart: number;
  respawnProgressUntil: number;
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
  displayProgress: number;
  reason: string;
  started: boolean;
  status: PrototypeStatus;
  time: number;
  visibleGates: FlappyGate[];
};

type FlappyGravityFlipTransition = {
  startedAt: number;
  targetFlipped: boolean;
  until: number;
};

export type FlappyRuntimeState = {
  cameraX: number;
  cameraY: number;
  collected: number;
  collectibleCount: number;
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

type FlappyRemotePlayer = {
  customAvatar?: {
    imageDataUrl: string;
    outlineColor?: string;
  };
  skinId?: string;
};

type FlappyRemoteState = SelfGameState;

function resolveFlappyPlayerAvatarView(view: FlappyViewFrame): PlayerAvatarView {
  if (view.status === "failed") return { action: "hit", expression: "hurt" };
  if (view.status === "passed") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (view.time < view.invincibleUntil) return { action: "idle", expression: "neutral", effect: "shield" };
  return { action: "idle", expression: "neutral" };
}

function resolveFlappyRemoteSkin(remotePlayer: FlappyRemotePlayer | null | undefined): PlayerAvatarSkin {
  return resolvePlayerAvatarSkin(remotePlayer?.skinId);
}

function resolveFlappyRemoteAvatarView(remoteState: FlappyRemoteState): PlayerAvatarView {
  if (remoteState.status === "failed") return { action: "hit", expression: "hurt" };
  if (remoteState.status === "finished") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  return { action: "idle", expression: "neutral" };
}

function smoothSpectatorCamera(current: number, target: number, delta: number) {
  const blend = 1 - Math.exp(-Math.max(0, delta) * 7);
  return current + (target - current) * blend;
}

function resolveFlappyDirection(reverseDirection: boolean): PlayerAvatarDirection {
  void reverseDirection;
  return "none";
}

function syncFlappyWaveParallax(stage: HTMLDivElement | null, displayProgress: number, playerY: number, stageHeight: number, reverseDirection: boolean) {
  if (!stage) return;
  const drift = reverseDirection ? displayProgress : -displayProgress;
  const verticalOffset = playerY - stageHeight * 0.5;
  stage.style.setProperty("--difficulty-wave-parallax-x", (drift * 0.95 + verticalOffset * 0.12).toFixed(2));
  stage.style.setProperty("--difficulty-wave-parallax-y", (drift * 0.18 + verticalOffset * 0.12).toFixed(2));
}

function flappyStartPlatformY(stageHeight: number) {
  return stageHeight * 0.52;
}

function makeFlappyLayout(level: MiniGameLevelConfig, runSeed: string, stageSize: MiniGameStageSize) {
  return generateFlappyGateLayout(level, runSeed, { stageHeight: stageSize.height, stageWidth: stageSize.width });
}

function flappyGateCenterY(gate: FlappyGate, time: number, params: MiniGameParams, stageHeight: number) {
  if (!gate.moving) return gate.baseCenterY;
  const movingSpeed = numberParam(params, "movingGateSpeed", 1);
  return clamp(gate.baseCenterY + Math.sin(time * movingSpeed + gate.phase) * 42, 116, stageHeight - 116);
}

function createFlappyRuntime(gates: FlappyGate[], initialPlayerY: number): FlappyFrame {
  return {
    started: false,
    time: 0,
    progress: 0,
    displayProgress: 0,
    respawnProgressStart: 0,
    respawnProgressUntil: 0,
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

function makeFlappyRuntimeState(
  frame: FlappyFrame,
  gateCount: number,
  collectibleCount: number,
  playerX: number,
  direction: PlayerAvatarDirection,
  reverseDirection: boolean,
  speed: number,
): FlappyRuntimeState {
  const signedDisplayProgress = getFlappySignedProgress(frame.displayProgress, reverseDirection);
  const isActivelyScrolling = frame.started && frame.status === "playing";
  return {
    cameraX: signedDisplayProgress,
    cameraY: 0,
    collected: frame.collected,
    collectibleCount,
    direction,
    elapsedMs: Math.round(frame.time * 1000),
    failures: frame.failures,
    progress: Number((frame.passed / Math.max(1, gateCount)).toFixed(4)),
    status: frame.status,
    vx: isActivelyScrolling ? (reverseDirection ? -speed : speed) : 0,
    vy: frame.playerVy,
    x: playerX + signedDisplayProgress,
    y: frame.playerY,
  };
}

function smoothFlappyRespawnProgress(progress: number) {
  return progress * progress * (3 - 2 * progress);
}

function resolveFlappyDisplayProgress(frame: FlappyFrame) {
  if (frame.respawnProgressUntil <= frame.time) {
    return frame.progress;
  }
  const duration = Math.max(0.001, frame.respawnProgressUntil - frame.respawnProgressStart);
  const progress = clamp((frame.time - frame.respawnProgressStart) / duration, 0, 1);
  return frame.displayProgress + (frame.progress - frame.displayProgress) * smoothFlappyRespawnProgress(progress);
}

function getFlappyRespawnForwardTravelDistance(speed: number) {
  return Math.max(0, speed) * FLAPPY_RESPAWN_FORWARD_TRAVEL_BUFFER_SECONDS;
}

function recoverEndlessFlappyFailure({
  current,
  nextProgress,
  playerX,
  reason,
  respawnY,
  reverseDirection,
  speed,
  stageHeight,
  stageWidth,
  time,
}: {
  current: FlappyFrame;
  nextProgress: number;
  playerX: number;
  reason: string;
  respawnY: number;
  reverseDirection: boolean;
  speed: number;
  stageHeight: number;
  stageWidth: number;
  time: number;
}) {
  const respawnProgressEnd = resolveFlappySafeRespawnProgress({
    gates: current.gates,
    gateWidth: FLAPPY_GATE_WIDTH,
    invincibleForwardTravelDistance: getFlappyRespawnForwardTravelDistance(speed),
    nextProgress,
    playerSize: PLAYER_SIZE,
    playerX,
    reverseDirection,
    stageWidth,
  });
  current.failures += 1;
  current.status = "playing";
  current.reason = reason;
  current.progress = respawnProgressEnd;
  current.displayProgress = nextProgress;
  current.respawnProgressStart = time;
  current.respawnProgressUntil = time + FLAPPY_RESPAWN_CAMERA_SECONDS;
  current.displayProgress = resolveFlappyDisplayProgress(current);
  current.started = false;
  current.playerY = respawnY;
  current.playerVy = 0;
  current.invincibleUntil = time + FLAPPY_RESPAWN_INVINCIBLE_SECONDS;
}

function makeFlappyView(frame: FlappyFrame, reverseDirection: boolean, buffer: number, stageWidth: number): FlappyViewFrame {
  return {
    collected: frame.collected,
    failures: frame.failures,
    invincibleUntil: frame.invincibleUntil,
    passed: frame.passed,
    playerTurns: frame.playerTurns,
    playerY: frame.playerY,
    progress: frame.progress,
    displayProgress: frame.displayProgress,
    reason: frame.reason,
    started: frame.started,
    status: frame.status,
    time: frame.time,
    visibleGates: resolveFlappySpectatorGates(frame, reverseDirection, buffer, stageWidth),
  };
}

function resolveFlappySpectatorGates(frame: FlappyFrame, reverseDirection: boolean, buffer: number, stageWidth: number) {
  return {
    visibleGates: selectVisibleFlappyGates(frame.gates, {
      buffer,
      gateWidth: FLAPPY_GATE_WIDTH,
      progress: frame.displayProgress,
      reverseDirection,
      stageWidth,
    }),
  }.visibleGates;
}

function formatFlappyCollectibleMissReason(collected: number, collectibleCount: number) {
  return `漏收集道具 ${collected}/${collectibleCount}`;
}

function getEndlessFlappyAnomaly(gateIndex: number, debugDifficulty: number) {
  const effectiveGateIndex = Math.max(gateIndex, Math.floor(debugDifficulty * 90));
  if (effectiveGateIndex < 18) return { active: false, targetFlipped: false, warning: false };
  const phase = effectiveGateIndex % 18;
  return {
    active: phase >= 12 && phase <= 15,
    targetFlipped: phase >= 10 && phase <= 15,
    warning: phase >= 10 && phase <= 11,
  };
}

function makeEndlessFlappySegmentLevel(
  level: MiniGameLevelConfig,
  progress: number,
  debugDifficulty: number,
): MiniGameLevelConfig {
  const config = getEndlessMiniGameStageConfig({ debugDifficulty, miniGameId: "flappy", progress });
  return {
    ...level,
    levelId: `${level.levelId}-endless-${config.sourceAdvancedLevel}-${Math.floor(progress)}`,
    params: {
      ...level.params,
      ...config.params,
    },
  };
}

function getEndlessFlappyRuntimeParams(
  level: MiniGameLevelConfig,
  progress: number,
  debugDifficulty: number,
): MiniGameParams {
  return {
    ...level.params,
    ...getEndlessMiniGameStageConfig({ debugDifficulty, miniGameId: "flappy", progress }).params,
  };
}

function extendEndlessFlappyGates(
  current: FlappyFrame,
  level: MiniGameLevelConfig,
  runSeed: string,
  stageSize: MiniGameStageSize,
  progress: number,
  debugDifficulty: number,
) {
  const remainingGates = current.gates.filter((gate) => !gate.passed).length;
  if (remainingGates > 12) return false;
  const lastDistance = current.gates.reduce((last, gate) => Math.max(last, gate.distance), 0);
  const segmentLevel = makeEndlessFlappySegmentLevel(level, progress, debugDifficulty);
  const segment = generateFlappyGateLayout(segmentLevel, `${runSeed}:endless:${current.gates.length}`, {
    backgroundRefCount: 0,
    stageHeight: stageSize.height,
    stageWidth: stageSize.width,
  });
  const firstGate = segment.gates[0];
  if (!firstGate) return false;
  const spacing = Math.max(178, stageSize.width * 0.5);
  const offsetDistance = lastDistance + spacing - firstGate.distance;
  let nextGateId = current.gates.reduce((next, gate) => Math.max(next, gate.id + 1), 0);
  for (const gate of segment.gates) {
    current.gates.push({
      ...gate,
      collected: false,
      distance: gate.distance + offsetDistance,
      id: nextGateId,
      passed: false,
    });
    nextGateId += 1;
  }
  return true;
}

export function FlappyPrototype({
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
  unlimitedRespawn = false,
}: {
  baseRevives?: number;
  endless?: EndlessMiniGameRuntime;
  level: MiniGameLevelConfig;
  logicStageSizeOverride?: MiniGameStageSize;
  mode: MiniGameRunMode | "endless";
  onBackToSelect: () => void;
  onBaseReviveUsed?: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRuntimeState?: (state: FlappyRuntimeState) => void;
  onRestart: () => void;
  remotePlayer?: FlappyRemotePlayer | null;
  remoteStateSubscription?: ((listener: (state: FlappyRemoteState) => void) => (() => void)) | null;
  remoteState?: FlappyRemoteState | null;
  spectateRemoteState?: SelfGameState | null;
  runSeed: string;
  unlimitedRespawn?: boolean;
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
  const worldLayerTransform = `${transformPoint3d(worldLayerOffsetX, worldLayerOffsetY)} scale(${worldLayerScale})`;
  const worldLayerStyle: CSSProperties & Record<"--flappy-world-transform", string> = {
    "--flappy-world-transform": worldLayerTransform,
    height: `${stageHeight}px`,
    left: 0,
    position: "absolute" as const,
    top: 0,
    transform: "var(--flappy-world-transform) rotate(var(--flappy-world-rotation, 0deg))",
    transformOrigin: "50% 50%",
    width: `${stageWidth}px`,
  };
  const startPlatformY = flappyStartPlatformY(stageHeight);
  const layout = useMemo(() => makeFlappyLayout(level, runSeed, logicStageSize), [level, logicStageSize, runSeed]);
  const gates = layout.gates;
  const reversedGravity = booleanParam(level.params, "reversedGravity");
  const reverseDirection = booleanParam(level.params, "reverseDirection");
  const gateCount = numberParam(level.params, "gateCount", 6);
  const collectibleCount = numberParam(level.params, "collectibleCount", 0);
  const gapSize = numberParam(level.params, "gapSize", 180);
  const speed = numberParam(level.params, "speed", 118);
  const playerX = reverseDirection ? stageWidth - 92 : 92;
  const isLowPowerDevice = useMiniGameLowPowerMode();
  const visibleBuffer = isLowPowerDevice ? 88 : 130;
  const backgroundRefs: FlappyBackgroundRef[] = useMemo(
    () => (isLowPowerDevice ? layout.backgroundRefs.slice(0, 12) : layout.backgroundRefs),
    [isLowPowerDevice, layout.backgroundRefs],
  );
  const initialPlayerY = layout.initialPlacement === "belowPlatform"
    ? startPlatformY + FLAPPY_START_PLATFORM_HEIGHT + PLAYER_SIZE / 2
    : startPlatformY - PLAYER_SIZE / 2;
  const initialRuntime = useMemo(() => createFlappyRuntime(gates, initialPlayerY), [gates, initialPlayerY]);
  const runtimeRef = useRef<FlappyFrame>(initialRuntime);
  const completedRef = useRef(false);
  const lastUiSyncRef = useRef(0);
  const lastRuntimeSyncRef = useRef(0);
  const spectatorSceneTimeRef = useRef(0);
  const backgroundNodeRefs = useRef(new Map<number, HTMLSpanElement>());
  const gateTopRefs = useRef(new Map<number, HTMLDivElement>());
  const gateBottomRefs = useRef(new Map<number, HTMLDivElement>());
  const collectibleRefs = useRef(new Map<number, HTMLDivElement>());
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const remotePlayerShellRef = useRef<HTMLDivElement | null>(null);
  const remotePlayerAvatarRef = useRef<HTMLSpanElement | null>(null);
  const remoteSmootherRef = useRef(
    new RemoteInterpolator<FlappyRemoteState>({
      interpolationDelayMs: MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS,
      maxPredictionMs: MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS,
      staleMs: MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS,
    }),
  );
  const remoteVisualSmootherRef = useRef(new RemoteVisualSmoother());
  const onRuntimeStateRef = useRef<typeof onRuntimeState>(onRuntimeState);
  const spectateRemoteStateRef = useRef<SelfGameState | null>(spectateRemoteState);
  const endlessRef = useRef(endless);
  const gravityFlippedRef = useRef(false);
  const gravityFlipTransitionRef = useRef<FlappyGravityFlipTransition | null>(null);
  const isEndlessRun = Boolean(endless);
  const { fps, recordFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const { screenShakeClassName, triggerScreenShake } = useMiniGameScreenShake();
  const [view, setView] = useState<FlappyViewFrame>(() => makeFlappyView(initialRuntime, reverseDirection, visibleBuffer, stageWidth));
  const [managedGravityFlipped, setManagedGravityFlipped] = useState(false);
  const [managedGravityFlipTransition, setManagedGravityFlipTransition] = useState<FlappyGravityFlipTransition | null>(null);
  const remotePlayerSkin = resolveFlappyRemoteSkin(remotePlayer);

  const syncFlappyView = useCallback(
    (time = performance.now()) => {
      lastUiSyncRef.current = time;
      setView(makeFlappyView(runtimeRef.current, reverseDirection, visibleBuffer, stageWidth));
    },
    [reverseDirection, stageWidth, visibleBuffer],
  );

  useEffect(() => {
    onRuntimeStateRef.current = onRuntimeState;
  }, [onRuntimeState]);

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  useEffect(() => {
    spectateRemoteStateRef.current = spectateRemoteState;
    if (spectateRemoteState?.status === "playing") {
      remoteSmootherRef.current.push(spectateRemoteState, spectateRemoteState.receivedAt ?? performance.now());
    }
  }, [spectateRemoteState]);

  const syncFlappyRuntimeState = useCallback((time = performance.now(), force = false) => {
    if (!onRuntimeStateRef.current) return;
    if (!force && time - lastRuntimeSyncRef.current < FLAPPY_MULTIPLAYER_RUNTIME_SYNC_MS) return;
    lastRuntimeSyncRef.current = time;
    onRuntimeStateRef.current(
      makeFlappyRuntimeState(
        runtimeRef.current,
        gateCount,
        collectibleCount,
        playerX,
        resolveFlappyDirection(reverseDirection),
        reverseDirection,
        speed,
      ),
    );
  }, [collectibleCount, gateCount, playerX, reverseDirection, speed]);

  const beginManagedGravityFlipTransition = useCallback((current: FlappyFrame, nextTime: number, targetFlipped: boolean) => {
    const existingTransition = gravityFlipTransitionRef.current;
    if (existingTransition?.targetFlipped === targetFlipped) return false;

    const transition: FlappyGravityFlipTransition = {
      startedAt: nextTime,
      targetFlipped,
      until: nextTime + FLAPPY_GRAVITY_FLIP_TRANSITION_SECONDS,
    };
    gravityFlipTransitionRef.current = transition;
    setManagedGravityFlipTransition(transition);
    setManagedGravityFlipped(transition.targetFlipped);
    current.started = false;
    current.playerY = initialPlayerY;
    current.playerVy = 0;
    current.invincibleUntil = Math.max(current.invincibleUntil, nextTime + FLAPPY_GRAVITY_FLIP_INVINCIBLE_SECONDS);
    current.respawnProgressStart = nextTime;
    current.respawnProgressUntil = nextTime + FLAPPY_RESPAWN_CAMERA_SECONDS;
    current.displayProgress = resolveFlappyDisplayProgress(current);
    return true;
  }, [initialPlayerY]);

  useEffect(() => {
    runtimeRef.current = initialRuntime;
    spectatorSceneTimeRef.current = initialRuntime.time;
    lastUiSyncRef.current = 0;
    lastRuntimeSyncRef.current = 0;
    completedRef.current = false;
    gravityFlippedRef.current = false;
    gravityFlipTransitionRef.current = null;
    setManagedGravityFlipped(false);
    setManagedGravityFlipTransition(null);
    remoteSmootherRef.current.reset();
    remoteVisualSmootherRef.current.reset();
    if (remotePlayerShellRef.current) {
      remotePlayerShellRef.current.style.display = "none";
    }
    const timer = window.setTimeout(() => {
      setView(makeFlappyView(initialRuntime, reverseDirection, visibleBuffer, stageWidth));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRuntime, reverseDirection, stageWidth, visibleBuffer]);

  useEffect(() => {
    const timer = window.setTimeout(() => syncFlappyView(), 0);
    return () => window.clearTimeout(timer);
  }, [syncFlappyView]);

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

  const pulse = useCallback(() => {
    const current = runtimeRef.current;
    if (current.status !== "playing") return;
    const wasRespawnWaiting = !current.started && current.invincibleUntil > 0;
    current.started = true;
    if (wasRespawnWaiting) current.invincibleUntil = Math.max(current.invincibleUntil, current.time + FLAPPY_RESPAWN_INVINCIBLE_SECONDS);
    current.playerTurns += 1;
    current.playerVy = reversedGravity || gravityFlippedRef.current ? 335 : -335;
    syncFlappyView();
    syncFlappyRuntimeState(performance.now(), true);
  }, [reversedGravity, syncFlappyRuntimeState, syncFlappyView]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const updateDom = (current: FlappyFrame, frameTime: number, spectatingRemote = false, sceneTime = current.time) => {
      const renderProgress = current.displayProgress;
      syncFlappyWaveParallax(stageRef.current, renderProgress, current.playerY, stageHeight, reverseDirection);
      const activeFlappyParams = isEndlessRun
        ? getEndlessFlappyRuntimeParams(level, Math.max(endlessRef.current?.score ?? 0, Math.floor(Math.max(0, current.progress) / 160)), endlessRef.current?.debugDifficulty ?? 0)
        : level.params;
      const activeGapSize = numberParam(activeFlappyParams, "gapSize", gapSize);
      const gateById = new Map(current.gates.map((gate) => [gate.id, gate]));
      for (const ref of backgroundRefs) {
        const node = backgroundNodeRefs.current.get(ref.id);
        if (!node) continue;
        const spacing = 82;
        const drift = reverseDirection ? renderProgress : -renderProgress;
        const cycle = stageWidth + spacing;
        const x = (((ref.x + drift * 0.55) % cycle) + cycle) % cycle - spacing;
        node.style.transform = transformPoint3d(x, ref.y);
      }

      for (const [id, topNode] of gateTopRefs.current) {
        const gate = gateById.get(id);
        const bottomNode = gateBottomRefs.current.get(id);
        if (!gate || !bottomNode) continue;
        const screenX = getFlappyGateScreenX(gate, {
          progress: renderProgress,
          reverseDirection,
          stageWidth,
        });
        const centerY = flappyGateCenterY(gate, sceneTime, activeFlappyParams, stageHeight);
        const topHeight = centerY - activeGapSize / 2;
        const bottomY = centerY + activeGapSize / 2;
        topNode.style.transform = transformPoint3d(screenX, topHeight - stageHeight);
        bottomNode.style.transform = transformPoint3d(screenX, bottomY);

        const collectibleNode = collectibleRefs.current.get(id);
        if (collectibleNode) {
          if (gate.collected) {
            collectibleNode.style.display = "none";
          } else {
            const collectibleY = clamp(centerY + gate.collectibleOffset * activeGapSize, centerY - activeGapSize / 2 + 22, centerY + activeGapSize / 2 - 22);
            collectibleNode.style.display = "";
            collectibleNode.style.transform = transformPoint3d(screenX + FLAPPY_GATE_WIDTH / 2 - 9, collectibleY - 9);
          }
        }
      }

      const localCameraX = getFlappySignedProgress(current.displayProgress, reverseDirection);
      if (playerShellRef.current) {
        playerShellRef.current.style.display = "";
        const localPlayerWorldX = playerX + getFlappySignedProgress(current.progress, reverseDirection);
        const playerScreenX = spectatingRemote ? localPlayerWorldX - localCameraX : getFlappyPlayerScreenX({
          displayProgress: current.displayProgress,
          playerX,
          progress: current.progress,
          reverseDirection,
        });
        playerShellRef.current.style.transform = transformPoint3d(playerScreenX - PLAYER_SIZE / 2, current.playerY - PLAYER_SIZE / 2);
      }
      if (remotePlayerShellRef.current) {
        const sampledRemote = remoteSmootherRef.current.sample(frameTime) ?? (spectatingRemote ? spectateRemoteStateRef.current : null);
        const visualRemote = remoteVisualSmootherRef.current.update(sampledRemote, frameTime);
        if (visualRemote && typeof visualRemote.x === "number" && typeof visualRemote.y === "number") {
          const remoteScreenX = visualRemote.x - localCameraX;
          remotePlayerShellRef.current.style.display = "";
          remotePlayerShellRef.current.style.transform = `${transformPoint3d(
            remoteScreenX - PLAYER_SIZE / 2,
            visualRemote.y - PLAYER_SIZE / 2,
          )} rotate(${visualRemote.angle}deg)`;
          applyRemoteAvatarVisual(remotePlayerAvatarRef.current, visualRemote);
        } else {
          remotePlayerShellRef.current.style.display = "none";
        }
      }
    };

    const tick = (time: number) => {
      recordFrame(time);
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;

      const current = runtimeRef.current;
      if (current.status !== "playing") {
        const spectatorState = remoteSmootherRef.current.sample(time) ?? spectateRemoteStateRef.current;
        const spectatingRemote = spectatorState?.status === "playing";
        spectatorSceneTimeRef.current = Math.max(spectatorSceneTimeRef.current, current.time);
        if (spectatingRemote) spectatorSceneTimeRef.current += delta;
        if (spectatingRemote && typeof spectatorState?.cameraX === "number") {
          const targetDisplayProgress = reverseDirection ? -spectatorState.cameraX : spectatorState.cameraX;
          current.displayProgress = smoothSpectatorCamera(current.displayProgress, targetDisplayProgress, delta);
        }
        updateDom(current, time, spectatingRemote, spectatorSceneTimeRef.current);
        if (time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
          syncFlappyView(time);
        }
        const keepRemoteRenderingAfterSettled = mode === "advanced" && Boolean(onRuntimeStateRef.current);
        if (keepRemoteRenderingAfterSettled) {
          frameId = requestAnimationFrame(tick);
        }
        return;
      }
      const gravityFlipTransition = gravityFlipTransitionRef.current;
      if (gravityFlipTransition) {
        current.time += delta;
        current.playerY = initialPlayerY;
        current.playerVy = 0;
        current.displayProgress = resolveFlappyDisplayProgress(current);
        if (current.time >= gravityFlipTransition.until) {
          gravityFlippedRef.current = gravityFlipTransition.targetFlipped;
          gravityFlipTransitionRef.current = null;
          setManagedGravityFlipTransition(null);
          current.started = false;
          current.playerY = initialPlayerY;
          current.playerVy = 0;
        }
        updateDom(current, time);
        if (time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS || !gravityFlipTransitionRef.current) {
          syncFlappyView(time);
        }
        syncFlappyRuntimeState(time, true);
        frameId = requestAnimationFrame(tick);
        return;
      }
      if (!current.started) {
        const isRespawnCameraMoving = current.respawnProgressUntil > current.time;
        current.time += delta;
        current.displayProgress = resolveFlappyDisplayProgress(current);
        updateDom(current, time);
        if (isRespawnCameraMoving || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
          syncFlappyView(time);
        }
        syncFlappyRuntimeState(time);
        frameId = requestAnimationFrame(tick);
        return;
      }

      const nextTime = current.time + delta;
      const anomaly = isEndlessRun ? getEndlessFlappyAnomaly(current.passed, endlessRef.current?.debugDifficulty ?? 0) : null;
      const targetManagedGravityFlipped = Boolean(isEndlessRun && anomaly?.targetFlipped);
      if (
        isEndlessRun
        && targetManagedGravityFlipped !== gravityFlippedRef.current
        && beginManagedGravityFlipTransition(current, nextTime, targetManagedGravityFlipped)
      ) {
        current.time = nextTime;
        updateDom(current, time);
        syncFlappyView(time);
        syncFlappyRuntimeState(time, true);
        frameId = requestAnimationFrame(tick);
        return;
      }
      const endlessProgress = Math.max(endlessRef.current?.score ?? 0, Math.floor(Math.max(0, current.progress) / 160));
      if (isEndlessRun) {
        extendEndlessFlappyGates(
          current,
          level,
          runSeed,
          logicStageSize,
          endlessProgress,
          endlessRef.current?.debugDifficulty ?? 0,
        );
      }
      const activeFlappyParams = isEndlessRun
        ? getEndlessFlappyRuntimeParams(level, endlessProgress, endlessRef.current?.debugDifficulty ?? 0)
        : level.params;
      const activeGapSize = numberParam(activeFlappyParams, "gapSize", gapSize);
      const activeSpeed = numberParam(activeFlappyParams, "speed", speed);
      const activeReversedGravity = reversedGravity || gravityFlippedRef.current;
      const gravityDirection = activeReversedGravity ? -1 : 1;
      const gravityMagnitude = activeReversedGravity ? 850 : 900;
      const nextVy = current.playerVy + gravityDirection * gravityMagnitude * delta;
      const nextY = current.playerY + nextVy * delta;
      const nextProgress = current.progress + activeSpeed * delta;
      let status: PrototypeStatus = "playing";
      let reason = "";
      let passed = current.passed;
      let collected = current.collected;
      let eventChanged = false;
      let endlessRecoveryY: number | null = null;

      for (const gate of current.gates) {
        const screenX = getFlappyGateScreenX(gate, {
          progress: nextProgress,
          reverseDirection,
          stageWidth,
        });
        const centerY = flappyGateCenterY(gate, nextTime, activeFlappyParams, stageHeight);
        const gatePassed = reverseDirection ? screenX > playerX + PLAYER_SIZE : screenX + FLAPPY_GATE_WIDTH < playerX - PLAYER_SIZE;

        if (!gate.passed && gatePassed) {
          gate.passed = true;
          passed += 1;
          eventChanged = true;
        }

        if (gate.collectible && !gate.collected) {
          const collectibleY = clamp(centerY + gate.collectibleOffset * activeGapSize, centerY - activeGapSize / 2 + 22, centerY + activeGapSize / 2 - 22);
          const collectibleX = screenX + FLAPPY_GATE_WIDTH / 2;
          const dx = playerX - collectibleX;
          const dy = nextY - collectibleY;
          if (dx * dx + dy * dy <= 24 * 24) {
            gate.collected = true;
            collected += 1;
            endlessRef.current?.gainEnergy(1);
            eventChanged = true;
          }
        }

        const overlapsX = playerX + PLAYER_SIZE / 2 > screenX && playerX - PLAYER_SIZE / 2 < screenX + FLAPPY_GATE_WIDTH;
        if (overlapsX && nextTime >= current.invincibleUntil) {
          const blockedY = nextY - PLAYER_SIZE / 2 < centerY - activeGapSize / 2 || nextY + PLAYER_SIZE / 2 > centerY + activeGapSize / 2;
          if (blockedY) {
            status = "failed";
            reason = "撞到障碍";
            endlessRecoveryY = centerY;
          }
        }
      }

      if ((nextY < PLAYER_SIZE / 2 || nextY > stageHeight - PLAYER_SIZE / 2) && nextTime >= current.invincibleUntil) {
        status = "failed";
        reason = "飞出边界";
        endlessRecoveryY = clamp(nextY, PLAYER_SIZE / 2 + 42, stageHeight - PLAYER_SIZE / 2 - 42);
      }

      if (status === "playing" && passed >= gateCount) {
        if (!isEndlessRun) {
        const collectibleMissSettleOnly = mode === "advanced" && Boolean(onRuntimeStateRef.current);
        if (unlimitedRespawn || collectibleMissSettleOnly || collected >= collectibleCount) {
          status = "passed";
          reason = collectibleCount > 0 ? `通过终点，收集 ${collected}/${collectibleCount}` : `通过 ${passed}/${gateCount} 个门`;
        } else {
          status = "failed";
          reason = formatFlappyCollectibleMissReason(collected, collectibleCount);
        }
        for (const gate of current.gates) gate.passed = true;
        eventChanged = true;
        }
      }

      current.time = nextTime;
      current.progress = nextProgress;
      current.displayProgress = resolveFlappyDisplayProgress(current);
      current.playerY = nextY;
      current.playerVy = nextVy;
      current.passed = passed;
      current.collected = collected;
      if (isEndlessRun) endlessRef.current?.setDistanceScore(Math.floor(Math.max(0, current.progress) / 160), false);

      if (isEndlessRun && status === "failed") {
        triggerScreenShake();
        if (endlessRef.current?.loseLife(reason) ?? false) {
          recoverEndlessFlappyFailure({
            current,
            nextProgress,
            playerX,
            reason,
            respawnY: initialPlayerY,
            reverseDirection,
            speed: activeSpeed,
            stageHeight,
            stageWidth,
            time: nextTime,
          });
          updateDom(current, time);
          syncFlappyView(time);
          syncFlappyRuntimeState(time, true);
          frameId = requestAnimationFrame(tick);
          return;
        }
        current.status = "failed";
        current.reason = reason;
        updateDom(current, time);
        syncFlappyView(time);
        syncFlappyRuntimeState(time, true);
        return;
      }

      if (mode === "base" && status === "failed") {
        const failures = current.failures + 1;
        const baseFailureLimit = baseRevives ?? BASE_FAILURE_LIMIT;
        if (failures <= baseFailureLimit) {
          onBaseReviveUsed?.();
          triggerScreenShake();
          const respawnProgressEnd = resolveFlappySafeRespawnProgress({
            gates: current.gates,
            gateWidth: FLAPPY_GATE_WIDTH,
            invincibleForwardTravelDistance: getFlappyRespawnForwardTravelDistance(speed),
            nextProgress,
            playerSize: PLAYER_SIZE,
            playerX,
            reverseDirection,
            stageWidth,
          });
          current.progress = respawnProgressEnd;
          current.displayProgress = nextProgress;
          current.respawnProgressStart = nextTime;
          current.respawnProgressUntil = nextTime + FLAPPY_RESPAWN_CAMERA_SECONDS;
          current.displayProgress = resolveFlappyDisplayProgress(current);
          current.started = false;
          current.playerY = initialPlayerY;
          current.playerVy = 0;
          current.failures = failures;
          current.invincibleUntil = nextTime + FLAPPY_RESPAWN_INVINCIBLE_SECONDS;
          current.status = "playing";
          current.reason = reason;
          updateDom(current, time);
          syncFlappyView(time);
          syncFlappyRuntimeState(time, true);
          frameId = requestAnimationFrame(tick);
          return;
        }
        current.failures = failures;
        reason = baseRevives === undefined ? "失败超过 3 次，进入下一关" : "冒险的心用尽，进入下一关";
      }

      if (unlimitedRespawn && status === "failed") {
        const failures = current.failures + 1;
        triggerScreenShake();
        const respawnProgressEnd = resolveFlappySafeRespawnProgress({
          gates: current.gates,
          gateWidth: FLAPPY_GATE_WIDTH,
          invincibleForwardTravelDistance: getFlappyRespawnForwardTravelDistance(speed),
          nextProgress,
          playerSize: PLAYER_SIZE,
          playerX,
          reverseDirection,
          stageWidth,
        });
        current.progress = respawnProgressEnd;
        current.displayProgress = nextProgress;
        current.respawnProgressStart = nextTime;
        current.respawnProgressUntil = nextTime + FLAPPY_RESPAWN_CAMERA_SECONDS;
        current.displayProgress = resolveFlappyDisplayProgress(current);
        current.started = false;
        current.playerY = initialPlayerY;
        current.playerVy = 0;
        current.failures = failures;
        current.invincibleUntil = nextTime + FLAPPY_RESPAWN_INVINCIBLE_SECONDS;
        current.status = "playing";
        current.reason = reason;
        updateDom(current, time);
        syncFlappyView(time);
        syncFlappyRuntimeState(time, true);
        frameId = requestAnimationFrame(tick);
        return;
      }

      if (status === "failed") triggerScreenShake();
      current.status = status;
      current.reason = reason;
      updateDom(current, time);
      if (status !== "playing" || eventChanged) {
        syncFlappyRuntimeState(time, true);
      } else {
        syncFlappyRuntimeState(time);
      }

      if (status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncFlappyView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [backgroundRefs, baseRevives, beginManagedGravityFlipTransition, collectibleCount, gapSize, gateCount, initialPlayerY, isEndlessRun, level, logicStageSize, mode, onBaseReviveUsed, playerX, recordFrame, reverseDirection, reversedGravity, runSeed, speed, stageHeight, stageRef, stageWidth, syncFlappyRuntimeState, syncFlappyView, triggerScreenShake, unlimitedRespawn]);

  const progressPercent = clamp((view.passed / gateCount) * 100, 0, 100);
  const viewFlappyParams = isEndlessRun
    ? getEndlessFlappyRuntimeParams(level, Math.max(endless?.score ?? 0, view.passed), endless?.debugDifficulty ?? 0)
    : level.params;
  const viewGapSize = numberParam(viewFlappyParams, "gapSize", gapSize);
  const activeViewReversedGravity = reversedGravity || managedGravityFlipped;
  const gravityInputLocked = Boolean(isEndlessRun && managedGravityFlipTransition);
  const playerScreenX = getFlappyPlayerScreenX({
    displayProgress: view.displayProgress,
    playerX,
    progress: view.progress,
    reverseDirection,
  });
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
        {!isEndlessRun ? <span>进度 {view.passed}/{gateCount}</span> : null}
        {collectibleCount > 0 ? <span>收集 {view.collected}/{collectibleCount}</span> : null}
      </div>
      <div
        className={`prototype-stage flappy-stage ${screenShakeClassName} ${reverseDirection ? "reverse" : ""} ${managedGravityFlipTransition ? "endless-anomaly-warning gravity-flip-managed" : ""} ${activeViewReversedGravity ? "endless-gravity-anomaly" : ""} ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        ref={stageRef}
        role="application"
        aria-label="Flappy Bird 型小游戏"
        onPointerDown={(event) => {
          event.preventDefault();
          if (gravityInputLocked) return;
          pulse();
        }}
      >
        <DifficultyWaveBackdrop />
        <MiniGameFpsBadge fps={fps} />
        {gravityInputLocked ? <div className="flappy-gravity-flip-banner" aria-hidden="true">重力翻转</div> : null}
        <div
          className={`flappy-world ${activeViewReversedGravity ? "gravity-flipped" : ""} ${managedGravityFlipTransition ? "gravity-flip-preparing" : ""}`}
          style={worldLayerStyle}
        >
          <div className="flappy-background" aria-hidden="true">
            {backgroundRefs.map((ref) => {
              const spacing = 82;
              const drift = reverseDirection ? view.displayProgress : -view.displayProgress;
              const cycle = stageWidth + spacing;
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
            style={{ transform: transformPoint3d(playerX - 50, startPlatformY) }}
          />
          {view.visibleGates.map((gate) => {
            const screenX = getFlappyGateScreenX(gate, {
              progress: view.displayProgress,
              reverseDirection,
              stageWidth,
            });
            const centerY = flappyGateCenterY(gate, view.time, viewFlappyParams, stageHeight);
            const topHeight = centerY - viewGapSize / 2;
            const bottomY = centerY + viewGapSize / 2;
            const collectibleY = clamp(centerY + gate.collectibleOffset * viewGapSize, centerY - viewGapSize / 2 + 22, centerY + viewGapSize / 2 - 22);
            const topGateTransform = transformPoint3d(screenX, topHeight - stageHeight);
            const bottomGateTransform = transformPoint3d(screenX, bottomY);
            const collectibleTransform = transformPoint3d(screenX + FLAPPY_GATE_WIDTH / 2 - 9, collectibleY - 9);
            const topGateStyle = gate.moving
              ? { height: `${stageHeight}px`, width: `${FLAPPY_GATE_WIDTH}px` }
              : { height: `${stageHeight}px`, transform: topGateTransform, width: `${FLAPPY_GATE_WIDTH}px` };
            const bottomGateStyle = gate.moving
              ? { height: `${stageHeight}px`, width: `${FLAPPY_GATE_WIDTH}px` }
              : { height: `${stageHeight}px`, transform: bottomGateTransform, width: `${FLAPPY_GATE_WIDTH}px` };
            const collectibleStyle = gate.moving ? undefined : { transform: collectibleTransform };
            return (
              <div className={`flappy-gate-layer ${gate.moving ? "moving" : ""}`} key={gate.id}>
                <div
                  className="flappy-gate top"
                  ref={(node) => {
                    if (node) gateTopRefs.current.set(gate.id, node);
                    else gateTopRefs.current.delete(gate.id);
                  }}
                  style={topGateStyle}
                />
                <div
                  className="flappy-gate bottom"
                  ref={(node) => {
                    if (node) gateBottomRefs.current.set(gate.id, node);
                    else gateBottomRefs.current.delete(gate.id);
                  }}
                  style={bottomGateStyle}
                />
                {gate.collectible && !gate.collected ? (
                  <div
                    className="flappy-collectible"
                    ref={(node) => {
                      if (node) collectibleRefs.current.set(gate.id, node);
                      else collectibleRefs.current.delete(gate.id);
                    }}
                    style={collectibleStyle}
                  />
                ) : null}
              </div>
            );
          })}
          <div
            className={`flappy-player-shell ${view.time < view.invincibleUntil ? "invincible" : ""}`}
            ref={playerShellRef}
            style={{ transform: transformPoint3d(playerScreenX - PLAYER_SIZE / 2, view.playerY - PLAYER_SIZE / 2) }}
          >
            <PlayerAvatar
              {...resolveFlappyPlayerAvatarView(view)}
              direction={resolveFlappyDirection(reverseDirection)}
              gravity={activeViewReversedGravity ? "light" : "normal"}
              rotationTurns={view.playerTurns}
              visualScale={1.18}
            />
          </div>
          {remoteState || remoteStateSubscription ? (
            <div className="flappy-remote-player-shell" ref={remotePlayerShellRef}>
              <PlayerAvatar
                {...(remoteState ? resolveFlappyRemoteAvatarView(remoteState) : { action: "idle", expression: "neutral" })}
                direction={remoteState?.direction ?? "none"}
                gravity={activeViewReversedGravity ? "light" : "normal"}
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
