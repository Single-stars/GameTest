import { type RoundId } from "./scoring.ts";

export type RoundDisplay = {
  title: string;
  label: string;
};

export const ROUND_DISPLAY_BY_ID = {
  reaction: { title: "绿灯行", label: "反应" },
  aim: { title: "移动靶", label: "精准" },
  search: { title: "一路向上", label: "走位" },
  stroop: { title: "一路向下", label: "专注" },
  rhythm: { title: "跳一跳", label: "手感" },
  memory: { title: "一路向前", label: "协调" },
  braking: { title: "停下来", label: "控制" },
  patience: { title: "丢飞刀", label: "时机" },
} as const satisfies Record<RoundId, RoundDisplay>;
