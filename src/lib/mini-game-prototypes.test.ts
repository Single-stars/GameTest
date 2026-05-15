import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MINI_GAME_PROTOTYPES,
  advanceFallDownCamera,
  createMiniGameRunSeed,
  generateDoodleWorldLayout,
  generateFlappyGateLayout,
  generateKnifeForbiddenZones,
  generateKnifeInitialAngles,
  createSquareJumpBaseAdvancePlan,
  createSquareJumpBaseJumpPlan,
  expireFallDownFragilePlatform,
  fitSquareJumpBaseCamera,
  generateSquareJumpPlatformSequence,
  getSquareJumpBasePlatformHeight,
  getSquareJumpChargeAt,
  getSquareJumpGravityMultiplier,
  getSquareJumpBasePlatformX,
  getSquareJumpBasePlayerXOnPlatform,
  getMiniGameLowPowerMode,
  getFlappyInitialPlacement,
  getKnifeShotGeometry,
  getMiniGame,
  getMiniGameLevel,
  getMiniGameLevels,
  getLocalHitAngle,
  getShortestAngleDistance,
  getSineAngularVelocity,
  isLowPowerMiniGameDevice,
  isAngleWithinArc,
  normalizeDegrees,
  resolveFallDownCameraBounds,
  resolveSquareJumpActiveGravity,
  resolveSquareJumpBaseFlyAwayLanding,
  resolveSquareJumpBaseLandingByX,
  resolveKnifeShotOutcome,
  selectSquareJumpVisiblePlatforms,
  shouldSquareJumpDeferLandingResolution,
  sampleSquareJumpBaseAdvanceCamera,
  sampleSquareJumpBaseFlyAway,
  sampleSquareJumpBaseJump,
  sampleSquareJumpBaseRiseIn,
  selectVisibleDoodleHazards,
  selectVisibleDoodlePlatforms,
  selectVisibleFlappyGates,
  type MiniGameId,
} from "./mini-game-prototypes.ts";

const GAME_IDS: MiniGameId[] = ["doodle", "flappy", "knife"];
const ALL_GAME_IDS: MiniGameId[] = ["doodle", "flappy", "knife", "square-jump" as MiniGameId, "fall-down" as MiniGameId];
const SQUARE_JUMP_LEVEL_IDS = [
  "square-jump-base",
  "square-jump-moving-easy",
  "square-jump-moving-normal",
  "square-jump-moving-hard",
  "square-jump-double-easy",
  "square-jump-double-normal",
  "square-jump-double-hard",
  "square-jump-gravity-easy",
  "square-jump-gravity-normal",
  "square-jump-gravity-hard",
  "square-jump-final",
];
const FALL_DOWN_LEVEL_IDS = [
  "fall-down-base",
  "fall-down-moving-easy",
  "fall-down-moving-normal",
  "fall-down-moving-hard",
  "fall-down-fragile-easy",
  "fall-down-fragile-normal",
  "fall-down-fragile-hard",
  "fall-down-danger-easy",
  "fall-down-danger-normal",
  "fall-down-danger-hard",
  "fall-down-final",
];

test("mini-game prototypes expose the original games plus two prototype tests", () => {
  assert.deepEqual(
    MINI_GAME_PROTOTYPES.map((game) => game.id),
    ALL_GAME_IDS,
  );

  assert.equal(getMiniGame("doodle").title, "Doodle Jump 型");
  assert.equal(getMiniGame("flappy").title, "Flappy Bird 型");
  assert.equal(getMiniGame("knife").title, "Knife Hit 型");
  assert.equal(getMiniGame("square-jump" as MiniGameId).title, "方块跃迁");
  assert.equal(getMiniGame("fall-down" as MiniGameId).title, "一路向下");
});

test("each mini-game has 10 advanced levels followed by one base level", () => {
  for (const gameId of GAME_IDS) {
    const levels = getMiniGameLevels(gameId);
    assert.equal(levels.length, 11);
    assert.equal(levels.filter((level) => level.kind === "advanced").length, 10);
    assert.equal(levels[10].kind, "base");
    assert.equal(levels[10].difficulty, "基础");

    assert.deepEqual(
      levels.slice(0, 10).map((level) => level.levelId),
      Array.from({ length: 10 }, (_, index) => `${gameId}-${index + 1}`),
    );
  }
});

test("square jump and fall down expose all required prototype test levels", () => {
  const squareLevels = getMiniGameLevels("square-jump" as MiniGameId);
  const fallLevels = getMiniGameLevels("fall-down" as MiniGameId);

  assert.equal(getMiniGame("square-jump" as MiniGameId).title, "方块跃迁");
  assert.equal(getMiniGame("fall-down" as MiniGameId).title, "一路向下");
  assert.deepEqual(squareLevels.map((level) => level.levelId), SQUARE_JUMP_LEVEL_IDS);
  assert.deepEqual(fallLevels.map((level) => level.levelId), FALL_DOWN_LEVEL_IDS);
  assert.equal(squareLevels.length, 11);
  assert.equal(fallLevels.length, 11);
  assert.equal(squareLevels.length + fallLevels.length, 22);

  assert.deepEqual(
    squareLevels.map((level) => [level.variant, level.difficulty]),
    [
      ["基础关", "基础"],
      ["移动落点", "简单"],
      ["移动落点", "普通"],
      ["移动落点", "困难"],
      ["二段跳跃", "简单"],
      ["二段跳跃", "普通"],
      ["二段跳跃", "困难"],
      ["重力平台", "简单"],
      ["重力平台", "普通"],
      ["重力平台", "困难"],
      ["综合最终关", "最终"],
    ],
  );
  assert.deepEqual(
    fallLevels.map((level) => [level.variant, level.difficulty]),
    [
      ["基础关", "基础"],
      ["移动层板", "简单"],
      ["移动层板", "普通"],
      ["移动层板", "困难"],
      ["脆弱层板", "简单"],
      ["脆弱层板", "普通"],
      ["脆弱层板", "困难"],
      ["危险层板", "简单"],
      ["危险层板", "普通"],
      ["危险层板", "困难"],
      ["综合最终关", "最终"],
    ],
  );
});

test("planet leap copy and levels are removed from prototype tests", () => {
  const joinedCopy = MINI_GAME_PROTOTYPES
    .map((game) => `${game.id} ${game.title} ${game.shortTitle} ${game.summary} ${game.instruction} ${game.levels.map((level) => `${level.levelId} ${level.title} ${level.variant} ${level.description} ${level.goalText}`).join(" ")}`)
    .join("\n");

  assert.doesNotMatch(joinedCopy, /planet-leap|星球跃迁|反向星球|反向发射星球|高速星球|星链终点/);
  assert.match(joinedCopy, /一路向下|移动层板|脆弱层板|危险层板|百层试炼/);
});

test("square jump tuning uses readable camera-scaled targets with heavier jump ranges", () => {
  const squareLevels = getMiniGameLevels("square-jump" as MiniGameId);
  const base = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-base");
  const easyMoving = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-moving-easy");
  const normalMoving = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-moving-normal");
  const hardMoving = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-moving-hard");
  const hardDouble = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-double-hard");
  const final = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-final");

  for (const level of squareLevels) {
    assert.equal(level.params.keepNextPlatformVisible, true);
    assert.equal(level.params.landingKeepsActualX, true);
    assert.equal(level.params.useCameraScale, true);
    assert.equal(level.params.precomputedJumpAnimation, true);
    assert.equal(level.params.sweptLandingCollision, false);
    assert.ok(Number(level.params.currentAnchorRatio) >= 0.22);
    assert.ok(Number(level.params.currentAnchorRatio) <= 0.35);
  assert.ok(Number(level.params.nextMinRatio) >= 0.62);
  assert.ok(Number(level.params.nextMaxRatio) <= 0.84);
    assert.ok(Number(level.params.powerDistanceMin) <= 36);
    assert.ok(Number(level.params.powerDistanceMax) >= 200);
    assert.ok(Number(level.params.powerDistanceMax) <= 390);
  }

  assert.ok(Number(base.params.distanceMin) >= 130);
  assert.ok(Number(base.params.distanceMax) <= 230);
  assert.equal(base.params.minJumpDistance, 28);
  assert.equal(base.params.maxJumpDistance, 220);
  assert.ok(Number(easyMoving.params.distanceMin) >= 140);
  assert.ok(Number(easyMoving.params.distanceMax) <= 225);
  assert.ok(Number(normalMoving.params.distanceMin) >= 150);
  assert.ok(Number(normalMoving.params.distanceMax) <= 225);
  assert.ok(Number(hardMoving.params.distanceMin) >= 160);
  assert.ok(Number(hardMoving.params.distanceMax) <= 210);
  assert.ok(Number(hardMoving.params.platformWidth) >= 68);
  assert.equal(hardDouble.params.doubleJumpEnabled, true);
  assert.equal(hardDouble.params.timedWindow, null);
  assert.equal(hardDouble.params.timedFinalWindow, null);
  assert.ok(Number(final.params.distanceMin) >= 260);
  assert.ok(Number(final.params.distanceMax) <= 430);
  assert.equal(final.params.doubleJumpEnabled, true);
  assert.equal(final.params.timedWindow, null);
  assert.equal(final.params.timedFinalWindow, null);
});

test("square jump standard first-jump power is unified across standard gravity levels", () => {
  const squareLevels = getMiniGameLevels("square-jump" as MiniGameId);
  const doubleFirstMax = Number(getMiniGameLevel("square-jump" as MiniGameId, "square-jump-double-easy").params.powerDistanceMax);

  assert.equal(doubleFirstMax, 220);
  for (const level of squareLevels) {
    assert.equal(Number(level.params.powerDistanceMax), doubleFirstMax, `${level.levelId} should use the same first-jump power scale`);
  }
});

test("square jump gravity multipliers make light and heavy states feel clearly different", () => {
  assert.equal(getSquareJumpGravityMultiplier("normal"), 1);
  assert.ok(getSquareJumpGravityMultiplier("light") >= 1.5);
  assert.ok(getSquareJumpGravityMultiplier("heavy") <= 0.6);
  assert.ok(getSquareJumpGravityMultiplier("light") - getSquareJumpGravityMultiplier("heavy") >= 0.9);
});

test("square jump stage sits lower and tap jumps are short enough for micro adjustment", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const base = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-base");

  assert.match(componentSource, /const SQUARE_JUMP_PLATFORM_Y = STAGE_HEIGHT \* 0\.72/);
  assert.ok(Number(base.params.powerDistanceMin) <= 36);
  assert.ok(Number(base.params.secondPowerDistanceMin) <= 32);
  assert.ok(Number(base.params.targetLandingPadding) <= 10);
});

