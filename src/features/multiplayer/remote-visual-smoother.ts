import {
  REMOTE_SMOOTH_SHARPNESS,
  REMOTE_STALE_MS,
  REMOTE_TELEPORT_DISTANCE,
} from "./net-protocol.ts";

export type RemoteVisualSmootherOptions = {
  animationHysteresisMs?: number;
  landHoldMs?: number;
  networkStaleMs?: number;
  sharpness?: number;
  teleportDistance?: number;
};

export type RemoteVisualSample = {
  angle?: number;
  anim?: string;
  eventSeq?: number;
  forceSnap?: boolean;
  matchId?: string;
  nextPlatformIndex?: number;
  phase?: string;
  platformIndex?: number;
  progress?: number;
  receivedAt?: number;
  status?: string;
  direction?: string;
  x?: number;
  y?: number;
};

export type RemoteVisualState<TState extends RemoteVisualSample = RemoteVisualSample> = TState & {
  angle: number;
  anim?: string;
  x: number;
  y: number;
  visualAngle: number;
  visualX: number;
  visualY: number;
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

function lerpAngle(start: number, end: number, t: number) {
  const delta = ((end - start + 540) % 360) - 180;
  return normalizeAngle(start + delta * t);
}

function distanceSquared(leftX: number, leftY: number, rightX: number, rightY: number) {
  const dx = rightX - leftX;
  const dy = rightY - leftY;
  return dx * dx + dy * dy;
}

function resolveCatchUpSharpness(baseSharpness: number, distance: number, teleportDistance: number) {
  const catchUpStart = Math.min(48, teleportDistance * 0.25);
  if (distance <= catchUpStart) return baseSharpness;
  const range = Math.max(1, teleportDistance - catchUpStart);
  const extra = Math.min(2, ((distance - catchUpStart) / range) * 2);
  return baseSharpness * (1 + extra);
}

function isLightAnim(anim: string) {
  return anim === "idle" || anim === "move" || anim === "run";
}

function isCriticalAnim(anim: string) {
  return (
    anim === "jump" ||
    anim === "land" ||
    anim === "fail" ||
    anim === "failed" ||
    anim === "hit" ||
    anim === "pass" ||
    anim === "passed" ||
    anim === "finished" ||
    anim === "success" ||
    anim === "celebrate"
  );
}

function resolveTargetAnim(sample: RemoteVisualSample) {
  if (sample.status === "failed") return "failed";
  if (sample.status === "finished" || sample.status === "passed") return "finished";
  if (typeof sample.anim === "string" && sample.anim.length > 0) return sample.anim;
  if (typeof sample.phase === "string" && sample.phase.length > 0) return sample.phase;
  return "idle";
}

export class RemoteVisualSmoother {
  private readonly animationHysteresisMs: number;
  private readonly landHoldMs: number;
  private readonly networkStaleMs: number;
  private readonly sharpness: number;
  private readonly teleportDistance: number;
  private initialized = false;
  private lastUpdateAt: number | null = null;
  private lastMatchId: string | undefined;
  private lastPlatformIndex: number | undefined;
  private lastStatus: string | undefined;
  private pendingAnim: string | null = null;
  private pendingAnimSince = 0;
  private heldAnimUntil = 0;
  private visualAnim: string | undefined;
  private visualAngle = 0;
  private visualX = 0;
  private visualY = 0;

  constructor(options: RemoteVisualSmootherOptions = {}) {
    this.animationHysteresisMs = options.animationHysteresisMs ?? 80;
    this.landHoldMs = options.landHoldMs ?? 100;
    this.networkStaleMs = options.networkStaleMs ?? REMOTE_STALE_MS;
    this.sharpness = options.sharpness ?? REMOTE_SMOOTH_SHARPNESS;
    this.teleportDistance = options.teleportDistance ?? REMOTE_TELEPORT_DISTANCE;
  }

  reset() {
    this.initialized = false;
    this.lastUpdateAt = null;
    this.lastMatchId = undefined;
    this.lastPlatformIndex = undefined;
    this.lastStatus = undefined;
    this.pendingAnim = null;
    this.pendingAnimSince = 0;
    this.heldAnimUntil = 0;
    this.visualAnim = undefined;
    this.visualAngle = 0;
    this.visualX = 0;
    this.visualY = 0;
  }

  update<TState extends RemoteVisualSample>(sample: TState | null | undefined, now: number): RemoteVisualState<TState> | null {
    if (!sample || !finiteNumber(sample.x) || !finiteNumber(sample.y)) return null;

    const targetAngle = finiteNumber(sample.angle) ? sample.angle : 0;
    const targetX = sample.x;
    const targetY = sample.y;
    const shouldSnap = this.shouldSnap(sample, targetX, targetY, now);
    const previousTime = this.lastUpdateAt ?? now;
    const dtSeconds = Math.max(0, Math.min(100, now - previousTime)) / 1000;
    const targetDistance = Math.sqrt(distanceSquared(this.visualX, this.visualY, targetX, targetY));
    const catchUpSharpness = resolveCatchUpSharpness(this.sharpness, targetDistance, this.teleportDistance);
    const alpha = shouldSnap ? 1 : 1 - Math.exp(-catchUpSharpness * dtSeconds);

    if (shouldSnap) {
      this.visualX = targetX;
      this.visualY = targetY;
      this.visualAngle = normalizeAngle(targetAngle);
    } else {
      this.visualX += (targetX - this.visualX) * alpha;
      this.visualY += (targetY - this.visualY) * alpha;
      this.visualAngle = lerpAngle(this.visualAngle, targetAngle, alpha);
    }

    this.initialized = true;
    this.lastUpdateAt = now;
    this.lastMatchId = sample.matchId;
    this.lastStatus = sample.status;
    if (finiteNumber(sample.platformIndex)) this.lastPlatformIndex = sample.platformIndex;

    const anim = this.resolveVisualAnim(sample, now, shouldSnap);
    return {
      ...sample,
      angle: this.visualAngle,
      anim,
      x: this.visualX,
      y: this.visualY,
      visualAngle: this.visualAngle,
      visualX: this.visualX,
      visualY: this.visualY,
    };
  }

  private shouldSnap(sample: RemoteVisualSample, targetX: number, targetY: number, now: number) {
    if (!this.initialized) return true;
    if (sample.forceSnap) return true;
    if (typeof sample.matchId === "string" && this.lastMatchId !== undefined && sample.matchId !== this.lastMatchId) return true;
    if (sample.status !== undefined && sample.status !== this.lastStatus && sample.status !== "playing") return true;
    if (finiteNumber(sample.platformIndex) && this.lastPlatformIndex !== undefined && sample.platformIndex < this.lastPlatformIndex) return true;
    if (finiteNumber(sample.receivedAt) && now - sample.receivedAt > this.networkStaleMs && sample.status !== "playing") return true;
    return distanceSquared(this.visualX, this.visualY, targetX, targetY) > this.teleportDistance * this.teleportDistance;
  }

  private resolveVisualAnim(sample: RemoteVisualSample, now: number, forceSnap: boolean) {
    const targetAnim = resolveTargetAnim(sample);
    if (forceSnap || this.visualAnim === undefined) {
      this.pendingAnim = null;
      this.visualAnim = targetAnim;
      this.heldAnimUntil = targetAnim === "land" ? now + this.landHoldMs : 0;
      return this.visualAnim;
    }

    if (this.visualAnim === "land" && now < this.heldAnimUntil && targetAnim !== "failed" && targetAnim !== "finished") {
      return this.visualAnim;
    }

    if (targetAnim === this.visualAnim) {
      this.pendingAnim = null;
      return this.visualAnim;
    }

    if (isCriticalAnim(targetAnim)) {
      this.pendingAnim = null;
      this.visualAnim = targetAnim;
      this.heldAnimUntil = targetAnim === "land" ? now + this.landHoldMs : 0;
      return this.visualAnim;
    }

    if (isLightAnim(targetAnim) && isLightAnim(this.visualAnim)) {
      if (this.pendingAnim !== targetAnim) {
        this.pendingAnim = targetAnim;
        this.pendingAnimSince = now;
        return this.visualAnim;
      }
      if (now - this.pendingAnimSince < this.animationHysteresisMs) return this.visualAnim;
    }

    this.pendingAnim = null;
    this.visualAnim = targetAnim;
    return this.visualAnim;
  }
}

export function resolveRemoteAvatarVisual(sample: RemoteVisualSample) {
  const anim = resolveTargetAnim(sample);
  if (anim === "failed" || anim === "fail" || anim === "hit") {
    return { action: "hit", expression: "hurt", effect: "none" };
  }
  if (anim === "finished" || anim === "passed" || anim === "pass" || anim === "success" || anim === "celebrate") {
    return { action: "celebrate", expression: "happy", effect: "sparkles" };
  }
  if (anim === "land") return { action: "land", expression: "neutral", effect: "none" };
  if (anim === "charging" || anim === "charge" || anim === "airCharging") {
    return { action: "charge", expression: "neutral", effect: "none" };
  }
  if (anim === "move" || anim === "run") return { action: "move", expression: "neutral", effect: "none" };
  if (anim === "falling") return { action: "idle", expression: "scared", effect: "none" };
  return { action: "idle", expression: "neutral", effect: "none" };
}

export function applyRemoteAvatarVisual(node: HTMLElement | null | undefined, sample: RemoteVisualSample | null | undefined) {
  if (!node || !sample) return;
  const visual = resolveRemoteAvatarVisual(sample);
  node.dataset.action = visual.action;
  node.dataset.expression = visual.expression;
  node.dataset.effect = visual.effect;
  if (typeof sample.direction === "string") {
    node.dataset.direction = sample.direction;
  }
}
