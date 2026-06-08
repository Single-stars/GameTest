import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ADVANCED_STAGE_CONFIGS,
  evaluateAdvancedChallengeCompletion,
  getAdvancedBrakeCorrectAction,
  getAdvancedBrakeDangerLeft,
  getAdvancedBrakeEventOptions,
  getAdvancedBrakeHasReachedFinish,
  getAdvancedBrakeRuleHint,
  getAdvancedBrakeReleaseOutcome,
  getAdvancedBrakeSchedulerStep,
  isAdvancedBrakeRuleDangerEvent,
  isAdvancedBrakeFakeEvent,
  pickAdvancedBrakeEvent,
  shouldForceAdvancedBrakeRuleDangerEvent,
  shouldForceAdvancedBrakeFakeEvent,
  getAdvancedStageConfig,
  getDebugToolsVisibility,
  shouldShowHomeworldEntry,
  shouldShowPerfectClearShortcut,
  type AdvancedDifficulty,
} from "./advanced-challenges.ts";
import { getMiniGameLevels, type MiniGameId } from "./mini-games/index.ts";
import type { RoundId, TrialEvent } from "./scoring.ts";

const viewport = { width: 390, height: 844, dpr: 3 };
const ROUND_IDS: RoundId[] = ["reaction", "aim", "search", "stroop", "rhythm", "memory", "braking", "patience"];

