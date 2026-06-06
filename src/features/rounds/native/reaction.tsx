"use client";

/* eslint-disable react-hooks/immutability */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PlayerAvatar, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { DifficultyWaveBackdrop } from "@/features/visuals/difficulty-wave-backdrop";
import { getEndlessReactionConfig } from "@/lib/endless-mode";
import {
  getParamNumber,
  getReactionSignalDelayMs,
  now,
  pointerKind,
  rand,
  REACTION_MIN_SIGNAL_INTERVAL_MS,
  ROUND_SETTLEMENT_DELAY_MS,
  shuffle,
  trial,
  type RoundProps,
  type TrialEvent,
} from "@/features/rounds/native/shared";

type AdvancedReactionCell = {
  id: number;
  color: "green" | "red" | "idle";
  resultText?: string;
  clicked?: boolean;
};

function reactionAvatarView(cell: AdvancedReactionCell, feedbackTone: "idle" | "good" | "early" = "idle"): PlayerAvatarView {
  if (feedbackTone === "early") return { action: "hit", expression: "hurt" };
  if (feedbackTone === "good" && cell.clicked) return { action: "celebrate", expression: "happy", effect: "sparkles" };
  return cell.color === "green" ? { action: "idle", expression: "neutral" } : { action: "sleep", expression: "sleepy" };
}

const REACTION_FEEDBACK_DELAY_MS = 620;
const ENDLESS_REACTION_PREDICTION_MS = 100;
const ENDLESS_REACTION_LANE_CHANGE_BUFFER_MS = 1000;
const ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MIN_MS = 100;
const ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MAX_MS = 500;
const ENDLESS_GREEN_LIGHT_MIN_SIGNAL_INTERVAL_MS = 0;

