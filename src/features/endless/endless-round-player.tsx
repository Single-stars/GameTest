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
  shouldKeepPigEndlessLife,
} from "@/lib/endless-mode";
import { createEndlessRunSnapshot, type EndlessRunSnapshot } from "@/lib/endless-run-snapshot";
import {
  createMiniGameRunSeed,
  getMiniGameLevel,
  type MiniGameId,
  type MiniGameLevelConfig,
  type MiniGameParams,
} from "@/lib/mini-games";
import type { RoundId } from "@/lib/scoring";
import { DonateIcon } from "@/features/results/result-icons";
import { type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";

const ENDLESS_NATIVE_TARGET_LIMIT = 1_000_000;
const ENDLESS_ENERGY_THRESHOLD = 10;
const ENDLESS_SKILL_COST = 10;
const ENDLESS_SKILL_DURATION_MS = 5000;
const ENDLESS_BRAKING_SKILL_DURATION_MS = 5000;
const ENDLESS_SKILL_ENDING_WARNING_MS = 1000;
const ENDLESS_SPECIAL_BONUS_SCORE = 2;
const ENDLESS_BONUS_POPUP_MS = 1500;
const ENDLESS_FEEDBACK_POPUP_MS = 1400;
const ENDLESS_DAMAGE_PROTECTION_MS = 500;

export type EndlessRoundCompletion = {
  bonusActions: number;
  coreActions: number;
  elapsedMs: number;
  reason: string;
  revivesUsed: number;
  roundId: RoundId;
  score: number;
  snapshot: EndlessRunSnapshot;
};

type EndlessRunApi = EndlessMiniGameRuntime & {
  bonusPopup: EndlessBonusPopup | null;
  cancelReviveCoin: () => void;
  confirmReviveCoin: () => void;
  coreActions: number;
  energyPopups: EndlessEnergyPopup[];
  finish: (reason: string, finishDelayMs?: number, settlementMode?: "normal" | "settled-exit") => void;
  onSkillEnd?: (skill: EndlessActiveSkill) => void;
  paused: boolean;
  reportedDifficulty: number;
  reviveCoinAnimationId: number;
  reviveCoinPrompt: EndlessReviveCoinPrompt | null;
  reviveCoinUsed: boolean;
  reviveCoins: number;
  settleExit: (reason: string) => void;
  setDebugDifficulty: (difficulty: number) => void;
  startingRevives: number;
};

type EndlessFeedbackTone = "skill" | "heal" | "shield" | "energy";

type EndlessEnergyPopup = {
  id: number;
  text: string;
  tone: EndlessFeedbackTone;
};

type EndlessBonusPopup = {
  amount: number;
  id: number;
  label: string;
};

type EndlessReviveCoinPrompt = {
  id: number;
  reason: string;
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

function getEndlessSkillFeedbackText(roundId: RoundId) {
  switch (roundId) {
    case "search":
      return "超级跳跃！";
    case "stroop":
      return "无尽坠落！";
    case "rhythm":
      return "二段跳跃！";
    case "memory":
      return "超级冲刺！";
    case "aim":
      return "火力全开！";
    case "braking":
      return "大运来喽！";
    case "patience":
      return "时间冻结！";
    case "reaction":
      return "双倍分数！";
  }
}

function getEndlessAvatarEffect(activeSkill: EndlessActiveSkill | null): PlayerAvatarEffect {
  if (!activeSkill) return "none";
  if (activeSkill.kind === "big-luck") return "shield";
  if (activeSkill.kind === "power-release" || activeSkill.kind === "super-dash" || activeSkill.kind === "endless-fall") return "wind";
  return "none";
}

function useEndlessRun({
  avatarSkin,
  onComplete,
  onSkillUse,
  onUseReviveCoin,
  paused,
  reviveCoins,
  roundId,
  startingRevives = ENDLESS_STARTING_REVIVES,
}: {
  avatarSkin: PlayerAvatarSkin;
  onComplete: (completion: EndlessRoundCompletion) => void;
  onSkillUse?: (roundId: RoundId) => void;
  onUseReviveCoin: () => boolean;
  paused: boolean;
  reviveCoins: number;
  roundId: RoundId;
  startingRevives?: number;
}): EndlessRunApi {
  const normalizedStartingRevives = Math.max(1, Math.floor(Number.isFinite(startingRevives) ? startingRevives : ENDLESS_STARTING_REVIVES));
  const startedAtRef = useRef(0);
  const completedRef = useRef(false);
  const pausedRef = useRef(paused);
  const pausedAtRef = useRef<number | null>(null);
  const coreActionsRef = useRef(0);
  const distanceEnergyScoreRef = useRef(0);
  const energyRef = useRef(0);
  const energyPopupIdRef = useRef(0);
  const energyPopupTimersRef = useRef<number[]>([]);
  const bonusActionsRef = useRef(0);
  const bonusPopupIdRef = useRef(0);
  const bonusPopupTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const metricsRef = useRef<Record<string, number>>({});
  const revivesRef = useRef(normalizedStartingRevives);
  const reviveCoinsRef = useRef(reviveCoins);
  const reviveCoinUsedRef = useRef(false);
  const reviveCoinPromptIdRef = useRef(0);
  const onUseReviveCoinRef = useRef(onUseReviveCoin);
  const onSkillUseRef = useRef(onSkillUse);
  const shieldChargesRef = useRef(0);
  const debugEnergyLockedRef = useRef(false);
  const activeSkillRef = useRef<EndlessActiveSkill | null>(null);
  const skillTimerRef = useRef<number | null>(null);
  const skillEndingTimerRef = useRef<number | null>(null);
  const onSkillEndRef = useRef<((skill: EndlessActiveSkill) => void) | null>(null);
  const damageInvincibleUntilRef = useRef(0);
  const damageInvincibleTimerRef = useRef<number | null>(null);
  const [bonusActions, setBonusActions] = useState(0);
  const [bonusPopup, setBonusPopup] = useState<EndlessBonusPopup | null>(null);
  const [coreActions, setCoreActions] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [energyPopups, setEnergyPopups] = useState<EndlessEnergyPopup[]>([]);
  const [revives, setRevives] = useState(normalizedStartingRevives);
  const [reviveCoinPrompt, setReviveCoinPrompt] = useState<EndlessReviveCoinPrompt | null>(null);
  const [reviveCoinUsed, setReviveCoinUsed] = useState(false);
  const [reviveCoinAnimationId, setReviveCoinAnimationId] = useState(0);
  const [shieldCharges, setShieldCharges] = useState(0);
  const [debugEnergyLocked, setDebugEnergyLocked] = useState(false);
  const [activeSkill, setActiveSkill] = useState<EndlessActiveSkill | null>(null);
  const [skillEnding, setSkillEnding] = useState(false);
  const [damageInvincible, setDamageInvincible] = useState(false);
  const [debugDifficulty, setDebugDifficultyState] = useState(0);
  const [reportedDifficulty, setReportedDifficulty] = useState(0);
  React.useEffect(() => {
    startedAtRef.current = performance.now();
  }, []);

  React.useEffect(() => {
    reviveCoinsRef.current = reviveCoins;
  }, [reviveCoins]);

  React.useEffect(() => {
    onUseReviveCoinRef.current = onUseReviveCoin;
  }, [onUseReviveCoin]);

  React.useEffect(() => {
    onSkillUseRef.current = onSkillUse;
  }, [onSkillUse]);

  const normalizeMetricValue = useCallback((value: number) => {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
  }, []);

  const setMetric = useCallback((key: string, value: number) => {
    if (!key) return;
    metricsRef.current[key] = normalizeMetricValue(value);
  }, [normalizeMetricValue]);

  const incrementMetric = useCallback((key: string, amount = 1) => {
    if (!key) return;
    const safeAmount = normalizeMetricValue(amount);
    if (safeAmount <= 0) return;
    metricsRef.current[key] = normalizeMetricValue((metricsRef.current[key] ?? 0) + safeAmount);
  }, [normalizeMetricValue]);

  const setMetricMax = useCallback((key: string, value: number) => {
    if (!key) return;
    const safeValue = normalizeMetricValue(value);
    metricsRef.current[key] = Math.max(metricsRef.current[key] ?? 0, safeValue);
  }, [normalizeMetricValue]);

  const setMetricMin = useCallback((key: string, value: number) => {
    if (!key) return;
    const safeValue = normalizeMetricValue(value);
    const current = metricsRef.current[key];
    metricsRef.current[key] = current === undefined ? safeValue : Math.min(current, safeValue);
  }, [normalizeMetricValue]);

  const finish = useCallback(
    (reason: string, finishDelayMs = 0, settlementMode: "normal" | "settled-exit" = "normal") => {
      void settlementMode;
      if (completedRef.current) return;
      completedRef.current = true;
      const complete = () => {
        finishTimerRef.current = null;
        const endedAt = typeof performance === "undefined" ? Date.now() : performance.now();
        const elapsedMs = Math.max(0, Math.round(endedAt - startedAtRef.current));
        const score = getEndlessScore({ bonusActions: bonusActionsRef.current, coreActions: coreActionsRef.current });
        onComplete({
          bonusActions: bonusActionsRef.current,
          coreActions: coreActionsRef.current,
          elapsedMs,
          reason,
          revivesUsed: Math.max(0, normalizedStartingRevives - revivesRef.current),
          roundId,
          score,
          snapshot: createEndlessRunSnapshot({
            completedAt: new Date().toISOString(),
            durationMs: elapsedMs,
            metrics: metricsRef.current,
            roundId,
            score,
          }),
        });
      };
      if (finishDelayMs > 0) {
        finishTimerRef.current = window.setTimeout(complete, finishDelayMs);
      } else {
        complete();
      }
    },
    [normalizedStartingRevives, onComplete, roundId],
  );

  const showEnergyFeedback = useCallback((feedbackText?: string, tone: EndlessFeedbackTone = "energy") => {
    if (!feedbackText) return;
    const popup = {
      id: energyPopupIdRef.current + 1,
      text: feedbackText,
      tone,
    };
    energyPopupIdRef.current = popup.id;
    setEnergyPopups((current) => [...current.slice(-2), popup]);
    const timer = window.setTimeout(() => {
      setEnergyPopups((current) => current.filter((item) => item.id !== popup.id));
      energyPopupTimersRef.current = energyPopupTimersRef.current.filter((item) => item !== timer);
    }, ENDLESS_FEEDBACK_POPUP_MS);
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

  const setDamageInvincibleUntil = useCallback((until: number) => {
    damageInvincibleUntilRef.current = until;
    setDamageInvincible(performance.now() < until);
    if (damageInvincibleTimerRef.current !== null) window.clearTimeout(damageInvincibleTimerRef.current);
    damageInvincibleTimerRef.current = window.setTimeout(() => {
      damageInvincibleTimerRef.current = null;
      if (performance.now() >= damageInvincibleUntilRef.current) setDamageInvincible(false);
    }, Math.max(0, until - performance.now()));
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
    if (endedSkill) onSkillEndRef.current?.(endedSkill);
    activeSkillRef.current = null;
    setActiveSkill(null);
    setSkillEnding(false);
  }, [clearPassiveShield, clearSkillTimers]);

  const scheduleSkillTimers = useCallback((skill: EndlessActiveSkill) => {
    clearSkillTimers();
    if (pausedRef.current) return;
    if (typeof skill.until !== "number") return;
    const remainingMs = Math.max(0, skill.until - performance.now());
    skillEndingTimerRef.current = window.setTimeout(() => {
      skillEndingTimerRef.current = null;
      setSkillEnding(true);
    }, Math.max(0, remainingMs - ENDLESS_SKILL_ENDING_WARNING_MS));
    skillTimerRef.current = window.setTimeout(endSkill, remainingMs);
  }, [clearSkillTimers, endSkill]);

  const runtimePaused = paused || reviveCoinPrompt !== null;

  React.useEffect(() => {
    if (runtimePaused === pausedRef.current) return;
    pausedRef.current = runtimePaused;
    const nowMs = performance.now();
    if (runtimePaused) {
      pausedAtRef.current = nowMs;
      clearSkillTimers();
      return;
    }

    const pausedAt = pausedAtRef.current;
    pausedAtRef.current = null;
    if (pausedAt === null) return;

    const pausedDuration = Math.max(0, nowMs - pausedAt);
    startedAtRef.current += pausedDuration;
    const currentSkill = activeSkillRef.current;
    if (currentSkill?.until) {
      const nextSkill = { ...currentSkill, until: currentSkill.until + pausedDuration };
      activeSkillRef.current = nextSkill;
      setActiveSkill(nextSkill);
      scheduleSkillTimers(nextSkill);
    }
    if (damageInvincibleUntilRef.current > nowMs) {
      setDamageInvincibleUntil(damageInvincibleUntilRef.current + pausedDuration);
    }
  }, [clearSkillTimers, runtimePaused, scheduleSkillTimers, setDamageInvincibleUntil]);

  const setSkillEndHandler = useCallback((handler: ((skill: EndlessActiveSkill) => void) | null) => {
    onSkillEndRef.current = handler;
  }, []);

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
    showEnergyFeedback(getEndlessSkillFeedbackText(roundId), "skill");
    onSkillUseRef.current?.(roundId);
    scheduleSkillTimers(skill);
    return true;
  }, [clearPassiveShield, roundId, scheduleSkillTimers, showEnergyFeedback]);

  const useHeal = useCallback(() => {
    if (completedRef.current || revivesRef.current >= normalizedStartingRevives || energyRef.current < ENDLESS_SKILL_COST) return false;
    const nextEnergy = debugEnergyLockedRef.current ? ENDLESS_ENERGY_THRESHOLD : Math.max(0, energyRef.current - ENDLESS_SKILL_COST);
    energyRef.current = nextEnergy;
    setEnergy(nextEnergy);
    clearPassiveShield();
    const nextRevives = Math.min(normalizedStartingRevives, revivesRef.current + 1);
    revivesRef.current = nextRevives;
    setRevives(nextRevives);
    showEnergyFeedback("生命恢复！", "heal");
    return true;
  }, [clearPassiveShield, normalizedStartingRevives, showEnergyFeedback]);

  const confirmReviveCoin = useCallback(() => {
    if (!reviveCoinPrompt || completedRef.current) return;
    if (!onUseReviveCoinRef.current()) {
      const failedReason = reviveCoinPrompt.reason;
      setReviveCoinPrompt(null);
      finish(failedReason);
      return;
    }

    reviveCoinUsedRef.current = true;
    setReviveCoinUsed(true);
    revivesRef.current = normalizedStartingRevives;
    setRevives(normalizedStartingRevives);
    energyRef.current = ENDLESS_ENERGY_THRESHOLD;
    setEnergy(ENDLESS_ENERGY_THRESHOLD);
    syncPassiveShieldFromEnergy(ENDLESS_ENERGY_THRESHOLD);
    setDamageInvincibleUntil(performance.now() + ENDLESS_DAMAGE_PROTECTION_MS);
    setReviveCoinAnimationId((current) => current + 1);
    setReviveCoinPrompt(null);
    showEnergyFeedback("复活", "heal");
  }, [finish, normalizedStartingRevives, reviveCoinPrompt, setDamageInvincibleUntil, showEnergyFeedback, syncPassiveShieldFromEnergy]);

  const cancelReviveCoin = useCallback(() => {
    if (!reviveCoinPrompt || completedRef.current) return;
    setReviveCoinPrompt(null);
    finish(reviveCoinPrompt.reason);
  }, [finish, reviveCoinPrompt]);

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
      const nowMs = performance.now();
      if (pausedRef.current) return true;
      if (nowMs < damageInvincibleUntilRef.current) return true;
      if (shieldChargesRef.current > 0 || energyRef.current >= ENDLESS_ENERGY_THRESHOLD) {
        clearPassiveShield();
        energyRef.current = 0;
        setEnergy(0);
        if (debugEnergyLockedRef.current) {
          debugEnergyLockedRef.current = false;
          setDebugEnergyLocked(false);
        }
        setDamageInvincibleUntil(nowMs + ENDLESS_DAMAGE_PROTECTION_MS);
        showEnergyFeedback("护盾抵消！", "shield");
        return true;
      }
      setDamageInvincibleUntil(nowMs + ENDLESS_DAMAGE_PROTECTION_MS);
      incrementMetric("damageTaken");
      endSkill();
      if (revivesRef.current <= 1 && shouldKeepPigEndlessLife(avatarSkin)) {
        revivesRef.current = 1;
        setRevives(1);
        showEnergyFeedback("猪猪保命！", "heal");
        return true;
      }
      const nextRevives = Math.max(0, revivesRef.current - 1);
      revivesRef.current = nextRevives;
      setRevives(nextRevives);
      const canOfferReviveCoin = reviveCoinsRef.current > 0 && !reviveCoinUsedRef.current;
      if (nextRevives <= 0) {
        if (canOfferReviveCoin) {
          pausedRef.current = true;
          pausedAtRef.current = nowMs;
          clearSkillTimers();
          reviveCoinPromptIdRef.current += 1;
          setReviveCoinPrompt({ id: reviveCoinPromptIdRef.current, reason });
          return true;
        }
        finish(reason, finishDelayMs);
        return false;
      }
      return true;
    },
    [avatarSkin, clearPassiveShield, clearSkillTimers, endSkill, finish, incrementMetric, setDamageInvincibleUntil, showEnergyFeedback],
  );

  const settleExit = useCallback((reason: string) => {
    finish(reason, 0, "settled-exit");
  }, [finish]);

  React.useEffect(() => {
    return () => {
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      clearSkillTimers();
      if (damageInvincibleTimerRef.current !== null) window.clearTimeout(damageInvincibleTimerRef.current);
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
    cancelReviveCoin,
    canHeal: energy >= ENDLESS_SKILL_COST && revives < normalizedStartingRevives,
    canUseSkill: energy >= ENDLESS_SKILL_COST && !activeSkill,
    confirmReviveCoin,
    coreActions,
    damageInvincible,
    debugEnergyLocked,
    debugDifficulty,
    energyPopups,
    energyPercent: Math.round((energy / ENDLESS_ENERGY_THRESHOLD) * 100),
    finish,
    fillEnergy,
    gainEnergy,
    getActiveSkill,
    incrementMetric,
    loseLife,
    paused: runtimePaused,
    reportDifficulty,
    reportedDifficulty,
    reviveCoinAnimationId,
    reviveCoinPrompt,
    reviveCoinUsed,
    reviveCoins,
    revives,
    score: getEndlessScore({ bonusActions, coreActions }),
    settleExit,
    setDebugDifficulty,
    setDistanceScore,
    setMetric,
    setMetricMax,
    setMetricMin,
    setSkillEndHandler,
    shieldCharges,
    showFeedback: showEnergyFeedback,
    skillActive: activeSkill !== null,
    skillEnding,
    startingRevives: normalizedStartingRevives,
    toggleDebugEnergyLock,
    updateActiveSkill,
    useHeal,
    useSkill,
  };
}

function EndlessHud({
  api,
  bestScore,
  targetScore,
}: {
  api: EndlessRunApi;
  bestScore: number;
  targetScore?: number;
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
  const scoreReferenceText = targetScore !== undefined ? `对方成绩 ${targetScore}` : `最佳 ${bestScore}`;
  const recordBreaking = targetScore === undefined && api.score > bestScore;
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
    setLifePulse({ tone, changedIndex: clamp(changedIndex, 0, api.startingRevives - 1) });

    const timer = window.setTimeout(() => setLifePulse(null), 560);
    return () => window.clearTimeout(timer);
  }, [api.revives, api.startingRevives]);

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
      aria-label={`剩余复活 ${api.revives}/${api.startingRevives}，能量 ${activeEnergySegments}/${ENDLESS_ENERGY_THRESHOLD}，分数 ${api.score}，${scoreReferenceText}${recordBreaking ? "，新纪录" : ""}`}
    >
      <div className="endless-hearts" aria-label={`剩余复活 ${api.revives}/${api.startingRevives}`}>
        {Array.from({ length: api.startingRevives }, (_, index) => {
          const active = index < api.revives;
          const heartClassName = [
            "endless-heart-token",
            active ? "active" : "spent",
            lifePulse?.changedIndex === index ? `heart-${lifePulse.tone}` : "",
            lowLife && active ? "danger-heart" : "",
          ].filter(Boolean).join(" ");

          return (
            <span className={heartClassName} key={index}>
              <span className="endless-heart" aria-hidden="true" />
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
        <span className="endless-score-best">{scoreReferenceText}</span>
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
          <span className="endless-heal-icon" aria-hidden="true" />
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

function EndlessReviveCoinBank({ api }: { api: EndlessRunApi }) {
  return (
    <div className="endless-revive-bank" aria-label={`复活币 ${api.reviveCoins}${api.reviveCoinUsed ? "，已使用" : ""}`}>
      <span className="endless-revive-bank-icon" aria-hidden="true">
        <DonateIcon />
      </span>
      <strong>{api.reviveCoins}</strong>
      {api.reviveCoinUsed ? <span className="endless-revive-used">（已使用）</span> : null}
    </div>
  );
}

function EndlessReviveCoinPrompt({ api }: { api: EndlessRunApi }) {
  if (!api.reviveCoinPrompt) return null;
  return (
    <div className="endless-revive-prompt-backdrop" role="dialog" aria-modal="true" aria-labelledby="endless-revive-title" onPointerDown={(event) => event.stopPropagation()}>
      <div className="endless-revive-prompt">
        <span className="endless-revive-prompt-icon" aria-hidden="true">
          <DonateIcon />
        </span>
        <h2 id="endless-revive-title">使用复活币？</h2>
        <p>本局仅一次</p>
        <div className="endless-revive-prompt-actions">
          <button className="secondary-button" type="button" onClick={api.cancelReviveCoin}>
            放弃
          </button>
          <button className="primary-button" type="button" onClick={api.confirmReviveCoin}>
            使用
          </button>
        </div>
      </div>
    </div>
  );
}

function EndlessReviveCoinAnimation({ animationId }: { animationId: number }) {
  if (animationId <= 0) return null;
  return (
    <div className="endless-revive-totem-burst" key={animationId} aria-hidden="true">
      <span className="endless-revive-totem-coin main">
        <DonateIcon />
      </span>
      <span className="endless-revive-totem-coin left">
        <DonateIcon />
      </span>
      <span className="endless-revive-totem-coin right">
        <DonateIcon />
      </span>
    </div>
  );
}

function EndlessNativeRound({
  api,
  paused,
  runSeed,
  segment,
  shielded,
}: {
  api: EndlessRunApi;
  paused: boolean;
  runSeed: string;
  segment: EndlessSegment;
  shielded: boolean;
}) {
  const ignoreRoundCompletion = useCallback(() => undefined, []);

  if (segment.config.dimension === "reaction") {
    return <AdvancedReactionRound advancedConfig={segment.config} damageInvincible={api.damageInvincible} endless={api} onComplete={ignoreRoundCompletion} paused={paused} shielded={shielded} />;
  }
  if (segment.config.dimension === "aim") {
    return <AdvancedAimRound advancedConfig={segment.config} damageInvincible={api.damageInvincible} endless={api} onComplete={ignoreRoundCompletion} paused={paused} runSeed={runSeed} shielded={shielded} />;
  }
  return <AdvancedBrakingRound advancedConfig={segment.config} damageInvincible={api.damageInvincible} endless={api} onComplete={ignoreRoundCompletion} paused={paused} shielded={shielded} />;
}

function EndlessMiniGameRound({
  api,
  avatarEffect,
  paused,
  segment,
  shielded,
}: {
  api: EndlessRunApi;
  avatarEffect: PlayerAvatarEffect;
  paused: boolean;
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
      paused={paused}
      runSeed={runSeed}
      avatarEffect={avatarEffect}
      damageInvincible={api.damageInvincible}
      shielded={shielded}
    />
  );
}

function EndlessGameByRound({
  api,
  avatarEffect,
  paused,
  runSeed,
  segment,
  shielded,
}: {
  api: EndlessRunApi;
  avatarEffect: PlayerAvatarEffect;
  paused: boolean;
  runSeed: string;
  segment: EndlessSegment;
  shielded: boolean;
}) {
  if (segment.miniLevel) {
    return <EndlessMiniGameRound api={api} avatarEffect={avatarEffect} paused={paused} segment={segment} shielded={shielded} />;
  }
  return <EndlessNativeRound api={api} paused={paused} runSeed={runSeed} segment={segment} shielded={shielded} />;
}

export function EndlessRoundPlayer({
  avatarSkin,
  bestScore,
  onComplete,
  onSkillUse,
  onUseReviveCoin,
  paused = false,
  reviveCoins,
  roundId,
  settleSignal = 0,
  startingRevives = ENDLESS_STARTING_REVIVES,
  targetScore,
}: {
  avatarSkin: PlayerAvatarSkin;
  bestScore: number;
  debugToolsVisible: boolean;
  onComplete: (completion: EndlessRoundCompletion) => void;
  onSkillUse?: (roundId: RoundId) => void;
  onUseReviveCoin: () => boolean;
  paused?: boolean;
  reviveCoins: number;
  roundId: RoundId;
  settleSignal?: number;
  startingRevives?: number;
  targetScore?: number;
}) {
  const api = useEndlessRun({ avatarSkin, onComplete, onSkillUse, onUseReviveCoin, paused, reviveCoins, roundId, startingRevives });
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
  const shielded = avatarEffect === "shield" || api.shieldCharges > 0;

  React.useEffect(() => {
    if (settleSignal <= 0) return;
    api.settleExit("结算退出");
  }, [api, settleSignal]);

  return (
    <div className="endless-shell" data-difficulty-tone={difficultyTone}>
      <div className={`endless-game-host ${api.skillActive ? "skill-active" : ""} ${api.skillEnding ? "skill-ending" : ""}`} data-source-level={difficultyState.sourceAdvancedLevel} data-difficulty-tone={difficultyTone}>
        <EndlessGameByRound api={api} runSeed={runSeed} segment={segment} shielded={shielded} avatarEffect={avatarEffect === "shield" ? "none" : avatarEffect} paused={api.paused} />
        <EndlessHud
          api={api}
          bestScore={bestScore}
          targetScore={targetScore}
        />
        <EndlessReviveCoinBank api={api} />
        <EndlessReviveCoinPrompt api={api} />
        <EndlessReviveCoinAnimation animationId={api.reviveCoinAnimationId} />
        <div className="endless-energy-popups" aria-live="polite">
          {api.energyPopups.map((popup) => (
            <span className={`endless-energy-popup ${popup.tone}`} key={popup.id}>
              {popup.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
