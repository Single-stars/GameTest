export const STATE_CHANNEL_BACKPRESSURE_BYTES = 16 * 1024;
export const TIME_SYNC_INTERVAL_MS = 1_000;

export const MULTIPLAYER_STATE_CHANNEL_CONFIG = {
  ordered: false,
  maxRetransmits: 0,
} as const;

export function canSendRealtimeState(bufferedAmount: number) {
  return bufferedAmount <= STATE_CHANNEL_BACKPRESSURE_BYTES;
}

export type TimeSyncPingMessage = {
  v: 1;
  kind: "time-sync";
  mode: "ping";
  id: number;
  pingLocalTime: number;
};

export type TimeSyncPongMessage = {
  v: 1;
  kind: "time-sync";
  mode: "pong";
  id: number;
  pingLocalTime: number;
  remoteReceiveTime: number;
  remoteSendTime: number;
};

export type TimeSyncMessage = TimeSyncPingMessage | TimeSyncPongMessage;

export type RemoteClockSyncOptions = {
  maxRoundTripMs?: number;
  smoothing?: number;
};

function clampUnit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class RemoteClockSync {
  private readonly maxRoundTripMs: number;
  private readonly smoothing: number;
  private nextId = 1;
  private estimatedOffsetMs: number | null = null;
  private readonly pendingPings = new Map<number, number>();

  constructor(options: RemoteClockSyncOptions = {}) {
    this.maxRoundTripMs = options.maxRoundTripMs ?? 1_000;
    this.smoothing = clampUnit(options.smoothing ?? 0.2);
  }

  createPing(localTime: number): TimeSyncPingMessage {
    const id = this.nextId;
    this.nextId += 1;
    this.pendingPings.set(id, localTime);
    return {
      v: 1,
      kind: "time-sync",
      mode: "ping",
      id,
      pingLocalTime: localTime,
    };
  }

  handleMessage(message: TimeSyncMessage, localTime: number): TimeSyncPongMessage | number | null {
    if (message.mode === "ping") {
      return {
        v: 1,
        kind: "time-sync",
        mode: "pong",
        id: message.id,
        pingLocalTime: message.pingLocalTime,
        remoteReceiveTime: localTime,
        remoteSendTime: localTime,
      };
    }

    const pingLocalTime = this.pendingPings.get(message.id) ?? message.pingLocalTime;
    this.pendingPings.delete(message.id);
    const remoteProcessingMs = Math.max(0, message.remoteSendTime - message.remoteReceiveTime);
    const roundTripMs = localTime - pingLocalTime - remoteProcessingMs;
    if (!Number.isFinite(roundTripMs) || roundTripMs < 0 || roundTripMs > this.maxRoundTripMs) return null;

    const localMidpoint = (pingLocalTime + localTime) / 2;
    const remoteMidpoint = (message.remoteReceiveTime + message.remoteSendTime) / 2;
    const nextOffset = localMidpoint - remoteMidpoint;
    this.estimatedOffsetMs =
      this.estimatedOffsetMs === null
        ? nextOffset
        : this.estimatedOffsetMs + (nextOffset - this.estimatedOffsetMs) * this.smoothing;
    return this.estimatedOffsetMs;
  }

  getEstimatedOffsetMs() {
    return this.estimatedOffsetMs;
  }

  toLocalTime(remoteTime: number) {
    return this.estimatedOffsetMs === null ? null : remoteTime + this.estimatedOffsetMs;
  }

  reset() {
    this.pendingPings.clear();
    this.estimatedOffsetMs = null;
  }
}
