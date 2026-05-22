"use client";

import { parseNetMessage, serializeNetMessage } from "@/lib/multiplayer/messages";
import {
  buildRoomWebSocketUrl,
  createSignalingRoom,
  isRoomCode,
  normalizeRoomCode,
  readStoredRoomToken,
  writeStoredRoomToken,
  type SignalingRole,
} from "@/lib/multiplayer/room-api";
import type { NetMessage } from "@/lib/multiplayer/types";

export const MULTIPLAYER_FAILED_MESSAGE = "当前网络无法建立联机，请换个网络或重新创建房间。";
export const MULTIPLAYER_DISCONNECTED_MESSAGE = "对方已断开，联机已结束。";

const SIGNAL_OPEN_TIMEOUT_MS = 12_000;
const DATA_CHANNEL_OPEN_TIMEOUT_MS = 15_000;
const ICE_RESTART_DELAY_MS = 1_200;
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

export const ENABLE_TURN = false;
export const ENABLE_RELAY = false;

export type RoomSignalTransportEvents = {
  onPeerOpen?: (roomCode: string) => void;
  onConnected?: (remotePeerId: string) => void;
  onPeerDisconnected?: (reason: string) => void;
  onMessage?: (message: NetMessage) => void;
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

type ServerMessage =
  | { type: "ready"; role: SignalingRole; roomCode: string; token: string; expiresAt: number }
  | { type: "peer-joined" }
  | { type: "peer-left"; reason?: string }
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
  if (payload.type === "peer-joined") return { type: "peer-joined" };
  if (payload.type === "peer-left") return { type: "peer-left", reason: typeof payload.reason === "string" ? payload.reason : undefined };
  if (payload.type === "signal" && isSignalPayload(payload.signal)) return { type: "signal", signal: payload.signal };
  if (payload.type === "error") return { type: "error", message: typeof payload.message === "string" ? payload.message : MULTIPLAYER_FAILED_MESSAGE };
  return null;
}

function channelIsOpen(channel: RTCDataChannel | null): channel is RTCDataChannel {
  return channel?.readyState === "open";
}

export class RoomSignalTransport {
  private readonly role: SignalingRole;
  private readonly targetRoomId: string | null;
  private readonly events: RoomSignalTransportEvents;
  private socket: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private controlChannel: RTCDataChannel | null = null;
  private stateChannel: RTCDataChannel | null = null;
  private destroyed = false;
  private connected = false;
  private roomCode: string | null = null;
  private roleToken: string | null = null;
  private signalOpenTimer: number | null = null;
  private dataChannelOpenTimer: number | null = null;
  private iceRestartTimer: number | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  constructor(options: RoomSignalTransportOptions) {
    this.role = options.role;
    this.targetRoomId = options.roomId ? normalizeRoomCode(options.roomId) : null;
    this.events = options.events ?? {};
  }

  get isConnected() {
    return this.connected && channelIsOpen(this.controlChannel);
  }

  async start() {
    this.destroyed = false;
    this.connected = false;
    this.pendingIceCandidates = [];

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
    const preferredChannel = message.kind === "state" ? this.stateChannel : this.controlChannel;
    if (channelIsOpen(preferredChannel)) {
      preferredChannel.send(serialized);
      return;
    }
    const fallbackChannel = this.controlChannel;
    if (channelIsOpen(fallbackChannel)) {
      fallbackChannel.send(serialized);
    }
  }

  close(reason?: string) {
    if (reason && channelIsOpen(this.controlChannel)) {
      this.controlChannel?.send(serializeNetMessage({ v: 1, kind: "bye", reason }));
    }
    this.dispose();
  }

  dispose() {
    this.destroyed = true;
    this.clearSignalOpenTimer();
    this.clearDataChannelOpenTimer();
    this.clearIceRestartTimer();
    this.closePeerConnection();
    this.socket?.close();
    this.socket = null;
  }

  disconnectActiveConnection() {
    this.closePeerConnection();
  }

