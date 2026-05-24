import type { RankName, RoundId, TrialEvent } from "./scoring";

export const GAME_STATE_SCHEMA_VERSION = 1;
export const GAME_STATE_STORAGE_KEY = "game-rank-test/state/v1";
const ADVANCED_STAR_LIMITS = {
  dimensionCount: 8,
  levelsPerDimension: 10,
  luckStars: 20,
  maxStars: 100,
} as const;

const ADVANCED_KING_RANK_TIERS = [
  { minStars: 0, maxStars: 9, label: "最强王者" },
  { minStars: 10, maxStars: 19, label: "至圣王者" },
  { minStars: 20, maxStars: 29, label: "无双王者" },
  { minStars: 30, maxStars: 39, label: "非凡王者" },
  { minStars: 40, maxStars: 49, label: "绝世王者" },
  { minStars: 50, maxStars: 99, label: "荣耀王者" },
  { minStars: 100, maxStars: 100, label: "传奇王者" },
] as const;

export const ADVANCED_ROUND_IDS = [
  "reaction",
  "aim",
  "search",
  "stroop",
  "rhythm",
  "memory",
  "braking",
  "patience",
] as const satisfies readonly RoundId[];

export type AdvancedDimensionProgress = {
  clearedLevels: boolean[];
  attempts: number[];
  bestScores: number[];
  lastPassed: Array<boolean | null>;
  lastGoalChecks: Array<boolean[] | null>;
  reactionLastAveragesMs: Array<number | null>;
  reactionBestAveragesMs: Array<number | null>;
};

export type AdvancedProgress = {
  schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  unlocked: boolean;
  dimensions: Record<RoundId, AdvancedDimensionProgress>;
  luckStars: number;
  luckBestScore: number;
  luckDrawChances: number;
  luckDrawCount: number;
  updatedAt: string;
};

export type PersistedCurrentResult = {
  completedAt: string;
  trials: TrialEvent[];
};

export type PersistedGameState = {
  schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  currentResult: PersistedCurrentResult | null;
  advancedProgress: AdvancedProgress;
};

export type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export type AdvancedChallengeRecord = {
  roundId: RoundId;
  level: number;
  score: number;
  passed: boolean;
  goalChecks?: boolean[];
  reactionAverageMs?: number | null;
  completedAt?: string;
};

export type AdvancedLevelChallengeSnapshot = {
  attempted: boolean;
  lastPassed: boolean | null;
  lastGoalChecks: boolean[] | null;
  reactionLastAverageMs: number | null;
  reactionBestAverageMs: number | null;
};

export type AdvancedLevelState = "completed" | "current" | "locked";
export type AdvancedBackSource = "select" | "intro" | "playing" | "base-playing" | "complete";
export type AdvancedBackDestination = "result" | "challenge";
export type AdvancedCompletionAction = "retry" | "next" | "maxed";
export type AppStage = "home" | "homeworld" | "intro" | "playing" | "result" | "share" | "advanced" | "luck" | "avatar-lab";
export type AppBackNavigation = "unhandled" | "release" | "guard";
export type AppBackHistoryLayer = 0 | 1 | 2;

export type AdvancedLevelTone =
  | "advanced-empty"
  | "advanced-tier-1"
  | "advanced-tier-2"
  | "advanced-tier-3"
  | "advanced-gold";

export type LuckDrawOutcome = {
  score: number;
  stars: number;
  improved: boolean;
  guaranteed: boolean;
  draws?: number;
  originalScores?: number[];
};

export type LuckDrawResult = {
  progress: AdvancedProgress;
  outcome: LuckDrawOutcome | null;
};

const ADVANCED_LEVEL_COUNT = ADVANCED_STAR_LIMITS.levelsPerDimension;
const ADVANCED_DIMENSION_STAR_LIMIT = ADVANCED_STAR_LIMITS.dimensionCount * ADVANCED_STAR_LIMITS.levelsPerDimension;

function timestamp() {
  return new Date().toISOString();
}
function clampInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampScore(value: unknown) {
  return clampInteger(value, 0, 100);
}

function isRoundId(value: unknown): value is RoundId {
  return typeof value === "string" && (ADVANCED_ROUND_IDS as readonly string[]).includes(value);
}

