import test from "node:test";
import assert from "node:assert/strict";
import {
  clearPersistedCurrentResult,
  createDefaultAdvancedProgress,
  createDefaultPersistedGameState,
  evaluateAdvancedChallengeScore,
  formatResultRankTitle,
  getAdvancedCompletionActions,
  getAdvancedChallengeRequirement,
  getAdvancedChallengeStatusLabel,
  getAdvancedBackDestination,
  getAdvancedLevelState,
  getAdvancedLevelTone,
  getAdvancedLevelToneForState,
  getLuckDrawStatusText,
  getLuckLevelTone,
  getLuckScoreTone,
  getLuckStarsFromScore,
  formatLuckDrawOutcomeText,
  getAdvancedRoundContent,
  getAdvancedDimensionLevel,
  getAdvancedRoundScore,
  getAdvancedTotalStars,
  getRestartDestinationAfterClearingCurrentResult,
  markAdvancedUnlocked,
  parsePersistedGameState,
  recordAdvancedChallengeResult,
  recordLuckDraw,
  setPersistedCurrentResult,
  writePersistedGameState,
  readPersistedGameState,
  GAME_STATE_STORAGE_KEY,
  type StorageLike,
} from "./advanced-progress.ts";
import type { TrialEvent } from "./scoring.ts";
import type { ScoreSummary } from "./scoring.ts";

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