  private async openSignalSocket() {
    if (!this.roomCode) throw new Error("missing-room-code");
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
        this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
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
        this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
        reject(new Error("signal-open-error"));
      };
    });

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message = parseServerMessage(event.data);
      if (!message) return;
      void this.handleServerMessage(message);
    };

    socket.onclose = () => {
      if (this.destroyed) return;
      if (this.connected) {
        this.handleDisconnected(MULTIPLAYER_DISCONNECTED_MESSAGE);
        return;
      }
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
    };
  }

  private async handleServerMessage(message: ServerMessage) {
    if (this.destroyed) return;
    switch (message.type) {
      case "ready":
        this.roomCode = normalizeRoomCode(message.roomCode);
        this.roleToken = message.token;
        writeStoredRoomToken(this.roomCode, message.role, message.token);
        if (this.role === "host") this.preparePeerConnection();
        break;
      case "peer-joined":
        if (this.role === "host") {
          await this.createOffer(false);
        }
        break;
      case "peer-left":
        this.closePeerConnection();
        if (this.role === "host") {
          this.events.onPeerDisconnected?.(message.reason ?? MULTIPLAYER_DISCONNECTED_MESSAGE);
        } else {
          this.handleDisconnected(message.reason ?? MULTIPLAYER_DISCONNECTED_MESSAGE);
        }
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

    const peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnection = peerConnection;

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      this.sendSignal({ type: "ice", candidate: event.candidate.toJSON() });
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "failed" || peerConnection.connectionState === "disconnected") {
        this.scheduleIceRestart();
      }
      if (peerConnection.connectionState === "closed") {
        this.connected = false;
      }
    };

    if (this.role === "host") {
      this.bindDataChannel(peerConnection.createDataChannel("control", { ordered: true }), "control");
      this.bindDataChannel(peerConnection.createDataChannel("state", { ordered: false, maxRetransmits: 0 }), "state");
    } else {
      peerConnection.ondatachannel = (event) => {
        if (event.channel.label === "state") {
          this.bindDataChannel(event.channel, "state");
        } else {
          this.bindDataChannel(event.channel, "control");
        }
      };
    }

    return peerConnection;
  }

  private bindDataChannel(channel: RTCDataChannel, label: "control" | "state") {
    if (label === "control") {
      this.controlChannel = channel;
    } else {
      this.stateChannel = channel;
    }

    this.clearDataChannelOpenTimer();
    this.dataChannelOpenTimer = window.setTimeout(() => {
      if (this.destroyed || this.connected) return;
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
    }, DATA_CHANNEL_OPEN_TIMEOUT_MS);

    channel.onopen = () => {
      if (label === "control") this.markConnected();
    };

    channel.onmessage = (event) => {
      const parsed = parseNetMessage(event.data);
      if (!parsed) return;
      this.events.onMessage?.(parsed);
    };

    channel.onclose = () => {
      if (this.destroyed) return;
      if (label === "control" && this.connected) this.handleDisconnected(MULTIPLAYER_DISCONNECTED_MESSAGE);
    };

    channel.onerror = () => {
      if (this.destroyed) return;
      if (label === "control") this.scheduleIceRestart();
    };
  }

  private markConnected() {
    if (this.connected) return;
    this.connected = true;
    this.clearDataChannelOpenTimer();
    this.events.onConnected?.(this.role === "host" ? "guest" : "host");
  }

  private async createOffer(iceRestart: boolean) {
    const peerConnection = this.preparePeerConnection();
    const offer = await peerConnection.createOffer({ iceRestart });
    await peerConnection.setLocalDescription(offer);
    if (!peerConnection.localDescription) return;
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
      await peerConnection.setRemoteDescription(signal.description);
      await this.flushPendingIceCandidates();
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      if (!peerConnection.localDescription) return;
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
      await peerConnection.setRemoteDescription(signal.description);
      await this.flushPendingIceCandidates();
      return;
    }

    if (signal.type === "ice") {
      if (!peerConnection.remoteDescription) {
        this.pendingIceCandidates.push(signal.candidate);
        return;
      }
      await peerConnection.addIceCandidate(signal.candidate);
      return;
    }

    if (signal.type === "restart-request" && this.role === "host") {
      await this.createOffer(true);
    }
  }

  private async flushPendingIceCandidates() {
    const peerConnection = this.peerConnection;
    if (!peerConnection?.remoteDescription) return;
    const pending = this.pendingIceCandidates.splice(0);
    for (const candidate of pending) {
      await peerConnection.addIceCandidate(candidate);
    }
  }

  private scheduleIceRestart() {
    if (this.destroyed || this.iceRestartTimer !== null) return;
    this.iceRestartTimer = window.setTimeout(() => {
      this.iceRestartTimer = null;
      if (this.destroyed) return;
      const peerConnection = this.peerConnection;
      peerConnection?.restartIce();
      if (this.role === "host") {
        void this.createOffer(true);
      } else {
        this.sendSignal({ type: "restart-request" });
      }
    }, ICE_RESTART_DELAY_MS);
  }

  private sendSignal(signal: SignalPayload) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "signal", signal }));
  }

  private closePeerConnection() {
    this.connected = false;
    this.clearDataChannelOpenTimer();
    this.clearIceRestartTimer();
    this.controlChannel?.close();
    this.stateChannel?.close();
    this.peerConnection?.close();
    this.controlChannel = null;
    this.stateChannel = null;
    this.peerConnection = null;
    this.pendingIceCandidates = [];
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

  private clearSignalOpenTimer() {
    if (this.signalOpenTimer === null) return;
    window.clearTimeout(this.signalOpenTimer);
    this.signalOpenTimer = null;
  }

  private clearDataChannelOpenTimer() {
    if (this.dataChannelOpenTimer === null) return;
    window.clearTimeout(this.dataChannelOpenTimer);
    this.dataChannelOpenTimer = null;
  }

  private clearIceRestartTimer() {
    if (this.iceRestartTimer === null) return;
    window.clearTimeout(this.iceRestartTimer);
    this.iceRestartTimer = null;
  }
}
