import assert from "node:assert/strict";
import test from "node:test";

import { RemoteInterpolator } from "./remote-interpolator.ts";
import { RemoteVisualSmoother } from "./remote-visual-smoother.ts";

test("RemoteVisualSmoother eases visual position toward sampled state", () => {
  const smoother = new RemoteVisualSmoother({ sharpness: 22 });

  const first = smoother.update({ x: 0, y: 0, angle: 350, progress: 0, status: "playing" }, 0);
  const second = smoother.update({ x: 100, y: 0, angle: 10, progress: 0.2, status: "playing" }, 16);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.x, 0);
  assert.ok(second.x > 20);
  assert.ok(second.x < 100);
  assert.ok(second.angle > 350 || second.angle < 10);
});

test("RemoteVisualSmoother snaps instead of easing teleports and force snap packets", () => {
  const smoother = new RemoteVisualSmoother({ teleportDistance: 140 });

  smoother.update({ x: 0, y: 0, angle: 0, progress: 0, status: "playing" }, 0);
  const teleported = smoother.update({ x: 200, y: 0, angle: 0, progress: 0.2, status: "playing" }, 16);

  assert.ok(teleported);
  assert.equal(teleported.x, 200);

  const eased = smoother.update({ x: 240, y: 0, angle: 0, progress: 0.3, status: "playing" }, 32);
  assert.ok(eased);
  assert.ok(eased.x > 200);
  assert.ok(eased.x < 240);

  const snapped = smoother.update({ x: 80, y: 20, angle: 30, progress: 0.1, status: "playing", forceSnap: true }, 48);
  assert.ok(snapped);
  assert.equal(snapped.x, 80);
  assert.equal(snapped.y, 20);
  assert.equal(snapped.angle, 30);
});

test("RemoteVisualSmoother debounces light animation changes but keeps critical states", () => {
  const smoother = new RemoteVisualSmoother({ animationHysteresisMs: 80 });

  const idle = smoother.update({ x: 0, y: 0, angle: 0, progress: 0, status: "playing", anim: "idle" }, 0);
  const pendingMove = smoother.update({ x: 1, y: 0, angle: 0, progress: 0, status: "playing", anim: "move" }, 40);
  const move = smoother.update({ x: 2, y: 0, angle: 0, progress: 0, status: "playing", anim: "move" }, 130);
  assert.ok(idle);
  assert.ok(pendingMove);
  assert.ok(move);
  assert.equal(idle.anim, "idle");
  assert.equal(pendingMove.anim, "idle");
  assert.equal(move.anim, "move");

  const land = smoother.update({ x: 3, y: 0, angle: 0, progress: 0, status: "playing", anim: "land" }, 140);
  const heldLand = smoother.update({ x: 4, y: 0, angle: 0, progress: 0, status: "playing", anim: "idle" }, 190);
  const finished = smoother.update({ x: 5, y: 0, angle: 0, progress: 0, status: "finished", anim: "idle" }, 200);
  assert.ok(land);
  assert.ok(heldLand);
  assert.ok(finished);
  assert.equal(land.anim, "land");
  assert.equal(heldLand.anim, "land");
  assert.equal(finished.anim, "finished");
});

test("Remote visual pipeline keeps high speed movement close to the latest remote position", () => {
  const interpolator = new RemoteInterpolator();
  const smoother = new RemoteVisualSmoother();
  const speedPxPerSecond = 1000;
  const remoteIntervalMs = 1000 / 30;

  let seq = 1;
  for (let remoteTime = 0; remoteTime <= 1100; remoteTime += remoteIntervalMs) {
    interpolator.push(
      {
        type: "state",
        seq,
        t: remoteTime,
        x: (speedPxPerSecond * remoteTime) / 1000,
        y: 0,
        vx: speedPxPerSecond,
        vy: 0,
        angle: 0,
        progress: remoteTime / 1100,
        anim: "move",
        status: "playing",
      },
      remoteTime,
    );
    seq += 1;
  }

  let visual = null;
  for (let now = 0; now <= 1000; now += 16) {
    visual = smoother.update(interpolator.sample(now), now);
  }

  assert.ok(visual);
  const latestRemoteX = speedPxPerSecond;
  const lagPx = latestRemoteX - visual.x;
  assert.ok(lagPx <= 120, `expected visual lag <= 120px, got ${lagPx.toFixed(2)}px`);
});
