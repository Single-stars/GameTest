import assert from "node:assert/strict";
import test from "node:test";

import { MULTIPLAYER_LEVEL_GROUPS } from "./level-select.ts";
import {
  buildForfeitResult,
  buildMultiplayerResultBreakdown,
  compareMultiplayerResults,
} from "./result-breakdown.ts";
import type { SelfGameState } from "./types.ts";

function levelFor(levelId: string) {
  const level = MULTIPLAYER_LEVEL_GROUPS.flatMap((group) => group.levels).find((item) => item.levelId === levelId);
  assert.ok(level, `missing level ${levelId}`);
  return level;
}

test("flappy collectible levels subtract every collected item from final time", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
    elapsedMs: 35_000,
    failures: 2,
    passed: true,
    progress: 1,
    collected: 4,
    collectibleCount: 4,
  });

  assert.equal(breakdown.kind, "effective-time");
  assert.equal(breakdown.final.value, 27_000);
  assert.equal(breakdown.final.unit, "ms");
  assert.equal(breakdown.final.lowerIsBetter, true);
  assert.deepEqual(
    breakdown.adjustments.map((item) => [item.key, item.value, item.amount, item.displayOnly]),
    [
      ["revive-count", 2, undefined, true],
      ["collectible-time-bonus", 4, -8_000, undefined],
    ],
  );
});

test("non-collectible race levels keep finish time as the final result", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("fall-down-danger-easy"), {
    elapsedMs: 18_400,
    failures: 3,
    passed: true,
    progress: 1,
  });

  assert.equal(breakdown.kind, "finish-time");
  assert.equal(breakdown.final.value, 18_400);
  assert.equal(breakdown.final.unit, "ms");
  assert.deepEqual(
    breakdown.adjustments.map((item) => [item.key, item.value, item.displayOnly]),
    [["revive-count", 3, true]],
  );
});

test("doodle boost platform is a display-only route note, not score math", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("doodle-4"), {
    elapsedMs: 22_200,
    failures: 1,
    passed: true,
    progress: 1,
  });

  assert.equal(breakdown.final.value, 22_200);
  const boostNote = breakdown.adjustments.find((item) => item.key === "boost-platform-note");
  assert.ok(boostNote);
  assert.equal(boostNote.displayOnly, true);
  assert.equal(boostNote.amount, undefined);
});

test("knife settlement calculates score from hit and mistake counters", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("knife-7"), {
    elapsedMs: 40_000,
    failures: 4,
    passed: true,
    progress: 1,
    knifeHits: 7,
    knifeTimeouts: 1,
    knifeCollisions: 1,
    knifeDangerHits: 2,
  });

  assert.equal(breakdown.kind, "score");
  assert.equal(breakdown.final.value, 3);
  assert.equal(breakdown.final.unit, "point");
  assert.equal(breakdown.final.lowerIsBetter, false);
  assert.equal(breakdown.base[0]?.key, "base-score");
  assert.equal(breakdown.base[0]?.value, 0);
  assert.deepEqual(
    breakdown.adjustments.map((item) => [item.key, item.value, item.amount]),
    [
      ["knife-hit-score", 7, 7],
      ["knife-timeout-penalty", 1, -1],
      ["knife-collision-penalty", 1, -1],
      ["knife-danger-penalty", 2, -2],
    ],
  );
  assert.deepEqual(
    breakdown.formulaRows?.map((item) => [item.key, item.value, item.amount, item.operation]),
    [
      ["base-score", 0, 0, "base"],
      ["knife-hit-score", 7, 7, "add"],
      ["knife-timeout-penalty", 1, -1, "subtract"],
      ["knife-collision-penalty", 1, -1, "subtract"],
      ["knife-danger-penalty", 2, -2, "subtract"],
    ],
  );
});

test("knife overtime is shown as a separate settlement note without changing main score", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("knife-7"), {
    elapsedMs: 44_000,
    failures: 5,
    knifeCollisions: 1,
    knifeDangerHits: 0,
    knifeHits: 4,
    knifeOvertime: true,
    knifeTimeouts: 0,
    passed: false,
    progress: 1,
  });

  assert.equal(breakdown.final.value, 3);
  assert.equal(breakdown.outcome, "overtime-loss");
  assert.equal(breakdown.overtime?.entered, true);
  assert.ok(breakdown.formulaRows?.some((item) => item.key === "knife-overtime-entered" && item.displayOnly === true));
  assert.ok(breakdown.formulaRows?.some((item) => item.key === "knife-overtime-result" && item.value === "加赛先失误"));
});

test("forfeit results keep both players' current data and mark who conceded", () => {
  const state: SelfGameState = {
    elapsedMs: 14_200,
    progress: 0.42,
    score: 420,
    status: "playing",
  };
  const forfeiter = buildForfeitResult(levelFor("flappy-4"), {
    didForfeit: true,
    matchId: "match-forfeit",
    state,
  });
  const winner = buildForfeitResult(levelFor("flappy-4"), {
    didForfeit: false,
    matchId: "match-forfeit",
    state: { ...state, progress: 0.38, score: 380 },
  });

  assert.equal(forfeiter.passed, false);
  assert.equal(winner.passed, false);
  assert.equal(forfeiter.score, 420);
  assert.equal(winner.score, 380);
  assert.equal(forfeiter.breakdown?.outcome, "forfeit");
  assert.equal(winner.breakdown?.outcome, "opponent-forfeit");
  assert.ok(forfeiter.breakdown?.formulaRows?.some((item) => item.key === "forfeit-result" && item.value === "本方认输"));
  assert.ok(winner.breakdown?.formulaRows?.some((item) => item.key === "forfeit-result" && item.value === "对方认输"));
  assert.equal(compareMultiplayerResults(forfeiter, winner), 1);
  assert.equal(compareMultiplayerResults(winner, forfeiter), -1);
});

test("multiplayer result comparison uses breakdown final values before legacy fields", () => {
  const self = {
    passed: true,
    score: 100,
    timeMs: 35_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
      elapsedMs: 35_000,
      failures: 0,
      passed: true,
      progress: 1,
      collected: 4,
      collectibleCount: 4,
    }),
  };
  const opponent = {
    passed: true,
    score: 900,
    timeMs: 30_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
      elapsedMs: 30_000,
      failures: 0,
      passed: true,
      progress: 1,
      collected: 0,
      collectibleCount: 4,
    }),
  };

  assert.equal(compareMultiplayerResults(self, opponent), -1);
  assert.equal(compareMultiplayerResults(opponent, self), 1);
});