const EXPECTED_ADVANCED_STAGE_TITLES: Record<RoundId, string[]> = {
  reaction: ["红灯误导Ⅰ", "双屏分心Ⅰ", "双屏红灯Ⅰ", "红灯误导Ⅱ", "双屏分心Ⅱ", "双屏红灯Ⅱ", "红灯误导Ⅲ", "双屏分心Ⅲ", "双屏红灯Ⅲ", "最终试炼"],
  aim: ["多靶轨迹Ⅰ", "逃逸靶Ⅰ", "干扰靶Ⅰ", "多靶轨迹Ⅱ", "逃逸靶Ⅱ", "干扰靶Ⅱ", "多靶轨迹Ⅲ", "逃逸靶Ⅲ", "干扰靶Ⅲ", "最终试炼"],
  search: ["移动平台Ⅰ", "高能平台Ⅰ", "移动障碍Ⅰ", "移动平台Ⅱ", "高能平台Ⅱ", "移动障碍Ⅱ", "移动平台Ⅲ", "高能平台Ⅲ", "移动障碍Ⅲ", "最终试炼"],
  stroop: ["移动平台Ⅰ", "脆弱平台Ⅰ", "危险平台Ⅰ", "移动平台Ⅱ", "脆弱平台Ⅱ", "危险平台Ⅱ", "移动平台Ⅲ", "脆弱平台Ⅲ", "危险平台Ⅲ", "最终试炼"],
  rhythm: ["移动平台Ⅰ", "二段跳Ⅰ", "重力异常Ⅰ", "移动平台Ⅱ", "二段跳Ⅱ", "重力异常Ⅱ", "移动平台Ⅲ", "二段跳Ⅲ", "重力异常Ⅲ", "最终试炼"],
  memory: ["移动通道Ⅰ", "道具收集Ⅰ", "重力倒转Ⅰ", "移动通道Ⅱ", "道具收集Ⅱ", "重力倒转Ⅱ", "移动通道Ⅲ", "道具收集Ⅲ", "重力倒转Ⅲ", "最终试炼"],
  braking: ["走到最后Ⅰ", "假危险Ⅰ", "规则怪谈Ⅰ", "走到最后Ⅱ", "假危险Ⅱ", "规则怪谈Ⅱ", "走到最后Ⅲ", "假危险Ⅲ", "规则怪谈Ⅲ", "最终试炼"],
  patience: ["倒计时Ⅰ", "变速转盘Ⅰ", "危险区Ⅰ", "倒计时Ⅱ", "变速转盘Ⅱ", "危险区Ⅱ", "倒计时Ⅲ", "变速转盘Ⅲ", "危险区Ⅲ", "最终试炼"],
};

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function cssRule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule ${selector}`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `unterminated CSS rule ${selector}`);
  return source.slice(start, end + 1);
}

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
      assert.equal(config.stageTitle, EXPECTED_ADVANCED_STAGE_TITLES[roundId][level - 1]);
    }
  }
});

test("reaction configs use the launch green-light thresholds by level group", () => {
  assert.deepEqual(
    [1, 4, 7].map((level) => {
      const config = getAdvancedStageConfig("reaction", level);
      return [config.variant, config.params.signalCount, config.params.avgMsThreshold];
    }),
    [
      ["reaction-red-trap", 5, 400],
      ["reaction-red-trap", 6, 350],
      ["reaction-red-trap", 7, 300],
    ],
  );
  assert.deepEqual(
    [2, 5, 8].map((level) => {
      const config = getAdvancedStageConfig("reaction", level);
      return [config.variant, config.params.requiredGreenClicks, config.params.avgMsThreshold];
    }),
    [
      ["reaction-dual-green", 5, 400],
      ["reaction-dual-green", 6, 350],
      ["reaction-dual-green", 7, 300],
    ],
  );
  assert.deepEqual(
    [3, 6, 9].map((level) => {
      const config = getAdvancedStageConfig("reaction", level);
      return [config.variant, config.params.signalCount, config.params.avgMsThreshold];
    }),
    [
      ["reaction-dual-trap", 5, 400],
      ["reaction-dual-trap", 6, 350],
      ["reaction-dual-trap", 7, 300],
    ],
  );

  const boss = getAdvancedStageConfig("reaction", 10);
  assert.equal(boss.variant, "reaction-grid-boss");
  assert.equal(boss.params.requiredGreenClicks, 8);
  assert.equal(boss.params.avgMsThreshold, 300);
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

test("advanced config maps the replaced dimensions to the new mini-game advanced levels", () => {
  const orderedMiniLevels = [1, 4, 7, 2, 5, 8, 3, 6, 9, 10];
  const orderedPrototypeLevelIds = (gameId: MiniGameId) => {
    const advancedLevels = getMiniGameLevels(gameId).filter((level) => level.kind === "advanced");
    return orderedMiniLevels.map((sourceOrder) => advancedLevels[sourceOrder - 1].levelId);
  };
  const squareJumpLevelIds = orderedPrototypeLevelIds("square-jump");
  const fallDownLevelIds = orderedPrototypeLevelIds("fall-down");

  for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const miniLevel = orderedMiniLevels[level - 1];
    assert.equal(getAdvancedStageConfig("search", level).params.miniGameId, "doodle");
    assert.equal(getAdvancedStageConfig("search", level).params.miniLevelId, `doodle-${miniLevel}`);
    assert.equal(getAdvancedStageConfig("stroop", level).params.miniGameId, "fall-down");
    assert.equal(getAdvancedStageConfig("stroop", level).params.miniLevelId, fallDownLevelIds[level - 1]);
    assert.equal(getAdvancedStageConfig("rhythm", level).params.miniGameId, "square-jump");
    assert.equal(getAdvancedStageConfig("rhythm", level).params.miniLevelId, squareJumpLevelIds[level - 1]);
    assert.equal(getAdvancedStageConfig("memory", level).params.miniGameId, "flappy");
    assert.equal(getAdvancedStageConfig("memory", level).params.miniLevelId, `flappy-${miniLevel}`);
    assert.equal(getAdvancedStageConfig("patience", level).params.miniGameId, "knife");
    assert.equal(getAdvancedStageConfig("patience", level).params.miniLevelId, `knife-${miniLevel}`);
  }

  assert.equal(getAdvancedStageConfig("search", 1).variant, "mini-doodle-moving-platform");
  assert.equal(getAdvancedStageConfig("search", 2).variant, "mini-doodle-risk-platform");
  assert.equal(getAdvancedStageConfig("search", 3).variant, "mini-doodle-moving-obstacle");
  assert.equal(getAdvancedStageConfig("stroop", 1).variant, "mini-fall-down-moving-layer");
  assert.equal(getAdvancedStageConfig("stroop", 10).variant, "mini-fall-down-final");
  assert.equal(getAdvancedStageConfig("rhythm", 1).variant, "mini-square-jump-moving-landing");
  assert.equal(getAdvancedStageConfig("rhythm", 10).variant, "mini-square-jump-final");
  assert.equal(getAdvancedStageConfig("memory", 2).variant, "mini-flappy-collectible-path");
  assert.equal(getAdvancedStageConfig("memory", 3).variant, "mini-flappy-reverse-gravity");
  for (const level of [3, 6, 9, 10]) {
    const config = getAdvancedStageConfig("memory", level);
    assert.equal(config.params.reversedGravity, true);
    assert.equal(config.params.reverseDirection, false);
    assert.doesNotMatch(config.passText, /从右往左|反向移动|翻转空间/);
  }
  assert.equal(getAdvancedStageConfig("patience", 10).variant, "mini-knife-final");
  assert.equal(getAdvancedStageConfig("stroop", 1).params.roundCount, undefined);
  assert.equal(getAdvancedStageConfig("rhythm", 10).params.offsetThresholdMs, undefined);
});

test("advanced knife entrance params mirror the prototype countdowns and initial knives", () => {
  const expectedCountdownsByMiniLevel = new Map<string, number>([
    ["knife-1", 2.5],
    ["knife-2", 2.5],
    ["knife-3", 2],
    ["knife-10", 3],
  ]);

  for (let level = 1; level <= 10; level += 1) {
    const config = getAdvancedStageConfig("patience", level);
    const miniLevelId = String(config.params.miniLevelId);

    if (/^knife-[1-8]$/.test(miniLevelId)) {
      assert.equal(config.params.initialObstacleCount, 4, miniLevelId);
    }

    const countdown = expectedCountdownsByMiniLevel.get(miniLevelId);
    assert.equal(config.params.shotCountdown, countdown, miniLevelId);
    assert.equal(Number(config.params.shotCount) % 2, 0, miniLevelId);
  }
});

test("advanced braking configs follow the square-stop variant columns and difficulty rows", () => {
  assert.deepEqual(
    [1, 4, 7].map((level) => {
      const config = getAdvancedStageConfig("braking", level);
      return [config.variant, config.params.lanes, config.params.eventCountMin, config.params.eventCountMax, config.params.allowGray];
    }),
    [
      ["braking-single-red", 1, 3, 4, false],
      ["braking-single-red", 1, 5, 6, false],
      ["braking-single-red", 1, 7, 8, false],
    ],
  );

  assert.deepEqual(
    [2, 5, 8].map((level) => {
      const config = getAdvancedStageConfig("braking", level);
      return [config.variant, config.params.lanes, config.params.eventCountMin, config.params.eventCountMax, config.params.allowGray];
    }),
    [
      ["braking-red-gray", 1, 5, 6, true],
      ["braking-red-gray", 1, 7, 8, true],
      ["braking-red-gray", 1, 9, 10, true],
    ],
  );

  assert.deepEqual(
    [3, 6, 9].map((level) => {
      const config = getAdvancedStageConfig("braking", level);
      return [config.variant, config.params.lanes, config.params.eventCountMin, config.params.eventCountMax, config.params.allowGray];
    }),
    [
      ["braking-dual-red-rule", 2, 4, 5, false],
      ["braking-dual-red-rule", 2, 6, 7, false],
      ["braking-dual-red-rule", 2, 8, 9, false],
    ],
  );

  const boss = getAdvancedStageConfig("braking", 10);
  assert.equal(boss.variant, "braking-final-red-gray");
  assert.equal(boss.params.lanes, 2);
  assert.equal(boss.params.allowGray, true);
});

test("advanced braking event options keep red and gray as the only danger blocks", () => {
  for (const level of [1, 4, 7]) {
    assert.deepEqual(getAdvancedBrakeEventOptions(level), [{ top: "red", bottom: null, correctAction: "release" }]);
  }

  for (const level of [2, 5, 8]) {
    assert.deepEqual(getAdvancedBrakeEventOptions(level), [
      { top: "red", bottom: null, correctAction: "release" },
      { top: "gray", bottom: null, correctAction: "hold" },
    ]);
    assert.deepEqual(getAdvancedBrakeEventOptions(level, { eventIndex: 0, eventCount: 6 }), [
      { top: "red", bottom: null, correctAction: "release" },
    ]);
  }

  for (const level of [3, 6, 9]) {
    const options = getAdvancedBrakeEventOptions(level);
    assert.equal(options.some((event) => event.top === "gray" || event.bottom === "gray"), false);
    assert.equal(options.some((event) => event.top === "red" && event.bottom === "red"), true);
  }

  const finalOptions = getAdvancedBrakeEventOptions(10);
  assert.equal(finalOptions.some((event) => event.top === "red" && event.bottom === "gray"), false);
  assert.equal(finalOptions.some((event) => event.top === "gray" && event.bottom === "red"), false);
  assert.equal(finalOptions.some((event) => event.top === "gray" || event.bottom === "gray"), true);
});

test("advanced braking correct action follows single red, gray fake, and dual-line rules", () => {
  assert.equal(getAdvancedBrakeCorrectAction(1, { top: "red", bottom: null }), "release");
  assert.equal(getAdvancedBrakeCorrectAction(2, { top: "gray", bottom: null }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(3, { top: "red", bottom: null }), "release");
  assert.equal(getAdvancedBrakeCorrectAction(3, { top: "red", bottom: "red" }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(6, { top: "red", bottom: null }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(6, { top: "red", bottom: "red" }), "release");
  assert.equal(getAdvancedBrakeCorrectAction(9, { top: null, bottom: "red" }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(9, { top: "red", bottom: null }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(9, { top: "red", bottom: "red" }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(10, { top: "red", bottom: null }), "release");
  assert.equal(getAdvancedBrakeCorrectAction(10, { top: "red", bottom: "red" }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(10, { top: "gray", bottom: null }), "hold");
  assert.equal(getAdvancedBrakeCorrectAction(10, { top: "gray", bottom: "gray" }), "hold");
});

test("advanced braking fake-danger levels force at least one fake event before the finish", () => {
  assert.equal(shouldForceAdvancedBrakeFakeEvent({ allowGray: false, fakeEventUsed: false, eventIndex: 4, eventCount: 6 }), false);
  assert.equal(shouldForceAdvancedBrakeFakeEvent({ allowGray: true, fakeEventUsed: true, eventIndex: 4, eventCount: 6 }), false);
  assert.equal(shouldForceAdvancedBrakeFakeEvent({ allowGray: true, fakeEventUsed: false, eventIndex: 3, eventCount: 6 }), false);
  assert.equal(shouldForceAdvancedBrakeFakeEvent({ allowGray: true, fakeEventUsed: false, eventIndex: 4, eventCount: 6 }), true);

  const redGrayOptions = getAdvancedBrakeEventOptions(5, { eventIndex: 5, eventCount: 7 });
  const forced = pickAdvancedBrakeEvent(redGrayOptions, { forceFake: true, randomValue: 0 });

  assert.equal(isAdvancedBrakeFakeEvent(forced), true);
  assert.equal(pickAdvancedBrakeEvent(redGrayOptions, { forceFake: false, randomValue: 0 }).top, "red");
});

test("advanced braking rule-tale levels force the relevant true-danger event before the finish", () => {
  assert.equal(shouldForceAdvancedBrakeRuleDangerEvent({ level: 1, ruleDangerEventUsed: false, eventIndex: 4, eventCount: 6 }), false);
  assert.equal(shouldForceAdvancedBrakeRuleDangerEvent({ level: 3, ruleDangerEventUsed: true, eventIndex: 4, eventCount: 6 }), false);
  assert.equal(shouldForceAdvancedBrakeRuleDangerEvent({ level: 3, ruleDangerEventUsed: false, eventIndex: 3, eventCount: 6 }), false);
  assert.equal(shouldForceAdvancedBrakeRuleDangerEvent({ level: 3, ruleDangerEventUsed: false, eventIndex: 4, eventCount: 6 }), true);
  assert.equal(shouldForceAdvancedBrakeRuleDangerEvent({ level: 6, ruleDangerEventUsed: false, eventIndex: 6, eventCount: 8 }), true);
  assert.equal(shouldForceAdvancedBrakeRuleDangerEvent({ level: 9, ruleDangerEventUsed: false, eventIndex: 6, eventCount: 8 }), false);
  assert.equal(shouldForceAdvancedBrakeRuleDangerEvent({ level: 10, ruleDangerEventUsed: false, eventIndex: 8, eventCount: 10 }), true);

  const level3Forced = pickAdvancedBrakeEvent(getAdvancedBrakeEventOptions(3), {
    forceFake: false,
    forceRuleDanger: true,
    level: 3,
    randomValue: 0.99,
  });
  assert.equal(isAdvancedBrakeRuleDangerEvent(3, level3Forced), true);

  const level6Forced = pickAdvancedBrakeEvent(getAdvancedBrakeEventOptions(6), {
    forceFake: false,
    forceRuleDanger: true,
    level: 6,
    randomValue: 0,
  });
  assert.deepEqual([level6Forced.top, level6Forced.bottom, level6Forced.correctAction], ["red", "red", "release"]);

  const level10Forced = pickAdvancedBrakeEvent(getAdvancedBrakeEventOptions(10, { eventIndex: 9, eventCount: 10 }), {
    forceFake: false,
    forceRuleDanger: true,
    level: 10,
    randomValue: 0.99,
  });
  assert.equal(isAdvancedBrakeRuleDangerEvent(10, level10Forced), true);
});

test("incoming aim second and third variants are slightly easier without becoming trivial", () => {
  const secondIncoming = getAdvancedStageConfig("aim", 5);
  const thirdIncoming = getAdvancedStageConfig("aim", 8);

  assert.equal(secondIncoming.params.aimMode, "incoming");
  assert.equal(thirdIncoming.params.aimMode, "incoming");
  assert.equal(secondIncoming.params.targetSpeed, 0.112);
  assert.equal(thirdIncoming.params.targetSpeed, 0.14);
  assert.equal(secondIncoming.params.spawnIntervalMs, 790);
  assert.equal(thirdIncoming.params.spawnIntervalMs, 650);
});

test("advanced braking cannot finish before hazards and required fake/rule events are complete", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const advancedBrakingSource = brakingSource.slice(
    brakingSource.indexOf("export function AdvancedBrakingRound"),
    brakingSource.indexOf("const DINO_TRIAL_COUNT"),
  );

  assert.match(advancedBrakingSource, /function canCompleteAdvancedBrakingRun/);
  assert.match(advancedBrakingSource, /hazardIndexRef\.current >= activeEventCountTarget/);
  assert.match(advancedBrakingSource, /!allowGray \|\| fakeEventUsedRef\.current/);
  assert.match(advancedBrakingSource, /!shouldAdvancedBrakingRequireRuleDanger\(config\.level\) \|\| ruleDangerEventUsedRef\.current/);
  assert.match(advancedBrakingSource, /if \(!canCompleteAdvancedBrakingRun\(\)\) return;/);
  assert.match(advancedBrakingSource, /if \(!activeEndless && !hazardRef\.current && !rulePortalRef\.current && !canCompleteAdvancedBrakingRun\(\)\)/);
  assert.match(advancedBrakingSource, /completeAdvancedNoDangerStop/);
  assert.match(advancedBrakingSource, /errorType:\s*"early_stop"/);
  assert.doesNotMatch(advancedBrakingSource, /if \(progressRef\.current >= 100\) \{[\s\S]{0,180}finish\(\);/);
});

test("advanced braking exposes in-round rule hints for rule-tale variants", () => {
  assert.equal(getAdvancedBrakeRuleHint(1, undefined), null);
  assert.equal(getAdvancedBrakeRuleHint(3, "single-red-stop"), "两个红色危险同时出现是安全的");
  assert.equal(getAdvancedBrakeRuleHint(6, "double-red-stop"), "只有两个红色危险出现时是危险的");
  assert.equal(getAdvancedBrakeRuleHint(9, "fake-all"), "所有危险都是假的");
  assert.equal(getAdvancedBrakeRuleHint(10, undefined), "只有一个危险单独出现时是真危险");
});

test("advanced braking renders rule-tale hints as readable background text", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const cssSource = readSource("../app/styles/base-flow/advanced.css");
  const advancedBrakingSource = brakingSource.slice(
    brakingSource.indexOf("export function AdvancedBrakingRound"),
    brakingSource.indexOf("const DINO_TRIAL_COUNT"),
  );
  const ruleText = cssRule(cssSource, ".advanced-brake-rule-backdrop-text");
  const trackRenderSource = advancedBrakingSource.slice(
    advancedBrakingSource.indexOf('className="advanced-brake-track"'),
    advancedBrakingSource.indexOf("{Array.from({ length: lanes }"),
  );

  assert.match(advancedBrakingSource, /const \[activeRuleHint, setActiveRuleHint\] = useState/);
  assert.match(advancedBrakingSource, /const nextRuleHint = endless/);
  assert.match(trackRenderSource, /className="advanced-brake-rule-backdrop-text"/);
  assert.match(ruleText, /position:\s*absolute;/);
  assert.match(ruleText, /top:\s*clamp\(/);
  assert.match(ruleText, /white-space:\s*nowrap;/);
  assert.match(ruleText, /font-size:\s*clamp\(/);
  assert.doesNotMatch(ruleText, /inset:\s*4px 8px 12px;/);
  assert.doesNotMatch(ruleText, /规则：/);
  assert.match(ruleText, /pointer-events:\s*none;/);
  assert.match(ruleText, /z-index:\s*0;/);
  assert.match(ruleText, /text-shadow:/);
});

test("advanced braking endless lanes follow the active reused rule config without forcing rule dangers", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const advancedBrakingSource = brakingSource.slice(
    brakingSource.indexOf("export function AdvancedBrakingRound"),
    brakingSource.indexOf("const DINO_TRIAL_COUNT"),
  );

  assert.match(brakingSource, /function resolveAdvancedBrakingLaneCount/);
  assert.match(brakingSource, /function getAdvancedBrakingRuleZoneConfig/);
  assert.match(brakingSource, /function isAdvancedBrakingRuleZoneActive/);
  assert.match(advancedBrakingSource, /const \[activeLaneCount, setActiveLaneCount\] = useState/);
  assert.match(advancedBrakingSource, /setActiveLaneCount\(isAdvancedBrakingRuleZoneActive\(brakingRuleZoneState\) \? Math\.max\(2, resolveAdvancedBrakingLaneCount\(ruleZoneConfig\)\) : resolveAdvancedBrakingLaneCount\(config\)\)/);
  assert.doesNotMatch(advancedBrakingSource, /const lanes = endless \? \(endlessDifficulty >= 0\.48 \? 2 : 1\)/);
  assert.match(advancedBrakingSource, /forceRuleDanger: endlessRuntime \? isAdvancedBrakingRuleZoneActive\(brakingRuleZoneStateRef\.current\) : shouldForceAdvancedBrakeRuleDangerEvent/);
  assert.doesNotMatch(advancedBrakingSource, /const activeEventCountTarget = endless \? Number\.MAX_SAFE_INTEGER : eventCountTarget;/);
});

test("endless braking rule portals are the only rule space and keep the beige stage under dark waves", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const cssSource = readSource("../app/styles/base-flow/advanced.css");

  assert.match(brakingSource, /ENDLESS_BRAKING_RULE_PORTAL_DISTANCE = 118/);
  assert.match(brakingSource, /resetAdvancedBrakingHold/);
  assert.match(brakingSource, /resetAdvancedBrakingInput/);
  assert.match(brakingSource, /pickEndlessBrakingRuleHint/);
  assert.match(brakingSource, /ruleZoneHintRef/);
  assert.match(brakingSource, /setActiveLaneCount\(isAdvancedBrakingRuleZoneActive\(brakingRuleZoneState\) \? Math\.max\(2, resolveAdvancedBrakingLaneCount\(ruleZoneConfig\)\)/);
  assert.match(brakingSource, /if \(nextRuleZoneState === "active"\)[\s\S]*resetAdvancedBrakingInput\(\);/);
  assert.match(brakingSource, /if \(nextRuleZoneState === "normal"\)[\s\S]*resetAdvancedBrakingInput\(\);/);
  assert.match(brakingSource, /forceRuleDanger: endlessRuntime \? isAdvancedBrakingRuleZoneActive\(brakingRuleZoneStateRef\.current\) : shouldForceAdvancedBrakeRuleDangerEvent/);
  assert.doesNotMatch(brakingSource, /setActiveRuleHint\(isAdvancedBrakingRuleZoneActive\(brakingRuleZoneState\)[\s\S]*: getAdvancedBrakeRuleHint/);
  assert.match(cssSource, /\.advanced-braking\.rule-zone-active/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.rule-zone-active\s*\{[\s\S]*background:\s*#050505/);
  assert.match(cssSource, /\.advanced-braking\.rule-zone-active\s*\{[\s\S]*--difficulty-wave-color:\s*rgba\(5,\s*5,\s*5/);
});

test("endless braking rule tales are rule objects with fake-danger predicates and impact animations", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const cssSource = readSource("../app/styles/base-flow/advanced.css");
  const bumpedKeyframes = cssSource.slice(cssSource.indexOf("@keyframes advanced-brake-hazard-bumped"));

  assert.match(brakingSource, /type EndlessBrakingRuleTaleKind/);
  assert.match(brakingSource, /ENDLESS_BRAKING_RULE_TALES/);
  assert.match(brakingSource, /kind: "fake-only"/);
  assert.match(brakingSource, /kind: "top-fake-only"/);
  assert.match(brakingSource, /kind: "bottom-fake-only"/);
  assert.match(brakingSource, /function resolveEndlessBrakingRuleTaleAction/);
  assert.match(brakingSource, /function getEndlessBrakingRuleTaleReleaseCaseCount/);
  assert.match(brakingSource, /every\(\(rule\) => getEndlessBrakingRuleTaleReleaseCaseCount\(rule\) <= 1\)/);
  assert.match(brakingSource, /function getEndlessBrakingEventOptions/);
  assert.match(brakingSource, /activeRuleTaleRef/);
  assert.match(brakingSource, /grayFakeChance/);
  assert.match(brakingSource, /endlessBrakingEventKey/);
  assert.match(brakingSource, /filterRecentEndlessBrakingEventOptions/);
  assert.match(brakingSource, /recentEndlessHazardKeysRef/);
  assert.match(brakingSource, /resolveEndlessBrakingReactionWindowMs/);
  assert.match(brakingSource, /ENDLESS_BRAKING_LEVEL_10_REACTION_WINDOW_MS/);
  assert.match(brakingSource, /bumpedHazards/);
  assert.match(brakingSource, /advanced-hazard-bumped/);
  assert.match(brakingSource, /rulePortalLanes/);
  assert.match(cssSource, /\.advanced-hazard-bumped/);
  assert.match(cssSource, /@keyframes advanced-brake-hazard-bumped/);
  assert.doesNotMatch(bumpedKeyframes, /scale\(/);
  assert.match(bumpedKeyframes, /rotate\(var\(--advanced-brake-bump-rotate/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-lane\s*\{[\s\S]*overflow:\s*visible;/);
});

test("endless braking passive clears and skill impacts avoid misleading success flashes", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const skillImpactSource = brakingSource.slice(
    brakingSource.indexOf("const isBigLuckSkillActive"),
    brakingSource.indexOf("const recordHoldSuccess"),
  );
  const holdSuccessSource = brakingSource.slice(
    brakingSource.indexOf("const recordHoldSuccess"),
    brakingSource.indexOf("const startHazard"),
  );
  const reachedRunnerSource = brakingSource.slice(
    brakingSource.indexOf("if (hasAdvancedBrakingHazardReachedRunner({"),
    brakingSource.indexOf("if (!activeEndless && getAdvancedBrakeHasReachedFinish"),
  );

  assert.match(skillImpactSource, /bumpAdvancedBrakingHazard/);
  assert.doesNotMatch(skillImpactSource, /showAdvancedFeedback\("success"\)/);
  assert.match(holdSuccessSource, /if \(!endlessRef\.current\) showAdvancedFeedback\("success"\);/);
  assert.equal(
    reachedRunnerSource.indexOf("if (isBigLuckSkillActive())") < reachedRunnerSource.indexOf("if (movedHazard.correctAction"),
    true,
  );
});

test("endless braking big luck ends without post-skill grace or speed trail visuals", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const runtimeSource = readSource("../features/endless/endless-round-player.tsx");
  const cssSource = readSource("../app/styles/base-flow/advanced.css");

  assert.match(runtimeSource, /const ENDLESS_BRAKING_SKILL_DURATION_MS = 5000;/);
  assert.match(brakingSource, /const ENDLESS_BIG_LUCK_RECOVERY_EVENT_DELAY_MS = 1300;/);
  assert.match(brakingSource, /bigLuckRunningRef/);
  assert.match(brakingSource, /bigLuckRecoveryDelayPendingRef/);
  assert.match(brakingSource, /eventTimerRef\.current = Math\.max\(nextEventDelayMs, ENDLESS_BIG_LUCK_RECOVERY_EVENT_DELAY_MS\);/);
  assert.match(brakingSource, /if \(bigLuckRunningRef\.current && !bigLuckRunning && activeEndlessRuntime\) \{[\s\S]*bigLuckRecoveryDelayPendingRef\.current = true;[\s\S]*if \(!hazardRef\.current && !rulePortalRef\.current\) resetEventTimer\(\);/);
  assert.doesNotMatch(brakingSource, /postBigLuckGraceRef|consumePostBigLuckGrace|bigLuckWasActiveRef|clearCurrentEndlessHazardAfterGrace/);
  assert.doesNotMatch(brakingSource, /bigLuckVisualActive|advanced-brake-skill-trail|flappy-speed-trail|flappy-speed-trail-flow|--flappy-speed-trail/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-skill-trail/);
  assert.doesNotMatch(cssSource, /@keyframes advanced-brake-skill-trail-flow/);
});

test("endless green-light lane count changes use a readable buffer instead of instantly reshaping cells", () => {
  const reactionSource = readSource("../features/rounds/native/reaction.tsx");
  const cssSource = readSource("../app/styles/base-flow/native-reaction.css");

  assert.match(reactionSource, /ENDLESS_REACTION_LANE_CHANGE_BUFFER_MS = 1000/);
  assert.match(reactionSource, /targetLaneCount/);
  assert.match(reactionSource, /laneChangeTimerRef/);
  assert.match(reactionSource, /laneTransitioningRef/);
  assert.match(reactionSource, /restartSignalAfterLaneChangeRef/);
  assert.match(reactionSource, /if \(finishedRef\.current \|\| laneTransitioningRef\.current\) return;/);
  assert.match(reactionSource, /if \(laneTransitioningRef\.current\) return;/);
  assert.match(reactionSource, /clearTimers\(\);[\s\S]*setLaneTransitionState\(true\)/);
  assert.match(reactionSource, /setLaneTransitioning\(nextTransitioning\)/);
  assert.match(reactionSource, /setLaneTransitionState\(true\)/);
  assert.match(reactionSource, /setActiveLaneCount\(targetLaneCount\)/);
  assert.match(reactionSource, /advanced-reaction-grid cells-\$\{lanes\} \$\{laneTransitioning \? "lane-transitioning" : ""\}/);
  assert.match(cssSource, /\.advanced-reaction-grid\.lane-transitioning/);
});

test("four-cell green-light grids render the missing vertical divider for a complete 2x2 split", () => {
  const cssSource = readSource("../app/styles/base-flow/native-reaction.css");
  const cells4Rule = cssRule(cssSource, ".advanced-reaction-grid.cells-4 .advanced-reaction-cell:nth-child(2n)");

  assert.match(cells4Rule, /border-left:\s*2px solid/);
});

test("advanced braking endless runner uses a lightweight background parallax instead of in-track scenery posts", () => {
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const cssSource = readSource("../app/styles/base-flow/advanced.css");
  const trackRule = cssRule(cssSource, ".advanced-braking.endless-runner .advanced-brake-track");
  const laneRule = cssRule(cssSource, ".advanced-braking.endless-runner .advanced-brake-lane");

  assert.match(brakingSource, /syncEndlessWaveParallax/);
  assert.match(brakingSource, /--difficulty-wave-parallax-x/);
  assert.match(brakingSource, /--difficulty-wave-parallax-y/);
  assert.match(brakingSource, /--advanced-brake-ground-offset/);
  assert.doesNotMatch(brakingSource, /--difficulty-wave-screen-shift-x/);
  assert.match(brakingSource, /distance \* -3\.2/);
  assert.match(brakingSource, /const groundOffsetPx = trackRef\.current \? \(distance \* -trackRef\.current\.clientWidth\) \/ 100 : 0;/);
  assert.match(brakingSource, /\$\{groundOffsetPx\}px/);
  assert.doesNotMatch(brakingSource, /distance \* -28/);
  assert.doesNotMatch(brakingSource, /setEndlessWorldOffset/);
  assert.doesNotMatch(brakingSource, /advanced-brake-scenery-post/);
  assert.doesNotMatch(brakingSource, /className="advanced-brake-scenery"/);
  assert.doesNotMatch(trackRule, /background:\s*#fbf7ef/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner\s*{[\s\S]*--difficulty-wave-opacity:\s*var\(--difficulty-nonreaction-wave-opacity,\s*0\.12\);/);
  assert.doesNotMatch(cssSource, /--difficulty-wave-time-flow/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-lane::after\s*{/);
  assert.match(cssSource, /height:\s*4px;/);
  assert.match(cssSource, /background-position:\s*var\(--advanced-brake-ground-offset,\s*0px\) 0;/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track::before\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-scenery-post/);
  assert.match(laneRule, /border-bottom:\s*4px solid rgba\(24,\s*24,\s*24,\s*0\.16\);/);
  assert.doesNotMatch(laneRule, /linear-gradient\(90deg/);
});

test("advanced braking positions danger by reaction window and wins when block right edge reaches finish", () => {
  assert.equal(
    getAdvancedBrakeDangerLeft({
      runnerLeftPercent: 20,
      runnerWidthPercent: 8,
      hazardWidthPercent: 6,
      speedPerSecond: 10,
      reactionWindowMs: 500,
    }),
    33,
  );
  assert.equal(
    getAdvancedBrakeDangerLeft({
      runnerLeftPercent: 88,
      runnerWidthPercent: 8,
      hazardWidthPercent: 6,
      speedPerSecond: 10,
      reactionWindowMs: 500,
    }),
    null,
  );
  assert.equal(getAdvancedBrakeHasReachedFinish({ runnerLeftPercent: 0, runnerWidthPercent: 8 }), false);
  assert.equal(getAdvancedBrakeHasReachedFinish({ runnerLeftPercent: 91.9, runnerWidthPercent: 8 }), false);
  assert.equal(getAdvancedBrakeHasReachedFinish({ runnerLeftPercent: 92, runnerWidthPercent: 8 }), true);
});

test("advanced braking scheduler advances only while the player is holding and no event is active", () => {
  assert.deepEqual(
    getAdvancedBrakeSchedulerStep({
      holding: false,
      activeEvent: false,
      eventTimerMs: 800,
      deltaMs: 300,
      eventCountUsed: 0,
      eventCountTarget: 3,
      nearFinish: false,
    }),
    { eventTimerMs: 800, shouldSpawn: false },
  );

  assert.deepEqual(
    getAdvancedBrakeSchedulerStep({
      holding: true,
      activeEvent: true,
      eventTimerMs: 800,
      deltaMs: 300,
      eventCountUsed: 0,
      eventCountTarget: 3,
      nearFinish: false,
    }),
    { eventTimerMs: 800, shouldSpawn: false },
  );

  assert.deepEqual(
    getAdvancedBrakeSchedulerStep({
      holding: true,
      activeEvent: false,
      eventTimerMs: 800,
      deltaMs: 300,
      eventCountUsed: 0,
      eventCountTarget: 3,
      nearFinish: false,
    }),
    { eventTimerMs: 500, shouldSpawn: false },
  );

  assert.deepEqual(
    getAdvancedBrakeSchedulerStep({
      holding: true,
      activeEvent: false,
      eventTimerMs: 200,
      deltaMs: 300,
      eventCountUsed: 0,
      eventCountTarget: 3,
      nearFinish: false,
    }),
    { eventTimerMs: 0, shouldSpawn: true },
  );
});

test("advanced braking release outcome fails early stops before danger and when hold is required", () => {
  assert.deepEqual(getAdvancedBrakeReleaseOutcome(null), {
    outcome: "failure",
    errorType: "early_stop",
  });
  assert.deepEqual(getAdvancedBrakeReleaseOutcome({ top: "red", bottom: null, correctAction: "release" }), { outcome: "success" });
  assert.deepEqual(getAdvancedBrakeReleaseOutcome({ top: "gray", bottom: null, correctAction: "hold" }), {
    outcome: "failure",
    errorType: "false_alarm",
  });
  assert.deepEqual(getAdvancedBrakeReleaseOutcome({ top: "red", bottom: "red", correctAction: "hold" }), {
    outcome: "failure",
    errorType: "false_alarm",
  });
  assert.deepEqual(getAdvancedBrakeReleaseOutcome({ top: "red", bottom: null, correctAction: "hold" }), {
    outcome: "failure",
    errorType: "false_alarm",
  });
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
  assert.equal(passing.correctCount, 3);
  assert.equal(passing.requiredCorrect, 3);
  assert.equal(passing.reason, "通过");
  assert.deepEqual(passing.goalChecks, [true, true, true]);
  assert.equal(passing.reactionAverageMs, 290);
  assert.equal(passing.reactionThresholdMs, 350);

  const slow = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, { shownAt: 0, responseAt: 367, value: { signalColor: "green" } }),
  ]);
  assert.equal(slow.passed, false);
  assert.equal(slow.reason, "失败：平均反应 367ms，要求 ≤ 350ms");
  assert.deepEqual(slow.goalChecks, [true, true, false]);
  assert.equal(slow.reactionAverageMs, 367);

  const redClick = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, {
      shownAt: 0,
      responseAt: 260,
      value: { signalColor: "green" },
    }),
    trial("reaction", 0, {
      correct: false,
      errorType: "false_alarm",
      responseAt: 120,
      value: { signalColor: "red" },
    }),
  ]);
  assert.equal(redClick.passed, false);
  assert.equal(redClick.reason, "失败：点到了红灯");
  assert.deepEqual(redClick.goalChecks, [true, false, true]);
  assert.equal(redClick.reactionAverageMs, 260);

  const earlyOrMiss = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, {
      correct: false,
      errorType: "wrong",
      responseAt: 100,
      value: { signalColor: "idle" },
    }),
  ]);
  assert.equal(earlyOrMiss.passed, false);
  assert.equal(earlyOrMiss.reason, "失败：提前点击或漏点");
  assert.deepEqual(earlyOrMiss.goalChecks, [false, true, false]);
  assert.equal(earlyOrMiss.reactionAverageMs, null);
});

test("advanced completion keeps reaction red-click failure isolated from early-or-miss goal", () => {
  const config = getAdvancedStageConfig("reaction", 4);
  const result = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, {
      shownAt: 0,
      responseAt: 260,
      value: { signalColor: "green" },
    }),
    trial("reaction", 1, {
      correct: false,
      errorType: "false_alarm",
      responseAt: 120,
      value: {},
    }),
  ]);

  assert.equal(result.passed, false);
  assert.equal(result.reason, "失败：点到了红灯");
  assert.deepEqual(result.goalChecks, [true, false, true]);
});

test("advanced completion treats direct red click as red-only failure", () => {
  const config = getAdvancedStageConfig("reaction", 10);
  const result = evaluateAdvancedChallengeCompletion(config, [
    trial("reaction", 0, {
      correct: false,
      errorType: "false_alarm",
      responseAt: 120,
      value: { signalColor: "red" },
    }),
  ]);

  assert.equal(result.passed, false);
  assert.equal(result.reason, "失败：点到了红灯");
  assert.deepEqual(result.goalChecks, [true, false, false]);
});

test("advanced completion evaluates aim goals by miss, fly-out and decoy independently", () => {
  const incomingConfig = getAdvancedStageConfig("aim", 2);
  const incomingFlyOut = evaluateAdvancedChallengeCompletion(incomingConfig, [
    trial("aim", 0, {
      correct: false,
      errorType: "timeout",
      value: { mode: "arrow", shotHit: false, flyOut: true },
    }),
  ]);
  assert.equal(incomingFlyOut.passed, false);
  assert.equal(incomingFlyOut.reason, "失败：目标飞出场景");
  assert.deepEqual(incomingFlyOut.goalChecks, [true, false]);

  const decoyConfig = getAdvancedStageConfig("aim", 3);
  const decoyCollision = evaluateAdvancedChallengeCompletion(decoyConfig, [
    trial("aim", 0, {
      correct: false,
      errorType: "collision",
      value: { mode: "arrow", shotHit: false, hitDecoy: true },
    }),
  ]);
  assert.equal(decoyCollision.passed, false);
  assert.equal(decoyCollision.reason, "失败：箭矢射中了干扰靶");
  assert.deepEqual(decoyCollision.goalChecks, [true, false]);

  const bossConfig = getAdvancedStageConfig("aim", 10);
  const bossMiss = evaluateAdvancedChallengeCompletion(bossConfig, [
    trial("aim", 0, {
      correct: false,
      errorType: "miss",
      value: { mode: "arrow", shotHit: false },
    }),
  ]);
  assert.equal(bossMiss.passed, false);
  assert.equal(bossMiss.reason, "失败：箭矢射空");
  assert.deepEqual(bossMiss.goalChecks, [false, true, true]);

  const bossMissBeforeFlyOut = evaluateAdvancedChallengeCompletion(bossConfig, [
    trial("aim", 0, {
      correct: false,
      errorType: "miss",
      value: { mode: "arrow", shotHit: false },
    }),
    trial("aim", 1, {
      correct: false,
      errorType: "timeout",
      value: { mode: "arrow", shotHit: false, flyOut: true },
    }),
  ]);
  assert.equal(bossMissBeforeFlyOut.passed, false);
  assert.equal(bossMissBeforeFlyOut.reason, "失败：箭矢射空");
  assert.deepEqual(bossMissBeforeFlyOut.goalChecks, [false, true, true]);
});

test("advanced completion evaluates replaced dimensions through mini-game challenge outcomes", () => {
  const rhythm = getAdvancedStageConfig("rhythm", 4);
  const rhythmResult = evaluateAdvancedChallengeCompletion(rhythm, [
    trial("rhythm", 0, { correct: false, errorType: "miss", value: { mode: "mini-game", miniGameId: "square-jump", miniLevelId: rhythm.params.miniLevelId, reason: "掉下去了" } }),
  ]);

  assert.equal(rhythmResult.passed, false);
  assert.equal(rhythmResult.reason, "失败：掉下去了");
  assert.deepEqual(rhythmResult.goalChecks, [false]);

  const fallDown = getAdvancedStageConfig("stroop", 2);
  const fallDownResult = evaluateAdvancedChallengeCompletion(fallDown, [
    trial("stroop", 0, { correct: true, value: { mode: "mini-game", miniGameId: "fall-down", miniLevelId: fallDown.params.miniLevelId, reason: "到达终点平台" } }),
  ]);
  const fallDownDanger = getAdvancedStageConfig("stroop", 3);
  const fallDownDangerResult = evaluateAdvancedChallengeCompletion(fallDownDanger, [
    trial("stroop", 0, {
      correct: false,
      value: {
        mode: "mini-game",
        miniGameId: "fall-down",
        miniLevelId: fallDownDanger.params.miniLevelId,
        reason: "踩到危险",
      },
    }),
  ]);

  const doodle = getAdvancedStageConfig("search", 3);
  const doodleResult = evaluateAdvancedChallengeCompletion(doodle, [
    trial("search", 0, { correct: false, errorType: "collision", value: { mode: "mini-game", miniGameId: "doodle", miniLevelId: "doodle-7", reason: "碰到移动障碍" } }),
  ]);
  const flappy = getAdvancedStageConfig("memory", 2);
  const flappyResult = evaluateAdvancedChallengeCompletion(flappy, [
    trial("memory", 0, { correct: true, value: { mode: "mini-game", miniGameId: "flappy", miniLevelId: "flappy-4", reason: "通过终点" } }),
  ]);

  assert.equal(doodleResult.passed, false);
  assert.equal(doodleResult.reason, "失败：碰到移动障碍");
  assert.equal(doodleResult.requiredCorrect, 1);
  assert.equal(fallDownResult.passed, true);
  assert.equal(fallDownResult.reason, "通过");
  assert.deepEqual(fallDownDangerResult.goalChecks, [true, false]);
  assert.equal(flappyResult.passed, true);
  assert.equal(flappyResult.reason, "通过");
});

test("advanced completion maps mini-game advanced goals into ordered goal checks", () => {
  const doodle = getAdvancedStageConfig("search", 5);
  const doodleDangerResult = evaluateAdvancedChallengeCompletion(doodle, [
    trial("search", 0, {
      correct: false,
      errorType: "collision",
      value: {
        mode: "mini-game",
        miniGameId: "doodle",
        miniLevelId: String(doodle.params.miniLevelId),
        reason: "撞到危险",
        riskHit: 5,
        riskTotal: 5,
      },
    }),
  ]);
  assert.deepEqual(doodleDangerResult.goalChecks, [true, true, false]);

  const doodleRiskResult = evaluateAdvancedChallengeCompletion(doodle, [
    trial("search", 0, {
      correct: false,
      value: {
        mode: "mini-game",
        miniGameId: "doodle",
        miniLevelId: String(doodle.params.miniLevelId),
        reason: "漏踩高风险平台 3/5",
        riskHit: 3,
        riskTotal: 5,
      },
    }),
  ]);
  assert.deepEqual(doodleRiskResult.goalChecks, [true, false, true]);

  const doodleFallResult = evaluateAdvancedChallengeCompletion(doodle, [
    trial("search", 0, {
      correct: false,
      value: {
        mode: "mini-game",
        miniGameId: "doodle",
        miniLevelId: String(doodle.params.miniLevelId),
        reason: "掉出屏幕底部",
        riskHit: 5,
        riskTotal: 5,
      },
    }),
  ]);
  assert.deepEqual(doodleFallResult.goalChecks, [false, true, true]);

  const fallDownFinal = getAdvancedStageConfig("stroop", 10);
  const fallDownFinalDangerResult = evaluateAdvancedChallengeCompletion(fallDownFinal, [
    trial("stroop", 0, {
      correct: false,
      value: {
        mode: "mini-game",
        miniGameId: "fall-down",
        miniLevelId: String(fallDownFinal.params.miniLevelId),
        reason: "踩到危险",
      },
    }),
  ]);
  assert.deepEqual(fallDownFinalDangerResult.goalChecks, [true, true, false]);

  const flappy = getAdvancedStageConfig("memory", 5);
  const flappyResult = evaluateAdvancedChallengeCompletion(flappy, [
    trial("memory", 0, {
      correct: false,
      errorType: "collision",
      value: {
        mode: "mini-game",
        miniGameId: "flappy",
        miniLevelId: String(flappy.params.miniLevelId),
        reason: "漏收集道具 3/6",
        collected: 3,
        collectibleCount: 6,
      },
    }),
  ]);
  assert.deepEqual(flappyResult.goalChecks, [true, true, false]);

  for (const level of [2, 8, 10]) {
    const collectibleFlappy = getAdvancedStageConfig("memory", level);
    const collectibleFlappyResult = evaluateAdvancedChallengeCompletion(collectibleFlappy, [
      trial("memory", 0, {
        correct: false,
        errorType: "collision",
        value: {
          mode: "mini-game",
          miniGameId: "flappy",
          miniLevelId: String(collectibleFlappy.params.miniLevelId),
          reason: "漏收集道具 2/4",
          collected: 2,
          collectibleCount: 4,
        },
      }),
    ]);
    assert.deepEqual(collectibleFlappyResult.goalChecks, [true, true, false], `memory level ${level}`);
  }

  const flappyCollisionResult = evaluateAdvancedChallengeCompletion(flappy, [
    trial("memory", 0, {
      correct: false,
      errorType: "collision",
      value: {
        mode: "mini-game",
        miniGameId: "flappy",
        miniLevelId: String(flappy.params.miniLevelId),
        reason: "撞到柱子",
        collected: 2,
        collectibleCount: 6,
      },
    }),
  ]);
  assert.deepEqual(flappyCollisionResult.goalChecks, [false, true, true]);

  const knife = getAdvancedStageConfig("patience", 10);
  const knifeResult = evaluateAdvancedChallengeCompletion(knife, [
    trial("patience", 0, {
      correct: false,
      errorType: "timeout",
      value: {
        mode: "mini-game",
        miniGameId: "knife",
        miniLevelId: String(knife.params.miniLevelId),
        reason: "倒计时结束",
        fired: 9,
        shotCount: 13,
      },
    }),
  ]);
  assert.deepEqual(knifeResult.goalChecks, [true, false, true]);
});

test("debug tools are hidden unless explicitly enabled by development mode or URL flag", () => {
  assert.equal(getDebugToolsVisibility({ nodeEnv: "production", search: "" }), false);
  assert.equal(getDebugToolsVisibility({ nodeEnv: "production", search: "?debug=1" }), true);
  assert.equal(getDebugToolsVisibility({ nodeEnv: "development", search: "" }), true);
});

test("homeworld entry is development-only for the test release", () => {
  assert.equal(shouldShowHomeworldEntry({ nodeEnv: "production", search: "" }), false);
  assert.equal(shouldShowHomeworldEntry({ nodeEnv: "production", search: "?homeworld=1" }), false);
  assert.equal(shouldShowHomeworldEntry({ nodeEnv: "production", search: "?debug=1" }), false);
  assert.equal(shouldShowHomeworldEntry({ nodeEnv: "development", search: "" }), true);
  assert.equal(shouldShowHomeworldEntry({ nodeEnv: "development", search: "?homeworld=1" }), true);
});

test("perfect-clear shortcut is only visible with debug tools", () => {
  assert.equal(shouldShowPerfectClearShortcut({ debugToolsVisible: false }), false);
  assert.equal(shouldShowPerfectClearShortcut({ debugToolsVisible: true }), true);
});
