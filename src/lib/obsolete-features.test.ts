import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getAdvancedStageConfig } from "./advanced-challenges.ts";

test("obsolete prototype route and entry point are removed", () => {
  const obsoleteSegment = ["control", "maze", "prototype"].join("-");
  const obsoleteEntryText = ["控制力", "原型"].join("");
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
  const componentSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

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
    assert.equal(appPageSource.includes(term), true, term);
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

test("legacy search memory and patience fallback rounds are removed after mini-game replacement", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const baseMappingSource = appPageSource.slice(appPageSource.indexOf("function miniGameIdForBaseRound"), appPageSource.indexOf("type MiniAdvancedStageConfig"));
  const roundRendererSource = appPageSource.slice(appPageSource.indexOf("function RoundRenderer"), appPageSource.indexOf("function getParamNumber"));

  assert.match(baseMappingSource, /if \(round === "search"\) return "doodle";/);
  assert.match(baseMappingSource, /if \(round === "memory"\) return "flappy";/);
  assert.match(baseMappingSource, /if \(round === "patience"\) return "knife";/);
  assert.match(roundRendererSource, /if \(isMiniGameAdvancedConfig\(advancedConfig\)\) \{\s*return <MiniGameAdvancedRound/);
  assert.match(roundRendererSource, /const baseMiniGameId = miniGameIdForBaseRound\(round\);[\s\S]*return <MiniGameBaseRound/);

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
  const appStyles = new URL("../app/globals.css", import.meta.url);
  const advancedStroop = new URL("advanced-stroop.ts", import.meta.url);
  const advancedStroopTest = new URL("advanced-stroop.test.ts", import.meta.url);
  const advancedRhythm = new URL("advanced-rhythm.ts", import.meta.url);
  const advancedRhythmTest = new URL("advanced-rhythm.test.ts", import.meta.url);
  const appPageSource = readFileSync(appPage, "utf8");
  const cssSource = readFileSync(appStyles, "utf8");

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
