"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";

import { SimpleGameSync } from "@/features/game-sync/simple-game-sync";
import { DoodleJumpPrototype, type DoodleRuntimeState } from "@/features/mini-games/doodle";
import { FallDownPrototype, type FallDownRuntimeState } from "@/features/mini-games/fall-down";
import { FlappyPrototype, type FlappyRuntimeState } from "@/features/mini-games/flappy";
import type { MiniGameLevelConfig } from "@/lib/mini-games";
import type { GameResult, SelfGameState } from "@/lib/multiplayer/types";

const MULTIPLAYER_STATE_SYNC_MS = 33;

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

function resolveFlappyScore(runtime: FlappyRuntimeState) {
  const progressScore = runtime.progress * 1080;
  const failurePenalty = runtime.failures * 30;
  return Math.max(0, Math.round(progressScore - failurePenalty));
}

type MultiplayerRuntimeState = {
  cameraY: number;
  direction: SelfGameState["direction"];
  elapsedMs: number;
  failures: number;
  progress: number;
  status: "playing" | "passed" | "failed";
  vx?: number;
  vy?: number;
  x: number;
  y: number;
};

type MultiplayerMatchRuntimeProps = {
  level: MiniGameLevelConfig;
  matchStageSize?: { width: number; height: number };
  opponentPlayer: { skinId?: string } | null;
  opponentStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  readOpponentStateMetrics?: (() => {
    acceptedPackets: number;
    droppedOldPackets: number;
    lastAcceptedAt: number | null;
  }) | null;
  opponentState: SelfGameState | null;
  reportResult: (result: GameResult) => void;
  reportState: (state: SelfGameState) => void;
  runSeed: string;
};

