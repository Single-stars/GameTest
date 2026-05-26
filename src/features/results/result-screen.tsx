"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { getAdvancedDimensionLevel, getAdvancedLevelTone, getLuckDrawStatusText, getLuckLevelTone, getAdvancedTotalStars, formatResultRankTitle, type AdvancedProgress } from "@/lib/advanced-progress";
import { getGameRankResult, type RoundId, type TrialEvent } from "@/lib/scoring";
import { ROUND_DISPLAY_BY_ID } from "@/lib/round-display";
import { RadarChart } from "@/features/results/radar-chart";
import { AvatarLabIcon, HomeworldIcon, RestartIcon, ResetDataIcon, ShareIcon } from "@/features/results/result-icons";
import { PlayerAvatar, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";

type ImageShareState = "idle" | "sharing" | "saved" | "failed";
type AvatarMenuItem = {
  id: "share" | "restart" | "reset" | "homeworld" | "skin";
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

const AVATAR_LAB_ENTRY_ANIMATION_MS = 560;

export function ResultScreen({
  advancedProgress,
  avatarSkin,
  trials,
  advancedUnlockPulseId,
  imageShareState,
  debugToolsVisible,
  onOpenAdvancedChallenge,
  onOpenAvatarLab,
  onOpenHomeworld,
  onOpenLuckDraw,
  onResetTestData,
  onShareImage,
  onRestart,
}: {
  advancedProgress: AdvancedProgress;
  avatarSkin: PlayerAvatarSkin;
  trials: TrialEvent[];
  advancedUnlockPulseId: number;
  imageShareState: ImageShareState;
  debugToolsVisible: boolean;
  onOpenAdvancedChallenge: (roundId: RoundId) => void;
  onOpenAvatarLab: () => void;
  onOpenHomeworld: () => void;
  onOpenLuckDraw: () => void;
  onResetTestData: () => void;
  onShareImage: () => void;
  onRestart: () => void;
}) {
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarMenuFeedback, setAvatarMenuFeedback] = useState(false);
  const avatarEntryTimerRef = useRef<number | null>(null);
  const result = getGameRankResult(trials);
  const brakingTrials = trials.filter((item) => item.roundId === "braking");

  const dinoSafeStops = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.safeStop === true).length;
  const dinoCollisions = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.collision === true).length;
  const advancedUnlocked = advancedProgress.unlocked || result.name === "最强王者";

  const advancedStars = getAdvancedTotalStars(advancedProgress);

  const rankTitle = formatResultRankTitle(result.name, advancedStars);
  const luckStatus = getLuckDrawStatusText(advancedUnlocked, advancedProgress);

  const clearAvatarEntryTimer = useCallback(() => {
    if (avatarEntryTimerRef.current !== null) {
      window.clearTimeout(avatarEntryTimerRef.current);
      avatarEntryTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearAvatarEntryTimer, [clearAvatarEntryTimer]);

  const runAvatarMenuAction = useCallback(
    (action: () => void) => {
      if (avatarMenuFeedback) return;
      clearAvatarEntryTimer();
      setAvatarMenuOpen(false);
      setAvatarMenuFeedback(true);
      avatarEntryTimerRef.current = window.setTimeout(() => {
        avatarEntryTimerRef.current = null;
        setAvatarMenuFeedback(false);
        action();
      }, AVATAR_LAB_ENTRY_ANIMATION_MS);
    },
    [avatarMenuFeedback, clearAvatarEntryTimer],
  );

  const toggleAvatarMenu = useCallback(() => {
    if (avatarMenuFeedback) return;
    clearAvatarEntryTimer();
    setAvatarMenuOpen((current) => !current);
  }, [avatarMenuFeedback, clearAvatarEntryTimer]);

  const closeAvatarMenuFromOutside = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!avatarMenuOpen || avatarMenuFeedback) return;
      const menuWrap = event.currentTarget.querySelector(".rank-avatar-menu-wrap");
      if (event.target instanceof Node && menuWrap?.contains(event.target)) return;
      setAvatarMenuOpen(false);
    },
    [avatarMenuFeedback, avatarMenuOpen],
  );

  const avatarEntryAction = avatarMenuFeedback ? "celebrate" : avatarMenuOpen ? "wonder" : "idle";
  const avatarEntryEffect = avatarMenuFeedback ? "sparkles" : avatarMenuOpen ? "question" : "none";
  const avatarEntryExpression = avatarMenuFeedback ? "happy" : "neutral";

  const avatarMenuItems = [
    {
      id: "share",
      label: "生成分享图片",
      icon: <ShareIcon />,
      disabled: imageShareState === "sharing",
      onSelect: onShareImage,
    },
    {
      id: "restart",
      label: "重新测试",
      icon: <RestartIcon />,
      onSelect: onRestart,
    },
    {
      id: "homeworld",
      label: "家园",
      icon: <HomeworldIcon />,
      onSelect: onOpenHomeworld,
    },
    ...(debugToolsVisible
      ? [
          {
            id: "reset" as const,
            label: "重置测试数据",
            icon: <ResetDataIcon />,
            onSelect: onResetTestData,
            danger: true,
          },
        ]
      : []),
    {
      id: "skin",
      label: "皮肤动作测试",
      icon: null,
      onSelect: onOpenAvatarLab,
    },
  ] satisfies AvatarMenuItem[];

  const rows = [
    {
      roundId: "reaction",
      label: ROUND_DISPLAY_BY_ID.reaction.label,
      score: result.scores.reaction,
      detail: result.metrics.reactionMedianMs ? `${Math.round(result.metrics.reactionMedianMs)}ms` : "不足",
    },
    {
      roundId: "aim",
      label: ROUND_DISPLAY_BY_ID.aim.label,
      score: result.scores.targeting,
      detail: result.metrics.aimTotal > 0 ? `命中 ${result.metrics.aimHits}/${result.metrics.aimTotal}` : "不足",
    },
    {
      roundId: "search",
      label: ROUND_DISPLAY_BY_ID.search.label,
      score: result.scores.search,
      detail: result.metrics.searchMeanCountError !== null ? `失误 ${result.metrics.searchMeanCountError.toFixed(0)}` : "不足",
    },
    {
      roundId: "stroop",
      label: ROUND_DISPLAY_BY_ID.stroop.label,
      score: result.scores.interference,
      detail: result.metrics.stroopAccuracy !== null ? `${Math.round(result.metrics.stroopAccuracy * 100)}%` : "不足",
    },
    {
      roundId: "rhythm",
      label: ROUND_DISPLAY_BY_ID.rhythm.label,
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
      label: ROUND_DISPLAY_BY_ID.memory.label,
      score: result.scores.memory,
      detail: result.metrics.memoryAccuracy !== null ? `${Math.round(result.metrics.memoryAccuracy * 100)}%` : "不足",
    },
    {
      roundId: "braking",
      label: ROUND_DISPLAY_BY_ID.braking.label,
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
      label: ROUND_DISPLAY_BY_ID.patience.label,
      score: result.scores.waiting,
      detail: result.metrics.patiencePct !== null ? `${Math.round(result.metrics.patiencePct)}%` : "不足",
    },
  ] as const satisfies ReadonlyArray<{ roundId: RoundId; label: string; score: number; detail: string }>;

  return (
    <section className="result-screen" onPointerDownCapture={closeAvatarMenuFromOutside}>
      <div className={`result-card rank-card ${avatarMenuOpen ? "menu-open" : ""}`}>
        <div className="rank-title">
          <h1>{rankTitle}</h1>
        </div>
        <div className="rank-avatar-menu-wrap">
          <button
            aria-controls="rank-avatar-menu"
            aria-expanded={avatarMenuOpen}
            aria-haspopup="menu"
            aria-label="打开结果操作气泡"
            className={`rank-avatar-entry ${avatarMenuOpen ? "open" : ""} ${avatarMenuFeedback ? "playing" : ""}`}
            data-transition-avatar-anchor
            type="button"
            onClick={toggleAvatarMenu}
          >
            <PlayerAvatar
              action={avatarEntryAction}
              effect={avatarEntryEffect}
              expression={avatarEntryExpression}
              skin={avatarSkin}
              size={46}
              visualScale={1.02}
            />
          </button>

          {avatarMenuOpen ? (
            <div aria-label="结果操作" className="rank-avatar-menu" id="rank-avatar-menu" role="menu">
              <svg
                aria-hidden="true"
                className="rank-avatar-menu-surface"
                focusable="false"
                preserveAspectRatio="none"
                viewBox="0 0 248 122"
              >
                <path
                  className="rank-avatar-menu-surface-path center"
                  d="M18 13H112L124 2L136 13H230C239.39 13 247 20.61 247 30V104C247 113.39 239.39 121 230 121H18C8.61 121 1 113.39 1 104V30C1 20.61 8.61 13 18 13Z"
                />
                <path
                  className="rank-avatar-menu-surface-path edge"
                  d="M18 13H191L203 2L215 13H230C239.39 13 247 20.61 247 30V104C247 113.39 239.39 121 230 121H18C8.61 121 1 113.39 1 104V30C1 20.61 8.61 13 18 13Z"
                />
              </svg>
              <div className="rank-avatar-bubble">
                {avatarMenuItems.map((item) => (
                  <button
                    aria-label={item.label}
                    className={`rank-avatar-menu-action ${item.danger ? "danger" : ""}`}
                    disabled={avatarMenuFeedback || item.disabled}
                    key={item.id}
                    role="menuitem"
                    type="button"
                    onClick={() => runAvatarMenuAction(item.onSelect)}
                  >
                    {item.id === "skin" ? <AvatarLabIcon /> : item.icon}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="radar-card-shell">
        <RadarChart axis={result.axis} />
      </div>

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
