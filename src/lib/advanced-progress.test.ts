import test from "node:test";
import assert from "node:assert/strict";
import {
  clearPersistedCurrentResult,
  createDefaultAdvancedProgress,
  createDefaultPersistedGameState,
  canUseLuckDraw,
  canUseLuckDrawBatch,
  formatResultRankTitle,
  getAdvancedCompletionActions,
  getAdvancedChallengeStatusLabel,
  getAdvancedBackDestination,
  getAdvancedLevelState,
  getAdvancedLevelChallengeSnapshot,
  getAdvancedLevelTone,
  getAdvancedLevelToneForState,
  getAdvancedEndlessBestScore,
  getLuckDrawStatusText,
  getLuckLevelTone,
  getLuckScoreTone,
  getLuckStarsFromScore,
  formatLuckDrawOutcomeText,
  getAdvancedDimensionLevel,
  getAdvancedTotalStars,
  getAppBackHistoryLayer,
  getRestartDestinationAfterClearingCurrentResult,
  markAuthorDonated,
  readAppBackHistoryLayer,
  resolveAppBackNavigation,
  shouldGuardAppBack,
  markAdvancedUnlocked,
  parsePersistedGameState,
  markLegend100SkinUnlocked,
  recordAdvancedChallengeResult,
  recordAdvancedEndlessScore,
  recordLuckDraw,
  recordLuckDrawBatch,
  setPersistedCurrentResult,
  writePersistedGameState,
  readPersistedGameState,
  GAME_STATE_STORAGE_KEY,
  type AdvancedProgress,
  type StorageLike,
} from "./advanced-progress.ts";
import type { TrialEvent } from "./scoring.ts";

function makeTrial(roundId: TrialEvent["roundId"]): TrialEvent {
  return {
    roundId,
    trialIndex: 0,
    pointerType: "touch",
    viewport: { width: 390, height: 844, dpr: 3 },
    scheduledAt: 0,
    shownAt: 100,
    responseAt: 260,
    correct: true,
  };
}

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

const ROUND_IDS = ["reaction", "aim", "search", "stroop", "rhythm", "memory", "braking", "patience"] as const;

function advancedProgressWithClearedLevels(count: number, patch: Partial<AdvancedProgress> = {}) {
  const base = markAdvancedUnlocked(createDefaultAdvancedProgress());
  let remaining = Math.max(0, Math.min(80, count));
  const dimensions: AdvancedProgress["dimensions"] = { ...base.dimensions };
  for (const roundId of ROUND_IDS) {
    const clearedCount = Math.min(10, remaining);
    remaining -= clearedCount;
    dimensions[roundId] = {
      ...dimensions[roundId],
      clearedLevels: Array.from({ length: clearedCount }, () => true),
      attempts: Array.from({ length: clearedCount }, () => 1),
      bestScores: Array.from({ length: clearedCount }, () => 90),
    };
  }

  return {
    ...base,
    dimensions,
    ...patch,
  };
}

test("default advanced progress starts locked with 0 shown for every metric", () => {
  const progress = createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z");

  assert.equal(progress.unlocked, false);
  assert.equal(progress.authorDonated, false);
  assert.equal(progress.legend100SkinUnlocked, false);
  assert.equal(getAdvancedTotalStars(progress), 0);
  assert.equal(progress.luckStars, 0);
  assert.equal(progress.luckBestScore, 0);
  assert.equal(progress.luckDrawChances, 0);
  assert.equal(progress.luckDrawCount, 0);
  for (const roundId of ["reaction", "aim", "search", "stroop", "rhythm", "memory", "braking", "patience"] as const) {
    assert.equal(getAdvancedDimensionLevel(progress, roundId), 0);
  }
});

test("advanced challenge results award only the next successful level and preserve highest 0-10 display", () => {
  let progress = markAdvancedUnlocked(createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z"), "2026-05-10T00:00:01.000Z");

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 2,
    score: 95,
    passed: true,
    completedAt: "2026-05-10T00:00:02.000Z",
  });
  assert.equal(getAdvancedDimensionLevel(progress, "reaction"), 0);
  assert.equal(getAdvancedTotalStars(progress), 0);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 88,
    passed: true,
    completedAt: "2026-05-10T00:00:03.000Z",
  });
  assert.equal(getAdvancedDimensionLevel(progress, "reaction"), 1);
  assert.equal(getAdvancedTotalStars(progress), 1);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 2,
    score: 50,
    passed: false,
    completedAt: "2026-05-10T00:00:04.000Z",
  });
  assert.equal(getAdvancedDimensionLevel(progress, "reaction"), 1);
  assert.equal(getAdvancedTotalStars(progress), 1);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 2,
    score: 92,
    passed: true,
    completedAt: "2026-05-10T00:00:05.000Z",
  });
  assert.equal(getAdvancedDimensionLevel(progress, "reaction"), 2);
  assert.equal(getAdvancedTotalStars(progress), 2);
});

