import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceFallDownCamera,
  constrainFallDownRecoveryRuns,
  expireFallDownFragilePlatform,
  getMiniGame,
  getMiniGameLevel,
  getMiniGameLevels,
  restoreFallDownFragilePlatformsForRespawn,
  resolveFallDownCameraBounds,
  type MiniGameId,
} from "./index.ts";
import {
  readMiniGameRuntimeSource,
  readAppCssSource,
} from "./test-utils.ts";

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
    assert.equal(level.params.implementation, "fall-down");
    assert.ok(Number(level.params.layersRequired) >= 10);
    assert.ok(Number(level.params.platformGapMin) > 0);
    assert.ok(Number(level.params.platformGapMax) >= Number(level.params.platformGapMin));
    assert.equal(level.params.playerSpeed, 288);
    assert.ok(Number(level.params.topPressureSpeed) > 0);
  }

  assert.equal(base.params.layersRequired, 10);
  assert.match(base.goalText, /10/);
  assert.equal(base.params.movingPlatformCount, 0);
  assert.equal(base.params.fragilePlatformCount, 0);
  assert.equal(base.params.dangerPlatformCount, 0);
  assert.equal(base.params.playerSpeed, 288);
  assert.equal(base.params.topPressureSpeed, 50);
  assert.equal(base.params.fallingHazardCount, 0);
  assert.equal(movingEasy.params.layersRequired, 14);
  assert.equal(movingEasy.params.topPressureSpeed, 52);
  assert.equal(movingEasy.params.movingPlatformCount, 7);
  assert.equal(movingEasy.params.movingRange, 52);
  assert.equal(movingEasy.params.fallingHazardCount, 0);
  assert.equal(movingEasy.params.ledgePlatformCount, 0);
  assert.equal(movingNormal.params.layersRequired, 18);
  assert.equal(movingNormal.params.topPressureSpeed, 64);
  assert.equal(movingNormal.params.movingPlatformCount, 11);
  assert.equal(movingNormal.params.movingRange, 68);
  assert.equal(movingNormal.params.fallingHazardCount, 2);
  assert.equal(movingHard.params.layersRequired, 22);
  assert.equal(movingHard.params.movingPlatformCount, 16);
  assert.ok(Number(movingHard.params.platformWidth) <= 72);
  assert.equal(movingHard.params.topPressureSpeed, 78);
  assert.equal(movingHard.params.movingRange, 88);
  assert.equal(movingHard.params.fallingHazardCount, 2);
  assert.ok(Number(movingHard.params.ledgePlatformCount) >= 5);
  assert.equal(fragileEasy.params.layersRequired, 14);
  assert.equal(fragileEasy.params.topPressureSpeed, 60);
  assert.equal(fragileEasy.params.fragilePlatformCount, 7);
  assert.equal(fragileEasy.params.fallingHazardCount, 0);
  assert.equal(fragileNormal.params.layersRequired, 18);
  assert.equal(fragileNormal.params.topPressureSpeed, 74);
  assert.equal(fragileNormal.params.fragilePlatformCount, 11);
  assert.equal(fragileNormal.params.fallingHazardCount, 2);
  assert.equal(fragileHard.params.layersRequired, 22);
  assert.equal(fragileHard.params.fragilePlatformCount, 16);
  assert.ok(Number(fragileHard.params.fragileTime) <= 1.1);
  assert.equal(fragileHard.params.topPressureSpeed, 88);
  assert.equal(fragileHard.params.fallingHazardCount, 2);
  assert.ok(Number(fragileHard.params.ledgePlatformCount) >= 5);
  assert.equal(dangerEasy.params.layersRequired, 14);
  assert.equal(dangerEasy.params.topPressureSpeed, 54);
  assert.equal(dangerEasy.params.dangerPlatformCount, 5);
  assert.equal(dangerEasy.params.fallingHazardCount, 0);
  assert.equal(dangerNormal.params.layersRequired, 18);
  assert.equal(dangerNormal.params.topPressureSpeed, 68);
  assert.equal(dangerNormal.params.dangerPlatformCount, 8);
  assert.equal(dangerNormal.params.fallingHazardCount, 2);
  assert.equal(dangerHard.params.layersRequired, 22);
  assert.equal(dangerHard.params.dangerPlatformCount, 11);
  assert.equal(dangerHard.params.topPressureSpeed, 82);
  assert.equal(dangerHard.params.fallingHazardCount, 2);
  assert.ok(Number(dangerHard.params.ledgePlatformCount) >= 5);
  assert.equal(final.params.finalMix, true);
  assert.equal(final.params.layersRequired, 30);
  assert.equal(final.params.topPressureSpeed, 88);
  assert.equal(final.params.movingPlatformCount, 12);
  assert.equal(final.params.fragilePlatformCount, 10);
  assert.equal(final.params.dangerPlatformCount, 10);
  assert.equal(final.params.movingRange, 86);
  assert.equal(final.params.fallingHazardCount, 4);
  assert.equal(final.params.ledgePlatformCount, 8);
  const fallDownGame = getMiniGame("fall-down" as MiniGameId);
  assert.doesNotMatch(`${fallDownGame.summary} ${fallDownGame.instruction} ${base.description}`, /按住/);
});

