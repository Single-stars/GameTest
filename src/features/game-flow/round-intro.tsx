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
    <section className="intro-screen" role="button" tabIndex={0} onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") onStart();
    }} onPointerDown={onStart}>
      <div className="intro-card">
        <div className="intro-rule-lines" aria-hidden="true">
          <span />
        </div>
        <div className="intro-copy">
          <h1>{round.title}</h1>
        </div>
        <small className="intro-start-hint">点击任意位置开始</small>
        <div className="intro-rule-lines" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}
