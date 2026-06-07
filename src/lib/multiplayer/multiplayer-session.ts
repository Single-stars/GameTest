"use client";

import {
  createForfeitMessage,
  createHeartbeatMessage,
  createHelloMessage,
  createHomeworldPresenceMessage,
  createHomeworldStateMessage,
  createInputMessage,
  createLevelSelectPresenceMessage,
  createLevelSelectStateMessage,
  createReactionMessage,
  createReadyMessage,
  createRematchMessage,
  createResultMessage,
  createRoomScoreMessage,
  createReturnRoomMessage,
  createStateMessage,
  createTiebreakerMessage,
} from "@/lib/multiplayer/messages";
import {
  MULTIPLAYER_DISCONNECTED_MESSAGE,
  MULTIPLAYER_FAILED_MESSAGE,
  MULTIPLAYER_RECONNECTING_MESSAGE,
  MULTIPLAYER_ROOM_EXPIRED_MESSAGE,
  MULTIPLAYER_ROOM_EXPIRED_REASON,
  RoomSignalTransport,
} from "@/lib/multiplayer/webrtc-transport";
import type {
  CountdownState,
  GameResult,
  MatchConfig,
  MultiplayerReactionEvent,
  MultiplayerReactionKind,
  MultiplayerRoomScore,
  MultiplayerSnapshot,
  NetMessage,
  PlayerInfo,
  SelfGameState,
  SessionRole,
} from "@/lib/multiplayer/types";
import type {
  HomeworldPresence,
  HomeworldState,
} from "@/lib/homeworld/homeworld-state";
import {
  resolveMultiplayerPlayMode,
  resolveMultiplayerLevelSelection,
  type MultiplayerLevelSelectPresence,
  type MultiplayerLevelSelectState,
} from "@/lib/multiplayer/level-select";
import { buildForfeitResult, shouldStartMultiplayerTiebreaker } from "@/lib/multiplayer/result-breakdown";

const COUNTDOWN_TICK_MS = 100;
const OPPONENT_STATE_SNAPSHOT_SYNC_MS = 50;
const SELF_STATE_SNAPSHOT_SYNC_MS = 50;
const REMATCH_COUNTDOWN_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 2_000;
const PEER_STALE_MS = 22_000;

function now() {
  return Date.now();
}

function performanceNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : now();
}

function isTerminalRoomDisconnect(message: string) {
  return message === MULTIPLAYER_ROOM_EXPIRED_MESSAGE || message === MULTIPLAYER_ROOM_EXPIRED_REASON;
}

function createMatchId(seed: string) {
  return `${seed}:${now()}:${Math.random().toString(36).slice(2)}`;
}

function createRematchSeed(seed: string) {
  return `${seed}:again:${now()}:${Math.random().toString(36).slice(2)}`;
}

export function buildInitialSnapshot(): MultiplayerSnapshot {
  return {
    status: "idle",
    connectionState: "idle",
    role: null,
    roomId: null,
    selfPlayer: null,
    opponentPlayer: null,
    opponentJoining: false,
    selfReady: false,
    opponentReady: false,
    match: null,
    countdown: null,
    selfState: null,
    opponentState: null,
    selfResult: null,
    opponentResult: null,
    homeworldState: null,
    selfHomeworldPresence: null,
    opponentHomeworldPresence: null,
    levelSelectState: null,
    selfLevelSelectPresence: null,
    opponentLevelSelectPresence: null,
    roomScore: null,
    reactions: [],
    errorMessage: null,
  };
}

export type SessionOptions = {
  role: SessionRole;
  roomId?: string | null;
  selfPlayer: PlayerInfo;
  onChange: (snapshot: MultiplayerSnapshot) => void;
};

export class MultiplayerSession {
  private snapshot: MultiplayerSnapshot = buildInitialSnapshot();
  private transport: RoomSignalTransport | null = null;
  private readonly onChange: (snapshot: MultiplayerSnapshot) => void;
  private selfPlayer: PlayerInfo;
  private readonly role: SessionRole;
  private readonly targetRoomId: string | null;
  private countdownTimer: number | null = null;
  private opponentStateSnapshotTimer: number | null = null;
  private selfStateSnapshotTimer: number | null = null;
  private selfStateSeq = 0;
  private opponentStateSeq = -1;
  private lastOpponentStateSnapshotAt = 0;
  private lastSelfStateSnapshotAt = 0;
  private pendingOpponentStateSnapshot: SelfGameState | null = null;
  private pendingSelfStateSnapshot: SelfGameState | null = null;
  private readonly opponentStateListeners = new Set<(state: SelfGameState) => void>();
  private opponentStateAcceptedPackets = 0;
  private opponentStateDroppedOldPackets = 0;
  private lastOpponentStateAcceptedAt: number | null = null;
  private remoteTimeOffsetMs: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastPeerMessageAt: number | null = null;

  constructor(options: SessionOptions) {
    this.onChange = options.onChange;
    this.selfPlayer = options.selfPlayer;
    this.role = options.role;
    this.targetRoomId = options.roomId ?? null;
    this.patchSnapshot({
      role: this.role,
      selfPlayer: this.selfPlayer,
      connectionState: "signaling",
      status: this.role === "host" ? "creating" : "joining",
    });
  }

