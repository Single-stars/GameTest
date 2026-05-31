"use client";

import { parseNetMessage, serializeNetMessage } from "@/lib/multiplayer/messages";
import {
  MULTIPLAYER_STATE_CHANNEL_CONFIG,
  RemoteClockSync,
  TIME_SYNC_INTERVAL_MS,
  canSendRealtimeState,
  type TimeSyncMessage,
} from "../../features/multiplayer/p2p-client.ts";
import {
  MULTIPLAYER_DATA_CHANNELS,
  MULTIPLAYER_DISCONNECTED_MESSAGE,
  MULTIPLAYER_FAILED_MESSAGE,
  MULTIPLAYER_ROOM_EXPIRED_MESSAGE,
  MULTIPLAYER_ROOM_EXPIRED_REASON,
  type MultiplayerDataChannelLabel,
} from "@/lib/multiplayer/protocol";
import {
  buildRoomWebSocketUrl,
  createSignalingRoom,
  getSignalingIceServers,
  getSignalingRoomStatus,
  isRoomCode,
  normalizeRoomCode,
  readStoredRoomToken,
  writeStoredRoomToken,
  type SignalingRole,
} from "@/lib/multiplayer/room-api";
import type { NetMessage } from "@/lib/multiplayer/types";

export {
  MULTIPLAYER_DISCONNECTED_MESSAGE,
  MULTIPLAYER_FAILED_MESSAGE,
  MULTIPLAYER_ROOM_EXPIRED_MESSAGE,
  MULTIPLAYER_ROOM_EXPIRED_REASON,
} from "@/lib/multiplayer/protocol";

const SIGNAL_OPEN_TIMEOUT_MS = 12_000;
const DATA_CHANNEL_OPEN_TIMEOUT_MS = 25_000;
const SIGNAL_RECONNECT_DELAY_MS = 800;
const SIGNAL_RECONNECT_MAX_DELAY_MS = 5_000;
const SIGNAL_HEARTBEAT_INTERVAL_MS = 30_000;
const ROOM_STATUS_WATCHDOG_INTERVAL_MS = 15_000;
const ICE_RESTART_DELAY_MS = 1_200;
const MAX_ICE_RESTART_ATTEMPTS = 3;
const MAX_PENDING_SIGNAL_COUNT = 64;
const MAX_PENDING_REMOTE_CANDIDATE_COUNT = 96;
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const ENABLE_TURN = false;
export const ENABLE_RELAY = false;

export type RoomSignalTransportEvents = {
  onPeerOpen?: (roomCode: string) => void;
  onConnected?: (remotePeerId: string) => void;
  onPeerDisconnected?: (reason: string) => void;
  onMessage?: (message: NetMessage) => void;
  onRemoteClockOffset?: (offsetMs: number) => void;
  onFailed?: (message: string) => void;
  onDisconnected?: (message: string) => void;
};

export type RoomSignalTransportOptions = {
  role: SignalingRole;
  roomId?: string | null;
  events?: RoomSignalTransportEvents;
};

type SignalPayload =
  | { type: "offer"; description: RTCSessionDescriptionInit }
  | { type: "answer"; description: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit }
  | { type: "restart-request" };

type IceCandidateType = "host" | "srflx" | "relay" | "prflx" | "unknown";

type IceCandidateTypeCounts = Record<IceCandidateType, number>;

type SelectedCandidatePairDiagnostic = {
  localType: IceCandidateType;
  remoteType: IceCandidateType;
  state: string | null;
  protocol: string | null;
};

type IceDiagnostics = {
  localCandidates: IceCandidateTypeCounts;
  remoteCandidates: IceCandidateTypeCounts;
  iceGatheringStates: RTCIceGatheringState[];
  iceConnectionStates: RTCIceConnectionState[];
  connectionStates: RTCPeerConnectionState[];
  localSdpHasSrflx: Partial<Record<RTCSdpType, boolean>>;
  remoteSdpHasSrflx: Partial<Record<RTCSdpType, boolean>>;
  onIceCandidateCount: number;
  lastOnIceCandidateAt: number | null;
  addIceCandidateSuccess: number;
  addIceCandidateFailure: number;
  addIceCandidateErrors: string[];
  pendingRemoteCandidateQueued: number;
  pendingRemoteCandidateDropped: number;
  pendingSignalQueued: number;
  pendingSignalDropped: number;
  selectedCandidatePair: SelectedCandidatePairDiagnostic | null;
};

type ServerMessage =
  | { type: "ready"; role: SignalingRole; roomCode: string; token: string; expiresAt: number }
  | { type: "heartbeat"; sentAt?: number }
  | { type: "peer-joined" }
  | { type: "peer-left"; reason?: string }
  | { type: "room-closed"; reason?: string }
  | { type: "signal"; signal: SignalPayload }
  | { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSignalPayload(value: unknown): value is SignalPayload {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "restart-request") return true;
  if (value.type === "offer" || value.type === "answer") return isRecord(value.description);
  if (value.type === "ice") return isRecord(value.candidate);
  return false;
}

