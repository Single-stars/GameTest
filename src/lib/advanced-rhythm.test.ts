import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseAdvancedRhythmLane,
  isAdvancedRhythmBeatActive,
  resolveAdvancedRhythmCadence,
  type AdvancedRhythmActiveBeat,
} from "./advanced-rhythm.ts";

test("advanced rhythm cadence overlaps from levels 4-6, intensifies at 7-9, and is strongest at 10", () => {
  for (const level of [1, 2, 3]) {
    assert.equal(resolveAdvancedRhythmCadence(level).overlap, false);
    assert.equal(resolveAdvancedRhythmCadence(level).spawnIntervalMs, null);
  }

  for (const level of [4, 5, 6, 7, 8, 9, 10]) {
    assert.equal(resolveAdvancedRhythmCadence(level).overlap, true);
    assert.equal(typeof resolveAdvancedRhythmCadence(level).spawnIntervalMs, "number");
  }

  assert.ok(resolveAdvancedRhythmCadence(7).spawnIntervalMs! < resolveAdvancedRhythmCadence(6).spawnIntervalMs!);
  assert.ok(resolveAdvancedRhythmCadence(8).spawnIntervalMs! < resolveAdvancedRhythmCadence(7).spawnIntervalMs!);
  assert.ok(resolveAdvancedRhythmCadence(9).spawnIntervalMs! < resolveAdvancedRhythmCadence(8).spawnIntervalMs!);
  assert.ok(resolveAdvancedRhythmCadence(10).spawnIntervalMs! < resolveAdvancedRhythmCadence(9).spawnIntervalMs!);
});

test("advanced rhythm lane choice avoids lanes with unresolved active beats first", () => {
  const activeBeats: AdvancedRhythmActiveBeat[] = [
    { lane: 0, startedAt: 0, duration: 800 },
    { lane: 2, startedAt: 120, duration: 820 },
    { lane: 3, startedAt: 0, duration: 500, resolved: true },
  ];

  assert.equal(
    chooseAdvancedRhythmLane({
      lanes: 4,
      activeBeats,
      now: 300,
      thresholdMs: 80,
      randomInt: () => 0,
    }),
    1,
  );

  assert.equal(
    chooseAdvancedRhythmLane({
      lanes: 4,
      activeBeats,
      now: 300,
      thresholdMs: 80,
      randomInt: () => 1,
    }),
    3,
  );
});

test("advanced rhythm lane choice falls back only when every lane is active", () => {
  const activeBeats: AdvancedRhythmActiveBeat[] = [0, 1, 2, 3].map((lane) => ({
    lane,
    startedAt: 0,
    duration: 800,
  }));

  assert.equal(
    chooseAdvancedRhythmLane({
      lanes: 4,
      activeBeats,
      now: 300,
      thresholdMs: 80,
      randomInt: () => 2,
    }),
    2,
  );
});

test("advanced rhythm active beat window includes the late resolution buffer", () => {
  const beat: AdvancedRhythmActiveBeat = { lane: 0, startedAt: 1000, duration: 700 };

  assert.equal(isAdvancedRhythmBeatActive({ beat, now: 1879, thresholdMs: 40 }), true);
  assert.equal(isAdvancedRhythmBeatActive({ beat, now: 1881, thresholdMs: 40 }), false);
});
