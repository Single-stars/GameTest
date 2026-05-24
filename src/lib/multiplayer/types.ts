import type {
  GameResult,
  GameStateStatus,
  MultiplayerDirection,
  SelfGameState,
} from "@/features/game-sync/types";
import type {
  HomeworldPresence,
  HomeworldState,
} from "@/lib/homeworld/homeworld-state";
import type {
  MultiplayerLevelSelectPresence,
  MultiplayerLevelSelectState,
  MultiplayerPlayMode,
} from "@/lib/multiplayer/level-select";

export type {
  GameResult,
  GameStateStatus,
  MultiplayerDirection,
  SelfGameState,
} from "@/features/game-sync/types";

export type MultiplayerStatus =
  | "idle"
  | "creating"
  | "waiting"
  | "joining"
  | "connected"
  | "countdown"
  | "playing"
  | "finished"
  | "failed"
  | "disconnected";

export type SessionRole = "host" | "guest";

export type PlayerInfo = {
  id: string;
  name: string;
  skinId: string;
  color?: string;
  face?: string;
  viewportWidth?: number;
  viewportHeight?: number;
};

export type MatchConfig = {
  matchId: string;
  levelId: string;
  playMode: MultiplayerPlayMode;
  seed: string;
  logicWidth: number;
  logicHeight: number;
  startAt: number;
};

export type CountdownState = {
  startAt: number;
  remainMs: number;
};

export type NetHelloMessage = {
  v: 1;
  kind: "hello";
  player: PlayerInfo;
};

export type NetReadyMessage = {
  v: 1;
  kind: "ready";
  ready: boolean;
};

export type NetStartMessage = {
  v: 1;
  kind: "start";
  matchId: string;
  seed: string;
  startAt: number;
  sentAt: number;
  levelId: string;
  playMode?: MultiplayerPlayMode;
  logicWidth: number;
  logicHeight: number;
};

export type NetStateMessage = {
  v: 1;
  kind: "state";
  matchId: string;
  progress: number;
  score?: number;
  status: GameStateStatus;
  x?: number;
  y?: number;
  cameraY?: number;
  vx?: number;
  vy?: number;
  direction?: MultiplayerDirection;
  failures?: number;
  elapsedMs?: number;
  seq?: number;
  sentAt?: number;
};

export type NetRematchMessage = {
  v: 1;
  kind: "rematch";
  matchId: string;
};

export type NetForfeitMessage = {
  v: 1;
  kind: "forfeit";
  matchId: string;
};

export type NetReturnRoomMessage = {
  v: 1;
  kind: "return-room";
  matchId: string;
};

export type NetHeartbeatMessage = {
  v: 1;
  kind: "heartbeat";
  sentAt: number;
};

export type NetHomeworldStateMessage = {
  v: 1;
  kind: "homeworld-state";
  homeworld: HomeworldState;
};

export type NetHomeworldPresenceMessage = {
  v: 1;
  kind: "homeworld-presence";
  presence: HomeworldPresence;
};

export type NetLevelSelectPresenceMessage = {
  v: 1;
  kind: "level-select-presence";
  presence: MultiplayerLevelSelectPresence;
};

export type NetLevelSelectStateMessage = {
  v: 1;
  kind: "level-select-state";
  selection: MultiplayerLevelSelectState;
};

export type NetResultMessage = {
  v: 1;
  kind: "result";
  matchId: string;
  score: number;
  passed: boolean;
  timeMs?: number;
};

export type NetByeMessage = {
  v: 1;
  kind: "bye";
  reason?: string;
};

export type NetMessage =
  | NetHelloMessage
  | NetReadyMessage
  | NetStartMessage
  | NetStateMessage
  | NetResultMessage
  | NetRematchMessage
  | NetForfeitMessage
  | NetReturnRoomMessage
  | NetHeartbeatMessage
  | NetHomeworldStateMessage
  | NetHomeworldPresenceMessage
  | NetLevelSelectPresenceMessage
  | NetLevelSelectStateMessage
  | NetByeMessage;

export type MultiplayerSnapshot = {
  status: MultiplayerStatus;
  role: SessionRole | null;
  roomId: string | null;
  selfPlayer: PlayerInfo | null;
  opponentPlayer: PlayerInfo | null;
  selfReady: boolean;
  opponentReady: boolean;
  match: MatchConfig | null;
  countdown: CountdownState | null;
  selfState: SelfGameState | null;
  opponentState: SelfGameState | null;
  selfResult: GameResult | null;
  opponentResult: GameResult | null;
  homeworldState: HomeworldState | null;
  selfHomeworldPresence: HomeworldPresence | null;
  opponentHomeworldPresence: HomeworldPresence | null;
  levelSelectState: MultiplayerLevelSelectState | null;
  selfLevelSelectPresence: MultiplayerLevelSelectPresence | null;
  opponentLevelSelectPresence: MultiplayerLevelSelectPresence | null;
  errorMessage: string | null;
};
