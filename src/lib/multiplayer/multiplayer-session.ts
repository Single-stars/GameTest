"use client";

import {
  createByeMessage,
  createForfeitMessage,
  createHeartbeatMessage,
  createHelloMessage,
  createHomeworldPresenceMessage,
  createHomeworldStateMessage,
  createLevelSelectPresenceMessage,
  createLevelSelectStateMessage,
  createReadyMessage,
  createRematchMessage,
  createResultMessage,
  createReturnRoomMessage,
  createStateMessage,
} from "@/lib/multiplayer/messages";
import {
  MULTIPLAYER_DISCONNECTED_MESSAGE,
  MULTIPLAYER_FAILED_MESSAGE,
  RoomSignalTransport,
} from "@/lib/multiplayer/webrtc-transport";
import type {
  CountdownState,
  GameResult,
  MatchConfig,
  MultiplayerSnapshot,
  NetMessage,
  PlayerInfo,
  SelfGameState,
  SessionRole,
} from "@/lib/multiplayer/types";
import type {
  HomeworldPresence,
  HomeworldState,
} from "@/features/homeworld/homeworld-state";
import {
  resolveMultiplayerPlayMode,
  type MultiplayerLevelSelectPresence,
  type MultiplayerLevelSelectState,
} from "@/lib/multiplayer/level-select";

const COUNTDOWN_TICK_MS = 100;
const OPPONENT_STATE_SNAPSHOT_SYNC_MS = 100;
const REMATCH_COUNTDOWN_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 2_000;
const PEER_STALE_MS = 9_000;

