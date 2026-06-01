"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SimpleGameSync } from "@/features/game-sync/simple-game-sync";
import { DoodleJumpPrototype, type DoodleRuntimeState } from "@/features/mini-games/doodle";
import { FallDownPrototype, type FallDownRuntimeState } from "@/features/mini-games/fall-down";
import { FlappyPrototype, type FlappyRuntimeState } from "@/features/mini-games/flappy";
import { KnifeHitPrototype, type KnifeRuntimeState } from "@/features/mini-games/knife";
import { SquareJumpPrototype, type SquareJumpStateSnapshot } from "@/features/mini-games/square-jump";
import { AdvancedAimRound, type AdvancedAimRuntimeState } from "@/features/rounds/native/aim";
import type { MiniGameCompletion } from "@/features/mini-games/common";
import type { MiniGameLevelConfig } from "@/lib/mini-games";
import type { AdvancedStageConfig } from "@/lib/advanced-challenges";
import type { GameResult, PlayerInfo, SelfGameState, SessionRole } from "@/lib/multiplayer/types";
import type { MultiplayerPlayMode } from "@/lib/multiplayer/level-select";
import { buildMultiplayerResultBreakdown } from "@/lib/multiplayer/result-breakdown";
import {
  MULTIPLAYER_INPUT_KEEPALIVE_MS,
  MULTIPLAYER_FAST_STATE_SYNC_MS,
  MULTIPLAYER_IDLE_STATE_SYNC_MS,
  MULTIPLAYER_STATE_SYNC_MS,
} from "@/lib/multiplayer/protocol";

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

function resolveKnifeScore(runtime: KnifeRuntimeState) {
  return Math.round((runtime.knifeHits ?? 0) - (runtime.knifeTimeouts ?? 0));
}

function resolveAimScore(runtime: AdvancedAimRuntimeState) {
  const progressScore = runtime.progress * 1000;
  const penalty = (runtime.aimMisses + runtime.aimFlyOuts + runtime.aimDecoyHits) * 24;
  return Math.max(0, Math.round(progressScore - penalty));
}

function resolveSquareJumpScore(runtime: SquareJumpStateSnapshot) {
  const progressScore = runtime.progress * 1040;
  const failurePenalty = runtime.failures * 32;
  return Math.max(0, Math.round(progressScore - failurePenalty));
}

