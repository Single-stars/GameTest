"use client";

import type { SelfGameState } from "@/features/game-sync/types";

export type SimpleGameSyncOptions = {
  keepAliveMs?: number;
  now?: () => number;
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export class SimpleGameSync {
  private timer: number | null = null;
  private latestState: SelfGameState | null = null;
  private latestSignature = "";
  private lastSentSignature = "";
  private lastSentAt = -Infinity;
  private dirty = false;
  private readonly intervalMs: number;
  private readonly keepAliveMs?: number;
  private readonly now: () => number;
  private readonly reporter: (state: SelfGameState) => void;

  constructor(reporter: (state: SelfGameState) => void, intervalMs = 300, options: SimpleGameSyncOptions = {}) {
    this.reporter = reporter;
    this.intervalMs = intervalMs;
    this.keepAliveMs = options.keepAliveMs;
    this.now = options.now ?? (() => Date.now());
  }

  update(state: SelfGameState, options: { immediate?: boolean } = {}) {
    const nextSignature = stableSerialize(state);
    this.latestState = state;
    this.latestSignature = nextSignature;
    if (nextSignature !== this.lastSentSignature) this.dirty = true;
    if (options.immediate) this.flush();
  }

  flush(options: { force?: boolean } = {}) {
    if (!this.latestState) return;
    const currentTime = this.now();
    const keepAliveDue =
      typeof this.keepAliveMs === "number" &&
      currentTime - this.lastSentAt >= this.keepAliveMs;
    if (!options.force && !this.dirty && !keepAliveDue) return;
    this.reporter(this.latestState);
    this.lastSentSignature = this.latestSignature;
    this.lastSentAt = currentTime;
    this.dirty = false;
  }

  start() {
    this.stop();
    this.timer = window.setInterval(() => this.flush(), this.intervalMs);
  }

  stop() {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }
}
