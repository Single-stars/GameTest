import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLuckSlotSpinSchedule,
  LUCK_SLOT_REEL_SETTLE_DELAYS_MS,
  LUCK_SLOT_SPIN_COMPLETE_MS,
} from "./luck-animation.ts";

test("single luck spin settles reels from ones digit first", () => {
  const schedule = buildLuckSlotSpinSchedule();
  const settleSteps = schedule.filter((step) => step.type === "settle");
  const completeStep = schedule.find((step) => step.type === "complete");

  assert.deepEqual(
    settleSteps.map((step) => step.settledReels),
    [1, 2, 3],
  );
  assert.deepEqual(
    settleSteps.map((step) => step.atMs),
    [...LUCK_SLOT_REEL_SETTLE_DELAYS_MS],
  );
  assert.ok(completeStep);
  assert.equal(completeStep.atMs, LUCK_SLOT_SPIN_COMPLETE_MS);
  assert.ok(settleSteps[2].atMs < 1660);
  assert.ok(completeStep.atMs > settleSteps[2].atMs);
});
