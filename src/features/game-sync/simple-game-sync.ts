"use client";

import type { SelfGameState } from "@/lib/multiplayer/types";

export class SimpleGameSync {
  private timer: number | null = null;
  private latestState: SelfGameState | null = null;
  private readonly intervalMs: number;
  private readonly reporter: (state: SelfGameState) => void;

  constructor(reporter: (state: SelfGameState) => void, intervalMs = 300) {
    this.reporter = reporter;
    this.intervalMs = intervalMs;
  }

  update(state: SelfGameState) {
    this.latestState = state;
  }

  flush() {
    if (!this.latestState) return;
    this.reporter(this.latestState);
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
