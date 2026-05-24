import assert from "node:assert/strict";
import test from "node:test";

import {
  createMiniGameRunSeed,
  createSquareJumpBaseAdvancePlan,
  createSquareJumpBaseJumpPlan,
  fitSquareJumpBaseCamera,
  generateSquareJumpPlatformSequence,
  getSquareJumpBasePlatformHeight,
  getSquareJumpChargeAt,
  getSquareJumpGravityMultiplier,
  getSquareJumpBasePlatformX,
  getSquareJumpBasePlayerXOnPlatform,
  getMiniGame,
  getMiniGameLevel,
  getMiniGameLevels,
  resolveSquareJumpActiveGravity,
  resolveSquareJumpBaseFlyAwayLanding,
  resolveSquareJumpBaseLandingByX,
  selectSquareJumpVisiblePlatforms,
  shouldSquareJumpDeferLandingResolution,
  sampleSquareJumpBaseAdvanceCamera,
  sampleSquareJumpBaseFlyAway,
  sampleSquareJumpBaseJump,
  sampleSquareJumpBaseRiseIn,
  type MiniGameId,
} from "./index.ts";
import {
  SQUARE_JUMP_LEVEL_IDS,
  FALL_DOWN_LEVEL_IDS,
  readMiniGameRuntimeSource,
  readAppCssSource,
} from "./test-utils.ts";

test("square jump and fall down expose all required formal levels", () => {
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
  const componentSource = readMiniGameRuntimeSource();
  const base = getMiniGameLevel("square-jump" as MiniGameId, "square-jump-base");

  assert.match(componentSource, /function getSquareJumpPlatformY\(stageHeight: number\)/);
  assert.match(componentSource, /return stageHeight \* 0\.72;/);
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
  const componentSource = readMiniGameRuntimeSource();
  const globalCss = readAppCssSource();

  assert.doesNotMatch(componentSource, /showLandingPreview|setShowLandingPreview|square-preview-toggle/);
  assert.doesNotMatch(globalCss, /\.square-preview-toggle|\.square-landing-shadow/);
  assert.match(componentSource, /const tutorialPreviewPlan = level\.levelId === "square-jump-base" && view\.jumps < 3 && view\.state === "charging"/);
  assert.match(componentSource, /className="square-tutorial-landing-preview"/);
  assert.doesNotMatch(componentSource, /square-start-hint/);
  assert.doesNotMatch(componentSource, /chargingSquash/);
  assert.match(componentSource, /<PlayerAvatar/);
  assert.match(componentSource, /charge=\{view\.charge\}/);
  assert.match(componentSource, /rootRef=\{playerAvatarRef\}/);
  assert.match(componentSource, /\{\.\.\.resolveSquareJumpPlayerAvatarView\(view\)\}/);
  assert.doesNotMatch(componentSource, /square-charge-meter/);
  assert.doesNotMatch(globalCss, /\.square-charge-meter/);
  assert.match(globalCss, /transform-origin: 50% 50%/);
  assert.doesNotMatch(globalCss, /\.square-jump-base-player-visual/);
}
);

