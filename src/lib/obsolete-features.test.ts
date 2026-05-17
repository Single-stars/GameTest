import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getAdvancedStageConfig } from "./advanced-challenges.ts";

const APP_CSS_SOURCE_URLS = [
  new URL("../app/globals.css", import.meta.url),
  new URL("../app/styles/base-flow.css", import.meta.url),
  new URL("../app/styles/base-flow/tokens.css", import.meta.url),
  new URL("../app/styles/base-flow/shell.css", import.meta.url),
  new URL("../app/styles/base-flow/home-intro.css", import.meta.url),
  new URL("../app/styles/base-flow/shared-controls.css", import.meta.url),
  new URL("../app/styles/base-flow/play-frame.css", import.meta.url),
  new URL("../app/styles/base-flow/native-reaction.css", import.meta.url),
  new URL("../app/styles/base-flow/native-aim.css", import.meta.url),
  new URL("../app/styles/base-flow/native-braking.css", import.meta.url),
  new URL("../app/styles/base-flow/results.css", import.meta.url),
  new URL("../app/styles/base-flow/advanced.css", import.meta.url),
  new URL("../app/styles/base-flow/luck.css", import.meta.url),
  new URL("../app/styles/mini-games.css", import.meta.url),
  new URL("../app/styles/mini-games/common.css", import.meta.url),
  new URL("../app/styles/mini-games/doodle.css", import.meta.url),
  new URL("../app/styles/mini-games/flappy.css", import.meta.url),
  new URL("../app/styles/mini-games/knife.css", import.meta.url),
  new URL("../app/styles/mini-games/square-jump.css", import.meta.url),
  new URL("../app/styles/mini-games/fall-down.css", import.meta.url),
  new URL("../app/styles/overlays-responsive.css", import.meta.url),
];

function readAppCssSource() {
  return APP_CSS_SOURCE_URLS.map((url) => readFileSync(url, "utf8")).join("\n");
}

test("obsolete prototype route and entry point are removed", () => {
  const obsoleteSegment = ["control", "maze", "prototype"].join("-");
  const obsoleteEntryText = ["控制", "原型"].join("");
  const miniPrototypeRoute = new URL("../app/mini-game-prototypes/page.tsx", import.meta.url);
  const obsoleteRoute = new URL(`../app/${obsoleteSegment}/page.tsx`, import.meta.url);
  const resultPage = new URL("../app/page.tsx", import.meta.url);
  const resultPageSource = readFileSync(resultPage, "utf8");

  assert.equal(existsSync(obsoleteRoute), false);
  assert.equal(existsSync(miniPrototypeRoute), false);
  assert.equal(resultPageSource.includes(`/${obsoleteSegment}`), false);
  assert.equal(resultPageSource.includes('href="/mini-game-prototypes"'), false);
  assert.equal(resultPageSource.includes("小游戏原型测试"), false);
  assert.equal(resultPageSource.includes(obsoleteEntryText), false);
});

test("obsolete mini-game prototype shell UI is removed while embedded runtime remains", () => {
  const removedAppFacade = new URL("../app/mini-game-prototypes.tsx", import.meta.url);
  const componentSource = readFileSync(new URL("../features/mini-games/embedded-stage.tsx", import.meta.url), "utf8");
  const roundPlayerSource = readFileSync(new URL("../features/rounds/round-player.tsx", import.meta.url), "utf8");
  const cssSource = readAppCssSource();

  assert.equal(existsSync(removedAppFacade), false);

  for (const term of [
    "MiniGameEntryPanel",
    "MiniGameLevelSelectScreen",
    "MiniGamePlayScreen",
    "mini-game-entry-panel",
    "mini-game-level-card",
    "mini-game-play-screen",
  ]) {
    assert.equal(componentSource.includes(term), false, term);
  }

  assert.equal(componentSource.includes("MiniGameEmbeddedStage"), true, "MiniGameEmbeddedStage");

  for (const term of [
    "MiniGameBaseRound",
    "MiniGameAdvancedRound",
  ]) {
    assert.equal(roundPlayerSource.includes(term), true, term);
  }

  for (const selector of [
    ".mini-game-entry-",
    ".mini-game-level-",
    ".mini-game-play-screen",
    ".mini-game-hero",
    ".mini-game-section-title",
    ".mini-game-base-card",
    ".mini-game-round-header",
  ]) {
    assert.equal(cssSource.includes(selector), false, selector);
  }

  for (const selector of [
    ".prototype-game-wrap",
    ".prototype-stage",
    ".prototype-player-box",
    ".prototype-end-overlay",
  ]) {
    assert.equal(cssSource.includes(selector), true, selector);
  }
});

test("obsolete search and memory pure helpers are removed after formal mini-game replacement", () => {
  for (const url of [
    new URL("search-scenes.ts", import.meta.url),
    new URL("search-scenes.test.ts", import.meta.url),
    new URL("advanced-memory.ts", import.meta.url),
    new URL("advanced-memory.test.ts", import.meta.url),
  ]) {
    assert.equal(existsSync(url), false, url.pathname);
  }
});

