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

export type NetResultMessage = {
  v: 1;
  kind: "result";
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
