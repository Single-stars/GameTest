"use client";

import { type CSSProperties, type ReactNode } from "react";

import { PlayerAvatar } from "@/features/player-avatar/player-avatar";
import { resolvePlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";
import type {
  GameResult,
  MultiplayerStatus,
  PlayerInfo,
  SelfGameState,
} from "@/lib/multiplayer/types";

const PROGRESS_MARKER_CLOSE_DISTANCE = 0.05;

function clampProgressValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function resolveProgress(state: SelfGameState | null, result: GameResult | null) {
  if (result?.passed) return 1;
  return clampProgressValue(state?.progress);
}

function formatProgress(progress: number) {
  return `${Math.round(progress * 100)}%`;
}

function formatScore(state: SelfGameState | null, result: GameResult | null) {
  if (result) return Math.round(result.score);
  return Math.round(state?.score ?? 0);
}

function formatResult(result: GameResult | null) {
  if (!result) return "等待结果";
  const passText = result.passed ? "通关" : "失败";
  const timeText = typeof result.timeMs === "number" ? ` / ${(result.timeMs / 1000).toFixed(2)}s` : "";
  return `${passText} / ${Math.round(result.score)}分${timeText}`;
}

function ProgressMarker({
  className,
  label,
  player,
  progress,
  zIndex,
}: {
  className: string;
  label: string;
  player: PlayerInfo | null;
  progress: number;
  zIndex: number;
}) {
  const markerStyle: CSSProperties = {
    left: `${progress * 100}%`,
    zIndex,
  };

  return (
    <span
      className={`multiplayer-progress-marker ${className}`}
      style={markerStyle}
      title={`${player?.name ?? label} ${formatProgress(progress)}`}
    >
      <span className="multiplayer-progress-avatar" aria-hidden="true">
        <PlayerAvatar
          action="idle"
          direction="none"
          expression="neutral"
          size={32}
          skin={resolvePlayerAvatarSkin(player?.skinId)}
          visualScale={1.02}
        />
      </span>
      <small>{formatProgress(progress)}</small>
    </span>
  );
}

function RematchHint({
  rematchRequestedByOpponent,
  rematchRequestedBySelf,
}: {
  rematchRequestedByOpponent: boolean;
  rematchRequestedBySelf: boolean;
}) {
  if (rematchRequestedBySelf && rematchRequestedByOpponent) {
    return <p className="multiplayer-rematch-hint">双方都想再来一局，准备开始...</p>;
  }
  if (rematchRequestedByOpponent) {
    return <p className="multiplayer-rematch-hint">对方想再来一局</p>;
  }
  if (rematchRequestedBySelf) {
    return <p className="multiplayer-rematch-hint">已发送再来一局，等待对方</p>;
  }
  return null;
}

export function MultiplayerGameShell({
  children,
  countdownSeconds,
  opponentPlayer,
  opponentResult,
  opponentState,
  onForfeit,
  onRematch,
  onReturnRoom,
  rematchRequestedByOpponent,
  rematchRequestedBySelf,
  selfPlayer,
  selfResult,
  selfState,
  status,
  winnerText,
}: {
  children?: ReactNode;
  countdownSeconds: number | null;
  opponentPlayer: PlayerInfo | null;
  opponentResult: GameResult | null;
  opponentState: SelfGameState | null;
  onForfeit: () => void;
  onRematch: () => void;
  onReturnRoom: () => void;
  rematchRequestedByOpponent: boolean;
  rematchRequestedBySelf: boolean;
  selfPlayer: PlayerInfo | null;
  selfResult: GameResult | null;
  selfState: SelfGameState | null;
  status: MultiplayerStatus;
  winnerText: string;
}) {
  const selfProgress = resolveProgress(selfState, selfResult);
  const opponentProgress = resolveProgress(opponentState, opponentResult);
  const markersAreClose = Math.abs(selfProgress - opponentProgress) <= PROGRESS_MARKER_CLOSE_DISTANCE;
  const selfMarkerZIndex = markersAreClose && selfProgress >= opponentProgress ? 5 : 3;
  const opponentMarkerZIndex = markersAreClose && opponentProgress > selfProgress ? 5 : 4;
  const leadProgress = Math.max(selfProgress, opponentProgress);

  return (
    <section className="multiplayer-game-shell play-screen" aria-label="联机游戏">
      <header className="multiplayer-progress-hud" aria-label="联机进度">
        <div className="multiplayer-progress-wrap">
          <div
            className="multiplayer-progress-track"
            aria-label={`你 ${formatProgress(selfProgress)}，对方 ${formatProgress(opponentProgress)}`}
          >
            <span className="multiplayer-progress-fill" style={{ width: `${leadProgress * 100}%` }} />
            <ProgressMarker
              className="self"
              label={selfPlayer?.name ?? "你"}
              player={selfPlayer}
              progress={selfProgress}
              zIndex={selfMarkerZIndex}
            />
            <ProgressMarker
              className="opponent"
              label={opponentPlayer?.name ?? "对方"}
              player={opponentPlayer}
              progress={opponentProgress}
              zIndex={opponentMarkerZIndex}
            />
          </div>
        </div>
        {(status === "countdown" || status === "playing") ? (
          <button className="multiplayer-progress-action" type="button" onClick={onForfeit}>
            认输
          </button>
        ) : null}
      </header>

      <div className="multiplayer-game-shell-main">{children}</div>

      {status === "countdown" && countdownSeconds !== null ? (
        <div className="multiplayer-game-countdown-panel" aria-live="polite">
          {countdownSeconds}
        </div>
      ) : null}

      {status === "finished" ? (
        <div className="multiplayer-game-result-panel" role="dialog" aria-modal="true" aria-label="挑战结束">
          <h2>挑战结束</h2>
          <p className="multiplayer-game-winner">{winnerText}</p>
          <RematchHint
            rematchRequestedByOpponent={rematchRequestedByOpponent}
            rematchRequestedBySelf={rematchRequestedBySelf}
          />
          <div className="multiplayer-game-result-grid">
            <p>
              <span>你</span>
              <strong>{formatResult(selfResult)}</strong>
              <small>{formatScore(selfState, selfResult)}分</small>
            </p>
            <p>
              <span>对方</span>
              <strong>{formatResult(opponentResult)}</strong>
              <small>{formatScore(opponentState, opponentResult)}分</small>
            </p>
          </div>
          <div className="multiplayer-game-result-actions">
            <button type="button" onClick={onRematch} disabled={rematchRequestedBySelf}>
              再来一局
            </button>
            <button type="button" onClick={onReturnRoom}>
              返回房间
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
