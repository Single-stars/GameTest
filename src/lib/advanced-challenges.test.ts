import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVANCED_STAGE_CONFIGS,
  evaluateAdvancedChallengeCompletion,
  getAdvancedStageConfig,
  getDebugToolsVisibility,
  shouldShowPerfectClearShortcut,
  type AdvancedDifficulty,
} from "./advanced-challenges.ts";
import type { RoundId, TrialEvent } from "./scoring.ts";

const viewport = { width: 390, height: 844, dpr: 3 };
const ROUND_IDS: RoundId[] = ["reaction", "aim", "search", "stroop", "rhythm", "memory", "braking", "patience"];

function trial(roundId: RoundId, index: number, patch: Partial<TrialEvent> = {}): TrialEvent {
  return {
    roundId,
    trialIndex: index,
    pointerType: "touch",
    viewport,
    scheduledAt: index * 1000,
    shownAt: index * 1000,
    responseAt: index * 1000 + 200,
    correct: true,
    ...patch,
  };
}

test("advanced stage configs cover every dimension with the required 10-level mapping", () => {
  const expectedDifficultyByLevel = new Map<number, AdvancedDifficulty>([
    [1, "easy"],
    [2, "easy"],
    [3, "easy"],
    [4, "medium"],
    [5, "medium"],
    [6, "medium"],
    [7, "hard"],
    [8, "hard"],
    [9, "hard"],
    [10, "boss"],
  ]);
  const expectedVariantIndexByLevel = new Map([
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 1],
    [5, 2],
    [6, 3],
    [7, 1],
    [8, 2],
    [9, 3],
    [10, 10],
  ]);

  for (const roundId of ROUND_IDS) {
    const configs = ADVANCED_STAGE_CONFIGS[roundId];
    assert.equal(configs.length, 10);
    for (let level = 1; level <= 10; level += 1) {
      const config = getAdvancedStageConfig(roundId, level);
      assert.equal(config.dimension, roundId);
      assert.equal(config.level, level);
      assert.equal(config.difficulty, expectedDifficultyByLevel.get(level));
      assert.equal(config.variantIndex, expectedVariantIndexByLevel.get(level));
      assert.equal(config.passText.startsWith("过关要求："), true);
      assert.equal(config.passText.includes("规则："), false);
      assert.equal(config.passText.includes("示例"), false);
    }
  }
});

test("reaction configs match the MD signal counts and average ms thresholds", () => {
  assert.deepEqual(
    [1, 4, 7].map((level) => {
      const config = getAdvancedStageConfig("reaction", level);
      return [config.variant, config.params.signalCount, config.params.avgMsThreshold];
    }),
    [
      ["reaction-red-trap", 5, 350],
      ["reaction-red-trap", 6, 300],
      ["reaction-red-trap", 7, 250],
    ],
  );
  assert.deepEqual(
    [2, 5, 8].map((level) => {
      const config = getAdvancedStageConfig("reaction", level);
      return [config.variant, config.params.requiredGreenClicks, config.params.avgMsThreshold];
    }),
    [
      ["reaction-dual-green", 5, 350],
      ["reaction-dual-green", 6, 300],
      ["reaction-dual-green", 7, 250],
    ],
  );
  assert.deepEqual(
    [3, 6, 9].map((level) => {
      const config = getAdvancedStageConfig("reaction", level);
      return [config.variant, config.params.signalCount, config.params.avgMsThreshold];
    }),
    [
      ["reaction-dual-trap", 5, 350],
      ["reaction-dual-trap", 6, 300],
      ["reaction-dual-trap", 7, 250],
    ],
  );

  const boss = getAdvancedStageConfig("reaction", 10);
  assert.equal(boss.variant, "reaction-grid-boss");
  assert.equal(boss.params.requiredGreenClicks, 8);
  assert.equal(boss.params.avgMsThreshold, 250);
});

test("advanced aim configs describe real archery target types and arrow parity", () => {
  const expected = new Map([
    [1, ["aim-track", "track", false, 0]],
    [2, ["aim-incoming", "incoming", true, 0]],
    [3, ["aim-decoy", "decoy", false, 1]],
    [4, ["aim-track", "track", false, 0]],
    [5, ["aim-incoming", "incoming", true, 0]],
    [6, ["aim-decoy", "decoy", false, 2]],
    [7, ["aim-track", "track", false, 0]],
    [8, ["aim-incoming", "incoming", true, 0]],
    [9, ["aim-decoy", "decoy", false, 3]],
    [10, ["aim-boss", "boss", true, 3]],
  ] as const);

  for (const [level, [variant, aimMode, failOnFlyOut, decoyCount]] of expected) {
    const config = getAdvancedStageConfig("aim", level);
    assert.equal(config.variant, variant);
    assert.equal(config.params.aimMode, aimMode);
    assert.equal(config.params.targetCount, config.params.arrowCount);
    assert.equal(config.params.failOnFlyOut, failOnFlyOut);
    assert.equal(config.params.decoyCount ?? 0, decoyCount);
    assert.equal(config.params.shotTimeoutMs ?? null, null);
  }

  for (const level of [2, 5, 8, 10]) {
    assert.equal(typeof getAdvancedStageConfig("aim", level).params.spawnIntervalMs, "number");
  }
});

