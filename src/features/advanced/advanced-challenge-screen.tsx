"use client";

import React from "react";
import { getAdvancedStageConfig, shouldShowPerfectClearShortcut, type AdvancedStageConfig } from "@/lib/advanced-challenges";
import {
  getAdvancedChallengeStatusLabel,
  getAdvancedCompletionActions,
  getAdvancedDimensionLevel,
  getAdvancedLevelState,
  getAdvancedLevelToneForState,
  type AdvancedProgress,
} from "@/lib/advanced-progress";
import { type RoundId, type TrialEvent } from "@/lib/scoring";
import { rounds } from "@/features/game-flow/round-config";

export type AdvancedChallengeState =
  | { mode: "select"; roundId: RoundId }
  | { mode: "intro"; roundId: RoundId; level: number }
  | { mode: "playing"; roundId: RoundId; level: number; attemptId: number }
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

type AdvancedRoundRenderProps = {
  key: string;
  advancedConfig: AdvancedStageConfig;
  round: RoundId;
  onComplete: (trials: TrialEvent[]) => void;
};

function getRoundConfig(roundId: RoundId) {
  return rounds.find((round) => round.id === roundId) ?? rounds[0];
}

export function AdvancedChallengeScreen({
  advancedProgress,
  challenge,
  debugToolsVisible,
  onBack,
  onBuildPerfectTrials,
  onCompleteRound,
  onPickLevel,
  onStartLevel,
  renderRound,
}: {
  advancedProgress: AdvancedProgress;
  challenge: AdvancedChallengeState;
  debugToolsVisible: boolean;
  onBack: () => void;
  onBuildPerfectTrials: (config: AdvancedStageConfig) => TrialEvent[];
  onCompleteRound: (trials: TrialEvent[]) => void;
  onPickLevel: (level: number) => void;
  onStartLevel: (level: number) => void;
  renderRound: (props: AdvancedRoundRenderProps) => React.ReactNode;
}) {
  const round = getRoundConfig(challenge.roundId);
  const currentLevel = getAdvancedDimensionLevel(advancedProgress, challenge.roundId);
  const nextLevel = Math.min(10, currentLevel + 1);
  const activeLevel = challenge.mode === "select" ? nextLevel : challenge.level;
  const activeConfig = getAdvancedStageConfig(challenge.roundId, activeLevel);

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
          advancedConfig: playingConfig,
          round: challenge.roundId,
          onComplete: onCompleteRound,
        })}
      </section>
    );
  }

  const selectedLevel = activeLevel;
  const selectedState = getAdvancedLevelState(currentLevel, selectedLevel);
  const isComplete = challenge.mode === "complete";
  const completionActions = isComplete
    ? getAdvancedCompletionActions({ passed: challenge.passed, gained: challenge.gained, level: challenge.level })
    : [];

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
        <div className="advanced-panel">
          <div className="advanced-level-grid">
            {Array.from({ length: 10 }, (_, index) => {
              const level = index + 1;
              const state = getAdvancedLevelState(currentLevel, level);
              const selected = level === selectedLevel;
              const locked = state === "locked";
              return (
                <button
                  aria-label={`${round.measure}进阶${level}${getAdvancedChallengeStatusLabel(state)}`}
                  className={`advanced-level-button ${state} ${selected ? "selected" : ""} ${getAdvancedLevelToneForState(state, level)}`}
                  disabled={locked}
                  key={level}
                  type="button"
                  onPointerDown={() => onPickLevel(level)}
                >
                  <strong>{level}</strong>
                </button>
              );
            })}
          </div>

          <div className="advanced-brief">
            <span>进阶内容</span>
            <strong>{getAdvancedChallengeStatusLabel(selectedState)}</strong>
            <small>{activeConfig.passText}</small>
          </div>

          <button
            className="primary-button"
            disabled={selectedState === "locked"}
            type="button"
            onPointerDown={() => onStartLevel(selectedLevel)}
          >
            开始挑战
          </button>
        </div>
      )}
    </section>
  );
}