  getSnapshot() {
    return this.snapshot;
  }

  subscribeOpponentState = (listener: (state: SelfGameState) => void) => {
    this.opponentStateListeners.add(listener);
    return () => {
      this.opponentStateListeners.delete(listener);
    };
  };

  readOpponentStateMetrics = () => ({
    acceptedPackets: this.opponentStateAcceptedPackets,
    droppedOldPackets: this.opponentStateDroppedOldPackets,
    lastAcceptedAt: this.lastOpponentStateAcceptedAt,
  });

  async start() {
    this.patchSnapshot({ connectionState: "signaling" });
    this.transport = new RoomSignalTransport({
      role: this.role,
      roomId: this.targetRoomId,
      events: {
        onPeerOpen: (roomCode) => {
          this.patchSnapshot({
            roomId: roomCode,
            connectionState: "signaling",
            status: this.role === "host" ? "waiting" : "joining",
          });
        },
        onConnected: () => {
          const currentHomeworldPresence = this.snapshot.selfHomeworldPresence;
          const currentHomeworldState = this.snapshot.homeworldState;
          const currentLevelSelectPresence = this.snapshot.selfLevelSelectPresence;
          const currentLevelSelectState = this.snapshot.levelSelectState;
          const currentRoomScore = this.snapshot.roomScore;
          const currentOpponentPlayer = this.snapshot.opponentPlayer;
          const currentOpponentHomeworldPresence = this.snapshot.opponentHomeworldPresence;
          const currentOpponentLevelSelectPresence = this.snapshot.opponentLevelSelectPresence;
          this.stopCountdown();
          this.stopOpponentStateSnapshotTimer();
          this.stopSelfStateSnapshotTimer();
          this.pendingOpponentStateSnapshot = null;
          this.pendingSelfStateSnapshot = null;
          this.lastOpponentStateSnapshotAt = 0;
          this.lastSelfStateSnapshotAt = 0;
          this.selfStateSeq = 0;
          this.opponentStateSeq = -1;
          this.remoteTimeOffsetMs = null;
          this.notePeerMessage();
          this.startPeerPresence();
          this.patchSnapshot({
            status: "connected",
            connectionState: "connected",
            errorMessage: null,
            selfReady: false,
            opponentReady: false,
            match: null,
            countdown: null,
            selfState: null,
            opponentJoining: false,
            opponentPlayer: currentOpponentPlayer,
            opponentState: null,
            selfResult: null,
            opponentResult: null,
            reactions: [],
            homeworldState: currentHomeworldState,
            selfHomeworldPresence: currentHomeworldPresence,
            opponentHomeworldPresence: currentOpponentHomeworldPresence,
            levelSelectState: currentLevelSelectState,
            selfLevelSelectPresence: currentLevelSelectPresence,
            opponentLevelSelectPresence: currentOpponentLevelSelectPresence,
            roomScore: currentRoomScore,
          });
          this.send(createHelloMessage(this.selfPlayer));
          this.sendCurrentRoomSnapshots();
        },
        onPeerDisconnected: (message) => {
          if (this.role !== "host") return;
          this.preserveRoomAfterConnectionIssue(message || MULTIPLAYER_DISCONNECTED_MESSAGE);
        },
        onPeerJoining: () => {
          this.patchSnapshot({ opponentJoining: this.role === "host" });
        },
        onReplaced: () => {
          this.markSessionReplaced();
        },
        onMessage: (message) => this.handleMessage(message),
        onRemoteClockOffset: (offsetMs) => {
          this.remoteTimeOffsetMs = offsetMs;
        },
        onReconnecting: (message) => {
          this.markPeerTemporarilyStale(message || MULTIPLAYER_RECONNECTING_MESSAGE);
        },
        onFailed: (message) => {
          if (isTerminalRoomDisconnect(message)) {
            this.terminateRoomSession(message);
            return;
          }
          this.preserveRoomAfterConnectionIssue(message || MULTIPLAYER_FAILED_MESSAGE);
        },
        onDisconnected: (message) => {
          if (isTerminalRoomDisconnect(message)) {
            this.terminateRoomSession(message);
            return;
          }
          this.preserveRoomAfterConnectionIssue(message || MULTIPLAYER_DISCONNECTED_MESSAGE);
        },
      },
    });

    await this.transport.start();
  }

  setReady(ready: boolean) {
    if (ready && !this.canUsePeerConnection()) return;
    this.patchSnapshot({ selfReady: ready });
    this.send(createReadyMessage(ready));
    this.maybeStartMatch();
  }

  updateSelfPlayerProfile(patch: Partial<Pick<PlayerInfo, "customAvatar" | "name" | "skinId">>) {
    this.selfPlayer = { ...this.selfPlayer, ...patch };
    this.patchSnapshot({ selfPlayer: this.selfPlayer });
    this.send(createHelloMessage(this.selfPlayer));
  }

