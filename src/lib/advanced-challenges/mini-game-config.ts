import type { AdvancedStageConfig, MiniAdvancedLevelInput, MiniGameId } from "./types.ts";

import { config } from "./shared.ts";

const miniVariantSlug: Record<MiniGameId, Record<string, string>> = {
  doodle: {
    移动平台: "moving-platform",
    必踩高风险平台: "risk-platform",
    移动障碍: "moving-obstacle",
    综合最终关: "final",
  },
  flappy: {
    移动门: "moving-gate",
    收集路径道具: "collectible-path",
    反重力反向: "reverse-gravity",
    综合最终关: "final",
  },
  knife: {
    发射倒计时: "countdown",
    转速正弦波动: "sine-rotation",
    不可插区域: "forbidden-zone",
    综合最终关: "final",
  },
  "square-jump": {
    移动落点: "moving-landing",
    二段跳跃: "double-jump",
    重力平台: "gravity-platform",
    综合最终关: "final",
  },
  "fall-down": {
    移动层板: "moving-layer",
    脆弱层板: "fragile-layer",
    危险层板: "danger-layer",
    综合最终关: "final",
  },
};

const miniProgressionOrder = [1, 4, 7, 2, 5, 8, 3, 6, 9, 10] as const;

function miniAdvancedLevel(
  order: number,
  variant: string,
  goalText: string,
  description: string,
  params: AdvancedStageConfig["params"],
  levelId?: string,
): MiniAdvancedLevelInput {
  return { order, levelId, variant, goalText, description, params };
}

