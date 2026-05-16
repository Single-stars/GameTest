"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEBUG_MINI_GAME_FPS,
  MINI_GAME_TIMER_SYNC_MS,
  MiniGameFpsBadge,
  PrototypeEndOverlay,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  booleanParam,
  clamp,
  numberParam,
  useMiniGameFpsCounter,
  useMiniGameLowPowerMode,
  type MiniGameCompletion,
  type MiniGameRunMode,
  type PrototypeStatus,
} from "@/features/mini-games/common";
import {
  generateKnifeForbiddenZones,
  generateKnifeInitialAngles,
  getKnifeShotGeometry,
  getLocalHitAngle,
  getSineAngularVelocity,
  normalizeDegrees,
  resolveKnifeShotOutcome,
  type AngleArc,
  type MiniGameLevelConfig,
} from "@/lib/mini-game-prototypes";

const DEBUG_MINI_GAME_HITBOX = false;
const KNIFE_WHEEL_SIZE = 190;
const KNIFE_INSERT_RADIUS = 74;
const KNIFE_DISC_CENTER = { x: STAGE_WIDTH / 2, y: 82 + KNIFE_WHEEL_SIZE / 2 };
const KNIFE_FIRE_POINT = { x: STAGE_WIDTH / 2, y: STAGE_HEIGHT - 92 };
const KNIFE_SHOT_GEOMETRY = getKnifeShotGeometry(KNIFE_FIRE_POINT, KNIFE_DISC_CENTER, KNIFE_WHEEL_SIZE / 2);
const KNIFE_FIRE_ANGLE = KNIFE_SHOT_GEOMETRY.impactAngle;
const KNIFE_COLLISION_DEGREES = 8;
const KNIFE_FLIGHT_MS = 95;
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

export function KnifeHitPrototype({
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
        <span>已发射 {view.shotIndex}/{shotCount}</span>
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