test("square jump required jumps are extended for longer challenge runs", () => {
  const expectedJumpsByLevelId = new Map([
    ["square-jump-base", 8],
    ["square-jump-moving-easy", 7],
    ["square-jump-moving-normal", 8],
    ["square-jump-moving-hard", 9],
    ["square-jump-double-easy", 5],
    ["square-jump-double-normal", 6],
    ["square-jump-double-hard", 7],
    ["square-jump-gravity-easy", 7],
    ["square-jump-gravity-normal", 8],
    ["square-jump-gravity-hard", 12],
    ["square-jump-final", 15],
  ]);

  for (const [levelId, expectedJumps] of expectedJumpsByLevelId) {
    const level = getMiniGameLevel("square-jump" as MiniGameId, levelId);
    assert.equal(level.params.jumpsRequired, expectedJumps, `${levelId} should require ${expectedJumps} jumps`);
  }
});

test("square jump moving hard mixes rare static platforms into the run", () => {
  const hardMoving = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-moving-hard");
  const platforms = generateSquareJumpPlatformSequence(hardMoving, "moving-hard-static-mix", {
    count: Number(hardMoving.params.jumpsRequired) + 1,
    platformY: 435,
    startX: 120,
    startWidth: 128,
  });
  const targets = platforms.slice(1, Number(hardMoving.params.jumpsRequired) + 1);
  const movingTargets = targets.filter((platform) => platform.moving);
  const staticTargets = targets.filter((platform) => !platform.moving);

  assert.equal(hardMoving.params.jumpsRequired, 9);
  assert.equal(hardMoving.params.movingPlatformCount, 9);
  assert.equal(hardMoving.params.movingStaticEvery, 4);
  assert.equal(targets.length, 9);
  assert.ok(movingTargets.length >= 7);
  assert.ok(staticTargets.length >= 1);
  assert.ok(staticTargets.length <= 2);
  assert.equal(targets[3].moving, false);
});

test("square jump replaces only its 2-1 through 2-3 timed levels with double jump levels", () => {
  const squareLevels = getMiniGameLevels("square-jump" as MiniGameId);
  const secondSet = squareLevels.filter((level) => level.code.startsWith("2-"));
  const joinedCopy = squareLevels
    .map((level) => `${level.levelId} ${level.title} ${level.variant} ${level.description} ${level.goalText}`)
    .join("\n");

  assert.deepEqual(
    secondSet.map((level) => [level.code, level.levelId, level.params.doubleJumpEnabled]),
    [
      ["2-1", "square-jump-double-easy", true],
      ["2-2", "square-jump-double-normal", true],
      ["2-3", "square-jump-double-hard", true],
    ],
  );
  assert.doesNotMatch(joinedCopy, /square-jump-timed|限定连跳|倒计时/);
  assert.equal(getMiniGameLevel("flappy", "flappy-4").code, "2-4");
  assert.equal(getMiniGameLevel("fall-down" as MiniGameId, "fall-down-fragile-easy").code, "2-1");
});

test("square jump double levels use cycling charge while normal levels keep max hold clamping", () => {
  assert.equal(getSquareJumpChargeAt({ elapsedMs: 1500, maxHoldMs: 900, cycling: false }), 1);
  assert.equal(getSquareJumpChargeAt({ elapsedMs: 0, maxHoldMs: 1000, cycling: true }), 0);
  assert.equal(getSquareJumpChargeAt({ elapsedMs: 500, maxHoldMs: 1000, cycling: true }), 0.5);
  assert.equal(getSquareJumpChargeAt({ elapsedMs: 1000, maxHoldMs: 1000, cycling: true }), 1);
  assert.equal(getSquareJumpChargeAt({ elapsedMs: 1500, maxHoldMs: 1000, cycling: true }), 0.5);
  assert.equal(getSquareJumpChargeAt({ elapsedMs: 2000, maxHoldMs: 1000, cycling: true }), 0);
});

test("square jump tuning keeps platforms readable and makes double gaps require the second jump", () => {
  const squareLevels = getMiniGameLevels("square-jump" as MiniGameId);
  for (const level of squareLevels.filter((item) => item.levelId !== "square-jump-base")) {
    assert.ok(Number(level.params.platformWidth) >= 68, `${level.levelId} platform should stay readable`);
  }
  assert.ok(Number(getMiniGameLevel("square-jump" as MiniGameId, "square-jump-base").params.powerDistanceMax) <= 390);

  const doubleLevels = squareLevels.filter((level) => level.params.doubleJumpEnabled === true);
  for (const level of doubleLevels) {
    const firstMaxDistance = Number(level.params.powerDistanceMax);
    const firstMinDistance = Number(level.params.powerDistanceMin);
    const secondMaxDistance = Number(level.params.secondPowerDistanceMax);
    const secondMinDistance = Number(level.params.secondPowerDistanceMin);
    const targetPadding = Number(level.params.targetLandingPadding ?? 12);
    const [currentPlatform, targetPlatform] = generateSquareJumpPlatformSequence(level, `double-gap-${level.levelId}`, {
      count: 2,
      platformY: 435,
      startWidth: 128,
      startX: 120,
    });

    assert.ok(firstMaxDistance <= 250, `${level.levelId} first jump should be capped`);
    assert.ok(secondMaxDistance <= 190, `${level.levelId} second jump should be short`);
    const firstOnly = createSquareJumpBaseJumpPlan({
      currentPlatform,
      holdMs: 900,
      maxHoldMs: 900,
      maxJumpDistance: firstMaxDistance,
      minJumpDistance: firstMinDistance,
      nextPlatform: targetPlatform,
      playerX: currentPlatform.x,
      squareSize: 32,
      targetLandingPadding: targetPadding,
    });
    assert.equal(firstOnly.result, "fall", `${level.levelId} should not be clearable with only the first jump`);
    assert.ok(firstOnly.landingX < targetPlatform.x - targetPlatform.width / 2 - targetPadding);

    const canFinishWithSecond = Array.from({ length: 21 }, (_, index) => index / 20).some((charge) => {
      const second = createSquareJumpBaseJumpPlan({
        currentPlatform,
        holdMs: charge * 900,
        maxHoldMs: 900,
        maxJumpDistance: secondMaxDistance,
        minJumpDistance: secondMinDistance,
        nextPlatform: targetPlatform,
        playerX: firstOnly.jumpEndX,
        playerY: firstOnly.jumpEndY,
        squareSize: 32,
        targetLandingPadding: targetPadding,
      });
      return second.result === "advance";
    });
    assert.equal(canFinishWithSecond, true, `${level.levelId} should be reachable with a controlled second jump`);
  }
});

test("square jump landing gives the target platform a small invisible success buffer", () => {
  const currentPlatform = { id: "current", x: 120, y: 435, width: 100 };
  const nextPlatform = { id: "next", x: 300, y: 435, width: 104 };

  assert.deepEqual(resolveSquareJumpBaseLandingByX({ currentPlatform, landingX: 244, nextPlatform }), {
    landingPlatformId: null,
    result: "fall",
  });
  assert.deepEqual(resolveSquareJumpBaseLandingByX({ currentPlatform, landingX: 244, nextPlatform, targetPadding: 6 }), {
    landingPlatformId: "next",
    result: "advance",
  });
  assert.deepEqual(resolveSquareJumpBaseLandingByX({ currentPlatform, landingX: 238, nextPlatform, targetPadding: 6 }), {
    landingPlatformId: null,
    result: "fall",
  });
});

test("square jump keeps only the base first-three-jump tutorial preview and charge squash feedback", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(componentSource, /showLandingPreview|setShowLandingPreview|square-preview-toggle/);
  assert.doesNotMatch(globalCss, /\.square-preview-toggle|\.square-landing-shadow/);
  assert.match(componentSource, /const tutorialPreviewPlan = level\.levelId === "square-jump-base" && view\.jumps < 3 && view\.state === "charging"/);
  assert.match(componentSource, /className="square-tutorial-landing-preview"/);
  assert.doesNotMatch(componentSource, /square-start-hint/);
  assert.match(componentSource, /chargingSquash/);
  assert.match(componentSource, /translateY\(\$\{chargingSquash\.offsetY\}px\) scaleX\(\$\{chargingSquash\.scaleX\}\) scaleY\(\$\{chargingSquash\.scaleY\}\) rotate\(\$\{view\.playerTurns \* 90\}deg\)/);
  assert.match(componentSource, /scaleY\(\$\{chargingSquash\.scaleY\}\)/);
  assert.doesNotMatch(componentSource, /square-charge-meter/);
  assert.doesNotMatch(globalCss, /\.square-charge-meter/);
  assert.match(globalCss, /transform-origin: 50% 50%/);
  assert.match(globalCss, /\.square-jump-base-player-visual[\s\S]*transition: transform/);
}
);

test("square jump platform visuals distinguish gravity, moving, and finish platforms", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(componentSource, /squarePlatformMark\(platform\)/);
  assert.match(componentSource, /const platformMark = squarePlatformMark\(platform\)/);
  assert.match(componentSource, /\{platformMark \? <span>\{platformMark\}<\/span> : null\}/);
  assert.match(componentSource, /function squarePlatformMark\(platform: SquareJumpBasePlatform\): string \| null/);
  assert.doesNotMatch(componentSource, /if \(platform\.finish\) return "⚑"/);
  assert.doesNotMatch(componentSource, /if \(platform\.moving\) return "↔"/);
  assert.match(globalCss, /\.square-jump-base-platform\.gravity-light \.square-jump-base-platform-top/);
  assert.match(globalCss, /\.square-jump-base-platform\.moving\.gravity-light \.square-jump-base-platform-top/);
  assert.match(globalCss, /\.square-jump-base-platform\.moving\.gravity-light \.square-jump-base-platform-body/);
  assert.match(globalCss, /\.square-jump-base-platform\.gravity-heavy \.square-jump-base-platform-top/);
  assert.match(globalCss, /\.square-jump-base-platform\.moving::before/);
  assert.match(globalCss, /\.square-jump-base-platform\.finish::after/);
  assert.match(globalCss, /\.square-jump-base-platform\.finish \.square-jump-base-platform-top/);
});

