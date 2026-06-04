import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as endlessMode from "./endless-mode.ts";
import {
  ENDLESS_MODE_LEVEL,
  ENDLESS_SUPPORTED_ROUND_IDS,
  getEndlessAdvancedSourceLevel,
  getAdvancedEndlessStatusLabel,
  getEndlessAimConfig,
  getEndlessBrakingConfig,
  getEndlessDifficulty,
  getEndlessDifficultyState,
  getEndlessFlappyConfig,
  getEndlessJourneyConfig,
  getEndlessKnifeConfig,
  getEndlessKnifeEffectiveWheelIndex,
  getEndlessLevelState,
  getEndlessScore,
  getEndlessTestJumpOptions,
  getEndlessRoundDifficultyState,
  isEndlessModeUnlocked,
} from "./endless-mode.ts";
import { createDefaultAdvancedProgress, recordAdvancedChallengeResult } from "./advanced-progress.ts";
import { getMiniGameLevel } from "./mini-games/index.ts";

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function cssRule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule ${selector}`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `unterminated CSS rule ${selector}`);
  return source.slice(start, end + 1);
}

test("endless mode unlocks only after the first three advanced levels in the same dimension", () => {
  let progress = createDefaultAdvancedProgress();

  assert.equal(isEndlessModeUnlocked(progress, "memory"), false);

  progress = recordAdvancedChallengeResult(progress, { roundId: "memory", level: 1, score: 100, passed: true });
  progress = recordAdvancedChallengeResult(progress, { roundId: "memory", level: 2, score: 100, passed: true });
  assert.equal(isEndlessModeUnlocked(progress, "memory"), false);

  progress = recordAdvancedChallengeResult(progress, { roundId: "memory", level: 3, score: 100, passed: true });
  assert.equal(isEndlessModeUnlocked(progress, "memory"), true);
  assert.equal(isEndlessModeUnlocked(progress, "search"), false);
});

test("endless lobby level is positioned before advanced level one and may be selected while locked", () => {
  assert.equal(ENDLESS_MODE_LEVEL, 0);
  assert.equal(getEndlessLevelState(2), "locked");
  assert.equal(getEndlessLevelState(3), "current");
  assert.equal(getAdvancedEndlessStatusLabel("locked"), "完成前三关解锁");
  assert.equal(getAdvancedEndlessStatusLabel("current"), "无尽挑战");
});

test("endless scoring stays intentionally simple", () => {
  assert.equal(getEndlessScore({ coreActions: 0, bonusActions: 0 }), 0);
  assert.equal(getEndlessScore({ coreActions: 12, bonusActions: 3 }), 15);
  assert.equal(getEndlessScore({ coreActions: 12, bonusActions: 3, failures: 99 }), 15);
});

test("endless HUD has a pure energy meter that heals or grants one damage shield", () => {
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const energyCss = sourceBetween(cssSource, ".endless-energy-meter {", ".endless-score-readout {");

  assert.match(commonSource, /gainEnergy: \(amount\?: number, feedbackText\?: string\) => void/);
  assert.match(commonSource, /shieldCharges: number/);
  assert.match(runtimeSource, /const ENDLESS_ENERGY_THRESHOLD = 10;/);
  assert.match(runtimeSource, /energyRef/);
  assert.match(runtimeSource, /shieldChargesRef/);
  assert.match(runtimeSource, /gainEnergy/);
  assert.match(runtimeSource, /if \(nextRevives < ENDLESS_STARTING_REVIVES\)/);
  assert.match(runtimeSource, /nextShieldCharges = 1;/);
  assert.match(runtimeSource, /nextEnergy = ENDLESS_ENERGY_THRESHOLD;/);
  assert.match(runtimeSource, /if \(shieldChargesRef\.current > 0\)/);
  assert.match(runtimeSource, /shieldChargesRef\.current = 0;/);
  assert.match(runtimeSource, /energyPercent: shieldCharges > 0 \? 100 : Math\.round/);
  assert.match(runtimeSource, /const endlessHudClassName = \[/);
  assert.match(runtimeSource, /api\.shieldCharges > 0 \? "shielded" : ""/);
  assert.match(runtimeSource, /className="endless-hearts"/);
  assert.match(runtimeSource, /endless-heart-token/);
  assert.match(runtimeSource, /className="endless-energy-meter"/);
  assert.match(runtimeSource, /className="endless-energy-segments"/);
  assert.match(runtimeSource, /endless-energy-cell/);
  assert.doesNotMatch(runtimeSource, /width: `\$\{api\.energyPercent\}%`/);
  assert.doesNotMatch(runtimeSource, /endless-shield/);
  assert.match(flappySource, /endlessRef\.current\?\.gainEnergy\(1, "道具收集！"\)/);
  assert.match(energyCss, /\.endless-energy-segments\s*{/);
  assert.match(energyCss, /grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(energyCss, /\.endless-energy-cell\.active\s*{/);
  assert.doesNotMatch(energyCss, /linear-gradient|endless-shield-pulse|\.endless-hud\.shielded/);
});

test("endless energy bonuses surface per-mode popup feedback and shield the player avatar", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const reactionSource = readFileSync(new URL("../features/rounds/native/reaction.tsx", import.meta.url), "utf8");
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const squareAdvanceSource = squareSource.slice(
    squareSource.indexOf("const advanceToNextPlatform"),
    squareSource.indexOf("const launchChargedJump"),
  );

  assert.match(commonSource, /gainEnergy: \(amount\?: number, feedbackText\?: string\) => void/);
  assert.match(runtimeSource, /energyPopups/);
  assert.match(runtimeSource, /showEnergyFeedback/);
  assert.match(runtimeSource, /className="endless-energy-popup"/);
  assert.match(runtimeSource, /shielded={api\.shieldCharges > 0}/);
  assert.match(cssSource, /\.endless-energy-popup\s*{/);

  assert.match(reactionSource, /ENDLESS_REACTION_PREDICTION_MS = 100/);
  assert.match(reactionSource, /ms <= ENDLESS_REACTION_PREDICTION_MS[\s\S]*gainEnergy\(1, "顶级预判！"\)/);
  assert.match(aimSource, /ENDLESS_AIM_EDGE_TRAJECTORY_NORMALIZED_ERROR = 0\.8/);
  assert.match(aimSource, /trajectoryNormalizedError >= ENDLESS_AIM_EDGE_TRAJECTORY_NORMALIZED_ERROR[\s\S]*trajectoryNormalizedError <= 1[\s\S]*gainEnergy\(1, "极限命中！"\)/);
  assert.match(doodleSource, /ENDLESS_DOODLE_ENERGY_DISTANCE = 10/);
  assert.match(doodleSource, /gainEnergy\(1, "无视野预判！"\)/);
  assert.match(fallSource, /ENDLESS_FALL_DOWN_ENERGY_DISTANCE = 5/);
  assert.match(fallSource, /ENDLESS_FALL_DOWN_FAST_DROP_DISTANCE = 6/);
  assert.match(fallSource, /gainEnergy\(1, "极速下降！"\)/);
  assert.match(squareSource, /ENDLESS_SQUARE_CENTER_LANDING_RATIO = 0\.1;/);
  assert.match(squareAdvanceSource, /if \(isEndlessRun\) \{[\s\S]*endlessRef\.current\?\.gainEnergy\(1\);[\s\S]*ENDLESS_SQUARE_CENTER_LANDING_RATIO[\s\S]*endlessRef\.current\?\.gainEnergy\(1,/);
  assert.doesNotMatch(squareAdvanceSource, /current\.feedback = "Good"|prototype-feedback good|view\.feedback/);
  assert.match(squareSource, /gainEnergy\(1, "精准落地！"\)/);
  assert.match(flappySource, /gainEnergy\(1, "道具收集！"\)/);
  assert.match(brakingSource, /ENDLESS_BRAKING_FAST_REACTION_MS = 150/);
  assert.match(brakingSource, /activeEndless\.addScore\(1\)/);
  assert.match(brakingSource, /latency <= ENDLESS_BRAKING_FAST_REACTION_MS[\s\S]*gainEnergy\(1, "快速反应！"\)/);
  assert.match(knifeSource, /ENDLESS_KNIFE_DANGER_MARGIN_DEGREES = 4/);
  assert.match(knifeSource, /gainEnergy\(1, "极限飞刀！"\)/);
});

test("endless HUD animates resource changes and highlights new records", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const hudSource = sourceBetween(runtimeSource, "function EndlessHud", "function EndlessNativeRound");

  assert.match(hudSource, /lifePulse/);
  assert.match(hudSource, /energyPulse/);
  assert.match(hudSource, /recordBreaking/);
  assert.match(hudSource, /endlessHudClassName/);
  assert.match(hudSource, /low-life/);
  assert.match(hudSource, /`heart-\$\{lifePulse\.tone\}`/);
  assert.match(hudSource, /energy-cell-pop|energy-cell-drain/);
  assert.match(hudSource, /endless-score-record-badge/);

  assert.match(cssSource, /\.endless-heart-token\.heart-loss \.endless-heart/);
  assert.match(cssSource, /\.endless-heart-token\.heart-gain \.endless-heart/);
  assert.match(cssSource, /\.endless-heart-token\.danger-heart \.endless-heart/);
  assert.match(cssSource, /\.endless-energy-console\.energy-gain \.endless-energy-meter/);
  assert.match(cssSource, /\.endless-energy-cell\.energy-cell-pop/);
  assert.match(cssSource, /\.endless-energy-cell\.energy-cell-drain/);
  assert.match(cssSource, /\.endless-score-readout\.new-record/);
  assert.match(cssSource, /\.endless-score-record-badge/);
  assert.match(cssSource, /@keyframes endless-low-life-heart-shake/);
  assert.match(cssSource, /@keyframes endless-record-badge-pop/);
});

test("endless difficulty ramps smoothly from progress and clamps only the difficulty value", () => {
  assert.equal(getEndlessDifficulty({ progress: -10, maxRamp: 100 }), 0);
  assert.equal(getEndlessDifficulty({ progress: 25, maxRamp: 100 }), 0.25);
  assert.equal(getEndlessDifficulty({ progress: 100, maxRamp: 100 }), 1);
  assert.equal(getEndlessDifficulty({ progress: 240, maxRamp: 100 }), 1);
});

test("endless difficulty state gives players readable strength and next-step progress", () => {
  const start = getEndlessDifficultyState({ difficulty: 0 });
  const middle = getEndlessDifficultyState({ difficulty: 0.58 });
  const capped = getEndlessDifficultyState({ difficulty: 1 });

  assert.equal(start.label, "起步");
  assert.equal(start.nextLabel, "渐入");
  assert.equal(start.progressToNext, 0);
  assert.equal(start.sourceAdvancedLevel, 1);

  assert.equal(middle.label, "中段");
  assert.equal(middle.nextLabel, "高压");
  assert.equal(middle.progressToNext > 0, true);
  assert.equal(middle.progressToNext < 100, true);

  assert.equal(capped.label, "封顶");
  assert.equal(capped.nextLabel, null);
  assert.equal(capped.progressToNext, 100);
  assert.equal(capped.sourceAdvancedLevel, 10);
});

test("endless round difficulty state uses the same ramp as each live endless runtime", () => {
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0, roundId: "aim", score: 80 }).label, "封顶");
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0, roundId: "braking", score: 36 * 110 }).label, "封顶");
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0.75, roundId: "reaction", score: 0 }).label, "高压");
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0, reportedDifficulty: 1, roundId: "patience", score: 0 }).label, "封顶");
});

test("endless flappy supports smooth anomaly segments instead of hard mode cuts", () => {
  const early = getEndlessFlappyConfig({ gateIndex: 5 });
  const late = getEndlessFlappyConfig({ gateIndex: 120 });

  assert.equal(early.reverseSegmentChance, 0);
  assert.equal(late.reverseSegmentChance > 0, true);
  assert.equal(late.gravityTransition, "instant-feedback");
  assert.equal(late.segmentWarningGates, 1);
});

test("endless braking ramps like one continuous runner with smooth dual-lane warnings", () => {
  const early = getEndlessBrakingConfig({ distance: 0 });
  const mid = getEndlessBrakingConfig({ distance: 2600 });
  const late = getEndlessBrakingConfig({ distance: 36 * 110 });

  assert.equal(early.grayFakeChance, 0);
  assert.equal(early.dualLaneChance, 0);
  assert.equal(mid.roadSpeed < late.roadSpeed, true);
  assert.equal(late.grayFakeChance > 0, true);
  assert.equal(late.dualLaneChance > 0, true);
  assert.equal(late.dualLaneTransition, "warn-then-split");
  assert.equal(late.worldScrollsContinuously, true);
});

test("endless knife ramps to sixteen hits and staggers countdown wheels", () => {
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 0 }).requiredHits, 10);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 4 }).requiredHits, 12);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 12 }).requiredHits, 16);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 40 }).requiredHits, 16);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 1 }).countdownSeconds, null);
  assert.equal(typeof getEndlessKnifeConfig({ wheelIndex: 2 }).countdownSeconds, "number");
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 3 }).countdownSeconds, null);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 8 }).countdownSeconds! > getEndlessKnifeConfig({ wheelIndex: 12 }).countdownSeconds!, true);
});

test("endless knife debug jumps raise the active wheel difficulty without capping real progress", () => {
  assert.equal(getEndlessKnifeEffectiveWheelIndex({ wheelIndex: 0, debugDifficulty: 0 }), 0);
  assert.equal(getEndlessKnifeEffectiveWheelIndex({ wheelIndex: 0, debugDifficulty: 1 }), 12);
  assert.equal(getEndlessKnifeEffectiveWheelIndex({ wheelIndex: 40, debugDifficulty: 1 }), 40);
});

test("endless mode exposes direct difficulty jump points for testing", () => {
  assert.deepEqual(
    getEndlessTestJumpOptions().map((item) => item.difficulty),
    [0, 0.25, 0.5, 0.75, 1],
  );
});

test("endless helpers cover all eight dimensions and reuse advanced level progression", () => {
  assert.deepEqual(ENDLESS_SUPPORTED_ROUND_IDS, [
    "reaction",
    "aim",
    "search",
    "stroop",
    "rhythm",
    "memory",
    "braking",
    "patience",
  ]);
  assert.equal(getEndlessAdvancedSourceLevel({ difficulty: 0 }), 1);
  assert.equal(getEndlessAdvancedSourceLevel({ difficulty: 0.5 }), 6);
  assert.equal(getEndlessAdvancedSourceLevel({ difficulty: 1 }), 10);

  const aimEarly = getEndlessAimConfig({ hitCount: 0 });
  const aimLate = getEndlessAimConfig({ hitCount: 80 });
  assert.equal(aimEarly.sourceAdvancedLevel, 1);
  assert.equal(aimLate.sourceAdvancedLevel, 10);
  assert.equal(aimLate.decoyChance > aimEarly.decoyChance, true);
  assert.equal(aimLate.incomingChance > aimEarly.incomingChance, true);
});

test("endless journey configs ramp moving, fake, and hazard content through reusable advanced configs", () => {
  const searchEarly = getEndlessJourneyConfig({ roundId: "search", score: 0 });
  const searchLate = getEndlessJourneyConfig({ roundId: "search", score: 90 });
  const stroopLate = getEndlessJourneyConfig({ roundId: "stroop", score: 90 });
  const rhythmLate = getEndlessJourneyConfig({ roundId: "rhythm", score: 90 });

  assert.equal(searchEarly.sourceAdvancedLevel, 1);
  assert.equal(searchLate.sourceAdvancedLevel, 10);
  assert.equal(searchLate.movingChance > searchEarly.movingChance, true);
  assert.equal(searchLate.hazardChance > searchEarly.hazardChance, true);
  assert.equal(stroopLate.fakeChance > 0, true);
  assert.equal(rhythmLate.gravityChance > 0, true);
});

test("endless route mini-games generate future content from current progress", () => {
  const getEndlessMiniGameStageConfig = (endlessMode as typeof endlessMode & {
    getEndlessMiniGameStageConfig?: (input: { debugDifficulty?: number; miniGameId: string; progress: number }) => {
      params: Record<string, number | string | boolean | null>;
      sourceAdvancedLevel: number;
    };
  }).getEndlessMiniGameStageConfig;
  assert.equal(typeof getEndlessMiniGameStageConfig, "function");

  const doodleEarly = getEndlessMiniGameStageConfig({ miniGameId: "doodle", progress: 0 });
  const doodleLate = getEndlessMiniGameStageConfig({ miniGameId: "doodle", progress: 90 });
  const squareEarly = getEndlessMiniGameStageConfig({ miniGameId: "square-jump", progress: 0 });
  const squareLate = getEndlessMiniGameStageConfig({ miniGameId: "square-jump", progress: 90 });
  const squareBase = getMiniGameLevel("square-jump", "square-jump-base");
  const fallEarly = getEndlessMiniGameStageConfig({ miniGameId: "fall-down", progress: 0 });
  const fallLate = getEndlessMiniGameStageConfig({ miniGameId: "fall-down", progress: 90 });
  const flappyEarly = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 0 });
  const flappyLate = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 90 });

  assert.equal(doodleEarly.sourceAdvancedLevel, 1);
  assert.equal(doodleLate.sourceAdvancedLevel, 10);
  assert.equal(Number(doodleLate.params.movingObstacleCount) > Number(doodleEarly.params.movingObstacleCount), true);
  assert.equal(Number(doodleLate.params.movingPlatformRatio) > Number(doodleEarly.params.movingPlatformRatio), true);

  assert.equal(squareLate.sourceAdvancedLevel, 10);
  assert.equal(squareEarly.params.doubleJumpEnabled, false);
  assert.equal(squareLate.params.doubleJumpEnabled, false);
  assert.equal(squareLate.params.cyclingChargeOnDoubleJump, false);
  assert.equal(Number(squareLate.params.secondPowerDistanceMax ?? 0), 0);
  assert.equal(squareLate.params.gravityJumpLimit, 3);
  assert.equal(squareEarly.params.powerDistanceMin, squareBase.params.powerDistanceMin);
  assert.equal(squareEarly.params.powerDistanceMax, squareBase.params.powerDistanceMax);
  assert.equal(squareLate.params.powerDistanceMin, squareBase.params.powerDistanceMin);
  assert.equal(squareLate.params.powerDistanceMax, squareBase.params.powerDistanceMax);
  assert.equal(Number(squareEarly.params.distanceMin) >= Number(squareBase.params.distanceMin), true);
  assert.equal(Number(squareLate.params.distanceMax) <= Number(squareBase.params.distanceMax), true);
  assert.equal(Number(squareEarly.params.movingPlatformCount) >= 1, true);
  assert.equal(Number(squareEarly.params.movingRange) >= 24, true);
  assert.equal(Number(squareEarly.params.movingSpeed) >= 0.65, true);
  assert.equal(Number(squareLate.params.movingPlatformCount) > Number(squareEarly.params.movingPlatformCount), true);
  assert.equal(String(squareLate.params.gravityPattern).includes("light"), true);

  assert.equal(fallLate.sourceAdvancedLevel, 10);
  assert.equal(Number(fallEarly.params.movingPlatformCount) >= 1, true);
  assert.equal(Number(fallEarly.params.movingRange) >= 28, true);
  assert.equal(Number(fallEarly.params.movingSpeed) >= 0.55, true);
  assert.equal(Number(fallLate.params.movingPlatformCount) > Number(fallEarly.params.movingPlatformCount), true);
  assert.equal(Number(fallLate.params.dangerPlatformCount) > Number(fallEarly.params.dangerPlatformCount), true);

  assert.equal(flappyLate.sourceAdvancedLevel, 10);
  assert.equal(Number(flappyLate.params.movingGateRatio) > Number(flappyEarly.params.movingGateRatio), true);
  assert.equal(Number(flappyEarly.params.collectibleCount) >= 4, true);
  assert.equal(Number(flappyLate.params.collectibleCount) >= 14, true);
  assert.equal(Number(flappyLate.params.movingGateSpeed) >= 3, true);
  assert.equal(Number(flappyLate.params.gapSize) < Number(flappyEarly.params.gapSize), true);
});

test("endless route runtimes extend future terrain from live progress instead of one fixed long map", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /extendEndlessDoodleWorld/);
  assert.match(squareSource, /ensureEndlessSquareJumpPlatforms/);
  assert.match(fallSource, /extendEndlessFallDownWorld/);
  assert.match(flappySource, /extendEndlessFlappyGates/);
  assert.match([doodleSource, squareSource, fallSource, flappySource].join("\n"), /getEndlessMiniGameStageConfig/);
  assert.doesNotMatch(runtimeSource, /targetHeightScreens = Math\.max\(Number\(params\.targetHeightScreens\) \|\| 0, 80\)/);
  assert.doesNotMatch(runtimeSource, /params\.jumpsRequired = ENDLESS_LONG_RUN_COUNT/);
  assert.doesNotMatch(runtimeSource, /params\.layersRequired = ENDLESS_LONG_RUN_COUNT/);
});

test("endless route rounds decouple score distance from requested energy milestones", () => {
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");

  assert.match(commonSource, /setDistanceScore: \(distanceScore: number, gainEnergyFromDistance\?: boolean\) => void/);
  assert.match(runtimeSource, /setDistanceScore/);
  assert.match(runtimeSource, /Math\.max\(coreActionsRef\.current,\s*safeDistanceScore\)/);
  assert.match(runtimeSource, /distanceEnergyScoreRef/);
  assert.match(runtimeSource, /const distanceEnergyGain = nextCoreActions - distanceEnergyScoreRef\.current;/);
  assert.match(runtimeSource, /gainEnergy\(distanceEnergyGain\);/);

  for (const source of [doodleSource, squareSource, fallSource]) {
    assert.match(source, /setDistanceScore/);
    assert.doesNotMatch(source, /addScore\(1\)/);
  }

  assert.match(doodleSource, /setDistanceScore\(endlessDistanceScore, false\)/);
  assert.match(doodleSource, /Math\.floor\(endlessDistanceScore \/ ENDLESS_DOODLE_ENERGY_DISTANCE\)/);
  assert.match(fallSource, /setDistanceScore\(endlessDistanceScore, false\)/);
  assert.match(fallSource, /Math\.floor\(endlessDistanceScore \/ ENDLESS_FALL_DOWN_ENERGY_DISTANCE\)/);
  assert.match(squareSource, /const endlessLandingScore = current\.currentIndex;/);
  assert.match(squareSource, /setDistanceScore\(endlessLandingScore, false\)/);
  assert.match(squareSource, /Math\.max\(endlessRef\.current\?\.score \?\? 0, endlessLandingScore\)/);
  assert.doesNotMatch(squareSource, /current\.currentIndex \* 160/);

  assert.match(flappySource, /setDistanceScore\(Math\.floor\(Math\.max\(0, current\.progress\) \/ 160\), false\)/);
  assert.doesNotMatch(flappySource, /setDistanceScore\([^;\n]*(?:passed|gate)/);
  assert.doesNotMatch(brakingSource, /setDistanceScore\(Math\.floor\(endlessDistanceRef\.current\)\)/);
  assert.match(brakingSource, /activeEndless\.reportDifficulty/);
  assert.match(brakingSource, /activeEndless\.addScore\(1\)/);
});

test("endless braking uses continuous scenery and hazards that approach the runner", () => {
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const trackRule = cssRule(cssSource, ".advanced-braking.endless-runner .advanced-brake-track");
  const laneRule = cssRule(cssSource, ".advanced-braking.endless-runner .advanced-brake-lane");

  assert.match(brakingSource, /endlessDistanceRef/);
  assert.doesNotMatch(brakingSource, /endlessWorldOffset/);
  assert.match(brakingSource, /ENDLESS_BRAKE_RUNNER_LEFT_PERCENT/);
  assert.match(brakingSource, /useState\(endless \? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0\)/);
  assert.match(brakingSource, /useRef\(endless \? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0\)/);
  assert.match(brakingSource, /syncEndlessWaveParallax/);
  assert.match(brakingSource, /style\.setProperty\("--difficulty-wave-parallax-x"/);
  assert.match(brakingSource, /style\.setProperty\("--difficulty-wave-parallax-y"/);
  assert.doesNotMatch(brakingSource, /style\.setProperty\("--difficulty-wave-screen-shift-x"/);
  assert.match(brakingSource, /distance \* -3\.2/);
  assert.doesNotMatch(brakingSource, /ENDLESS_BRAKE_SCENERY_LOOP_PX/);
  assert.doesNotMatch(brakingSource, /--advanced-brake-world-offset/);
  assert.doesNotMatch(brakingSource, /advanced-brake-scenery/);
  assert.match(brakingSource, /hazard\.x - distanceDelta/);
  assert.doesNotMatch(brakingSource, /setDistanceScore\(Math\.floor\(endlessDistanceRef\.current\)\)/);
  assert.match(brakingSource, /reportDifficulty/);
  assert.doesNotMatch(brakingSource, /setEndlessWorldOffset/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track::before\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track::after\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-scenery\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-scenery-post\s*{/);
  assert.doesNotMatch(trackRule, /background:\s*#fbf7ef/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner\s*{[\s\S]*--difficulty-wave-opacity:\s*var\(--difficulty-nonreaction-wave-opacity,\s*0\.12\);/);
  assert.doesNotMatch(cssSource, /--difficulty-wave-time-flow/);
  assert.doesNotMatch(laneRule, /background:/);
  assert.match(laneRule, /border-bottom:\s*4px solid rgba\(24,\s*24,\s*24,\s*0\.16\);/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-lane\s*{[\s\S]*linear-gradient\(90deg/);
});

test("endless aim starts from early difficulty while preserving one-at-a-time spawn logic", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const early = getEndlessAimConfig({ hitCount: 0 });
  const middle = getEndlessAimConfig({ hitCount: 42 });
  const late = getEndlessAimConfig({ hitCount: 80 });

  assert.equal(early.aimMode, "track");
  assert.equal(early.route, "circle");
  assert.equal(early.decoyCount, 0);
  assert.equal(early.failOnFlyOut, false);
  assert.equal(early.incomingChance, 0);
  assert.equal(middle.decoyCount > early.decoyCount, true);
  assert.equal(middle.targetSpeedMultiplier > early.targetSpeedMultiplier, true);
  assert.equal(late.aimMode, "boss");
  assert.equal(late.route, "mixed");
  assert.equal(late.failOnFlyOut, true);

  assert.doesNotMatch(runtimeSource, /difficulty:\s*roundId === "aim" \? 1 : 0/);
  assert.match(runtimeSource, /getEndlessReusableStageConfig\(\{\s*difficulty:\s*0,\s*roundId\s*}\)/);
  assert.match(runtimeSource, /const aim = getEndlessAimConfig\(\{ hitCount: 0 }\);/);
  assert.match(runtimeSource, /aimMode:\s*aim\.aimMode/);
  assert.match(runtimeSource, /route:\s*aim\.route/);
  assert.match(runtimeSource, /decoyCount:\s*aim\.decoyCount/);
  assert.match(runtimeSource, /failOnFlyOut:\s*aim\.failOnFlyOut/);
  assert.doesNotMatch(runtimeSource, /aimMode:\s*"boss"/);
  assert.doesNotMatch(runtimeSource, /runSeed="endless-aim"/);
  assert.match(aimSource, /const maxActiveEndlessTargets = endlessRuntime \? 1 : activeTargetCountRef\.current;/);
  assert.match(aimSource, /const initialTargetCount = isEndless \? 1 : targetCount;/);
  assert.match(aimSource, /const activeSpawnMode = getAdvancedAimMode\(spawnConfig\);/);
  assert.match(aimSource, /mode: activeSpawnMode/);
  assert.match(aimSource, /nextTargets\.filter\(\(entity\) => entity\.kind === "target" && entity\.active\)\.length < maxActiveEndlessTargets/);
  assert.match(aimSource, /activeTargetCountRef\.current = isEndless \? 1 :/);
});

test("advanced screen and app route endless mode through a real runtime with compact HUD", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /mode: "endless-playing"/);
  assert.match(screenSource, /mode: "endless-complete"/);
  assert.match(screenSource, /EndlessRoundPlayer/);
  assert.match(screenSource, /endless-play-screen/);
  assert.match(pageSource, /isEndlessModeUnlocked/);
  assert.match(pageSource, /recordAdvancedEndlessScore/);
  assert.match(pageSource, /completeAdvancedEndlessRound/);
  assert.match(runtimeSource, /ENDLESS_STARTING_REVIVES/);
  assert.match(runtimeSource, /endless-hearts/);
  assert.match(runtimeSource, /endless-heart-token/);
  assert.match(runtimeSource, /getEndlessRoundDifficultyState/);
  assert.match(runtimeSource, /endless-energy-segments/);
  assert.match(runtimeSource, /endless-energy-cell/);
  assert.doesNotMatch(runtimeSource, /endless-difficulty/);
  assert.doesNotMatch(runtimeSource, /getEndlessTestJumpOptions/);
  assert.doesNotMatch(runtimeSource, /测试强度|无尽强度|强度 \{difficultyState\.label\}/);
  assert.match(runtimeSource, /AdvancedReactionRound/);
  assert.match(runtimeSource, /AdvancedAimRound/);
  assert.match(runtimeSource, /AdvancedBrakingRound/);
  assert.match(runtimeSource, /MiniGameEmbeddedStage/);
  assert.match(runtimeSource, /levelOverride/);
  assert.doesNotMatch(runtimeSource, /EndlessReactionGame|EndlessAimGame|EndlessFlappyGame|EndlessKnifeGame/);
  assert.doesNotMatch(cssSource, /\.endless-stage\s*{/);
});

test("endless HUD removes strength controls and uses a ten-segment energy meter", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const hudSource = sourceBetween(runtimeSource, "function EndlessHud", "function EndlessNativeRound");
  const hudCss = sourceBetween(cssSource, ".endless-hud {", ".endless-game-host {");
  const shellSource = sourceBetween(runtimeSource, "<div className=\"endless-shell\"", "</div>\n  );");

  assert.match(hudSource, /activeEnergySegments/);
  assert.match(hudSource, /Array\.from\(\{ length: ENDLESS_ENERGY_THRESHOLD \}/);
  assert.match(hudSource, /endless-energy-segments/);
  assert.match(hudSource, /endless-energy-cell/);
  assert.match(hudSource, /endless-score-readout/);
  assert.match(hudSource, /index < activeEnergySegments/);
  assert.doesNotMatch(hudSource, /difficultyState|endless-difficulty|无尽强度|强度 |进阶 |下一段|强度封顶|测试强度|endless-debug-jumps/);
  assert.doesNotMatch(runtimeSource, /className="endless-debug-panel"/);
  assert.match(shellSource, /<div className="endless-game-host"[\s\S]*<EndlessGameByRound api=\{api\} runSeed=\{runSeed\} segment=\{segment\} shielded=\{api\.shieldCharges > 0\} \/>[\s\S]*<EndlessHud/);
  assert.doesNotMatch(shellSource, /<EndlessHud[\s\S]*<div className="endless-game-host"/);
  assert.match(hudCss, /position:\s*absolute;/);
  assert.match(hudCss, /top:\s*clamp\(/);
  assert.match(hudCss, /z-index:\s*20;/);
  assert.match(hudCss, /grid-template-columns:\s*minmax\(0,\s*136px\) auto;/);
  assert.match(hudCss, /grid-template-rows:\s*auto auto;/);
  assert.match(hudCss, /align-items:\s*start;/);
  assert.match(hudCss, /\.endless-hearts\s*\{/);
  assert.match(hudCss, /grid-template-columns:\s*repeat\(3,\s*24px\);/);
  assert.match(hudCss, /grid-column:\s*1;/);
  assert.match(hudCss, /grid-row:\s*1;/);
  assert.match(hudCss, /\.endless-heart-token\s*\{/);
  assert.match(hudCss, /\.endless-score-readout\s*\{/);
  assert.match(hudCss, /\.endless-energy-console\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*2;[\s\S]*width:\s*136px;/);
  assert.match(hudCss, /\.endless-energy-segments\s*\{/);
  assert.match(hudCss, /grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(hudCss, /\.endless-score-readout\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*1 \/ span 2;/);
  assert.match(hudCss, /\.endless-energy-cell\.active\s*\{/);
  assert.doesNotMatch(hudCss, /\.endless-difficulty|\.endless-debug-panel|endless-difficulty-meter|linear-gradient|backdrop-filter:\s*blur|box-shadow:(?!\s*none)|border:(?!\s*0)/);
});

test("endless mini-game stages remove the top-left mini score capsules", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const fallDownSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const squareJumpSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /const showDoodleMiniScore = !isEndlessRun;/);
  assert.match(flappySource, /const showFlappyMiniScore = !isEndlessRun;/);
  assert.match(fallDownSource, /const showFallDownMiniScore = !isEndlessRun;/);
  assert.match(knifeSource, /const showKnifeMiniScore = !isEndlessRun;/);
  assert.match(squareJumpSource, /const showSquareJumpMiniScore = !isEndlessRun;/);
  for (const source of [doodleSource, flappySource, fallDownSource, knifeSource, squareJumpSource]) {
    assert.match(source, /show[A-Za-z]+MiniScore \? \(\s*<div className="mini-score">/);
  }
});

test("endless native stages remove the top-left mini score capsules", () => {
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(aimSource, /const showAdvancedAimMiniScore = !isEndless;/);
  assert.match(aimSource, /showAdvancedAimMiniScore \? \([\s\S]*<div className="mini-score advanced-aim-score">/);
  assert.match(brakingSource, /const showAdvancedBrakingMiniScore = !endless;/);
  assert.doesNotMatch(brakingSource, /const showAdvancedBrakingMiniScore = !endless \|\| Boolean\(activeRuleHint\);/);
  assert.match(cssSource, /\.endless-game-host \.mini-score\s*{[\s\S]*display:\s*none;/);
});

test("endless play uses the same frame rhythm as base and advanced stages without covering the game", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const screenCss = sourceBetween(cssSource, ".endless-play-screen {", ".endless-shell {");
  const shellCss = sourceBetween(cssSource, ".endless-shell {", ".endless-hud {");
  const hudCss = cssRule(cssSource, ".endless-hud");
  const hostCss = cssRule(cssSource, ".endless-game-host");

  assert.doesNotMatch(screenSource, /endless-progress-track/);
  assert.doesNotMatch(cssSource, /\.endless-progress-track/);
  assert.match(screenCss, /grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assert.match(shellCss, /grid-template-rows:\s*minmax\(0,\s*1fr\);/);
  assert.match(hostCss, /position:\s*relative;/);
  assert.match(hostCss, /border-radius:\s*var\(--radius-sm\);/);
  assert.match(hostCss, /overflow:\s*hidden;/);
  assert.match(cssSource, /\.endless-game-host > \.advanced-aim,\s*\.endless-game-host > \.advanced-reaction-grid,\s*\.endless-game-host > \.advanced-braking,\s*\.endless-game-host \.prototype-stage\s*{[\s\S]*border-radius:\s*inherit;/);
  assert.match(hudCss, /position:\s*absolute;/);
  assert.match(hudCss, /pointer-events:\s*none;/);
  assert.doesNotMatch(cssSource, /\.endless-debug-panel/);
});

test("endless HUD can use gameplay-reported difficulty for mechanics that do not ramp by score", () => {
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");

  assert.match(commonSource, /reportDifficulty: \(difficulty: number\) => void/);
  assert.match(runtimeSource, /reportedDifficulty/);
  assert.match(runtimeSource, /reportedDifficulty: api\.reportedDifficulty/);
  assert.match(knifeSource, /reportDifficulty/);
  assert.match(knifeSource, /getEndlessDifficulty\(\{ progress: effectiveWheelIndex, maxRamp: 12 \}\)/);
});

test("endless games do not show normal finite progress pills that conflict with infinite play", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /showDoodleMiniScore/);
  assert.doesNotMatch(doodleSource, /<span>进度 \{Math\.round\(view\.progressPercent\)\}%<\/span>/);
  assert.match(doodleSource, /showDoodleMiniScore \? \([\s\S]*view\.progressPercent/);
  assert.match(brakingSource, /showAdvancedBrakingMiniScore/);
  assert.match(brakingSource, /!\s*endless[\s\S]{0,120}progress \+ trackMetrics\.runnerWidthPercent/);
});

test("endless runtime stays inside one mounted reusable stage", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(runtimeSource, /setSegmentIndex|setAttemptId|onAdvance/);
  assert.doesNotMatch(runtimeSource, /key=\{segment\.key\}/);
  assert.doesNotMatch(runtimeSource, /miniGameScoreAmount/);
  assert.match(runtimeSource, /endless=\{api\}/);
  assert.match(runtimeSource, /mode="endless"/);
});

test("endless revives continue the current route instead of reusing finite respawn reset", () => {
  const embeddedSource = readFileSync(new URL("../features/mini-games/embedded-stage.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");

  assert.match(embeddedSource, /sharedUnlimitedRespawn = Boolean\(endless\) && mode !== "endless"/);
  assert.doesNotMatch(embeddedSource, /unlimitedRespawn=\{Boolean\(endless\)\}/);
  assert.match(flappySource, /recoverEndlessFlappyFailure/);
  assert.match(doodleSource, /recoverEndlessDoodleFailure/);
  assert.match(fallSource, /recoverEndlessFallDownFailure/);
  assert.doesNotMatch(fallSource, /isEndlessRun && !unlimitedRespawn && recoverFallDownBaseFailure/);
  assert.match(doodleSource, /platform\.finish \? \{ \.\.\.platform, finish: false \}/);
  assert.match(squareSource, /platform\.finish \? \{ \.\.\.platform, finish: false \}/);
  assert.match(fallSource, /platform\.kind === "finish" \? \{ \.\.\.platform, kind: "normal" \}/);
  assert.match(fallSource, /activeFragileTime/);
});

test("endless HUD stays separate, plain, and stage-integrated", () => {
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const hudRule = cssRule(cssSource, ".endless-hud");
  const heartsRule = sourceBetween(cssSource, ".endless-hearts {", ".endless-heart-token {");
  const tokenRule = sourceBetween(cssSource, ".endless-heart-token {", ".endless-heart-token.spent {");
  const scoreRule = cssRule(cssSource, ".endless-score-readout");
  const activeHeartRule = cssRule(cssSource, ".endless-heart-token.active .endless-heart");
  const energyCellRule = cssRule(cssSource, ".endless-energy-cell");
  const activeEnergyCellRule = cssRule(cssSource, ".endless-energy-cell.active");

  assert.match(cssSource, /\.endless-hearts\s*\{/);
  assert.match(cssSource, /\.endless-heart-token\s*\{/);
  assert.match(heartsRule, /grid-template-columns:\s*repeat\(3,\s*24px\);/);
  assert.match(hudRule, /background:\s*transparent;/);
  assert.match(hudRule, /box-shadow:\s*none;/);
  assert.match(hudRule, /backdrop-filter:\s*none;/);
  assert.match(tokenRule, /background:\s*transparent;/);
  assert.match(tokenRule, /border:\s*0;/);
  assert.match(tokenRule, /box-shadow:\s*none;/);
  assert.match(activeHeartRule, /color:\s*#e84d5b;/);
  assert.match(energyCellRule, /background:\s*rgba\(20,\s*184,\s*166,\s*0\.22\);/);
  assert.match(activeEnergyCellRule, /background:\s*#14b8a6;/);
  assert.doesNotMatch(hudRule, /linear-gradient|border-radius|border:(?!\s*0)/);
  assert.doesNotMatch(tokenRule, /linear-gradient|border-radius|backdrop-filter|box-shadow:(?!\s*none)/);
  assert.doesNotMatch(scoreRule, /background|border|box-shadow|backdrop-filter/);
});