test("completed advanced levels can be replayed without awarding extra stars", () => {
  let progress = markAdvancedUnlocked(createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z"), "2026-05-10T00:00:01.000Z");
  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 88,
    passed: true,
    completedAt: "2026-05-10T00:00:02.000Z",
  });
  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 96,
    passed: true,
    completedAt: "2026-05-10T00:00:03.000Z",
  });

  assert.equal(getAdvancedDimensionLevel(progress, "reaction"), 1);
  assert.equal(getAdvancedTotalStars(progress), 1);
  assert.equal(progress.dimensions.reaction.attempts[0], 2);
  assert.equal(progress.dimensions.reaction.bestScores[0], 96);
});

test("reaction challenge snapshot keeps last attempt while persisting best successful average", () => {
  let progress = markAdvancedUnlocked(createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z"), "2026-05-10T00:00:01.000Z");

  const initial = getAdvancedLevelChallengeSnapshot(progress, "reaction", 1);
  assert.equal(initial.attempted, false);
  assert.equal(initial.lastPassed, null);
  assert.equal(initial.lastGoalChecks, null);
  assert.equal(initial.reactionLastAverageMs, null);
  assert.equal(initial.reactionBestAverageMs, null);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 45,
    passed: false,
    goalChecks: [false, true, false],
    reactionAverageMs: 299,
    completedAt: "2026-05-10T00:00:02.000Z",
  });
  const failedOnce = getAdvancedLevelChallengeSnapshot(progress, "reaction", 1);
  assert.equal(failedOnce.attempted, true);
  assert.equal(failedOnce.lastPassed, false);
  assert.deepEqual(failedOnce.lastGoalChecks, [false, true, false]);
  assert.equal(failedOnce.reactionLastAverageMs, 299);
  assert.equal(failedOnce.reactionBestAverageMs, null);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 100,
    passed: true,
    goalChecks: [true, true, true],
    reactionAverageMs: 280,
    completedAt: "2026-05-10T00:00:03.000Z",
  });
  const passedFast = getAdvancedLevelChallengeSnapshot(progress, "reaction", 1);
  assert.equal(passedFast.lastPassed, true);
  assert.deepEqual(passedFast.lastGoalChecks, [true, true, true]);
  assert.equal(passedFast.reactionLastAverageMs, 280);
  assert.equal(passedFast.reactionBestAverageMs, 280);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 100,
    passed: true,
    goalChecks: [true, true, true],
    reactionAverageMs: 310,
    completedAt: "2026-05-10T00:00:04.000Z",
  });
  const passedSlower = getAdvancedLevelChallengeSnapshot(progress, "reaction", 1);
  assert.equal(passedSlower.lastPassed, true);
  assert.equal(passedSlower.reactionLastAverageMs, 310);
  assert.equal(passedSlower.reactionBestAverageMs, 280);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 60,
    passed: false,
    goalChecks: [true, false, false],
    reactionAverageMs: 355,
    completedAt: "2026-05-10T00:00:05.000Z",
  });
  const failedLater = getAdvancedLevelChallengeSnapshot(progress, "reaction", 1);
  assert.equal(failedLater.lastPassed, false);
  assert.deepEqual(failedLater.lastGoalChecks, [true, false, false]);
  assert.equal(failedLater.reactionLastAverageMs, 355);
  assert.equal(failedLater.reactionBestAverageMs, 280);
});

test("newly cleared advanced levels grant one luck draw chance but replays do not", () => {
  let progress = markAdvancedUnlocked(createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z"), "2026-05-10T00:00:01.000Z");

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 88,
    passed: true,
    completedAt: "2026-05-10T00:00:02.000Z",
  });
  assert.equal(progress.luckDrawChances, 1);

  progress = recordAdvancedChallengeResult(progress, {
    roundId: "reaction",
    level: 1,
    score: 96,
    passed: true,
    completedAt: "2026-05-10T00:00:03.000Z",
  });
  assert.equal(progress.luckDrawChances, 1);
});

