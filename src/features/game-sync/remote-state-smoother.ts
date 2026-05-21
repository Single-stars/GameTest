"use client";

import type { SelfGameState } from "@/features/game-sync/types";

export type RemoteStateSmootherOptions = {
  interpolationDelayMs?: number;
  maxExtrapolationMs?: number;
  maxBufferMs?: number;
  staleStopExtrapolationMs?: number;
};

type BufferedRemoteState = SelfGameState & {
  receivedAt: number;
  x: number;
  y: number;
  cameraY: number;
};

const DEFAULT_INTERPOLATION_DELAY_MS = 80;
const DEFAULT_MAX_EXTRAPOLATION_MS = 100;
const DEFAULT_MAX_BUFFER_MS = 1_000;
const DEFAULT_STALE_STOP_EXTRAPOLATION_MS = 250;

function hasCoordinates(state: SelfGameState): state is SelfGameState & { x: number; y: number; cameraY: number } {
  return (
    typeof state.x === "number" &&
    Number.isFinite(state.x) &&
    typeof state.y === "number" &&
    Number.isFinite(state.y) &&
    typeof state.cameraY === "number" &&
    Number.isFinite(state.cameraY)
  );
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

export class RemoteStateSmoother {
  private readonly interpolationDelayMs: number;
  private readonly maxExtrapolationMs: number;
  private readonly maxBufferMs: number;
  private readonly staleStopExtrapolationMs: number;
  private buffer: BufferedRemoteState[] = [];
  private latestSeq = -1;

  constructor(options: RemoteStateSmootherOptions = {}) {
    this.interpolationDelayMs = options.interpolationDelayMs ?? DEFAULT_INTERPOLATION_DELAY_MS;
    this.maxExtrapolationMs = options.maxExtrapolationMs ?? DEFAULT_MAX_EXTRAPOLATION_MS;
    this.maxBufferMs = options.maxBufferMs ?? DEFAULT_MAX_BUFFER_MS;
    this.staleStopExtrapolationMs = options.staleStopExtrapolationMs ?? DEFAULT_STALE_STOP_EXTRAPOLATION_MS;
  }

  push(state: SelfGameState, receivedAt: number): boolean {
    if (!hasCoordinates(state)) return false;
    const seq = state.seq;
    if (typeof seq === "number") {
      if (seq <= this.latestSeq) return false;
      this.latestSeq = seq;
    }

    this.buffer.push({ ...state, receivedAt });
    this.buffer.sort((left, right) => left.receivedAt - right.receivedAt);
    const minReceivedAt = receivedAt - this.maxBufferMs;
    this.buffer = this.buffer.filter((sample) => sample.receivedAt >= minReceivedAt);
    return true;
  }

  reset() {
    this.buffer = [];
    this.latestSeq = -1;
  }

  sample(now: number): SelfGameState | null {
    if (this.buffer.length === 0) return null;
    const renderAt = now - this.interpolationDelayMs;
    const latest = this.buffer[this.buffer.length - 1];
    if (renderAt >= latest.receivedAt) {
      if (now - latest.receivedAt > this.staleStopExtrapolationMs) return latest;
      if (this.buffer.length < 2 || latest.status !== "playing") return latest;
      const previous = this.buffer[this.buffer.length - 2];
      const duration = latest.receivedAt - previous.receivedAt;
      if (duration <= 0) return latest;
      const extrapolatedAt = Math.min(renderAt, latest.receivedAt + this.maxExtrapolationMs);
      const t = (extrapolatedAt - latest.receivedAt) / duration;
      return {
        ...latest,
        x: latest.x + (latest.x - previous.x) * t,
        y: latest.y + (latest.y - previous.y) * t,
        cameraY: latest.cameraY + (latest.cameraY - previous.cameraY) * t,
      };
    }

    let previous = this.buffer[0];
    let next = latest;

    for (let index = 0; index < this.buffer.length; index += 1) {
      const sample = this.buffer[index];
      if (sample.receivedAt <= renderAt) previous = sample;
      if (sample.receivedAt >= renderAt) {
        next = sample;
        break;
      }
    }

    if (previous === next || next.receivedAt === previous.receivedAt) {
      return previous;
    }

    const t = Math.max(0, Math.min(1, (renderAt - previous.receivedAt) / (next.receivedAt - previous.receivedAt)));
    return {
      ...next,
      x: lerp(previous.x, next.x, t),
      y: lerp(previous.y, next.y, t),
      cameraY: lerp(previous.cameraY, next.cameraY, t),
    };
  }
}
