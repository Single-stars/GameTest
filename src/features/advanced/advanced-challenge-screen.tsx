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
  getAdvancedLevelTone,
  getAdvancedLevelToneForState,
  type AdvancedProgress,
} from "@/lib/advanced-progress";
import { ENDLESS_MODE_LEVEL, getAdvancedEndlessStatusLabel, getEndlessLevelState } from "@/lib/endless-mode";
import {
  buildEndlessSettlementRows,
  compareEndlessSettlementValues,
  formatEndlessRunValue,
  type EndlessRunSnapshot,
  type EndlessSettlementRow,
} from "@/lib/endless-run-snapshot";
import {
  getEndlessChallengeOutcome,
  getEndlessChallengeOutcomeLabel,
  type EndlessChallengePayload,
} from "@/lib/endless-challenge-share";
import { type RoundId, type TrialEvent } from "@/lib/scoring";
import { EndlessRoundPlayer, type EndlessRoundCompletion } from "@/features/endless/endless-round-player";
import { rounds } from "@/features/game-flow/round-config";

export type AdvancedChallengeState =
  | { mode: "select"; roundId: RoundId }
  | { mode: "intro"; roundId: RoundId; level: number }
  | { mode: "playing"; roundId: RoundId; level: number; attemptId: number }
  | { mode: "base-playing"; roundId: RoundId; level: number; attemptId: number }
  | { mode: "endless-playing"; roundId: RoundId; attemptId: number }
  | { mode: "challenge-playing"; roundId: RoundId; attemptId: number; target: EndlessChallengePayload }
  | {
      mode: "endless-complete";
      roundId: RoundId;
      score: number;
      bestScore: number;
      previousBestScore: number;
      snapshot: EndlessRunSnapshot;
      bestSnapshot: EndlessRunSnapshot | null;
      reason: string;
      revivesUsed: number;
    }
  | {
      mode: "challenge-complete";
      roundId: RoundId;
      target: EndlessChallengePayload;
      challenger: EndlessRunSnapshot;
    }
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
      paused: boolean;
    }
  | {
      key: string;
      phase: "base";
      round: RoundId;
      onComplete: (trials: TrialEvent[]) => void;
      paused: boolean;
    };

type AdvancedLobbyChallengeState = Extract<AdvancedChallengeState, { mode: "select" | "intro" | "complete" | "endless-complete" | "challenge-complete" }>;
type AdvancedPauseDialogState =
  | { mode: "advanced"; level: number; roundId: RoundId }
  | { mode: "base"; level: number; roundId: RoundId }
  | { mode: "endless"; roundId: RoundId };

const ADVANCED_PAUSE_BACK_HISTORY_STATE = { gameRankTestInternal: true, gameRankTestLayer: 2 } as const;
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

function getPauseDialogForChallenge(challenge: AdvancedChallengeState): AdvancedPauseDialogState | null {
  if (challenge.mode === "playing") return { mode: "advanced", level: challenge.level, roundId: challenge.roundId };
  if (challenge.mode === "base-playing") return { mode: "base", level: challenge.level, roundId: challenge.roundId };
  if (challenge.mode === "endless-playing" || challenge.mode === "challenge-playing") return { mode: "endless", roundId: challenge.roundId };
  return null;
}

