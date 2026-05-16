"use client";

import { type RoundConfig } from "@/features/game-flow/round-config";

export function RoundIntro({
  round,
  onStart,
}: {
  round: RoundConfig;
  onStart: () => void;
}) {
  return (
    <section className="intro-screen">
      <div className="intro-card">
        <div className="intro-copy">
          <h1>{round.title}</h1>
        </div>
        <div className="intro-rule-card">
          <p>{round.rule}</p>
          {round.action ? <small>{round.action}</small> : null}
        </div>
        <button className="primary-button intro-start-button" type="button" onPointerDown={onStart}>
          开始
        </button>
      </div>
    </section>
  );
}