test("fall down base camera moves at constant speed and only top pressure fails by default", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));
  const globalCss = readAppCssSource();

  assert.equal(advanceFallDownCamera({ cameraY: 200, delta: 0.5, speed: 80 }), 240);
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 187, cameraY: 220, stageHeight: 640, squareSize: 32 }), {
    status: "failed",
    reason: "too-slow",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 254, cameraY: 220, stageHeight: 640, squareSize: 32, topFailLine: 34 }), {
    status: "failed",
    reason: "too-slow",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 255, cameraY: 220, stageHeight: 640, squareSize: 32, topFailLine: 34 }), {
    status: "playing",
    reason: "",
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
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 843, cameraY: 220, stageHeight: 640, squareSize: 32, bottomFailLine: 624 }), {
    status: "playing",
    reason: "",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 845, cameraY: 220, stageHeight: 640, squareSize: 32, bottomFailLine: 624 }), {
    status: "failed",
    reason: "too-deep",
  });
  assert.deepEqual(resolveFallDownCameraBounds({ playerWorldY: 810, cameraY: 220, stageHeight: 640, squareSize: 32, bottomFailLine: 590 }), {
    status: "failed",
    reason: "too-deep",
  });
  assert.match(componentSource, /const FALL_DOWN_DANGER_ZIGZAG_SIZE = 18;/);
  assert.match(componentSource, /const FALL_DOWN_DANGER_GRACE = 6;/);
  assert.match(fallDownSource, /topFailLine: FALL_DOWN_DANGER_ZIGZAG_SIZE \+ PLAYER_SIZE \/ 2 - FALL_DOWN_DANGER_GRACE/);
  assert.match(fallDownSource, /bottomFailLine: stageHeight - FALL_DOWN_DANGER_ZIGZAG_SIZE - PLAYER_SIZE \/ 2 \+ FALL_DOWN_DANGER_GRACE/);
  assert.doesNotMatch(fallDownSource, /fall-danger-line/);
  assert.doesNotMatch(globalCss, /\.fall-danger-line/);
});

