"use client";

import Peer, { type DataConnection, type PeerError, type PeerJSOption } from "peerjs";
import { parseNetMessage, serializeNetMessage } from "@/lib/multiplayer/messages";
import type { NetMessage } from "@/lib/multiplayer/types";

export const MULTIPLAYER_FAILED_MESSAGE = "当前网络无法直连，请换个网络或重新创建房间。";
export const MULTIPLAYER_DISCONNECTED_MESSAGE = "对方已断开，联机已结束。";

export type PeerTransportEvents = {
  onPeerOpen?: (peerId: string) => void;
  onConnected?: (remotePeerId: string) => void;
  onPeerDisconnected?: (reason: string) => void;
  onMessage?: (message: NetMessage) => void;
  onFailed?: (message: string) => void;
  onDisconnected?: (message: string) => void;
};

export type PeerTransportOptions = {
  role: "host" | "guest";
  roomId?: string | null;
  peerOptions?: PeerJSOption;
  events?: PeerTransportEvents;
};

const PEER_OPEN_TIMEOUT_MS = 12_000;
const CONNECT_TIMEOUT_MS = 12_000;
const SERVER_RECOVERY_WINDOW_MS = 30_000;
const SERVER_RECONNECT_RETRY_MS = 1_000;
const GUEST_RECONNECT_RETRY_MS = 1_200;
const MAX_GUEST_RECONNECT_ATTEMPTS = 8;
const HOST_STALE_CONNECTION_REPLACE_MS = 9_000;

export class PeerTransport {
  private readonly role: "host" | "guest";
  private readonly targetRoomId: string | null;
  private readonly peerOptions?: PeerJSOption;
  private readonly events: PeerTransportEvents;
  private peer: Peer | null = null;
  private connection: DataConnection | null = null;
  private destroyed = false;
  private peerOpenTimer: number | null = null;
  private connectTimer: number | null = null;
  private localPeerId: string | null = null;
  private activeHostId: string | null = null;
  private guestReconnectAttempts = 0;
  private guestReconnectTimer: number | null = null;
  private serverReconnectTimer: number | null = null;
  private serverRecoveryDeadline = 0;
  private lastConnectionActivityAt = 0;

  constructor(options: PeerTransportOptions) {
    this.role = options.role;
    this.targetRoomId = options.roomId ?? null;
    this.peerOptions = options.peerOptions;
    this.events = options.events ?? {};
  }

  get roomId() {
    return this.localPeerId;
  }

  get isConnected() {
    return this.connection?.open === true;
  }

