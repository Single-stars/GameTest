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
import {
  getAdvancedBrakeDangerLeft,
  getAdvancedBrakeEventOptions,
  getAdvancedBrakeHasReachedFinish,
  getAdvancedBrakeRuleHint,
  getAdvancedBrakeReleaseOutcome,
  getAdvancedBrakeSchedulerStep,
  type AdvancedBrakeAction,
  type AdvancedBrakeEvent,
} from "@/lib/advanced-challenges";
import { DINO_SAFE_STOP_WINDOW_MS, resolveDinoStop } from "@/lib/scoring";
import {
  clamp,
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

function resolveAdvancedBrakingAvatarView(holding: boolean, feedback: AdvancedBrakingFeedback): PlayerAvatarView {
  if (feedback === "success") return { action: "celebrate", expression: "happy", effect: "sparkles" };
  if (feedback === "crashed") return { action: "hit", expression: "hurt" };
  if (feedback === "early") return { action: "hit", expression: "hurt" };
  if (holding) return { action: "move", expression: "neutral" };
  return { action: "idle", expression: "neutral" };
}

export function AdvancedBrakingRound({ advancedConfig, onComplete }: RoundProps) {

  const config = advancedConfig!;

  const lanes = getParamNumber(config, "lanes", 1);

  const eventCountMin = getParamNumber(config, "eventCountMin", getParamNumber(config, "hazardCount", 2));

  const eventCountMax = getParamNumber(config, "eventCountMax", eventCountMin);

  const reactionWindowMs = getParamNumber(config, "reactionWindowMs", 340);

  const eventDurationMs = getParamNumber(config, "eventDurationMs", 600);

  const grayHoldMs = getParamNumber(config, "grayHoldMs", eventDurationMs);

  const minEventDelayMs = getParamNumber(config, "minEventDelayMs", 900);

  const maxEventDelayMs = getParamNumber(config, "maxEventDelayMs", 1500);

  const speedPerSecond = getParamNumber(config, "speedPerSecond", 10);

  const finishSafeDistance = getParamNumber(config, "finishSafeDistance", 12);
  const ruleHint = getAdvancedBrakeRuleHint(config.level, config.params.dualRule);

  const eventCountTarget = useMemo(

    () => Math.floor(rand(eventCountMin, eventCountMax + 1)),

    [eventCountMax, eventCountMin],

  );

  const initialEventDelayMs = useMemo(() => rand(minEventDelayMs, maxEventDelayMs), [maxEventDelayMs, minEventDelayMs]);

  const [progress, setProgress] = useState(0);

  const [holding, setHolding] = useState(false);

  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);

  const progressRef = useRef(0);

  const holdingRef = useRef(false);

  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);

  const hazardShownAtRef = useRef<number | null>(null);

  const eventTimerRef = useRef(initialEventDelayMs);

  const hazardIndexRef = useRef(0);

  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);

  const trialsRef = useRef<TrialEvent[]>([]);

  const frameRef = useRef<number | null>(null);

  const lastFrameAtRef = useRef(0);

  const collisionTimerRef = useRef<number | null>(null);

  const holdSuccessTimerRef = useRef<number | null>(null);

  const feedbackTimerRef = useRef<number | null>(null);

  const finishedRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);

  const trackRef = useRef<HTMLDivElement | null>(null);

  const [advancedFeedback, setAdvancedFeedback] = useState<AdvancedBrakingFeedback>("idle");

  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });



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

      showAdvancedFeedback("success");

      clearHazardAfterSuccess();

    },

    [clearHazardAfterSuccess, showAdvancedFeedback],

  );



  const startHazard = useCallback(() => {

    if (hazardRef.current || finishedRef.current) return;

    const options = getAdvancedBrakeEventOptions(config.level, {

      eventIndex: hazardIndexRef.current,

      eventCount: eventCountTarget,

      previousEvent: previousHazardRef.current,

    });

    const picked = options[Math.floor(rand(0, options.length))] ?? options[0];

    if (!picked) return;

    const hazardLeft = getAdvancedBrakeDangerLeft({

      runnerLeftPercent: progressRef.current,

      runnerWidthPercent: trackMetrics.runnerWidthPercent,

      hazardWidthPercent: trackMetrics.hazardWidthPercent,

      speedPerSecond,

      reactionWindowMs,

    });

    if (hazardLeft === null) {

      resetEventTimer();

      return;

    }

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

        showAdvancedFeedback("crashed", true);

        finish(

          trial("braking", hazardIndexRef.current, {

            shownAt: hazardShownAtRef.current ?? now(),

            responseAt: now(),

            correct: false,

            errorType: "collision",

            value: { collision: true, fakeStop: false, exited: false, signal: "red" },

          }),

        );

      }, reactionWindowMs);

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

    config.level,

    eventCountTarget,

    eventDurationMs,

    finish,

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

        const finishLeft = Math.max(0, 100 - runnerWidthPercent);

        const next = clamp(progressRef.current + (delta * speedPerSecond) / 1000, 0, finishLeft);

        progressRef.current = next;

        setProgress(next);

        if (getAdvancedBrakeHasReachedFinish({ runnerLeftPercent: next, runnerWidthPercent })) {

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

            speedPerSecond,

            reactionWindowMs,

          }) !== null;

        const scheduleStep = getAdvancedBrakeSchedulerStep({

          holding: holdingRef.current,

          activeEvent: hazardRef.current !== null,

          eventTimerMs: eventTimerRef.current,

          deltaMs: delta,

          eventCountUsed: hazardIndexRef.current,

          eventCountTarget,

          nearFinish: !canPlaceNextDanger || next >= 100 - finishSafeDistance,

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

    eventCountTarget,

    finish,

    finishSafeDistance,

    reactionWindowMs,

    showAdvancedFeedback,

    speedPerSecond,

    startHazard,

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

      showAdvancedFeedback("early", true);

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

    const correct = latency <= reactionWindowMs;

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
      finish();
    }

    else {
      showAdvancedFeedback("success");
      clearHazardAfterSuccess();
    }

  };



  return (

    <div
      className={`braking-panel advanced-braking lanes-${lanes} ${holding ? "holding" : ""} ${advancedFeedback}`}
      role="application"
      aria-label="长按游戏区域前进，松手急停"
      onPointerCancel={release}
      onPointerDown={begin}
      onPointerUp={release}
    >
      <div className="mini-score">

        <span>{Math.round(Math.min(100, progress + trackMetrics.runnerWidthPercent))}%</span>
        {ruleHint ? <span>{ruleHint}</span> : null}

      </div>

      <div className="advanced-brake-track" aria-hidden="true" ref={trackRef}>

        {Array.from({ length: lanes }, (_, lane) => (

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

export function BrakingRound({ onComplete }: RoundProps) {
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
        if (index >= DINO_TRIAL_COUNT - 1) onComplete([...trialsRef.current]);
        else start(index + 1);
      }, delayMs);
    },
    [index, onComplete, start],
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
      eventCount: DINO_TRIAL_COUNT,
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
  }, [completeTrial, index, trackMetrics.hazardWidthPercent, trackMetrics.runnerWidthPercent]);


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

        <span>{index + 1}/{DINO_TRIAL_COUNT}</span>
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