test("square jump active gravity persists across normal platforms", () => {
  assert.equal(resolveSquareJumpActiveGravity("heavy", "normal"), "heavy");
  assert.equal(resolveSquareJumpActiveGravity("light", undefined), "light");
  assert.equal(resolveSquareJumpActiveGravity("normal", "light"), "light");
  assert.equal(resolveSquareJumpActiveGravity("light", "heavy"), "heavy");
});

test("fall down levels encode downward platform variants and pressure rules", () => {
  const fallLevels = getMiniGameLevels("fall-down" as MiniGameId);
  const base = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-base");
  const movingEasy = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-moving-easy");
  const movingNormal = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-moving-normal");
  const movingHard = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-moving-hard");
  const fragileEasy = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-fragile-easy");
  const fragileNormal = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-fragile-normal");
  const fragileHard = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-fragile-hard");
  const dangerEasy = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-danger-easy");
  const dangerNormal = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-danger-normal");
  const dangerHard = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-danger-hard");
  const final = getMiniGameLevel("fall-down" as MiniGameId, "fall-down-final");

  for (const level of fallLevels) {
    assert.equal(level.params.prototype, "fall-down");
    assert.ok(Number(level.params.layersRequired) >= 10);
    assert.ok(Number(level.params.platformGapMin) > 0);
    assert.ok(Number(level.params.platformGapMax) >= Number(level.params.platformGapMin));
    assert.ok(Number(level.params.topPressureSpeed) > 0);
  }

  assert.equal(base.params.layersRequired, 10);
  assert.match(base.goalText, /10/);
  assert.equal(base.params.movingPlatformCount, 0);
  assert.equal(base.params.fragilePlatformCount, 0);
  assert.equal(base.params.dangerPlatformCount, 0);
  assert.equal(base.params.playerSpeed, 230);
  assert.equal(base.params.topPressureSpeed, 42);
  assert.equal(base.params.fallingHazardCount, 0);
  assert.equal(movingEasy.params.layersRequired, 14);
  assert.equal(movingEasy.params.topPressureSpeed, 44);
  assert.equal(movingEasy.params.movingPlatformCount, 7);
  assert.equal(movingEasy.params.movingRange, 52);
  assert.equal(movingEasy.params.fallingHazardCount, 0);
  assert.equal(movingEasy.params.ledgePlatformCount, 0);
  assert.equal(movingNormal.params.layersRequired, 18);
  assert.equal(movingNormal.params.topPressureSpeed, 54);
  assert.equal(movingNormal.params.movingPlatformCount, 11);
  assert.equal(movingNormal.params.movingRange, 68);
  assert.equal(movingNormal.params.fallingHazardCount, 2);
  assert.equal(movingHard.params.layersRequired, 22);
  assert.equal(movingHard.params.movingPlatformCount, 16);
  assert.ok(Number(movingHard.params.platformWidth) <= 72);
  assert.equal(movingHard.params.topPressureSpeed, 66);
  assert.equal(movingHard.params.movingRange, 88);
  assert.equal(movingHard.params.fallingHazardCount, 2);
  assert.ok(Number(movingHard.params.ledgePlatformCount) >= 5);
  assert.equal(fragileEasy.params.layersRequired, 14);
  assert.equal(fragileEasy.params.topPressureSpeed, 44);
  assert.equal(fragileEasy.params.fragilePlatformCount, 7);
  assert.equal(fragileEasy.params.fallingHazardCount, 0);
  assert.equal(fragileNormal.params.layersRequired, 18);
  assert.equal(fragileNormal.params.topPressureSpeed, 54);
  assert.equal(fragileNormal.params.fragilePlatformCount, 11);
  assert.equal(fragileNormal.params.fallingHazardCount, 2);
  assert.equal(fragileHard.params.layersRequired, 22);
  assert.equal(fragileHard.params.fragilePlatformCount, 16);
  assert.ok(Number(fragileHard.params.fragileTime) <= 1.1);
  assert.equal(fragileHard.params.topPressureSpeed, 68);
  assert.equal(fragileHard.params.fallingHazardCount, 2);
  assert.ok(Number(fragileHard.params.ledgePlatformCount) >= 5);
  assert.equal(dangerEasy.params.layersRequired, 14);
  assert.equal(dangerEasy.params.topPressureSpeed, 46);
  assert.equal(dangerEasy.params.dangerPlatformCount, 5);
  assert.equal(dangerEasy.params.fallingHazardCount, 0);
  assert.equal(dangerNormal.params.layersRequired, 18);
  assert.equal(dangerNormal.params.topPressureSpeed, 58);
  assert.equal(dangerNormal.params.dangerPlatformCount, 8);
  assert.equal(dangerNormal.params.fallingHazardCount, 2);
  assert.equal(dangerHard.params.layersRequired, 22);
  assert.equal(dangerHard.params.dangerPlatformCount, 11);
  assert.equal(dangerHard.params.topPressureSpeed, 72);
  assert.equal(dangerHard.params.fallingHazardCount, 2);
  assert.ok(Number(dangerHard.params.ledgePlatformCount) >= 5);
  assert.equal(final.params.finalMix, true);
  assert.equal(final.params.layersRequired, 30);
  assert.equal(final.params.topPressureSpeed, 74);
  assert.equal(final.params.movingPlatformCount, 12);
  assert.equal(final.params.fragilePlatformCount, 10);
  assert.equal(final.params.dangerPlatformCount, 10);
  assert.equal(final.params.movingRange, 86);
  assert.equal(final.params.fallingHazardCount, 4);
  assert.equal(final.params.ledgePlatformCount, 8);
  const fallDownGame = getMiniGame("fall-down" as MiniGameId);
  assert.doesNotMatch(`${fallDownGame.summary} ${fallDownGame.instruction} ${base.description}`, /按住/);
});

test("square jump base precomputes landing by x instead of using physics collision", () => {
  const currentPlatform = { id: "current", x: 120, y: 435, width: 128 };
  const nextPlatform = { id: "next", x: 300, y: 435, width: 104 };

  assert.deepEqual(resolveSquareJumpBaseLandingByX({ currentPlatform, landingX: 146, nextPlatform }), {
    landingPlatformId: "current",
    result: "stay",
  });
  assert.deepEqual(resolveSquareJumpBaseLandingByX({ currentPlatform, landingX: 286, nextPlatform }), {
    landingPlatformId: "next",
    result: "advance",
  });
  assert.deepEqual(resolveSquareJumpBaseLandingByX({ currentPlatform, landingX: 232, nextPlatform }), {
    landingPlatformId: null,
    result: "fall",
  });
});

test("square jump base jump plan locks landed jumps to the platform surface", () => {
  const currentPlatform = { id: "current", x: 120, y: 435, width: 128 };
  const nextPlatform = { id: "next", x: 300, y: 435, width: 104 };
  const tap = createSquareJumpBaseJumpPlan({
    currentPlatform,
    holdMs: 30,
    maxHoldMs: 900,
    maxJumpDistance: 360,
    minJumpDistance: 28,
    nextPlatform,
    playerX: 120,
    squareSize: 32,
  });
  const target = createSquareJumpBaseJumpPlan({
    currentPlatform,
    holdMs: 430,
    maxHoldMs: 900,
    maxJumpDistance: 360,
    minJumpDistance: 28,
    nextPlatform,
    playerX: 120,
    squareSize: 32,
  });

  assert.equal(tap.result, "stay");
  assert.ok(tap.landingX > 148);
  assert.ok(tap.landingX < 155);
  assert.equal(tap.jumpEndY, currentPlatform.y - 16);
  assert.ok(tap.arcHeight <= 56);

  assert.equal(target.result, "advance");
  assert.equal(target.jumpEndY, nextPlatform.y - 16);
  assert.ok(target.durationMs >= 320);
  assert.ok(target.durationMs <= 440);

  const end = sampleSquareJumpBaseJump(target, 1.25);
  assert.deepEqual(end, { x: target.jumpEndX, y: target.jumpEndY });
  assert.equal(getSquareJumpBasePlatformHeight({
    camera: { cameraX: 0, cameraY: 320, scale: 1 },
    platformY: 900,
    stageBottom: 640,
    stageHeight: 640,
  }), 0);
});

test("square jump runtime snaps every successful landing to the platform surface", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");

  assert.match(componentSource, /current\.playerY = current\.currentPlatform\.y - PLAYER_SIZE \/ 2/);
  assert.match(componentSource, /current\.playerY = landedPlatform\.y - PLAYER_SIZE \/ 2/);
  assert.match(componentSource, /current\.playerY = current\.nextPlatform\.y - PLAYER_SIZE \/ 2/);
  assert.match(componentSource, /current\.activeGravity = resolveSquareJumpActiveGravity\(current\.activeGravity, landedPlatform\.gravity\)/);
  assert.match(componentSource, /const gravity = view\.activeGravity/);
  assert.match(componentSource, /const gravity = runtime\.activeGravity/);
});

test("square jump visible platform list does not duplicate the final landed platform", () => {
  const currentPlatform = { id: "platform-5", x: 480, y: 435, width: 104 };
  const nextPlatform = { id: "platform-5", x: 480, y: 435, width: 104, finish: true };
  const exitingPlatform = { id: "platform-4", x: 300, y: 435, width: 96 };

  assert.deepEqual(selectSquareJumpVisiblePlatforms(currentPlatform, nextPlatform), [currentPlatform]);
  assert.deepEqual(selectSquareJumpVisiblePlatforms(currentPlatform, { ...nextPlatform, id: "platform-6" }).map((platform) => platform.id), [
    "platform-5",
    "platform-6",
  ]);
  assert.deepEqual(selectSquareJumpVisiblePlatforms(currentPlatform, { ...nextPlatform, id: "platform-6" }, exitingPlatform).map((platform) => platform.id), [
    "platform-5",
    "platform-6",
    "platform-4",
  ]);
});

test("square jump missed jumps keep moving forward along a fly-away arc", () => {
  const plan = createSquareJumpBaseJumpPlan({
    currentPlatform: { id: "current", x: 120, y: 435, width: 90 },
    holdMs: 900,
    maxHoldMs: 900,
    maxJumpDistance: 280,
    minJumpDistance: 60,
    nextPlatform: { id: "next", x: 520, y: 435, width: 70 },
    playerX: 120,
    squareSize: 32,
  });

  assert.equal(plan.result, "fall");
  const justBeforeMiss = sampleSquareJumpBaseJump(plan, 0.98);
  const missed = sampleSquareJumpBaseFlyAway(plan, 1.35);
  assert.ok(missed.x > plan.jumpEndX);
  assert.ok(missed.y > plan.jumpEndY);
  const naturalStart = sampleSquareJumpBaseFlyAway(plan, 1.02);
  assert.ok(naturalStart.x > plan.jumpEndX);
  assert.ok(naturalStart.x - plan.jumpEndX <= plan.jumpEndX - justBeforeMiss.x + 0.001);
  assert.ok(naturalStart.y - plan.jumpEndY < plan.arcHeight * 0.1);
});

