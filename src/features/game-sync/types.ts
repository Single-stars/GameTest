export type MultiplayerDirection = "left" | "right" | "none";

export type GameStateStatus = "playing" | "failed" | "finished";

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
