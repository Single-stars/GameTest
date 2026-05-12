import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVANCED_MEMORY_ROTATE_MS,
  buildAdvancedMemoryPhaseSchedule,
  buildAdvancedMemoryFlashOrder,
  chooseAdvancedMemoryQuestion,
  mapAdvancedMemoryOriginalToRotatedIndex,
  mapAdvancedMemoryRotatedToOriginalIndex,
  type AdvancedMemoryCell,
} from "./advanced-memory.ts";
import { getAdvancedStageConfig } from "./advanced-challenges.ts";

const cells: AdvancedMemoryCell[] = [
  { id: 0, colorKey: "red", colorValue: "#e65349" },
  { id: 1, colorKey: "blue", colorValue: "#2f80ed" },
  { id: 2, colorKey: "blank", colorValue: null },
  { id: 3, colorKey: "green", colorValue: "#2f9b68" },
];

test("advanced memory difficulty bands keep the three variants playable and distinct", () => {
  for (let level = 1; level <= 10; level += 1) {
    assert.equal(getAdvancedStageConfig("memory", level).params.roundCount, 4);
  }

  assert.deepEqual(
    [1, 4, 7].map((level) => {
      const config = getAdvancedStageConfig("memory", level);
      return [config.variant, config.params.gridSize, config.params.coloredCount, config.params.includeBlank, config.params.showMs];
    }),
    [
      ["memory-static-grid", 4, 4, false, 1800],
      ["memory-static-grid", 9, 6, true, 2000],
      ["memory-static-grid", 9, 7, true, 2200],
    ],
  );

  assert.deepEqual(
    [2, 5, 8].map((level) => {
      const config = getAdvancedStageConfig("memory", level);
      return [config.variant, config.params.gridSize, config.params.coloredCount, config.params.includeBlank];
    }),
    [
      ["memory-sequence-flash", 4, 4, false],
      ["memory-sequence-flash", 6, 5, true],
      ["memory-sequence-flash", 9, 7, true],
    ],
  );

  assert.deepEqual(
    [3, 6, 9].map((level) => {
      const config = getAdvancedStageConfig("memory", level);
      return [config.variant, config.params.gridSize, config.params.coloredCount, config.params.includeBlank, config.params.showMs];
    }),
    [
      ["memory-rotation", 4, 4, false, 1800],
      ["memory-rotation", 9, 6, true, 2000],
      ["memory-rotation", 9, 7, true, 2200],
    ],
  );
});

test("advanced memory rotation schedule hides colors before the slow rotation starts", () => {
  const schedule = buildAdvancedMemoryPhaseSchedule({
    hasFlash: false,
    hasRotation: true,
    showMs: 2000,
    flashOrderLength: 0,
    flashMs: 560,
    flashGapMs: 120,
  });

  assert.equal(ADVANCED_MEMORY_ROTATE_MS >= 1600, true);
  assert.deepEqual(schedule.map((step) => step.phase), ["show", "hide", "rotate", "answer"]);
  assert.equal(schedule[0].durationMs, 2000);
  assert.equal(schedule[1].phase, "hide");
  assert.equal(schedule[1].startMs >= schedule[0].startMs + schedule[0].durationMs, true);
  assert.equal(schedule[2].phase, "rotate");
  assert.equal(schedule[2].startMs >= schedule[1].startMs + schedule[1].durationMs, true);
  assert.equal(schedule[2].durationMs, ADVANCED_MEMORY_ROTATE_MS);
});

test("advanced memory boss schedule hides after flashing before rotating", () => {
  const schedule = buildAdvancedMemoryPhaseSchedule({
    hasFlash: true,
    hasRotation: true,
    showMs: 0,
    flashOrderLength: 6,
    flashMs: 500,
    flashGapMs: 120,
  });

  assert.deepEqual(schedule.map((step) => step.phase), ["flash", "hide", "rotate", "answer"]);
  assert.equal(schedule[1].phase, "hide");
  assert.equal(schedule[1].startMs >= schedule[0].startMs + schedule[0].durationMs, true);
  assert.equal(schedule[2].durationMs, ADVANCED_MEMORY_ROTATE_MS);
});

test("advanced memory flash order only flashes colored cells", () => {
  assert.deepEqual([...buildAdvancedMemoryFlashOrder(cells, () => 0)].sort((a, b) => a - b), [0, 1, 3]);
});

test("advanced memory rotation maps the visible target back to the original source cell", () => {
  assert.equal(mapAdvancedMemoryOriginalToRotatedIndex(6, 9, 90), 0);
  assert.equal(mapAdvancedMemoryRotatedToOriginalIndex(0, 9, 90), 6);
  assert.equal(mapAdvancedMemoryOriginalToRotatedIndex(0, 9, 180), 8);
  assert.equal(mapAdvancedMemoryRotatedToOriginalIndex(8, 9, 180), 0);
  assert.equal(mapAdvancedMemoryOriginalToRotatedIndex(2, 9, 270), 0);
  assert.equal(mapAdvancedMemoryRotatedToOriginalIndex(0, 9, 270), 2);
});

test("advanced memory question selection avoids blank cells when blank is not allowed", () => {
  const question = chooseAdvancedMemoryQuestion({
    cells,
    gridSize: 4,
    rotationDegrees: 90,
    allowBlankQuestion: false,
    random: () => 0.74,
  });

  assert.equal(question.sourceIndex, 3);
  assert.equal(question.correctColorKey, "green");
  assert.equal(question.targetIndexAfterRotation, 2);
});