  startMatch(config: Omit<MatchConfig, "matchId" | "startAt"> & { countdownMs: number; matchId?: string }) {
    if (this.role !== "host") return;
    if (!this.canUsePeerConnection()) return;
    const sentAt = now();
    const startAt = sentAt + config.countdownMs;
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    const match: MatchConfig = {
      matchId: config.matchId || createMatchId(config.seed),
      levelId: config.levelId,
      playMode: config.playMode,
      seed: config.seed,
      logicWidth: config.logicWidth,
      logicHeight: config.logicHeight,
      startAt,
    };
    this.patchSnapshot({
      match,
      status: "countdown",
      countdown: { startAt, remainMs: Math.max(0, startAt - now()) },
      selfReady: false,
      opponentReady: false,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      reactions: [],
    });
    this.send({
      v: 1,
      kind: "start",
      matchId: match.matchId,
      seed: match.seed,
      startAt: match.startAt,
      sentAt,
      levelId: match.levelId,
      playMode: match.playMode,
      logicWidth: match.logicWidth,
      logicHeight: match.logicHeight,
    });
    this.startCountdownTick();
  }

  reportState(state: SelfGameState) {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    const sequencedState: SelfGameState = {
      ...state,
      matchId,
      seq: this.selfStateSeq,
      sentAt: now(),
      t: performanceNow(),
    };
    this.selfStateSeq += 1;
    this.syncSelfStateSnapshot(sequencedState);
    this.send(
      createStateMessage({
        matchId,
        cameraX: sequencedState.cameraX,
        cameraY: sequencedState.cameraY,
        cameraScale: sequencedState.cameraScale,
        charge: sequencedState.charge,
        vx: sequencedState.vx,
        vy: sequencedState.vy,
        direction: sequencedState.direction,
        exitingPlatformIndex: sequencedState.exitingPlatformIndex,
        exitingPlatformOffsetY: sequencedState.exitingPlatformOffsetY,
        elapsedMs: sequencedState.elapsedMs,
        failures: sequencedState.failures,
        gravity: sequencedState.gravity,
        nextPlatformIndex: sequencedState.nextPlatformIndex,
        nextPlatformOffsetY: sequencedState.nextPlatformOffsetY,
        phase: sequencedState.phase,
        platformIndex: sequencedState.platformIndex,
        turns: sequencedState.turns,
        progress: sequencedState.progress,
        score: sequencedState.score,
        seq: sequencedState.seq,
        sentAt: sequencedState.sentAt,
        status: sequencedState.status,
        t: sequencedState.t,
        angle: sequencedState.angle,
        anim: sequencedState.anim,
        x: sequencedState.x,
        y: sequencedState.y,
        screenX: sequencedState.screenX,
        screenY: sequencedState.screenY,
        usedPlatformIds: sequencedState.usedPlatformIds,
        knifeInsertedAngles: sequencedState.knifeInsertedAngles,
        knifeFailedAngles: sequencedState.knifeFailedAngles,
        knifeShotIndex: sequencedState.knifeShotIndex,
        knifeTimer: sequencedState.knifeTimer,
        knifeTimedOutThisShot: sequencedState.knifeTimedOutThisShot,
        knifeOvertime: sequencedState.knifeOvertime,
        knifeWinnerRole: sequencedState.knifeWinnerRole,
        knifeHostHits: sequencedState.knifeHostHits,
        knifeGuestHits: sequencedState.knifeGuestHits,
        knifeHostTimeouts: sequencedState.knifeHostTimeouts,
        knifeGuestTimeouts: sequencedState.knifeGuestTimeouts,
        knifeHostCollisions: sequencedState.knifeHostCollisions,
        knifeGuestCollisions: sequencedState.knifeGuestCollisions,
        knifeHostDangerHits: sequencedState.knifeHostDangerHits,
        knifeGuestDangerHits: sequencedState.knifeGuestDangerHits,
        aimHits: sequencedState.aimHits,
        aimMisses: sequencedState.aimMisses,
        aimFlyOuts: sequencedState.aimFlyOuts,
        aimDecoyHits: sequencedState.aimDecoyHits,
        aimTargetCount: sequencedState.aimTargetCount,
      }),
    );
  }

  reportResult(result: GameResult) {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    const reportedTiebreakerRound = Math.max(0, Math.round(result.tiebreakerRound ?? this.currentTiebreakerRound()));
    if (reportedTiebreakerRound !== this.currentTiebreakerRound()) return;
    const matchedResult: GameResult = { ...result, matchId, tiebreakerRound: reportedTiebreakerRound };
    if (this.snapshot.match?.playMode === "co-op") {
      this.patchSnapshot({
        selfResult: matchedResult,
        opponentResult: this.snapshot.opponentResult ?? matchedResult,
      });
    } else {
      this.patchSnapshot({ selfResult: matchedResult });
    }
    this.send(createResultMessage({ ...matchedResult, matchId, tiebreakerRound: reportedTiebreakerRound }));
    this.tryFinishSession();
  }

