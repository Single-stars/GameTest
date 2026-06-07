"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { PlayerAvatar, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { type EndlessActiveSkill, type EndlessMiniGameRuntime } from "@/features/mini-games/common";
import { DifficultyWaveBackdrop } from "@/features/visuals/difficulty-wave-backdrop";
import {
  getAdvancedBrakeDangerLeft,
  getAdvancedBrakeEventOptions,
  getAdvancedBrakeHasReachedFinish,
  getAdvancedBrakeRuleHint,
  getAdvancedBrakeReleaseOutcome,
  getAdvancedBrakeSchedulerStep,
  isAdvancedBrakeRuleDangerEvent,
  isAdvancedBrakeFakeEvent,
  pickAdvancedBrakeEvent,
  shouldForceAdvancedBrakeRuleDangerEvent,
  shouldForceAdvancedBrakeFakeEvent,
  type AdvancedBrakeAction,
  type AdvancedBrakeEvent,
  type AdvancedStageConfig,
} from "@/lib/advanced-challenges";
import { getEndlessBrakingConfig, getEndlessDifficulty, getEndlessReusableStageConfig } from "@/lib/endless-mode";
import { DINO_SAFE_STOP_WINDOW_MS, resolveDinoStop } from "@/lib/scoring";
import {
  clamp,
  getParamBoolean,
  getParamNumber,
  now,
  pointerKind,
  rand,
  ROUND_SETTLEMENT_DELAY_MS,
  trial,
  type RoundProps,
  type TrialEvent,
} from "@/features/rounds/native/shared";

type AdvancedBrakeHazard = {
  x: number;

  top: AdvancedBrakeEvent["top"];

  bottom: AdvancedBrakeEvent["bottom"];

  correctAction: AdvancedBrakeAction;

};

type AdvancedBrakeBumpedHazard = AdvancedBrakeHazard & {
  id: number;
  rotationDeg: number;
};
type AdvancedBrakingShockwave = {
  id: number;
  x: number;
};

type AdvancedBrakingFeedback = "idle" | "success" | "early" | "crashed";
type AdvancedBrakingRuleZoneState = "normal" | "entering" | "active" | "exiting";
type AdvancedBrakingRulePortal = {
  x: number;
  targetState: AdvancedBrakingRuleZoneState;
};
type EndlessBrakingRuleTaleKind =
  | "all-fake"
  | "top-red-only"
  | "bottom-red-only"
  | "double-red-only"
  | "fake-only"
  | "top-fake-only"
  | "bottom-fake-only";
type EndlessBrakingRuleTale = {
  kind: EndlessBrakingRuleTaleKind;
  text: string;
};

const ENDLESS_BRAKE_RUNNER_LEFT_PERCENT = 16;
const ENDLESS_BRAKING_FAST_REACTION_MS = 150;
const ENDLESS_BIG_LUCK_SPEED_MULTIPLIER = 2;
const ENDLESS_BIG_LUCK_HAZARD_FREQUENCY_MULTIPLIER = 3.2;
const ENDLESS_BIG_LUCK_RECOVERY_EVENT_DELAY_MS = 1300;
const ENDLESS_BRAKING_CLEAR_SPAWN_LOCK_MS = 1000;
const ENDLESS_BRAKING_LEVEL_10_REACTION_WINDOW_MS = 420;
const ENDLESS_BRAKING_RULE_ZONE_MIN_DIFFICULTY = 0.48;
const ENDLESS_BRAKING_RULE_PORTAL_DISTANCE = 118;
const ENDLESS_BRAKING_RULE_ZONE_DISTANCE = 520;
const ENDLESS_BRAKING_RULE_ZONE_COOLDOWN_DISTANCE = 260;
const ENDLESS_BRAKING_RULE_TALES: EndlessBrakingRuleTale[] = [
  { kind: "all-fake", text: "规则：红色真危险和灰色假危险都不用松手" },
  { kind: "top-red-only", text: "规则：只有上轨单独出现红色真危险时松手" },
  { kind: "bottom-red-only", text: "规则：只有下轨单独出现红色真危险时松手" },
  { kind: "double-red-only", text: "规则：只有上下双轨同时出现红色真危险时松手" },
  { kind: "fake-only", text: "规则：只有上下双轨同时出现灰色假危险时松手" },
  { kind: "top-fake-only", text: "规则：只有上轨单独出现灰色假危险时松手" },
  { kind: "bottom-fake-only", text: "规则：只有下轨单独出现灰色假危险时松手" },
];

const ENDLESS_BRAKING_RULE_CASES: AdvancedBrakeEvent[] = [
  { top: "red", bottom: null },
  { top: null, bottom: "red" },
  { top: "red", bottom: "red" },
  { top: "gray", bottom: null },
  { top: null, bottom: "gray" },
  { top: "gray", bottom: "gray" },
  { top: "red", bottom: "gray" },
  { top: "gray", bottom: "red" },
];

function getAdvancedBrakingSpeedMultiplier(activeSkill: EndlessActiveSkill | null | undefined) {
  return activeSkill?.kind === "big-luck" ? ENDLESS_BIG_LUCK_SPEED_MULTIPLIER : 1;
}

function resolveAdvancedBrakingReactionWindowMs(baseReactionWindowMs: number, speedMultiplier: number) {
  return Math.max(80, Math.round(baseReactionWindowMs / Math.max(1, speedMultiplier)));
}

function resolveEndlessBrakingReactionWindowMs(baseReactionWindowMs: number, difficulty: number, speedMultiplier: number) {
  const rampedReactionWindowMs = Math.round(baseReactionWindowMs + (ENDLESS_BRAKING_LEVEL_10_REACTION_WINDOW_MS - baseReactionWindowMs) * clamp(difficulty, 0, 1));
  return resolveAdvancedBrakingReactionWindowMs(rampedReactionWindowMs, speedMultiplier);
}

function isEndlessBrakingSameEvent(left: AdvancedBrakeEvent, right: AdvancedBrakeEvent) {
  return left.top === right.top && left.bottom === right.bottom;
}

function endlessBrakingEventKey(event: AdvancedBrakeEvent & { correctAction?: AdvancedBrakeAction }) {
  return `${event.top ?? "none"}:${event.bottom ?? "none"}:${event.correctAction ?? "unknown"}`;
}

function filterRecentEndlessBrakingEventOptions<T extends AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }>(
  options: T[],
  recentKeys: string[],
) {
  const filtered = options.filter((event) => !recentKeys.includes(endlessBrakingEventKey(event)));
  return filtered.length > 0 ? filtered : options;
}

function resolveEndlessBrakingRuleTaleAction(rule: EndlessBrakingRuleTale, event: AdvancedBrakeEvent): AdvancedBrakeAction {
  const releaseCase: AdvancedBrakeEvent | null =
    rule.kind === "top-red-only"
      ? { top: "red", bottom: null }
      : rule.kind === "bottom-red-only"
        ? { top: null, bottom: "red" }
        : rule.kind === "double-red-only"
          ? { top: "red", bottom: "red" }
          : rule.kind === "fake-only"
            ? { top: "gray", bottom: "gray" }
            : rule.kind === "top-fake-only"
              ? { top: "gray", bottom: null }
              : rule.kind === "bottom-fake-only"
                ? { top: null, bottom: "gray" }
                : null;
  return releaseCase && isEndlessBrakingSameEvent(releaseCase, event) ? "release" : "hold";
}

function getEndlessBrakingRuleTaleReleaseCaseCount(rule: EndlessBrakingRuleTale) {
  return ENDLESS_BRAKING_RULE_CASES.filter((event) => resolveEndlessBrakingRuleTaleAction(rule, event) === "release").length;
}

if (!ENDLESS_BRAKING_RULE_TALES.every((rule) => getEndlessBrakingRuleTaleReleaseCaseCount(rule) <= 1)) {
  throw new Error("Each endless braking rule tale must map to at most one release case.");
}