function createDefaultDimensionProgress(): AdvancedDimensionProgress {
  return {
    clearedLevels: Array.from({ length: ADVANCED_LEVEL_COUNT }, () => false),
    attempts: Array.from({ length: ADVANCED_LEVEL_COUNT }, () => 0),
    bestScores: Array.from({ length: ADVANCED_LEVEL_COUNT }, () => 0),
    lastPassed: Array.from({ length: ADVANCED_LEVEL_COUNT }, () => null),
    lastGoalChecks: Array.from({ length: ADVANCED_LEVEL_COUNT }, () => null),
    reactionLastAveragesMs: Array.from({ length: ADVANCED_LEVEL_COUNT }, () => null),
    reactionBestAveragesMs: Array.from({ length: ADVANCED_LEVEL_COUNT }, () => null),
  };
}

function normalizeFixedArray<T>(
  value: unknown,
  fallback: T,
  normalizeItem: (item: unknown) => T,
): T[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: ADVANCED_LEVEL_COUNT }, (_, index) =>
    index < source.length ? normalizeItem(source[index]) : fallback,
  );
}

function normalizeOptionalBoolean(item: unknown): boolean | null {
  if (typeof item !== "boolean") return null;
  return item;
}

function normalizeGoalChecks(item: unknown): boolean[] | null {
  if (!Array.isArray(item)) return null;
  const checks = item
    .filter((entry) => typeof entry === "boolean")
    .map((entry) => Boolean(entry))
    .slice(0, 8);
  return checks.length > 0 ? checks : null;
}

function normalizeReactionAverageMs(item: unknown): number | null {
  if (item === null || item === undefined || item === "") return null;
  const value = Number(item);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

function sanitizeDimensionProgress(value: unknown): AdvancedDimensionProgress {
  const source = typeof value === "object" && value !== null ? (value as Partial<AdvancedDimensionProgress>) : {};
  return {
    clearedLevels: normalizeFixedArray(source.clearedLevels, false, Boolean),
    attempts: normalizeFixedArray(source.attempts, 0, (item) => clampInteger(item, 0, 9999)),
    bestScores: normalizeFixedArray(source.bestScores, 0, clampScore),
    lastPassed: normalizeFixedArray(source.lastPassed, null, normalizeOptionalBoolean),
    lastGoalChecks: normalizeFixedArray(source.lastGoalChecks, null, normalizeGoalChecks),
    reactionLastAveragesMs: normalizeFixedArray(source.reactionLastAveragesMs, null, normalizeReactionAverageMs),
    reactionBestAveragesMs: normalizeFixedArray(source.reactionBestAveragesMs, null, normalizeReactionAverageMs),
  };
}

function countClearedAdvancedLevels(dimensions: Record<RoundId, AdvancedDimensionProgress>) {
  return ADVANCED_ROUND_IDS.reduce((sum, roundId) => sum + dimensions[roundId].clearedLevels.filter(Boolean).length, 0);
}

function sanitizeAdvancedProgress(value: unknown, updatedAt = timestamp()): AdvancedProgress {
  const source = typeof value === "object" && value !== null ? (value as Partial<AdvancedProgress>) : {};
  const sourceDimensions =
    typeof source.dimensions === "object" && source.dimensions !== null
      ? (source.dimensions as Partial<Record<RoundId, unknown>>)
      : {};
  const dimensions = Object.fromEntries(
    ADVANCED_ROUND_IDS.map((roundId) => [roundId, sanitizeDimensionProgress(sourceDimensions[roundId])]),
  ) as Record<RoundId, AdvancedDimensionProgress>;
  const luckStars = clampInteger(source.luckStars, 0, ADVANCED_STAR_LIMITS.luckStars);
  const completedChallengeCount = Math.min(ADVANCED_DIMENSION_STAR_LIMIT, countClearedAdvancedLevels(dimensions));
  const luckDrawCount = clampInteger(source.luckDrawCount, 0, completedChallengeCount);

  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    unlocked: source.unlocked === true,
    dimensions,
    luckStars,
    luckBestScore: clampInteger(source.luckBestScore, Math.min(100, luckStars * 5), 100),
    luckDrawChances: completedChallengeCount - luckDrawCount,
    luckDrawCount,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : updatedAt,
  };
}

function sanitizeCurrentResult(value: unknown, completedAt = timestamp()): PersistedCurrentResult | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Partial<PersistedCurrentResult>;
  if (!Array.isArray(source.trials) || source.trials.length === 0) return null;

  return {
    completedAt: typeof source.completedAt === "string" && source.completedAt ? source.completedAt : completedAt,
    trials: source.trials.filter((trial): trial is TrialEvent => typeof trial === "object" && trial !== null && isRoundId((trial as TrialEvent).roundId)),
  };
}

