import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LUCK_COIN_TEST_SCORE_EXPECTATION,
  LUCK_COIN_TEST_SCORE_TABLE,
  getLuckCoinTestPointTone,
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
  assert.deepEqual(getLuckCoinTestTier(0), { star: 0, threshold: 0, nextThreshold: 25, tone: "advanced-empty" });
  assert.deepEqual(getLuckCoinTestTier(24), { star: 0, threshold: 0, nextThreshold: 25, tone: "advanced-empty" });
  assert.deepEqual(getLuckCoinTestTier(25), { star: 1, threshold: 25, nextThreshold: 50, tone: "advanced-tier-1" });
  assert.deepEqual(getLuckCoinTestTier(49), { star: 1, threshold: 25, nextThreshold: 50, tone: "advanced-tier-1" });
  assert.deepEqual(getLuckCoinTestTier(50), { star: 2, threshold: 50, nextThreshold: 75, tone: "advanced-tier-2" });
  assert.deepEqual(getLuckCoinTestTier(74), { star: 2, threshold: 50, nextThreshold: 75, tone: "advanced-tier-2" });
  assert.deepEqual(getLuckCoinTestTier(75), { star: 3, threshold: 75, nextThreshold: 100, tone: "advanced-tier-3" });
  assert.deepEqual(getLuckCoinTestTier(99), { star: 3, threshold: 75, nextThreshold: 100, tone: "advanced-tier-3" });
  assert.deepEqual(getLuckCoinTestTier(100), { star: 5, threshold: 100, nextThreshold: null, tone: "advanced-gold" });
  assert.deepEqual(getLuckCoinTestTier(106), { star: 5, threshold: 100, nextThreshold: null, tone: "advanced-gold" });
  assert.equal(getLuckCoinTestPointTone(1), "advanced-empty");
  assert.equal(getLuckCoinTestPointTone(2), "advanced-tier-1");
  assert.equal(getLuckCoinTestPointTone(3), "advanced-tier-2");
  assert.equal(getLuckCoinTestPointTone(4), "advanced-tier-3");
  assert.equal(getLuckCoinTestPointTone(5), "advanced-gold");
});

test("luck draw screen keeps the old slot machine and adds an isolated luck coin test card", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");

  assert.match(screenSource, /className="slot-machine"/);
  assert.match(screenSource, /LuckCoinTestCard/);
  assert.match(screenSource, /resolveLuckCoinTestScore\(Math\.random\(\)\)/);
  assert.doesNotMatch(screenSource, /LuckCoinTestCard[\s\S]*onDraw/);
  assert.doesNotMatch(screenSource, /LuckCoinTestCard[\s\S]*recordLuckDraw/);
  assert.match(screenSource, /className=\{`luck-coin-test-score-card tone-\$\{tier\.tone\} \$\{resultPopup \? `result-tone-\$\{resultPopup\.tone\}` : ""\}`\}/);
  assert.match(screenSource, /const \[resultPopup, setResultPopup\] = useState/);
  assert.match(screenSource, /const testCoinBalance = 9999;/);
  assert.match(cssSource, /\.luck-coin-test-layout\s*{/);
  assert.match(cssSource, /\.luck-coin-test-side\s*{/);
  assert.match(cssSource, /@keyframes luck-coin-result-pop/);
  assert.match(cssSource, /@keyframes luck-coin-score-pulse/);
  assert.match(cssSource, /\.luck-coin-test-result\.tone-advanced-gold/);
});

test("luck coin test card uses a left score card and two aligned right stat cards", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");
  const testCardSource = screenSource.slice(screenSource.indexOf("function LuckCoinTestCard"), screenSource.indexOf("  return (", screenSource.indexOf("function LuckCoinTestCard")));
  const testCardRenderSource = screenSource.slice(screenSource.indexOf("<section className=\"luck-coin-test\""), screenSource.indexOf("</section>", screenSource.indexOf("<section className=\"luck-coin-test\"")));

  assert.match(testCardSource, /Math\.min\(100, current \+ points\)/);
  assert.match(testCardSource, /Math\.min\(80, current \+ 1\)/);
  assert.match(testCardSource, /const testCoinBalance = 9999;/);
  assert.match(testCardSource, /const \[resultPopup, setResultPopup\] = useState/);
  assert.match(testCardSource, /getLuckCoinTestPointTone\(points\)/);
  assert.doesNotMatch(testCardSource, /lastPoints/);
  assert.match(testCardRenderSource, /luck-coin-test-layout/);
  assert.match(testCardRenderSource, /luck-coin-test-score-card/);
  assert.match(testCardRenderSource, /luck-coin-test-side/);
  assert.match(testCardRenderSource, /luck-coin-test-stat-card/);
  assert.match(testCardRenderSource, /已投币/);
  assert.match(testCardRenderSource, /幸运币/);
  assert.match(testCardRenderSource, /消耗 1 枚幸运币/);
  assert.match(testCardRenderSource, /\{testCoinBalance\}/);
  assert.match(testCardRenderSource, /luck-coin-test-result/);
  assert.doesNotMatch(testCardRenderSource, /本次/);
  assert.doesNotMatch(testCardRenderSource, /\{tier\.star\}\/5/);
  assert.doesNotMatch(testCardRenderSource, /luck-coin-test-tier/);
  assert.doesNotMatch(testCardRenderSource, /luck-coin-test-next/);
  assert.doesNotMatch(testCardSource, /luckCoinPopups|setLuckCoinPopups|luckCoinPopups\.map/);
  assert.doesNotMatch(testCardRenderSource, /luck-coin-test-progress/);

  assert.match(cssSource, /\.luck-coin-test\s*\{[\s\S]*border:\s*1px solid var\(--line\);[\s\S]*background:\s*var\(--surface\);/);
  assert.match(cssSource, /\.luck-coin-test-result\s*\{/);
  assert.match(cssSource, /\.luck-coin-test-result\.tone-advanced-empty/);
  assert.match(cssSource, /\.luck-coin-test-result\.tone-advanced-tier-1/);
  assert.match(cssSource, /\.luck-coin-test-result\.tone-advanced-tier-2/);
  assert.match(cssSource, /\.luck-coin-test-result\.tone-advanced-tier-3/);
  assert.match(cssSource, /\.luck-coin-test-result\.tone-advanced-gold/);
  assert.match(cssSource, /\.luck-coin-test-score-card\.result-tone-advanced-tier-3/);
  assert.match(cssSource, /\.luck-coin-test-score-card\.result-tone-advanced-gold/);
  assert.match(cssSource, /@keyframes luck-coin-result-pop/);
  assert.match(cssSource, /@keyframes luck-coin-result-pop\s*\{[\s\S]*100%\s*\{[\s\S]*opacity:\s*1;/);
  assert.match(cssSource, /\.luck-coin-test-side\s*\{[\s\S]*grid-template-rows:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(cssSource, /\.luck-coin-test-progress/);
  assert.doesNotMatch(cssSource, /@keyframes luck-coin-number-pop/);
  assert.doesNotMatch(cssSource, /luck-coin-rare-glow/);
});
