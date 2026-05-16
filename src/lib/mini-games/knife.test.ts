import assert from "node:assert/strict";
import test from "node:test";

import {
  generateKnifeForbiddenZones,
  generateKnifeInitialAngles,
  getKnifeShotGeometry,
  getMiniGameLevel,
  getLocalHitAngle,
  getShortestAngleDistance,
  getSineAngularVelocity,
  isAngleWithinArc,
  normalizeDegrees,
  resolveKnifeShotOutcome,
} from "../mini-game-prototypes.ts";
import {
  integrateSineSweep,
} from "./test-utils.ts";

test("knife levels encode countdown, sine rotation, forbidden zones, and final rules", () => {
  assert.equal(getMiniGameLevel("knife", "knife-base").params.shotCount, 6);
  assert.equal(getMiniGameLevel("knife", "knife-base").params.initialObstacleCount, 4);
  assert.equal(getMiniGameLevel("knife", "knife-1").params.shotCountdown, 2.5);
  assert.equal(getMiniGameLevel("knife", "knife-2").params.shotCountdown, 2.5);
  assert.equal(getMiniGameLevel("knife", "knife-3").params.initialObstacleCount, 4);

  assert.equal(getMiniGameLevel("knife", "knife-4").params.sineRotationEnabled, true);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.shotCountdown, 2);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.sweepPerPhase, 390);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.phaseDuration, 3);
  assert.equal(getMiniGameLevel("knife", "knife-5").params.sweepPerPhase, 405);
  assert.equal(getMiniGameLevel("knife", "knife-5").params.phaseDuration, 2.8);
  assert.equal(getMiniGameLevel("knife", "knife-6").params.sweepPerPhase, 420);
  assert.equal(getMiniGameLevel("knife", "knife-6").params.phaseDuration, 2.55);

  assert.equal(getMiniGameLevel("knife", "knife-7").params.forbiddenZoneCount, 1);
  assert.equal(getMiniGameLevel("knife", "knife-7").params.shotCountdown, 1.5);
  assert.equal(getMiniGameLevel("knife", "knife-8").params.forbiddenZoneCount, 2);
  assert.equal(getMiniGameLevel("knife", "knife-9").params.forbiddenZoneRatio, 0.24);

  const final = getMiniGameLevel("knife", "knife-10");
  assert.equal(final.params.shotCount, 13);
  assert.equal(final.params.shotCountdown, 2.5);
  assert.equal(final.params.sineRotationEnabled, true);
  assert.equal(final.params.sweepPerPhase, 405);
  assert.equal(final.params.phaseDuration, 2.7);
  assert.equal(final.params.forbiddenZoneCount, 2);
});

test("knife base and advanced levels one through eight start with four quadrant knives", () => {
  for (const levelId of ["knife-base", "knife-1", "knife-2", "knife-3", "knife-4", "knife-5", "knife-6", "knife-7", "knife-8"]) {
    const level = getMiniGameLevel("knife", levelId);
    const angles = generateKnifeInitialAngles(level, "quadrant-seed", generateKnifeForbiddenZones(level, "quadrant-seed"));

    assert.equal(level.params.initialObstacleCount, 4, levelId);
    assert.deepEqual(angles, [0, 90, 180, 270], levelId);
  }
});

test("knife level descriptions reflect the tuned countdowns and four starting knives", () => {
  assert.match(getMiniGameLevel("knife", "knife-base").description, /初始障碍 4 个/);
  assert.match(getMiniGameLevel("knife", "knife-1").description, /每发 2\.5 秒倒计时，初始障碍 4 个/);
  assert.match(getMiniGameLevel("knife", "knife-2").description, /初始障碍 4 个/);
  assert.match(getMiniGameLevel("knife", "knife-3").description, /初始障碍 4 个/);
  assert.match(getMiniGameLevel("knife", "knife-5").description, /初始障碍 4 个/);
  assert.match(getMiniGameLevel("knife", "knife-6").description, /初始障碍 4 个/);
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
