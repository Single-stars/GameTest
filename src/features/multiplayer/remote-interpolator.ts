import {
  REMOTE_INTERPOLATION_DELAY_MS,
  REMOTE_MAX_PREDICTION_MS,
  REMOTE_STALE_MS,
  resolveRealtimeStateAnim,
  resolveRealtimeStateTime,
  toRealtimeStatePacket,
  type RealtimeStatePacket,
  type RealtimeStateSource,
} from "./net-protocol.ts";

export type RemoteInterpolatorOptions = {
  interpolationDelayMs?: number;
  maxPredictionMs?: number;
  maxBufferMs?: number;
  staleMs?: number;
};

export type RemoteInterpolatorPushOptions = {
  remoteTimeOffsetMs?: number | null;
};

export type InterpolatedRemoteState<TState extends RealtimeStateSource = RealtimeStateSource> = TState &
  RealtimeStatePacket & {
    networkUnstable: boolean;
    predicted: boolean;
    receivedAt: number;
    remoteTimeLocal: number;
  };

type BufferedRemoteState<TState extends RealtimeStateSource> = {
  hasVelocityX: boolean;
  hasVelocityY: boolean;
  packet: RealtimeStatePacket;
  receivedAt: number;
  remoteTime: number;
  remoteTimeLocal: number;
  source: TState;
};

const DEFAULT_MAX_BUFFER_MS = 1_000;
const HERMITE_MAX_INTERVAL_MS = 250;
const OPTIONAL_NUMERIC_FIELDS = [
  "cameraX",
  "cameraY",
  "cameraScale",
  "charge",
  "exitingPlatformOffsetY",
  "nextPlatformOffsetY",
  "score",
] as const;

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function lerpAngle(start: number, end: number, t: number) {
  const delta = ((end - start + 540) % 360) - 180;
  return normalizeAngle(start + delta * t);
}