  reportInput(input: Pick<SelfGameState, "direction" | "charge" | "phase" | "status" | "elapsedMs">) {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    const sequencedInput: SelfGameState = {
      direction: input.direction,
      charge: input.charge,
      phase: input.phase,
      status: input.status ?? "playing",
      elapsedMs: input.elapsedMs,
      matchId,
      progress: 0,
      seq: this.selfStateSeq,
      sentAt: now(),
    };
    this.selfStateSeq += 1;
    this.syncSelfStateSnapshot(sequencedInput);
    this.send(
      createInputMessage({
        matchId,
        charge: sequencedInput.charge,
        direction: sequencedInput.direction,
        elapsedMs: sequencedInput.elapsedMs,
        phase: sequencedInput.phase,
        seq: sequencedInput.seq,
        sentAt: sequencedInput.sentAt,
        status: sequencedInput.status,
      }),
    );
  }

  reportHomeworldState(homeworld: HomeworldState) {
    this.patchSnapshot({ homeworldState: homeworld });
    this.send(createHomeworldStateMessage(homeworld));
  }

  reportHomeworldPresence(presence: HomeworldPresence) {
    const current = this.snapshot.selfHomeworldPresence;
    if (
      current?.action === presence.action &&
      current?.direction === presence.direction &&
      current?.displayName === presence.displayName &&
      current?.skinId === presence.skinId &&
      current?.x === presence.x &&
      current?.y === presence.y
    ) {
      return;
    }
    this.patchSnapshot({ selfHomeworldPresence: presence });
    this.send(createHomeworldPresenceMessage(presence));
  }

  reportLevelSelectState(selection: MultiplayerLevelSelectState) {
    this.patchSnapshot({ levelSelectState: selection, selfReady: false, opponentReady: false });
    this.send(createLevelSelectStateMessage(selection));
    this.send(createReadyMessage(false));
  }

  reportLevelSelectPresence(presence: MultiplayerLevelSelectPresence) {
    const current = this.snapshot.selfLevelSelectPresence;
    if (
      current?.action === presence.action &&
      current?.inRoom === presence.inRoom &&
      current?.direction === presence.direction &&
      current?.readyToStart === presence.readyToStart &&
      current?.skinId === presence.skinId &&
      current?.x === presence.x
    ) {
      return;
    }
    this.patchSnapshot({ selfLevelSelectPresence: presence });
    this.send(createLevelSelectPresenceMessage(presence));
  }

  reportRoomScore(score: MultiplayerRoomScore) {
    const nextScore: MultiplayerRoomScore = {
      hostWins: Math.max(0, Math.round(score.hostWins)),
      guestWins: Math.max(0, Math.round(score.guestWins)),
      ...(score.lastMatchId ? { lastMatchId: score.lastMatchId } : {}),
    };
    const current = this.snapshot.roomScore;
    if (
      current?.hostWins === nextScore.hostWins &&
      current?.guestWins === nextScore.guestWins &&
      current?.lastMatchId === nextScore.lastMatchId
    ) {
      return;
    }
    this.patchSnapshot({ roomScore: nextScore });
    this.send(createRoomScoreMessage(nextScore));
  }

  forfeit() {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    this.send(createForfeitMessage(matchId));
    this.settleForfeit("self");
  }

  requestRematch() {
    const matchId = this.currentMatchId();
    if (!this.transport || !matchId || this.snapshot.status !== "finished") return;
    this.patchSnapshot({ selfReady: true, errorMessage: null });
    this.send(createRematchMessage(matchId));
    this.tryStartRematch();
  }

  returnToRoom() {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    this.send(createReturnRoomMessage(matchId));
    this.resetRound();
  }

  sendReaction(reaction: MultiplayerReactionKind) {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    const sentAt = now();
    this.appendReaction({
      id: `self:${sentAt}:${Math.random().toString(36).slice(2)}`,
      from: "self",
      kind: reaction,
      sentAt,
    });
    this.send(createReactionMessage({ matchId, reaction, sentAt }));
  }

  leave(reason?: string) {
    this.transport?.close(reason);
    this.transport = null;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.stopPeerPresence();
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.remoteTimeOffsetMs = null;
    this.patchSnapshot({
      status: "idle",
      connectionState: "idle",
      errorMessage: null,
      selfReady: false,
      opponentReady: false,
      match: null,
      countdown: null,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      opponentPlayer: null,
      opponentJoining: false,
      homeworldState: null,
      selfHomeworldPresence: null,
      opponentHomeworldPresence: null,
      levelSelectState: null,
      selfLevelSelectPresence: null,
      opponentLevelSelectPresence: null,
      roomScore: null,
    });
  }

  dispose() {
    this.transport?.dispose();
    this.transport = null;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.stopPeerPresence();
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.remoteTimeOffsetMs = null;
  }

  private currentMatchId() {
    return this.snapshot.match?.matchId ?? null;
  }

  private currentTiebreakerRound() {
    return Math.max(0, Math.round(this.snapshot.match?.tiebreakerRound ?? 0));
  }

  private isCurrentResultMessage(message: { matchId: string; tiebreakerRound?: number }) {
    return this.isCurrentMatchMessage(message) && Math.max(0, Math.round(message.tiebreakerRound ?? 0)) === this.currentTiebreakerRound();
  }

  private canUsePeerConnection() {
    return this.snapshot.connectionState === "connected" && this.transport?.isConnected === true;
  }

  private currentMatchIsKnife() {
    return this.snapshot.match?.levelId.startsWith("knife") === true;
  }

  private isCurrentMatchMessage(message: { matchId: string }) {
    return this.currentMatchId() === message.matchId;
  }