function parseServerMessage(raw: string): ServerMessage | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(payload) || typeof payload.type !== "string") return null;
  if (
    payload.type === "ready" &&
    (payload.role === "host" || payload.role === "guest") &&
    typeof payload.roomCode === "string" &&
    typeof payload.token === "string" &&
    typeof payload.expiresAt === "number"
  ) {
    return {
      type: "ready",
      role: payload.role,
      roomCode: payload.roomCode,
      token: payload.token,
      expiresAt: payload.expiresAt,
    };
  }
  if (payload.type === "heartbeat") return { type: "heartbeat", sentAt: typeof payload.sentAt === "number" ? payload.sentAt : undefined };
  if (payload.type === "peer-joined") return { type: "peer-joined" };
  if (payload.type === "peer-left") return { type: "peer-left", reason: typeof payload.reason === "string" ? payload.reason : undefined };
  if (payload.type === "room-closed") return { type: "room-closed", reason: typeof payload.reason === "string" ? payload.reason : undefined };
  if (payload.type === "signal" && isSignalPayload(payload.signal)) return { type: "signal", signal: payload.signal };
  if (payload.type === "error") return { type: "error", message: typeof payload.message === "string" ? payload.message : MULTIPLAYER_FAILED_MESSAGE };
  return null;
}

function channelIsOpen(channel: RTCDataChannel | null): channel is RTCDataChannel {
  return channel?.readyState === "open";
}

function canSendReplaceableState(channel: RTCDataChannel | null) {
  return channelIsOpen(channel) && canSendRealtimeState(channel.bufferedAmount);
}

function createCandidateCounts(): IceCandidateTypeCounts {
  return {
    host: 0,
    prflx: 0,
    relay: 0,
    srflx: 0,
    unknown: 0,
  };
}

function createIceDiagnostics(): IceDiagnostics {
  return {
    addIceCandidateErrors: [],
    addIceCandidateFailure: 0,
    addIceCandidateSuccess: 0,
    connectionStates: [],
    iceConnectionStates: [],
    iceGatheringStates: [],
    lastOnIceCandidateAt: null,
    localCandidates: createCandidateCounts(),
    localSdpHasSrflx: {},
    onIceCandidateCount: 0,
    pendingRemoteCandidateDropped: 0,
    pendingRemoteCandidateQueued: 0,
    pendingSignalDropped: 0,
    pendingSignalQueued: 0,
    remoteCandidates: createCandidateCounts(),
    remoteSdpHasSrflx: {},
    selectedCandidatePair: null,
  };
}

function readCandidateString(candidate: RTCIceCandidateInit | RTCIceCandidate | null | undefined) {
  return typeof candidate?.candidate === "string" ? candidate.candidate : "";
}

function readCandidateType(candidate: RTCIceCandidateInit | RTCIceCandidate | null | undefined): IceCandidateType {
  const match = /\btyp\s+(host|srflx|relay|prflx)\b/i.exec(readCandidateString(candidate));
  return (match?.[1]?.toLowerCase() as IceCandidateType | undefined) ?? "unknown";
}

function sdpHasServerReflexiveCandidate(description: RTCSessionDescriptionInit | RTCSessionDescription | null | undefined) {
  return /\btyp srflx\b/i.test(typeof description?.sdp === "string" ? description.sdp : "");
}

function canApplyRemoteAnswer(peerConnection: RTCPeerConnection) {
  return peerConnection.signalingState === "have-local-offer";
}

function readStatsString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : null;
}

function readStatsCandidateType(report: RTCStats | undefined): IceCandidateType {
  if (!report) return "unknown";
  const record = report as unknown as Record<string, unknown>;
  const candidateType = readStatsString(record, "candidateType");
  if (candidateType === "host" || candidateType === "srflx" || candidateType === "relay" || candidateType === "prflx") return candidateType;
  return "unknown";
}

export class RoomSignalTransport {
  private readonly role: SignalingRole;
  private readonly targetRoomId: string | null;
  private readonly events: RoomSignalTransportEvents;
  private socket: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private stateChannel: RTCDataChannel | null = null;
  private readonly remoteClockSync = new RemoteClockSync();
  private iceServers: RTCIceServer[] = ICE_SERVERS;
  private iceDiagnostics: IceDiagnostics = createIceDiagnostics();
  private destroyed = false;
  private connected = false;
  private signalReady = false;
  private roomCode: string | null = null;
  private roleToken: string | null = null;
  private signalOpenTimer: number | null = null;
  private signalReconnectTimer: number | null = null;
  private signalReconnectAttempts = 0;
  private signalHeartbeatTimer: number | null = null;
  private roomStatusWatchdogTimer: number | null = null;
  private dataChannelOpenTimer: number | null = null;
  private timeSyncTimer: number | null = null;
  private iceRestartTimer: number | null = null;
  private iceRestartAttempts = 0;
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private pendingSignalQueue: SignalPayload[] = [];
  private ignoreNextControlClose = false;

  constructor(options: RoomSignalTransportOptions) {
    this.role = options.role;
    this.targetRoomId = options.roomId ? normalizeRoomCode(options.roomId) : null;
    this.events = options.events ?? {};
  }

  get isConnected() {
    return this.connected && channelIsOpen(this.controlChannel) && channelIsOpen(this.inputChannel) && channelIsOpen(this.stateChannel);
  }

