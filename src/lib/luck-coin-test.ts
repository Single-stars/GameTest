export const LUCK_COIN_TEST_SCORE_TABLE = [
  { points: 1, probability: 0.75 },
  { points: 2, probability: 0.2 },
  { points: 3, probability: 0.03 },
  { points: 4, probability: 0.015 },
  { points: 5, probability: 0.005 },
] as const;

export const LUCK_COIN_TEST_SCORE_EXPECTATION = Number(
  LUCK_COIN_TEST_SCORE_TABLE.reduce((sum, item) => sum + item.points * item.probability, 0).toFixed(3),
);

const LUCK_COIN_TEST_THRESHOLDS = [
  { star: 0, threshold: 0, nextThreshold: 20, tone: "empty" },
  { star: 1, threshold: 20, nextThreshold: 40, tone: "bronze" },
  { star: 2, threshold: 40, nextThreshold: 60, tone: "silver" },
  { star: 3, threshold: 60, nextThreshold: 80, tone: "violet" },
  { star: 4, threshold: 80, nextThreshold: 100, tone: "blue" },
  { star: 5, threshold: 100, nextThreshold: null, tone: "gold" },
] as const;

export function resolveLuckCoinTestScore(random: number) {
  const clamped = Math.min(0.999999, Math.max(0, random));
  let cursor = 0;
  for (const item of LUCK_COIN_TEST_SCORE_TABLE) {
    cursor += item.probability;
    if (clamped < cursor) return item.points;
  }
  return 5;
}

export function getLuckCoinTestTier(score: number) {
  const normalized = Math.max(0, Math.floor(score));
  for (let index = LUCK_COIN_TEST_THRESHOLDS.length - 1; index >= 0; index -= 1) {
    const tier = LUCK_COIN_TEST_THRESHOLDS[index];
    if (normalized >= tier.threshold) return { ...tier };
  }
  return { ...LUCK_COIN_TEST_THRESHOLDS[0] };
}
