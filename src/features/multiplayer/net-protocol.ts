import type { GameStateStatus, MultiplayerDirection } from "../game-sync/types.ts";

export const REMOTE_STATE_SEND_INTERVAL_MS = 50;
export const REMOTE_FAST_STATE_SEND_INTERVAL_MS = 1000 / 30;
export const REMOTE_IDLE_STATE_SEND_INTERVAL_MS = 100;
export const REMOTE_INTERPOLATION_DELAY_MS = 80;
export const REMOTE_MAX_PREDICTION_MS = 100;
export const REMOTE_STALE_MS = 500;
export const REMOTE_SMOOTH_SHARPNESS = 36;
export const REMOTE_TELEPORT_DISTANCE = 260;

export type RealtimeStatePacket = {
  type: "state";
  seq: number;
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  progress: number;
  anim: string;
};

export type RealtimeStateSource = Partial<RealtimeStatePacket> & {
  cameraX?: number;
  cameraY?: number;
  cameraScale?: number;
  charge?: number;
  direction?: MultiplayerDirection;
  elapsedMs?: number;
  eventSeq?: number;
  forceSnap?: boolean;
  matchId?: string;
  phase?: string;
  receivedAt?: number;
  remoteTimeOffsetMs?: number;
  score?: number;
  sentAt?: number;
  status?: GameStateStatus;
  animSeq?: number;
};

function finiteOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function resolveRealtimeStateTime(state: RealtimeStateSource, receivedAt: number) {
  return finiteOr(state.t, finiteOr(state.elapsedMs, finiteOr(state.sentAt, receivedAt)));
}

export function resolveRealtimeStateAnim(state: RealtimeStateSource) {
  return state.anim ?? state.phase ?? state.direction ?? state.status ?? "idle";
}

export function toRealtimeStatePacket(state: RealtimeStateSource, receivedAt: number): RealtimeStatePacket | null {
  if (typeof state.x !== "number" || !Number.isFinite(state.x)) return null;
  if (typeof state.y !== "number" || !Number.isFinite(state.y)) return null;
  return {
    type: "state",
    seq: finiteOr(state.seq, 0),
    t: resolveRealtimeStateTime(state, receivedAt),
    x: state.x,
    y: state.y,
    vx: finiteOr(state.vx, 0),
    vy: finiteOr(state.vy, 0),
    angle: finiteOr(state.angle, 0),
    progress: finiteOr(state.progress, 0),
    anim: resolveRealtimeStateAnim(state),
  };
}