test("luck draw chances are backfilled from completed advanced levels in old persisted state", () => {
  const parsed = parsePersistedGameState(
    JSON.stringify({
      schemaVersion: 1,
      currentResult: null,
      advancedProgress: {
        schemaVersion: 1,
        unlocked: true,
        luckStars: 0,
        luckBestScore: 0,
        luckDrawChances: 0,
        luckDrawCount: 2,
        updatedAt: "2026-05-10T00:00:00.000Z",
        dimensions: {
          reaction: {
            clearedLevels: [true, true, true],
            attempts: [1, 1, 1],
            bestScores: [90, 92, 94],
          },
          aim: {
            clearedLevels: [true, true],
            attempts: [1, 1],
            bestScores: [88, 91],
          },
        },
      },
    }),
  );

  assert.equal(parsed.advancedProgress.luckDrawCount, 2);
  assert.equal(parsed.advancedProgress.luckDrawChances, 3);
  assert.equal(parsed.advancedProgress.luckDrawChances + parsed.advancedProgress.luckDrawCount, 5);
});

test("luck draws consume chances, map 0-100 score to 0-20 stars, and preserve the best result", () => {
  let progress = recordAdvancedChallengeResult(markAdvancedUnlocked(createDefaultAdvancedProgress()), {
    roundId: "aim",
    level: 1,
    score: 90,
    passed: true,
    completedAt: "2026-05-10T00:00:00.000Z",
  });
  progress = recordAdvancedChallengeResult(progress, {
    roundId: "aim",
    level: 2,
    score: 92,
    passed: true,
    completedAt: "2026-05-10T00:00:01.000Z",
  });

  const first = recordLuckDraw(progress, 87, "2026-05-10T00:00:02.000Z");
  assert.equal(first.outcome?.score, 87);
  assert.equal(first.outcome?.stars, 17);
  assert.equal(first.outcome?.improved, true);
  assert.equal(first.progress.luckStars, 17);
  assert.equal(first.progress.luckBestScore, 87);
  assert.equal(first.progress.luckDrawChances, 1);
  assert.equal(first.progress.luckDrawCount, 1);

  const second = recordLuckDraw(first.progress, 12, "2026-05-10T00:00:03.000Z");
  assert.equal(second.outcome?.score, 12);
  assert.equal(second.outcome?.stars, 2);
  assert.equal(second.outcome?.improved, false);
  assert.equal(second.progress.luckStars, 17);
  assert.equal(second.progress.luckBestScore, 87);
  assert.equal(second.progress.luckDrawChances, 0);
  assert.equal(second.progress.luckDrawCount, 2);
  assert.equal(getAdvancedTotalStars(second.progress), 19);
});

test("the eightieth luck draw is guaranteed to fill luck stars", () => {
  const progress = advancedProgressWithClearedLevels(80, {
    luckStars: 12,
    luckBestScore: 64,
    luckDrawChances: 1,
    luckDrawCount: 79,
    updatedAt: "2026-05-10T00:00:00.000Z",
  });

  const result = recordLuckDraw(progress, 0, "2026-05-10T00:00:01.000Z");

  assert.equal(result.outcome?.score, 100);
  assert.equal(result.outcome?.stars, 20);
  assert.equal(result.outcome?.guaranteed, true);
  assert.equal(result.progress.luckStars, 20);
  assert.equal(result.progress.luckBestScore, 100);
  assert.equal(result.progress.luckDrawChances, 0);
  assert.equal(result.progress.luckDrawCount, 80);
});

