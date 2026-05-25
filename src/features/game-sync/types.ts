export type MultiplayerDirection = "left" | "right" | "none";

export type GameStateStatus = "playing" | "failed" | "finished";
export type GameStateGravity = "normal" | "light" | "heavy";

export type SelfGameState = {
  matchId?: string;
  progress: number;
  score?: number;
  status: GameStateStatus;
  x?: number;
  y?: number;
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
  gravity?: GameStateGravity;
  nextPlatformIndex?: number;
  nextPlatformOffsetY?: number;
  phase?: string;
  platformIndex?: number;
  turns?: number;
  elapsedMs?: number;
  seq?: number;
  sentAt?: number;
  usedPlatformIds?: number[];
};

export type GameResult = {
  matchId?: string;
  score: number;
  passed: boolean;
  timeMs?: number;
};