function getEndlessBrakingEventOptions(rule: EndlessBrakingRuleTale, difficulty: number): Array<AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }> {
  const grayFakeChance = clamp((difficulty - 0.18) / 0.42, 0, 1);
  const redOptions: AdvancedBrakeEvent[] = [
    { top: "red", bottom: null },
    { top: null, bottom: "red" },
    { top: "red", bottom: "red" },
  ];
  const fakeOptions: AdvancedBrakeEvent[] = grayFakeChance > 0
    ? [
        { top: "gray", bottom: null },
        { top: null, bottom: "gray" },
        { top: "gray", bottom: "gray" },
        { top: "red", bottom: "gray" },
        { top: "gray", bottom: "red" },
      ]
    : [];
  const releaseOption = ENDLESS_BRAKING_RULE_CASES.find((event) => resolveEndlessBrakingRuleTaleAction(rule, event) === "release");
  const mergedOptions = [...redOptions, ...fakeOptions];
  if (releaseOption && !mergedOptions.some((event) => isEndlessBrakingSameEvent(event, releaseOption))) {
    mergedOptions.push(releaseOption);
  }
  return mergedOptions.map((event) => ({ ...event, correctAction: resolveEndlessBrakingRuleTaleAction(rule, event) }));
}

function getEndlessBrakingExternalEventOptions(
  level: number,
  difficulty: number,
  context: { eventIndex?: number; eventCount?: number; previousEvent?: AdvancedBrakeEvent | null },
) {
  const grayFakeChance = clamp((difficulty - 0.22) / 0.38, 0, 1);
  const baseOptions = getAdvancedBrakeEventOptions(level, context);
  if (grayFakeChance <= 0) return baseOptions;
  const fakeOptions: Array<AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }> = [
    { top: "gray", bottom: null, correctAction: "hold" },
    { top: null, bottom: "gray", correctAction: "hold" },
    { top: "gray", bottom: "gray", correctAction: "hold" },
  ];
  return [...baseOptions, ...fakeOptions.slice(0, Math.max(1, Math.ceil(grayFakeChance * fakeOptions.length)))];
}

function hasAdvancedBrakingHazardReachedRunner({
  hazard,
  runnerLeftPercent,
  runnerWidthPercent,
}: {
  hazard: AdvancedBrakeHazard;
  runnerLeftPercent: number;
  runnerWidthPercent: number;
}) {
  return hazard.x <= runnerLeftPercent + runnerWidthPercent;
}

function hasAdvancedBrakingRulePortalReachedRunner({
  portal,
  runnerLeftPercent,
  runnerWidthPercent,
}: {
  portal: AdvancedBrakingRulePortal;
  runnerLeftPercent: number;
  runnerWidthPercent: number;
}) {
  return portal.x <= runnerLeftPercent + runnerWidthPercent;
}

function pickEndlessBrakingRuleTale() {
  return ENDLESS_BRAKING_RULE_TALES[Math.floor(Math.random() * ENDLESS_BRAKING_RULE_TALES.length)] ?? ENDLESS_BRAKING_RULE_TALES[0];
}

function pickEndlessBrakingRuleHint(rule = pickEndlessBrakingRuleTale()) {
  return rule.text;
}

function resolveAdvancedBrakingEventDelayMs({
  distance,
  endless,
  maxEventDelayMs,
  minEventDelayMs,
}: {
  distance: number;
  endless?: EndlessMiniGameRuntime;
  maxEventDelayMs: number;
  minEventDelayMs: number;
}) {
  const baseDelayMs = endless
    ? getEndlessBrakingConfig({ distance }).obstacleIntervalMs
    : rand(minEventDelayMs, maxEventDelayMs);
  const bigLuckActive = endless?.getActiveSkill()?.kind === "big-luck";
  return baseDelayMs / (bigLuckActive ? ENDLESS_BIG_LUCK_HAZARD_FREQUENCY_MULTIPLIER : 1);
}

function resolveAdvancedBrakingLaneCount(config: AdvancedStageConfig) {
  const configuredLanes = getParamNumber(config, "lanes", 1);
  const dualRule = config.params.dualRule;
  if (dualRule === "single-red-stop" || dualRule === "double-red-stop" || config.level === 10) {
    return Math.max(2, configuredLanes);
  }
  return configuredLanes;
}

function isAdvancedBrakingRuleZoneActive(brakingRuleZoneState: AdvancedBrakingRuleZoneState) {
  return brakingRuleZoneState === "active" || brakingRuleZoneState === "exiting";
}

function getAdvancedBrakingRuleZoneConfig({
  brakingRuleZoneState,
  config,
  endless,
  endlessDifficulty,
}: {
  brakingRuleZoneState: AdvancedBrakingRuleZoneState;
  config: AdvancedStageConfig;
  endless?: EndlessMiniGameRuntime;
  endlessDifficulty: number;
}) {
  if (!endless || !isAdvancedBrakingRuleZoneActive(brakingRuleZoneState)) return config;
  return getEndlessReusableStageConfig({ difficulty: endlessDifficulty, roundId: "braking" }).sourceConfig;
}

function shouldAdvancedBrakingUseRuleZone({
  brakingRuleZoneState,
  distanceSinceRuleZoneChange,
  endlessDifficulty,
  hazard,
  rulePortal,
}: {
  brakingRuleZoneState: AdvancedBrakingRuleZoneState;
  distanceSinceRuleZoneChange: number;
  endlessDifficulty: number;
  hazard: AdvancedBrakeHazard | null;
  rulePortal: AdvancedBrakingRulePortal | null;
}) {
  return (
    brakingRuleZoneState === "normal" &&
    distanceSinceRuleZoneChange >= ENDLESS_BRAKING_RULE_ZONE_COOLDOWN_DISTANCE &&
    endlessDifficulty >= ENDLESS_BRAKING_RULE_ZONE_MIN_DIFFICULTY &&
    !hazard &&
    !rulePortal
  );
}

function resolveAdvancedBrakingAvatarView(holding: boolean, feedback: AdvancedBrakingFeedback): PlayerAvatarView {
  if (feedback === "success") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (feedback === "crashed") return { action: "hit", expression: "hurt" };
  if (feedback === "early") return { action: "hit", expression: "hurt" };
  if (holding) return { action: "move", expression: "neutral" };
  return { action: "idle", expression: "neutral" };
}

