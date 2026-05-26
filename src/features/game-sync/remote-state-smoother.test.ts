import test from "node:test";
import assert from "node:assert/strict";
import { RemoteStateSmoother } from "./remote-state-smoother.ts";

test("RemoteStateSmoother interpolates between buffered remote samples", () => {
  const smoother = new RemoteStateSmoother({ interpolationDelayMs: 100 });

  smoother.push(
    {
      progress: 0.1,
      score: 100,
      status: "playing",
      x: 100,
      y: 200,
      cameraX: 25,
      cameraY: 50,
      cameraScale: 1,
      direction: "right",
      seq: 1,
      sentAt: 1000,
    },
    1000,
  );
  smoother.push(
    {
      progress: 0.2,
      score: 200,
      status: "playing",
      x: 200,
      y: 400,
      cameraX: 125,
      cameraY: 150,
      cameraScale: 0.8,
      direction: "left",
      seq: 2,
      sentAt: 1050,
    },
    1050,
  );

  const sampled = smoother.sample(1125);

  assert.ok(sampled);
  assert.equal(sampled.x, 150);
  assert.equal(sampled.y, 300);
  assert.equal(sampled.cameraX, 75);
  assert.equal(sampled.cameraY, 100);
  assert.equal(sampled.cameraScale, 0.9);
  assert.equal(sampled.direction, "right");
  assert.equal(sampled.seq, 1);
});

test("RemoteStateSmoother keeps discrete platform state aligned with the interpolated frame", () => {
  const smoother = new RemoteStateSmoother({ interpolationDelayMs: 100 });

  smoother.push(
    {
      progress: 0.25,
      status: "playing",
      x: 100,
      y: 200,
      cameraX: 10,
      cameraY: 20,
      cameraScale: 1,
      direction: "right",
      phase: "charging",
      platformIndex: 1,
      nextPlatformIndex: 2,
      nextPlatformOffsetY: 0,
      seq: 1,
      sentAt: 1000,
    },
    1000,
  );
  smoother.push(
    {
      progress: 0.5,
      status: "playing",
      x: 200,
      y: 400,
      cameraX: 110,
      cameraY: 120,
      cameraScale: 0.8,
      direction: "none",
      phase: "advancing",
      platformIndex: 1,
      nextPlatformIndex: 2,
      nextPlatformOffsetY: 60,
      seq: 2,
      sentAt: 1050,
    },
    1050,
  );

  const sampled = smoother.sample(1125);

  assert.ok(sampled);
  assert.equal(sampled.x, 150);
  assert.equal(sampled.cameraX, 60);
  assert.equal(sampled.platformIndex, 1);
  assert.equal(sampled.nextPlatformIndex, 2);
  assert.equal(sampled.phase, "charging");
  assert.equal(sampled.direction, "right");
  assert.equal(sampled.nextPlatformOffsetY, 30);
});

test("RemoteStateSmoother does not blend platform offsets across different platform windows", () => {
  const smoother = new RemoteStateSmoother({ interpolationDelayMs: 100 });

  smoother.push(
    {
      progress: 0.25,
      status: "playing",
      x: 100,
      y: 200,
      cameraX: 10,
      cameraY: 20,
      cameraScale: 1,
      platformIndex: 1,
      nextPlatformIndex: 2,
      nextPlatformOffsetY: 0,
      seq: 1,
      sentAt: 1000,
    },
    1000,
  );
  smoother.push(
    {
      progress: 0.5,
      status: "playing",
      x: 200,
      y: 400,
      cameraX: 110,
      cameraY: 120,
      cameraScale: 0.8,
      platformIndex: 2,
      nextPlatformIndex: 3,
      nextPlatformOffsetY: 80,
      seq: 2,
      sentAt: 1050,
    },
    1050,
  );

  const sampled = smoother.sample(1125);

  assert.ok(sampled);
  assert.equal(sampled.platformIndex, 1);
  assert.equal(sampled.nextPlatformIndex, 2);
  assert.equal(sampled.nextPlatformOffsetY, 0);
});

test("RemoteStateSmoother drops stale or coordinate-less samples", () => {
  const smoother = new RemoteStateSmoother({ interpolationDelayMs: 100 });

  assert.equal(
    smoother.push(
      {
        progress: 0.1,
        status: "playing",
        seq: 1,
        sentAt: 1000,
      },
      1000,
    ),
    false,
  );
  assert.equal(
    smoother.push(
      {
        progress: 0.2,
        status: "playing",
        x: 200,
        y: 300,
        cameraY: 0,
        seq: 2,
        sentAt: 1010,
      },
      1010,
    ),
    true,
  );
  assert.equal(
    smoother.push(
      {
        progress: 0.15,
        status: "playing",
        x: 150,
        y: 250,
        cameraY: 0,
        seq: 1,
        sentAt: 1005,
      },
      1020,
    ),
    false,
  );

  const sampled = smoother.sample(1200);

  assert.ok(sampled);
  assert.equal(sampled.x, 200);
  assert.equal(sampled.seq, 2);
});

test("RemoteStateSmoother uses game elapsed time instead of packet arrival spacing", () => {
  const smoother = new RemoteStateSmoother({ interpolationDelayMs: 80 });

  assert.equal(smoother.push({ cameraY: 0, elapsedMs: 1000, progress: 0, seq: 1, status: "playing", x: 0, y: 0 }, 0), true);
  assert.equal(smoother.push({ cameraY: 0, elapsedMs: 1032, progress: 0.5, seq: 2, status: "playing", x: 32, y: 0 }, 64), true);

  const sampled = smoother.sample(96);

  assert.ok(sampled);
  assert.equal(Math.round(sampled.x ?? -1), 16);
});

test("RemoteStateSmoother drops repeated game frames even with newer packets", () => {
  const smoother = new RemoteStateSmoother({ interpolationDelayMs: 80 });

  assert.equal(smoother.push({ cameraY: 0, elapsedMs: 1000, progress: 0, seq: 1, status: "playing", x: 10, y: 20 }, 0), true);
  assert.equal(smoother.push({ cameraY: 0, elapsedMs: 1000, progress: 0, seq: 2, status: "playing", x: 10, y: 20 }, 16), false);
});

test("RemoteStateSmoother extrapolates briefly after the newest sample", () => {
  const smoother = new RemoteStateSmoother({
    interpolationDelayMs: 100,
    maxExtrapolationMs: 80,
  });

  smoother.push(
    {
      progress: 0.1,
      status: "playing",
      x: 100,
      y: 200,
      cameraX: 50,
      cameraY: 50,
      cameraScale: 1,
      direction: "right",
      seq: 1,
      sentAt: 1000,
    },
    1000,
  );
  smoother.push(
    {
      progress: 0.2,
      status: "playing",
      x: 200,
      y: 400,
      cameraX: 150,
      cameraY: 150,
      cameraScale: 0.8,
      direction: "left",
      seq: 2,
      sentAt: 1050,
    },
    1050,
  );

  const sampled = smoother.sample(1200);

  assert.ok(sampled);
  assert.equal(sampled.x, 300);
  assert.equal(sampled.y, 600);
  assert.equal(sampled.cameraX, 250);
  assert.equal(sampled.cameraY, 250);
  assert.ok(Math.abs((sampled.cameraScale ?? 0) - 0.6) < 0.000001);
  assert.equal(sampled.direction, "left");
  assert.equal(sampled.seq, 2);
});
