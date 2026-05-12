export type SearchPattern = {
  color: string;
  shape: "circle" | "square";
  hollow: boolean;
};

export type SearchDot = SearchPattern & {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  size: number;
  target: boolean;
  durationMs: number;
  delayMs: number;
};

export type SearchScene = {
  dots: SearchDot[];
  targetCount: number;
  totalDots: number;
  durationMs: number;
  difficulty: number;
  options: number[];
  targetPatterns: SearchPattern[];
};

type RandomSource = () => number;

export type SearchStageConfig = {
  level: number;
  variant: string;
  params: Record<string, number | string | boolean | null>;
};

type SearchSceneOptions = {
  random?: RandomSource;
};

type SceneBuildInput = {
  totalDots: number;
  targetCount: number;
  targetPatterns: SearchPattern[];
  directions: number;
  durationMs: number;
  difficulty: number;
  dotMinMs: number;
  dotMaxMs: number;
  slope: number;
  roundIndex: number;
  random: RandomSource;
  targetSize: [number, number];
  distractorSize: [number, number];
};

export const SEARCH_PATTERN_PALETTE: SearchPattern[] = [
  { color: "#e1251b", shape: "circle", hollow: false },
  { color: "#2f80ed", shape: "square", hollow: false },
  { color: "#2f9b68", shape: "circle", hollow: true },
  { color: "#d39b2a", shape: "square", hollow: true },
  { color: "#7b61ff", shape: "circle", hollow: false },
  { color: "#0f9f9a", shape: "square", hollow: false },
];

const BASIC_SEARCH_CONFIGS = [
  { totalDots: 16, targetMin: 3, targetMax: 4, durationMs: 4200, dotMinMs: 3200, dotMaxMs: 3900, slope: 6 },
  { totalDots: 20, targetMin: 3, targetMax: 5, durationMs: 4400, dotMinMs: 2900, dotMaxMs: 3600, slope: 9 },
  { totalDots: 24, targetMin: 4, targetMax: 6, durationMs: 4600, dotMinMs: 2500, dotMaxMs: 3300, slope: 12 },
  { totalDots: 28, targetMin: 3, targetMax: 7, durationMs: 4800, dotMinMs: 2200, dotMaxMs: 3000, slope: 15 },
] as const;

export function patternKey(pattern: SearchPattern) {
  return `${pattern.color}-${pattern.shape}-${pattern.hollow}`;
}

export function makeSearchScene(roundIndex: number, options: SearchSceneOptions = {}): SearchScene {
  const random = options.random ?? Math.random;
  const config = BASIC_SEARCH_CONFIGS[Math.min(roundIndex, BASIC_SEARCH_CONFIGS.length - 1)];
  const targetCount = randomInt(random, config.targetMin, config.targetMax);
  const targetPatterns = pickTargetPatterns(1, random);

  return buildScene({
    totalDots: config.totalDots,
    targetCount,
    targetPatterns,
    directions: 2,
    durationMs: config.durationMs,
    difficulty: roundIndex + 1,
    dotMinMs: config.dotMinMs,
    dotMaxMs: config.dotMaxMs,
    slope: config.slope,
    roundIndex,
    random,
    targetSize: [34, 43],
    distractorSize: [30, 45],
  });
}

export function makeAdvancedSearchScene(
  config: SearchStageConfig,
  roundIndex: number,
  options: SearchSceneOptions = {},
): SearchScene {
  const random = options.random ?? Math.random;
  const totalDots = numberParam(config, "totalDots", 20);
  const configuredPatternCount = numberParam(config, "targetPatternCount", 1);
  const patternCount = config.level === 3 && roundIndex >= 2 ? 2 : configuredPatternCount;
  const directions = numberParam(config, "directions", 2);
  const targetPatterns = pickTargetPatterns(patternCount, random);
  const targetCount = Math.max(2, Math.min(9, Math.floor(totalDots * 0.24) + roundIndex));
  const durationMs = config.variant.includes("pattern") || config.variant === "search-boss" ? 5400 : 4400;

  return buildScene({
    totalDots,
    targetCount,
    targetPatterns,
    directions,
    durationMs,
    difficulty: config.level,
    dotMinMs: 3600,
    dotMaxMs: 4800,
    slope: 16,
    roundIndex,
    random,
    targetSize: [30, 40],
    distractorSize: [28, 42],
  });
}

