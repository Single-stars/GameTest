import { getAdvancedDimensionLevel, type AdvancedProgress } from "../../lib/advanced-progress.ts";
import type { RoundId } from "../../lib/scoring.ts";

export type PlayerAvatarSkin =
  | "cyan"
  | "mint"
  | "amber"
  | "rose"
  | "slate"
  | "basketball"
  | "pig"
  | "aqua"
  | "cocoa"
  | "sand"
  | "pine"
  | "ivory"
  | "arcade"
  | "paw";

export const PLAYER_AVATAR_SKINS = [
  "cyan",
  "mint",
  "amber",
  "rose",
  "slate",
  "basketball",
  "pig",
  "aqua",
  "cocoa",
  "sand",
  "pine",
  "ivory",
  "arcade",
  "paw",
] as const satisfies readonly PlayerAvatarSkin[];

export const PLAYER_AVATAR_SKIN_LABELS = {
  arcade: "手柄",
  amber: "琥珀",
  aqua: "海沫",
  basketball: "篮球",
  cocoa: "可可",
  cyan: "青蓝",
  ivory: "象牙",
  mint: "薄荷",
  paw: "猫爪",
  pig: "猪猪",
  pine: "松绿",
  rose: "玫瑰",
  sand: "沙丘",
  slate: "石板",
} as const satisfies Record<PlayerAvatarSkin, string>;

export const PLAYER_AVATAR_SKIN_DESCRIPTIONS = {
  arcade: "完成耐心最终挑战后解锁，带一点街机按钮质感。",
  amber: "默认解锁，偏暖色的小方块皮肤。",
  aqua: "完成一路向上最终挑战后解锁，适合清爽路线。",
  basketball: "完成反应力最终挑战后解锁，球面纹理外观。",
  cocoa: "完成一路向下最终挑战后解锁，稳重的深色外观。",
  cyan: "默认解锁，最基础的小方块皮肤。",
  ivory: "完成控制最终挑战后解锁，浅色高对比外观。",
  mint: "默认解锁，柔和的绿色外观。",
  paw: "默认解锁，带脚印纹理的灰色外观。",
  pig: "完成准度最终挑战后解锁，粉色小猪外观。",
  pine: "完成记忆最终挑战后解锁，低饱和绿色外观。",
  rose: "默认解锁，偏粉色的小方块皮肤。",
  sand: "完成节奏最终挑战后解锁，带砂砾纹理。",
  slate: "默认解锁，偏冷静的石板色外观。",
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
    };

export const PLAYER_AVATAR_SKIN_UNLOCKS = {
  arcade: { kind: "advanced-final", label: "完成耐心进阶最终挑战解锁", roundId: "patience" },
  amber: { kind: "default", label: "默认解锁" },
  aqua: { kind: "advanced-final", label: "完成一路向上进阶最终挑战解锁", roundId: "search" },
  basketball: { kind: "advanced-final", label: "完成反应力进阶最终挑战解锁", roundId: "reaction" },
  cocoa: { kind: "advanced-final", label: "完成一路向下进阶最终挑战解锁", roundId: "stroop" },
  cyan: { kind: "default", label: "默认解锁" },
  ivory: { kind: "advanced-final", label: "完成控制进阶最终挑战解锁", roundId: "braking" },
  mint: { kind: "default", label: "默认解锁" },
  paw: { kind: "default", label: "默认解锁" },
  pig: { kind: "advanced-final", label: "完成准度进阶最终挑战解锁", roundId: "aim" },
  pine: { kind: "advanced-final", label: "完成记忆进阶最终挑战解锁", roundId: "memory" },
  rose: { kind: "default", label: "默认解锁" },
  sand: { kind: "advanced-final", label: "完成节奏进阶最终挑战解锁", roundId: "rhythm" },
  slate: { kind: "default", label: "默认解锁" },
} as const satisfies Record<PlayerAvatarSkin, PlayerAvatarSkinUnlock>;

export const PLAYER_AVATAR_FACELESS_SKINS = ["basketball", "pig", "paw"] as readonly PlayerAvatarSkin[];

export function resolvePlayerAvatarSkin(skinId: string | null | undefined): PlayerAvatarSkin {
  return PLAYER_AVATAR_SKINS.includes(skinId as PlayerAvatarSkin) ? (skinId as PlayerAvatarSkin) : "cyan";
}

export function getPlayerAvatarSkinUnlockState(skin: PlayerAvatarSkin, progress: AdvancedProgress) {
  const unlock = PLAYER_AVATAR_SKIN_UNLOCKS[skin];
  if (unlock.kind === "default") return { label: unlock.label, unlocked: true };
  return {
    label: unlock.label,
    unlocked: getAdvancedDimensionLevel(progress, unlock.roundId) >= 10,
  };
}

export function isPlayerAvatarSkinUnlocked(skin: PlayerAvatarSkin, progress: AdvancedProgress) {
  return getPlayerAvatarSkinUnlockState(skin, progress).unlocked;
}
