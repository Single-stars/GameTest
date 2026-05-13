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
  getKnifeShotGeometry,
  getMiniGame,
  getMiniGameLevel,
  getMiniGameLevels,
  getLocalHitAngle,
  getSineAngularVelocity,
  normalizeDegrees,
  resolveKnifeShotOutcome,
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
const BASE_FAILURE_LIMIT = 3;

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

type DoodlePlatform = GeneratedDoodlePlatform;
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

function stagePointStyle(x: number, y: number, cameraY = 0, size = PLAYER_SIZE): CSSProperties {
  return {
    transform: `translate(${x - size / 2}px, ${STAGE_HEIGHT - (y - cameraY) - size / 2}px)`,
  };
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
  if (gameId === "doodle") {
    return <DoodleJumpPrototype level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  if (gameId === "flappy") {
    return <FlappyPrototype level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  return <KnifeHitPrototype level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
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
  const controlXRef = useRef(STAGE_WIDTH / 2);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const completedRef = useRef(false);
  const [frame, setFrame] = useState<DoodleFrame>({
    started: false,
    time: 0,
    playerX: STAGE_WIDTH / 2,
    playerY: world.startPlayerY,
    playerVy: 0,
    cameraY: 0,
    platforms: world.platforms,
    hazards: world.hazards,
    riskHit: 0,
    playerTurns: 0,
    failures: 0,
    invincibleUntil: 0,
    status: "playing",
    reason: "",
  });

  const startDoodle = useCallback(() => {
    setFrame((current) => current.started || current.status !== "playing" ? current : { ...current, started: true, playerVy: 760 });
  }, []);

  const setControlFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    controlXRef.current = clamp(((event.clientX - bounds.left) / bounds.width) * STAGE_WIDTH, PLAYER_SIZE / 2, STAGE_WIDTH - PLAYER_SIZE / 2);
    startDoodle();
  };

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const tick = (time: number) => {
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;
      setFrame((current) => {
        if (current.status !== "playing") return current;
        if (!current.started) return current;

        const nextTime = current.time + delta;
        const nextX = clamp(current.playerX + (controlXRef.current - current.playerX) * 0.34, PLAYER_SIZE / 2, STAGE_WIDTH - PLAYER_SIZE / 2);
        const previousY = current.playerY;
        let nextVy = current.playerVy - 1500 * delta;
        let nextY = current.playerY + nextVy * delta;
        let platforms = current.platforms;
        let riskHit = current.riskHit;
        let playerTurns = current.playerTurns;
        let reason = "";
        let status: PrototypeStatus = "playing";

        if (nextVy < 0) {
          for (const platform of current.platforms) {
            const platformX = movingPlatformX(platform, nextTime);
            const crossed = previousY - PLAYER_SIZE / 2 >= platform.y && nextY - PLAYER_SIZE / 2 <= platform.y;
            const insideX = Math.abs(nextX - platformX) <= platform.width / 2 + PLAYER_SIZE / 2;
            if (crossed && insideX) {
              nextY = platform.y + PLAYER_SIZE / 2;
              nextVy = 760 * (platform.risk ? riskJumpMultiplier : 1);
              platforms = current.platforms.filter((item) => item.id !== platform.id);
              if (platform.risk) riskHit += 1;
              playerTurns += 1;
              break;
            }
          }
        }

        const cameraY = Math.max(current.cameraY, nextY - STAGE_HEIGHT * 0.45);
        if (status === "playing") {
          const missedRisk = platforms.find((platform) => platform.risk && cameraY > platform.y + STAGE_HEIGHT * 0.34);
          if (missedRisk) {
            status = "failed";
            reason = "漏踩高风险平台";
          }
        }

        if (status === "playing" && nextTime >= current.invincibleUntil) {
          const hitHazard = current.hazards.some((hazard) => {
            const position = movingHazardPosition(hazard, nextTime);
            if (position.y < cameraY - 50 || position.y > cameraY + STAGE_HEIGHT + 50) return false;
            const distance = Math.hypot(nextX - position.x, nextY - position.y);
            return distance <= position.size / 2 + PLAYER_SIZE / 2 - 3;
          });
          if (hitHazard) {
            status = "failed";
            reason = "碰到移动障碍";
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
            };
            return {
              ...current,
              time: nextTime,
              playerX: respawnX,
              playerY: respawnY,
              playerVy: 760,
              cameraY,
              platforms: [respawnPlatform, ...platforms.filter((platform) => platform.id !== respawnPlatform.id)],
              riskHit,
              playerTurns,
              failures,
              invincibleUntil: nextTime + 1.1,
              status: "playing",
              reason,
            };
          }
          reason = "失误超过 3 次，进入下一关";
        }

        return {
          ...current,
          time: nextTime,
          playerX: nextX,
          playerY: nextY,
          playerVy: nextVy,
          cameraY,
          platforms,
          riskHit,
          playerTurns,
          failures: status === "failed" && mode === "base" ? current.failures + 1 : current.failures,
          status,
          reason,
        };
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [mode, riskJumpMultiplier, riskTotal, world.targetHeight]);

  const progress = clamp((frame.playerY / world.targetHeight) * 100, 0, 100);
  const showOverlay = mode === "prototype";

  useEffect(() => {
    if (!onComplete || completedRef.current || frame.status === "playing") return;
    completedRef.current = true;
    onComplete({
      gameId: "doodle",
      levelId: level.levelId,
      status: frame.status,
      reason: frame.reason,
      elapsedMs: Math.round(frame.time * 1000),
      stats: {
        failures: frame.failures,
        progressPercent: Math.round(progress),
        riskHit: frame.riskHit,
        riskTotal,
        forcedAdvance: mode === "base" && frame.status === "failed",
      },
    });
  }, [frame.failures, frame.reason, frame.riskHit, frame.status, frame.time, level.levelId, mode, onComplete, progress, riskTotal]);

  return (
    <div className="prototype-game-wrap">
        <div className="mini-score">
        <span>高度 {Math.round(progress)}%</span>
        <span>必踩 {frame.riskHit}/{riskTotal}</span>
        {mode === "base" ? <span>失误 {Math.min(frame.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
      </div>
      <div
        className={`prototype-stage doodle-stage ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
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
        <div className="doodle-progress-line" style={{ bottom: `${clamp((world.targetHeight - frame.cameraY) / STAGE_HEIGHT, 0, 1) * 100}%` }} />
        {frame.platforms.map((platform) => {
          const x = movingPlatformX(platform, frame.time);
          const y = STAGE_HEIGHT - (platform.y - frame.cameraY);
          if (y < -30 || y > STAGE_HEIGHT + 30) return null;
          return (
            <div
              className={`doodle-platform ${platform.start ? "start" : ""} ${platform.moving ? "moving" : ""} ${platform.risk ? "risk" : ""}`}
              key={platform.id}
              style={{
                transform: `translate(${x - platform.width / 2}px, ${y}px)`,
                width: `${platform.width}px`,
              }}
            />
          );
        })}
        {frame.hazards.map((hazard) => {
          const position = movingHazardPosition(hazard, frame.time);
          const y = STAGE_HEIGHT - (position.y - frame.cameraY) - position.size / 2;
          if (y < -40 || y > STAGE_HEIGHT + 40) return null;
          const rotate = hazard.movementPattern === "vertical" ? 0 : hazard.movementPattern === "patrolDiagonal" ? 28 : hazard.movementPattern === "slowCross" ? -12 : 45;
          return (
            <div
              className={`doodle-hazard motion-${hazard.movementPattern} ${hazard.movementEnabled ? "moving" : ""}`}
              key={hazard.id}
              style={{
                height: `${position.size}px`,
                transform: `translate(${position.x - position.size / 2}px, ${y}px) rotate(${rotate}deg)`,
                width: `${position.size}px`,
              }}
            />
          );
        })}
        <div className={`doodle-player-shell ${frame.time < frame.invincibleUntil ? "invincible" : ""}`} style={stagePointStyle(frame.playerX, frame.playerY, frame.cameraY)}>
          <div className="prototype-player-box doodle-player" style={{ transform: `rotate(${frame.playerTurns * 90}deg)` }} />
        </div>
        {!frame.started ? <div className="prototype-start-hint">拖动开始</div> : null}
        {showOverlay ? <PrototypeEndOverlay status={frame.status} reason={frame.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}

function makeFlappyLayout(level: MiniGameLevelConfig, runSeed: string) {
  return generateFlappyGateLayout(level, runSeed, { stageHeight: STAGE_HEIGHT });
}

function flappyGateCenterY(gate: FlappyGate, frame: FlappyFrame, params: MiniGameParams) {
  if (!gate.moving) return gate.baseCenterY;
  const movingSpeed = numberParam(params, "movingGateSpeed", 1);
  return clamp(gate.baseCenterY + Math.sin(frame.time * movingSpeed + gate.phase) * 42, 116, STAGE_HEIGHT - 116);
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
  const backgroundRefs: FlappyBackgroundRef[] = layout.backgroundRefs;
  const reversedGravity = booleanParam(level.params, "reversedGravity");
  const reverseDirection = booleanParam(level.params, "reverseDirection");
  const gateCount = numberParam(level.params, "gateCount", 6);
  const collectibleCount = numberParam(level.params, "collectibleCount", 0);
  const gapSize = numberParam(level.params, "gapSize", 180);
  const speed = numberParam(level.params, "speed", 118);
  const playerX = reverseDirection ? STAGE_WIDTH - 92 : 92;
  const completedRef = useRef(false);
  const initialPlayerY = layout.initialPlacement === "belowPlatform"
    ? FLAPPY_START_PLATFORM_Y + FLAPPY_START_PLATFORM_HEIGHT + PLAYER_SIZE / 2
    : FLAPPY_START_PLATFORM_Y - PLAYER_SIZE / 2;
  const [frame, setFrame] = useState<FlappyFrame>({
    started: false,
    time: 0,
    progress: 0,
    playerY: initialPlayerY,
    playerVy: 0,
    gates,
    passed: 0,
    collected: 0,
    playerTurns: 0,
    failures: 0,
    invincibleUntil: 0,
    status: "playing",
    reason: "",
  });

  const pulse = useCallback(() => {
    setFrame((current) =>
      current.status === "playing"
        ? {
            ...current,
            started: true,
            playerTurns: current.playerTurns + 1,
            playerVy: reversedGravity ? 335 : -335,
          }
        : current,
    );
  }, [reversedGravity]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();

    const tick = (time: number) => {
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;
      setFrame((current) => {
        if (current.status !== "playing") return current;
        if (!current.started) return current;
        const nextTime = current.time + delta;
        const gravity = reversedGravity ? -850 : 900;
        const nextVy = current.playerVy + gravity * delta;
        const nextY = current.playerY + nextVy * delta;
        const nextProgress = current.progress + speed * delta;
        let status: PrototypeStatus = "playing";
        let reason = "";
        let passed = current.passed;
        let collected = current.collected;

        let nextGates = current.gates.map((gate) => {
          const screenX = reverseDirection ? -gate.distance + nextProgress : STAGE_WIDTH + gate.distance - nextProgress;
          const centerY = flappyGateCenterY(gate, current, level.params);
          const gatePassed = reverseDirection ? screenX > playerX + PLAYER_SIZE : screenX + FLAPPY_GATE_WIDTH < playerX - PLAYER_SIZE;
          let nextGate = gate;

          if (!gate.passed && gatePassed) {
            passed += 1;
            nextGate = { ...nextGate, passed: true };
          }

          if (gate.collectible && !gate.collected) {
            const collectibleY = clamp(centerY + gate.collectibleOffset * gapSize, centerY - gapSize / 2 + 22, centerY + gapSize / 2 - 22);
            const collectibleX = screenX + FLAPPY_GATE_WIDTH / 2;
            if (Math.hypot(playerX - collectibleX, nextY - collectibleY) <= 24) {
              collected += 1;
              nextGate = { ...nextGate, collected: true };
            }
          }

          const overlapsX = playerX + PLAYER_SIZE / 2 > screenX && playerX - PLAYER_SIZE / 2 < screenX + FLAPPY_GATE_WIDTH;
          const blockedY = nextY - PLAYER_SIZE / 2 < centerY - gapSize / 2 || nextY + PLAYER_SIZE / 2 > centerY + gapSize / 2;
          if (overlapsX && blockedY && nextTime >= current.invincibleUntil) {
            status = "failed";
            reason = "撞到障碍";
          }

          return nextGate;
        });

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
          nextGates = nextGates.map((gate) => ({ ...gate, passed: true }));
        }

        if (mode === "base" && status === "failed") {
          const failures = current.failures + 1;
          if (failures <= BASE_FAILURE_LIMIT) {
            return {
              ...current,
              time: nextTime,
              progress: Math.max(0, nextProgress - 92),
              playerY: initialPlayerY,
              playerVy: 0,
              gates: nextGates,
              passed,
              collected,
              failures,
              invincibleUntil: nextTime + 1.15,
              status: "playing",
              reason,
            };
          }
          reason = "失误超过 3 次，进入下一关";
        }

        return {
          ...current,
          time: nextTime,
          progress: nextProgress,
          playerY: nextY,
          playerVy: nextVy,
          gates: nextGates,
          passed,
          collected,
          failures: status === "failed" && mode === "base" ? current.failures + 1 : current.failures,
          status,
          reason,
        };
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [collectibleCount, gapSize, gateCount, initialPlayerY, level.params, mode, playerX, reverseDirection, reversedGravity, speed]);

  const progressPercent = clamp((frame.passed / gateCount) * 100, 0, 100);
  const showOverlay = mode === "prototype";

  useEffect(() => {
    if (!onComplete || completedRef.current || frame.status === "playing") return;
    completedRef.current = true;
    onComplete({
      gameId: "flappy",
      levelId: level.levelId,
      status: frame.status,
      reason: frame.reason,
      elapsedMs: Math.round(frame.time * 1000),
      stats: {
        failures: frame.failures,
        progressPercent: Math.round(progressPercent),
        passedGates: frame.passed,
        gateCount,
        collected: frame.collected,
        collectibleCount,
        forcedAdvance: mode === "base" && frame.status === "failed",
      },
    });
  }, [collectibleCount, frame.collected, frame.failures, frame.passed, frame.reason, frame.status, frame.time, gateCount, level.levelId, mode, onComplete, progressPercent]);

  return (
    <div className="prototype-game-wrap">
        <div className="mini-score">
          <span>通过 {frame.passed}/{gateCount}</span>
          <span>收集 {frame.collected}/{collectibleCount}</span>
          {mode === "base" ? <span>失误 {Math.min(frame.failures, BASE_FAILURE_LIMIT)}/{BASE_FAILURE_LIMIT}</span> : null}
        </div>
      <div
        className={`prototype-stage flappy-stage ${reverseDirection ? "reverse" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        role="application"
        aria-label="Flappy Bird 型小游戏"
        onPointerDown={(event) => {
          event.preventDefault();
          pulse();
        }}
      >
        <div className="flappy-background" aria-hidden="true">
          {backgroundRefs.map((ref) => {
            const spacing = 82;
            const drift = reverseDirection ? frame.progress : -frame.progress;
            const cycle = STAGE_WIDTH + spacing;
            const x = (((ref.x + drift * 0.55) % cycle) + cycle) % cycle - spacing;
            return (
              <span
                className={ref.kind}
                key={ref.id}
                style={{ transform: `translate(${x}px, ${ref.y}px)` }}
              />
            );
          })}
        </div>
        <div
          className={`flappy-start-platform ${frame.started ? "started" : ""}`}
          style={{ transform: `translate(${playerX - 50}px, ${FLAPPY_START_PLATFORM_Y}px)` }}
        />
        {frame.gates.map((gate) => {
          const screenX = reverseDirection ? -gate.distance + frame.progress : STAGE_WIDTH + gate.distance - frame.progress;
          if (screenX < -90 || screenX > STAGE_WIDTH + 90) return null;
          const centerY = flappyGateCenterY(gate, frame, level.params);
          const collectibleY = clamp(centerY + gate.collectibleOffset * gapSize, centerY - gapSize / 2 + 22, centerY + gapSize / 2 - 22);
          return (
            <div className={`flappy-gate-layer ${gate.moving ? "moving" : ""}`} key={gate.id}>
              <div
                className="flappy-gate top"
                style={{ height: `${centerY - gapSize / 2}px`, transform: `translateX(${screenX}px)`, width: `${FLAPPY_GATE_WIDTH}px` }}
              />
              <div
                className="flappy-gate bottom"
                style={{
                  height: `${STAGE_HEIGHT - (centerY + gapSize / 2)}px`,
                  transform: `translate(${screenX}px, ${centerY + gapSize / 2}px)`,
                  width: `${FLAPPY_GATE_WIDTH}px`,
                }}
              />
              {gate.collectible && !gate.collected ? (
                <div
                  className="flappy-collectible"
                  style={{ transform: `translate(${screenX + FLAPPY_GATE_WIDTH / 2 - 9}px, ${collectibleY - 9}px)` }}
                />
              ) : null}
            </div>
          );
        })}
        <div
          className={`flappy-player-shell ${frame.time < frame.invincibleUntil ? "invincible" : ""}`}
          style={{ transform: `translate(${playerX - PLAYER_SIZE / 2}px, ${frame.playerY - PLAYER_SIZE / 2}px)` }}
        >
          <div className={`prototype-player-box flappy-player ${reversedGravity ? "reversed" : ""}`} style={{ transform: `rotate(${frame.playerTurns * 90}deg)` }} />
        </div>
        {!frame.started ? <div className="prototype-start-hint flappy-start-hint">点击开始</div> : null}
        {showOverlay ? <PrototypeEndOverlay status={frame.status} reason={frame.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
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
  const completedRef = useRef(false);
  const [frame, setFrame] = useState<KnifeFrame>({
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
  });

  const resolveShot = useCallback((current: KnifeFrame): KnifeFrame => {
    if (current.status !== "playing") return current;
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
        return {
          ...current,
          failedAngles: [...current.failedAngles, outcome.impactAngle],
          failedAngle: outcome.impactAngle,
          failures: nextFailures,
          flying: false,
          launcherReadyAt: current.time + 0.06,
          reason: "撞到已插入长条",
          shotIndex: nextShotIndex,
          status: nextShotIndex >= shotCount ? "failed" : "playing",
          timer: hasCountdown ? countdown : null,
        };
      }
      return { ...current, failedAngle: outcome.impactAngle, flying: false, status: "failed", reason: "撞到已插入长条" };
    }
    if (outcome.kind === "forbidden") {
      if (mode === "base") {
        const nextShotIndex = current.shotIndex + 1;
        const nextFailures = current.failures + 1;
        return {
          ...current,
          failedAngles: [...current.failedAngles, outcome.impactAngle],
          failedAngle: outcome.impactAngle,
          failures: nextFailures,
          flying: false,
          launcherReadyAt: current.time + 0.06,
          reason: "命中危险区域",
          shotIndex: nextShotIndex,
          status: nextShotIndex >= shotCount ? "failed" : "playing",
          timer: hasCountdown ? countdown : null,
        };
      }
      return { ...current, failedAngle: outcome.impactAngle, flying: false, status: "failed", reason: "命中危险区域" };
    }

    const nextShotIndex = current.shotIndex + 1;
    const nextInserted = [...current.insertedAngles, outcome.impactAngle];
    if (nextShotIndex >= shotCount) {
      return {
        ...current,
        flying: false,
        insertedAngles: nextInserted,
        shotIndex: nextShotIndex,
        status: current.failures > 0 && mode === "base" ? "failed" : "passed",
        reason: `全部 ${shotCount} 发命中`,
      };
    }

    return {
      ...current,
      flying: false,
      insertedAngles: nextInserted,
      shotIndex: nextShotIndex,
      launcherReadyAt: current.time + 0.06,
      timer: hasCountdown ? countdown : null,
    };
  }, [countdown, forbiddenArcs, hasCountdown, mode, shotCount]);

  const launch = useCallback(() => {
    setFrame((current) => {
      if (current.status !== "playing" || current.flying) return current;
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setFrame((latest) => resolveShot(latest));
        timeoutRef.current = null;
      }, KNIFE_FLIGHT_MS);
      return { ...current, flying: true };
    });
  }, [resolveShot]);

  useEffect(() => {
    let frameId = 0;
    let last = performance.now();
    const tick = (time: number) => {
      const delta = clamp((time - last) / 1000, 0, 0.032);
      last = time;
      setFrame((current) => {
        if (current.status !== "playing") return current;
        const nextTime = current.time + delta;
        const speed = sineRotationEnabled ? getSineAngularVelocity(current.time, phaseDuration, sweepPerPhase) : baseRotationSpeed;
        let nextTimer = current.timer;
        let status: PrototypeStatus = "playing";
        let reason = "";
        if (nextTimer !== null && !current.flying) {
          nextTimer -= delta;
          if (nextTimer <= 0) {
            if (mode === "base") {
              const nextShotIndex = current.shotIndex + 1;
              return {
                ...current,
                failures: current.failures + 1,
                launcherReadyAt: nextTime + 0.06,
                reason: "倒计时结束",
                shotIndex: nextShotIndex,
                status: nextShotIndex >= shotCount ? "failed" : "playing",
                time: nextTime,
                timer: hasCountdown ? countdown : null,
                rotation: normalizeDegrees(current.rotation + speed * delta),
              };
            }
            status = "failed";
            reason = "倒计时结束";
            nextTimer = 0;
          }
        }
        return {
          ...current,
          time: nextTime,
          rotation: normalizeDegrees(current.rotation + speed * delta),
          timer: nextTimer,
          status,
          reason,
        };
      });
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [baseRotationSpeed, countdown, hasCountdown, mode, phaseDuration, shotCount, sineRotationEnabled, sweepPerPhase]);

  const remaining = shotCount - frame.shotIndex;
  const wheelRotation = `rotate(${frame.rotation}deg)`;
  const showLauncher = frame.status === "playing" && (frame.flying || frame.time >= frame.launcherReadyAt);
  const showOverlay = mode === "prototype";

  useEffect(() => {
    if (!onComplete || completedRef.current || frame.status === "playing") return;
    completedRef.current = true;
    onComplete({
      gameId: "knife",
      levelId: level.levelId,
      status: frame.status,
      reason: frame.reason,
      elapsedMs: Math.round(frame.time * 1000),
      stats: {
        failures: frame.failures,
        hits: frame.insertedAngles.length,
        shotCount,
        fired: frame.shotIndex,
        forcedAdvance: mode === "base" && frame.status === "failed",
      },
    });
  }, [frame.failures, frame.insertedAngles.length, frame.reason, frame.shotIndex, frame.status, frame.time, level.levelId, mode, onComplete, shotCount]);

  return (
    <div className="prototype-game-wrap">
        <div className="mini-score">
          <span>已发 {frame.shotIndex}/{shotCount}</span>
          {mode === "base" ? <span>命中 {frame.insertedAngles.length}/{shotCount}</span> : null}
          {hasCountdown ? <span>倒计时 {(frame.timer ?? 0).toFixed(1)}s</span> : null}
          {sineRotationEnabled ? <span>正弦转速</span> : null}
      </div>
      <div
        className={`prototype-stage knife-stage ${frame.flying ? "firing" : ""} ${remaining === 1 ? "final-shot-ready" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
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
        <div className="knife-wheel-wrap">
          <div className="knife-wheel" style={{ transform: wheelRotation }}>
            <svg className="knife-wheel-svg" viewBox={`0 0 ${KNIFE_WHEEL_SIZE} ${KNIFE_WHEEL_SIZE}`} aria-hidden="true">
              <circle cx={KNIFE_WHEEL_SIZE / 2} cy={KNIFE_WHEEL_SIZE / 2} r={KNIFE_WHEEL_SIZE / 2 - 3} />
              {forbiddenZones.map((zone) => (
                <path d={knifeSectorPath(zone)} key={zone.id} />
              ))}
            </svg>
            {frame.initialAngles.map((angle) => (
              <span className="knife-arrow knife-stuck initial" key={`initial-${angle}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
            ))}
            {frame.insertedAngles.map((angle, index) => (
              <span className="knife-arrow knife-stuck" key={`${angle}-${index}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
            ))}
            {frame.failedAngles.map((angle, index) => (
              <span className="knife-arrow knife-stuck failed" key={`failed-${angle}-${index}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
            ))}
            {frame.failedAngle !== null ? (
              mode === "prototype" ? <span className="knife-arrow knife-stuck failed" style={{ transform: `rotate(${frame.failedAngle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} /> : null
            ) : null}
          </div>
        </div>
        {showLauncher ? <div className={`knife-arrow knife-launcher ${frame.flying ? "flying" : ""}`} /> : null}
        <div className="knife-shot-stack" aria-hidden="true">
          {Array.from({ length: remaining }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        {showOverlay ? <PrototypeEndOverlay status={frame.status} reason={frame.reason} onBackToSelect={onBackToSelect} onRestart={onRestart} /> : null}
      </div>
    </div>
  );
}
