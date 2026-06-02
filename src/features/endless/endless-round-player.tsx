"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { MiniGameEmbeddedStage } from "@/features/mini-games/embedded-stage";
import { type EndlessMiniGameRuntime } from "@/features/mini-games/common";
import {
  AdvancedAimRound,
  AdvancedBrakingRound,
  AdvancedReactionRound,
} from "@/features/rounds/native";
import { type AdvancedStageConfig } from "@/lib/advanced-challenges";
import {
  ENDLESS_REACTION_THRESHOLD_MS,
  ENDLESS_STARTING_REVIVES,
  getEndlessAimConfig,
  getEndlessRoundDifficultyState,
  type EndlessDifficultyState,
  getEndlessKnifeConfig,
  getEndlessMiniGameStageConfig,
  getEndlessReusableStageConfig,
  getEndlessScore,
  getEndlessTestJumpOptions,
} from "@/lib/endless-mode";
import {
  createMiniGameRunSeed,
  getMiniGameLevel,
  type MiniGameId,
  type MiniGameLevelConfig,
  type MiniGameParams,
} from "@/lib/mini-games";
import type { RoundId } from "@/lib/scoring";

const ENDLESS_NATIVE_TARGET_LIMIT = 1_000_000;

export type EndlessRoundCompletion = {
  bonusActions: number;
  coreActions: number;
  elapsedMs: number;
  reason: string;
  revivesUsed: number;
  roundId: RoundId;
  score: number;
};

type EndlessRunApi = EndlessMiniGameRuntime & {
  coreActions: number;
  finish: (reason: string) => void;
  reportedDifficulty: number;
  setDebugDifficulty: (difficulty: number) => void;
};

