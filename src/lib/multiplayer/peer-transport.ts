"use client";

import Peer, { type DataConnection, type PeerError, type PeerJSOption } from "peerjs";
import { parseNetMessage, serializeNetMessage } from "@/lib/multiplayer/messages";
import type { NetMessage } from "@/lib/multiplayer/types";

export const MULTIPLAYER_FAILED_MESSAGE = "当前网络无法直连，请换个网络或重新创建房间。";
export const MULTIPLAYER_DISCONNECTED_MESSAGE = "对方已断开，联机已结束。";

export type PeerTransportEvents = {
  onPeerOpen?: (peerId: string) => void;
  onConnected?: (remotePeerId: string) => void;
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
        if (this.destroyed || settled) return;
        settled = true;
        this.clearPeerOpenTimer();
        this.localPeerId = id;
        this.events.onPeerOpen?.(id);

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
        if (!settled) {
          settled = true;
          this.clearPeerOpenTimer();
        }
        this.handlePeerError(error);
        reject(error);
      });

      peer.on("disconnected", () => {
        if (this.destroyed) return;
        this.handleDisconnected(MULTIPLAYER_DISCONNECTED_MESSAGE);
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
    this.connection?.close();
    this.connection = null;
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  private bindHostIncomingConnection(peer: Peer) {
    peer.on("connection", (connection) => {
      if (this.connection && this.connection.open) {
        connection.close();
        return;
      }
      this.bindConnection(connection);
    });
  }

  private connectToHost(hostId: string) {
    if (!this.peer) return;
    const connection = this.peer.connect(hostId, {
      reliable: false,
      serialization: "json",
    });
    this.bindConnection(connection);
  }

  private bindConnection(connection: DataConnection) {
    this.connection = connection;
    this.connectTimer = window.setTimeout(() => {
      if (connection.open) return;
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
    }, CONNECT_TIMEOUT_MS);

    connection.on("open", () => {
      this.clearConnectTimer();
      this.events.onConnected?.(connection.peer);
    });

    connection.on("data", (data) => {
      const parsed = parseNetMessage(data);
      if (!parsed) return;
      this.events.onMessage?.(parsed);
    });

    connection.on("close", () => {
      if (this.destroyed) return;
      this.handleDisconnected(MULTIPLAYER_DISCONNECTED_MESSAGE);
    });

    connection.on("error", () => {
      if (this.destroyed) return;
      this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
    });
  }

  private handlePeerError(error: PeerError<string>) {
    console.warn("[multiplayer] peer error", error.type, error.message);
    if (this.destroyed) return;
    this.handleFailure(MULTIPLAYER_FAILED_MESSAGE);
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
}
