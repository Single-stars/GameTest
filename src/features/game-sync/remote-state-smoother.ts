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
  timelineAt: number;
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

function lerpOptional(previous: number | undefined, next: number | undefined, t: number) {
  if (typeof previous !== "number" || typeof next !== "number") return next;
  return lerp(previous, next, t);
}

function extrapolateOptional(previous: number | undefined, latest: number | undefined, t: number) {
  if (typeof previous !== "number" || typeof latest !== "number") return latest;
  return latest + (latest - previous) * t;
}

function isSamePlatformWindow(previous: SelfGameState, next: SelfGameState) {
  return (
    previous.platformIndex === next.platformIndex &&
    previous.nextPlatformIndex === next.nextPlatformIndex &&
    previous.exitingPlatformIndex === next.exitingPlatformIndex
  );
}

export class RemoteStateSmoother {
  private readonly interpolationDelayMs: number;
  private readonly maxExtrapolationMs: number;
  private readonly maxBufferMs: number;
  private readonly staleStopExtrapolationMs: number;
  private buffer: BufferedRemoteState[] = [];
  private latestSeq = -1;
  private latestTimelineAt = -Infinity;
  private playbackReferenceReceivedAt: number | null = null;
  private playbackReferenceTimelineAt: number | null = null;

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
    }

    const timelineAt = typeof state.elapsedMs === "number" && Number.isFinite(state.elapsedMs) ? state.elapsedMs : receivedAt;
    if (state.status === "playing" && timelineAt <= this.latestTimelineAt) return false;

    if (typeof seq === "number") this.latestSeq = seq;
    this.latestTimelineAt = Math.max(this.latestTimelineAt, timelineAt);
    if (this.playbackReferenceReceivedAt === null || this.playbackReferenceTimelineAt === null) {
      this.playbackReferenceReceivedAt = receivedAt;
      this.playbackReferenceTimelineAt = timelineAt;
    }

    this.buffer.push({ ...state, receivedAt, timelineAt });
    this.buffer.sort((left, right) => left.timelineAt - right.timelineAt);
    const minReceivedAt = receivedAt - this.maxBufferMs;
    this.buffer = this.buffer.filter((sample) => sample.receivedAt >= minReceivedAt);
    return true;
  }

  reset() {
    this.buffer = [];
    this.latestSeq = -1;
    this.latestTimelineAt = -Infinity;
    this.playbackReferenceReceivedAt = null;
    this.playbackReferenceTimelineAt = null;
  }

  sample(now: number): SelfGameState | null {
    if (this.buffer.length === 0) return null;
    const renderAt =
      this.playbackReferenceReceivedAt === null || this.playbackReferenceTimelineAt === null
        ? now - this.interpolationDelayMs
        : this.playbackReferenceTimelineAt + (now - this.playbackReferenceReceivedAt) - this.interpolationDelayMs;
    const latest = this.buffer[this.buffer.length - 1];
    if (renderAt >= latest.timelineAt) {
      if (now - latest.receivedAt > this.staleStopExtrapolationMs) return latest;
      if (this.buffer.length < 2 || latest.status !== "playing") return latest;
      const previous = this.buffer[this.buffer.length - 2];
      const duration = latest.timelineAt - previous.timelineAt;
      if (duration <= 0) return latest;
      const extrapolatedAt = Math.min(renderAt, latest.timelineAt + this.maxExtrapolationMs);
      const t = (extrapolatedAt - latest.timelineAt) / duration;
      const samePlatformWindow = isSamePlatformWindow(previous, latest);
      return {
        ...latest,
        x: latest.x + (latest.x - previous.x) * t,
        y: latest.y + (latest.y - previous.y) * t,
        cameraX: extrapolateOptional(previous.cameraX, latest.cameraX, t),
        cameraY: latest.cameraY + (latest.cameraY - previous.cameraY) * t,
        cameraScale: extrapolateOptional(previous.cameraScale, latest.cameraScale, t),
        charge: extrapolateOptional(previous.charge, latest.charge, t),
        exitingPlatformOffsetY: samePlatformWindow ? extrapolateOptional(previous.exitingPlatformOffsetY, latest.exitingPlatformOffsetY, t) : latest.exitingPlatformOffsetY,
        nextPlatformOffsetY: samePlatformWindow ? extrapolateOptional(previous.nextPlatformOffsetY, latest.nextPlatformOffsetY, t) : latest.nextPlatformOffsetY,
      };
    }

    let previous = this.buffer[0];
    let next = latest;

    for (let index = 0; index < this.buffer.length; index += 1) {
      const sample = this.buffer[index];
      if (sample.timelineAt <= renderAt) previous = sample;
      if (sample.timelineAt >= renderAt) {
        next = sample;
        break;
      }
    }

    if (previous === next || next.timelineAt === previous.timelineAt) {
      return previous;
    }

    const t = Math.max(0, Math.min(1, (renderAt - previous.timelineAt) / (next.timelineAt - previous.timelineAt)));
    const samePlatformWindow = isSamePlatformWindow(previous, next);
    return {
      ...previous,
      x: lerp(previous.x, next.x, t),
      y: lerp(previous.y, next.y, t),
      cameraX: lerpOptional(previous.cameraX, next.cameraX, t),
      cameraY: lerp(previous.cameraY, next.cameraY, t),
      cameraScale: lerpOptional(previous.cameraScale, next.cameraScale, t),
      charge: lerpOptional(previous.charge, next.charge, t),
      exitingPlatformOffsetY: samePlatformWindow ? lerpOptional(previous.exitingPlatformOffsetY, next.exitingPlatformOffsetY, t) : previous.exitingPlatformOffsetY,
      nextPlatformOffsetY: samePlatformWindow ? lerpOptional(previous.nextPlatformOffsetY, next.nextPlatformOffsetY, t) : previous.nextPlatformOffsetY,
      progress: lerp(previous.progress, next.progress, t),
      score: lerpOptional(previous.score, next.score, t),
    };
  }
}