  private send(message: NetMessage) {
    this.transport?.send(message);
  }

  private appendReaction(reaction: MultiplayerReactionEvent) {
    this.patchSnapshot({
      reactions: [...this.snapshot.reactions, reaction].slice(-8),
    });
  }

  private sendCurrentRoomSnapshots() {
    if (this.snapshot.homeworldState) {
      this.send(createHomeworldStateMessage(this.snapshot.homeworldState));
    }
    if (this.snapshot.selfHomeworldPresence) {
      this.send(createHomeworldPresenceMessage(this.snapshot.selfHomeworldPresence));
    }
    if (this.snapshot.levelSelectState) {
      this.send(createLevelSelectStateMessage(this.snapshot.levelSelectState));
    }
    if (this.snapshot.selfLevelSelectPresence) {
      this.send(createLevelSelectPresenceMessage(this.snapshot.selfLevelSelectPresence));
    }
    if (this.snapshot.roomScore) {
      this.send(createRoomScoreMessage(this.snapshot.roomScore));
    }
  }

  private handleMessage(message: NetMessage) {
    this.notePeerMessage();
    switch (message.kind) {
      case "hello":
        this.patchSnapshot({ opponentJoining: false, opponentPlayer: message.player });
        this.sendCurrentRoomSnapshots();
        break;
      case "heartbeat":
        break;
      case "ready":
        this.patchSnapshot({ opponentReady: message.ready });
        this.maybeStartMatch();
        break;
      case "homeworld-state":
        this.patchSnapshot({ homeworldState: message.homeworld });
        break;
      case "homeworld-presence":
        this.patchSnapshot({ opponentHomeworldPresence: message.presence });
        break;
      case "level-select-presence":
        this.patchSnapshot({ opponentLevelSelectPresence: message.presence });
        break;
      case "level-select-state":
        this.patchSnapshot({ levelSelectState: message.selection, selfReady: false, opponentReady: false });
        break;
      case "room-score":
        this.patchSnapshot({ roomScore: message.score });
        break;
      case "start":
        this.acceptStartMessage(message);
        break;
      case "state":
        if (!this.isCurrentMatchMessage(message)) return;
        if (typeof message.seq === "number" && message.seq <= this.opponentStateSeq) {
          this.opponentStateDroppedOldPackets += 1;
          return;
        }
        if (typeof message.seq === "number") this.opponentStateSeq = message.seq;
        {
          const receivedAt = performanceNow();
          const opponentState: SelfGameState = {
            matchId: message.matchId,
            cameraX: message.cameraX,
            cameraY: message.cameraY,
            cameraScale: message.cameraScale,
            charge: message.charge,
            vx: message.vx,
            vy: message.vy,
            direction: message.direction,
            exitingPlatformIndex: message.exitingPlatformIndex,
            exitingPlatformOffsetY: message.exitingPlatformOffsetY,
            elapsedMs: message.elapsedMs,
            failures: message.failures,
            gravity: message.gravity,
            nextPlatformIndex: message.nextPlatformIndex,
            nextPlatformOffsetY: message.nextPlatformOffsetY,
            phase: message.phase,
            platformIndex: message.platformIndex,
            turns: message.turns,
            progress: message.progress,
            score: message.score,
            seq: message.seq,
            sentAt: message.sentAt,
            receivedAt,
            remoteTimeOffsetMs: this.remoteTimeOffsetMs ?? undefined,
            status: message.status,
            type: message.type,
            t: message.t,
            angle: message.angle,
            anim: message.anim,
            x: message.x,
            y: message.y,
            screenX: message.screenX,
            screenY: message.screenY,
            usedPlatformIds: message.usedPlatformIds,
            knifeInsertedAngles: message.knifeInsertedAngles,
            knifeFailedAngles: message.knifeFailedAngles,
            knifeShotIndex: message.knifeShotIndex,
            knifeTimer: message.knifeTimer,
            knifeTimedOutThisShot: message.knifeTimedOutThisShot,
            knifeOvertime: message.knifeOvertime,
            knifeWinnerRole: message.knifeWinnerRole,
            knifeHostHits: message.knifeHostHits,
            knifeGuestHits: message.knifeGuestHits,
            knifeHostTimeouts: message.knifeHostTimeouts,
            knifeGuestTimeouts: message.knifeGuestTimeouts,
            knifeHostCollisions: message.knifeHostCollisions,
            knifeGuestCollisions: message.knifeGuestCollisions,
            knifeHostDangerHits: message.knifeHostDangerHits,
            knifeGuestDangerHits: message.knifeGuestDangerHits,
            aimHits: message.aimHits,
            aimMisses: message.aimMisses,
            aimFlyOuts: message.aimFlyOuts,
            aimDecoyHits: message.aimDecoyHits,
            aimTargetCount: message.aimTargetCount,
          };
          this.opponentStateAcceptedPackets += 1;
          this.lastOpponentStateAcceptedAt = now();
          this.emitOpponentState(opponentState);
          this.syncOpponentStateSnapshot(opponentState);
        }
        break;
      case "result":
        if (!this.isCurrentResultMessage(message)) return;
        {
          const opponentResult: GameResult = {
            matchId: message.matchId,
            score: message.score,
            passed: message.passed,
            tiebreakerRound: Math.max(0, Math.round(message.tiebreakerRound ?? 0)),
            timeMs: message.timeMs,
            breakdown: message.breakdown,
          };
          if (this.snapshot.match?.playMode === "co-op") {
            this.patchSnapshot({
              opponentResult,
              selfResult: this.snapshot.selfResult ?? opponentResult,
            });
            this.tryFinishSession();
            break;
          }
          this.patchSnapshot({
            opponentResult,
          });
          this.tryFinishSession();
        }
        break;
      case "input":
        if (!this.isCurrentMatchMessage(message)) return;
        if (typeof message.seq === "number" && message.seq <= this.opponentStateSeq) {
          this.opponentStateDroppedOldPackets += 1;
          return;
        }
        if (typeof message.seq === "number") this.opponentStateSeq = message.seq;
        {
          const opponentInput: SelfGameState = {
            matchId: message.matchId,
            charge: message.charge,
            direction: message.direction,
            elapsedMs: message.elapsedMs,
            phase: message.phase,
            progress: 0,
            score: 0,
            seq: message.seq,
            sentAt: message.sentAt,
            status: message.status ?? "playing",
          };
          this.opponentStateAcceptedPackets += 1;
          this.lastOpponentStateAcceptedAt = now();
          this.emitOpponentState(opponentInput);
          this.syncOpponentStateSnapshot(opponentInput);
        }
        break;
      case "forfeit":
        if (!this.isCurrentMatchMessage(message)) return;
        this.settleForfeit("opponent");
        break;
      case "rematch":
        if (!this.isCurrentMatchMessage(message)) return;
        this.patchSnapshot({ opponentReady: true });
        this.tryStartRematch();
        break;
      case "return-room":
        if (!this.isCurrentMatchMessage(message)) return;
        this.resetRound();
        break;
      case "tiebreaker":
        if (!this.isCurrentMatchMessage(message)) return;
        this.applyAimTiebreaker(message.round);
        break;
      case "reaction":
        if (!this.isCurrentMatchMessage(message)) return;
        this.appendReaction({
          id: `opponent:${message.sentAt}:${message.reaction}`,
          from: "opponent",
          kind: message.reaction,
          sentAt: message.sentAt,
        });
        break;
      case "bye":
        if (this.role === "host") {
          this.resetHostWaitingState();
        } else {
          this.stopCountdown();
          this.stopOpponentStateSnapshotTimer();
          this.stopSelfStateSnapshotTimer();
          this.stopPeerPresence();
          this.patchSnapshot({
            status: "disconnected",
            connectionState: "closed",
            errorMessage: message.reason || MULTIPLAYER_DISCONNECTED_MESSAGE,
            match: null,
            countdown: null,
            selfState: null,
            opponentPlayer: null,
            opponentJoining: false,
            opponentState: null,
            selfResult: null,
            opponentResult: null,
            homeworldState: null,
            selfHomeworldPresence: null,
            opponentHomeworldPresence: null,
            levelSelectState: null,
            selfLevelSelectPresence: null,
            opponentLevelSelectPresence: null,
            roomScore: null,
            opponentReady: false,
          });
        }
        break;
      default:
        break;
    }
  }