test("square jump fly-away can still land if the natural path reaches the target platform", () => {
  const targetPlatform = { id: "next", x: 306, y: 435, width: 32 };
  const plan = createSquareJumpBaseJumpPlan({
    currentPlatform: { id: "current", x: 120, y: 435, width: 90 },
    holdMs: 900,
    maxHoldMs: 900,
    maxJumpDistance: 160,
    minJumpDistance: 160,
    nextPlatform: targetPlatform,
    playerX: 120,
    squareSize: 32,
  });

  assert.equal(plan.result, "fall");
  assert.deepEqual(resolveSquareJumpBaseFlyAwayLanding({
    catchDepth: 40,
    plan,
    progress: 1.1,
    squareSize: 32,
    targetPadding: 4,
    targetPlatform,
  }), {
    landingPlatformId: "next",
    result: "advance",
  });
  assert.equal(resolveSquareJumpBaseFlyAwayLanding({
    catchDepth: 24,
    plan,
    progress: 1.42,
    squareSize: 32,
    targetPadding: 4,
    targetPlatform,
  }), null);
});

test("square jump base advance moves the camera while world objects stay in place", () => {
  const cameraStart = { cameraX: 260, cameraY: 505, scale: 0.98 };
  const cameraEnd = { cameraX: 480, cameraY: 505, scale: 0.82 };
  const plan = createSquareJumpBaseAdvancePlan({
    cameraEnd,
    cameraStart,
    stageHeight: 640,
  });

  assert.equal(plan.durationMs, 760);
  assert.equal(plan.riseDurationMs, 620);
  assert.equal(plan.nextPlatformStartVisualOffsetY, 160);
  assert.deepEqual(sampleSquareJumpBaseAdvanceCamera(plan, 0), cameraStart);
  assert.deepEqual(sampleSquareJumpBaseAdvanceCamera(plan, 1), cameraEnd);
  const midCamera = sampleSquareJumpBaseAdvanceCamera(plan, 0.5);
  assert.equal(midCamera.cameraX, 370);
  assert.equal(midCamera.cameraY, 505);
  assert.ok(Math.abs(midCamera.scale - 0.9) < 0.0001);
  assert.equal("playerEndX" in plan, false);
  assert.equal("currentPlatformEndX" in plan, false);
  assert.equal("nextPlatformEndX" in plan, false);
  assert.equal(sampleSquareJumpBaseRiseIn(plan, 0), 160);
  assert.equal(sampleSquareJumpBaseRiseIn(plan, 1), 0);
});

test("square jump base camera fits only the current platform, target platform, and player", () => {
  const camera = fitSquareJumpBaseCamera({
    currentPlatform: { id: "current", x: 120, y: 420, width: 120 },
    nextPlatform: { id: "next", x: 365, y: 410, width: 100 },
    playerX: 148,
    stageBottom: 640,
    stageHeight: 640,
    stageWidth: 360,
  });

  assert.ok(camera.scale >= 0.75);
  assert.ok(camera.scale <= 1.15);
  assert.ok(camera.cameraX > 190);
  assert.ok(camera.cameraX < 310);
  assert.ok(camera.cameraY > 430);
});

test("square jump camera includes moving platform range", () => {
  const camera = fitSquareJumpBaseCamera({
    currentPlatform: { id: "current", x: 200, y: 420, width: 80, range: 80 },
    nextPlatform: { id: "next", x: 430, y: 420, width: 70, range: 60 },
    playerX: 200,
    stageBottom: 640,
    stageHeight: 640,
    stageWidth: 360,
  });

  assert.equal(camera.cameraX, 302.5);
  assert.ok(camera.scale < 0.75);
});

test("square jump camera can zoom out enough for mobile moving platform extremes", () => {
  const currentPlatform = { id: "current", x: 84, y: 435, width: 72, range: 118 };
  const nextPlatform = { id: "next", x: 730, y: 435, width: 64, range: 132 };
  const camera = fitSquareJumpBaseCamera({
    currentPlatform,
    nextPlatform,
    playerX: currentPlatform.x,
    stageBottom: 640,
    stageHeight: 640,
    stageWidth: 360,
  });
  const minX = currentPlatform.x - currentPlatform.range - currentPlatform.width / 2;
  const maxX = nextPlatform.x + nextPlatform.range + nextPlatform.width / 2;
  const screenLeft = 360 / 2 + (minX - camera.cameraX) * camera.scale;
  const screenRight = 360 / 2 + (maxX - camera.cameraX) * camera.scale;

  assert.ok(camera.scale < 0.75);
  assert.ok(screenLeft >= 0);
  assert.ok(screenRight <= 360);
});

test("square jump current platform body extends to the camera bottom after scaling", () => {
  const camera = { cameraX: 300, cameraY: 512, scale: 0.58 };
  const platformY = 435;
  const height = getSquareJumpBasePlatformHeight({
    camera,
    platformY,
    stageBottom: 640,
    stageHeight: 640,
  });
  const screenBottom = 640 / 2 + (platformY + height - camera.cameraY) * camera.scale;

  assert.ok(height > 640 - platformY);
  assert.ok(screenBottom >= 640);
});

test("square jump target platform also extends to the camera bottom when it rises in", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");

  assert.match(componentSource, /getSquareJumpBasePlatformHeight\(\{[\s\S]*platformY:\s*platform\.y \+ visualOffsetY/);
  assert.doesNotMatch(componentSource, /index === 0[\s\S]*\? getSquareJumpBasePlatformHeight[\s\S]*: SQUARE_BASE_STAGE_BOTTOM - platform\.y/);
});

test("square jump generated platform sequence is random per challenge but repeatable by seed", () => {
  const level = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-moving-normal");
  const first = generateSquareJumpPlatformSequence(level, "run-a", { count: 6, platformY: 435, startX: 120 });
  const same = generateSquareJumpPlatformSequence(level, "run-a", { count: 6, platformY: 435, startX: 120 });
  const different = generateSquareJumpPlatformSequence(level, "run-b", { count: 6, platformY: 435, startX: 120 });
  const shape = (platforms: typeof first) => platforms.map((platform) => [
    Math.round(platform.x),
    Math.round(platform.width),
    Math.round((platform.phase ?? 0) * 100),
    Math.round(platform.range ?? 0),
  ]);

  assert.deepEqual(shape(first), shape(same));
  assert.notDeepEqual(shape(first), shape(different));
});

test("square jump every level changes platform layout across challenge seeds", () => {
  for (const level of getMiniGameLevels("square-jump" as MiniGameId)) {
    const first = generateSquareJumpPlatformSequence(level, createMiniGameRunSeed(level.levelId, "same-run-key"), {
      count: Number(level.params.jumpsRequired) + 1,
      platformY: 435,
      startX: 120,
    });
    const second = generateSquareJumpPlatformSequence(level, createMiniGameRunSeed(level.levelId, "same-run-key"), {
      count: Number(level.params.jumpsRequired) + 1,
      platformY: 435,
      startX: 120,
    });
    const shape = (platforms: typeof first) => platforms.map((platform) => [
      Math.round(platform.x),
      Math.round(platform.width),
      Math.round((platform.phase ?? 0) * 100),
      Math.round(platform.range ?? 0),
      Math.round((platform.speed ?? 0) * 100),
    ]);

    assert.notDeepEqual(shape(first), shape(second), `${level.levelId} should vary on each challenge seed`);
  }
});

test("square jump final remains reachable after inherited gravity changes", () => {
  const level = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-final");
  const targetPadding = Number(level.params.targetLandingPadding ?? 12);
  const firstMax = Number(level.params.powerDistanceMax ?? level.params.maxJumpDistance);
  const secondMax = Number(level.params.secondPowerDistanceMax ?? 0);

  for (let seedIndex = 0; seedIndex < 24; seedIndex += 1) {
    const platforms = generateSquareJumpPlatformSequence(level, `final-reach-${seedIndex}`, {
      count: Number(level.params.jumpsRequired) + 1,
      platformY: 435,
      startX: 120,
    });
    let activeGravity: "normal" | "light" | "heavy" = "normal";

    for (let index = 0; index < platforms.length - 1; index += 1) {
      const currentPlatform = platforms[index];
      const nextPlatform = platforms[index + 1];
      const gravityMultiplier = getSquareJumpGravityMultiplier(activeGravity);
      const maxLandingX = currentPlatform.x + (firstMax + secondMax) * gravityMultiplier;
      const nextLeft = nextPlatform.x - (nextPlatform.range ?? 0) - nextPlatform.width / 2 - targetPadding;

      assert.ok(nextLeft <= maxLandingX, `${level.levelId} seed ${seedIndex} platform ${index} should be reachable with two jumps under ${activeGravity}`);
      activeGravity = resolveSquareJumpActiveGravity(activeGravity, nextPlatform.gravity);
    }
  }
});

test("square jump non-double levels can reach the next generated platform at max charge", () => {
  const levels = getMiniGameLevels("square-jump" as MiniGameId).filter((level) => level.params.doubleJumpEnabled !== true);

  for (const level of levels) {
    const platforms = generateSquareJumpPlatformSequence(level, `reach-${level.levelId}`, {
      count: Number(level.params.jumpsRequired) + 1,
      platformY: 435,
      startX: 120,
    });
    let activeGravity: "normal" | "light" | "heavy" = "normal";

    for (let index = 0; index < platforms.length - 1; index += 1) {
      const currentPlatform = platforms[index];
      const nextPlatform = platforms[index + 1];
      const gravityMultiplier = getSquareJumpGravityMultiplier(activeGravity);
      const targetPadding = Number(level.params.targetLandingPadding ?? 12);
      const minLandingX = currentPlatform.x + Number(level.params.powerDistanceMin ?? level.params.minJumpDistance) * gravityMultiplier;
      const maxLandingX = currentPlatform.x + Number(level.params.powerDistanceMax ?? level.params.maxJumpDistance) * gravityMultiplier;
      const nextLeft = nextPlatform.x - (nextPlatform.range ?? 0) - nextPlatform.width / 2 - targetPadding;
      const nextRight = nextPlatform.x + (nextPlatform.range ?? 0) + nextPlatform.width / 2 + targetPadding;

      assert.ok(nextLeft <= maxLandingX, `${level.levelId} platform ${index} should not be beyond max charge`);
      assert.ok(nextRight >= minLandingX, `${level.levelId} platform ${index} should not be before min charge`);
      activeGravity = resolveSquareJumpActiveGravity(activeGravity, nextPlatform.gravity);
    }
  }
});

test("square jump moving current platform carries the landed player offset", () => {
  const platform = { id: "moving", moving: true, x: 300, y: 435, width: 90, range: 48, speed: 1.6, phase: 0.4 };
  const offset = -17;
  const firstPlatformX = getSquareJumpBasePlatformX(platform, 0.4);
  const nextPlatformX = getSquareJumpBasePlatformX(platform, 1.1);

  assert.notEqual(firstPlatformX, nextPlatformX);
  assert.equal(getSquareJumpBasePlayerXOnPlatform({ offset, platform, time: 0.4 }), firstPlatformX + offset);
  assert.equal(getSquareJumpBasePlayerXOnPlatform({ offset, platform, time: 1.1 }), nextPlatformX + offset);
});

test("square jump lets charging start during camera advance without cancelling smooth camera motion", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(componentSource, /finishSquareJumpAdvanceForImmediateCharge/);
  assert.match(componentSource, /function updateSquareJumpAdvanceAnimation\(current: SquareJumpUnifiedRuntime\)/);
  assert.match(componentSource, /if \(current\.advancePlan\) updateSquareJumpAdvanceAnimation\(current\);/);
  assert.match(componentSource, /if \(current\.state === "advancing"\) current\.state = "idle";/);
  assert.match(componentSource, /const canGroundCharge = current\.state === "idle" \|\| current\.state === "advancing"/);
  assert.match(componentSource, /if \(!current\.started\) \{\s*current\.started = true;\s*current\.timer = null;\s*\}/);
  assert.doesNotMatch(componentSource, /className="prototype-start-button"[\s\S]*start\(\)/);
});