export const MultiplayerMatchRuntime = memo(function MultiplayerMatchRuntime({
  level,
  matchStageSize,
  opponentPlayer,
  opponentStateSubscription,
  readOpponentStateMetrics,
  opponentState,
  reportResult,
  reportState,
  runSeed,
}: MultiplayerMatchRuntimeProps) {
  const syncRef = useRef<SimpleGameSync | null>(null);
  const localResultSentRef = useRef(false);
  const packetTelemetryRef = useRef<{
    intervalMs: number | null;
    jitterMs: number | null;
    lastReceivedAt: number | null;
    syncHz: number | null;
  }>({
    intervalMs: null,
    jitterMs: null,
    lastReceivedAt: null,
    syncHz: null,
  });
  const [debugHud, setDebugHud] = useState<{
    droppedOldPackets: number;
    intervalMs: number | null;
    jitterMs: number | null;
    lastReceivedAgeMs: number | null;
    syncHz: number | null;
  } | null>(null);

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

  useEffect(() => {
    if (!opponentStateSubscription) return;
    return opponentStateSubscription(() => {
      const telemetry = packetTelemetryRef.current;
      const receivedAt = performance.now();
      if (telemetry.lastReceivedAt !== null) {
        const intervalMs = Math.max(0, receivedAt - telemetry.lastReceivedAt);
        const smoothInterval = telemetry.intervalMs === null ? intervalMs : telemetry.intervalMs * 0.72 + intervalMs * 0.28;
        const instantaneousJitter = Math.abs(intervalMs - smoothInterval);
        const smoothJitter = telemetry.jitterMs === null ? instantaneousJitter : telemetry.jitterMs * 0.72 + instantaneousJitter * 0.28;
        telemetry.intervalMs = smoothInterval;
        telemetry.jitterMs = smoothJitter;
        telemetry.syncHz = smoothInterval > 0 ? 1000 / smoothInterval : null;
      }
      telemetry.lastReceivedAt = receivedAt;
    });
  }, [opponentStateSubscription]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const tick = () => {
      const telemetry = packetTelemetryRef.current;
      const metrics = readOpponentStateMetrics?.();
      const nowAt = performance.now();
      const lastReceivedAgeMs =
        telemetry.lastReceivedAt === null
          ? null
          : Math.max(0, nowAt - telemetry.lastReceivedAt);
      setDebugHud({
        droppedOldPackets: metrics?.droppedOldPackets ?? 0,
        intervalMs: telemetry.intervalMs,
        jitterMs: telemetry.jitterMs,
        lastReceivedAgeMs,
        syncHz: telemetry.syncHz,
      });
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [readOpponentStateMetrics]);

  const publishRuntimeState = useCallback(
    (runtime: MultiplayerRuntimeState, score: number) => {
      const status = resolveRuntimeStatus(runtime.status);
      const nextState: SelfGameState = {
        cameraY: runtime.cameraY,
        direction: runtime.direction,
        elapsedMs: runtime.elapsedMs,
        failures: runtime.failures,
        progress: runtime.progress,
        score,
        status,
        vx: runtime.vx,
        vy: runtime.vy,
        x: runtime.x,
        y: runtime.y,
      };
      syncRef.current?.update(nextState);
      if (nextState.status === "playing") return;
      syncRef.current?.flush();
      if (localResultSentRef.current) return;
      localResultSentRef.current = true;
      reportResult({
        score,
        passed: nextState.status === "finished",
        timeMs: runtime.elapsedMs,
      });
    },
    [reportResult],
  );

  const handleRuntimeState = useCallback(
    <TRuntime extends MultiplayerRuntimeState,>(runtime: TRuntime, scoreResolver: (state: TRuntime) => number) => {
      const score = scoreResolver(runtime);
      publishRuntimeState(runtime, score);
    },
    [publishRuntimeState],
  );

  const handleDoodleRuntimeState = useCallback(
    (runtime: DoodleRuntimeState) => {
      handleRuntimeState(runtime, resolveDoodleScore);
    },
    [handleRuntimeState],
  );

  const handleFallDownRuntimeState = useCallback(
    (runtime: FallDownRuntimeState) => {
      handleRuntimeState(runtime, resolveFallDownScore);
    },
    [handleRuntimeState],
  );

  const handleFlappyRuntimeState = useCallback(
    (runtime: FlappyRuntimeState) => {
      handleRuntimeState(runtime, resolveFlappyScore);
    },
    [handleRuntimeState],
  );

  const runtimeNode =
    level.gameId === "doodle" ? (
      <DoodleJumpPrototype
        autoStart
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleDoodleRuntimeState}
        remotePlayer={opponentPlayer}
        remoteStateSubscription={opponentStateSubscription}
        remoteState={opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn
      />
    ) : level.gameId === "fall-down" ? (
      <FallDownPrototype
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleFallDownRuntimeState}
        remotePlayer={opponentPlayer}
        remoteStateSubscription={opponentStateSubscription}
        remoteState={opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn
      />
    ) : level.gameId === "flappy" ? (
      <FlappyPrototype
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleFlappyRuntimeState}
        remotePlayer={opponentPlayer}
        remoteStateSubscription={opponentStateSubscription}
        remoteState={opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn
      />
    ) : (
      <DoodleJumpPrototype
        autoStart
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleDoodleRuntimeState}
        remotePlayer={opponentPlayer}
        remoteStateSubscription={opponentStateSubscription}
        remoteState={opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn
      />
    );

  return (
    <>
      {runtimeNode}
      {process.env.NODE_ENV === "development" && debugHud ? (
        <aside
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            zIndex: 1600,
            minWidth: 188,
            borderRadius: 12,
            border: "1px solid rgba(24,24,24,0.14)",
            padding: "8px 10px",
            background: "rgba(17, 17, 17, 0.78)",
            color: "#fff",
            fontSize: 11,
            lineHeight: 1.45,
            pointerEvents: "none",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
          }}
        >
          <div>remote packet interval: {debugHud.intervalMs === null ? "-" : `${debugHud.intervalMs.toFixed(1)}ms`}</div>
          <div>jitter: {debugHud.jitterMs === null ? "-" : `${debugHud.jitterMs.toFixed(1)}ms`}</div>
          <div>last received age: {debugHud.lastReceivedAgeMs === null ? "-" : `${debugHud.lastReceivedAgeMs.toFixed(0)}ms`}</div>
          <div>dropped old packets: {debugHud.droppedOldPackets}</div>
          <div>current sync Hz: {debugHud.syncHz === null ? "-" : debugHud.syncHz.toFixed(1)}</div>
        </aside>
      ) : null}
    </>
  );
});
