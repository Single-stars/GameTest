import assert from "node:assert/strict";
import test from "node:test";

import {
  MINI_GAME_PROTOTYPES,
  generateDoodleWorldLayout,
  generateFlappyGateLayout,
  generateKnifeForbiddenZones,
  generateKnifeInitialAngles,
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
  resolveKnifeShotOutcome,
  selectVisibleDoodleHazards,
  selectVisibleDoodlePlatforms,
  selectVisibleFlappyGates,
  type MiniGameId,
} from "./mini-game-prototypes.ts";

const GAME_IDS: MiniGameId[] = ["doodle", "flappy", "knife"];

test("mini-game prototypes expose three playable game entries", () => {
  assert.deepEqual(
    MINI_GAME_PROTOTYPES.map((game) => game.id),
    GAME_IDS,
  );

  assert.equal(getMiniGame("doodle").title, "Doodle Jump 型");
  assert.equal(getMiniGame("flappy").title, "Flappy Bird 型");
  assert.equal(getMiniGame("knife").title, "Knife Hit 型");
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