test("square jump maps its player visuals through the shared avatar without fail state", () => {
  const componentSource = readMiniGameRuntimeSource();
  const squareSource = componentSource.slice(componentSource.indexOf("function squareGravityMultiplier"), componentSource.indexOf("export function SquareJumpPrototype"));
  const avatarStateSource = squareSource.slice(
    squareSource.indexOf("function resolveSquareJumpPlayerAvatarView"),
    squareSource.indexOf("function createSquareJumpPlan"),
  );
  const renderSource = componentSource.slice(
    componentSource.indexOf("className={`square-jump-base-player-shell"),
    componentSource.indexOf("{DEBUG_MINI_GAME_HITBOX ?", componentSource.indexOf("className={`square-jump-base-player-shell")),
  );

  assert.match(componentSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(componentSource, /type PlayerAvatarView/);
  assert.match(componentSource, /type PlayerAvatarGravity/);
  assert.match(avatarStateSource, /if \(view\.status === "passed"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(avatarStateSource, /if \(view\.time < view\.respawnUntil\) return \{ action: "idle", expression: "neutral", effect: "shield" \};/);
  assert.match(avatarStateSource, /if \(view\.state === "charging" \|\| view\.state === "airCharging"\) return \{ action: "charge", expression: "neutral" \};/);
  assert.match(avatarStateSource, /if \(view\.feedback === "Good"\) return \{ action: "land", expression: "neutral" \};/);
  assert.ok(
    avatarStateSource.indexOf('if (view.state === "charging" || view.state === "airCharging") return { action: "charge", expression: "neutral" };') <
      avatarStateSource.indexOf('if (view.feedback === "Good") return { action: "land", expression: "neutral" };'),
    "charging must override the temporary land feedback so charge squash starts during camera advance",
  );
  assert.match(avatarStateSource, /if \(view\.state === "jumping"\) return \{ action: "idle", expression: "neutral" \};/);
  assert.match(avatarStateSource, /if \(view\.state === "falling"\) return \{ action: "idle", expression: "scared" \};/);
  assert.match(avatarStateSource, /return \{ action: "idle", expression: "neutral" \};/);
  assert.doesNotMatch(avatarStateSource, /return "fail";/);
  assert.doesNotMatch(avatarStateSource, /view\.status === "failed"[\s\S]{0,80}"fail"/);
  assert.match(renderSource, /<PlayerAvatar/);
  assert.match(renderSource, /\{\.\.\.resolveSquareJumpPlayerAvatarView\(view\)\}/);
  assert.match(renderSource, /charge=\{view\.charge\}/);
  assert.match(renderSource, /rootRef=\{playerAvatarRef\}/);
  assert.match(renderSource, /gravity=\{view\.activeGravity\}/);
  assert.match(renderSource, /rotationTurns=\{view\.playerTurns\}/);
  assert.match(renderSource, /visualScale=\{1\.18\}/);
  assert.doesNotMatch(renderSource, /prototype-player-box square-jump-base-player-visual/);
});

test("square jump platform visuals distinguish gravity, moving, and finish platforms", () => {
  const componentSource = readMiniGameRuntimeSource();
  const globalCss = readAppCssSource();

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
  const componentSource = readMiniGameRuntimeSource();

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
  const componentSource = readMiniGameRuntimeSource();

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
  const componentSource = readMiniGameRuntimeSource();

  assert.doesNotMatch(componentSource, /finishSquareJumpAdvanceForImmediateCharge/);
  assert.match(componentSource, /function updateSquareJumpAdvanceAnimation\(current: SquareJumpUnifiedRuntime\)/);
  assert.match(componentSource, /if \(current\.advancePlan\) updateSquareJumpAdvanceAnimation\(current\);/);
  assert.match(componentSource, /if \(current\.state === "advancing"\) current\.state = "idle";/);
  assert.match(componentSource, /const canGroundCharge = current\.state === "idle" \|\| current\.state === "advancing"/);
  assert.match(componentSource, /if \(!current\.started\) \{\s*current\.started = true;\s*current\.timer = null;\s*\}/);
  assert.doesNotMatch(componentSource, /className="prototype-start-button"[\s\S]*start\(\)/);
});

test("square jump base rendering keeps hot-path positions on transforms", () => {
  const componentSource = readMiniGameRuntimeSource();
  const globalCss = readAppCssSource();
  const updateDomSource = componentSource.slice(
    componentSource.indexOf("const updateSquareJumpDom = useCallback"),
    componentSource.indexOf("const fail = useCallback", componentSource.indexOf("const updateSquareJumpDom = useCallback")),
  );
  const renderSource = componentSource.slice(
    componentSource.indexOf("const platforms = selectSquareJumpVisiblePlatforms(view.currentPlatform, view.nextPlatform, view.exitingPlatform);"),
    componentSource.indexOf("{DEBUG_MINI_GAME_HITBOX ?", componentSource.indexOf("const platforms = selectSquareJumpVisiblePlatforms(view.currentPlatform, view.nextPlatform, view.exitingPlatform);")),
  );

  assert.match(componentSource, /className=\{`square-jump-base-player-shell/);
  assert.match(componentSource, /className=\{`square-jump-base-platform/);
  assert.match(updateDomSource, /node\.style\.transform = transformPoint3d\(platformX - platform\.width \/ 2, platform\.y \+ visualOffsetY\);/);
  assert.doesNotMatch(updateDomSource, /node\.style\.left =/);
  assert.doesNotMatch(updateDomSource, /node\.style\.top =/);
  assert.match(updateDomSource, /playerShellRef\.current\.style\.transform = transformPoint3d\(current\.playerX - PLAYER_SIZE \/ 2, current\.playerY - PLAYER_SIZE \/ 2\);/);
  assert.match(updateDomSource, /setSquareJumpAvatarChargeVars\(playerAvatarRef\.current, current\);/);
  assert.match(componentSource, /function setSquareJumpAvatarChargeVars/);
  assert.match(componentSource, /style\.setProperty\("--player-avatar-charge"/);
  assert.doesNotMatch(updateDomSource, /playerShellRef\.current\.style\.left =/);
  assert.doesNotMatch(updateDomSource, /playerShellRef\.current\.style\.top =/);
  assert.match(renderSource, /transform: transformPoint3d\(platformX - platform\.width \/ 2, platform\.y \+ visualOffsetY\)/);
  assert.match(renderSource, /transform: transformPoint3d\(view\.playerX - PLAYER_SIZE \/ 2, view\.playerY - PLAYER_SIZE \/ 2\)/);
  assert.match(globalCss, /\.square-jump-base-player-shell[\s\S]*transition: none;[\s\S]*animation: none;/);
  assert.match(globalCss, /\.square-jump-base-player-shell[\s\S]*will-change: transform;/);
});

test("square jump runtime supports double jump hover charging and 90 degree turns", () => {
  const componentSource = readMiniGameRuntimeSource();
  const globalCss = readAppCssSource();

  assert.match(componentSource, /runSeed:\s*string/);
  assert.match(componentSource, /<SquareJumpPrototype[\s\S]*runSeed=\{runSeed\}/);
  assert.match(componentSource, /"airCharging"/);
  assert.match(componentSource, /doubleJumpUsed/);
  assert.match(componentSource, /getSquareJumpChargeAt\(\{[\s\S]*cycling:\s*current\.state === "airCharging" && cyclingCharge/);
  assert.doesNotMatch(componentSource, /showLandingPreview/);
  assert.match(componentSource, /const canAirCharge = doubleJumpEnabled && \(current\.state === "jumping" \|\| current\.state === "falling"\)/);
  assert.match(componentSource, /current\.playerTurns \+= 1/);
  assert.match(componentSource, /rotationTurns=\{view\.playerTurns\}/);
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
  const componentSource = readMiniGameRuntimeSource();
  const globalCss = readAppCssSource();
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

test("square jump base and multiplayer misses respawn on the current platform with smooth camera recovery", () => {
  const componentSource = readMiniGameRuntimeSource();
  const squareJumpSource = componentSource.slice(componentSource.indexOf("function recoverSquareJumpBaseMiss"), componentSource.indexOf("export function SquareJumpPrototype"));

  assert.match(squareJumpSource, /function recoverSquareJumpBaseMiss\([\s\S]*unlimitedRespawn = false/);
  assert.match(squareJumpSource, /const respawnPlatform = \{ \.\.\.current\.currentPlatform \};/);
  assert.match(squareJumpSource, /current\.playerX = getSquareJumpBasePlatformX\(respawnPlatform, current\.time\);/);
  assert.match(squareJumpSource, /current\.playerY = respawnPlatform\.y - PLAYER_SIZE \/ 2;/);
  assert.match(squareJumpSource, /current\.advancePlan = createSquareJumpBaseAdvancePlan\(\{/);
  assert.match(squareJumpSource, /cameraEnd: fitSquareBaseCamera\(respawnPlatform, current\.nextPlatform, current\.playerX, stageSize\)/);
  assert.match(squareJumpSource, /const nextVisualOffsetY = current\.nextVisualOffsetY;/);
  assert.match(squareJumpSource, /current\.nextVisualOffsetY = nextVisualOffsetY;/);
  assert.doesNotMatch(squareJumpSource, /current\.nextVisualOffsetY = current\.advancePlan\.nextPlatformStartVisualOffsetY;/);
  assert.doesNotMatch(squareJumpSource, /const nextJumps = current\.jumps \+ 1;[\s\S]*current\.currentPlatform = landedPlatform;/);
  assert.match(componentSource, /mode === "base" \|\| unlimitedRespawn/);
});
