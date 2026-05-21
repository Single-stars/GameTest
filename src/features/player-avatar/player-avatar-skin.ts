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

export const PLAYER_AVATAR_FACELESS_SKINS = ["basketball", "pig", "paw"] as readonly PlayerAvatarSkin[];

export function resolvePlayerAvatarSkin(skinId: string | null | undefined): PlayerAvatarSkin {
  return PLAYER_AVATAR_SKINS.includes(skinId as PlayerAvatarSkin) ? (skinId as PlayerAvatarSkin) : "cyan";
}