test("luck score helpers produce display copy for locked, ready and empty states", () => {
  assert.equal(getLuckStarsFromScore(0), 0);
  assert.equal(getLuckStarsFromScore(4), 0);
  assert.equal(getLuckStarsFromScore(5), 1);
  assert.equal(getLuckStarsFromScore(99), 19);
  assert.equal(getLuckStarsFromScore(100), 20);
  assert.equal(getLuckLevelTone(0), "advanced-empty");
  assert.equal(getLuckLevelTone(6), "advanced-tier-1");
  assert.equal(getLuckLevelTone(12), "advanced-tier-2");
  assert.equal(getLuckLevelTone(19), "advanced-tier-3");
  assert.equal(getLuckLevelTone(20), "advanced-gold");
  assert.equal(getLuckScoreTone(0), "advanced-empty");
  assert.equal(getLuckScoreTone(10), "advanced-tier-1");
  assert.equal(getLuckScoreTone(39), "advanced-tier-1");
  assert.equal(getLuckScoreTone(40), "advanced-tier-2");
  assert.equal(getLuckScoreTone(69), "advanced-tier-2");
  assert.equal(getLuckScoreTone(70), "advanced-tier-3");
  assert.equal(getLuckScoreTone(99), "advanced-tier-3");
  assert.equal(getLuckScoreTone(100), "advanced-gold");
  assert.equal(getLuckDrawStatusText(false, createDefaultAdvancedProgress()), "达到最强王者后解锁进阶挑战和运气玩法");
  const progressWithTwoDraws = recordAdvancedChallengeResult(
    recordAdvancedChallengeResult(markAdvancedUnlocked(createDefaultAdvancedProgress()), {
      roundId: "reaction",
      level: 1,
      score: 90,
      passed: true,
    }),
    {
      roundId: "reaction",
      level: 2,
      score: 92,
      passed: true,
    },
  );
  assert.equal(
    getLuckDrawStatusText(true, progressWithTwoDraws),
    "幸运币 2",
  );
  assert.equal(getLuckDrawStatusText(true, createDefaultAdvancedProgress()), "首次通关进阶关获得幸运币");
  assert.equal(
    formatLuckDrawOutcomeText({ score: 37, stars: 7, improved: false, guaranteed: false }),
    "运气保留历史最高",
  );
  assert.equal(
    formatLuckDrawOutcomeText({ score: 95, stars: 19, improved: true, guaranteed: false }),
    "运气刷新为95！",
  );
  assert.equal(
    formatLuckDrawOutcomeText({ score: 100, stars: 20, improved: true, guaranteed: true }),
    "运气已达到上限",
  );
  assert.equal(
    getLuckDrawStatusText(true, { ...progressWithTwoDraws, luckStars: 20, luckBestScore: 100 }),
    "已满运气，继续抽取不会降低历史最高",
  );

  const maxedDrawResult = recordLuckDraw({ ...progressWithTwoDraws, luckStars: 20, luckBestScore: 100 }, 12);
  assert.deepEqual(maxedDrawResult.outcome, {
    score: 12,
    stars: 2,
    improved: false,
    guaranteed: false,
  });
  assert.equal(maxedDrawResult.progress.luckStars, 20);
  assert.equal(maxedDrawResult.progress.luckBestScore, 100);
  assert.equal(maxedDrawResult.progress.luckDrawCount, progressWithTwoDraws.luckDrawCount + 1);
  assert.equal(maxedDrawResult.progress.luckDrawChances, progressWithTwoDraws.luckDrawChances - 1);
});

test("luck draw availability requires unlock and remaining chances", () => {
  const locked = createDefaultAdvancedProgress();
  assert.equal(canUseLuckDraw(false, locked), false);

  const ready = recordAdvancedChallengeResult(markAdvancedUnlocked(createDefaultAdvancedProgress()), {
    roundId: "aim",
    level: 1,
    score: 91,
    passed: true,
  });
  assert.equal(canUseLuckDraw(true, ready), true);
  assert.equal(canUseLuckDraw(false, ready), false);
  assert.equal(canUseLuckDraw(true, { ...ready, luckStars: 20, luckBestScore: 100 }), true);
  assert.equal(canUseLuckDraw(true, { ...ready, luckDrawCount: 1 }), false);
});

test("ten luck draws consume ten chances and display the best score from the batch", () => {
  const ready = advancedProgressWithClearedLevels(20, {
    luckDrawCount: 8,
    luckBestScore: 80,
    luckStars: 16,
  });

  assert.equal(canUseLuckDrawBatch(true, advancedProgressWithClearedLevels(17, { luckDrawCount: 8 })), false);
  assert.equal(canUseLuckDrawBatch(true, ready), true);

  const result = recordLuckDrawBatch(ready, [4, 22, 63, 91, 18, 39, 74, 10, 58, 87], "2026-05-11T00:00:00.000Z");

  assert.deepEqual(result.outcome, {
    score: 91,
    stars: 18,
    improved: true,
    guaranteed: false,
    draws: 10,
    originalScores: [4, 22, 63, 91, 18, 39, 74, 10, 58, 87],
  });
  assert.equal(formatLuckDrawOutcomeText(result.outcome!), "十连最高运气91！");
  assert.equal(result.progress.luckBestScore, 91);
  assert.equal(result.progress.luckStars, 18);
  assert.equal(result.progress.luckDrawChances, 2);
  assert.equal(result.progress.luckDrawCount, 18);
});