function sanitizePersistedGameState(value: unknown, updatedAt = timestamp()): PersistedGameState {
  const source = typeof value === "object" && value !== null ? (value as Partial<PersistedGameState>) : {};
  if (source.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
    return createDefaultPersistedGameState(updatedAt);
  }

  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    currentResult: sanitizeCurrentResult(source.currentResult, updatedAt),
    advancedProgress: sanitizeAdvancedProgress(source.advancedProgress, updatedAt),
  };
}

export function createDefaultAdvancedProgress(updatedAt = timestamp()): AdvancedProgress {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    unlocked: false,
    dimensions: Object.fromEntries(ADVANCED_ROUND_IDS.map((roundId) => [roundId, createDefaultDimensionProgress()])) as Record<
      RoundId,
      AdvancedDimensionProgress
    >,
    luckStars: 0,
    luckBestScore: 0,
    luckDrawChances: 0,
    luckDrawCount: 0,
    updatedAt,
  };
}

export function createDefaultPersistedGameState(updatedAt = timestamp()): PersistedGameState {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    currentResult: null,
    advancedProgress: createDefaultAdvancedProgress(updatedAt),
  };
}

export function getAdvancedDimensionLevel(progress: AdvancedProgress, roundId: RoundId) {
  const dimension = sanitizeAdvancedProgress(progress).dimensions[roundId];
  for (let index = dimension.clearedLevels.length - 1; index >= 0; index -= 1) {
    if (dimension.clearedLevels[index]) return index + 1;
  }
  return 0;
}

export function getAdvancedLevelChallengeSnapshot(
  progress: AdvancedProgress,
  roundId: RoundId,
  level: number,
): AdvancedLevelChallengeSnapshot {
  const sanitized = sanitizeAdvancedProgress(progress);
  const levelIndex = clampInteger(level, 1, ADVANCED_LEVEL_COUNT) - 1;
  const dimension = sanitized.dimensions[roundId];
  const lastGoalChecks = dimension.lastGoalChecks[levelIndex];
  return {
    attempted: dimension.attempts[levelIndex] > 0,
    lastPassed: dimension.lastPassed[levelIndex] ?? null,
    lastGoalChecks: Array.isArray(lastGoalChecks) ? [...lastGoalChecks] : null,
    reactionLastAverageMs: dimension.reactionLastAveragesMs[levelIndex] ?? null,
    reactionBestAverageMs: dimension.reactionBestAveragesMs[levelIndex] ?? null,
  };
}

export function getAdvancedTotalStars(progress: AdvancedProgress) {
  const sanitized = sanitizeAdvancedProgress(progress);
  const dimensionStars = countClearedAdvancedLevels(sanitized.dimensions);
  return Math.min(ADVANCED_STAR_LIMITS.maxStars, Math.min(ADVANCED_DIMENSION_STAR_LIMIT, dimensionStars) + sanitized.luckStars);
}

export function markAdvancedUnlocked(progress: AdvancedProgress, updatedAt = timestamp()): AdvancedProgress {
  return {
    ...sanitizeAdvancedProgress(progress, updatedAt),
    unlocked: true,
    updatedAt,
  };
}

