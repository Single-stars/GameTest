"use client";

import { memo, useCallback, useEffect, useRef } from "react";

import { SimpleGameSync } from "@/features/game-sync/simple-game-sync";
import { DoodleJumpPrototype, type DoodleRuntimeState } from "@/features/mini-games/doodle";
import type { MiniGameLevelConfig } from "@/lib/mini-games";
import type { GameResult, SelfGameState } from "@/lib/multiplayer/types";

const MULTIPLAYER_STATE_SYNC_MS = 50;

function resolveSelfScore(runtime: DoodleRuntimeState) {
  const progressScore = runtime.progress * 1000;
  const failurePenalty = runtime.failures * 35;
  return Math.max(0, Math.round(progressScore - failurePenalty));
}

type MultiplayerMatchRuntimeProps = {
  level: MiniGameLevelConfig;
  matchStageSize?: { width: number; height: number };
  opponentPlayer: { skinId?: string } | null;
  opponentState: SelfGameState | null;
  reportResult: (result: GameResult) => void;
  reportState: (state: SelfGameState) => void;
  runSeed: string;
};

export const MultiplayerMatchRuntime = memo(function MultiplayerMatchRuntime({
  level,
  matchStageSize,
  opponentPlayer,
  opponentState,
  reportResult,
  reportState,
  runSeed,
}: MultiplayerMatchRuntimeProps) {
  const syncRef = useRef<SimpleGameSync | null>(null);
  const localResultSentRef = useRef(false);

  const cleanupSync = useCallback(() => {
    syncRef.current?.stop();
    syncRef.current = null;
  }, []);

  useEffect(() => {
    cleanupSync();
    localResultSentRef.current = false;
    const sync = new SimpleGameSync((state: SelfGameState) => {
      reportState(state);
    }, MULTIPLAYER_STATE_SYNC_MS);
    syncRef.current = sync;
    sync.start();
    return cleanupSync;
  }, [cleanupSync, reportState]);

  const handleRuntimeState = useCallback(
    (runtime: DoodleRuntimeState) => {
      const status: SelfGameState["status"] =
        runtime.status === "passed"
          ? "finished"
          : runtime.status === "failed"
            ? "failed"
            : "playing";
      const score = resolveSelfScore(runtime);
      const nextState: SelfGameState = {
        cameraY: runtime.cameraY,
        direction: runtime.direction,
        elapsedMs: runtime.elapsedMs,
        failures: runtime.failures,
        progress: runtime.progress,
        score,
        status,
        x: runtime.x,
        y: runtime.y,
      };
      syncRef.current?.update(nextState);
      if (status === "playing") return;
      syncRef.current?.flush();
      if (localResultSentRef.current) return;
      localResultSentRef.current = true;
      reportResult({
        score,
        passed: status === "finished",
        timeMs: runtime.elapsedMs,
      });
    },
    [reportResult],
  );

  return (
    <DoodleJumpPrototype
      autoStart
      level={level}
      mode="advanced"
      onBackToSelect={() => undefined}
      onRestart={() => undefined}
      onRuntimeState={handleRuntimeState}
      remotePlayer={opponentPlayer}
      remoteState={opponentState}
      runSeed={runSeed}
      logicStageSizeOverride={matchStageSize}
      unlimitedRespawn
    />
  );
});
