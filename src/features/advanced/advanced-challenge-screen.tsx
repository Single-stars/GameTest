"use client";

import React from "react";
import {
  getAdvancedChallengeGoalItems,
  getAdvancedChallengeRuleItems,
  getAdvancedFailedResultGoalItems,
  getAdvancedLobbyLevelItems,
  getAdvancedLobbySliderOffsetRatio,
  getAdvancedLobbyUnlockedLevel,
  resolveAdvancedLobbyClickLevel,
  resolveAdvancedLobbySliderLevel,
  type AdvancedChallengeGoalItem,
} from "@/lib/advanced-challenge-view";
import { getAdvancedStageConfig, shouldShowPerfectClearShortcut, type AdvancedStageConfig } from "@/lib/advanced-challenges";
import {
  getAdvancedChallengeStatusLabel,
  getAdvancedCompletionActions,
  getAdvancedDimensionLevel,
  getAdvancedLevelToneForState,
  type AdvancedProgress,
} from "@/lib/advanced-progress";
import { type RoundId, type TrialEvent } from "@/lib/scoring";
import { rounds } from "@/features/game-flow/round-config";

export type AdvancedChallengeState =
  | { mode: "select"; roundId: RoundId }
  | { mode: "intro"; roundId: RoundId; level: number }
  | { mode: "playing"; roundId: RoundId; level: number; attemptId: number }
  | { mode: "base-playing"; roundId: RoundId; level: number; attemptId: number }
  | {
      mode: "complete";
      roundId: RoundId;
      level: number;
      score: number;
      minScore: number;
      passed: boolean;
      gained: boolean;
      correctCount: number;
      requiredCorrect: number;
      reason: string;
      starsBefore: number;
      starsAfter: number;
      rankBefore: string;
      rankAfter: string;
      goalChecks?: boolean[];
      reactionAverageMs?: number | null;
      reactionThresholdMs?: number | null;
    };

type AdvancedRoundRenderProps =
  | {
      key: string;
      phase: "advanced";
      advancedConfig: AdvancedStageConfig;
      round: RoundId;
      onComplete: (trials: TrialEvent[]) => void;
    }
  | {
      key: string;
      phase: "base";
      round: RoundId;
      onComplete: (trials: TrialEvent[]) => void;
    };

type AdvancedLobbyChallengeState = Extract<AdvancedChallengeState, { mode: "select" | "intro" | "complete" }>;

const DEFAULT_LOBBY_TRACK_STEP_PX = 156;
const ADVANCED_LOBBY_SWIPE_STEP_PX = 28;
const ADVANCED_TITLE_MIN_FONT_SIZE_PX = 14;
const ADVANCED_TITLE_MAX_FONT_SIZE_PX = 22;
const ADVANCED_HERO_TITLE_MIN_FONT_SIZE_PX = 22;
const ADVANCED_HERO_TITLE_MAX_FONT_SIZE_PX = 34;
const useBrowserLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

function getResponsiveTitleFontSize({
  availableWidthPx,
  titleWidthAtMaxFontPx,
  minFontSizePx,
  maxFontSizePx,
}: {
  availableWidthPx: number;
  titleWidthAtMaxFontPx: number;
  minFontSizePx: number;
  maxFontSizePx: number;
}) {
  if (!Number.isFinite(availableWidthPx) || availableWidthPx <= 0) return maxFontSizePx;
  if (!Number.isFinite(titleWidthAtMaxFontPx) || titleWidthAtMaxFontPx <= 0) return maxFontSizePx;

  const fitRatio = Math.min(1, availableWidthPx / titleWidthAtMaxFontPx);
  const fittedFontSize = Math.floor(maxFontSizePx * fitRatio);
  return Math.max(minFontSizePx, Math.min(maxFontSizePx, fittedFontSize));
}

function getRoundConfig(roundId: RoundId) {
  return rounds.find((round) => round.id === roundId) ?? rounds[0];
}

type AdvancedRoundConfig = ReturnType<typeof getRoundConfig>;

function getAdvancedChallengeHeroTitle({
  roundTitle,
  stageTitle,
}: {
  roundTitle: string;
  stageTitle: string;
}) {
  return `${roundTitle} · ${stageTitle}`;
}