  private resetRound() {
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.patchSnapshot({
      status: "connected",
      connectionState: "connected",
      errorMessage: null,
      selfReady: false,
      opponentReady: false,
      match: null,
      countdown: null,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      reactions: [],
      opponentJoining: false,
    });
  }

  private settleForfeit(source: "self" | "opponent") {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    const level = resolveMultiplayerLevelSelection(this.snapshot.match?.levelId);
    this.patchSnapshot({
      status: "finished",
      countdown: null,
      selfReady: false,
      opponentReady: false,
      selfResult: buildForfeitResult(level, {
        didForfeit: source === "self",
        matchId,
        state: this.snapshot.selfState,
      }),
      opponentResult: buildForfeitResult(level, {
        didForfeit: source === "opponent",
        matchId,
        state: this.snapshot.opponentState,
      }),
    });
  }

  private resetHostWaitingState(errorMessage: string | null = null) {
    const currentHomeworldPresence = this.snapshot.selfHomeworldPresence;
    const currentHomeworldState = this.snapshot.homeworldState;
    const currentLevelSelectPresence = this.snapshot.selfLevelSelectPresence;
    const currentLevelSelectState = this.snapshot.levelSelectState;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.stopPeerPresence();
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.patchSnapshot({
      status: "waiting",
      connectionState: "signaling",
      errorMessage,
      selfReady: false,
      opponentReady: false,
      match: null,
      countdown: null,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      opponentPlayer: null,
      opponentJoining: false,
      homeworldState: currentHomeworldState,
      selfHomeworldPresence: currentHomeworldPresence,
      opponentHomeworldPresence: null,
      levelSelectState: currentLevelSelectState,
      selfLevelSelectPresence: currentLevelSelectPresence,
      opponentLevelSelectPresence: null,
      roomScore: null,
    });
  }

