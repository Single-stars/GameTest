"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { PlayerAvatar, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { DifficultyWaveBackdrop } from "@/features/visuals/difficulty-wave-backdrop";
import type { SelfGameState } from "@/features/game-sync/types";
import { getEndlessDifficulty, getEndlessKnifeConfig, getEndlessKnifeEffectiveWheelIndex } from "@/lib/endless-mode";
import { MULTIPLAYER_FAST_STATE_SYNC_MS } from "@/lib/multiplayer/protocol";
import {
  DEBUG_MINI_GAME_FPS,
  MINI_GAME_TIMER_SYNC_MS,
  MiniGameFpsBadge,
  PrototypeEndOverlay,
  booleanParam,
  clamp,
  numberParam,
  useMiniGameFpsCounter,
  useMiniGameLowPowerMode,
  useMiniGameStageSize,
  type EndlessMiniGameRuntime,
  type MiniGameCompletion,
  type MiniGameRunMode,
  type MiniGameStageSize,
  type PrototypeStatus,
} from "@/features/mini-games/common";
import {
  generateKnifeForbiddenZones,
  generateKnifeInitialAngles,
  getKnifeHitDangerProximityDegrees,
  getKnifeShotGeometry,
  getLocalHitAngle,
  resolveKnifeFirstOwner,
  resolveKnifeTurnSettlement,
  resolveKnifeTurnOwner,
  getSineAngularVelocity,
  normalizeDegrees,
  resolveKnifeShotOutcome,
  type AngleArc,
  type KnifeOwner,
  type MiniGameLevelConfig,
  type MiniGameParams,
} from "@/lib/mini-games";

const DEBUG_MINI_GAME_HITBOX = false;
const KNIFE_WHEEL_SIZE = 190;
const KNIFE_INSERT_RADIUS = 74;
const KNIFE_BASE_WHEEL_TOP = 82;
const KNIFE_BASE_LAUNCHER_BOTTOM = 92;
const KNIFE_COLLISION_DEGREES = 6;
const ENDLESS_KNIFE_DANGER_MARGIN_DEGREES = 4;
const KNIFE_FLIGHT_MS = 95;
const KNIFE_FEEDBACK_MS = 420;
const KNIFE_FINISH_DELAY_MS = 650;
const KNIFE_ENDLESS_WHEEL_ADVANCE_DELAY_MS = KNIFE_FINISH_DELAY_MS;
const KNIFE_ENDLESS_WHEEL_SLIDE_MS = 420;
const KNIFE_FOCUS_TIME_SCALE = 0.25;
const KNIFE_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_FAST_STATE_SYNC_MS;
type KnifeFeedbackTone = "idle" | "good" | "bad";
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
  hostHits: number;
  guestHits: number;
  hostTimeouts: number;
  guestTimeouts: number;
  hostCollisions: number;
  guestCollisions: number;
  hostDangerHits: number;
  guestDangerHits: number;
  timedOutThisShot: boolean;
  overtime: boolean;
  winnerRole: KnifeOwner | null;
  timer: number | null;
  flying: boolean;
  launcherReadyAt: number;
  status: PrototypeStatus;
  reason: string;
};

type KnifeViewFrame = KnifeFrame & {
  launcherVisible: boolean;
};

type PendingEndlessKnifeWheel = {
  forbiddenZones: KnifeForbiddenZone[];
  runtime: KnifeFrame;
  view: KnifeViewFrame;
  wheelIndex: number;
};

type EndlessKnifeWheelTransition =
  | { phase: "idle"; pending: null }
  | { phase: "waiting" | "sliding"; pending: PendingEndlessKnifeWheel };

export type KnifeRuntimeState = {
  angle?: number;
  cameraY: number;
  direction: "none";
  elapsedMs: number;
  failures: number;
  knifeCollisions?: number;
  knifeDangerHits?: number;
  knifeFailedAngles?: number[];
  knifeGuestCollisions?: number;
  knifeGuestDangerHits?: number;
  knifeGuestHits?: number;
  knifeGuestTimeouts?: number;
  knifeHits?: number;
  knifeHostCollisions?: number;
  knifeHostDangerHits?: number;
  knifeHostHits?: number;
  knifeHostTimeouts?: number;
  knifeInsertedAngles?: number[];
  knifeOvertime?: boolean;
  knifeShotIndex?: number;
  knifeTimedOutThisShot?: boolean;
  knifeTimer?: number;
  knifeTimeouts?: number;
  knifeWinnerRole?: KnifeOwner;
  progress: number;
  status: PrototypeStatus;
  x: number;
  y: number;
};

function formatKnifeRoundNumber(value: number) {
  const rounded = Math.max(1, Math.round(value));
  const labels = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  return labels[rounded - 1] ?? String(rounded);
}

