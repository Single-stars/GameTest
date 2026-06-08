import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  resolveKnifeFirstOwner,
  resolveKnifeShotOutcome,
  resolveKnifeTurnSettlement,
  resolveKnifeTurnOwner,
} from "./index.ts";
import {
  integrateSineSweep,
  readAppCssSource,
  readMiniGameRuntimeSource,
} from "./test-utils.ts";

test("knife levels encode countdown, sine rotation, forbidden zones, and final rules", () => {
  assert.equal(getMiniGameLevel("knife", "knife-base").params.shotCount, 6);
  assert.equal(getMiniGameLevel("knife", "knife-base").params.initialObstacleCount, 4);
  for (const level of ["knife-base", "knife-1", "knife-2", "knife-3", "knife-4", "knife-5", "knife-6", "knife-7", "knife-8", "knife-9", "knife-10"]) {
    assert.equal(Number(getMiniGameLevel("knife", level).params.shotCount) % 2, 0, level);
  }
  assert.equal(getMiniGameLevel("knife", "knife-1").params.shotCountdown, 2.5);
  assert.equal(getMiniGameLevel("knife", "knife-2").params.shotCountdown, 2.5);
  assert.equal(getMiniGameLevel("knife", "knife-3").params.initialObstacleCount, 4);

  assert.equal(getMiniGameLevel("knife", "knife-4").params.sineRotationEnabled, true);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.shotCountdown, undefined);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.sweepPerPhase, 390);
  assert.equal(getMiniGameLevel("knife", "knife-4").params.phaseDuration, 3);
  assert.equal(getMiniGameLevel("knife", "knife-5").params.sweepPerPhase, 405);
  assert.equal(getMiniGameLevel("knife", "knife-5").params.phaseDuration, 2.8);
  assert.equal(getMiniGameLevel("knife", "knife-6").params.sweepPerPhase, 420);
  assert.equal(getMiniGameLevel("knife", "knife-6").params.phaseDuration, 2.55);

  assert.equal(getMiniGameLevel("knife", "knife-7").params.forbiddenZoneCount, 1);
  assert.equal(getMiniGameLevel("knife", "knife-7").params.shotCountdown, undefined);
  assert.equal(getMiniGameLevel("knife", "knife-8").params.forbiddenZoneCount, 2);
  assert.equal(getMiniGameLevel("knife", "knife-9").params.forbiddenZoneRatio, 0.24);

  const final = getMiniGameLevel("knife", "knife-10");
  assert.equal(final.params.shotCount, 14);
  assert.equal(final.params.shotCountdown, 3);
  assert.equal(final.params.sineRotationEnabled, true);
  assert.equal(final.params.sweepPerPhase, 405);
  assert.equal(final.params.phaseDuration, 2.7);
  assert.equal(final.params.forbiddenZoneCount, 2);
});

test("knife countdown is only configured on countdown levels and the final trial", () => {
  const countdownLevels = new Map([
    ["knife-1", 2.5],
    ["knife-2", 2.5],
    ["knife-3", 2],
    ["knife-10", 3],
  ]);

  for (const levelId of ["knife-1", "knife-2", "knife-3", "knife-4", "knife-5", "knife-6", "knife-7", "knife-8", "knife-9", "knife-10"]) {
    assert.equal(getMiniGameLevel("knife", levelId).params.shotCountdown, countdownLevels.get(levelId), levelId);
  }
});

test("knife turn owner is seeded so the host is not always first", () => {
  const hostFirstSeed = "knife-1:host-first";
  const guestFirstSeed = "knife-1:guest-first";
  const hostFirst = resolveKnifeFirstOwner(hostFirstSeed);
  const guestFirst = resolveKnifeFirstOwner(guestFirstSeed);

  assert.notEqual(hostFirst, guestFirst);
  assert.equal(resolveKnifeTurnOwner(0, hostFirst), hostFirst);
  assert.equal(resolveKnifeTurnOwner(1, hostFirst), hostFirst === "host" ? "guest" : "host");
  assert.equal(resolveKnifeTurnOwner(0, guestFirst), guestFirst);
  assert.equal(resolveKnifeTurnOwner(1, guestFirst), guestFirst === "host" ? "guest" : "host");
});

