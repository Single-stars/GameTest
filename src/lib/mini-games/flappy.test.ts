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
import { readMiniGameRuntimeSource } from "./test-utils.ts";

type FlappySafeRespawnResolver = (options: {
  gates: readonly { distance: number; passed?: boolean }[];
  gateWidth: number;
  nextProgress: number;
  playerSize: number;
  playerX: number;
  reverseDirection: boolean;
  safeApproachDistance: number;
  stageWidth: number;
}) => number;

function getSafeRespawnResolver() {
  const resolver = (miniGames as typeof miniGames & {
    resolveFlappySafeRespawnProgress?: FlappySafeRespawnResolver;
  }).resolveFlappySafeRespawnProgress;
  assert.equal(typeof resolver, "function");
  return resolver;
}

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

test("flappy recoverable failures use safe respawn instead of a fixed backtrack", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappyRuntimeSource = componentSource.slice(componentSource.indexOf("export function FlappyPrototype"));

  assert.match(flappyRuntimeSource, /resolveFlappySafeRespawnProgress/);
  assert.doesNotMatch(flappyRuntimeSource, /Math\.max\(0, nextProgress - 92\)/);
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
