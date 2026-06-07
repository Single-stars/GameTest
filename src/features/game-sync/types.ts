export type MultiplayerDirection = "left" | "right" | "none";

export type GameStateStatus = "playing" | "failed" | "finished";
export type GameStateGravity = "normal" | "light" | "heavy";

export type SelfGameState = {
  matchId?: string;
  progress: number;
  score?: number;
  status: GameStateStatus;
  type?: "state";
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
  gravity?: GameStateGravity;
  nextPlatformIndex?: number;
  nextPlatformOffsetY?: number;
  phase?: string;
  platformIndex?: number;
  turns?: number;
  elapsedMs?: number;
  eventSeq?: number;
  forceSnap?: boolean;
  seq?: number;
  sentAt?: number;
  animSeq?: number;
  receivedAt?: number;
  remoteTimeOffsetMs?: number;
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

export type GameResultBreakdownUnit = "ms" | "point" | "count" | "note";

export type GameResultBreakdownKind = "finish-time" | "effective-time" | "score";
export type GameResultOutcome =
  | "completed"
  | "failed"
  | "forfeit"
  | "opponent-forfeit"
  | "overtime-win"
  | "overtime-loss";
export type GameResultBreakdownOperation = "base" | "add" | "subtract" | "note";

export type GameResultBreakdownEntry = {
  key: string;
  label: string;
  unit: GameResultBreakdownUnit;
  value: number | string;
  amount?: number;
  displayOnly?: boolean;
};

export type GameResultBreakdownFormulaRow = GameResultBreakdownEntry & {
  operation: GameResultBreakdownOperation;
};

export type GameResultBreakdown = {
  version: 1;
  gameId: string;
  levelId: string;
  kind: GameResultBreakdownKind;
  title: string;
  winnerText: string;
  outcome?: GameResultOutcome;
  forfeitBy?: "self" | "opponent";
  overtime?: {
    entered: boolean;
    rounds?: number;
    resultText?: string;
  };
  base: GameResultBreakdownEntry[];
  adjustments: GameResultBreakdownEntry[];
  formulaRows?: GameResultBreakdownFormulaRow[];
  final: {
    label: string;
    lowerIsBetter: boolean;
    unit: "ms" | "point" | "count";
    value: number;
  };
  tiebreakerText?: string;
};

export type GameResult = {
  matchId?: string;
  score: number;
  passed: boolean;
  tiebreakerRound?: number;
  timeMs?: number;
  breakdown?: GameResultBreakdown;
};