function now() {
  return Date.now();
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
    role: null,
    roomId: null,
    selfPlayer: null,
    opponentPlayer: null,
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
  private selfStateSeq = 0;
  private opponentStateSeq = -1;
  private lastOpponentStateSnapshotAt = 0;
  private pendingOpponentStateSnapshot: SelfGameState | null = null;
  private readonly opponentStateListeners = new Set<(state: SelfGameState) => void>();
  private opponentStateAcceptedPackets = 0;
  private opponentStateDroppedOldPackets = 0;
  private lastOpponentStateAcceptedAt: number | null = null;
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
    this.transport = new RoomSignalTransport({
      role: this.role,
      roomId: this.targetRoomId,
      events: {
        onPeerOpen: (roomCode) => {
          this.patchSnapshot({
            roomId: roomCode,
            status: this.role === "host" ? "waiting" : "joining",
          });
        },
        onConnected: () => {
          const currentHomeworldPresence = this.snapshot.selfHomeworldPresence;
          const currentHomeworldState = this.snapshot.homeworldState;
          const currentLevelSelectPresence = this.snapshot.selfLevelSelectPresence;
          const currentLevelSelectState = this.snapshot.levelSelectState;
          this.stopCountdown();
          this.stopOpponentStateSnapshotTimer();
          this.pendingOpponentStateSnapshot = null;
          this.lastOpponentStateSnapshotAt = 0;
          this.selfStateSeq = 0;
          this.opponentStateSeq = -1;
          this.notePeerMessage();
          this.startPeerPresence();
          this.patchSnapshot({
            status: "connected",
            errorMessage: null,
            selfReady: false,
            opponentReady: false,
            match: null,
            countdown: null,
            selfState: null,
            opponentPlayer: null,
            opponentState: null,
            selfResult: null,
            opponentResult: null,
            homeworldState: currentHomeworldState,
            selfHomeworldPresence: currentHomeworldPresence,
            opponentHomeworldPresence: null,
            levelSelectState: currentLevelSelectState,
            selfLevelSelectPresence: currentLevelSelectPresence,
            opponentLevelSelectPresence: null,
          });
          this.send(createHelloMessage(this.selfPlayer));
          this.sendCurrentRoomSnapshots();
        },
        onPeerDisconnected: (message) => {
          void message;
          if (this.role !== "host") return;
          this.resetHostWaitingState();
        },
        onMessage: (message) => this.handleMessage(message),
        onFailed: (message) => {
          this.stopCountdown();
          this.stopOpponentStateSnapshotTimer();
          this.stopPeerPresence();
          this.pendingOpponentStateSnapshot = null;
          this.patchSnapshot({
            status: "failed",
            errorMessage: message || MULTIPLAYER_FAILED_MESSAGE,
            match: null,
            countdown: null,
            selfState: null,
            opponentPlayer: null,
            opponentState: null,
            selfResult: null,
            opponentResult: null,
            homeworldState: null,
            selfHomeworldPresence: null,
            opponentHomeworldPresence: null,
            levelSelectState: null,
            selfLevelSelectPresence: null,
            opponentLevelSelectPresence: null,
            opponentReady: false,
          });
        },
        onDisconnected: (message) => {
          this.stopCountdown();
          this.stopOpponentStateSnapshotTimer();
          this.stopPeerPresence();
          this.pendingOpponentStateSnapshot = null;
          this.patchSnapshot({
            status: "disconnected",
            errorMessage: message || MULTIPLAYER_DISCONNECTED_MESSAGE,
            match: null,
            countdown: null,
            selfState: null,
            opponentPlayer: null,
            opponentState: null,
            selfResult: null,
            opponentResult: null,
            homeworldState: null,
            opponentHomeworldPresence: null,
            levelSelectState: null,
            opponentLevelSelectPresence: null,
            opponentReady: false,
          });
        },
      },
    });

    await this.transport.start();
  }

  setReady(ready: boolean) {
    this.patchSnapshot({ selfReady: ready });
    this.send(createReadyMessage(ready));
    this.maybeStartMatch();
  }

  updateSelfPlayerProfile(patch: Pick<PlayerInfo, "skinId"> | Pick<PlayerInfo, "name"> | Pick<PlayerInfo, "name" | "skinId">) {
    this.selfPlayer = { ...this.selfPlayer, ...patch };
    this.patchSnapshot({ selfPlayer: this.selfPlayer });
    this.send(createHelloMessage(this.selfPlayer));
  }

  startMatch(config: Omit<MatchConfig, "matchId" | "startAt"> & { countdownMs: number; matchId?: string }) {
    if (this.role !== "host") return;
    const sentAt = now();
    const startAt = sentAt + config.countdownMs;
    this.stopOpponentStateSnapshotTimer();
    this.pendingOpponentStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
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
    };
    this.selfStateSeq += 1;
    this.patchSnapshot({ selfState: sequencedState });
    this.send(
      createStateMessage({
        matchId,
        cameraY: sequencedState.cameraY,
        vx: sequencedState.vx,
        vy: sequencedState.vy,
        direction: sequencedState.direction,
        elapsedMs: sequencedState.elapsedMs,
        failures: sequencedState.failures,
        progress: sequencedState.progress,
        score: sequencedState.score,
        seq: sequencedState.seq,
        sentAt: sequencedState.sentAt,
        status: sequencedState.status,
        x: sequencedState.x,
        y: sequencedState.y,
      }),
    );
  }

  reportResult(result: GameResult) {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    const matchedResult: GameResult = { ...result, matchId };
    this.patchSnapshot({ selfResult: matchedResult });
    this.send(createResultMessage({ ...matchedResult, matchId }));
    this.tryFinishSession();
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

  leave(reason?: string) {
    this.transport?.send(createByeMessage(reason));
    this.transport?.dispose();
    this.transport = null;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopPeerPresence();
    this.pendingOpponentStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.patchSnapshot({
      status: "idle",
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
      homeworldState: null,
      selfHomeworldPresence: null,
      opponentHomeworldPresence: null,
      levelSelectState: null,
      selfLevelSelectPresence: null,
      opponentLevelSelectPresence: null,
    });
  }

  dispose() {
    this.transport?.dispose();
    this.transport = null;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopPeerPresence();
    this.pendingOpponentStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
  }

  private currentMatchId() {
    return this.snapshot.match?.matchId ?? null;
  }

  private isCurrentMatchMessage(message: { matchId: string }) {
    return this.currentMatchId() === message.matchId;
  }

  private send(message: NetMessage) {
    this.transport?.send(message);
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
  }

  private handleMessage(message: NetMessage) {
    this.notePeerMessage();
    switch (message.kind) {
      case "hello":
        this.patchSnapshot({ opponentPlayer: message.player });
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
          const opponentState: SelfGameState = {
            matchId: message.matchId,
            cameraY: message.cameraY,
            vx: message.vx,
            vy: message.vy,
            direction: message.direction,
            elapsedMs: message.elapsedMs,
            failures: message.failures,
            progress: message.progress,
            score: message.score,
            seq: message.seq,
            sentAt: message.sentAt,
            status: message.status,
            x: message.x,
            y: message.y,
          };
          this.opponentStateAcceptedPackets += 1;
          this.lastOpponentStateAcceptedAt = now();
          this.emitOpponentState(opponentState);
          this.syncOpponentStateSnapshot(opponentState);
        }
        break;
      case "result":
        if (!this.isCurrentMatchMessage(message)) return;
        this.patchSnapshot({
          opponentResult: {
            matchId: message.matchId,
            score: message.score,
            passed: message.passed,
            timeMs: message.timeMs,
          },
        });
        this.tryFinishSession();
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
      case "bye":
        if (this.role === "host") {
          this.resetHostWaitingState();
        } else {
          this.stopCountdown();
          this.stopOpponentStateSnapshotTimer();
          this.stopPeerPresence();
          this.patchSnapshot({
            status: "disconnected",
            errorMessage: message.reason || MULTIPLAYER_DISCONNECTED_MESSAGE,
            match: null,
            countdown: null,
            selfState: null,
            opponentPlayer: null,
            opponentState: null,
            selfResult: null,
            opponentResult: null,
            homeworldState: null,
            selfHomeworldPresence: null,
            opponentHomeworldPresence: null,
            levelSelectState: null,
            selfLevelSelectPresence: null,
            opponentLevelSelectPresence: null,
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
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.lastOpponentStateSnapshotAt = 0;
    this.pendingOpponentStateSnapshot = null;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.patchSnapshot({
      status: "connected",
      errorMessage: null,
      selfReady: false,
      opponentReady: false,
      match: null,
      countdown: null,
      selfState: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
    });
  }

  private settleForfeit(source: "self" | "opponent") {
    const matchId = this.currentMatchId();
    if (!matchId) return;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    const selfPassed = source === "opponent";
    this.patchSnapshot({
      status: "finished",
      countdown: null,
      selfReady: false,
      opponentReady: false,
      selfResult: {
        matchId,
        passed: selfPassed,
        score: selfPassed ? Math.round(this.snapshot.selfState?.score ?? 0) : 0,
      },
      opponentResult: {
        matchId,
        passed: !selfPassed,
        score: !selfPassed ? Math.round(this.snapshot.opponentState?.score ?? 0) : 0,
      },
    });
  }

  private resetHostWaitingState() {
    const currentHomeworldPresence = this.snapshot.selfHomeworldPresence;
    const currentHomeworldState = this.snapshot.homeworldState;
    const currentLevelSelectPresence = this.snapshot.selfLevelSelectPresence;
    const currentLevelSelectState = this.snapshot.levelSelectState;
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopPeerPresence();
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
    this.lastOpponentStateSnapshotAt = 0;
    this.pendingOpponentStateSnapshot = null;
    this.opponentStateAcceptedPackets = 0;
    this.opponentStateDroppedOldPackets = 0;
    this.lastOpponentStateAcceptedAt = null;
    this.patchSnapshot({
      status: "waiting",
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
      homeworldState: currentHomeworldState,
      selfHomeworldPresence: currentHomeworldPresence,
      opponentHomeworldPresence: null,
      levelSelectState: currentLevelSelectState,
      selfLevelSelectPresence: currentLevelSelectPresence,
      opponentLevelSelectPresence: null,
    });
  }

  private acceptStartMessage(message: Extract<NetMessage, { kind: "start" }>) {
    const receivedAt = now();
    const syncedCountdownMs = Math.max(0, message.startAt - message.sentAt);
    const localStartAt = receivedAt + syncedCountdownMs;
    this.stopOpponentStateSnapshotTimer();
    this.pendingOpponentStateSnapshot = null;
    this.lastOpponentStateSnapshotAt = 0;
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

  private tryFinishSession() {
    if (!this.snapshot.selfResult || !this.snapshot.opponentResult) return;
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
  }

  private checkPeerStale() {
    if (this.lastPeerMessageAt === null) return;
    if (now() - this.lastPeerMessageAt <= PEER_STALE_MS) return;
    this.transport?.disconnectActiveConnection();
    if (this.role === "host") {
      this.resetHostWaitingState();
      return;
    }
    this.stopCountdown();
    this.stopOpponentStateSnapshotTimer();
    this.stopPeerPresence();
    this.pendingOpponentStateSnapshot = null;
    this.patchSnapshot({
      status: "disconnected",
      errorMessage: MULTIPLAYER_DISCONNECTED_MESSAGE,
      match: null,
      countdown: null,
      selfState: null,
      opponentPlayer: null,
      opponentState: null,
      selfResult: null,
      opponentResult: null,
      homeworldState: null,
      selfHomeworldPresence: null,
      opponentHomeworldPresence: null,
      levelSelectState: null,
      selfLevelSelectPresence: null,
      opponentLevelSelectPresence: null,
      opponentReady: false,
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

  private stopOpponentStateSnapshotTimer() {
    if (this.opponentStateSnapshotTimer === null) return;
    window.clearTimeout(this.opponentStateSnapshotTimer);
    this.opponentStateSnapshotTimer = null;
  }

  private patchSnapshot(patch: Partial<MultiplayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }
}
