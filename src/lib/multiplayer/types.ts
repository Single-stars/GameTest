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
export type MultiplayerDirection = "left" | "right" | "none";

export type PlayerInfo = {
  id: string;
  name: string;
  skinId: string;
  color?: string;
  face?: string;
  viewportWidth?: number;
  viewportHeight?: number;
};

export type GameStateStatus = "playing" | "failed" | "finished";

export type MatchConfig = {
  matchId: string;
  levelId: string;
  seed: string;
  logicWidth: number;
  logicHeight: number;
  startAt: number;
};

export type CountdownState = {
  startAt: number;
  remainMs: number;
};

export type SelfGameState = {
  matchId?: string;
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

export type GameResult = {
  matchId?: string;
  score: number;
  passed: boolean;
  timeMs?: number;
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
};

export type NetForfeitMessage = {
  v: 1;
  kind: "forfeit";
  matchId: string;
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
  errorMessage: string | null;
};