test("fall down fragile platforms expire without directly failing the player", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));
  const globalCss = readAppCssSource();

  assert.deepEqual(expireFallDownFragilePlatform({ kind: "fragile", steppedAt: 1, now: 2.4, fragileTime: 1.2 }), {
    broken: true,
    directFailure: false,
  });
  assert.deepEqual(expireFallDownFragilePlatform({ kind: "normal", steppedAt: 1, now: 4, fragileTime: 1.2 }), {
    broken: false,
    directFailure: false,
  });
  assert.match(fallDownSource, /if \(screenY < -80 \|\| screenY > stageHeight \+ 80 \|\| platform\.broken\) return null;/);
  assert.doesNotMatch(fallDownSource, /fragileRatio|fall-crack|--fragile-ratio|fragileRatio > 0\.72/);
  assert.match(fallDownSource, /const fragileTime = numberParam\(level\.params, "fragileTime", 1\.2\);/);
  assert.match(fallDownSource, /const activeFragileTime = numberParam\(activeFallDownParams, "fragileTime", fragileTime\);/);
  assert.match(fallDownSource, /const viewFragileTime = numberParam\(viewFallDownParams, "fragileTime", fragileTime\);/);
  assert.match(fallDownSource, /const fragileWarning = platform\.kind === "fragile" && platform\.steppedAt !== null && view\.time - platform\.steppedAt >= Math\.max\(0, viewFragileTime - 0\.45\);/);
  assert.match(fallDownSource, /fragileWarning \? "fragile-warning" : ""/);
  assert.doesNotMatch(globalCss, /\.fall-crack/);
  assert.match(globalCss, /\.fall-platform\.kind-fragile \.fall-platform-top \{\s*background: #c7e1d1;\s*border-style: dashed;\s*\}/);
  assert.match(globalCss, /\.fall-platform\.fragile-warning \.fall-platform-top/);
  assert.match(globalCss, /@keyframes fall-fragile-warning/);
});

