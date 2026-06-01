"use client";

import { type CSSProperties, type ReactNode } from "react";

import { PlayerAvatar } from "@/features/player-avatar/player-avatar";
import { resolvePlayerAvatarSkin } from "@/features/player-avatar/player-avatar-skin";
import type { MultiplayerPlayMode } from "@/lib/multiplayer/level-select";
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
  if (result) return `${Math.round(result.score)}分`;
  return `${Math.round(state?.score ?? 0)}分`;
}

function formatBreakdownNumber(value: number, unit: "ms" | "point" | "count" | "note") {
  if (unit === "ms") return `${(value / 1000).toFixed(2)}s`;
  if (unit === "point") return String(Math.round(value));
  if (unit === "count") return `${Math.round(value)}次`;
  return String(value);
}

function formatBreakdownFinalNumber(value: number, unit: "ms" | "point" | "count" | "note") {
  if (unit === "point") return `${Math.round(value)}分`;
  return formatBreakdownNumber(value, unit);
}

function formatBreakdownValue(value: number | string, unit: "ms" | "point" | "count" | "note") {
  if (typeof value === "number") return formatBreakdownNumber(value, unit);
  return value;
}

function formatBreakdownAmount(amount: number | undefined, unit: "ms" | "point" | "count" | "note") {
  if (typeof amount !== "number") return null;
  const sign = amount > 0 ? "+" : "";
  if (unit === "ms") return `${sign}${(amount / 1000).toFixed(2)}s`;
  if (unit === "point") return `${sign}${Math.round(amount)}分`;
  if (unit === "count") return `${sign}${Math.round(amount)}次`;
  return `${sign}${amount}`;
}

function formatResult(result: GameResult | null) {
  if (!result) return "等待结果";
  if (result.breakdown?.outcome === "forfeit") return "认输";
  if (result.breakdown?.outcome === "opponent-forfeit") return "对方认输获胜";
  if (result.breakdown) return result.passed ? "完成" : "判负";
  const passText = result.passed ? "通关" : "失败";
  const timeText = typeof result.timeMs === "number" ? ` / ${(result.timeMs / 1000).toFixed(2)}s` : "";
  return `${passText} / ${Math.round(result.score)}分${timeText}`;
}

function shouldHideResultSummary(result: GameResult | null) {
  if (!result?.breakdown) return false;
  return result.breakdown.outcome !== "forfeit" && result.breakdown.outcome !== "opponent-forfeit";
}

function shouldHideResultScore(result: GameResult | null) {
  return Boolean(result?.breakdown);
}

function renderResultBreakdown(result: GameResult | null) {
  if (!result?.breakdown) return null;
  if (result.breakdown.outcome === "forfeit" || result.breakdown.outcome === "opponent-forfeit") return null;
  const rows = result.breakdown.formulaRows ?? [...result.breakdown.base, ...result.breakdown.adjustments];
  const scoringRows = rows.filter((item) => !item.displayOnly);
  const noteRows = rows.filter((item) => item.displayOnly);
  return (
    <div className="multiplayer-game-result-breakdown">
      {[...scoringRows, ...noteRows].map((item) => {
        const amountText = formatBreakdownAmount(item.amount, item.unit);
        const operation = "operation" in item ? item.operation : undefined;
        return (
          <div className="multiplayer-game-result-row" key={item.key}>
            <span>{item.label}</span>
            <strong>{formatBreakdownValue(item.value, item.unit)}</strong>
            <small>{item.displayOnly ? "不加减" : amountText ?? (operation === "base" ? "基础" : "计入最终")}</small>
          </div>
        );
      })}
      <div className="multiplayer-game-result-final">
        <span>{result.breakdown.final.label}</span>
        <strong aria-hidden="true" />
        <small>{formatBreakdownFinalNumber(result.breakdown.final.value, result.breakdown.final.unit)}</small>
      </div>
    </div>
  );
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
          customImageUrl={player?.skinId === "custom" ? player.customAvatar?.imageDataUrl : null}
          customOutlineColor={player?.skinId === "custom" ? player.customAvatar?.outlineColor ?? null : null}
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
  countdownRules = [],
  coOpAssignmentText,
  opponentPlayer,
  opponentResult,
  opponentState,
  playMode,
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
  countdownRules?: string[];
  coOpAssignmentText?: string | null;
  opponentPlayer: PlayerInfo | null;
  opponentResult: GameResult | null;
  opponentState: SelfGameState | null;
  playMode: MultiplayerPlayMode;
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
  const coOpMode = playMode === "co-op";
  const selfProgress = resolveProgress(selfState, selfResult);
  const opponentProgress = resolveProgress(opponentState, opponentResult);
  const sharedProgress = Math.max(selfProgress, opponentProgress);
  const sharedResult = selfResult ?? opponentResult;
  const sharedState = selfState ?? opponentState;
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
            aria-label={coOpMode ? `合作 ${formatProgress(sharedProgress)}` : `你 ${formatProgress(selfProgress)}，对方 ${formatProgress(opponentProgress)}`}
          >
            <span className="multiplayer-progress-fill" style={{ width: `${(coOpMode ? sharedProgress : leadProgress) * 100}%` }} />
            {coOpMode ? (
              <ProgressMarker
                className="self co-op"
                label="合作"
                player={selfPlayer}
                progress={sharedProgress}
                zIndex={5}
              />
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
        {status === "countdown" || status === "playing" ? (
          <button className="multiplayer-progress-action" type="button" onClick={onForfeit}>
            认输
          </button>
        ) : null}
      </header>

      <div className="multiplayer-game-shell-main">{children}</div>

      {status === "countdown" && countdownSeconds !== null ? (
        <div className="multiplayer-game-countdown-panel" aria-live="polite">
          <div className="multiplayer-game-countdown-number">
            <span>准备</span>
            <strong>{countdownSeconds}</strong>
          </div>
          <div className="multiplayer-game-countdown-rules">
            <span>{coOpMode ? "合作规则" : "本关规则"}</span>
            <ul>
              {(countdownRules.length > 0 ? countdownRules : coOpMode && coOpAssignmentText ? [coOpAssignmentText] : []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
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
          {coOpMode ? (
            <div className="multiplayer-game-result-grid co-op">
              <article>
                <span>合作</span>
                {shouldHideResultSummary(sharedResult) ? null : <strong>{formatResult(sharedResult)}</strong>}
                {!shouldHideResultScore(sharedResult) ? <small>{formatScore(sharedState, sharedResult)}</small> : null}
                {renderResultBreakdown(sharedResult)}
              </article>
            </div>
          ) : (
            <div className="multiplayer-game-result-grid">
              <article>
                <span>你</span>
                {shouldHideResultSummary(selfResult) ? null : <strong>{formatResult(selfResult)}</strong>}
                {!shouldHideResultScore(selfResult) ? <small>{formatScore(selfState, selfResult)}</small> : null}
                {renderResultBreakdown(selfResult)}
              </article>
              <article>
                <span>对方</span>
                {shouldHideResultSummary(opponentResult) ? null : <strong>{formatResult(opponentResult)}</strong>}
                {!shouldHideResultScore(opponentResult) ? <small>{formatScore(opponentState, opponentResult)}</small> : null}
                {renderResultBreakdown(opponentResult)}
              </article>
            </div>
          )}
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
