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
    rule: "当绿灯亮起时快速点击屏幕",
    action: "要注意不能提前点击哦。",
    base: { type: "native", componentId: "reaction" },
    advanced: { type: "native", componentId: "advanced-reaction" },
  },
  {
    id: "aim",
    ...ROUND_DISPLAY_BY_ID.aim,
    rule: "点击屏幕发射箭矢",
    action: "尽量让每一支箭都打在靶子上！",
    base: { type: "native", componentId: "aim" },
    advanced: { type: "native", componentId: "advanced-aim" },
  },
  {
    id: "search",
    ...ROUND_DISPLAY_BY_ID.search,
    rule: "长按左右屏幕可以控制小方块移动",
    action: "到达终点前小心不要掉下去哦。",
    base: { type: "mini-game", gameId: "doodle" },
    advanced: { type: "mini-game", gameId: "doodle" },
  },
  {
    id: "stroop",
    ...ROUND_DISPLAY_BY_ID.stroop,
    rule: "长按左右屏幕可以控制小方块移动",
    action: "千万不要掉出屏幕外了！",
    base: { type: "mini-game", gameId: "fall-down" },
    advanced: { type: "mini-game", gameId: "fall-down" },
  },
  {
    id: "rhythm",
    ...ROUND_DISPLAY_BY_ID.rhythm,
    rule: "经典的长按蓄力跳一跳",
    action: "要看准每一个平台。",
    base: { type: "mini-game", gameId: "square-jump" },
    advanced: { type: "mini-game", gameId: "square-jump" },
  },
  {
    id: "memory",
    ...ROUND_DISPLAY_BY_ID.memory,
    rule: "点击屏幕小方块就会跳起来",
    action: "穿过危险的障碍物逃出去吧！",
    base: { type: "mini-game", gameId: "flappy" },
    advanced: { type: "mini-game", gameId: "flappy" },
  },
  {
    id: "braking",
    ...ROUND_DISPLAY_BY_ID.braking,
    rule: "长按屏幕小方块就会前进",
    action: "遇到危险的时记得放手。",
    base: { type: "native", componentId: "braking" },
    advanced: { type: "native", componentId: "advanced-braking" },
  },
  {
    id: "patience",
    ...ROUND_DISPLAY_BY_ID.patience,
    rule: "点击屏幕发射飞刀",
    action: "千万不要射到已经插在转盘上的飞刀。",
    base: { type: "mini-game", gameId: "knife" },
    advanced: { type: "mini-game", gameId: "knife" },
  },
];

export function getRoundDefinition(roundId: RoundId): RoundDefinition {
  return ROUND_DEFINITIONS.find((round) => round.id === roundId) ?? ROUND_DEFINITIONS[0];
}