function formatKnifeOvertimeRoundLabel(shotIndex: number, shotCount: number) {
  const overtimeShotNumber = Math.max(1, Math.round(shotIndex - shotCount));
  const overtimeRound = Math.floor((Math.max(1, overtimeShotNumber) - 1) / 2) + 1;
  return `加赛第${formatKnifeRoundNumber(overtimeRound)}轮`;
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

function getKnifeStageGeometry(stageSize: MiniGameStageSize) {
  const launcherBottom = clamp(stageSize.height * (KNIFE_BASE_LAUNCHER_BOTTOM / 640), 72, 112);
  const maxWheelTop = Math.max(52, stageSize.height - KNIFE_WHEEL_SIZE - launcherBottom - 116);
  const wheelTop = clamp(stageSize.height * (KNIFE_BASE_WHEEL_TOP / 640), 62, maxWheelTop);
  const discCenter = { x: stageSize.width / 2, y: wheelTop + KNIFE_WHEEL_SIZE / 2 };
  const firePoint = { x: stageSize.width / 2, y: stageSize.height - launcherBottom };
  const shotGeometry = getKnifeShotGeometry(firePoint, discCenter, KNIFE_WHEEL_SIZE / 2);
  return {
    fireAngle: shotGeometry.impactAngle,
    flightDistance: Math.max(120, firePoint.y - shotGeometry.impactPoint.y),
    launcherBottom,
    wheelTop,
  };
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
    hostHits: 0,
    guestHits: 0,
    hostTimeouts: 0,
    guestTimeouts: 0,
    hostCollisions: 0,
    guestCollisions: 0,
    hostDangerHits: 0,
    guestDangerHits: 0,
    timedOutThisShot: false,
    overtime: false,
    winnerRole: null,
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

function isKnifeLocalTurn(frame: KnifeFrame, multiplayerRole: KnifeOwner, firstOwner: KnifeOwner) {
  return resolveKnifeTurnOwner(frame.shotIndex, firstOwner) === multiplayerRole;
}

function addKnifeOwnerStat(frame: KnifeFrame, owner: KnifeOwner, stat: "hit" | "timeout" | "collision" | "danger") {
  if (owner === "host") {
    if (stat === "hit") frame.hostHits += 1;
    if (stat === "timeout") frame.hostTimeouts += 1;
    if (stat === "collision") frame.hostCollisions += 1;
    if (stat === "danger") frame.hostDangerHits += 1;
    return;
  }
  if (stat === "hit") frame.guestHits += 1;
  if (stat === "timeout") frame.guestTimeouts += 1;
  if (stat === "collision") frame.guestCollisions += 1;
  if (stat === "danger") frame.guestDangerHits += 1;
}

function knifeOwnerScore(frame: KnifeFrame, owner: KnifeOwner) {
  if (owner === "host") {
    return frame.hostHits - frame.hostTimeouts;
  }
  return frame.guestHits - frame.guestTimeouts;
}

function knifeOwnerStats(frame: KnifeFrame, owner: KnifeOwner) {
  if (owner === "host") {
    return {
      collisions: frame.hostCollisions,
      dangerHits: frame.hostDangerHits,
      hits: frame.hostHits,
      timeouts: frame.hostTimeouts,
    };
  }
  return {
    collisions: frame.guestCollisions,
    dangerHits: frame.guestDangerHits,
    hits: frame.guestHits,
    timeouts: frame.guestTimeouts,
  };
}

function settleKnifeTurnBasedShot(frame: KnifeFrame, shotCount: number, hasCountdown: boolean, countdown: number) {
  frame.timedOutThisShot = false;
  const hostScore = knifeOwnerScore(frame, "host");
  const guestScore = knifeOwnerScore(frame, "guest");
  const settlement = resolveKnifeTurnSettlement({
    countdown,
    guestScore,
    hasCountdown,
    hostScore,
    shotCount,
    shotIndex: frame.shotIndex,
  });
  frame.timer = settlement.timer;
  frame.overtime = settlement.overtime;
  frame.status = settlement.status;
  frame.winnerRole = settlement.winnerRole;
  if (settlement.showOvertimeBanner) {
    frame.reason = `加赛，比分 ${hostScore}:${guestScore}`;
  } else if (settlement.status === "passed") {
    frame.reason = `主局结束，比分 ${hostScore}:${guestScore}`;
  }
  return settlement;
}

function resolveKnifeCompletionStatus(frame: KnifeFrame, multiplayerRole?: KnifeOwner): PrototypeStatus {
  if (!multiplayerRole || !frame.winnerRole) return frame.status;
  return frame.winnerRole === multiplayerRole ? "passed" : "failed";
}

function finiteStateNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveKnifeRemoteStatus(current: KnifeFrame, remoteState: SelfGameState, multiplayerRole?: KnifeOwner): PrototypeStatus {
  if (remoteState.status === "playing") return "playing";
  if (current.winnerRole && multiplayerRole) {
    return current.winnerRole === multiplayerRole ? "passed" : "failed";
  }
  return remoteState.status === "failed" ? "failed" : "passed";
}

function applyKnifeRemoteState(frame: KnifeFrame, remoteState: SelfGameState, multiplayerRole?: KnifeOwner) {
  if (typeof remoteState.knifeShotIndex !== "number") return false;
  frame.insertedAngles = [...(remoteState.knifeInsertedAngles ?? frame.insertedAngles)];
  frame.failedAngles = [...(remoteState.knifeFailedAngles ?? frame.failedAngles)];
  frame.shotIndex = remoteState.knifeShotIndex;
  frame.failures = finiteStateNumber(remoteState.failures, frame.failures);
  frame.timer = typeof remoteState.knifeTimer === "number" ? remoteState.knifeTimer : null;
  frame.timedOutThisShot = remoteState.knifeTimedOutThisShot ?? false;
  frame.overtime = remoteState.knifeOvertime ?? frame.overtime;
  frame.winnerRole = remoteState.knifeWinnerRole ?? null;
  frame.hostHits = finiteStateNumber(remoteState.knifeHostHits, frame.hostHits);
  frame.guestHits = finiteStateNumber(remoteState.knifeGuestHits, frame.guestHits);
  frame.hostTimeouts = finiteStateNumber(remoteState.knifeHostTimeouts, frame.hostTimeouts);
  frame.guestTimeouts = finiteStateNumber(remoteState.knifeGuestTimeouts, frame.guestTimeouts);
  frame.hostCollisions = finiteStateNumber(remoteState.knifeHostCollisions, frame.hostCollisions);
  frame.guestCollisions = finiteStateNumber(remoteState.knifeGuestCollisions, frame.guestCollisions);
  frame.hostDangerHits = finiteStateNumber(remoteState.knifeHostDangerHits, frame.hostDangerHits);
  frame.guestDangerHits = finiteStateNumber(remoteState.knifeGuestDangerHits, frame.guestDangerHits);
  frame.flying = false;
  frame.failedAngle = frame.failedAngles.at(-1) ?? null;
  frame.status = resolveKnifeRemoteStatus(frame, remoteState, multiplayerRole);
  frame.reason = frame.winnerRole ? "主局结束" : frame.reason;
  return true;
}

function makeKnifeRuntimeState(
  frame: KnifeFrame,
  shotCount: number,
  stageSize: MiniGameStageSize,
  geometry: ReturnType<typeof getKnifeStageGeometry>,
  multiplayerRole?: KnifeOwner,
): KnifeRuntimeState {
  const totalShots = Math.max(1, shotCount);
  const progress = frame.status === "passed" ? 1 : Math.min(1, Math.max(0, frame.shotIndex / totalShots));
  const launcherY = stageSize.height - geometry.launcherBottom;
  const wheelCenterY = geometry.wheelTop + KNIFE_WHEEL_SIZE / 2;
  const localStats = multiplayerRole ? knifeOwnerStats(frame, multiplayerRole) : knifeOwnerStats(frame, "host");
  return {
    angle: frame.rotation,
    cameraY: 0,
    direction: "none",
    elapsedMs: Math.round(frame.time * 1000),
    failures: frame.failures,
    knifeCollisions: localStats.collisions,
    knifeDangerHits: localStats.dangerHits,
    knifeFailedAngles: [...frame.failedAngles],
    knifeGuestCollisions: frame.guestCollisions,
    knifeGuestDangerHits: frame.guestDangerHits,
    knifeGuestHits: frame.guestHits,
    knifeGuestTimeouts: frame.guestTimeouts,
    knifeHits: multiplayerRole ? localStats.hits : frame.insertedAngles.length,
    knifeHostCollisions: frame.hostCollisions,
    knifeHostDangerHits: frame.hostDangerHits,
    knifeHostHits: frame.hostHits,
    knifeHostTimeouts: frame.hostTimeouts,
    knifeInsertedAngles: [...frame.insertedAngles],
    knifeOvertime: frame.overtime,
    knifeShotIndex: frame.shotIndex,
    knifeTimedOutThisShot: frame.timedOutThisShot,
    knifeTimer: frame.timer ?? undefined,
    knifeTimeouts: localStats.timeouts,
    knifeWinnerRole: frame.winnerRole ?? undefined,
    progress: Number(progress.toFixed(4)),
    status: resolveKnifeCompletionStatus(frame, multiplayerRole),
    x: stageSize.width / 2,
    y: frame.flying ? (launcherY + wheelCenterY) / 2 : wheelCenterY,
  };
}

function resolveKnifeWheelAvatarView(view: KnifeViewFrame, feedbackTone: KnifeFeedbackTone): PlayerAvatarView {
  if (feedbackTone === "bad" || view.status === "failed") return { action: "hit", expression: "hurt" };
  if (view.status === "passed") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  return { action: "idle", expression: "scared" };
}

function createEndlessKnifeLevel(level: MiniGameLevelConfig, effectiveWheelIndex: number): MiniGameLevelConfig {
  const knife = getEndlessKnifeConfig({ wheelIndex: effectiveWheelIndex });
  const params: MiniGameParams = {
    ...level.params,
    baseRotationSpeed: knife.rotationSpeed,
    forbiddenZoneCount: knife.forbiddenZoneCount,
    shotCount: knife.requiredHits,
    sineRotationEnabled: knife.sineRotationChance > 0,
  };
  if (knife.countdownSeconds === null) {
    delete params.shotCountdown;
  } else {
    params.shotCountdown = knife.countdownSeconds;
  }
  return {
    ...level,
    levelId: `${level.levelId}-endless-${effectiveWheelIndex}`,
    params,
  };
}

export function KnifeHitPrototype({
  endless,
  level,
  mode,
  runSeed,
  shielded = false,
  unlimitedRespawn = false,
  multiplayerRole,
  onBackToSelect,
  onComplete,
  onRuntimeState,
  onRestart,
  remoteState,
  remoteStateSubscription,
}: {
  endless?: EndlessMiniGameRuntime;
  level: MiniGameLevelConfig;
  mode: MiniGameRunMode | "endless";
  runSeed: string;
  shielded?: boolean;
  unlimitedRespawn?: boolean;
  multiplayerRole?: "host" | "guest";
  onBackToSelect: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRuntimeState?: (state: KnifeRuntimeState) => void;
  onRestart: () => void;
  remoteState?: SelfGameState | null;
  remoteStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
}) {
  const { stageRef, stageSize } = useMiniGameStageSize<HTMLDivElement>();
  const knifeGeometry = useMemo(() => getKnifeStageGeometry(stageSize), [stageSize]);
  const isEndlessRun = Boolean(endless);
  const [endlessWheelIndex, setEndlessWheelIndex] = useState(0);
  const effectiveWheelIndex = isEndlessRun
    ? getEndlessKnifeEffectiveWheelIndex({ debugDifficulty: endless?.debugDifficulty ?? 0, wheelIndex: endlessWheelIndex })
    : 0;
  const reportEndlessDifficulty = endless?.reportDifficulty;
  const effectiveLevel = useMemo<MiniGameLevelConfig>(() => {
    if (!isEndlessRun) return level;
    return createEndlessKnifeLevel(level, effectiveWheelIndex);
  }, [effectiveWheelIndex, isEndlessRun, level]);
  const shotCount = numberParam(effectiveLevel.params, "shotCount", 6);
  const countdown = numberParam(effectiveLevel.params, "shotCountdown", 0);
  const hasCountdown = typeof effectiveLevel.params.shotCountdown === "number";
  const sineRotationEnabled = booleanParam(effectiveLevel.params, "sineRotationEnabled");
  const phaseDuration = numberParam(effectiveLevel.params, "phaseDuration", 2.8);
  const sweepPerPhase = numberParam(effectiveLevel.params, "sweepPerPhase", 405);
  const baseRotationSpeed = numberParam(effectiveLevel.params, "baseRotationSpeed", 92);
  const forbiddenArcs = useMemo<AngleArc[]>(() => generateKnifeForbiddenZones(effectiveLevel, runSeed), [effectiveLevel, runSeed]);
  const forbiddenZones = useMemo<KnifeForbiddenZone[]>(
    () => forbiddenArcs.map((zone, index) => ({ id: index, localStart: zone.start, localEnd: zone.end })),
    [forbiddenArcs],
  );
  const initialAngles = useMemo(() => generateKnifeInitialAngles(effectiveLevel, runSeed, forbiddenArcs), [effectiveLevel, forbiddenArcs, runSeed]);
  const knifeFirstOwner = useMemo(() => resolveKnifeFirstOwner(runSeed), [runSeed]);
  const timeoutRef = useRef<number | null>(null);
  const launcherReadyTimeoutRef = useRef<number | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const finishDelayTimeoutRef = useRef<number | null>(null);
  const endlessWheelAdvanceDelayTimeoutRef = useRef<number | null>(null);
  const endlessWheelSlideTimeoutRef = useRef<number | null>(null);
  const overtimeBannerTimeoutRef = useRef<number | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const initialRuntime = useMemo(() => createKnifeRuntime(initialAngles, hasCountdown, countdown), [countdown, hasCountdown, initialAngles]);
  const runtimeRef = useRef<KnifeFrame>(initialRuntime);
  const launcherVisibleRef = useRef(true);
  const lastTimerSyncRef = useRef(0);
  const lastRuntimeSyncRef = useRef(0);
  const completedRef = useRef(false);
  const lastAppliedRemoteSeqRef = useRef<number | null>(null);
  const onRuntimeStateRef = useRef<typeof onRuntimeState>(onRuntimeState);
  const endlessRef = useRef(endless);
  const isLowPowerDevice = useMiniGameLowPowerMode();
  const { fps, recordFrame } = useMiniGameFpsCounter(DEBUG_MINI_GAME_FPS);
  const [feedbackTone, setFeedbackTone] = useState<KnifeFeedbackTone>("idle");
  const [overtimeBannerVisible, setOvertimeBannerVisible] = useState(false);
  const [endlessWheelTransition, setEndlessWheelTransition] = useState<EndlessKnifeWheelTransition>({ phase: "idle", pending: null });
  const [view, setView] = useState<KnifeViewFrame>(() => makeKnifeView(initialRuntime, true));
  const endlessWheelTransitionActiveRef = useRef(false);

  const syncKnifeView = useCallback(() => {
    setView(makeKnifeView(runtimeRef.current, launcherVisibleRef.current));
  }, []);

  useEffect(() => {
    onRuntimeStateRef.current = onRuntimeState;
  }, [onRuntimeState]);

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  useEffect(() => {
    if (!isEndlessRun) return;
    reportEndlessDifficulty?.(getEndlessDifficulty({ progress: effectiveWheelIndex, maxRamp: 12 }));
  }, [effectiveWheelIndex, isEndlessRun, reportEndlessDifficulty]);

  const syncKnifeRuntimeState = useCallback(
    (time = performance.now(), force = false, options: { allowOffTurn?: boolean } = {}) => {
      if (!onRuntimeStateRef.current) return;
      const frame = runtimeRef.current;
      if (multiplayerRole && frame.status === "playing" && !isKnifeLocalTurn(frame, multiplayerRole, knifeFirstOwner) && !force && !options.allowOffTurn) return;
      if (!force && time - lastRuntimeSyncRef.current < KNIFE_MULTIPLAYER_RUNTIME_SYNC_MS) return;
      lastRuntimeSyncRef.current = time;
      onRuntimeStateRef.current(makeKnifeRuntimeState(frame, shotCount, stageSize, knifeGeometry, multiplayerRole));
    },
    [knifeFirstOwner, knifeGeometry, multiplayerRole, shotCount, stageSize],
  );

  const showKnifeFeedback = useCallback((tone: Exclude<KnifeFeedbackTone, "idle">) => {
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
    setFeedbackTone(tone);
    feedbackTimeoutRef.current = window.setTimeout(() => {
      feedbackTimeoutRef.current = null;
      setFeedbackTone("idle");
    }, KNIFE_FEEDBACK_MS);
  }, []);

  const showOvertimeBanner = useCallback(() => {
    if (overtimeBannerTimeoutRef.current !== null) window.clearTimeout(overtimeBannerTimeoutRef.current);
    setOvertimeBannerVisible(true);
    overtimeBannerTimeoutRef.current = window.setTimeout(() => {
      overtimeBannerTimeoutRef.current = null;
      setOvertimeBannerVisible(false);
    }, 900);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current);
      if (finishDelayTimeoutRef.current !== null) window.clearTimeout(finishDelayTimeoutRef.current);
      if (endlessWheelAdvanceDelayTimeoutRef.current !== null) window.clearTimeout(endlessWheelAdvanceDelayTimeoutRef.current);
      if (endlessWheelSlideTimeoutRef.current !== null) window.clearTimeout(endlessWheelSlideTimeoutRef.current);
      if (overtimeBannerTimeoutRef.current !== null) window.clearTimeout(overtimeBannerTimeoutRef.current);
      endlessWheelTransitionActiveRef.current = false;
    };
  }, []);

  const scheduleLauncherReady = useCallback(() => {
    if (launcherReadyTimeoutRef.current !== null) window.clearTimeout(launcherReadyTimeoutRef.current);
    launcherVisibleRef.current = false;
    launcherReadyTimeoutRef.current = window.setTimeout(() => {
      const current = runtimeRef.current;
      if (current.status === "playing" && !current.flying && (!multiplayerRole || isKnifeLocalTurn(current, multiplayerRole, knifeFirstOwner))) {
        launcherVisibleRef.current = true;
        syncKnifeView();
      }
      launcherReadyTimeoutRef.current = null;
    }, 60);
  }, [knifeFirstOwner, multiplayerRole, syncKnifeView]);

  const continueEndlessKnifeAfterFailure = useCallback(
    (reason: string, failedAngle?: number) => {
      const current = runtimeRef.current;
      const canContinue = endlessRef.current?.loseLife(reason) ?? false;
      if (typeof failedAngle === "number") {
        current.failedAngles.push(failedAngle);
        current.failedAngle = failedAngle;
      }
      current.failures += 1;
      current.flying = false;
      current.launcherReadyAt = current.time + 0.06;
      current.reason = reason;
      current.timer = hasCountdown ? countdown : null;
      if (canContinue) {
        current.status = "playing";
        scheduleLauncherReady();
      } else {
        current.status = "failed";
        launcherVisibleRef.current = false;
      }
      syncKnifeView();
      syncKnifeRuntimeState(performance.now(), true);
      return canContinue;
    },
    [countdown, hasCountdown, scheduleLauncherReady, syncKnifeRuntimeState, syncKnifeView],
  );

  const advanceEndlessKnifeWheel = useCallback(() => {
    if (endlessWheelTransitionActiveRef.current) return;
    const nextWheelIndex = endlessWheelIndex + 1;
    const nextEffectiveWheelIndex = getEndlessKnifeEffectiveWheelIndex({
      debugDifficulty: endlessRef.current?.debugDifficulty ?? 0,
      wheelIndex: nextWheelIndex,
    });
    const nextLevel = createEndlessKnifeLevel(level, nextEffectiveWheelIndex);
    const nextForbiddenArcs = generateKnifeForbiddenZones(nextLevel, runSeed);
    const nextInitialAngles = generateKnifeInitialAngles(nextLevel, runSeed, nextForbiddenArcs);
    const nextCountdown = numberParam(nextLevel.params, "shotCountdown", 0);
    const nextHasCountdown = typeof nextLevel.params.shotCountdown === "number";
    const nextRuntime = createKnifeRuntime(nextInitialAngles, nextHasCountdown, nextCountdown);
    const pending: PendingEndlessKnifeWheel = {
      forbiddenZones: nextForbiddenArcs.map((zone, index) => ({ id: index, localStart: zone.start, localEnd: zone.end })),
      runtime: nextRuntime,
      view: makeKnifeView(nextRuntime, true),
      wheelIndex: nextWheelIndex,
    };
    const current = runtimeRef.current;
    endlessWheelTransitionActiveRef.current = true;
    current.flying = false;
    current.timer = null;
    launcherVisibleRef.current = false;
    setEndlessWheelTransition({ phase: "waiting", pending });
    syncKnifeView();
    syncKnifeRuntimeState(performance.now(), true);

    if (endlessWheelAdvanceDelayTimeoutRef.current !== null) window.clearTimeout(endlessWheelAdvanceDelayTimeoutRef.current);
    if (endlessWheelSlideTimeoutRef.current !== null) window.clearTimeout(endlessWheelSlideTimeoutRef.current);
    endlessWheelAdvanceDelayTimeoutRef.current = window.setTimeout(() => {
      endlessWheelAdvanceDelayTimeoutRef.current = null;
      setEndlessWheelTransition({ phase: "sliding", pending });
      endlessWheelSlideTimeoutRef.current = window.setTimeout(() => {
        endlessWheelSlideTimeoutRef.current = null;
        runtimeRef.current = pending.runtime;
        setEndlessWheelIndex(pending.wheelIndex);
        launcherVisibleRef.current = true;
        completedRef.current = false;
        endlessWheelTransitionActiveRef.current = false;
        setFeedbackTone("idle");
        setView(pending.view);
        setEndlessWheelTransition({ phase: "idle", pending: null });
        syncKnifeRuntimeState(performance.now(), true);
      }, KNIFE_ENDLESS_WHEEL_SLIDE_MS);
    }, KNIFE_ENDLESS_WHEEL_ADVANCE_DELAY_MS);
  }, [endlessWheelIndex, level, runSeed, syncKnifeRuntimeState, syncKnifeView]);

  const applyRemoteKnifeState = useCallback((nextRemoteState: SelfGameState) => {
    if (!multiplayerRole) return;
    const remoteSeq = nextRemoteState.seq ?? null;
    if (remoteSeq !== null && lastAppliedRemoteSeqRef.current !== null && remoteSeq <= lastAppliedRemoteSeqRef.current) return;
    const previousShotIndex = runtimeRef.current.shotIndex;
    if (!applyKnifeRemoteState(runtimeRef.current, nextRemoteState, multiplayerRole)) return;
    lastAppliedRemoteSeqRef.current = remoteSeq;
    const current = runtimeRef.current;
    if (
      current.overtime &&
      current.winnerRole === null &&
      current.shotIndex !== previousShotIndex &&
      current.shotIndex >= shotCount &&
      (current.shotIndex - shotCount) % 2 === 0
    ) {
      showOvertimeBanner();
    }
    launcherVisibleRef.current = current.status === "playing" && isKnifeLocalTurn(current, multiplayerRole, knifeFirstOwner);
    syncKnifeView();
    if (current.status !== "playing" || isKnifeLocalTurn(current, multiplayerRole, knifeFirstOwner)) {
      syncKnifeRuntimeState(performance.now(), true, { allowOffTurn: true });
    }
  }, [knifeFirstOwner, multiplayerRole, shotCount, showOvertimeBanner, syncKnifeRuntimeState, syncKnifeView]);

  useEffect(() => {
    if (!multiplayerRole || !remoteStateSubscription) return;
    return remoteStateSubscription((nextRemoteState) => {
      applyRemoteKnifeState(nextRemoteState);
    });
  }, [applyRemoteKnifeState, multiplayerRole, remoteStateSubscription]);

  useEffect(() => {
    if (!multiplayerRole || !remoteState || remoteStateSubscription) return;
    applyRemoteKnifeState(remoteState);
  }, [applyRemoteKnifeState, multiplayerRole, remoteState, remoteStateSubscription]);

  const resolveShot = useCallback(() => {
    if (endlessWheelTransitionActiveRef.current) return;
    const current = runtimeRef.current;
    if (current.status !== "playing") return;
    const impactAngle = getLocalHitAngle(knifeGeometry.fireAngle, current.rotation);
    const outcome = resolveKnifeShotOutcome({
      collisionDegrees: KNIFE_COLLISION_DEGREES,
      forbiddenZones: forbiddenArcs,
      impactAngle,
      initialAngles: current.initialAngles,
      insertedAngles: [...current.insertedAngles, ...current.failedAngles],
    });

    if (outcome.kind === "collision") {
      showKnifeFeedback("bad");
      if (isEndlessRun) {
        continueEndlessKnifeAfterFailure("collision", outcome.impactAngle);
        return;
      }
      if (multiplayerRole) {
        current.failedAngles.push(outcome.impactAngle);
        current.failedAngle = outcome.impactAngle;
        current.flying = false;
        current.launcherReadyAt = current.time + 0.06;
        current.reason = "未安全插中";
        current.shotIndex += 1;
        const settlement = settleKnifeTurnBasedShot(current, shotCount, hasCountdown, countdown);
        if (settlement.showOvertimeBanner) showOvertimeBanner();
        if (current.status === "playing") scheduleLauncherReady();
        else launcherVisibleRef.current = false;
        syncKnifeView();
        syncKnifeRuntimeState(performance.now(), true);
        return;
      }
      if (mode === "base" || unlimitedRespawn) {
        const nextShotIndex = current.shotIndex + 1;
        const nextFailures = current.failures + 1;
        current.failedAngles.push(outcome.impactAngle);
        current.failedAngle = outcome.impactAngle;
        current.failures = nextFailures;
        current.flying = false;
        current.launcherReadyAt = current.time + 0.06;
        current.reason = "撞到已插入长条";
        current.shotIndex = nextShotIndex;
        if (unlimitedRespawn) {
          current.status = nextShotIndex >= shotCount ? "passed" : "playing";
        } else {
          current.status = nextShotIndex >= shotCount ? "failed" : "playing";
        }
        current.timer = hasCountdown ? countdown : null;
        if (current.status === "playing") scheduleLauncherReady();
        else launcherVisibleRef.current = false;
        syncKnifeView();
        syncKnifeRuntimeState(performance.now(), true);
        return;
      }
      current.failedAngles.push(outcome.impactAngle);
      current.failedAngle = outcome.impactAngle;
      current.flying = false;
      current.status = "failed";
      current.reason = "撞到已插入长条";
      launcherVisibleRef.current = false;
      syncKnifeView();
      syncKnifeRuntimeState(performance.now(), true);
      return;
    }
    if (outcome.kind === "forbidden") {
      showKnifeFeedback("bad");
      if (isEndlessRun) {
        continueEndlessKnifeAfterFailure("forbidden", outcome.impactAngle);
        return;
      }
      if (multiplayerRole) {
        current.failedAngles.push(outcome.impactAngle);
        current.failedAngle = outcome.impactAngle;
        current.flying = false;
        current.launcherReadyAt = current.time + 0.06;
        current.reason = "未安全插中";
        current.shotIndex += 1;
        const settlement = settleKnifeTurnBasedShot(current, shotCount, hasCountdown, countdown);
        if (settlement.showOvertimeBanner) showOvertimeBanner();
        if (current.status === "playing") scheduleLauncherReady();
        else launcherVisibleRef.current = false;
        syncKnifeView();
        syncKnifeRuntimeState(performance.now(), true);
        return;
      }
      if (mode === "base" || unlimitedRespawn) {
        const nextShotIndex = current.shotIndex + 1;
        const nextFailures = current.failures + 1;
        current.failedAngles.push(outcome.impactAngle);
        current.failedAngle = outcome.impactAngle;
        current.failures = nextFailures;
        current.flying = false;
        current.launcherReadyAt = current.time + 0.06;
        current.reason = "命中危险区域";
        current.shotIndex = nextShotIndex;
        if (unlimitedRespawn) {
          current.status = nextShotIndex >= shotCount ? "passed" : "playing";
        } else {
          current.status = nextShotIndex >= shotCount ? "failed" : "playing";
        }
        current.timer = hasCountdown ? countdown : null;
        if (current.status === "playing") scheduleLauncherReady();
        else launcherVisibleRef.current = false;
        syncKnifeView();
        syncKnifeRuntimeState(performance.now(), true);
        return;
      }
      current.failedAngles.push(outcome.impactAngle);
      current.failedAngle = outcome.impactAngle;
      current.flying = false;
      current.status = "failed";
      current.reason = "命中危险区域";
      launcherVisibleRef.current = false;
      syncKnifeView();
      syncKnifeRuntimeState(performance.now(), true);
      return;
    }

    const nextShotIndex = current.shotIndex + 1;
    const proximityDegrees = getKnifeHitDangerProximityDegrees({
      collisionDegrees: KNIFE_COLLISION_DEGREES,
      forbiddenZones: forbiddenArcs,
      impactAngle: outcome.impactAngle,
      initialAngles: current.initialAngles,
      insertedAngles: [...current.insertedAngles, ...current.failedAngles],
    });
    current.insertedAngles.push(outcome.impactAngle);
    endlessRef.current?.addScore(1);
    if (isEndlessRun && proximityDegrees !== null && proximityDegrees <= ENDLESS_KNIFE_DANGER_MARGIN_DEGREES) {
      endlessRef.current?.awardSpecialBonus("极限飞刀！");
    }
    current.flying = false;
    current.shotIndex = nextShotIndex;
    if (multiplayerRole) {
      const owner = resolveKnifeTurnOwner(nextShotIndex - 1, knifeFirstOwner);
      addKnifeOwnerStat(current, owner, "hit");
      const settlement = settleKnifeTurnBasedShot(current, shotCount, hasCountdown, countdown);
      if (settlement.showOvertimeBanner) showOvertimeBanner();
      if (current.status === "playing") {
        showKnifeFeedback("good");
        current.launcherReadyAt = current.time + 0.06;
        scheduleLauncherReady();
      } else {
        launcherVisibleRef.current = false;
        showKnifeFeedback("good");
      }
      syncKnifeView();
      syncKnifeRuntimeState(performance.now(), true);
      return;
    }
    if (isEndlessRun && current.insertedAngles.length >= shotCount) {
      showKnifeFeedback("good");
      if (current.failures === 0) {
        endlessRef.current?.awardSpecialBonus({ label: "完美击破！", amount: 5 });
      }
      launcherVisibleRef.current = false;
      advanceEndlessKnifeWheel();
      return;
    }

    if (nextShotIndex >= shotCount) {
      current.status = current.failures > 0 && mode === "base" && !unlimitedRespawn ? "failed" : "passed";
      current.reason = `全部 ${shotCount} 发命中`;
      launcherVisibleRef.current = false;
      showKnifeFeedback(current.status === "passed" ? "good" : "bad");
      syncKnifeView();
      syncKnifeRuntimeState(performance.now(), true);
      return;
    }

    showKnifeFeedback("good");
    current.launcherReadyAt = current.time + 0.06;
    current.timer = hasCountdown ? countdown : null;
    scheduleLauncherReady();
    syncKnifeView();
    syncKnifeRuntimeState(performance.now(), true);
  }, [advanceEndlessKnifeWheel, continueEndlessKnifeAfterFailure, countdown, forbiddenArcs, hasCountdown, isEndlessRun, knifeFirstOwner, knifeGeometry.fireAngle, mode, multiplayerRole, scheduleLauncherReady, shotCount, showKnifeFeedback, showOvertimeBanner, syncKnifeRuntimeState, syncKnifeView, unlimitedRespawn]);

  const launch = useCallback(() => {
    if (endlessWheelTransitionActiveRef.current) return;
    const current = runtimeRef.current;
    if (current.status !== "playing" || current.flying) return;
    if (multiplayerRole && !isKnifeLocalTurn(current, multiplayerRole, knifeFirstOwner)) return;
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (launcherReadyTimeoutRef.current !== null) window.clearTimeout(launcherReadyTimeoutRef.current);
    launcherReadyTimeoutRef.current = null;
    current.flying = true;
    launcherVisibleRef.current = true;
    syncKnifeView();
    syncKnifeRuntimeState(performance.now(), true);
    timeoutRef.current = window.setTimeout(() => {
      resolveShot();
      timeoutRef.current = null;
    }, KNIFE_FLIGHT_MS);
  }, [knifeFirstOwner, multiplayerRole, resolveShot, syncKnifeRuntimeState, syncKnifeView]);

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
        syncKnifeRuntimeState(time, true);
        return;
      }

      const knifeFocusTimeScale = endlessRef.current?.getActiveSkill()?.kind === "knife-focus" ? KNIFE_FOCUS_TIME_SCALE : 1;
      const skillDelta = delta * knifeFocusTimeScale;
      const rotationSpeed = sineRotationEnabled ? getSineAngularVelocity(current.time, phaseDuration, sweepPerPhase) : baseRotationSpeed;
      const nextTime = current.time + skillDelta;
      current.time = nextTime;
      current.rotation = normalizeDegrees(current.rotation + rotationSpeed * skillDelta);
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${current.rotation}deg)`;

      let shouldSync = false;
      if (current.timer !== null && !current.flying && (!multiplayerRole || isKnifeLocalTurn(current, multiplayerRole, knifeFirstOwner))) {
        current.timer -= skillDelta;
        if (current.timer <= 0) {
          showKnifeFeedback("bad");
          if (multiplayerRole) {
            const owner = resolveKnifeTurnOwner(current.shotIndex, knifeFirstOwner);
            if (!current.timedOutThisShot) {
              addKnifeOwnerStat(current, owner, "timeout");
              current.failures += 1;
              current.reason = "倒计时结束，仍需发射";
              current.timer = null;
              current.timedOutThisShot = true;
              current.launcherReadyAt = nextTime;
              launcherVisibleRef.current = true;
            }
          } else if (isEndlessRun) {
            continueEndlessKnifeAfterFailure("timeout");
          } else if (mode === "base") {
            const nextShotIndex = current.shotIndex + 1;
            current.failures += 1;
            current.launcherReadyAt = nextTime + 0.06;
            current.reason = "倒计时结束";
            current.shotIndex = nextShotIndex;
            current.status = nextShotIndex >= shotCount ? "failed" : "playing";
            current.timer = hasCountdown ? countdown : null;
            if (current.status === "playing") scheduleLauncherReady();
            else launcherVisibleRef.current = false;
          } else if (unlimitedRespawn) {
            const nextShotIndex = current.shotIndex + 1;
            current.failures += 1;
            current.launcherReadyAt = nextTime + 0.06;
            current.reason = "倒计时结束";
            current.shotIndex = nextShotIndex;
            current.status = nextShotIndex >= shotCount ? "passed" : "playing";
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
      syncKnifeRuntimeState(time);
      if (current.status === "playing") {
        frameId = requestAnimationFrame(tick);
        return;
      }
      syncKnifeRuntimeState(time, true);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (launcherReadyTimeoutRef.current !== null) window.clearTimeout(launcherReadyTimeoutRef.current);
    };
  }, [baseRotationSpeed, continueEndlessKnifeAfterFailure, countdown, hasCountdown, isEndlessRun, knifeFirstOwner, mode, multiplayerRole, phaseDuration, recordFrame, scheduleLauncherReady, shotCount, showKnifeFeedback, sineRotationEnabled, sweepPerPhase, syncKnifeRuntimeState, syncKnifeView, unlimitedRespawn]);

  const isEndlessWheelTransitioning = endlessWheelTransition.phase !== "idle";
  const remaining = isEndlessWheelTransitioning ? 0 : view.status === "playing" && view.shotIndex >= shotCount ? 1 : Math.max(0, shotCount - view.shotIndex);
  const localTurn = multiplayerRole ? isKnifeLocalTurn(view, multiplayerRole, knifeFirstOwner) : true;
  const overtimeRoundLabel = formatKnifeOvertimeRoundLabel(view.shotIndex, shotCount);
  const showLauncher = view.status === "playing" && (view.flying || view.launcherVisible) && !isEndlessWheelTransitioning;
  const showOverlay = mode === "prototype";
  const stageStyle = {
    "--knife-flight-distance": `${knifeGeometry.flightDistance}px`,
    "--knife-launcher-bottom": `${knifeGeometry.launcherBottom}px`,
    "--knife-wheel-top": `${knifeGeometry.wheelTop}px`,
  } as CSSProperties;

  useEffect(() => {
    const completionStatus = resolveKnifeCompletionStatus(runtimeRef.current, multiplayerRole);
    if (!onComplete || completedRef.current || completionStatus === "playing") return;
    completedRef.current = true;
    const latest = runtimeRef.current;
    const localStats = multiplayerRole ? knifeOwnerStats(latest, multiplayerRole) : {
      collisions: latest.failures,
      dangerHits: 0,
      hits: latest.insertedAngles.length,
      timeouts: 0,
    };
    finishDelayTimeoutRef.current = window.setTimeout(() => {
      finishDelayTimeoutRef.current = null;
      onComplete({
        gameId: "knife",
        levelId: level.levelId,
        status: completionStatus,
        reason: latest.reason,
        elapsedMs: Math.round(latest.time * 1000),
        stats: {
          failures: latest.failures,
          collisions: localStats.collisions,
          dangerHits: localStats.dangerHits,
          hits: localStats.hits,
          shotCount,
          fired: latest.shotIndex,
          timeouts: localStats.timeouts,
          forcedAdvance: mode === "base" && view.status === "failed",
        },
      });
    }, KNIFE_FINISH_DELAY_MS);
  }, [level.levelId, mode, multiplayerRole, onComplete, shotCount, view.status]);

  const showKnifeMiniScore = !isEndlessRun;
  const currentWheelPanelClass = endlessWheelTransition.phase === "sliding" ? "exiting" : "current";
  const renderKnifeWheelPanel = (
    wheelView: KnifeViewFrame,
    wheelForbiddenZones: KnifeForbiddenZone[],
    panelClassName: string,
    attachWheelRef = false,
  ) => {
    const panelFeedbackTone = panelClassName === "entering" ? "idle" : feedbackTone;
    const avatarView = resolveKnifeWheelAvatarView(wheelView, panelFeedbackTone);

    return (
      <div className={`knife-wheel-panel ${panelClassName}`} aria-hidden={panelClassName === "current" ? undefined : true}>
        <div className="knife-wheel" ref={attachWheelRef ? wheelRef : undefined} style={{ transform: `rotate(${wheelView.rotation}deg)` }}>
          <svg className="knife-wheel-svg" viewBox={`0 0 ${KNIFE_WHEEL_SIZE} ${KNIFE_WHEEL_SIZE}`} aria-hidden="true">
            <circle cx={KNIFE_WHEEL_SIZE / 2} cy={KNIFE_WHEEL_SIZE / 2} r={KNIFE_WHEEL_SIZE / 2 - 3} />
            {wheelForbiddenZones.map((zone) => (
              <path d={knifeSectorPath(zone)} key={zone.id} />
            ))}
          </svg>
          <div className="knife-wheel-avatar" aria-hidden="true">
            <PlayerAvatar
              {...avatarView}
              effect={shielded ? "shield" : avatarView.effect}
              size={42}
              visualScale={0.88}
            />
          </div>
          {wheelView.initialAngles.map((angle) => (
            <span className="knife-arrow knife-stuck initial" key={`initial-${angle}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
          ))}
          {wheelView.insertedAngles.map((angle, index) => (
            <span className="knife-arrow knife-stuck" key={`${angle}-${index}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
          ))}
          {wheelView.failedAngles.map((angle, index) => (
            <span className="knife-arrow knife-stuck failed" key={`failed-${angle}-${index}`} style={{ transform: `rotate(${angle}deg) translateX(${KNIFE_INSERT_RADIUS}px)` }} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="prototype-game-wrap">
      {showKnifeMiniScore ? (
        <div className="mini-score">
          <span>{view.overtime ? overtimeRoundLabel : `已发射 ${view.shotIndex}/${shotCount}`}</span>
          {mode === "base" ? <span>命中 {view.insertedAngles.length}/{shotCount}</span> : null}
          {multiplayerRole ? <span>{localTurn ? "你的回合" : "对方回合"}</span> : null}
          {hasCountdown ? <span>倒计时 {(view.timer ?? 0).toFixed(1)}s</span> : null}
        </div>
      ) : null}
      <div
        className={`prototype-stage knife-stage feedback-${feedbackTone} ${view.flying ? "firing" : ""} ${remaining === 1 ? "final-shot-ready" : ""} ${isEndlessWheelTransitioning ? "wheel-transitioning" : ""} ${isLowPowerDevice ? "low-power" : ""} ${DEBUG_MINI_GAME_HITBOX ? "debug-hitbox" : ""}`}
        ref={stageRef}
        role="button"
        style={stageStyle}
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
        <DifficultyWaveBackdrop />
        <MiniGameFpsBadge fps={fps} />
        <div className="knife-wheel-wrap">
          {renderKnifeWheelPanel(view, forbiddenZones, currentWheelPanelClass, true)}
          {endlessWheelTransition.phase === "sliding" && endlessWheelTransition.pending
            ? renderKnifeWheelPanel(endlessWheelTransition.pending.view, endlessWheelTransition.pending.forbiddenZones, "entering")
            : null}
        </div>
        {hasCountdown && !isEndlessWheelTransitioning ? <div className="knife-countdown-ghost" aria-hidden="true">{Math.ceil(Math.max(0, view.timer ?? 0))}</div> : null}
        {multiplayerRole ? <div className="knife-turn-ghost" aria-hidden="true">{localTurn ? "你的回合" : "对方回合"}</div> : null}
        {overtimeBannerVisible ? <div className="knife-overtime-banner" role="status">{overtimeRoundLabel}</div> : null}
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