function buildScene(input: SceneBuildInput): SearchScene {
  const targetKeys = new Set(input.targetPatterns.map(patternKey));
  const launchPatterns = spreadPatternSequence(
    [
      ...Array.from({ length: input.targetCount }, (_, index) => input.targetPatterns[index % input.targetPatterns.length]),
      ...buildDistractorPatterns(input.totalDots - input.targetCount, targetKeys, input.random),
    ],
    input.random,
  );

  const dots = launchPatterns.map((pattern, index) => {
    const target = targetKeys.has(patternKey(pattern));
    const durationMs = rand(input.random, input.dotMinMs, input.dotMaxMs);
    const delayWindowMs = Math.max(0, input.durationMs - input.dotMaxMs);
    const delayMs = input.totalDots <= 1 ? 0 : (index / (input.totalDots - 1)) * delayWindowMs;
    const path = makeFlightPath(index % Math.max(2, input.directions), input.slope, input.random);

    return {
      id: input.roundIndex * 100 + index,
      ...path,
      size: target ? rand(input.random, input.targetSize[0], input.targetSize[1]) : rand(input.random, input.distractorSize[0], input.distractorSize[1]),
      color: pattern.color,
      shape: pattern.shape,
      hollow: pattern.hollow,
      target,
      durationMs,
      delayMs,
    } satisfies SearchDot;
  });

  return {
    dots,
    targetCount: input.targetCount,
    totalDots: input.totalDots,
    durationMs: input.durationMs,
    difficulty: input.difficulty,
    options: makeCountOptions(input.targetCount, input.totalDots, input.random),
    targetPatterns: input.targetPatterns,
  };
}

function buildDistractorPatterns(count: number, targetKeys: Set<string>, random: RandomSource) {
  const pool = shuffle(
    SEARCH_PATTERN_PALETTE.filter((pattern) => !targetKeys.has(patternKey(pattern))),
    random,
  );

  return Array.from({ length: count }, (_, index) => pool[index % pool.length]);
}

function spreadPatternSequence(patterns: SearchPattern[], random: RandomSource) {
  const buckets = new Map<string, { pattern: SearchPattern; remaining: number }>();
  for (const pattern of shuffle(patterns, random)) {
    const key = patternKey(pattern);
    const current = buckets.get(key);
    if (current) current.remaining += 1;
    else buckets.set(key, { pattern, remaining: 1 });
  }

  const result: SearchPattern[] = [];
  let lastKey = "";
  while (result.length < patterns.length) {
    const available = [...buckets.entries()].filter(([, bucket]) => bucket.remaining > 0);
    const preferred = available.filter(([key]) => key !== lastKey);
    const candidates = preferred.length > 0 ? preferred : available;
    const maxRemaining = Math.max(...candidates.map(([, bucket]) => bucket.remaining));
    const top = candidates.filter(([, bucket]) => bucket.remaining === maxRemaining);
    const [key, bucket] = top[randomInt(random, 0, top.length - 1)];

    result.push(bucket.pattern);
    bucket.remaining -= 1;
    lastKey = key;
  }

  return result;
}

function pickTargetPatterns(count: number, random: RandomSource) {
  const normalizedCount = Math.max(1, Math.min(SEARCH_PATTERN_PALETTE.length, Math.floor(count)));
  return shuffle(SEARCH_PATTERN_PALETTE, random).slice(0, normalizedCount);
}

function makeFlightPath(direction: number, slope: number, random: RandomSource) {
  const fromX = direction === 0 ? -14 : direction === 1 ? 114 : rand(random, -10, 110);
  const fromY = direction === 2 ? -12 : direction === 3 ? 112 : rand(random, 16, 84);
  const toX = direction === 0 ? 114 : direction === 1 ? -14 : rand(random, -10, 110);
  const toY = direction === 2 ? 112 : direction === 3 ? -12 : clamp(fromY + rand(random, -slope, slope), 12, 88);

  return { fromX, fromY, toX, toY };
}

function makeCountOptions(targetCount: number, totalDots: number, random: RandomSource) {
  const options = new Set([targetCount]);
  const offsets = shuffle([-1, 1, -2, 2], random);
  for (const offset of offsets) {
    if (options.size >= 4) break;
    const next = targetCount + offset;
    if (next >= 0 && next <= totalDots) options.add(next);
  }

  let fallbackDistance = 3;
  while (options.size < 4) {
    for (const offset of [-fallbackDistance, fallbackDistance]) {
      const next = targetCount + offset;
      if (next >= 0 && next <= totalDots) options.add(next);
      if (options.size >= 4) break;
    }
    fallbackDistance += 1;
  }

  return shuffle([...options], random);
}

function numberParam(config: SearchStageConfig, key: string, fallback: number) {
  const value = Number(config.params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function shuffle<T>(items: T[], random: RandomSource) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function randomInt(random: RandomSource, min: number, max: number) {
  return Math.floor(rand(random, min, max + 1));
}

function rand(random: RandomSource, min: number, max: number) {
  return random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
