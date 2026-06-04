import assert from "node:assert/strict";
import test from "node:test";

import * as miniGames from "./index.ts";
import {
  generateFlappyGateLayout,
  getFlappyInitialPlacement,
  getFlappyPlayerScreenX,
  getFlappyGateScreenX,
  getMiniGameLevel,
  selectVisibleFlappyGates,
} from "./index.ts";
import { readAppCssSource, readMiniGameRuntimeSource } from "./test-utils.ts";

type FlappySafeRespawnResolver = (options: {
  fallbackBacktrack?: number;
  gates: readonly { distance: number; passed?: boolean }[];
  gateWidth: number;
  invincibleForwardTravelDistance?: number;
  nextProgress: number;
  playerSize: number;
  playerX: number;
  reverseDirection: boolean;
  safeApproachDistance?: number;
  stageWidth: number;
}) => number;

function getSafeRespawnResolver() {
  const resolver = (miniGames as typeof miniGames & {
    resolveFlappySafeRespawnProgress?: FlappySafeRespawnResolver;
  }).resolveFlappySafeRespawnProgress;
  assert.equal(typeof resolver, "function");
  return resolver;
}

test("flappy levels encode gates, collectibles, gravity inversion, and final rules", () => {
  assert.equal(getMiniGameLevel("flappy", "flappy-base").params.gateCount, 6);
  assert.equal(getMiniGameLevel("flappy", "flappy-1").params.gateCount, 8);
  assert.equal(getMiniGameLevel("flappy", "flappy-2").params.movingGateRatio, 0.5);
  assert.equal(getMiniGameLevel("flappy", "flappy-3").params.movingGateRatio, 0.7);

  assert.equal(getMiniGameLevel("flappy", "flappy-4").params.collectibleCount, 4);
  assert.equal(getMiniGameLevel("flappy", "flappy-6").params.collectibleCount, 8);

  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.reversedGravity, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.reverseDirection, false);
  assert.equal(getMiniGameLevel("flappy", "flappy-7").title, "重力倒转");
  assert.equal(getMiniGameLevel("flappy", "flappy-7").variant, "重力倒转");
  assert.doesNotMatch(getMiniGameLevel("flappy", "flappy-7").description, /从右往左|反向移动/);
  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.movingGateRatio, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-7").params.collectibleCount, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.reversedGravity, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.reverseDirection, false);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").title, "重力倒转");
  assert.equal(getMiniGameLevel("flappy", "flappy-8").variant, "重力倒转");
  assert.doesNotMatch(getMiniGameLevel("flappy", "flappy-8").description, /从右往左|反向移动/);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.movingGateRatio, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-8").params.collectibleCount, 0);
  assert.equal(getMiniGameLevel("flappy", "flappy-9").params.reversedGravity, true);
  assert.equal(getMiniGameLevel("flappy", "flappy-9").params.reverseDirection, false);
  assert.equal(getMiniGameLevel("flappy", "flappy-9").title, "重力倒转");
  assert.equal(getMiniGameLevel("flappy", "flappy-9").variant, "重力倒转");
  assert.doesNotMatch(getMiniGameLevel("flappy", "flappy-9").description, /从右往左|反向移动/);
  assert.equal(getMiniGameLevel("flappy", "flappy-9").params.movingGateRatio, 0);

  const final = getMiniGameLevel("flappy", "flappy-10");
  assert.equal(final.params.reverseDirection, false);
  assert.equal(final.params.reversedGravity, true);
  assert.doesNotMatch(final.description, /从右往左|反向移动/);
  assert.equal(final.params.gateCount, 13);
  assert.equal(final.params.collectibleCount, 7);
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