  private acceptStartMessage(message: Extract<NetMessage, { kind: "start" }>) {
    const receivedAt = now();
    const syncedCountdownMs = Math.max(0, message.startAt - message.sentAt);
    const localStartAt = receivedAt + syncedCountdownMs;
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    const match: MatchConfig = {
      matchId: message.matchId,
      levelId: message.levelId,
      playMode: resolveMultiplayerPlayMode(message.playMode),
      seed: message.seed,
      logicWidth: message.logicWidth,
      logicHeight: message.logicHeight,
      startAt: localStartAt,
    };
    this.patchSnapshot({
      match,
      status: "countdown",
      countdown: { startAt: match.startAt, remainMs: Math.max(0, match.startAt - now()) },
      selfReady: false,
      opponentReady: false,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      reactions: [],
    });
    this.startCountdownTick();
  }

  private maybeStartMatch() {
    const { selfReady, opponentReady, status } = this.snapshot;
    if (this.role !== "host") return;
    if (status !== "connected") return;
    if (!selfReady || !opponentReady) return;
    if (!this.snapshot.match) return;
  }

  private tryStartRematch() {
    const { match, opponentReady, selfReady, status } = this.snapshot;
    if (this.role !== "host") return;
    if (status !== "finished") return;
    if (!match || !selfReady || !opponentReady) return;
    this.startMatch({
      levelId: match.levelId,
      playMode: match.playMode,
      seed: createRematchSeed(match.seed),
      logicWidth: match.logicWidth,
      logicHeight: match.logicHeight,
      countdownMs: REMATCH_COUNTDOWN_MS,
    });
  }

  private applyAimTiebreaker(round: number) {
    const match = this.snapshot.match;
    if (!match) return;
    const nextRound = Math.max(0, Math.round(round));
    if (nextRound <= this.currentTiebreakerRound()) return;
    this.patchSnapshot({
      status: "playing",
      countdown: null,
      match: {
        ...match,
        tiebreakerRound: nextRound,
      },
      selfResult: null,
      opponentResult: null,
    });
  }

  private startAimTiebreaker() {
    const match = this.snapshot.match;
    if (!match) return;
    const nextRound = this.currentTiebreakerRound() + 1;
    this.applyAimTiebreaker(nextRound);
    this.send(createTiebreakerMessage({
      matchId: match.matchId,
      round: nextRound,
      sentAt: now(),
    }));
  }

  private tryFinishSession() {
    if (!this.snapshot.selfResult || !this.snapshot.opponentResult) return;
    if (this.snapshot.match) {
      const level = resolveMultiplayerLevelSelection(this.snapshot.match.levelId);
      if (shouldStartMultiplayerTiebreaker(level, this.snapshot.selfResult, this.snapshot.opponentResult, this.snapshot.match.playMode)) {
        if (level.gameId === "aim") {
          const nextRound = this.currentTiebreakerRound() + 1;
          if (this.role === "host") {
            this.startAimTiebreaker();
          } else {
            this.applyAimTiebreaker(nextRound);
          }
          return;
        }
      }
    }
    this.patchSnapshot({
      status: "finished",
      countdown: null,
      selfReady: false,
      opponentReady: false,
    });
  }

