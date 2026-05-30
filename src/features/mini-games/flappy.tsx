"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PlayerAvatar, type PlayerAvatarDirection, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";
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

export type FlappyRuntimeState = {
  cameraX: number;
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

function resolveFlappyDirection(reverseDirection: boolean): PlayerAvatarDirection {
  void reverseDirection;
  return "none";
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
    visibleGates: selectVisibleFlappyGates(frame.gates, {
      buffer,
      gateWidth: FLAPPY_GATE_WIDTH,
      progress: frame.displayProgress,
      reverseDirection,
      stageWidth,
    }),
  };
}

export function FlappyPrototype({
  baseRevives,
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
  runSeed,
  unlimitedRespawn = false,
}: {
  baseRevives?: number;
  level: MiniGameLevelConfig;
  logicStageSizeOverride?: MiniGameStageSize;
  mode: MiniGameRunMode;
  onBackToSelect: () => void;
  onBaseReviveUsed?: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRuntimeState?: (state: FlappyRuntimeState) => void;
  onRestart: () => void;
  remotePlayer?: FlappyRemotePlayer | null;
  remoteStateSubscription?: ((listener: (state: FlappyRemoteState) => void) => (() => void)) | null;
  remoteState?: FlappyRemoteState | null;
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
  const worldLayerStyle = {
    height: `${stageHeight}px`,
    left: 0,
    position: "absolute" as const,
    top: 0,
    transform: `${transformPoint3d(worldLayerOffsetX, worldLayerOffsetY)} scale(${worldLayerScale})`,
    transformOrigin: "top left",
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
  const { fps, recordFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const { screenShakeClassName, triggerScreenShake } = useMiniGameScreenShake();
  const [view, setView] = useState<FlappyViewFrame>(() => makeFlappyView(initialRuntime, reverseDirection, visibleBuffer, stageWidth));
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

  const syncFlappyRuntimeState = useCallback((time = performance.now(), force = false) => {
    if (!onRuntimeStateRef.current) return;
    if (!force && time - lastRuntimeSyncRef.current < FLAPPY_MULTIPLAYER_RUNTIME_SYNC_MS) return;
    lastRuntimeSyncRef.current = time;
    onRuntimeStateRef.current(
      makeFlappyRuntimeState(
        runtimeRef.current,
        gateCount,
        playerX,
        resolveFlappyDirection(reverseDirection),
        reverseDirection,
        speed,
      ),
    );
  }, [gateCount, playerX, reverseDirection, speed]);

  useEffect(() => {
    runtimeRef.current = initialRuntime;
    lastUiSyncRef.current = 0;
    lastRuntimeSyncRef.current = 0;
    completedRef.current = false;
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
    current.started = true;
    current.playerTurns += 1;
    current.playerVy = reversedGravity ? 335 : -335;
    syncFlappyView();
    syncFlappyRuntimeState(performance.now(), true);
  }, [reversedGravity, syncFlappyRuntimeState, syncFlappyView]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const updateDom = (current: FlappyFrame, frameTime: number) => {
      const renderProgress = current.displayProgress;
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
        const centerY = flappyGateCenterY(gate, current.time, level.params, stageHeight);
        const topHeight = centerY - gapSize / 2;
        const bottomY = centerY + gapSize / 2;
        topNode.style.transform = transformPoint3d(screenX, topHeight - stageHeight);
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
        const playerScreenX = getFlappyPlayerScreenX({
          displayProgress: current.displayProgress,
          playerX,
          progress: current.progress,
          reverseDirection,
        });
        playerShellRef.current.style.transform = transformPoint3d(playerScreenX - PLAYER_SIZE / 2, current.playerY - PLAYER_SIZE / 2);
      }
      if (remotePlayerShellRef.current) {
        const sampledRemote = remoteSmootherRef.current.sample(frameTime);
        const visualRemote = remoteVisualSmootherRef.current.update(sampledRemote, frameTime);
        if (visualRemote && typeof visualRemote.x === "number" && typeof visualRemote.y === "number") {
          const localCameraX = getFlappySignedProgress(current.displayProgress, reverseDirection);
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
        updateDom(current, time);
        const keepRemoteRenderingAfterSettled = mode === "advanced" && Boolean(onRuntimeStateRef.current);
        if (keepRemoteRenderingAfterSettled) {
          frameId = requestAnimationFrame(tick);
        }
        return;
      }
      if (!current.started) {
        const isRespawnCameraMoving = current.respawnProgressUntil > current.time;
        if (isRespawnCameraMoving) {
          current.time += delta;
          current.displayProgress = resolveFlappyDisplayProgress(current);
        }
        updateDom(current, time);
        if (isRespawnCameraMoving || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
          syncFlappyView(time);
        }
        syncFlappyRuntimeState(time);
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
          stageWidth,
        });
        const centerY = flappyGateCenterY(gate, nextTime, level.params, stageHeight);
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

      if ((nextY < PLAYER_SIZE / 2 || nextY > stageHeight - PLAYER_SIZE / 2) && nextTime >= current.invincibleUntil) {
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
      current.displayProgress = resolveFlappyDisplayProgress(current);
      current.playerY = nextY;
      current.playerVy = nextVy;
      current.passed = passed;
      current.collected = collected;

      if (mode === "base" && status === "failed") {
        const failures = current.failures + 1;
        const baseFailureLimit = baseRevives ?? BASE_FAILURE_LIMIT;
        if (failures <= baseFailureLimit) {
          onBaseReviveUsed?.();
          triggerScreenShake();
          const respawnProgressEnd = resolveFlappySafeRespawnProgress({
            gates: current.gates,
            gateWidth: FLAPPY_GATE_WIDTH,
            nextProgress,
            playerSize: PLAYER_SIZE,
            playerX,
            reverseDirection,
            stageWidth,
          });
          current.progress = respawnProgressEnd;
          current.displayProgress = nextProgress;
          current.respawnProgressStart = nextTime;
          current.respawnProgressUntil = nextTime + 0.38;
          current.displayProgress = resolveFlappyDisplayProgress(current);
          current.started = false;
          current.playerY = initialPlayerY;
          current.playerVy = 0;
          current.failures = failures;
          current.invincibleUntil = nextTime + 1.15;
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
          nextProgress,
          playerSize: PLAYER_SIZE,
          playerX,
          reverseDirection,
          stageWidth,
        });
        current.progress = respawnProgressEnd;
        current.displayProgress = nextProgress;
        current.respawnProgressStart = nextTime;
        current.respawnProgressUntil = nextTime + 0.38;
        current.displayProgress = resolveFlappyDisplayProgress(current);
        current.started = false;
        current.playerY = initialPlayerY;
        current.playerVy = 0;
        current.failures = failures;
        current.invincibleUntil = nextTime + 1.15;
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
  }, [backgroundRefs, baseRevives, collectibleCount, gapSize, gateCount, initialPlayerY, level.params, mode, onBaseReviveUsed, playerX, recordFrame, reverseDirection, reversedGravity, speed, stageHeight, stageWidth, syncFlappyRuntimeState, syncFlappyView, triggerScreenShake, unlimitedRespawn]);

  const progressPercent = clamp((view.passed / gateCount) * 100, 0, 100);
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
        <span>进度 {view.passed}/{gateCount}</span>
        {collectibleCount > 0 ? <span>收集 {view.collected}/{collectibleCount}</span> : null}
      </div>
      <div
        className={`prototype-stage flappy-stage ${screenShakeClassName} ${reverseDirection ? "reverse" : ""} ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        ref={stageRef}
        role="application"
        aria-label="Flappy Bird 型小游戏"
        onPointerDown={(event) => {
          event.preventDefault();
          pulse();
        }}
      >
        <MiniGameFpsBadge fps={fps} />
        <div style={worldLayerStyle}>
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
            const centerY = flappyGateCenterY(gate, view.time, level.params, stageHeight);
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
                  style={{ height: `${stageHeight}px`, transform: transformPoint3d(screenX, topHeight - stageHeight), width: `${FLAPPY_GATE_WIDTH}px` }}
                />
                <div
                  className="flappy-gate bottom"
                  ref={(node) => {
                    if (node) gateBottomRefs.current.set(gate.id, node);
                    else gateBottomRefs.current.delete(gate.id);
                  }}
                  style={{
                    height: `${stageHeight}px`,
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
            style={{ transform: transformPoint3d(playerScreenX - PLAYER_SIZE / 2, view.playerY - PLAYER_SIZE / 2) }}
          >
            <PlayerAvatar
              {...resolveFlappyPlayerAvatarView(view)}
              direction={resolveFlappyDirection(reverseDirection)}
              gravity={reversedGravity ? "light" : "normal"}
              rotationTurns={view.playerTurns}
              visualScale={1.18}
            />
          </div>
          {remoteState || remoteStateSubscription ? (
            <div className="flappy-remote-player-shell" ref={remotePlayerShellRef}>
              <PlayerAvatar
                {...(remoteState ? resolveFlappyRemoteAvatarView(remoteState) : { action: "idle", expression: "neutral" })}
                direction={remoteState?.direction ?? "none"}
                gravity={reversedGravity ? "light" : "normal"}
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
