"use client";

import type { SelfGameState } from "@/features/game-sync/types";

export type SimpleGameSyncOptions = {
  keepAliveMs?: number;
  now?: () => number;
  sendIntervalMs?: number | ((state: SelfGameState) => number);
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
  private readonly sendIntervalMs?: number | ((state: SelfGameState) => number);

  constructor(reporter: (state: SelfGameState) => void, intervalMs = 300, options: SimpleGameSyncOptions = {}) {
    this.reporter = reporter;
    this.intervalMs = intervalMs;
    this.keepAliveMs = options.keepAliveMs;
    this.now = options.now ?? (() => Date.now());
    this.sendIntervalMs = options.sendIntervalMs;
  }

  update(state: SelfGameState, options: { immediate?: boolean; signature?: string } = {}) {
    const nextSignature = options.signature ?? stableSerialize(state);
    this.latestState = state;
    this.latestSignature = nextSignature;
    if (nextSignature !== this.lastSentSignature) this.dirty = true;
    if (options.immediate) this.flush({ bypassInterval: true });
  }

  flush(options: { bypassInterval?: boolean; force?: boolean } = {}) {
    if (!this.latestState) return;
    const currentTime = this.now();
    const keepAliveDue =
      typeof this.keepAliveMs === "number" &&
      currentTime - this.lastSentAt >= this.keepAliveMs;
    const intervalMs = this.resolveSendIntervalMs(this.latestState);
    const intervalDue = this.sendIntervalMs === undefined || options.bypassInterval || currentTime - this.lastSentAt >= intervalMs;
    if (!options.force && !this.dirty && !keepAliveDue) return;
    if (!options.force && this.dirty && !intervalDue && !keepAliveDue) return;
    this.reporter(this.latestState);
    this.lastSentSignature = this.latestSignature;
    this.lastSentAt = currentTime;
    this.dirty = false;
  }

  private resolveSendIntervalMs(state: SelfGameState) {
    if (typeof this.sendIntervalMs === "function") {
      const resolved = this.sendIntervalMs(state);
      return Number.isFinite(resolved) ? Math.max(0, resolved) : this.intervalMs;
    }
    if (typeof this.sendIntervalMs === "number" && Number.isFinite(this.sendIntervalMs)) {
      return Math.max(0, this.sendIntervalMs);
    }
    return this.intervalMs;
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
