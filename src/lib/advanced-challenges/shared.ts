import type { RoundId } from "../scoring";

import type { AdvancedDifficulty, AdvancedStageConfig, ConfigInput } from "./types.ts";

export const difficultyByBand = ["easy", "medium", "hard"] as const;

export const reactionThresholds = [350, 300, 250] as const;

export const reactionCounts = [5, 6, 7] as const;

export function createDimensionConfigs(roundId: RoundId, configs: ConfigInput[]): AdvancedStageConfig[] {
  return configs.map((config) => ({ ...config, dimension: roundId }));
}

export function bandIndex(level: number) {
  if (level >= 7) return 2;
  if (level >= 4) return 1;
  return 0;
}

export function diff(level: number): AdvancedDifficulty {
  return level === 10 ? "boss" : difficultyByBand[bandIndex(level)];
}

export function variantIndex(level: number): 1 | 2 | 3 | 10 {
  if (level === 10) return 10;
  return (((level - 1) % 3) + 1) as 1 | 2 | 3;
}

export function config(
  level: number,
  variant: string,
  passText: string,
  params: AdvancedStageConfig["params"],
): ConfigInput {
  return {
    level,
    variant,
    variantIndex: variantIndex(level),
    difficulty: diff(level),
    passText,
    params,
  };
}