type EndlessSegment = {
  config: AdvancedStageConfig;
  miniLevel?: MiniGameLevelConfig;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function updateStageParams(config: AdvancedStageConfig, patch: MiniGameParams): AdvancedStageConfig {
  return {
    ...config,
    params: {
      ...config.params,
      ...patch,
    },
  };
}

function buildEndlessMiniLevel(config: AdvancedStageConfig): MiniGameLevelConfig | undefined {
  const miniGameId = config.params.miniGameId;
  const miniLevelId = config.params.miniLevelId;
  if (typeof miniGameId !== "string" || typeof miniLevelId !== "string") return undefined;

  const baseLevel = getMiniGameLevel(miniGameId as MiniGameId, miniLevelId);
  const params: MiniGameParams = { ...baseLevel.params };

  if (miniGameId === "flappy" || miniGameId === "doodle" || miniGameId === "square-jump" || miniGameId === "fall-down") {
    Object.assign(params, getEndlessMiniGameStageConfig({ miniGameId, progress: 0 }).params);
  }

  if (miniGameId === "knife") {
    const knife = getEndlessKnifeConfig({ wheelIndex: 0 });
    params.shotCount = knife.requiredHits;
    params.baseRotationSpeed = knife.rotationSpeed;
    params.forbiddenZoneCount = knife.forbiddenZoneCount;
    params.sineRotationEnabled = knife.sineRotationChance > 0;
    if (knife.countdownSeconds === null) {
      delete params.shotCountdown;
    } else {
      params.shotCountdown = knife.countdownSeconds;
    }
  }

  return {
    ...baseLevel,
    levelId: `${baseLevel.levelId}-endless`,
    params,
  };
}

function buildEndlessSegment(roundId: RoundId): EndlessSegment {
  const source = getEndlessReusableStageConfig({ difficulty: 0, roundId });
  let config = source.sourceConfig;

  if (roundId === "reaction") {
    config = updateStageParams(config, { avgMsThreshold: ENDLESS_REACTION_THRESHOLD_MS });
  }

  if (roundId === "aim") {
    const aim = getEndlessAimConfig({ hitCount: 0 });
    config = updateStageParams(config, {
      aimMode: "boss",
      arrowCount: ENDLESS_NATIVE_TARGET_LIMIT,
      decoyCount: 0,
      failOnFlyOut: true,
      replaceTargetOnHit: true,
      requiredHits: ENDLESS_NATIVE_TARGET_LIMIT,
      route: "mixed",
      spawnIntervalMs: aim.spawnIntervalMs,
      targetCount: ENDLESS_NATIVE_TARGET_LIMIT,
      targetSize: aim.targetSize,
      targetSpeedMultiplier: aim.targetSpeedMultiplier,
      unlimitedArrows: true,
    });
  }

  return {
    config,
    miniLevel: buildEndlessMiniLevel(config),
  };
}

function useEndlessRun({
  onComplete,
  roundId,
}: {
  onComplete: (completion: EndlessRoundCompletion) => void;
  roundId: RoundId;
}): EndlessRunApi {
  const startedAtRef = useRef(0);
  const completedRef = useRef(false);
  const coreActionsRef = useRef(0);
  const revivesRef = useRef(ENDLESS_STARTING_REVIVES);
  const [coreActions, setCoreActions] = useState(0);
  const [revives, setRevives] = useState(ENDLESS_STARTING_REVIVES);
  const [debugDifficulty, setDebugDifficultyState] = useState(0);
  const [reportedDifficulty, setReportedDifficulty] = useState(0);
  const score = getEndlessScore({ coreActions });

  React.useEffect(() => {
    startedAtRef.current = performance.now();
  }, []);

  const finish = useCallback(
    (reason: string) => {
      if (completedRef.current) return;
      completedRef.current = true;
      const endedAt = typeof performance === "undefined" ? Date.now() : performance.now();
      onComplete({
        bonusActions: 0,
        coreActions: coreActionsRef.current,
        elapsedMs: Math.max(0, Math.round(endedAt - startedAtRef.current)),
        reason,
        revivesUsed: ENDLESS_STARTING_REVIVES - revivesRef.current,
        roundId,
        score: getEndlessScore({ coreActions: coreActionsRef.current }),
      });
    },
    [onComplete, roundId],
  );

  const loseLife = useCallback(
    (reason: string) => {
      if (completedRef.current) return false;
      const nextRevives = Math.max(0, revivesRef.current - 1);
      revivesRef.current = nextRevives;
      setRevives(nextRevives);
      if (nextRevives <= 0) {
        finish(reason);
        return false;
      }
      return true;
    },
    [finish],
  );

  const addScore = useCallback((amount = 1) => {
    const safeAmount = Math.max(1, Math.floor(Number.isFinite(amount) ? amount : 1));
    coreActionsRef.current += safeAmount;
    setCoreActions(coreActionsRef.current);
  }, []);

  const setDistanceScore = useCallback((distanceScore: number) => {
    const safeDistanceScore = Math.max(0, Math.floor(Number.isFinite(distanceScore) ? distanceScore : 0));
    const nextCoreActions = Math.max(coreActionsRef.current, safeDistanceScore);
    if (nextCoreActions === coreActionsRef.current) return;
    coreActionsRef.current = nextCoreActions;
    setCoreActions(nextCoreActions);
  }, []);

  const setDebugDifficulty = useCallback((difficulty: number) => {
    setDebugDifficultyState(clamp(difficulty, 0, 1));
  }, []);

  const reportDifficulty = useCallback((difficulty: number) => {
    const normalizedDifficulty = clamp(difficulty, 0, 1);
    setReportedDifficulty((previous) => (normalizedDifficulty > previous ? normalizedDifficulty : previous));
  }, []);

  return {
    addScore,
    coreActions,
    debugDifficulty,
    finish,
    loseLife,
    reportDifficulty,
    reportedDifficulty,
    revives,
    score,
    setDebugDifficulty,
    setDistanceScore,
  };
}

function EndlessHud({
  api,
  bestScore,
  debugToolsVisible,
  difficultyState,
}: {
  api: EndlessRunApi;
  bestScore: number;
  debugToolsVisible: boolean;
  difficultyState: EndlessDifficultyState;
}) {
  return (
    <>
      <div className="endless-hud">
        <div className="endless-hearts" aria-label={`剩余复活 ${api.revives}`}>
          {Array.from({ length: ENDLESS_STARTING_REVIVES }, (_, index) => (
            <span className={`endless-heart ${index < api.revives ? "active" : "spent"}`} key={index}>
              ❤
            </span>
          ))}
        </div>
        <div className="endless-score">
          <strong>{api.score}</strong>
          <span>最佳 {bestScore}</span>
        </div>
        <div
          className="endless-difficulty"
          aria-label={`无尽强度 ${difficultyState.label}，复用进阶 ${difficultyState.sourceAdvancedLevel}`}
        >
          <div className="endless-difficulty-row">
            <span>强度 {difficultyState.label}</span>
            <span>进阶 {difficultyState.sourceAdvancedLevel}</span>
          </div>
          <div className="endless-difficulty-meter" aria-hidden="true">
            <span style={{ width: `${difficultyState.progressToNext}%` }} />
          </div>
          <span className="endless-difficulty-next">
            {difficultyState.nextLabel ? `下一段 ${difficultyState.nextLabel}` : "强度封顶"}
          </span>
        </div>
      </div>
      {debugToolsVisible ? (
        <details className="endless-debug-panel" onPointerDown={(event) => event.stopPropagation()}>
          <summary>测试强度</summary>
          <div className="endless-debug-jumps" aria-label="无尽难度测试跳转">
            {getEndlessTestJumpOptions().map((option) => (
              <button
                className={api.debugDifficulty === option.difficulty ? "active" : ""}
                key={option.difficulty}
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  api.setDebugDifficulty(option.difficulty);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function EndlessNativeRound({
  api,
  segment,
}: {
  api: EndlessRunApi;
  segment: EndlessSegment;
}) {
  const ignoreRoundCompletion = useCallback(() => undefined, []);

  if (segment.config.dimension === "reaction") {
    return <AdvancedReactionRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} />;
  }
  if (segment.config.dimension === "aim") {
    return <AdvancedAimRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} runSeed="endless-aim" />;
  }
  return <AdvancedBrakingRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} />;
}

function EndlessMiniGameRound({
  api,
  segment,
}: {
  api: EndlessRunApi;
  segment: EndlessSegment;
}) {
  const miniGameId = segment.config.params.miniGameId as MiniGameId | undefined;
  const miniLevel = segment.miniLevel;
  const runSeed = useMemo(
    () => (miniGameId && miniLevel ? createMiniGameRunSeed(miniLevel.levelId, `endless-${miniGameId}`) : ""),
    [miniGameId, miniLevel],
  );

  if (!miniGameId || !miniLevel) return null;

  return (
    <MiniGameEmbeddedStage
      endless={api}
      gameId={miniGameId}
      levelId={miniLevel.levelId}
      levelOverride={miniLevel}
      mode="endless"
      runSeed={runSeed}
    />
  );
}

function EndlessGameByRound({
  api,
  segment,
}: {
  api: EndlessRunApi;
  segment: EndlessSegment;
}) {
  if (segment.miniLevel) {
    return <EndlessMiniGameRound api={api} segment={segment} />;
  }
  return <EndlessNativeRound api={api} segment={segment} />;
}

export function EndlessRoundPlayer({
  bestScore,
  debugToolsVisible,
  onComplete,
  roundId,
}: {
  bestScore: number;
  debugToolsVisible: boolean;
  onComplete: (completion: EndlessRoundCompletion) => void;
  roundId: RoundId;
}) {
  const api = useEndlessRun({ onComplete, roundId });
  const segment = useMemo(() => buildEndlessSegment(roundId), [roundId]);
  const difficultyState = getEndlessRoundDifficultyState({
    debugDifficulty: api.debugDifficulty,
    reportedDifficulty: api.reportedDifficulty,
    roundId,
    score: api.score,
  });

  return (
    <div className="endless-shell">
      <EndlessHud
        api={api}
        bestScore={bestScore}
        debugToolsVisible={debugToolsVisible}
        difficultyState={difficultyState}
      />
      <div className="endless-game-host" data-source-level={difficultyState.sourceAdvancedLevel}>
        <EndlessGameByRound api={api} segment={segment} />
      </div>
    </div>
  );
}