function writePauseBackHistoryGuard() {
  if (typeof window === "undefined") return;
  window.history.pushState(ADVANCED_PAUSE_BACK_HISTORY_STATE, "", window.location.href);
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

function AdvancedPauseDialog({
  onContinue,
  onRestart,
  onSettleExit,
}: {
  onContinue: () => void;
  onRestart: () => void;
  onSettleExit: () => void;
}) {
  return (
    <div className="advanced-pause-backdrop" role="presentation">
      <div className="advanced-pause-dialog" role="dialog" aria-modal="true" aria-labelledby="advanced-pause-title">
        <h2 id="advanced-pause-title">暂停</h2>
        <div className="advanced-pause-actions">
          <button className="advanced-pause-action advanced-pause-action-settle" type="button" onClick={onSettleExit}>
            <span className="advanced-pause-action-icon" aria-hidden="true" />
            <span className="advanced-pause-action-label">结算退出</span>
          </button>
          <button className="advanced-pause-action advanced-pause-action-restart" type="button" onClick={onRestart}>
            <span className="advanced-pause-action-icon" aria-hidden="true" />
            <span className="advanced-pause-action-label">重新开始</span>
          </button>
          <button className="advanced-pause-action advanced-pause-action-continue" type="button" onClick={onContinue}>
            <span className="advanced-pause-action-icon" aria-hidden="true" />
            <span className="advanced-pause-action-label">继续游戏</span>
          </button>
        </div>
      </div>
    </div>
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
            <button className="secondary-button" type="button" onClick={() => onStartLevel(challenge.level)}>
              重试
            </button>
          ) : null}
          {completionActions.includes("next") ? (
            <button className="secondary-button" type="button" onClick={() => onStartLevel(challenge.level + 1)}>
              下一阶
            </button>
          ) : null}
          {completionActions.includes("back") ? (
            <button className="primary-button" type="button" onClick={onBack}>
              返回
            </button>
          ) : null}
        </div>
      </div>
      {challenge.passed && challenge.gained ? (
        <div className="advanced-luck-coin-card" aria-live="polite">
          <strong>获得【幸运币】*1</strong>
          <button className="advanced-reward-luck-link" type="button" onClick={onOpenLuckDraw}>
            前往抽奖
          </button>
        </div>
      ) : null}
    </>
  );
}