export function AdvancedBrakingRound({ advancedConfig, damageInvincible = false, endless, onComplete, paused = false, shielded = false }: RoundProps) {

  const config = advancedConfig!;

  const endlessDifficulty = endless ? Math.max(getEndlessDifficulty({ maxRamp: 36 * 110, progress: endless.score }), endless.debugDifficulty) : 0;

  const initialLaneCount = resolveAdvancedBrakingLaneCount(config);

  const eventCountMin = getParamNumber(config, "eventCountMin", getParamNumber(config, "hazardCount", 2));

  const eventCountMax = getParamNumber(config, "eventCountMax", eventCountMin);

  const reactionWindowMs = getParamNumber(config, "reactionWindowMs", 340);

  const eventDurationMs = getParamNumber(config, "eventDurationMs", 600);

  const grayHoldMs = getParamNumber(config, "grayHoldMs", eventDurationMs);

  const minEventDelayMs = getParamNumber(config, "minEventDelayMs", 900);

  const maxEventDelayMs = getParamNumber(config, "maxEventDelayMs", 1500);

  const speedPerSecond = getParamNumber(config, "speedPerSecond", 10);

  const finishSafeDistance = getParamNumber(config, "finishSafeDistance", 12);
  const allowGray = getParamBoolean(config, "allowGray", false);
  const ruleHint = getAdvancedBrakeRuleHint(config.level, config.params.dualRule);
  const [activeRuleHint, setActiveRuleHint] = useState<string | null>(endless ? null : ruleHint);
  const [activeLaneCount, setActiveLaneCount] = useState(initialLaneCount);
  const [brakingRuleZoneState, setBrakingRuleZoneState] = useState<AdvancedBrakingRuleZoneState>("normal");
  const [rulePortal, setRulePortal] = useState<AdvancedBrakingRulePortal | null>(null);

  const eventCountTarget = useMemo(

    () => Math.floor(rand(eventCountMin, eventCountMax + 1)),

    [eventCountMax, eventCountMin],

  );

  const activeEventCountTarget = endless ? Number.POSITIVE_INFINITY : eventCountTarget;

  const initialEventDelayMs = useMemo(
    () => resolveAdvancedBrakingEventDelayMs({
      distance: endless?.score ?? 0,
      endless,
      maxEventDelayMs,
      minEventDelayMs,
    }),
    [endless, maxEventDelayMs, minEventDelayMs],
  );

  const [progress, setProgress] = useState(endless ? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0);

  const [holding, setHolding] = useState(false);

  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);
  const [bumpedHazards, setBumpedHazards] = useState<AdvancedBrakeBumpedHazard[]>([]);
  const [shockwaves, setShockwaves] = useState<AdvancedBrakingShockwave[]>([]);

  const progressRef = useRef(endless ? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0);
  const endlessDistanceRef = useRef(0);
  const pausedRef = useRef(paused);

  const holdingRef = useRef(false);

  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);

  const hazardShownAtRef = useRef<number | null>(null);

  const eventTimerRef = useRef(initialEventDelayMs);

  const hazardIndexRef = useRef(0);

  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);
  const fakeEventUsedRef = useRef(false);
  const ruleDangerEventUsedRef = useRef(false);
  const brakingRuleZoneStateRef = useRef<AdvancedBrakingRuleZoneState>("normal");
  const rulePortalRef = useRef<AdvancedBrakingRulePortal | null>(null);
  const ruleZoneStartedAtRef = useRef(0);
  const ruleZoneSkillRef = useRef<EndlessActiveSkill | null>(null);
  const ruleZoneHintRef = useRef<string | null>(null);
  const activeRuleTaleRef = useRef<EndlessBrakingRuleTale | null>(null);
  const recentEndlessHazardKeysRef = useRef<string[]>([]);
  const bigLuckRunningRef = useRef(false);
  const bigLuckRecoveryDelayPendingRef = useRef(false);
  const spawnLockedUntilRef = useRef(0);
  const pointerCaptureRef = useRef<{ element: HTMLDivElement; pointerId: number } | null>(null);

  const trialsRef = useRef<TrialEvent[]>([]);

  const frameRef = useRef<number | null>(null);

  const lastFrameAtRef = useRef(0);

  const collisionTimerRef = useRef<number | null>(null);

  const holdSuccessTimerRef = useRef<number | null>(null);

  const feedbackTimerRef = useRef<number | null>(null);

  const finishedRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const bumpedHazardIdRef = useRef(0);
  const bumpedHazardTimersRef = useRef<number[]>([]);
  const shockwaveIdRef = useRef(0);
  const shockwaveTimersRef = useRef<number[]>([]);
  const endlessRef = useRef(endless);

  const trackRef = useRef<HTMLDivElement | null>(null);

  const syncEndlessWaveParallax = useCallback((distance: number) => {
    const panel = trackRef.current?.closest(".advanced-braking") as HTMLElement | null;
    const groundOffsetPx = trackRef.current ? (distance * -trackRef.current.clientWidth) / 100 : 0;
    panel?.style.setProperty("--difficulty-wave-parallax-x", `${Math.round(distance * -3.2)}`);
    panel?.style.setProperty("--difficulty-wave-parallax-y", `${Math.round(Math.sin(distance / 90) * 18)}`);
    panel?.style.setProperty("--advanced-brake-ground-offset", `${groundOffsetPx}px`);
  }, []);

  const [advancedFeedback, setAdvancedFeedback] = useState<AdvancedBrakingFeedback>("idle");

  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const ruleZoneConfig = endless
      ? getEndlessReusableStageConfig({ difficulty: endlessDifficulty, roundId: "braking" }).sourceConfig
      : config;
    const ruleZoneActive = isAdvancedBrakingRuleZoneActive(brakingRuleZoneState);
    const activeConfig = getAdvancedBrakingRuleZoneConfig({
      brakingRuleZoneState,
      config,
      endless,
      endlessDifficulty,
    });
    const nextRuleHint = endless
      ? ruleZoneActive
        ? ruleZoneHintRef.current ?? activeRuleTaleRef.current?.text ?? getAdvancedBrakeRuleHint(activeConfig.level, activeConfig.params.dualRule)
        : null
      : getAdvancedBrakeRuleHint(activeConfig.level, activeConfig.params.dualRule);
    setActiveRuleHint(nextRuleHint);
    setActiveLaneCount(isAdvancedBrakingRuleZoneActive(brakingRuleZoneState) ? Math.max(2, resolveAdvancedBrakingLaneCount(ruleZoneConfig)) : resolveAdvancedBrakingLaneCount(config));
  }, [brakingRuleZoneState, config, endless, endlessDifficulty, ruleHint]);



  const clearTimers = useCallback(() => {

    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);

    if (holdSuccessTimerRef.current) window.clearTimeout(holdSuccessTimerRef.current);

    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);

    collisionTimerRef.current = null;

    holdSuccessTimerRef.current = null;
    feedbackTimerRef.current = null;
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;
    for (const timer of bumpedHazardTimersRef.current) window.clearTimeout(timer);
    bumpedHazardTimersRef.current = [];
    for (const timer of shockwaveTimersRef.current) window.clearTimeout(timer);
    shockwaveTimersRef.current = [];

  }, []);

  const showAdvancedFeedback = useCallback((feedback: AdvancedBrakingFeedback, persist = false) => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    setAdvancedFeedback(feedback);
    if (!persist) {
      feedbackTimerRef.current = window.setTimeout(() => {
        feedbackTimerRef.current = null;
        setAdvancedFeedback("idle");
      }, 360);
    }
  }, []);

  const releaseAdvancedBrakingPointerCapture = useCallback(() => {
    const captured = pointerCaptureRef.current;
    pointerCaptureRef.current = null;
    if (!captured) return;
    try {
      if (captured.element.hasPointerCapture(captured.pointerId)) {
        captured.element.releasePointerCapture(captured.pointerId);
      }
    } catch {
      // Pointer capture may already be gone after a scene transition.
    }
  }, []);

  const forceAdvancedBrakingStopAfterFailure = useCallback(() => {
    releaseAdvancedBrakingPointerCapture();
    holdingRef.current = false;
    setHolding(false);
  }, [releaseAdvancedBrakingPointerCapture]);

  const resetAdvancedBrakingHold = useCallback(() => {
    holdingRef.current = false;
    setHolding(false);
  }, []);



  const resetEventTimer = useCallback(() => {
    const endlessRuntime = endlessRef.current;
    const nextEventDelayMs = resolveAdvancedBrakingEventDelayMs({
      endless: endlessRuntime,
      distance: endlessRuntime ? Math.max(endlessRuntime.score, endlessDistanceRef.current) : 0,
      maxEventDelayMs,
      minEventDelayMs,
    });
    if (endlessRuntime && bigLuckRecoveryDelayPendingRef.current) {
      eventTimerRef.current = Math.max(nextEventDelayMs, ENDLESS_BIG_LUCK_RECOVERY_EVENT_DELAY_MS);
      bigLuckRecoveryDelayPendingRef.current = false;
      return;
    }
    eventTimerRef.current = nextEventDelayMs;

  }, [maxEventDelayMs, minEventDelayMs]);

  const resetAdvancedBrakingInput = useCallback(() => {
    releaseAdvancedBrakingPointerCapture();
    resetAdvancedBrakingHold();
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    if (holdSuccessTimerRef.current) window.clearTimeout(holdSuccessTimerRef.current);
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    collisionTimerRef.current = null;
    holdSuccessTimerRef.current = null;
    feedbackTimerRef.current = null;
    hazardRef.current = null;
    setHazard(null);
    hazardShownAtRef.current = null;
    setAdvancedFeedback("idle");
    resetEventTimer();
  }, [releaseAdvancedBrakingPointerCapture, resetAdvancedBrakingHold, resetEventTimer]);



  const finish = useCallback(

    (extra?: TrialEvent) => {

      if (finishedRef.current) return;

      finishedRef.current = true;

      clearTimers();

      releaseAdvancedBrakingPointerCapture();

      setHolding(false);

      holdingRef.current = false;

      const finalTrials = extra ? [...trialsRef.current, extra] : [...trialsRef.current];
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        onComplete(finalTrials);
      }, ROUND_SETTLEMENT_DELAY_MS);

    },

    [clearTimers, onComplete, releaseAdvancedBrakingPointerCapture],

  );



  useEffect(() => {

    const updateTrackMetrics = () => {

      const width = trackRef.current?.clientWidth ?? 0;

      if (width <= 0) return;

      setTrackMetrics({

        runnerWidthPercent: (46 / width) * 100,

        hazardWidthPercent: (38 / width) * 100,

      });

    };



    updateTrackMetrics();

    if (typeof ResizeObserver === "undefined") {

      window.addEventListener("resize", updateTrackMetrics);

      return () => window.removeEventListener("resize", updateTrackMetrics);

    }



    const observer = new ResizeObserver(updateTrackMetrics);

    if (trackRef.current) observer.observe(trackRef.current);

    return () => observer.disconnect();

  }, []);



  const clearHazardAfterSuccess = useCallback(() => {

    previousHazardRef.current = hazardRef.current;

    hazardRef.current = null;

    setHazard(null);

    hazardShownAtRef.current = null;

    hazardIndexRef.current += 1;

    resetEventTimer();

  }, [resetEventTimer]);

  const getBigLuckSkill = useCallback(
    () => {
      const activeSkill = endlessRef.current?.getActiveSkill();
      return activeSkill?.kind === "big-luck" ? activeSkill : null;
    },
    [],
  );

  const bumpAdvancedBrakingHazard = useCallback((currentHazard: AdvancedBrakeHazard) => {
    const bumpedHazard: AdvancedBrakeBumpedHazard = {
      ...currentHazard,
      id: bumpedHazardIdRef.current + 1,
      rotationDeg: rand(-120, 120),
    };
    bumpedHazardIdRef.current = bumpedHazard.id;
    setBumpedHazards((current) => [...current.slice(-3), bumpedHazard]);
    const timer = window.setTimeout(() => {
      setBumpedHazards((current) => current.filter((item) => item.id !== bumpedHazard.id));
      bumpedHazardTimersRef.current = bumpedHazardTimersRef.current.filter((item) => item !== timer);
    }, 520);
    bumpedHazardTimersRef.current.push(timer);
  }, []);

  const registerEndlessBrakingShockwave = useCallback(() => {
    const shockwave: AdvancedBrakingShockwave = {
      id: shockwaveIdRef.current + 1,
      x: progressRef.current + trackMetrics.runnerWidthPercent / 2,
    };
    shockwaveIdRef.current = shockwave.id;
    setShockwaves((current) => [...current.slice(-1), shockwave]);
    const timer = window.setTimeout(() => {
      setShockwaves((current) => current.filter((item) => item.id !== shockwave.id));
      shockwaveTimersRef.current = shockwaveTimersRef.current.filter((item) => item !== timer);
    }, 680);
    shockwaveTimersRef.current.push(timer);
  }, [trackMetrics.runnerWidthPercent]);

  const clearEndlessBrakingHazards = useCallback(() => {
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    if (holdSuccessTimerRef.current) window.clearTimeout(holdSuccessTimerRef.current);
    collisionTimerRef.current = null;
    holdSuccessTimerRef.current = null;
    const currentHazard = hazardRef.current;
    const clearedObstacles = currentHazard ? [currentHazard] : [];
    if (clearedObstacles.length > 0) endlessRef.current?.incrementMetric("knockaways", clearedObstacles.length);
    for (const clearedObstacle of clearedObstacles) {
      bumpAdvancedBrakingHazard(clearedObstacle);
      previousHazardRef.current = clearedObstacle;
      hazardIndexRef.current += 1;
    }
    hazardRef.current = null;
    setHazard(null);
    hazardShownAtRef.current = null;
    spawnLockedUntilRef.current = performance.now() + ENDLESS_BRAKING_CLEAR_SPAWN_LOCK_MS;
    resetEventTimer();
  }, [bumpAdvancedBrakingHazard, resetEventTimer]);

  useEffect(() => {
    if (!endless?.setSkillEndHandler) return undefined;
    const handleEndlessSkillEnd = (endedSkill: EndlessActiveSkill) => {
      if (endedSkill.kind !== "big-luck") return;
      registerEndlessBrakingShockwave();
      clearEndlessBrakingHazards();
    };
    endless.setSkillEndHandler(handleEndlessSkillEnd);
    return () => endless.setSkillEndHandler?.(null);
  }, [clearEndlessBrakingHazards, endless, registerEndlessBrakingShockwave]);

  const isBigLuckSkillActive = useCallback(function isBigLuckSkillActive() {
    const activeEndless = endlessRef.current;
    const activeSkill = activeEndless?.getActiveSkill();
    if (!activeEndless || activeSkill?.kind !== "big-luck") return false;
    const currentHazard = hazardRef.current;
    if (currentHazard) {
      bumpAdvancedBrakingHazard(currentHazard);
      activeEndless.incrementMetric("knockaways");
    }
    activeEndless.addScore(1);
    activeEndless.incrementMetric("successfulResponses");
    hazardRef.current = null;
    setHazard(null);
    hazardShownAtRef.current = null;
    hazardIndexRef.current += 1;
    resetEventTimer();
    return true;
  }, [bumpAdvancedBrakingHazard, resetEventTimer]);



  const recordHoldSuccess = useCallback(

    (currentHazard: AdvancedBrakeHazard) => {

      trialsRef.current.push(

        trial("braking", hazardIndexRef.current, {

          shownAt: hazardShownAtRef.current ?? now(),

          responseAt: now(),

          correct: true,

          value: {

            collision: false,

            earlyStop: false,

            fakeStop: false,

            signal: currentHazard.top === "gray" || currentHazard.bottom === "gray" ? "gray" : "hold",

          },

        }),

      );

      const activeEndless = endlessRef.current;
      if (activeEndless) {
        activeEndless.addScore(1);
        activeEndless.incrementMetric("successfulResponses");
      }
      if (!endlessRef.current) showAdvancedFeedback("success");

      clearHazardAfterSuccess();

    },

    [clearHazardAfterSuccess, showAdvancedFeedback],

  );



  const startHazard = useCallback(() => {

    if (hazardRef.current || rulePortalRef.current || finishedRef.current) return;
    if (performance.now() < spawnLockedUntilRef.current) return;

    const endlessRuntime = endlessRef.current;
    const endlessDistance = endlessRuntime ? Math.max(endlessRuntime.score, endlessDistanceRef.current) : 0;
    const activeDifficulty = endlessRuntime
      ? Math.max(getEndlessDifficulty({ maxRamp: 36 * 110, progress: endlessDistance }), endlessRuntime.debugDifficulty)
      : 0;
    const activeConfig = getAdvancedBrakingRuleZoneConfig({
      brakingRuleZoneState: brakingRuleZoneStateRef.current,
      config,
      endless: endlessRuntime,
      endlessDifficulty: activeDifficulty,
    });
    const activeBrake = endlessRuntime ? getEndlessBrakingConfig({ distance: endlessDistance }) : null;
    const activeAllowGray = endlessRuntime ? activeDifficulty >= 0.22 : allowGray;
    const activeSpeedMultiplier = getAdvancedBrakingSpeedMultiplier(endlessRuntime?.getActiveSkill());
    const baseReactionWindowMs = activeBrake?.reactionWindowMs ?? reactionWindowMs;
    const activeReactionWindowMs = endlessRuntime
      ? resolveEndlessBrakingReactionWindowMs(baseReactionWindowMs, activeDifficulty, activeSpeedMultiplier)
      : resolveAdvancedBrakingReactionWindowMs(baseReactionWindowMs, activeSpeedMultiplier);
    const activeSpeedPerSecond = (activeBrake?.roadSpeed ?? speedPerSecond) * activeSpeedMultiplier;
    const ruleZoneActive = isAdvancedBrakingRuleZoneActive(brakingRuleZoneStateRef.current);
    const activeRuleTale = ruleZoneActive ? activeRuleTaleRef.current ?? ENDLESS_BRAKING_RULE_TALES[0] : null;

    const eventContext = {

      eventIndex: hazardIndexRef.current,

      eventCount: activeEventCountTarget,

      previousEvent: previousHazardRef.current,

    };

    const rawOptions = endlessRuntime
      ? activeRuleTale
        ? getEndlessBrakingEventOptions(activeRuleTale, activeDifficulty)
        : getEndlessBrakingExternalEventOptions(activeConfig.level, activeDifficulty, eventContext)
      : getAdvancedBrakeEventOptions(activeConfig.level, eventContext);
    const options = endlessRuntime
      ? filterRecentEndlessBrakingEventOptions(rawOptions, recentEndlessHazardKeysRef.current)
      : rawOptions;

    const picked = pickAdvancedBrakeEvent(options, {
      forceFake: shouldForceAdvancedBrakeFakeEvent({
        allowGray: activeAllowGray,
        fakeEventUsed: fakeEventUsedRef.current,
        eventIndex: hazardIndexRef.current,
        eventCount: activeEventCountTarget,
      }),
      forceRuleDanger: endlessRuntime ? isAdvancedBrakingRuleZoneActive(brakingRuleZoneStateRef.current) : shouldForceAdvancedBrakeRuleDangerEvent({
        level: activeConfig.level,
        ruleDangerEventUsed: ruleDangerEventUsedRef.current,
        eventIndex: hazardIndexRef.current,
        eventCount: activeEventCountTarget,
      }),
      level: activeConfig.level,
      randomValue: Math.random(),
    });

    if (!picked) return;
    if (endlessRuntime) {
      const pickedKey = endlessBrakingEventKey(picked);
      recentEndlessHazardKeysRef.current = [...recentEndlessHazardKeysRef.current.filter((key) => key !== pickedKey), pickedKey].slice(-4);
    }

    const hazardLeft = getAdvancedBrakeDangerLeft({

      runnerLeftPercent: progressRef.current,

      runnerWidthPercent: trackMetrics.runnerWidthPercent,

      hazardWidthPercent: trackMetrics.hazardWidthPercent,

      speedPerSecond: activeSpeedPerSecond,

      reactionWindowMs: activeReactionWindowMs,

    });

    if (hazardLeft === null) {

      resetEventTimer();

      return;

    }

    if (isAdvancedBrakeFakeEvent(picked)) fakeEventUsedRef.current = true;
    if (isAdvancedBrakeRuleDangerEvent(activeConfig.level, picked)) ruleDangerEventUsedRef.current = true;

    const nextHazard: AdvancedBrakeHazard = {

      x: hazardLeft,

      top: picked.top,

      bottom: picked.bottom,

      correctAction: picked.correctAction,

    };

    hazardRef.current = nextHazard;

    setHazard(nextHazard);

    hazardShownAtRef.current = now();



    if (nextHazard.correctAction === "release") {

      collisionTimerRef.current = window.setTimeout(() => {

        if (!hazardRef.current || hazardRef.current.correctAction !== "release") return;

        if (isBigLuckSkillActive()) return;
        const activeEndless = endlessRef.current;

        showAdvancedFeedback("crashed", true);
        forceAdvancedBrakingStopAfterFailure();
        if (activeEndless) {
          const canContinue = activeEndless.loseLife("collision");
          hazardRef.current = null;
          setHazard(null);
          hazardShownAtRef.current = null;
          resetEventTimer();
          if (!canContinue) {
            finishedRef.current = true;
            clearTimers();
          }
          return;
        }

        finish(

          trial("braking", hazardIndexRef.current, {

            shownAt: hazardShownAtRef.current ?? now(),

            responseAt: now(),

            correct: false,

            errorType: "collision",

            value: { collision: true, fakeStop: false, exited: false, signal: "red" },

          }),

        );

      }, activeReactionWindowMs);

      return;

    }



    const activeHoldSuccessMs = resolveAdvancedBrakingReactionWindowMs(
      nextHazard.top === "gray" || nextHazard.bottom === "gray" ? grayHoldMs : eventDurationMs,
      activeSpeedMultiplier,
    );

    holdSuccessTimerRef.current = window.setTimeout(

      () => {

        const currentHazard = hazardRef.current;

        if (!currentHazard || currentHazard.correctAction !== "hold" || !holdingRef.current) return;

        recordHoldSuccess(currentHazard);

      },

      activeHoldSuccessMs,

    );

  }, [

    activeEventCountTarget,
    allowGray,
    clearTimers,
    config,

    isBigLuckSkillActive,

    eventDurationMs,

    finish,
    forceAdvancedBrakingStopAfterFailure,

    grayHoldMs,

    reactionWindowMs,

    recordHoldSuccess,

    resetEventTimer,

    showAdvancedFeedback,

    speedPerSecond,

    trackMetrics.hazardWidthPercent,

    trackMetrics.runnerWidthPercent,

  ]);



  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const delta = frameNow - (lastFrameAtRef.current || frameNow);

      lastFrameAtRef.current = frameNow;
      if (pausedRef.current) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      const activeEndlessRuntime = endlessRef.current;
      const bigLuckRunning = getBigLuckSkill() !== null;
      if (bigLuckRunningRef.current && !bigLuckRunning && activeEndlessRuntime) {
        bigLuckRecoveryDelayPendingRef.current = true;
        if (!hazardRef.current && !rulePortalRef.current) resetEventTimer();
      }
      bigLuckRunningRef.current = bigLuckRunning;

      if (holdingRef.current && !finishedRef.current) {

        const { hazardWidthPercent, runnerWidthPercent } = trackMetrics;
        const activeEndless = endlessRef.current;
        const activeDistance = activeEndless ? Math.max(endlessDistanceRef.current, activeEndless.score) : 0;
        const activeDifficulty = activeEndless
          ? Math.max(getEndlessDifficulty({ maxRamp: 36 * 110, progress: activeDistance }), activeEndless.debugDifficulty)
          : 0;
        const activeBrake = activeEndless ? getEndlessBrakingConfig({ distance: activeDistance }) : null;
        const activeSpeedMultiplier = getAdvancedBrakingSpeedMultiplier(activeEndless?.getActiveSkill());
        const activeSpeedPerSecond = (activeBrake?.roadSpeed ?? speedPerSecond) * activeSpeedMultiplier;
        const activeReactionWindowMs = activeEndless
          ? resolveEndlessBrakingReactionWindowMs(activeBrake?.reactionWindowMs ?? reactionWindowMs, activeDifficulty, activeSpeedMultiplier)
          : resolveAdvancedBrakingReactionWindowMs(activeBrake?.reactionWindowMs ?? reactionWindowMs, activeSpeedMultiplier);
        let distanceDelta = 0;

        if (activeEndless) {
          distanceDelta = (delta * activeSpeedPerSecond) / 1000;
          endlessDistanceRef.current = activeDistance + distanceDelta;
          activeEndless.reportDifficulty(getEndlessDifficulty({ maxRamp: 36 * 110, progress: endlessDistanceRef.current }));
          syncEndlessWaveParallax(endlessDistanceRef.current);
        }

        const finishLeft = Math.max(0, 100 - runnerWidthPercent);

        const next = activeEndless
          ? clamp(
              progressRef.current + (ENDLESS_BRAKE_RUNNER_LEFT_PERCENT - progressRef.current) * 0.08,
              ENDLESS_BRAKE_RUNNER_LEFT_PERCENT - 2,
              Math.min(ENDLESS_BRAKE_RUNNER_LEFT_PERCENT + 2, finishLeft),
            )
          : clamp(progressRef.current + (delta * speedPerSecond) / 1000, 0, finishLeft);

        progressRef.current = next;

        setProgress(next);

        if (activeEndless && distanceDelta > 0) {
          const currentPortal = rulePortalRef.current;
          if (currentPortal) {
            const movedPortal = { ...currentPortal, x: clamp(currentPortal.x - distanceDelta, -10, 100) };
            rulePortalRef.current = movedPortal;
            setRulePortal(movedPortal);
            if (hasAdvancedBrakingRulePortalReachedRunner({
              portal: movedPortal,
              runnerLeftPercent: next,
              runnerWidthPercent,
            })) {
              const nextRuleZoneState = movedPortal.targetState;
              rulePortalRef.current = null;
              setRulePortal(null);
              brakingRuleZoneStateRef.current = nextRuleZoneState;
              setBrakingRuleZoneState(nextRuleZoneState);
              ruleZoneSkillRef.current = activeEndless.getActiveSkill();
              if (nextRuleZoneState === "active") {
                ruleZoneStartedAtRef.current = endlessDistanceRef.current;
                const nextRuleTale = pickEndlessBrakingRuleTale();
                activeRuleTaleRef.current = nextRuleTale;
                ruleZoneHintRef.current = pickEndlessBrakingRuleHint(nextRuleTale);
                setActiveRuleHint(ruleZoneHintRef.current);
                resetAdvancedBrakingInput();
              }
              if (nextRuleZoneState === "normal") {
                ruleZoneStartedAtRef.current = endlessDistanceRef.current;
                activeRuleTaleRef.current = null;
                ruleZoneHintRef.current = null;
                setActiveRuleHint(null);
                resetAdvancedBrakingInput();
              }
              resetEventTimer();
            }
          } else if (shouldAdvancedBrakingUseRuleZone({
            brakingRuleZoneState: brakingRuleZoneStateRef.current,
            distanceSinceRuleZoneChange: endlessDistanceRef.current - ruleZoneStartedAtRef.current,
            endlessDifficulty: activeDifficulty,
            hazard: hazardRef.current,
            rulePortal: rulePortalRef.current,
          })) {
            const nextPortal: AdvancedBrakingRulePortal = { x: ENDLESS_BRAKING_RULE_PORTAL_DISTANCE, targetState: "active" };
            rulePortalRef.current = nextPortal;
            setRulePortal(nextPortal);
            brakingRuleZoneStateRef.current = "entering";
            setBrakingRuleZoneState("entering");
          } else if (
            brakingRuleZoneStateRef.current === "active" &&
            endlessDistanceRef.current - ruleZoneStartedAtRef.current >= ENDLESS_BRAKING_RULE_ZONE_DISTANCE &&
            !hazardRef.current
          ) {
            const nextPortal: AdvancedBrakingRulePortal = { x: ENDLESS_BRAKING_RULE_PORTAL_DISTANCE, targetState: "normal" };
            rulePortalRef.current = nextPortal;
            setRulePortal(nextPortal);
            brakingRuleZoneStateRef.current = "exiting";
            setBrakingRuleZoneState("exiting");
          }
        }

        if (activeEndless && hazardRef.current && distanceDelta > 0) {
          const hazard = hazardRef.current;
          const movedHazard = {
            ...hazard,
            x: clamp(hazard.x - distanceDelta, -10, 100),
          };
          hazardRef.current = movedHazard;
          setHazard(movedHazard);
          if (hasAdvancedBrakingHazardReachedRunner({
            hazard: movedHazard,
            runnerLeftPercent: next,
            runnerWidthPercent,
          })) {
            if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
            collisionTimerRef.current = null;
            if (holdSuccessTimerRef.current) window.clearTimeout(holdSuccessTimerRef.current);
            holdSuccessTimerRef.current = null;
            if (isBigLuckSkillActive()) {
              frameRef.current = requestAnimationFrame(tick);
              return;
            }
            if (movedHazard.correctAction === "release") {
              showAdvancedFeedback("crashed", true);
              forceAdvancedBrakingStopAfterFailure();
              const canContinue = activeEndless.loseLife("collision");
              hazardRef.current = null;
              setHazard(null);
              hazardShownAtRef.current = null;
              resetEventTimer();
              if (!canContinue) {
                finishedRef.current = true;
                clearTimers();
              }
              frameRef.current = requestAnimationFrame(tick);
              return;
            }
            recordHoldSuccess(movedHazard);
          }
        }

        if (!activeEndless && getAdvancedBrakeHasReachedFinish({ runnerLeftPercent: next, runnerWidthPercent })) {

          showAdvancedFeedback("success", true);

          finish(

            trial("braking", hazardIndexRef.current, {

              shownAt: 0,

              responseAt: now(),

              correct: true,

              value: { exited: true, collision: false, earlyStop: false },

            }),

          );

          return;

        }



        const canPlaceNextDanger =

          getAdvancedBrakeDangerLeft({

            runnerLeftPercent: next,

            runnerWidthPercent,

            hazardWidthPercent,

            speedPerSecond: activeSpeedPerSecond,

            reactionWindowMs: activeReactionWindowMs,

          }) !== null;

        const scheduleStep = getAdvancedBrakeSchedulerStep({

          holding: holdingRef.current,

          activeEvent: hazardRef.current !== null,

          eventTimerMs: eventTimerRef.current,

          deltaMs: delta * (getBigLuckSkill() ? ENDLESS_BIG_LUCK_HAZARD_FREQUENCY_MULTIPLIER : 1),

          eventCountUsed: hazardIndexRef.current,

          eventCountTarget: activeEventCountTarget,

          nearFinish: activeEndless ? false : !canPlaceNextDanger || next >= 100 - finishSafeDistance,

        });

        eventTimerRef.current = scheduleStep.eventTimerMs;

        if (scheduleStep.shouldSpawn) startHazard();

      }

      frameRef.current = requestAnimationFrame(tick);

    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {

      if (frameRef.current) cancelAnimationFrame(frameRef.current);

      clearTimers();

    };

  }, [

    clearTimers,

    activeEventCountTarget,
    config,

    isBigLuckSkillActive,

    finish,

    finishSafeDistance,

    forceAdvancedBrakingStopAfterFailure,

    getBigLuckSkill,

    recordHoldSuccess,

    reactionWindowMs,

    resetAdvancedBrakingInput,

    resetEventTimer,

    showAdvancedFeedback,

    speedPerSecond,

    startHazard,

    syncEndlessWaveParallax,

    trackMetrics,

  ]);



  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current || holdingRef.current) return;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
      pointerCaptureRef.current = { element: event.currentTarget, pointerId: event.pointerId };
    } catch {
      pointerCaptureRef.current = null;
    }

    setAdvancedFeedback("idle");

    setHolding(true);

    holdingRef.current = true;

  };



  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    releaseAdvancedBrakingPointerCapture();

    if (finishedRef.current || !holdingRef.current) return;

    const currentHazard = hazardRef.current;
    const activeEndless = endlessRef.current;
    if (!currentHazard) {
      setHolding(false);
      holdingRef.current = false;
      if (activeEndless) {
        showAdvancedFeedback("early", true);
        forceAdvancedBrakingStopAfterFailure();
        const canContinue = activeEndless.loseLife("early_stop");
        resetEventTimer();
        if (!canContinue) {
          finishedRef.current = true;
          clearTimers();
        }
      }
      return;
    }

    const releaseOutcome = getAdvancedBrakeReleaseOutcome(currentHazard);
    const releaseSpeedMultiplier = getAdvancedBrakingSpeedMultiplier(activeEndless?.getActiveSkill());

    setHolding(false);

    holdingRef.current = false;

    if (releaseOutcome.outcome === "pause") return;

    if (releaseOutcome.outcome === "failure") {

      clearTimers();

      showAdvancedFeedback("early", true);
      if (activeEndless) {
        const canContinue = activeEndless.loseLife(releaseOutcome.errorType);
        hazardRef.current = null;
        setHazard(null);
        hazardShownAtRef.current = null;
        resetEventTimer();
        if (!canContinue) {
          finishedRef.current = true;
          clearTimers();
        }
        return;
      }

      finish(

        trial("braking", hazardIndexRef.current, {

          shownAt: hazardShownAtRef.current ?? now(),

          responseAt: now(),

          correct: false,

          errorType: releaseOutcome.errorType,

          pointerType: pointerKind(event.pointerType),

          value: {

            collision: false,

            earlyStop: releaseOutcome.errorType === "early_stop",

            fakeStop: releaseOutcome.errorType === "false_alarm",

            exited: false,

          },

        }),

      );

      return;

    }



    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);

    collisionTimerRef.current = null;

    const latency = Math.round(now() - (hazardShownAtRef.current ?? now()));

    const activeBrake = activeEndless ? getEndlessBrakingConfig({ distance: Math.max(activeEndless.score, endlessDistanceRef.current) }) : null;
    const activeReactionWindowMs = activeEndless
      ? resolveEndlessBrakingReactionWindowMs(
          activeBrake?.reactionWindowMs ?? reactionWindowMs,
          Math.max(getEndlessDifficulty({ maxRamp: 36 * 110, progress: Math.max(activeEndless.score, endlessDistanceRef.current) }), activeEndless.debugDifficulty),
          releaseSpeedMultiplier,
        )
      : resolveAdvancedBrakingReactionWindowMs(activeBrake?.reactionWindowMs ?? reactionWindowMs, releaseSpeedMultiplier);

    const correct = latency <= activeReactionWindowMs;

    trialsRef.current.push(

      trial("braking", hazardIndexRef.current, {

        shownAt: hazardShownAtRef.current ?? now(),

        responseAt: now(),

        correct,

        errorType: correct ? undefined : "collision",

        pointerType: pointerKind(event.pointerType),

        value: { collision: !correct, earlyStop: false, fakeStop: false, stopLatencyMs: latency, exited: false, signal: "red" },

      }),

    );

    if (!correct) {
      showAdvancedFeedback("crashed", true);
      forceAdvancedBrakingStopAfterFailure();
      if (activeEndless) {
        const canContinue = activeEndless.loseLife("collision");
        hazardRef.current = null;
        setHazard(null);
        hazardShownAtRef.current = null;
        resetEventTimer();
        if (!canContinue) {
          finishedRef.current = true;
          clearTimers();
        }
      }

      else finish();
    }

    else {
      if (activeEndless) {
        activeEndless.addScore(1);
        activeEndless.incrementMetric("successfulResponses");
        if (latency <= ENDLESS_BRAKING_FAST_REACTION_MS) {
          activeEndless.incrementMetric("quickResponses");
          activeEndless.awardSpecialBonus("快速反应！");
        }
      }
      showAdvancedFeedback("success");
      clearHazardAfterSuccess();
    }

  };



  const showAdvancedBrakingMiniScore = !endless;
  const ruleZoneVisualActive = isAdvancedBrakingRuleZoneActive(brakingRuleZoneState);
  const showAdvancedBrakingRuleBackdrop = ruleZoneVisualActive && activeRuleHint;
  const rulePortalLanes = rulePortal
    ? Array.from({ length: rulePortal.targetState === "normal" ? Math.max(2, activeLaneCount) : 1 }, (_, lane) => lane)
    : [];

  return (

    <div
      className={`braking-panel advanced-braking lanes-${activeLaneCount} ${holding ? "holding" : ""} ${advancedFeedback} ${endless ? "endless-runner" : ""} ${ruleZoneVisualActive ? "rule-zone-active" : ""} ${rulePortal ? "rule-portal-active" : ""}`}
      role="application"
      aria-label="长按游戏区域前进，松手急停"
      onPointerCancel={release}
      onPointerDown={begin}
      onPointerUp={release}
    >
      <DifficultyWaveBackdrop />
      {showAdvancedBrakingMiniScore ? (
      <div className="mini-score">

        {!endless ? <span>{Math.round(Math.min(100, progress + trackMetrics.runnerWidthPercent))}%</span> : null}
        {activeRuleHint ? <span>{activeRuleHint}</span> : null}

      </div>
      ) : null}

      <div
        className="advanced-brake-track"
        aria-hidden="true"
        ref={trackRef}
      >

        {showAdvancedBrakingRuleBackdrop ? <div className="advanced-brake-rule-backdrop-text">{activeRuleHint}</div> : null}
        {shockwaves.map((shockwave) => (
          <span
            className="advanced-braking-shockwave"
            key={shockwave.id}
            style={{ left: `${shockwave.x}%` }}
          />
        ))}

        {Array.from({ length: activeLaneCount }, (_, lane) => (

          <div className="advanced-brake-lane" key={lane}>
            {rulePortal && rulePortalLanes.includes(lane) ? (
              <span
                className="advanced-brake-rule-portal"
                data-target={rulePortal.targetState}
                style={{ left: `${rulePortal.x}%` }}
              />
            ) : null}

            {hazard && (lane === 0 ? hazard.top : hazard.bottom) ? (

              <span

                className={`advanced-hazard ${(lane === 0 ? hazard.top : hazard.bottom) === "gray" ? "fake" : "real"}`}

                style={{ left: `${hazard.x}%`, translate: "0 0" }}

              />

            ) : null}

            {bumpedHazards.map((bumpedHazard) => {
              const signal = lane === 0 ? bumpedHazard.top : bumpedHazard.bottom;
              if (!signal) return null;
              return (
                <span
                  className={`advanced-hazard advanced-braking-obstacle knocked-away advanced-hazard-bumped ${signal === "gray" ? "fake" : "real"}`}
                  key={`${bumpedHazard.id}-${lane}`}
                  style={{
                    "--advanced-brake-bump-rotate": `${bumpedHazard.rotationDeg}deg`,
                    left: `${bumpedHazard.x}%`,
                    translate: "0 0",
                  } as CSSProperties}
                />
              );
            })}

            <span className={`advanced-runner ${damageInvincible ? "damage-invincible" : ""}`} style={{ left: `${progress}%`, translate: "0 0" }}>
              <PlayerAvatar
                {...resolveAdvancedBrakingAvatarView(holding, advancedFeedback)}
                direction={holding ? "right" : "none"}
                effect={shielded ? "shield" : resolveAdvancedBrakingAvatarView(holding, advancedFeedback).effect}
                size={46}
                visualScale={1.02}
              />
            </span>
          </div>

        ))}

      </div>

    </div>

  );

}

