"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { MiniGameEmbeddedStage } from "@/features/mini-games/embedded-stage";
import {
  type EndlessActiveSkill,
  type EndlessMiniGameRuntime,
  type EndlessSpecialBonus,
  type EndlessSpecialBonusLabel,
} from "@/features/mini-games/common";
import { type PlayerAvatarEffect } from "@/features/player-avatar/player-avatar";
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
const ENDLESS_SKILL_COST = 10;
const ENDLESS_SKILL_DURATION_MS = 5000;
const ENDLESS_BRAKING_SKILL_DURATION_MS = 5000;
const ENDLESS_SKILL_ENDING_WARNING_MS = 1000;
const ENDLESS_SPECIAL_BONUS_SCORE = 2;
const ENDLESS_BONUS_POPUP_MS = 1500;

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
  bonusPopup: EndlessBonusPopup | null;
  coreActions: number;
  energyPopups: EndlessEnergyPopup[];
  finish: (reason: string) => void;
  reportedDifficulty: number;
  setDebugDifficulty: (difficulty: number) => void;
};

type EndlessEnergyPopup = {
  id: number;
  text: string;
};

type EndlessBonusPopup = {
  amount: number;
  id: number;
  label: string;
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

function createEndlessSkillForRound(roundId: RoundId, nowMs: number): EndlessActiveSkill {
  switch (roundId) {
    case "search":
      return { kind: "power-release", startedAt: nowMs };
    case "stroop":
      return { kind: "endless-fall", startedAt: nowMs, until: nowMs + ENDLESS_SKILL_DURATION_MS };
    case "rhythm":
      return { kind: "double-jump", startedAt: nowMs };
    case "memory":
      return { kind: "super-dash", startedAt: nowMs, invincibleCharges: 3 };
    case "aim":
      return { kind: "full-fire", startedAt: nowMs, until: nowMs + ENDLESS_SKILL_DURATION_MS };
    case "braking":
      return { kind: "big-luck", startedAt: nowMs, until: nowMs + ENDLESS_BRAKING_SKILL_DURATION_MS };
    case "reaction":
      return { kind: "green-light", startedAt: nowMs, charges: 5 };
    case "patience":
      return { kind: "knife-focus", startedAt: nowMs, until: nowMs + ENDLESS_SKILL_DURATION_MS };
  }
}

function getEndlessAvatarEffect(activeSkill: EndlessActiveSkill | null): PlayerAvatarEffect {
  if (!activeSkill) return "none";
  if (activeSkill.kind === "big-luck") return "shield";
  if (activeSkill.kind === "power-release" || activeSkill.kind === "super-dash" || activeSkill.kind === "endless-fall") return "wind";
  return "none";
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
  const energyPopupIdRef = useRef(0);
  const energyPopupTimersRef = useRef<number[]>([]);
  const bonusActionsRef = useRef(0);
  const bonusPopupIdRef = useRef(0);
  const bonusPopupTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const revivesRef = useRef(ENDLESS_STARTING_REVIVES);
  const shieldChargesRef = useRef(0);
  const debugEnergyLockedRef = useRef(false);
  const activeSkillRef = useRef<EndlessActiveSkill | null>(null);
  const skillTimerRef = useRef<number | null>(null);
  const skillEndingTimerRef = useRef<number | null>(null);
  const [bonusActions, setBonusActions] = useState(0);
  const [bonusPopup, setBonusPopup] = useState<EndlessBonusPopup | null>(null);
  const [coreActions, setCoreActions] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [energyPopups, setEnergyPopups] = useState<EndlessEnergyPopup[]>([]);
  const [revives, setRevives] = useState(ENDLESS_STARTING_REVIVES);
  const [shieldCharges, setShieldCharges] = useState(0);
  const [debugEnergyLocked, setDebugEnergyLocked] = useState(false);
  const [activeSkill, setActiveSkill] = useState<EndlessActiveSkill | null>(null);
  const [skillEnding, setSkillEnding] = useState(false);
  const [debugDifficulty, setDebugDifficultyState] = useState(0);
  const [reportedDifficulty, setReportedDifficulty] = useState(0);
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
          bonusActions: bonusActionsRef.current,
          coreActions: coreActionsRef.current,
          elapsedMs: Math.max(0, Math.round(endedAt - startedAtRef.current)),
          reason,
          revivesUsed: ENDLESS_STARTING_REVIVES - revivesRef.current,
          roundId,
          score: getEndlessScore({ bonusActions: bonusActionsRef.current, coreActions: coreActionsRef.current }),
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

  const showEnergyFeedback = useCallback((feedbackText?: string) => {
    if (!feedbackText) return;
    const popup = {
      id: energyPopupIdRef.current + 1,
      text: feedbackText,
    };
    energyPopupIdRef.current = popup.id;
    setEnergyPopups((current) => [...current.slice(-2), popup]);
    const timer = window.setTimeout(() => {
      setEnergyPopups((current) => current.filter((item) => item.id !== popup.id));
      energyPopupTimersRef.current = energyPopupTimersRef.current.filter((item) => item !== timer);
    }, 900);
    energyPopupTimersRef.current.push(timer);
  }, []);

  const showBonusFeedback = useCallback((label: string, amount: number) => {
    const popup = {
      amount,
      id: bonusPopupIdRef.current + 1,
      label,
    };
    bonusPopupIdRef.current = popup.id;
    setBonusPopup((current) => current
      ? { amount: current.amount + amount, id: popup.id, label }
      : popup);
    if (bonusPopupTimerRef.current !== null) window.clearTimeout(bonusPopupTimerRef.current);
    bonusPopupTimerRef.current = window.setTimeout(() => {
      bonusPopupTimerRef.current = null;
      setBonusPopup(null);
    }, ENDLESS_BONUS_POPUP_MS);
  }, []);

  const clearSkillTimers = useCallback(() => {
    if (skillTimerRef.current !== null) window.clearTimeout(skillTimerRef.current);
    skillTimerRef.current = null;
    if (skillEndingTimerRef.current !== null) window.clearTimeout(skillEndingTimerRef.current);
    skillEndingTimerRef.current = null;
  }, []);

  const clearPassiveShield = useCallback(() => {
    if (shieldChargesRef.current <= 0) return;
    shieldChargesRef.current = 0;
    setShieldCharges(0);
  }, []);

  const endSkill = useCallback(() => {
    const endedSkill = activeSkillRef.current;
    clearSkillTimers();
    if (endedSkill?.kind === "big-luck") clearPassiveShield();
    activeSkillRef.current = null;
    setActiveSkill(null);
    setSkillEnding(false);
  }, [clearPassiveShield, clearSkillTimers]);

  const scheduleSkillTimers = useCallback((skill: EndlessActiveSkill) => {
    clearSkillTimers();
    if (typeof skill.until !== "number") return;
    const remainingMs = Math.max(0, skill.until - performance.now());
    skillEndingTimerRef.current = window.setTimeout(() => {
      skillEndingTimerRef.current = null;
      setSkillEnding(true);
    }, Math.max(0, remainingMs - ENDLESS_SKILL_ENDING_WARNING_MS));
    skillTimerRef.current = window.setTimeout(endSkill, remainingMs);
  }, [clearSkillTimers, endSkill]);

  const getActiveSkill = useCallback(() => activeSkillRef.current, []);

  const updateActiveSkill = useCallback((updater: (skill: EndlessActiveSkill) => EndlessActiveSkill | null) => {
    const current = activeSkillRef.current;
    if (!current) return null;
    const next = updater(current);
    activeSkillRef.current = next;
    setActiveSkill(next);
    if (!next) {
      clearSkillTimers();
      setSkillEnding(false);
      return null;
    }
    if (next.until !== current.until) scheduleSkillTimers(next);
    return next;
  }, [clearSkillTimers, scheduleSkillTimers]);

  const syncPassiveShieldFromEnergy = useCallback((nextEnergy: number) => {
    if (nextEnergy >= ENDLESS_ENERGY_THRESHOLD) {
      shieldChargesRef.current = 1;
      setShieldCharges(1);
      return;
    }
    if (nextEnergy < ENDLESS_ENERGY_THRESHOLD) clearPassiveShield();
  }, [clearPassiveShield]);

  const gainEnergy = useCallback((amount = 1, feedbackText?: string) => {
    const safeAmount = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 1));
    if (safeAmount <= 0) return;
    if (activeSkillRef.current) {
      showEnergyFeedback(feedbackText);
      if (debugEnergyLockedRef.current) {
        energyRef.current = ENDLESS_ENERGY_THRESHOLD;
        setEnergy(ENDLESS_ENERGY_THRESHOLD);
        syncPassiveShieldFromEnergy(ENDLESS_ENERGY_THRESHOLD);
      }
      return;
    }
    showEnergyFeedback(feedbackText);

    const nextEnergy = debugEnergyLockedRef.current
      ? ENDLESS_ENERGY_THRESHOLD
      : Math.min(ENDLESS_ENERGY_THRESHOLD, energyRef.current + safeAmount);

    energyRef.current = nextEnergy;
    setEnergy(nextEnergy);
    syncPassiveShieldFromEnergy(nextEnergy);
  }, [showEnergyFeedback, syncPassiveShieldFromEnergy]);

  const fillEnergy = useCallback(() => {
    if (completedRef.current) return;
    energyRef.current = ENDLESS_ENERGY_THRESHOLD;
    setEnergy(ENDLESS_ENERGY_THRESHOLD);
    syncPassiveShieldFromEnergy(ENDLESS_ENERGY_THRESHOLD);
    showEnergyFeedback("能量充满！");
  }, [showEnergyFeedback, syncPassiveShieldFromEnergy]);

  const awardSpecialBonus = useCallback((bonus: EndlessSpecialBonusLabel | EndlessSpecialBonus) => {
    const resolvedBonus = {
      label: typeof bonus === "string" ? bonus : bonus.label,
      amount: typeof bonus === "string" ? ENDLESS_SPECIAL_BONUS_SCORE : Math.max(1, Math.floor(bonus.amount ?? ENDLESS_SPECIAL_BONUS_SCORE)),
    };
    bonusActionsRef.current += resolvedBonus.amount;
    setBonusActions(bonusActionsRef.current);
    showBonusFeedback(resolvedBonus.label, resolvedBonus.amount);
    if (!activeSkillRef.current) gainEnergy(1);
  }, [gainEnergy, showBonusFeedback]);

  const useSkill = useCallback(() => {
    if (completedRef.current || activeSkillRef.current || energyRef.current < ENDLESS_SKILL_COST) return false;
    const nextEnergy = debugEnergyLockedRef.current ? ENDLESS_ENERGY_THRESHOLD : Math.max(0, energyRef.current - ENDLESS_SKILL_COST);
    energyRef.current = nextEnergy;
    setEnergy(nextEnergy);
    clearPassiveShield();
    const skill = createEndlessSkillForRound(roundId, performance.now());
    activeSkillRef.current = skill;
    setActiveSkill(skill);
    setSkillEnding(false);
    showEnergyFeedback("加强状态！");
    scheduleSkillTimers(skill);
    return true;
  }, [clearPassiveShield, roundId, scheduleSkillTimers, showEnergyFeedback]);

  const useHeal = useCallback(() => {
    if (completedRef.current || revivesRef.current >= ENDLESS_STARTING_REVIVES || energyRef.current < ENDLESS_SKILL_COST) return false;
    const nextEnergy = debugEnergyLockedRef.current ? ENDLESS_ENERGY_THRESHOLD : Math.max(0, energyRef.current - ENDLESS_SKILL_COST);
    energyRef.current = nextEnergy;
    setEnergy(nextEnergy);
    clearPassiveShield();
    const nextRevives = Math.min(ENDLESS_STARTING_REVIVES, revivesRef.current + 1);
    revivesRef.current = nextRevives;
    setRevives(nextRevives);
    showEnergyFeedback("回血！");
    return true;
  }, [clearPassiveShield, showEnergyFeedback]);

  const toggleDebugEnergyLock = useCallback(() => {
    const nextLocked = !debugEnergyLockedRef.current;
    debugEnergyLockedRef.current = nextLocked;
    setDebugEnergyLocked(nextLocked);
    if (nextLocked) {
      energyRef.current = ENDLESS_ENERGY_THRESHOLD;
      setEnergy(ENDLESS_ENERGY_THRESHOLD);
      syncPassiveShieldFromEnergy(ENDLESS_ENERGY_THRESHOLD);
    }
  }, [syncPassiveShieldFromEnergy]);

  const loseLife = useCallback(
    (reason: string, finishDelayMs = 0) => {
      if (completedRef.current) return false;
      if (shieldChargesRef.current > 0) {
        clearPassiveShield();
        energyRef.current = 0;
        setEnergy(0);
        if (debugEnergyLockedRef.current) {
          debugEnergyLockedRef.current = false;
          setDebugEnergyLocked(false);
        }
        showEnergyFeedback("护盾抵消！");
        return true;
      }
      endSkill();
      const nextRevives = Math.max(0, revivesRef.current - 1);
      revivesRef.current = nextRevives;
      setRevives(nextRevives);
      if (nextRevives <= 0) {
        finish(reason, finishDelayMs);
        return false;
      }
      return true;
    },
    [clearPassiveShield, endSkill, finish, showEnergyFeedback],
  );

  React.useEffect(() => {
    return () => {
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      clearSkillTimers();
      if (bonusPopupTimerRef.current !== null) window.clearTimeout(bonusPopupTimerRef.current);
      bonusPopupTimerRef.current = null;
      for (const timer of energyPopupTimersRef.current) window.clearTimeout(timer);
      energyPopupTimersRef.current = [];
    };
  }, [clearSkillTimers]);

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
    awardSpecialBonus,
    bonusPopup,
    canHeal: energy >= ENDLESS_SKILL_COST && revives < ENDLESS_STARTING_REVIVES,
    canUseSkill: energy >= ENDLESS_SKILL_COST && !activeSkill,
    coreActions,
    debugEnergyLocked,
    debugDifficulty,
    energyPopups,
    energyPercent: Math.round((energy / ENDLESS_ENERGY_THRESHOLD) * 100),
    finish,
    fillEnergy,
    gainEnergy,
    getActiveSkill,
    loseLife,
    reportDifficulty,
    reportedDifficulty,
    revives,
    score: getEndlessScore({ bonusActions, coreActions }),
    setDebugDifficulty,
    setDistanceScore,
    shieldCharges,
    showFeedback: showEnergyFeedback,
    skillActive: activeSkill !== null,
    skillEnding,
    toggleDebugEnergyLock,
    updateActiveSkill,
    useHeal,
    useSkill,
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
  const previousRevivesRef = React.useRef(api.revives);
  const previousEnergySegmentsRef = React.useRef(activeEnergySegments);
  const previousScoreRef = React.useRef(api.score);
  const [lifePulse, setLifePulse] = React.useState<{ tone: "gain" | "loss"; changedIndex: number } | null>(null);
  const [energyPulse, setEnergyPulse] = React.useState<{ tone: "gain" | "loss"; from: number; to: number } | null>(null);
  const [scorePulseId, setScorePulseId] = React.useState(0);
  const lowLife = api.revives === 1;
  const recordBreaking = api.score > bestScore;
  const skillActionReady = api.energyPercent >= 100 && !api.skillActive && !api.skillEnding;
  const healActionReady = api.canHeal;
  const endlessHudClassName = [
    "endless-hud",
    lowLife ? "low-life" : "",
    lifePulse ? `life-${lifePulse.tone}` : "",
    energyPulse ? `energy-${energyPulse.tone}` : "",
    api.shieldCharges > 0 ? "shielded" : "",
    recordBreaking ? "new-record" : "",
  ].filter(Boolean).join(" ");
  const scoreReadoutClassName = `endless-score-readout ${recordBreaking ? "new-record" : ""}`;
  const handleSkillClick = useCallback((event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    api.useSkill();
  }, [api]);
  const handleHealClick = useCallback((event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    api.useHeal();
  }, [api]);
  const handleDebugEnergyClick = useCallback((event: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    api.toggleDebugEnergyLock();
  }, [api]);

  React.useEffect(() => {
    const previousRevives = previousRevivesRef.current;
    if (api.revives === previousRevives) return;

    const tone = api.revives > previousRevives ? "gain" : "loss";
    const changedIndex = tone === "gain" ? api.revives - 1 : previousRevives - 1;
    previousRevivesRef.current = api.revives;
    setLifePulse({ tone, changedIndex: clamp(changedIndex, 0, ENDLESS_STARTING_REVIVES - 1) });

    const timer = window.setTimeout(() => setLifePulse(null), 560);
    return () => window.clearTimeout(timer);
  }, [api.revives]);

  React.useEffect(() => {
    const previousEnergySegments = previousEnergySegmentsRef.current;
    if (activeEnergySegments === previousEnergySegments) return;

    const tone = activeEnergySegments > previousEnergySegments ? "gain" : "loss";
    previousEnergySegmentsRef.current = activeEnergySegments;
    setEnergyPulse({ tone, from: previousEnergySegments, to: activeEnergySegments });

    const timer = window.setTimeout(() => setEnergyPulse(null), 520);
    return () => window.clearTimeout(timer);
  }, [activeEnergySegments]);

  React.useEffect(() => {
    if (api.score === previousScoreRef.current) return;
    previousScoreRef.current = api.score;
    setScorePulseId((current) => current + 1);
  }, [api.score]);

  return (
    <div
      className={endlessHudClassName}
      aria-label={`剩余复活 ${api.revives}/${ENDLESS_STARTING_REVIVES}，能量 ${activeEnergySegments}/${ENDLESS_ENERGY_THRESHOLD}，分数 ${api.score}，最佳 ${bestScore}${recordBreaking ? "，新纪录" : ""}`}
    >
      <div className="endless-hearts" aria-label={`剩余复活 ${api.revives}/${ENDLESS_STARTING_REVIVES}`}>
        {Array.from({ length: ENDLESS_STARTING_REVIVES }, (_, index) => {
          const active = index < api.revives;
          const heartClassName = [
            "endless-heart-token",
            active ? "active" : "spent",
            lifePulse?.changedIndex === index ? `heart-${lifePulse.tone}` : "",
            lowLife && active ? "danger-heart" : "",
          ].filter(Boolean).join(" ");

          return (
            <span className={heartClassName} key={index}>
              <span className="endless-heart" aria-hidden="true">❤</span>
            </span>
          );
        })}
      </div>
      <div className={`endless-energy-console ${energyPulse ? `energy-${energyPulse.tone}` : ""}`}>
        <div className="endless-energy-meter" aria-label={`能量 ${activeEnergySegments}/${ENDLESS_ENERGY_THRESHOLD}`}>
          <div className="endless-energy-segments" aria-hidden="true">
            {Array.from({ length: ENDLESS_ENERGY_THRESHOLD }, (_, index) => {
              const pulseClass = energyPulse?.tone === "gain" && index >= energyPulse.from && index < energyPulse.to
                ? "energy-cell-pop"
                : energyPulse?.tone === "loss" && index >= energyPulse.to && index < energyPulse.from
                  ? "energy-cell-drain"
                  : "";
              return (
                <span className={`endless-energy-cell ${index < activeEnergySegments ? "active" : ""} ${pulseClass}`} key={index} />
              );
            })}
          </div>
        </div>
      </div>
      <div className={scoreReadoutClassName}>
        <strong className={scorePulseId > 0 ? "score-pop" : ""} key={`score-${scorePulseId}`}>
          {api.score}
        </strong>
        <span className="endless-score-best">最佳 {bestScore}</span>
        {recordBreaking ? <span className="endless-score-record-badge">新纪录</span> : null}
        {api.bonusPopup ? (
          <span className={`endless-bonus-score-pop ${api.bonusPopup.amount > 10 ? "major" : ""}`} key={api.bonusPopup.id}>
            {api.bonusPopup.label} +{api.bonusPopup.amount}
          </span>
        ) : null}
      </div>
      <div className="endless-action-rail">
        <button
          className={`endless-action-button endless-heal-button ${healActionReady ? "" : "hidden"}`}
          type="button"
          disabled={!api.canHeal}
          aria-hidden={!healActionReady}
          aria-label="Use full energy to heal"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={handleHealClick}
        >
          <span aria-hidden="true">{"\u2764\uFE0E"}</span>
        </button>
        <button
          className={`endless-action-button endless-skill-button ${skillActionReady ? "" : "hidden"} ${api.skillActive ? "active" : ""} ${api.skillEnding ? "ending" : ""}`}
          type="button"
          disabled={!api.canUseSkill}
          aria-hidden={!skillActionReady}
          aria-pressed={api.skillActive}
          aria-label={api.skillActive ? "Skill active" : `Use skill for ${ENDLESS_SKILL_COST} energy`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={handleSkillClick}
        >
          <span className="endless-skill-icon" aria-hidden="true" />
        </button>
        <button
          className={`endless-action-button endless-debug-energy-button ${api.debugEnergyLocked ? "active" : ""}`}
          type="button"
          aria-pressed={api.debugEnergyLocked}
          aria-label="Lock energy at 10"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={handleDebugEnergyClick}
        >
          <span aria-hidden="true">10</span>
        </button>
      </div>
    </div>
  );
}

