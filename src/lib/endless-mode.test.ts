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

  assert.match(commonSource, /gainEnergy: \(amount\?: number\) => void/);
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
  assert.match(runtimeSource, /className=\{`endless-hud \$\{api\.shieldCharges > 0 \? "shielded" : ""\}`\}/);
  assert.match(runtimeSource, /className="endless-hearts"/);
  assert.match(runtimeSource, /endless-heart-token/);
  assert.match(runtimeSource, /className="endless-energy-meter"/);
  assert.match(runtimeSource, /className="endless-energy-segments"/);
  assert.match(runtimeSource, /endless-energy-cell/);
  assert.doesNotMatch(runtimeSource, /width: `\$\{api\.energyPercent\}%`/);
  assert.doesNotMatch(runtimeSource, /endless-shield/);
  assert.match(flappySource, /endlessRef\.current\?\.gainEnergy\(1\)/);
  assert.match(cssSource, /\.endless-hud\.shielded::after\s*{/);
  assert.match(cssSource, /animation:\s*endless-shield-pulse/);
  assert.match(energyCss, /\.endless-energy-segments\s*{/);
  assert.match(energyCss, /grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(energyCss, /\.endless-energy-cell\.active\s*{[\s\S]*linear-gradient\(180deg,\s*#a7fff0/);
  assert.match(energyCss, /\.endless-hud\.shielded \.endless-energy-cell\.active\s*{[\s\S]*linear-gradient\(180deg,\s*#9cd8ff/);
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
  assert.equal(late.gravityTransition, "smooth-rotate");
  assert.equal(late.segmentWarningGates, 2);
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

test("endless knife starts at ten hits and keeps growing without a cap", () => {
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 0 }).requiredHits, 10);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 4 }).requiredHits > 10, true);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 40 }).requiredHits > getEndlessKnifeConfig({ wheelIndex: 20 }).requiredHits, true);
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
  const fallEarly = getEndlessMiniGameStageConfig({ miniGameId: "fall-down", progress: 0 });
  const fallLate = getEndlessMiniGameStageConfig({ miniGameId: "fall-down", progress: 90 });
  const flappyEarly = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 0 });
  const flappyLate = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 90 });

  assert.equal(doodleEarly.sourceAdvancedLevel, 1);
  assert.equal(doodleLate.sourceAdvancedLevel, 10);
  assert.equal(Number(doodleLate.params.movingObstacleCount) > Number(doodleEarly.params.movingObstacleCount), true);
  assert.equal(Number(doodleLate.params.movingPlatformRatio) > Number(doodleEarly.params.movingPlatformRatio), true);

  assert.equal(squareLate.sourceAdvancedLevel, 10);
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
  assert.equal(Number(flappyEarly.params.collectibleCount) >= 1, true);
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

test("distance-based endless rounds report distance score instead of action count", () => {
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

  for (const source of [doodleSource, squareSource, fallSource, brakingSource]) {
    assert.match(source, /setDistanceScore/);
    assert.doesNotMatch(source, /addScore\(1\)/);
  }
  assert.match(flappySource, /setDistanceScore\(Math\.floor\(Math\.max\(0, current\.progress\) \/ 160\), false\)/);
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
  assert.match(brakingSource, /style\.setProperty\("--difficulty-wave-screen-shift-x"/);
  assert.match(brakingSource, /distance \* -42/);
  assert.doesNotMatch(brakingSource, /ENDLESS_BRAKE_SCENERY_LOOP_PX/);
  assert.doesNotMatch(brakingSource, /--advanced-brake-world-offset/);
  assert.doesNotMatch(brakingSource, /advanced-brake-scenery/);
  assert.match(brakingSource, /hazard\.x - distanceDelta/);
  assert.match(brakingSource, /setDistanceScore\(Math\.floor\(endlessDistanceRef\.current\)\)/);
  assert.doesNotMatch(brakingSource, /setEndlessWorldOffset/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track::before\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track::after\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-scenery\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-scenery-post\s*{/);
  assert.doesNotMatch(trackRule, /background:\s*#fbf7ef/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner\s*{[\s\S]*--difficulty-wave-opacity:\s*0\.38;/);
  assert.doesNotMatch(laneRule, /background:/);
  assert.match(laneRule, /border-bottom:\s*0;/);
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

  assert.match(hudSource, /activeEnergySegments/);
  assert.match(hudSource, /Array\.from\(\{ length: ENDLESS_ENERGY_THRESHOLD \}/);
  assert.match(hudSource, /endless-energy-segments/);
  assert.match(hudSource, /endless-energy-cell/);
  assert.match(hudSource, /endless-score-readout/);
  assert.match(hudSource, /index < activeEnergySegments/);
  assert.doesNotMatch(hudSource, /difficultyState|endless-difficulty|无尽强度|强度 |进阶 |下一段|强度封顶|测试强度|endless-debug-jumps/);
  assert.doesNotMatch(runtimeSource, /className="endless-debug-panel"/);
  assert.match(hudCss, /grid-template-columns:\s*minmax\(118px,\s*auto\) minmax\(126px,\s*1fr\) minmax\(104px,\s*auto\)/);
  assert.match(hudCss, /linear-gradient\(135deg,\s*rgba\(255,\s*253,\s*248,\s*0\.98\),\s*rgba\(246,\s*239,\s*226,\s*0\.97\)\)/);
  assert.match(hudCss, /\.endless-hearts\s*\{/);
  assert.match(hudCss, /grid-template-columns:\s*repeat\(3,\s*34px\);/);
  assert.match(hudCss, /\.endless-heart-token\s*\{/);
  assert.match(hudCss, /\.endless-score-readout\s*\{/);
  assert.match(hudCss, /\.endless-energy-segments\s*\{/);
  assert.match(hudCss, /grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(hudCss, /\.endless-energy-cell\.active\s*\{/);
  assert.doesNotMatch(hudCss, /\.endless-difficulty|\.endless-debug-panel|endless-difficulty-meter/);
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

test("endless play uses the same frame rhythm as base and advanced stages without covering the game", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const screenCss = sourceBetween(cssSource, ".endless-play-screen {", ".endless-shell {");
  const shellCss = sourceBetween(cssSource, ".endless-shell {", ".endless-hud {");
  const hudCss = cssRule(cssSource, ".endless-hud");

  assert.doesNotMatch(screenSource, /endless-progress-track/);
  assert.doesNotMatch(cssSource, /\.endless-progress-track/);
  assert.match(screenCss, /grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assert.match(shellCss, /grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assert.doesNotMatch(hudCss, /position:\s*absolute|inset:/);
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

test("endless hearts stay separate while matching the beige game HUD", () => {
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const hudRule = cssRule(cssSource, ".endless-hud");
  const heartsRule = sourceBetween(cssSource, ".endless-hearts {", ".endless-heart-token {");
  const tokenRule = sourceBetween(cssSource, ".endless-heart-token {", ".endless-heart-token.active {");

  assert.match(cssSource, /\.endless-hearts\s*\{/);
  assert.match(cssSource, /\.endless-heart-token\s*\{/);
  assert.match(heartsRule, /grid-template-columns:\s*repeat\(3,\s*34px\);/);
  assert.match(hudRule, /background:/);
  assert.match(hudRule, /border-radius:\s*8px;/);
  assert.match(hudRule, /rgba\(246,\s*239,\s*226,\s*0\.97\)/);
  assert.match(tokenRule, /border-radius:\s*8px;/);
  assert.match(tokenRule, /rgba\(222,\s*190,\s*138/);
  assert.doesNotMatch(tokenRule, /backdrop-filter:/);
});