export function recordAdvancedChallengeResult(progress: AdvancedProgress, record: AdvancedChallengeRecord): AdvancedProgress {
  const sanitized = sanitizeAdvancedProgress(progress, record.completedAt);
  const level = clampInteger(record.level, 1, ADVANCED_LEVEL_COUNT);
  const levelIndex = level - 1;
  const dimension = sanitized.dimensions[record.roundId];
  const previousLevel = getAdvancedDimensionLevel(sanitized, record.roundId);
  const nextDimension = {
    clearedLevels: [...dimension.clearedLevels],
    attempts: [...dimension.attempts],
    bestScores: [...dimension.bestScores],
    lastPassed: [...dimension.lastPassed],
    lastGoalChecks: [...dimension.lastGoalChecks],
    reactionLastAveragesMs: [...dimension.reactionLastAveragesMs],
    reactionBestAveragesMs: [...dimension.reactionBestAveragesMs],
  };

  nextDimension.attempts[levelIndex] += 1;
  nextDimension.bestScores[levelIndex] = Math.max(nextDimension.bestScores[levelIndex], clampScore(record.score));
  nextDimension.lastPassed[levelIndex] = record.passed;
  nextDimension.lastGoalChecks[levelIndex] =
    Array.isArray(record.goalChecks) && record.goalChecks.length > 0 ? record.goalChecks.map(Boolean) : null;

  if (record.roundId === "reaction") {
    const reactionAverageMs = normalizeReactionAverageMs(record.reactionAverageMs);
    nextDimension.reactionLastAveragesMs[levelIndex] = reactionAverageMs;
    if (record.passed && reactionAverageMs !== null) {
      const previousBest = nextDimension.reactionBestAveragesMs[levelIndex];
      nextDimension.reactionBestAveragesMs[levelIndex] =
        previousBest === null ? reactionAverageMs : Math.min(previousBest, reactionAverageMs);
    }
  }

  const newlyCleared = record.passed && level <= previousLevel + 1 && !nextDimension.clearedLevels[levelIndex];
  if (newlyCleared) {
    nextDimension.clearedLevels[levelIndex] = true;
  }
  const nextDimensions = {
    ...sanitized.dimensions,
    [record.roundId]: nextDimension,
  };
  const nextCompletedChallengeCount = Math.min(ADVANCED_DIMENSION_STAR_LIMIT, countClearedAdvancedLevels(nextDimensions));

  return {
    ...sanitized,
    dimensions: nextDimensions,
    luckDrawChances: nextCompletedChallengeCount - sanitized.luckDrawCount,
    updatedAt: record.completedAt ?? timestamp(),
  };
}

export function setPersistedCurrentResult(
  state: PersistedGameState,
  trials: TrialEvent[],
  advancedProgress = state.advancedProgress,
  completedAt = timestamp(),
): PersistedGameState {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    currentResult: {
      completedAt,
      trials: Array.isArray(trials) ? trials : [],
    },
    advancedProgress: sanitizeAdvancedProgress(advancedProgress, completedAt),
  };
}

export function clearPersistedCurrentResult(state: PersistedGameState, updatedAt = timestamp()): PersistedGameState {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    currentResult: null,
    advancedProgress: sanitizeAdvancedProgress(state.advancedProgress, updatedAt),
  };
}

export function parsePersistedGameState(raw: string | null, updatedAt = timestamp()): PersistedGameState {
  if (!raw) return createDefaultPersistedGameState(updatedAt);
  try {
    return sanitizePersistedGameState(JSON.parse(raw), updatedAt);
  } catch {
    return createDefaultPersistedGameState(updatedAt);
  }
}

export function readPersistedGameState(storage: StorageLike, updatedAt = timestamp()): PersistedGameState {
  try {
    return parsePersistedGameState(storage.getItem(GAME_STATE_STORAGE_KEY), updatedAt);
  } catch {
    return createDefaultPersistedGameState(updatedAt);
  }
}

export function writePersistedGameState(storage: StorageLike, state: PersistedGameState) {
  storage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(sanitizePersistedGameState(state)));
}

export function removePersistedGameState(storage: StorageLike) {
  storage.removeItem(GAME_STATE_STORAGE_KEY);
}

export function getRestartDestinationAfterClearingCurrentResult() {
  return "home" as const;
}

export function getAdvancedLevelState(currentLevel: number, level: number): AdvancedLevelState {
  const normalizedCurrent = clampInteger(currentLevel, 0, ADVANCED_LEVEL_COUNT);
  const normalizedLevel = clampInteger(level, 1, ADVANCED_LEVEL_COUNT);
  if (normalizedLevel <= normalizedCurrent) return "completed";
  if (normalizedLevel === Math.min(ADVANCED_LEVEL_COUNT, normalizedCurrent + 1)) return "current";
  return "locked";
}

export function getAdvancedChallengeStatusLabel(state: AdvancedLevelState) {
  switch (state) {
    case "completed":
      return "已完成";
    case "current":
      return "待挑战";
    case "locked":
      return "未解锁";
  }
}

export function getAdvancedLevelTone(level: number): AdvancedLevelTone {
  const normalizedLevel = clampInteger(level, 0, ADVANCED_LEVEL_COUNT);
  if (normalizedLevel >= 10) return "advanced-gold";
  if (normalizedLevel >= 7) return "advanced-tier-3";
  if (normalizedLevel >= 4) return "advanced-tier-2";
  if (normalizedLevel >= 1) return "advanced-tier-1";
  return "advanced-empty";
}