const DINO_TRIAL_COUNT = 5;
const DINO_SPEED_PER_SECOND = 26;
const DINO_FAILURE_FEEDBACK_MS = 820;

type DinoStatus = "ready" | "running" | "danger" | "stopped" | "crashed" | "early";

function resolveDinoAvatarView(status: DinoStatus): PlayerAvatarView {
  switch (status) {
    case "danger":
      return { action: "move", expression: "neutral" };
    case "running":
      return { action: "move", expression: "neutral" };
    case "stopped":
      return { action: "celebrate", expression: "happy", effect: "sparkles" };
    case "crashed":
      return { action: "hit", expression: "hurt" };
    case "early":
      return { action: "hit", expression: "hurt" };
    case "ready":
      return { action: "idle", expression: "neutral" };
  }
}

function BrakingRoundCore({
  onComplete,
  onPracticeSuccess,
  paused = false,
  trialCount = DINO_TRIAL_COUNT,
}: RoundProps & { onPracticeSuccess?: () => void; trialCount?: number }) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<DinoStatus>("ready");
  const [progress, setProgress] = useState(8);
  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);
  const [holding, setHolding] = useState(false);
  const trialStartedAtRef = useRef(now());
  const hazardShownAtRef = useRef<number | null>(null);
  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);
  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);
  const hazardDelayRef = useRef(1000);
  const trialsRef = useRef<TrialEvent[]>([]);

  const transitionTimerRef = useRef<number | null>(null);

  const hazardTimerRef = useRef<number | null>(null);

  const collisionTimerRef = useRef<number | null>(null);

  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const runnerRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const answeredRef = useRef(false);
  const holdingRef = useRef(false);
  const progressRef = useRef(8);
  const statusRef = useRef<DinoStatus>("ready");
  const pausedRef = useRef(paused);
  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });


  const start = useCallback((nextIndex: number) => {

    setIndex(nextIndex);

    setStatus("ready");
    statusRef.current = "ready";
    setProgress(8);
    progressRef.current = 8;
    setHazard(null);
    hazardRef.current = null;
    setHolding(false);
    holdingRef.current = false;

    hazardShownAtRef.current = null;

    answeredRef.current = false;

    trialStartedAtRef.current = now();

    if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);

    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);

    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);

  }, []);



  useEffect(() => {
    start(0);
    return () => {
      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);

      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);

      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);

      if (frameRef.current) cancelAnimationFrame(frameRef.current);

    };
  }, [start]);

  useEffect(() => {
    const updateTrackMetrics = () => {
      const width = trackRef.current?.clientWidth ?? 0;
      if (width <= 0) return;
      setTrackMetrics({
        runnerWidthPercent: (46 / width) * 100,
        hazardWidthPercent: (38 / width) * 100,
      });
    };

    updateTrackMetrics();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTrackMetrics);
      return () => window.removeEventListener("resize", updateTrackMetrics);
    }

    const observer = new ResizeObserver(updateTrackMetrics);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {

    const tick = () => {

      const frameNow = now();

      const lastFrameAt = lastFrameAtRef.current || frameNow;

      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
      if (pausedRef.current) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      if (holdingRef.current && (statusRef.current === "running" || statusRef.current === "danger")) {
        const next = clamp(progressRef.current + (delta * DINO_SPEED_PER_SECOND) / 1000, 8, 78);
        progressRef.current = next;

        if (runnerRef.current) {

          runnerRef.current.style.left = `${next}%`;

        }

      }

      frameRef.current = requestAnimationFrame(tick);

    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const scheduleDinoNext = useCallback(
    (correct: boolean) => {
      const delayMs = correct ? 520 : DINO_FAILURE_FEEDBACK_MS;
      transitionTimerRef.current = window.setTimeout(() => {
        if (index >= trialCount - 1) onComplete([...trialsRef.current]);
        else start(index + 1);
      }, delayMs);
    },
    [index, onComplete, start, trialCount],
  );

  const completeTrial = useCallback(
    (event: Partial<TrialEvent>) => {
      if (answeredRef.current) return;
      answeredRef.current = true;

      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
      setHolding(false);
      holdingRef.current = false;
      previousHazardRef.current = hazardRef.current;
      trialsRef.current.push(trial("braking", index, event));
      scheduleDinoNext(event.correct !== false);
    },
    [index, scheduleDinoNext],
  );


  const showHazard = useCallback(() => {
    if (answeredRef.current || !holdingRef.current) return;
    hazardShownAtRef.current = now();
    const options = getAdvancedBrakeEventOptions(1, {
      eventIndex: index,
      eventCount: trialCount,
      previousEvent: previousHazardRef.current,
    });
    const picked = options.find((option) => option.correctAction === "release") ?? options[0] ?? {
      top: "red" as const,
      bottom: null,
      correctAction: "release" as const,
    };
    const nextThreatX =
      getAdvancedBrakeDangerLeft({
        runnerLeftPercent: progressRef.current,
        runnerWidthPercent: trackMetrics.runnerWidthPercent,
        hazardWidthPercent: trackMetrics.hazardWidthPercent,
        speedPerSecond: DINO_SPEED_PER_SECOND,
        reactionWindowMs: DINO_SAFE_STOP_WINDOW_MS,
      }) ?? clamp(progressRef.current + trackMetrics.runnerWidthPercent + 8, 28, 100 - trackMetrics.hazardWidthPercent);
    const nextHazard: AdvancedBrakeHazard = {
      x: nextThreatX,
      top: picked.top,
      bottom: picked.bottom,
      correctAction: "release",
    };
    setProgress(progressRef.current);
    hazardRef.current = nextHazard;
    setHazard(nextHazard);
    setStatus("danger");
    statusRef.current = "danger";
    collisionTimerRef.current = window.setTimeout(() => {

      if (answeredRef.current || !holdingRef.current) return;

      setProgress(progressRef.current);

      setStatus("crashed");

      statusRef.current = "crashed";

      completeTrial({

        shownAt: hazardShownAtRef.current ?? now(),

        responseAt: now(),

        correct: false,

        errorType: "collision",

        value: {

          mode: "dino",

          signal: "threat",

          safeStop: false,

          collision: true,

          earlyStop: false,

          stopLatencyMs: null,
          hazardDelayMs: hazardDelayRef.current,
          threatX: nextHazard.x,
        },
      });
    }, DINO_SAFE_STOP_WINDOW_MS);
  }, [completeTrial, index, trackMetrics.hazardWidthPercent, trackMetrics.runnerWidthPercent, trialCount]);


  const beginRun = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (answeredRef.current || statusRef.current !== "ready") return;

    event.currentTarget.setPointerCapture(event.pointerId);

    trialStartedAtRef.current = now();

    setHolding(true);

    holdingRef.current = true;

    setStatus("running");

    statusRef.current = "running";

    hazardDelayRef.current = Math.round(rand(580, 1400) - Math.min(index * 46, 230));

    hazardTimerRef.current = window.setTimeout(showHazard, hazardDelayRef.current);

  };



  const releaseRun = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (answeredRef.current || !holdingRef.current) return;

    answeredRef.current = true;

    if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);

    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    setHolding(false);
    holdingRef.current = false;
    setProgress(progressRef.current);
    const releasedAt = now();
    const hazardShownAt = hazardShownAtRef.current;
    const releasedHazard = hazardRef.current;
    const stopResult = resolveDinoStop({ hazardShownAt, releasedAt });
    const earlyStop = stopResult.earlyStop;
    const stopLatencyMs = stopResult.stopLatencyMs;
    const safeStop = stopResult.safeStop;
    const nextStatus: DinoStatus = earlyStop ? "early" : safeStop ? "stopped" : "crashed";
    setStatus(nextStatus);
    statusRef.current = nextStatus;
    trialsRef.current.push(

      trial("braking", index, {

        shownAt: hazardShownAt ?? trialStartedAtRef.current,

        responseAt: releasedAt,

        correct: safeStop,

        errorType: earlyStop ? "early_stop" : safeStop ? undefined : "collision",

        pointerType: pointerKind(event.pointerType),

        value: {

          mode: "dino",

          signal: "threat",

          safeStop,

          collision: stopResult.collision,

          earlyStop,

          stopLatencyMs,
          hazardDelayMs: hazardDelayRef.current,
          threatX: releasedHazard?.x ?? null,
        },
      }),
    );
    previousHazardRef.current = releasedHazard;
    if (safeStop) onPracticeSuccess?.();
    scheduleDinoNext(safeStop);
  };

  const showThreat = hazard !== null && (status === "danger" || status === "stopped" || status === "crashed");
  return (

    <div
      className={`braking-panel dino-panel ${status} ${holding ? "holding" : ""}`}
      role="application"
      aria-label="长按游戏区域前进，危险出现时松手"
      onPointerCancel={releaseRun}
      onPointerDown={beginRun}
      onPointerUp={releaseRun}
    >
      <div className="mini-score">

        <span>{index + 1}/{trialCount}</span>
      </div>

      <div className="advanced-brake-track" aria-hidden="true" ref={trackRef}>
        <div className="advanced-brake-lane">
          {showThreat && hazard.top ? (
            <span
              className={`advanced-hazard ${hazard.top === "gray" ? "fake" : "real"}`}
              style={{ left: `${hazard.x}%`, translate: "0 0" }}
            />
          ) : null}
          <span className="advanced-runner" ref={runnerRef} style={{ left: `${progress}%`, translate: "0 0" }}>
            <PlayerAvatar
              {...resolveDinoAvatarView(status)}
              direction={holding ? "right" : "none"}
              size={46}
              visualScale={1.02}
            />
          </span>
        </div>
      </div>

    </div>

  );

}