test("square jump base rendering anchors position with left and top instead of shell transforms", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(componentSource, /className=\{`square-jump-base-player-shell/);
  assert.match(componentSource, /left: `\$\{view\.playerX - PLAYER_SIZE \/ 2\}px`/);
  assert.match(componentSource, /top: `\$\{view\.playerY - PLAYER_SIZE \/ 2\}px`/);
  assert.match(componentSource, /className=\{`square-jump-base-platform/);
  assert.match(componentSource, /top: `\$\{platform\.y \+ visualOffsetY\}px`/);
  assert.match(globalCss, /\.square-jump-base-player-shell[\s\S]*transition: none;[\s\S]*animation: none;/);
  assert.match(globalCss, /\.square-jump-base-player-shell\.landed[\s\S]*animation: none;/);
});

test("square jump runtime supports double jump hover charging and 90 degree turns", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(componentSource, /runSeed:\s*string/);
  assert.match(componentSource, /<SquareJumpPrototype[\s\S]*runSeed=\{runSeed\}/);
  assert.match(componentSource, /"airCharging"/);
  assert.match(componentSource, /doubleJumpUsed/);
  assert.match(componentSource, /getSquareJumpChargeAt\(\{[\s\S]*cycling:\s*current\.state === "airCharging" && cyclingCharge/);
  assert.doesNotMatch(componentSource, /showLandingPreview/);
  assert.match(componentSource, /const canAirCharge = doubleJumpEnabled && \(current\.state === "jumping" \|\| current\.state === "falling"\)/);
  assert.match(componentSource, /current\.playerTurns \+= 1/);
  assert.match(componentSource, /rotate\(\$\{view\.playerTurns \* 90\}deg\)/);
  assert.match(componentSource, /sampleSquareJumpBaseFlyAway/);
  assert.doesNotMatch(componentSource, /current\.playerY \+= \(260 \+ fallingElapsed \* 780\) \* delta/);
  assert.doesNotMatch(globalCss, /\.square-jump-base-player-visual[\s\S]*transition: none;[\s\S]*transform: none;/);
});

test("square jump double level defers miss resolution until after the second jump", () => {
  assert.equal(shouldSquareJumpDeferLandingResolution({
    doubleJumpEnabled: true,
    doubleJumpUsed: false,
    result: "fall",
  }), true);
  assert.equal(shouldSquareJumpDeferLandingResolution({
    doubleJumpEnabled: true,
    doubleJumpUsed: true,
    result: "fall",
  }), false);
  assert.equal(shouldSquareJumpDeferLandingResolution({
    doubleJumpEnabled: false,
    doubleJumpUsed: false,
    result: "fall",
  }), false);
  assert.equal(shouldSquareJumpDeferLandingResolution({
    doubleJumpEnabled: true,
    doubleJumpUsed: false,
    result: "advance",
  }), false);
});

test("square jump base advance keeps two platforms visible and advances by camera only", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const backgroundStyleSource = componentSource.slice(
    componentSource.indexOf("function squareProgressBackgroundStyle"),
    componentSource.indexOf("type SquareJumpUnifiedState"),
  );

  assert.doesNotMatch(componentSource, /SquareJumpBasePrecomputedPrototype/);
  assert.doesNotMatch(componentSource, /type SquareJumpRuntime/);
  assert.doesNotMatch(componentSource, /sceneOffsetX|playerWorldX|squareRenderX|createSquareJumpRuntime|makeSquareJumpView/);
  assert.match(componentSource, /if \(gameId === "square-jump"\) \{\s*return <SquareJumpPrototype/);
  assert.match(componentSource, /const platforms = selectSquareJumpVisiblePlatforms\(view\.currentPlatform, view\.nextPlatform, view\.exitingPlatform\);/);
  assert.match(componentSource, /current\.camera = sampleSquareJumpBaseAdvanceCamera\(current\.advancePlan, advanceProgress\);/);
  assert.match(componentSource, /exitingPlatform: SquareJumpBasePlatform \| null/);
  assert.match(componentSource, /current\.exitingPlatform = leavingPlatform;/);
  assert.match(componentSource, /current\.exitingVisualOffsetY = current\.advancePlan\.nextPlatformStartVisualOffsetY \* 2\.1/);
  assert.match(componentSource, /className="square-progress-background"/);
  assert.match(componentSource, /style=\{squareProgressBackgroundStyle\(view\.camera\)\}/);
  assert.match(backgroundStyleSource, /backgroundPosition:/);
  assert.doesNotMatch(backgroundStyleSource, /camera\.cameraX %/);
  assert.doesNotMatch(backgroundStyleSource, /transform:/);
  assert.match(globalCss, /\.square-progress-background/);
  assert.match(globalCss, /\.square-jump-base-platform\.exiting/);
  assert.doesNotMatch(componentSource, /current\.currentPlatform\.x =/);
  assert.doesNotMatch(componentSource, /current\.nextPlatform\.x =/);
  assert.doesNotMatch(componentSource, /current\.playerX = current\.advancePlan\.playerEndX/);
});

test("square jump base misses respawn on the original next platform before forced advance", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const squareJumpSource = componentSource.slice(componentSource.indexOf("type SquareJumpUnifiedState"), componentSource.indexOf("function fallDownPlatformKindBag"));

  assert.match(squareJumpSource, /failures: number;/);
  assert.match(squareJumpSource, /respawnUntil: number;/);
  assert.match(squareJumpSource, /function recoverSquareJumpBaseMiss\(current: SquareJumpUnifiedRuntime, reason: string\)/);
  assert.match(squareJumpSource, /const failures = current\.failures \+ 1;/);
  assert.match(squareJumpSource, /if \(failures >= BASE_FAILURE_LIMIT\)/);
  assert.match(squareJumpSource, /失败达到 3 次，进入下一关/);
  assert.match(squareJumpSource, /const landedPlatform = \{ \.\.\.current\.nextPlatform \};/);
  assert.match(squareJumpSource, /current\.playerX = getSquareJumpBasePlatformX\(landedPlatform, current\.time\);/);
  assert.match(squareJumpSource, /current\.currentPlatform = landedPlatform;/);
  assert.match(squareJumpSource, /current\.respawnUntil = current\.time \+ 1\.1;/);
  assert.match(squareJumpSource, /mode === "base" && recoverSquareJumpBaseMiss\(current, "掉下去了"\)/);
  assert.match(squareJumpSource, /failures: latest\.failures,/);
  assert.match(squareJumpSource, /view\.time < view\.respawnUntil \? "respawn-warning" : ""/);
});

test("mini game prototype restart advances the run seed every time", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");

  assert.match(componentSource, /const restart = useCallback\(\(\) => setRunId\(\(current\) => current \+ 1\), \[\]\);/);
  assert.doesNotMatch(componentSource, /setRunId\(Date\.now\(\)\)/);
});

test("square jump library removes obsolete physics landing helpers", () => {
  const prototypeConfigSource = readFileSync(new URL("mini-game-prototypes.ts", import.meta.url), "utf8");

  assert.doesNotMatch(prototypeConfigSource, /export function createSquareJumpBaseLaunch/);
  assert.doesNotMatch(prototypeConfigSource, /export function resolveSquareJumpBaseLanding\(/);
  assert.doesNotMatch(prototypeConfigSource, /export function resolveSquareJumpBaseProgress/);
  assert.doesNotMatch(prototypeConfigSource, /type SquareJumpBasePoint/);
});

test("fall down base camera moves at constant speed and only top pressure fails by default", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));

  assert.equal(advanceFallDownCamera({ cameraY: 200, delta: 0.5, speed: 80 }), 240);
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 187, cameraY: 220, stageHeight: 640, squareSize: 32 }), {
    status: "failed",
    reason: "too-slow",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 900, cameraY: 220, stageHeight: 640, squareSize: 32 }), {
    status: "playing",
    reason: "",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 900, cameraY: 220, stageHeight: 640, squareSize: 32, bottomFailLine: 660 }), {
    status: "failed",
    reason: "too-deep",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 891, cameraY: 220, stageHeight: 640, squareSize: 32, bottomFailLine: 672 }), {
    status: "playing",
    reason: "",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 900, cameraY: 220, stageHeight: 640, squareSize: 32, bottomFailLine: 672 }), {
    status: "failed",
    reason: "too-deep",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 480, cameraY: 220, stageHeight: 640, squareSize: 32 }), {
    status: "playing",
    reason: "",
  });
  assert.match(fallDownSource, /bottomFailLine: STAGE_HEIGHT \+ PLAYER_SIZE/);
});

