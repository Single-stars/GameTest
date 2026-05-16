import assert from "node:assert/strict";
import test from "node:test";

import {
  generateFlappyGateLayout,
  getFlappyInitialPlacement,
  getMiniGameLevel,
  selectVisibleFlappyGates,
} from "./index.ts";
import { readMiniGameRuntimeSource } from "./test-utils.ts";

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

test("flappy maps its player visuals through the shared avatar without jump or fall states", () => {
  const componentSource = readMiniGameRuntimeSource();
  const flappySource = componentSource.slice(componentSource.indexOf("type FlappyGate"), componentSource.indexOf("export function FlappyPrototype"));
  const avatarStateSource = flappySource.slice(
    flappySource.indexOf("function resolveFlappyPlayerAvatarState"),
    flappySource.indexOf("function flappyStartPlatformY"),
  );
  const renderSource = componentSource.slice(
    componentSource.indexOf("className={`flappy-player-shell"),
    componentSource.indexOf("{!view.started ?", componentSource.indexOf("className={`flappy-player-shell")),
  );

  assert.match(componentSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(componentSource, /type PlayerAvatarState/);
  assert.match(avatarStateSource, /if \(view\.status === "failed"\) return "fail";/);
  assert.match(avatarStateSource, /if \(view\.status === "passed"\) return "success";/);
  assert.match(avatarStateSource, /if \(view\.time < view\.invincibleUntil\) return "shield";/);
  assert.match(avatarStateSource, /return "idle";/);
  assert.doesNotMatch(avatarStateSource, /return "jump";/);
  assert.doesNotMatch(avatarStateSource, /return "fall";/);
  assert.match(renderSource, /<PlayerAvatar/);
  assert.match(renderSource, /state=\{resolveFlappyPlayerAvatarState\(view\)\}/);
  assert.match(renderSource, /rotationTurns=\{view\.playerTurns\}/);
  assert.match(renderSource, /visualScale=\{1\.18\}/);
  assert.doesNotMatch(renderSource, /prototype-player-box flappy-player/);
});
