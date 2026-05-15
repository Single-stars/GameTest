"use client";

import Link from "next/link";
import { useState } from "react";

import {
  MiniGameEntryPanel,
  MiniGameLevelSelectScreen,
  MiniGamePlayScreen,
} from "@/app/mini-game-prototypes";
import type { MiniGameId } from "@/lib/mini-game-prototypes";

type PrototypeRouteState =
  | { mode: "entry" }
  | { mode: "select"; gameId: MiniGameId }
  | { mode: "play"; attemptId: number; gameId: MiniGameId; levelId: string };

const TEST_GAME_IDS: MiniGameId[] = ["square-jump", "fall-down"];

export default function MiniGamePrototypesPage() {
  const [state, setState] = useState<PrototypeRouteState>({ mode: "entry" });

  if (state.mode === "play") {
    return (
      <main className="app-shell">
        <MiniGamePlayScreen
          attemptId={state.attemptId}
          gameId={state.gameId}
          levelId={state.levelId}
          onBackToSelect={() => setState({ mode: "select", gameId: state.gameId })}
        />
      </main>
    );
  }

  if (state.mode === "select") {
    return (
      <main className="app-shell">
        <MiniGameLevelSelectScreen
          gameId={state.gameId}
          onBack={() => setState({ mode: "entry" })}
          onStartLevel={(levelId) => setState({ mode: "play", gameId: state.gameId, levelId, attemptId: Date.now() })}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="advanced-screen prototype-test-page">
        <header className="advanced-topbar">
          <Link className="advanced-back-button" href="/">
            返回
          </Link>
          <span>原型测试</span>
        </header>
        <MiniGameEntryPanel
          gameIds={TEST_GAME_IDS}
          onOpenGame={(gameId) => setState({ mode: "select", gameId })}
          subtitle="测试方块跃迁与一路向下的基础玩法、变体和最终关"
          title="小游戏原型测试"
        />
      </section>
    </main>
  );
}
