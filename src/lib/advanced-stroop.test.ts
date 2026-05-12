import assert from "node:assert/strict";
import test from "node:test";

import { buildAdvancedStroopMismatchIndexes } from "./advanced-stroop.ts";

const zeroRandom = () => 0;

test("moving-count stroop varies mismatch totals instead of always asking for one", () => {
  const counts = Array.from({ length: 5 }, (_, roundIndex) =>
    buildAdvancedStroopMismatchIndexes({
      itemCount: 5,
      random: zeroRandom,
      roundIndex,
      variant: "stroop-moving-count",
    }).length,
  );

  assert.deepEqual(counts, [1, 2, 3, 4, 5]);
});

test("boss stroop varies mismatch totals across all six flying words", () => {
  const counts = Array.from({ length: 6 }, (_, roundIndex) =>
    buildAdvancedStroopMismatchIndexes({
      itemCount: 6,
      random: zeroRandom,
      roundIndex,
      variant: "stroop-boss",
    }).length,
  );

  assert.deepEqual(counts, [1, 2, 3, 4, 5, 6]);
});

test("mismatch-card stroop still keeps one target card", () => {
  const counts = Array.from({ length: 5 }, (_, roundIndex) =>
    buildAdvancedStroopMismatchIndexes({
      itemCount: 8,
      random: zeroRandom,
      roundIndex,
      variant: "stroop-mismatch-card",
    }).length,
  );

  assert.deepEqual(counts, [1, 1, 1, 1, 1]);
});
