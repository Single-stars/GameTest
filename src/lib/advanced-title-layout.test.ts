import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing source marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("advanced playing header constrains long titles instead of letting them expand the top bar", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /getResponsiveTitleFontSize/);
  assert.match(screenSource, /availableWidthPx:\s*number/);
  assert.match(screenSource, /titleWidthAtMaxFontPx:\s*number/);
  assert.match(screenSource, /Math\.floor\(maxFontSizePx \* fitRatio\)/);
  assert.match(screenSource, /AdaptiveAdvancedHeaderTitle/);
  assert.match(screenSource, /title=\{getAdvancedChallengeHeroTitle/);

  assert.match(cssSource, /\.advanced-round-header\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/);
  assert.match(cssSource, /\.advanced-header-title-block\s*{[\s\S]*min-width:\s*0;/);
  assert.match(cssSource, /\.advanced-round-header h1\s*{[\s\S]*white-space:\s*nowrap;[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;/);
  assert.match(cssSource, /\.advanced-title-measure\s*{[\s\S]*visibility:\s*hidden;[\s\S]*white-space:\s*nowrap;/);
});

test("advanced hero title uses the registered round title without reaction-only naming", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /function getAdvancedChallengeHeroTitle/);
  assert.match(screenSource, /return `\$\{roundTitle\} · \$\{stageTitle\}`;/);
  assert.doesNotMatch(screenSource, /roundId === "reaction"/);
  assert.doesNotMatch(screenSource, /"红灯行"/);
});

test("advanced result card uses challenge success labels, perfect clear status, and filtered failed goals", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /const outcomeTitle = `进阶\$\{challenge\.level\}·\$\{challenge\.passed \? "挑战成功" : "挑战失败"\}`;/);
  assert.match(screenSource, /<p className="eyebrow">\{outcomeTitle\}<\/p>/);
  assert.match(screenSource, /className="advanced-result-perfect"/);
  assert.match(screenSource, />✓<\/span>/);
  assert.match(screenSource, />完美通关<\/span>/);
  assert.doesNotMatch(screenSource, /差一点/);
  assert.doesNotMatch(screenSource, /<small>\{challenge\.correctCount\}\/\{challenge\.requiredCorrect\}<\/small>/);
  assert.match(screenSource, /resolveResultGoalChecks/);
  assert.match(screenSource, /getAdvancedFailedResultGoalItems/);
  assert.match(screenSource, /const failedGoalItems = getAdvancedFailedResultGoalItems\(resultGoalItems\);/);
  assert.match(screenSource, /className="advanced-result-goals"/);
  assert.match(screenSource, /failedGoalItems\.map/);
  assert.match(screenSource, /className="advanced-result-goal incomplete"/);
  assert.match(screenSource, /className="advanced-result-goal-box"/);
  assert.match(screenSource, />×<\/span>/);
  assert.doesNotMatch(screenSource, /\{goal\.complete \? "✓" : "×"\}/);

  assert.match(cssSource, /\.advanced-result-goals\s*{[\s\S]*list-style:\s*none;/);
  assert.match(cssSource, /\.advanced-result-perfect\s*{[\s\S]*grid-template-columns:\s*34px minmax\(0,\s*1fr\);/);
  assert.match(cssSource, /\.advanced-result-goal\s*{[\s\S]*grid-template-columns:\s*34px minmax\(0,\s*1fr\);/);
  assert.match(cssSource, /\.advanced-result-goal-box\s*{[\s\S]*border-radius:\s*8px;/);
  assert.match(cssSource, /\.advanced-result-perfect\s+\.advanced-result-goal-box\s*{[\s\S]*color:\s*#2f7f59;/);
  assert.doesNotMatch(cssSource, /\.advanced-result-card h2\s*{/);
});

test("advanced lobby measurement hooks are isolated from the main challenge screen", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /function AdvancedLevelSelectionPanel/);
  assert.match(screenSource, /function AdvancedLobbyContent/);

  const selectionPanelSource = sourceBetween(screenSource, "function AdvancedLevelSelectionPanel", "function AdvancedLobbyContent");
  const mainScreenSource = screenSource.slice(screenSource.indexOf("export function AdvancedChallengeScreen"));

  assert.match(selectionPanelSource, /const carouselRef = React\.useRef<HTMLDivElement \| null>\(null\);/);
  assert.match(selectionPanelSource, /const sliderVisualRef = React\.useRef<HTMLDivElement \| null>\(null\);/);
  assert.match(selectionPanelSource, /const \[trackStepPx,\s*setTrackStepPx\] = React\.useState\(DEFAULT_LOBBY_TRACK_STEP_PX\);/);
  assert.match(selectionPanelSource, /const \[sliderTravelPx,\s*setSliderTravelPx\] = React\.useState\(0\);/);
  assert.match(selectionPanelSource, /useBrowserLayoutEffect\(\(\) => \{[\s\S]*sliderVisualRef\.current[\s\S]*}, \[unlockedLevel\]\);/);

  assert.doesNotMatch(mainScreenSource, /const carouselRef = React\.useRef/);
  assert.doesNotMatch(mainScreenSource, /const sliderVisualRef = React\.useRef/);
  assert.doesNotMatch(mainScreenSource, /sliderTravelPx/);
  assert.doesNotMatch(mainScreenSource, /useBrowserLayoutEffect/);
  assert.match(mainScreenSource, /<AdvancedLobbyContent/);
});

test("advanced lobby rules render stable check icons", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /function formatReactionAverageGoalText/);
  assert.match(screenSource, /平均反应 \$\{averageMs === null \? "--" : averageMs}\/\$\{thresholdMs}ms/);
  assert.match(screenSource, /const ruleItems = getAdvancedChallengeRuleItems\(activeConfig\);/);
  assert.match(screenSource, /ruleItems\.map/);
  assert.match(screenSource, /className="advanced-goal-item complete"/);
  assert.match(screenSource, /className="advanced-goal-box"/);
  assert.match(screenSource, />✓<\/span>/);
  assert.doesNotMatch(screenSource, /selectionGoalChecks/);
  assert.doesNotMatch(screenSource, /\{selectionGoalChecks\[index] === null \? "" : selectionGoalChecks\[index] \? "✓" : "×"\}/);

  assert.match(cssSource, /\.advanced-goal-box\s*{[\s\S]*border-radius:\s*8px;/);
  assert.match(cssSource, /\.advanced-goal-item\.pending\s+\.advanced-goal-box\s*{[\s\S]*color:\s*rgba\(24,\s*24,\s*24,\s*0\.38\);/);
  assert.match(cssSource, /\.advanced-goal-item\.complete\s+\.advanced-goal-box\s*{[\s\S]*color:\s*#2f7f59;/);
  assert.match(cssSource, /\.advanced-goal-item\.incomplete\s+\.advanced-goal-box\s*{[\s\S]*color:\s*#8f3b35;/);
});