test("knife turn settlement keeps tied games on the same wheel for one-shot overtime rounds", () => {
  assert.deepEqual(
    resolveKnifeTurnSettlement({
      countdown: 0,
      guestScore: 4,
      hasCountdown: false,
      hostScore: 4,
      shotCount: 8,
      shotIndex: 8,
    }),
    {
      overtime: true,
      showOvertimeBanner: true,
      status: "playing",
      timer: null,
      winnerRole: null,
    },
  );

  assert.deepEqual(
    resolveKnifeTurnSettlement({
      countdown: 0,
      guestScore: 4,
      hasCountdown: false,
      hostScore: 5,
      shotCount: 8,
      shotIndex: 9,
    }),
    {
      overtime: true,
      showOvertimeBanner: false,
      status: "playing",
      timer: null,
      winnerRole: null,
    },
  );

  assert.deepEqual(
    resolveKnifeTurnSettlement({
      countdown: 0,
      guestScore: 5,
      hasCountdown: false,
      hostScore: 5,
      shotCount: 8,
      shotIndex: 10,
    }),
    {
      overtime: true,
      showOvertimeBanner: true,
      status: "playing",
      timer: null,
      winnerRole: null,
    },
  );

  assert.deepEqual(
    resolveKnifeTurnSettlement({
      countdown: 3,
      guestScore: 5,
      hasCountdown: true,
      hostScore: 6,
      shotCount: 8,
      shotIndex: 12,
    }),
    {
      overtime: true,
      showOvertimeBanner: false,
      status: "passed",
      timer: null,
      winnerRole: "host",
    },
  );
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

test("knife flight animation lands at the computed impact edge without overshoot pullback", () => {
  const runtimeSource = readFileSync(new URL("../../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../../app/styles/mini-games/knife.css", import.meta.url), "utf8");

  assert.match(runtimeSource, /"--knife-impact-y": `\$\{stageSize\.height - knifeGeometry\.launcherBottom - knifeGeometry\.flightDistance\}px`/);
  assert.match(runtimeSource, /"--knife-launcher-y": `\$\{stageSize\.height - knifeGeometry\.launcherBottom\}px`/);
  assert.match(cssSource, /translateY\(calc\(var\(--knife-impact-y, 272px\) - var\(--knife-launcher-y, 548px\)\)\)/);
  assert.doesNotMatch(cssSource, /calc\(-1 \* var\(--knife-flight-distance/);
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

test("knife collision threshold is tight enough to match visual overlap", () => {
  const runtimeSource = readMiniGameRuntimeSource();

  assert.match(runtimeSource, /const KNIFE_COLLISION_DEGREES = 6;/);
  assert.equal(
    resolveKnifeShotOutcome({
      collisionDegrees: 6,
      forbiddenZones: [],
      impactAngle: 102,
      initialAngles: [96],
      insertedAngles: [],
    }).kind,
    "hit",
  );
});

test("knife endless critical hits use a safe margin beyond danger edges", () => {
  const logicSource = readFileSync(new URL("./knife.ts", import.meta.url), "utf8");
  const runtimeSource = readMiniGameRuntimeSource();

  assert.match(logicSource, /export function getKnifeHitDangerProximityDegrees/);
  assert.match(logicSource, /getShortestAngleDistance\(angle, normalizedImpact\) - collisionDegrees/);
  assert.match(runtimeSource, /ENDLESS_KNIFE_DANGER_MARGIN_DEGREES = 4/);
  assert.match(runtimeSource, /getKnifeHitDangerProximityDegrees/);
  assert.match(runtimeSource, /proximityDegrees <= ENDLESS_KNIFE_DANGER_MARGIN_DEGREES[\s\S]*awardSpecialBonus\(/);
});

test("knife countdown renders a large background number below the wheel", () => {
  const runtimeSource = readMiniGameRuntimeSource();
  const cssSource = readAppCssSource();

  assert.match(runtimeSource, /className="knife-countdown-ghost"/);
  assert.match(runtimeSource, /Math\.ceil\(Math\.max\(0, view\.timer \?\? 0\)\)/);
  assert.match(cssSource, /\.knife-countdown-ghost/);
  assert.match(cssSource, /font-size: clamp\(96px, 28vw, 172px\);/);
  assert.match(cssSource, /top: 54%;/);
});

test("knife multiplayer renders turn and overtime prompts without smoothing remote wheel angle", () => {
  const runtimeSource = readMiniGameRuntimeSource();
  const cssSource = readAppCssSource();

  assert.match(runtimeSource, /className="knife-turn-ghost"/);
  assert.match(runtimeSource, /localTurn \? "你的回合" : "对方回合"/);
  assert.match(runtimeSource, /className="knife-overtime-banner"/);
  assert.match(runtimeSource, /function formatKnifeOvertimeRoundLabel/);
  assert.match(runtimeSource, /Math\.floor\(\(Math\.max\(1, overtimeShotNumber\) - 1\) \/ 2\) \+ 1/);
  assert.match(runtimeSource, /const overtimeRoundLabel = formatKnifeOvertimeRoundLabel\(view\.shotIndex, shotCount\);/);
  assert.match(runtimeSource, /view\.overtime \? overtimeRoundLabel :/);
  assert.match(runtimeSource, /\{overtimeRoundLabel\}/);
  assert.doesNotMatch(runtimeSource, /加赛发射/);
  assert.doesNotMatch(runtimeSource, />加赛</);
  assert.doesNotMatch(runtimeSource, /frame\.rotation = normalizeDegrees\(remoteState\.angle\)/);
  assert.match(cssSource, /\.knife-turn-ghost/);
  assert.match(cssSource, /\.knife-overtime-banner/);
  assert.match(cssSource, /\.knife-overtime-banner\s*{[\s\S]*top:\s*max\(16px,\s*calc\(env\(safe-area-inset-top\) \+ 12px\)\);/);
});

test("knife endless waits for feedback and slides wheels before advancing", () => {
  const runtimeSource = readMiniGameRuntimeSource();
  const cssSource = readAppCssSource();

  assert.match(runtimeSource, /const KNIFE_ENDLESS_WHEEL_ADVANCE_DELAY_MS = KNIFE_FINISH_DELAY_MS;/);
  assert.match(runtimeSource, /const KNIFE_ENDLESS_WHEEL_SLIDE_MS = 420;/);
  assert.match(runtimeSource, /type EndlessKnifeWheelTransition/);
  assert.match(runtimeSource, /endlessWheelTransitionActiveRef\.current = true;/);
  assert.match(runtimeSource, /phase: "sliding"/);
  assert.match(runtimeSource, /KNIFE_ENDLESS_WHEEL_ADVANCE_DELAY_MS/);
  assert.match(runtimeSource, /runtimeRef\.current = pending\.runtime;/);
  assert.match(runtimeSource, /setEndlessWheelIndex\(pending\.wheelIndex\);/);
  assert.match(runtimeSource, /KNIFE_ENDLESS_WHEEL_SLIDE_MS/);
  assert.match(runtimeSource, /if \(endlessWheelTransitionActiveRef\.current\) return;/);
  assert.match(runtimeSource, /knife-wheel-panel/);
  assert.match(runtimeSource, /endlessWheelTransition\.phase === "sliding"/);

  assert.match(cssSource, /\.knife-wheel-panel/);
  assert.match(cssSource, /\.knife-wheel-panel\.exiting/);
  assert.match(cssSource, /\.knife-wheel-panel\.entering/);
  assert.match(cssSource, /@keyframes knife-wheel-slide-out/);
  assert.match(cssSource, /@keyframes knife-wheel-slide-in/);
  assert.match(cssSource, /translateX\(-120vw\)/);
  assert.match(cssSource, /translateX\(120vw\)/);
});

test("knife endless awards a perfect break bonus for no-damage wheel clears", () => {
  const runtimeSource = readMiniGameRuntimeSource();

  assert.match(runtimeSource, /if \(isEndlessRun && current\.insertedAngles\.length >= shotCount\) \{/);
  assert.match(runtimeSource, /if \(current\.failures === 0\) \{/);
  assert.match(runtimeSource, /endlessRef\.current\?\.awardSpecialBonus\(\{ label: "完美击破！", amount: 5 \}\);/);
  assert.match(runtimeSource, /advanceEndlessKnifeWheel\(\);/);
});
