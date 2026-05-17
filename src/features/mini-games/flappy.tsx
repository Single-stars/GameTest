"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { PlayerAvatar, type PlayerAvatarState } from "@/features/player-avatar/player-avatar";
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
  selectVisibleFlappyGates,
  type GeneratedFlappyGate,
  type MiniGameLevelConfig,
  type MiniGameParams,
} from "@/lib/mini-games";

const FLAPPY_GATE_WIDTH = 54;
const FLAPPY_START_PLATFORM_HEIGHT = 12;
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

function resolveFlappyPlayerAvatarState(view: FlappyViewFrame): PlayerAvatarState {
  if (view.status === "failed") return "fail";
  if (view.status === "passed") return "success";
  if (view.time < view.invincibleUntil) return "shield";
  return "idle";
}

function flappyStartPlatformY(stageHeight: number) {
  return stageHeight * 0.66;
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
  const startPlatformY = flappyStartPlatformY(stageHeight);
  const layout = useMemo(() => makeFlappyLayout(level, runSeed, stageSize), [level, runSeed, stageSize]);
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
  const backgroundNodeRefs = useRef(new Map<number, HTMLSpanElement>());
  const gateTopRefs = useRef(new Map<number, HTMLDivElement>());
  const gateBottomRefs = useRef(new Map<number, HTMLDivElement>());
  const collectibleRefs = useRef(new Map<number, HTMLDivElement>());
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const { fps, recordFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const { screenShakeClassName, triggerScreenShake } = useMiniGameScreenShake();
  const [view, setView] = useState<FlappyViewFrame>(() => makeFlappyView(initialRuntime, reverseDirection, visibleBuffer, stageWidth));

  const syncFlappyView = useCallback(
    (time = performance.now()) => {
      lastUiSyncRef.current = time;
      setView(makeFlappyView(runtimeRef.current, reverseDirection, visibleBuffer, stageWidth));
    },
    [reverseDirection, stageWidth, visibleBuffer],
  );

  useEffect(() => {
    runtimeRef.current = initialRuntime;
    lastUiSyncRef.current = 0;
    completedRef.current = false;
    const timer = window.setTimeout(() => {
      setView(makeFlappyView(initialRuntime, reverseDirection, visibleBuffer, stageWidth));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialRuntime, reverseDirection, stageWidth, visibleBuffer]);

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
        playerShellRef.current.style.transform = transformPoint3d(playerX - PLAYER_SIZE / 2, current.playerY - PLAYER_SIZE / 2);
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
        if (failures <= BASE_FAILURE_LIMIT) {
          triggerScreenShake();
          const respawnProgressEnd = Math.max(0, nextProgress - 92);
          current.progress = respawnProgressEnd;
          current.displayProgress = nextProgress;
          current.respawnProgressStart = nextTime;
          current.respawnProgressUntil = nextTime + 0.38;
          current.displayProgress = resolveFlappyDisplayProgress(current);
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

      if (status === "failed") triggerScreenShake();
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
  }, [backgroundRefs, collectibleCount, gapSize, gateCount, initialPlayerY, level.params, mode, playerX, recordFrame, reverseDirection, reversedGravity, speed, stageHeight, stageWidth, syncFlappyView, triggerScreenShake]);

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
          style={{ transform: transformPoint3d(playerX - PLAYER_SIZE / 2, view.playerY - PLAYER_SIZE / 2) }}
        >
          <PlayerAvatar
            direction={reverseDirection ? "left" : "right"}
            gravity={reversedGravity ? "light" : "normal"}
            rotationTurns={view.playerTurns}
            state={resolveFlappyPlayerAvatarState(view)}
            visualScale={1.18}
          />
        </div>
        {!view.started ? <div className="prototype-start-hint flappy-start-hint">点击开始</div> : null}
        {showOverlay ? <PrototypeEndOverlay status={view.status} reason={view.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}