test("advanced config encodes MD round counts and wait durations", () => {
  for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    assert.equal(getAdvancedStageConfig("search", level).params.roundCount, 3);
    assert.equal(getAdvancedStageConfig("memory", level).params.roundCount, 4);
    assert.equal(getAdvancedStageConfig("stroop", level).params.roundCount, 5);
  }

  assert.deepEqual(
    Array.from({ length: 10 }, (_, index) => getAdvancedStageConfig("patience", index + 1).params.waitMs),
    [6000, 8000, 10000, 12000, 15000, 18000, 20000, 24000, 28000, 32000],
  );
  assert.equal(getAdvancedStageConfig("stroop", 1).params.answerTimeLimitMs, 2000);
  assert.equal(getAdvancedStageConfig("stroop", 4).params.answerTimeLimitMs, 1500);
  assert.equal(getAdvancedStageConfig("stroop", 7).params.answerTimeLimitMs, 1000);
  assert.equal(getAdvancedStageConfig("stroop", 10).params.answerTimeLimitMs, null);
  assert.equal(getAdvancedStageConfig("rhythm", 10).params.offsetThresholdMs, 50);
});

test("advanced completion evaluates reaction by green-click average and clear failure reasons", () => {
  const config = getAdvancedStageConfig("reaction", 4);
  const passing = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, { shownAt: 0, responseAt: 280, value: { signalColor: "green" } }),
    trial("reaction", 1, { shownAt: 1000, responseAt: 1310, value: { signalColor: "green" } }),
    trial("reaction", 2, { shownAt: 2000, responseAt: null, value: { signalColor: "red" } }),
    trial("reaction", 3, { shownAt: 3000, responseAt: 3280, value: { signalColor: "green" } }),
    trial("reaction", 4, { shownAt: 4000, responseAt: 4290, value: { signalColor: "green" } }),
    trial("reaction", 5, { shownAt: 5000, responseAt: 5290, value: { signalColor: "green" } }),
  ]);

  assert.equal(passing.passed, true);
  assert.equal(passing.correctCount, 5);
  assert.equal(passing.requiredCorrect, 1);
  assert.equal(passing.reason, "通过");

  const slow = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, { shownAt: 0, responseAt: 317, value: { signalColor: "green" } }),
  ]);
  assert.equal(slow.passed, false);
  assert.equal(slow.reason, "失败：平均反应 317ms，要求 ≤ 300ms");

  const redClick = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, {
      correct: false,
      errorType: "false_alarm",
      responseAt: 120,
      value: { signalColor: "red" },
    }),
  ]);
  assert.equal(redClick.passed, false);
  assert.equal(redClick.reason, "失败：点到了红灯");
});

test("advanced completion evaluates rhythm offset thresholds and search count errors", () => {
  const rhythm = getAdvancedStageConfig("rhythm", 4);
  const rhythmTrials = Array.from({ length: 12 }, (_, index) =>
    trial("rhythm", index, { value: { offsetMs: index === 4 ? 91 : 48, beatType: "true" } }),
  );
  const rhythmResult = evaluateAdvancedChallengeCompletion(rhythm, rhythmTrials);

  assert.equal(rhythmResult.passed, false);
  assert.equal(rhythmResult.reason, "失败：偏差 91ms，要求 ≤ 80ms");

  const search = getAdvancedStageConfig("search", 3);
  const searchResult = evaluateAdvancedChallengeCompletion(search, [
    trial("search", 0, { value: { targetCount: 5, selectedCount: 5 } }),
    trial("search", 1, { value: { targetCount: 6, selectedCount: 4 } }),
    trial("search", 2, { value: { targetCount: 3, selectedCount: 3 } }),
  ]);

  assert.equal(searchResult.passed, false);
  assert.equal(searchResult.reason, "失败：少数了 2 个目标");
});

test("debug tools are hidden unless explicitly enabled by development mode or URL flag", () => {
  assert.equal(getDebugToolsVisibility({ nodeEnv: "production", search: "" }), false);
  assert.equal(getDebugToolsVisibility({ nodeEnv: "production", search: "?debug=1" }), true);
  assert.equal(getDebugToolsVisibility({ nodeEnv: "development", search: "" }), true);
});

test("perfect-clear shortcut stays visible inside playable levels without debug tools", () => {
  assert.equal(shouldShowPerfectClearShortcut({ debugToolsVisible: false }), true);
  assert.equal(shouldShowPerfectClearShortcut({ debugToolsVisible: true }), true);
});