const miniAdvancedLevels: Record<MiniGameId, MiniAdvancedLevelInput[]> = {
  doodle: [
    miniAdvancedLevel(1, "移动平台", "到达 4 屏高度", "移动平台比例约 40%，少量危险障碍，速度慢。", { targetHeightScreens: 4, movingPlatformRatio: 0.4, movingPlatformSpeed: 22, hazardDensity: 0.45 }),
    miniAdvancedLevel(2, "移动平台", "到达 6 屏高度", "移动平台比例约 70%，中等危险障碍，速度中等。", { targetHeightScreens: 6, movingPlatformRatio: 0.7, movingPlatformSpeed: 34, hazardDensity: 0.8 }),
    miniAdvancedLevel(3, "移动平台", "到达 8 屏高度", "全部平台移动，危险障碍更多，速度较快。", { targetHeightScreens: 8, movingPlatformRatio: 1, movingPlatformSpeed: 46, hazardDensity: 1.2 }),
    miniAdvancedLevel(4, "必踩高风险平台", "到达 5 屏高度，必踩 3/3", "必须踩中 3 个略窄高风险平台，统一 1.6 倍弹跳。", { targetHeightScreens: 5, movingPlatformRatio: 0, requiredRiskPlatforms: 3, riskJumpMultiplier: 1.6 }),
    miniAdvancedLevel(5, "必踩高风险平台", "到达 7 屏高度，必踩 5/5", "必须踩中 5 个中等宽度高风险平台。", { targetHeightScreens: 7, movingPlatformRatio: 0, requiredRiskPlatforms: 5, riskJumpMultiplier: 1.6 }),
    miniAdvancedLevel(6, "必踩高风险平台", "到达 9 屏高度，必踩 7/7", "必须踩中 7 个更窄高风险平台，静态危险障碍更多。", { targetHeightScreens: 9, movingPlatformRatio: 0, requiredRiskPlatforms: 7, riskJumpMultiplier: 1.6 }),
    miniAdvancedLevel(7, "移动障碍", "到达 5 屏高度", "少量移动障碍在平台旁缓慢移动。", { targetHeightScreens: 5, movingObstacleCount: 5, movementPattern: "horizontal" }),
    miniAdvancedLevel(8, "移动障碍", "到达 7 屏高度", "移动障碍数量增加，部分会穿过常用跳跃路线。", { targetHeightScreens: 7, movingObstacleCount: 9, movementPattern: "horizontal|vertical|patrolDiagonal" }),
    miniAdvancedLevel(9, "移动障碍", "到达 9 屏高度", "较多移动障碍持续压迫连续平台之间的上升路线。", { targetHeightScreens: 9, movingObstacleCount: 13, movementPattern: "horizontal|vertical|patrolDiagonal|orbitSmall|pulse|slowCross" }),
    miniAdvancedLevel(10, "综合最终关", "到达 10 屏高度，必踩 8/8", "全移动平台，8 个必踩高风险平台，后段加入更多移动障碍。", { targetHeightScreens: 10, movingPlatformRatio: 1, requiredRiskPlatforms: 8, movingObstacleCount: 20, riskJumpMultiplier: 1.6 }),
  ],
  flappy: [
    miniAdvancedLevel(1, "移动门", "通过 8 个门", "8 门，30% 移动门，缝隙大，速度慢。", { gateCount: 8, movingGateRatio: 0.3, collectibleCount: 0 }),
    miniAdvancedLevel(2, "移动门", "通过 10 个门", "10 门，50% 移动门，缝隙中等。", { gateCount: 10, movingGateRatio: 0.5, collectibleCount: 0 }),
    miniAdvancedLevel(3, "移动门", "通过 12 个门", "12 门，70% 移动门，缝隙略小。", { gateCount: 12, movingGateRatio: 0.7, collectibleCount: 0 }),
    miniAdvancedLevel(4, "收集路径道具", "通过 8 门，收集 4/4", "必须收集 4 个接近安全中心线的道具。", { gateCount: 8, movingGateRatio: 0, collectibleCount: 4 }),
    miniAdvancedLevel(5, "收集路径道具", "通过 10 门，收集 6/6", "必须收集 6 个略微偏上或偏下的道具。", { gateCount: 10, movingGateRatio: 0, collectibleCount: 6 }),
    miniAdvancedLevel(6, "收集路径道具", "通过 12 门，收集 8/8", "必须收集 8 个更靠近缝隙边缘的道具。", { gateCount: 12, movingGateRatio: 0, collectibleCount: 8 }),
    miniAdvancedLevel(7, "反重力反向", "通过 6 个门", "角色从右往左移动，不点击向上漂，点击向下压。", { gateCount: 6, movingGateRatio: 0, collectibleCount: 0, reversedGravity: true, reverseDirection: true }),
    miniAdvancedLevel(8, "反重力反向", "通过 8 个门", "反向移动速度中等，缝隙中等。", { gateCount: 8, movingGateRatio: 0, collectibleCount: 0, reversedGravity: true, reverseDirection: true }),
    miniAdvancedLevel(9, "反重力反向", "通过 10 个门", "反向速度较快，门位变化更明显。", { gateCount: 10, movingGateRatio: 0, collectibleCount: 0, reversedGravity: true, reverseDirection: true }),
    miniAdvancedLevel(10, "综合最终关", "通过 13 门，收集 7/7", "反向移动和反重力，移动门与必收集道具同时出现。", { gateCount: 13, movingGateRatio: 0.45, collectibleCount: 7, reversedGravity: true, reverseDirection: true }),
  ],
  knife: [
    miniAdvancedLevel(1, "发射倒计时", "命中 7 发", "每发 2.5 秒倒计时，初始障碍 4 个。", { shotCount: 7, shotCountdown: 2.5, initialObstacleCount: 4 }),
    miniAdvancedLevel(2, "发射倒计时", "命中 9 发", "每发 2.5 秒倒计时，初始障碍 4 个。", { shotCount: 9, shotCountdown: 2.5, initialObstacleCount: 4 }),
    miniAdvancedLevel(3, "发射倒计时", "命中 11 发", "每发 2.0 秒倒计时，初始障碍 4 个。", { shotCount: 11, shotCountdown: 2, initialObstacleCount: 4 }),
    miniAdvancedLevel(4, "转速正弦波动", "命中 7 发", "每发 2.0 秒倒计时，正弦速度按 0 到正反最快循环，初始障碍 4 个。", { shotCount: 7, shotCountdown: 2, sineRotationEnabled: true, phaseDuration: 3, sweepPerPhase: 390, initialObstacleCount: 4 }),
    miniAdvancedLevel(5, "转速正弦波动", "命中 9 发", "正弦速度中等，初始障碍 4 个。", { shotCount: 9, sineRotationEnabled: true, phaseDuration: 2.8, sweepPerPhase: 405, initialObstacleCount: 4 }),
    miniAdvancedLevel(6, "转速正弦波动", "命中 11 发", "正弦速度更快，初始障碍 4 个。", { shotCount: 11, sineRotationEnabled: true, phaseDuration: 2.55, sweepPerPhase: 420, initialObstacleCount: 4 }),
    miniAdvancedLevel(7, "不可插区域", "命中 7 发，避开禁区", "每发 1.5 秒倒计时，初始障碍 4 个，1 块不可插区域，总面积约 12%。", { shotCount: 7, shotCountdown: 1.5, forbiddenZoneCount: 1, forbiddenZoneRatio: 0.12, initialObstacleCount: 4 }),
    miniAdvancedLevel(8, "不可插区域", "命中 9 发，避开禁区", "初始障碍 4 个，2 块不可插区域，总面积约 18%。", { shotCount: 9, forbiddenZoneCount: 2, forbiddenZoneRatio: 0.18, initialObstacleCount: 4 }),
    miniAdvancedLevel(9, "不可插区域", "命中 11 发，避开禁区", "3 块不可插区域，总面积约 24%。", { shotCount: 11, forbiddenZoneCount: 3, forbiddenZoneRatio: 0.24, initialObstacleCount: 3 }),
    miniAdvancedLevel(10, "综合最终关", "命中 13 发，避开禁区和旧刀", "每发 2.5 秒倒计时，正弦转速和不可插区域同时出现。", { shotCount: 13, shotCountdown: 2.5, sineRotationEnabled: true, phaseDuration: 2.7, sweepPerPhase: 405, forbiddenZoneCount: 2, forbiddenZoneRatio: 0.2, initialObstacleCount: 3 }),
  ],
  "square-jump": [
    miniAdvancedLevel(1, "移动落点", "预判移动平台并完成 4 次跳跃", "1 个慢速移动平台，平台较宽，距离变化小。", {}, "square-jump-moving-easy"),
    miniAdvancedLevel(2, "移动落点", "预判移动平台并完成 5 次跳跃", "连续 3 个中速移动平台，宽度正常，距离略随机。", {}, "square-jump-moving-normal"),
    miniAdvancedLevel(3, "移动落点", "预判快速移动平台并完成 6 次跳跃", "多个快速窄平台会反向移动，需要提前预判落点。", {}, "square-jump-moving-hard"),
    miniAdvancedLevel(4, "二段跳跃", "用二段跳完成 4 次跳跃", "跳起后可在空中再次蓄力，悬停后释放完成二段跳。", {}, "square-jump-double-easy"),
    miniAdvancedLevel(5, "二段跳跃", "用二段跳完成 5 次跳跃", "平台距离更远，空中二段蓄力会悬停，释放后继续前进。", {}, "square-jump-double-normal"),
    miniAdvancedLevel(6, "二段跳跃", "用二段跳完成 6 次跳跃", "窄平台和远距离同时出现，需要在空中把握二段蓄力时机。", {}, "square-jump-double-hard"),
    miniAdvancedLevel(7, "重力平台", "根据重力状态完成 4 次跳跃", "只出现正常和变轻平台，变轻后会跳得更远。", {}, "square-jump-gravity-easy"),
    miniAdvancedLevel(8, "重力平台", "根据三种重力完成 5 次跳跃", "正常、变轻、加重平台都会出现，需要连续判断当前状态。", {}, "square-jump-gravity-normal"),
    miniAdvancedLevel(9, "重力平台", "根据重力反向考验完成 6 次跳跃", "反向考验更多：变轻接近平台、加重接远平台，容错更低。", {}, "square-jump-gravity-hard"),
    miniAdvancedLevel(10, "综合最终关", "连续跳到终点平台", "综合移动落点、二段跳和重力切换平台，一路跳到终点。", {}, "square-jump-final"),
  ],
  "fall-down": [
    miniAdvancedLevel(1, "移动层板", "通过慢速移动层板", "少量移动平台，宽度较大，练习预判下落位置。", {}, "fall-down-moving-easy"),
    miniAdvancedLevel(2, "移动层板", "通过连续移动层板", "移动平台数量增加，间距变大，需要提前调整左右位置。", {}, "fall-down-moving-normal"),
    miniAdvancedLevel(3, "移动层板", "通过高压移动层板", "连续移动窄平台，部分方向相反，顶部压线更快。", {}, "fall-down-moving-hard"),
    miniAdvancedLevel(4, "脆弱层板", "避开碎裂压力下降", "少量脆弱平台，踩上后约 1.8 秒碎裂。", {}, "fall-down-fragile-easy"),
    miniAdvancedLevel(5, "脆弱层板", "连续通过脆弱层板", "脆弱平台数量增加，碎裂时间更短，不能停留太久。", {}, "fall-down-fragile-normal"),
    miniAdvancedLevel(6, "脆弱层板", "在碎裂前连续下降", "连续脆弱窄平台，最后几层几乎不能停留。", {}, "fall-down-fragile-hard"),
    miniAdvancedLevel(7, "危险层板", "避开危险平台下降", "少量红色危险平台，安全路线明显。", {}, "fall-down-danger-easy"),
    miniAdvancedLevel(8, "危险层板", "选择安全层板下降", "危险平台数量增加，部分安全平台更窄。", {}, "fall-down-danger-normal"),
    miniAdvancedLevel(9, "危险层板", "连续避开危险层板", "危险平台和窄安全平台交错，需要连续选择路线。", {}, "fall-down-danger-hard"),
    miniAdvancedLevel(10, "综合最终关", "完成百层试炼", "综合移动、脆弱和危险层板，下降到终点平台。", {}, "fall-down-final"),
  ],
};

export function miniGameConfigs(gameId: MiniGameId) {
  const levels = miniAdvancedLevels[gameId];
  return miniProgressionOrder.map((sourceOrder, index) => {
    const level = levels.find((item) => item.order === sourceOrder) ?? levels[index];
    return config(index + 1, `mini-${gameId}-${miniVariantSlug[gameId][level.variant] ?? level.variant}`, `过关要求：${level.goalText}。${level.description}`, {
      ...level.params,
      miniGameId: gameId,
      miniLevelId: level.levelId ?? `${gameId}-${sourceOrder}`,
    });
  });
}
