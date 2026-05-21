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
      cameraY: 50,
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
      cameraY: 150,
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
  assert.equal(sampled.cameraY, 100);
  assert.equal(sampled.direction, "left");
  assert.equal(sampled.seq, 2);
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
      cameraY: 50,
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
      cameraY: 150,
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
  assert.equal(sampled.cameraY, 250);
  assert.equal(sampled.direction, "left");
  assert.equal(sampled.seq, 2);
});
