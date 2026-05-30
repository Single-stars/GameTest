import type {
  GameStateStatus,
  MultiplayerDirection,
} from "@/features/game-sync/types";
import {
  REMOTE_INTERPOLATION_DELAY_MS,
  REMOTE_FAST_STATE_SEND_INTERVAL_MS,
  REMOTE_IDLE_STATE_SEND_INTERVAL_MS,
  REMOTE_MAX_PREDICTION_MS,
  REMOTE_STATE_SEND_INTERVAL_MS,
  REMOTE_STALE_MS,
} from "../../features/multiplayer/net-protocol.ts";

export const MULTIPLAYER_PROTOCOL_VERSION = 1 as const;

export const MULTIPLAYER_FAILED_MESSAGE = "当前网络无法直连，请更换网络或重新开房。";
export const MULTIPLAYER_DISCONNECTED_MESSAGE = "对方已断开，联机已结束。";
export const MULTIPLAYER_ROOM_EXPIRED_REASON = "room-expired";
export const MULTIPLAYER_ROOM_EXPIRED_MESSAGE = "房间已失效，请重新创建或加入房间。";

export const MULTIPLAYER_DATA_CHANNELS = {
  control: "control",
  input: "input",
  state: "state",
} as const;

export const MULTIPLAYER_STATE_SYNC_MS = REMOTE_STATE_SEND_INTERVAL_MS;
export const MULTIPLAYER_FAST_STATE_SYNC_MS = REMOTE_FAST_STATE_SEND_INTERVAL_MS;
export const MULTIPLAYER_IDLE_STATE_SYNC_MS = REMOTE_IDLE_STATE_SEND_INTERVAL_MS;
export const MULTIPLAYER_INPUT_KEEPALIVE_MS = 50;
export const MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS = REMOTE_INTERPOLATION_DELAY_MS;
export const MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS = REMOTE_MAX_PREDICTION_MS;
export const MULTIPLAYER_REMOTE_STALE_STOP_EXTRAPOLATION_MS = REMOTE_STALE_MS;
export const MULTIPLAYER_LOGIC_TIMESTEP_MS = 1000 / 60;

export type MultiplayerDataChannelLabel = (typeof MULTIPLAYER_DATA_CHANNELS)[keyof typeof MULTIPLAYER_DATA_CHANNELS];

export type NetInputMessage = {
  v: typeof MULTIPLAYER_PROTOCOL_VERSION;
  kind: "input";
  matchId: string;
  direction?: MultiplayerDirection;
  charge?: number;
  phase?: string;
  status?: GameStateStatus;
  elapsedMs?: number;
  seq?: number;
  sentAt?: number;
};