export function AdvancedReactionRound({ advancedConfig, endless, onComplete, shielded = false }: RoundProps) {
  const config = advancedConfig!;
  const endlessSignalConfig = endless ? getEndlessReactionConfig({ score: Math.max(endless.score, endless.debugDifficulty * 90) }) : null;

  const targetLaneCount = endlessSignalConfig?.lanes ?? getParamNumber(config, "lanes", 1);
  const [activeLaneCount, setActiveLaneCount] = useState(targetLaneCount);
  const [laneTransitioning, setLaneTransitioning] = useState(false);
  const lanes = activeLaneCount;
  const isBoss = config.variant === "reaction-grid-boss";
  const totalSignals = getParamNumber(config, "signalCount", getParamNumber(config, "requiredGreenClicks", 5));
  const requiredGreenClicks = getParamNumber(config, "requiredGreenClicks", 1);
  const [cells, setCells] = useState<AdvancedReactionCell[]>(() =>
    Array.from({ length: lanes }, (_, id) => ({ id, color: "idle" })),
  );
  const [feedbackTone, setFeedbackTone] = useState<"idle" | "good" | "early">("idle");
  const trialsRef = useRef<TrialEvent[]>([]);
  const signalIndexRef = useRef(0);
  const greenClicksRef = useRef(0);
  const activeShownAtRef = useRef(0);
  const activeGreenIdsRef = useRef<Set<number>>(new Set());
  const clickedGreenIdsRef = useRef<Set<number>>(new Set());
  const lastSignalShownAtRef = useRef(0);

  const timersRef = useRef<number[]>([]);
  const laneChangeTimerRef = useRef<number | null>(null);
  const laneTransitioningRef = useRef(false);
  const restartSignalAfterLaneChangeRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const endlessRef = useRef(endless);
  const sequenceRef = useRef<("green" | "red")[]>([]);

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  const setLaneTransitionState = useCallback((nextTransitioning: boolean) => {
    laneTransitioningRef.current = nextTransitioning;
    setLaneTransitioning(nextTransitioning);
  }, []);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;
  }, []);

  const finish = useCallback(
    (extra?: TrialEvent, delayMs = ROUND_SETTLEMENT_DELAY_MS) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      const finalTrials = extra ? [...trialsRef.current, extra] : trialsRef.current;
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        onComplete(finalTrials);
      }, delayMs);
    },
    [clearTimers, onComplete],
  );

  const finishAfterFeedback = useCallback(
    (extra?: TrialEvent) => {
      finish(extra, REACTION_FEEDBACK_DELAY_MS);
    },
    [finish],
  );

  const resetCells = useCallback(() => {
    setCells(Array.from({ length: lanes }, (_, id) => ({ id, color: "idle" })));
    setFeedbackTone("idle");
  }, [lanes]);

  const startSignal = useCallback(() => {
    if (finishedRef.current || laneTransitioningRef.current) return;
    clearTimers();
    resetCells();
    activeGreenIdsRef.current = new Set();
    clickedGreenIdsRef.current = new Set();
    const greenLightSkillActive = endlessRef.current?.getActiveSkill()?.kind === "green-light";
    const delay = getReactionSignalDelayMs({
      lastShownAtMs: lastSignalShownAtRef.current,
      minIntervalMs: greenLightSkillActive ? ENDLESS_GREEN_LIGHT_MIN_SIGNAL_INTERVAL_MS : REACTION_MIN_SIGNAL_INTERVAL_MS,
      nowMs: now(),
      randomDelayMs: greenLightSkillActive ? rand(ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MIN_MS, ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MAX_MS) : rand(420, 900),
    });
    timersRef.current.push(
      window.setTimeout(() => {
        const shownAt = now();
        activeShownAtRef.current = shownAt;
        lastSignalShownAtRef.current = shownAt;
        const endlessRuntime = endlessRef.current;
        if (endlessRuntime) {
          const signalConfig = getEndlessReactionConfig({ score: Math.max(endlessRuntime.score, endlessRuntime.debugDifficulty * 90) });
          const litCount = lanes > 1 && Math.random() < signalConfig.simultaneousGreenChance ? Math.min(2, lanes) : 1;
          const ids = shuffle(Array.from({ length: lanes }, (_, id) => id)).slice(0, litCount);
          const colors = ids.map(() => (Math.random() < signalConfig.redChance ? "red" : "green") as "green" | "red");

          if (!colors.includes("green") && Math.random() > 0.35) colors[0] = "green";

          const greenIds = new Set(ids.filter((_, index) => colors[index] === "green"));
          activeGreenIdsRef.current = greenIds;
          setCells((current) =>
            current.map((cell) => {
              const litIndex = ids.indexOf(cell.id);
              if (litIndex < 0) return { ...cell, color: "idle", clicked: false, resultText: undefined };
              return { ...cell, color: colors[litIndex], clicked: false, resultText: undefined };
            }),
          );
        } else if (isBoss) {
          const litCount = Math.random() > 0.52 ? 2 : 1;
          const ids = shuffle(Array.from({ length: lanes }, (_, id) => id)).slice(0, litCount);
          const remaining = requiredGreenClicks - greenClicksRef.current;
          const colors = ids.map(() => (Math.random() > 0.45 ? "green" : "red") as "green" | "red");
          if (remaining > 0 && !colors.includes("green")) colors[0] = "green";
          const greenIds = new Set(ids.filter((_, index) => colors[index] === "green"));
          activeGreenIdsRef.current = greenIds;
          setCells((current) =>
            current.map((cell) => {
              const litIndex = ids.indexOf(cell.id);
              if (litIndex < 0) return { ...cell, color: "idle", clicked: false, resultText: undefined };
              const color = colors[litIndex];
              return { ...cell, color, clicked: false, resultText: undefined };
            }),
          );
        } else {
          const activeId = lanes === 1 ? 0 : Math.floor(rand(0, lanes));
          const plannedColor = sequenceRef.current[signalIndexRef.current];
          const color: "green" | "red" = config.variant === "reaction-dual-green" ? "green" : plannedColor === "red" ? "red" : "green";
          if (color === "green") activeGreenIdsRef.current = new Set([activeId]);
          setCells((current) =>
            current.map((cell) =>
              cell.id === activeId
                ? { ...cell, color, clicked: false, resultText: undefined }
                : { ...cell, color: "idle", clicked: false, resultText: undefined },
            ),
          );
        }

        timersRef.current.push(
          window.setTimeout(() => {
            if (finishedRef.current) return;
            const greenIds = activeGreenIdsRef.current;
            if (greenIds.size > 0 && clickedGreenIdsRef.current.size < greenIds.size) {
              setFeedbackTone("early");
              const endlessRuntime = endlessRef.current;
              if (endlessRuntime) {
                if (endlessRuntime.loseLife("timeout", REACTION_FEEDBACK_DELAY_MS)) {
                  clearTimers();
                  timersRef.current.push(window.setTimeout(startSignal, REACTION_FEEDBACK_DELAY_MS));
                } else {
                  finishedRef.current = true;
                  clearTimers();
                }
                return;
              }
              finish(
                trial("reaction", signalIndexRef.current, {
                  shownAt,
                  responseAt: null,
                  correct: false,
                  errorType: "timeout",
                  value: { signalColor: "green" },
                }),
              );
              return;
            }

            if (endlessRef.current) {
              startSignal();
              return;
            }

            if (!isBoss) {
              const color = sequenceRef.current[signalIndexRef.current] ?? "green";
              if (color === "red") {
                trialsRef.current.push(
                  trial("reaction", signalIndexRef.current, {
                    shownAt,
                    responseAt: null,
                    correct: true,
                    value: { signalColor: "red" },
                  }),
                );
                signalIndexRef.current += 1;
              }
              if (signalIndexRef.current >= totalSignals) {
                setFeedbackTone("good");
                finishAfterFeedback();
              } else {
                startSignal();
              }
            } else {
              startSignal();
            }
          }, endlessSignalConfig?.thresholdMs ?? 1120),
        );
      }, delay),
    );
  }, [clearTimers, config.variant, endlessSignalConfig?.thresholdMs, finish, finishAfterFeedback, isBoss, lanes, requiredGreenClicks, resetCells, totalSignals]);

  useEffect(() => {
    if (targetLaneCount === activeLaneCount) {
      if (laneChangeTimerRef.current !== null) window.clearTimeout(laneChangeTimerRef.current);
      laneChangeTimerRef.current = null;
      if (restartSignalAfterLaneChangeRef.current) {
        restartSignalAfterLaneChangeRef.current = false;
        startSignal();
      }
      return;
    }

    if (laneChangeTimerRef.current !== null) window.clearTimeout(laneChangeTimerRef.current);
    laneChangeTimerRef.current = null;
    restartSignalAfterLaneChangeRef.current = false;
    clearTimers();
    activeGreenIdsRef.current = new Set();
    clickedGreenIdsRef.current = new Set();
    laneTransitioningRef.current = true;
    laneChangeTimerRef.current = window.setTimeout(() => {
      setCells(Array.from({ length: activeLaneCount }, (_, id) => ({ id, color: "idle" })));
      setFeedbackTone("idle");
      setLaneTransitionState(true);
      laneChangeTimerRef.current = window.setTimeout(() => {
        laneChangeTimerRef.current = null;
        activeGreenIdsRef.current = new Set();
        clickedGreenIdsRef.current = new Set();
        laneTransitioningRef.current = false;
        restartSignalAfterLaneChangeRef.current = true;
        setActiveLaneCount(targetLaneCount);
        setCells(Array.from({ length: targetLaneCount }, (_, id) => ({ id, color: "idle" })));
        setFeedbackTone("idle");
        setLaneTransitioning(false);
      }, ENDLESS_REACTION_LANE_CHANGE_BUFFER_MS);
    }, 0);

    return () => {
      if (laneChangeTimerRef.current !== null) window.clearTimeout(laneChangeTimerRef.current);
      laneChangeTimerRef.current = null;
    };
  }, [activeLaneCount, clearTimers, setLaneTransitionState, startSignal, targetLaneCount]);

  useEffect(() => {
    if (!endlessRef.current && !isBoss) {
      const colors = Array.from({ length: totalSignals }, () => (Math.random() > 0.42 ? "green" : "red") as "green" | "red");
      if (!colors.includes("green")) colors[Math.floor(rand(0, colors.length))] = "green";
      sequenceRef.current = colors;
    }
    startSignal();
    return clearTimers;
  }, [clearTimers, isBoss, startSignal, totalSignals]);

  const clickCell = (event: ReactPointerEvent<HTMLButtonElement>, cell: AdvancedReactionCell) => {
    if (laneTransitioningRef.current) return;
    if (finishedRef.current || cell.color === "idle" || cell.clicked) {
      setFeedbackTone("early");
      const endlessRuntime = endlessRef.current;
      if (endlessRuntime) {
        if (endlessRuntime.loseLife("wrong", REACTION_FEEDBACK_DELAY_MS)) {
          clearTimers();
          timersRef.current.push(window.setTimeout(startSignal, REACTION_FEEDBACK_DELAY_MS));
        } else {
          finishedRef.current = true;
          clearTimers();
        }
        return;
      }
      finish(
        trial("reaction", signalIndexRef.current, {
          shownAt: activeShownAtRef.current || now(),
          responseAt: now(),
          correct: false,
          errorType: "wrong",
          pointerType: pointerKind(event.pointerType),
          value: { signalColor: "idle" },
        }),
      );
      return;
    }
    if (cell.color === "red") {
      setFeedbackTone("early");
      const endlessRuntime = endlessRef.current;
      if (endlessRuntime) {
        if (endlessRuntime.loseLife("false_alarm", REACTION_FEEDBACK_DELAY_MS)) {
          clearTimers();
          timersRef.current.push(window.setTimeout(startSignal, REACTION_FEEDBACK_DELAY_MS));
        } else {
          finishedRef.current = true;
          clearTimers();
        }
        return;
      }
      finish(
        trial("reaction", signalIndexRef.current, {
          shownAt: activeShownAtRef.current,
          responseAt: now(),
          correct: false,
          errorType: "false_alarm",
          pointerType: pointerKind(event.pointerType),
          value: { signalColor: "red" },
        }),
      );
      return;
    }

    const responseAt = now();
    const ms = Math.round(responseAt - activeShownAtRef.current);
    clickedGreenIdsRef.current.add(cell.id);
    greenClicksRef.current += 1;
    const endlessRuntime = endlessRef.current;
    const greenLightSkillActive = endlessRuntime?.getActiveSkill()?.kind === "green-light";
    if (endlessRuntime) endlessRuntime.addScore(greenLightSkillActive ? 2 : 1);
    if (endlessRuntime && ms <= ENDLESS_REACTION_PREDICTION_MS) endlessRuntime.awardSpecialBonus("顶级预判！");
    setFeedbackTone("good");
    trialsRef.current.push(
      trial("reaction", signalIndexRef.current, {
        shownAt: activeShownAtRef.current,
        responseAt,
        correct: true,
        pointerType: pointerKind(event.pointerType),
        value: { signalColor: "green" },
      }),
    );
    setCells((current) => current.map((item) => (item.id === cell.id ? { ...item, clicked: true, resultText: `${ms} ms` } : item)));

    if (endlessRef.current && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      clearTimers();
      timersRef.current.push(window.setTimeout(startSignal, REACTION_FEEDBACK_DELAY_MS));
      return;
    }

    if (greenClicksRef.current >= requiredGreenClicks && (isBoss || config.variant === "reaction-dual-green")) {
      finishAfterFeedback();
      return;
    }
    if (!isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      signalIndexRef.current += 1;
      if (signalIndexRef.current >= totalSignals) {
        finishAfterFeedback();
      } else {
        timersRef.current.push(window.setTimeout(startSignal, REACTION_FEEDBACK_DELAY_MS));
      }
      return;
    }
    if (isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      timersRef.current.push(window.setTimeout(startSignal, REACTION_FEEDBACK_DELAY_MS));
    }
  };

  return (
    <div className={`advanced-reaction-grid cells-${lanes} ${laneTransitioning ? "lane-transitioning" : ""} ${feedbackTone}`}>
      <DifficultyWaveBackdrop />
      {cells.map((cell) => (
        <button
          className={`advanced-reaction-cell ${cell.color} ${cell.clicked ? "clicked" : ""}`}
          aria-label={cell.clicked && cell.resultText ? cell.resultText : "reaction signal"}
          key={cell.id}
          type="button"
          onPointerDown={(event) => clickCell(event, cell)}
        >
          <span className="reaction-cell-avatar" aria-hidden="true">
            <PlayerAvatar
              {...reactionAvatarView(cell, feedbackTone)}
              effect={shielded ? "shield" : reactionAvatarView(cell, feedbackTone).effect}
              size={120}
            />
          </span>
          {cell.clicked && cell.resultText ? <span className="reaction-result-text">{cell.resultText}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ReactionRoundCore({
  onComplete,
  onPracticeSuccess,
  trialCount = 3,
}: RoundProps & { onPracticeSuccess?: () => void; trialCount?: number }) {
  const [status, setStatus] = useState<"waiting" | "ready" | "feedback">("waiting");
  const [feedbackTone, setFeedbackTone] = useState<"idle" | "good" | "early">("idle");
  const [message, setMessage] = useState("");
  const trialsRef = useRef<TrialEvent[]>([]);
  const scheduledAtRef = useRef(0);
  const plannedReadyAtRef = useRef(0);
  const shownAtRef = useRef(0);
  const lastSignalShownAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const stepRef = useRef(1);
  const finishedRef = useRef(false);
  const answeredRef = useRef(false);

  function getReactionCompletionDelay(step: number, trialCount: number) {
    void step;
    void trialCount;
    return REACTION_FEEDBACK_DELAY_MS;
  }

  const startStep = useCallback((nextStep: number) => {
    if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);

    stepRef.current = nextStep;
    answeredRef.current = false;
    setStatus("waiting");
    setFeedbackTone("idle");
    setMessage("");
    const scheduledAt = now();
    const delay = getReactionSignalDelayMs({
      lastShownAtMs: lastSignalShownAtRef.current,
      minIntervalMs: REACTION_MIN_SIGNAL_INTERVAL_MS,
      nowMs: scheduledAt,
      randomDelayMs: rand(900, 2200),
    });
    scheduledAtRef.current = scheduledAt;
    plannedReadyAtRef.current = scheduledAt + delay;

    readyTimerRef.current = window.setTimeout(() => {
      const shownAt = now();
      shownAtRef.current = shownAt;
      lastSignalShownAtRef.current = shownAt;
      setStatus("ready");
      setMessage("");
    }, delay);

    timeoutRef.current = window.setTimeout(() => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      trialsRef.current.push(
        trial("reaction", nextStep, {
          scheduledAt,
          shownAt: shownAtRef.current || scheduledAt + delay,
          responseAt: null,
          correct: false,
          errorType: "timeout",
        }),
      );
      setStatus("feedback");
      setFeedbackTone("early");
      setMessage("");
      transitionTimerRef.current = window.setTimeout(() => {
        if (nextStep >= trialCount) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(nextStep + 1);
        }
      }, getReactionCompletionDelay(nextStep, trialCount));
    }, delay + 1800);
  }, [onComplete, trialCount]);

  useEffect(() => {
    startStep(1);
    return () => {
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [startStep]);

  const tap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current) return;
    if (answeredRef.current) return;

    if (status === "waiting") {
      answeredRef.current = true;
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      const responseAt = now();
      trialsRef.current.push(
        trial("reaction", stepRef.current, {
          scheduledAt: scheduledAtRef.current,
          shownAt: plannedReadyAtRef.current,
          responseAt,
          correct: false,
          errorType: "early",
          pointerType: pointerKind(event.pointerType),
        }),
      );
      setStatus("feedback");
      setFeedbackTone("early");
      setMessage("");
      transitionTimerRef.current = window.setTimeout(() => {
        if (stepRef.current >= trialCount) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, getReactionCompletionDelay(stepRef.current, trialCount));
      return;
    }

    if (status === "ready") {
      answeredRef.current = true;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      const responseAt = now();
      trialsRef.current.push(
        trial("reaction", stepRef.current, {
          scheduledAt: shownAtRef.current,
          shownAt: shownAtRef.current,
          responseAt,
          correct: true,
          pointerType: pointerKind(event.pointerType),
        }),
      );
      setStatus("feedback");
      setFeedbackTone("good");
      onPracticeSuccess?.();

      setMessage(`${Math.round(responseAt - shownAtRef.current)} ms`);

      transitionTimerRef.current = window.setTimeout(() => {
        if (stepRef.current >= trialCount) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, getReactionCompletionDelay(stepRef.current, trialCount));
    }
  };

  return (
    <div className={`test-pad reaction-pad ${status} ${feedbackTone}`} aria-label="reaction area" role="button" tabIndex={0} onPointerDown={tap}>
      <span className="reaction-pad-avatar" aria-hidden="true">
        <PlayerAvatar
          action={feedbackTone === "good" ? "celebrate" : feedbackTone === "early" ? "hit" : status === "waiting" ? "sleep" : "idle"}
          effect={feedbackTone === "good" ? "sparkles" : "none"}
          expression={feedbackTone === "good" ? "happy" : feedbackTone === "early" ? "hurt" : status === "waiting" ? "sleepy" : "neutral"}
          size={144}
        />
      </span>
      {message ? <span className="reaction-result-text">{message}</span> : null}
    </div>
  );
}

function reactionPracticeMessage(trials: TrialEvent[]) {
  const first = trials[0];
  if (first?.correct === true) return "";
  if (first?.errorType === "early") return "太早了，看到绿灯再点。再试一次";
  if (first?.errorType === "timeout") return "慢了，绿灯出现后要立刻点。再试一次";
  return "看到绿灯再点。再试一次";
}

export function ReactionRound({ onComplete }: RoundProps) {
  const [practicePassed, setPracticePassed] = useState(false);
  const [practiceKey, setPracticeKey] = useState(0);
  const [practiceMessage, setPracticeMessage] = useState("试一次：看到绿灯后点一下");

  const completePractice = useCallback((practiceTrials: TrialEvent[]) => {
    if (practiceTrials.some((item) => item.correct === true)) {
      setPracticePassed(true);
      return;
    }
    setPracticeMessage(reactionPracticeMessage(practiceTrials));
    setPracticeKey((current) => current + 1);
  }, []);

  if (!practicePassed) {
    return (
      <div className="base-practice-wrap">
        <ReactionRoundCore
          key={`reaction-practice-${practiceKey}`}
          onComplete={completePractice}
          onPracticeSuccess={() => setPracticeMessage("")}
          trialCount={1}
        />
        <small className="base-practice-message">{practiceMessage}</small>
      </div>
    );
  }

  return <ReactionRoundCore onComplete={onComplete} />;
}
