import type { ConfigInput } from "./types.ts";

import { bandIndex, config, reactionCounts, reactionThresholds } from "./shared.ts";

export function reactionConfigs() {
  const levels: ConfigInput[] = [];
  for (const level of [1, 4, 7]) {
    const index = bandIndex(level);
    levels.push(
      config(level, "reaction-red-trap", `过关要求：完成 ${reactionCounts[index]} 个红绿信号，红灯不能点，平均反应 ≤ ${reactionThresholds[index]}ms。`, {
        signalCount: reactionCounts[index],
        avgMsThreshold: reactionThresholds[index],
        requiredGreenClicks: 1,
        lanes: 1,
      }),
    );
  }
  for (const level of [2, 5, 8]) {
    const index = bandIndex(level);
    levels.push(
      config(level, "reaction-dual-green", `过关要求：完成 ${reactionCounts[index]} 次绿灯点击，平均反应 ≤ ${reactionThresholds[index]}ms。`, {
        requiredGreenClicks: reactionCounts[index],
        avgMsThreshold: reactionThresholds[index],
        lanes: 2,
      }),
    );
  }
  for (const level of [3, 6, 9]) {
    const index = bandIndex(level);
    levels.push(
      config(level, "reaction-dual-trap", `过关要求：完成 ${reactionCounts[index]} 个红绿信号，红灯不能点，平均反应 ≤ ${reactionThresholds[index]}ms。`, {
        signalCount: reactionCounts[index],
        avgMsThreshold: reactionThresholds[index],
        requiredGreenClicks: 1,
        lanes: 2,
      }),
    );
  }
  levels.push(
    config(10, "reaction-grid-boss", "过关要求：累计 8 次绿格点击，红格不能点，平均反应 ≤ 250ms。", {
      requiredGreenClicks: 8,
      avgMsThreshold: 250,
      lanes: 4,
      maxLitCells: 2,
    }),
  );
  return levels.sort((a, b) => a.level - b.level);
}