test("ten luck draws preserve historical max luck and include the eightieth draw guarantee", () => {
  const ready = advancedProgressWithClearedLevels(80, {
    luckDrawCount: 70,
    luckBestScore: 100,
    luckStars: 20,
  });

  const result = recordLuckDrawBatch(ready, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  assert.deepEqual(result.outcome, {
    score: 100,
    stars: 20,
    improved: false,
    guaranteed: true,
    draws: 10,
    originalScores: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100],
  });
  assert.equal(formatLuckDrawOutcomeText(result.outcome!), "十连最高运气100！");
  assert.equal(result.progress.luckBestScore, 100);
  assert.equal(result.progress.luckStars, 20);
  assert.equal(result.progress.luckDrawChances, 0);
  assert.equal(result.progress.luckDrawCount, 80);
});

test("advanced level states allow completed and next level while locking later levels", () => {
  assert.equal(getAdvancedLevelState(2, 1), "completed");
  assert.equal(getAdvancedLevelState(2, 2), "completed");
  assert.equal(getAdvancedLevelState(2, 3), "current");
  assert.equal(getAdvancedLevelState(2, 4), "locked");
  assert.equal(getAdvancedChallengeStatusLabel("completed"), "已完成");
  assert.equal(getAdvancedChallengeStatusLabel("current"), "待挑战");
  assert.equal(getAdvancedChallengeStatusLabel("locked"), "未解锁");
});

test("advanced level tone uses rarity bands for 0, 1-3, 4-6, 7-9 and 10", () => {
  assert.equal(getAdvancedLevelTone(0), "advanced-empty");
  assert.equal(getAdvancedLevelTone(1), "advanced-tier-1");
  assert.equal(getAdvancedLevelTone(3), "advanced-tier-1");
  assert.equal(getAdvancedLevelTone(4), "advanced-tier-2");
  assert.equal(getAdvancedLevelTone(6), "advanced-tier-2");
  assert.equal(getAdvancedLevelTone(7), "advanced-tier-3");
  assert.equal(getAdvancedLevelTone(9), "advanced-tier-3");
  assert.equal(getAdvancedLevelTone(10), "advanced-gold");
});

test("advanced level tone stays empty for the next pending or locked difficulty", () => {
  assert.equal(getAdvancedLevelToneForState("completed", 6), "advanced-tier-2");
  assert.equal(getAdvancedLevelToneForState("current", 6), "advanced-empty");
  assert.equal(getAdvancedLevelToneForState("locked", 6), "advanced-empty");
});

test("advanced endless scores are stored per dimension without changing star progress", () => {
  const base = createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z");
  assert.equal(getAdvancedEndlessBestScore(base, "memory"), 0);

  const first = recordAdvancedEndlessScore(base, {
    roundId: "memory",
    score: 24,
    completedAt: "2026-05-10T00:00:01.000Z",
  });
  assert.equal(getAdvancedEndlessBestScore(first, "memory"), 24);
  assert.equal(getAdvancedEndlessBestScore(first, "search"), 0);
  assert.equal(getAdvancedTotalStars(first), 0);

  const lower = recordAdvancedEndlessScore(first, {
    roundId: "memory",
    score: 12,
    completedAt: "2026-05-10T00:00:02.000Z",
  });
  assert.equal(getAdvancedEndlessBestScore(lower, "memory"), 24);

  const higher = recordAdvancedEndlessScore(lower, {
    roundId: "memory",
    score: 39,
    completedAt: "2026-05-10T00:00:03.000Z",
  });
  assert.equal(getAdvancedEndlessBestScore(higher, "memory"), 39);
});

