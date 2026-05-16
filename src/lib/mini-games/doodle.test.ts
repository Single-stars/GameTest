import assert from "node:assert/strict";
import test from "node:test";

import {
  generateDoodleWorldLayout,
  getMiniGameLevel,
  selectVisibleDoodleHazards,
  selectVisibleDoodlePlatforms,
} from "./index.ts";
import {
  readMiniGameRuntimeSource,
  readMiniGameConfigSource,
  movementPatterns,
} from "./test-utils.ts";

test("doodle jump moves only while pressing the left or right half of the screen", () => {
  const componentSource = readMiniGameRuntimeSource();
  const doodleSource = componentSource.slice(componentSource.indexOf("function DoodleJumpPrototype"), componentSource.indexOf("function movingGateY"));

  assert.match(componentSource, /const DOODLE_PLAYER_SPEED = 315;/);
  assert.doesNotMatch(doodleSource, /controlXRef/);
  assert.doesNotMatch(doodleSource, /setControlFromPointer/);
  assert.doesNotMatch(doodleSource, /current\.playerX \+ \(controlXRef\.current - current\.playerX\)/);
  assert.match(doodleSource, /const inputDirectionRef = useRef\(0\);/);
  assert.match(doodleSource, /const inputPointerIdRef = useRef<number \| null>\(null\);/);
  assert.match(doodleSource, /function chooseDoodleDirection\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(doodleSource, /const updateDoodleDirection = useCallback/);
  assert.match(doodleSource, /if \(inputPointerIdRef\.current !== event\.pointerId\) return;/);
  assert.match(doodleSource, /inputDirectionRef\.current = chooseDoodleDirection\(event\);/);
  assert.match(doodleSource, /inputPointerIdRef\.current = event\.pointerId;/);
  assert.match(doodleSource, /const stopDoodleDirection = useCallback/);
  assert.match(doodleSource, /inputDirectionRef\.current = 0;/);
  assert.match(doodleSource, /inputPointerIdRef\.current = null;/);
  assert.match(doodleSource, /current\.playerX = clamp\(current\.playerX \+ inputDirectionRef\.current \* DOODLE_PLAYER_SPEED \* delta/);
  assert.match(doodleSource, /onPointerMove=\{updateDoodleDirection\}/);
  assert.match(doodleSource, /onPointerUp=\{stopDoodleDirection\}/);
  assert.doesNotMatch(doodleSource, /onPointerLeave=\{stopDoodleDirection\}/);
  assert.match(doodleSource, /onPointerCancel=\{stopDoodleDirection\}/);
  assert.match(doodleSource, /onLostPointerCapture=\{stopDoodleDirection\}/);
});

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

test("doodle generated platforms use smooth lane noise to stay horizontally distributed", () => {
  const source = readMiniGameConfigSource();
  const layout = generateDoodleWorldLayout(getMiniGameLevel("doodle", "doodle-base"), "spread-seed-40");
  const platforms = layout.platforms.slice(1);
  const xs = platforms.map((platform) => platform.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  let centerRun = 0;
  let maxCenterRun = 0;

  for (const x of xs) {
    if (x >= 130 && x <= 230) {
      centerRun += 1;
      maxCenterRun = Math.max(maxCenterRun, centerRun);
    } else {
      centerRun = 0;
    }
  }

  assert.match(source, /function makeDoodleNoisePoints\(rand: \(\) => number, count: number\)/);
  assert.match(source, /function doodleSmoothNoise\(points: number\[\], position: number\)/);
  assert.match(source, /const lanePattern = hardLayout \? \[0\.04, 0\.96, 0\.5, 0\.8, 0\.2\] : \[0\.04, 0\.96, 0\.5, 0\.8, 0\.2\];/);
  assert.ok(spread >= 200, `expected doodle platforms to span at least 200px horizontally, got ${spread}`);
  assert.ok(maxCenterRun <= 4, `expected no long centered platform run, got ${maxCenterRun}`);
  assert.ok(xs.some((x) => x <= 115), "expected at least one clearly left-side platform");
  assert.ok(xs.some((x) => x >= 245), "expected at least one clearly right-side platform");
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