  async start() {
    this.destroyed = false;
    this.connected = false;
    this.signalReady = false;
    this.pendingRemoteCandidates = [];
    this.pendingSignalQueue = [];
    this.iceDiagnostics = createIceDiagnostics();
    this.clearSignalReconnectTimer();
    this.signalReconnectAttempts = 0;
    await this.loadIceServers();

    if (this.role === "host") {
      const room = await createSignalingRoom();
      this.roomCode = room.roomCode;
      this.roleToken = room.token;
      this.events.onPeerOpen?.(room.roomCode);
    } else {
      if (!this.targetRoomId || !isRoomCode(this.targetRoomId)) {
        this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
        throw new Error("invalid-room-code");
      }
      this.roomCode = this.targetRoomId;
      this.roleToken = readStoredRoomToken(this.roomCode, this.role);
      this.events.onPeerOpen?.(this.roomCode);
    }

    await this.openSignalSocket();
    return this.roomCode;
  }

  send(message: NetMessage) {
    const serialized = serializeNetMessage(message);
    const preferredChannel = message.kind === "input" ? this.inputChannel : message.kind === "state" ? this.stateChannel : this.controlChannel;
    if (message.kind === "state" && !canSendReplaceableState(preferredChannel)) return;
    if (channelIsOpen(preferredChannel)) {
      preferredChannel.send(serialized);
    }
  }

  close(reason?: string) {
    if (reason && channelIsOpen(this.controlChannel)) {
      this.controlChannel.send(serializeNetMessage({ v: 1, kind: "bye", reason }));
    }
    this.disposeWithSignalReason(reason);
  }

  dispose() {
    this.disposeWithSignalReason();
  }

  private disposeWithSignalReason(reason?: string) {
    this.destroyed = true;
    this.clearSignalOpenTimer();
    this.clearSignalReconnectTimer();
    this.clearSignalHeartbeatTimer();
    this.clearRoomStatusWatchdogTimer();
    this.clearDataChannelOpenTimer();
    this.clearTimeSyncTimer();
    this.clearIceRestartTimer();
    this.closePeerConnection();
    this.closeSignalSocket(reason);
  }

  disconnectActiveConnection() {
    this.closePeerConnection();
  }

  private async loadIceServers() {
    try {
      const response = await getSignalingIceServers();
      this.iceServers = response.iceServers.length > 0 ? response.iceServers : ICE_SERVERS;
      this.logIceDiagnostic("ice-servers-loaded", {
        iceServerCount: this.iceServers.length,
        iceTransportPolicy: response.iceTransportPolicy ?? "all",
        relayEnabled: response.relayEnabled === true,
        turnEnabled: response.turnEnabled === true,
      });
    } catch (error) {
      this.iceServers = ICE_SERVERS;
      this.logIceDiagnostic("ice-servers-fallback", {
        error: error instanceof Error ? error.message : String(error),
        iceServerCount: this.iceServers.length,
        iceTransportPolicy: "all",
      });
    }
  }