test("advanced back destination keeps attempts inside the selected challenge flow", () => {
  assert.equal(getAdvancedBackDestination("select"), "result");
  assert.equal(getAdvancedBackDestination("intro"), "result");
  assert.equal(getAdvancedBackDestination("playing"), "challenge");
  assert.equal(getAdvancedBackDestination("base-playing"), "challenge");
  assert.equal(getAdvancedBackDestination("endless-playing"), "challenge");
  assert.equal(getAdvancedBackDestination("endless-complete"), "challenge");
  assert.equal(getAdvancedBackDestination("complete"), "challenge");
});

test("app back guard covers restart dialogs and advanced nested returns", () => {
  assert.equal(shouldGuardAppBack("result", false), false);
  assert.equal(shouldGuardAppBack("result", true), true);
  assert.equal(shouldGuardAppBack("advanced", false), true);
  assert.equal(shouldGuardAppBack("avatar-lab", false), true);
  assert.equal(shouldGuardAppBack("home", false), false);
  assert.equal(shouldGuardAppBack("homeworld", false), false);
  assert.equal(getAppBackHistoryLayer({ stage: "result", restartConfirmOpen: false }), 0);
  assert.equal(getAppBackHistoryLayer({ stage: "result", restartConfirmOpen: true }), 1);
  assert.equal(getAppBackHistoryLayer({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "select" }), 1);
  assert.equal(getAppBackHistoryLayer({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "intro" }), 1);
  assert.equal(getAppBackHistoryLayer({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "playing" }), 2);
  assert.equal(getAppBackHistoryLayer({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "endless-playing" }), 2);
  assert.equal(getAppBackHistoryLayer({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "endless-complete" }), 2);
  assert.equal(getAppBackHistoryLayer({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "complete" }), 2);
  assert.equal(getAppBackHistoryLayer({ stage: "avatar-lab", restartConfirmOpen: false }), 1);

  assert.equal(resolveAppBackNavigation({ stage: "result", restartConfirmOpen: true }), "release");
  assert.equal(resolveAppBackNavigation({ stage: "result", restartConfirmOpen: false }), "unhandled");
  assert.equal(resolveAppBackNavigation({ stage: "avatar-lab", restartConfirmOpen: false }), "release");
  assert.equal(
    resolveAppBackNavigation({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "playing" }),
    "guard",
  );
  assert.equal(
    resolveAppBackNavigation({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "complete" }),
    "guard",
  );
  assert.equal(
    resolveAppBackNavigation({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "endless-playing" }),
    "guard",
  );
  assert.equal(
    resolveAppBackNavigation({ stage: "advanced", restartConfirmOpen: false, advancedBackSource: "intro" }),
    "release",
  );
  assert.equal(readAppBackHistoryLayer({ gameRankTestInternal: true, gameRankTestLayer: 2 }), 2);
  assert.equal(readAppBackHistoryLayer({ gameRankTestInternal: true, gameRankTestLayer: 99 }), 1);
  assert.equal(readAppBackHistoryLayer({ gameRankTestInternal: false, gameRankTestLayer: 1 }), 0);
});

test("advanced completion actions adapt to first clears, replays, failures and max level", () => {
  assert.deepEqual(getAdvancedCompletionActions({ passed: false, gained: false, level: 3 }), ["retry"]);
  assert.deepEqual(getAdvancedCompletionActions({ passed: true, gained: false, level: 3 }), ["back"]);
  assert.deepEqual(getAdvancedCompletionActions({ passed: true, gained: true, level: 3 }), ["next"]);
  assert.deepEqual(getAdvancedCompletionActions({ passed: true, gained: true, level: 10 }), ["back"]);
});

test("result rank title only folds stars into the king title when stars are above zero", () => {
  assert.equal(formatResultRankTitle("最强王者", 0), "最强王者");
  assert.equal(formatResultRankTitle("最强王者", 7), "最强王者⭐7");
  assert.equal(formatResultRankTitle("最强王者", 10), "至圣王者⭐10");
  assert.equal(formatResultRankTitle("最强王者", 21), "无双王者⭐21");
  assert.equal(formatResultRankTitle("至尊星耀", 7), "至尊星耀");
});

