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
  BASE_FAILURE_LIMIT,
  DEBUG_MINI_GAME_FPS,
  MINI_GAME_UI_SYNC_MS,
  MiniGameFpsBadge,
  MiniGamePerfPanel,
  PLAYER_SIZE,
  PrototypeEndOverlay,
  STAGE_HEIGHT,
  STAGE_WIDTH,
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
  generateDoodleWorldLayout,
  selectVisibleDoodleHazards,
  selectVisibleDoodlePlatforms,
  type GeneratedDoodleHazard,
  type GeneratedDoodlePlatform,
  type MiniGameLevelConfig,
} from "@/lib/mini-games";

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

export function DoodleJumpPrototype({
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