  private async openSignalSocket(options: { reconnect?: boolean } = {}) {
    if (!this.roomCode) throw new Error("missing-room-code");
    const reconnect = options.reconnect === true;
    const socket = new WebSocket(
      buildRoomWebSocketUrl({
        roomCode: this.roomCode,
        role: this.role,
        token: this.roleToken,
      }),
    );
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      this.signalOpenTimer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        this.clearSignalOpenTimer();
        if (!reconnect) this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
        reject(new Error("signal-open-timeout"));
      }, SIGNAL_OPEN_TIMEOUT_MS);

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        this.clearSignalOpenTimer();
        resolve();
      };

      socket.onerror = () => {
        if (settled) return;
        settled = true;
        this.clearSignalOpenTimer();
        if (!reconnect) this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
        reject(new Error("signal-open-error"));
      };
    });

    if (reconnect) this.signalReconnectAttempts = 0;
    this.flushPendingSignalQueue();

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      void this.handleServerMessage(message);
    };

    socket.onclose = (event) => {
      if (this.destroyed) return;
      if (this.socket !== socket) return;
      if (this.socket === socket) this.socket = null;
      if (event.reason === MULTIPLAYER_ROOM_EXPIRED_REASON) {
        this.handleRoomClosed(event.reason);
        return;
      }
      if (this.connected) {
        this.scheduleSignalReconnect();
        return;
      }
      if (this.connected || this.signalReady) {
        this.scheduleSignalReconnect();
        return;
      }
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
    };
  }

  private async handleServerMessage(message: ServerMessage) {
    if (this.destroyed) return;
    switch (message.type) {
      case "ready":
        this.signalReady = true;
        this.roomCode = normalizeRoomCode(message.roomCode);
        this.roleToken = message.token;
        writeStoredRoomToken(this.roomCode, message.role, message.token);
        this.startSignalHeartbeat();
        this.startRoomStatusWatchdog();
        if (this.role === "host") this.preparePeerConnection();
        break;
      case "heartbeat":
        break;
      case "peer-joined":
        if (this.role === "host") {
          await this.createOffer({ resetPeer: true });
        }
        break;
      case "peer-left":
        if (message.reason !== "host-disbanded-room" && message.reason !== "peer-left-room") return;
        this.ignoreNextControlClose = true;
        this.closePeerConnection();
        if (this.role === "host") {
          this.events.onPeerDisconnected?.(message.reason);
        } else {
          this.handleDisconnected(message.reason);
        }
        break;
      case "room-closed":
        this.handleRoomClosed(message.reason);
        break;
      case "signal":
        await this.handleSignal(message.signal);
        break;
      case "error":
        this.handleFailure(message.message);
        break;
      default:
        break;
    }
  }

  private preparePeerConnection() {
    if (this.peerConnection) return this.peerConnection;

    this.iceDiagnostics = createIceDiagnostics();
    const iceServers = this.iceServers;
    const peerConnection = new RTCPeerConnection({ iceServers, iceTransportPolicy: "all" });
    this.peerConnection = peerConnection;
    this.logIceDiagnostic("peer-connection-created", {
      iceServerCount: iceServers.length,
      iceTransportPolicy: "all",
    });

    peerConnection.onicecandidate = (event) => {
      this.recordLocalIceCandidate(event.candidate);
      if (!event.candidate) return;
      this.sendSignal({ type: "ice", candidate: event.candidate.toJSON() });
    };

    peerConnection.onicegatheringstatechange = () => {
      this.recordIceGatheringState(peerConnection.iceGatheringState);
    };

    peerConnection.oniceconnectionstatechange = () => {
      this.recordIceConnectionState(peerConnection.iceConnectionState);
    };

    peerConnection.onconnectionstatechange = () => {
      this.recordConnectionState(peerConnection.connectionState);
      if (peerConnection.connectionState === "disconnected") {
        this.scheduleIceRestart(MULTIPLAYER_DISCONNECTED_MESSAGE);
        return;
      }
      if (peerConnection.connectionState === "failed") {
        this.scheduleIceRestart(MULTIPLAYER_FAILED_MESSAGE);
      }
      if (peerConnection.connectionState === "connected") {
        this.clearIceRestartTimer();
        this.iceRestartAttempts = 0;
        void this.recordSelectedCandidatePair();
      }
      if (peerConnection.connectionState === "closed") {
        this.connected = false;
      }
    };

    if (this.role === "host") {
      this.bindDataChannel(peerConnection.createDataChannel(MULTIPLAYER_DATA_CHANNELS.control, { ordered: true }), MULTIPLAYER_DATA_CHANNELS.control);
      this.bindDataChannel(peerConnection.createDataChannel(MULTIPLAYER_DATA_CHANNELS.input, { ordered: false, maxRetransmits: 0 }), MULTIPLAYER_DATA_CHANNELS.input);
      this.bindDataChannel(peerConnection.createDataChannel(MULTIPLAYER_DATA_CHANNELS.state, MULTIPLAYER_STATE_CHANNEL_CONFIG), MULTIPLAYER_DATA_CHANNELS.state);
    } else {
      peerConnection.ondatachannel = (event) => {
        if (event.channel.label === MULTIPLAYER_DATA_CHANNELS.input || event.channel.label === MULTIPLAYER_DATA_CHANNELS.state) {
          this.bindDataChannel(event.channel, event.channel.label);
          return;
        }
        this.bindDataChannel(event.channel, MULTIPLAYER_DATA_CHANNELS.control);
      };
    }

    return peerConnection;
  }

  private bindDataChannel(channel: RTCDataChannel, label: MultiplayerDataChannelLabel) {
    if (label === MULTIPLAYER_DATA_CHANNELS.control) {
      this.controlChannel = channel;
    } else if (label === MULTIPLAYER_DATA_CHANNELS.input) {
      this.inputChannel = channel;
    } else {
      this.stateChannel = channel;
    }

    channel.onopen = () => {
      this.markConnectedWhenReady();
    };

    channel.onmessage = (event) => {
      const parsed = parseNetMessage(event.data);
      if (!parsed) return;
      if (parsed.kind === "time-sync") {
        this.handleTimeSyncMessage(parsed);
        return;
      }
      this.events.onMessage?.(parsed);
    };

    channel.onclose = () => {
      if (this.destroyed) return;
      if (label === MULTIPLAYER_DATA_CHANNELS.control && this.ignoreNextControlClose) {
        this.ignoreNextControlClose = false;
        return;
      }
      if (label !== MULTIPLAYER_DATA_CHANNELS.control || !this.connected) return;
      this.scheduleIceRestart(MULTIPLAYER_DISCONNECTED_MESSAGE);
    };

    channel.onerror = () => {
      if (this.destroyed) return;
      this.scheduleIceRestart(MULTIPLAYER_FAILED_MESSAGE);
    };
  }

  private logIceDiagnostic(event: string, details: Record<string, unknown> = {}) {
    console.info("[multiplayer ice]", event, {
      role: this.role,
      roomCode: this.roomCode,
      ...details,
    });
  }

  private recordLocalIceCandidate(candidate: RTCIceCandidate | null) {
    this.iceDiagnostics.onIceCandidateCount += 1;
    this.iceDiagnostics.lastOnIceCandidateAt = performance.now();
    if (!candidate) {
      this.logIceDiagnostic("onicecandidate-complete", {
        iceGatheringState: this.peerConnection?.iceGatheringState ?? null,
        onIceCandidateCount: this.iceDiagnostics.onIceCandidateCount,
      });
      return;
    }
    const type = readCandidateType(candidate);
    this.iceDiagnostics.localCandidates[type] += 1;
    this.logIceDiagnostic("local-candidate", {
      localCandidates: this.iceDiagnostics.localCandidates,
      type,
    });
  }

  private recordRemoteIceCandidate(candidate: RTCIceCandidateInit) {
    const type = readCandidateType(candidate);
    this.iceDiagnostics.remoteCandidates[type] += 1;
    this.logIceDiagnostic("remote-candidate", {
      remoteCandidates: this.iceDiagnostics.remoteCandidates,
      type,
    });
  }

  private recordIceGatheringState(state: RTCIceGatheringState) {
    if (this.iceDiagnostics.iceGatheringStates.at(-1) === state) return;
    this.iceDiagnostics.iceGatheringStates.push(state);
    this.logIceDiagnostic("iceGatheringState", { iceGatheringState: state });
  }

  private recordIceConnectionState(state: RTCIceConnectionState) {
    if (this.iceDiagnostics.iceConnectionStates.at(-1) === state) return;
    this.iceDiagnostics.iceConnectionStates.push(state);
    this.logIceDiagnostic("iceConnectionState", { iceConnectionState: state });
  }

  private recordConnectionState(state: RTCPeerConnectionState) {
    if (this.iceDiagnostics.connectionStates.at(-1) === state) return;
    this.iceDiagnostics.connectionStates.push(state);
    this.logIceDiagnostic("connectionState", { connectionState: state });
  }

  private recordLocalDescription(description: RTCSessionDescriptionInit | RTCSessionDescription) {
    this.iceDiagnostics.localSdpHasSrflx[description.type] = sdpHasServerReflexiveCandidate(description);
    this.logIceDiagnostic("local-sdp", {
      hasTypSrflx: this.iceDiagnostics.localSdpHasSrflx[description.type] === true,
      type: description.type,
    });
  }

  private recordRemoteDescription(description: RTCSessionDescriptionInit | RTCSessionDescription) {
    this.iceDiagnostics.remoteSdpHasSrflx[description.type] = sdpHasServerReflexiveCandidate(description);
    this.logIceDiagnostic("remote-sdp", {
      hasTypSrflx: this.iceDiagnostics.remoteSdpHasSrflx[description.type] === true,
      type: description.type,
    });
  }

  private recordAddIceCandidateSuccess(candidate: RTCIceCandidateInit) {
    this.iceDiagnostics.addIceCandidateSuccess += 1;
    this.logIceDiagnostic("addIceCandidate-success", {
      addIceCandidateSuccess: this.iceDiagnostics.addIceCandidateSuccess,
      type: readCandidateType(candidate),
    });
  }

  private recordAddIceCandidateFailure(candidate: RTCIceCandidateInit, error: unknown) {
    this.iceDiagnostics.addIceCandidateFailure += 1;
    this.iceDiagnostics.addIceCandidateErrors.push(error instanceof Error ? error.message : String(error));
    this.logIceDiagnostic("addIceCandidate-failure", {
      addIceCandidateFailure: this.iceDiagnostics.addIceCandidateFailure,
      error: error instanceof Error ? error.message : String(error),
      type: readCandidateType(candidate),
    });
  }

  private async recordSelectedCandidatePair() {
    const peerConnection = this.peerConnection;
    if (!peerConnection) return;
    try {
      const stats = await peerConnection.getStats();
      const reports = new Map<string, RTCStats>();
      let selectedPair: RTCStats | null = null;
      stats.forEach((report) => {
        reports.set(report.id, report);
        const record = report as unknown as Record<string, unknown>;
        if (report.type === "transport") {
          const selectedCandidatePairId = readStatsString(record, "selectedCandidatePairId");
          const pair = selectedCandidatePairId ? stats.get(selectedCandidatePairId) : undefined;
          if (pair) selectedPair = pair;
        }
        if (
          !selectedPair &&
          report.type === "candidate-pair" &&
          (record.selected === true || record.nominated === true) &&
          readStatsString(record, "state") === "succeeded"
        ) {
          selectedPair = report;
        }
      });
      if (!selectedPair) {
        this.logIceDiagnostic("selectedCandidatePair-unavailable");
        return;
      }
      const selected = selectedPair as unknown as Record<string, unknown>;
      const localCandidateId = readStatsString(selected, "localCandidateId");
      const remoteCandidateId = readStatsString(selected, "remoteCandidateId");
      const localCandidate = localCandidateId ? reports.get(localCandidateId) : undefined;
      const remoteCandidate = remoteCandidateId ? reports.get(remoteCandidateId) : undefined;
      const localCandidateRecord = localCandidate as unknown as Record<string, unknown> | undefined;
      const remoteCandidateRecord = remoteCandidate as unknown as Record<string, unknown> | undefined;
      const selectedCandidatePair: SelectedCandidatePairDiagnostic = {
        localType: readStatsCandidateType(localCandidate),
        protocol: (localCandidateRecord && readStatsString(localCandidateRecord, "protocol")) ?? (remoteCandidateRecord && readStatsString(remoteCandidateRecord, "protocol")) ?? null,
        remoteType: readStatsCandidateType(remoteCandidate),
        state: readStatsString(selected, "state"),
      };
      this.iceDiagnostics.selectedCandidatePair = selectedCandidatePair;
      this.logIceDiagnostic("selectedCandidatePair", selectedCandidatePair);
    } catch (error) {
      this.logIceDiagnostic("selectedCandidatePair-error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private buildIceDiagnosticSummary(message: string) {
    const diagnostics = this.iceDiagnostics;
    const latestGatheringState = diagnostics.iceGatheringStates.at(-1) ?? this.peerConnection?.iceGatheringState ?? null;
    const latestIceConnectionState = diagnostics.iceConnectionStates.at(-1) ?? this.peerConnection?.iceConnectionState ?? null;
    const latestConnectionState = diagnostics.connectionStates.at(-1) ?? this.peerConnection?.connectionState ?? null;
    const localSdpHasSrflx = Object.values(diagnostics.localSdpHasSrflx).some(Boolean);
    const remoteSdpHasSrflx = Object.values(diagnostics.remoteSdpHasSrflx).some(Boolean);
    const conclusions: string[] = [];
    if (latestGatheringState !== "complete") conclusions.push("gathering 未 complete 就失败：移动网络 STUN candidate 可能尚未出来");
    if (latestGatheringState === "complete" && diagnostics.localCandidates.srflx === 0 && !localSdpHasSrflx) conclusions.push("gathering complete 后仍无 local srflx：candidate 收集或 STUN 可达性异常");
    if (diagnostics.remoteCandidates.srflx === 0 && !remoteSdpHasSrflx) conclusions.push("没有 remote srflx：candidate 交换、Worker 转发或 WebSocket 信令可靠性异常");
    if (diagnostics.localCandidates.srflx > 0 && diagnostics.remoteCandidates.srflx > 0 && latestIceConnectionState === "failed") conclusions.push("双方都有 srflx 但 ICE failed：STUN 直连失败，属于 NAT / 运营商路径问题");
    if (diagnostics.pendingSignalDropped > 0 || diagnostics.pendingRemoteCandidateDropped > 0) conclusions.push("candidate 被丢：本地有界队列达到上限，需要检查信令断开或 candidate 暴增");
    return {
      addIceCandidateFailure: diagnostics.addIceCandidateFailure,
      addIceCandidateSuccess: diagnostics.addIceCandidateSuccess,
      connectionState: latestConnectionState,
      conclusion: conclusions.length > 0 ? conclusions : ["ICE 未给出单一明确结论，需对照 candidate 和状态变化继续看日志"],
      iceConnectionState: latestIceConnectionState,
      iceGatheringState: latestGatheringState,
      lastOnIceCandidateAt: diagnostics.lastOnIceCandidateAt,
      localCandidates: diagnostics.localCandidates,
      localSdpHasSrflx,
      message,
      onIceCandidateCount: diagnostics.onIceCandidateCount,
      pendingRemoteCandidateDropped: diagnostics.pendingRemoteCandidateDropped,
      pendingRemoteCandidateQueued: diagnostics.pendingRemoteCandidateQueued,
      pendingSignalDropped: diagnostics.pendingSignalDropped,
      pendingSignalQueued: diagnostics.pendingSignalQueued,
      remoteCandidates: diagnostics.remoteCandidates,
      remoteSdpHasSrflx,
      selectedCandidatePair: diagnostics.selectedCandidatePair,
    };
  }

  private reportIceFailure(message: string) {
    console.warn("[multiplayer ice] failure-summary", this.buildIceDiagnosticSummary(message));
  }

  private startDataChannelOpenTimer() {
    this.clearDataChannelOpenTimer();
    this.dataChannelOpenTimer = window.setTimeout(() => {
      if (this.destroyed || this.connected) return;
      this.scheduleIceRestart(MULTIPLAYER_FAILED_MESSAGE);
    }, DATA_CHANNEL_OPEN_TIMEOUT_MS);
  }

  private markConnectedWhenReady() {
    if (this.connected) return;
    if (!channelIsOpen(this.controlChannel) || !channelIsOpen(this.inputChannel) || !channelIsOpen(this.stateChannel)) return;
    this.connected = true;
    this.iceRestartAttempts = 0;
    this.clearDataChannelOpenTimer();
    this.startTimeSync();
    this.events.onConnected?.(this.role === "host" ? "guest" : "host");
  }

  private startTimeSync() {
    this.clearTimeSyncTimer();
    this.remoteClockSync.reset();
    const sendPing = () => {
      if (!channelIsOpen(this.controlChannel)) return;
      this.controlChannel.send(serializeNetMessage(this.remoteClockSync.createPing(performance.now())));
    };
    sendPing();
    this.timeSyncTimer = window.setInterval(sendPing, TIME_SYNC_INTERVAL_MS);
  }

  private handleTimeSyncMessage(message: TimeSyncMessage) {
    const result = this.remoteClockSync.handleMessage(message, performance.now());
    if (result === null) return;
    if (typeof result === "number") {
      this.events.onRemoteClockOffset?.(result);
      return;
    }
    if (channelIsOpen(this.controlChannel)) {
      this.controlChannel.send(serializeNetMessage(result));
    }
  }

  private async createOffer({ iceRestart = false, resetPeer = false }: { iceRestart?: boolean; resetPeer?: boolean } = {}) {
    if (resetPeer) this.closePeerConnection();
    const peerConnection = this.preparePeerConnection();
    this.startDataChannelOpenTimer();
    const offer = await peerConnection.createOffer({ iceRestart });
    await peerConnection.setLocalDescription(offer);
    if (!peerConnection.localDescription) return;
    this.recordLocalDescription(peerConnection.localDescription);
    this.sendSignal({
      type: "offer",
      description: {
        sdp: peerConnection.localDescription.sdp,
        type: peerConnection.localDescription.type,
      },
    });
  }

  private async handleSignal(signal: SignalPayload) {
    const peerConnection = this.preparePeerConnection();

    if (signal.type === "offer") {
      this.startDataChannelOpenTimer();
      await peerConnection.setRemoteDescription(signal.description);
      this.recordRemoteDescription(signal.description);
      await this.flushPendingRemoteCandidates();
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      if (!peerConnection.localDescription) return;
      this.recordLocalDescription(peerConnection.localDescription);
      this.sendSignal({
        type: "answer",
        description: {
          sdp: peerConnection.localDescription.sdp,
          type: peerConnection.localDescription.type,
        },
      });
      return;
    }

    if (signal.type === "answer") {
      if (!canApplyRemoteAnswer(peerConnection)) {
        this.logIceDiagnostic("remote-answer-ignored", {
          signalingState: peerConnection.signalingState,
        });
        return;
      }
      await peerConnection.setRemoteDescription(signal.description);
      this.recordRemoteDescription(signal.description);
      await this.flushPendingRemoteCandidates();
      return;
    }

    if (signal.type === "ice") {
      this.recordRemoteIceCandidate(signal.candidate);
      await this.addRemoteIceCandidate(signal.candidate);
      return;
    }

    if (signal.type === "restart-request" && this.role === "host") {
      await this.createOffer({ iceRestart: true });
    }
  }

  private queueRemoteIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.pendingRemoteCandidates.length >= MAX_PENDING_REMOTE_CANDIDATE_COUNT) {
      this.pendingRemoteCandidates.shift();
      this.iceDiagnostics.pendingRemoteCandidateDropped += 1;
    }
    this.pendingRemoteCandidates.push(candidate);
    this.iceDiagnostics.pendingRemoteCandidateQueued += 1;
    this.logIceDiagnostic("remote-candidate-queued", {
      pendingRemoteCandidates: this.pendingRemoteCandidates.length,
      type: readCandidateType(candidate),
    });
  }

  private async addRemoteIceCandidate(candidate: RTCIceCandidateInit) {
    const peerConnection = this.peerConnection;
    if (!peerConnection?.remoteDescription) {
      this.queueRemoteIceCandidate(candidate);
      return;
    }
    try {
      await peerConnection.addIceCandidate(candidate);
      this.recordAddIceCandidateSuccess(candidate);
    } catch (error) {
      this.recordAddIceCandidateFailure(candidate, error);
    }
  }

  private async flushPendingRemoteCandidates() {
    const peerConnection = this.peerConnection;
    if (!peerConnection?.remoteDescription) return;
    const pending = this.pendingRemoteCandidates.splice(0);
    for (const candidate of pending) {
      await this.addRemoteIceCandidate(candidate);
    }
  }

  private sendSignal(signal: SignalPayload) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.queueSignal(signal);
      return;
    }
    try {
      socket.send(JSON.stringify({ type: "signal", signal }));
    } catch {
      this.queueSignal(signal);
    }
  }

  private queueSignal(signal: SignalPayload) {
    if (this.pendingSignalQueue.length >= MAX_PENDING_SIGNAL_COUNT) {
      this.pendingSignalQueue.shift();
      this.iceDiagnostics.pendingSignalDropped += 1;
    }
    this.pendingSignalQueue.push(signal);
    this.iceDiagnostics.pendingSignalQueued += 1;
    this.logIceDiagnostic("signal-queued", {
      pendingSignalCount: this.pendingSignalQueue.length,
      signalType: signal.type,
    });
  }

  private flushPendingSignalQueue() {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || this.pendingSignalQueue.length === 0) return;
    const pending = this.pendingSignalQueue.splice(0);
    for (const signal of pending) {
      this.sendSignal(signal);
    }
  }

  private closePeerConnection() {
    this.connected = false;
    this.clearDataChannelOpenTimer();
    this.clearTimeSyncTimer();
    this.clearIceRestartTimer();
    this.remoteClockSync.reset();
    this.iceRestartAttempts = 0;
    this.controlChannel?.close();
    this.inputChannel?.close();
    this.stateChannel?.close();
    this.peerConnection?.close();
    this.controlChannel = null;
    this.inputChannel = null;
    this.stateChannel = null;
    this.peerConnection = null;
    this.pendingRemoteCandidates = [];
    this.pendingSignalQueue = [];
  }

  private closeSignalSocket(reason?: string) {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    if (reason) {
      socket.close(1000, reason.slice(0, 123));
      return;
    }
    socket.close();
  }

  private startSignalHeartbeat() {
    this.clearSignalHeartbeatTimer();
    const sendHeartbeat = () => {
      const socket = this.socket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ type: "heartbeat", sentAt: Date.now() }));
      } catch {
        socket.close();
      }
    };
    sendHeartbeat();
    this.signalHeartbeatTimer = window.setInterval(sendHeartbeat, SIGNAL_HEARTBEAT_INTERVAL_MS);
  }

  private startRoomStatusWatchdog() {
    this.clearRoomStatusWatchdogTimer();
    this.roomStatusWatchdogTimer = window.setInterval(() => {
      void this.verifyRoomStillExists();
    }, ROOM_STATUS_WATCHDOG_INTERVAL_MS);
  }

  private async verifyRoomStillExists() {
    if (!this.roomCode || this.destroyed) return true;
    try {
      const status = await getSignalingRoomStatus(this.roomCode);
      if (status.exists) return true;
      this.handleRoomClosed(MULTIPLAYER_ROOM_EXPIRED_REASON);
      return false;
    } catch {
      return true;
    }
  }

  private handleRoomClosed(reason?: string) {
    if (this.destroyed) return;
    const message = reason === MULTIPLAYER_ROOM_EXPIRED_REASON ? MULTIPLAYER_ROOM_EXPIRED_MESSAGE : MULTIPLAYER_DISCONNECTED_MESSAGE;
    this.events.onDisconnected?.(message);
    this.dispose();
  }

  private handleFailure(message: string) {
    if (this.destroyed) return;
    this.events.onFailed?.(message);
    this.dispose();
  }

  private handleDisconnected(message: string) {
    if (this.destroyed) return;
    this.events.onDisconnected?.(message);
    this.dispose();
  }

  private handlePeerConnectionFailure(message: string) {
    if (this.destroyed) return;
    this.reportIceFailure(message);
    this.closePeerConnection();
    if (this.role === "host") {
      this.events.onPeerDisconnected?.(message);
      return;
    }
    this.events.onDisconnected?.(message);
    this.dispose();
  }

  private scheduleIceRestart(message: string) {
    if (this.destroyed || this.iceRestartTimer !== null) return;
    if (this.iceRestartAttempts >= MAX_ICE_RESTART_ATTEMPTS) {
      this.handlePeerConnectionFailure(message);
      return;
    }
    this.iceRestartAttempts += 1;
    this.iceRestartTimer = window.setTimeout(() => {
      this.iceRestartTimer = null;
      if (this.destroyed) return;
      if (this.role === "host") {
        void this.createOffer({ iceRestart: true });
        return;
      }
      this.sendSignal({ type: "restart-request" });
      this.startDataChannelOpenTimer();
    }, ICE_RESTART_DELAY_MS);
  }

  private scheduleSignalReconnect() {
    if (this.destroyed || this.signalReconnectTimer !== null || !this.roomCode) return;
    const delay = Math.min(SIGNAL_RECONNECT_DELAY_MS * 2 ** this.signalReconnectAttempts, SIGNAL_RECONNECT_MAX_DELAY_MS);
    this.signalReconnectAttempts += 1;
    this.signalReconnectTimer = window.setTimeout(() => {
      this.signalReconnectTimer = null;
      void (async () => {
        if (this.destroyed || (!this.connected && !this.signalReady)) return;
        try {
          await this.openSignalSocket({ reconnect: true });
        } catch {
          if (this.destroyed || (!this.connected && !this.signalReady)) return;
          if (!(await this.verifyRoomStillExists())) return;
          this.scheduleSignalReconnect();
        }
      })();
    }, delay);
  }

  private clearSignalOpenTimer() {
    if (this.signalOpenTimer === null) return;
    window.clearTimeout(this.signalOpenTimer);
    this.signalOpenTimer = null;
  }

  private clearSignalReconnectTimer() {
    if (this.signalReconnectTimer === null) return;
    window.clearTimeout(this.signalReconnectTimer);
    this.signalReconnectTimer = null;
  }

  private clearSignalHeartbeatTimer() {
    if (this.signalHeartbeatTimer === null) return;
    window.clearInterval(this.signalHeartbeatTimer);
    this.signalHeartbeatTimer = null;
  }

  private clearRoomStatusWatchdogTimer() {
    if (this.roomStatusWatchdogTimer === null) return;
    window.clearInterval(this.roomStatusWatchdogTimer);
    this.roomStatusWatchdogTimer = null;
  }

  private clearDataChannelOpenTimer() {
    if (this.dataChannelOpenTimer === null) return;
    window.clearTimeout(this.dataChannelOpenTimer);
    this.dataChannelOpenTimer = null;
  }

  private clearTimeSyncTimer() {
    if (this.timeSyncTimer === null) return;
    window.clearInterval(this.timeSyncTimer);
    this.timeSyncTimer = null;
  }

  private clearIceRestartTimer() {
    if (this.iceRestartTimer === null) return;
    window.clearTimeout(this.iceRestartTimer);
    this.iceRestartTimer = null;
  }
}
