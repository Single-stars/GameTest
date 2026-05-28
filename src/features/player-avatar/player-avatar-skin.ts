import { getAdvancedDimensionLevel, type AdvancedProgress } from "../../lib/advanced-progress.ts";
import type { RoundId } from "../../lib/scoring.ts";

export type PlayerAvatarSkin =
  | "cyan"
  | "signal"
  | "target"
  | "mint"
  | "slate"
  | "basketball"
  | "pig"
  | "sand"
  | "pine"
  | "ivory"
  | "arcade"
  | "paw"
  | "blade";

export const PLAYER_AVATAR_SKINS = [
  "cyan",
  "signal",
  "target",
  "mint",
  "slate",
  "sand",
  "pine",
  "ivory",
  "blade",
  "paw",
  "pig",
  "basketball",
  "arcade",
] as const satisfies readonly PlayerAvatarSkin[];

const PLAYER_AVATAR_SKIN_DISPLAY_ORDER = [
  "cyan",
  "signal",
  "target",
  "mint",
  "slate",
  "sand",
  "pine",
  "ivory",
  "blade",
  "paw",
  "pig",
  "basketball",
  "arcade",
] as const satisfies readonly PlayerAvatarSkin[];
const PLAYER_AVATAR_SKIN_DISPLAY_ORDER_INDEX = new Map(PLAYER_AVATAR_SKIN_DISPLAY_ORDER.map((skin, index) => [skin, index]));

export const PLAYER_AVATAR_SKIN_LABELS = {
  arcade: "手柄",
  basketball: "篮球",
  blade: "飞刀",
  cyan: "青蓝",
  ivory: "象牙",
  mint: "薄荷",
  paw: "猫爪",
  pig: "猪猪",
  pine: "松绿",
  sand: "沙丘",
  signal: "绿灯",
  slate: "石板",
  target: "靶心",
} as const satisfies Record<PlayerAvatarSkin, string>;

export const PLAYER_AVATAR_SKIN_DESCRIPTIONS = {
  arcade: "谢谢你支持我的游戏！",
  basketball: "哇真的是你呀",
  blade: "块狠话不多",
  cyan: "原装方块，干净耐看。",
  ivory: "成功方块，尊贵优雅",
  mint: "清清凉凉，冰冰爽爽",
  paw: "喵~",
  pig: "作者本体",
  pine: "是薄荷的长辈",
  sand: "脸上的痕迹不是皱纹",
  signal: "从不闯红灯的乖方块",
  slate: "沉着稳重",
  target: "很难被打中的小方块",
} as const satisfies Record<PlayerAvatarSkin, string>;

type PlayerAvatarSkinUnlock =
  | {
      kind: "default";
      label: string;
    }
  | {
      kind: "advanced-final";
      label: string;
      roundId: RoundId;
    }
  | {
      kind: "donation";
      label: string;
    }
  | {
      kind: "king-rank";
      label: string;
    }
  | {
      kind: "legend-100";
      label: string;
    }
  | {
      kind: "luck-100";
      label: string;
    };

export const PLAYER_AVATAR_SKIN_UNLOCKS = {
  arcade: { kind: "donation", label: "赞赏作者后解锁" },
  basketball: { kind: "legend-100", label: "传奇王者 100 星解锁" },
  blade: { kind: "advanced-final", label: "通关丢飞刀最终试炼", roundId: "patience" },
  cyan: { kind: "default", label: "默认解锁" },
  ivory: { kind: "advanced-final", label: "通关停下来最终试炼", roundId: "braking" },
  mint: { kind: "advanced-final", label: "通关一路向上最终试炼", roundId: "search" },
  paw: { kind: "luck-100", label: "运气达到 100" },
  pig: { kind: "king-rank", label: "达成最强王者" },
  pine: { kind: "advanced-final", label: "通关一路向前最终试炼", roundId: "memory" },
  sand: { kind: "advanced-final", label: "通关跳一跳最终试炼", roundId: "rhythm" },
  signal: { kind: "advanced-final", label: "通关绿灯行最终试炼", roundId: "reaction" },
  slate: { kind: "advanced-final", label: "通关一路向下最终试炼", roundId: "stroop" },
  target: { kind: "advanced-final", label: "通关移动靶最终试炼", roundId: "aim" },
} as const satisfies Record<PlayerAvatarSkin, PlayerAvatarSkinUnlock>;

export const PLAYER_AVATAR_FACELESS_SKINS = ["basketball", "pig", "paw"] as readonly PlayerAvatarSkin[];

export function resolvePlayerAvatarSkin(skinId: string | null | undefined): PlayerAvatarSkin {
  return PLAYER_AVATAR_SKINS.includes(skinId as PlayerAvatarSkin) ? (skinId as PlayerAvatarSkin) : "cyan";
}

export function getPlayerAvatarSkinUnlockState(skin: PlayerAvatarSkin, progress: AdvancedProgress) {
  const unlock = PLAYER_AVATAR_SKIN_UNLOCKS[skin];
  switch (unlock.kind) {
    case "default":
      return { label: unlock.label, unlocked: true };
    case "advanced-final":
      return { label: unlock.label, unlocked: getAdvancedDimensionLevel(progress, unlock.roundId) >= 10 };
    case "donation":
      return { label: unlock.label, unlocked: progress.authorDonated === true };
    case "king-rank":
      return { label: unlock.label, unlocked: progress.unlocked === true };
    case "legend-100":
      return { label: unlock.label, unlocked: progress.legend100SkinUnlocked === true };
    case "luck-100":
      return { label: unlock.label, unlocked: progress.luckBestScore >= 100 };
  }
}

export function getPlayerAvatarSkinDisplayItems(progress: AdvancedProgress) {
  return PLAYER_AVATAR_SKINS.map((skin) => ({
    skin,
    unlock: getPlayerAvatarSkinUnlockState(skin, progress),
  })).sort((a, b) => {
    if (a.unlock.unlocked !== b.unlock.unlocked) return a.unlock.unlocked ? -1 : 1;
    return (PLAYER_AVATAR_SKIN_DISPLAY_ORDER_INDEX.get(a.skin) ?? 999) - (PLAYER_AVATAR_SKIN_DISPLAY_ORDER_INDEX.get(b.skin) ?? 999);
  });
}

export function isPlayerAvatarSkinUnlocked(skin: PlayerAvatarSkin, progress: AdvancedProgress) {
  return getPlayerAvatarSkinUnlockState(skin, progress).unlocked;
}
