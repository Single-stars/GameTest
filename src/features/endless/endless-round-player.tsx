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
import { getAdvancedLevelTone } from "@/lib/advanced-progress";
import {
  ENDLESS_REACTION_THRESHOLD_MS,
  ENDLESS_STARTING_REVIVES,
  getEndlessAimConfig,
  getEndlessRoundDifficultyState,
  getEndlessKnifeConfig,
  getEndlessMiniGameStageConfig,
  getEndlessReusableStageConfig,
  getEndlessScore,
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
const ENDLESS_ENERGY_THRESHOLD = 10;

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
      aimMode: aim.aimMode,
      arrowCount: ENDLESS_NATIVE_TARGET_LIMIT,
      decoyCount: aim.decoyCount,
      failOnFlyOut: aim.failOnFlyOut,
      replaceTargetOnHit: true,
      requiredHits: ENDLESS_NATIVE_TARGET_LIMIT,
      route: aim.route,
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
  const distanceEnergyScoreRef = useRef(0);
  const energyRef = useRef(0);
  const finishTimerRef = useRef<number | null>(null);
  const revivesRef = useRef(ENDLESS_STARTING_REVIVES);
  const shieldChargesRef = useRef(0);
  const [coreActions, setCoreActions] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [revives, setRevives] = useState(ENDLESS_STARTING_REVIVES);
  const [shieldCharges, setShieldCharges] = useState(0);
  const [debugDifficulty, setDebugDifficultyState] = useState(0);
  const [reportedDifficulty, setReportedDifficulty] = useState(0);
  const score = getEndlessScore({ coreActions });

  React.useEffect(() => {
    startedAtRef.current = performance.now();
  }, []);

  const finish = useCallback(
    (reason: string, finishDelayMs = 0) => {
      if (completedRef.current) return;
      completedRef.current = true;
      const complete = () => {
        finishTimerRef.current = null;
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
      };
      if (finishDelayMs > 0) {
        finishTimerRef.current = window.setTimeout(complete, finishDelayMs);
      } else {
        complete();
      }
    },
    [onComplete, roundId],
  );

  const gainEnergy = useCallback((amount = 1) => {
    const safeAmount = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 1));
    if (safeAmount <= 0) return;

    let nextEnergy = energyRef.current + safeAmount;
    let nextRevives = revivesRef.current;
    let nextShieldCharges = shieldChargesRef.current;

    while (nextEnergy >= ENDLESS_ENERGY_THRESHOLD) {
      if (nextRevives < ENDLESS_STARTING_REVIVES) {
        nextEnergy -= ENDLESS_ENERGY_THRESHOLD;
        nextRevives += 1;
      } else {
        nextShieldCharges = 1;
        nextEnergy = ENDLESS_ENERGY_THRESHOLD;
        break;
      }
    }

    energyRef.current = nextEnergy;
    setEnergy(nextEnergy);

    if (nextRevives !== revivesRef.current) {
      revivesRef.current = nextRevives;
      setRevives(nextRevives);
    }

    if (nextShieldCharges !== shieldChargesRef.current) {
      shieldChargesRef.current = nextShieldCharges;
      setShieldCharges(nextShieldCharges);
    }
  }, []);

  const loseLife = useCallback(
    (reason: string, finishDelayMs = 0) => {
      if (completedRef.current) return false;
      if (shieldChargesRef.current > 0) {
        shieldChargesRef.current = 0;
        setShieldCharges(0);
        energyRef.current = 0;
        setEnergy(0);
        return true;
      }
      const nextRevives = Math.max(0, revivesRef.current - 1);
      revivesRef.current = nextRevives;
      setRevives(nextRevives);
      if (nextRevives <= 0) {
        finish(reason, finishDelayMs);
        return false;
      }
      return true;
    },
    [finish],
  );

  React.useEffect(() => {
    return () => {
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    };
  }, []);

  const addScore = useCallback((amount = 1) => {
    const safeAmount = Math.max(1, Math.floor(Number.isFinite(amount) ? amount : 1));
    coreActionsRef.current += safeAmount;
    setCoreActions(coreActionsRef.current);
    gainEnergy(safeAmount);
  }, [gainEnergy]);

  const setDistanceScore = useCallback((distanceScore: number, gainEnergyFromDistance = true) => {
    const safeDistanceScore = Math.max(0, Math.floor(Number.isFinite(distanceScore) ? distanceScore : 0));
    const nextCoreActions = Math.max(coreActionsRef.current, safeDistanceScore);
    if (nextCoreActions === coreActionsRef.current) return;
    coreActionsRef.current = nextCoreActions;
    setCoreActions(nextCoreActions);
    if (!gainEnergyFromDistance) {
      distanceEnergyScoreRef.current = Math.max(distanceEnergyScoreRef.current, nextCoreActions);
      return;
    }
    const distanceEnergyGain = nextCoreActions - distanceEnergyScoreRef.current;
    if (distanceEnergyGain <= 0) return;
    distanceEnergyScoreRef.current = nextCoreActions;
    gainEnergy(distanceEnergyGain);
  }, [gainEnergy]);

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
    energyPercent: shieldCharges > 0 ? 100 : Math.round((energy / ENDLESS_ENERGY_THRESHOLD) * 100),
    finish,
    gainEnergy,
    loseLife,
    reportDifficulty,
    reportedDifficulty,
    revives,
    score,
    setDebugDifficulty,
    setDistanceScore,
    shieldCharges,
  };
}

