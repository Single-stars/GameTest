"use client";

import {
  createByeMessage,
  createHelloMessage,
  createReadyMessage,
  createRematchMessage,
  createResultMessage,
  createStateMessage,
} from "@/lib/multiplayer/messages";
import {
  MULTIPLAYER_DISCONNECTED_MESSAGE,
  MULTIPLAYER_FAILED_MESSAGE,
  PeerTransport,
  type PeerTransportOptions,
} from "@/lib/multiplayer/peer-transport";
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

const COUNTDOWN_TICK_MS = 100;

function now() {
  return Date.now();
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
    errorMessage: null,
  };
}

export type SessionOptions = {
  role: SessionRole;
  roomId?: string | null;
  selfPlayer: PlayerInfo;
  onChange: (snapshot: MultiplayerSnapshot) => void;
  peerOptions?: PeerTransportOptions["peerOptions"];
};

export class MultiplayerSession {
  private snapshot: MultiplayerSnapshot = buildInitialSnapshot();
  private transport: PeerTransport | null = null;
  private readonly onChange: (snapshot: MultiplayerSnapshot) => void;
  private readonly selfPlayer: PlayerInfo;
  private readonly role: SessionRole;
  private readonly targetRoomId: string | null;
  private readonly peerOptions?: PeerTransportOptions["peerOptions"];
  private countdownTimer: number | null = null;
  private selfStateSeq = 0;
  private opponentStateSeq = -1;

  constructor(options: SessionOptions) {
    this.onChange = options.onChange;
    this.selfPlayer = options.selfPlayer;
    this.role = options.role;
    this.targetRoomId = options.roomId ?? null;
    this.peerOptions = options.peerOptions;
    this.patchSnapshot({
      role: this.role,
      selfPlayer: this.selfPlayer,
      status: this.role === "host" ? "creating" : "joining",
    });
  }

  getSnapshot() {
    return this.snapshot;
  }

  async start() {
    this.transport = new PeerTransport({
      role: this.role,
      roomId: this.targetRoomId,
      peerOptions: this.peerOptions,
      events: {
        onPeerOpen: (peerId) => {
          this.patchSnapshot({
            roomId: this.role === "host" ? peerId : this.targetRoomId,
            status: this.role === "host" ? "waiting" : "joining",
          });
        },
        onConnected: () => {
          this.patchSnapshot({
            status: "connected",
            errorMessage: null,
          });
          this.send(createHelloMessage(this.selfPlayer));
        },
        onMessage: (message) => this.handleMessage(message),
        onFailed: (message) => {
          this.stopCountdown();
          this.patchSnapshot({ status: "failed", errorMessage: message || MULTIPLAYER_FAILED_MESSAGE });
        },
        onDisconnected: (message) => {
          this.stopCountdown();
          this.patchSnapshot({ status: "disconnected", errorMessage: message || MULTIPLAYER_DISCONNECTED_MESSAGE });
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

  startMatch(config: Omit<MatchConfig, "startAt"> & { countdownMs: number }) {
    if (this.role !== "host") return;
    const startAt = now() + config.countdownMs;
    const match: MatchConfig = {
      levelId: config.levelId,
      seed: config.seed,
      logicWidth: config.logicWidth,
      logicHeight: config.logicHeight,
      startAt,
    };
    this.patchSnapshot({
      match,
      status: "countdown",
      countdown: { startAt, remainMs: Math.max(0, startAt - now()) },
    });
    this.send({
      v: 1,
      kind: "start",
      seed: match.seed,
      startAt: match.startAt,
      levelId: match.levelId,
      logicWidth: match.logicWidth,
      logicHeight: match.logicHeight,
    });
    this.startCountdownTick();
  }

  reportState(state: SelfGameState) {
    const sequencedState: SelfGameState = {
      ...state,
      seq: this.selfStateSeq,
      sentAt: now(),
    };
    this.selfStateSeq += 1;
    this.patchSnapshot({ selfState: sequencedState });
    this.send(
      createStateMessage({
        cameraY: sequencedState.cameraY,
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
    this.patchSnapshot({ selfResult: result });
    this.send(createResultMessage(result));
    this.tryFinishSession();
  }

  requestRematch() {
    if (!this.transport) return;
    this.send(createRematchMessage());
    this.resetRound();
  }

  leave(reason?: string) {
    this.transport?.send(createByeMessage(reason));
    this.transport?.dispose();
    this.transport = null;
    this.stopCountdown();
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
    });
  }

  dispose() {
    this.transport?.dispose();
    this.transport = null;
    this.stopCountdown();
  }

  private send(message: NetMessage) {
    this.transport?.send(message);
  }

  private handleMessage(message: NetMessage) {
    switch (message.kind) {
      case "hello":
        this.patchSnapshot({ opponentPlayer: message.player });
        break;
      case "ready":
        this.patchSnapshot({ opponentReady: message.ready });
        this.maybeStartMatch();
        break;
      case "start":
        this.acceptStartMessage(message);
        break;
      case "state":
        if (typeof message.seq === "number" && message.seq <= this.opponentStateSeq) return;
        if (typeof message.seq === "number") this.opponentStateSeq = message.seq;
        this.patchSnapshot({
          opponentState: {
            cameraY: message.cameraY,
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
          },
        });
        break;
      case "result":
        this.patchSnapshot({
          opponentResult: {
            score: message.score,
            passed: message.passed,
            timeMs: message.timeMs,
          },
        });
        this.tryFinishSession();
        break;
      case "rematch":
        this.resetRound();
        break;
      case "bye":
        this.stopCountdown();
        this.patchSnapshot({
          status: "disconnected",
          errorMessage: message.reason || MULTIPLAYER_DISCONNECTED_MESSAGE,
        });
        break;
      default:
        break;
    }
  }

  private resetRound() {
    this.stopCountdown();
    this.selfStateSeq = 0;
    this.opponentStateSeq = -1;
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

  private acceptStartMessage(message: Extract<NetMessage, { kind: "start" }>) {
    const match: MatchConfig = {
      levelId: message.levelId,
      seed: message.seed,
      logicWidth: message.logicWidth,
      logicHeight: message.logicHeight,
      startAt: message.startAt,
    };
    this.patchSnapshot({
      match,
      status: "countdown",
      countdown: { startAt: match.startAt, remainMs: Math.max(0, match.startAt - now()) },
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

  private tryFinishSession() {
    if (!this.snapshot.selfResult || !this.snapshot.opponentResult) return;
    this.patchSnapshot({
      status: "finished",
      countdown: null,
      selfReady: false,
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

  private patchSnapshot(patch: Partial<MultiplayerSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange(this.snapshot);
  }
}
