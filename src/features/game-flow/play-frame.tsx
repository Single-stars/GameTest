"use client";

import { useState, type ReactNode } from "react";
import { type RoundConfig } from "@/features/game-flow/round-config";

const BASE_ROUND_TUTORIALS = {
  aim: {
    title: "操作提示",
    steps: ["点击屏幕向点击位置发射箭矢。", "使用最少的箭矢击中目标指定次数。"],
  },
  braking: {
    title: "操作提示",
    steps: ["长按屏幕小方块前进。", "出现危险时松手停下来。"],
  },
  memory: {
    title: "操作提示",
    steps: ["点击屏幕小方块会起跳。", "连续点击穿过障碍到达终点。"],
  },
  patience: {
    title: "操作提示",
    steps: ["点击屏幕发射飞刀。", "需要避开已有飞刀。"],
  },
  reaction: {
    title: "操作提示",
    steps: ["看到绿色信号后立刻点击。"],
  },
  rhythm: {
    title: "操作提示",
    steps: ["长按屏幕蓄力，松手跳跃。", "蓄力越久，跳得越远。"],
  },
  search: {
    title: "操作提示",
    steps: ["长按左右屏幕控制移动方向。", "到达最高处终点平台。"],
  },
  stroop: {
    title: "操作提示",
    steps: ["长按左右屏幕控制移动方向。", "到达最低处终点平台。"],
  },
} as const satisfies Record<RoundConfig["id"], { title: string; steps: readonly string[] }>;

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
  const [dismissedTutorialKey, setDismissedTutorialKey] = useState<string | null>(null);
  const tutorial = BASE_ROUND_TUTORIALS[round.id];
  const tutorialKey = `${round.id}:${index}`;
  const tutorialVisible = dismissedTutorialKey !== tutorialKey;

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
      {tutorialVisible ? null : children}
      {tutorialVisible ? (
        <div className="base-tutorial-overlay" role="dialog" aria-modal="true" aria-labelledby="base-tutorial-title">
          <div className="base-tutorial-panel">
            <h2 id="base-tutorial-title">{tutorial.title}</h2>
            <ul className="base-tutorial-steps">
              {tutorial.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <button className="primary-button" type="button" onClick={() => setDismissedTutorialKey(tutorialKey)}>
              开始
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