function brakingPracticeMessage(trials: TrialEvent[]) {
  const first = trials[0];
  if (first?.correct === true) return "";
  if (first?.errorType === "early_stop") return "太早松手了，再试一次";
  if (first?.errorType === "collision") return "撞到危险了，再试一次";
  return "等危险出现再松手，再试一次";
}

export function BrakingRound({ onComplete, paused = false }: RoundProps) {
  const [practicePassed, setPracticePassed] = useState(false);
  const [practiceKey, setPracticeKey] = useState(0);
  const [practiceMessage, setPracticeMessage] = useState("试一次：危险出现时松手停下");

  const completePractice = useCallback((practiceTrials: TrialEvent[]) => {
    if (practiceTrials.some((item) => item.correct === true)) {
      setPracticePassed(true);
      return;
    }
    setPracticeMessage(brakingPracticeMessage(practiceTrials));
    setPracticeKey((current) => current + 1);
  }, []);

  if (!practicePassed) {
    return (
      <div className="base-practice-wrap">
        <BrakingRoundCore
          key={`braking-practice-${practiceKey}`}
          onComplete={completePractice}
          onPracticeSuccess={() => setPracticeMessage("")}
          paused={paused}
          trialCount={1}
        />
        <small className="base-practice-message">{practiceMessage}</small>
      </div>
    );
  }

  return <BrakingRoundCore onComplete={onComplete} paused={paused} />;
}
