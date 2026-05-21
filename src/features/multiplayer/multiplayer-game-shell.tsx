"use client";

import { useRef, type ReactNode } from "react";

import type {
  GameResult,
  MultiplayerStatus,
  PlayerInfo,
  SelfGameState,
} from "@/lib/multiplayer/types";

function formatProgress(state: SelfGameState | null) {
  if (!state) return "0%";
  return `${Math.round(state.progress * 100)}%`;
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

function PlayerHudLine({
  label,
  player,
  result,
  state,
}: {
  label: string;
  player: PlayerInfo | null;
  result: GameResult | null;
  state: SelfGameState | null;
}) {
  return (
    <div className="multiplayer-game-hud-line">
      <span>{player?.name ?? label}</span>
      <strong>{formatScore(state, result)}</strong>
      <small>{formatProgress(state)}</small>
    </div>
  );
}

export function MultiplayerGameShell({
  children,
  countdownSeconds,
  opponentPlayer,
  opponentResult,
  opponentState,
  onLeave,
  onRematch,
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
  onLeave: () => void;
  onRematch: () => void;
  selfPlayer: PlayerInfo | null;
  selfResult: GameResult | null;
  selfState: SelfGameState | null;
  status: MultiplayerStatus;
  winnerText: string;
}) {
  const shellRef = useRef<HTMLElement | null>(null);

  const requestNativeFullscreen = () => {
    const shell = shellRef.current;
    if (!shell?.requestFullscreen) return;
    void shell.requestFullscreen().catch(() => undefined);
  };

  return (
    <section className="multiplayer-game-shell play-screen" ref={shellRef} aria-label="联机游戏">
      <div className="multiplayer-game-shell-main">{children}</div>
      {status === "countdown" && countdownSeconds !== null ? (
        <div className="multiplayer-game-countdown-panel" aria-live="polite">
          {countdownSeconds}
        </div>
      ) : null}

      <aside className="multiplayer-game-hud" aria-label="联机状态">
        <div className="multiplayer-game-hud-scoreboard">
          <PlayerHudLine label="你" player={selfPlayer} state={selfState} result={selfResult} />
          <PlayerHudLine label="对方" player={opponentPlayer} state={opponentState} result={opponentResult} />
        </div>
        <div className="multiplayer-game-hud-actions">
          <button type="button" onClick={requestNativeFullscreen}>
            进入全屏
          </button>
          <button type="button" onClick={onLeave}>
            离开联机
          </button>
        </div>
      </aside>

      {status === "finished" ? (
        <div className="multiplayer-game-result-panel" role="dialog" aria-modal="true" aria-label="挑战结束">
          <h2>挑战结束</h2>
          <p className="multiplayer-game-winner">{winnerText}</p>
          <div className="multiplayer-game-result-grid">
            <p>
              <span>你</span>
              <strong>{formatResult(selfResult)}</strong>
            </p>
            <p>
              <span>对方</span>
              <strong>{formatResult(opponentResult)}</strong>
            </p>
          </div>
          <div className="multiplayer-game-result-actions">
            <button type="button" onClick={onRematch}>
              再来一局
            </button>
            <button type="button" onClick={onLeave}>
              退出联机
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
