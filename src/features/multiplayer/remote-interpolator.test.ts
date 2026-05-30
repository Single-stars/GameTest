import assert from "node:assert/strict";
import test from "node:test";

import { RemoteInterpolator } from "./remote-interpolator.ts";

test("RemoteInterpolator samples the remote ghost at a delayed timeline", () => {
  const interpolator = new RemoteInterpolator({ interpolationDelayMs: 100 });

  assert.equal(interpolator.push({ type: "state", seq: 1, t: 1000, x: 0, y: 20, vx: 1000, vy: 400, angle: 0, progress: 0.1, anim: "idle" }, 0), true);
  assert.equal(interpolator.push({ type: "state", seq: 2, t: 1050, x: 50, y: 40, vx: 1000, vy: 400, angle: 10, progress: 0.2, anim: "move" }, 50), true);

  const sampled = interpolator.sample(125);

  assert.ok(sampled);
  assert.equal(sampled.networkUnstable, false);
  assert.equal(sampled.x, 25);
  assert.equal(sampled.y, 30);
  assert.equal(sampled.angle, 5);
  assert.ok(Math.abs(sampled.progress - 0.15) < 0.000001);
});

test("RemoteInterpolator drops stale sequence packets before they can pull the ghost back", () => {
  const interpolator = new RemoteInterpolator({ interpolationDelayMs: 100 });

  assert.equal(interpolator.push({ type: "state", seq: 8, t: 1000, x: 100, y: 100, vx: 0, vy: 0, angle: 0, progress: 0.3, anim: "move" }, 0), true);
  assert.equal(interpolator.push({ type: "state", seq: 8, t: 1016, x: 20, y: 20, vx: 0, vy: 0, angle: 0, progress: 0.2, anim: "move" }, 16), false);
  assert.equal(interpolator.push({ type: "state", seq: 7, t: 1032, x: 10, y: 10, vx: 0, vy: 0, angle: 0, progress: 0.1, anim: "move" }, 32), false);

  const sampled = interpolator.sample(220);

  assert.ok(sampled);
  assert.equal(sampled.x, 100);
  assert.equal(sampled.progress, 0.3);
});

test("RemoteInterpolator predicts briefly from velocity and then holds the last state when packets go stale", () => {
  const interpolator = new RemoteInterpolator({
    interpolationDelayMs: 100,
    maxPredictionMs: 100,
    staleMs: 500,
  });

  assert.equal(interpolator.push({ type: "state", seq: 1, t: 1000, x: 0, y: 0, vx: 500, vy: -100, angle: 0, progress: 0.1, anim: "move" }, 0), true);
  assert.equal(interpolator.push({ type: "state", seq: 2, t: 1050, x: 25, y: -5, vx: 500, vy: -100, angle: 10, progress: 0.2, anim: "move" }, 50), true);

  const predicted = interpolator.sample(300);
  assert.ok(predicted);
  assert.equal(predicted.networkUnstable, false);
  assert.equal(predicted.x, 75);
  assert.equal(predicted.y, -15);

  const stale = interpolator.sample(700);
  assert.ok(stale);
  assert.equal(stale.networkUnstable, true);
  assert.equal(stale.x, 25);
  assert.equal(stale.y, -5);
});

test("RemoteInterpolator prefers sender time mapped into the local clock over receive time", () => {
  const interpolator = new RemoteInterpolator({ interpolationDelayMs: 100 });

  assert.equal(
    interpolator.push(
      { type: "state", seq: 1, t: 1000, x: 0, y: 0, vx: 1000, vy: 0, angle: 0, progress: 0.1, anim: "idle", remoteTimeOffsetMs: 400 },
      10,
    ),
    true,
  );
  assert.equal(
    interpolator.push(
      { type: "state", seq: 2, t: 1050, x: 50, y: 0, vx: 1000, vy: 0, angle: 0, progress: 0.2, anim: "move", remoteTimeOffsetMs: 400 },
      140,
    ),
    true,
  );

  const sampled = interpolator.sample(1525);

  assert.ok(sampled);
  assert.equal(sampled.x, 25);
  assert.equal(sampled.receivedAt, 10);
});

test("RemoteInterpolator uses velocity-aware Hermite interpolation when velocities are available", () => {
  const interpolator = new RemoteInterpolator({ interpolationDelayMs: 100 });

  assert.equal(interpolator.push({ type: "state", seq: 1, t: 1000, x: 0, y: 0, vx: 0, vy: 0, angle: 0, progress: 0, anim: "idle" }, 0), true);
  assert.equal(interpolator.push({ type: "state", seq: 2, t: 1100, x: 100, y: 0, vx: 1000, vy: 0, angle: 0, progress: 1, anim: "move" }, 100), true);

  const sampled = interpolator.sample(150);

  assert.ok(sampled);
  assert.equal(sampled.x, 37.5);
});

test("RemoteInterpolator falls back to linear interpolation when velocity fields are absent", () => {
  const interpolator = new RemoteInterpolator({ interpolationDelayMs: 100 });

  assert.equal(interpolator.push({ type: "state", seq: 1, t: 1000, x: 0, y: 0, angle: 0, progress: 0, anim: "idle" }, 0), true);
  assert.equal(interpolator.push({ type: "state", seq: 2, t: 1100, x: 100, y: 0, angle: 0, progress: 1, anim: "move" }, 100), true);

  const sampled = interpolator.sample(150);

  assert.ok(sampled);
  assert.equal(sampled.x, 50);
});

test("RemoteInterpolator lerps angles across the shortest rotation path", () => {
  const interpolator = new RemoteInterpolator({ interpolationDelayMs: 100 });

  assert.equal(interpolator.push({ type: "state", seq: 1, t: 1000, x: 0, y: 0, vx: 0, vy: 0, angle: 350, progress: 0, anim: "idle" }, 0), true);
  assert.equal(interpolator.push({ type: "state", seq: 2, t: 1100, x: 0, y: 0, vx: 0, vy: 0, angle: 10, progress: 1, anim: "move" }, 100), true);

  const sampled = interpolator.sample(150);

  assert.ok(sampled);
  assert.equal(sampled.angle, 0);
});

test("RemoteInterpolator ignores progress rollback unless a force snap reset is marked", () => {
  const interpolator = new RemoteInterpolator({ interpolationDelayMs: 100 });

  assert.equal(interpolator.push({ type: "state", seq: 1, t: 1000, x: 0, y: 0, vx: 0, vy: 0, angle: 0, progress: 0.6, anim: "move" }, 0), true);
  assert.equal(interpolator.push({ type: "state", seq: 2, t: 1050, x: 10, y: 0, vx: 0, vy: 0, angle: 0, progress: 0.5, anim: "move" }, 50), true);

  const held = interpolator.sample(250);
  assert.ok(held);
  assert.equal(held.progress, 0.6);

  interpolator.reset();
  assert.equal(interpolator.push({ type: "state", seq: 3, t: 1100, x: 0, y: 0, vx: 0, vy: 0, angle: 0, progress: 0.6, anim: "move" }, 100), true);
  assert.equal(interpolator.push({ type: "state", seq: 4, t: 1150, x: 0, y: 0, vx: 0, vy: 0, angle: 0, progress: 0.1, anim: "idle", forceSnap: true }, 150), true);

  const reset = interpolator.sample(350);
  assert.ok(reset);
  assert.equal(reset.progress, 0.1);
});
