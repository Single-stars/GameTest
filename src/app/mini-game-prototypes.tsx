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
  MINI_GAME_PROTOTYPES,
  createMiniGameRunSeed,
  generateDoodleWorldLayout,
  generateFlappyGateLayout,
  generateKnifeForbiddenZones,
  generateKnifeInitialAngles,
  getFlappyGateScreenX,
  getKnifeShotGeometry,
  getMiniGame,
  getMiniGameLevel,
  getMiniGameLevels,
  getLocalHitAngle,
  getSineAngularVelocity,
  isLowPowerMiniGameDevice,
  normalizeDegrees,
  resolveKnifeShotOutcome,
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
} from "@/lib/mini-game-prototypes";

const STAGE_WIDTH = 360;
const STAGE_HEIGHT = 640;
const PLAYER_SIZE = 32;
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
const DEBUG_MINI_GAME_HITBOX = false;
const DEBUG_MINI_GAME_FPS = false;
const BASE_FAILURE_LIMIT = 3;
const MINI_GAME_UI_SYNC_MS = 120;
const MINI_GAME_TIMER_SYNC_MS = 100;

type PrototypeStatus = "playing" | "passed" | "failed";
type MiniGameRunMode = "prototype" | "base" | "advanced";
export type MiniGameCompletion = {
  gameId: MiniGameId;
  levelId: string;
  status: Exclude<PrototypeStatus, "playing">;
  reason: string;
  elapsedMs: number;
  stats: Record<string, number | string | boolean | null>;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function numberParam(params: MiniGameParams, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanParam(params: MiniGameParams, key: string, fallback = false) {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

function levelToneClass(level: MiniGameLevelConfig) {
  if (level.difficulty === "最终") return "advanced-gold";
  if (level.difficulty === "困难") return "advanced-tier-3";
  if (level.difficulty === "普通") return "advanced-tier-2";
  if (level.difficulty === "简单") return "advanced-tier-1";
  return "advanced-empty";
}

function transformPoint3d(x: number, y: number) {
  return `translate3d(${x}px, ${y}px, 0)`;
}

function stagePointStyle(x: number, y: number, cameraY = 0, size = PLAYER_SIZE): CSSProperties {
  return {
    transform: transformPoint3d(x - size / 2, STAGE_HEIGHT - (y - cameraY) - size / 2),
  };
}

function useMiniGameLowPowerMode() {
  const [isLowPowerDevice, setIsLowPowerDevice] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLowPowerDevice(isLowPowerMiniGameDevice());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return isLowPowerDevice;
}

function useMiniGameFpsCounter(enabled: boolean) {
  const [fps, setFps] = useState(0);
  const statsRef = useRef({ frames: 0, lastReportAt: 0 });

  const recordFrame = useCallback(
    (time: number) => {
      if (!enabled) return;
      const stats = statsRef.current;
      if (stats.lastReportAt === 0) stats.lastReportAt = time;
      stats.frames += 1;
      const elapsed = time - stats.lastReportAt;
      if (elapsed >= 500) {
        setFps(Math.round((stats.frames * 1000) / elapsed));
        stats.frames = 0;
        stats.lastReportAt = time;
      }
    },
    [enabled],
  );

  return { fps, recordFrame };
}

function MiniGameFpsBadge({ fps }: { fps: number }) {
  if (!DEBUG_MINI_GAME_FPS) return null;
  return <div className="mini-game-fps-badge">FPS {fps}</div>;
}

export function MiniGameEntryPanel({ onOpenGame }: { onOpenGame: (gameId: MiniGameId) => void }) {
  return (
    <section className="mini-game-entry-panel" aria-labelledby="mini-game-entry-title">
      <div className="mini-game-entry-header">
        <p className="eyebrow">小游戏原型</p>
        <h2 id="mini-game-entry-title">小游戏原型</h2>
      </div>
      <div className="mini-game-entry-grid">
        {MINI_GAME_PROTOTYPES.map((game) => (
          <button className="mini-game-entry-card" key={game.id} type="button" onPointerDown={() => onOpenGame(game.id)}>
            <span>{game.title}</span>
            <strong>{game.shortTitle}</strong>
            <small>{game.summary}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MiniGameLevelSelectScreen({
  gameId,
  onBack,
  onStartLevel,
}: {
  gameId: MiniGameId;
  onBack: () => void;
  onStartLevel: (levelId: string) => void;
}) {
  const game = getMiniGame(gameId);
  const levels = getMiniGameLevels(gameId);
  const advancedLevels = levels.filter((level) => level.kind === "advanced");
  const baseLevel = levels.find((level) => level.kind === "base");

  return (
    <section className="advanced-screen mini-game-select-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>小游戏原型</span>
      </header>

      <div className="advanced-hero mini-game-hero">
        <p className="eyebrow">关卡选择</p>
        <h1>{game.title}</h1>
        <small>{game.instruction}</small>
      </div>

      <div className="advanced-panel mini-game-level-panel">
        <div className="mini-game-section-title">
          <strong>进阶关</strong>
          <span>全部可试玩</span>
        </div>
        <div className="mini-game-level-list">
          {advancedLevels.map((level) => (
            <button
              className={`mini-game-level-card ${levelToneClass(level)}`}
              key={level.levelId}
              type="button"
              onPointerDown={() => onStartLevel(level.levelId)}
            >
              <span>{level.code}</span>
              <strong>{level.title}</strong>
              <em>{level.difficulty}</em>
              <small>{level.description}</small>
            </button>
          ))}
        </div>
        {baseLevel ? (
          <>
            <div className="mini-game-section-title mini-game-base-title">
              <strong>基础关</strong>
              <span>手感验证</span>
            </div>
            <button className="mini-game-level-card mini-game-base-card advanced-empty" type="button" onPointerDown={() => onStartLevel(baseLevel.levelId)}>
              <span>{baseLevel.code}</span>
              <strong>{baseLevel.title}</strong>
              <em>{baseLevel.difficulty}</em>
              <small>{baseLevel.description}</small>
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function MiniGamePlayScreen({
  attemptId,
  gameId,
  levelId,
  onBackToSelect,
}: {
  attemptId: number;
  gameId: MiniGameId;
  levelId: string;
  onBackToSelect: () => void;
}) {
  const [runId, setRunId] = useState(attemptId);
  const game = getMiniGame(gameId);
  const level = getMiniGameLevel(gameId, levelId);
  const runSeed = useMemo(() => createMiniGameRunSeed(level.levelId, runId), [level.levelId, runId]);
  const restart = useCallback(() => setRunId(Date.now()), []);

  return (
    <section className="play-screen mini-game-play-screen" aria-live="polite">
      <header className="round-header advanced-round-header mini-game-round-header">
        <div className="round-title-block">
          <p className="eyebrow">{game.title}</p>
          <h1>{level.code} {level.title}</h1>
          <small>{level.goalText}</small>
        </div>
        <button className="advanced-back-button" type="button" onPointerDown={onBackToSelect}>
          返回
        </button>
      </header>
      <MiniGameEmbeddedStage
        key={`${level.levelId}-${runId}`}
        gameId={gameId}
        levelId={levelId}
        mode="prototype"
        onBackToSelect={onBackToSelect}
        onRestart={restart}
        runSeed={runSeed}
      />
    </section>
  );
}

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
  return <KnifeHitPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
}

function PrototypeEndOverlay({
  reason,
  status,
  onBackToSelect,
  onRestart,
}: {
  reason: string;
  status: PrototypeStatus;
  onBackToSelect: () => void;
  onRestart: () => void;
}) {
  if (status === "playing") return null;
  return (
    <div className={`prototype-end-overlay ${status}`} role="dialog" aria-modal="true" onPointerDown={(event) => event.stopPropagation()}>
      <p className="eyebrow">{status === "passed" ? "通关" : "失败"}</p>
      <h2>{status === "passed" ? "通关" : "失败"}</h2>
      <small>{reason}</small>
      <div className="advanced-actions">
        <button className="secondary-button" type="button" onPointerDown={onRestart}>
          重新开始
        </button>
        <button className="primary-button" type="button" onPointerDown={onBackToSelect}>
          返回关卡选择
        </button>
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
  const controlXRef = useRef(STAGE_WIDTH / 2);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const progressLineRef = useRef<HTMLDivElement | null>(null);
  const platformRefs = useRef(new Map<number, HTMLDivElement>());
  const hazardRefs = useRef(new Map<number, HTMLDivElement>());
  const runtimeRef = useRef<DoodleFrame>(initialRuntime);
  const lastUiSyncRef = useRef(0);
  const completedRef = useRef(false);
  const { fps, recordFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const [view, setView] = useState<DoodleViewFrame>(() => makeDoodleView(initialRuntime, world.targetHeight, visibleBuffer));

  const syncDoodleView = useCallback(
    (time = performance.now()) => {
      lastUiSyncRef.current = time;
      setView(makeDoodleView(runtimeRef.current, world.targetHeight, visibleBuffer));
    },
    [visibleBuffer, world.targetHeight],
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

  const setControlFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    controlXRef.current = clamp(((event.clientX - bounds.left) / bounds.width) * STAGE_WIDTH, PLAYER_SIZE / 2, STAGE_WIDTH - PLAYER_SIZE / 2);
    startDoodle();
  };

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const updateDom = (current: DoodleFrame) => {
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
        const platform = current.platforms.find((item) => item.id === id);
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
        const hazard = current.hazards.find((item) => item.id === id);
        if (!hazard) continue;
        const position = movingHazardPosition(hazard, current.time);
        const y = STAGE_HEIGHT - (position.y - current.cameraY) - hazard.size / 2;
        const rotate = hazard.movementPattern === "vertical" ? 0 : hazard.movementPattern === "patrolDiagonal" ? 28 : hazard.movementPattern === "slowCross" ? -12 : 45;
        const scale = position.size / hazard.size;
        node.style.transform = `${transformPoint3d(position.x - hazard.size / 2, y)} rotate(${rotate}deg) scale(${scale})`;
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
      const nextX = clamp(current.playerX + (controlXRef.current - current.playerX) * 0.34, PLAYER_SIZE / 2, STAGE_WIDTH - PLAYER_SIZE / 2);
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
        const missedRisk = current.platforms.find((platform) => !platform.used && platform.risk && cameraY > platform.y + STAGE_HEIGHT * 0.34);
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
            reason = "碰到移动障碍";
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
          updateDom(current);
          syncDoodleView(time);
          frameId = requestAnimationFrame(tick);
          return;
        }
        current.failures = failures;
        reason = "失误超过 3 次，进入下一关";
      }

      current.status = status;
      current.reason = reason;
      updateDom(current);

      if (status !== "playing" || eventChanged || time - lastUiSyncRef.current >= MINI_GAME_UI_SYNC_MS) {
        syncDoodleView(time);
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [mode, recordFrame, riskJumpMultiplier, riskTotal, syncDoodleView, world.targetHeight]);

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
        <span>高度 {Math.round(view.progressPercent)}%</span>
        <span>必踩 {view.riskHit}/{riskTotal}</span>
        {mode === "base" ? <span>失误 {Math.min(view.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
      </div>
      <div
        className={`prototype-stage doodle-stage ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        ref={stageRef}
        role="application"
        aria-label="Doodle Jump 型小游戏"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setControlFromPointer(event);
        }}
        onPointerMove={setControlFromPointer}
      >
        <MiniGameFpsBadge fps={fps} />
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
        {!view.started ? <div className="prototype-start-hint">拖动开始</div> : null}
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
        reason = "失误超过 3 次，进入下一关";
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
        <span>通过 {view.passed}/{gateCount}</span>
        <span>收集 {view.collected}/{collectibleCount}</span>
        {mode === "base" ? <span>失误 {Math.min(view.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
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
        <span>已发 {view.shotIndex}/{shotCount}</span>
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