test("fall down fragile platforms expire without directly failing the player", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.deepEqual(expireFallDownFragilePlatform({ kind: "fragile", steppedAt: 1, now: 2.4, fragileTime: 1.2 }), {
    broken: true,
    directFailure: false,
  });
  assert.deepEqual(expireFallDownFragilePlatform({ kind: "normal", steppedAt: 1, now: 4, fragileTime: 1.2 }), {
    broken: false,
    directFailure: false,
  });
  assert.match(fallDownSource, /if \(screenY < -80 \|\| screenY > STAGE_HEIGHT \+ 80 \|\| platform\.broken\) return null;/);
  assert.doesNotMatch(fallDownSource, /fragileRatio|fall-crack|--fragile-ratio|fragileRatio > 0\.72/);
  assert.match(fallDownSource, /const fragileTime = numberParam\(level\.params, "fragileTime", 1\.2\);/);
  assert.match(fallDownSource, /const fragileWarning = platform\.kind === "fragile" && platform\.steppedAt !== null && view\.time - platform\.steppedAt >= Math\.max\(0, fragileTime - 0\.45\);/);
  assert.match(fallDownSource, /fragileWarning \? "fragile-warning" : ""/);
  assert.doesNotMatch(globalCss, /\.fall-crack/);
  assert.match(globalCss, /\.fall-platform\.kind-fragile \.fall-platform-top \{\s*background: #c7e1d1;\s*\}/);
  assert.match(globalCss, /\.fall-platform\.fragile-warning \.fall-platform-top/);
  assert.match(globalCss, /@keyframes fall-fragile-warning/);
});

test("fall down moves only while pressing a side and skips landing animation", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));

  assert.doesNotMatch(fallDownSource, /prototype-start-button/);
  assert.doesNotMatch(fallDownSource, /prototype-start-hint fall-start-hint/);
  assert.doesNotMatch(fallDownSource, /按住左半屏|按住右半屏|按住左右半屏|按住屏幕/);
  assert.doesNotMatch(fallDownSource, /onPointerMove=\{setDirectionFromPointer\}/);
  assert.doesNotMatch(fallDownSource, /current\.vx \+= current\.inputDirection \* 1120 \* delta/);
  assert.doesNotMatch(fallDownSource, /if \(current\.inputDirection === 0\) current\.vx \*= 0\.84/);
  assert.doesNotMatch(fallDownSource, /fall-down-player-shell \$\{view\.feedback \? "landed" : ""\}/);
  assert.doesNotMatch(fallDownSource, /prototype-feedback/);
  assert.doesNotMatch(fallDownSource, /current\.feedback = platform\.id === requiredLayers/);
  assert.doesNotMatch(fallDownSource, /feedbackUntil/);
  assert.match(fallDownSource, /function chooseFallDownDirection\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(fallDownSource, /current\.started = true;/);
  assert.match(fallDownSource, /current\.inputDirection = chooseFallDownDirection\(event\);/);
  assert.match(fallDownSource, /const stopDirection = useCallback/);
  assert.match(fallDownSource, /current\.inputDirection = 0;/);
  assert.match(fallDownSource, /current\.vx = 0;/);
  assert.match(fallDownSource, /onPointerUp=\{stopDirection\}/);
  assert.match(fallDownSource, /onPointerLeave=\{stopDirection\}/);
  assert.match(fallDownSource, /onPointerCancel=\{stopDirection\}/);
  assert.match(fallDownSource, /current\.vy = 0;/);
  assert.match(fallDownSource, /const previousTime = current\.time;/);
  assert.match(fallDownSource, /const carriedPlatform = current\.platforms\.find/);
  assert.match(fallDownSource, /fallPlatformX\(carriedPlatform, current\.time\) - previousPlatformX/);
  assert.match(fallDownSource, /current\.playerX = clamp\(current\.playerX \+ current\.inputDirection \* fallDownPlayerSpeed \* delta/);
});

test("fall down base failures respawn on a safe platform at the current camera midpoint", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const fallDownSource = componentSource.slice(componentSource.indexOf("type FallDownPlatformKind"), componentSource.indexOf("function makeDoodleWorld"));

  assert.match(fallDownSource, /failures: number;/);
  assert.match(fallDownSource, /respawnUntil: number;/);
  assert.match(fallDownSource, /function recoverFallDownBaseFailure\(current: FallDownRuntime, reason: string\)/);
  assert.match(fallDownSource, /const failures = current\.failures \+ 1;/);
  assert.match(fallDownSource, /if \(failures >= BASE_FAILURE_LIMIT\)/);
  assert.match(fallDownSource, /失败达到 3 次，进入下一关/);
  assert.match(fallDownSource, /const platformY = current\.cameraY \+ STAGE_HEIGHT \* 0\.5;/);
  assert.match(fallDownSource, /id: -2000 - failures,/);
  assert.match(fallDownSource, /kind: "normal",/);
  assert.match(fallDownSource, /current\.platforms\.unshift\(respawnPlatform\);/);
  assert.match(fallDownSource, /current\.playerY = respawnPlatform\.y - PLAYER_SIZE \/ 2;/);
  assert.match(fallDownSource, /current\.respawnUntil = current\.time \+ 1\.1;/);
  assert.match(fallDownSource, /mode === "base" && recoverFallDownBaseFailure\(current, reason\)/);
  assert.match(fallDownSource, /failures: latest\.failures,/);
  assert.match(fallDownSource, /view\.time < view\.respawnUntil \? "respawn-warning" : ""/);
});

