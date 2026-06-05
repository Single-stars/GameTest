"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { PlayerAvatar, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
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

type AdvancedBrakingFeedback = "idle" | "success" | "early" | "crashed";

const ENDLESS_BRAKE_RUNNER_LEFT_PERCENT = 16;
const ENDLESS_BRAKING_FAST_REACTION_MS = 150;
const ENDLESS_BIG_LUCK_SPEED_MULTIPLIER = 2;

function resolveAdvancedBrakingLaneCount(config: AdvancedStageConfig) {
  const configuredLanes = getParamNumber(config, "lanes", 1);
  const dualRule = config.params.dualRule;
  if (dualRule === "single-red-stop" || dualRule === "double-red-stop" || config.level === 10) {
    return Math.max(2, configuredLanes);
  }
  return configuredLanes;
}

function resolveAdvancedBrakingAvatarView(holding: boolean, feedback: AdvancedBrakingFeedback): PlayerAvatarView {
  if (feedback === "success") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (feedback === "crashed") return { action: "hit", expression: "hurt" };
  if (feedback === "early") return { action: "hit", expression: "hurt" };
  if (holding) return { action: "move", expression: "neutral" };
  return { action: "idle", expression: "neutral" };
}

export function AdvancedBrakingRound({ advancedConfig, endless, onComplete, shielded = false }: RoundProps) {

  const config = advancedConfig!;

  const endlessDifficulty = endless ? Math.max(getEndlessDifficulty({ maxRamp: 36 * 110, progress: endless.score }), endless.debugDifficulty) : 0;

  const initialLaneCount = resolveAdvancedBrakingLaneCount(
    endless ? getEndlessReusableStageConfig({ difficulty: endlessDifficulty, roundId: "braking" }).sourceConfig : config,
  );

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
  const [activeRuleHint, setActiveRuleHint] = useState(ruleHint);
  const [activeLaneCount, setActiveLaneCount] = useState(initialLaneCount);

  const eventCountTarget = useMemo(

    () => Math.floor(rand(eventCountMin, eventCountMax + 1)),

    [eventCountMax, eventCountMin],

  );

  const activeEventCountTarget = endless ? Number.POSITIVE_INFINITY : eventCountTarget;

  const initialEventDelayMs = useMemo(() => rand(minEventDelayMs, maxEventDelayMs), [maxEventDelayMs, minEventDelayMs]);

  const [progress, setProgress] = useState(endless ? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0);

  const [holding, setHolding] = useState(false);

  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);

  const progressRef = useRef(endless ? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0);
  const endlessDistanceRef = useRef(0);

  const holdingRef = useRef(false);

  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);

  const hazardShownAtRef = useRef<number | null>(null);

  const eventTimerRef = useRef(initialEventDelayMs);

  const hazardIndexRef = useRef(0);

  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);
  const fakeEventUsedRef = useRef(false);
  const ruleDangerEventUsedRef = useRef(false);

  const trialsRef = useRef<TrialEvent[]>([]);

  const frameRef = useRef<number | null>(null);

  const lastFrameAtRef = useRef(0);

  const collisionTimerRef = useRef<number | null>(null);

  const holdSuccessTimerRef = useRef<number | null>(null);

  const feedbackTimerRef = useRef<number | null>(null);

  const finishedRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
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
  const [dualLaneWarning, setDualLaneWarning] = useState(false);

  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  useEffect(() => {
    if (!endless) {
      setActiveRuleHint(ruleHint);
      setActiveLaneCount(resolveAdvancedBrakingLaneCount(config));
      return;
    }

    const activeConfig = getEndlessReusableStageConfig({ difficulty: endlessDifficulty, roundId: "braking" }).sourceConfig;
    setActiveRuleHint(getAdvancedBrakeRuleHint(activeConfig.level, activeConfig.params.dualRule));
    setActiveLaneCount(resolveAdvancedBrakingLaneCount(activeConfig));
  }, [config, endless, endlessDifficulty, ruleHint]);



  const clearTimers = useCallback(() => {

    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);

    if (holdSuccessTimerRef.current) window.clearTimeout(holdSuccessTimerRef.current);

    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);

    collisionTimerRef.current = null;

    holdSuccessTimerRef.current = null;
    feedbackTimerRef.current = null;
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;

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



  const resetEventTimer = useCallback(() => {

    eventTimerRef.current = rand(minEventDelayMs, maxEventDelayMs);

  }, [maxEventDelayMs, minEventDelayMs]);



  const finish = useCallback(

    (extra?: TrialEvent) => {

      if (finishedRef.current) return;

      finishedRef.current = true;

      clearTimers();

      setHolding(false);

      holdingRef.current = false;

      const finalTrials = extra ? [...trialsRef.current, extra] : [...trialsRef.current];
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        onComplete(finalTrials);
      }, ROUND_SETTLEMENT_DELAY_MS);

    },

    [clearTimers, onComplete],

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

  const consumeBigLuckObstacleBreak = useCallback(() => {
    const activeEndless = endlessRef.current;
    const activeSkill = activeEndless?.getActiveSkill();
    if (!activeEndless || activeSkill?.kind !== "big-luck" || (activeSkill.breakCharges ?? 0) <= 0) return false;
    activeEndless.updateActiveSkill((skill) => {
      if (skill.kind !== "big-luck") return skill;
      return { ...skill, breakCharges: Math.max(0, (skill.breakCharges ?? 1) - 1) };
    });
    activeEndless.addScore(1);
    showAdvancedFeedback("success");
    hazardRef.current = null;
    setHazard(null);
    hazardShownAtRef.current = null;
    hazardIndexRef.current += 1;
    resetEventTimer();
    return true;
  }, [resetEventTimer, showAdvancedFeedback]);



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

      endlessRef.current?.addScore(1);
      showAdvancedFeedback("success");

      clearHazardAfterSuccess();

    },

    [clearHazardAfterSuccess, showAdvancedFeedback],

  );



  const startHazard = useCallback(() => {

    if (hazardRef.current || finishedRef.current) return;

    const endlessRuntime = endlessRef.current;
    const endlessDistance = endlessRuntime ? Math.max(endlessRuntime.score, endlessDistanceRef.current) : 0;
    const activeDifficulty = endlessRuntime
      ? Math.max(getEndlessDifficulty({ maxRamp: 36 * 110, progress: endlessDistance }), endlessRuntime.debugDifficulty)
      : 0;
    const activeConfig = endlessRuntime
      ? getEndlessReusableStageConfig({ difficulty: activeDifficulty, roundId: "braking" }).sourceConfig
      : config;
    setActiveRuleHint(getAdvancedBrakeRuleHint(activeConfig.level, activeConfig.params.dualRule));
    setActiveLaneCount(resolveAdvancedBrakingLaneCount(activeConfig));
    const activeBrake = endlessRuntime ? getEndlessBrakingConfig({ distance: endlessDistance }) : null;
    const activeAllowGray = endlessRuntime ? activeDifficulty >= 0.22 : allowGray;
    const activeReactionWindowMs = activeBrake?.reactionWindowMs ?? reactionWindowMs;
    const activeSpeedPerSecond = (activeBrake?.roadSpeed ?? speedPerSecond) * (getBigLuckSkill() ? ENDLESS_BIG_LUCK_SPEED_MULTIPLIER : 1);

    const options = getAdvancedBrakeEventOptions(activeConfig.level, {

      eventIndex: hazardIndexRef.current,

      eventCount: activeEventCountTarget,

      previousEvent: previousHazardRef.current,

    });

    const picked = pickAdvancedBrakeEvent(options, {
      forceFake: shouldForceAdvancedBrakeFakeEvent({
        allowGray: activeAllowGray,
        fakeEventUsed: fakeEventUsedRef.current,
        eventIndex: hazardIndexRef.current,
        eventCount: activeEventCountTarget,
      }),
      forceRuleDanger: endlessRuntime ? false : shouldForceAdvancedBrakeRuleDangerEvent({
        level: activeConfig.level,
        ruleDangerEventUsed: ruleDangerEventUsedRef.current,
        eventIndex: hazardIndexRef.current,
        eventCount: activeEventCountTarget,
      }),
      level: activeConfig.level,
      randomValue: Math.random(),
    });

    if (!picked) return;

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
    if (endlessRuntime && nextHazard.top && nextHazard.bottom) {
      setDualLaneWarning(true);
      window.setTimeout(() => setDualLaneWarning(false), 520);
    }

    hazardShownAtRef.current = now();



    if (nextHazard.correctAction === "release") {

      collisionTimerRef.current = window.setTimeout(() => {

        if (!hazardRef.current || hazardRef.current.correctAction !== "release") return;

        if (consumeBigLuckObstacleBreak()) return;

        showAdvancedFeedback("crashed", true);
        const activeEndless = endlessRef.current;
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



    holdSuccessTimerRef.current = window.setTimeout(

      () => {

        const currentHazard = hazardRef.current;

        if (!currentHazard || currentHazard.correctAction !== "hold" || !holdingRef.current) return;

        recordHoldSuccess(currentHazard);

      },

      nextHazard.top === "gray" || nextHazard.bottom === "gray" ? grayHoldMs : eventDurationMs,

    );

  }, [

    activeEventCountTarget,
    allowGray,
    clearTimers,
    config,

    consumeBigLuckObstacleBreak,

    eventDurationMs,

    finish,

    getBigLuckSkill,
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

      if (holdingRef.current && !finishedRef.current) {

        const { hazardWidthPercent, runnerWidthPercent } = trackMetrics;
        const activeEndless = endlessRef.current;
        const activeDistance = activeEndless ? Math.max(endlessDistanceRef.current, activeEndless.score) : 0;
        const activeBrake = activeEndless ? getEndlessBrakingConfig({ distance: activeDistance }) : null;
        const activeSpeedPerSecond = (activeBrake?.roadSpeed ?? speedPerSecond) * (getBigLuckSkill() ? ENDLESS_BIG_LUCK_SPEED_MULTIPLIER : 1);
        const activeReactionWindowMs = activeBrake?.reactionWindowMs ?? reactionWindowMs;
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

        if (activeEndless && hazardRef.current && distanceDelta > 0) {
          const hazard = hazardRef.current;
          const movedHazard = {
            ...hazard,
            x: clamp(hazard.x - distanceDelta, -10, 100),
          };
          hazardRef.current = movedHazard;
          setHazard(movedHazard);
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

          deltaMs: delta,

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

    finish,

    finishSafeDistance,

    getBigLuckSkill,

    reactionWindowMs,

    showAdvancedFeedback,

    speedPerSecond,

    startHazard,

    syncEndlessWaveParallax,

    trackMetrics,

  ]);



  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current || holdingRef.current) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    setAdvancedFeedback("idle");

    setHolding(true);

    holdingRef.current = true;

  };



  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current || !holdingRef.current) return;

    const currentHazard = hazardRef.current;

    const releaseOutcome = getAdvancedBrakeReleaseOutcome(currentHazard);

    setHolding(false);

    holdingRef.current = false;

    if (releaseOutcome.outcome === "pause") return;

    if (releaseOutcome.outcome === "failure") {

      clearTimers();

      if (consumeBigLuckObstacleBreak()) return;

      showAdvancedFeedback("early", true);
      const activeEndless = endlessRef.current;
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

    const activeEndless = endlessRef.current;
    const activeBrake = activeEndless ? getEndlessBrakingConfig({ distance: Math.max(activeEndless.score, endlessDistanceRef.current) }) : null;
    const activeReactionWindowMs = activeBrake?.reactionWindowMs ?? reactionWindowMs;

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
      if (consumeBigLuckObstacleBreak()) return;
      showAdvancedFeedback("crashed", true);
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
        if (latency <= ENDLESS_BRAKING_FAST_REACTION_MS) activeEndless.awardSpecialBonus("快速反应！");
      }
      showAdvancedFeedback("success");
      clearHazardAfterSuccess();
    }

  };



  const showAdvancedBrakingMiniScore = !endless;

  return (

    <div
      className={`braking-panel advanced-braking lanes-${activeLaneCount} ${holding ? "holding" : ""} ${advancedFeedback} ${endless ? "endless-runner" : ""} ${dualLaneWarning ? "dual-lane-warning" : ""}`}
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

        {activeRuleHint ? <div className="advanced-brake-rule-backdrop-text">{activeRuleHint}</div> : null}

        {Array.from({ length: activeLaneCount }, (_, lane) => (

          <div className="advanced-brake-lane" key={lane}>

            {hazard && (lane === 0 ? hazard.top : hazard.bottom) ? (

              <span

                className={`advanced-hazard ${(lane === 0 ? hazard.top : hazard.bottom) === "gray" ? "fake" : "real"}`}

                style={{ left: `${hazard.x}%`, translate: "0 0" }}

              />

            ) : null}

            <span className="advanced-runner" style={{ left: `${progress}%`, translate: "0 0" }}>
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

    const tick = () => {

      const frameNow = now();

      const lastFrameAt = lastFrameAtRef.current || frameNow;

      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
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

export function BrakingRound({ onComplete }: RoundProps) {
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
          trialCount={1}
        />
        <small className="base-practice-message">{practiceMessage}</small>
      </div>
    );
  }

  return <BrakingRoundCore onComplete={onComplete} />;
}
