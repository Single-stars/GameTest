import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LUCK_COIN_TEST_SCORE_EXPECTATION,
  LUCK_COIN_TEST_SCORE_TABLE,
  getLuckCoinTestTier,
  resolveLuckCoinTestScore,
} from "./luck-coin-test.ts";

test("luck coin test card uses the requested 1-5 point probability table", () => {
  assert.deepEqual(LUCK_COIN_TEST_SCORE_TABLE, [
    { points: 1, probability: 0.75 },
    { points: 2, probability: 0.2 },
    { points: 3, probability: 0.03 },
    { points: 4, probability: 0.015 },
    { points: 5, probability: 0.005 },
  ]);
  assert.equal(LUCK_COIN_TEST_SCORE_EXPECTATION, 1.325);
  assert.equal(resolveLuckCoinTestScore(0), 1);
  assert.equal(resolveLuckCoinTestScore(0.749999), 1);
  assert.equal(resolveLuckCoinTestScore(0.75), 2);
  assert.equal(resolveLuckCoinTestScore(0.949999), 2);
  assert.equal(resolveLuckCoinTestScore(0.95), 3);
  assert.equal(resolveLuckCoinTestScore(0.979999), 3);
  assert.equal(resolveLuckCoinTestScore(0.98), 4);
  assert.equal(resolveLuckCoinTestScore(0.994999), 4);
  assert.equal(resolveLuckCoinTestScore(0.995), 5);
  assert.equal(resolveLuckCoinTestScore(0.999999), 5);
});

test("luck coin test tiers upgrade from zero toward the eighty-click target", () => {
  assert.deepEqual(getLuckCoinTestTier(0), { star: 0, threshold: 0, nextThreshold: 20, tone: "empty" });
  assert.deepEqual(getLuckCoinTestTier(19), { star: 0, threshold: 0, nextThreshold: 20, tone: "empty" });
  assert.deepEqual(getLuckCoinTestTier(20), { star: 1, threshold: 20, nextThreshold: 40, tone: "bronze" });
  assert.deepEqual(getLuckCoinTestTier(40), { star: 2, threshold: 40, nextThreshold: 60, tone: "silver" });
  assert.deepEqual(getLuckCoinTestTier(60), { star: 3, threshold: 60, nextThreshold: 80, tone: "violet" });
  assert.deepEqual(getLuckCoinTestTier(80), { star: 4, threshold: 80, nextThreshold: 100, tone: "blue" });
  assert.deepEqual(getLuckCoinTestTier(100), { star: 5, threshold: 100, nextThreshold: null, tone: "gold" });
  assert.deepEqual(getLuckCoinTestTier(106), { star: 5, threshold: 100, nextThreshold: null, tone: "gold" });
});

test("luck draw screen keeps the old slot machine and adds a non-consuming luck coin test card", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");

  assert.match(screenSource, /className="slot-machine"/);
  assert.match(screenSource, /LuckCoinTestCard/);
  assert.match(screenSource, /resolveLuckCoinTestScore\(Math\.random\(\)\)/);
  assert.doesNotMatch(screenSource, /LuckCoinTestCard[\s\S]*onDraw/);
  assert.doesNotMatch(screenSource, /LuckCoinTestCard[\s\S]*recordLuckDraw/);
  assert.match(screenSource, /className=\{`luck-coin-test-card tone-\$\{tier\.tone\}/);
  assert.match(screenSource, /luckCoinPopups\.map/);
  assert.match(cssSource, /\.luck-coin-test-card\s*{/);
  assert.match(cssSource, /border-radius:\s*18px;/);
  assert.match(cssSource, /@keyframes luck-coin-number-pop/);
  assert.match(cssSource, /@keyframes luck-coin-card-flip/);
  assert.match(cssSource, /\.luck-coin-test-popup\.rare/);
});