test("fall down platform layout varies by run seed", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const fallDownSource = componentSource.slice(componentSource.indexOf("function fallDownPlatformKindBag"), componentSource.indexOf("function makeDoodleWorld"));

  assert.match(componentSource, /createSeededRandom/);
  assert.match(componentSource, /<FallDownPrototype[\s\S]*runSeed=\{runSeed\}/);
  assert.match(componentSource, /function FallDownPrototype\(\{[\s\S]*runSeed,/);
  assert.match(componentSource, /runSeed:\s*string;/);
  assert.match(fallDownSource, /createSeededRandom\(`\$\{level\.levelId\}:\$\{runSeed\}:fall-down-platforms`\)/);
  assert.match(componentSource, /function makeFallDownNoisePoints\(rand: \(\) => number, count: number\)/);
  assert.match(componentSource, /function fallDownSmoothNoise\(points: number\[\], position: number\)/);
  assert.match(fallDownSource, /function makeFallDownPlatforms\(level: MiniGameLevelConfig, runSeed: string\): FallDownPlatform\[\]/);
  assert.match(fallDownSource, /const kindBag = fallDownPlatformKindBag\(level, layersRequired, rand\);/);
  assert.match(fallDownSource, /kindBag\.splice\(Math\.floor\(rand\(\) \* kindBag\.length\), 1\)\[0\]/);
  assert.match(fallDownSource, /const gapNoise = fallDownSmoothNoise\(gapNoisePoints, index \* 0\.61\);/);
  assert.match(fallDownSource, /const xNoise = fallDownSmoothNoise\(xNoisePoints, index \* 0\.47\);/);
  assert.match(fallDownSource, /const widthNoise = fallDownSmoothNoise\(widthNoisePoints, index \* 0\.53\);/);
  assert.match(fallDownSource, /const lanePattern = \[0\.16, 0\.84, 0\.5\];/);
  assert.match(fallDownSource, /const lane = \(index \+ laneOffset\) % lanePattern\.length;/);
  assert.match(fallDownSource, /const spreadTargetRatio = clamp\(lanePattern\[lane\] \+ \(xNoise - 0\.5\) \* 0\.3, 0\.1, 0\.9\);/);
  assert.match(fallDownSource, /phase: rand\(\) \* Math\.PI \* 2/);
  assert.match(fallDownSource, /createFallDownRuntime\(level: MiniGameLevelConfig, runSeed: string\)/);
  assert.match(fallDownSource, /makeFallDownPlatforms\(level, runSeed\)/);
  assert.match(fallDownSource, /createFallDownRuntime\(level, runSeed\)/);
});

test("fall down adds falling hazards and L platforms without triple danger layers", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const fallDownSource = componentSource.slice(componentSource.indexOf("function fallDownPlatformKindBag"), componentSource.indexOf("function makeDoodleWorld"));

  assert.match(componentSource, /type FallDownPlatformShape = "flat" \| "l-left" \| "l-right"/);
  assert.match(componentSource, /type FallDownFallingHazard = \{/);
  assert.match(componentSource, /fallingHazards: FallDownFallingHazard\[\]/);
  assert.match(componentSource, /function constrainFallDownDangerRuns\(kinds: FallDownPlatformKind\[\], rand: \(\) => number\)/);
  assert.match(componentSource, /dangerRun >= 3/);
  assert.match(fallDownSource, /function makeFallDownFallingHazards\(level: MiniGameLevelConfig, runSeed: string\): FallDownFallingHazard\[\]/);
  assert.match(fallDownSource, /function fallDownFallingHazardScreenY\(hazard: FallDownFallingHazard, time: number\)/);
  assert.match(fallDownSource, /function fallDownFallingHazardX\(hazard: FallDownFallingHazard, time: number\)/);
  assert.match(fallDownSource, /fallingHazards: makeFallDownFallingHazards\(level, runSeed\)/);
  assert.match(fallDownSource, /for \(const hazard of current\.fallingHazards\)/);
  assert.match(fallDownSource, /fall-down-falling-hazard/);
  assert.match(fallDownSource, /fall-platform-leg/);
  assert.match(fallDownSource, /ledgePlatformCount/);
  assert.doesNotMatch(fallDownSource, /leftGuard|rightGuard/);
  assert.match(fallDownSource, /left: platformX - platform\.width \/ 2,/);
  assert.match(fallDownSource, /right: platformX \+ platform\.width \/ 2,/);
  assert.match(fallDownSource, /resolveFallDownLedgeCollision\(platform, platformX, current\.playerX, previousPlayerX, current\.playerY\)/);
  assert.match(fallDownSource, /const isStandingOnPlatform = Math\.abs\(playerY \+ PLAYER_SIZE \/ 2 - platform\.y\) <= 0\.75;/);
  assert.match(fallDownSource, /if \(!isStandingOnPlatform\) return playerX;/);
  assert.match(fallDownSource, /platformX - platform\.width \/ 2 - \(FALL_DOWN_LEDGE_WIDTH - 2\)/);
  assert.match(fallDownSource, /platformX \+ platform\.width \/ 2 - 2/);
  assert.match(fallDownSource, /rand\(\) < 0\.5 \? "l-left" : "l-right"/);
  assert.match(fallDownSource, /platform\.shape !== "flat" && platform\.id === view\.currentPlatformId/);
  assert.match(fallDownSource, /left: platform\.shape === "l-left" \? `-\$\{FALL_DOWN_LEDGE_WIDTH - 2\}px` : undefined/);
  assert.match(fallDownSource, /right: platform\.shape === "l-right" \? `-\$\{FALL_DOWN_LEDGE_WIDTH - 2\}px` : undefined/);
  assert.match(fallDownSource, /top: `-\$\{FALL_DOWN_LEDGE_HEIGHT - 2\}px`/);
  assert.doesNotMatch(fallDownSource, /top: "2px"/);
});

test("prototype embedded stage keeps JSX buttons well formed", () => {
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const overlaySource = componentSource.slice(componentSource.indexOf("function PrototypeEndOverlay"), componentSource.indexOf("type FallDownPlatformKind"));
  const squareJumpSource = componentSource.slice(componentSource.indexOf("function SquareJumpPrototype"), componentSource.indexOf("function fallDownPlatformKindBag"));

  assert.doesNotMatch(overlaySource, /<button className="secondary-button"(?:(?!<\/button>)[\s\S])*<button className="primary-button"/);
  assert.match(overlaySource, /<button className="secondary-button"[\s\S]*?<\/button>\s*<button className="primary-button"/);
  assert.doesNotMatch(squareJumpSource, /<span>[\s\S]*?<\/span>\s*<\/button>\s*\{view\.timer/);
});

test("new prototype test levels keep required public fields populated", () => {
  const levels = [
    ...getMiniGameLevels("square-jump" as MiniGameId),
    ...getMiniGameLevels("fall-down" as MiniGameId),
  ];

  for (const level of levels) {
    assert.equal(typeof level.levelId, "string");
    assert.ok(level.levelId.length > 0);
    assert.equal(typeof level.title, "string");
    assert.ok(level.title.length > 0);
    assert.ok(level.gameId === "square-jump" || level.gameId === "fall-down");
    assert.equal(typeof level.variant, "string");
    assert.ok(level.variant.length > 0);
    assert.equal(typeof level.difficulty, "string");
    assert.ok(level.difficulty.length > 0);
    assert.equal(typeof level.description, "string");
    assert.ok(level.description.length > 0);
  }
});

test("prototype test route and result-page entry are removed after formal replacement", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const prototypeConfigSource = readFileSync(new URL("./mini-game-prototypes.ts", import.meta.url), "utf8");

  assert.doesNotMatch(appPageSource, /小游戏原型测试|测试方块跃迁与一路向下原型|href="\/mini-game-prototypes"|prototype-test-entry/);
  assert.match(prototypeConfigSource, /方块跃迁/);
  assert.match(prototypeConfigSource, /一路向下/);
  assert.doesNotMatch(appPageSource, /星球跃迁|反向星球|高速星球|星链终点/);
  assert.doesNotMatch(prototypeConfigSource, /planet-leap|星球跃迁|反向星球|高速星球|星链终点/);
});

function integrateSineSweep({
  duration,
  phaseDuration,
  step = 1 / 240,
  sweepPerPhase,
}: {
  duration: number;
  phaseDuration: number;
  step?: number;
  sweepPerPhase: number;
}) {
  let angle = 0;
  let absoluteSweep = 0;
  for (let elapsed = 0; elapsed < duration; elapsed += step) {
    const delta = Math.min(step, duration - elapsed);
    const omega = getSineAngularVelocity(elapsed, phaseDuration, sweepPerPhase);
    angle += omega * delta;
    absoluteSweep += Math.abs(omega * delta);
  }
  return { angle, absoluteSweep };
}

function movementPatterns(levelId: string) {
  const value = getMiniGameLevel("doodle", levelId).params.movementPattern;
  assert.equal(typeof value, "string");
  return String(value).split("|");
}

test("doodle levels encode moving platforms, required risk platforms, moving hazards, and final rules", () => {
  assert.equal(getMiniGameLevel("doodle", "doodle-1").params.movingPlatformRatio, 0.4);
  assert.equal(getMiniGameLevel("doodle", "doodle-2").params.movingPlatformRatio, 0.7);
  assert.equal(getMiniGameLevel("doodle", "doodle-3").params.movingPlatformRatio, 1);

  assert.equal(getMiniGameLevel("doodle", "doodle-4").params.requiredRiskPlatforms, 3);
  assert.equal(getMiniGameLevel("doodle", "doodle-5").params.requiredRiskPlatforms, 5);
  assert.equal(getMiniGameLevel("doodle", "doodle-6").params.requiredRiskPlatforms, 7);
  assert.equal(getMiniGameLevel("doodle", "doodle-4").params.movingPlatformRatio, 0);
  assert.equal(getMiniGameLevel("doodle", "doodle-5").params.movingPlatformRatio, 0);
  assert.equal(getMiniGameLevel("doodle", "doodle-6").params.movingPlatformRatio, 0);
  assert.equal(getMiniGameLevel("doodle", "doodle-4").params.riskJumpMultiplier, 1.6);
  assert.equal(getMiniGameLevel("doodle", "doodle-5").params.riskJumpMultiplier, 1.6);
  assert.equal(getMiniGameLevel("doodle", "doodle-6").params.riskJumpMultiplier, 1.6);

  assert.equal(getMiniGameLevel("doodle", "doodle-7").title, "移动障碍");
  assert.equal(getMiniGameLevel("doodle", "doodle-8").title, "移动障碍");
  assert.equal(getMiniGameLevel("doodle", "doodle-9").title, "移动障碍");
  assert.equal(getMiniGameLevel("doodle", "doodle-7").params.dangerLineEnabled, false);
  assert.equal(getMiniGameLevel("doodle", "doodle-7").params.movingObstacleCount, 5);
  assert.equal(getMiniGameLevel("doodle", "doodle-8").params.movingObstacleCount, 9);
  assert.equal(getMiniGameLevel("doodle", "doodle-9").params.movingObstacleCount, 13);
  assert.deepEqual(movementPatterns("doodle-7"), ["horizontal"]);
  assert.deepEqual(movementPatterns("doodle-8"), ["horizontal", "vertical", "patrolDiagonal"]);
  assert.deepEqual(movementPatterns("doodle-9"), ["horizontal", "vertical", "patrolDiagonal", "orbitSmall", "pulse", "slowCross"]);

  const final = getMiniGameLevel("doodle", "doodle-10");
  assert.equal(final.params.targetHeightScreens, 10);
  assert.equal(final.params.movingPlatformRatio, 1);
  assert.equal(final.params.requiredRiskPlatforms, 8);
  assert.equal(final.params.riskJumpMultiplier, 1.6);
  assert.equal(final.params.dangerLineEnabled, false);
  assert.equal(final.params.movingObstacleCount, 20);
  assert.equal(final.params.finalObstacleStartScreen, 1);
  assert.ok(
    Number(final.params.movingObstacleCount) / Number(final.params.targetHeightScreens) >
      Number(getMiniGameLevel("doodle", "doodle-9").params.movingObstacleCount) / Number(getMiniGameLevel("doodle", "doodle-9").params.targetHeightScreens),
  );
});

test("flappy levels encode gates, collectibles, reversed gravity, and final rules", () => {
  assert.equal(getMiniGameLevel("flappy", "flappy-base").params.gateCount, 6);
  assert.equal(getMiniGameLevel("flappy", "flappy-1").params.gateCount, 8);
  assert.equal(getMiniGameLevel("flappy", "flappy-2").params.movingGateRatio, 0.5);
  assert.equal(getMiniGameLevel("flappy", "flappy-3").params.movingGateRatio, 0.7);

  assert.equal(getMiniGameLevel("flappy", "flappy-4").params.collectibleCount, 4);
  assert.equal(getMiniGameLevel("flappy", "flappy-6").params.collectibleCount, 8);

  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.reversedGravity, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.reverseDirection, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.movingGateRatio, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.collectibleCount, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.reversedGravity, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.reverseDirection, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.movingGateRatio, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.collectibleCount, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-9").params.reversedGravity, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-9").params.reverseDirection, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-9").params.movingGateRatio, 0);

  const final = getMiniGameLevel("flappy", "flappy-10");
  assert.equal(final.params.reverseDirection, true);
  assert.equal(final.params.reversedGravity, true);
  assert.equal(final.params.gateCount, 13);
  assert.equal(final.params.collectibleCount, 7);
});

test("knife levels encode countdown, sine rotation, forbidden zones, and final rules", () => {
  assert.equal(getMiniGameLevel("knife", "knife-base").params.shotCount, 6);
  assert.equal(getMiniGameLevel("knife", "knife-1").params.shotCountdown, 3);
  assert.equal(getMiniGameLevel("knife", "knife-2").params.shotCountdown, 2.5);
  assert.equal(getMiniGameLevel("knife", "knife-3").params.initialObstacleCount, 3);

  assert.equal(getMiniGameLevel("knife", "knife-4").params.sineRotationEnabled, true);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.sweepPerPhase, 390);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.phaseDuration, 3);
  assert.equal(getMiniGameLevel("knife", "knife-5").params.sweepPerPhase, 405);
  assert.equal(getMiniGameLevel("knife", "knife-5").params.phaseDuration, 2.8);
  assert.equal(getMiniGameLevel("knife", "knife-6").params.sweepPerPhase, 420);
  assert.equal(getMiniGameLevel("knife", "knife-6").params.phaseDuration, 2.55);

  assert.equal(getMiniGameLevel("knife", "knife-7").params.forbiddenZoneCount, 1);
  assert.equal(getMiniGameLevel("knife", "knife-8").params.forbiddenZoneCount, 2);
  assert.equal(getMiniGameLevel("knife", "knife-9").params.forbiddenZoneRatio, 0.24);

  const final = getMiniGameLevel("knife", "knife-10");
  assert.equal(final.params.shotCount, 13);
  assert.equal(final.params.shotCountdown, 2.3);
  assert.equal(final.params.sineRotationEnabled, true);
  assert.equal(final.params.sweepPerPhase, 405);
  assert.equal(final.params.phaseDuration, 2.7);
  assert.equal(final.params.forbiddenZoneCount, 2);
});

