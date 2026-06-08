import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ROUND_DEFINITIONS,
  getRoundDefinition,
} from "../features/rounds/registry.ts";

test("formal round registry preserves official order and base implementations", () => {
  assert.deepEqual(
    ROUND_DEFINITIONS.map((round) => round.id),
    ["reaction", "aim", "stroop", "search", "rhythm", "memory", "braking", "patience"],
  );

  assert.deepEqual(
    ROUND_DEFINITIONS.map((round) => [round.id, round.base]),
    [
      ["reaction", { type: "native", componentId: "reaction" }],
      ["aim", { type: "native", componentId: "aim" }],
      ["stroop", { type: "mini-game", gameId: "fall-down" }],
      ["search", { type: "mini-game", gameId: "doodle" }],
      ["rhythm", { type: "mini-game", gameId: "square-jump" }],
      ["memory", { type: "mini-game", gameId: "flappy" }],
      ["braking", { type: "native", componentId: "braking" }],
      ["patience", { type: "mini-game", gameId: "knife" }],
    ],
  );

  assert.deepEqual(
    ROUND_DEFINITIONS.map((round) => [round.id, round.advanced]),
    [
      ["reaction", { type: "native", componentId: "advanced-reaction" }],
      ["aim", { type: "native", componentId: "advanced-aim" }],
      ["stroop", { type: "mini-game", gameId: "fall-down" }],
      ["search", { type: "mini-game", gameId: "doodle" }],
      ["rhythm", { type: "mini-game", gameId: "square-jump" }],
      ["memory", { type: "mini-game", gameId: "flappy" }],
      ["braking", { type: "native", componentId: "advanced-braking" }],
      ["patience", { type: "mini-game", gameId: "knife" }],
    ],
  );

  assert.deepEqual(
    ROUND_DEFINITIONS.map((round) => [round.id, round.title, round.label]),
    [
      ["reaction", "绿灯行", "反应"],
      ["aim", "移动靶", "精准"],
      ["stroop", "一路向下", "专注"],
      ["search", "一路向上", "走位"],
      ["rhythm", "跳一跳", "手感"],
      ["memory", "一路向前", "协调"],
      ["braking", "停下来", "控制"],
      ["patience", "丢飞刀", "时机"],
    ],
  );

  for (const round of ROUND_DEFINITIONS) {
    assert.equal(getRoundDefinition(round.id), round);
    assert.equal(typeof round.title, "string");
    assert.equal(typeof round.label, "string");
    assert.equal(typeof round.rule, "string");
    assert.equal(typeof round.action, "string");
    assert.notEqual(round.title.length, 0);
    assert.notEqual(round.label.length, 0);
    assert.notEqual(round.rule.length, 0);
    assert.notEqual(round.action.length, 0);
  }
});

test("base round rendering reads formal implementations from the round registry", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const roundPlayerSource = readFileSync(new URL("../features/rounds/round-player.tsx", import.meta.url), "utf8");
  const miniGameRoundsSource = readFileSync(new URL("../features/game-flow/mini-game-rounds.tsx", import.meta.url), "utf8");
  const baseMappingSource = miniGameRoundsSource.slice(miniGameRoundsSource.indexOf("function miniGameIdForBaseRound"), miniGameRoundsSource.indexOf("type MiniAdvancedStageConfig"));

  assert.match(appPageSource, /<RoundPlayer[\s\S]*phase="base"[\s\S]*roundId=\{currentRound\.id\}/);
  assert.match(roundPlayerSource, /const implementation = getRoundDefinition\(roundId\)\[phase\];/);
  assert.match(roundPlayerSource, /implementation\.type === "mini-game"[\s\S]*<MiniGameBaseRound gameId=\{implementation\.gameId\}/);
  assert.match(roundPlayerSource, /switch \(implementation\.componentId\)/);
  assert.doesNotMatch(roundPlayerSource, /miniGameIdForBaseRound\(roundId\)/);
  assert.match(baseMappingSource, /const implementation = getRoundDefinition\(round\)\.base;/);
  assert.match(baseMappingSource, /implementation\.type === "mini-game" \? implementation\.gameId : null/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "search"\) return "doodle";/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "stroop"\) return "fall-down";/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "rhythm"\) return "square-jump";/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "memory"\) return "flappy";/);
  assert.doesNotMatch(baseMappingSource, /if \(round === "patience"\) return "knife";/);
});

test("result screen card order follows the base round order with fall-down before doodle", () => {
  const resultScreenSource = readFileSync(new URL("../features/results/result-screen.tsx", import.meta.url), "utf8");
  const rowsSource = resultScreenSource.slice(
    resultScreenSource.indexOf("const rows = ["),
    resultScreenSource.indexOf("] as const satisfies", resultScreenSource.indexOf("const rows = [")),
  );

  assert.equal(rowsSource.indexOf('roundId: "stroop"') < rowsSource.indexOf('roundId: "search"'), true);
  assert.equal(rowsSource.indexOf("ROUND_DISPLAY_BY_ID.stroop.label") < rowsSource.indexOf("ROUND_DISPLAY_BY_ID.search.label"), true);
});

test("advanced round rendering reads formal implementations from the round registry", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const roundPlayerSource = readFileSync(new URL("../features/rounds/round-player.tsx", import.meta.url), "utf8");

  assert.match(appPageSource, /<RoundPlayer[\s\S]*advancedConfig=\{props\.phase === "advanced" \? props\.advancedConfig : undefined\}/);
  assert.match(appPageSource, /<RoundPlayer[\s\S]*phase=\{props\.phase\}[\s\S]*roundId=\{props\.round\}/);
  assert.match(roundPlayerSource, /const implementation = getRoundDefinition\(roundId\)\[phase\];/);
  assert.match(roundPlayerSource, /phase === "advanced"[\s\S]*isMiniGameAdvancedConfig\(advancedConfig\)[\s\S]*<MiniGameAdvancedRound/);
  assert.match(roundPlayerSource, /switch \(implementation\.componentId\)/);
  assert.match(roundPlayerSource, /case "advanced-reaction":[\s\S]*<AdvancedReactionRound/);
  assert.match(roundPlayerSource, /case "advanced-aim":[\s\S]*<AdvancedAimRound/);
  assert.match(roundPlayerSource, /case "advanced-braking":[\s\S]*<AdvancedBrakingRound/);
  assert.doesNotMatch(roundPlayerSource, /switch \(roundId\)[\s\S]*case "reaction":[\s\S]*<AdvancedReactionRound/);
});