  private startPeerPresence() {
    this.stopPeerPresence();
    this.lastPeerMessageAt = now();
    this.heartbeatTimer = window.setInterval(() => {
      this.send(createHeartbeatMessage(now()));
      this.checkPeerStale();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopPeerPresence() {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.lastPeerMessageAt = null;
  }

  private notePeerMessage() {
    this.lastPeerMessageAt = now();
    const connectionRecovered =
      (this.snapshot.connectionState === "stale" || this.snapshot.connectionState === "reconnecting") &&
      this.transport?.isConnected === true;
    if (
      (this.snapshot.errorMessage && this.snapshot.connectionState === "connected") ||
      connectionRecovered
    ) {
      this.patchSnapshot({ connectionState: "connected", errorMessage: null });
    }
  }

  private checkPeerStale() {
    if (this.lastPeerMessageAt === null) return;
    if (now() - this.lastPeerMessageAt <= PEER_STALE_MS) return;
    this.markPeerTemporarilyStale();
  }

  private markPeerTemporarilyStale(message = MULTIPLAYER_RECONNECTING_MESSAGE) {
    this.stopCountdown();
    this.patchSnapshot({
      connectionState: "stale",
      errorMessage: message,
      selfReady: false,
      opponentReady: false,
      countdown: null,
    });
  }

  private preserveRoomAfterConnectionIssue(message: string) {
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.patchSnapshot({
      status: this.snapshot.opponentPlayer ? "connected" : this.role === "host" ? "waiting" : "disconnected",
      connectionState: "reconnecting",
      errorMessage: message,
      selfReady: false,
      match: null,
      countdown: null,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      opponentJoining: false,
      homeworldState: this.snapshot.homeworldState,
      opponentReady: false,
    });
  }

  private markSessionReplaced() {
    this.transport = null;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.stopPeerPresence();
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.remoteTimeOffsetMs = null;
    this.patchSnapshot({
      status: "disconnected",
      connectionState: "replaced",
      errorMessage: "same-role-replaced",
      selfReady: false,
      opponentReady: false,
      match: null,
      countdown: null,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      opponentPlayer: null,
      opponentJoining: false,
      opponentHomeworldPresence: null,
      opponentLevelSelectPresence: null,
      roomScore: null,
    });
  }

  private terminateRoomSession(message: string) {
    this.transport?.dispose();
    this.transport = null;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopSelfStateSnapshotTimer();
    this.stopPeerPresence();
    this.pendingOpponentStateSnapshot = null;
    this.pendingSelfStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.lastSelfStateSnapshotAt = 0;
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.remoteTimeOffsetMs = null;
    this.patchSnapshot({
      status: "disconnected",
      connectionState: "closed",
      errorMessage: message,
      selfReady: false,
      opponentReady: false,
      match: null,
      countdown: null,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      opponentPlayer: null,
      opponentJoining: false,
      homeworldState: null,
      selfHomeworldPresence: null,
      opponentHomeworldPresence: null,
      levelSelectState: null,
      selfLevelSelectPresence: null,
      opponentLevelSelectPresence: null,
      roomScore: null,
      reactions: [],
    });
  }

  private startCountdownTick() {
    this.stopCountdown();
    const tick = () => {
      const countdown = this.snapshot.countdown;
      if (!countdown) return;
      const remainMs = Math.max(0, countdown.startAt - now());
      const nextCountdown: CountdownState = {
        startAt: countdown.startAt,
        remainMs,
      };
      if (remainMs <= 0) {
        this.patchSnapshot({ countdown: null, status: "playing" });
        this.stopCountdown();
        return;
      }
      this.patchSnapshot({ countdown: nextCountdown });
      this.countdownTimer = window.setTimeout(tick, COUNTDOWN_TICK_MS);
    };
    this.countdownTimer = window.setTimeout(tick, COUNTDOWN_TICK_MS);
  }

  private stopCountdown() {
    if (this.countdownTimer === null) return;
    window.clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
  }

  private emitOpponentState(state: SelfGameState) {
    for (const listener of this.opponentStateListeners) {
      listener(state);
    }
  }

  private syncOpponentStateSnapshot(state: SelfGameState) {
    if (this.currentMatchIsKnife() && state.status === "playing") return;
    const currentTime = now();
    const shouldForcePublish = state.status !== "playing";
    if (shouldForcePublish || currentTime - this.lastOpponentStateSnapshotAt >= OPPONENT_STATE_SNAPSHOT_SYNC_MS) {
      this.lastOpponentStateSnapshotAt = currentTime;
      this.pendingOpponentStateSnapshot = null;
      this.stopOpponentStateSnapshotTimer();
      this.patchSnapshot({ opponentState: state });
      return;
    }
    this.pendingOpponentStateSnapshot = state;
    if (this.opponentStateSnapshotTimer !== null) return;
    const waitMs = Math.max(0, OPPONENT_STATE_SNAPSHOT_SYNC_MS - (currentTime - this.lastOpponentStateSnapshotAt));
    this.opponentStateSnapshotTimer = window.setTimeout(() => {
      this.opponentStateSnapshotTimer = null;
      if (!this.pendingOpponentStateSnapshot) return;
      this.lastOpponentStateSnapshotAt = now();
      const snapshotState = this.pendingOpponentStateSnapshot;
      this.pendingOpponentStateSnapshot = null;
      this.patchSnapshot({ opponentState: snapshotState });
    }, waitMs);
  }

  private syncSelfStateSnapshot(state: SelfGameState) {
    if (this.currentMatchIsKnife() && state.status === "playing") return;
    const currentTime = now();
    const shouldForcePublish = state.status !== "playing";
    if (shouldForcePublish || currentTime - this.lastSelfStateSnapshotAt >= SELF_STATE_SNAPSHOT_SYNC_MS) {
      this.lastSelfStateSnapshotAt = currentTime;
      this.pendingSelfStateSnapshot = null;
      this.stopSelfStateSnapshotTimer();
      this.patchSnapshot({ selfState: state });
      return;
    }
    this.pendingSelfStateSnapshot = state;
    if (this.selfStateSnapshotTimer !== null) return;
    const waitMs = Math.max(0, SELF_STATE_SNAPSHOT_SYNC_MS - (currentTime - this.lastSelfStateSnapshotAt));
    this.selfStateSnapshotTimer = window.setTimeout(() => {
      this.selfStateSnapshotTimer = null;
      if (!this.pendingSelfStateSnapshot) return;
      this.lastSelfStateSnapshotAt = now();
      const snapshotState = this.pendingSelfStateSnapshot;
      this.pendingSelfStateSnapshot = null;
      this.patchSnapshot({ selfState: snapshotState });
    }, waitMs);
  }

  private stopOpponentStateSnapshotTimer() {
    if (this.opponentStateSnapshotTimer === null) return;
    window.clearTimeout(this.opponentStateSnapshotTimer);
    this.opponentStateSnapshotTimer = null;
  }

  private stopSelfStateSnapshotTimer() {
    if (this.selfStateSnapshotTimer === null) return;
    window.clearTimeout(this.selfStateSnapshotTimer);
    this.selfStateSnapshotTimer = null;
  }

  private patchSnapshot(patch: Partial<MultiplayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }
}
