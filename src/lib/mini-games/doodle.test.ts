import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DOODLE_JUMP_VELOCITY,
  generateDoodleWorldLayout,
  getDoodleBounceVelocity,
  getDoodleJumpPeakHeight,
  getMiniGameLevel,
  selectVisibleDoodleHazards,
  selectVisibleDoodlePlatforms,
} from "./index.ts";
import {
  readMiniGameRuntimeSource,
  readMiniGameConfigSource,
  readAppCssSource,
  movementPatterns,
} from "./test-utils.ts";

test("doodle jump moves only while pressing the left or right half of the screen", () => {
  const componentSource = readMiniGameRuntimeSource();
  const doodleComponentSource = readFileSync(new URL("../../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const doodleSource = doodleComponentSource;

  assert.match(componentSource, /const DOODLE_PLAYER_SPEED = 315;/);
  assert.doesNotMatch(doodleSource, /controlXRef/);
  assert.doesNotMatch(doodleSource, /setControlFromPointer/);
  assert.doesNotMatch(doodleSource, /current\.playerX \+ \(controlXRef\.current - current\.playerX\)/);
  assert.match(doodleSource, /const inputDirectionRef = useRef\(0\);/);
  assert.match(doodleSource, /const inputPointerIdRef = useRef<number \| null>\(null\);/);
  assert.match(doodleSource, /const lastDoodleTurnDirectionRef = useRef\(0\);/);
  assert.match(doodleSource, /function chooseDoodleDirection\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(doodleSource, /const queueDoodleInputTurn = useCallback/);
  assert.match(doodleSource, /current\.playerTurns \+= turnDirection;/);
  assert.match(doodleSource, /const updateDoodleDirection = useCallback/);
  assert.match(doodleSource, /if \(inputPointerIdRef\.current !== event\.pointerId\) return;/);
  assert.match(componentSource, /jumpTurnAvailable: boolean;/);
  assert.match(doodleSource, /const direction = coOpRole \? \(coOpRole === "left" \? -1 : 1\) : chooseDoodleDirection\(event\);/);
  assert.match(doodleSource, /queueDoodleInputTurn\(direction\);/);
  assert.match(doodleSource, /inputDirectionRef\.current = direction;/);
  assert.doesNotMatch(doodleSource, /lastMoveDirectionRef/);
  assert.match(doodleSource, /inputPointerIdRef\.current = event\.pointerId;/);
  assert.match(doodleSource, /const stopDoodleDirection = useCallback/);
  assert.match(doodleSource, /inputDirectionRef\.current = 0;/);
  assert.match(doodleSource, /inputPointerIdRef\.current = null;/);
  assert.match(doodleSource, /makeDoodleRuntimeState\(runtimeRef\.current, world\.targetHeight, inputDirectionRef\.current\)/);
  assert.match(doodleSource, /usedPlatformIds: frame\.platforms\.filter\(\(platform\) => platform\.used\)\.map\(\(platform\) => platform\.id\)/);
  assert.match(doodleSource, /const usedPlatformIds = new Set\(authoritativeState\.usedPlatformIds \?\? \[\]\);/);
  assert.match(doodleSource, /syncDoodleRuntimeState\(performance\.now\(\), true\);/);
  assert.match(doodleSource, /coOpRole\?: "left" \| "right" \| null;/);
  assert.match(doodleSource, /mini-coop-hint/);
  assert.match(doodleSource, /你负责/);
  assert.match(doodleSource, /const inputDirection = resolveDoodleCoOpInputDirection\(inputDirectionRef\.current, coOpRole, coOpInputStateRef\.current\);/);
  assert.match(doodleSource, /const localCoOpDirection = !coOpRole \? clamp\(localDirection, -1, 1\) : localDirection === 0 \? 0 : coOpRole === "left" \? -1 : 1;/);
  assert.match(doodleSource, /const remoteCoOpDirection = coOpInputState\?\.direction === "left" \? -1 : coOpInputState\?\.direction === "right" \? 1 : 0;/);
  assert.match(doodleSource, /return clamp\(localCoOpDirection \+ remoteCoOpDirection, -1, 1\);/);
  assert.match(doodleSource, /coOpInputStateRef\.current = coOpInputState;[\s\S]*if \(\(coOpInputState\?\.direction \?\? "none"\) !== "none"\) startDoodle\(\);/);
  assert.match(doodleSource, /const turnDirection = inputDirection < 0 \? -1 : 1;/);
  assert.doesNotMatch(doodleSource, /if \(inputDirection !== 0 && jumpTurnAvailable\)/);
  assert.match(doodleSource, /jumpTurnAvailable = true;/);
  assert.match(doodleSource, /current\.jumpTurnAvailable = jumpTurnAvailable;/);
  assert.doesNotMatch(doodleSource, /if \(platform\.risk\) riskHit \+= 1;[\s\S]{0,120}playerTurns \+=/);
  assert.match(doodleSource, /current\.playerX = clamp\(current\.playerX \+ inputDirection \* DOODLE_PLAYER_SPEED \* delta/);
  assert.match(doodleSource, /onPointerMove=\{updateDoodleDirection\}/);
  assert.match(doodleSource, /onPointerUp=\{stopDoodleDirection\}/);
  assert.doesNotMatch(doodleSource, /onPointerLeave=\{stopDoodleDirection\}/);
  assert.match(doodleSource, /onPointerCancel=\{stopDoodleDirection\}/);
  assert.match(doodleSource, /onLostPointerCapture=\{stopDoodleDirection\}/);
  assert.match(doodleSource, /const playerShellStyle = \{/);
  assert.match(doodleSource, /clamp\(view\.playerX, PLAYER_SIZE \/ 2, logicStageWidth - PLAYER_SIZE \/ 2\) - PLAYER_SIZE \/ 2/);
  assert.match(doodleSource, /logicStageHeight - \(view\.playerY - view\.cameraY\) - PLAYER_SIZE \/ 2/);
  assert.match(doodleSource, /style=\{playerShellStyle\}/);
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
  assert.ok(spread >= 190, `expected doodle platforms to span at least 190px horizontally, got ${spread}`);
  assert.ok(maxCenterRun <= 4, `expected no long centered platform run, got ${maxCenterRun}`);
  assert.ok(xs.some((x) => x <= 115), "expected at least one clearly left-side platform");
  assert.ok(xs.some((x) => x >= 245), "expected at least one clearly right-side platform");
});

test("doodle start platform adapts to tall stages so the player is visible on entry", () => {
  const level = getMiniGameLevel("doodle", "doodle-base");
  const tall = generateDoodleWorldLayout(level, "tall-entry", { stageHeight: 1180, stageWidth: 752 });
  const start = tall.platforms.find((platform) => platform.start);

  assert.ok(start);
  assert.equal(start.y, 132);
  assert.equal(tall.startPlayerY, 148);
});

test("doodle normal jump covers two layers without overshooting far beyond them", () => {
  const source = readMiniGameRuntimeSource();
  const doodleSource = source.slice(source.indexOf("function DoodleJumpPrototype"), source.indexOf("function makeFlappyLayout"));
  const highestTwoLayerGap = 260;
  const peakHeight = getDoodleJumpPeakHeight(DOODLE_JUMP_VELOCITY);

  assert.ok(peakHeight >= highestTwoLayerGap, `expected normal jump peak >= ${highestTwoLayerGap}, got ${peakHeight.toFixed(1)}`);
  assert.ok(peakHeight <= highestTwoLayerGap + 24, `expected normal jump peak to stay near two layers, got ${peakHeight.toFixed(1)}`);
  assert.match(doodleSource, /current\.playerVy = DOODLE_JUMP_VELOCITY;/);
  assert.match(doodleSource, /nextVy = getDoodleBounceVelocity/);
  assert.doesNotMatch(doodleSource, /playerVy = 760/);
  assert.doesNotMatch(doodleSource, /nextVy = 760 \*/);
});

test("doodle high-risk platforms stay far enough below the finish platform", () => {
  for (const levelId of ["doodle-4", "doodle-5", "doodle-6", "doodle-10"]) {
    const level = getMiniGameLevel("doodle", levelId);
    const layout = generateDoodleWorldLayout(level, "risk-finish-spacing", {
      playerSize: 32,
      stageHeight: 640,
      stageWidth: 360,
    });
    const riskJumpPeak = getDoodleJumpPeakHeight(
      getDoodleBounceVelocity({
        risk: true,
        riskJumpMultiplier: Number(level.params.riskJumpMultiplier),
      }),
    );
    const minFinishGap = riskJumpPeak + 64;
    const minRiskGap = riskJumpPeak - 56;
    const riskPlatforms = layout.platforms.filter((platform) => platform.risk);

    assert.equal(riskPlatforms.length, Number(level.params.requiredRiskPlatforms), levelId);
    for (let index = 1; index < riskPlatforms.length; index += 1) {
      const previous = riskPlatforms[index - 1];
      const current = riskPlatforms[index];
      assert.ok(
        current.y - previous.y >= minRiskGap,
        `${levelId} high-risk platform ${index} should be at least ${Math.round(minRiskGap)}px after the previous one`,
      );
    }
    assert.ok(
      riskPlatforms.every((platform) => layout.targetHeight - platform.y >= minFinishGap),
      `${levelId} high-risk platforms should not sit within ${Math.round(minFinishGap)}px of the finish`,
    );
  }
});

test("doodle visible selectors cull used non-finish and off-screen world objects", () => {
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
  const usedFinishPlatform = { ...visiblePlatforms[0], finish: true, used: true };
  assert.deepEqual(
    selectVisibleDoodlePlatforms([usedFinishPlatform], { buffer: 80, cameraY: 640, stageHeight: 640 }),
    [usedFinishPlatform],
  );

  const visibleHazards = selectVisibleDoodleHazards(layout.hazards, {
    buffer: 80,
    cameraY: 640,
    stageHeight: 640,
  });
  assert.ok(visibleHazards.length < layout.hazards.length);
  assert.ok(visibleHazards.every((hazard) => hazard.y + hazard.size >= 560 && hazard.y - hazard.size <= 1360));
});

test("doodle hazards render far enough ahead to match collision checks during fast upward jumps", async () => {
  const miniGames = await import("./index.ts") as typeof import("./index.ts") & {
    getDoodleHazardVisibleBuffer?: (buffer: number) => number;
  };
  const runtimeSource = readMiniGameRuntimeSource();
  const fastJumpTravel = getDoodleBounceVelocity({ risk: true, riskJumpMultiplier: 1.6 }) * 0.12;
  const movingHazardVerticalDrift = 64;
  const requiredBuffer = Math.ceil(fastJumpTravel + movingHazardVerticalDrift);

  assert.equal(typeof miniGames.getDoodleHazardVisibleBuffer, "function");
  assert.ok(
    miniGames.getDoodleHazardVisibleBuffer(96) >= requiredBuffer,
    `expected low-power hazard buffer to cover ${requiredBuffer}px of render-ahead`,
  );
  assert.ok(
    miniGames.getDoodleHazardVisibleBuffer(160) >= requiredBuffer,
    `expected normal hazard buffer to cover ${requiredBuffer}px of render-ahead`,
  );
  assert.equal(miniGames.getDoodleHazardVisibleBuffer(400), 400);
  assert.match(runtimeSource, /getDoodleHazardVisibleBuffer,/);
  assert.match(runtimeSource, /visibleHazards: selectVisibleDoodleHazards\(frame\.hazards, \{\s*buffer: getDoodleHazardVisibleBuffer\(buffer\),/);
  assert.match(runtimeSource, /visiblePlatforms: selectVisibleDoodlePlatforms\(frame\.platforms, \{\s*buffer,/);
});

test("doodle completion uses a highest finish platform instead of a height line", () => {
  const level = getMiniGameLevel("doodle", "doodle-base");
  const layout = generateDoodleWorldLayout(level, "finish-platform");
  const finishPlatforms = layout.platforms.filter((platform) => platform.finish);
  const finish = finishPlatforms[0];
  const highestY = Math.max(...layout.platforms.map((platform) => platform.y));
  const runtimeSource = readMiniGameRuntimeSource();
  const cssSource = readAppCssSource();
  const doodleSource = runtimeSource.slice(runtimeSource.indexOf("function DoodleJumpPrototype"), runtimeSource.indexOf("function makeFlappyLayout"));
  const updateDomSource = doodleSource.slice(
    doodleSource.indexOf("for (const [id, node] of platformRefs.current)"),
    doodleSource.indexOf("for (const [id, node] of hazardRefs.current)"),
  );

  assert.equal(finishPlatforms.length, 1);
  assert.equal(finish.y, layout.targetHeight);
  assert.equal(finish.y, highestY);
  assert.equal(finish.risk, false);
  assert.equal(finish.moving, false);
  assert.match(runtimeSource, /let landedFinishPlatform = false;/);
  assert.match(runtimeSource, /landedFinishPlatform = platform\.finish === true;/);
  assert.match(runtimeSource, /if \(status === "playing" && landedFinishPlatform\)/);
  assert.match(updateDomSource, /\(platform\.used && !platform\.finish\)/);
  assert.doesNotMatch(updateDomSource, /!platform \|\| platform\.used/);
  assert.doesNotMatch(runtimeSource, /nextY >= world\.targetHeight/);
  assert.doesNotMatch(runtimeSource, /className="doodle-progress-line"/);
  assert.match(cssSource, /\.doodle-platform\.finish/);
  assert.match(cssSource, /\.doodle-platform\.finish::after/);
});

test("finish platforms are not hidden after landing in fall down or square jump", () => {
  const runtimeSource = readMiniGameRuntimeSource();
  const fallDownSource = runtimeSource.slice(runtimeSource.indexOf("function FallDownPrototype"), runtimeSource.indexOf("function makeDoodleWorld"));
  const squareJumpSource = runtimeSource.slice(runtimeSource.indexOf("export function SquareJumpPrototype"));
  const fallDownDomSource = fallDownSource.slice(
    fallDownSource.indexOf("for (const [id, node] of fallPlatformRefs.current)"),
    fallDownSource.indexOf("for (const [id, node] of fallHazardRefs.current)"),
  );
  const squareAdvanceSource = squareJumpSource.slice(
    squareJumpSource.indexOf("const landedPlatform = { ...current.nextPlatform };"),
    squareJumpSource.indexOf("const cameraStart = { ...current.camera };"),
  );

  assert.match(fallDownDomSource, /if \(!platform \|\| platform\.broken\)/);
  assert.doesNotMatch(fallDownDomSource, /platform\.kind === "finish"[\s\S]{0,120}display = "none"/);
  assert.match(fallDownSource, /platform\.kind === "finish"[\s\S]*?paintFallDownFrame\(current\);/);
  assert.match(squareAdvanceSource, /const landedPlatform = \{ \.\.\.current\.nextPlatform \};/);
  assert.match(squareAdvanceSource, /current\.currentPlatform = landedPlatform;/);
  assert.match(squareAdvanceSource, /if \(nextJumps >= requiredJumps\) \{[\s\S]*?current\.status = "passed";/);
  assert.match(runtimeSource, /selectSquareJumpVisiblePlatforms\(view\.currentPlatform, view\.nextPlatform, view\.exitingPlatform\)/);
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

test("doodle base and multiplayer respawn on the last safe platform and ease the camera back", () => {
  const componentSource = readMiniGameRuntimeSource();
  const doodleSource = readFileSync(new URL("../../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const endlessRecoverySource = doodleSource.slice(
    doodleSource.indexOf("function recoverEndlessDoodleFailure"),
    doodleSource.indexOf("function resolveDoodleCoOpInputDirection"),
  );

  assert.match(componentSource, /lastSafePlatformId: number \| null;/);
  assert.match(componentSource, /function resolveDoodleLastSafePlatform/);
  assert.match(doodleSource, /function syncDoodleRespawnPlayerWithPlatform/);
  assert.match(doodleSource, /const safeRespawnPlatform = resolveDoodleLastSafePlatform\(current\);/);
  assert.match(doodleSource, /current\.playerX = movingPlatformX\(safeRespawnPlatform, nextTime, logicStageWidth\);/);
  assert.match(doodleSource, /current\.playerY = safeRespawnPlatform\.y \+ PLAYER_SIZE \/ 2;/);
  assert.match(doodleSource, /safeRespawnPlatform\.used = false;/);
  assert.match(doodleSource, /current\.cameraY = smoothDoodleRespawnCamera/);
  assert.match(doodleSource, /respawnAwaitingInput: boolean;/);
  assert.match(doodleSource, /current\.respawnAwaitingInput = true;/);
  assert.match(doodleSource, /if \(current\.respawnAwaitingInput && current\.time < current\.respawnCameraUntil\) return;/);
  assert.match(doodleSource, /if \(!current\.started\) \{\s*current\.time \+= delta;/);
  assert.match(doodleSource, /syncDoodleRespawnPlayerWithPlatform\(current, current\.time, logicStageWidth\);/);
  assert.match(doodleSource, /frame\.playerX = movingPlatformX\(safePlatform, time, stageWidth\);/);
  assert.doesNotMatch(doodleSource, /if \(current\.respawnAwaitingInput && current\.time < current\.respawnCameraUntil\) \{\s*current\.time \+= delta;/);
  assert.match(doodleSource, /current\.playerVy = 0;/);
  assert.match(doodleSource, /current\.started = false;/);
  assert.match(doodleSource, /current\.jumpTurnAvailable = false;/);
  assert.doesNotMatch(doodleSource, /current\.playerVy = DOODLE_JUMP_VELOCITY;\s*current\.jumpTurnAvailable = true;\s*const respawnCameraY/);
  assert.doesNotMatch(doodleSource, /const respawnY = cameraY \+ logicStageHeight \* 0\.34;/);
  assert.doesNotMatch(doodleSource, /current\.platforms\.unshift\(respawnPlatform\);/);
  assert.match(endlessRecoverySource, /const safeRespawnPlatform = resolveDoodleLastSafePlatform\(current\);/);
  assert.match(endlessRecoverySource, /safeRespawnPlatform\.used = false;/);
  assert.match(endlessRecoverySource, /syncDoodleRespawnPlayerWithPlatform\(current, time, stageWidth\);/);
  assert.match(endlessRecoverySource, /current\.playerVy = 0;/);
  assert.match(endlessRecoverySource, /current\.started = false;/);
  assert.match(endlessRecoverySource, /current\.jumpTurnAvailable = false;/);
  assert.match(endlessRecoverySource, /current\.respawnAwaitingInput = true;/);
  assert.doesNotMatch(endlessRecoverySource, /DOODLE_JUMP_VELOCITY/);
  assert.doesNotMatch(endlessRecoverySource, /current\.started = true/);
  assert.doesNotMatch(endlessRecoverySource, /current\.platforms\.unshift/);
});

test("doodle unlimited respawn race mode ignores missed risk platforms", () => {
  const doodleSource = readFileSync(new URL("../../features/mini-games/doodle.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /if \(status === "playing" && !isEndlessRun && !unlimitedRespawn && riskHit < riskTotal\)/);
  assert.match(doodleSource, /if \(riskHit >= riskTotal \|\| unlimitedRespawn\) \{/);
  assert.match(doodleSource, /reason = unlimitedRespawn \? "站上最高终点平台" : `站上最高终点平台，必踩平台 \$\{riskHit\}\/\$\{riskTotal\}`/);
});
test("endless doodle awards extra score after three consecutive high-energy jumps", () => {
  const doodleSource = readFileSync(new URL("../../features/mini-games/doodle.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /highEnergyStreak: number;/);
  assert.match(doodleSource, /let highEnergyStreak = current\.highEnergyStreak;/);
  assert.match(doodleSource, /const highEnergyJump = platform\.risk \|\| powerReleaseActive;/);
  assert.match(doodleSource, /highEnergyStreak = highEnergyJump \? highEnergyStreak \+ 1 : 0;/);
  assert.match(doodleSource, /if \(isEndlessRun && highEnergyStreak >= 3\) \{/);
  assert.match(doodleSource, /endlessRef\.current\?\.awardSpecialBonus\(\{ label: `彻底疯狂\$\{highEnergyStreak\}！`, amount: 1 \}\);/);
  assert.doesNotMatch(doodleSource, /endlessRef\.current\?\.showFeedback\(`彻底疯狂\$\{highEnergyStreak\}`\);/);
  assert.match(doodleSource, /current\.highEnergyStreak = highEnergyStreak;/);
  assert.match(doodleSource, /current\.highEnergyStreak = 0;/);
});

test("endless doodle removes finite finish platforms so difficulty segment boundaries stay normal sized", () => {
  const doodleSource = readFileSync(new URL("../../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const runtimeSource = readMiniGameRuntimeSource();

  assert.match(doodleSource, /function normalizeEndlessDoodlePlatforms/);
  assert.match(doodleSource, /finish:\s*false/);
  assert.match(doodleSource, /width:\s*Math\.min\(platform\.width, ENDLESS_DOODLE_MAX_NORMAL_PLATFORM_WIDTH\)/);
  assert.match(doodleSource, /normalizeEndlessDoodlePlatforms\(world\.platforms\)/);
  assert.match(doodleSource, /normalizeEndlessDoodlePlatforms\(segment\.platforms/);
  assert.doesNotMatch(doodleSource, /current\.platforms\.push\(\{[\s\S]{0,180}\.\.\.platform,[\s\S]{0,180}finish:\s*platform\.finish/);
  assert.match(runtimeSource, /ENDLESS_DOODLE_MAX_NORMAL_PLATFORM_WIDTH = 104/);
});
