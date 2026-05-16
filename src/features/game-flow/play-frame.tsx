"use client";

import { type ReactNode } from "react";
import { type RoundConfig } from "@/features/game-flow/round-config";

export function PlayFrame({
  round,
  index,
  onSkipPerfect,
  showPerfectClearShortcut,
  totalRounds,
  children,
}: {
  round: RoundConfig;
  index: number;
  onSkipPerfect: () => void;
  showPerfectClearShortcut: boolean;
  totalRounds: number;
  children: ReactNode;
}) {
  return (
    <section className="play-screen" aria-live="polite">
      <header className="round-header">
        <div className="round-title-block">
          <h1>{round.title}</h1>
        </div>
        <div className="round-header-actions">
          <span className="round-measure-pill">{round.measure}</span>
          {showPerfectClearShortcut ? (
            <button className="advanced-back-button" type="button" onPointerDown={onSkipPerfect}>
              一键满分过关
            </button>
          ) : null}
        </div>
      </header>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${((index + 1) / totalRounds) * 100}%` }} />
      </div>
      {children}
    </section>
  );
}