function EndlessNativeRound({
  api,
  runSeed,
  segment,
  shielded,
}: {
  api: EndlessRunApi;
  runSeed: string;
  segment: EndlessSegment;
  shielded: boolean;
}) {
  const ignoreRoundCompletion = useCallback(() => undefined, []);

  if (segment.config.dimension === "reaction") {
    return <AdvancedReactionRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} shielded={shielded} />;
  }
  if (segment.config.dimension === "aim") {
    return <AdvancedAimRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} runSeed={runSeed} shielded={shielded} />;
  }
  return <AdvancedBrakingRound advancedConfig={segment.config} endless={api} onComplete={ignoreRoundCompletion} shielded={shielded} />;
}

function EndlessMiniGameRound({
  api,
  avatarEffect,
  segment,
  shielded,
}: {
  api: EndlessRunApi;
  avatarEffect: PlayerAvatarEffect;
  segment: EndlessSegment;
  shielded: boolean;
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
      avatarEffect={avatarEffect}
      shielded={shielded}
    />
  );
}

function EndlessGameByRound({
  api,
  avatarEffect,
  runSeed,
  segment,
  shielded,
}: {
  api: EndlessRunApi;
  avatarEffect: PlayerAvatarEffect;
  runSeed: string;
  segment: EndlessSegment;
  shielded: boolean;
}) {
  if (segment.miniLevel) {
    return <EndlessMiniGameRound api={api} avatarEffect={avatarEffect} segment={segment} shielded={shielded} />;
  }
  return <EndlessNativeRound api={api} runSeed={runSeed} segment={segment} shielded={shielded} />;
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
  const avatarEffect = getEndlessAvatarEffect(api.getActiveSkill());

  return (
    <div className="endless-shell" data-difficulty-tone={difficultyTone}>
      <div className={`endless-game-host ${api.skillActive ? "skill-active" : ""} ${api.skillEnding ? "skill-ending" : ""}`} data-source-level={difficultyState.sourceAdvancedLevel} data-difficulty-tone={difficultyTone}>
        <EndlessGameByRound api={api} runSeed={runSeed} segment={segment} shielded={avatarEffect === "shield" || api.shieldCharges > 0} avatarEffect={avatarEffect === "shield" ? "none" : avatarEffect} />
        <EndlessHud
          api={api}
          bestScore={bestScore}
        />
        <div className="endless-energy-popups" aria-live="polite">
          {api.energyPopups.map((popup) => (
            <span className="endless-energy-popup" key={popup.id}>
              {popup.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
