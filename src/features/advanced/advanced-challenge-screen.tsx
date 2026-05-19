"use client";

import React from "react";
import {
  getAdvancedChallengeGoalItems,
  getAdvancedLobbyLevelItems,
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

const GOAL_ICON_LABELS = {
  target: "◎",
  ban: "⊘",
  bolt: "↯",
  flag: "✓",
} as const;
const DEFAULT_LOBBY_TRACK_STEP_PX = 156;
const ADVANCED_TITLE_MIN_FONT_SIZE_PX = 14;
const ADVANCED_TITLE_MAX_FONT_SIZE_PX = 22;
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

function AdaptiveAdvancedHeaderTitle({ title }: { title: string }) {
  const titleBlockRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLSpanElement | null>(null);
  const [fontSizePx, setFontSizePx] = React.useState(ADVANCED_TITLE_MAX_FONT_SIZE_PX);

  React.useEffect(() => {
    const titleBlock = titleBlockRef.current;
    const measure = measureRef.current;
    if (!titleBlock || !measure) return undefined;

    const updateFontSize = () => {
      const nextFontSize = getResponsiveTitleFontSize({
        availableWidthPx: titleBlock.clientWidth,
        titleWidthAtMaxFontPx: measure.getBoundingClientRect().width,
        minFontSizePx: ADVANCED_TITLE_MIN_FONT_SIZE_PX,
        maxFontSizePx: ADVANCED_TITLE_MAX_FONT_SIZE_PX,
      });
      setFontSizePx(nextFontSize);
    };

    updateFontSize();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(updateFontSize);
    observer.observe(titleBlock);
    return () => observer.disconnect();
  }, [title]);

  return (
    <div className="advanced-header-title-block" ref={titleBlockRef}>
      <h1 style={{ fontSize: `${fontSizePx}px` }}>{title}</h1>
      <span className="advanced-title-measure" ref={measureRef} aria-hidden="true">
        {title}
      </span>
    </div>
  );
}

function textIncludesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function getAdvancedResultGoalStatus({
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

function AdvancedResultCard({
  challenge,
  goalItems,
  onBack,
  onStartLevel,
}: {
  challenge: Extract<AdvancedChallengeState, { mode: "complete" }>;
  goalItems: AdvancedChallengeGoalItem[];
  onBack: () => void;
  onStartLevel: (level: number) => void;
}) {
  const completionActions = getAdvancedCompletionActions({ passed: challenge.passed, gained: challenge.gained, level: challenge.level });
  const resultGoalItems = goalItems.map((goal) => ({
    ...goal,
    complete: getAdvancedResultGoalStatus({ goal, challenge }),
  }));

  return (
    <div className={`advanced-result-card ${challenge.passed ? "passed" : "failed"}`}>
      <p className="eyebrow">{challenge.passed ? "挑战成功" : "挑战失败"}</p>
      <ul className="advanced-result-goals">
        {resultGoalItems.map((goal) => (
          <li className={`advanced-result-goal ${goal.complete ? "complete" : "incomplete"}`} key={`${goal.icon}-${goal.text}`}>
            <span className="advanced-result-goal-box" aria-hidden="true">
              {goal.complete ? "✓" : "×"}
            </span>
            <span>{goal.text}</span>
          </li>
        ))}
      </ul>
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
        {completionActions.includes("maxed") ? (
          <button className="primary-button" type="button" onPointerDown={onBack}>
            已满阶
          </button>
        ) : null}
      </div>
    </div>
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
  const [trackStepPx, setTrackStepPx] = React.useState(DEFAULT_LOBBY_TRACK_STEP_PX);
  const [sliderTravelPx, setSliderTravelPx] = React.useState(0);
  const levelItems = getAdvancedLobbyLevelItems({ currentLevel, selectedLevel });
  const selectedItem = levelItems.find((item) => item.position === "selected");
  const selectedState = selectedItem?.state ?? "locked";
  const selectedTone = getAdvancedLevelToneForState(selectedState, selectedLevel);
  const sliderThumbOffsetPx = unlockedLevel > 1 ? (sliderTravelPx * (selectedLevel - 1)) / (unlockedLevel - 1) : 0;
  const goalItems = getAdvancedChallengeGoalItems(activeConfig);
  const lobbyTrackStyle = {
    "--advanced-lobby-anchor": `${(selectedLevel - 1) * trackStepPx}px`,
  } as React.CSSProperties;

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

  return (
    <div className="advanced-panel advanced-lobby-panel">
      <div className="advanced-lobby-carousel" ref={carouselRef}>
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
                onClick={() => handleLevelClick(item.level)}
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
          max={unlockedLevel}
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
          {goalItems.map((item) => (
            <li key={`${item.icon}-${item.text}`}>
              <span className={`advanced-goal-icon ${item.icon}`} aria-hidden="true">
                {GOAL_ICON_LABELS[item.icon]}
              </span>
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
  onPickLevel,
  onRestartBaseRound,
  onStartLevel,
}: {
  challenge: AdvancedLobbyChallengeState;
  currentLevel: number;
  round: AdvancedRoundConfig;
  unlockedLevel: number;
  onBack: () => void;
  onPickLevel: (level: number) => void;
  onRestartBaseRound: (level: number) => void;
  onStartLevel: (level: number) => void;
}) {
  const activeLevel = challenge.mode === "select" ? unlockedLevel : challenge.level;
  const selectedLevel = resolveAdvancedLobbySliderLevel({ currentLevel, requestedLevel: activeLevel });
  const activeConfig = getAdvancedStageConfig(challenge.roundId, selectedLevel);
  const goalItems = getAdvancedChallengeGoalItems(activeConfig);

  return (
    <section className="advanced-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>{round.measure}</span>
      </header>

      <div className="advanced-hero">
        <h1>
          {getAdvancedChallengeHeroTitle({
            roundTitle: round.title,
            stageTitle: activeConfig.stageTitle,
          })}
        </h1>
      </div>

      {challenge.mode === "complete" ? (
        <AdvancedResultCard challenge={challenge} goalItems={goalItems} onBack={onBack} onStartLevel={onStartLevel} />
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
  onPickLevel: (level: number) => void;
  onRestartBaseRound: (level: number) => void;
  onStartLevel: (level: number) => void;
  renderRound: (props: AdvancedRoundRenderProps) => React.ReactNode;
}) {
  const round = getRoundConfig(challenge.roundId);
  const currentLevel = getAdvancedDimensionLevel(advancedProgress, challenge.roundId);
  const unlockedLevel = getAdvancedLobbyUnlockedLevel(currentLevel);

  if (challenge.mode === "playing") {
    const playingConfig = getAdvancedStageConfig(challenge.roundId, challenge.level);
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
            <button className="advanced-back-button" type="button" onPointerDown={onBack}>
              返回
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
        {renderRound({
          key: `advanced-${challenge.roundId}-${challenge.level}-${challenge.attemptId}`,
          phase: "advanced",
          advancedConfig: playingConfig,
          round: challenge.roundId,
          onComplete: onCompleteRound,
        })}
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
          <button className="advanced-back-button" type="button" onPointerDown={onBack}>
            返回
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
      onPickLevel={onPickLevel}
      onRestartBaseRound={onRestartBaseRound}
      onStartLevel={onStartLevel}
    />
  );
}