function EndlessResultCard({
  challenge,
  onShareChallenge,
  onStartLevel,
  shareCopyNoticeId,
}: {
  challenge: Extract<AdvancedChallengeState, { mode: "endless-complete" }>;
  onShareChallenge: (snapshot: EndlessRunSnapshot) => void;
  onStartLevel: (level: number) => void;
  shareCopyNoticeId: number;
}) {
  const roundTitle = getRoundConfig(challenge.roundId).title;
  const currentRows = buildEndlessSettlementRows(challenge.snapshot);
  const bestRows = challenge.bestSnapshot ? buildEndlessSettlementRows(challenge.bestSnapshot) : [];
  const bestRowsByKey = new Map(bestRows.map((row) => [row.key, row]));
  const improved = challenge.score > challenge.previousBestScore;

  const getBestRow = (row: EndlessSettlementRow): EndlessSettlementRow | null => {
    const bestRow = bestRowsByKey.get(row.key);
    if (bestRow) return bestRow;
    if (row.key === "score" && challenge.previousBestScore > 0) {
      return { ...row, value: challenge.previousBestScore };
    }
    return null;
  };
  return (
    <div className="advanced-result-card advanced-endless-result passed">
      <div className="endless-settlement-heading">
        <strong>{challenge.score}</strong>
        <span>{improved ? "新纪录" : "本次总分"}</span>
      </div>
      <div className="endless-settlement-table" role="table" aria-label={`${roundTitle}无尽结算`}>
        <div className="endless-settlement-row header" role="row">
          <div className="endless-settlement-label" role="columnheader" />
          <div className="endless-settlement-column-title" role="columnheader">本次</div>
          <div className="endless-settlement-column-title" role="columnheader">历史最佳</div>
        </div>
        {currentRows.map((row) => {
          const bestRow = getBestRow(row);
          const winner = compareEndlessSettlementValues({
            compare: row.compare,
            current: row.value,
            best: bestRow?.value,
          });
          const currentClassName = ["endless-settlement-cell", winner === "current" ? "better" : ""].filter(Boolean).join(" ");
          const bestClassName = ["endless-settlement-cell", winner === "best" ? "better" : ""].filter(Boolean).join(" ");

          return (
            <div className="endless-settlement-row" key={row.key} role="row">
              <div className="endless-settlement-label" role="rowheader">{row.label}</div>
              <div className={currentClassName} role="cell">
                {formatEndlessRunValue(row)}
                {row.key === "score" && improved ? <span className="endless-settlement-record">新</span> : null}
              </div>
              <div className={bestClassName} role="cell">
                {bestRow ? formatEndlessRunValue(bestRow) : "--"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="advanced-actions advanced-actions-endless-share">
        <button className="primary-button" type="button" onClick={() => onShareChallenge(challenge.snapshot)}>
          来挑战我
        </button>
        <button className="secondary-button" type="button" onClick={() => onStartLevel(ENDLESS_MODE_LEVEL)}>
          再来一次
        </button>
      </div>
      {shareCopyNoticeId > 0 ? (
        <small className="endless-challenge-share-toast" key={shareCopyNoticeId}>挑战链接已复制</small>
      ) : null}
    </div>
  );
}

function EndlessChallengeResultCard({
  challenge,
  onBack,
  onStartLevel,
}: {
  challenge: Extract<AdvancedChallengeState, { mode: "challenge-complete" }>;
  onBack: () => void;
  onStartLevel: (level: number) => void;
}) {
  const roundTitle = getRoundConfig(challenge.roundId).title;
  const challengerRows = buildEndlessSettlementRows(challenge.challenger);
  const targetRows = buildEndlessSettlementRows(challenge.target.target);
  const targetRowsByKey = new Map(targetRows.map((row) => [row.key, row]));
  const outcome = getEndlessChallengeOutcome(challenge.challenger, challenge.target.target);
  const outcomeLabel = getEndlessChallengeOutcomeLabel(outcome);

  return (
    <div className={`advanced-result-card advanced-endless-result ${outcome === "lose" ? "failed" : "passed"}`}>
      <div className={`endless-challenge-result-outcome ${outcome}`}>{outcomeLabel}</div>
      <div className="endless-settlement-table" role="table" aria-label={`${roundTitle}挑战结果`}>
        <div className="endless-settlement-row header" role="row">
          <div className="endless-settlement-label" role="columnheader" />
          <div className="endless-settlement-column-title" role="columnheader">你</div>
          <div className="endless-settlement-column-title" role="columnheader">TA</div>
        </div>
        {challengerRows.map((row) => {
          const targetRow = targetRowsByKey.get(row.key);
          const winner = compareEndlessSettlementValues({
            compare: row.compare,
            current: row.value,
            best: targetRow?.value,
          });
          const challengerClassName = ["endless-settlement-cell", winner === "current" ? "better" : ""].filter(Boolean).join(" ");
          const targetClassName = ["endless-settlement-cell", winner === "best" ? "better" : ""].filter(Boolean).join(" ");

          return (
            <div className="endless-settlement-row" key={row.key} role="row">
              <div className="endless-settlement-label" role="rowheader">{row.label}</div>
              <div className={challengerClassName} role="cell">{formatEndlessRunValue(row)}</div>
              <div className={targetClassName} role="cell">
                {targetRow ? formatEndlessRunValue(targetRow) : "--"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="advanced-actions">
        <button className="secondary-button" type="button" onClick={() => onStartLevel(ENDLESS_MODE_LEVEL)}>
          再挑战一次
        </button>
        <button className="primary-button" type="button" onClick={onBack}>
          返回
        </button>
      </div>
    </div>
  );
}

function AdvancedLevelSelectionPanel({
  activeConfig,
  challenge,
  currentLevel,
  endlessBestScore,
  selectedLevel,
  unlockedLevel,
  onPickLevel,
  onRestartBaseRound,
  onStartLevel,
}: {
  activeConfig: AdvancedStageConfig;
  challenge: Exclude<AdvancedLobbyChallengeState, { mode: "complete" }>;
  currentLevel: number;
  endlessBestScore: number;
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
  const lockedEndlessNoticeTimerRef = React.useRef<number | null>(null);
  const endlessShakeTimerRef = React.useRef<number | null>(null);
  const sliderPointerStartedEndlessRef = React.useRef(false);
  const sliderChangedDuringPointerRef = React.useRef(false);
  const [trackStepPx, setTrackStepPx] = React.useState(DEFAULT_LOBBY_TRACK_STEP_PX);
  const [sliderTravelPx, setSliderTravelPx] = React.useState(0);
  const [lockedEndlessNoticeVisible, setLockedEndlessNoticeVisible] = React.useState(false);
  const [endlessShake, setEndlessShake] = React.useState(false);
  const [endlessShakeStyle, setEndlessShakeStyle] = React.useState<React.CSSProperties>({});
  const levelItems = getAdvancedLobbyLevelItems({ currentLevel, selectedLevel });
  const selectedItem = levelItems.find((item) => item.position === "selected");
  const selectedIsEndless = selectedLevel === ENDLESS_MODE_LEVEL;
  const sliderLevel = selectedIsEndless ? 1 : selectedLevel;
  const endlessState = getEndlessLevelState(currentLevel);
  const endlessUnlocked = endlessState !== "locked";
  const selectedState = selectedIsEndless ? endlessState : selectedItem?.state ?? "locked";
  const selectedTone = getAdvancedLevelToneForState(selectedState, selectedLevel);
  const selectedEndlessState = selectedIsEndless ? endlessState : "current";
  const selectedStatusLabel = selectedIsEndless ? getAdvancedEndlessStatusLabel(selectedEndlessState) : getAdvancedChallengeStatusLabel(selectedState);
  const activeTitle = selectedIsEndless ? "无尽模式" : activeConfig.stageTitle;
  const sliderThumbOffsetPx = sliderTravelPx * getAdvancedLobbySliderOffsetRatio(sliderLevel);
  const advancedRuleItems = getAdvancedChallengeRuleItems(activeConfig);
  const ruleItems = selectedIsEndless
    ? [
        { icon: "target" as const, text: "在体力耗尽前再往前一步" },
      ]
    : advancedRuleItems;
  const lobbyTrackStyle = {
    "--advanced-lobby-anchor": `${selectedLevel * trackStepPx}px`,
  } as React.CSSProperties;

  React.useEffect(() => {
    selectedLevelRef.current = selectedLevel;
  }, [selectedLevel]);

  React.useEffect(() => {
    return () => {
      if (lockedEndlessNoticeTimerRef.current !== null) {
        window.clearTimeout(lockedEndlessNoticeTimerRef.current);
      }
      if (endlessShakeTimerRef.current !== null) {
        window.clearTimeout(endlessShakeTimerRef.current);
      }
    };
  }, []);

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
      setSliderTravelPx(sliderVisual.clientWidth);
    };

    updateSliderTravel();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(updateSliderTravel);
    observer.observe(sliderVisual);
    return () => observer.disconnect();
  }, [unlockedLevel]);

  const handleLockedEndlessAttempt = React.useCallback(() => {
    setLockedEndlessNoticeVisible(true);
    setEndlessShake(false);
    setEndlessShakeStyle({
      "--advanced-endless-shake-x": `${Math.random() < 0.5 ? -1 : 1}px`,
      "--advanced-endless-shake-y": `${Math.random() < 0.5 ? -1 : 1}px`,
    } as React.CSSProperties);
    if (lockedEndlessNoticeTimerRef.current !== null) {
      window.clearTimeout(lockedEndlessNoticeTimerRef.current);
    }
    if (endlessShakeTimerRef.current !== null) {
      window.clearTimeout(endlessShakeTimerRef.current);
    }
    window.setTimeout(() => setEndlessShake(true), 0);
    endlessShakeTimerRef.current = window.setTimeout(() => setEndlessShake(false), 240);
    lockedEndlessNoticeTimerRef.current = window.setTimeout(() => setLockedEndlessNoticeVisible(false), 1150);
  }, []);

  const handleEndlessButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!endlessUnlocked) {
      handleLockedEndlessAttempt();
      return;
    }
    onPickLevel(ENDLESS_MODE_LEVEL);
  };

  const handleLevelClick = (level: number) => {
    if (level === ENDLESS_MODE_LEVEL && !endlessUnlocked) {
      handleLockedEndlessAttempt();
      return;
    }
    const clickedLevel = resolveAdvancedLobbyClickLevel({ currentLevel, requestedLevel: level });
    if (clickedLevel !== null) onPickLevel(clickedLevel);
  };

  const handleLevelSliderInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sliderLevel = resolveAdvancedLobbySliderLevel({
      currentLevel,
      requestedLevel: Number(event.currentTarget.value),
    });
    if (selectedIsEndless) sliderChangedDuringPointerRef.current = true;
    if (sliderLevel !== selectedLevel) onPickLevel(sliderLevel);
  };

  const handleLevelSliderPointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
    void event;
    sliderPointerStartedEndlessRef.current = selectedIsEndless;
    sliderChangedDuringPointerRef.current = false;
  };

  const handleLevelSliderPointerUp = (event: React.PointerEvent<HTMLInputElement>) => {
    if (!sliderPointerStartedEndlessRef.current) return;
    sliderPointerStartedEndlessRef.current = false;
    if (sliderChangedDuringPointerRef.current) return;
    sliderChangedDuringPointerRef.current = false;
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerRatio = bounds.width > 0 ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) : 0;
    const requestedLevel = Math.round(1 + pointerRatio * 9);
    const sliderLevel = resolveAdvancedLobbySliderLevel({ currentLevel, requestedLevel });
    onPickLevel(sliderLevel);
  };

  const handleLevelSliderPointerCancel = () => {
    sliderPointerStartedEndlessRef.current = false;
    sliderChangedDuringPointerRef.current = false;
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
    if (direction < 0 && selectedLevelRef.current <= 1) {
      lobbySwipeStartXRef.current = event.clientX;
      if (!endlessUnlocked) {
        handleLockedEndlessAttempt();
      } else if (selectedLevelRef.current !== ENDLESS_MODE_LEVEL) {
        selectedLevelRef.current = ENDLESS_MODE_LEVEL;
        onPickLevel(ENDLESS_MODE_LEVEL);
      }
      event.preventDefault();
      return;
    }
    if (selectedLevelRef.current === ENDLESS_MODE_LEVEL) {
      lobbySwipeStartXRef.current = event.clientX;
      if (direction > 0) {
        selectedLevelRef.current = 1;
        onPickLevel(1);
      }
      event.preventDefault();
      return;
    }
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
            const isEndlessItem = item.level === ENDLESS_MODE_LEVEL;
            if (isEndlessItem) {
              const statusLabel = getAdvancedEndlessStatusLabel(endlessState);
              return (
                <button
                  aria-disabled={!item.selectable}
                  aria-label={`无尽模式${statusLabel}`}
                  className={`advanced-lobby-level advanced-endless ${item.position} ${item.state} ${selected ? "selected" : ""} ${endlessShake ? "shake" : ""}`}
                  data-level={item.level}
                  disabled={!item.selectable && !isEndlessItem}
                  key={item.level}
                  style={endlessShakeStyle}
                  type="button"
                  onClick={(event) => handleLevelButtonClick(event, item.level)}
                >
                  <strong>无尽模式</strong>
                  <small>{endlessBestScore > 0 ? `最高记录 ${endlessBestScore}` : "未挑战"}</small>
                </button>
              );
            }
            const tone = getAdvancedLevelToneForState(item.state, item.level);
            const itemConfig = getAdvancedStageConfig(challenge.roundId, item.level);
            const statusLabel = getAdvancedChallengeStatusLabel(item.state);
            return (
              <button
                aria-label={`${itemConfig.stageTitle}${statusLabel}`}
                className={`advanced-lobby-level ${item.position} ${item.state} ${tone} ${selected ? "selected" : ""}`}
                data-level={item.level}
                disabled={!item.selectable && !isEndlessItem}
                key={item.level}
                type="button"
                onClick={(event) => handleLevelButtonClick(event, item.level)}
              >
                {item.state === "completed" ? (
                  <span className="advanced-lobby-badge" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
                <strong>{`进阶${item.level}`}</strong>
                <small>{statusLabel}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="advanced-lobby-slider-row">
        <button
          aria-disabled={!endlessUnlocked}
          aria-label={`无尽模式${getAdvancedEndlessStatusLabel(endlessState)}`}
          className={`advanced-endless-slider-button ${endlessState} ${selectedIsEndless ? "selected" : ""} ${endlessShake ? "shake" : ""}`}
          style={endlessShakeStyle}
          type="button"
          onClick={handleEndlessButtonClick}
        >
          ∞
        </button>
        <div
          className={`advanced-lobby-slider ${selectedState} ${selectedTone}`}
          style={{ "--advanced-lobby-slider-thumb-offset": `${sliderThumbOffsetPx}px` } as React.CSSProperties}
        >
          <div className="advanced-lobby-slider-visual" ref={sliderVisualRef} aria-hidden="true">
            <span className="advanced-lobby-slider-thumb-label">{sliderLevel}</span>
          </div>
          <input
            aria-label="Select advanced level"
            className="advanced-lobby-range"
            max={10}
            min={1}
            step={1}
            type="range"
            value={sliderLevel}
            onChange={handleLevelSliderInput}
            onPointerCancel={handleLevelSliderPointerCancel}
            onPointerDown={handleLevelSliderPointerDown}
            onPointerUp={handleLevelSliderPointerUp}
          />
        </div>
      </div>
      {lockedEndlessNoticeVisible ? (
        <div className="advanced-endless-lock-toast" role="status">
          通过进阶前三关后解锁
        </div>
      ) : null}

      <div className={`advanced-lobby-actions ${selectedIsEndless ? "advanced-lobby-actions-endless" : ""}`}>
        {selectedIsEndless ? null : (
          <button className="secondary-button" disabled={selectedState === "locked"} type="button" onClick={() => onRestartBaseRound(selectedLevel)}>
            重新挑战基础关
          </button>
        )}
        <button className="primary-button" disabled={selectedState === "locked"} type="button" onClick={() => onStartLevel(selectedLevel)}>
          开始挑战
        </button>
      </div>

      <div className="advanced-goal-card">
        <div className="advanced-goal-heading">
          <h2>{activeTitle}</h2>
          <span>{selectedStatusLabel}</span>
        </div>
        <ul>
          {ruleItems.map((item) => (
            <li className="advanced-goal-item complete" key={`${item.icon}-${item.text}`}>
              <span className="advanced-goal-box" aria-hidden="true">{selectedIsEndless ? "∞" : "✓"}</span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AdvancedLobbyContent({
  challenge,
  currentLevel,
  endlessBestScore,
  round,
  shareCopyNoticeId,
  unlockedLevel,
  onBack,
  onOpenLuckDraw,
  onPickLevel,
  onRestartBaseRound,
  onShareEndlessChallenge,
  onStartLevel,
}: {
  challenge: AdvancedLobbyChallengeState;
  currentLevel: number;
  endlessBestScore: number;
  round: AdvancedRoundConfig;
  shareCopyNoticeId: number;
  unlockedLevel: number;
  onBack: () => void;
  onOpenLuckDraw: () => void;
  onPickLevel: (level: number) => void;
  onRestartBaseRound: (level: number) => void;
  onShareEndlessChallenge: (snapshot: EndlessRunSnapshot) => void;
  onStartLevel: (level: number) => void;
}) {
  const activeLevel = challenge.mode === "select" ? 1 : challenge.mode === "endless-complete" || challenge.mode === "challenge-complete" ? ENDLESS_MODE_LEVEL : challenge.level;
  const selectedLevel = activeLevel === ENDLESS_MODE_LEVEL
    ? ENDLESS_MODE_LEVEL
    : resolveAdvancedLobbySliderLevel({ currentLevel, requestedLevel: activeLevel });
  const activeConfig = getAdvancedStageConfig(challenge.roundId, Math.max(1, selectedLevel));
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
        <button className="advanced-back-button" type="button" onClick={onBack}>
          返回
        </button>
        <span>{round.measure}</span>
      </header>

      <div className="advanced-hero advanced-hero-with-rule">
        {selectedLevel === ENDLESS_MODE_LEVEL ? (
          <AdaptiveAdvancedHeroTitle
            title={getAdvancedChallengeHeroTitle({
              roundTitle: round.title,
              stageTitle: "无尽模式",
            })}
          />
        ) : (
          <AdaptiveAdvancedHeroTitle
            title={getAdvancedChallengeHeroTitle({
              roundTitle: round.title,
              stageTitle: activeConfig.stageTitle,
            })}
          />
        )}
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
      ) : challenge.mode === "endless-complete" ? (
        <EndlessResultCard
          challenge={challenge}
          onShareChallenge={onShareEndlessChallenge}
          onStartLevel={onStartLevel}
          shareCopyNoticeId={shareCopyNoticeId}
        />
      ) : challenge.mode === "challenge-complete" ? (
        <EndlessChallengeResultCard challenge={challenge} onBack={onBack} onStartLevel={onStartLevel} />
      ) : (
        <AdvancedLevelSelectionPanel
          activeConfig={activeConfig}
          challenge={challenge}
          currentLevel={currentLevel}
          endlessBestScore={endlessBestScore}
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
  endlessBestScore,
  onBack,
  onBuildPerfectTrials,
  onCompleteBaseRound,
  onCompleteEndlessChallenge,
  onCompleteEndlessRound,
  onCompleteRound,
  onOpenLuckDraw,
  onPickLevel,
  onRestartBaseRound,
  onShareEndlessChallenge,
  onStartLevel,
  renderRound,
  shareCopyNoticeId,
}: {
  advancedProgress: AdvancedProgress;
  challenge: AdvancedChallengeState;
  debugToolsVisible: boolean;
  endlessBestScore: number;
  onBack: () => void;
  onBuildPerfectTrials: (config: AdvancedStageConfig) => TrialEvent[];
  onCompleteBaseRound: (record: { roundId: RoundId; level: number; trials: TrialEvent[] }) => void;
  onCompleteEndlessChallenge: (completion: EndlessRoundCompletion) => void;
  onCompleteEndlessRound: (completion: EndlessRoundCompletion) => void;
  onCompleteRound: (trials: TrialEvent[]) => void;
  onOpenLuckDraw: () => void;
  onPickLevel: (level: number) => void;
  onRestartBaseRound: (level: number) => void;
  onShareEndlessChallenge: (snapshot: EndlessRunSnapshot) => void;
  onStartLevel: (level: number) => void;
  renderRound: (props: AdvancedRoundRenderProps) => React.ReactNode;
  shareCopyNoticeId: number;
}) {
  const round = getRoundConfig(challenge.roundId);
  const currentLevel = getAdvancedDimensionLevel(advancedProgress, challenge.roundId);
  const unlockedLevel = getAdvancedLobbyUnlockedLevel(currentLevel);
  const [dismissedAdvancedTutorialKey, setDismissedAdvancedTutorialKey] = React.useState("");
  const [pauseDialog, setPauseDialog] = React.useState<AdvancedPauseDialogState | null>(null);
  const [endlessSettleSignal, setEndlessSettleSignal] = React.useState(0);
  const pauseBackDialog = React.useMemo(() => getPauseDialogForChallenge(challenge), [challenge]);
  const isPauseBackGuardActive = pauseBackDialog !== null;
  const openAdvancedPauseDialog = React.useCallback(() => {
    if (challenge.mode === "playing") setPauseDialog({ mode: "advanced", level: challenge.level, roundId: challenge.roundId });
  }, [challenge]);
  const openEndlessPauseDialog = React.useCallback(() => {
    if (challenge.mode === "endless-playing" || challenge.mode === "challenge-playing") setPauseDialog({ mode: "endless", roundId: challenge.roundId });
  }, [challenge]);
  const openBasePauseDialog = React.useCallback(() => {
    if (challenge.mode === "base-playing") setPauseDialog({ mode: "base", level: challenge.level, roundId: challenge.roundId });
  }, [challenge]);
  const closePauseDialog = React.useCallback(() => setPauseDialog(null), []);
  React.useEffect(() => {
    if (!isPauseBackGuardActive) return undefined;
    const handlePauseBackPopState = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      writePauseBackHistoryGuard();
      if (pauseDialog) {
        setPauseDialog(null);
        return;
      }
      setPauseDialog(pauseBackDialog);
    };

    window.addEventListener("popstate", handlePauseBackPopState, { capture: true });
    return () => window.removeEventListener("popstate", handlePauseBackPopState, { capture: true });
  }, [isPauseBackGuardActive, pauseBackDialog, pauseDialog]);
  const settlePauseDialog = React.useCallback(() => {
    const dialog = pauseDialog;
    if (!dialog) return;
    setPauseDialog(null);
    if (dialog.mode === "endless") {
      setEndlessSettleSignal((current) => current + 1);
      return;
    }
    if (dialog.mode === "base") {
      onCompleteBaseRound({ roundId: dialog.roundId, level: dialog.level, trials: [] });
      return;
    }
    onCompleteRound([]);
  }, [onCompleteBaseRound, onCompleteRound, pauseDialog]);
  const restartPauseDialog = React.useCallback(() => {
    const dialog = pauseDialog;
    if (!dialog) return;
    setPauseDialog(null);
    if (dialog.mode === "endless") {
      onStartLevel(ENDLESS_MODE_LEVEL);
      return;
    }
    if (dialog.mode === "base") {
      onRestartBaseRound(dialog.level);
      return;
    }
    onStartLevel(dialog.level);
  }, [onRestartBaseRound, onStartLevel, pauseDialog]);
  const pauseDialogNode = pauseDialog ? (
    <AdvancedPauseDialog
      onContinue={closePauseDialog}
      onRestart={restartPauseDialog}
      onSettleExit={settlePauseDialog}
    />
  ) : null;

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
      <section className="play-screen advanced-play-screen" data-difficulty-tone={getAdvancedLevelTone(challenge.level)} aria-live="polite">
        <header className="round-header advanced-round-header">
          <AdaptiveAdvancedHeaderTitle
            title={getAdvancedChallengeHeroTitle({
              roundTitle: round.title,
              stageTitle: playingConfig.stageTitle,
            })}
          />
          <div className="advanced-header-actions">
            <button className="advanced-back-button" type="button" onClick={openAdvancedPauseDialog}>
              暂停
            </button>
            {shouldShowPerfectClearShortcut({ debugToolsVisible }) ? (
              <button className="advanced-back-button" type="button" onClick={() => onCompleteRound(onBuildPerfectTrials(playingConfig))}>
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
              paused: pauseDialog?.mode === "advanced",
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
        {pauseDialogNode}
      </section>
    );
  }

  if (challenge.mode === "endless-playing") {
    return (
      <section className="play-screen advanced-play-screen endless-play-screen" aria-live="polite">
        <header className="round-header advanced-round-header">
          <AdaptiveAdvancedHeaderTitle
            title={getAdvancedChallengeHeroTitle({
              roundTitle: round.title,
              stageTitle: "无尽模式",
            })}
          />
          <div className="advanced-header-actions">
            <button className="advanced-back-button" type="button" onClick={openEndlessPauseDialog}>
              暂停
            </button>
          </div>
        </header>
        <EndlessRoundPlayer
          bestScore={endlessBestScore}
          debugToolsVisible={debugToolsVisible}
          key={`endless-${challenge.roundId}-${challenge.attemptId}`}
          onComplete={onCompleteEndlessRound}
          paused={pauseDialog?.mode === "endless"}
          roundId={challenge.roundId}
          settleSignal={endlessSettleSignal}
        />
        {pauseDialogNode}
      </section>
    );
  }

  if (challenge.mode === "challenge-playing") {
    return (
      <section className="play-screen advanced-play-screen endless-play-screen" aria-live="polite">
        <header className="round-header advanced-round-header">
          <AdaptiveAdvancedHeaderTitle
            title={getAdvancedChallengeHeroTitle({
              roundTitle: round.title,
              stageTitle: "挑战模式",
            })}
          />
          <div className="advanced-header-actions">
            <button className="advanced-back-button" type="button" onClick={openEndlessPauseDialog}>
              暂停
            </button>
          </div>
        </header>
        <EndlessRoundPlayer
          bestScore={endlessBestScore}
          debugToolsVisible={debugToolsVisible}
          key={`challenge-${challenge.roundId}-${challenge.attemptId}`}
          onComplete={onCompleteEndlessChallenge}
          paused={pauseDialog?.mode === "endless"}
          roundId={challenge.roundId}
          settleSignal={endlessSettleSignal}
          targetScore={challenge.target.target.score}
        />
        {pauseDialogNode}
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
          <div className="advanced-header-actions">
            <button className="advanced-back-button" type="button" onClick={openBasePauseDialog}>
              暂停
            </button>
          </div>
        </header>
        {renderRound({
          key: `advanced-base-${challenge.roundId}-${challenge.attemptId}`,
          phase: "base",
          round: challenge.roundId,
          onComplete: (trials) => onCompleteBaseRound({ roundId: challenge.roundId, level: challenge.level, trials }),
          paused: pauseDialog?.mode === "base",
        })}
        {pauseDialogNode}
      </section>
    );
  }

  return (
    <AdvancedLobbyContent
      challenge={challenge}
      currentLevel={currentLevel}
      endlessBestScore={endlessBestScore}
      round={round}
      shareCopyNoticeId={shareCopyNoticeId}
      unlockedLevel={unlockedLevel}
      onBack={onBack}
      onOpenLuckDraw={onOpenLuckDraw}
      onPickLevel={onPickLevel}
      onRestartBaseRound={onRestartBaseRound}
      onShareEndlessChallenge={onShareEndlessChallenge}
      onStartLevel={onStartLevel}
    />
  );
}