function hermite(start: number, startVelocity: number, end: number, endVelocity: number, t: number, dtMs: number) {
  const dtSeconds = dtMs / 1000;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * start + h10 * dtSeconds * startVelocity + h01 * end + h11 * dtSeconds * endVelocity;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function lerpOptional(previous: unknown, next: unknown, t: number) {
  if (!finiteNumber(previous) || !finiteNumber(next)) return next;
  return lerp(previous, next, t);
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function withPacketFields<TState extends RealtimeStateSource>(
  source: TState,
  packet: RealtimeStatePacket,
  receivedAt: number,
  remoteTimeLocal: number,
  networkUnstable: boolean,
  predicted: boolean,
): InterpolatedRemoteState<TState> {
  return {
    ...source,
    ...packet,
    anim: packet.anim || resolveRealtimeStateAnim(source),
    networkUnstable,
    predicted,
    receivedAt,
    remoteTimeLocal,
  };
}

export class RemoteInterpolator<TState extends RealtimeStateSource = RealtimeStateSource> {
  private readonly interpolationDelayMs: number;
  private readonly maxPredictionMs: number;
  private readonly maxBufferMs: number;
  private readonly staleMs: number;
  private buffer: BufferedRemoteState<TState>[] = [];
  private latestSeq = -1;
  private latestRemoteTime = -Infinity;
  private latestProgress: number | null = null;
  private latestRemoteTimeOffsetMs: number | null = null;
  private playbackReferenceReceivedAt: number | null = null;
  private playbackReferenceRemoteTime: number | null = null;

  constructor(options: RemoteInterpolatorOptions = {}) {
    this.interpolationDelayMs = options.interpolationDelayMs ?? REMOTE_INTERPOLATION_DELAY_MS;
    this.maxPredictionMs = options.maxPredictionMs ?? REMOTE_MAX_PREDICTION_MS;
    this.maxBufferMs = options.maxBufferMs ?? DEFAULT_MAX_BUFFER_MS;
    this.staleMs = options.staleMs ?? REMOTE_STALE_MS;
  }

  push(state: TState, receivedAt: number, options: RemoteInterpolatorPushOptions = {}): boolean {
    const packet = toRealtimeStatePacket(state, receivedAt);
    if (!packet) return false;
    if (finiteNumber(state.seq) && state.seq <= this.latestSeq) return false;
    const remoteTime = resolveRealtimeStateTime(state, receivedAt);
    if (!state.forceSnap && remoteTime <= this.latestRemoteTime) return false;

    if (finiteNumber(state.seq)) this.latestSeq = state.seq;
    this.latestRemoteTime = remoteTime;
    if (state.forceSnap) {
      this.buffer = [];
      this.latestProgress = null;
      this.playbackReferenceReceivedAt = null;
      this.playbackReferenceRemoteTime = null;
    }
    if (this.playbackReferenceReceivedAt === null || this.playbackReferenceRemoteTime === null) {
      this.playbackReferenceReceivedAt = receivedAt;
      this.playbackReferenceRemoteTime = remoteTime;
    }

    const nextOffset = finiteNumber(options.remoteTimeOffsetMs)
      ? options.remoteTimeOffsetMs
      : finiteNumber(state.remoteTimeOffsetMs)
        ? state.remoteTimeOffsetMs
        : this.latestRemoteTimeOffsetMs;
    if (finiteNumber(nextOffset)) {
      this.latestRemoteTimeOffsetMs = nextOffset;
    }
    const remoteTimeLocal = finiteNumber(nextOffset)
      ? remoteTime + nextOffset
      : this.playbackReferenceReceivedAt + (remoteTime - this.playbackReferenceRemoteTime);
    if (finiteNumber(nextOffset)) {
      this.buffer = this.buffer.map((sample) => ({
        ...sample,
        remoteTimeLocal: sample.remoteTime + nextOffset,
      }));
    }

    const nextProgress =
      this.latestProgress !== null && packet.progress < this.latestProgress && !state.forceSnap
        ? this.latestProgress
        : packet.progress;
    this.latestProgress = nextProgress;
    const normalizedPacket = { ...packet, progress: nextProgress, t: remoteTime };
    const normalizedSource = nextProgress === (state as RealtimeStateSource).progress
      ? state
      : ({ ...state, progress: nextProgress } as TState);

    this.buffer.push({
      hasVelocityX: finiteNumber(state.vx),
      hasVelocityY: finiteNumber(state.vy),
      packet: normalizedPacket,
      receivedAt,
      remoteTime,
      remoteTimeLocal,
      source: normalizedSource,
    });
    this.buffer.sort((left, right) => left.remoteTimeLocal - right.remoteTimeLocal);
    const minReceivedAt = receivedAt - this.maxBufferMs;
    this.buffer = this.buffer.filter((sample) => sample.receivedAt >= minReceivedAt);
    return true;
  }

  reset() {
    this.buffer = [];
    this.latestSeq = -1;
    this.latestRemoteTime = -Infinity;
    this.latestProgress = null;
    this.latestRemoteTimeOffsetMs = null;
    this.playbackReferenceReceivedAt = null;
    this.playbackReferenceRemoteTime = null;
  }

  sample(now: number): InterpolatedRemoteState<TState> | null {
    if (this.buffer.length === 0) return null;
    const renderAt = now - this.interpolationDelayMs;
    const latest = this.buffer[this.buffer.length - 1];
    const networkUnstable = now - latest.receivedAt > this.staleMs;

    if (renderAt >= latest.remoteTimeLocal) {
      if (networkUnstable) {
        return withPacketFields(latest.source, latest.packet, latest.receivedAt, latest.remoteTimeLocal, true, false);
      }
      const predictionMs = Math.min(Math.max(0, renderAt - latest.remoteTimeLocal), this.maxPredictionMs);
      if (predictionMs <= 0) {
        return withPacketFields(latest.source, latest.packet, latest.receivedAt, latest.remoteTimeLocal, false, false);
      }
      const predictionSeconds = predictionMs / 1000;
      return withPacketFields(
        latest.source,
        {
          ...latest.packet,
          x: latest.packet.x + latest.packet.vx * predictionSeconds,
          y: latest.packet.y + latest.packet.vy * predictionSeconds,
        },
        latest.receivedAt,
        latest.remoteTimeLocal,
        false,
        true,
      );
    }

    let previous = this.buffer[0];
    let next = latest;
    for (const sample of this.buffer) {
      if (sample.remoteTimeLocal <= renderAt) previous = sample;
      if (sample.remoteTimeLocal >= renderAt) {
        next = sample;
        break;
      }
    }

    if (previous === next || previous.remoteTimeLocal === next.remoteTimeLocal) {
      return withPacketFields(previous.source, previous.packet, previous.receivedAt, previous.remoteTimeLocal, networkUnstable, false);
    }

    const dtMs = next.remoteTimeLocal - previous.remoteTimeLocal;
    const t = clampUnit((renderAt - previous.remoteTimeLocal) / dtMs);
    const source = { ...previous.source } as Record<string, unknown>;
    for (const key of OPTIONAL_NUMERIC_FIELDS) {
      const nextValue = lerpOptional((previous.source as Record<string, unknown>)[key], (next.source as Record<string, unknown>)[key], t);
      if (nextValue !== undefined) source[key] = nextValue;
    }
    const canHermiteX = previous.hasVelocityX && next.hasVelocityX && dtMs > 0 && dtMs <= HERMITE_MAX_INTERVAL_MS;
    const canHermiteY = previous.hasVelocityY && next.hasVelocityY && dtMs > 0 && dtMs <= HERMITE_MAX_INTERVAL_MS;

    return withPacketFields(
      source as TState,
      {
        type: "state",
        seq: previous.packet.seq,
        t: lerp(previous.packet.t, next.packet.t, t),
        x: canHermiteX
          ? hermite(previous.packet.x, previous.packet.vx, next.packet.x, next.packet.vx, t, dtMs)
          : lerp(previous.packet.x, next.packet.x, t),
        y: canHermiteY
          ? hermite(previous.packet.y, previous.packet.vy, next.packet.y, next.packet.vy, t, dtMs)
          : lerp(previous.packet.y, next.packet.y, t),
        vx: lerp(previous.packet.vx, next.packet.vx, t),
        vy: lerp(previous.packet.vy, next.packet.vy, t),
        angle: lerpAngle(previous.packet.angle, next.packet.angle, t),
        progress: lerp(previous.packet.progress, next.packet.progress, t),
        anim: previous.packet.anim,
      },
      previous.receivedAt,
      lerp(previous.remoteTimeLocal, next.remoteTimeLocal, t),
      false,
      false,
    );
  }
}