test("fall down moves only while pressing a side and skips landing animation", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));

  assert.doesNotMatch(fallDownSource, /prototype-start-button/);
  assert.doesNotMatch(fallDownSource, /prototype-start-hint fall-start-hint/);
  assert.doesNotMatch(fallDownSource, /按住左半屏|按住右半屏|按住左右半屏|按住屏幕/);
  assert.doesNotMatch(fallDownSource, /current\.vx \+= current\.inputDirection \* 1120 \* delta/);
  assert.doesNotMatch(fallDownSource, /if \(current\.inputDirection === 0\) current\.vx \*= 0\.84/);
  assert.doesNotMatch(fallDownSource, /fall-down-player-shell \$\{view\.feedback \? "landed" : ""\}/);
  assert.doesNotMatch(fallDownSource, /prototype-feedback/);
  assert.doesNotMatch(fallDownSource, /current\.feedback = platform\.id === requiredLayers/);
  assert.doesNotMatch(fallDownSource, /feedbackUntil/);
  assert.match(fallDownSource, /const fallDownInputDirectionRef = useRef<FallDownRuntime\["inputDirection"\]>\(0\);/);
  assert.match(fallDownSource, /const fallDownPointerIdRef = useRef<number \| null>\(null\);/);
  assert.match(fallDownSource, /const resumeFallDownInput = useCallback/);
  assert.match(fallDownSource, /current\.started = true;/);
  assert.doesNotMatch(fallDownSource, /current\.respawnUntil = 0;/);
  assert.match(fallDownSource, /current\.inputDirection = direction;/);
  assert.match(fallDownSource, /current\.vx = direction \* fallDownPlayerSpeed;/);
  assert.match(fallDownSource, /const restartDirection = resolveFallDownCoOpInputDirection\(fallDownInputDirectionRef\.current, coOpRole, coOpInputStateRef\.current\);/);
  assert.match(fallDownSource, /if \(restartDirection !== 0\) \{\s*resumeFallDownInput\(current, restartDirection\);/);
  assert.match(fallDownSource, /function chooseFallDownDirection\(event: ReactPointerEvent<HTMLDivElement>\)/);
  assert.match(fallDownSource, /fallDownInputDirectionRef\.current = direction;/);
  assert.match(fallDownSource, /resumeFallDownInput\(current, direction\);/);
  assert.match(fallDownSource, /if \(fallDownPointerIdRef\.current !== event\.pointerId\) return;/);
  assert.match(fallDownSource, /fallDownPointerIdRef\.current = event\.pointerId;/);
  assert.match(fallDownSource, /onPointerMove=\{updateFallDownDirection\}/);
  assert.doesNotMatch(fallDownSource, /onPointerLeave=\{stopDirection\}/);
  assert.match(fallDownSource, /onLostPointerCapture=\{stopDirection\}/);
  assert.match(fallDownSource, /const stopDirection = useCallback/);
  assert.match(fallDownSource, /fallDownInputDirectionRef\.current = 0;/);
  assert.match(fallDownSource, /fallDownPointerIdRef\.current = null;/);
  assert.match(fallDownSource, /makeFallDownRuntimeState\(runtimeRef\.current, requiredLayers, fallDownInputDirectionRef\.current\)/);
  assert.match(fallDownSource, /syncRuntimeState\(performance\.now\(\), true\);/);
  assert.match(fallDownSource, /coOpRole\?: "left" \| "right" \| null;/);
  assert.match(fallDownSource, /mini-coop-hint/);
  assert.match(fallDownSource, /你负责/);
  assert.match(componentSource, /const localCoOpDirection = !coOpRole \? clamp\(localDirection, -1, 1\) : localDirection === 0 \? 0 : coOpRole === "left" \? -1 : 1;/);
  assert.match(componentSource, /const remoteCoOpDirection = coOpInputState\?\.direction === "left" \? -1 : coOpInputState\?\.direction === "right" \? 1 : 0;/);
  assert.match(componentSource, /return clamp\(localCoOpDirection \+ remoteCoOpDirection, -1, 1\) as FallDownRuntime\["inputDirection"\];/);
  assert.match(fallDownSource, /const startDirection = resolveFallDownCoOpInputDirection\(fallDownInputDirectionRef\.current, coOpRole, coOpInputStateRef\.current\);/);
  assert.match(fallDownSource, /if \(startDirection !== 0\) \{[\s\S]*resumeFallDownInput\(current, startDirection\);/);
  assert.match(fallDownSource, /current\.inputDirection = 0;/);
  assert.match(fallDownSource, /current\.vx = 0;/);
  assert.match(fallDownSource, /onPointerUp=\{stopDirection\}/);
  assert.match(fallDownSource, /onPointerCancel=\{stopDirection\}/);
  assert.match(fallDownSource, /current\.vy = 0;/);
  assert.match(fallDownSource, /const previousTime = current\.time;/);
  assert.match(fallDownSource, /const platformById = new Map\(current\.platforms\.map/);
  assert.match(fallDownSource, /const carriedPlatform = platformById\.get\(current\.currentPlatformId\);/);
  assert.match(fallDownSource, /fallPlatformX\(carriedPlatform, current\.time, stageWidth\) - previousPlatformX/);
  assert.match(fallDownSource, /current\.playerX = clamp\(current\.playerX \+ current\.inputDirection \* fallDownPlayerSpeed \* delta/);
});

test("fall down respawn waits ride moving platforms before input resumes", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("type FallDownPlatformKind"), componentSource.indexOf("function makeDoodleWorld"));
  const respawnCarrySource = fallDownSource.slice(
    fallDownSource.indexOf("function carryFallDownMovingPlatformDuringRespawn"),
    fallDownSource.indexOf("function applyFallDownAuthoritativeState"),
  );
  const respawnCameraSource = fallDownSource.slice(
    fallDownSource.indexOf("const previousTime = current.time;"),
    fallDownSource.indexOf("if (!current.started && previousTime < current.respawnCameraUntil)"),
  );

  assert.match(respawnCarrySource, /if \(current\.started\) return;/);
  assert.match(respawnCarrySource, /carriedPlatform\.kind !== "moving"/);
  assert.match(respawnCarrySource, /fallPlatformX\(carriedPlatform, current\.time, stageWidth\) - previousPlatformX/);
  assert.match(respawnCameraSource, /carryFallDownMovingPlatformDuringRespawn\(current, previousTime, stageWidth\);/);
});