function numberStat(stats: MiniGameCompletion["stats"], key: string) {
  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resolveCompletionScore(outcome: MiniGameCompletion) {
  if (outcome.gameId === "knife") {
    return Math.round(numberStat(outcome.stats, "hits") - numberStat(outcome.stats, "timeouts"));
  }
  const elapsedMs = Math.max(0, outcome.elapsedMs);
  const failurePenalty = numberStat(outcome.stats, "failures") * 40;
  const progressScore = numberStat(outcome.stats, "progressPercent") * 8;
  const hitScore = numberStat(outcome.stats, "hits") * 90;
  const jumpScore = numberStat(outcome.stats, "jumps") * 75;
  const baseScore = outcome.status === "passed" ? 1000 : 160;
  const timeBonus = outcome.status === "passed" ? Math.max(0, 300 - elapsedMs / 1000) : 0;
  return Math.max(0, Math.round(baseScore + timeBonus + progressScore + hitScore + jumpScore - failurePenalty));
}

function resolveRuntimeAnim(runtime: MultiplayerRuntimeState, status: SelfGameState["status"]) {
  if (status !== "playing") return status;
  if (runtime.phase) return runtime.phase;
  if (runtime.direction && runtime.direction !== "none") return "move";
  return "idle";
}

function multiplayerStateSignature(state: SelfGameState) {
  return [
    state.status,
    state.anim ?? "",
    state.direction ?? "none",
    state.phase ?? "",
    state.charge ?? "",
    state.progress ?? 0,
    state.score ?? 0,
    state.angle ?? "",
    state.x ?? "",
    state.y ?? "",
    state.cameraX ?? "",
    state.cameraY ?? "",
    state.cameraScale ?? "",
    state.platformIndex ?? "",
    state.nextPlatformIndex ?? "",
    state.exitingPlatformIndex ?? "",
    state.failures ?? 0,
    state.gravity ?? "",
    state.turns ?? "",
    state.knifeShotIndex ?? "",
    state.knifeTimer ?? "",
    state.knifeTimedOutThisShot ?? "",
    state.knifeOvertime ?? "",
    state.knifeWinnerRole ?? "",
    state.knifeHostHits ?? "",
    state.knifeGuestHits ?? "",
    state.knifeHostTimeouts ?? "",
    state.knifeGuestTimeouts ?? "",
    state.knifeHostCollisions ?? "",
    state.knifeGuestCollisions ?? "",
    state.knifeHostDangerHits ?? "",
    state.knifeGuestDangerHits ?? "",
    state.aimHits ?? "",
    state.aimMisses ?? "",
    state.aimFlyOuts ?? "",
    state.aimDecoyHits ?? "",
    state.aimTargetCount ?? "",
  ].join(":");
}

function multiplayerImmediateStateSignature(state: SelfGameState) {
  return [
    state.status,
    state.anim ?? "",
    state.direction ?? "none",
    state.phase ?? "",
    state.score ?? 0,
    state.angle ?? "",
    state.failures ?? 0,
    state.gravity ?? "",
    state.platformIndex ?? "",
    state.nextPlatformIndex ?? "",
    state.exitingPlatformIndex ?? "",
    state.turns ?? "",
    state.knifeShotIndex ?? "",
    state.knifeTimedOutThisShot ?? "",
    state.knifeOvertime ?? "",
    state.knifeWinnerRole ?? "",
    state.knifeHostHits ?? "",
    state.knifeGuestHits ?? "",
    state.knifeHostTimeouts ?? "",
    state.knifeGuestTimeouts ?? "",
    state.knifeHostCollisions ?? "",
    state.knifeGuestCollisions ?? "",
    state.knifeHostDangerHits ?? "",
    state.knifeGuestDangerHits ?? "",
    state.aimHits ?? "",
    state.aimMisses ?? "",
    state.aimFlyOuts ?? "",
    state.aimDecoyHits ?? "",
    state.aimTargetCount ?? "",
  ].join(":");
}

function resolveDynamicStateSendIntervalMs(state: SelfGameState) {
  if (state.status !== "playing") return 0;
  const vx = typeof state.vx === "number" && Number.isFinite(state.vx) ? state.vx : 0;
  const vy = typeof state.vy === "number" && Number.isFinite(state.vy) ? state.vy : 0;
  const speed = Math.hypot(vx, vy);
  const phase = state.phase ?? "";
  const highMotionPhase =
    phase === "jumping" ||
    phase === "falling" ||
    phase === "airCharging" ||
    phase === "advancing" ||
    phase === "charging";
  if (speed >= 260 || Math.abs(vy) >= 180 || highMotionPhase) return MULTIPLAYER_FAST_STATE_SYNC_MS;
  const idle =
    speed <= 8 &&
    (state.direction === undefined || state.direction === "none") &&
    (typeof state.charge !== "number" || state.charge <= 0.001) &&
    (phase === "" || phase === "idle");
  return idle ? MULTIPLAYER_IDLE_STATE_SYNC_MS : MULTIPLAYER_STATE_SYNC_MS;
}

type MultiplayerRuntimeState = {
  cameraX?: number;
  cameraY: number;
  cameraScale?: number;
  charge?: number;
  collected?: number;
  collectibleCount?: number;
  direction: SelfGameState["direction"];
  elapsedMs: number;
  angle?: number;
  aimDecoyHits?: number;
  aimFlyOuts?: number;
  aimHits?: number;
  aimMisses?: number;
  aimTargetCount?: number;
  exitingPlatformIndex?: number;
  exitingPlatformOffsetY?: number;
  failures: number;
  gravity?: SelfGameState["gravity"];
  knifeCollisions?: number;
  knifeDangerHits?: number;
  knifeFailedAngles?: number[];
  knifeGuestCollisions?: number;
  knifeGuestDangerHits?: number;
  knifeGuestHits?: number;
  knifeGuestTimeouts?: number;
  knifeHostCollisions?: number;
  knifeHostDangerHits?: number;
  knifeHostHits?: number;
  knifeHostTimeouts?: number;
  knifeHits?: number;
  knifeInsertedAngles?: number[];
  knifeOvertime?: boolean;
  knifeShotIndex?: number;
  knifeTimedOutThisShot?: boolean;
  knifeTimer?: number;
  knifeTimeouts?: number;
  knifeWinnerRole?: "host" | "guest";
  nextPlatformIndex?: number;
  nextPlatformOffsetY?: number;
  phase?: string;
  platformIndex?: number;
  progress: number;
  status: "playing" | "passed" | "failed";
  turns?: number;
  usedPlatformIds?: number[];
  vx?: number;
  vy?: number;
  x: number;
  y: number;
};

type PlayerCustomAvatar = NonNullable<PlayerInfo["customAvatar"]>;

type MultiplayerMatchRuntimeProps = {
  level: MiniGameLevelConfig;
  matchStageSize?: { width: number; height: number };
  opponentPlayer: PlayerInfo | null;
  opponentStateSubscription?: ((listener: (state: SelfGameState) => void) => (() => void)) | null;
  readOpponentStateMetrics?: (() => {
    acceptedPackets: number;
    droppedOldPackets: number;
    lastAcceptedAt: number | null;
  }) | null;
  opponentState: SelfGameState | null;
  playMode: MultiplayerPlayMode;
  reportInput: (input: Pick<SelfGameState, "direction" | "charge" | "phase" | "status" | "elapsedMs">) => void;
  reportResult: (result: GameResult) => void;
  reportState: (state: SelfGameState) => void;
  runSeed: string;
  selfRole: SessionRole;
  selfCustomAvatar?: PlayerInfo["customAvatar"] | null;
  selfSkinId?: string;
};

function hashMultiplayerSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveCoOpHostLeft(runSeed: string) {
  return hashMultiplayerSeed(`${runSeed}:co-op-left`) % 2 === 0;
}

export function resolveSquareJumpHostFirst(runSeed: string) {
  return hashMultiplayerSeed(`${runSeed}:co-op-square-jump-first`) % 2 === 0;
}

export function resolveCoOpRole(selfRole: SessionRole, hostLeft: boolean): "left" | "right" {
  if (selfRole === "host") return hostLeft ? "left" : "right";
  return hostLeft ? "right" : "left";
}

export function resolveSquareJumpCoOpRole(selfRole: SessionRole, hostFirst: boolean): "first" | "second" {
  if (selfRole === "host") return hostFirst ? "first" : "second";
  return hostFirst ? "second" : "first";
}

function resolveCoOpSharedSkinId({
  opponentPlayer,
  runSeed,
  selfSkinId,
}: {
  opponentPlayer?: PlayerInfo | null;
  runSeed: string;
  selfSkinId?: string;
}) {
  const skinIds = [selfSkinId, opponentPlayer?.skinId].filter((skinId): skinId is string => typeof skinId === "string" && skinId.length > 0);
  if (skinIds.length === 0) return null;
  return skinIds[hashMultiplayerSeed(`${runSeed}:co-op-shared-skin`) % skinIds.length];
}

function resolveCoOpSharedCustomAvatar({
  opponentPlayer,
  runSeed,
  selfCustomAvatar,
  selfSkinId,
}: {
  opponentPlayer?: PlayerInfo | null;
  runSeed: string;
  selfCustomAvatar?: PlayerInfo["customAvatar"] | null;
  selfSkinId?: string;
}) {
  const candidates = [
    { customAvatar: selfCustomAvatar ?? null, skinId: selfSkinId },
    { customAvatar: opponentPlayer?.customAvatar ?? null, skinId: opponentPlayer?.skinId },
  ].filter((item): item is { customAvatar: PlayerCustomAvatar | null; skinId: string } => typeof item.skinId === "string" && item.skinId.length > 0);
  if (candidates.length === 0) return null;
  const selected = candidates[hashMultiplayerSeed(`${runSeed}:co-op-shared-skin`) % candidates.length];
  return selected.skinId === "custom" ? selected.customAvatar : null;
}

function aimDifficulty(level: MiniGameLevelConfig): AdvancedStageConfig["difficulty"] {
  if (level.difficulty === "简单") return "easy";
  if (level.difficulty === "普通") return "medium";
  if (level.difficulty === "困难") return "hard";
  return level.difficulty === "最终" ? "boss" : "easy";
}

function aimVariantIndex(level: MiniGameLevelConfig): AdvancedStageConfig["variantIndex"] {
  if (level.order === 10) return 10;
  return (((level.order - 1) % 3) + 1) as 1 | 2 | 3;
}

function createAimAdvancedConfig(level: MiniGameLevelConfig): AdvancedStageConfig {
  return {
    dimension: "aim",
    level: Math.max(1, Math.min(10, level.order)),
    stageTitle: level.title,
    variant: typeof level.params.aimVariant === "string" ? level.params.aimVariant : "aim-track",
    variantIndex: aimVariantIndex(level),
    difficulty: aimDifficulty(level),
    passText: level.goalText,
    params: {
      ...level.params,
      multiplayerPenaltyMode: true,
      unlimitedArrows: true,
    },
  };
}

export const MultiplayerMatchRuntime = memo(function MultiplayerMatchRuntime({
  level,
  matchStageSize,
  opponentPlayer,
  opponentStateSubscription,
  readOpponentStateMetrics,
  opponentState,
  playMode,
  reportInput,
  reportResult,
  reportState,
  runSeed,
  selfRole,
  selfCustomAvatar,
  selfSkinId,
}: MultiplayerMatchRuntimeProps) {
  const syncRef = useRef<SimpleGameSync | null>(null);
  const localResultSentRef = useRef(false);
  const lastImmediateStateSignatureRef = useRef<string | undefined>(undefined);
  const lastReportedInputSignatureRef = useRef<string | undefined>(undefined);
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
  const coOpMode = playMode === "co-op";
  const aimAdvancedConfig = useMemo(() => level.gameId === "aim" ? createAimAdvancedConfig(level) : null, [level]);

  const cleanupSync = useCallback(() => {
    syncRef.current?.stop();
    syncRef.current = null;
  }, []);

  useEffect(() => {
    cleanupSync();
    localResultSentRef.current = false;
    lastImmediateStateSignatureRef.current = undefined;
    lastReportedInputSignatureRef.current = undefined;
    const inputOnlySync = playMode === "co-op";
    const syncIntervalMs = inputOnlySync ? MULTIPLAYER_INPUT_KEEPALIVE_MS : MULTIPLAYER_FAST_STATE_SYNC_MS;
    const sync = new SimpleGameSync((state: SelfGameState) => {
      if (playMode === "co-op") {
        reportInput({
          charge: state.charge,
          direction: state.direction,
          elapsedMs: state.elapsedMs,
          phase: state.phase,
          status: state.status,
        });
        return;
      }
      reportState(state);
    }, syncIntervalMs, {
      keepAliveMs: inputOnlySync ? MULTIPLAYER_INPUT_KEEPALIVE_MS : undefined,
      sendIntervalMs: inputOnlySync ? undefined : resolveDynamicStateSendIntervalMs,
    });
    syncRef.current = sync;
    sync.start();
    return cleanupSync;
  }, [cleanupSync, playMode, reportInput, reportState]);

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

  const coOpInputOnly = coOpMode;
  const coOpAuthoritativeStateSubscription = null;
  const coOpInputStateSubscription = coOpMode ? opponentStateSubscription : null;

  const publishRuntimeState = useCallback(
    (runtime: MultiplayerRuntimeState, score: number) => {
      const status = resolveRuntimeStatus(runtime.status);
      const nextState: SelfGameState = {
        type: "state",
        cameraX: runtime.cameraX,
        cameraY: runtime.cameraY,
        cameraScale: runtime.cameraScale,
        charge: runtime.charge,
        direction: runtime.direction,
        elapsedMs: runtime.elapsedMs,
        t: runtime.elapsedMs,
        angle: runtime.angle ?? 0,
        aimDecoyHits: runtime.aimDecoyHits,
        aimFlyOuts: runtime.aimFlyOuts,
        aimHits: runtime.aimHits,
        aimMisses: runtime.aimMisses,
        aimTargetCount: runtime.aimTargetCount,
        anim: resolveRuntimeAnim(runtime, status),
        exitingPlatformIndex: runtime.exitingPlatformIndex,
        exitingPlatformOffsetY: runtime.exitingPlatformOffsetY,
        failures: runtime.failures,
        gravity: runtime.gravity,
        knifeInsertedAngles: runtime.knifeInsertedAngles,
        knifeFailedAngles: runtime.knifeFailedAngles,
        knifeShotIndex: runtime.knifeShotIndex,
        knifeTimer: runtime.knifeTimer,
        knifeTimedOutThisShot: runtime.knifeTimedOutThisShot,
        knifeOvertime: runtime.knifeOvertime,
        knifeWinnerRole: runtime.knifeWinnerRole,
        knifeHostHits: runtime.knifeHostHits,
        knifeGuestHits: runtime.knifeGuestHits,
        knifeHostTimeouts: runtime.knifeHostTimeouts,
        knifeGuestTimeouts: runtime.knifeGuestTimeouts,
        knifeHostCollisions: runtime.knifeHostCollisions,
        knifeGuestCollisions: runtime.knifeGuestCollisions,
        knifeHostDangerHits: runtime.knifeHostDangerHits,
        knifeGuestDangerHits: runtime.knifeGuestDangerHits,
        nextPlatformIndex: runtime.nextPlatformIndex,
        nextPlatformOffsetY: runtime.nextPlatformOffsetY,
        phase: runtime.phase,
        platformIndex: runtime.platformIndex,
        progress: runtime.progress,
        score,
        status,
        turns: runtime.turns,
        usedPlatformIds: runtime.usedPlatformIds,
        vx: runtime.vx,
        vy: runtime.vy,
        x: runtime.x,
        y: runtime.y,
      };
      if (coOpInputOnly) {
        const inputOnlyState: SelfGameState = {
          ...nextState,
          status,
        };
        const inputSignature = `${inputOnlyState.direction ?? "none"}:${inputOnlyState.charge ?? ""}:${inputOnlyState.phase ?? ""}:${inputOnlyState.status}`;
        const inputChanged = lastReportedInputSignatureRef.current !== inputSignature;
        lastReportedInputSignatureRef.current = inputSignature;
        syncRef.current?.update(inputOnlyState, { immediate: inputChanged, signature: multiplayerStateSignature(inputOnlyState) });
      }
      if (!coOpInputOnly) {
        const immediateSignature = multiplayerImmediateStateSignature(nextState);
        const immediate = lastImmediateStateSignatureRef.current !== immediateSignature || nextState.status !== "playing";
        lastImmediateStateSignatureRef.current = immediateSignature;
        syncRef.current?.update(nextState, { immediate, signature: multiplayerStateSignature(nextState) });
      }
      if (nextState.status === "playing") return;
      syncRef.current?.flush({ force: true });
      if (localResultSentRef.current) return;
      localResultSentRef.current = true;
      const breakdown = buildMultiplayerResultBreakdown(level, {
        aimDecoyHits: runtime.aimDecoyHits,
        aimFlyOuts: runtime.aimFlyOuts,
        aimHits: runtime.aimHits,
        aimMisses: runtime.aimMisses,
        aimTargetCount: runtime.aimTargetCount,
        collected: runtime.collected,
        collectibleCount: runtime.collectibleCount,
        elapsedMs: runtime.elapsedMs,
        failures: runtime.failures,
        knifeCollisions: runtime.knifeCollisions,
        knifeDangerHits: runtime.knifeDangerHits,
        knifeHits: runtime.knifeHits,
        knifeOvertime: runtime.knifeOvertime,
        knifeTimeouts: runtime.knifeTimeouts,
        passed: nextState.status === "finished",
        progress: runtime.progress,
      });
      reportResult({
        breakdown,
        passed: nextState.status === "finished",
        score,
        timeMs: Math.max(0, Math.round(runtime.elapsedMs)),
      });
    },
    [coOpInputOnly, level, reportResult],
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

  const handleAimRuntimeState = useCallback(
    (runtime: AdvancedAimRuntimeState) => {
      handleRuntimeState(runtime, resolveAimScore);
    },
    [handleRuntimeState],
  );

  const handleKnifeRuntimeState = useCallback(
    (runtime: KnifeRuntimeState) => {
      handleRuntimeState(runtime, resolveKnifeScore);
    },
    [handleRuntimeState],
  );

  const handleSquareJumpRuntimeState = useCallback(
    (runtime: SquareJumpStateSnapshot) => {
      handleRuntimeState(runtime, resolveSquareJumpScore);
    },
    [handleRuntimeState],
  );

  const handleCompletion = useCallback(
    (outcome: MiniGameCompletion) => {
      const score = resolveCompletionScore(outcome);
      publishRuntimeState(
        {
          cameraY: 0,
          direction: "none",
          elapsedMs: outcome.elapsedMs,
          failures: numberStat(outcome.stats, "failures"),
          knifeCollisions: numberStat(outcome.stats, "collisions"),
          knifeDangerHits: numberStat(outcome.stats, "dangerHits"),
          knifeHits: numberStat(outcome.stats, "hits"),
          knifeTimeouts: numberStat(outcome.stats, "timeouts"),
          progress: outcome.status === "passed" ? 1 : Math.max(0, Math.min(1, numberStat(outcome.stats, "progressPercent") / 100)),
          status: outcome.status,
          x: 0,
          y: 0,
        },
        score,
      );
    },
    [publishRuntimeState],
  );

  useEffect(() => {
    if (level.gameId !== "knife" && level.gameId !== "square-jump" && level.gameId !== "aim") return;
    publishRuntimeState(
      {
        cameraY: 0,
        direction: "none",
        elapsedMs: 0,
        failures: 0,
        progress: 0,
        status: "playing",
        x: 0,
        y: 0,
      },
      0,
    );
  }, [level.gameId, publishRuntimeState, runSeed]);

  const coOpRole = coOpMode ? resolveCoOpRole(selfRole, resolveCoOpHostLeft(runSeed)) : null;
  const squareJumpCoOpRole = coOpMode ? resolveSquareJumpCoOpRole(selfRole, resolveSquareJumpHostFirst(runSeed)) : null;
  const coOpSharedSkinId = coOpMode ? resolveCoOpSharedSkinId({ opponentPlayer, runSeed, selfSkinId }) : null;
  const coOpSharedCustomAvatar = coOpMode ? resolveCoOpSharedCustomAvatar({ opponentPlayer, runSeed, selfCustomAvatar, selfSkinId }) : null;

  const runtimeNode =
    level.gameId === "doodle" ? (
      <DoodleJumpPrototype
        autoStart
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleDoodleRuntimeState}
        remotePlayer={coOpMode ? null : opponentPlayer}
        remoteStateSubscription={coOpMode ? null : opponentStateSubscription}
        remoteState={coOpMode ? null : opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn={!coOpMode}
        coOpInputState={coOpMode ? opponentState : null}
        coOpInputStateSubscription={coOpInputStateSubscription}
        coOpRole={coOpRole}
        coOpSkinId={coOpSharedSkinId}
        coOpCustomAvatar={coOpSharedCustomAvatar}
        authoritativeStateSubscription={coOpAuthoritativeStateSubscription}
      />
    ) : level.gameId === "fall-down" ? (
      <FallDownPrototype
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleFallDownRuntimeState}
        remotePlayer={coOpMode ? null : opponentPlayer}
        remoteStateSubscription={coOpMode ? null : opponentStateSubscription}
        remoteState={coOpMode ? null : opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn={!coOpMode}
        coOpInputState={coOpMode ? opponentState : null}
        coOpInputStateSubscription={coOpInputStateSubscription}
        coOpRole={coOpRole}
        coOpSkinId={coOpSharedSkinId}
        coOpCustomAvatar={coOpSharedCustomAvatar}
        authoritativeStateSubscription={coOpAuthoritativeStateSubscription}
      />
    ) : level.gameId === "flappy" ? (
      <FlappyPrototype
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleFlappyRuntimeState}
        remotePlayer={coOpMode ? null : opponentPlayer}
        remoteStateSubscription={coOpMode ? null : opponentStateSubscription}
        remoteState={coOpMode ? null : opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn={!coOpMode}
      />
    ) : level.gameId === "aim" && aimAdvancedConfig ? (
      <AdvancedAimRound
        advancedConfig={aimAdvancedConfig}
        multiplayerPenaltyMode
        onComplete={() => undefined}
        onRuntimeState={handleAimRuntimeState}
        runSeed={runSeed}
      />
    ) : level.gameId === "knife" ? (
      <KnifeHitPrototype
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onComplete={handleCompletion}
        onRuntimeState={handleKnifeRuntimeState}
        onRestart={() => undefined}
        multiplayerRole={selfRole}
        remoteStateSubscription={opponentStateSubscription}
        runSeed={runSeed}
        unlimitedRespawn
      />
    ) : level.gameId === "square-jump" ? (
      <SquareJumpPrototype
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onComplete={handleCompletion}
        onRuntimeState={handleSquareJumpRuntimeState}
        onRestart={() => undefined}
        remotePlayer={coOpMode ? null : opponentPlayer}
        remoteStateSubscription={coOpMode ? null : opponentStateSubscription}
        remoteState={coOpMode ? null : opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn={!coOpMode}
        coOpInputState={coOpMode ? opponentState : null}
        coOpInputStateSubscription={coOpInputStateSubscription}
        coOpRole={squareJumpCoOpRole}
        coOpSkinId={coOpSharedSkinId}
        coOpCustomAvatar={coOpSharedCustomAvatar}
        authoritativeStateSubscription={coOpAuthoritativeStateSubscription}
      />
    ) : (
      <DoodleJumpPrototype
        autoStart
        level={level}
        mode="advanced"
        onBackToSelect={() => undefined}
        onRestart={() => undefined}
        onRuntimeState={handleDoodleRuntimeState}
        remotePlayer={coOpMode ? null : opponentPlayer}
        remoteStateSubscription={coOpMode ? null : opponentStateSubscription}
        remoteState={coOpMode ? null : opponentState}
        runSeed={runSeed}
        logicStageSizeOverride={matchStageSize}
        unlimitedRespawn={!coOpMode}
        coOpInputState={coOpMode ? opponentState : null}
        coOpInputStateSubscription={coOpInputStateSubscription}
        coOpRole={coOpRole}
        coOpSkinId={coOpSharedSkinId}
        coOpCustomAvatar={coOpSharedCustomAvatar}
        authoritativeStateSubscription={coOpAuthoritativeStateSubscription}
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