function AdaptiveAdvancedTitle({
  title,
  blockClassName,
  measureClassName,
  minFontSizePx,
  maxFontSizePx,
}: {
  title: string;
  blockClassName: string;
  measureClassName: string;
  minFontSizePx: number;
  maxFontSizePx: number;
}) {
  const titleBlockRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const [fontSizePx, setFontSizePx] = React.useState(maxFontSizePx);

  useBrowserLayoutEffect(() => {
    const titleBlock = titleBlockRef.current;
    const measure = measureRef.current;
    if (!titleBlock || !measure) return undefined;

    const updateFontSize = () => {
      const nextFontSize = getResponsiveTitleFontSize({
        availableWidthPx: titleBlock.clientWidth,
        titleWidthAtMaxFontPx: measure.getBoundingClientRect().width,
        minFontSizePx,
        maxFontSizePx,
      });
      setFontSizePx(nextFontSize);
    };

    updateFontSize();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(updateFontSize);
    observer.observe(titleBlock);
    return () => observer.disconnect();
  }, [maxFontSizePx, minFontSizePx, title]);

  return (
    <div className={blockClassName} ref={titleBlockRef}>
      <h1 style={{ fontSize: `${fontSizePx}px` }}>{title}</h1>
      <span className={measureClassName} ref={measureRef} style={{ fontSize: `${maxFontSizePx}px` }} aria-hidden="true">
        {title}
      </span>
    </div>
  );
}

function AdaptiveAdvancedHeaderTitle({ title }: { title: string }) {
  return (
    <AdaptiveAdvancedTitle
      title={title}
      blockClassName="advanced-header-title-block"
      measureClassName="advanced-title-measure"
      minFontSizePx={ADVANCED_TITLE_MIN_FONT_SIZE_PX}
      maxFontSizePx={ADVANCED_TITLE_MAX_FONT_SIZE_PX}
    />
  );
}

function AdaptiveAdvancedHeroTitle({ title }: { title: string }) {
  return (
    <AdaptiveAdvancedTitle
      title={title}
      blockClassName="advanced-hero-title-block"
      measureClassName="advanced-hero-title-measure"
      minFontSizePx={ADVANCED_HERO_TITLE_MIN_FONT_SIZE_PX}
      maxFontSizePx={ADVANCED_HERO_TITLE_MAX_FONT_SIZE_PX}
    />
  );
}

function textIncludesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function numberParam(config: AdvancedStageConfig, key: string) {
  const value = Number(config.params[key]);
  return Number.isFinite(value) ? value : null;
}

function getFallbackResultGoalStatus({
  goal,
  challenge,
}: {
  goal: AdvancedChallengeGoalItem;
  challenge: Extract<AdvancedChallengeState, { mode: "complete" }>;
}) {
  if (challenge.passed) return true;
  const reason = challenge.reason.replace(/^失败[:：]\s*/, "");
  if (goal.icon === "target") {
    return challenge.correctCount >= challenge.requiredCorrect && !textIncludesAny(reason, ["少", "未", "漏", "错"]);
  }
  if (goal.icon === "ban") {
    return !textIncludesAny(reason, ["红灯", "干扰", "危险", "灰色", "中断", "撞", "漏踩"]);
  }
  if (goal.icon === "bolt") {
    return !textIncludesAny(reason, ["平均", "太慢", "规则", "等待"]);
  }
  if (goal.icon === "flag") {
    return !textIncludesAny(reason, ["飞出", "未走出", "未完成", "掉", "终点", "漏收集"]);
  }
  return false;
}

function formatReactionAverageGoalText(averageMs: number | null, thresholdMs: number) {
  return `平均反应 ${averageMs === null ? "--" : averageMs}/${thresholdMs}ms`;
}

function decorateGoalItemsWithReactionAverage({
  config,
  goalItems,
  averageMs,
  challenged,
}: {
  config: AdvancedStageConfig;
  goalItems: AdvancedChallengeGoalItem[];
  averageMs: number | null;
  challenged: boolean;
}) {
  if (config.dimension !== "reaction" || !challenged) return goalItems;
  const threshold = numberParam(config, "avgMsThreshold");
  if (threshold === null) return goalItems;
  return goalItems.map((goal, index) =>
    goal.icon === "bolt" || index === goalItems.length - 1 ? { ...goal, text: formatReactionAverageGoalText(averageMs, threshold) } : goal,
  );
}