export function getAdvancedLevelToneForState(state: AdvancedLevelState, level: number): AdvancedLevelTone {
  return state === "completed" ? getAdvancedLevelTone(level) : "advanced-empty";
}

export function getAdvancedBackDestination(source: AdvancedBackSource): AdvancedBackDestination {
  return source === "playing" || source === "base-playing" || source === "complete" ? "challenge" : "result";
}

export function shouldGuardAppBack(stage: AppStage, restartConfirmOpen: boolean) {
  return restartConfirmOpen || (stage !== "home" && stage !== "homeworld" && stage !== "result");
}

export function getAppBackHistoryLayer({
  stage,
  restartConfirmOpen,
  advancedBackSource,
}: {
  stage: AppStage;
  restartConfirmOpen: boolean;
  advancedBackSource?: AdvancedBackSource | null;
}): AppBackHistoryLayer {
  if (!shouldGuardAppBack(stage, restartConfirmOpen)) return 0;
  if (
    stage === "advanced" &&
    advancedBackSource &&
    getAdvancedBackDestination(advancedBackSource) === "challenge"
  ) {
    return 2;
  }
  return 1;
}

export function readAppBackHistoryLayer(state: unknown): AppBackHistoryLayer {
  if (typeof state !== "object" || state === null) return 0;
  const source = state as { gameRankTestInternal?: unknown; gameRankTestLayer?: unknown };
  if (source.gameRankTestInternal !== true) return 0;
  return source.gameRankTestLayer === 2 ? 2 : 1;
}

export function resolveAppBackNavigation({
  stage,
  restartConfirmOpen,
  advancedBackSource,
}: {
  stage: AppStage;
  restartConfirmOpen: boolean;
  advancedBackSource?: AdvancedBackSource | null;
}): AppBackNavigation {
  if (restartConfirmOpen) return shouldGuardAppBack(stage, false) ? "guard" : "release";
  if (stage === "share" || stage === "luck" || stage === "avatar-lab" || stage === "intro" || stage === "playing") return "release";
  if (stage !== "advanced") return "unhandled";
  if (!advancedBackSource) return "release";
  return getAdvancedBackDestination(advancedBackSource) === "challenge" ? "guard" : "release";
}

export function getAdvancedCompletionActions({
  passed,
  gained,
  level,
}: {
  passed: boolean;
  gained: boolean;
  level: number;
}): AdvancedCompletionAction[] {
  if (!passed || !gained) return ["retry"];
  return clampInteger(level, 1, ADVANCED_LEVEL_COUNT) >= ADVANCED_LEVEL_COUNT ? ["maxed"] : ["retry", "next"];
}

export function formatResultRankTitle(rankName: RankName, stars: number) {
  const normalizedStars = clampInteger(stars, 0, ADVANCED_STAR_LIMITS.maxStars);
  const tier = ADVANCED_KING_RANK_TIERS.find((item) => normalizedStars >= item.minStars && normalizedStars <= item.maxStars);
  if (rankName === "最强王者" && normalizedStars > 0) return `${tier?.label ?? "传奇王者"}⭐${normalizedStars}`;
  return rankName;
}

export function getLuckStarsFromScore(score: number) {
  return Math.min(ADVANCED_STAR_LIMITS.luckStars, Math.floor(clampScore(score) / 5));
}

export function getLuckLevelTone(stars: number): AdvancedLevelTone {
  const normalizedStars = clampInteger(stars, 0, ADVANCED_STAR_LIMITS.luckStars);
  if (normalizedStars >= 20) return "advanced-gold";
  if (normalizedStars >= 13) return "advanced-tier-3";
  if (normalizedStars >= 7) return "advanced-tier-2";
  if (normalizedStars >= 1) return "advanced-tier-1";
  return "advanced-empty";
}

export function getLuckScoreTone(score: number): AdvancedLevelTone {
  const normalizedScore = clampScore(score);
  if (normalizedScore >= 100) return "advanced-gold";
  if (normalizedScore >= 70) return "advanced-tier-3";
  if (normalizedScore >= 40) return "advanced-tier-2";
  if (normalizedScore >= 10) return "advanced-tier-1";
  return "advanced-empty";
}

