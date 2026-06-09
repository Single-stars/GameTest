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

function cssRule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing CSS rule: ${selector}`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `Unterminated CSS rule: ${selector}`);
  return source.slice(start, end);
}

function cssRuleAfter(source: string, selector: string, anchor: string) {
  const anchorStart = source.indexOf(anchor);
  assert.notEqual(anchorStart, -1, `Missing CSS anchor: ${anchor}`);
  const start = source.indexOf(`${selector} {`, anchorStart + anchor.length);
  assert.notEqual(start, -1, `Missing CSS rule after ${anchor}: ${selector}`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `Unterminated CSS rule: ${selector}`);
  return source.slice(start, end);
}

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

test("luck draw screen promotes the luck coin button to the production draw entry", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");

  assert.match(screenSource, /LuckCoinTestCard/);
  assert.match(screenSource, /<LuckCoinTestCard[\s\S]*advancedProgress=\{advancedProgress\}[\s\S]*onDraw=\{draw\}[\s\S]*\/>/);
  assert.doesNotMatch(screenSource.slice(screenSource.indexOf("<LuckCoinTestCard"), screenSource.indexOf("{SHOW_LEGACY_LUCK_SLOT")), /statusText=/);
  assert.match(screenSource, /const isMaxLuck = advancedProgress\.luckBestScore >= 100 \|\| advancedProgress\.luckStars >= 20/);
  assert.match(screenSource, /const hasLuckCoin = coinBalance > 0/);
  assert.match(screenSource, /const isFirstLuckDrawPrompt = drawCount === 0 && coinBalance >= 1 && score === 0/);
  assert.match(screenSource, /const actionText = isMaxLuck[\s\S]*\? "幸运已达最大值"[\s\S]*: hasLuckCoin[\s\S]*\? "消耗一枚幸运币点击按钮"[\s\S]*: "首次通关进阶关卡获得幸运币"/);
  assert.doesNotMatch(screenSource.slice(screenSource.indexOf("function LuckCoinTestCard"), screenSource.indexOf("function LegacyLuckSlotMachine")), /"暂无幸运币"/);
  assert.doesNotMatch(screenSource.slice(screenSource.indexOf("function LuckCoinTestCard"), screenSource.indexOf("function LegacyLuckSlotMachine")), /"抽取中"/);
  assert.match(screenSource, /const \[blockedNotice, setBlockedNotice\] = useState/);
  assert.match(screenSource, /triggerBlockedNotice\("幸运已达最大值", "max"\)/);
  assert.match(screenSource, /triggerBlockedNotice\("幸运币不足", "empty"\)/);
  assert.match(screenSource, /const outcome = onDraw\(\);/);
  assert.doesNotMatch(screenSource, /const testCoinBalance = 9999;/);
  assert.doesNotMatch(screenSource, /resolveLuckCoinTestScore\(Math\.random\(\)\)/);
  assert.match(screenSource, /className=\{`luck-coin-test-score-card tone-\$\{tier\.tone\}[\s\S]*blocked-feedback[\s\S]*first-draw-prompt[\s\S]*result-tone/);
  assert.match(screenSource, /const \[resultPopup, setResultPopup\] = useState/);
  assert.match(screenSource, /\{advancedProgress\.luckDrawChances\}/);
  assert.match(cssSource, /\.luck-coin-test-layout\s*{/);
  assert.match(cssSource, /\.luck-coin-test-side\s*{/);
  assert.match(cssSource, /@keyframes luck-coin-result-pop/);
  assert.match(cssSource, /@keyframes luck-coin-score-pulse/);
  assert.match(cssSource, /\.luck-coin-test-result\.tone-advanced-gold/);
});