test("legacy search memory and patience fallback rounds are removed after mini-game replacement", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const miniGameRoundsSource = readFileSync(new URL("../features/game-flow/mini-game-rounds.tsx", import.meta.url), "utf8");
  const roundPlayerSource = readFileSync(new URL("../features/rounds/round-player.tsx", import.meta.url), "utf8");
  const cssSource = readAppCssSource();
  const baseMappingSource = miniGameRoundsSource.slice(miniGameRoundsSource.indexOf("function miniGameIdForBaseRound"), miniGameRoundsSource.indexOf("type MiniAdvancedStageConfig"));

  assert.match(baseMappingSource, /const implementation = getRoundDefinition\(round\)\.base;/);
  assert.match(baseMappingSource, /implementation\.type === "mini-game" \? implementation\.gameId : null/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "search"\) return "doodle";/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "memory"\) return "flappy";/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "patience"\) return "knife";/);
  assert.match(roundPlayerSource, /const implementation = getRoundDefinition\(roundId\)\[phase\];/);
  assert.match(roundPlayerSource, /implementation\.type === "mini-game"[\s\S]*return <MiniGameAdvancedRound/);
  assert.match(roundPlayerSource, /implementation\.type === "mini-game"[\s\S]*return <MiniGameBaseRound/);

  for (const [roundId, miniGameId] of [
    ["search", "doodle"],
    ["memory", "flappy"],
    ["patience", "knife"],
  ] as const) {
    for (let level = 1; level <= 10; level += 1) {
      const config = getAdvancedStageConfig(roundId, level);
      assert.equal(config.params.miniGameId, miniGameId);
      assert.equal(typeof config.params.miniLevelId, "string");
    }
  }

  for (const term of [
    "function SearchRound",
    "function MemoryRound",
    "function PatienceRound",
    "function AdvancedSearchRound",
    "function AdvancedMemoryRound",
    "function AdvancedPatienceRound",
    "<SearchRound",
    "<MemoryRound",
    "<PatienceRound",
    "<AdvancedSearchRound",
    "<AdvancedMemoryRound",
    "<AdvancedPatienceRound",
  ]) {
    assert.equal(appPageSource.includes(term), false, term);
  }

  for (const selector of [
    ".advanced-search",
    ".advanced-memory",
    ".advanced-patience",
    ".search-area",
    ".search-dot",
    ".search-answer-panel",
    ".memory-panel",
    ".memory-grid",
    ".memory-color-cell",
    ".memory-options",
    ".memory-color-option",
    ".patience-panel",
    ".patience-bar",
  ]) {
    assert.equal(cssSource.includes(selector), false, selector);
  }
});

test("replaced stroop and rhythm gameplay implementations are removed", () => {
  const appPage = new URL("../app/page.tsx", import.meta.url);
  const advancedStroop = new URL("advanced-stroop.ts", import.meta.url);
  const advancedStroopTest = new URL("advanced-stroop.test.ts", import.meta.url);
  const advancedRhythm = new URL("advanced-rhythm.ts", import.meta.url);
  const advancedRhythmTest = new URL("advanced-rhythm.test.ts", import.meta.url);
  const appPageSource = readFileSync(appPage, "utf8");
  const cssSource = readAppCssSource();

  assert.equal(existsSync(advancedStroop), false);
  assert.equal(existsSync(advancedStroopTest), false);
  assert.equal(existsSync(advancedRhythm), false);
  assert.equal(existsSync(advancedRhythmTest), false);

  for (const term of [
    "@/lib/advanced-stroop",
    "@/lib/advanced-rhythm",
    "AdvancedStroopRound",
    "AdvancedRhythmRound",
    "function StroopRound",
    "function RhythmRound",
    "makeStroopItem",
    "rhythmSequence",
    "shrinking-ring",
    "stroop-word",
  ]) {
    assert.equal(appPageSource.includes(term), false, term);
  }

  for (const selector of [
    ".advanced-stroop",
    ".advanced-rhythm",
    ".stroop-panel",
    ".rhythm-panel",
    ".stroop-word",
    ".shrinking-ring",
    ".prototype-test-page",
  ]) {
    assert.equal(cssSource.includes(selector), false, selector);
  }
});

test("legacy stroop and rhythm scoring fallbacks are removed", () => {
  const scoringSource = readFileSync(new URL("scoring.ts", import.meta.url), "utf8");
  const advancedChallengeSource = readFileSync(new URL("advanced-challenges.ts", import.meta.url), "utf8");

  for (const term of [
    "value?.congruent",
    "congruentTimes",
    "incongruentTimes",
    "stroopInterferenceMs",
    "value?.offsetMs",
    "rhythmWrongLane",
    "rhythmSdOffsetMs",
  ]) {
    assert.equal(scoringSource.includes(term), false, term);
  }

  for (const term of [
    "answerTimeLimitMs",
    "offsetThresholdMs",
    "beatType",
    "fakeTap",
    "wrongLane",
  ]) {
    assert.equal(advancedChallengeSource.includes(term), false, term);
  }
});