function EndlessHud({
  api,
  bestScore,
}: {
  api: EndlessRunApi;
  bestScore: number;
}) {
  const activeEnergySegments = clamp(
    Math.round((api.energyPercent / 100) * ENDLESS_ENERGY_THRESHOLD),
    0,
    ENDLESS_ENERGY_THRESHOLD,
  );

  return (
    <div
      className={`endless-hud ${api.shieldCharges > 0 ? "shielded" : ""}`}
      aria-label={`剩余复活 ${api.revives}/${ENDLESS_STARTING_REVIVES}，能量 ${activeEnergySegments}/${ENDLESS_ENERGY_THRESHOLD}，分数 ${api.score}，最佳 ${bestScore}`}
    >
      <div className="endless-hearts" aria-label={`剩余复活 ${api.revives}/${ENDLESS_STARTING_REVIVES}`}>
        {Array.from({ length: ENDLESS_STARTING_REVIVES }, (_, index) => (
          <span className={`endless-heart-token ${index < api.revives ? "active" : "spent"}`} key={index}>
            <span className="endless-heart" aria-hidden="true">❤</span>
          </span>
        ))}
      </div>
      <div className="endless-energy-console">
        <div className="endless-energy-meter" aria-label={`能量 ${activeEnergySegments}/${ENDLESS_ENERGY_THRESHOLD}`}>
          <div className="endless-energy-segments" aria-hidden="true">
            {Array.from({ length: ENDLESS_ENERGY_THRESHOLD }, (_, index) => (
              <span className={`endless-energy-cell ${index < activeEnergySegments ? "active" : ""}`} key={index} />
            ))}
          </div>
        </div>
      </div>
      <div className="endless-score-readout">
        <strong>{api.score}</strong>
        <span>最佳 {bestScore}</span>
      </div>
    </div>
  );
}

function EndlessNativeRound({
  api,
  runSeed,
  segment,
}: {
  api: EndlessRunApi;
  runSeed: string;
  segment: EndlessSegment;
}) {
  const ignoreRoundCompletion = useCallback(() => undefined, []);

  if (segment.config.dimension === "reaction") {
    return <AdvancedReactionRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} />;
  }
  if (segment.config.dimension === "aim") {
    return <AdvancedAimRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} runSeed={runSeed} />;
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
  runSeed,
  segment,
}: {
  api: EndlessRunApi;
  runSeed: string;
  segment: EndlessSegment;
}) {
  if (segment.miniLevel) {
    return <EndlessMiniGameRound api={api} segment={segment} />;
  }
  return <EndlessNativeRound api={api} runSeed={runSeed} segment={segment} />;
}

export function EndlessRoundPlayer({
  bestScore,
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
  const runSeed = useMemo(() => createMiniGameRunSeed(`endless-${roundId}`, roundId), [roundId]);
  const difficultyState = getEndlessRoundDifficultyState({
    debugDifficulty: api.debugDifficulty,
    reportedDifficulty: api.reportedDifficulty,
    roundId,
    score: api.score,
  });
  const difficultyTone = getAdvancedLevelTone(difficultyState.sourceAdvancedLevel);

  return (
    <div className="endless-shell" data-difficulty-tone={difficultyTone}>
      <EndlessHud
        api={api}
        bestScore={bestScore}
      />
      <div className="endless-game-host" data-source-level={difficultyState.sourceAdvancedLevel} data-difficulty-tone={difficultyTone}>
        <EndlessGameByRound api={api} runSeed={runSeed} segment={segment} />
      </div>
    </div>
  );
}
