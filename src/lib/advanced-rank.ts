export type AdvancedKingRankLabel =
  | "最强王者"
  | "至圣王者"
  | "无双王者"
  | "非凡王者"
  | "绝世王者"
  | "荣耀王者"
  | "传奇王者";

export type AdvancedKingRank = {
  label: AdvancedKingRankLabel;
  stars: number;
};

export const ADVANCED_STAR_LIMITS = {
  dimensionCount: 8,
  levelsPerDimension: 10,
  luckStars: 20,
  maxStars: 100,
} as const;

export const ADVANCED_KING_RANK_TIERS: ReadonlyArray<{
  minStars: number;
  maxStars: number;
  label: AdvancedKingRankLabel;
}> = [
  { minStars: 0, maxStars: 9, label: "最强王者" },
  { minStars: 10, maxStars: 19, label: "至圣王者" },
  { minStars: 20, maxStars: 29, label: "无双王者" },
  { minStars: 30, maxStars: 39, label: "非凡王者" },
  { minStars: 40, maxStars: 49, label: "绝世王者" },
  { minStars: 50, maxStars: 99, label: "荣耀王者" },
  { minStars: 100, maxStars: 100, label: "传奇王者" },
];

function clampAdvancedStars(stars: number) {
  if (!Number.isFinite(stars)) return 0;
  return Math.max(0, Math.min(ADVANCED_STAR_LIMITS.maxStars, Math.floor(stars)));
}

export function getAdvancedKingRank(stars: number): AdvancedKingRank {
  const clampedStars = clampAdvancedStars(stars);
  const tier = ADVANCED_KING_RANK_TIERS.find(
    (item) => clampedStars >= item.minStars && clampedStars <= item.maxStars,
  );

  return {
    label: tier?.label ?? "传奇王者",
    stars: clampedStars,
  };
}

export function formatAdvancedKingRank(stars: number) {
  const rank = getAdvancedKingRank(stars);
  return `${rank.label}⭐${rank.stars}`;
}