export function getLuckDrawStatusText(unlocked: boolean, progress: AdvancedProgress) {
  if (!unlocked) return "达到最强王者后解锁进阶挑战和运气玩法";
  const sanitized = sanitizeAdvancedProgress(progress);
  if (sanitized.luckStars >= ADVANCED_STAR_LIMITS.luckStars || sanitized.luckBestScore >= 100) return "已满运气，继续抽取不会降低历史最高";
  const chances = sanitized.luckDrawChances;
  return chances > 0 ? `抽取次数 ${chances}` : "完成进阶挑战获得运气抽取";
}

export function canUseLuckDraw(unlocked: boolean, progress: AdvancedProgress) {
  const sanitized = sanitizeAdvancedProgress(progress);
  return unlocked && sanitized.luckDrawChances > 0;
}

export function canUseLuckDrawBatch(unlocked: boolean, progress: AdvancedProgress, count = 10) {
  const sanitized = sanitizeAdvancedProgress(progress);
  return unlocked && sanitized.luckDrawChances >= clampInteger(count, 1, 10);
}

export function formatLuckDrawOutcomeText(outcome: LuckDrawOutcome) {
  if ((outcome.draws ?? 1) > 1) return `十连最高运气${outcome.score}！`;
  if (outcome.guaranteed || outcome.stars >= ADVANCED_STAR_LIMITS.luckStars || outcome.score >= 100) return "运气已达到上限";
  if (!outcome.improved) return "运气保留历史最高";
  return `运气刷新为${outcome.score}！`;
}

export function recordLuckDraw(progress: AdvancedProgress, score: number, completedAt = timestamp()): LuckDrawResult {
  const sanitized = sanitizeAdvancedProgress(progress, completedAt);
  if (sanitized.luckDrawChances <= 0) {
    return { progress: sanitized, outcome: null };
  }

  const nextDrawCount = Math.min(ADVANCED_DIMENSION_STAR_LIMIT, sanitized.luckDrawCount + 1);
  const guaranteed = nextDrawCount >= ADVANCED_DIMENSION_STAR_LIMIT;
  const drawScore = guaranteed ? 100 : clampScore(score);
  const drawStars = getLuckStarsFromScore(drawScore);
  const improved = drawStars > sanitized.luckStars || drawScore > sanitized.luckBestScore;

  return {
    progress: {
      ...sanitized,
      luckStars: Math.max(sanitized.luckStars, drawStars),
      luckBestScore: Math.max(sanitized.luckBestScore, drawScore),
      luckDrawChances: Math.max(0, sanitized.luckDrawChances - 1),
      luckDrawCount: nextDrawCount,
      updatedAt: completedAt,
    },
    outcome: {
      score: drawScore,
      stars: drawStars,
      improved,
      guaranteed,
    },
  };
}

export function recordLuckDrawBatch(progress: AdvancedProgress, scores: number[], completedAt = timestamp()): LuckDrawResult {
  const sanitized = sanitizeAdvancedProgress(progress, completedAt);
  const drawCount = Math.min(10, scores.length);
  if (drawCount < 10 || sanitized.luckDrawChances < 10) {
    return { progress: sanitized, outcome: null };
  }

  const outcomes = scores.slice(0, drawCount).map((score, index) => {
    const drawNumber = Math.min(ADVANCED_DIMENSION_STAR_LIMIT, sanitized.luckDrawCount + index + 1);
    const guaranteed = drawNumber >= ADVANCED_DIMENSION_STAR_LIMIT;
    const drawScore = guaranteed ? 100 : clampScore(score);
    return {
      score: drawScore,
      stars: getLuckStarsFromScore(drawScore),
      guaranteed,
    };
  });
  const best = outcomes.reduce((currentBest, outcome) => (outcome.score > currentBest.score ? outcome : currentBest), outcomes[0]);
  const improved = best.stars > sanitized.luckStars || best.score > sanitized.luckBestScore;
  const nextDrawCount = Math.min(ADVANCED_DIMENSION_STAR_LIMIT, sanitized.luckDrawCount + drawCount);

  return {
    progress: {
      ...sanitized,
      luckStars: Math.max(sanitized.luckStars, best.stars),
      luckBestScore: Math.max(sanitized.luckBestScore, best.score),
      luckDrawChances: Math.max(0, sanitized.luckDrawChances - drawCount),
      luckDrawCount: nextDrawCount,
      updatedAt: completedAt,
    },
    outcome: {
      score: best.score,
      stars: best.stars,
      improved,
      guaranteed: outcomes.some((outcome) => outcome.guaranteed),
      draws: drawCount,
      originalScores: outcomes.map((outcome) => outcome.score),
    },
  };
}
