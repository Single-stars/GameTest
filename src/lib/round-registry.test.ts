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
    ["reaction", "aim", "search", "stroop", "rhythm", "memory", "braking", "patience"],
  );

  assert.deepEqual(
    ROUND_DEFINITIONS.map((round) => [round.id, round.base]),
    [
      ["reaction", { type: "native", componentId: "reaction" }],
      ["aim", { type: "native", componentId: "aim" }],
      ["search", { type: "mini-game", gameId: "doodle" }],
      ["stroop", { type: "mini-game", gameId: "fall-down" }],
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
      ["search", { type: "mini-game", gameId: "doodle" }],
      ["stroop", { type: "mini-game", gameId: "fall-down" }],
      ["rhythm", { type: "mini-game", gameId: "square-jump" }],
      ["memory", { type: "mini-game", gameId: "flappy" }],
      ["braking", { type: "native", componentId: "advanced-braking" }],
      ["patience", { type: "mini-game", gameId: "knife" }],
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

test("advanced round rendering reads formal implementations from the round registry", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const roundPlayerSource = readFileSync(new URL("../features/rounds/round-player.tsx", import.meta.url), "utf8");

  assert.match(appPageSource, /<RoundPlayer[\s\S]*phase="advanced"[\s\S]*roundId=\{round\}/);
  assert.match(roundPlayerSource, /const implementation = getRoundDefinition\(roundId\)\[phase\];/);
  assert.match(roundPlayerSource, /phase === "advanced"[\s\S]*isMiniGameAdvancedConfig\(advancedConfig\)[\s\S]*<MiniGameAdvancedRound/);
  assert.match(roundPlayerSource, /switch \(implementation\.componentId\)/);
  assert.match(roundPlayerSource, /case "advanced-reaction":[\s\S]*<AdvancedReactionRound/);
  assert.match(roundPlayerSource, /case "advanced-aim":[\s\S]*<AdvancedAimRound/);
  assert.match(roundPlayerSource, /case "advanced-braking":[\s\S]*<AdvancedBrakingRound/);
  assert.doesNotMatch(roundPlayerSource, /switch \(roundId\)[\s\S]*case "reaction":[\s\S]*<AdvancedReactionRound/);
});
