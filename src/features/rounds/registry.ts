import { type RoundId } from "../../lib/scoring.ts";
import { ROUND_DISPLAY_BY_ID } from "../../lib/round-display.ts";
import { type MiniGameId } from "../../lib/mini-games/shared.ts";

export type NativeRoundComponentId = "reaction" | "aim" | "braking";
export type NativeAdvancedRoundComponentId = "advanced-reaction" | "advanced-aim" | "advanced-braking";

export type RoundBaseImplementation =
  | {
      type: "native";
      componentId: NativeRoundComponentId;
    }
  | {
      type: "mini-game";
      gameId: MiniGameId;
    };

export type RoundAdvancedImplementation =
  | {
      type: "native";
      componentId: NativeAdvancedRoundComponentId;
    }
  | {
      type: "mini-game";
      gameId: MiniGameId;
    };

export type RoundDefinition = {
  id: RoundId;
  title: string;
  label: string;
  rule: string;
  action: string;
  base: RoundBaseImplementation;
  advanced: RoundAdvancedImplementation;
};

export const ROUND_DEFINITIONS: RoundDefinition[] = [
  {
    id: "reaction",
    ...ROUND_DISPLAY_BY_ID.reaction,
    rule: "等区域变绿后再点，提前点会记为误点。",
    action: "首轮练习，后 3 轮计分。",
    base: { type: "native", componentId: "reaction" },
    advanced: { type: "native", componentId: "advanced-reaction" },
  },
  {
    id: "aim",
    ...ROUND_DISPLAY_BY_ID.aim,
    rule: "点击屏幕发射箭，命中移动靶得分。",
    action: "越往后靶子越快越小。",
    base: { type: "native", componentId: "aim" },
    advanced: { type: "native", componentId: "advanced-aim" },
  },
  {
    id: "search",
    ...ROUND_DISPLAY_BY_ID.search,
    rule: "拖动控制小方块左右移动，踩平台一路上升。",
    action: "基础关失败会原地续跑，超过 3 次失误后直接结算进入下一轮。",
    base: { type: "mini-game", gameId: "doodle" },
    advanced: { type: "mini-game", gameId: "doodle" },
  },
  {
    id: "stroop",
    ...ROUND_DISPLAY_BY_ID.stroop,
    rule: "左右半屏控制小方块，落到更低的平台并避开危险层板。",
    action: "基础关失误会在当前相机中线生成平台续跑，超过 3 次失误后进入下一轮。",
    base: { type: "mini-game", gameId: "fall-down" },
    advanced: { type: "mini-game", gameId: "fall-down" },
  },
  {
    id: "rhythm",
    ...ROUND_DISPLAY_BY_ID.rhythm,
    rule: "长按蓄力，松手让小方块跳到下一个平台。",
    action: "基础关失误会重置到原本的下一个平台续跑，超过 3 次失误后进入下一轮。",
    base: { type: "mini-game", gameId: "square-jump" },
    advanced: { type: "mini-game", gameId: "square-jump" },
  },
  {
    id: "memory",
    ...ROUND_DISPLAY_BY_ID.memory,
    rule: "点击让小方块起飞并控制高度，穿过前方门洞。",
    action: "基础关撞到障碍会闪烁复位继续，超过 3 次失误后结算。",
    base: { type: "mini-game", gameId: "flappy" },
    advanced: { type: "mini-game", gameId: "flappy" },
  },
  {
    id: "braking",
    ...ROUND_DISPLAY_BY_ID.braking,
    rule: "长按前进，危险出现时立刻松手。",
    action: "提前松手或撞上危险都会扣分。",
    base: { type: "native", componentId: "braking" },
    advanced: { type: "native", componentId: "advanced-braking" },
  },
  {
    id: "patience",
    ...ROUND_DISPLAY_BY_ID.patience,
    rule: "点击发射长条，尽量避开已经插在转盘上的长条。",
    action: "基础关失败不打断，发射完所有长条后按命中表现计分。",
    base: { type: "mini-game", gameId: "knife" },
    advanced: { type: "mini-game", gameId: "knife" },
  },
];

export function getRoundDefinition(roundId: RoundId): RoundDefinition {
  return ROUND_DEFINITIONS.find((round) => round.id === roundId) ?? ROUND_DEFINITIONS[0];
}
