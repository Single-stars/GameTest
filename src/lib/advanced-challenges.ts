export type {

  AdvancedBrakeAction,

  AdvancedBrakeDanger,

  AdvancedBrakeEvent,

  AdvancedBrakeReleaseOutcome,

  AdvancedCompletionEvaluation,

  AdvancedDifficulty,

  AdvancedStageConfig,

} from "./advanced-challenges/types.ts";

export {

  getAdvancedBrakeCorrectAction,

  getAdvancedBrakeDangerLeft,

  getAdvancedBrakeEventOptions,

  getAdvancedBrakeHasReachedFinish,

  getAdvancedBrakeReleaseOutcome,

  getAdvancedBrakeSchedulerStep,

} from "./advanced-challenges/braking.ts";

export { ADVANCED_STAGE_CONFIGS, getAdvancedStageConfig } from "./advanced-challenges/stage-configs.ts";

export { getDebugToolsVisibility, shouldShowPerfectClearShortcut } from "./advanced-challenges/debug.ts";

export { evaluateAdvancedChallengeCompletion } from "./advanced-challenges/completion.ts";
