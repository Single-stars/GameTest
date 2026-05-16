import { type MiniGameId } from "../../lib/mini-game-prototypes.ts";
import { type RoundId } from "../../lib/scoring.ts";

export type NativeRoundComponentId = "reaction" | "aim" | "braking";

export type RoundBaseImplementation =
  | {
      type: "native";
      componentId: NativeRoundComponentId;
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
};

export const ROUND_DEFINITIONS: RoundDefinition[] = [
  {
    id: "reaction",
    title: "变色点我",
    label: "反应力",
    rule: "等区域变绿后再点，提前点会记为误点。",
    action: "首轮练习，后 3 轮计分。",
    base: { type: "native", componentId: "reaction" },
  },
  {
    id: "aim",
    title: "移动靶",
    label: "精准度",
    rule: "点击屏幕发射箭，命中移动靶得分。",
    action: "越往后靶子越快越小。",
    base: { type: "native", componentId: "aim" },
  },
  {
    id: "search",
    title: "一路向上",
    label: "连续反应",
    rule: "拖动控制小方块左右移动，踩平台一路上升。",
    action: "基础关失败会原地续跑，超过 3 次失误后直接结算进入下一轮。",
    base: { type: "mini-game", gameId: "doodle" },
  },
  {
    id: "stroop",
    title: "一路向下",
    label: "专注力",
    rule: "左右半屏控制小方块，落到更低的平台并避开危险层板。",
    action: "基础关失误会在当前相机中线生成平台续跑，超过 3 次失误后进入下一轮。",
    base: { type: "mini-game", gameId: "fall-down" },
  },
  {
    id: "rhythm",
    title: "跳一跳",
    label: "节奏感",
    rule: "长按蓄力，松手让小方块跳到下一个平台。",
    action: "基础关失误会重置到原本的下一个平台续跑，超过 3 次失误后进入下一轮。",
    base: { type: "mini-game", gameId: "square-jump" },
  },
  {
    id: "memory",
    title: "一路向前",
    label: "手眼协调",
    rule: "点击让小方块起飞并控制高度，穿过前方门洞。",
    action: "基础关撞到障碍会闪烁复位继续，超过 3 次失误后结算。",
    base: { type: "mini-game", gameId: "flappy" },
  },
  {
    id: "braking",
    title: "小方块急停",
    label: "控制力",
    rule: "长按前进，危险出现时立刻松手。",
    action: "提前松手或撞上危险都会扣分。",
    base: { type: "native", componentId: "braking" },
  },
  {
    id: "patience",
    title: "飞刀连射",
    label: "时机判断",
    rule: "点击发射长条，尽量避开已经插在转盘上的长条。",
    action: "基础关失败不打断，发射完所有长条后按命中表现计分。",
    base: { type: "mini-game", gameId: "knife" },
  },
];

export function getRoundDefinition(roundId: RoundId): RoundDefinition {
  return ROUND_DEFINITIONS.find((round) => round.id === roundId) ?? ROUND_DEFINITIONS[0];
}