function resolveResultGoalChecks({
  challenge,
  goalItems,
}: {
  challenge: Extract<AdvancedChallengeState, { mode: "complete" }>;
  goalItems: AdvancedChallengeGoalItem[];
}) {
  if (challenge.passed) return goalItems.map(() => true);
  if (Array.isArray(challenge.goalChecks) && challenge.goalChecks.length > 0) {
    return goalItems.map((_, index) => challenge.goalChecks?.[index] === true);
  }
  return goalItems.map((goal) => getFallbackResultGoalStatus({ goal, challenge }));
}

function AdvancedResultCard({
  config,
  challenge,
  goalItems,
  onBack,
  onOpenLuckDraw,
  onStartLevel,
}: {
  config: AdvancedStageConfig;
  challenge: Extract<AdvancedChallengeState, { mode: "complete" }>;
  goalItems: AdvancedChallengeGoalItem[];
  onBack: () => void;
  onOpenLuckDraw: () => void;
  onStartLevel: (level: number) => void;
}) {
  const completionActions = getAdvancedCompletionActions({ passed: challenge.passed, gained: challenge.gained, level: challenge.level });
  const decoratedGoals = decorateGoalItemsWithReactionAverage({
    config,
    goalItems,
    averageMs: challenge.reactionAverageMs ?? null,
    challenged: true,
  });
  const goalChecks = resolveResultGoalChecks({ challenge, goalItems: decoratedGoals });
  const resultGoalItems = decoratedGoals.map((goal, index) => ({
    ...goal,
    complete: goalChecks[index] === true,
  }));
  const failedGoalItems = getAdvancedFailedResultGoalItems(resultGoalItems);
  const outcomeTitle = `进阶${challenge.level}·${challenge.passed ? "挑战成功" : "挑战失败"}`;

  return (
    <>
      <div className={`advanced-result-card ${challenge.passed ? "passed" : "failed"}`}>
        <p className="eyebrow">{outcomeTitle}</p>
        {challenge.passed ? (
          <div className="advanced-result-perfect">
            <span className="advanced-result-goal-box" aria-hidden="true">✓</span>
            <span>完美通关</span>
          </div>
        ) : failedGoalItems.length > 0 ? (
          <ul className="advanced-result-goals">
            {failedGoalItems.map((goal) => (
              <li className="advanced-result-goal incomplete" key={`${goal.icon}-${goal.text}`}>
                <span className="advanced-result-goal-box" aria-hidden="true">×</span>
                <span>{goal.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={`advanced-actions advanced-actions-${completionActions.length}`}>
          {completionActions.includes("retry") ? (
            <button className="secondary-button" type="button" onPointerDown={() => onStartLevel(challenge.level)}>
              重试
            </button>
          ) : null}
          {completionActions.includes("next") ? (
            <button className="secondary-button" type="button" onPointerDown={() => onStartLevel(challenge.level + 1)}>
              下一阶
            </button>
          ) : null}
          {completionActions.includes("back") ? (
            <button className="primary-button" type="button" onPointerDown={onBack}>
              返回
            </button>
          ) : null}
        </div>
      </div>
      {challenge.passed && challenge.gained ? (
        <div className="advanced-luck-coin-card" aria-live="polite">
          <strong>获得【幸运币】*1</strong>
          <button className="advanced-reward-luck-link" type="button" onPointerDown={onOpenLuckDraw}>
            前往抽奖
          </button>
        </div>
      ) : null}
    </>
  );
}

function AdvancedLevelSelectionPanel({
  activeConfig,
  challenge,
  currentLevel,
  selectedLevel,
  unlockedLevel,
  onPickLevel,
  onRestartBaseRound,
  onStartLevel,
}: {
  activeConfig: AdvancedStageConfig;
  challenge: Exclude<AdvancedLobbyChallengeState, { mode: "complete" }>;
  currentLevel: number;
  selectedLevel: number;
  unlockedLevel: number;
  onPickLevel: (level: number) => void;
  onRestartBaseRound: (level: number) => void;
  onStartLevel: (level: number) => void;
}) {
  const carouselRef = React.useRef<HTMLDivElement | null>(null);
  const sliderVisualRef = React.useRef<HTMLDivElement | null>(null);
  const activeLobbyPointerIdRef = React.useRef<number | null>(null);
  const lobbySwipeStartXRef = React.useRef(0);
  const lobbySwipeConsumedRef = React.useRef(false);
  const lobbyPointerDownLevelRef = React.useRef<number | null>(null);
  const suppressNextLevelClickRef = React.useRef(false);
  const selectedLevelRef = React.useRef(selectedLevel);
  const [trackStepPx, setTrackStepPx] = React.useState(DEFAULT_LOBBY_TRACK_STEP_PX);
  const [sliderTravelPx, setSliderTravelPx] = React.useState(0);
  const levelItems = getAdvancedLobbyLevelItems({ currentLevel, selectedLevel });
  const selectedItem = levelItems.find((item) => item.position === "selected");
  const selectedState = selectedItem?.state ?? "locked";
  const selectedTone = getAdvancedLevelToneForState(selectedState, selectedLevel);
  const sliderThumbOffsetPx = sliderTravelPx * getAdvancedLobbySliderOffsetRatio(selectedLevel);
  const ruleItems = getAdvancedChallengeRuleItems(activeConfig);
  const lobbyTrackStyle = {
    "--advanced-lobby-anchor": `${(selectedLevel - 1) * trackStepPx}px`,
  } as React.CSSProperties;

  React.useEffect(() => {
    selectedLevelRef.current = selectedLevel;
  }, [selectedLevel]);

  React.useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return undefined;

    const updateTrackStep = () => {
      const value = Number.parseFloat(window.getComputedStyle(carousel).getPropertyValue("--advanced-lobby-step-px"));
      if (Number.isFinite(value) && value > 0) setTrackStepPx(value);
    };

    updateTrackStep();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(updateTrackStep);
    observer.observe(carousel);
    return () => observer.disconnect();
  }, []);

  useBrowserLayoutEffect(() => {
    const sliderVisual = sliderVisualRef.current;
    if (!sliderVisual) return undefined;

    const updateSliderTravel = () => {
      setSliderTravelPx(unlockedLevel > 1 ? sliderVisual.clientWidth : 0);
    };

    updateSliderTravel();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(updateSliderTravel);
    observer.observe(sliderVisual);
    return () => observer.disconnect();
  }, [unlockedLevel]);

  const handleLevelClick = (level: number) => {
    const clickedLevel = resolveAdvancedLobbyClickLevel({ currentLevel, requestedLevel: level });
    if (clickedLevel !== null) onPickLevel(clickedLevel);
  };

  const handleLevelSliderInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sliderLevel = resolveAdvancedLobbySliderLevel({
      currentLevel,
      requestedLevel: Number(event.currentTarget.value),
    });
    if (sliderLevel !== selectedLevel) onPickLevel(sliderLevel);
  };

  const handleLevelButtonClick = (event: React.MouseEvent<HTMLButtonElement>, level: number) => {
    if (suppressNextLevelClickRef.current) {
      suppressNextLevelClickRef.current = false;
      event.preventDefault();
      return;
    }
    handleLevelClick(level);
  };

  const handleLobbyPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const levelButton = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".advanced-lobby-level") : null;
    const pointerDownLevel = levelButton && !levelButton.disabled ? Number(levelButton.dataset.level) : Number.NaN;
    lobbyPointerDownLevelRef.current = Number.isFinite(pointerDownLevel) ? pointerDownLevel : null;
    activeLobbyPointerIdRef.current = event.pointerId;
    lobbySwipeStartXRef.current = event.clientX;
    lobbySwipeConsumedRef.current = false;
    suppressNextLevelClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleLobbyPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeLobbyPointerIdRef.current !== event.pointerId) return;
    if (lobbySwipeConsumedRef.current) return;

    const deltaX = event.clientX - lobbySwipeStartXRef.current;
    if (Math.abs(deltaX) < ADVANCED_LOBBY_SWIPE_STEP_PX) return;
    lobbySwipeConsumedRef.current = true;
    suppressNextLevelClickRef.current = true;

    const direction = deltaX < 0 ? 1 : -1;
    const nextLevel = resolveAdvancedLobbySliderLevel({
      currentLevel,
      requestedLevel: selectedLevelRef.current + direction,
    });

    lobbySwipeStartXRef.current = event.clientX;
    if (nextLevel !== selectedLevelRef.current) {
      selectedLevelRef.current = nextLevel;
      onPickLevel(nextLevel);
    }
    event.preventDefault();
  };

  const handleLobbyPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeLobbyPointerIdRef.current !== event.pointerId) return;
    const tappedLevel = lobbyPointerDownLevelRef.current;
    if (lobbySwipeConsumedRef.current) {
      event.preventDefault();
      window.setTimeout(() => {
        suppressNextLevelClickRef.current = false;
      }, 0);
    } else {
      suppressNextLevelClickRef.current = false;
      if (tappedLevel !== null) {
        handleLevelClick(tappedLevel);
        suppressNextLevelClickRef.current = true;
        window.setTimeout(() => {
          suppressNextLevelClickRef.current = false;
        }, 0);
      }
    }
    activeLobbyPointerIdRef.current = null;
    lobbyPointerDownLevelRef.current = null;
    lobbySwipeConsumedRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleLobbyPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeLobbyPointerIdRef.current !== event.pointerId) return;
    activeLobbyPointerIdRef.current = null;
    lobbyPointerDownLevelRef.current = null;
    lobbySwipeConsumedRef.current = false;
    suppressNextLevelClickRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div className="advanced-panel advanced-lobby-panel">
      <div
        className="advanced-lobby-carousel"
        ref={carouselRef}
        onPointerCancel={handleLobbyPointerCancel}
        onPointerDown={handleLobbyPointerDown}
        onPointerMove={handleLobbyPointerMove}
        onPointerUp={handleLobbyPointerUp}
      >
        <div className="advanced-lobby-track" style={lobbyTrackStyle}>
          {levelItems.map((item) => {
            const selected = item.position === "selected";
            const tone = getAdvancedLevelToneForState(item.state, item.level);
            const itemConfig = getAdvancedStageConfig(challenge.roundId, item.level);
            return (
              <button
                aria-label={`${itemConfig.stageTitle}${getAdvancedChallengeStatusLabel(item.state)}`}
                className={`advanced-lobby-level ${item.position} ${item.state} ${tone} ${selected ? "selected" : ""}`}
                data-level={item.level}
                disabled={!item.selectable}
                key={item.level}
                type="button"
                onClick={(event) => handleLevelButtonClick(event, item.level)}
              >
                {item.state === "completed" ? (
                  <span className="advanced-lobby-badge" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
                <strong>第 {item.level} 关</strong>
                <small>{getAdvancedChallengeStatusLabel(item.state)}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`advanced-lobby-slider ${selectedState} ${selectedTone}`}
        style={{ "--advanced-lobby-slider-thumb-offset": `${sliderThumbOffsetPx}px` } as React.CSSProperties}
      >
        <div className="advanced-lobby-slider-visual" ref={sliderVisualRef} aria-hidden="true">
          <span className="advanced-lobby-slider-thumb-label">{selectedLevel}</span>
        </div>
        <input
          aria-label="Select advanced level"
          className="advanced-lobby-range"
          max={10}
          min={1}
          step={1}
          type="range"
          value={selectedLevel}
          onChange={handleLevelSliderInput}
        />
      </div>

      <div className="advanced-goal-card">
        <div className="advanced-goal-heading">
          <h2>{activeConfig.stageTitle}</h2>
          <span>{getAdvancedChallengeStatusLabel(selectedState)}</span>
        </div>
        <ul>
          {ruleItems.map((item) => (
            <li className="advanced-goal-item complete" key={`${item.icon}-${item.text}`}>
              <span className="advanced-goal-box" aria-hidden="true">✓</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="advanced-lobby-actions">
        <button className="secondary-button" disabled={selectedState === "locked"} type="button" onPointerDown={() => onRestartBaseRound(selectedLevel)}>
          重新挑战基础关
        </button>
        <button className="primary-button" disabled={selectedState === "locked"} type="button" onPointerDown={() => onStartLevel(selectedLevel)}>
          开始挑战
        </button>
      </div>
    </div>
  );
}

function AdvancedLobbyContent({
  challenge,
  currentLevel,
  round,
  unlockedLevel,
  onBack,
  onOpenLuckDraw,
  onPickLevel,
  onRestartBaseRound,
  onStartLevel,
}: {
  challenge: AdvancedLobbyChallengeState;
  currentLevel: number;
  round: AdvancedRoundConfig;
  unlockedLevel: number;
  onBack: () => void;
  onOpenLuckDraw: () => void;
  onPickLevel: (level: number) => void;
  onRestartBaseRound: (level: number) => void;
  onStartLevel: (level: number) => void;
}) {
  const activeLevel = challenge.mode === "select" ? unlockedLevel : challenge.level;
  const selectedLevel = resolveAdvancedLobbySliderLevel({ currentLevel, requestedLevel: activeLevel });
  const activeConfig = getAdvancedStageConfig(challenge.roundId, selectedLevel);
  const goalItems = getAdvancedChallengeGoalItems(activeConfig);
  const [baseRulesOpen, setBaseRulesOpen] = React.useState(false);
  const baseRuleDetailsRef = React.useRef<HTMLDetailsElement | null>(null);

  React.useEffect(() => {
    if (!baseRulesOpen) return undefined;

    const closeOnOutside = (event: PointerEvent) => {
      if (!baseRuleDetailsRef.current?.contains(event.target as Node)) {
        setBaseRulesOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [baseRulesOpen]);

  return (
    <section className="advanced-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>{round.measure}</span>
      </header>

      <div className="advanced-hero advanced-hero-with-rule">
        <AdaptiveAdvancedHeroTitle
          title={getAdvancedChallengeHeroTitle({
            roundTitle: round.title,
            stageTitle: activeConfig.stageTitle,
          })}
        />
        <details
          className="advanced-rule-details"
          onToggle={(event) => setBaseRulesOpen(event.currentTarget.open)}
          open={baseRulesOpen}
          ref={baseRuleDetailsRef}
        >
          <summary>?</summary>
          <div className="advanced-rule-details-content">
            <p>{round.rule}</p>
            <p>{round.action}</p>
            <p>PS：作者不怀好意地加大了难度。</p>
          </div>
        </details>
      </div>

      {challenge.mode === "complete" ? (
        <AdvancedResultCard
          config={activeConfig}
          challenge={challenge}
          goalItems={goalItems}
          onBack={onBack}
          onOpenLuckDraw={onOpenLuckDraw}
          onStartLevel={onStartLevel}
        />
      ) : (
        <AdvancedLevelSelectionPanel
          activeConfig={activeConfig}
          challenge={challenge}
          currentLevel={currentLevel}
          selectedLevel={selectedLevel}
          unlockedLevel={unlockedLevel}
          onPickLevel={onPickLevel}
          onRestartBaseRound={onRestartBaseRound}
          onStartLevel={onStartLevel}
        />
      )}
    </section>
  );
}

export function AdvancedChallengeScreen({
  advancedProgress,
  challenge,
  debugToolsVisible,
  onBack,
  onBuildPerfectTrials,
  onCompleteBaseRound,
  onCompleteRound,
  onOpenLuckDraw,
  onPickLevel,
  onRestartBaseRound,
  onStartLevel,
  renderRound,
}: {
  advancedProgress: AdvancedProgress;
  challenge: AdvancedChallengeState;
  debugToolsVisible: boolean;
  onBack: () => void;
  onBuildPerfectTrials: (config: AdvancedStageConfig) => TrialEvent[];
  onCompleteBaseRound: (record: { roundId: RoundId; level: number; trials: TrialEvent[] }) => void;
  onCompleteRound: (trials: TrialEvent[]) => void;
  onOpenLuckDraw: () => void;
  onPickLevel: (level: number) => void;
  onRestartBaseRound: (level: number) => void;
  onStartLevel: (level: number) => void;
  renderRound: (props: AdvancedRoundRenderProps) => React.ReactNode;
}) {
  const round = getRoundConfig(challenge.roundId);
  const currentLevel = getAdvancedDimensionLevel(advancedProgress, challenge.roundId);
  const unlockedLevel = getAdvancedLobbyUnlockedLevel(currentLevel);
  const [dismissedAdvancedTutorialKey, setDismissedAdvancedTutorialKey] = React.useState("");

  if (challenge.mode === "playing") {
    const playingConfig = getAdvancedStageConfig(challenge.roundId, challenge.level);
    const advancedTutorialKey = `${challenge.roundId}-${challenge.level}-${challenge.attemptId}`;
    const advancedTutorialVisible = challenge.level <= 3 && dismissedAdvancedTutorialKey !== advancedTutorialKey;
    const advancedTutorialItems = getAdvancedChallengeRuleItems(playingConfig);
    const dismissAdvancedTutorial = () => setDismissedAdvancedTutorialKey(advancedTutorialKey);
    const handleAdvancedTutorialKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") dismissAdvancedTutorial();
    };

    return (
      <section className="play-screen advanced-play-screen" aria-live="polite">
        <header className="round-header advanced-round-header">
          <AdaptiveAdvancedHeaderTitle
            title={getAdvancedChallengeHeroTitle({
              roundTitle: round.title,
              stageTitle: playingConfig.stageTitle,
            })}
          />
          <div className="advanced-header-actions">
            <button className="advanced-back-button" type="button" onPointerDown={() => onStartLevel(challenge.level)}>
              重试
            </button>
            {shouldShowPerfectClearShortcut({ debugToolsVisible }) ? (
              <button className="advanced-back-button" type="button" onPointerDown={() => onCompleteRound(onBuildPerfectTrials(playingConfig))}>
                一键满分过关
              </button>
            ) : null}
          </div>
        </header>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${challenge.level * 10}%` }} />
        </div>
        {advancedTutorialVisible
          ? null
          : renderRound({
              key: `advanced-${challenge.roundId}-${challenge.level}-${challenge.attemptId}`,
              phase: "advanced",
              advancedConfig: playingConfig,
              round: challenge.roundId,
              onComplete: onCompleteRound,
            })}
        {advancedTutorialVisible ? (
          <div
            className="advanced-tutorial-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-tutorial-title"
            tabIndex={0}
            onKeyDown={handleAdvancedTutorialKeyDown}
            onPointerDown={dismissAdvancedTutorial}
          >
            <div className="advanced-tutorial-panel">
              <h2 id="advanced-tutorial-title">{playingConfig.stageTitle}</h2>
              <ul className="advanced-tutorial-steps">
                {advancedTutorialItems.map((item) => (
                  <li key={`${item.icon}-${item.text}`}>{item.text}</li>
                ))}
              </ul>
              <small className="advanced-tutorial-start-hint">点击任意位置开始挑战</small>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (challenge.mode === "base-playing") {
    return (
      <section className="play-screen advanced-base-play-screen" aria-live="polite">
        <header className="round-header advanced-round-header">
          <div>
            <p className="eyebrow">{round.measure}基础关</p>
            <h1>{round.title}</h1>
          </div>
          <button className="advanced-back-button" type="button" onPointerDown={() => onRestartBaseRound(challenge.level)}>
            重试
          </button>
        </header>
        {renderRound({
          key: `advanced-base-${challenge.roundId}-${challenge.attemptId}`,
          phase: "base",
          round: challenge.roundId,
          onComplete: (trials) => onCompleteBaseRound({ roundId: challenge.roundId, level: challenge.level, trials }),
        })}
      </section>
    );
  }

  return (
    <AdvancedLobbyContent
      challenge={challenge}
      currentLevel={currentLevel}
      round={round}
      unlockedLevel={unlockedLevel}
      onBack={onBack}
      onOpenLuckDraw={onOpenLuckDraw}
      onPickLevel={onPickLevel}
      onRestartBaseRound={onRestartBaseRound}
      onStartLevel={onStartLevel}
    />
  );
}
