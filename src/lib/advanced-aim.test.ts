import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdvancedAimArrow,
  resolveAdvancedAimArrowStep,
  type AdvancedAimEntity,
} from "./advanced-aim.ts";

const target: AdvancedAimEntity = {
  id: "target-1",
  kind: "target",
  x: 120,
  y: 100,
  radius: 18,
  active: true,
};

test("advanced aim arrows are launched as independent active projectiles", () => {
  const first = createAdvancedAimArrow({
    id: "arrow-1",
    from: { x: 100, y: 320 },
    to: { x: 100, y: 80 },
    createdAt: 1000,
    speedPxPerMs: 0.6,
  });
  const second = createAdvancedAimArrow({
    id: "arrow-2",
    from: { x: 180, y: 320 },
    to: { x: 180, y: 80 },
    createdAt: 1010,
    speedPxPerMs: 0.6,
  });

  assert.equal(first.active, true);
  assert.equal(second.active, true);
  assert.notEqual(first.id, second.id);
  assert.equal(first.createdAt, 1000);
  assert.equal(second.createdAt, 1010);
});

test("advanced aim uses arrow path collision instead of click-point collision", () => {
  const arrow = createAdvancedAimArrow({
    id: "arrow-1",
    from: { x: 120, y: 320 },
    to: { x: 120, y: 40 },
    createdAt: 1000,
    speedPxPerMs: 1,
  });

  const result = resolveAdvancedAimArrowStep({
    arrow,
    deltaMs: 260,
    targets: [target],
    distractors: [],
    tolerancePx: 0,
  });

  assert.equal(result.collision?.kind, "target");
  assert.equal(result.collision?.entityId, "target-1");
  assert.equal(result.arrow.active, false);
  assert.equal(result.arrow.hitTargetId, "target-1");
});

test("advanced aim fails on the first distractor collision before a later target", () => {
  const distractor: AdvancedAimEntity = {
    id: "decoy-1",
    kind: "distractor",
    x: 120,
    y: 180,
    radius: 18,
    active: true,
  };
  const arrow = createAdvancedAimArrow({
    id: "arrow-1",
    from: { x: 120, y: 320 },
    to: { x: 120, y: 40 },
    createdAt: 1000,
    speedPxPerMs: 1,
  });

  const result = resolveAdvancedAimArrowStep({
    arrow,
    deltaMs: 260,
    targets: [target],
    distractors: [distractor],
    tolerancePx: 0,
  });

  assert.equal(result.collision?.kind, "distractor");
  assert.equal(result.collision?.entityId, "decoy-1");
  assert.equal(result.arrow.active, false);
  assert.equal(result.arrow.hitDistractorId, "decoy-1");
  assert.equal(result.arrow.hitTargetId, undefined);
});

test("advanced aim trajectory error treats a center-line hit as centered even when the entry frame touches the edge", () => {
  const arrow = createAdvancedAimArrow({
    id: "arrow-1",
    from: { x: 120, y: 320 },
    to: { x: 120, y: 40 },
    createdAt: 1000,
    speedPxPerMs: 1,
  });

  const result = resolveAdvancedAimArrowStep({
    arrow,
    deltaMs: 202,
    targets: [target],
    distractors: [],
    tolerancePx: 0,
  });

  assert.equal(result.collision?.kind, "target");
  assert.equal(result.collision.normalizedError, 1);
  assert.equal(result.collision.trajectoryNormalizedError, 0);
});

test("advanced aim trajectory error can identify an eighty percent edge hit", () => {
  const edgeTarget: AdvancedAimEntity = {
    ...target,
    radius: 20,
  };
  const arrow = createAdvancedAimArrow({
    id: "arrow-1",
    from: { x: 136, y: 320 },
    to: { x: 136, y: 40 },
    createdAt: 1000,
    speedPxPerMs: 1,
  });

  const result = resolveAdvancedAimArrowStep({
    arrow,
    deltaMs: 260,
    targets: [edgeTarget],
    distractors: [],
    tolerancePx: 0,
  });

  assert.equal(result.collision?.kind, "target");
  assert.equal(result.collision.trajectoryNormalizedError, 0.8);
});
