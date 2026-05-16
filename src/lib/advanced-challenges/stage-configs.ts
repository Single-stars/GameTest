import type { RoundId } from "../scoring";

import type { AdvancedStageConfig } from "./types.ts";

import { createDimensionConfigs } from "./shared.ts";

import { reactionConfigs } from "./reaction-config.ts";

import { aimConfigs } from "./aim-config.ts";

import { brakingConfigs } from "./braking-config.ts";

import { miniGameConfigs } from "./mini-game-config.ts";

export const ADVANCED_STAGE_CONFIGS: Record<RoundId, AdvancedStageConfig[]> = {
  reaction: createDimensionConfigs("reaction", reactionConfigs()),
  aim: createDimensionConfigs("aim", aimConfigs()),
  search: createDimensionConfigs("search", miniGameConfigs("doodle")),
  stroop: createDimensionConfigs("stroop", miniGameConfigs("fall-down")),
  rhythm: createDimensionConfigs("rhythm", miniGameConfigs("square-jump")),
  memory: createDimensionConfigs("memory", miniGameConfigs("flappy")),
  braking: createDimensionConfigs("braking", brakingConfigs()),
  patience: createDimensionConfigs("patience", miniGameConfigs("knife")),
};

function clampLevel(level: number) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(10, Math.floor(level)));
}

export function getAdvancedStageConfig(roundId: RoundId, level: number): AdvancedStageConfig {
  const normalizedLevel = clampLevel(level);
  return ADVANCED_STAGE_CONFIGS[roundId]?.[normalizedLevel - 1] ?? ADVANCED_STAGE_CONFIGS.reaction[0];
}
