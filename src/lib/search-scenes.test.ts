import assert from "node:assert/strict";
import test from "node:test";

import { getAdvancedStageConfig } from "./advanced-challenges.ts";
import {
  SEARCH_PATTERN_PALETTE,
  makeAdvancedSearchScene,
  makeSearchScene,
  patternKey,
} from "./search-scenes.ts";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function isRedFamily(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red >= 190 && green <= 140 && blue <= 140;
}

function launchPatternKeys(scene: ReturnType<typeof makeSearchScene>) {
  return [...scene.dots].sort((left, right) => left.delayMs - right.delayMs).map(patternKey);
}

test("search pattern palette has only one red-family solid circle", () => {
  const redSolidCircles = SEARCH_PATTERN_PALETTE.filter(
    (pattern) => pattern.shape === "circle" && !pattern.hollow && isRedFamily(pattern.color),
  );

  assert.deepEqual(redSolidCircles.map(patternKey), ["#e1251b-circle-false"]);
});

test("normal search scenes randomize the counted pattern while preserving exact target totals", () => {
  const random = mulberry32(1212);
  const scenes = Array.from({ length: 8 }, (_, index) => makeSearchScene(index % 4, { random }));
  const targetKeys = new Set(scenes.map((scene) => patternKey(scene.targetPatterns[0])));

  assert.ok(targetKeys.size > 1);
  for (const scene of scenes) {
    assert.equal(scene.targetPatterns.length, 1);
    const expectedTargets = new Set(scene.targetPatterns.map(patternKey));
    assert.equal(scene.dots.filter((dot) => dot.target).length, scene.targetCount);
    assert.equal(scene.options.includes(scene.targetCount), true);
    assert.equal(scene.dots.every((dot) => dot.target === expectedTargets.has(patternKey(dot))), true);
  }
});

test("only advanced search level 3 counts two prompted patterns from the third round onward", () => {
  const random = mulberry32(303);
  const levelThree = getAdvancedStageConfig("search", 3);
  const normalThirdRound = makeSearchScene(2, { random });
  const firstAdvancedRound = makeAdvancedSearchScene(levelThree, 0, { random });
  const secondAdvancedRound = makeAdvancedSearchScene(levelThree, 1, { random });
  const thirdAdvancedRound = makeAdvancedSearchScene(levelThree, 2, { random });

  assert.equal(normalThirdRound.targetPatterns.length, 1);
  assert.equal(firstAdvancedRound.targetPatterns.length, 1);
  assert.equal(secondAdvancedRound.targetPatterns.length, 1);
  assert.equal(thirdAdvancedRound.targetPatterns.length, 2);

  const targetKeys = new Set(thirdAdvancedRound.targetPatterns.map(patternKey));
  assert.equal(thirdAdvancedRound.dots.filter((dot) => dot.target).length, thirdAdvancedRound.targetCount);
  assert.equal(
    thirdAdvancedRound.dots.every((dot) => dot.target === targetKeys.has(patternKey(dot))),
    true,
  );
});

test("advanced search scenes use random prompted patterns and distribute launch order", () => {
  const random = mulberry32(20260512);
  const config = getAdvancedStageConfig("search", 9);
  const scenes = Array.from({ length: 6 }, (_, index) => makeAdvancedSearchScene(config, index, { random }));
  const promptedSets = new Set(scenes.map((scene) => scene.targetPatterns.map(patternKey).join("|")));

  assert.ok(promptedSets.size > 1);
  for (const scene of scenes) {
    assert.equal(scene.targetPatterns.length, 3);
    assert.equal(scene.dots.filter((dot) => dot.target).length, scene.targetCount);

    const orderedKeys = launchPatternKeys(scene);
    for (let index = 1; index < orderedKeys.length; index += 1) {
      assert.notEqual(orderedKeys[index], orderedKeys[index - 1]);
    }
  }
});