test("current result can be cleared while preserving advanced progress", () => {
  const progress = recordAdvancedChallengeResult(markAdvancedUnlocked(createDefaultAdvancedProgress()), {
    roundId: "aim",
    level: 1,
    score: 90,
    passed: true,
    completedAt: "2026-05-10T00:00:00.000Z",
  });
  const state = setPersistedCurrentResult(createDefaultPersistedGameState("2026-05-10T00:00:00.000Z"), [makeTrial("aim")], progress, "2026-05-10T00:00:01.000Z");
  const cleared = clearPersistedCurrentResult(state, "2026-05-10T00:00:02.000Z");

  assert.equal(state.currentResult?.trials.length, 1);
  assert.equal(cleared.currentResult, null);
  assert.equal(getAdvancedDimensionLevel(cleared.advancedProgress, "aim"), 1);
  assert.equal(cleared.advancedProgress.unlocked, true);
});

test("restart after clearing the current result returns to the normal home flow", () => {
  assert.equal(getRestartDestinationAfterClearingCurrentResult(), "home");
});

test("persisted state parser falls back safely and clamps progress shape", () => {
  const fallback = parsePersistedGameState("{not-json");
  assert.equal(fallback.currentResult, null);
  assert.equal(getAdvancedTotalStars(fallback.advancedProgress), 0);

  const parsed = parsePersistedGameState(
    JSON.stringify({
      schemaVersion: 1,
      currentResult: { completedAt: "bad", trials: [makeTrial("memory")] },
      advancedProgress: {
        schemaVersion: 1,
        unlocked: true,
        luckStars: 50,
        luckBestScore: 200,
        luckDrawChances: 120,
        luckDrawCount: 200,
        updatedAt: "2026-05-10T00:00:00.000Z",
        dimensions: {
          memory: {
            clearedLevels: [true, true, true, true, true, true, true, true, true, true, true],
            attempts: [1],
            bestScores: [99],
          },
        },
      },
    }),
  );

  assert.equal(parsed.currentResult?.trials.length, 1);
  assert.equal(getAdvancedDimensionLevel(parsed.advancedProgress, "memory"), 10);
  assert.equal(parsed.advancedProgress.authorDonated, false);
  assert.equal(parsed.advancedProgress.luckStars, 20);
  assert.equal(parsed.advancedProgress.luckBestScore, 100);
  assert.equal(parsed.advancedProgress.luckDrawChances, 0);
  assert.equal(parsed.advancedProgress.luckDrawCount, 10);
  assert.equal(getAdvancedTotalStars(parsed.advancedProgress), 30);
  assert.equal(getAdvancedDimensionLevel(parsed.advancedProgress, "reaction"), 0);
});

test("storage helpers round-trip through a browser-like storage object", () => {
  const storage = memoryStorage();
  const progress = markAdvancedUnlocked(createDefaultAdvancedProgress());
  const state = setPersistedCurrentResult(createDefaultPersistedGameState(), [makeTrial("patience")], progress);

  writePersistedGameState(storage, state);
  const loaded = readPersistedGameState(storage);

  assert.equal(storage.getItem(GAME_STATE_STORAGE_KEY)?.includes("currentResult"), true);
  assert.equal(loaded.currentResult?.trials[0]?.roundId, "patience");
  assert.equal(loaded.advancedProgress.unlocked, true);
});

test("author donation unlock state persists with advanced progress", () => {
  const storage = memoryStorage();
  const donated = markAuthorDonated(createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z"), "2026-05-10T00:00:01.000Z");
  const state = setPersistedCurrentResult(createDefaultPersistedGameState(), [makeTrial("reaction")], donated);

  writePersistedGameState(storage, state);
  const loaded = readPersistedGameState(storage);

  assert.equal(donated.authorDonated, true);
  assert.equal(loaded.advancedProgress.authorDonated, true);
});

test("legend 100 skin unlock state persists only after explicit displayed unlock", () => {
  const storage = memoryStorage();
  const progress = advancedProgressWithClearedLevels(80, { luckStars: 20, luckBestScore: 100 });
  const unlocked = markLegend100SkinUnlocked(progress, "2026-05-10T00:00:01.000Z");
  const state = setPersistedCurrentResult(createDefaultPersistedGameState(), [makeTrial("reaction")], unlocked);

  assert.equal(progress.legend100SkinUnlocked, false);
  assert.equal(unlocked.legend100SkinUnlocked, true);

  writePersistedGameState(storage, state);
  const loaded = readPersistedGameState(storage);

  assert.equal(loaded.advancedProgress.legend100SkinUnlocked, true);
});
