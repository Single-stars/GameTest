"use client";

/* eslint-disable react-hooks/immutability */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PlayerAvatar, type PlayerAvatarMood, type PlayerAvatarState } from "@/features/player-avatar/player-avatar";
import { getParamNumber, now, pointerKind, rand, ROUND_SETTLEMENT_DELAY_MS, shuffle, trial, type RoundProps, type TrialEvent } from "@/features/rounds/native/shared";

type AdvancedReactionCell = {
  id: number;
  color: "green" | "red" | "idle";
  resultText?: string;
  clicked?: boolean;
};

function reactionAvatarState(cell: AdvancedReactionCell, feedbackTone: "idle" | "good" | "early" = "idle"): PlayerAvatarState {
  if (feedbackTone === "early") return "fail";
  if (feedbackTone === "good" && cell.clicked) return "success";
  return cell.color === "green" ? "idle" : "sleep";
}

function reactionAvatarMood(cell: AdvancedReactionCell, feedbackTone: "idle" | "good" | "early" = "idle"): PlayerAvatarMood {
  if (feedbackTone === "good" && cell.clicked) return "happy";
  if (feedbackTone === "early") return "scared";
  return cell.color === "green" ? "focused" : "sleepy";
}

export function AdvancedReactionRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const lanes = getParamNumber(config, "lanes", 1);
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
  const timersRef = useRef<number[]>([]);
  const completionTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const sequenceRef = useRef<("green" | "red")[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;
  }, []);

  const finish = useCallback(
    (extra?: TrialEvent) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      const finalTrials = extra ? [...trialsRef.current, extra] : trialsRef.current;
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        onComplete(finalTrials);
      }, ROUND_SETTLEMENT_DELAY_MS);
    },
    [clearTimers, onComplete],
  );

  const resetCells = useCallback(() => {
    setCells(Array.from({ length: lanes }, (_, id) => ({ id, color: "idle" })));
    setFeedbackTone("idle");
  }, [lanes]);

  const startSignal = useCallback(() => {
    if (finishedRef.current) return;
    clearTimers();
    resetCells();
    activeGreenIdsRef.current = new Set();
    clickedGreenIdsRef.current = new Set();
    const delay = rand(420, 900);
    timersRef.current.push(
      window.setTimeout(() => {
        const shownAt = now();
        activeShownAtRef.current = shownAt;
        if (isBoss) {
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
                finish();
              } else {
                startSignal();
              }
            } else {
              startSignal();
            }
          }, 1120),
        );
      }, delay),
    );
  }, [clearTimers, config.variant, finish, isBoss, lanes, requiredGreenClicks, resetCells, totalSignals]);

  useEffect(() => {
    if (!isBoss) {
      const colors = Array.from({ length: totalSignals }, () => (Math.random() > 0.42 ? "green" : "red") as "green" | "red");
      if (!colors.includes("green")) colors[Math.floor(rand(0, colors.length))] = "green";
      sequenceRef.current = colors;
    }
    startSignal();
    return clearTimers;
  }, [clearTimers, isBoss, startSignal, totalSignals]);

  const clickCell = (event: ReactPointerEvent<HTMLButtonElement>, cell: AdvancedReactionCell) => {
    if (finishedRef.current || cell.color === "idle" || cell.clicked) {
      setFeedbackTone("early");
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

    if (greenClicksRef.current >= requiredGreenClicks && (isBoss || config.variant === "reaction-dual-green")) {
      finish();
      return;
    }
    if (!isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      signalIndexRef.current += 1;
      if (signalIndexRef.current >= totalSignals) {
        finish();
      } else {
        timersRef.current.push(window.setTimeout(startSignal, 240));
      }
      return;
    }
    if (isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      timersRef.current.push(window.setTimeout(startSignal, 240));
    }
  };

  return (
    <div className={`advanced-reaction-grid cells-${lanes} ${feedbackTone}`}>
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
              mood={reactionAvatarMood(cell, feedbackTone)}
              size={120}
              state={reactionAvatarState(cell, feedbackTone)}
            />
          </span>
          {cell.clicked && cell.resultText ? <span className="reaction-result-text">{cell.resultText}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function ReactionRound({ onComplete }: RoundProps) {
  const [status, setStatus] = useState<"waiting" | "ready" | "feedback">("waiting");
  const [feedbackTone, setFeedbackTone] = useState<"idle" | "good" | "early">("idle");
  const [message, setMessage] = useState("");
  const trialsRef = useRef<TrialEvent[]>([]);
  const scheduledAtRef = useRef(0);
  const plannedReadyAtRef = useRef(0);
  const shownAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const stepRef = useRef(1);
  const finishedRef = useRef(false);
  const answeredRef = useRef(false);

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
    const delay = rand(900, 2200);
    scheduledAtRef.current = scheduledAt;
    plannedReadyAtRef.current = scheduledAt + delay;

    readyTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = now();
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
        if (nextStep >= 3) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(nextStep + 1);
        }
      }, 360);
    }, delay + 1800);
  }, [onComplete]);

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
        if (stepRef.current >= 3) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, 360);
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
      setMessage(`${Math.round(responseAt - shownAtRef.current)} ms`);

      transitionTimerRef.current = window.setTimeout(() => {
        if (stepRef.current >= 3) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, 360);
    }
  };

  return (
    <div className={`test-pad reaction-pad ${status} ${feedbackTone}`} aria-label="reaction area" role="button" tabIndex={0} onPointerDown={tap}>
      <span className="reaction-pad-avatar" aria-hidden="true">
        <PlayerAvatar
          mood={feedbackTone === "good" ? "happy" : feedbackTone === "early" ? "scared" : status === "waiting" ? "sleepy" : "focused"}
          size={144}
          state={feedbackTone === "good" ? "success" : feedbackTone === "early" ? "fail" : status === "waiting" ? "sleep" : "idle"}
        />
      </span>
      {message ? <span className="reaction-result-text">{message}</span> : null}
    </div>
  );
}
