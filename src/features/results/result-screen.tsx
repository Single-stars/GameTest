"use client";

import { getAdvancedDimensionLevel, getAdvancedLevelTone, getLuckDrawStatusText, getLuckLevelTone, getAdvancedTotalStars, formatResultRankTitle, type AdvancedProgress } from "@/lib/advanced-progress";
import { getGameRankResult, type RoundId, type TrialEvent } from "@/lib/scoring";
import { RadarChart } from "@/features/results/radar-chart";
import { RestartIcon, ResetDataIcon, ShareIcon } from "@/features/results/result-icons";

type ImageShareState = "idle" | "sharing" | "saved" | "failed";

export function ResultScreen({
  advancedProgress,
  trials,
  advancedUnlockPulseId,
  imageShareState,
  debugToolsVisible,
  onOpenAdvancedChallenge,
  onOpenLuckDraw,
  onResetTestData,
  onShareImage,
  onRestart,
}: {
  advancedProgress: AdvancedProgress;
  trials: TrialEvent[];
  advancedUnlockPulseId: number;
  imageShareState: ImageShareState;
  debugToolsVisible: boolean;
  onOpenAdvancedChallenge: (roundId: RoundId) => void;
  onOpenLuckDraw: () => void;
  onResetTestData: () => void;
  onShareImage: () => void;
  onRestart: () => void;
}) {
  const result = getGameRankResult(trials);
  const brakingTrials = trials.filter((item) => item.roundId === "braking");
  const dinoSafeStops = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.safeStop === true).length;
  const dinoCollisions = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.collision === true).length;
  const advancedUnlocked = advancedProgress.unlocked || result.name === "最强王者";
  const advancedStars = getAdvancedTotalStars(advancedProgress);
  const rankTitle = formatResultRankTitle(result.name, advancedStars);
  const luckStatus = getLuckDrawStatusText(advancedUnlocked, advancedProgress);
  const rows = [
    {
      roundId: "reaction",
      label: "反应力",
      score: result.scores.reaction,
      detail: result.metrics.reactionMedianMs ? `${Math.round(result.metrics.reactionMedianMs)}ms` : "不足",
    },
    {
      roundId: "aim",
      label: "精准度",
      score: result.scores.targeting,
      detail: result.metrics.aimTotal > 0 ? `命中 ${result.metrics.aimHits}/${result.metrics.aimTotal}` : "不足",
    },
    {
      roundId: "search",
      label: "连续反应",
      score: result.scores.search,
      detail: result.metrics.searchMeanCountError !== null ? `失误 ${result.metrics.searchMeanCountError.toFixed(0)}` : "不足",
    },
    {
      roundId: "stroop",
      label: "专注力",
      score: result.scores.interference,
      detail: result.metrics.stroopAccuracy !== null ? `${Math.round(result.metrics.stroopAccuracy * 100)}%` : "不足",
    },
    {
      roundId: "rhythm",
      label: "节奏感",
      score: result.scores.rhythm,
      detail:
        result.metrics.rhythmAvgOffsetMs !== null
          ? `${Math.round(result.metrics.rhythmAvgOffsetMs)}ms`
          : result.metrics.rhythmAccuracy !== null
            ? `${Math.round(result.metrics.rhythmAccuracy * 100)}%`
            : "不足",
    },
    {
      roundId: "memory",
      label: "手眼协调",
      score: result.scores.memory,
      detail: result.metrics.memoryAccuracy !== null ? `${Math.round(result.metrics.memoryAccuracy * 100)}%` : "不足",
    },
    {
      roundId: "braking",
      label: "控制力",
      score: result.scores.braking,
      detail:
        result.metrics.dinoSafeStopRate !== null
          ? `急停 ${dinoSafeStops}/${brakingTrials.length}${dinoCollisions ? ` · 撞 ${dinoCollisions}` : ""}`
          : result.metrics.stopFalseAlarmRate !== null
            ? `${Math.round(result.metrics.stopFalseAlarmRate * 100)}%误按`
            : "不足",
    },
    {
      roundId: "patience",
      label: "时机判断",
      score: result.scores.waiting,
      detail: result.metrics.patiencePct !== null ? `${Math.round(result.metrics.patiencePct)}%` : "不足",
    },
  ] as const satisfies ReadonlyArray<{ roundId: RoundId; label: string; score: number; detail: string }>;

  return (
    <section className="result-screen">
      <div className="result-card rank-card">
        <div className="rank-title">
          <h1>{rankTitle}</h1>
        </div>
        <div className="rank-actions" aria-label="结果操作">
          <button
            aria-label="生成分享图片"
            className="result-action-button"
            disabled={imageShareState === "sharing"}
            type="button"
            onPointerDown={onShareImage}
          >
            <ShareIcon />
          </button>
          <button aria-label="重新测试" className="result-action-button" type="button" onPointerDown={onRestart}>
            <RestartIcon />
          </button>
          {debugToolsVisible ? (
            <button aria-label="重置测试数据" className="result-action-button danger" type="button" onClick={onResetTestData}>
              <ResetDataIcon />
            </button>
          ) : null}
        </div>
      </div>

      <RadarChart axis={result.axis} />

      <div className={`score-grid ${advancedUnlockPulseId > 0 ? "advanced-unlock-pulse" : ""}`}>
        {rows.map((row) => {
          const advancedLevel = getAdvancedDimensionLevel(advancedProgress, row.roundId);
          return (
            <div className={`score-item ${advancedUnlocked ? "with-advanced" : ""}`} key={row.roundId}>
              <div className="score-copy">
                <span>{row.label}</span>
                <strong>{row.score}</strong>
                <small>{row.detail}</small>
              </div>
              {advancedUnlocked ? (
                <button
                  aria-label={`进入${row.label}进阶挑战，当前进阶${advancedLevel}`}
                  className={`advanced-entry-button ${getAdvancedLevelTone(advancedLevel)}`}
                  type="button"
                  onClick={() => onOpenAdvancedChallenge(row.roundId)}
                >
                  {advancedLevel}
                </button>
              ) : null}
            </div>
          );
        })}
        <div className={`score-item luck-score-item ${advancedUnlocked ? "with-advanced" : "locked"}`}>
          <div className="score-copy luck-copy">
            <span>运气</span>
            <strong>{advancedProgress.luckBestScore}</strong>
            <small>{luckStatus}</small>
          </div>
          {advancedUnlocked ? (
            <button
              aria-label={`进入运气抽取，当前运气${advancedProgress.luckStars}星`}
              className={`advanced-entry-button luck-entry-button ${getLuckLevelTone(advancedProgress.luckStars)}`}
              type="button"
              onClick={onOpenLuckDraw}
            >
              {advancedProgress.luckStars}
            </button>
          ) : null}
        </div>
      </div>

    </section>
  );
}