  async start(): Promise<string | null> {
    this.destroyed = false;
    this.activeHostId = this.role === "guest" ? this.targetRoomId : null;
    this.guestReconnectAttempts = 0;
    this.serverRecoveryDeadline = 0;
    this.lastConnectionActivityAt = 0;
    this.clearGuestReconnectTimer();
    this.clearServerReconnectTimer();

    return new Promise<string | null>((resolve, reject) => {
      const peer = this.peerOptions ? new Peer(this.peerOptions) : new Peer();
      this.peer = peer;
      let settled = false;

      this.peerOpenTimer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
        reject(new Error("peer-open-timeout"));
      }, PEER_OPEN_TIMEOUT_MS);

      peer.on("open", (id) => {
        if (this.destroyed) return;
        this.clearPeerOpenTimer();
        this.clearServerReconnectTimer();
        this.serverRecoveryDeadline = 0;

        if (this.localPeerId !== id) {
          this.localPeerId = id;
          this.events.onPeerOpen?.(id);
        }

        if (settled) {
          if (this.role === "guest" && this.activeHostId && !this.connection?.open) {
            this.connectToHost(this.activeHostId);
          }
          return;
        }

        settled = true;

        if (this.role === "host") {
          this.bindHostIncomingConnection(peer);
          resolve(id);
          return;
        }

        const targetId = this.targetRoomId;
        if (!targetId) {
          this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
          reject(new Error("missing-host-id"));
          return;
        }
        this.connectToHost(targetId);
        resolve(id);
      });

      peer.on("error", (error) => {
        this.handlePeerError(error);
        if (!settled) {
          settled = true;
          this.clearPeerOpenTimer();
          reject(error);
        }
      });

      peer.on("disconnected", () => {
        if (this.destroyed) return;
        this.scheduleServerReconnectAttempt();
      });
    });
  }

  send(message: NetMessage) {
    if (!this.connection || !this.connection.open) return;
    this.connection.send(serializeNetMessage(message));
  }

  close(reason?: string) {
    if (this.connection && this.connection.open && reason) {
      this.connection.send(
        serializeNetMessage({
          v: 1,
          kind: "bye",
          reason,
        }),
      );
    }
    this.dispose();
  }

  dispose() {
    this.destroyed = true;
    this.clearPeerOpenTimer();
    this.clearConnectTimer();
    this.clearGuestReconnectTimer();
    this.clearServerReconnectTimer();
    this.serverRecoveryDeadline = 0;
    this.connection?.close();
    this.connection = null;
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  disconnectActiveConnection() {
    const connection = this.connection;
    if (!connection) return;
    this.clearConnectTimer();
    this.connection = null;
    this.lastConnectionActivityAt = 0;
    connection.close();
  }

  private bindHostIncomingConnection(peer: Peer) {
    peer.on("connection", (connection) => {
      if (this.connection && this.connection.open) {
        if (Date.now() - this.lastConnectionActivityAt > HOST_STALE_CONNECTION_REPLACE_MS) {
          this.disconnectActiveConnection();
        } else {
          connection.close();
          return;
        }
      }
      if (this.connection && !this.connection.open) {
        this.connection = null;
      }
      this.bindConnection(connection);
    });
  }

  private connectToHost(hostId: string) {
    if (!this.peer) return;
    this.activeHostId = hostId;
    this.clearConnectTimer();
    const connection = this.peer.connect(hostId, {
      reliable: false,
      serialization: "json",
    });
    this.bindConnection(connection, hostId);
  }

  private bindConnection(connection: DataConnection, hostId?: string) {
    this.connection = connection;
    this.lastConnectionActivityAt = Date.now();
    this.connectTimer = window.setTimeout(() => {
      if (connection.open) return;
      if (this.destroyed) return;
      if (this.connection !== connection) return;
      if (this.role === "guest" && hostId) {
        this.scheduleGuestReconnectAttempt(hostId);
        return;
      }
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
    }, CONNECT_TIMEOUT_MS);

    connection.on("open", () => {
      if (this.connection !== connection) return;
      this.clearConnectTimer();
      this.clearGuestReconnectTimer();
      this.guestReconnectAttempts = 0;
      this.lastConnectionActivityAt = Date.now();
      this.events.onConnected?.(connection.peer);
    });

    connection.on("data", (data) => {
      if (this.connection !== connection) return;
      this.lastConnectionActivityAt = Date.now();
      const parsed = parseNetMessage(data);
      if (!parsed) return;
      this.events.onMessage?.(parsed);
    });

    connection.on("close", () => {
      if (this.destroyed) return;
      if (this.connection !== connection) return;
      this.clearConnectTimer();
      if (this.role === "guest" && hostId) {
        this.scheduleGuestReconnectAttempt(hostId);
        return;
      }
      if (this.role === "host") {
        this.connection = null;
        this.events.onPeerDisconnected?.(MULTIPLAYER_DISCONNECTED_MESSAGE);
        return;
      }
      this.handleDisconnected(MULTIPLAYER_DISCONNECTED_MESSAGE);
    });

    connection.on("error", () => {
      if (this.destroyed) return;
      if (this.connection !== connection) return;
      this.clearConnectTimer();
      if (this.role === "guest" && hostId) {
        this.scheduleGuestReconnectAttempt(hostId);
        return;
      }
      if (this.role === "host") {
        this.connection = null;
        this.events.onPeerDisconnected?.(MULTIPLAYER_DISCONNECTED_MESSAGE);
        return;
      }
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
    });
  }

  private handlePeerError(error: PeerError<string>) {
    console.warn("[multiplayer] peer error", error.type, error.message);
    if (this.destroyed) return;
    if (error.type === "peer-unavailable" && this.role === "guest" && this.activeHostId) {
      this.scheduleGuestReconnectAttempt(this.activeHostId);
      return;
    }
    if (this.isRecoverablePeerErrorType(error.type)) {
      this.scheduleServerReconnectAttempt();
      return;
    }
    this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
  }

  private isRecoverablePeerErrorType(type: string) {
    return (
      type === "network" ||
      type === "server-error" ||
      type === "socket-error" ||
      type === "socket-closed" ||
      type === "disconnected"
    );
  }

  private scheduleGuestReconnectAttempt(hostId: string) {
    if (this.destroyed || this.role !== "guest") return;
    if (this.connection?.open) return;
    if (this.guestReconnectAttempts >= MAX_GUEST_RECONNECT_ATTEMPTS) {
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
      return;
    }
    if (this.guestReconnectTimer !== null) return;

    this.guestReconnectTimer = window.setTimeout(() => {
      this.guestReconnectTimer = null;
      if (this.destroyed) return;
      if (this.connection?.open) return;

      this.guestReconnectAttempts += 1;
      const peer = this.peer;
      if (!peer) return;

      if (peer.disconnected) {
        this.scheduleServerReconnectAttempt();
        this.scheduleGuestReconnectAttempt(hostId);
        return;
      }
      this.connectToHost(hostId);
    }, GUEST_RECONNECT_RETRY_MS);
  }

  private scheduleServerReconnectAttempt() {
    if (this.destroyed) return;
    const peer = this.peer;
    if (!peer) return;
    if (!peer.disconnected) return;

    if (this.serverRecoveryDeadline === 0) {
      this.serverRecoveryDeadline = Date.now() + SERVER_RECOVERY_WINDOW_MS;
    }
    if (Date.now() > this.serverRecoveryDeadline) {
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
      return;
    }
    if (this.serverReconnectTimer !== null) return;

    this.serverReconnectTimer = window.setTimeout(() => {
      this.serverReconnectTimer = null;
      if (this.destroyed) return;
      const currentPeer = this.peer;
      if (!currentPeer) return;
      if (!currentPeer.disconnected) {
        this.serverRecoveryDeadline = 0;
        return;
      }

      try {
        currentPeer.reconnect();
      } catch {
        // reconnect can throw when peer state is not recoverable.
      }
      this.scheduleServerReconnectAttempt();
    }, SERVER_RECONNECT_RETRY_MS);
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

  private clearPeerOpenTimer() {
    if (this.peerOpenTimer === null) return;
    window.clearTimeout(this.peerOpenTimer);
    this.peerOpenTimer = null;
  }

  private clearConnectTimer() {
    if (this.connectTimer === null) return;
    window.clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private clearGuestReconnectTimer() {
    if (this.guestReconnectTimer === null) return;
    window.clearTimeout(this.guestReconnectTimer);
    this.guestReconnectTimer = null;
  }

  private clearServerReconnectTimer() {
    if (this.serverReconnectTimer === null) return;
    window.clearTimeout(this.serverReconnectTimer);
    this.serverReconnectTimer = null;
  }
}