test("flappy keeps the player anchored while the camera display eases to respawn", () => {
  assert.equal(
    getFlappyPlayerScreenX({
      displayProgress: 360,
      playerX: 92,
      progress: 360,
      reverseDirection: false,
    }),
    92,
  );
  assert.equal(
    getFlappyPlayerScreenX({
      displayProgress: 452,
      playerX: 92,
      progress: 360,
      reverseDirection: false,
    }),
    92,
  );
  assert.equal(
    getFlappyPlayerScreenX({
      displayProgress: 452,
      playerX: 308,
      progress: 360,
      reverseDirection: true,
    }),
    308,
  );
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

test("flappy generated moving gates freeze their own speed and gap at spawn time", () => {
  const movingLevel = {
    ...getMiniGameLevel("flappy", "flappy-3"),
    params: {
      ...getMiniGameLevel("flappy", "flappy-3").params,
      gapSize: 158,
      movingGateRatio: 1,
      movingGateSpeed: 2.45,
    },
  };
  const layout = generateFlappyGateLayout(movingLevel, "moving-speed-freeze");

  assert.ok(layout.gates.length > 0);
  assert.equal(layout.gates.every((gate) => gate.moving), true);
  assert.equal(layout.gates.every((gate) => gate.gapSize === 158), true);
  assert.equal(layout.gates.every((gate) => gate.movingSpeed === 2.45), true);
});

test("flappy safe respawn backs up far enough before the blocking gate", () => {
  const resolveFlappySafeRespawnProgress = getSafeRespawnResolver();
  const gate = { distance: 250 };
  const playerX = 92;
  const stageWidth = 360;
  const gateWidth = 54;
  const playerSize = 32;
  const nextProgress = stageWidth + gate.distance - (playerX - 8);
  const fixedBacktrackProgress = Math.max(0, nextProgress - 92);
  const fixedGateX = getFlappyGateScreenX(gate, {
    progress: fixedBacktrackProgress,
    reverseDirection: false,
    stageWidth,
  });

  assert.ok(fixedGateX < playerX + playerSize / 2 + 140);

  const safeProgress = resolveFlappySafeRespawnProgress({
    gates: [gate],
    gateWidth,
    nextProgress,
    playerSize,
    playerX,
    reverseDirection: false,
    safeApproachDistance: 140,
    stageWidth,
  });
  const safeGateX = getFlappyGateScreenX(gate, {
    progress: safeProgress,
    reverseDirection: false,
    stageWidth,
  });

  assert.ok(safeProgress <= fixedBacktrackProgress);
  assert.ok(safeGateX >= playerX + playerSize / 2 + 140);
});

test("flappy default safe respawn stays close to the failure point when no gate blocks it", () => {
  const resolveFlappySafeRespawnProgress = getSafeRespawnResolver();
  const nextProgress = 520;

  const safeProgress = resolveFlappySafeRespawnProgress({
    gates: [],
    gateWidth: 54,
    nextProgress,
    playerSize: 32,
    playerX: 92,
    reverseDirection: false,
    stageWidth: 360,
  });

  assert.ok(safeProgress >= nextProgress - 36);
  assert.ok(safeProgress <= nextProgress - 20);
});

test("flappy safe respawn also keeps reverse-direction gates away from the player", () => {
  const resolveFlappySafeRespawnProgress = getSafeRespawnResolver();
  const gate = { distance: 250 };
  const stageWidth = 360;
  const playerX = stageWidth - 92;
  const gateWidth = 54;
  const playerSize = 32;
  const nextProgress = gate.distance + playerX - 8;
  const fixedBacktrackProgress = Math.max(0, nextProgress - 92);
  const fixedGateX = getFlappyGateScreenX(gate, {
    progress: fixedBacktrackProgress,
    reverseDirection: true,
    stageWidth,
  });

  assert.ok(fixedGateX + gateWidth > playerX - playerSize / 2 - 140);

  const safeProgress = resolveFlappySafeRespawnProgress({
    gates: [gate],
    gateWidth,
    nextProgress,
    playerSize,
    playerX,
    reverseDirection: true,
    safeApproachDistance: 140,
    stageWidth,
  });
  const safeGateX = getFlappyGateScreenX(gate, {
    progress: safeProgress,
    reverseDirection: true,
    stageWidth,
  });

  assert.ok(safeProgress <= fixedBacktrackProgress);
  assert.ok(safeGateX + gateWidth <= playerX - playerSize / 2 - 140);
});

test("flappy safe respawn uses only a small invincibility buffer instead of a long backtrack", () => {
  const resolveFlappySafeRespawnProgress = getSafeRespawnResolver();
  const gate = { distance: 250 };
  const playerX = 92;
  const stageWidth = 360;
  const gateWidth = 54;
  const playerSize = 32;
  const nextProgress = stageWidth + gate.distance - (playerX - 8);
  const safeApproachDistance = 44;
  const invincibleForwardTravelDistance = 118 * 1.15;

  const safeProgress = resolveFlappySafeRespawnProgress({
    gates: [gate],
    gateWidth,
    invincibleForwardTravelDistance,
    nextProgress,
    playerSize,
    playerX,
    reverseDirection: false,
    safeApproachDistance,
    stageWidth,
  });
  const safeGateX = getFlappyGateScreenX(gate, {
    progress: safeProgress,
    reverseDirection: false,
    stageWidth,
  });

  assert.ok(safeGateX >= playerX + playerSize / 2 + safeApproachDistance);
  assert.ok(safeGateX < playerX + playerSize / 2 + safeApproachDistance + 48);
  assert.ok(nextProgress - safeProgress < 96);
});

test("flappy recoverable failures use safe respawn instead of a fixed backtrack", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));

  assert.match(flappyRuntimeSource, /resolveFlappySafeRespawnProgress/);
  assert.match(componentSource, /const FLAPPY_RESPAWN_CAMERA_SECONDS = 0\.45;/);
  assert.match(componentSource, /const FLAPPY_RESPAWN_FORWARD_TRAVEL_BUFFER_SECONDS = 0\.28;/);
  assert.match(componentSource, /function getFlappyRespawnForwardTravelDistance\(speed: number\)/);
  assert.match(flappyRuntimeSource, /invincibleForwardTravelDistance:\s*getFlappyRespawnForwardTravelDistance\(speed\)/);
  assert.match(flappyRuntimeSource, /respawnProgressUntil = nextTime \+ FLAPPY_RESPAWN_CAMERA_SECONDS/);
  assert.doesNotMatch(flappyRuntimeSource, /invincibleForwardTravelDistance:\s*speed \* FLAPPY_RESPAWN_INVINCIBLE_SECONDS/);
  assert.doesNotMatch(flappyRuntimeSource, /Math\.max\(0, nextProgress - 92\)/);
});

