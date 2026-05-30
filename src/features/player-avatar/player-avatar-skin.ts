import { getAdvancedDimensionLevel, getAdvancedTotalStars, type AdvancedProgress } from "../../lib/advanced-progress.ts";
import type { RoundId } from "../../lib/scoring.ts";

export type PlayerAvatarSkin =
  | "cyan"
  | "signal"
  | "target"
  | "mint"
  | "slate"
  | "basketball"
  | "starfall"
  | "pig"
  | "sand"
  | "pine"
  | "ivory"
  | "arcade"
  | "paw"
  | "blade"
  | "custom";

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
  "starfall",
  "arcade",
  "custom",
] as const satisfies readonly PlayerAvatarSkin[];

const PLAYER_AVATAR_SKIN_DISPLAY_ORDER = [
  "custom",
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
  "starfall",
  "arcade",
] as const satisfies readonly PlayerAvatarSkin[];
const PLAYER_AVATAR_SKIN_DISPLAY_ORDER_INDEX = new Map(PLAYER_AVATAR_SKIN_DISPLAY_ORDER.map((skin, index) => [skin, index]));

function getPlayerAvatarSkinDisplayIndex(skin: PlayerAvatarSkin, unlocked: boolean) {
  if (!unlocked && skin === "custom") return 9999;
  return PLAYER_AVATAR_SKIN_DISPLAY_ORDER_INDEX.get(skin) ?? 999;
}

export const PLAYER_AVATAR_SKIN_LABELS = {
  arcade: "手柄",
  basketball: "篮球",
  blade: "飞刀",
  custom: "创意",
  cyan: "青蓝",
  ivory: "象牙",
  mint: "薄荷",
  paw: "猫爪",
  pig: "猪猪",
  pine: "松绿",
  sand: "沙丘",
  signal: "绿灯",
  slate: "石板",
  starfall: "星陨",
  target: "靶心",
} as const satisfies Record<PlayerAvatarSkin, string>;

export const PLAYER_AVATAR_SKIN_DESCRIPTIONS = {
  arcade: "谢谢你支持我的游戏！",
  basketball: "哇真的是你呀",
  blade: "块狠话不多",
  custom: "来自世界之外的小方块",
  cyan: "原装方块，干净耐看。",
  ivory: "成功方块，尊贵优雅",
  mint: "清清凉凉，冰冰爽爽",
  paw: "喵~",
  pig: "作者本体",
  pine: "是薄荷的长辈",
  sand: "脸上的痕迹不是皱纹",
  signal: "从不闯红灯的乖方块",
  slate: "沉着稳重",
  starfall: "三百颗够吗？",
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
      kind: "legend-50";
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
  arcade: { kind: "donation", label: "投喂作者一次解锁" },
  basketball: { kind: "legend-50", label: "荣耀王者 50 星解锁" },
  blade: { kind: "advanced-final", label: "通关丢飞刀最终试炼", roundId: "patience" },
  custom: { kind: "donation", label: "投喂作者一次解锁" },
  cyan: { kind: "default", label: "默认解锁" },
  ivory: { kind: "advanced-final", label: "通关停下来最终试炼", roundId: "braking" },
  mint: { kind: "advanced-final", label: "通关一路向上最终试炼", roundId: "search" },
  paw: { kind: "luck-100", label: "运气达到 100" },
  pig: { kind: "king-rank", label: "达成最强王者" },
  pine: { kind: "advanced-final", label: "通关一路向前最终试炼", roundId: "memory" },
  sand: { kind: "advanced-final", label: "通关跳一跳最终试炼", roundId: "rhythm" },
  signal: { kind: "advanced-final", label: "通关绿灯行最终试炼", roundId: "reaction" },
  slate: { kind: "advanced-final", label: "通关一路向下最终试炼", roundId: "stroop" },
  starfall: { kind: "legend-100", label: "传奇王者 100 星解锁" },
  target: { kind: "advanced-final", label: "通关移动靶最终试炼", roundId: "aim" },
} as const satisfies Record<PlayerAvatarSkin, PlayerAvatarSkinUnlock>;

export const PLAYER_AVATAR_FACELESS_SKINS = ["basketball", "pig", "paw", "custom"] as readonly PlayerAvatarSkin[];

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
    case "legend-50":
      return { label: unlock.label, unlocked: getAdvancedTotalStars(progress) >= 50 };
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
    return getPlayerAvatarSkinDisplayIndex(a.skin, a.unlock.unlocked) - getPlayerAvatarSkinDisplayIndex(b.skin, b.unlock.unlocked);
  });
}

export function isPlayerAvatarSkinUnlocked(skin: PlayerAvatarSkin, progress: AdvancedProgress) {
  return getPlayerAvatarSkinUnlockState(skin, progress).unlocked;
}

export function getNewlyUnlockedPlayerAvatarSkins(before: AdvancedProgress, after: AdvancedProgress): PlayerAvatarSkin[] {
  return PLAYER_AVATAR_SKINS.filter((skin) => {
    if (skin === "cyan") return false;
    return !getPlayerAvatarSkinUnlockState(skin, before).unlocked && getPlayerAvatarSkinUnlockState(skin, after).unlocked;
  });
}

export function getUnlockedSkinFromAdvancedClear(roundId: RoundId, before: AdvancedProgress, after: AdvancedProgress): PlayerAvatarSkin | undefined {
  return getNewlyUnlockedPlayerAvatarSkins(before, after).find((skin) => {
    const unlock = PLAYER_AVATAR_SKIN_UNLOCKS[skin];
    return unlock.kind === "advanced-final" && unlock.roundId === roundId;
  });
}
