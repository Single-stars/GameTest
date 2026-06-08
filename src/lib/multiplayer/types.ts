import type {
  GameResult,
  GameStateStatus,
  FallDownFragileState,
  MultiplayerDirection,
  SelfGameState,
} from "@/features/game-sync/types";
import type { NetInputMessage } from "@/lib/multiplayer/protocol";
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
  FallDownFragileState,
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

export type MultiplayerConnectionState =
  | "idle"
  | "signaling"
  | "connected"
  | "reconnecting"
  | "stale"
  | "replaced"
  | "closed";

export type SessionRole = "host" | "guest";
export type MultiplayerReactionKind = "egg" | "coffee" | "cheer";

export type MultiplayerReactionEvent = {
  id: string;
  from: "self" | "opponent";
  kind: MultiplayerReactionKind;
  sentAt: number;
};

export type MultiplayerRoomScore = {
  hostWins: number;
  guestWins: number;
  lastMatchId?: string;
};

export type PlayerInfo = {
  id: string;
  name: string;
  skinId: string;
  customAvatar?: {
    imageDataUrl: string;
    outlineColor?: string;
    updatedAt: string;
  };
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
  tiebreakerRound?: number;
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
  type: "state";
  matchId: string;
  progress: number;
  score?: number;
  status: GameStateStatus;
  t?: number;
  x?: number;
  y?: number;
  screenX?: number;
  screenY?: number;
  angle?: number;
  anim?: string;
  cameraX?: number;
  cameraY?: number;
  cameraScale?: number;
  charge?: number;
  vx?: number;
  vy?: number;
  direction?: MultiplayerDirection;
  exitingPlatformIndex?: number;
  exitingPlatformOffsetY?: number;
  failures?: number;
  gravity?: "normal" | "light" | "heavy";
  nextPlatformIndex?: number;
  nextPlatformOffsetY?: number;
  phase?: string;
  platformIndex?: number;
  turns?: number;
  elapsedMs?: number;
  seq?: number;
  sentAt?: number;
  fragileStates?: FallDownFragileState[];
  usedPlatformIds?: number[];
  knifeInsertedAngles?: number[];
  knifeFailedAngles?: number[];
  knifeShotIndex?: number;
  knifeTimer?: number;
  knifeTimedOutThisShot?: boolean;
  knifeOvertime?: boolean;
  knifeWinnerRole?: "host" | "guest";
  knifeHostHits?: number;
  knifeGuestHits?: number;
  knifeHostTimeouts?: number;
  knifeGuestTimeouts?: number;
  knifeHostCollisions?: number;
  knifeGuestCollisions?: number;
  knifeHostDangerHits?: number;
  knifeGuestDangerHits?: number;
  aimHits?: number;
  aimMisses?: number;
  aimFlyOuts?: number;
  aimDecoyHits?: number;
  aimTargetCount?: number;
};

export type { NetInputMessage } from "@/lib/multiplayer/protocol";

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

export type NetReactionMessage = {
  v: 1;
  kind: "reaction";
  matchId: string;
  reaction: MultiplayerReactionKind;
  sentAt: number;
};

export type NetTiebreakerMessage = {
  v: 1;
  kind: "tiebreaker";
  matchId: string;
  round: number;
  sentAt: number;
};

export type NetHeartbeatMessage = {
  v: 1;
  kind: "heartbeat";
  sentAt: number;
};

export type NetTimeSyncMessage =
  | {
      v: 1;
      kind: "time-sync";
      mode: "ping";
      id: number;
      pingLocalTime: number;
    }
  | {
      v: 1;
      kind: "time-sync";
      mode: "pong";
      id: number;
      pingLocalTime: number;
      remoteReceiveTime: number;
      remoteSendTime: number;
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

export type NetRoomScoreMessage = {
  v: 1;
  kind: "room-score";
  score: MultiplayerRoomScore;
};

export type NetResultMessage = {
  v: 1;
  kind: "result";
  matchId: string;
  score: number;
  passed: boolean;
  tiebreakerRound?: number;
  timeMs?: number;
  breakdown?: GameResult["breakdown"];
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
  | NetInputMessage
  | NetStateMessage
  | NetResultMessage
  | NetRematchMessage
  | NetForfeitMessage
  | NetReturnRoomMessage
  | NetReactionMessage
  | NetTiebreakerMessage
  | NetHeartbeatMessage
  | NetTimeSyncMessage
  | NetHomeworldStateMessage
  | NetHomeworldPresenceMessage
  | NetLevelSelectPresenceMessage
  | NetLevelSelectStateMessage
  | NetRoomScoreMessage
  | NetByeMessage;

export type MultiplayerSnapshot = {
  status: MultiplayerStatus;
  connectionState: MultiplayerConnectionState;
  role: SessionRole | null;
  roomId: string | null;
  selfPlayer: PlayerInfo | null;
  opponentPlayer: PlayerInfo | null;
  opponentJoining: boolean;
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
  roomScore: MultiplayerRoomScore | null;
  reactions: MultiplayerReactionEvent[];
  errorMessage: string | null;
};