test("luck coin production card uses real progress and hides the legacy slot machine from production UI", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");
  const testCardStart = screenSource.indexOf("function LuckCoinTestCard");
  const testCardDrawStart = screenSource.indexOf("  const draw = () => {", testCardStart);
  const testCardSource = screenSource.slice(testCardStart, screenSource.indexOf("  return (", testCardDrawStart));
  const testCardRenderStart = screenSource.indexOf("<section className={`luck-coin-test");
  const testCardRenderSource = screenSource.slice(testCardRenderStart, screenSource.indexOf("</section>", testCardRenderStart));
  const scoreButtonSource = screenSource.slice(screenSource.indexOf("<button", testCardRenderStart), screenSource.indexOf("</button>", testCardRenderStart));
  const productionSource = screenSource.slice(screenSource.indexOf("return ("), screenSource.indexOf("function LegacyLuckSlotMachine"));
  const statCardRule = cssRuleAfter(cssSource, ".luck-coin-test-stat-card", ".luck-coin-test-side {");
  const statLabelRule = cssRule(cssSource, ".luck-coin-test-stat-card span");

  assert.match(testCardSource, /const score = advancedProgress\.luckBestScore;/);
  assert.match(testCardSource, /const drawCount = advancedProgress\.luckDrawCount;/);
  assert.match(testCardSource, /const coinBalance = advancedProgress\.luckDrawChances;/);
  assert.match(testCardSource, /const \[resultPopup, setResultPopup\] = useState/);
  assert.match(testCardSource, /const points = Math\.max\(0, outcome\.score - previousScore\);/);
  assert.match(testCardSource, /getLuckCoinTestPointTone\(Math\.max\(1, points\)\)/);
  assert.doesNotMatch(testCardSource, /lastPoints/);
  assert.match(testCardRenderSource, /luck-coin-test-layout/);
  assert.match(testCardRenderSource, /luck-coin-test-score-card/);
  assert.match(testCardRenderSource, /luck-coin-test-side/);
  assert.ok(testCardRenderSource.indexOf("luck-coin-test-side") < testCardRenderSource.indexOf("luck-coin-test-score-card"));
  assert.match(testCardRenderSource, /luck-coin-test-stat-card/);
  assert.match(testCardRenderSource, /已投币/);
  assert.match(testCardRenderSource, /幸运币/);
  assert.match(testCardRenderSource, /className="luck-coin-test-caption"/);
  assert.match(testCardRenderSource, /<p className="luck-coin-test-caption" aria-live="polite">\{actionText\}<\/p>/);
  assert.ok(testCardRenderSource.indexOf("</button>") < testCardRenderSource.indexOf("luck-coin-test-caption"));
  assert.doesNotMatch(testCardRenderSource, /\{actionText \? \(/);
  assert.doesNotMatch(scoreButtonSource, /luck-coin-test-caption|actionText|消耗一枚幸运币点击按钮|首次通关进阶关卡获得幸运币|幸运已达最大值/);
  assert.match(testCardRenderSource, /aria-disabled=\{!canDraw \? true : undefined\}/);
  assert.doesNotMatch(testCardRenderSource, /disabled=\{!canDraw\}/);
  assert.match(testCardRenderSource, /luck-coin-test-stat-value/);
  assert.match(testCardRenderSource, /\{drawCount\}<small>\/80<\/small>/);
  assert.match(testCardRenderSource, /\{coinBalance\}/);
  assert.match(testCardRenderSource, /luck-coin-test-result/);
  assert.match(testCardRenderSource, /luck-coin-test-blocked-notice/);
  assert.match(testCardRenderSource, /first-draw-prompt/);
  assert.doesNotMatch(testCardRenderSource, /luck-rule-text/);
  assert.doesNotMatch(testCardSource, /statusText/);
  assert.doesNotMatch(testCardRenderSource, /新版幸运币测试/);
  assert.doesNotMatch(productionSource, /className="slot-machine"/);
  assert.match(screenSource, /function LegacyLuckSlotMachine/);
  assert.doesNotMatch(testCardRenderSource, /本次/);
  assert.doesNotMatch(testCardRenderSource, /\{tier\.star\}\/5/);
  assert.doesNotMatch(testCardRenderSource, /luck-coin-test-tier/);
  assert.doesNotMatch(testCardRenderSource, /luck-coin-test-next/);
  assert.doesNotMatch(testCardSource, /luckCoinPopups|setLuckCoinPopups|luckCoinPopups\.map/);
  assert.doesNotMatch(testCardRenderSource, /luck-coin-test-progress/);

  assert.match(cssSource, /\.luck-coin-test\s*\{[\s\S]*border:\s*1px solid var\(--line\);[\s\S]*background:\s*var\(--surface\);/);
  assert.doesNotMatch(cssSource, /\.luck-coin-test\s*\{[\s\S]*margin-top:\s*16px;/);
  assert.match(cssSource, /\.luck-coin-test-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(96px,\s*0\.46fr\)\s*minmax\(0,\s*1fr\);/);
  assert.match(cssSource, /\.luck-coin-test-score-card\.first-draw-prompt::after\s*\{[\s\S]*animation:\s*advanced-card-breath 1800ms ease-in-out infinite;/);
  assert.match(cssSource, /\.luck-coin-test-score-card\.blocked-feedback\s*\{[\s\S]*luck-coin-blocked-shake/);
  assert.match(cssSource, /\.luck-coin-test-blocked-notice\s*\{/);
  assert.match(cssSource, /\.luck-coin-test-caption\s*\{/);
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
  assert.match(cssSource, /\.luck-coin-test-stat-card\s*\{[\s\S]*grid-template-rows:\s*auto 1fr;[\s\S]*justify-items:\s*start;/);
  assert.match(cssSource, /\.luck-coin-test-score-card,\s*\.luck-coin-test-stat-card\s*\{[\s\S]*border:\s*1px solid var\(--line\);[\s\S]*background:\s*#fffdf8;/);
  assert.doesNotMatch(statCardRule, /border:\s*0;/);
  assert.doesNotMatch(statCardRule, /background:\s*transparent;/);
  assert.doesNotMatch(statCardRule, /box-shadow:\s*none;/);
  assert.doesNotMatch(cssSource, /\.luck-coin-test-stat-card::before/);
  assert.match(cssSource, /\.luck-coin-test-stat-card span\s*\{[\s\S]*font-size:\s*15px;/);
  assert.doesNotMatch(statLabelRule, /background:/);
  assert.doesNotMatch(statLabelRule, /border:/);
  assert.match(cssSource, /\.luck-coin-test-stat-card strong\s*\{[\s\S]*justify-self:\s*start;/);
  assert.match(cssSource, /\.luck-coin-test-stat-card strong small\s*\{/);
  assert.doesNotMatch(cssSource, /\.luck-coin-test-progress/);
  assert.doesNotMatch(cssSource, /@keyframes luck-coin-number-pop/);
  assert.doesNotMatch(cssSource, /luck-coin-rare-glow/);
});

test("luck coin first visit guide blocks all clicks and labels the score", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");
  const testCardStart = screenSource.indexOf("function LuckCoinTestCard");
  const testCardEnd = screenSource.indexOf("function LegacyLuckSlotMachine");
  const testCardSource = screenSource.slice(testCardStart, testCardEnd);
  const testCardRenderSource = screenSource.slice(screenSource.indexOf("<section className={`luck-coin-test"), testCardEnd);
  const layoutRule = cssRule(cssSource, ".luck-coin-test-layout");
  const guideShadeRule = cssRule(cssSource, ".luck-coin-test-guide-shade");
  const guideTapRule = cssRule(cssSource, ".luck-coin-test-guide-tap-target");
  const guideTextRule = cssRule(cssSource, ".luck-coin-test-guide-text");
  const guideScoreTextRule = cssRule(cssSource, ".luck-coin-test.is-guiding.guide-score .luck-coin-test-guide-text");
  const guideCoinTextRule = cssRule(cssSource, ".luck-coin-test.is-guiding.guide-coin .luck-coin-test-guide-text");
  const scoreLabelRule = cssRule(cssSource, ".luck-coin-test-score-label");
  const mobileRule = cssSource.slice(cssSource.indexOf("@media (max-width: 420px)"));

  assert.match(screenSource, /LUCK_COIN_GUIDE_STORAGE_KEY = "luckCoinGuideSeen"/);
  assert.match(testCardSource, /useState<"score" \| "coin" \| null>\(null\)/);
  assert.match(testCardSource, /localStorage\.getItem\(LUCK_COIN_GUIDE_STORAGE_KEY\)/);
  assert.match(testCardSource, /localStorage\.setItem\(LUCK_COIN_GUIDE_STORAGE_KEY, "1"\)/);
  assert.match(testCardSource, /const guideText = guideStep === "score"[\s\S]*消耗幸运币点击按钮可以获得幸运值[\s\S]*首次通过进阶关可以获得幸运币/);
  assert.match(testCardSource, /current === "score"[\s\S]*return "coin"/);
  assert.match(testCardRenderSource, /className=\{`luck-coin-test\$\{guideStep \? ` is-guiding guide-\$\{guideStep\}` : ""\}`\}/);
  assert.match(testCardRenderSource, /className="luck-coin-test-stat-card coin-focus"/);
  assert.match(testCardRenderSource, /\{drawCount\}<small>\/80<\/small>[\s\S]*className="luck-coin-test-stat-card coin-focus"[\s\S]*\{coinBalance\}/);
  assert.match(testCardRenderSource, /className="luck-coin-test-score-label">幸运值<\/span>/);
  assert.match(testCardRenderSource, /luck-coin-test-guide-shade/);
  assert.match(testCardRenderSource, /luck-coin-test-guide-text/);
  assert.match(testCardRenderSource, /luck-coin-test-guide-tap-target/);
  assert.ok(testCardRenderSource.indexOf("luck-coin-test-guide-text") < testCardRenderSource.indexOf("luck-coin-test-guide-shade"));
  assert.doesNotMatch(testCardRenderSource, /onPointerDown=/);
  assert.match(testCardRenderSource, /onClick=\{advanceLuckCoinGuide\}/);
  assert.ok(testCardRenderSource.indexOf("luck-coin-test-guide-tap-target") > testCardRenderSource.indexOf("luck-coin-test-score-card"));

  assert.match(layoutRule, /position:\s*relative;/);
  assert.match(cssSource, /\.luck-coin-test\.is-guiding\.guide-score\s+\.luck-coin-test-score-card/);
  assert.match(cssSource, /\.luck-coin-test\.is-guiding\.guide-coin\s+\.luck-coin-test-stat-card\.coin-focus/);
  assert.match(guideShadeRule, /position:\s*fixed;/);
  assert.match(guideShadeRule, /inset:\s*0;/);
  assert.match(guideShadeRule, /background:\s*rgba\(0,\s*0,\s*0,\s*0\.58\);/);
  assert.match(guideTapRule, /position:\s*fixed;/);
  assert.match(guideTapRule, /inset:\s*0;/);
  assert.match(guideTapRule, /background:\s*transparent;/);
  assert.match(guideTapRule, /z-index:\s*80;/);
  assert.match(guideTextRule, /position:\s*absolute;/);
  assert.doesNotMatch(guideTextRule, /bottom:\s*max|position:\s*fixed/);
  assert.match(guideScoreTextRule, /grid-column:\s*2;/);
  assert.match(guideScoreTextRule, /align-self:\s*end;/);
  assert.match(guideScoreTextRule, /transform:\s*translateY\(calc\(100% \+ 16px\)\);/);
  assert.match(guideCoinTextRule, /grid-column:\s*1;/);
  assert.match(guideCoinTextRule, /align-self:\s*end;/);
  assert.match(guideCoinTextRule, /transform:\s*translateY\(calc\(100% \+ 16px\)\);/);
  assert.match(cssSource, /\.luck-coin-test\.is-guiding\s+\.luck-coin-test-caption\s*\{[\s\S]*visibility:\s*hidden;/);
  assert.doesNotMatch(guideTextRule, /background|border|box-shadow|border-radius/);
  assert.match(scoreLabelRule, /position:\s*absolute;/);
  assert.match(scoreLabelRule, /left:\s*16px;/);
  assert.match(scoreLabelRule, /top:\s*16px;/);
  assert.match(mobileRule, /\.luck-coin-test-score-label\s*\{[\s\S]*font-size:\s*13px;/);
});

test("luck screen keeps revive coin exchange and test cards visible under the luck button", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");
  const productionSource = screenSource.slice(screenSource.indexOf("<LuckCoinTestCard"), screenSource.indexOf("{SHOW_LEGACY_LUCK_SLOT"));
  const exchangeCardSource = screenSource.slice(screenSource.indexOf("function ReviveCoinExchangeCards"), screenSource.indexOf("function LegacyLuckSlotMachine"));

  assert.match(screenSource, /onExchangeReviveCoin/);
  assert.match(screenSource, /onGrantReviveCoinForTest/);
  assert.ok(productionSource.indexOf("LuckCoinTestCard") < productionSource.indexOf("ReviveCoinExchangeCards"));
  assert.match(productionSource, /<ReviveCoinExchangeCards[\s\S]*advancedProgress=\{advancedProgress\}[\s\S]*onExchangeReviveCoin=\{onExchangeReviveCoin\}[\s\S]*onGrantReviveCoinForTest=\{onGrantReviveCoinForTest\}[\s\S]*\/>/);
  assert.match(exchangeCardSource, /const exchangeUnlocked = advancedProgress\.luckBestScore >= 100;/);
  assert.match(exchangeCardSource, /const canExchange = exchangeUnlocked && advancedProgress\.luckDrawChances > 0;/);
  assert.match(exchangeCardSource, /if \(!canExchange\) return;/);
  assert.match(exchangeCardSource, /onExchangeReviveCoin\(\);/);
  assert.match(exchangeCardSource, /onGrantReviveCoinForTest\(\);/);
  assert.match(exchangeCardSource, /advancedProgress\.reviveCoins/);
  assert.match(exchangeCardSource, /className="luck-revive-exchange-list"/);
  assert.match(exchangeCardSource, /className=\{`luck-revive-exchange-card exchange \$\{exchangeUnlocked \? "unlocked" : "locked"\}`\}/);
  assert.match(exchangeCardSource, /aria-disabled=\{!canExchange \? true : undefined\}/);
  assert.doesNotMatch(exchangeCardSource, /blockedNotice|triggerBlockedNotice|setBlockedNotice/);

  assert.match(cssSource, /\.luck-revive-exchange-list\s*{/);
  assert.match(cssSource, /\.luck-revive-exchange-card\s*{/);
  assert.match(cssSource, /\.luck-revive-exchange-card\.locked\s*{/);
  assert.match(cssSource, /\.luck-revive-exchange-card\.test\s*{/);
  assert.match(cssSource, /\.luck-revive-exchange-action\s*{/);
  assert.match(cssSource, /\.luck-revive-exchange-icon\s*{/);
  assert.doesNotMatch(cssSource, /luck-revive-exchange-toast|luck-revive-exchange-popup/);
});

test("app page persists revive coin exchange, test grants, and endless consumption", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const advancedScreenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");

  assert.match(appPageSource, /exchangeLuckCoinForReviveCoin/);
  assert.match(appPageSource, /grantReviveCoins/);
  assert.match(appPageSource, /consumeReviveCoin/);
  assert.match(appPageSource, /const exchangeReviveCoin = useCallback/);
  assert.match(appPageSource, /exchangeLuckCoinForReviveCoin\(previousProgress\)/);
  assert.match(appPageSource, /if \(!result\.exchanged\) return false;/);
  assert.match(appPageSource, /const grantReviveCoinForTest = useCallback/);
  assert.match(appPageSource, /grantReviveCoins\(previousProgress, 1\)/);
  assert.match(appPageSource, /const useReviveCoin = useCallback/);
  assert.match(appPageSource, /consumeReviveCoin\(previousProgress\)/);
  assert.match(appPageSource, /if \(!result\.consumed\) return false;/);
  assert.match(appPageSource, /onExchangeReviveCoin=\{exchangeReviveCoin\}/);
  assert.match(appPageSource, /onGrantReviveCoinForTest=\{grantReviveCoinForTest\}/);
  assert.match(appPageSource, /reviveCoins=\{advancedProgress\.reviveCoins\}/);
  assert.match(appPageSource, /onUseReviveCoin=\{useReviveCoin\}/);
  assert.match(advancedScreenSource, /reviveCoins: number;/);
  assert.match(advancedScreenSource, /onUseReviveCoin: \(\) => boolean;/);
  assert.match(advancedScreenSource, /reviveCoins=\{reviveCoins\}/);
  assert.match(advancedScreenSource, /onUseReviveCoin=\{onUseReviveCoin\}/);
});

test("luck coin card keeps the score button inside narrow mobile screens", () => {
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");
  const layoutRule = cssRule(cssSource, ".luck-coin-test-layout");
  const scoreRule = cssRule(cssSource, ".luck-coin-test-score-card");
  const mobileRule = cssSource.slice(cssSource.indexOf("@media (max-width: 420px)"));

  assert.match(layoutRule, /max-width:\s*100%;/);
  assert.match(layoutRule, /grid-template-columns:\s*minmax\(96px,\s*0\.46fr\)\s*minmax\(0,\s*1fr\);/);
  assert.match(scoreRule, /width:\s*100%;/);
  assert.match(scoreRule, /min-width:\s*0;/);
  assert.match(scoreRule, /box-sizing:\s*border-box;/);
  assert.match(mobileRule, /\.luck-coin-test\s*\{[\s\S]*padding:\s*14px 12px 18px;/);
  assert.match(mobileRule, /\.luck-coin-test-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(88px,\s*0\.38fr\)\s*minmax\(0,\s*1fr\);/);
  assert.match(mobileRule, /\.luck-coin-test-score-card\s*\{[\s\S]*aspect-ratio:\s*auto;/);
  assert.match(mobileRule, /\.luck-coin-test-score-card\s*\{[\s\S]*min-height:\s*clamp\(132px,\s*38vw,\s*158px\);/);
});

test("luck rule tooltip uses compact multi-line copy with point probabilities", () => {
  const screenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");

  assert.match(screenSource, /LUCK_RULE_LINES = \[/);
  assert.match(screenSource, /每次增加 1-5 运气分/);
  assert.match(screenSource, /\+1 75%/);
  assert.match(screenSource, /\+2 20%/);
  assert.match(screenSource, /\+3 3%/);
  assert.match(screenSource, /\+4 1\.5%/);
  assert.match(screenSource, /\+5 0\.5%/);
  assert.match(screenSource, /className="luck-rule-popover"/);
  assert.match(screenSource, /LUCK_RULE_LINES\.map/);
  assert.match(cssSource, /\.luck-rule-popover\s*\{/);
  assert.match(cssSource, /\.luck-rule-popover p\s*\{[\s\S]*margin:\s*0;/);
});

test("luck button production draw records a real 1-5 point gain", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const drawLuckSource = appPageSource.slice(appPageSource.indexOf("const drawLuck = useCallback"), appPageSource.indexOf("const drawLuckBatch", appPageSource.indexOf("const drawLuck = useCallback")));

  assert.match(appPageSource, /resolveLuckCoinTestScore/);
  assert.match(drawLuckSource, /const luckPointGain = resolveLuckCoinTestScore\(Math\.random\(\)\);/);
  assert.match(drawLuckSource, /recordLuckDraw\(\s*previousProgress,\s*Math\.min\(100,\s*previousProgress\.luckBestScore \+ luckPointGain\),\s*\)/);
  assert.doesNotMatch(drawLuckSource, /Math\.floor\(Math\.random\(\) \* 101\)/);
});