test("endless flappy life recovery shares the safe respawn path", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const recoverySource = componentSource.slice(componentSource.indexOf("function recoverEndlessFlappyFailure"), componentSource.indexOf("function makeFlappyView"));
  const endlessFailureSource = flappyRuntimeSource.slice(
    flappyRuntimeSource.indexOf("if (isEndlessRun && status === \"failed\")"),
    flappyRuntimeSource.indexOf("if (mode === \"base\" && status === \"failed\")"),
  );

  assert.match(recoverySource, /resolveFlappySafeRespawnProgress/);
  assert.match(recoverySource, /invincibleForwardTravelDistance:\s*getFlappyRespawnForwardTravelDistance\(speed\)/);
  assert.match(recoverySource, /current\.started = false;/);
  assert.match(recoverySource, /current\.respawnProgressUntil = time \+ FLAPPY_RESPAWN_CAMERA_SECONDS;/);
  assert.match(recoverySource, /current\.invincibleUntil = time \+ FLAPPY_RESPAWN_INVINCIBLE_SECONDS;/);
  assert.match(endlessFailureSource, /speed:\s*activeSpeed,/);
  assert.match(endlessFailureSource, /respawnY:\s*activeInitialPlayerY,/);
  assert.doesNotMatch(endlessFailureSource, /respawnY:\s*endlessRecoveryY \?\? activeInitialPlayerY/);
  assert.match(endlessFailureSource, /stageWidth,/);
});

test("flappy respawn invincibility is refreshed when play resumes after waiting", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const pulseSource = flappyRuntimeSource.slice(
    flappyRuntimeSource.indexOf("const pulse = useCallback"),
    flappyRuntimeSource.indexOf("useEffect(() => {", flappyRuntimeSource.indexOf("const pulse = useCallback")),
  );

  assert.match(pulseSource, /const wasRespawnWaiting = !current\.started && current\.invincibleUntil > 0;/);
  assert.match(pulseSource, /if \(wasRespawnWaiting\) current\.invincibleUntil = Math\.max\(current\.invincibleUntil, current\.time \+ FLAPPY_RESPAWN_INVINCIBLE_SECONDS\);/);
});

