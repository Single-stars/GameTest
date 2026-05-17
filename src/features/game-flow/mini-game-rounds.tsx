"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MiniGameEmbeddedStage } from "@/features/mini-games/embedded-stage";
import { MINI_GAME_COMPLETION_DELAY_MS, type MiniGameCompletion } from "@/features/mini-games/common";
import { type AdvancedStageConfig } from "@/lib/advanced-challenges";
import {
  createMiniGameRunSeed,
  type MiniGameId,
} from "@/lib/mini-games";
import { type RoundId, type TrialEvent } from "@/lib/scoring";
import { getRoundDefinition } from "@/features/rounds/registry";

const now = () => performance.now();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function viewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

function trial(
  roundId: RoundId,
  trialIndex: number,
  patch: Omit<Partial<TrialEvent>, "roundId" | "trialIndex" | "viewport"> = {},
): TrialEvent {
  return {
    roundId,
    trialIndex,
    pointerType: "unknown",
    viewport: viewport(),
    scheduledAt: patch.scheduledAt ?? now(),
    shownAt: patch.shownAt ?? now(),
    responseAt: patch.responseAt ?? null,
    correct: patch.correct ?? null,
    errorType: patch.errorType,
    target: patch.target,
    value: patch.value,
  };
}

function numberStat(outcome: MiniGameCompletion, key: string, fallback = 0) {
  const value = Number(outcome.stats[key]);
  return Number.isFinite(value) ? value : fallback;
}

function miniGameBaseScore(outcome: MiniGameCompletion) {
  const failures = numberStat(outcome, "failures");
  if (outcome.gameId === "knife") {
    const hits = numberStat(outcome, "hits");
    const shotCount = Math.max(1, numberStat(outcome, "shotCount", 6));
    return Math.round(clamp((hits / shotCount) * 100 - failures * 8, 0, 100));
  }
  const progress = numberStat(outcome, "progressPercent");
  const passBonus = outcome.status === "passed" ? 8 : 0;
  return Math.round(clamp(progress + passBonus - failures * 16, 0, 100));
}

function miniGameFailureError(outcome: MiniGameCompletion): TrialEvent["errorType"] | undefined {
  if (outcome.status === "passed") return undefined;
  if (outcome.reason.includes("边界") || outcome.reason.includes("掉出")) return "miss";
  if (outcome.reason.includes("倒计时")) return "timeout";
  return "collision";
}

function miniGameValue(mode: string, outcome: MiniGameCompletion, score: number) {
  return {
    mode,
    miniGameId: outcome.gameId,
    miniLevelId: outcome.levelId,
    passed: outcome.status === "passed",
    score,
    reason: outcome.reason,
    elapsedMs: outcome.elapsedMs,
    failures: numberStat(outcome, "failures"),
    progressPercent: numberStat(outcome, "progressPercent", outcome.status === "passed" ? 100 : 0),
    hits: numberStat(outcome, "hits"),
    shotCount: numberStat(outcome, "shotCount"),
    gateCount: numberStat(outcome, "gateCount"),
    passedGates: numberStat(outcome, "passedGates"),
    forcedAdvance: outcome.stats.forcedAdvance === true,
  };
}

export function miniGameIdForBaseRound(round: RoundId): MiniGameId | null {
  const implementation = getRoundDefinition(round).base;
  return implementation.type === "mini-game" ? implementation.gameId : null;
}

export type MiniAdvancedStageConfig = AdvancedStageConfig & { params: AdvancedStageConfig["params"] & { miniGameId: MiniGameId; miniLevelId: string } };

export function isMiniGameAdvancedConfig(config?: AdvancedStageConfig): config is MiniAdvancedStageConfig {
  const miniGameIds: MiniGameId[] = ["doodle", "flappy", "knife", "square-jump", "fall-down"];
  return (
    typeof config?.params.miniGameId === "string" &&
    miniGameIds.includes(config.params.miniGameId as MiniGameId) &&
    typeof config.params.miniLevelId === "string"
  );
}

export function MiniGameBaseRound({
  gameId,
  onComplete,
  round,
}: {
  gameId: MiniGameId;
  onComplete: (trials: TrialEvent[]) => void;
  round: RoundId;
}) {
  const levelId = `${gameId}-base`;
  const [runId] = useState(() => Date.now());
  const shownAtRef = useRef(now());
  const completionTimerRef = useRef<number | null>(null);
  const runSeed = useMemo(() => createMiniGameRunSeed(levelId, runId), [levelId, runId]);
  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    };
  }, []);
  const handleComplete = useCallback(
    (outcome: MiniGameCompletion) => {
      const score = miniGameBaseScore(outcome);
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
      const timer = window.setTimeout(() => {
        completionTimerRef.current = null;
        onComplete([
          trial(round, 0, {
            shownAt: shownAtRef.current,
            responseAt: shownAtRef.current + outcome.elapsedMs,
            correct: outcome.status === "passed" && score >= 60,
            errorType: miniGameFailureError(outcome),
            value: miniGameValue(`mini-${gameId}-base`, outcome, score),
          }),
        ]);
      }, MINI_GAME_COMPLETION_DELAY_MS);
      completionTimerRef.current = timer;
    },
    [gameId, onComplete, round],
  );

  return (
    <MiniGameEmbeddedStage
      gameId={gameId}
      levelId={levelId}
      mode="base"
      onComplete={handleComplete}
      runSeed={runSeed}
    />
  );
}

export function MiniGameAdvancedRound({ advancedConfig, onComplete }: { advancedConfig: MiniAdvancedStageConfig; onComplete: (trials: TrialEvent[]) => void }) {
  const config = advancedConfig;
  const [runId] = useState(() => Date.now());
  const shownAtRef = useRef(now());
  const completionTimerRef = useRef<number | null>(null);
  const runSeed = useMemo(() => createMiniGameRunSeed(config.params.miniLevelId, runId), [config.params.miniLevelId, runId]);
  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    };
  }, []);
  const handleComplete = useCallback(
    (outcome: MiniGameCompletion) => {
      const passed = outcome.status === "passed";
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
      const timer = window.setTimeout(() => {
        completionTimerRef.current = null;
        onComplete([
          trial(config.dimension, 0, {
            shownAt: shownAtRef.current,
            responseAt: shownAtRef.current + outcome.elapsedMs,
            correct: passed,
            errorType: passed ? undefined : miniGameFailureError(outcome),
            value: miniGameValue("mini-game", outcome, passed ? 100 : 0),
          }),
        ]);
      }, MINI_GAME_COMPLETION_DELAY_MS);
      completionTimerRef.current = timer;
    },
    [config.dimension, onComplete],
  );

  return (
    <MiniGameEmbeddedStage
      gameId={config.params.miniGameId}
      levelId={config.params.miniLevelId}
      mode="advanced"
      onComplete={handleComplete}
      runSeed={runSeed}
    />
  );
}
