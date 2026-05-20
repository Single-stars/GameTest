import type { RoundId } from "../scoring";

export type MiniGameId = "doodle" | "flappy" | "knife" | "square-jump" | "fall-down";

export type AdvancedDifficulty = "easy" | "medium" | "hard" | "boss";

export type AdvancedStageConfig = {
  dimension: RoundId;
  level: number;
  stageTitle: string;
  variant: string;
  variantIndex: 1 | 2 | 3 | 10;
  difficulty: AdvancedDifficulty;
  passText: string;
  params: Record<string, number | string | boolean | null>;
};

export type AdvancedCompletionEvaluation = {
  level: number;
  score: number;
  minScore: number;
  passed: boolean;
  correctCount: number;
  requiredCorrect: number;
  reason: string;
  goalChecks?: boolean[];
  reactionAverageMs?: number | null;
  reactionThresholdMs?: number | null;
};

export type AdvancedBrakeDanger = "red" | "gray";

export type AdvancedBrakeAction = "release" | "hold";

export type AdvancedBrakeEvent = {
  top: AdvancedBrakeDanger | null;
  bottom: AdvancedBrakeDanger | null;
  correctAction?: AdvancedBrakeAction;
};

export type AdvancedBrakeReleaseOutcome =
  | { outcome: "pause" }
  | { outcome: "success" }
  | { outcome: "failure"; errorType: "false_alarm" | "early_stop" };

export type ConfigInput = Omit<AdvancedStageConfig, "dimension" | "stageTitle">;

export type MiniAdvancedLevelInput = {
  order: number;
  levelId?: string;
  variant: string;
  goalText: string;
  description: string;
  params: AdvancedStageConfig["params"];
};