test("fall down maps its player visuals through the shared avatar without warning state", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("type FallDownPlatformKind"), componentSource.indexOf("function makeDoodleWorld"));
  const avatarStateSource = fallDownSource.slice(
    fallDownSource.indexOf("function resolveFallDownPlayerAvatarView"),
    fallDownSource.indexOf("function makeFallDownNoisePoints"),
  );
  const renderSource = fallDownSource.slice(
    fallDownSource.indexOf("className={`fall-down-player-shell"),
    fallDownSource.indexOf("{showOverlay ?", fallDownSource.indexOf("className={`fall-down-player-shell")),
  );

  assert.match(componentSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(componentSource, /type PlayerAvatarDirection/);
  assert.match(componentSource, /type PlayerAvatarView/);
  assert.match(fallDownSource, /function resolveFallDownPlayerDirection/);
  assert.match(avatarStateSource, /if \(view\.status === "failed"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(avatarStateSource, /if \(view\.status === "passed"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(avatarStateSource, /if \(view\.time < view\.respawnUntil\) return \{ action: "idle", expression: "neutral", effect: "shield" \};/);
  assert.match(avatarStateSource, /if \(view\.started && view\.inputDirection !== 0\) return \{ action: "move", expression: "neutral" \};/);
  assert.match(avatarStateSource, /return \{ action: "idle", expression: "neutral" \};/);
  assert.doesNotMatch(avatarStateSource, /return "warning";/);
  assert.doesNotMatch(avatarStateSource, /fragile|danger|fallingHazard|pressure/i);
  assert.match(renderSource, /<PlayerAvatar/);
  assert.match(renderSource, /\{\.\.\.resolveFallDownPlayerAvatarView\(view\)\}/);
  assert.match(renderSource, /direction=\{resolveFallDownPlayerDirection\(view\.inputDirection\)\}/);
  assert.match(renderSource, /visualScale=\{1\.18\}/);
  assert.doesNotMatch(renderSource, /prototype-player-box fall-down-player/);
});

test("fall down base recovery keeps the animation loop alive after a recoverable failure", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));
  const resumeInputSource = fallDownSource.slice(
    fallDownSource.indexOf("const resumeFallDownInput = useCallback"),
    fallDownSource.indexOf("const fail = useCallback"),
  );

  assert.match(fallDownSource, /const fail = useCallback\(\s*\(reason: string\): boolean =>/);
  assert.match(fallDownSource, /if \(\(mode === "base" \|\| unlimitedRespawn\) && recoverFallDownBaseFailure\(current, reason, logicStageSize, unlimitedRespawn, baseRevives, onBaseReviveUsed\)\) \{[\s\S]*?return true;/);
  assert.match(fallDownSource, /const continueAfterRecoverableFailure = \(reason: string\) => \{[\s\S]*?if \(fail\(reason\)\) \{[\s\S]*?frameId = requestAnimationFrame\(tick\);[\s\S]*?\}/);
  assert.match(fallDownSource, /continueAfterRecoverableFailure\(".*?"\);\s*return;/);
  assert.doesNotMatch(resumeInputSource, /respawnUntil\s*=\s*0/);
});

test("fall down base and multiplayer failures respawn on the last safe platform with smooth camera recovery", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("type FallDownPlatformKind"), componentSource.indexOf("function makeDoodleWorld"));
  const fallDownFailSource = fallDownSource.slice(fallDownSource.indexOf("const fail = useCallback"), fallDownSource.indexOf("function chooseFallDownDirection"));

  assert.match(fallDownSource, /failures: number;/);
  assert.match(fallDownSource, /respawnUntil: number;/);
  assert.match(fallDownSource, /lastSafePlatformId: number;/);
  assert.match(fallDownSource, /function recoverFallDownBaseFailure\([\s\S]*current: FallDownRuntime,[\s\S]*reason: string,[\s\S]*stageSize: MiniGameStageSize,[\s\S]*unlimitedRespawn = false,[\s\S]*\)/);
  assert.match(fallDownSource, /const failures = current\.failures \+ 1;/);
  assert.match(fallDownSource, /baseRevives === undefined \? failures >= BASE_FAILURE_LIMIT : failures > baseRevives/);
  assert.match(fallDownSource, /失败达到 3 次，进入下一关/);
  assert.match(fallDownSource, /const respawnPlatform = resolveFallDownLastSafePlatform\(current\);/);
  assert.match(fallDownSource, /current\.playerY = respawnPlatform\.y - PLAYER_SIZE \/ 2;/);
  assert.match(fallDownSource, /const respawnCameraY = Math\.min\(current\.cameraY, current\.playerY - stageSize\.height \* 0\.5\);/);
  assert.doesNotMatch(fallDownSource, /const respawnCameraY = Math\.max\(current\.cameraY, current\.playerY - stageSize\.height \* 0\.5\);/);
  assert.match(fallDownSource, /current\.cameraY = smoothFallDownRespawnCamera/);
  assert.match(fallDownSource, /current\.pressureWorldY = current\.respawnCameraStartY - PLAYER_SIZE;/);
  assert.match(fallDownSource, /if \(current\.time < current\.respawnCameraUntil\) \{/);
  assert.match(fallDownSource, /current\.pressureWorldY = current\.cameraY - PLAYER_SIZE;/);
  assert.match(fallDownSource, /const restartDirection = resolveFallDownCoOpInputDirection\(fallDownInputDirectionRef\.current, coOpRole, coOpInputStateRef\.current\);/);
  assert.match(fallDownSource, /if \(restartDirection !== 0\) \{/);
  assert.match(fallDownSource, /current\.respawnUntil = current\.time \+ 1\.1;/);
  assert.match(fallDownSource, /current\.started = false;/);
  assert.doesNotMatch(fallDownFailSource, /resumeFallDownInput\(current, fallDownInputDirectionRef\.current\);/);
  assert.match(fallDownSource, /\(mode === "base" \|\| unlimitedRespawn\) && recoverFallDownBaseFailure\(current, reason, logicStageSize, unlimitedRespawn, baseRevives, onBaseReviveUsed\)/);
  assert.match(fallDownSource, /failures: latest\.failures,/);
  assert.match(fallDownSource, /view\.time < view\.respawnUntil \? "respawn-warning" : ""/);
  assert.doesNotMatch(fallDownSource, /current\.platforms\.unshift\(respawnPlatform\);/);
  assert.match(fallDownSource, /platform\.kind !== "danger" && platform\.kind !== "finish" && platform\.kind !== "fragile"/);
  assert.doesNotMatch(fallDownSource, /respawnPlatform\.broken = false;/);
  assert.doesNotMatch(fallDownSource, /respawnPlatform\.steppedAt = null;/);
});

test("fall down endless recoveries reuse smooth respawn camera instead of snapping", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("type FallDownPlatformKind"), componentSource.indexOf("function makeDoodleWorld"));
  const endlessRecoverySource = fallDownSource.slice(
    fallDownSource.indexOf("function recoverEndlessFallDownFailure"),
    fallDownSource.indexOf("function carryFallDownMovingPlatformDuringRespawn"),
  );

  assert.match(endlessRecoverySource, /current\.started = false;/);
  assert.match(endlessRecoverySource, /const respawnCameraY = Math\.min\(current\.cameraY, current\.playerY - stageSize\.height \* 0\.5\);/);
  assert.match(endlessRecoverySource, /current\.respawnCameraStartY = current\.cameraY;/);
  assert.match(endlessRecoverySource, /current\.respawnCameraEndY = respawnCameraY;/);
  assert.match(endlessRecoverySource, /current\.respawnCameraStartedAt = current\.time;/);
  assert.match(endlessRecoverySource, /current\.respawnCameraUntil = current\.time \+ 0\.38;/);
  assert.match(endlessRecoverySource, /current\.cameraY = smoothFallDownRespawnCamera/);
  assert.doesNotMatch(endlessRecoverySource, /visibleTop|visibleBottom|Math\.max\(0,\s*current\.playerY - stageSize\.height \* 0\.46\)/);
});

test("fall down alone shows clean red danger zigzags on both screen edges", () => {
  const cssSource = readAppCssSource();
  const fallDownDangerCss = cssSource.slice(
    cssSource.indexOf(".prototype-stage.fall-down-stage::before"),
    cssSource.indexOf(".doodle-player-shell"),
  );

  assert.match(cssSource, /\.prototype-stage\.fall-down-stage::before,\s*\.prototype-stage\.fall-down-stage::after/);
  assert.doesNotMatch(cssSource, /\.prototype-stage\.doodle-stage::before|\.prototype-stage\.doodle-stage::after/);
  assert.match(fallDownDangerCss, /--fall-down-danger-zigzag/);
  assert.match(fallDownDangerCss, /rgba\(230,\s*83,\s*73,\s*0\.92\)/);
  assert.doesNotMatch(fallDownDangerCss, /repeating-linear-gradient/);
});

test("fall down platform layout varies by run seed", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("function fallDownPlatformKindBag"), componentSource.indexOf("function makeDoodleWorld"));

  assert.match(componentSource, /createSeededRandom/);
  assert.match(componentSource, /<FallDownPrototype[\s\S]*runSeed=\{runSeed\}/);
  assert.match(componentSource, /function FallDownPrototype\(\{[\s\S]*runSeed,/);
  assert.match(componentSource, /runSeed:\s*string;/);
  assert.match(fallDownSource, /createSeededRandom\(`\$\{level\.levelId\}:\$\{runSeed\}:fall-down-platforms`\)/);
  assert.match(componentSource, /function makeFallDownNoisePoints\(rand: \(\) => number, count: number\)/);
  assert.match(componentSource, /function fallDownSmoothNoise\(points: number\[\], position: number\)/);
  assert.match(fallDownSource, /function makeFallDownPlatforms\(level: MiniGameLevelConfig, runSeed: string, stageWidth: number\): FallDownPlatform\[\]/);
  assert.match(fallDownSource, /const kindBag = fallDownPlatformKindBag\(level, layersRequired, rand\);/);
  assert.match(fallDownSource, /kindBag\[index - 1\] \?\? "normal"/);
  assert.doesNotMatch(fallDownSource, /kindBag\.splice\(Math\.floor\(rand\(\) \* kindBag\.length\), 1\)\[0\]/);
  assert.match(fallDownSource, /const gapNoise = fallDownSmoothNoise\(gapNoisePoints, index \* 0\.61\);/);
  assert.match(fallDownSource, /const xNoise = fallDownSmoothNoise\(xNoisePoints, index \* 0\.47\);/);
  assert.match(fallDownSource, /const widthNoise = fallDownSmoothNoise\(widthNoisePoints, index \* 0\.53\);/);
  assert.match(fallDownSource, /const lanePattern = \[0\.16, 0\.84, 0\.5\];/);
  assert.match(fallDownSource, /const lane = \(index \+ laneOffset\) % lanePattern\.length;/);
  assert.match(fallDownSource, /const spreadTargetRatio = clamp\(lanePattern\[lane\] \+ \(xNoise - 0\.5\) \* 0\.3, 0\.1, 0\.9\);/);
  assert.match(fallDownSource, /phase: rand\(\) \* Math\.PI \* 2/);
  assert.match(fallDownSource, /createFallDownRuntime\(level: MiniGameLevelConfig, runSeed: string, stageSize: MiniGameStageSize\)/);
  assert.match(fallDownSource, /makeFallDownPlatforms\(level, runSeed, stageSize\.width\)/);
  assert.match(fallDownSource, /createFallDownRuntime\(level, runSeed, logicStageSize\)/);
});

test("fall down restores fragile platforms when respawning", () => {
  const platforms = [
    { id: 1, kind: "fragile", steppedAt: 1.2, broken: true },
    { id: 2, kind: "danger", steppedAt: 2.4, broken: false },
    { id: 3, kind: "normal", steppedAt: null, broken: false },
  ];

  restoreFallDownFragilePlatformsForRespawn(platforms);

  assert.deepEqual(platforms, [
    { id: 1, kind: "fragile", steppedAt: null, broken: false },
    { id: 2, kind: "danger", steppedAt: 2.4, broken: false },
    { id: 3, kind: "normal", steppedAt: null, broken: false },
  ]);
});

test("fall down final layouts avoid three consecutive unsafe recovery layers", () => {
  const constrained = constrainFallDownRecoveryRuns(
    ["danger", "danger", "danger", "fragile", "fragile", "normal", "moving"],
    () => 0,
  );

  for (let index = 0; index <= constrained.length - 3; index += 1) {
    const run = constrained.slice(index, index + 3);
    assert.ok(run.some((kind) => kind !== "danger" && kind !== "fragile"), run.join(","));
  }
});

test("fall down adds falling hazards and L platforms without more than two consecutive unsafe recovery layers", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("function fallDownPlatformKindBag"), componentSource.indexOf("function makeDoodleWorld"));

  assert.match(componentSource, /type FallDownPlatformShape = "flat" \| "l-left" \| "l-right"/);
  assert.match(componentSource, /type FallDownFallingHazard = \{/);
  assert.match(componentSource, /fallingHazards: FallDownFallingHazard\[\]/);
  assert.match(componentSource, /constrainFallDownRecoveryRuns\(kindBag, rand\)/);
  assert.doesNotMatch(componentSource, /dangerRun > 3/);
  assert.doesNotMatch(componentSource, /constrainFallDownDangerRuns/);
  assert.match(fallDownSource, /function makeFallDownFallingHazards\(level: MiniGameLevelConfig, runSeed: string, stageSize: MiniGameStageSize\): FallDownFallingHazard\[\]/);
  assert.match(fallDownSource, /function fallDownFallingHazardScreenY\(hazard: FallDownFallingHazard, time: number, stageHeight: number\)/);
  assert.match(fallDownSource, /function fallDownFallingHazardX\(hazard: FallDownFallingHazard, time: number, stageWidth: number\)/);
  assert.match(componentSource, /const FALL_DOWN_FALLING_HAZARD_HITBOX_SCALE = 0\.72;/);
  assert.match(fallDownSource, /function fallDownFallingHazardHitboxRadius\(hazard: FallDownFallingHazard\)/);
  assert.match(fallDownSource, /fallingHazards: makeFallDownFallingHazards\(level, runSeed, stageSize\)/);
  assert.match(fallDownSource, /for \(const hazard of current\.fallingHazards\)/);
  assert.match(fallDownSource, /fall-down-falling-hazard/);
  assert.match(fallDownSource, /const hazardDistance = Math\.hypot\(current\.playerX - hazardX, playerScreenY - hazardY\);/);
  assert.doesNotMatch(fallDownSource, /Math\.abs\(playerScreenY - hazardY\) <= PLAYER_SIZE \/ 2 \+ hazard\.size \/ 2 - 2/);
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
  assert.match(fallDownSource, /function resolveFallDownLedgeShape\(/);
  assert.match(fallDownSource, /if \(kind !== "moving" && x < stageWidth \* 0\.34\) return "l-left";/);
  assert.match(fallDownSource, /if \(kind !== "moving" && x > stageWidth \* 0\.66\) return "l-right";/);
  assert.match(fallDownSource, /rand\(\) < 0\.5 \? "l-left" : "l-right"/);
  assert.match(fallDownSource, /resolveFallDownLedgeShape\(\{[\s\S]*baseShape[\s\S]*kind[\s\S]*stageWidth[\s\S]*x[\s\S]*\}\)/);
  assert.match(fallDownSource, /platform\.shape !== "flat" && platform\.id === view\.currentPlatformId/);
  assert.match(fallDownSource, /left: platform\.shape === "l-left" \? `-\$\{FALL_DOWN_LEDGE_WIDTH - 2\}px` : undefined/);
  assert.match(fallDownSource, /right: platform\.shape === "l-right" \? `-\$\{FALL_DOWN_LEDGE_WIDTH - 2\}px` : undefined/);
  assert.match(fallDownSource, /top: `-\$\{FALL_DOWN_LEDGE_HEIGHT - 2\}px`/);
  assert.doesNotMatch(fallDownSource, /top: "2px"/);
});