test("knife angle helpers normalize, compare shortest distance, and convert screen hits into disc-local angles", () => {
  assert.equal(normalizeDegrees(-1), 359);
  assert.equal(normalizeDegrees(721), 1);
  assert.equal(getShortestAngleDistance(5, 355), 10);
  assert.equal(getShortestAngleDistance(90, 270), 180);
  assert.equal(getLocalHitAngle(90, 20), 70);
  assert.equal(getLocalHitAngle(90, 350), 100);
  assert.equal(isAngleWithinArc(15, { start: 350, end: 30 }), true);
  assert.equal(isAngleWithinArc(180, { start: 350, end: 30 }), false);
});

test("knife sine angular velocity keeps sine shape while sweeping at least one full turn per half cycle", () => {
  const phaseDuration = 2.6;
  const sweepPerPhase = 405;
  const fullCycle = phaseDuration * 2;
  const expectedMax = (sweepPerPhase * Math.PI) / (phaseDuration * 2);

  assert.ok(Math.abs(getSineAngularVelocity(0, phaseDuration, sweepPerPhase)) < 0.000001);
  assert.ok(Math.abs(getSineAngularVelocity(phaseDuration / 2, phaseDuration, sweepPerPhase) - expectedMax) < 0.000001);
  assert.ok(Math.abs(getSineAngularVelocity(phaseDuration, phaseDuration, sweepPerPhase)) < 0.000001);
  assert.ok(Math.abs(getSineAngularVelocity(phaseDuration * 1.5, phaseDuration, sweepPerPhase) + expectedMax) < 0.000001);
  assert.ok(Math.abs(getSineAngularVelocity(fullCycle, phaseDuration, sweepPerPhase)) < 0.000001);

  const firstHalf = integrateSineSweep({ duration: phaseDuration, phaseDuration, sweepPerPhase });
  assert.ok(firstHalf.angle >= 360, `expected first half sweep >= 360, got ${firstHalf.angle}`);
  assert.ok(firstHalf.angle <= 430, `expected first half sweep to stay readable, got ${firstHalf.angle}`);

  const cycleSweep = integrateSineSweep({ duration: fullCycle, phaseDuration, sweepPerPhase });
  assert.ok(Math.abs(cycleSweep.angle) < 2, `expected full cycle displacement to cancel, got ${cycleSweep.angle}`);
  assert.ok(cycleSweep.absoluteSweep >= 720, `expected full cycle absolute sweep >= 720, got ${cycleSweep.absoluteSweep}`);
});

test("doodle generated layout is stable for a seed and changes across seeds", () => {
  const level = getMiniGameLevel("doodle", "doodle-8");
  const first = generateDoodleWorldLayout(level, "seed-a");
  const same = generateDoodleWorldLayout(level, "seed-a");
  const different = generateDoodleWorldLayout(level, "seed-b");

  assert.deepEqual(first.platforms.slice(0, 8), same.platforms.slice(0, 8));
  assert.deepEqual(first.hazards.slice(0, 5), same.hazards.slice(0, 5));
  assert.notDeepEqual(
    first.platforms.slice(1, 8).map((platform) => [Math.round(platform.x), Math.round(platform.y), Math.round(platform.width)]),
    different.platforms.slice(1, 8).map((platform) => [Math.round(platform.x), Math.round(platform.y), Math.round(platform.width)]),
  );
});

test("mini-game low power helper is SSR safe and follows mobile or low-core hints", () => {
  assert.doesNotThrow(() => isLowPowerMiniGameDevice());
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: false, hardwareConcurrency: 8 }), false);
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: true, hardwareConcurrency: 8 }), true);
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: false, hardwareConcurrency: 4 }), true);
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: false, hardwareConcurrency: undefined }), false);
});

test("doodle visible selectors cull used and off-screen world objects", () => {
  const layout = generateDoodleWorldLayout(getMiniGameLevel("doodle", "doodle-10"), "visibility-seed");
  const visiblePlatforms = selectVisibleDoodlePlatforms(layout.platforms, {
    buffer: 80,
    cameraY: 640,
    stageHeight: 640,
  });
  assert.ok(visiblePlatforms.length < layout.platforms.length);
  assert.ok(visiblePlatforms.every((platform) => platform.y >= 560 && platform.y <= 1360));

  const usedPlatform = { ...visiblePlatforms[0], used: true };
  assert.equal(
    selectVisibleDoodlePlatforms([usedPlatform], { buffer: 80, cameraY: 640, stageHeight: 640 }).length,
    0,
  );

  const visibleHazards = selectVisibleDoodleHazards(layout.hazards, {
    buffer: 80,
    cameraY: 640,
    stageHeight: 640,
  });
  assert.ok(visibleHazards.length < layout.hazards.length);
  assert.ok(visibleHazards.every((hazard) => hazard.y + hazard.size >= 560 && hazard.y - hazard.size <= 1360));
});

test("flappy visible selector culls gates outside the viewport for both directions", () => {
  const layout = generateFlappyGateLayout(getMiniGameLevel("flappy", "flappy-10"), "visibility-seed");
  const forwardVisible = selectVisibleFlappyGates(layout.gates, {
    buffer: 90,
    gateWidth: 54,
    progress: 360,
    reverseDirection: false,
    stageWidth: 360,
  });
  const reverseVisible = selectVisibleFlappyGates(layout.gates, {
    buffer: 90,
    gateWidth: 54,
    progress: 360,
    reverseDirection: true,
    stageWidth: 360,
  });

  assert.ok(forwardVisible.length < layout.gates.length);
  assert.ok(reverseVisible.length < layout.gates.length);
  assert.ok(forwardVisible.every((gate) => 360 + gate.distance - 360 > -54 - 90 && 360 + gate.distance - 360 < 360 + 90));
  assert.ok(reverseVisible.every((gate) => -gate.distance + 360 > -54 - 90 && -gate.distance + 360 < 360 + 90));
});

test("doodle only moving obstacle variants enable moving hazards", () => {
  for (const levelId of ["doodle-base", "doodle-1", "doodle-2", "doodle-3", "doodle-4", "doodle-5", "doodle-6"]) {
    const layout = generateDoodleWorldLayout(getMiniGameLevel("doodle", levelId), "static-obstacles");
    assert.equal(layout.hazards.some((hazard) => hazard.movementEnabled), false, levelId);
  }

  for (const levelId of ["doodle-7", "doodle-8", "doodle-9", "doodle-10"]) {
    const layout = generateDoodleWorldLayout(getMiniGameLevel("doodle", levelId), "moving-obstacles");
    assert.equal(layout.hazards.some((hazard) => hazard.movementEnabled), true, levelId);
  }

  const hardMovingCount = generateDoodleWorldLayout(getMiniGameLevel("doodle", "doodle-9"), "moving-obstacles").hazards.filter((hazard) => hazard.movementEnabled).length;
  const finalMovingCount = generateDoodleWorldLayout(getMiniGameLevel("doodle", "doodle-10"), "moving-obstacles").hazards.filter((hazard) => hazard.movementEnabled).length;
  assert.ok(finalMovingCount > hardMovingCount, `expected final moving hazards > 1-9, got ${finalMovingCount}/${hardMovingCount}`);
});

test("flappy generated gates are seeded and encode initial placement", () => {
  assert.equal(getFlappyInitialPlacement(getMiniGameLevel("flappy", "flappy-base")), "abovePlatform");
  assert.equal(getFlappyInitialPlacement(getMiniGameLevel("flappy", "flappy-7")), "belowPlatform");
  assert.equal(getFlappyInitialPlacement(getMiniGameLevel("flappy", "flappy-10")), "belowPlatform");

  const level = getMiniGameLevel("flappy", "flappy-6");
  const first = generateFlappyGateLayout(level, "seed-a");
  const same = generateFlappyGateLayout(level, "seed-a");
  const different = generateFlappyGateLayout(level, "seed-b");

  assert.deepEqual(first.gates.slice(0, 5), same.gates.slice(0, 5));
  assert.notDeepEqual(
    first.gates.slice(0, 5).map((gate) => [Math.round(gate.baseCenterY), gate.collectibleOffset]),
    different.gates.slice(0, 5).map((gate) => [Math.round(gate.baseCenterY), gate.collectibleOffset]),
  );
});

test("knife initial bars and forbidden zones are seeded but separated", () => {
  const final = getMiniGameLevel("knife", "knife-10");
  const zonesA = generateKnifeForbiddenZones(final, "seed-a");
  const zonesSame = generateKnifeForbiddenZones(final, "seed-a");
  const zonesB = generateKnifeForbiddenZones(final, "seed-b");
  const initialA = generateKnifeInitialAngles(final, "seed-a", zonesA);
  const initialSame = generateKnifeInitialAngles(final, "seed-a", zonesSame);
  const initialB = generateKnifeInitialAngles(final, "seed-b", zonesB);

  assert.deepEqual(zonesA, zonesSame);
  assert.notDeepEqual(zonesA, zonesB);
  assert.deepEqual(initialA, initialSame);
  assert.notDeepEqual(initialA, initialB);

  for (let outer = 0; outer < initialA.length; outer += 1) {
    for (let inner = outer + 1; inner < initialA.length; inner += 1) {
      assert.ok(getShortestAngleDistance(initialA[outer], initialA[inner]) >= 30);
    }
  }
});

test("knife shot geometry is derived from fire point to disc center", () => {
  const geometry = getKnifeShotGeometry({ x: 180, y: 548 }, { x: 180, y: 177 }, 95);
  assert.equal(Math.round(geometry.travelAngle), 270);
  assert.equal(Math.round(geometry.impactAngle), 90);
  assert.equal(Math.round(geometry.impactPoint.x), 180);
  assert.equal(Math.round(geometry.impactPoint.y), 272);
});

test("knife shot outcome keeps the impact angle for success and failures", () => {
  assert.deepEqual(
    resolveKnifeShotOutcome({
      collisionDegrees: 8,
      forbiddenZones: [],
      impactAngle: 100,
      initialAngles: [230],
      insertedAngles: [320],
    }),
    { impactAngle: 100, kind: "hit" },
  );

  assert.deepEqual(
    resolveKnifeShotOutcome({
      collisionDegrees: 8,
      forbiddenZones: [],
      impactAngle: 101,
      initialAngles: [230],
      insertedAngles: [96],
    }),
    { impactAngle: 101, kind: "collision" },
  );

  assert.deepEqual(
    resolveKnifeShotOutcome({
      collisionDegrees: 8,
      forbiddenZones: [{ start: 80, end: 120 }],
      impactAngle: 100,
      initialAngles: [],
      insertedAngles: [],
    }),
    { impactAngle: 100, kind: "forbidden" },
  );
});
