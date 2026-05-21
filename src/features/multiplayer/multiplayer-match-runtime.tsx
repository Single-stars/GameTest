"use client";

import { memo, useCallback, useEffect, useRef } from "react";

import { SimpleGameSync } from "@/features/game-sync/simple-game-sync";
import { DoodleJumpPrototype, type DoodleRuntimeState } from "@/features/mini-games/doodle";
import { FallDownPrototype, type FallDownRuntimeState } from "@/features/mini-games/fall-down";
import type { MiniGameLevelConfig } from "@/lib/mini-games";
import type { GameResult, SelfGameState } from "@/lib/multiplayer/types";

const MULTIPLAYER_STATE_SYNC_MS = 50;

function resolveRuntimeStatus(status: "playing" | "passed" | "failed"): SelfGameState["status"] {
  if (status === "passed") return "finished";
  if (status === "failed") return "failed";
  return "playing";
}

function resolveDoodleScore(runtime: DoodleRuntimeState) {
  const progressScore = runtime.progress * 1000;
  const failurePenalty = runtime.failures * 35;
  return Math.max(0, Math.round(progressScore - failurePenalty));
}

function resolveFallDownScore(runtime: FallDownRuntimeState) {
  const progressScore = runtime.progress * 1100;
  const failurePenalty = runtime.failures * 28;
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

  const publishRuntimeState = useCallback(
    (nextState: SelfGameState, score: number, elapsedMs: number) => {
      syncRef.current?.update(nextState);
      if (nextState.status === "playing") return;
      syncRef.current?.flush();
      if (localResultSentRef.current) return;
      localResultSentRef.current = true;
      reportResult({
        score,
        passed: nextState.status === "finished",
        timeMs: elapsedMs,
      });
    },
    [reportResult],
  );

  const handleDoodleRuntimeState = useCallback(
    (runtime: DoodleRuntimeState) => {
      const status = resolveRuntimeStatus(runtime.status);
      const score = resolveDoodleScore(runtime);
      publishRuntimeState(
        {
          cameraY: runtime.cameraY,
          direction: runtime.direction,
          elapsedMs: runtime.elapsedMs,
          failures: runtime.failures,
          progress: runtime.progress,
          score,
          status,
          x: runtime.x,
          y: runtime.y,
        },
        score,
        runtime.elapsedMs,
      );
    },
    [publishRuntimeState],
  );

  const handleFallDownRuntimeState = useCallback(
    (runtime: FallDownRuntimeState) => {
      const status = resolveRuntimeStatus(runtime.status);
      const score = resolveFallDownScore(runtime);
      publishRuntimeState(
        {
          cameraY: runtime.cameraY,
          direction: runtime.direction,
          elapsedMs: runtime.elapsedMs,
          failures: runtime.failures,
          progress: runtime.progress,
          score,
          status,
          x: runtime.x,
          y: runtime.y,
        },
        score,
        runtime.elapsedMs,
      );
    },
    [publishRuntimeState],
  );

  if (level.gameId === "fall-down") {
    return (
      <FallDownPrototype
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleFallDownRuntimeState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn
      />
    );
  }

  return (
    <DoodleJumpPrototype
      autoStart
      level={level}
      mode="advanced"
      onBackToSelect={() => undefined}
      onRestart={() => undefined}
      onRuntimeState={handleDoodleRuntimeState}
      remotePlayer={opponentPlayer}
      remoteState={opponentState}
      runSeed={runSeed}
      logicStageSizeOverride={matchStageSize}
      unlimitedRespawn
    />
  );
});
