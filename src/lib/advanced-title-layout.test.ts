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

test("advanced result card uses challenge success labels and a self-check goal list", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /challenge\.passed \? "挑战成功" : "挑战失败"/);
  assert.doesNotMatch(screenSource, /差一点/);
  assert.doesNotMatch(screenSource, /<small>\{challenge\.correctCount\}\/\{challenge\.requiredCorrect\}<\/small>/);
  assert.match(screenSource, /getAdvancedResultGoalStatus/);
  assert.match(screenSource, /className="advanced-result-goals"/);
  assert.match(screenSource, /className=\{`advanced-result-goal \$\{goal\.complete \? "complete" : "incomplete"\}`\}/);
  assert.match(screenSource, /className="advanced-result-goal-box"/);
  assert.match(screenSource, /\{goal\.complete \? "✓" : "×"\}/);

  assert.match(cssSource, /\.advanced-result-goals\s*{[\s\S]*list-style:\s*none;/);
  assert.match(cssSource, /\.advanced-result-goal\s*{[\s\S]*grid-template-columns:\s*34px minmax\(0,\s*1fr\);/);
  assert.match(cssSource, /\.advanced-result-goal-box\s*{[\s\S]*border-radius:\s*8px;/);
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
