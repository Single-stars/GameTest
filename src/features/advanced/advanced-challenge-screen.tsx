"use client";

import React from "react";
import {
  getAdvancedChallengeGoalItems,
  getAdvancedLobbyLevelItems,
  resolveAdvancedLobbyClickLevel,
  resolveAdvancedLobbyDragOffset,
  resolveAdvancedLobbySwipeLevel,
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

const GOAL_ICON_LABELS = {
  target: "◎",
  ban: "⊘",
  bolt: "↯",
  flag: "✓",
} as const;
const DEFAULT_LOBBY_TRACK_STEP_PX = 156;
const TAP_THRESHOLD_PX = 12;

function getRoundConfig(roundId: RoundId) {
  return rounds.find((round) => round.id === roundId) ?? rounds[0];
}

function getPointerLevel(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  const levelButton = target.closest<HTMLElement>(".advanced-lobby-level");
  const level = Number(levelButton?.dataset.level);
  return Number.isFinite(level) ? level : null;
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
  const nextLevel = Math.min(10, currentLevel + 1);
  const activeLevel = challenge.mode === "select" ? nextLevel : challenge.level;
  const activeConfig = getAdvancedStageConfig(challenge.roundId, activeLevel);
  const selectedLevel = activeLevel;
  const carouselRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const dragStartXRef = React.useRef<number | null>(null);
  const pointerDownLevelRef = React.useRef<number | null>(null);
  const dragOffsetRef = React.useRef(0);
  const dragAnimationFrameRef = React.useRef<number | null>(null);
  const [trackStepPx, setTrackStepPx] = React.useState(DEFAULT_LOBBY_TRACK_STEP_PX);
  const [isDragging, setIsDragging] = React.useState(false);

  const writeTrackDragOffset = React.useCallback((offsetPx: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.setProperty("--advanced-lobby-drag", `${offsetPx}px`);
  }, []);

  const scheduleTrackDragOffset = React.useCallback(
    (offsetPx: number) => {
      dragOffsetRef.current = offsetPx;
      if (dragAnimationFrameRef.current !== null) return;

      dragAnimationFrameRef.current = window.requestAnimationFrame(() => {
        dragAnimationFrameRef.current = null;
        writeTrackDragOffset(dragOffsetRef.current);
      });
    },
    [writeTrackDragOffset],
  );

  const resetTrackDragOffset = React.useCallback(() => {
    dragOffsetRef.current = 0;
    if (dragAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAnimationFrameRef.current);
      dragAnimationFrameRef.current = null;
    }
    window.requestAnimationFrame(() => writeTrackDragOffset(0));
  }, [writeTrackDragOffset]);

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

  React.useEffect(() => {
    return () => {
      if (dragAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAnimationFrameRef.current);
      }
    };
  }, []);

  if (challenge.mode === "playing") {
    const playingConfig = getAdvancedStageConfig(challenge.roundId, challenge.level);
    return (
      <section className="play-screen advanced-play-screen" aria-live="polite">
        <header className="round-header advanced-round-header">
          <div>
            <p className="eyebrow">{round.measure}进阶 {challenge.level}</p>
            <h1>{round.title}</h1>
          </div>
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

  const levelItems = getAdvancedLobbyLevelItems({ currentLevel, selectedLevel });
  const selectedItem = levelItems.find((item) => item.position === "selected");
  const selectedState = selectedItem?.state ?? "locked";
  const isComplete = challenge.mode === "complete";
  const completionActions = isComplete
    ? getAdvancedCompletionActions({ passed: challenge.passed, gained: challenge.gained, level: challenge.level })
    : [];
  const goalItems = getAdvancedChallengeGoalItems(activeConfig);
  const lobbyTrackStyle = {
    "--advanced-lobby-anchor": `${(selectedLevel - 1) * trackStepPx}px`,
  } as React.CSSProperties;

  const handleLobbyPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartXRef.current = event.clientX;
    pointerDownLevelRef.current = getPointerLevel(event.target);
    scheduleTrackDragOffset(0);
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLobbyPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const startX = dragStartXRef.current;
    if (startX === null) return;
    const deltaX = event.clientX - startX;
    scheduleTrackDragOffset(resolveAdvancedLobbyDragOffset({ currentLevel, selectedLevel, deltaX, stepPx: trackStepPx }));
  };

  const handleLobbyPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const startX = dragStartXRef.current;
    dragStartXRef.current = null;
    setIsDragging(false);
    resetTrackDragOffset();
    if (startX === null) return;

    const deltaX = event.clientX - startX;
    if (Math.abs(deltaX) < TAP_THRESHOLD_PX) {
      const clickedLevel =
        pointerDownLevelRef.current === null
          ? null
          : resolveAdvancedLobbyClickLevel({ currentLevel, requestedLevel: pointerDownLevelRef.current });
      pointerDownLevelRef.current = null;
      if (clickedLevel !== null) onPickLevel(clickedLevel);
      return;
    }
    pointerDownLevelRef.current = null;

    const nextSelectedLevel = resolveAdvancedLobbySwipeLevel({
      currentLevel,
      selectedLevel,
      deltaX,
      thresholdPx: trackStepPx,
    });
    if (nextSelectedLevel !== selectedLevel) {
      onPickLevel(nextSelectedLevel);
    }
  };

  const handleLobbyPointerCancel = () => {
    dragStartXRef.current = null;
    pointerDownLevelRef.current = null;
    setIsDragging(false);
    resetTrackDragOffset();
  };

  const handleLevelKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, level: number) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    const clickedLevel = resolveAdvancedLobbyClickLevel({ currentLevel, requestedLevel: level });
    if (clickedLevel !== null) onPickLevel(clickedLevel);
  };

  return (
    <section className="advanced-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>{round.measure}</span>
      </header>

      <div className="advanced-hero">
        <p className="eyebrow">进阶挑战</p>
        <h1>{round.title}</h1>
      </div>

      {isComplete ? (
        <div className={`advanced-result-card ${challenge.passed ? "passed" : "failed"}`}>
          <p className="eyebrow">{challenge.passed ? "挑战成功" : "差一点"}</p>
          <h2>{challenge.passed ? "过关" : challenge.reason}</h2>
          <small>{challenge.correctCount}/{challenge.requiredCorrect}</small>
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
      ) : (
        <div className="advanced-panel advanced-lobby-panel">
          <div
            className={`advanced-lobby-carousel ${isDragging ? "dragging" : ""}`}
            ref={carouselRef}
            onPointerCancel={handleLobbyPointerCancel}
            onPointerDown={handleLobbyPointerDown}
            onPointerMove={handleLobbyPointerMove}
            onPointerUp={handleLobbyPointerUp}
          >
            <div className="advanced-lobby-track" ref={trackRef} style={lobbyTrackStyle}>
              {levelItems.map((item) => {
                const selected = item.position === "selected";
                const tone = getAdvancedLevelToneForState(item.state, item.level);
                return (
                  <button
                    aria-label={`${round.measure}进阶${item.level}${getAdvancedChallengeStatusLabel(item.state)}`}
                    aria-disabled={!item.selectable}
                    className={`advanced-lobby-level ${item.position} ${item.state} ${tone} ${selected ? "selected" : ""}`}
                    data-level={item.level}
                    key={item.level}
                    tabIndex={item.selectable ? 0 : -1}
                    type="button"
                    onKeyDown={(event) => handleLevelKeyDown(event, item.level)}
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

          <div className="advanced-goal-card">
            <div className="advanced-goal-heading">
              <h2>本关目标</h2>
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
      )}
    </section>
  );
}