test("flappy multiplayer clock keeps running while waiting after a respawn", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const waitingSource = flappyRuntimeSource.slice(
    flappyRuntimeSource.indexOf("if (!current.started)"),
    flappyRuntimeSource.indexOf("const nextTime = current.time + delta"),
  );

  assert.match(waitingSource, /current\.time \+= delta;/);
  assert.doesNotMatch(waitingSource, /if \(isRespawnCameraMoving\) \{\s*current\.time \+= delta;/);
  assert.match(waitingSource, /current\.displayProgress = resolveFlappyDisplayProgress\(current\);/);
});

test("flappy multiplayer collectible misses settle as missed bonuses instead of death respawns", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const finishStart = flappyRuntimeSource.indexOf("if (status === \"playing\" && passed >= gateCount)");
  const finishSource = flappyRuntimeSource.slice(
    finishStart,
    flappyRuntimeSource.indexOf("current.time = nextTime", finishStart),
  );

  assert.match(finishSource, /const collectibleMissSettleOnly = mode === "advanced" && Boolean\(onRuntimeStateRef\.current\);/);
  assert.match(finishSource, /if \(unlimitedRespawn \|\| collectibleMissSettleOnly \|\| collected >= collectibleCount\)/);
  assert.doesNotMatch(finishSource, /status = "failed";\s*reason = `漏收集道具/);
});

test("flappy gates keep safe horizontal spacing and visible center variation", () => {
  for (const levelId of ["flappy-3", "flappy-6", "flappy-10"]) {
    const level = getMiniGameLevel("flappy", levelId);
    for (let seedIndex = 0; seedIndex < 160; seedIndex += 1) {
      const layout = generateFlappyGateLayout(level, `spacing-seed-${seedIndex}`);
      const centers = layout.gates.map((gate) => gate.baseCenterY);
      const centerSpread = Math.max(...centers) - Math.min(...centers);

      assert.ok(centerSpread >= 88, `${levelId} seed ${seedIndex} center spread ${centerSpread.toFixed(1)} is too flat`);
      for (let gateIndex = 1; gateIndex < layout.gates.length; gateIndex += 1) {
        const spacing = layout.gates[gateIndex].distance - layout.gates[gateIndex - 1].distance;
        assert.ok(spacing >= 156, `${levelId} seed ${seedIndex} gate ${gateIndex} spacing ${spacing.toFixed(1)} is too close`);
      }
    }
  }
});

test("flappy maps its player visuals through the shared avatar without jump or fall states", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappySource = componentSource.slice(componentSource.indexOf("type FlappyGate"), componentSource.indexOf("export function FlappyPrototype"));
  const avatarStateSource = flappySource.slice(
    flappySource.indexOf("function resolveFlappyPlayerAvatarView"),
    flappySource.indexOf("function flappyStartPlatformY"),
  );
  const renderSource = componentSource.slice(
    componentSource.indexOf("className={`flappy-player-shell"),
    componentSource.indexOf("{!view.started ?", componentSource.indexOf("className={`flappy-player-shell")),
  );

  assert.match(componentSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(componentSource, /type PlayerAvatarView/);
  assert.match(avatarStateSource, /if \(view\.status === "failed"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(avatarStateSource, /if \(view\.status === "passed"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(avatarStateSource, /if \(view\.time < view\.invincibleUntil\) return \{ action: "idle", expression: "neutral", effect: "shield" \};/);
  assert.match(avatarStateSource, /return \{ action: "idle", expression: "neutral" \};/);
  assert.doesNotMatch(avatarStateSource, /return "jump";/);
  assert.doesNotMatch(avatarStateSource, /return "fall";/);
  assert.match(renderSource, /<PlayerAvatar/);
  assert.match(renderSource, /\{\.\.\.resolveFlappyPlayerAvatarView\(view\)\}/);
  assert.match(renderSource, /rotationTurns=\{view\.playerTurns\}/);
  assert.match(renderSource, /visualScale=\{1\.18\}/);
  assert.doesNotMatch(renderSource, /prototype-player-box flappy-player/);
});

test("flappy multiplayer does not treat automatic forward scrolling as avatar movement", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappySource = componentSource.slice(componentSource.indexOf("type FlappyGate"), componentSource.indexOf("export function FlappyPrototype"));
  const directionSource = flappySource.slice(
    flappySource.indexOf("function resolveFlappyDirection"),
    flappySource.indexOf("function flappyStartPlatformY"),
  );
  const remoteAvatarSource = flappySource.slice(
    flappySource.indexOf("function resolveFlappyRemoteAvatarView"),
    flappySource.indexOf("function resolveFlappyDirection"),
  );

  assert.match(directionSource, /return "none";/);
  assert.doesNotMatch(remoteAvatarSource, /action: "move"/);
});

test("flappy renders the local player anchored while the respawn camera moves", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const waitingSource = flappyRuntimeSource.slice(
    flappyRuntimeSource.indexOf("if (!current.started) {", flappyRuntimeSource.indexOf("const tick = (time: number) =>")),
    flappyRuntimeSource.indexOf("const nextTime = current.time + delta;", flappyRuntimeSource.indexOf("const tick = (time: number) =>")),
  );

  assert.match(flappyRuntimeSource, /getFlappyPlayerScreenX/);
  assert.match(flappyRuntimeSource, /const playerScreenX = getFlappyPlayerScreenX\(\{/);
  assert.match(waitingSource, /current\.time \+= delta;/);
  assert.match(waitingSource, /current\.displayProgress = resolveFlappyDisplayProgress\(current\);/);
  assert.doesNotMatch(flappyRuntimeSource, /playerShellRef\.current\.style\.transform = transformPoint3d\(playerX - PLAYER_SIZE \/ 2/);
});

test("flappy renders the finished local player in world space while spectating", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const updateDomSource = flappyRuntimeSource.slice(
    flappyRuntimeSource.indexOf("const updateDom = ("),
    flappyRuntimeSource.indexOf("const tick = (time: number)", flappyRuntimeSource.indexOf("const updateDom = (")),
  );

  assert.match(updateDomSource, /const localCameraX = getFlappySignedProgress\(current\.displayProgress, activeReverseDirection\);/);
  assert.match(updateDomSource, /const localPlayerWorldX = activePlayerX \+ getFlappySignedProgress\(current\.progress, activeReverseDirection\);/);
  assert.match(updateDomSource, /const playerScreenX = spectatingRemote \? localPlayerWorldX - localCameraX : getFlappyPlayerScreenX\(\{/);
  assert.match(updateDomSource, /playerShellRef\.current\.style\.transform = transformPoint3d\(playerScreenX - PLAYER_SIZE \/ 2, current\.playerY - PLAYER_SIZE \/ 2\);/);
  assert.doesNotMatch(updateDomSource, /if \(!spectatingRemote\) \{[\s\S]{0,260}playerShellRef\.current\.style\.transform/);
});

test("flappy endless moving gates use RAF-only transforms to avoid jitter", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const renderSource = flappyRuntimeSource.slice(
    flappyRuntimeSource.indexOf("{view.visibleGates.map((gate) => {"),
    flappyRuntimeSource.indexOf("<div", flappyRuntimeSource.indexOf('className={`flappy-player-shell')),
  );

  assert.match(renderSource, /const topGateStyle = gate\.moving/);
  assert.match(renderSource, /const bottomGateStyle = gate\.moving/);
  assert.doesNotMatch(renderSource, /if \(node && gate\.moving\) node\.style\.transform = topGateTransform;/);
  assert.doesNotMatch(renderSource, /if \(node && gate\.moving\) node\.style\.transform = bottomGateTransform;/);
  assert.doesNotMatch(renderSource, /if \(node && gate\.moving\) node\.style\.transform = collectibleTransform;/);
  assert.doesNotMatch(renderSource, /className="flappy-gate top"[\s\S]{0,260}style=\{\{[\s\S]{0,120}transform:/);
  assert.doesNotMatch(renderSource, /className="flappy-gate bottom"[\s\S]{0,260}style=\{\{[\s\S]{0,120}transform:/);
});

test("flappy endless moving gates reuse their generated motion params instead of live difficulty params", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyConfigSource = readAppCssSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));

  assert.match(componentSource, /function resolveFlappyGateGapSize\(gate: FlappyGate, fallbackGapSize: number\)/);
  assert.match(componentSource, /const movingSpeed = gate\.movingSpeed \?\? fallbackMovingSpeed;/);
  assert.match(flappyRuntimeSource, /const gateGapSize = resolveFlappyGateGapSize\(gate, activeGapSize\);/);
  assert.match(flappyRuntimeSource, /const centerY = flappyGateCenterY\(gate, nextTime, activeMovingGateSpeed, stageHeight\);/);
  assert.doesNotMatch(flappyRuntimeSource, /const centerY = flappyGateCenterY\(gate, nextTime, activeFlappyParams, stageHeight\);/);
  assert.doesNotMatch(flappyRuntimeSource, /centerY \+ gate\.collectibleOffset \* activeGapSize/);
  assert.match(flappyConfigSource, /\.flappy-world\s*{/);
});

test("flappy endless gravity changes use sine portals, early triggers, and smooth gravity blending", () => {
  const componentSource = readMiniGameRuntimeSource();
  const cssSource = readAppCssSource();
  const anomalyMarkerStart = cssSource.indexOf(".flappy-anomaly-marker");
  const anomalyMarkerCss = cssSource.slice(anomalyMarkerStart, cssSource.indexOf(".flappy-collectible", anomalyMarkerStart));
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));
  const gravityChangeSource = flappyRuntimeSource.slice(
    flappyRuntimeSource.indexOf("const applyEndlessGravityChange = useCallback"),
    flappyRuntimeSource.indexOf("useEffect(() => {", flappyRuntimeSource.indexOf("const applyEndlessGravityChange = useCallback")),
  );
  const recoverySource = componentSource.slice(componentSource.indexOf("function recoverEndlessFlappyFailure"), componentSource.indexOf("function makeFlappyView"));

  assert.match(recoverySource, /respawnY: number;/);
  assert.match(recoverySource, /current\.playerY = respawnY;/);
  assert.doesNotMatch(recoverySource, /current\.playerY = clamp\(recoveryY \?\? current\.playerY/);
  assert.match(componentSource, /flipAfterGate/);
  assert.match(componentSource, /function getEndlessFlappyGravityPattern\(effectiveGateIndex: number\)/);
  assert.match(componentSource, /const gravityCycleLength = Math\.round\(22 - difficulty \* 8\);/);
  assert.match(componentSource, /const gravityInvertedGateCount = Math\.round\(4 \+ difficulty \* 5\);/);
  assert.match(componentSource, /const normalGateCount = Math\.max\(6, gravityCycleLength - gravityInvertedGateCount\);/);
  assert.doesNotMatch(componentSource, /effectiveGateIndex % 18|phase === 11|phase === 17|phase >= 10 && phase <= 11|phase >= 16 && phase <= 17/);
  assert.match(componentSource, /function getEndlessFlappyGateAnomaly\(gate: FlappyGate, debugDifficulty: number\)/);
  assert.match(componentSource, /type FlappyGate = GeneratedFlappyGate & \{ gravityTriggered\?: boolean \};/);
  assert.match(flappyRuntimeSource, /const gateGravityTriggerX = screenX \+ FLAPPY_GATE_WIDTH \/ 2;/);
  assert.match(flappyRuntimeSource, /const gateGravityEntered = activeReverseDirection \? gateGravityTriggerX >= activePlayerX : gateGravityTriggerX <= activePlayerX;/);
  assert.match(flappyRuntimeSource, /const enteredGateAnomaly = isEndlessRun \? getEndlessFlappyGateAnomaly\(gate, endlessRef\.current\?\.debugDifficulty \?\? 0\) : null;/);
  assert.match(flappyRuntimeSource, /triggerEndlessGravityChangeIfNeeded\(current, nextTime, enteredGateAnomaly\)/);
  assert.doesNotMatch(flappyRuntimeSource, /const passedGateAnomaly|passedGateAnomaly\?\.flipAfterGate|applyEndlessGravityChange\(current, nextTime, passedGateAnomaly\.targetFlipped\)/);
  assert.doesNotMatch(flappyRuntimeSource, /pendingGravityFlipTarget/);
  assert.match(flappyRuntimeSource, /const gateAnomaly = isEndlessRun \? getEndlessFlappyGateAnomaly\(gate, endless\?\.debugDifficulty \?\? 0\) : null;/);
  assert.match(flappyRuntimeSource, /flappy-anomaly-marker/);
  assert.match(flappyRuntimeSource, /flappy-anomaly-sine-line/);
  assert.match(anomalyMarkerCss, /\.flappy-anomaly-marker/);
  assert.match(anomalyMarkerCss, /\.flappy-anomaly-sine-line/);
  assert.match(anomalyMarkerCss, /@keyframes flappy-anomaly-sine-flow/);
  assert.match(anomalyMarkerCss, /sine-wave/);
  assert.doesNotMatch(anomalyMarkerCss, /--flappy-anomaly-arrow|clip-path:\s*polygon|@keyframes flappy-anomaly-gravity-cue/);
  assert.doesNotMatch(anomalyMarkerCss, /flappy-anomaly-wave|@keyframes flappy-anomaly-wave-flow/);
  assert.match(flappyRuntimeSource, /const visibleBuffer = isEndlessRun \? \(isLowPowerDevice \? 260 : 420\) : isLowPowerDevice \? 88 : 130;/);
  assert.match(componentSource, /type FlappyGravityChangeBlend = \{/);
  assert.match(componentSource, /function resolveFlappyGravityDirection\(targetDirection: number, blend: FlappyGravityChangeBlend \| null, time: number\)/);
  assert.match(flappyRuntimeSource, /const gravityChangeBlendRef = useRef<FlappyGravityChangeBlend \| null>\(null\);/);
  assert.match(gravityChangeSource, /gravityFlippedRef\.current = targetFlipped;/);
  assert.match(gravityChangeSource, /setManagedGravityFlipped\(targetFlipped\);/);
  assert.match(gravityChangeSource, /gravityChangeBlendRef\.current = \{/);
  assert.match(gravityChangeSource, /current\.playerVy \*= FLAPPY_GRAVITY_CHANGE_VELOCITY_DAMPING;/);
  assert.match(gravityChangeSource, /setGravityFlipFeedbackActive\(true\);/);
  assert.match(gravityChangeSource, /current\.displayProgress = current\.progress;/);
  assert.match(gravityChangeSource, /current\.invincibleUntil = Math\.max\(current\.invincibleUntil, nextTime \+ FLAPPY_GRAVITY_CHANGE_INVINCIBLE_SECONDS\);/);
  assert.doesNotMatch(gravityChangeSource, /current\.started = false|current\.playerY =|current\.playerVy = 0|respawnProgressStart|respawnProgressUntil|resolveFlappyDisplayProgress/);
  assert.doesNotMatch(flappyRuntimeSource, /gravityInputLocked|flappy-gravity-flip-banner|gravity-flip-preparing|beginManagedGravityFlipTransition|gravityFlipTransitionRef|FlappyGravityFlipTransition/);
  assert.match(flappyRuntimeSource, /const activeViewReverseDirection = reverseDirection;/);
  assert.match(flappyRuntimeSource, /const activeViewPlayerX = getFlappyPlayerX\(stageWidth, activeViewReverseDirection\);/);
  assert.match(flappyRuntimeSource, /const activeReverseDirection = reverseDirection;/);
  assert.match(flappyRuntimeSource, /const targetReversedGravity = reversedGravity \|\| gravityFlippedRef\.current;/);
  assert.match(flappyRuntimeSource, /const gravityDirection = resolveFlappyGravityDirection\(targetGravityDirection, gravityChangeBlendRef\.current, nextTime\);/);
  assert.match(flappyRuntimeSource, /className=\{`flappy-world/);
  assert.match(flappyRuntimeSource, /gravityFlipFeedbackActive \? "gravity-flip-feedback" : ""/);
  assert.match(cssSource, /\.flappy-stage\.gravity-flip-feedback::after/);
  assert.doesNotMatch(cssSource, /@keyframes flappy-managed-flip|flappy-managed-flip|rotate\(104deg\)|gravity-flip-preparing|flappy-gravity-flip-banner/);
  assert.doesNotMatch(cssSource, /\.flappy-world\.gravity-flipped\s*{[\s\S]*--flappy-world-rotation:\s*180deg;/);
  assert.doesNotMatch(cssSource, /\.flappy-stage\.endless-gravity-anomaly::before|flappy-gravity-particles/);
});
