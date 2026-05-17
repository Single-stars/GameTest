import type { RoundId } from "../scoring";

import type { AdvancedDifficulty, AdvancedStageConfig, ConfigInput } from "./types.ts";

export const difficultyByBand = ["easy", "medium", "hard"] as const;

export const reactionThresholds = [350, 300, 250] as const;

export const reactionCounts = [5, 6, 7] as const;

const stageTitleSuffixByBand = ["Ⅰ", "Ⅱ", "Ⅲ"] as const;

const stageTitleBaseByRound: Record<RoundId, Record<1 | 2 | 3, string>> = {
  reaction: {
    1: "红灯误导",
    2: "双屏分心",
    3: "双屏红灯",
  },
  aim: {
    1: "多靶轨迹",
    2: "逃逸靶",
    3: "干扰靶",
  },
  search: {
    1: "移动平台",
    2: "高能平台",
    3: "移动障碍",
  },
  stroop: {
    1: "移动平台",
    2: "脆弱平台",
    3: "危险平台",
  },
  rhythm: {
    1: "移动平台",
    2: "二段跳",
    3: "重力异常",
  },
  memory: {
    1: "移动通道",
    2: "道具收集",
    3: "翻转空间",
  },
  braking: {
    1: "走到最后",
    2: "假危险",
    3: "规则怪谈",
  },
  patience: {
    1: "倒计时",
    2: "变速转盘",
    3: "危险区",
  },
};

export function getAdvancedStageTitle(roundId: RoundId, level: number) {
  if (level === 10) return "最终试炼";
  const variant = variantIndex(level);
  if (variant === 10) return "最终试炼";
  return `${stageTitleBaseByRound[roundId][variant]}${stageTitleSuffixByBand[bandIndex(level)]}`;
}

export function createDimensionConfigs(roundId: RoundId, configs: ConfigInput[]): AdvancedStageConfig[] {
  return configs.map((config) => ({ ...config, dimension: roundId, stageTitle: getAdvancedStageTitle(roundId, config.level) }));
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