test("default advanced progress starts locked with 0 shown for every metric", () => {
  const progress = createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z");

  assert.equal(progress.unlocked, false);
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
  const progress = {
    ...markAdvancedUnlocked(createDefaultAdvancedProgress("2026-05-10T00:00:00.000Z")),
    luckStars: 12,
    luckBestScore: 64,
    luckDrawChances: 1,
    luckDrawCount: 79,
    dimensions: Object.fromEntries(
      [
        "reaction",
        "aim",
        "search",
        "stroop",
        "rhythm",
        "memory",
        "braking",
        "patience",
      ].map((roundId) => [
        roundId,
        {
          clearedLevels: Array.from({ length: 10 }, () => true),
          attempts: Array.from({ length: 10 }, () => 1),
          bestScores: Array.from({ length: 10 }, () => 90),
        },
      ]),
    ),
  };

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
  assert.equal(getLuckDrawStatusText(false, createDefaultAdvancedProgress()), "达到最强王者后解锁进阶挑战与运气抽取");
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
    "抽取次数 2",
  );
  assert.equal(getLuckDrawStatusText(true, createDefaultAdvancedProgress()), "完成进阶挑战获得运气抽取");
  assert.equal(
    formatLuckDrawOutcomeText({ score: 37, stars: 7, improved: false, guaranteed: false }),
    "运气保留历史最高",
  );
  assert.equal(
    formatLuckDrawOutcomeText({ score: 95, stars: 19, improved: true, guaranteed: false }),
    "本次 95 分 · 运气⭐19 · 刷新最高",
  );
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

test("advanced back destination keeps attempts inside the selected challenge flow", () => {
  assert.equal(getAdvancedBackDestination("select"), "result");
  assert.equal(getAdvancedBackDestination("intro"), "result");
  assert.equal(getAdvancedBackDestination("playing"), "challenge");
  assert.equal(getAdvancedBackDestination("complete"), "challenge");
});

test("advanced completion actions adapt to first clears, replays, failures and max level", () => {
  assert.deepEqual(getAdvancedCompletionActions({ passed: false, gained: false, level: 3 }), ["retry"]);
  assert.deepEqual(getAdvancedCompletionActions({ passed: true, gained: false, level: 3 }), ["retry"]);
  assert.deepEqual(getAdvancedCompletionActions({ passed: true, gained: true, level: 3 }), ["retry", "next"]);
  assert.deepEqual(getAdvancedCompletionActions({ passed: true, gained: true, level: 10 }), ["maxed"]);
});

test("result rank title only folds stars into the king title when stars are above zero", () => {
  assert.equal(formatResultRankTitle("最强王者", 0), "最强王者");
  assert.equal(formatResultRankTitle("最强王者", 7), "最强王者⭐7");
  assert.equal(formatResultRankTitle("最强王者", 10), "至圣王者⭐10");
  assert.equal(formatResultRankTitle("最强王者", 21), "无双王者⭐21");
  assert.equal(formatResultRankTitle("至尊星耀", 7), "至尊星耀");
});

test("advanced round content is specific to each metric and includes the selected level", () => {
  assert.equal(getAdvancedRoundContent("reaction", 4), "第 4 阶：连续完成变色点击，提前点或超时会失败。");
  assert.equal(getAdvancedRoundContent("aim", 4), "第 4 阶：命中移动靶，越高阶容错越低。");
  assert.equal(getAdvancedRoundContent("search", 4), "第 4 阶：在移动点阵里数准目标，错数会失败。");
  assert.equal(getAdvancedRoundContent("stroop", 4), "第 4 阶：只看字体颜色，忽略字义干扰。");
  assert.equal(getAdvancedRoundContent("rhythm", 4), "第 4 阶：按左右节奏圈完成节拍，漏点和错边会失败。");
  assert.equal(getAdvancedRoundContent("memory", 4), "第 4 阶：记住色块位置，遮住后选对目标颜色。");
  assert.equal(getAdvancedRoundContent("braking", 4), "第 4 阶：长按前进，危险出现时及时松手。");
  assert.equal(getAdvancedRoundContent("patience", 4), "第 4 阶：完整等待进度，不提前跳过。");
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

test("restart after clearing the current result returns to the home screen", () => {
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
  assert.equal(parsed.advancedProgress.luckStars, 20);
  assert.equal(parsed.advancedProgress.luckBestScore, 100);
  assert.equal(parsed.advancedProgress.luckDrawChances, 0);
  assert.equal(parsed.advancedProgress.luckDrawCount, 10);
  assert.equal(getAdvancedTotalStars(parsed.advancedProgress), 30);
  assert.equal(getAdvancedDimensionLevel(parsed.advancedProgress, "reaction"), 0);
});

test("challenge requirements grow stricter and score evaluation uses pass threshold", () => {
  const levelOne = getAdvancedChallengeRequirement("reaction", 1);
  const levelTen = getAdvancedChallengeRequirement("reaction", 10);

  assert.equal(levelOne.level, 1);
  assert.equal(levelTen.level, 10);
  assert.equal(levelTen.minScore > levelOne.minScore, true);
  assert.deepEqual(evaluateAdvancedChallengeScore("reaction", 1, levelOne.minScore), {
    level: 1,
    minScore: levelOne.minScore,
    score: levelOne.minScore,
    passed: true,
  });
  assert.equal(evaluateAdvancedChallengeScore("reaction", 10, levelTen.minScore - 1).passed, false);
});

test("advanced round score maps public round ids to the matching score axis", () => {
  const scores: ScoreSummary = {
    reaction: 11,
    targeting: 22,
    search: 33,
    interference: 44,
    rhythm: 55,
    memory: 66,
    braking: 77,
    waiting: 88,
    confidence: 99,
  };

  assert.equal(getAdvancedRoundScore(scores, "reaction"), 11);
  assert.equal(getAdvancedRoundScore(scores, "aim"), 22);
  assert.equal(getAdvancedRoundScore(scores, "search"), 33);
  assert.equal(getAdvancedRoundScore(scores, "stroop"), 44);
  assert.equal(getAdvancedRoundScore(scores, "rhythm"), 55);
  assert.equal(getAdvancedRoundScore(scores, "memory"), 66);
  assert.equal(getAdvancedRoundScore(scores, "braking"), 77);
  assert.equal(getAdvancedRoundScore(scores, "patience"), 88);
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
